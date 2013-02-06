// Copyright 2012 Splunk, Inc.

require.config({
    shim: {
        "jquery.deparam": {
            deps: [],
            exports: "jQuery.fn.deparam"
        }
    }
});

define(function(require, exports, module) {    
    var _ = require("underscore");
    var Backbone = require("backbone");
    var Registry = require("./registry");
    var Resolver = require("JS_CACHE/urlresolver");
    var config = require("JS_CACHE/config");
    var deparam = require("appfx/contrib/jquery.deparam");

    var DEBUG = false;
    
    var AppFxConstructor = function(options) {
        this.Components = new Registry("Components");
        
        this.initialize.apply(this, arguments);
        this.STATIC_PREFIX = config.STATIC_URL;
    };
    _.extend(AppFxConstructor.prototype, Backbone.Events, {
        started: false,
        
        initialize: function() {},
        
        drilldown: function(path, data) {
            var encoded = $.param(data || {});
            
            if (encoded) {
                path = path + "?" + encoded;
            }
            
            window.location = path;
        },
        
        load: function(deps, cb) {
            cb = cb || function() {};
            deps = (deps || []).slice();
            //deps.unshift("./");
            
            require(deps, cb);  
        },
        
        loadDrilldown: function(data) {
            var queryArgs = window.location.search.substr(1) || "";
            var args = _.extend({}, $.deparam(queryArgs), data);
            
            var that = this;
            _.each(args, function(datum, name) {
                if (that.Components.has(name)) {
                    var component = that.Components.getInstance(name);
                    
                    if (component.settings) {
                        component.settings.set(datum);
                    }
                    else if (component.set) {
                        component.set(datum);
                    }
                    else {
                        console.log("Could not find a setter for '" + name + "'", datum);
                    }
                }
            });
        },
        
        reverse: function(name, app, args) {
            return Resolver.reverse(name, app, args);
        },
        
        createService: function(options) {
            options = options || {};
            var http = options.http || new splunkjs.ProxyHttp(config.PROXY_PATH);
            options.version = options.version || "5.0";
            options.app = options.app || "-";
            
            return new splunkjs.Service(http, options);
        },
        
        on: function(events, callback, context) {
            Backbone.Model.prototype.on.apply(this, arguments);
            
            // This is some short-circuiting, so if somebody calls .on("start")
            // or .on("load") after we're done loading, we just invoke it
            // immediately.
            if (this.started) {
                events = events || "";
                callback = callback || function() {};
                if (events.indexOf("start") >= 0 || events.indexOf("load") >= 0) {
                    callback.apply(context, this);
                }
            }
        },
        
        _loadDOMComponents: function() {            
            // Instantiate all controls 
            var controls = $(".appfx-control");
            for(var i = 0; i < controls.length; i++) {
                var site = $(controls[i]);
                var name = site.attr('id');
                var typeName = site.data("type");
                
                if (!typeName) {
                    continue;
                }
                
                var options = {}
                var optionsString = site.attr('data-options');
                if (optionsString && optionsString.length > 0)
                    options = JSON.parse(optionsString);
                
                options.el = site;
                
                var control = this.Components.create(
                    typeName, name, options);
                control.render();
            }
            
            // Instantiate all components 
            var contexts = $(".appfx-context");
            for(var i = 0; i < contexts.length; i++) {
                var site = $(contexts[i]);
                var name = site.attr('id');
                var typeName = site.data("type");
                
                if (!typeName) {
                    continue;
                }

                var options = {}
                var optionsString = site.attr('data-options');
                if (optionsString && optionsString.length > 0)
                    options = JSON.parse(optionsString);

                this.Components.create(typeName, name, options);
            }

            // Start all the contexts
            var contexts = this.Components.getInstances();
            for (var i = 0; i < contexts.length; ++i) {
                var context = contexts[i];
                
                if (context.start) {
                    context.start();
                }
            }
        },
    });
    
    // Create AppFx
    var AppFx = new AppFxConstructor();
    var ns = window.AppFx = AppFx;
    
    return AppFx;
});
