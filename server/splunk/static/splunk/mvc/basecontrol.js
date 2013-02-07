// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('splunkjs.mvc');
    var Backbone = require("backbone");
    var Settings = require("./settings");

    var BaseControl = Backbone.View.extend({
        constructor: function(options) {
            // We put the name extraction logic in the constructor so that
            // we don't have to have our subclasses need to call 
            // the super class initialize every time.
            var name = options.name;
            var returnVal = Backbone.View.prototype.constructor.apply(this, arguments);
            
            if (name) {
                this.name = name;
            }
            else if(this.$el.attr('id')) {
                this.name = this.$el.attr('id');
            }
            
            return returnVal;
        },
        
        setElement: function() {
            // We're doing this in setElement for a few reasons:
            // 1. It means that subclasses won't have to worry about
            // calling our initialize class.
            // 2. It is actually the most robust way to do this, because
            // it means we will catch both construction of new views, as 
            // well as later calls to setElement
            
            // Call our super class
            Backbone.View.prototype.setElement.apply(this, arguments);
            
            // Now that we have our new $el, we can call addClass on it
            this.$el.addClass("appfx-control");
            if (this.className) {
                this.$el.addClass(this.className);
            }
            
            return this;
        },

        bindToComponent: function(name, fn, fnContext) {
            // A component name is required
            if (!name) {
                return this;
            }
            
            // A callback is required
            if (!fn) {
                return this;
            }
            
            // We register on the "change:{name}" event
            var ev = "change:" + name;
            splunkjs.mvc.Components.bind(ev, fn, fnContext);
            
            // However, it could be that the component already exists,
            // in which case, we will invoke the callback manually
            if (splunkjs.mvc.Components.has(name)) {
                var ctx = splunkjs.mvc.Components.get(name);
                fn.apply(fnContext, [splunkjs.mvc.Components, ctx, {}]);
            }
            
            return this;
        },

        unbindFromComponent: function(name, fn, fnContext) {
            // A component name is required
            if (!name) {
                return this;
            }
            
            // We register on the "change:{name}" event
            var ev = "change:" + name;
            splunkjs.mvc.Components.off(ev, fn, fnContext);
            
            return this;
        },
        
        configure: function() {
            // Remove the el component, so we don't maintain a reference to it
            // in this.options or this.settings.
            delete this.options.el;
            
            // Now, we create our default settings model.
            this.settings = new Settings(this.options);
            
            return this;
        }
    });

    splunkjs.mvc.Components.registerType('appfx-basecontrol', BaseControl);
    
    return BaseControl;
});
