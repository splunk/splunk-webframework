// Copyright 2012 Splunk, Inc.

(function() {
    
    function enableCSRFProtection($) {
        // Most of this code is taken verbatim from Django docs:
        // https://docs.djangoproject.com/en/dev/ref/contrib/csrf/
        
        // Utility function to get cookie values
        function getCookie(name) {
            var cookieValue = null;
            if (document.cookie && document.cookie != '') {
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var cookie = jQuery.trim(cookies[i]);
                    // Does this cookie string begin with the name we want?
                    if (cookie.substring(0, name.length + 1) == (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        };
                    
        // Add CSRF info
        function csrfSafeMethod(method) {
            // these HTTP methods do not require CSRF protection
            return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
        }
        
        $.ajaxPrefilter(function(options, originalOptions, xhr) {
            if (!options.hasOwnProperty("crossDomain")) {
                options.crossDomain = false;
            }
            
            var type = options["type"] || "";
            if (!csrfSafeMethod(type)) {
                xhr.setRequestHeader("X-CSRFToken", getCookie("csrftoken"));
            }
        });
    };
    
    function enableUnauthorizationRedirection($) {
        $(document).bind('ajaxError', function(ev, xhr, opts, err) {
            var pathname = window.location.pathname;
            
            var loginURL = AppFx.reverse(":login");
            var logoutURL = AppFx.reverse(":logout");
            if (xhr.status === 401 && pathname.indexOf(logoutURL) === -1) {
                var returnTo = encodeURIComponent(pathname + document.location.search);
                document.location = loginURL + "?return_to=" + returnTo;
                return;
            } 
        });
    };
        
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
            "jquery.attributes": "appfx/contrib/jquery.attributes",
            "jquery.spin": "appfx/contrib/jquery.spin",
            "jquery.sparkline": "appfx/contrib/jquery.sparkline",
            "jquery.deparam": "appfx/contrib/jquery.deparam",
            "appfx.urlresolver": "JS_CACHE/urlresolver",
            "backbone.nested": "appfx/contrib/backbone.nested",
            "appfx.main": "appfx/splunkui/appfx",
            "appfx.config": "JS_CACHE/config",
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
            },
            "appfx/contrib/spin": {
                deps: [],
                exports: "Spinner"
            },
            "jquery.spin": {
                deps: ["appfx/contrib/spin"],
                exports: "jQuery.fn.spin"
            },
            "jquery.attributes": {
                deps: [],
                exports: "jQuery.fn.attributes"
            },
            "jquery.deparam": {
                deps: [],
                exports: "jQuery.fn.deparam"
            },
            "backbone.nested": {
                deps: ["backbone"],
                exports: "Backbone.NestedModel"
            }
        },
        deps: [
            "jquery.attributes",
            "bootstrap",
            "appfx/splunkui/appfx.utils",
            "underscore",
            "appfx.config"
        ]
    });

    var _callbacks = [];

    // Get a bootstrap AppFx object, but also the 
    window.AppFx = {
        load: function(deps, cb) {
            cb = cb || function() {};
            deps = (deps || []).slice();
            deps.unshift("appfx.main");
            
            require(
                deps,
                function(AppFx) {
                    var _ = require("underscore");
                    
                    // Enable CSRF protection
                    enableCSRFProtection($);
                    
                    // Enable 401/403 redirection
                    enableUnauthorizationRedirection($);
                    
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
