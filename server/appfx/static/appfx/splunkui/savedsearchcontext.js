// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var AppFx = require('./appfx');
    var SearchContext = require('./searchcontext');
    var _ = require("underscore");
    
    var SavedSearchContext = SearchContext.extend({         
        defaults: {
            autostart: true,
            cache: false  
        },
        
        startSearch: function(_options) {
            var Date = window.Date;
            if (_options && _options.Date) {
                // For testing purposes
                Date = _options._date;
            }
            
            this.cancel(); // Cancel any existing search

            if (!this.get("searchname")) {
                return;
            }

            // Get the cache and convert it to a number:
            // false -> 0, never use cache
            // true -> -1, always use cache
            // positive integer -> positive integer, use cache if newer than
            var cache = this.get("cache") || false;
            if (_.isBoolean(cache)) {
                cache = cache ? -1 : 0;
            }
            
            // Get the threshold for cache (which could be infinity)
            var threshold = cache < 0 ? 
                (new Date(0)).valueOf() :
                ((new Date()).valueOf() - cache * 1000);

            var that = this;
            this.service.savedSearches().fetch(function(err, searches) {
                if (err) {
                    console.log("Error fetching saved searches");
                    that.trigger("search:error", "Error fetching saved searches");
                    return;
                }
                
                var searchList = searches.list();
                for (var i = 0; i < searchList.length; ++i) {
                    var search = searchList[i];
                    if (search.name === that.get("searchname")) {
                        search.history(function(err, list) {
                            // Find all jobs that match
                            var matches = [];
                            for (var i = 0; i < list.length; ++i) {
                                var job = list[i];
                                var published = (new Date(job.published())).valueOf();
                                
                                if (published > threshold) {
                                    matches.push(job);
                                }
                            }
                            
                            // Sort to easily find the latest one
                            matches.sort(function(a,b) { 
                                var aValue = (new Date(a.published())).valueOf();
                                var bValue = (new Date(b.published())).valueOf();
                                return bValue - aValue;
                            });
                            
                            // If a job exists, then we will use it, otherwise,
                            // create a new job.
                            var job = matches[0];
                            if (job) {
                                that._startSearchWithExistingJob(job);
                            }                
                            else {
                                that._startSearchWithNewJob(search);
                            }
                        });                        
                        return;
                    }
                }
                var message = "Warning: saved search not found: '" + that.get("searchname") + "'";
                console.log(message);
                that.trigger("search:error", message);
            });

            return this;
        },
        
        // Mocked by unit tests.
        _startSearchWithExistingJob: function(job) {
            this.createManager(job);
        },
        
        // Mocked by unit tests.
        _startSearchWithNewJob: function(search) {
            var that = this;
            search.dispatch({force_dispatch: false}, function(err, job) {
                if (err) {
                    console.log("Error dispatching saved search");
                    return;
                }
                job.enablePreview();
                that.createManager(job);
            });
        }
    });

    AppFx.Components.registerType('appfx-savedsearchcontext', SavedSearchContext);
    
    return SavedSearchContext;
});
