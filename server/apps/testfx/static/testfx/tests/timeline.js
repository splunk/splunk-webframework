define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var TimelineView = require('splunkjs/mvc/timelineview');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 40;
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
                type: "timeline",
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
        
        "Timeline tests": {
            "control elements in DOM": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new TimelineView({
                    id: containerName+"-test-timeline",
                    managerid: context.get('name'),
                    el: container 
                }).render();
                context.start();

                _.delay(function(){
                    assert.lengthOf(container.find(' .shared-canvastimeline'), 1);
                    assert.lengthOf(container.find(' .controlLinks'), 1);
                    assert.lengthOf(container.find(' .timelineContainer'), 1);
                    assert.lengthOf(container.find(' .timelineContainer canvas'), 11);
                    
                    done();            
                }, WAIT_TIME);    
            },         
        },
        "Not yet implemented" : {
            // add tests for zoom to selection
            // add tests for zoom out
            // add tests for deselect 
        }
    };
    
    return tests;
});
