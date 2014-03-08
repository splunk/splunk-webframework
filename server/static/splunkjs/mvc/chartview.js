
define('util/jscharting_utils',['underscore', 'helpers/user_agent'], function(_, userAgent) {

    var VISIBLE_FIELD_REGEX = /^[^_]|^_time/,
        MAX_SERIES = 50,
        MAX_COLUMN_POINTS = (function() {
            if(!userAgent.isIE()) {
                return 1500;
            }
            if(!userAgent.isIELessThan(9)) {
                return 1200;
            }
            return 500;
        }()),
        MAX_LINE_POINTS = userAgent.isIELessThan(9) ? 2000 : 20000,
        MAX_CATEGORY_LABELS = 80;

    // sort of a "catch-all" method for adding display properties based on the data set and the web.conf config
    // this method is used by consumers of the JSCharting library to share custom logic that doesn't belong
    // in the library itself
    var getCustomDisplayProperties = function(chartData, webConfig) {
        webConfig = webConfig || {};
        var customProps = {};
        if(webConfig['JSCHART_TEST_MODE']) {
            customProps.testMode = true;
        }
        var isTimeData = chartData.length > 0 && chartData.fieldAt(0) === '_time'
                            && (chartData.hasField('_span') || chartData.seriesAt(0).length === 1);

        if(chartData.length > 0 && !isTimeData && chartData.seriesAt(0).length > MAX_CATEGORY_LABELS) {
            customProps['axisLabelsX.hideCategories'] = true;
        }
        if(chartData.hasField('_tc')) {
            customProps.fieldHideList = ['percent'];
        }
        return customProps;
    };

    var sliceResultsToSeriesLength = function(rawData, length) {
        var sliced = {
            fields: rawData.fields,
            columns: []
        };

        _(rawData.columns).each(function(column, i) {
            sliced.columns[i] = column.slice(0, length);
        });

        return sliced;
    };

    var fieldIsVisible = function(field) {
        var fieldName = _.isString(field) ? field : field.name;
        return VISIBLE_FIELD_REGEX.test(fieldName);
    };

    // pre-process chart data, truncating either the number of series or the number of points per series
    // default truncation constants are defined above, though a custom limit for total number of points can be
    // passed in as part of the display properties
    var preprocessChartData = function(rawData, displayProperties) {
        if(rawData.columns.length === 0 || rawData.columns[0].length === 0) {
            return rawData;
        }
        var chartType = displayProperties.chart || 'column';
        if(chartType in { pie: true, scatter: true, radialGauge: true, fillerGauge: true, markerGauge: true }) {
            return rawData;
        }

        if(rawData.fields.length >= MAX_SERIES) {
            var spanColumn,
                normalizedFields = _(rawData.fields).map(function(field) {
                    return _.isString(field) ? field : field.name;
                }),
                spanIndex = _(normalizedFields).indexOf('_span');

            if(spanIndex > -1 && spanIndex >= MAX_SERIES) {
                spanColumn = rawData.columns[spanIndex];
            }

            // slice the number of series
            rawData = {
                columns: rawData.columns.slice(0, MAX_SERIES),
                fields: rawData.fields.slice(0, MAX_SERIES)
            };

            // if our slicing removed _span, put it back
            if(spanColumn) {
                rawData.columns.push(spanColumn);
                rawData.fields.push('_span');
            }
        }

        var truncationLimit,
            userSpecifiedLimit = parseInt(displayProperties['chart.resultTruncationLimit'], 10)
                                    || parseInt(displayProperties['resultTruncationLimit'], 10);

        if(userSpecifiedLimit > 0) {
            truncationLimit = userSpecifiedLimit;
        }
        else {
            truncationLimit = (chartType in { line: true, area: true }) ? MAX_LINE_POINTS : MAX_COLUMN_POINTS;
        }
        var visibleFields = _(rawData.fields).filter(fieldIsVisible),
            numDataSeries = visibleFields.length - 1, // subtract one because the first field is the x-axis
            pointsPerSeries = rawData.columns[0].length,
            // numSeries is guaranteed not to be zero based on the first check in this method
            allowedPointsPerSeries =  Math.floor(truncationLimit / numDataSeries);

        if(pointsPerSeries > allowedPointsPerSeries) {
            return sliceResultsToSeriesLength(rawData, allowedPointsPerSeries);
        }
        return rawData;
    };

    return ({

        getCustomDisplayProperties: getCustomDisplayProperties,
        preprocessChartData: preprocessChartData

    });
});

define('splunkjs/mvc/chartview',['require','exports','module','underscore','jquery','./mvc','./basesplunkview','./messages','./drilldown','./utils','util/console','splunk.util','splunk.legend','util/jscharting_utils','splunk.config','jquery.ui.resizable','splunk.util','./tokenawaremodel'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var mvc = require("./mvc");
    var BaseSplunkView = require("./basesplunkview");
    var Messages = require("./messages");
    var Drilldown = require('./drilldown');
    var utils = require('./utils');
    var console = require('util/console');
    var SplunkUtil = require('splunk.util');
    var SplunkLegend = require('splunk.legend');
    var jschartingUtils = require('util/jscharting_utils');
    var splunkConfig = require('splunk.config');
    var resizable = require('jquery.ui.resizable');
    var JSCharting;
    var util = require('splunk.util');
    var TokenAwareModel = require('./tokenawaremodel');

    var ChartView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-chart",
        chartOptionPrefix: 'charting.',

        options: {
            'height': '250px',
            'data': 'preview',
            'type': 'column',
            'drilldownRedirect': true,
            'charting.drilldown': 'all',
            'resizable': false
        },
        
        omitFromSettings: ['el', 'reportModel', 'drilldown'],

        normalizeOptions: function(settings, options) {
            if (options.hasOwnProperty("drilldown") && !options.hasOwnProperty("charting.drilldown")) {
                settings.set("charting.drilldown", options.drilldown);
            }

            if (options.hasOwnProperty("charting.layout.splitSeries")) {
                settings.set("charting.layout.splitSeries", SplunkUtil.normalizeBoolean(options["charting.layout.splitSeries"]) ? "1" : "0");
            }

            if (options.hasOwnProperty("show")) {
                settings.set("show", SplunkUtil.normalizeBoolean(options.show) ? "1" : "0");
            }
        },

        initialize: function(options) {
            this.configure();
            this.model = this.options.reportModel || TokenAwareModel._createReportModel();
            this.settings._sync = utils.syncModels(this.settings, this.model, {
                auto: true,
                prefix: 'display.visualizations.',
                exclude: ['managerid','id','name','data', 'type', 'drilldownRedirect']
            });

            this.normalizeOptions(this.settings, options);

            // set our maxResultCount to the current value 'charting.chart.data', or default to 1000
            this.maxResultCount = 1000;
            if(this.settings.has('charting.data.count') && !_.isNaN(parseInt(this.settings.get('charting.data.count'), 10))) {
                this.maxResultCount = parseInt(this.settings.get('charting.data.count'), 10);
            }

            this._currentHeight = parseInt(this.settings.get('height'), 10);

            // initialize containers as detached DOM
            this.$chart = $('<div></div>');
            this.$msg = $('<div></div>');
            this.$inlineMsg = $('<div></div>');

            this.settings.on("change", this.render, this);
            var self = this;
            require(['js_charting/js_charting'], function(JSChartingLib){
                JSCharting = JSChartingLib;
                // Only create the chart if there is a pending create AND we
                // have data. For example, if we were just rendered but have not
                // received any data, no reason to create us just yet.
                if (self._chartCreationPending && self.chartData) {
                    self._createChart();
                }
                self.createChart = self._createChart;
            });

            this.bindToComponentSetting('managerid', this._onManagerChange, this);
            SplunkLegend.register(this.cid);
            
            // Setup resizing
            this._onResizeMouseup = _.bind(this._onResizeMouseup, this);
            this.settings.on('change:resizable', function(model, value, options) {
                value ? this._enableResize() : this._disableResize();
            }, this);
            if (this.settings.get('resizable')) {
                this._enableResize();
            }
            
            // If we don't have a manager by this point, then we're going to
            // kick the manager change machinery so that it does whatever is
            // necessary when no manager is present.
            if (!this.manager) {
                this._onManagerChange(mvc.Components, null);
            }
        },
        
        _onManagerChange: function(managers, manager) {
            if (this.manager) {
                this.manager.off(null, null, this);
                this.manager = null;
            }
            if (this.resultsModel) {
                this.resultsModel.off(null, null, this);
                this.resultsModel = null;
            }

            if (!manager) {
                this.message("no-search");
                return;
            }
            
            // Clear any messages, since we have a new manager.
            this.message("empty");
            
            this._err = false;
            this.manager = manager;
            this.resultsModel = this.manager.data(this.settings.get("data"), {
                autofetch: true,
                output_mode: "json_cols",
                show_metadata: true, 
                count: this.maxResultCount
            });
            this.resultsModel.on("data", this._onDataChanged, this);
            this.resultsModel.on("error", this._onSearchError, this);
            manager.on("search:start", this._onSearchStart, this);
            manager.on("search:progress", this._onSearchProgress, this);
            manager.on("search:done", this._onSearchProgress, this);
            manager.on("search:cancelled", this._onSearchCancelled, this);
            manager.on("search:fail", this._onSearchFailed, this);
            manager.on("search:error", this._onSearchError, this);
            manager.replayLastSearchEvent(this);
        },
        
        _onDataChanged: function() {
            if (!this.resultsModel.hasData()) {
                if (this._isJobDone) {
                    this.message('no-results');
                }
                return;
            }
            
            var chartData = this.resultsModel.data();
            console.log('chart data changed:', chartData);
            
            if (chartData.fields.length) {
                this.chartData = chartData;
                this.updateChart();
            }
        },
        
        _onSearchProgress: function(properties) {
            this._err = false;
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = this._isJobDone = content.isDone || false;

            if (previewCount === 0 && isJobDone) {
                this.message('no-results');
                return;
            }
            
            if (previewCount === 0) {
                this.message('waiting');
            }

        },
        
        _onSearchCancelled: function() {
            this._isJobDone = false;
            this.message('cancelled');
        },
        
        _onSearchError: function(message, err) {
            this._isJobDone = false;
            this._err = true;
            var msg = Messages.getSearchErrorMessage(err) || message;
            this.message({
                level: "error",
                icon: "warning-sign",
                message: msg
            });
        },

        _onSearchFailed: function(state) {
            this._isJobDone = false;
            this._err = true;
            var msg = Messages.getSearchFailureMessage(state);
            this.message({
                level: "error",
                icon: "warning-sign",
                message: msg
            });
        },
        
        _onSearchStart: function() {
            this._isJobDone = false;
            this._err = false;
            this.destroyChart();
            this.message('waiting');
        },
        
        message: function(info) {
            this.$msg.detach();
            Messages.render(info, this.$msg);
            this.$msg.prependTo(this.$el);
            this.trigger('rendered', this);
        },

        inlineMessage: function(info) {
            info.compact = true;
            Messages.render(info, this.$inlineMsg);
            this.trigger('rendered', this);
        },

        render: function() {
            this.$el.height(this._currentHeight).css('overflow', 'hidden');
            this.$msg.height(this._currentHeight).css('overflow', 'hidden');
            this.$chart.appendTo(this.$el);
            this.$inlineMsg.appendTo(this.$el);
            if (this.chart) {
                this.destroyChart();
            }

            if(!this._boundInvalidateChart) {
                this._boundInvalidateChart = _.bind(this.invalidateChart, this);
            }
            SplunkLegend.removeEventListener('labelIndexMapChanged', this._boundInvalidateChart);
            SplunkLegend.addEventListener('labelIndexMapChanged', this._boundInvalidateChart);

            if(!this._debouncedResize) {
                this._debouncedResize = _.debounce(_.bind(this.resizeChart, this), 100);
            }
            $(window).off('resize', this._debouncedResize);
            $(window).on('resize', this._debouncedResize);

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
            this._chartCreationPending = true;
        },

        _enableResize: function() {
            if (this._canEnableResize()) {
                this.$el.resizable({autoHide: true, handles: "s", stop: this._onResizeStop.bind(this)});
                // workaround until jquery ui is updated
                this.$el.on('mouseup', this._onResizeMouseup);
            }
        },
        
        _disableResize: function() {
            if (this._canEnableResize()) {
                this.$el.resizable('destroy');
                this.$el.off('mouseup', this._onResizeMouseup);
            }
        },
        
        // NOTE: Bound to 'this' by constructor
        _onResizeMouseup: function(event) {
            $(this).width("100%");
        },

        _onResizeStop: function(event, ui) {
            $(event.target).width("100%");
            this._currentHeight = this.$el.height();
            this.resizeChart();
        },
        
        _canEnableResize: function() {
            // Disable resizing for safari 3 and below only
            return (!($.browser.safari && $.browser.version < "526"));
        },

        _createChart: function() {
            // Initialize the chart with the type if it is there. If somebody
            // actually specified charting.chart, that option will win.
            var displayProperties = {'chart': this.settings.get("type")};

            // Copy over the settings for everything that starts with the 
            // prefix (charting.) by default.
            var prefix = this.chartOptionPrefix;
            _.each(this.settings.toJSON(), function(value, key){
                if(key.substring(0, prefix.length) == prefix) {
                    displayProperties[key.substring(prefix.length)] = value;
                }
            }, this);

            if(this._err) { return; }

            this.$msg.detach();
            console.log('Creating chart with data: ', displayProperties);
            var chart = this.chart = JSCharting.createChart(this.$chart, displayProperties);
            chart.on('pointClick', this.emitDrilldownEvent.bind(this));
            chart.on('legendClick', this.emitDrilldownEvent.bind(this));
            this.updateChart();
        },

        resizeChart: function() {
            if(this.chart) {
                this.updateChartContainerHeight();
                this.chart.resize();
            }
        },

        updateChart: function() {
            if(this._err) { return; }
            console.log('updateChart data=%o this.chart=%o', this.chartData, this.chart);
            if (this.chartData) {
                if(this.chart) {
                    this.$msg.detach();
                    this.$inlineMsg.empty();
                    var processedChartData = jschartingUtils.preprocessChartData(this.chartData, this.chart.getCurrentDisplayProperties()),
                        chartReadyData = JSCharting.extractChartReadyData(processedChartData);

                    this.chart.prepare(
                        chartReadyData,
                        jschartingUtils.getCustomDisplayProperties(chartReadyData, splunkConfig)
                    );
                    // if the preprocessChartData method truncated the data, show a message to that effect
                    if(processedChartData.columns.length > 0 &&
                            (processedChartData.columns.length < this.chartData.columns.length ||
                                processedChartData.columns[0].length < this.chartData.columns[0].length)) {
                        this.inlineMessage({
                            level: 'warn',
                            message: _('These results may be truncated. Your search generated too much data for the current visualization configuration.').t()
                        });
                    }
                    // otherwise if the number of results matches the max result count that was used to fetch,
                    // show a message that we might not be displaying the full data set
                    else if(this.chartData.columns.length > 0 && this.maxResultCount > 0 &&
                            this.chartData.columns[0].length >= this.maxResultCount) {
                        this.inlineMessage({
                            level: 'warn',
                            message: SplunkUtil.sprintf(
                                _('These results may be truncated. This visualization is configured to display a maximum of %s results per series, and that limit has been reached.').t(),
                                this.maxResultCount
                            )
                        });
                    }
                    this.updateChartContainerHeight();
                    if(this.chart.requiresExternalColorPalette()) {
                        var fieldList = this.chart.getFieldList();
                        SplunkLegend.setLabels(this.cid, fieldList);
                    }
                    this.invalidateChart();
                } else {
                    this.createChart();
                }
                this.trigger('rendered', this);
            }
        },

        destroyChart: function() {
            if (this.chart) {
                this.chart.off();
                this.chart.destroy();
                this.chart = null;
                clearTimeout(this._redrawChartTimeout);
            }
        },

        updateChartContainerHeight: function() {
            this.$chart.height(this._currentHeight - this.$inlineMsg.outerHeight());
        },

        invalidateChart: function() {
            clearTimeout(this._redrawChartTimeout);
            if(!this.chart || !this.chartData) {
                return;
            }
            var self = this;
            this._redrawChartTimeout = setTimeout(function() {
                if(self.chart.requiresExternalColorPalette()) {
                    self.setChartColorPalette();
                }
                var startTime = new Date().getTime();
                self.chart.draw();
                if (console.DEBUG_ENABLED) {
                    console.log('Chart=%o drawn in duration=%o ms',
                            self.model.get('display.visualizations.charting.chart'), new Date().getTime() - startTime);
                }
                self.trigger('rendered', self);
            }, 5);
        },

        setChartColorPalette: function() {
            var fieldIndexMap = {};
            _(this.chart.getFieldList()).each(function(field) {
                fieldIndexMap[field] = SplunkLegend.getLabelIndex(field);
            });
            this.chart.setExternalColorPalette(fieldIndexMap, SplunkLegend.numLabels());
        },

        emitDrilldownEvent: function(e) {
            var data = {},
                manager = this.manager;
            if(e.hasOwnProperty('name')) {
                _.extend(data,{
                    "click.name": e.name,
                    "click.value": e.value
                });
            }
            if(e.hasOwnProperty('name2')) {
                _.extend(data, {
                    "click.name2": e.name2,
                    "click.value2": e.value2
                });
            }
            _.extend(data, e.rowContext);
            
            var earliest, latest;
            if (e.name === "_time" && e._span) {
                var span = parseFloat(e._span);
                earliest = parseInt(e.value, 10);
                latest = earliest + span;
                
                
                _.extend(data, {
                    earliest: earliest || '',
                    latest: latest || ''
                });
            }
            else if (manager.job) {
                earliest = manager.job.properties().searchEarliestTime;
                latest = manager.job.properties().searchLatestTime;
                if (!earliest && manager.job.properties().earliestTime){
                    earliest = util.getEpochTimeFromISO(manager.job.properties().earliestTime);
                }
                if (!latest && manager.job.properties().latestTime){
                    latest = util.getEpochTimeFromISO(manager.job.properties().latestTime);
                }
                _.extend(data, {
                    earliest: earliest || '',
                    latest: latest || ''
                });
            }
            else {
                // If we have no source of earliest/latest, default to ''.
                _.extend(data, {
                    earliest: '',
                    latest: ''
                });
            }
            
            // Set up the handlers for default drilldown behavior and preventing
            // the default behavior
            var preventRedirect = false;
            var defaultDrilldown = _.once(_.bind(this.drilldown, this, e));
            var preventDefault = function() {
                preventRedirect = true;  
            };
            
            this.trigger('drilldown click', 
                { 
                    field: e.name2 || e.name, 
                    data: data, 
                    event: e, 
                    preventDefault: preventDefault,
                    drilldown: defaultDrilldown
                },
                this
            );
            
            e.preventDefault = preventDefault;
            e.drilldown = defaultDrilldown;
            
            this.trigger(
                (e.type === "legendClick") ? "clicked:legend click:legend" : "clicked:chart click:chart", 
                e,
                this
            );      
            
            // Now that the event is trigged, if there is a default action of
            // redirecting, we will execute it (depending on whether the user
            // executed preventDefault()).
            var drilldownType = this.settings.get('charting.drilldown');
            if (drilldownType !== 'none' && SplunkUtil.normalizeBoolean(drilldownType) !== false &&
                this.settings.get("drilldownRedirect") && !preventRedirect) {
                defaultDrilldown();
            }
        },

        drilldown: function(clickInfo, target) {
            var drilldownType = (this.settings.get('charting.drilldown') === 'all') ? 'all' : 'none';
            Drilldown.handleDrilldown(clickInfo, drilldownType, this.manager, target);
        },

        remove: function() {
            SplunkLegend.unregister(this.cid);
            if(this._boundInvalidateChart) {
                SplunkLegend.removeEventListener('labelIndexMapChanged', this._boundInvalidateChart);
            }
            if(this._debouncedResize) {
                $(window).off('resize', this._debouncedResize);
            }
            if(this.chart) {
                this.destroyChart();
            }
            if(this.settings) {
                this.settings.off();
                if(this.settings._sync) {
                    this.settings._sync.destroy();
                }
            }
            BaseSplunkView.prototype.remove.call(this);
        }
    });
    
    return ChartView;
});
