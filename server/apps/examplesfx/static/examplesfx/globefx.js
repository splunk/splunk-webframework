// AppFramework Google Globe Plug-In

// Define the paths to use for easy reference to javascript libraries
// and plug-ins.  Globe uses ThreeJS, included.
require.config({
    shim: {
        "examplesfx/contrib/Three/ThreeExtras": ["examplesfx/contrib/Three/ThreeWebGL"],
        "examplesfx/contrib/globe": {
            deps: ["examplesfx/contrib/Three/ThreeWebGL",
                   "examplesfx/contrib/Three/ThreeExtras",
                   "examplesfx/contrib/Three/RequestAnimationFrame",
                   "examplesfx/contrib/Three/Detector",
                   "examplesfx/contrib/Tween"],
            exports: "globe"
        }
    }
});

define(function(require, exports, module) {

    var _ = require('underscore');
    var globe = require("examplesfx/contrib/globe");
    var mvc = require('splunkjs/mvc');
    var SimpleSplunkView = require('splunkjs/mvc/simplesplunkview');

    // View that presents geographic data onto an interactive 3D
    // globe using Google's WebGL Globe Presentation.  The associated
    // manager's result models must provide fields
    // { latitude: <num>, longitude: <num>, magnitude <num> }

    var Globe = SimpleSplunkView.extend({
        className: "custom-globe",
        output_mode: "json",
        
        createView: function() {
            this.$el.html('');
            return new DAT.Globe(this.el);
        },

        formatData: function(data) {
            return _.reduce(data, function(memo, row) {
                memo.push(row.latitude, row.longitude, parseFloat(row.magnitude * row.magnitude / 100));
                return memo;
            }, []);
        },

        updateView: function(viz, data) {
            viz.addData(data, {animated: false, format: 'magnitude', name: 'Earthquakes'});
            viz.createPoints();
            viz.animate();
        }
    });

    return Globe;
});
 
