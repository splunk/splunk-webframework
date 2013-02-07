define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs.mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    
    // Load (and register) components that will be tested
    // (even if the associated module object is not referenced by tests).
    var SearchContext = require("splunkjs.mvc/searchcontext");
    var SavedSearchContext = require("splunkjs.mvc/savedsearchcontext");
    var GroupContext = require("splunkjs.mvc/groupcontext");
    
    var notImplemented = testutil.notImplemented;
    
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
        
        "Context Tests": {
            "GroupContext": {
                // Forward from subcontext to self
                "forwards events from subcontext to self": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        context.on("ping", function() {
                            // TODO: Extra "____SENTINEL____" value at end of
                            //       arguments array. (DVPL-1618)
                            assert.equal(arguments.length, 1,
                                "Incorrect number of event arguments received.");
                            assert.equal(arguments[0], "hi");
                            
                            done();
                        });
                        
                        subcontext.trigger("ping", "hi");
                    });
                },
                "forwards changes in subcontext's job model to own job model": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        context.search.on("change:ping", function(model, value, options) {
                            assert.equal(model.get("ping"), "hi");
                            
                            done();
                        });
                        
                        subcontext.search.set("ping", "hi");
                    });
                },
                "forwards changes in subcontext's query model to own query model": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        context.query.on("change:ping", function(model, value, options) {
                            assert.equal(model.get("ping"), "hi");
                            
                            done();
                        });
                        
                        subcontext.query.set("ping", "hi");
                    });
                },
                
                // Forward from subcontext to self
                "forwards events from self to subcontexts": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        subcontext.on("ping", function() {
                            assert.equal(arguments.length, 1,
                                "Incorrect number of event arguments received.");
                            assert.equal(arguments[0], "hi");
                            
                            done();
                        });
                        
                        context.trigger("ping", "hi");
                    });
                },
                "forwards changes in own job model to subcontexts' job models": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        subcontext.search.on("change:ping", function(model, value, options) {
                            assert.equal(model.get("ping"), "hi");
                            
                            done();
                        });
                        
                        context.search.set("ping", "hi");
                    });
                },
                "forwards changes in own query model to subcontexts' query models": function(done) {
                    createContextAndSubcontext(function(context, subcontext) {
                        subcontext.query.on("change:ping", function(model, value, options) {
                            assert.equal(model.get("ping"), "hi");
                            
                            done();
                        });
                        
                        context.query.set("ping", "hi");
                    });
                },
                
                // Handles context changes
                "does not forward events from old subcontext or its models to self": function(done) {
                    var contextName = testutil.getUniqueName();
                    var subcontextName = testutil.getUniqueName();
                    
                    var context = splunkjs.mvc.Components.create(
                        "appfx-groupcontext", contextName, {
                            contexts: [subcontextName]
                        });
                    var oldSubcontext = splunkjs.mvc.Components.create(
                        "appfx-searchcontext", subcontextName,
                        { autostart: false });
                    
                    context.start();
                    
                    splunkjs.mvc.Components.revokeInstance(subcontextName);
                    var newSubcontext = splunkjs.mvc.Components.create(
                        "appfx-searchcontext", subcontextName,
                        { autostart: false });
                    
                    oldSubcontext.on("ping", function() {
                        throw "Old subcontext should not be receiving events after revocation.";
                    });
                    oldSubcontext.search.on("change:ping", function(model, value, options) {
                        throw "Old subcontext's job model should not be receiving events after revocation.";
                    });
                    oldSubcontext.query.on("change:ping", function(model, value, options) {
                        throw "Old subcontext's query model should not be receiving events after revocation.";
                    });
                    
                    context.trigger("ping", "hi");
                    context.search.set("ping", "hi");
                    context.query.set("ping", "hi");
                    
                    // Succeed by default.
                    // This may be invalidated later by callbacks.
                    done();
                }
            }
        }
    };
    
    var createContextAndSubcontext = function(done) {
        var contextName = testutil.getUniqueName();
        var subcontext1Name = testutil.getUniqueName();
        var subcontext2Name = testutil.getUniqueName();
        
        var context = splunkjs.mvc.Components.create(
            "appfx-groupcontext", contextName, {
                contexts: [subcontext1Name, subcontext2Name]
            });
        var subcontext1 = splunkjs.mvc.Components.create(
            "appfx-searchcontext", subcontext1Name,
            { autostart: false });
        var subcontext2 = splunkjs.mvc.Components.create(
            "appfx-savedsearchcontext", subcontext2Name,
            { autostart: false });
        
        // Start only the group context.
        context.start();
        
        done(context, subcontext1);
    };
    
    return tests;
});