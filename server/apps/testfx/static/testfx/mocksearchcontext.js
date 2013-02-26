// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('appfx.main');
    var BaseContext = require('appfx/splunkui/basecontext');
    var MockDataSource = require('testfx/mockdatasource');
    var SingleMockDataSource = require('testfx/singlemockdatasource');
    var ResultTableMockDataSource = require('testfx/resulttablemockdatasource');
    var SearchBarMockDataSource = require('testfx/searchbarmockdatasource');
    var TimepickerMockDataSource = require('testfx/timepickermockdatasource');
    var TimelineMockDataSource = require('testfx/timelinemockdatasource');
    var EventTableMockDataSource = require('testfx/eventtablemockdatasource');
    var FormsMockDataSource = require('testfx/formsmockdatasource');
    var ChartMockDataSource = require('testfx/chartmockdatasource');
    var GoogleMapDataSource = require('testfx/googlemapmockdatasource');
    var SearchModels = require('appfx/splunkui/searchmodel');
    
    var MockSearchContext = BaseContext.extend({

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
            this.type = "standard";
            if('type' in options){
                this.type = options['type'];
            }
        },
        
        start: function() {  
            var that = this;
            _.defer(function(){
                that.trigger("search:done"); 
            })    
            return this;
        },
        
        data: function(source, attrs) {
            attrs = attrs || {};
            attrs.context = this;
            attrs.source = source;

            var datasource = null;
            switch(this.type){
                case "single":
                    datasource = new SingleMockDataSource(attrs);
                    break;
                case "resulttable":
                    datasource = new ResultTableMockDataSource(attrs);
                    break;
                case "searchbar":
                    datasource = new SearchBarMockDataSource(attrs);
                    break;
                case "timepicker":
                    datasource = new TimepickerMockDataSource(attrs);
                    break;
                case "timeline":
                    datasource = new TimelineMockDataSource(attrs);
                    break;
                case "eventtable":
                    datasource = new EventTableMockDataSource(attrs);
                    break;
                case "forms":
                    datasource = new FormsMockDataSource(attrs);
                    break;
                case "chart":
                    datasource = new ChartMockDataSource(attrs);
                    break;
                case "googlemap":
                    datasource = new GoogleMapDataSource(attrs);
                    break;
                default:
                    datasource = new MockDataSource(attrs);
                    break;
            }
            return datasource;
        },

        switchData: function(type) {
            
        },
    });

    AppFx.Components.registerType('appfx-mocksearchcontext', MockSearchContext);
    
    return MockSearchContext;
});
