# vpn.ht desktop updater

This is the package used to update our VPN.ht Desktop client

### Sample usage
```
var Updater = require('autoupdater'),
    spawn = require('child_process').spawn,
    autoupdate = new Updater({currentVersion: '0.0.1'});

autoupdate.update();

autoupdate.on("download", function(version){
    console.log("Downloading "+version)
});

autoupdate.on("updateReady", function(updaterPath){
    console.log("Launching "+updaterPath)
    if (process.platform == 'win32') {
        spawn(updaterPath, [], {
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore']
        });
    } else {
        spawn('open', [updaterPath], {
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore']
        });
    }
});

autoupdate.on("error", function(err){
    console.log(err);
});
```
