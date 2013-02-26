define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-searchcontext", "test-search", {
                    search: "| inputlookup testdata.csv | head 100",
                    preview: "True",
                    status_buckets: 300
            }).start();
            context.on("search:done", function(e){
                done();
            });
        },
        
        beforeEach: function(done) {
            done();
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            done();
        },
        
        "Googlemap tests": {
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1' class='googlemap-wrapper'></div>");

                var map = AppFx.Components.create("appfx-googlemap", "test-googlemap", {
                    contextid: "test-search",
                    el: $("#container1") 
                }).render();

                assert.notEqual($('#container1').children(), 0, 'map containter should have more than 1 child');
                assert.isDefined(map.map);
                assert.isNotNull(map.map);
                
                done();                
            },          
        },
        "Not yet implemented" : {

            "map manipulation": function(done) {
                done();                
            },
        }
    };
    
    return tests;
});
