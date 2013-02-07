// Copyright 2012 Splunk, Inc.

require.config({
    shim: {
        "./d3/d3.v2": {
            deps: [],
            exports: "d3"
        },
        "./d3/fisheye": {
            deps: ["./d3/d3.v2"],
            exports: "d3.fisheye"
        },
        "./d3/nv.d3": {
            deps: ["./d3/d3.v2", "./d3/fisheye"],
            exports: "nv"
        }
    }
});

define(function(require, exports, module) {
    var _ = require('underscore');
    var mvc = require('splunkjs.mvc');
    var BaseControl = require("../basecontrol");
    var d3 = require("./d3/d3.v2");
    var Messages = require("../messages");
    var nv = require("./d3/nv.d3");
    
    require("css!./d3chart.css");
    require("css!./d3/nv.d3.css");

    var D3ChartClass = {
        template: '<svg></svg>'
    };
        
    var D3Chart = BaseControl.extend({
        className: "appfx-d3chart",

        options: {
            datasource: "preview",
            type: "lineChart",
            setup: null
        },
        
        initialize: function() {
            this.configure();
            this.settings.on("change:type change:setup", _.debounce(this.render), this);            
            
            this.chart = null;
            
            this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
        },
        
        onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }
            if (this.datasource) {
                this.datasource.off(null, null, this);
                this.datasource.destroy();
                this.datasource = null;
            }

            this.context = context;
            if (!context) {
                this.message('no-search');
                return;
            }

            this.datasource = this.context.data(this.settings.get("datasource"), {
                output_mode: "json_cols",
                count: 0
            });
            context.on("search:start", this.onSearchStart, this);
            context.on("search:progress", this.onSearchProgress, this);
            context.on("search:cancelled", this.onSearchCancelled, this);
            context.on("search:error", this.onSearchError, this);
            this.datasource.on("data", this.onDataChanged, this);
        },

        message: function(info) {
            this.chart = null;
            Messages.render(info, this.$el);
        },
        
        render: function() {
            this.createChart(this.chartData);
            return this;
        },
        
        createChart: function(data) {
            if (!data) {
                return; // No data to display
            }

            if (this.chart) {
                return; // Already created
            }
            
            // If we don't have an initializer, don't do anything yet
            if (!this.settings.has("setup")) {
                return;
            }

            this.$el.html("<svg></svg>");
            var node = this.$("svg").get(0);

            var that = this;
            nv.addGraph(function() {
                var chart = nv.models[that.settings.get("type")]();
                
                that.settings.get("setup")(chart);

                d3.select(node)
                    .datum(data)
                  .transition().duration(500)
                    .call(chart);
                
                nv.utils.windowResize(function() { 
                    d3.select(node).call(chart) 
                });
                
                that.chart = chart;
                
                return chart;
            });
        },
        
        updateChart: function() {
            if (!this.chartData)
                return;

            var data = this.chartData;
            
            if (!this.chart)
                this.createChart(data);

            if (!this.chart)
                return; // Couldn't create the chart

            var svg = this.$("svg").get(0);
            d3.select(svg)
                .datum(data)
              .transition().duration(500)
                .call(this.chart);

            this.settings.get("setup")(this.chart);
        },
        
        onDataChanged: function() {
            
            if (!this.datasource.hasData()) {
                return;
            }
            var data = this.datasource.data();
            
            // UNDONE: Should not transform data until we determine that we 
            // can actually render the chart.
            var fields = data.fields;
            var columns = data.columns;
            var xValues = columns[0];
            var xModifier = fields[0] === "_time" 
                ? function(x) { return d3.time.format.iso.parse(x); } 
                : function(x) { return x; }
            var allSeries = [];
            for(var i = 1; i < columns.length; i++) {
                if (fields[i].charAt(0) === "_") {
                    continue;
                }
                
                var series = {
                    values: [],
                    key: fields[i]
                };
                
                var column = columns[i];
                for(var j = 0; j < column.length; j++) {
                    series.values.push({
                        x: xModifier(xValues[j]),
                        y: parseFloat(column[j] || 0),
                        size: 1
                    });
                }
                
                allSeries.push(series);
            }
            
            this.chartData = allSeries;
            this.updateChart();
        },

        onSearchProgress: function(properties) {                
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
        },
        
        onSearchStart: function() { 
            this.message('waiting');
        },
        
        onSearchCancelled: function() { 
            this.message('cancelled');
        },
            
        onSearchError: function(message) {
            this.message({
                level: "warning",
                icon: "warning-sign",
                message: message
            });
        }
    },
    D3ChartClass);
    
    splunkjs.mvc.Components.registerType('appfx-d3chart', D3Chart);
    
    return D3Chart;
});
