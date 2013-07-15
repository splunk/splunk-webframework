define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    
    // Load components that will be tested
    var SearchManager = require("splunkjs/mvc/searchmanager");
    var SavedSearchManager = require("splunkjs/mvc/savedsearchmanager");
    
    var TEST_QUERY = "search index=_internal | head 10";
    
    var TEST_OPTIONS = {
        // Not a real option.
        options_dict: true
    };
    
    var tests = {
        before: function(done) {
            done();
        },
        
        beforeEach: function(done) {
            this.timeout(100000);
            done();
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            done();
        },
        
        "Context Tests": {
            "SearchManager": {
                // constructor, initialize
                "is instantiable": function(done) {
                    var name = testutil.getUniqueName();
                    var context = new SearchManager({id: name});
                    assert.isNotNull(context);
                    assert.strictEqual(context.get("id"), name);
                    
                    done();
                },
                
                // set
                "forwards set() of query model parameter to the query model": function(done) {
                    var context = createSearchManager();
                    createMethodSpy(context.query, 'set');
                    
                    context.set({ search: 'SEARCH_VALUE' }, TEST_OPTIONS);
                    assert.equal(context.query.set.callCount, 1);
                    assert.equal(context.query.set.callArguments[0].search, 'SEARCH_VALUE');
                    assert.equal(context.query.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.query.get('search'), 'SEARCH_VALUE');
                    
                    done();
                },
                "forwards set() of job model parameter to the job model": function(done) {
                    var context = createSearchManager();
                    createMethodSpy(context.search, 'set');
                    
                    context.set({ auto_cancel: 'AC_VALUE' }, TEST_OPTIONS);
                    assert.equal(context.search.set.callCount, 1);
                    assert.equal(context.search.set.callArguments[0].auto_cancel, 'AC_VALUE');
                    assert.equal(context.search.set.callArguments[1], TEST_OPTIONS);
                    
                    assert.equal(context.search.get('auto_cancel'), 'AC_VALUE');
                   
                    done();
                },
                "forwards set() of special 'query' property to the query model": function(done) {
                    var context = createSearchManager();
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
                    var context = createSearchManager();
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
                    var context = createSearchManager();
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
                "does start its job when initialized if autostart is true (default)": function(done) {
                    // HACK: Can't just do a normal
                    //       `context.startSearch = createMethodMock();`
                    //       because a reference to `startSearch` is used in
                    //       the SearchContext constructor.
                    var EarlyMockedSearchContext = SearchManager.extend({
                        startSearch: createMethodMock()
                    });
                    var context = new EarlyMockedSearchContext({
                        id: testutil.getUniqueName()
                    });
                               
                    assert.equal(context.startSearch.callCount, 1);
                    
                    done();
                },

                "does NOT start its job when asked to start itself if autostart is false": function(done) {
                    var context = createSearchManager({ autostart: false });
                    context.startSearch = createMethodMock();
                    
                    assert.equal(context.startSearch.callCount, 0);

                    done();
                },
                
                // initialize -> handleAutostart
                "will start a new job when a model is changed": function(done) {
                    // HACK: Can't just do a normal
                    //       `context.startSearch = createMethodMock();`
                    //       because a reference to `startSearch` is used in
                    //       the SearchManager constructor.
                    var EarlyMockedSearchManager = SearchManager.extend({
                        startSearch: createMethodMock()
                    });
                    var context = new EarlyMockedSearchManager({
                        id: testutil.getUniqueName()
                    });
                    
                    context.set('search', TEST_QUERY);

                    // Expected to equal 2. One on construction, one on change
                    assert.equal(context.startSearch.callCount, 2);
                    
                    done();
                },
                "will NOT start a new job when a model is changed and autostart is disabled": function(done) {
                    // HACK: Can't just do a normal
                    //       `context.startSearch = createMethodMock();`
                    //       because a reference to `startSearch` is used in
                    //       the SearchManager constructor.
                    var EarlyMockedSearchManager = SearchManager.extend({
                        startSearch: createMethodMock()
                    });
                    var context = new EarlyMockedSearchManager({
                        id: testutil.getUniqueName(),
                        autostart: false
                    });
                    
                    context.set('search', TEST_QUERY);
                    assert.equal(context.startSearch.callCount, 0);
                    
                    done();
                },
                
                // startSearch
                "will start an existing job based on SID": function(done) {
                    var context = createSearchManager({
                        autostart: false
                    });
                    
                    context.service.search(TEST_QUERY, {}, function(err, createdJob) {
                        if (err) {
                            console.log(err);
                            throw err;
                        }
                        
                        context.set('sid', createdJob.sid);
                        context.startSearch();
                        context.on('search:start', function(contextJob) {
                            assert.equal(contextJob.sid, createdJob.sid,
                                "Expected context to reuse existing job with SID.");
                            
                            done();
                        });
                    });
                },
                "will fail to start an existing job based on a bogus SID": function(done) {
                    var context = createSearchManager({
                        autostart: false
                    });
                    
                    context.set('sid', 'BOGUS_SID');
                    context.startSearch();
                    context.on('search:error', function(contextJob) {
                        done();
                    });
                    context.on('search:start', function(contextJob) {
                        throw "Expected attempt to use bad SID to fail.";
                    });
                },
                "will reuse an existing job with similar properties when cache is true": function(done) {
                    runCacheTest(
                        /*cacheOfContext2=*/ true,
                        /*fakeCurrentTimeForContext2=*/ -1,
                        /*doesExpectJobToBeReused=*/ true,
                        done);
                },
                "will NOT reuse an existing job with similar properties when cache is false": function(done) {
                    runCacheTest(
                        /*cacheOfContext2=*/ false,
                        /*fakeCurrentTimeForContext2=*/ -1,
                        /*doesExpectJobToBeReused=*/ false,
                        done);
                },
                "will reuse fresh jobs when cache > 0": function(done) {
                    runCacheTest(
                        /*cacheOfContext2=*/ 7.5,
                        /*fakeCurrentTimeForContext2=*/ (new Date()).valueOf() + 5000,
                        /*doesExpectJobToBeReused=*/ true,
                        done);
                },
                "will ignore stale jobs when cache > 0": function(done) {
                    runCacheTest(
                        /*cacheOfContext2=*/ 2.5,
                        /*fakeCurrentTimeForContext2=*/ (new Date()).valueOf() + 5000,
                        /*doesExpectJobToBeReused=*/ false,
                        done);
                },
                
                // startSearch -> createManager
                "triggers correct events while running a job": function(done) {
                    var context = createSearchManager({
                        search: TEST_QUERY
                    });
                    
                    var gotStartEvent = false;
                    var gotProgressEvent = false;
                    
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
                    });
                    context.on('search:done', function(properties, job) {
                        assert.isNotNull(job);
                        assert.isTrue(job instanceof splunkjs.Service.Job,
                            "Expected job object.");
                        
                        assert.isTrue(gotStartEvent,
                            "Got finished event without a preceding start event.");
                        assert.isTrue(gotProgressEvent,
                            "Got finished event without any preceding progress events.");
                        
                        done();
                    });
                },
                "triggers correct events when starting job with bogus query": function(done) {
                    var context = createSearchManager({
                        search: '| bogus'
                    });
                    
                    context.on('search:start', function(job) {
                        throw "Search with bogus query started unexpectedly.";
                    });
                    context.on('search:error', function(message) {
                        assert.isNotNull(message);
                        assert.isTrue(_.isString(message),
                            "Expected error message in search:error.");
                        
                        done();
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
    
    var createSearchManager = function(options_opt) {
        var options = _.extend({id: testutil.getUniqueName()}, options_opt);
        return new SearchManager(options);
    };
    
    var runCacheTest = function(
            cacheOfContext2,
            fakeCurrentTimeForContext2, // -1 to use real time
            doesExpectJobToBeReused,
            done) {
        
        var sharedName = testutil.getUniqueName();
        var sharedSearch = TEST_QUERY;

        var context1 = new SearchManager({
            id: sharedName,
            autostart: false
        });
        context1.set('search', sharedSearch);
        
        context1.startSearch();
        context1.on("search:start", function(job1) {
            _.delay(function() {
                // Remove the old instance so we can reuse the name
                mvc.Components.revokeInstance(sharedName);
                
                // Create a new instance with the same nmae
                var context2 = new SearchManager({
                    id: sharedName,
                    cache: cacheOfContext2,
                    autostart: false
                });
                context2.set('search', sharedSearch);
                
                var OldDate = Date;
                if (fakeCurrentTimeForContext2 != -1) {
                    Date = function() {
                        return new OldDate(fakeCurrentTimeForContext2);
                    };
                }
                try {
                    context2.startSearch();
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
                }
                finally {
                    Date = OldDate;
                }
            }, 100);
        });
    };
    
    var runActionTest = function(actionName, done) {
        var context = createSearchManager({
            search: TEST_QUERY
        });
        
        context.on('search:start', function(job) {
            job[actionName] = createMethodMock();
            
            context[actionName]();
            assert.equal(job[actionName].callCount, 1);
            
            done();
        });
    };
    
    var createMethodSpy = testutil.createMethodSpy;
    var createMethodMock = testutil.createMethodMock;
    var createConstructorSpy = testutil.createConstructorSpy;
    
    return tests;
});
