// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');

    var defaultCondition = function(context) {
        var content = context.get("data") || {};
        var previewCount = content.resultPreviewCount || 0;
        
        return previewCount > 0;
    };
    
    var identityCondition = function() {
        return true;
    };

    var DataSource = Backbone.Model.extend({
        defaults: {
            context: null,
            condition: defaultCondition,
            source: "",
            autofetch: true  
        },
        
        initialize: function() {   
            // Handle whenever the autofetch parameter changes.
            this.on("change:autofetch", this.handleAutofetch, this);
                 
            this.handleAutofetch();
            if (this.get("autofetch")) {
                this.fetch();
            }
        },
        
        handleAutofetch: function() {
            if (this.get("autofetch")) {
                // Bind to changes on ourselves and the context
                this.on("change", this.fetch, this);
                this.get("context").on("change:data", this.fetch, this);
            }  
            else {
                // Unbind to changes on ourselves and the context
                this.off("change", null, this);
                this.get("context").off("change:data", null, this);
            }
        },
        
        sync: function() {
            return false;
        },
        
        destroy: function() {
            this.off();
            this.get("context").off(null, null, this);  
        },
        
        fetch: function(options) {            
            options = options || {};

            var error = function(options, err) {
                if (options.error) {
                    options.error(this, err, options);
                }
                return this;
            };

            var context = this.get("context");
            if (!context) {
                return error(options, "No context");
            }            
            
            var manager = context.manager;
            if (!manager) {
                return error(options, "No manager");
            }
            
            var job = manager.job;

            // Get the request options and delete everything we don't need.
            var requestOptions = this.toJSON();
            delete requestOptions.data;
            delete requestOptions.context;
            delete requestOptions.source;
            delete requestOptions.autofetch;
            delete requestOptions.condition;

            var condition = this.get("condition") || defaultCondition;
            
            // We only execute the fetch if it meets our condition, but
            // if we have autofetch, we will skip this (as fetch was
            // called manually).
            if (this.get("autofetch") && !condition(context, job)) {
                return;
            }
            
            var that = this;
            var source = this.get("source");
            job[source](requestOptions, function(err, data) {
                if (err) {
                    error(options, err);
                }
                else {
                    that._data = data;
                    that.trigger("data", that, data);
                    if (options.success) {
                        options.success(this, data, options);
                    }
                }
            });
        },
        
        data: function() {
            return this._data;
        },
        
        model: function() {
            var model = new Backbone.Model(this.data());
            model.raw = this.data();
        },
        
        collection: function() {
            var data = this.data();
            
            var fields = data.fields || [];
            var items = [];
            
            if (data.results) {
                items = data.results;
            }
            else if (data.columns) {
                var columns = data.columns || [];
                
                for(var i = 0; i < columns.length; i++) {
                    items.push({
                        field: fields[i],
                        values: columns[i]
                    });
                }
            }
            else if (data.rows) {
                var rows = data.rows || [];
                
                for(var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var item = {};
                    for(var j = 0; j < fields.length; j++) {
                        item[fields[j]] = row[j];
                    }
                    items.push(item);
                }
            }
            
            var collection = new Backbone.Collection(items);
            collection.raw = data;
            
            return collection;
        },
        
        hasData: function() {
            if (this.data()) {
                // In the case of output_mode=json --> [{count:0}]
                if (_.isArray(this._data) && this._data.length === 1 && this._data[0].count === 0) {
                    return false;
                }
                // In the case of output_mode=json_{rows|cols} --> { fields: [], ... }
                if (this._data.fields && this._data.fields.length === 0) {
                    return false;
                }
                
                return true;
            }
            
            return false;
        }
    },{
        defaultCondition: defaultCondition,
        identityCondition: identityCondition
    });
    
    return DataSource;
});
