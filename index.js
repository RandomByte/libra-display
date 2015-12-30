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
    oDisplayTexts = {
        sRoutes: ""
    };

function setup () {
    initializeDisplay(function (err){
        if (err) {
            util.log("Failed to initialize display: ", err);
        } else {
            refreshRoute(config.commute.origin, config.commute.destination, 3 /* fixed for now*/);
        }
    });
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

function refreshDisplay () {
    var sText = "";

    sText += oDisplayTexts.sRoutes;

    sText = sText.replace("'", "");
    if (bSimulation) {
        util.log("Display write:\n" + sText);
        return;
    }
    if (bRefreshing) {
        util.log("Refresh running - aborting (TBD queue)");
        return;
    }
    bRefreshing = true;
    util.log("Writing:\n" + sText);
    exec("oled-exp -c write '" + sText + "'", function (err/*, stdout, stderr*/) {
        bRefreshing = false;
        util.log("Failed to refresh display text: ", err);
    });
}

/* Commute */
var oGoogleMaps = new GoogleMapsAPI({
    key: config.commute.apiKey,
    secure: true // use https
});

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
            sText += "\n";
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

function refreshRoute(sOrigin, sDestination, iRoutesToDisplay) {
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

setup();
