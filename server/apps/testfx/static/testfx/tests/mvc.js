define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    
    var tests = {
        before: function(done) {
            done();
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
        
        /*
         * splunkjs.mvc API
         * 
         * Non-Private Fields
         *  + STATIC_PREFIX
         *      > Path to the static directory (with auxiliary JS, CSS,
         *        and other files.
         * 
         * Non-Private Methods:
         *  + load, start, onStart
         *      > (API in flux)
         *  + createService(options <optional>) : splunkjs.Service
         *      > Creates a Service object from the JavaScript SDK that 
         *        can be used to access the Splunk server.
         *  + reverse(appAndViewName : String) : String
         *      > Resolves the specified app, view, and set of parameters to
         *        a URL.
         *  + drilldown, loadDrilldown
         *      > (API in flux)
         */
        "splunkjs.mvc Namespace Tests": {
            "STATIC_PREFIX": {
                "is defined": function(done) {
                    assert.ok(splunkjs.mvc.STATIC_PREFIX);
                    done();
                }
            },
            
            "createService": {
                "should create usable Service when called without arguments": function(done) {
                    var service = splunkjs.mvc.createService();
                    assert.ok(service);
                    
                    service.indexes().fetch(function(err, indexes) {
                        if (err) {
                            console.log(err);
                            assert.fail(null, null, "Could not fetch indexes.", null);
                            return;
                        }
                        
                        var hasInternalIndex = false;
                        _.each(indexes.list(), function(index) {
                            if (index.name == "_internal") {
                                hasInternalIndex = true;
                            }
                        });
                        assert.isTrue(hasInternalIndex,
                            "Index list obtained from service lacks the _internal index.");
                    });
                    
                    done();
                },
                
                "should create usable Service when called with arguments": function(done) {
                    var service = splunkjs.mvc.createService({app: "search"});
                    assert.ok(service);
                    assert.equal(service.app, "search");
                    
                    done();
                }
            },
            
            "reverse": {
                "should return a URL": function(done) {
                    var URL_RE = /^(http:\/)?\//;
                    
                    var reverseResult = splunkjs.mvc.reverse(":login");
                    assert.isTrue(
                        URL_RE.test(reverseResult),
                        "Doesn't look like a URL: " + reverseResult)
                    
                    done();
                }
            }
        }
    };
    
    return tests;
});
