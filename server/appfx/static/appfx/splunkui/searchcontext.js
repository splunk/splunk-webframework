// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('appfx.main');
    var BaseContext = require('appfx/splunkui/basecontext');
    var DataSource = require('appfx/splunkui/datasource');
    var SearchModels = require('appfx/splunkui/searchmodel');
    
    var SearchContext = BaseContext.extend({
        defaults: {
            autostart: true,
            cache: false
        },
        
        constructor: function(options) {
            // This has to be in the constructor, otherwise
            // we will call Model.set before we have created these sub-models.
            this.query = options.queryModel || new SearchModels.SearchQuery();
            this.search = options.searchModel || new SearchModels.SearchJob({label: options.name});
            
            // No need to set it on our model
            delete options.queryModel;
            delete options.searchModel;
            
            return BaseContext.prototype.constructor.apply(this, arguments);
        },
        
        initialize: function(options) {
            this.service = AppFx.createService({app: options.app, owner: options.owner});
            
            if (!this.search.has("label")) {
                this.search.set("label", options.name);
            }
            
            // We want to change behavior depending on whether autostart is set 
            // or not. So we first bind a listener to it changing, and then
            // we invoke that listener manually
            this.on("change:autostart", this.handleAutostart, this);
            this.handleAutostart();
        },
        
        handleAutostart: function() {
            if (this.get("autostart")) {
                this.query.on("change", this.startSearch, this);
                this.search.on("change", this.startSearch, this);
            }
            else {
                this.query.off("change", this.startSearch, this);
                this.search.off("change", this.startSearch, this);
            }
        },
        
        // set(attributeName : String, attributeValue : mixed, options : Object|null)
        // set(attributes : Object, options : Object|null)
        set: function(key, value, options) {
            // Normalize the key-value into an object
            if ((_.isObject(key) && !_.isArray(key)) || key == null) {
                attrs = key;
                options = value;
            } else {
                attrs = {};
                attrs[key] = value;
            }
            
            var search = {};
            var query = {};
            
            // If the 'search' or 'query' input attributes are present
            // then use them as the base set of output attributes for
            // each respective model (and filter them out of the original
            // input attributes).
            if (_.has(attrs, "search") && _.isObject(attrs.search)) {
                search = attrs.search;
                delete attrs.search;
            }
            if (_.has(attrs, "query") && _.isObject(attrs.query)) {
                query = attrs.query;
                delete attrs.query;
            }
            
            // Partition all remaining input attributes based on whether they
            // are destined for the job model or the query model.
            // Ignore input attributes that are unrecognized.
            search = _.extend(search, _.pick(attrs, SearchModels.SearchJob.ALLOWED_ATTRIBUTES));
            query = _.extend(query, _.pick(attrs, SearchModels.SearchQuery.ALLOWED_ATTRIBUTES));
                
            // Finally, we set it on the child models, if there is anything to
            // set
            if (!_.isEmpty(search)) {
                this.search.set(search, options);
            }
            if (!_.isEmpty(query)) {
                this.query.set(query, options);
            }
            
            return BaseContext.prototype.set.call(this, attrs, options);
        },
        
        start: function() {         
            if (this.get("autostart")) {
                this.startSearch();
            }

            return this;
        },
        
        data: function(source, attrs) {
            attrs = attrs || {};
            attrs.context = this;
            attrs.source = source;
            return new DataSource(attrs);
        },
        
        _startSearchFromSid: function(sid) {
            var that = this;
            var job = new splunkjs.Service.Job(this.service, sid);
            job.fetch(function(err) {
                if (err) {
                    that.trigger("search:error", "Error in getting pre-existing search: " + sid);
                    return;
                } 
                
                // Set our job and query model to the request parameters
                // for this search, in case we need to make any changes
                var request = job.properties().request;
                that.query.set(_.pick(request, SearchModels.SearchQuery.ALLOWED_ATTRIBUTES), {silent: true});
                that.search.set(_.pick(request, SearchModels.SearchJob.ALLOWED_ATTRIBUTES), {silent: true});
                
                that.createManager(job);
            });
        },
        
        startSearch: function() {                        
            this.cancel(); // Cancel any existing search

            // If we were provided with a SID, then we will
            // just try and use that
            if (this.has("sid")) {
                this._startSearchFromSid(this.get("sid"));
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
            
            var options = this.search.toJSON();
            options.search = this.query.resolve();
            
            // Get the threshold for cache (which could be infinity)
            var threshold = cache < 0 ? 
                (new Date(0)).valueOf() :
                ((new Date()).valueOf() - cache * 1000);
            
            // Only start a search if we have a search string
            if (!options.search) {
                return;
            }
            
            var filter = {};
            if (options.label) {
                filter["search"] = "label="+options.label+"*";
            }

            var that = this;

            // First check and see if a matching job already exists, filtering
            // by the label
            this.service.jobs().fetch(filter, function(err, jobs) {
                if (err) {
                    console.log("Error fetching searches");
                    that.trigger("search:error", "Error fetching searches");
                    return;
                }
                
                var list = jobs.list();
                
                // Splunk returns values as strings, so we have to make sure
                // our values are strings too, otherwise the comparison
                // will return false.
                _.each(options, function(val, key) {
                    options[key] = (_.isBoolean(val) || _.isNumber(val))
                        ? val.toString()
                        : val;
                });
                
                // Find all jobs that match
                var matches = [];
                for (var i = 0; i < list.length; ++i) {
                    var job = list[i];
                    var request = job.properties().request;
                    var published = (new Date(job.published())).valueOf();
                    
                    if (_.isEqual(request, options) && published > threshold) {
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
                    that.createManager(job);
                }                
                else {
                    that.createSearch();
                }
            });

            return this;
        },
        
        pause: function() {
            if (this.manager) {
                this.manager.job.pause();
            }
        },
        
        unpause: function() {
            if (this.manager) {
                this.manager.job.unpause();
            }
            return this;
        },
        
        finalize: function() {
            if (this.manager) {
                this.manager.job.finalize();
            }
            return this;
        },
        
        cancel: function() {
            if (this.manager) {
                this.manager.cancel();
                this.manager = null;
                this.trigger("search:cancelled");
            }
            return this;
        },
        
        // Create a search job manager for the given job.
        createManager: function(job) {
            var that = this;

            this.manager = new splunkjs.JobManager(
                this.service, job, {sleep: 1500});

            this.trigger("search:start", job);
            
            // (The event handler could have cancelled the job,
            //  rendering the manager null.)
            if (this.manager) {
                // Hook up event listeners and re-emit them
                this.manager.on("progress", function(properties) {
                    that.trigger("search:progress", properties, job);
                    that.set("data", job.properties());
                });

                this.manager.on("fail", function(properties) {
                    that.trigger("search:fail", properties, job);
                });
                
                this.manager.on("done", function(properties) {
                    that.trigger("search:done", properties, job); 
                });
            }
        },

        // Create a new search job from current options.
        createSearch: function() {
            var options = this.search.toJSON();
            options.search = this.query.resolve();
            
            var that = this;
            this.service.jobs().create(options, function(err, job) {
                if (err) {
                    that.trigger("search:error", "Could not create search.");
                    return;
                }

                that.createManager(job);
            });
        }
    });

    AppFx.Components.registerType('appfx-searchcontext', SearchContext);
    
    return SearchContext;
});
