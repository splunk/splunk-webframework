define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "searchbar",
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
        
        "Search bar tests": {          
            "control elements in DOM": function(done) {
                $('#hook').append("<div id='container1'></div>");
                var single = AppFx.Components.create("appfx-searchbar", "test-searchbar", {
                    contextid: "test-search",
                    timepicker: true,
                    el: $("#container1") 
                }).render();
                
                assert.lengthOf($('#container1 .search-bar-wrapper'), 1, 'wrapper failure');
                assert.lengthOf($('#container1 .search-form'), 1, 'form failure');
                assert.lengthOf($('#container1 .search-bar'), 1, 'search bar failure');
                assert.lengthOf($('#container1 .search-input'), 1, 'input area failure');
                assert.lengthOf($('#container1 .search-timerange'), 2, 'timerange failure');
                assert.lengthOf($('#container1 .search-button'), 1, 'search button failure');

                done();                
            },
            
            "setting timepicker to false removes timepicker": function(done) {
                $('#hook').append("<div id='container3'></div>");
                var searchbar = AppFx.Components.create("appfx-searchbar", "test-searchbar3", {
                    timepicker: true,
                    contextid: "test-search",
                    el: $("#container3") 
                }).render();

                assert.equal($('#container3 .search-timerange')[0].children.length, 1);

                searchbar.settings.set('timepicker', false);

                _.delay(function(){
                    assert.equal($('#container3 .search-timerange')[0].children.length, 0);  
                    done();            
                }, 40);
            },
        },
        "Not yet implemented":{
           
            
            "executing search changes context": function(done) {
                //TODO: how to do this? call submitSearch directly?
                done();                
            },
            "search string appears properly": function(done) {
                $('#hook').append("<div id='container2'></div>");
                AppFx.Components.create("appfx-searchbar", "test-searchbar2", {
                    contextid: "test-search",
                    el: $("#container2") 
                }).render();

                var string = $('#container2 .search-input .inner textarea')[0].value;
                //TODO:assert.equal(string, TEST_SEARCH_STRING);
               
                done();                
            },
            
            
        }
    };
    
    return tests;
});
