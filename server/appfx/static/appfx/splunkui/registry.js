// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var Backbone = require("backbone");
    
    var Registry = Backbone.Model.extend({
        initialize: function() {
            this.name = name;
            this.Types = new Backbone.Model();
        },
        
        createError: function(message) {
            message = "[" + this.name + "] " + message;
            
            return message
        },
        
        registerInstance: function(name, component) {
            if (this.has(name)) {
                throw new Error(this.createError("Already have instance with name: " + name));
            }
            
            this.set(name, component);
        },

        revokeInstance: function(name) {
            this.unset(name);
        },
        
        hasInstance: function(name) {
            return this.has(name);
        },
        
        registerType: function(name, type) {
            if (this.Types.has(name)) {
                throw new Error(this.createError("Already have type with name: " + name));
            }
            
            this.Types.set(name, type);
        },

        revokeType: function(name) {
            this.Types.unset(name);
        },
        
        hasType: function(name) {
            return this.Types.has(name);
        },
        
        getInstance: function(name) {            
            if (!this.has(name)) {
                console.error(this.createError("No instance with name: " + name));
            }
            
            return this.get(name);
        },
        
        getType: function(name) {
            if (!this.hasType(name)) {
                console.error(this.createError("No type with name: " + name));
            }
            
            return this.Types.get(name);
        },
        
        getInstances: function() {
            return _.values(this.attributes);
        },
        
        getTypes: function() {
            return _.values(this.Types.attributes);
        },
        
        getInstanceNames: function() {
            return _.keys(this.attributes);
        },
        
        getTypeNames: function() {
            return _.keys(this.Types.attributes);
        },
        
        create: function(type, name, options) {
            options.name = name;
            
            var Type = this.Types.get(type);
            if (!Type) {
                throw new Error(this.createError(
                    "Cannot create instance '" + name + "' of type '" + type + "' as the type does not exist!"
                ));
            }
            
            var instance = new Type(options);
            this.registerInstance(name, instance);
            
            return instance;
        }
    });
    
    return Registry;
});
