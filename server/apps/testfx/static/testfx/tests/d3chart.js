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
        
        "D3 tests": {
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1' class='d3chart-wrapper'></div>");

               

                
                done();                
            },          
        },
        "Not yet implemented" : {

            "click events fired properly": function(done) {
                //need to know how to do this programatically
                done();                
            },
        }
    };
    
    return tests;
});
