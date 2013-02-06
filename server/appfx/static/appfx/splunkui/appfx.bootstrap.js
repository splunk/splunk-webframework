// Copyright 2012 Splunk, Inc.

(function() {
        
    require.config({
        baseUrl: window.APPFX_STATIC_URL,
        map: {
            "*": {
                css: "appfx/contrib/require-css/css"
            }  
        },
        paths: {
            "backbone": "appfx/contrib/backbone",
            "underscore": "appfx/contrib/underscore",
            "bootstrap": "appfx/contrib/bootstrap",
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
        /*packages: [
            {
                name: "splunkui",
                location: "appfx/splunkui",
                main: "appfx/splunkui/appfx"
            }
        ],*/
        deps: [
            "bootstrap",
            "underscore"
        ]
    });

    var _callbacks = [];

    // Get a bootstrap AppFx object, but also the 
    window.AppFx = {
        load: function(deps, cb) {
            cb = cb || function() {};
            deps = (deps || []).slice();
            deps.unshift("appfx/splunkui/appfx");
            
            require(
                deps,
                function(AppFx) {
                    var _ = require("underscore");
                    
                    if (!AppFx.started) {
                        // Register the start callbacks
                        _.each(_callbacks, function(handler) {
                            AppFx.on(handler.event, handler.fn, handler.context);
                        });
                        _callbacks = null;
                    
                        // Load all pre-existing components.
                        AppFx._loadDOMComponents();
                    }
                    
                    AppFx.started = true;
                    
                    // Trigger any events
                    AppFx.trigger("load start", AppFx);
                    
                    // Call any callback
                    cb.apply(null, arguments);
                }
            );
        },
        
        on: function(event, cb, context) {
            _callbacks.push({event: event, fn: (cb || function() {}), context: context});
        }
    };
})();
