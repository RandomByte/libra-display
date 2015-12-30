var GoogleMapsAPI = require("googlemaps"),
    util = require("util"),
    exec = require("child_process").exec,
    config = require("./config");

if (!config) {
    util.log("config.json missing. Aborting...");
    return;
}

// Globals
var bSimulation = config.simulation,
    bRefreshing = false,
    bSleeping = false,
    iDisplayRefreshQueue = 0,
    oDisplayTexts = {
        sRoutes: ""
    };

function setup () {
    initializeDisplay(function (err){
        if (err) {
            util.log("Failed to initialize display: ", err);
        } else {
            loop();
            setInterval(function () {
                loop();
            }, 60000); // refresh every minute
        }
    });
}

function loop () {
    checkSleep(function (err, bSleeping) {
        if (err) {
            util.log("Sleep check failed: ", err);
        } else if (!bSleeping) {
            refreshRoutes(config.commute.origin, config.commute.destination, 3 /* fixed for now*/);
        }
    });
}

function checkSleep (callback) {
    var oDate;
    
    if (bSimulation || !config.activeHoursStart || !config.activeHoursEnd) {
        callback(null, false);
        return;
    }
    
    oDate = new Date();
    if (oDate.getHours() < config.activeHoursStart || oDate.getHours() < config.activeHoursEnd) {
        if (!bSleeping) {
            bSleeping = true;
            sleepDisplay(function (err) {
                callback(err, bSleeping);
            });
        } else {
            callback(null, bSleeping);
        }
    } else {
        if (bSleeping) {
            waikUpDisplay(function (err) {
                callback(err, bSleeping);
            });
            bSleeping = false;
        } else {
            callback(null, bSleeping);
        }
    }
}

/* Display */
function initializeDisplay(callback) {
    if (bSimulation) {
        util.log("Display initialized");
        callback();
        return;
    }
    util.log("Initializing display...");
    exec("oled-exp -i power on dim off scroll stop invert off", function (err/*, stdout, stderr*/) {
        callback(err);
    });
}

function waikUpDisplay (callback) {
    exec("oled-exp -i power on", function (err/*, stdout, stderr*/) {
        callback(err);
    });
}

function sleepDisplay (callback) {
    exec("oled-exp -i power off", function (err/*, stdout, stderr*/) {
        callback(err);
    });
}

function refreshDisplay () {
    var sText = "", oDate;

    if (bRefreshing) {
        // Refresh running, adding to queue
        iDisplayRefreshQueue++;
        return;
    }
    bRefreshing = true;

    /*     Building the text     */
    /* We got 11x8 chars of fun! */

    // 1 Line
    sText += "Routes to work:\\n";

    // 3 Lines: Routes
    sText += oDisplayTexts.sRoutes;

    // 2 Lines break
    sText += "\\n\\n";

    // 1 Line: Last refresh timestamp
    oDate = new Date();
    sText += "Updated: " + ensureLeadingZero(oDate.getHours()) + ":" + ensureLeadingZero(oDate.getMinutes());

    if (bSimulation) {
        util.log("Display write: " + sText);
        bRefreshing = false;
        return;
    }
    util.log("Writing: " + sText);
    exec("oled-exp -c write \"" + sText + "\"", function (err/*, stdout, stderr*/) {
        bRefreshing = false;
        if (err) {
            util.log("Failed to refresh display text: ", err);
        }
        if (iDisplayRefreshQueue > 0) {
            iDisplayRefreshQueue--;
            setTimeout(refreshDisplay, 0);
        }
    });
}

function ensureLeadingZero (iNumber) {
    return iNumber < 10 ? "0" + iNumber : iNumber;
}

/* Commute */
var oGoogleMaps = new GoogleMapsAPI({
    key: config.commute.apiKey,
    secure: true // use https
});

function refreshRoutes(sOrigin, sDestination, iRoutesToDisplay) {
    getRouteTimes(sOrigin, sDestination, function(oError, aRoutes) {
        var sRoutes;
        if (oError) {
            util.log(oError.message);
        } else if (aRoutes.length === 0) {
            util.log("No routes found");
        } else {
            // Sorting the shortest to the top
            aRoutes = aRoutes.sort(function(oRouteA, oRouteB) {
                return oRouteA.iDuration - oRouteB.iDuration;
            });
            aRoutes.splice(iRoutesToDisplay, aRoutes.length - iRoutesToDisplay);
            sRoutes = createRouteDisplayText(aRoutes);
            updateRouteDisplay(sRoutes);
        }
    });
}

function getRouteTimes(sOrigin, sDestination, callback) {
    // origin, destination, callback, sensor, mode, waypoints, alternatives, avoid, units, language, departureTime, arrivalTime, region
    oGoogleMaps.directions({
        origin: sOrigin,
        destination: sDestination,
        alternatives: true
    }, function(oError, oData) {
        var oRoute, oLeg, aRoutes, aRouteTimes,
            i;

        if (oError) {
            callback(oError);
        } else if (!oData || !oData.routes) {
            callback(new Error("No data received"));
        } else if (oData.status !== "OK") {
            callback(new Error("Bad status: " + oData.status));
        } else {
            aRouteTimes = [];
            aRoutes = oData.routes;
            for (i = aRoutes.length - 1; i >= 0; i--) {
                oRoute = aRoutes[i];
                oLeg = oRoute.legs[0];

                aRouteTimes.push({
                    sSummary: oRoute.summary,
                    iDuration: oLeg.duration.value, // in sec
                    sDuration: oLeg.duration.text // human readable (e.g. "24 min")
                });
            }
            callback(null, aRouteTimes);
        }
    });
}

function createRouteDisplayText(aRoutes) {
    var sText = "", oRoute, i;

    for (i = 0; i < aRoutes.length; i++) {
        if (i !== 0) {
            sText += "\\n";
        }
        oRoute = aRoutes[i];
        sText += oRoute.sSummary + ": " + oRoute.sDuration;
    }
    return sText;
}

function updateRouteDisplay(sRouteText) {
    oDisplayTexts.sRoutes = sRouteText;
    refreshDisplay();
}

setup();
