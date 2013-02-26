define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "timepicker",
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
        
        "Timepicker tests": {
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1'></div>");

                AppFx.Components.create("appfx-timepicker", "test-timepicker", {
                    contextid: "test-search",
                    el: $("#container1") 
                }).render();

                assert.lengthOf($('#container1 .search-timerange'), 1);
                assert.lengthOf($('#container1 .btn-primary'), 1);
                assert.lengthOf($('#container1 .dropdown-menu'), 3); //there should be 3
                done();                
            },
            "proper default text": function(done) {
                $('#hook').append("<div id='container2'></div>");

                AppFx.Components.create("appfx-timepicker", "test-timepicker2", {
                    contextid: "test-search",
                    el: $("#container2") 
                }).render();
                
                assert.include($('#container2 .search-timerange .btn').text(), "All Time");
                done();                
            },
            "setting preset sets text properly": function(done) {
                $('#hook').append("<div id='container3'></div>");

                AppFx.Components.create("appfx-timepicker", "test-timepicker3", {
                    contextid: "test-search",
                    preset: "week",
                    el: $("#container3") 
                }).render();
                assert.include($('#container3 .search-timerange .btn').text(), "Week to date");
                done();                
            }, 
            "setting preset changes bound search timerange": function(done) {
                $('#hook').append("<div id='container4'></div>");
                AppFx.Components.create("appfx-timepicker", "test-timepicker4", {
                    contextid: "test-preset-search",
                    preset: "week",
                    el: $("#container4") 
                }).render();
                
                var context = AppFx.Components.create("appfx-mocksearchcontext", "test-preset-search", {
                    search: "search index=_internal | head 10",
                }).start();

                assert.equal(context.search.get("earliest_time"), "@w0");
                assert.equal(context.search.get("latest_time"), "now");

                done();                
            },              
            
        },
        "Not yet implemented" : {

            "changing selection changes text": function(done) {
                //need to know how to do this programatically
                done();                
            },
            "changing selection updates search results": function(done) {
                //this too
                done();                
            },
            "proper items in dropdown": function(done) {
                done();                
            },
            "dropdown renders properly": function(done) {
                //can we even test this?
                done();                
            },  
        }
    };
    
    return tests;
});
