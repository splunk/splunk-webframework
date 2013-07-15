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

    var MockDataSource = Backbone.Model.extend({
        defaults: {
            context: null,
            condition: defaultCondition,
            source: "",
            autofetch: true  
        },
        
        initialize: function() {  
            var that = this; 
            _.defer(function(){ 
                that.fetch();
            });
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
            
            // Get the request options and delete everything we don't need.
            var requestOptions = this.toJSON();
            delete requestOptions.data;
            delete requestOptions.context;
            delete requestOptions.source;
            delete requestOptions.autofetch;
            delete requestOptions.condition;

            var mockData = this.mockData();
            if (!mockData){
                return error(options, "No Mock Data");
            }

            var data = mockData;
            this._data = data;
            
            this.trigger("data", this, data);
            if (options.success) {
                options.success(this, data, options);
            }
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
        },

        mockData : function(){
            return null;
        }
    },{
        defaultCondition: defaultCondition,
        identityCondition: identityCondition
    });
    
    return MockDataSource;
});
