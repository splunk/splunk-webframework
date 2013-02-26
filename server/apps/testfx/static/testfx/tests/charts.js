define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "chart",
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
        
        "Charts tests": {
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1' class='chart-wrapper'></div>");

                AppFx.Components.create("appfx-chart", "test-chart", {
                    contextid: "test-search",
                    el: $("#container1") 
                }).render();
                
                _.delay(function(){
                    var thing= "foo";
                    assert.lengthOf($('#container1 .highcharts-container'), 1);
                    done(); 
                }, 40);       
            },          
        },
        "Not yet implemented" : {

            "click events fired properly": function(done) {
                
                done();                
            },
        }
    };
    
    return tests;
});
