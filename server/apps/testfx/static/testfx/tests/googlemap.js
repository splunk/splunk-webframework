define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var GoogleMapView = require('splunkjs/mvc/googlemapview');
    var MockSearchManager = require('../mocksearchmanager');

   var WAIT_TIME = 200;
    var hookDiv = $("#hook");
    var context = null;

    var tests = {
        before: function(done) {
            done();
        },
        
        beforeEach: function(done) {
            var contextName = testutil.getUniqueName();
            context = new MockSearchManager({
                id: contextName,
                type: "googlemap",
                preview: "True",
                status_buckets: 300
            }).start();
            done();            
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Googlemap tests": {
            "control elements in DOM": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                container.addClass('googlemap-wrapper');

                var map = new GoogleMapView({
                    id: containerName + "-test-googlemap",
                    managerid: context.get('name'),
                    el: container 
                }).render();

                assert.notEqual(container.children(), 0, 'map containter should have more than 1 child');
                assert.isDefined(map.map);
                assert.isNotNull(map.map);
                
                done();                
            },          
        },
        "Not yet implemented" : {

            //points show up
        }
    };
    
    return tests;
});
