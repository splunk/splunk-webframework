// TODO: This entire file is duplicated from contexts.js,
//       with local modifications to test SavedSearchContext instead of
//       SearchContext.
//       
//       Both files should be diffed, and common logic deduplicated. (DVPL-1609)
define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs.mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    
    // Load (and register) components that will be tested
    // (even if the associated module object is not referenced by tests).
    var SavedSearchContext = require("splunkjs.mvc/savedsearchcontext");
    
    // Minimize irrelevant diffs.
    var SearchContext = SavedSearchContext;
    
    var TEST_QUERY = "search index=_internal | head 10";
    var TEST_NONPREFIXED_QUERY = "index=_internal | head 10";
    
    var TEST_OPTIONS = {
        // Not a real option.
        options_dict: true
    };
    
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
            "SavedSearchContext": {
                // constructor, initialize
                "is instantiable": function(done) {
                    var name = testutil.getUniqueName();
                    var context = splunkjs.mvc.Components.create("appfx-savedsearchcontext", name, {});
                    assert.isNotNull(context);
                    assert.strictEqual(context.get("name"), name);
                    
                    done();
                },
                
                // set
                "forwards set() of query model parameter to the query model": function(done) {
                    var context = createSearchContext();
                    createMethodSpy(context.query, 'set');
                    
                    context.set({ search: 'SEARCH_VALUE' }, TEST_OPTIONS);
                    assert.equal(context.query.set.callCount, 1);
                    assert.equal(context.query.set.callArguments[0].search, 'SEARCH_VALUE');
                    assert.equal(context.query.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.query.get('search'), 'SEARCH_VALUE');
                    
                    done();
                },
                "forwards set() of job model parameter to the job model": function(done) {
                    var context = createSearchContext();
                    createMethodSpy(context.search, 'set');
                    
                    context.set({ auto_cancel: 'AC_VALUE' }, TEST_OPTIONS);
                    assert.equal(context.search.set.callCount, 1);
                    assert.equal(context.search.set.callArguments[0].auto_cancel, 'AC_VALUE');
                    assert.equal(context.search.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.search.get('auto_cancel'), 'AC_VALUE');
                    
                    done();
                },
                "forwards set() of special 'query' property to the query model": function(done) {
                    var context = createSearchContext();
                    createMethodSpy(context.query, 'set');
                    
                    context.set({
                        query: {search: 'SEARCH_VALUE_1'},
                        search: 'SEARCH_VALUE_2'
                    }, TEST_OPTIONS);
                    assert.equal(context.query.set.callCount, 1);
                    assert.equal(context.query.set.callArguments[0].search, 'SEARCH_VALUE_2');
                    assert.equal(context.query.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.query.get('search'), 'SEARCH_VALUE_2');
                    
                    done();
                },
                "forwards set() of special 'search' property to the job model": function(done) {
                    var context = createSearchContext();
                    createMethodSpy(context.search, 'set');
                    
                    context.set({
                        search: { auto_cancel: 'AC_VALUE' },
                        preview: 'PREVIEW_VALUE'
                    }, TEST_OPTIONS);
                    assert.equal(context.search.set.callCount, 1);
                    assert.equal(context.search.set.callArguments[0].auto_cancel, 'AC_VALUE');
                    assert.equal(context.search.set.callArguments[0].preview, 'PREVIEW_VALUE');
                    assert.equal(context.search.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.search.get('auto_cancel'), 'AC_VALUE');
                    assert.equal(context.search.get('preview'), 'PREVIEW_VALUE');
                    
                    done();
                },
                "handles set() of individual attribute": function(done) {
                    var context = createSearchContext();
                    createMethodSpy(context.query, 'set');
                    
                    context.set('search', 'SEARCH_VALUE', TEST_OPTIONS);
                    assert.equal(context.query.set.callCount, 1);
                    assert.equal(context.query.set.callArguments[0].search, 'SEARCH_VALUE');
                    assert.equal(context.query.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.query.get('search'), 'SEARCH_VALUE');
                    
                    done();
                },
                
                // TODO: Write test that checks whether get() is symmetric to set().
                //       (It will probably fail now, since get() is not overridden.)
                //       (DVPL-1610)
                
                // start
                "does start its job when asked to start itself": function(done) {
                    var context = createSearchContext();
                    context.startSearch = createMethodMock();
                    
                    context.start();
                    assert.equal(context.startSearch.callCount, 1);
                    
                    done();
                },
                "does NOT start its job when asked to start itself if autostart is false": function(done) {
                    var context = createSearchContext({ autostart: false });
                    context.startSearch = createMethodMock();
                    
                    context.start();
                    assert.equal(context.startSearch.callCount, 0);
                    
                    done();
                },
                
                // initialize -> handleAutostart
                "will start a new job when a model is changed": function(done) {
                    // HACK: Can't just do a normal
                    //       `context.startSearch = createMethodMock();`
                    //       because a reference to `startSearch` is used in
                    //       the SearchContext constructor.
                    var EarlyMockedSearchContext = SearchContext.extend({
                        startSearch: createMethodMock()
                    });
                    var context = new EarlyMockedSearchContext({
                        name: testutil.getUniqueName()
                    });
                    
                    context.set('search', TEST_QUERY);
                    assert.equal(context.startSearch.callCount, 1);
                    
                    done();
                },
                "will NOT start a new job when a model is changed and autostart is disabled": function(done) {
                    // HACK: Can't just do a normal
                    //       `context.startSearch = createMethodMock();`
                    //       because a reference to `startSearch` is used in
                    //       the SearchContext constructor.
                    var EarlyMockedSearchContext = SearchContext.extend({
                        startSearch: createMethodMock()
                    });
                    var context = new EarlyMockedSearchContext({
                        name: testutil.getUniqueName(),
                        autostart: false
                    });
                    
                    context.set('search', TEST_QUERY);
                    assert.equal(context.startSearch.callCount, 0);
                    
                    done();
                },
                
                // startSearch
                // TODO: Fails. (DVPL-1605)
                "will fail if no named saved search provided": function(done) {
                    var context = createSearchContext({ autostart: false });
                    
                    context.startSearch();
                    context.on('search:error', function(message) {
                        done();
                    });
                },
                "will fail if the named saved search does not exist": function(done) {
                    var context = createSearchContext({ autostart: false });
                    
                    context.set('searchname', testutil.getUniqueName());
                    context.startSearch();
                    context.on('search:error', function(message) {
                        done();
                    });
                },
                "will dispatch the named saved search if it has no jobs": function(done) {
                    createSavedSearchAndContext({ cache: true }, function(err, savedSearch, context) {
                        if (err) { console.log(err); throw err; }
                        
                        context.startSearch();
                        context._startSearchWithNewJob = function() {
                            done();
                        };
                    });
                },
                "will reuse the last job of the named saved search if available": function(done) {
                    createSavedSearchAndContext({ cache: true }, function(err, savedSearch, context) {
                        if (err) { console.log(err); throw err; }
                        
                        dispatchAndWaitUntilReady(savedSearch, function(err, dispatchedJob) {
                            if (err) { console.log(err); throw err; }
                            
                            context.startSearch();
                            context._startSearchWithExistingJob = function(contextJob) {
                                assert.equal(contextJob.sid, dispatchedJob.sid);
                            
                                done();
                            };
                            context._startSearchWithNewJob = function() {
                                throw "Context created new job instead of reusing existing one.";
                            };
                        });
                    });
                },
                "will reuse an existing job with similar properties when cache is true": function(done) {
                    runcacheTest(
                        /*cacheOfContext2=*/ true,
                        /*fakeCurrentTimeForContext2=*/ -1,
                        /*doesExpectJobToBeReused=*/ true,
                        done);
                },
                "will NOT reuse an existing job with similar properties when cache is false": function(done) {
                    runcacheTest(
                        /*cacheOfContext2=*/ false,
                        /*fakeCurrentTimeForContext2=*/ -1,
                        /*doesExpectJobToBeReused=*/ false,
                        done);
                },
                "will reuse fresh jobs when cache > 0": function(done) {
                    runcacheTest(
                        /*cacheOfContext2=*/ 7.5,
                        /*fakeCurrentTimeForContext2=*/ (new Date()).valueOf() + 5000,
                        /*doesExpectJobToBeReused=*/ true,
                        done);
                },
                // TODO: Fails. (DVPL-1606)
                "will ignore stale jobs when cache > 0": function(done) {
                    runcacheTest(
                        /*cacheOfContext2=*/ 2.5,
                        /*fakeCurrentTimeForContext2=*/ (new Date()).valueOf() + 5000,
                        /*doesExpectJobToBeReused=*/ false,
                        done);
                },
                
                // startSearch -> createManager
                "triggers correct events while running a job": function(done) {
                    createSavedSearchAndContext({}, function(err, savedSearch, context) {
                        if (err) { console.log(err); throw err; }
                        
                        var gotStartEvent = false;
                        var gotProgressEvent = false;
                    
                        context.start();
                        context.on('search:start', function(job) {
                            assert.isNotNull(job);
                            assert.isTrue(job instanceof splunkjs.Service.Job,
                                "Expected job object in search:start.");
                        
                            assert.isFalse(gotStartEvent,
                                "Got start event multiple times.");
                            gotStartEvent = true;
                        });
                        context.on('search:progress', function(properties, job) {
                            assert.isNotNull(properties);
                            assert.isNotNull(properties.name,
                                "Expected job properties in search:progress.");
                            assert.isNotNull(job);
                            assert.isTrue(job instanceof splunkjs.Service.Job,
                                "Expected job object in search:progress.");
                        
                            assert.isTrue(gotStartEvent,
                                "Got progress event before a start event.");
                            gotProgressEvent = true;
                        
                            // TODO: Implement finished event. (DVPL-1607)
                            finished(properties, job);
                        });
                        var finished = function(properties, job) {
                            assert.isNotNull(job);
                            assert.isTrue(job instanceof splunkjs.Service.Job,
                                "Expected job object.");
                        
                            assert.isTrue(gotStartEvent,
                                "Got finished event without a preceding start event.");
                            assert.isTrue(gotProgressEvent,
                                "Got finished event without any preceding progress events.");
                        
                            done();
                        };
                    });
                },
                
                // <various job actions>
                "supports pause of job": function(done) {
                    runActionTest('pause', done);
                },
                "supports unpause of job": function(done) {
                    runActionTest('unpause', done);
                },
                "supports finalize of job": function(done) {
                    runActionTest('finalize', done);
                },
                "supports cancel of job": function(done) {
                    // NOTE: Does not check for the 'search:cancelled' event,
                    //       which this action should trigger on the context.
                    runActionTest('cancel', done);
                }
            }
        }
    };
    
    // =========================================================================
    // Test Helpers
    
    var createSearchContext = function(options_opt) {
        return splunkjs.mvc.Components.create(
            "appfx-savedsearchcontext",
            testutil.getUniqueName(),
            options_opt || {});
    };
    
    var createSavedSearchAndContext = function(options, done) {
        var savedSearchName = testutil.getUniqueName();
        
        options.searchname = savedSearchName;
        options.app = 'search';
        options.owner = 'admin';
        
        var context = createSearchContext(options);
        
        context.service.savedSearches().create({
            name: savedSearchName,
            search: TEST_NONPREFIXED_QUERY
        }, function(err, savedSearch) {
            done(err, savedSearch, context);
        });
    };
    
    var dispatchAndWaitUntilReady = function(savedSearch, done) {
        savedSearch.dispatch(function(err, dispatchedJob) {
            if (err) { done(err, null); return; }
            
            // TODO: Wait until the job is actually ready
            //       instead of using a fixed timeout.
            window.setTimeout(function() {
                done(err, dispatchedJob);
            }, 300);
        });
    };
    
    var runcacheTest = function(
            cacheOfContext2,
            fakeCurrentTimeForContext2, // -1 to use real time
            doesExpectJobToBeReused,
            done) {
        
        var savedSearchName = testutil.getUniqueName();
        var context2 = createSearchContext({
            autostart: false,
            cache: cacheOfContext2,
            searchname: savedSearchName,
            app: 'search'
        });
        // TODO: I should be able to pass this as a parameter
        //       to SavedSearchContext's constructor. (DVPL-1608)
        context2.service.owner = 'admin';
        
        context2.service.savedSearches().create({
            name: savedSearchName,
            search: TEST_NONPREFIXED_QUERY
        }, function(err, savedSearch) {
            if (err) { console.log(err); throw err; }
            
            dispatchAndWaitUntilReady(savedSearch, function(err, job1) {
                if (err) { console.log(err); throw err; }
                
                var OldDate = Date;
                var NewDate = Date;
                if (fakeCurrentTimeForContext2 != -1) {
                    NewDate = function() {
                        return new OldDate(fakeCurrentTimeForContext2);
                    };
                }
                
                context2.startSearch({_date: NewDate});
                context2.on("search:start", function(job2) {
                    if (doesExpectJobToBeReused) {
                        assert.equal(job2.sid, job1.sid,
                            "Expected context2 to reuse job of context1.");
                    }
                    else {
                        assert.notEqual(job2.sid, job1.sid,
                            "Expected context2 to NOT reuse job of context1.");
                    }
                    
                    done();
                });
            });
        });
    };
    
    var runActionTest = function(actionName, done) {
        createSavedSearchAndContext({}, function(err, savedSearch, context) {
            context.start();
            context.on('search:start', function(job) {
                job[actionName] = createMethodMock();
            
                context[actionName]();
                assert.equal(job[actionName].callCount, 1);
            
                done();
            });
        });
    };
    
    var createMethodSpy = testutil.createMethodSpy;
    var createMethodMock = testutil.createMethodMock;
    var createConstructorSpy = testutil.createConstructorSpy;
    
    return tests;
});
