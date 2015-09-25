'use strict';

var Promise = require('bluebird'),
    fs = require('fs'),
    _ = require('lodash'),
    rm = require('rimraf'),
    path = require('path'),
    crypto = require('crypto'),
    semver = require('semver'),
    request = require('request'),
    events = require('events'),
    util = require('util');

var VERIFY_PUBKEY =
        '-----BEGIN PUBLIC KEY-----\n' +
        'MIIBtjCCASsGByqGSM44BAEwggEeAoGBAPNM5SX+yR8MJNrX9uCQIiy0t3IsyNHs\n' +
        'HWA180wDDd3S+DzQgIzDXBqlYVmcovclX+1wafshVDw3xFTJGuKuva7JS3yKnjds\n' +
        'NXbvM9CrJ2Jngfd0yQPmSh41qmJXHHSwZfPZBxQnspKjbcC5qypM5DqX9oDSJm2l\n' +
        'fM/weiUGnIf7AhUAgokTdF7G0USfpkUUOaBOmzx2RRkCgYAyy5WJDESLoU8vHbQc\n' +
        'rAMnPZrImUwjFD6Pa3CxhkZrulsAOUb/gmc7B0K9I6p+UlJoAvVPXOBMVG/MYeBJ\n' +
        '19/BH5UNeI1sGT5/Kg2k2rHVpuqzcvlS/qctIENgCNMo49l3LrkHbJPXKJ6bf+T2\n' +
        '8lFWRP2kVlrx/cHdqSi6aHoGTAOBhAACgYBTNeXBHbWDOxzSJcD6q4UDGTnHaHHP\n' +
        'JgeCrPkH6GBa9azUsZ+3MA98b46yhWO2QuRwmFQwPiME+Brim3tHlSuXbL1e5qKf\n' +
        'GOm3OxA3zKXG4cjy6TyEKajYlT45Q+tgt1L1HuGAJjWFRSA0PP9ctC6nH+2N3HmW\n' +
        'RTcms0CPio56gg==\n' +
        '-----END PUBLIC KEY-----\n';

function forcedBind(func, thisVar) {
    return function() {
        return func.apply(thisVar, arguments);
    };
}

util.inherits(Updater, events.EventEmitter);

function Updater(options) {

    if(!(this instanceof Updater)) {
        return new Updater(options);
    }

    this.options = _.defaults(options || {}, {
        endpoint: 'https://vpn.ht/update.json',
	    pubkey: VERIFY_PUBKEY,
        currentVersion: false
    });

    this.outputDir = path.join(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'], 'Library', 'Application\ Support', 'VPN.ht');

    this.updateData = null;
    this.env = (process.env.NODE_ENV === 'development') ? 'development' : 'production';

    this.filename = (process.platform === 'win32') ? 'update.exe' : 'update.pkg';
}

Updater.prototype.check = function() {

    var self = this;
    return new Promise(function(resolve, reject) {

        if (self.env !== 'production') {
            resolve(false);
        } else {

            request(self.options.endpoint, {json:true}, function(err, res, data) {

                if(err || !data) {
                    resolve(false);
                } else {
                    var updateData = data[process.platform];

                    // Normalize the version number
                    if(!updateData.version.match(/-\d+$/)) {
                        updateData.version += '-0';
                    }
                    if(!self.options.currentVersion.match(/-\d+$/)) {
                        self.options.currentVersion += '-0';
                    }

                    if(semver.gt(updateData.version, self.options.currentVersion)) {
                        self.emit('download', updateData.version)
                        self.updateData = updateData;
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            });

        }

      });
};



Updater.prototype.download = function(source, output) {
    return new Promise(function(resolve) {
        var downloadStream = request(source);
        downloadStream.pipe(fs.createWriteStream(output));
        downloadStream.on('complete', function () {
            resolve(output);
        });
    });
};

Updater.prototype.verify = function(source) {

    var hash = crypto.createHash('SHA1'),
        verify = crypto.createVerify('DSA-SHA1'),
        self = this;

    return new Promise(function(resolve, reject) {

        var readStream = fs.createReadStream(source);
        readStream.pipe(hash);
        readStream.pipe(verify);

        readStream.on('end', function() {
            hash.end();
            verify.end();
            var hashResult = hash.read().toString('hex');
            var resultFromSign = verify.verify(self.options.pubkey, self.updateData.signature+"", 'base64');
            if(self.updateData.checksum !== hashResult ||
                resultFromSign == false
            ) {
                resolve(false);
                self.emit("error","Invalid hash or signature")
            } else {
                resolve(true);
            }
        });

    });
};

Updater.prototype.update = function() {
    var outputFile = path.join(path.dirname(this.outputDir), this.filename);
    var self = this;

    if(this.updateData){
        return this.download(this.updateData.updateUrl, outputFile)
            .then(forcedBind(this.verify, this))
            .then(forcedBind(this.install, this))
	        .then(forcedBind(this._installed, this));
    }else{
        return this.check()
            .then(function(updateAvailable){
                if(updateAvailable){
                    return self.download(self.updateData.updateUrl, outputFile)
                        .then(forcedBind(self.verify, self))
                        .then(function(valid) {
                            if (valid) {
                                self.emit('updateReady', outputFile);
                            } else {
                                return false;
                            }
                        });
                }else{
                    return false
                }
            })
    }

};

module.exports = Updater;
