define(function(require, exports, module) {
    var _ = require('underscore');
    var mvc = require("splunk.mvc");
    var BaseControl = require("./basecontrol");
    var Messages = require("./messages");
    var Settings = require("./settings");
    var JSCharting = require('js_charting/js_charting');

    // Let's load the charting script
    var chartingPrefix = mvc.STATIC_PREFIX + "splunkjs/splunk.ui.charting.min.js";
    var chartingToken = splunkjs.UI.loadCharting(chartingPrefix);

    require("css!./chart.css");
        
    var Chart = BaseControl.extend({
        className: "appfx-newchart",
        VIZ_PROPERTY_PREFIX_REGEX: /^charting\./,

        options: {
            datasource: "preview",
            enableChartClick: true,
            enableLegendClick: true,
            type: "line"
        },
        
        initialize: function() {
            this.settings = new Settings(this.options);
            this.settings.on("change", this.updateChart, this);
            this.bindComponent(this.options.context, this._onContextChange, this);
        },
        
        _onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }
            if (this.data) {
                this.data.off(null, null, this);
                this.data = null;
            }

            if (!context) {
                this.message("no-search");
                return;
            }

            this.context = context;
            this.data = this.context.data(this.settings.get("datasource"), { autofetch: false, count: 0 });
            context.on("search:start", this._onSearchStart, this);
            context.on("search:progress", this._onSearchProgress, this);
            context.on("search:cancelled", this._onSearchCancelled, this);
            context.on("search:error", this._onSearchError, this);
            this.data.on("change:data", this._onDataChanged, this);
        },
        
        _onDataChanged: function() {
            this.chartData = this.data.data();
            this.updateChart();
        },
        
        _onSearchProgress: function(properties) {
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = content.isDone || false;

            if (previewCount === 0 && isJobDone) {
                this.message('no-results');
                return;
            }
            
            if (previewCount === 0) {
                this.message('waiting');
                return;
            }
            
            if (this.data) {
                this.data.fetch({output_mode: "json_cols"});
            }
        },
        
        _onSearchCancelled: function() {
            this.message('cancelled');
        },
        
        _onSearchError: function(message) {
            this.message({
                level: "warning",
                icon: "warning-sign",
                message: message
            });
        },
        
        _onSearchStart: function() {
            this.message('waiting');
        },
        
        message: function(info) {
            Messages.render(info, this.$el);
        },

        render: function() {
            if (this.chart) {
                this.chart.off();
                this.chart.destroy();
                this.chart = null;
            }
            
            this.createChart();
            
            return this;
        },
        
        show: function() {
            this.$el.css('display', '');
        },
        
        hide: function() {
            this.$el.css('display', 'none');
        },
        
        createChart: function() {
            var data = {};
            _.each(this.settings.toJSON(), function(value, key){
                if(this.VIZ_PROPERTY_PREFIX_REGEX.test(key)) {
                    data[key.replace(this.VIZ_PROPERTY_PREFIX_REGEX, '')] = value;
                }
            }, this);

            this.chart = JSCharting.createChart(this.el, data);
            
            this.updateChart();
        },
        
        updateChart: function() {
            if (!this.chartData) {
                return;
            }
            var chartReadyData = JSCharting.extractChartReadyData(this.chartData);
            if (this.chart) {
                this.chart.prepareAndDraw(chartReadyData);
            }
        },
        
        chartClicked: function(e) {
            this.trigger("clicked:chart", e);
        },
        
        legendClicked: function(e) {
            this.trigger("clicked:legend", e);
        }
    });
    
    mvc.Components.registerType('appfx-newchart', Chart);
    
    return Chart;
});
