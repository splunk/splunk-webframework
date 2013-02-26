define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            this.timeout(5000);
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "eventtable",
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
        
        "Eventtable tests": {
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1'></div>");

                AppFx.Components.create("appfx-eventtable", "test-eventtable", {
                    contextid: "test-search",
                    el: $("#container1") 
                }).render();
                
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
