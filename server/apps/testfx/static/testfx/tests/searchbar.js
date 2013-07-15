define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var SearchBarView = require('splunkjs/mvc/searchbarview');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 100;
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
                type: "searchbar",
                preview: "True",
                status_buckets: 300
            });
            done();        
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Search bar tests": {          
            "control elements in DOM": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var searchbar = new SearchBarView({
                    id: containerName + "-test-searchbar",
                    managerid: context.get('id'),
                    timepicker: true,
                    el: container, 
                }).render();
                context.start();
                
                $.when(searchbar._dfd).done(function() {
                    assert.lengthOf(container.find('.search-bar-wrapper'), 1, 'wrapper failure');
                    assert.lengthOf(container.find('.search-form'), 1, 'form failure');
                    assert.lengthOf(container.find('.search-bar'), 1, 'search bar failure');
                    assert.lengthOf(container.find('.search-input'), 1, 'input area failure');
                    assert.lengthOf(container.find('.search-timerange'), 1, 'timerange failure');
                    assert.lengthOf(container.find('.search-button'), 1, 'search button failure');

                    done();  
                });              
            },

            "search string appears properly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var searchbar = new SearchBarView({
                    id: containerName + "-test-searchbar2",
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();

               _.delay(function(){
                    var htmlString = container.find('.search-input textarea').val();
                    var modelString = splunkjs.mvc.Components.getInstance(context.get('id')).query.get("search");
                    assert.equal(htmlString, modelString, 'model search string and html display are equal');
                    done();            
                }, WAIT_TIME);               
            },

            "executing search changes context": function(done) {
                var newSearchString = "index=_internal | head 10";

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var searchbar = new SearchBarView({
                    id: containerName + "-test-searchbar4",
                    timepicker: true,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();
                
                searchbar.on("change", function() {
                    //We have to prepend 'search' because the searchbar does
                    assert.equal(searchbar.val(), newSearchString);
                    done();
                });
                
                context.on("search:done", function(e){
                    //change the search string and click the button
                    $.when(searchbar._dfd).done(function() { 
                        _.defer(function(){
                            $(container.find('.search-input textarea')).val(newSearchString);
                            container.find('.search-button a.btn').click();
                        });
                    });
                });
            },


            "creation with timepicker set to false works": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var searchbar = new SearchBarView({
                    id: containerName + "-test-searchbar",
                    timepicker: false,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();
            
                context.on("search:done", function(e){
                    assert.equal(searchbar.timepicker.$el.is(':visible'), false);  
                    done();
                });
            },
            "setting timepicker to false and true dynamically works": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var searchbar = new SearchBarView({
                    id: containerName + "-test-searchbar3",
                    timepicker: true,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();

                assert.equal(searchbar.timepicker.$el.is(':visible'), true);

                searchbar.settings.set('timepicker', false);

                _.delay(function(){
                    assert.equal(searchbar.timepicker.$el.is(':visible'), false);  
                    
                    // And set it back to visible
                    searchbar.settings.set('timepicker', true);
                    _.delay(function(){
                        assert.equal(searchbar.timepicker.$el.is(':visible'), true);  
                        done();
                    }, WAIT_TIME);
                }, WAIT_TIME);
            }
        },
        "Failing": {
        },
        
        "Not yet implemented":{
            // ensure "search" prepending logic is correct?
            
        }
    };
    
    return tests;
});
