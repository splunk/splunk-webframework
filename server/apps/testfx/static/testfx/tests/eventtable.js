define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var EventsViewerView = require('splunkjs/mvc/EventsViewerView');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 20;
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
                type: "eventtable",
                preview: true,
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
        
        "Eventtable tests": {
        },
        "Not yet implemented" : {
            "control elements in DOM": function(done) {
                done();
            },
        }
    };
    
    return tests;
});
