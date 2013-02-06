// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var AppFx = require('splunkui');
    var BaseContext = require('./basecontext');
    var SearchModels = require('./searchmodel');
    
    var SENTINEL = "____SENTINEL____";
    
    var GroupContext = BaseContext.extend({
        initialize: function() {
            this.search = new SearchModels.SearchJob();
            this.query = new SearchModels.SearchQuery();
            this.contexts = {};
            
            var that = this;
            _.each(this.get("contexts"), function(contextName) {
                AppFx.Components.bind("change:" + contextName, function() {
                    that.onContextChanged(contextName);
                });
                
                if (AppFx.Components.hasInstance(contextName)) {
                    that.onContextChanged(contextName);
                }
            });
        },
        
        data: function() {
            throw new Error("Cannot get data from GroupContext");
        },
        
        onContextChanged: function(contextName) {
            var context = (AppFx.Components.hasInstance(contextName)
                ? AppFx.Components.getInstance(contextName) : null);
            
            // Unlisten to old context
            var oldContext = this.contexts[contextName];
            if (oldContext) {
                oldContext.off(null, null, this);
                if (oldContext.query) {
                    oldContext.query.off(null, null, this);
                }
                if (oldContext.search) {
                    oldContext.search.off(null, null, this);
                }
            }
            
            // Register the new context with self
            this.contexts[contextName] = context;
            
            // Listen to new context
            if (context) {
                var that = this;
                context.on("all", function() {
                    // We have to append a sentinel so that we don't
                    // end up rebroadcasting this to all the others,
                    // which means we would go into an infinite loop
                    // UNDONE: is there a better way to do this?
                    var args = _.toArray(arguments);
                    args.push(SENTINEL)
                    that.trigger.apply(that, args);
                });                
            
                // Listen to new context's search model, if present
                if (context.search) {
                    context.search.on("change", function(model, options) {
                        if (options.ignore) {
                            return;
                        }
                    
                        var changed = model.changedAttributes();
                        var newOptions = _.extend({ignore: true}, options);
                        that.search.set(changed, newOptions);
                    });
                }
            
                // Listen to new context's search model, if present
                if (context.query) {
                    context.query.on("change", function(model, options) {
                        if (options.ignore) {
                            return;
                        }
                    
                        var changed = model.changedAttributes();
                        var newOptions = _.extend({ignore: true}, options);
                        that.query.set(changed, newOptions);
                    });
                }
            }
        },
        
        start: function() {
            var that = this;
            this.on("all", function() {
                // Check if the last argument is the sentinel 
                // value, and if so, we just stop 
                var args = _.toArray(arguments);
                if (args[args.length-1] === SENTINEL) {
                    return;
                }
                
                var contexts = _.values(that.contexts);
                for(var i = 0; i < contexts.length; i++) {
                    var context = contexts[i];
                    context.trigger.apply(context, arguments);
                }
            });
            
            // Propagate any change event on our search model to all search
            // models
            this.search.on("change", function(model, options) {
                if (options.ignore) {
                    return;
                }
                
                var contexts = _.values(that.contexts);
                var changed = model.changedAttributes();
                for(var i = 0; i < contexts.length; i++) {
                    var context = contexts[i];
                    if (context.search) {
                        var newOptions = _.extend({ignore: true}, options);
                        context.search.set(changed, newOptions);
                    }
                }
            });
            
            // Propagate any change event on our query model to all query
            // models
            this.query.on("change", function(model, options) {
                if (options.ignore) {
                    return;
                }
                
                var contexts = _.values(that.contexts);
                var changed = model.changedAttributes();
                for(var i = 0; i < contexts.length; i++) {
                    var context = contexts[i];
                    if (context.query) {
                        var newOptions = _.extend({ignore: true}, options);
                        context.query.set(changed, newOptions);
                    }
                }
            });
        },
    });

    AppFx.Components.registerType('appfx-groupcontext', GroupContext);
    
    return GroupContext;
});
