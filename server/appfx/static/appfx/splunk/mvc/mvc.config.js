// Copyright 2012 Splunk, Inc.

(function() {
        
    require.config({
        baseUrl: window.SPLUNKJS_STATIC_URL,
        map: {
            "*": {
                css: "appfx/contrib/require-css/css"
            }  
        },
        paths: {
            "backbone": "appfx/contrib/backbone",
            "underscore": "appfx/contrib/underscore",
            "async": "appfx/contrib/requirejs-plugins/async"
        },
        shim: {
            "underscore": {
                deps: [],
                exports: "_",
                init: function() {
                    return this._.noConflict();
                }
            },
            "backbone": {
                deps: ["underscore"],
                exports: "Backbone",
                init: function() {
                    return this.Backbone.noConflict();
                }
            }
        },
        packages: [
            {
                name: "splunkjs.mvc",
                location: "appfx/splunk/mvc",
                main: "mvc"
            }
        ]
    });

    var _callbacks = [];

    // Bootstrap onto the 'splunkjs' object if one exists, or create a new
    // one. 
    // TOOD: what if one already exists with the '.mvc' namespace? Should
    // we noConflict() it?
    if (!window.splunkjs) {
        window.splunkjs = {};
    }
    
    // Get a bootstrap splunkjs.mvc object, but also the 
    window.splunkjs.mvc = {
        load: function(deps, cb) {
            cb = cb || function() {};
            deps = (deps || []).slice();
            
            // We push two new dependencies, to make sure that splunkjs.mvc and
            // underscore are loaded. However, these go at the end, to not
            // interfere with the ordering of dependencies that the user
            // passed in.
            deps.push("splunkjs.mvc");
            deps.push("underscore");
            
            // UNDONE: we need to remove this "implicit" dependency on bootstrap.js
            // Whatever components require it should do so manually. The problem
            // is that currently the nav bars require it and they are not componentized
            // Note that we use the full path, so that we don't have to define it
            // in require.config
            deps.push("appfx/contrib/bootstrap");     
            
            // Find all the components that were existent as DOM elements,
            // and require their dependencies
            $("body div[data-require]").each(function() {
                var $this = $(this);
                deps.push($this.attr("data-require"));
            });
            
            require(deps, function() {                
                var _ = require("underscore");
                
                if (!splunkjs.mvc.started) {
                    // Register the start callbacks
                    _.each(_callbacks, function(handler) {
                        splunkjs.mvc.on(handler.event, handler.fn, handler.context);
                    });
                    _callbacks = null;
                
                    // Load all pre-existing components, and we know we required
                    // them
                    splunkjs.mvc._loadDOMComponents();
                }
                
                splunkjs.mvc.started = true;
                
                // Trigger any events
                splunkjs.mvc.trigger("load start", splunkjs.mvc);
                
                // Call any callback
                cb.apply(null, arguments);
            });
        },
        
        on: function(event, cb, context) {
            _callbacks.push({event: event, fn: (cb || function() {}), context: context});
        }
    };
})();