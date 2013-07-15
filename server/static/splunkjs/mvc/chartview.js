
define('util/jscharting_utils',['underscore', 'helpers/user_agent'], function(_, userAgent) {

    var VISIBLE_FIELD_REGEX = /^[^_]|^_time/,
        MAX_SERIES = 50,
        MAX_COLUMN_POINTS = (function() {
            if(!userAgent.isIE()) {
                return 5000;
            }
            if(!userAgent.isIELessThan(9)) {
                return 4000;
            }
            return 500;
        }()),
        MAX_LINE_POINTS = userAgent.isIELessThan(9) ? 2000 : 20000,
        MAX_CATEGORY_LABELS = (function() {
            if(!userAgent.isIE()) {
                return 200;
            }
            if(!userAgent.isIELessThan(9)) {
                return 150;
            }
            return 80;
        }());

    // sort of a "catch-all" method for adding display properties based on the data set and the web.conf config
    // this method is used by consumers of the JSCharting library to share custom logic that doesn't belong
    // in the library itself
    var getCustomDisplayProperties = function(chartData, webConfig) {
        webConfig = webConfig || {};
        var customProps = {};
        if(webConfig['JSCHART_TEST_MODE']) {
            customProps.testMode = true;
        }
        if(chartData.length > 0 && chartData.fieldAt(0) !== '_time' && chartData.seriesAt(0).length >= MAX_CATEGORY_LABELS) {
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

        // slice the number of series
        rawData = {
            columns: rawData.columns.slice(0, MAX_SERIES),
            fields: rawData.fields.slice(0, MAX_SERIES)
        };

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

define('splunkjs/mvc/chartview',['require','exports','module','underscore','backbone','jquery','./mvc','./basesplunkview','./messages','./drilldown','./utils','./settings','util/console','splunk.util','splunk.legend','util/jscharting_utils','splunk.config','jquery.ui.resizable'],function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var $ = require('jquery');
    var mvc = require("./mvc");
    var BaseSplunkView = require("./basesplunkview");
    var Messages = require("./messages");
    var Drilldown = require('./drilldown');
    var utils = require('./utils');
    var Settings = require('./settings');
    var console = require('util/console');
    var SplunkUtil = require('splunk.util');
    var SplunkLegend = require('splunk.legend');
    var jschartingUtils = require('util/jscharting_utils');
    var splunkConfig = require('splunk.config');
    var resizable = require('jquery.ui.resizable');
    var JSCharting;

    return BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-chart",
        chartOptionPrefix: 'charting.',

        options: {
            'height': 250,
            'drilldown': 'all',
            'data': 'preview',
            'type': 'column',
            'charting.drilldown': true
        },
        
        omitFromSettings: ['el', 'reportModel', 'drilldown'],

        configure: function() {
            BaseSplunkView.prototype.configure.apply(this, arguments);
            return this;
        },

        initialize: function() {
            this.configure();
            mvc.enableDynamicTokens(this.settings);
            this.model = this.options.reportModel || new Backbone.Model();
            this.settings._sync = utils.syncModels(this.settings, this.model, {
                auto: true,
                prefix: 'display.visualizations.',
                exclude: ['managerid','id','name','data', 'type']
            });

            this._currentHeight = this.settings.get('height');

            // initialize containers as detached DOM
            this.$chart = $('<div></div>');
            this.$msg = $('<div></div>');
            this.$inlineMsg = $('<div></div>');

            this.settings.on("change", this.render, this);
            var self = this;
            require(['js_charting/js_charting'], function(JSChartingLib){
                JSCharting = JSChartingLib;
                if(self._chartCreationPending) {
                    self._createChart();
                }
                self.createChart = self._createChart;
            });

            this.bindToComponent(this.options.managerid, this._onManagerChange, this);
            SplunkLegend.register(this.cid);
            this.enableResize();
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
            this._err = false;
            this.manager = manager;
            this.resultsModel = this.manager.data(this.settings.get("data"), {
                autofetch: true,
                output_mode: "json_cols",
                show_metadata: true, 
                count: 0
            });
            this.resultsModel.on("data", this._onDataChanged, this);
            manager.on("search:start", this._onSearchStart, this);
            manager.on("search:progress", this._onSearchProgress, this);
            manager.on("search:cancelled", this._onSearchCancelled, this);
            manager.on("search:fail", this._onSearchFailed, this);
            manager.on("search:error", this._onSearchError, this);
            manager.replayLastSearchEvent(this);
        },
        
        _onDataChanged: function() {
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
            var isJobDone = content.isDone || false;

            if (previewCount === 0 && isJobDone) {
                this.message('no-results');
                return;
            }
            
            if (previewCount === 0) {
                this.message('waiting');
            }

        },
        
        _onSearchCancelled: function() {
            this.message('cancelled');
        },
        
        _onSearchError: function(message, err) {
            this._err = true;
            var msg = message;
            if(err && err.data && err.data.messages && err.data.messages.length) {
                msg = _(err.data.messages).pluck('text').join('; ');
            }
            this.message({
                level: "warning",
                icon: "warning-sign",
                message: msg
            });
        },

        _onSearchFailed: function(state) {
            this._err = true;
            var msg = _('The search failed.').t();
            if(state && state.content && state.content.messages) {
                msg = _(state.content.messages).pluck('text')[0];
            }
            this.message({
                level: "warning",
                icon: "warning-sign",
                message: msg
            });
        },
        
        _onSearchStart: function() {
            this._err = false;
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
            this.$el.height(this._currentHeight).css('overflow-y', 'hidden');
            this.$msg.height(this._currentHeight).css('overflow-y', 'hidden');
            this.$chart.appendTo(this.$el);
            this.$inlineMsg.appendTo(this.$el);
            if (this.chart) {
                this.destroyChart();
                this.chart = null;
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

        enableResize: function() {
            if (!($.browser.safari && $.browser.version < "526")) {  // disable resizing for safari 3 and below only
                this.$el.resizable({autoHide: true, handles: "s", stop: this.onResizeStop.bind(this)});
                this.$el.mouseup(  // workaround until jquery ui is updated
                    function(event) {
                        $(this).width("100%");
                    }
                );
            }
        },

        onResizeStop: function(event, ui) {
            $(event.target).width("100%");
            this._currentHeight = this.$el.height();
            this.resizeChart();
        },

        _createChart: function() {
            // Initialize the chart with the type if it is there. If somebody
            // actually specified charting.chart, that option will win.
            var data = {'chart': this.settings.get("type")};
            
            // Copy over the settings for everything that starts with the 
            // prefix (charting.) by default.
            var prefix = this.chartOptionPrefix;
            _.each(this.settings.toJSON(), function(value, key){
                if(key.substring(0, prefix.length) == prefix) {
                    data[key.substring(prefix.length)] = value;
                }
            }, this);

            if(this._err) { return; }

            this.$msg.detach();
            console.log('creating chart with data: ', data);
            var chart = this.chart = JSCharting.createChart(this.$chart[0], data);
            chart.on('pointClick', this.emitDrilldownEvent.bind(this));
            chart.on('legendClick', this.emitDrilldownEvent.bind(this));
            chart.on('pointClick', this.chartClicked.bind(this));
            chart.on('legendClick', this.legendClicked.bind(this));
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
                    if(processedChartData.columns.length > 0 &&
                            (processedChartData.columns.length < this.chartData.columns.length ||
                                processedChartData.columns[0].length < this.chartData.columns[0].length)) {
                        this.inlineMessage({
                            level: 'warn',
                            message: _('Search generated too much data for the current display configuration, results may have been truncated.').t()
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
            this.chart.off();
            this.chart.destroy();
            clearTimeout(this._redrawChartTimeout);
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
                self.chart.draw();
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
            var data = mvc.Global.toJSON(),
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
            if (manager.job) {
                _.extend(data, {
                    earliest: manager.job.properties().searchEarliestTime,
                    latest: manager.job.properties().searchLatestTime
                });
            }
            this.trigger('drilldown', { field: e.name2 || e.name, data: data, event: e, defaultDrilldown: _(this.drilldown).bind(this, e) });
        },

        drilldown: function(clickInfo, target) {
            var drilldownType = SplunkUtil.normalizeBoolean(this.settings.get('charting.drilldown')) ? 'all' : 'none';
            Drilldown.handleDrilldown(clickInfo, drilldownType, this.manager, target);
        },

        chartClicked: function(e) {
            this.trigger("clicked:chart", e);
        },
        
        legendClicked: function(e) {
            this.trigger("clicked:legend", e);
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
});

define('js_charting/util/math_utils',['underscore', 'util/math_utils'], function(_, splunkMathUtils) {

    var HEX_REGEX = /^( )*(0x|-0x)/;

    // an extended version of parseFloat that will handle numbers encoded in hex format (i.e. "0xff")
    // and is stricter than native JavaScript parseFloat for decimal numbers
    var parseFloat = function(str) {
        // determine if the string is a hex number by checking if it begins with '0x' or '-0x',
        // in which case delegate to parseInt with a 16 radix
        if(HEX_REGEX.test(str)) {
            return parseInt(str, 16);
        }
        return splunkMathUtils.strictParseFloat(str);
    };

    // shortcut for base-ten log, also rounds to four decimal points of precision to make pretty numbers
    var logBaseTen = function(num) {
        var result = Math.log(num) / Math.LN10;
        return (Math.round(result * 10000) / 10000);
    };

    // transforms numbers to a normalized log scale that can handle negative numbers
    // rounds to four decimal points of precision
    var absLogBaseTen = function(num) {
        if(typeof num !== "number") {
            num = parseFloat(num);
        }
        if(_(num).isNaN()) {
            return num;
        }
        var isNegative = (num < 0),
            result;

        if(isNegative) {
            num = -num;
        }
        if(num < 10) {
            num += (10 - num) / 10;
        }
        result = logBaseTen(num);
        return (isNegative) ? -result : result;
    };

    // reverses the transformation made by absLogBaseTen above
    // rounds to three decimal points of precision
    var absPowerTen = function(num) {
        if(typeof num !== "number") {
            num = parseFloat(num);
        }
        if(_(num).isNaN()) {
            return num;
        }
        var isNegative = (num < 0),
            result;

        if(isNegative) {
            num = -num;
        }
        result = Math.pow(10, num);
        if(result < 10) {
            result = 10 * (result - 1) / (10 - 1);
        }
        result = (isNegative) ? -result : result;
        return (Math.round(result * 1000) / 1000);
    };

    // calculates the power of ten that is closest to but not greater than the number
    // negative numbers are treated as their absolute value and the sign of the result is flipped before returning
    var nearestPowerOfTen = function(num) {
        if(typeof num !== "number") {
            return NaN;
        }
        var isNegative = num < 0;
        num = (isNegative) ? -num : num;
        var log = logBaseTen(num),
            result = Math.pow(10, Math.floor(log));

        return (isNegative) ? -result: result;
    };

    var roundWithMin = function(value, min) {
        return Math.max(Math.round(value), min);
    };

    var roundWithMinMax = function(value, min, max) {
        var roundVal = Math.round(value);
        if(roundVal < min) {
            return min;
        }
        if(roundVal > max) {
            return max;
        }
        return roundVal;
    };

    var degreeToRadian = function(degree) {
        return (degree * Math.PI) / 180;
    };

    // returns the number of digits of precision after the decimal point
    // optionally accepts a maximum number, after which point it will stop looking and return the max
    var getDecimalPrecision = function(num, max) {
        max = max || Infinity;
        var precision = 0;

        while(precision < max && num.toFixed(precision) !== num.toString()) {
            precision += 1;
        }

        return precision;
    };

    return ({

        parseFloat: parseFloat,
        logBaseTen: logBaseTen,
        absLogBaseTen: absLogBaseTen,
        absPowerTen: absPowerTen,
        nearestPowerOfTen: nearestPowerOfTen,
        roundWithMin: roundWithMin,
        roundWithMinMax: roundWithMinMax,
        degreeToRadian: degreeToRadian,
        getDecimalPrecision: getDecimalPrecision

    });

});
define('js_charting/helpers/DataSet',['jquery', 'underscore', '../util/math_utils'], function($, _, mathUtils) {

    var DataSet = function(data) {
        var fields = data.fields || {};
        var series = data.columns || {};

        this.fields = [];
        this.seriesList = [];
        this.fieldMetadata = {};

        _(fields).each(function(field, i) {
            var fieldName;
            if(_.isObject(field)) {
                fieldName = field.name;
                this.fieldMetadata[fieldName] = field;
            }
            else {
                fieldName = field;
            }
            if(($.inArray(fieldName, this.ALLOWED_HIDDEN_FIELDS) > -1) || this.isDataField(fieldName)){
                this.fields.push(fieldName);
                this.seriesList.push($.extend([], series[i]));
            }
        }, this);
        this.length = this.fields.length;

        // create an instance-specific memoized copy of getSeriesAsFloats
        this.getSeriesAsFloats = _.memoize(this.getSeriesAsFloats, this.seriesAsFloatsMemoizeHash);
    };

    DataSet.prototype = {

        ALLOWED_HIDDEN_FIELDS: ['_span', '_lower', '_predicted', '_upper', '_tc'],
        DATA_FIELD_REGEX: /^[^_]|^_time/,

        allDataFields: function() {
            return _(this.fields).filter(this.isDataField, this);
        },

        isDataField: function(field){
            return this.DATA_FIELD_REGEX.test(field);
        },

        isTotalValue: function(value) {
            return (value === 'ALL');
        },

        hasField: function(name) {
            return (_(this.fields).indexOf(name) > -1);
        },

        fieldAt: function(index) {
            return this.fields[index];
        },

        fieldIsGroupby: function(name) {
            return (this.fieldMetadata[name] && this.fieldMetadata[name].hasOwnProperty('groupby_rank'));
        },

        seriesAt: function(index) {
            return this.seriesList[index];
        },

        getSeries: function(name) {
            var index = _(this.fields).indexOf(name);
            if(index === -1) {
                return [];
            }
            return this.seriesList[index];

        },

        getSeriesAsFloats: function(name, options) {
            options = options || {};
            var series = this.getSeries(name),
                nullsToZero = options.nullValueMode === 'zero',
                logScale = options.scale === 'log',
                asFloats = [];

            for(var i = 0; i < series.length; i++) {
                var floatVal = mathUtils.parseFloat(series[i]);
                if(_.isNaN(floatVal)) {
                    asFloats.push(nullsToZero ? 0 : null);
                    continue;
                }
                asFloats.push(logScale ? mathUtils.absLogBaseTen(floatVal) : floatVal);
            }
            return asFloats;
        },

        // this is a targeted fix for the case where the back-end adds an 'ALL' data point to the end of a time series
        // but could be expanded into a more generic handler as we grow into it
        getSeriesAsTimestamps: function(name) {
            var series = this.getSeries(name);
            if(this.isTotalValue(_(series).last())) {
                return series.slice(0, -1);
            }
            return series;
        },

        seriesAsFloatsMemoizeHash: function(name, options) {
            options = options || {};
            return name + options.scale + options.nullValueMode;
        }

    };

    return DataSet;

});
define('js_charting/util/dom_utils',['jquery', 'underscore'], function($, _) {

    // this is copied from the Highcharts source
    var hasSVG = !!document.createElementNS && !!document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect;

    // set up some aliases for jQuery 'on' that will work in older versions of jQuery
    var jqOn = _($.fn.on).isFunction() ? $.fn.on : $.fn.bind;
    var jqOff = _($.fn.off).isFunction() ? $.fn.off : $.fn.unbind;

    // a cross-renderer way to update a legend item's text content
    var setLegendItemText = function(legendItem, text) {
        if(legendItem.attr('text') === text) {
            return;
        }
        legendItem.added = true; // the SVG renderer needs this
        legendItem.attr({text: text});
    };

    var hideTickLabel = function(tick) {
        var label = tick.label,
            nodeName = tick.label.element.nodeName.toLowerCase();

        if(nodeName === 'text') {
            label.hide();
        }
        else {
            $(label.element).hide();
        }
    };

    var showTickLabel = function(tick) {
        var label = tick.label,
            nodeName = tick.label.element.nodeName.toLowerCase();

        if(nodeName === 'text') {
            label.show();
        }
        else {
            $(label.element).show();
        }
    };

    return ({

        hasSVG: hasSVG,
        jQueryOn: jqOn,
        jQueryOff: jqOff,
        setLegendItemText: setLegendItemText,
        hideTickLabel: hideTickLabel,
        showTickLabel: showTickLabel

    });

});
define('js_charting/helpers/EventMixin',['jquery', '../util/dom_utils'], function($, domUtils) {

    return ({

        on: function(eventType, callback) {
            domUtils.jQueryOn.call($(this), eventType, callback);
        },

        off: function(eventType, callback) {
            domUtils.jQueryOff.call($(this), eventType, callback);
        },

        trigger: function(eventType, extraParams) {
            $(this).trigger(eventType, extraParams);
        }

    });

});
define('js_charting/util/color_utils',['underscore', 'splunk.util'], function(_, splunkUtils) {

    // converts a hex number to its css-friendly counterpart, with optional alpha transparency field
    // returns null if the input is cannot be parsed to a valid number or if the number is out of range
    var colorFromHex = function(hexNum, alpha) {
        if(typeof hexNum !== 'number') {
            hexNum = parseInt(hexNum, 16);
        }
        if(_(hexNum).isNaN() || hexNum < 0x000000 || hexNum > 0xffffff) {
            return null;
        }
        var r = (hexNum & 0xff0000) >> 16,
            g = (hexNum & 0x00ff00) >> 8,
            b = hexNum & 0x0000ff;

        return ((alpha === undefined) ? ('rgb(' + r + ',' + g + ',' + b + ')')
            : ('rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'));
    };

    // converts an rgba value to rgb by stripping out the alpha.  willl return the unchanged parameter
    // if an rgb value is passed rather than rgba
    var stripOutAlpha = function(color){
        var rgb       = color.split(','),
            thirdChar = rgb[0].charAt(3);

        if(thirdChar === 'a'){
            rgb[0] = rgb[0].replace('rgba','rgb');
            rgb[(rgb.length -1)] = ')';
            rgb = rgb.join();
            rgb = rgb.replace(',)',')');
            return rgb;
        }
        return color;
    };

    // coverts a color string in either hex (must be long form) or rgb format into its corresponding hex number
    // returns zero if the color string can't be parsed as either format
    // TODO: either add support for short form or emit an error
    var hexFromColor = function(color) {
        var normalizedColor = splunkUtils.normalizeColor(color);
        return (normalizedColor) ? parseInt(normalizedColor.replace('#', '0x'), 16) : 0;
    };

    // given a color string (in long-form hex or rgb form) or a hex number,
    // formats the color as an rgba string with the given alpha transparency
    // TODO: currently fails somewhat silently if an un-parseable or out-of-range input is given
    var addAlphaToColor = function(color, alpha) {
        var colorAsHex = (typeof color === 'number') ? color : hexFromColor(color);
        return colorFromHex(colorAsHex, alpha);
    };

    // calculate the luminance of a color based on its hex value
    // returns zero if the input is cannot be parsed to a valid number or if the number is out of range
    // equation for luminance found at http://en.wikipedia.org/wiki/Luma_(video)
    var getLuminance = function(hexNum) {
        if(typeof hexNum !== "number") {
            hexNum = parseInt(hexNum, 16);
        }
        if(isNaN(hexNum) || hexNum < 0x000000 || hexNum > 0xffffff) {
            return 0;
        }
        var r = (hexNum & 0xff0000) >> 16,
            g = (hexNum & 0x00ff00) >> 8,
            b = hexNum & 0x0000ff;

        return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    };

    return ({

        colorFromHex: colorFromHex,
        stripOutAlpha: stripOutAlpha,
        hexFromColor: hexFromColor,
        addAlphaToColor: addAlphaToColor,
        getLuminance: getLuminance

    });

});
define('js_charting/util/parsing_utils',['underscore', 'splunk.util'], function(_, splunkUtils) {

    // normalize a boolean, a default state can optionally be defined for when the value is undefined
    var normalizeBoolean = function(value, defaultState) {
        if(_(value).isUndefined()) {
            return !!defaultState;
        }
        return splunkUtils.normalizeBoolean(value);
    };

    // translates a JSON-style serialized map in to a primitive object
    // cannot handle nested objects
    // value strings should be un-quoted or double-quoted and will be stripped of leading/trailing whitespace
    // will not cast to numbers or booleans
    var stringToObject = function(str) {
        if(!str) {
            return false;
        }
        var i, propList, loopKv, loopKey,
            map = {};

        str = trimWhitespace(str);
        var strLen = str.length;
        if(str.charAt(0) !== '{' || str.charAt(strLen - 1) !== '}') {
            return false;
        }

        if(/^\{\s*\}$/.test(str)) {
            return {};
        }
        str = str.substr(1, strLen - 2);
        propList = escapeSafeSplit(str, ',');
        for(i = 0; i < propList.length; i++) {
            loopKv = escapeSafeSplit(propList[i], ':');
            loopKey = trimWhitespace(loopKv[0]);
            if(loopKey[0] === '"') {
                loopKey = loopKey.substring(1);
            }
            if(_(loopKey).last() === '"') {
                loopKey = loopKey.substring(0, loopKey.length - 1);
            }
            loopKey = unescapeChars(loopKey, ['{', '}', '[', ']', '(', ')', ',', ':', '"']);
            map[loopKey] = trimWhitespace(loopKv[1]);
        }
        return map;
    };

    // translates a JSON-style serialized list in to a primitive array
    // cannot handle nested arrays
    var stringToArray = function(str) {
        if(!str) {
            return false;
        }
        str = trimWhitespace(str);
        var strLen = str.length;

        if(str.charAt(0) !== '[' || str.charAt(strLen - 1) !== ']') {
            return false;
        }
        if(/^\[\s*\]$/.test(str)) {
            return [];
        }
        str = str.substr(1, strLen - 2);
        return splunkUtils.stringToFieldList(str);
    };

    // TODO: replace with $.trim
    var trimWhitespace = function(str) {
        return str.replace(/^\s*/, '').replace(/\s*$/, '');
    };

    var escapeSafeSplit = function(str, delimiter, escapeChar) {
        escapeChar = escapeChar || '\\';
        var unescapedPieces = str.split(delimiter),
        // the escaped pieces list initially contains the first element of the unescaped pieces list
        // we use shift() to also remove that element from the unescaped pieces
            escapedPieces = [unescapedPieces.shift()];

        // now loop over the remaining unescaped pieces
        // if the last escaped piece ends in an escape character, perform a concatenation to undo the split
        // otherwise append the new piece to the escaped pieces list
        _(unescapedPieces).each(function(piece) {
            var lastEscapedPiece = _(escapedPieces).last();
            if(_(lastEscapedPiece).last() === escapeChar) {
                escapedPieces[escapedPieces.length - 1] += (delimiter + piece);
            }
            else {
                escapedPieces.push(piece);
            }
        });
        return escapedPieces;
    };

    var unescapeChars = function(str, charList) {
        _(charList).each(function(chr) {
            // looks weird, but the first four slashes add a single escaped '\' to the regex
            // and the next two escape the character itself within the regex
            var regex = new RegExp('\\\\\\' + chr, 'g');
            str = str.replace(regex, chr);
        });
        return str;
    };

    // this will be improved to do some SVG-specific escaping
    var escapeHtml = function(input){
        return splunkUtils.escapeHtml(input);
    };

    var escapeSVG = function(input) {
        return ("" + input).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    var stringToHexArray = function(colorStr) {
        var i, hexColor,
            colors = stringToArray(colorStr);

        if(!colors) {
            return false;
        }
        for(i = 0; i < colors.length; i++) {
            hexColor = parseInt(colors[i], 16);
            if(isNaN(hexColor)) {
                return false;
            }
            colors[i] = hexColor;
        }
        return colors;
    };

    // a simple utility method for comparing arrays, assumes one-dimensional arrays of primitives,
    // performs strict comparisons
    var arraysAreEquivalent = function(array1, array2) {
        // make sure these are actually arrays
        if(!(array1 instanceof Array) || !(array2 instanceof Array)) {
            return false;
        }
        if(array1 === array2) {
            // true if they are the same object
            return true;
        }
        if(array1.length !== array2.length) {
            // false if they are different lengths
            return false;
        }
        // false if any of their elements don't match
        for(var i = 0; i < array1.length; i++) {
            if(array1[i] !== array2[i]) {
                return false;
            }
        }
        return true;
    };

    var getLegendProperties = function(properties) {
        var remapped = {},
            legendProps = filterPropsByRegex(properties, /legend[.]/);

        _(legendProps).each(function(value, key) {
            remapped[key.replace(/^legend[.]/, '')] = value;
        });
        return remapped;
    };

    // returns a map of properties that apply either to the x-axis or to x-axis labels
    // all axis-related keys are renamed to 'axis' and all axis-label-related keys are renamed to 'axisLabels'
    var getXAxisProperties = function(properties) {
        var key, newKey,
            remapped = {},
            axisProps = filterPropsByRegex(properties, /(axisX|primaryAxis|axisLabelsX|axisTitleX|gridLinesX)/);
        for(key in axisProps) {
            if(axisProps.hasOwnProperty(key)) {
                if(!xAxisKeyIsTrumped(key, properties)) {
                    newKey = key.replace(/(axisX|primaryAxis)/, "axis");
                    newKey = newKey.replace(/axisLabelsX/, "axisLabels");
                    newKey = newKey.replace(/axisTitleX/, "axisTitle");
                    newKey = newKey.replace(/gridLinesX/, "gridLines");
                    remapped[newKey] = axisProps[key];
                }
            }
        }
        return remapped;
    };

    // checks if the given x-axis key is deprecated, and if so returns true if that key's
    // non-deprecated counterpart is set in the properties map, otherwise returns false
    var xAxisKeyIsTrumped = function(key, properties) {
        if(!(/primaryAxis/.test(key))) {
            return false;
        }
        if(/primaryAxisTitle/.test(key)) {
            return properties[key.replace(/primaryAxisTitle/, "axisTitleX")];
        }
        return properties[key.replace(/primaryAxis/, "axisX")];
    };

    // returns a map of properties that apply either to the y-axis or to y-axis labels
    // all axis-related keys are renamed to 'axis' and all axis-label-related keys are renamed to 'axisLabels'
    var getYAxisProperties = function(properties) {
        var key, newKey,
            remapped = {},
            axisProps = filterPropsByRegex(properties, /(axisY|secondaryAxis|axisLabelsY|axisTitleY|gridLinesY)/);
        for(key in axisProps) {
            if(axisProps.hasOwnProperty(key)) {
                if(!yAxisKeyIsTrumped(key, properties)) {
                    newKey = key.replace(/(axisY|secondaryAxis)/, "axis");
                    newKey = newKey.replace(/axisLabelsY/, "axisLabels");
                    newKey = newKey.replace(/axisTitleY/, "axisTitle");
                    newKey = newKey.replace(/gridLinesY/, "gridLines");
                    remapped[newKey] = axisProps[key];
                }
            }
        }
        return remapped;
    };

    // checks if the given y-axis key is deprecated, and if so returns true if that key's
    // non-deprecated counterpart is set in the properties map, otherwise returns false
    var yAxisKeyIsTrumped = function(key, properties) {
        if(!(/secondaryAxis/.test(key))) {
            return false;
        }
        if(/secondaryAxisTitle/.test(key)) {
            return properties[key.replace(/secondaryAxisTitle/, "axisTitleY")];
        }
        return properties[key.replace(/secondaryAxis/, "axisY")];
    };

    // uses the given regex to filter out any properties whose key doesn't match
    // will return an empty object if the props input is not a map
    var filterPropsByRegex = function(props, regex) {
        if(!(regex instanceof RegExp)) {
            return props;
        }
        var key,
            filtered = {};

        for(key in props) {
            if(props.hasOwnProperty(key) && regex.test(key)) {
                filtered[key] = props[key];
            }
        }
        return filtered;
    };

    return ({

        normalizeBoolean: normalizeBoolean,
        stringToObject: stringToObject,
        stringToArray: stringToArray,
        trimWhitespace: trimWhitespace,
        escapeSafeSplit: escapeSafeSplit,
        unescapeChars: unescapeChars,
        escapeHtml: escapeHtml,
        escapeSVG: escapeSVG,
        stringToHexArray: stringToHexArray,
        arraysAreEquivalent: arraysAreEquivalent,
        getLegendProperties: getLegendProperties,
        getXAxisProperties: getXAxisProperties,
        xAxisKeyIsTrumped: xAxisKeyIsTrumped,
        getYAxisProperties: getYAxisProperties,
        yAxisKeyIsTrumped: yAxisKeyIsTrumped,
        filterPropsByRegex: filterPropsByRegex

    });

});
define('js_charting/visualizations/Visualization',[
            'jquery',
            'underscore',
            '../helpers/EventMixin',
            '../util/color_utils',
            '../util/parsing_utils'
        ], 
        function(
            $,
            _,
            EventMixin, 
            colorUtils,
            parsingUtils
        ) {

    var Visualization = function(container, properties) {
        this.container = container;
        this.$container = $(container);
        this.properties = $.extend(true, {}, properties);
        this.id = _.uniqueId('viz_');
        this.updateDimensions();
        // used for performance profiling
        this.benchmarks = [];
    };

    Visualization.prototype = $.extend({}, EventMixin, {

        requiresExternalColors: false,

        getWidth: function() {
            return this.$container.width();
        },

        getHeight: function() {
            return this.$container.height();
        },

        getCurrentDisplayProperties: function() {
            return this.properties;
        },

        updateDimensions: function() {
            this.width = this.getWidth();
            this.height = this.getHeight();
        },

        getClassName: function() {
            return (this.type + '-chart');
        },

        prepare: function(dataSet, properties) {
            // properties is an optional parameter, will layer on top of
            // the properties passed to the constructor
            if(properties) {
                $.extend(true, this.properties, properties);
            }
            this.dataSet = dataSet;
            this.processProperties();
        },

        prepareAndDraw: function(dataSet, properties, callback) {
            this.prepare(dataSet, properties);
            this.draw(callback);
        },

        requiresExternalColorPalette: function() {
            return this.requiresExternalColors;
        },

        processProperties: function() {
            this.type = this.properties['chart'] || 'column';

            // set up the color skinning
            this.backgroundColor = this.properties['chart.backgroundColor']
                || this.properties['backgroundColor'] || 'rgb(255, 255, 255)';
            this.foregroundColor = this.properties['chart.foregroundColor']
                || this.properties['foregroundColor'] || 'rgb(0, 0, 0)';
            this.fontColor = this.properties['chart.fontColor'] || this.properties['fontColor'] || 'rgb(0, 0, 0)';
            this.foregroundColorSoft = colorUtils.addAlphaToColor(this.foregroundColor, 0.25);
            this.foregroundColorSofter = colorUtils.addAlphaToColor(this.foregroundColor, 0.15);

            // handle special modes
            this.testMode = (parsingUtils.normalizeBoolean(this.properties['chart.testMode'])
                || parsingUtils.normalizeBoolean(this.properties['testMode']));
            this.exportMode = (parsingUtils.normalizeBoolean(this.properties['chart.exportMode'])
                || parsingUtils.normalizeBoolean(this.properties['exportMode']));
        },

        resize: function() {
            var oldWidth = this.width,
                oldHeight = this.height;

            this.updateDimensions();
            if(this.width === oldWidth && this.height === oldHeight) {
                return;
            }
            this.setSize(this.width, this.height);
        },

        // stub methods to be overridden by sub-classes
        draw: function() { },
        destroy: function() { },
        getSVG: function() { },

        // this method is a no-op if we're not in test mode, otherwise adds an entry to the list of benchmarks
        benchmark: function(name) {
            if(!this.testMode) {
                return;
            }
            if(this.benchmarks.length === 0) {
                this.benchmarks.push([name, (new Date()).getTime()]);
            }
            else {
                var lastTimestamp = _(this.benchmarks).reduce(function(time, mark) { return time + mark[1]; }, 0);
                this.benchmarks.push([name, (new Date()).getTime() - lastTimestamp]);
            }
        }

    });

    return Visualization;

});
define('js_charting/components/ColorPalette',['../util/parsing_utils', '../util/color_utils'], function(parsingUtils, colorUtils) {

    var ColorPalette = function(colors, useInterpolation) {
        this.setColors(colors);
        this.useInterpolation = parsingUtils.normalizeBoolean(useInterpolation, false);
    };

    ColorPalette.prototype = {

        setColors: function(colors) {
            this.colors = colors || this.BASE_COLORS;
        },

        getColor: function(field, index, count) {
            var p, index1, index2,
                numColors = this.colors.length;

            if(numColors === 0) {
                return 0x000000;
            }
            if(index < 0) {
                index = 0;
            }
            if(!this.useInterpolation) {
                return this.colors[index % numColors];
            }
            if (count < 1) {
                count = 1;
            }
            if (index > count) {
                index = count;
            }
            p = (count === 1) ? 0 : (numColors - 1) * (index / (count - 1));
            index1 = Math.floor(p);
            index2 = Math.min(index1 + 1, numColors - 1);
            p -= index1;

            return this.interpolateColors(this.colors[index1], this.colors[index2], p);
        },

        getColorAsRgb: function(field, index, count) {
            var hexColor = this.getColor(field, index, count);
            return colorUtils.colorFromHex(hexColor);
        },

        interpolateColors: function(color1, color2, p) {
            var r1 = (color1 >> 16) & 0xFF,
                g1 = (color1 >> 8) & 0xFF,
                b1 = color1 & 0xFF,

                r2 = (color2 >> 16) & 0xFF,
                g2 = (color2 >> 8) & 0xFF,
                b2 = color2 & 0xFF,

                rInterp = r1 + Math.round((r2 - r1) * p),
                gInterp = g1 + Math.round((g2 - g1) * p),
                bInterp = b1 + Math.round((b2 - b1) * p);

            return ((rInterp << 16) | (gInterp << 8) | bInterp);
        },

        BASE_COLORS: [
            0x6BB7C8,
            0xFAC61D,
            0xD85E3D,
            0x956E96,
            0xF7912C,
            0x9AC23C,
            0x998C55,
            0xDD87B0,
            0x5479AF,
            0xE0A93B,
            0x6B8930,
            0xA04558,
            0xA7D4DF,
            0xFCDD77,
            0xE89E8B,
            0xBFA8C0,
            0xFABD80,
            0xC2DA8A,
            0xC2BA99,
            0xEBB7D0,
            0x98AFCF,
            0xECCB89,
            0xA6B883,
            0xC68F9B,
            0x416E79,
            0x967711,
            0x823825,
            0x59425A,
            0x94571A,
            0x5C7424,
            0x5C5433,
            0x85516A,
            0x324969,
            0x866523,
            0x40521D,
            0x602935
        ]

    };

    return ColorPalette;

});
define('js_charting/components/axes/Axis',[
            'jquery',
            'underscore',
            '../../util/parsing_utils',
            '../../util/dom_utils',
            'util/console'
        ],
        function(
            $,
            _,
            parsingUtils,
            domUtils,
            console
        ) {

    var AxisBase = function(properties) {
        this.properties = properties || {};
        this.id = _.uniqueId('axis_');
        this.isVertical = this.properties['axis.orientation'] === 'vertical';
    };

    AxisBase.prototype = {

        clone: function() {
            return (new this.constructor($.extend(true, {}, this.properties)));
        },

        getConfig: function() {
            var titleText = null,
                that = this;

            if(this.properties['axisTitle.visibility'] !== 'collapsed' && this.properties.hasOwnProperty('axisTitle.text') && !(/^\s+$/.test(this.properties['axisTitle.text']))) {
                titleText = parsingUtils.escapeSVG(this.properties['axisTitle.text']);
            }

            return $.extend(true, this.getOrientationDependentConfig(), {
                id: this.id,
                labels: {
                    enabled: (this.properties['axisLabels.majorLabelVisibility'] !== 'hide'),
                    formatter: function() {
                        var formatInfo = this;
                        return that.formatLabel(formatInfo);
                    },
                    style: {
                        color: this.properties['axis.fontColor'] || '#000000'
                    }
                },
                title: {
                    style: {
                        color: this.properties['axis.fontColor'] || '#000000'
                    },
                    text: titleText
                },

                lineColor: this.properties['axis.foregroundColorSoft'] || '#000000',
                lineWidth: (this.properties['axisLabels.axisVisibility'] === 'hide') ? 0 : 1,
                gridLineColor: this.properties['axis.foregroundColorSofter'] || '#000000',

                tickColor: this.properties['axis.foregroundColorSoft'] || '#000000',
                tickLength: parseInt(this.properties['axisLabels.majorTickSize'], 10) || 25,
                tickWidth: (this.properties['axisLabels.majorTickVisibility'] === 'hide') ? 0 : 1 ,
                tickRenderPostHook: _(this.tickRenderPostHook).bind(this),
                tickHandleOverflowOverride: _(this.tickHandleOverflowOverride).bind(this)
            });
        },

        getOrientationDependentConfig: function() {
            if(this.isVertical) {
                return $.extend(true, {}, this.BASE_VERT_CONFIG, this.getVerticalConfig());
            }
            return $.extend(true, {}, this.BASE_HORIZ_CONFIG, this.getHorizontalConfig());
        },

        onChartLoad: function(chart) {
            this.hcAxis = chart.get(this.id);
            this.initializeTicks();
        },

        // convert the ticks to an array in ascending order by 'pos'
        initializeTicks: function() {
            var key,
                ticks = this.hcAxis.ticks,
                tickArray = [];

            for(key in ticks) {
                if(ticks.hasOwnProperty(key)) {
                    tickArray.push(ticks[key]);
                }
            }
            tickArray.sort(function(t1, t2) {
                return (t1.pos - t2.pos);
            });
            this.ticks = tickArray;
        },

        tickRenderPostHook: function(tick, index, old) {
            if(!tick.label) {
                return;
            }
            if(!tick.handleOverflow(index, tick.label.xy)) {
                domUtils.hideTickLabel(tick);
            }
            else {
                domUtils.showTickLabel(tick);
            }
        },

        tickHandleOverflowOverride: function(tick, index, xy) {
            if(tick.isFirst) {
                return this.handleFirstTickOverflow(tick, index, xy);
            }
            var axis = tick.axis,
                axisOptions = axis.options,
                numTicks = axis.tickPositions.length - (axisOptions.tickmarkPlacement === 'between' ? 0 : 1),
                labelStep = axisOptions.labels.step || 1;

            // take the label step into account when identifying the last visible label
            if(tick.isLast || index === (numTicks - (numTicks % labelStep))) {
                return this.handleLastTickOverflow(tick, index, xy);
            }
            return true;
        },

        handleFirstTickOverflow: function(tick, index, xy) {
            // if the axis is horizontal or reversed, the first label is oriented such that it can't overflow
            var axis = tick.axis;
            if(axis.horiz || axis.reversed) {
                return true;
            }
            var labelBottom = this.getTickLabelExtremesY(tick)[1],
                axisBottom = axis.top + axis.len;

            return (xy.y + labelBottom <= axisBottom);
        },

        handleLastTickOverflow: function(tick, index, xy) {
            var axis = tick.axis;
            // if the axis is vertical and not reversed, the last label is oriented such that it can't overflow
            if(!axis.horiz && !axis.reversed) {
                return true;
            }
            // handle the horizontal axis case
            if(axis.horiz) {
                var axisRight = axis.left + axis.len,
                    labelRight = this.getTickLabelExtremesX(tick)[1];

                return (xy.x + labelRight <= axisRight);
            }

            // handle the reversed vertical axis case
            var labelBottom = this.getTickLabelExtremesY(tick)[1],
                axisBottom = axis.top + axis.len;

            return (xy.y + labelBottom <= axisBottom);
        },

        getTickLabelExtremesX: function(tick) {
            return tick.getLabelSides();
        },

        getTickLabelExtremesY: function(tick) {
            var labelTop = -(tick.axis.options.labels.y / 2);
            return [labelTop, labelTop + tick.labelBBox.height];
        },

        destroy: function() {
            this.hcAxis = null;
        },

        onChartLoadOrResize: function() { },
        getVerticalConfig: function() { return {}; },
        getHorizontalConfig: function() { return {}; },

        BASE_HORIZ_CONFIG: {
            title: {
                margin: 8
            }
        },

        BASE_VERT_CONFIG: { }

    };

    return AxisBase;
    
});
define('js_charting/helpers/Formatter',['jquery', '../util/dom_utils'], function($, domUtils) {

    var Formatter = function(renderer) {
        this.renderer = renderer;
        this.hasSVG = domUtils.hasSVG;
    };

    Formatter.prototype = {

        ellipsize: function(text, width, fontSize, mode) {
            if(text.length <= 3) {
                return text;
            }
            if(!width || isNaN(parseFloat(width, 10))) {
                return "...";
            }
            if(!fontSize || isNaN(parseFloat(fontSize, 10))) {
                return text;
            }
            if(this.predictTextWidth(text, fontSize) <= width) {
                return text;
            }
            // memoize the width of the ellipsis
            if(!this.ellipsisWidth) {
                this.ellipsisWidth = this.predictTextWidth("...", fontSize);
            }
            switch(mode) {
                case 'start':
                    var reversedText = this.reverseString(text),
                        reversedTrimmed = this.trimStringToWidth(reversedText, (width - this.ellipsisWidth), fontSize);
                    return "..." + this.reverseString(reversedTrimmed);
                case 'end':
                    return this.trimStringToWidth(text, (width - this.ellipsisWidth), fontSize) + "...";
                default:
                    // default to middle ellipsization
                    var firstHalf = text.substr(0, Math.ceil(text.length / 2)),
                        secondHalf = text.substr(Math.floor(text.length / 2)),
                        halfFitWidth = (width - this.ellipsisWidth) / 2,
                        secondHalfReversed = this.reverseString(secondHalf),
                        firstHalfTrimmed = this.trimStringToWidth(firstHalf, halfFitWidth, fontSize),
                        secondHalfTrimmedReversed = this.trimStringToWidth(secondHalfReversed, halfFitWidth, fontSize);

                    return firstHalfTrimmed + "..." + this.reverseString(secondHalfTrimmedReversed);
            }
        },

        // NOTE: it is up to caller to test that the entire string does not already fit
        // even if it does, this method will do log N work and may or may not truncate the last character
        trimStringToWidth: function(text, width, fontSize) {
            var that = this,
                binaryFindEndIndex = function(start, end) {
                    var testIndex;
                    while(end > start + 1) {
                        testIndex = Math.floor((start + end) / 2);
                        if(that.predictTextWidth(text.substr(0, testIndex), fontSize) > width) {
                            end = testIndex;
                        }
                        else {
                            start = testIndex;
                        }
                    }
                    return start;
                },
                endIndex = binaryFindEndIndex(0, text.length);

            return text.substr(0, endIndex);
        },

        reverseString: function(str) {
            return str.split("").reverse().join("");
        },

        predictTextWidth: function(text, fontSize) {
            if(!fontSize || !text) {
                return 0;
            }
            var bBox = (this.getTextBBox(text, fontSize));
            return (bBox) ? bBox.width : 0;
        },

        predictTextHeight: function(text, fontSize) {
            if(!fontSize || !text) {
                return 0;
            }
            var bBox = (this.getTextBBox(text, fontSize));
            return (bBox) ? bBox.height : 0;
        },

        getTextBBox: function(text, fontSize) {
            if(isNaN(parseFloat(fontSize, 10))) {
                return undefined;
            }
            if(this.textPredicter) {
                this.textPredicter.destroy();
            }
            this.textPredicter = this.renderer.text(text, 0, 0)
                .attr({
                    visibility: 'hidden'
                })
                .css({
                    fontSize: fontSize + 'px'
                })
                .add();

            return this.textPredicter.getBBox();
        },

        adjustLabels: function(originalLabels, width, minFont, maxFont, ellipsisMode) {
            var i, fontSize, shouldEllipsize,
                labels = $.extend(true, [], originalLabels),
                maxWidths = this.getMaxWidthForFontRange(labels, minFont, maxFont);

            // adjust font and try to fit longest
            if(maxWidths[maxFont] <= width) {
                shouldEllipsize = false;
                fontSize = maxFont;
            }
            else {
                shouldEllipsize = true;
                for(fontSize = maxFont - 1; fontSize > minFont; fontSize--) {
                    if(maxWidths[fontSize] <= width) {
                        shouldEllipsize = false;
                        break;
                    }
                }
            }

            if(shouldEllipsize && ellipsisMode !== 'none') {
                for(i = 0; i < labels.length; i++) {
                    labels[i] = this.ellipsize(labels[i], width, fontSize, ellipsisMode);
                }
            }
            return {
                labels: labels,
                fontSize: fontSize,
                areEllipsized: shouldEllipsize,
                longestWidth: maxWidths[fontSize]
            };
        },

        getMaxWidthForFontRange: function(labels, minFont, maxFont) {
            var longestLabelIndex,
                fontSizeToWidthMap = {};

            // find the longest label
            fontSizeToWidthMap[minFont] = 0;
            for(var i = 0; i < labels.length; i++) {
                var labelLength = this.predictTextWidth(labels[i] || '', minFont);
                if(labelLength > fontSizeToWidthMap[minFont]) {
                    longestLabelIndex = i;
                    fontSizeToWidthMap[minFont] = labelLength;
                }
            }
            // fill in the widths for the rest of the font sizes
            for(var fontSize = minFont + 1; fontSize <= maxFont; fontSize++) {
                fontSizeToWidthMap[fontSize] = this.predictTextWidth(labels[longestLabelIndex] || '', fontSize);
            }
            return fontSizeToWidthMap;
        },

        bBoxesOverlap: function(bBox1, bBox2, marginX, marginY) {
            marginX = marginX || 0;
            marginY = marginY || 0;
            var box1Left = bBox1.x - marginX,
                box2Left = bBox2.x - marginX,
                box1Right = bBox1.x + bBox1.width + 2 * marginX,
                box2Right = bBox2.x + bBox2.width + 2 * marginX,
                box1Top = bBox1.y - marginY,
                box2Top = bBox2.y - marginY,
                box1Bottom = bBox1.y + bBox1.height + 2 * marginY,
                box2Bottom = bBox2.y + bBox2.height + 2 * marginY;

            return ((box1Left < box2Right) && (box1Right > box2Left)
                && (box1Top < box2Bottom) && (box1Bottom > box2Top));
        },

        destroy: function() {
            if(this.textPredicter) {
                this.textPredicter.destroy();
                this.textPredicter = false;
            }
        }

    };

    $.extend(Formatter, {

        // a cross-renderer way to read out an wrapper's element text content
        getElementText: function(wrapper) {
            return (domUtils.hasSVG) ? wrapper.textStr : $(wrapper.element).html();
        },

        // a cross-renderer way to update an wrapper's element text content
        setElementText: function(wrapper, text) {
            if(wrapper.attr('text') === text) {
                return;
            }
            wrapper.added = true; // the SVG renderer needs this
            wrapper.attr({text: text});
        }

    });

    return Formatter;

});
define('js_charting/util/lang_utils',[],function() {

    // very simple inheritance helper to set up the prototype chain
    var inherit = function(child, parent) {
        var F = function() { };
        F.prototype = parent.prototype;
        child.prototype = new F();
        child.prototype.constructor = child;
    };

    return ({

        inherit: inherit

    });

});
define('js_charting/components/axes/CategoryAxis',[
            'jquery',
            'underscore',
            './Axis',
            '../../helpers/Formatter',
            '../../util/lang_utils',
            '../../util/parsing_utils'
        ],
        function(
            $,
            _,
            Axis,
            Formatter,
            langUtils,
            parsingUtils
        ) {

    var CategoryAxis = function(properties) {
        Axis.call(this, properties);
    };
    langUtils.inherit(CategoryAxis, Axis);

    $.extend(CategoryAxis.prototype, {

        DEFAULT_FONT_SIZE: 12,
        MIN_FONT_SIZE: 9,

        getConfig: function() {
            var that = this,
                config = Axis.prototype.getConfig.apply(this, arguments),
                hideAxis = parsingUtils.normalizeBoolean(this.properties['axisLabels.hideCategories']);

            $.extend(true, config, {
                categories: this.properties['axis.categories'],
                labels: {
                    formatter: function() {
                        return that.formatLabel(this.value);
                    },
                    enabled: config.labels.enabled && !hideAxis
                },
                startOnTick: !this.hasTickmarksBetween(),
                showLastLabel: this.hasTickmarksBetween(),
                tickWidth: hideAxis ? 0 : 1,
                tickmarkPlacement: this.properties['axisLabels.tickmarkPlacement'],
                gridLineWidth: parsingUtils.normalizeBoolean(this.properties['gridLines.showMajorLines']) ? 1 : 0,
                getOffsetPreHook: _(this.getOffsetPreHook).bind(this)
            });

            if(!this.hasTickmarksBetween()) {
                // this will trick Highcharts into rendering space for the last label
                config.max = this.properties['axis.categories'].length;
            }

            return config;
        },

        getVerticalConfig: function() {
            var config = Axis.prototype.getVerticalConfig.call(this);
            return $.extend(true, config, {
                labels: {
                    align: 'right',
                    x: -8
                }
            });
        },

        getHorizontalConfig: function() {
            var config = Axis.prototype.getHorizontalConfig.call(this);
            return $.extend(true, config, {
                labels: {
                    align: 'left'
                },
                endOnTick: !this.hasTickmarksBetween(),
                showLastLabel: false,
                startOnTick: true
            });
        },

        getCategories: function() {
            return this.properties['axis.categories'];
        },

        /**
         * @author sfishel
         *
         * Do some intelligent manipulation of axis label step and ellipsization of axis labels (if needed)
         * before the getOffset routine runs.
         */

        getOffsetPreHook: function(axis) {
            var options = axis.options,
                chart = axis.chart;

            if(!options.labels.enabled) {
                return;
            }

            var maxWidth, tickSpacing, minLabelSpacing, labelStep, labelSpacing,
                formatter = new Formatter(chart.renderer),
                categories = options.categories;

            if(!options.originalCategories) {
                options.originalCategories = $.extend([], categories);
            }
            if(this.isVertical) {
                maxWidth = Math.floor(chart.chartWidth / 6);

                var adjustedFontSize = this.fitLabelsToWidth(options, categories, formatter, maxWidth),
                    labelHeight = formatter.predictTextHeight('Test', adjustedFontSize),
                    axisHeight = chart.plotHeight;

                tickSpacing = axisHeight / (categories.length || 1);
                minLabelSpacing = 25;
                labelStep = Math.ceil(minLabelSpacing / tickSpacing);

                options.labels.y = (labelStep > 1) ? labelHeight - (axis.transA * axis.tickmarkOffset) : labelHeight / 3;
                options.labels.step = labelStep;
            }
            else {
                var fontSize,
                    tickLabelPadding = 4,
                    labelSpacingUpperBound = 100,
                    axisWidth = chart.plotWidth,
                    maxWidths = formatter.getMaxWidthForFontRange(categories, this.MIN_FONT_SIZE, this.DEFAULT_FONT_SIZE);

                // check the width of the longest label for each font
                // take the largest font size that will make that width less than the tick spacing if possible
                tickSpacing = axisWidth / (categories.length || 1);
                // will return the largest font size that fits in the tick spacing, or zero if none fit
                var subTickSpacingFont = this.findBestFontForSpacing(maxWidths, tickSpacing - 2 * tickLabelPadding);
                if(subTickSpacingFont > 0) {
                    fontSize = subTickSpacingFont;
                    options.labels.style['font-size'] = fontSize + 'px';
                    labelStep = 1;
                    labelSpacing = tickSpacing;
                }
                // otherwise use the width for smallest font size as minLabelSpacing, with the upper bound
                else {
                    minLabelSpacing = Math.min(maxWidths[this.MIN_FONT_SIZE] + 2 * tickLabelPadding, labelSpacingUpperBound);
                    fontSize = this.MIN_FONT_SIZE;
                    labelStep = Math.ceil(minLabelSpacing / tickSpacing);
                    labelSpacing = tickSpacing * labelStep;
                    maxWidth = labelSpacing - (2 * tickLabelPadding);
                    this.ellipsizeLabels(options, categories, formatter, maxWidth, fontSize);
                }

                options.labels.align = 'left';
                options.labels.step = labelStep;
                if(options.tickmarkPlacement === 'between') {
                    options.labels.x = -(labelSpacing / (2 * labelStep)) + tickLabelPadding;
                }
                else {
                    options.labels.x = tickLabelPadding;
                }
            }
            formatter.destroy();
        },

        findBestFontForSpacing: function(fontWidths, spacing) {
            var bestFontSize = 0;
            _(fontWidths).each(function(width, fontSize) {
                if(width <= spacing) {
                    bestFontSize = Math.max(bestFontSize, parseInt(fontSize, 10));
                }
            });
            return bestFontSize;
        },

        fitLabelsToWidth: function(options, categories, formatter, maxWidth) {
            var i,
                adjusted = formatter.adjustLabels(options.originalCategories, maxWidth, this.MIN_FONT_SIZE, this.DEFAULT_FONT_SIZE, 'middle');

            for(i = 0; i < adjusted.labels.length; i++) {
                categories[i] = adjusted.labels[i];
            }
            options.labels.style['font-size'] = adjusted.fontSize + 'px';
            return adjusted.fontSize;
        },

        ellipsizeLabels: function(options, categories, formatter, maxWidth, fontSize) {
            var i,
                adjustedLabels = _(categories).map(function(label) {
                    return formatter.ellipsize(label, maxWidth, fontSize, 'middle');
                });

            for(i = 0; i < adjustedLabels.length; i++) {
                categories[i] = adjustedLabels[i];
            }
            options.labels.style['font-size'] = fontSize + 'px';
        },

        /**
         * @author sfishel
         *
         * Do a custom enforcement of the label step by removing ticks that don't have a label
         */

        tickRenderPostHook: function(tick, index, old) {
            var axisOptions = tick.axis.options;
            axisOptions.labels = axisOptions.labels || {};
            if(!axisOptions.labels.enabled) {
                return;
            }
            Axis.prototype.tickRenderPostHook.call(this, tick, index, old);
            var adjustedPosition = tick.pos + (axisOptions.tickmarkPlacement === 'between' ? 1 : 0);
            var labelStep = axisOptions.labels.step || 1;

            if(adjustedPosition % labelStep !== 0) {
                tick.mark.hide();
            }
            else {
                tick.mark.show();
            }
        },

        formatValue: function(value) {
            return value;
        },

        formatLabel: function(info) {
            return parsingUtils.escapeSVG(info);
        },

        hasTickmarksBetween: function() {
            return (this.properties['axisLabels.tickmarkPlacement'] === 'between');
        },

        getTickLabelExtremesY: function(tick) {
            return [-tick.labelBBox.height, 0];
        }

    });

    return CategoryAxis;

});
define('js_charting/util/time_utils',['underscore', 'util/time_utils', 'splunk.i18n'], function(_, splunkTimeUtils, i18n) {

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // TimeUtils

    
    var TimeUtils = {

        SECS_PER_MIN: 60,
        SECS_PER_HOUR: 60 * 60,

        convertTimeToCategories: function(timeData, spanSeries, numLabelCutoff) {

            // debugging
            // un-commenting this will print the time series to console in a way that can be copy-pasted to a unit test
            // console.log('[\n' + JSON.stringify(timeData).replace(/\[|\]/g, '').split(',').join(',\n') + '\n]');

            var i, labelIndex, prettyLabelInfo, prettyLabels, prettyLabel,
                // find the indexes (a list of numbers) where the labels should go
                labelIndexes = this.findLabelIndexes(timeData, numLabelCutoff),
                rawLabels    = [],
                categories   = [];

            // based on the label indexes, look up the raw labels from the original list
            _(labelIndexes).each(function(i){
                rawLabels.push(timeData[i]);
            });

            prettyLabelInfo = this.getPrettyLabelInfo(rawLabels);
            prettyLabels    = prettyLabelInfo.prettyLabels;

            // now assemble the full category list to return
            // start with a list of all blanks
            _(timeData).each(function(i){ categories.push(' ');});

            // then put the pretty labels in the right places
            _(labelIndexes).each(function(labelIndex,j){
                categories[labelIndex] = prettyLabels[j];
            });

            return ({
                categories: categories,
                rawLabels: rawLabels,
                granularity: prettyLabelInfo.granularity
            });
        },

        findLabelIndexes: function(timeData, numLabelCutoff) {
            var i, labelIndex, indexes = [];

            // if there are less data points than the cutoff, should label all points
            if(timeData.length <= numLabelCutoff) {
                i=0;
                while(i<timeData.length){
                    indexes.push(i++);
                }
                return indexes;
            }

            var pointSpan = this.getPointSpan(timeData),
                totalSpan = this.getTotalSpan(timeData);

            if(this.couldLabelFirstOfMonth(pointSpan, totalSpan)) {
                var firstIndexes = this.findFirstOfMonthIndexes(timeData);
                var indexLen = firstIndexes.length;
                if(indexLen >= 3){
                    var step = Math.ceil(indexLen / numLabelCutoff),
                        newIndexes = [];
                    for(i = 0; i < indexLen; i += step) {
                        labelIndex = firstIndexes[i];
                        newIndexes.push(labelIndex);
                    }
                    firstIndexes = newIndexes;
                    return firstIndexes;
                }

             }

            // find major unit (in number of points, not time)
            var majorUnit       = this.findMajorUnit(timeData, numLabelCutoff, pointSpan, totalSpan),
                firstMajorSlice = timeData.slice(0, majorUnit),
                roundestIndex   = this.getRoundestIndex(firstMajorSlice, majorUnit, pointSpan),
                index           = roundestIndex;

            if(this.couldLabelMidnight(majorUnit, pointSpan)){
                var midnightIndexes = this.findMidnightIndexes(timeData);
                if(midnightIndexes.length > numLabelCutoff){
                    step = Math.ceil(midnightIndexes.length / numLabelCutoff);
                    newIndexes = [];
                    for(i = 0; i < midnightIndexes.length; i += step) {
                        labelIndex = midnightIndexes[i];
                        newIndexes.push(labelIndex);
                    }
                    midnightIndexes = newIndexes;
                }
                return midnightIndexes;
            }

            while(index < timeData.length) {
                indexes.push(index);
                index += majorUnit;
            }
            return indexes;
        },

        couldLabelMidnight: function(majorUnit, pointSpan){
            return ((majorUnit % 24 === 0) && (pointSpan === 60*60));
        },

        couldLabelFirstOfMonth: function(pointSpan, totalSpan) {
            if(pointSpan > this.MAX_SECS_PER_DAY) {
                return false;
            }
            if(pointSpan < this.SECS_PER_HOUR) {
                return false;
            }
            // prevent a user-defined span like 4003 seconds from derailing things
            if(pointSpan < this.MIN_SECS_PER_DAY && (24 * this.SECS_PER_HOUR) % pointSpan !== 0) {
                return false;
            }
            if(totalSpan < 2 * this.MIN_SECS_PER_MONTH) {
                return false;
            }
            return true;
        },

        findMidnightIndexes: function(timeData){
            var i, bdTime,
                bdTimes = [],
                midnightIndexes = [];
                for(i = 0; i < timeData.length; i++) {
                    bdTimes.push(splunkTimeUtils.extractBdTime(timeData[i]));
                }
                for(i = 0; i < bdTimes.length; i++) {
                    bdTime = bdTimes[i];
                    if((bdTime.hour === 0) && (bdTime.minute === 0)) {
                        midnightIndexes.push(i);
                    }
                }
                return midnightIndexes;
        },

        findFirstOfMonthIndexes: function(timeData) {
            var bdTimes = [],
                firstIndexes = [];

            _(timeData).each(function(dataPoint, i){
                bdTimes.push(splunkTimeUtils.extractBdTime(dataPoint));
            });
            _(bdTimes).each(function(bdTime, i){
                if(bdTime.day === 1 && bdTime.hour === 0){
                    firstIndexes.push(i);
                }
            });
            return firstIndexes;
        },

        getPointSpan: function(timeData) {
            if(timeData.length < 2) {
                return 1;
            }
            if(timeData.length < 4) {
                return this.getSpanBetween(timeData[0], timeData[1]);
            }
            var firstSpan  = this.getSpanBetween(timeData[0], timeData[1]),
                secondSpan = this.getSpanBetween(timeData[1], timeData[2]),
                thirdSpan  = this.getSpanBetween(timeData[2], timeData[3]);

            // sample the three spans to avoid the case where daylight savings might produce an erroneous result
            if(firstSpan === secondSpan) {
                return firstSpan;
            }
            if(secondSpan === thirdSpan) {
                return secondSpan;
            }
            if(firstSpan === thirdSpan) {
                return firstSpan;
            }
            return firstSpan;
        },

        getTotalSpan: function(timeData) {
            var i, lastPoint;
            for(i = timeData.length - 1; i >= 0; i--) {
                lastPoint = timeData[i];
                if(splunkTimeUtils.isValidIsoTime(lastPoint)) {
                    break;
                }
            }
            return this.getSpanBetween(timeData[0], lastPoint);
        },

        getSpanBetween: function(start, end) {
            var startDate  = splunkTimeUtils.isoToDateObject(start),
                endDate    = splunkTimeUtils.isoToDateObject(end),
                millisDiff = endDate.getTime() - startDate.getTime();

            return millisDiff / 1000;
        },

        // use a 23-hour day as a minimum to protect against daylight savings errors
        MIN_SECS_PER_DAY: 23 * 60 * 60,
        // use a 25-hour day as a maximum to protect against daylight savings errors
        MAX_SECS_PER_DAY: 25 * 60 * 60,

        MAJOR_UNITS_SECONDS: [
            1,
            2,
            5,
            10,
            15,
            30,
            60,
            2 * 60,
            3 * 60,
            5 * 60,
            10 * 60,
            15 * 60,
            30 * 60,
            60 * 60,
            2 * 60 * 60,
            4 * 60 * 60,
            6 * 60 * 60,
            12 * 60 * 60,
            24 * 60 * 60,
            48 * 60 * 60,
            96 * 60 * 60,
            168 * 60 * 60
        ],

        MAJOR_UNIT_DAYS: [
            1,
            2,
            4,
            7,
            14,
            28,
            56,
            112,
            224,
            364,
            476,
            728
        ],

        // this is ok because daylight savings is never in February
        MIN_SECS_PER_MONTH: 28 * 24 * 60 * 60,

        MAJOR_UNIT_MONTHS: [
            1,
            2,
            4,
            6,
            12,
            24,
            48,
            96
        ],

        findMajorUnit: function(timeData, numLabelCutoff, pointSpan, totalSpan) {
            var i, majorUnit, unitsPerSpan;
            if(pointSpan < this.MIN_SECS_PER_DAY) {
                for(i = 0; i < this.MAJOR_UNITS_SECONDS.length; i++) {
                    majorUnit = this.MAJOR_UNITS_SECONDS[i];
                    unitsPerSpan = totalSpan / majorUnit;
                    if((unitsPerSpan >= 3) && (unitsPerSpan <= numLabelCutoff) && (majorUnit % pointSpan === 0)) {
                        // SPL-55264, 3 minutes is included in the major units list to prevent this loop from failing to find
                        // a major unit at all, but if 5 minutes would fit it is preferred over 3 minutes
                        if(majorUnit === 3 * 60 && totalSpan >= 15 * 60) {
                            continue;
                        }
                        return majorUnit / pointSpan;
                    }
                }
            }
            else if(pointSpan < this.MIN_SECS_PER_MONTH) {
                var secsPerDay = 24 * 60 * 60,
                    dayPointSpan = Math.round(pointSpan / secsPerDay),
                    dayTotalSpan = Math.round(totalSpan / secsPerDay);

                for(i = 0; i < this.MAJOR_UNIT_DAYS.length; i++) {
                    majorUnit = this.MAJOR_UNIT_DAYS[i];
                    unitsPerSpan = dayTotalSpan / majorUnit;
                    if((unitsPerSpan >= 3) && (unitsPerSpan <= numLabelCutoff) && (majorUnit % dayPointSpan === 0)) {
                        return majorUnit / dayPointSpan;
                    }
                }
            }
            else {
                var secsPerMonth = 30 * 24 * 60 * 60,
                    monthPointSpan = Math.round(pointSpan / secsPerMonth),
                    monthTotalSpan = Math.round(totalSpan / secsPerMonth);

                for(i = 0; i < this.MAJOR_UNIT_MONTHS.length; i++) {
                    majorUnit = this.MAJOR_UNIT_MONTHS[i];
                    unitsPerSpan = monthTotalSpan / majorUnit;
                    if((unitsPerSpan >= 3) && (unitsPerSpan <= numLabelCutoff) && (majorUnit % monthPointSpan === 0)) {
                        return majorUnit / monthPointSpan;
                    }
                }
            }
            // if we exit the loop without finding a major unit, we just punt and divide the points evenly
            return Math.ceil(timeData.length / numLabelCutoff);
        },

        getRoundestIndex: function(timeData, majorUnit, pointSpan) {
            var i, roundest, roundestIndex,
                bdTimes = [],
                secsMajorUnit = majorUnit * pointSpan;

            _(timeData).each(function(label){
                bdTimes.push(splunkTimeUtils.extractBdTime(label));
            });

            roundest = bdTimes[0];
            roundestIndex = 0;
            for(i = 1; i < bdTimes.length; i++) {
                if(this.isRounderThan(bdTimes[i], roundest, pointSpan) && this.bdTimeMatchesUnit(bdTimes[i], secsMajorUnit)) {
                    roundest = bdTimes[i];
                    roundestIndex = i;
                }
            }
            return roundestIndex;
        },

        isRounderThan: function(first, second, pointSpan) {
            if(first.month === 1 && first.day === 1 && first.hour === 0
                    && second.month !== 1 && second.day === 1 && second.hour === 0) {
                return true;
            }

            if(first.hour === 0 && second.hour !== 0) {
                return true;
            }
            if(first.hour % 12 === 0 && second.hour % 12 !== 0) {
                return true;
            }
            if(first.hour % 6 === 0 && second.hour % 6 !== 0) {
                return true;
            }
            if(first.hour % 4 === 0 && second.hour % 4 !== 0) {
                return true;
            }
            if(first.hour % 2 === 0 && second.hour % 2 !== 0) {
                return true;
            }

            if(first.minute === 0 && second.minute !== 0) {
                return true;
            }
            if(first.minute % 30 === 0 && second.minute % 30 !== 0) {
                return true;
            }
            if(first.minute % 15 === 0 && second.minute % 15 !== 0) {
                return true;
            }
            if(first.minute % 10 === 0 && second.minute % 10 !== 0) {
                return true;
            }
            if(first.minute % 5 === 0 && second.minute % 5 !== 0) {
                return true;
            }
            if(first.minute % 2 === 0 && second.minute % 2 !== 0) {
                return true;
            }

            if(first.second === 0 && second.second !== 0) {
                return true;
            }
            if(first.second % 30 === 0 && second.second % 30 !== 0) {
                return true;
            }
            if(first.second % 15 === 0 && second.second % 15 !== 0) {
                return true;
            }
            if(first.second % 10 === 0 && second.second % 10 !== 0) {
                return true;
            }
            if(first.second % 5 === 0 && second.second % 5 !== 0) {
                return true;
            }
            if(first.second % 2 === 0 && second.second % 2 !== 0) {
                return true;
            }
            return false;
        },

        bdTimeMatchesUnit: function(bdTime, secsMajor) {
            if(secsMajor < 60) {
                return (bdTime.second % secsMajor === 0);
            }
            if(secsMajor < 60 * 60) {
                var minutes = Math.floor(secsMajor / 60);
                return (bdTime.minute % minutes === 0);
            }
            else {
                var hours = Math.floor(secsMajor / (60 * 60));
                return (bdTime.hour % hours === 0);
            }
            return true;
        },

        getPrettyLabelInfo: function(rawLabels) {
            var i, prettyLabel,
                bdTimes = [],
                prettyLabels = [];

            _(rawLabels).each(function(label){
                bdTimes.push(splunkTimeUtils.extractBdTime(label));
            });
            var granularity = splunkTimeUtils.determineLabelGranularity(bdTimes);
            for(i = 0; i < bdTimes.length; i++) {
                if(i === 0) {
                    prettyLabels.push(this.formatBdTimeAsAxisLabel(bdTimes[i], null, granularity).join('<br/>'));
                }
                else {
                    prettyLabels.push(this.formatBdTimeAsAxisLabel(bdTimes[i], bdTimes[i - 1], granularity).join('<br/>'));
                }
            }

            return {
                prettyLabels: prettyLabels,
                granularity: granularity
            };
        },

        formatBdTimeAsAxisLabel: function(time, prevBdTime, granularity) {
            if(time.isInvalid) {
                return null;
            }
            var dateTime     = splunkTimeUtils.bdTimeToDateObject(time),
                showDay      = (granularity in { 'second': true, 'minute': true, 'hour': true, 'day': true }),
                showTimes    = (granularity in { 'second': true, 'minute': true, 'hour': true}),
                showSeconds  = (granularity === 'second'),
                timeFormat   = (showSeconds) ? 'medium' : 'short',
                dateFormat   = (showDay) ? 'ccc MMM d' : 'MMMM';

            if(granularity === 'year') {
                return [i18n.format_date(dateTime, 'YYYY')];
            }
            if(prevBdTime && prevBdTime.year === time.year && time.month === prevBdTime.month && time.day === prevBdTime.day) {
                return [i18n.format_time(dateTime, timeFormat)];
            }
            var formattedPieces =  (showTimes) ?
                [i18n.format_time(dateTime, timeFormat), i18n.format_date(dateTime, dateFormat)] :
                [i18n.format_date(dateTime, dateFormat)];

            if(!prevBdTime || time.year !== prevBdTime.year) {
                formattedPieces.push(i18n.format_date(dateTime, 'YYYY'));
            }
            return formattedPieces;
        },

        // returns null if string cannot be parsed
        formatIsoStringAsTooltip: function(isoString, pointSpan) {
            var bdTime = splunkTimeUtils.extractBdTime(isoString),
                dateObject;

            if(bdTime.isInvalid) {
                return null;
            }
            dateObject = splunkTimeUtils.bdTimeToDateObject(bdTime);

            if(pointSpan >= this.MIN_SECS_PER_DAY) { // day or larger
                return i18n.format_date(dateObject);
            }
            if(pointSpan >= this.SECS_PER_MIN) { // minute or longer
                return i18n.format_datetime(dateObject, 'medium', 'short');
            }
            return i18n.format_datetime(dateObject);
        }
    };

	return TimeUtils;

});

define('js_charting/components/axes/TimeAxis',[
            'jquery',
            'underscore',
            './Axis',
            './CategoryAxis',
            '../../helpers/Formatter',
            '../../util/lang_utils',
            'util/time_utils',
            '../../util/time_utils',
            '../../util/dom_utils'
        ],
        function(
            $,
            _,
            Axis,
            CategoryAxis,
            Formatter,
            langUtils,
            splunkTimeUtils,
            timeUtils,
            domUtils
        ) {

    var TimeAxis = function(properties) {
        this.originalCategories = properties['axis.categories'];
        this.spanData = properties['axis.spanData'];
        var timeCategoryInfo = timeUtils.convertTimeToCategories(this.originalCategories, this.spanData, this.NUM_LABEL_CUTOFF);
        this.granularity = timeCategoryInfo.granularity;
        this.pointSpan = timeUtils.getPointSpan(this.originalCategories);
        properties['axis.categories'] = timeCategoryInfo.categories;
        CategoryAxis.call(this, properties);
    };
    langUtils.inherit(TimeAxis, CategoryAxis);

    $.extend(TimeAxis.prototype, {

        NUM_LABEL_CUTOFF: 6,

        getConfig: function() {
            var config = CategoryAxis.prototype.getConfig.call(this);
            $.extend(true, config, {
                showLastLabel: true,
                setTickPositionsPostHook: _(this.setTickPositionsPostHook).bind(this)
            });
            return config;
        },

        formatLabel: function(info) {
            return info;
        },

        formatValue: function(value) {
            return timeUtils.formatIsoStringAsTooltip(value, this.pointSpan) || 'Invalid timestamp'; // TODO: localize
        },

        /**
         * @author sfishel
         *
         * Before the getOffset routine runs, align the axis labels to the right of each tick
         */

        getOffsetPreHook: function(axis) {
            var options = axis.options,
                chart = axis.chart,
                categories = options.categories,
                tickLabelPadding = (this.isVertical) ? 2 : 3,
                axisLength = (this.isVertical) ? chart.plotHeight : chart.plotWidth,
                tickSpacing = (categories.length > 1) ? (axisLength / categories.length) : axisLength + (tickLabelPadding * 2);

            options.adjustedTickSpacing = tickSpacing;
            if(this.isVertical) {
                var labelFontSize = parseInt((options.labels.style.fontSize.split('px'))[0], 10);
                options.labels.y = (tickSpacing / 2) + labelFontSize + tickLabelPadding;
            }
            else {
                if(options.tickmarkPlacement === 'on') {
                    options.labels.align = 'left';
                    options.labels.x = tickLabelPadding;
                }
                else {
                    options.labels.align = 'left';
                    options.labels.x = (tickSpacing / 2) + tickLabelPadding;
                }
            }
        },

        /**
         * @author sfishel
         *
         * Make adjustments to the tick positions to label only the appropriate times
         */

        setTickPositionsPostHook: function(axis, secondPass) {
            var options = axis.options,
                categories = options.categories;

            axis.tickPositions = [];
            if(!options.originalCategories) {
                options.originalCategories = $.extend(true, [], categories);
            }
            var i,
                originalCategories = options.originalCategories;

            for(i = 0; i < originalCategories.length; i++) {
                if(originalCategories[i] && originalCategories[i] !== " ") {
                    if(options.tickmarkPlacement === 'on') {
                        axis.tickPositions.push(i);
                    }
                    else {
                        // if the tickmark placement is 'between', we shift everything back one
                        // interestingly, HighCharts will allow negatives here, and in fact that's what we need to label the first point
                        axis.tickPositions.push(i - 1);
                        categories[i - 1] = originalCategories[i];
                    }
                }
            }

            // adjust the axis label CSS so that soft-wrapping will not occur
            // for the VML renderer we also have to make sure the tick labels will accurately report their own widths
            options.labels.style.width = 'auto';
            if(!domUtils.hasSVG) {
                options.labels.style['white-space'] = 'nowrap';
            }
        },

        /**
         * @author sfishel
         *
         * Use the handleOverflow override hook to handle any collisions among the axis labels
         * All branches should return true, resolveCollisions will show/hide the correct ticks and labels
         *
         * NOTE: Highcharts renders the second tick first, and the first tick last
         */

        tickHandleOverflowOverride: function(tick, index, xy) {
            // FIXME: this is a little hacky...
            // use the second tick as an indicator that we're starting a new render routine and reset the collisionDetected flag
            // can't do the regular collision detection because the first tick isn't there yet
            if(index === 1) {
                this.collisionDetected = false;
                this.lastTickFits = true;
                return true;
            }
            // FIXME: again a little hacky...
            // use the first tick as an indicator that this is the last step in rendering
            // only now can we check if the first and second ticks overlap (if there is a second tick)
            if(tick.isFirst) {
                if(!tick.isLast) {
                    this.collisionDetected = this.collisionDetected || this.tickOverlapsNext(tick, index, xy);
                }
                this.resolveCollisionDetection(tick.axis, this.collisionDetected, this.lastTickFits);
                return true;
            }

            // if we haven't seen a collision yet, figure out if the current tick causes one
            this.collisionDetected = this.collisionDetected || this.tickOverlapsPrevious(tick, index, xy);

            // keep track of whether the last tick fits without overflow
            if(tick.isLast) {
                this.lastTickFits = CategoryAxis.prototype.tickHandleOverflowOverride.call(this, tick, index, xy);
            }
            return true;
        },

        tickOverlapsPrevious: function(tick, index, xy) {
            var axis = tick.axis,
                // assume this won't be called with the first tick
                previous = axis.ticks[axis.tickPositions[index - 1]],
                previousXY = previous.getPosition(axis.horiz, previous.pos, axis.tickmarkOffset);

            // check for the vertical axis case
            if(this.isVertical) {
                var previousBottom = previousXY.y + this.getTickLabelExtremesY(previous)[1];
                return (xy.y < previousBottom);
            }

            // otherwise handle the horizontal axis case
            var previousRight = previousXY.x + this.getTickLabelExtremesX(previous)[1];
            return (xy.x < previousRight);
        },

        tickOverlapsNext: function(tick, index, xy) {
            var axis = tick.axis,
                // assume this won't be called with the last tick
                next = axis.ticks[axis.tickPositions[index + 1]],
                nextXY = next.getPosition(axis.horiz, next.pos, axis.tickmarkOffset);

            if(!next) {
                return false;
            }

            // check for the vertical axis case
            if(this.isVertical) {
                var myBottom = xy.y + this.getTickLabelExtremesY(tick)[1];
                return (myBottom > nextXY.y);
            }

            // otherwise handle the horizontal case
            var myRight = xy.x + this.getTickLabelExtremesX(tick)[1];
            return (myRight > nextXY.x);
        },

        resolveCollisionDetection: function(axis, hasCollisions, lastLabelFits) {
            var formatter = new Formatter(axis.chart.renderer),
                tickPositions = axis.tickPositions,
                collisionTickPositions = tickPositions.slice(1),
                ticks = axis.ticks,
                rawLabels = this.originalCategories,
                labelGranularity = this.granularity,
                positionOffset = this.hasTickmarksBetween() ? 1 : 0;

            if(hasCollisions) {
                _(collisionTickPositions).each(function(pos, i) {
                    i++; // do this because we sliced out the first tick
                    var tick = ticks[pos];
                    if(i % 2 === 0) {
                        var bdTime = splunkTimeUtils.extractBdTime(rawLabels[tick.pos + positionOffset]),
                            prevTick = ticks[tickPositions[i - 2]],
                            prevBdTime = splunkTimeUtils.extractBdTime(rawLabels[prevTick.pos + positionOffset]),
                            newLabel = (timeUtils.formatBdTimeAsAxisLabel(bdTime, prevBdTime, labelGranularity) || ['']).join('<br/>');

                        tick.label.attr({ text: newLabel });
                    }
                    else {
                        tick.label.hide();
                        tick.mark.hide();
                    }
                });
            }
            else {
                _(collisionTickPositions).each(function(pos, i) {
                    i++; // do this because we sliced out the first tick
                    var tick = ticks[pos];
                    tick.label.show();
                    tick.mark.show();
                    if(i % 2 === 0) {
                        var bdTime = splunkTimeUtils.extractBdTime(rawLabels[pos + positionOffset]),
                            prevTick = ticks[tickPositions[i - 1]],
                            prevBdTime = splunkTimeUtils.extractBdTime(rawLabels[prevTick.pos + positionOffset]),
                            newLabel = (timeUtils.formatBdTimeAsAxisLabel(bdTime, prevBdTime, labelGranularity) || ['']).join('<br/>');

                        tick.label.attr({ text: newLabel });
                    }
                });
            }
            if(!lastLabelFits && (!hasCollisions || tickPositions.length % 2 !== 0)) {
                axis.ticks[_(tickPositions).last()].label.hide();
            }

            formatter.destroy();
        },

        // have to make some adjustments to get the correct answer when tickmarkPlacement = between
        getTickLabelExtremesX: function(tick) {
            var extremes = CategoryAxis.prototype.getTickLabelExtremesX.call(this, tick),
                axisOptions = tick.axis.options;

            if(axisOptions.tickmarkPlacement === 'between') {
                return _(extremes).map(function(extreme) { return extreme - (axisOptions.adjustedTickSpacing / 2); });
            }
            return extremes;
        },

        // inheritance gets a little weird here, the TimeAxis wants to go back to the base Axis behavior for this method
        getTickLabelExtremesY: function(tick) {
            return Axis.prototype.getTickLabelExtremesY.apply(this, arguments);
        }

    });

    return TimeAxis;

});
define('js_charting/components/axes/NumericAxis',[
            'jquery',
            'underscore',
            './Axis',
            '../../helpers/Formatter',
            '../../util/parsing_utils',
            '../../util/lang_utils',
            '../../util/math_utils',
            'splunk.i18n'
        ],
        function(
            $,
            _,
            Axis,
            Formatter,
            parsingUtils,
            langUtils,
            mathUtils,
            i18n
        ) {

    var NumericAxis = function(properties) {
        Axis.call(this, properties);
        this.includeZero = parsingUtils.normalizeBoolean(this.properties['axis.includeZero']);
    };

    langUtils.inherit(NumericAxis, Axis);
    $.extend(NumericAxis.prototype, {

        getConfig: function() {
            var config = Axis.prototype.getConfig.call(this),
                extendAxisRange = parsingUtils.normalizeBoolean(this.properties['axisLabels.extendsAxisRange'], true);

            $.extend(config, {
                tickInterval: (this.properties['isEmpty'] && (this.properties['axis.scale']  ==='log')) ? 10:
                    this.properties['isEmpty'] ? 10 :
                        parseInt(this.properties['axisLabels.majorUnit'], 10) || null,
                endOnTick: extendAxisRange,
                startOnTick: extendAxisRange,
                allowDecimals: !parsingUtils.normalizeBoolean(this.properties['axisLabels.integerUnits']),

                minorTickColor: this.properties['axis.foregroundColorSoft'],
                minorTickLength: parseInt(this.properties['axisLabels.minorTickSize'], 10) || 10,
                // Leave this as auto because the widths of minor lines default to 0px
                minorTickInterval: 'auto',
                minorTickWidth: (this.properties['axisLabels.minorTickVisibility'] === 'show') ? 1 : 0,
                minorGridLineWidth: parsingUtils.normalizeBoolean(this.properties['gridLines.showMinorLines']) ? 1 : 0,
                //FIXME: clear min/max up so that reader can understand why we check for 'isEmpty'
                min: this.properties['isEmpty'] ? 0 : null,
                max: (this.properties['isEmpty'] && (this.properties['axis.scale']  ==='log')) ? 2 : this.properties['isEmpty'] ? 100 : null,
                gridLineWidth: parsingUtils.normalizeBoolean(this.properties['gridLines.showMajorLines'], true) ? 1 : 0,
                getSeriesExtremesPostHook: _(this.getSeriesExtremesPostHook).bind(this)
            });

            this.addMinAndMaxToConfig(config);
            return config;
        },

        addMinAndMaxToConfig: function(config) {
            var min = this.properties.hasOwnProperty("axis.minimumNumber") ? parseFloat(this.properties['axis.minimumNumber']) : -Infinity,
                max = this.properties.hasOwnProperty("axis.maximumNumber") ? parseFloat(this.properties['axis.maximumNumber']) :  Infinity;

            if(min > max) {
                var temp = min;
                min = max;
                max = temp;
            }
            if(min > -Infinity) {
                this.addMinToConfig(config, min, this.includeZero);
            }
            if(max < Infinity) {
                this.addMaxToConfig(config, max, this.includeZero);
            }
        },

        addMinToConfig: function(config, min, includeZero) {
            if(includeZero && min > 0) {
                min = 0;
            }
            else if(this.isLogScale()) {
                min = mathUtils.absLogBaseTen(min);
            }
            config.min = min;
            config.minPadding = 0;
            config.startOnTick = false;
        },

        addMaxToConfig: function(config, max, includeZero) {
            if(includeZero && max < 0) {
                max = 0;
            }
            else if(this.isLogScale()) {
                max = mathUtils.absLogBaseTen(max);
            }
            config.max = max;
            config.maxPadding = 0;
            config.endOnTick = false;

        },

        getVerticalConfig: function() {
            var config = Axis.prototype.getVerticalConfig.call(this);
            return $.extend(true, config, {
                labels: {
                    y: 13
                }
            });
        },

        getHorizontalConfig: function() {
            var config = Axis.prototype.getHorizontalConfig.call(this);
            return $.extend(true, config, {
                labels: {
                    align: 'left',
                    x: 4
                }
            });
        },

        formatLabel: function(info) {
            if(this.isLogScale()) {
                if(this.properties['stackMode'] === 'stacked100'){
                    return i18n.format_decimal(info.value);
                }
                return i18n.format_decimal(mathUtils.absPowerTen(info.value));
            }
            return i18n.format_decimal(info.value);
        },

        formatValue: function(value) {
            // handle the edge case where the value is not a valid number but the nullValueMode property has rendered it as a zero
            var formatted = i18n.format_decimal(value);
            return (formatted !== 'NaN' ? formatted : i18n.format_decimal('0'));
        },

        isLogScale: function() {
            return (this.properties['axis.scale'] === 'log');
        },

        getSeriesExtremesPostHook: function(axis) {
            var options = axis.options,
                extremes = axis.getExtremes(),
                chart = axis.chart;

            if(!this.properties['isEmpty']){
                var formatter = new Formatter(chart.renderer);

                extremes.min = options.min || extremes.dataMin;
                extremes.max = options.max || extremes.dataMax;

                var range = Math.abs(extremes.max - extremes.min),
                    // if we can't read a tickInterval from the options, estimate it from the tick pixel interval
                    tickInterval = options.tickInterval || (options.tickPixelInterval / chart.plotHeight) * range;

                if(this.isLogScale()) {
                    this.formatLogAxes(options, extremes);
                }
                else {
                    this.checkMajorUnitFit(tickInterval, extremes, options, formatter, chart);
                }
                if(this.includeZero) {
                    this.enforceIncludeZero(options, extremes);
                }
                else {
                    this.adjustAxisRange(options, extremes, tickInterval);
                }
                if(options.allowDecimals !== false) {
                    this.enforceIntegerMajorUnit(options, extremes);
                }
                formatter.destroy();
            }

        },

        formatLogAxes: function(options, extremes) {
            var firstTickValue = Math.ceil(extremes.min),
                lastTickValue = (options.endOnTick) ? Math.ceil(extremes.max) : extremes.max;

            // if we can show two or more tick marks, we'll clip to a tickInterval of 1
            if(Math.abs(lastTickValue - firstTickValue) >= 1) {
                options.tickInterval = 1;
            }
            else {
                options.tickInterval = null;
            }
        },

        checkMajorUnitFit: function(unit, extremes, options, formatter, chart) {
            var range = Math.abs(extremes.max - extremes.min),
                axisLength = (this.isVertical) ? chart.plotHeight : chart.plotWidth,
                tickSpacing = unit * axisLength / range,
                largestExtreme = Math.max(Math.abs(extremes.min), Math.abs(extremes.max)),
                tickLabelPadding = (this.isVertical) ? 5 : 15,
                fontSize = parseInt((options.labels.style.fontSize.split('px'))[0], 10),

                translatePixels = function(pixelVal) {
                    return (pixelVal * range / axisLength);
                };

            if(this.isVertical) {
                var maxHeight = formatter.predictTextHeight(largestExtreme, fontSize);
                if(tickSpacing < (maxHeight + 2 * tickLabelPadding)) {
                    options.tickInterval = Math.ceil(translatePixels((maxHeight + 2 * tickLabelPadding), true));
                }
            }
            else {
                var maxWidth = formatter.predictTextWidth(largestExtreme, fontSize);
                if(tickSpacing < (maxWidth + 2 * tickLabelPadding)) {
                    options.tickInterval = Math.ceil(translatePixels((maxWidth + 2 * tickLabelPadding), true));
                }
            }
        },

        enforceIncludeZero: function(options, extremes) {
            // if there are no extremes (i.e. no meaningful data was extracted), go with 0 to 100
            if(!extremes.min && !extremes.max) {
                this.handleNoData(options);
                return;
            }
            if(extremes.min >= 0) {
                options.min = 0;
                options.minPadding = 0;
            }
            else if(extremes.max <= 0) {
                options.max = 0;
                options.maxPadding = 0;
            }
        },

        // clean up various issues that can arise from the axis extremes
        adjustAxisRange: function(options, extremes, tickInterval) {
            var hasUserMin = (options.min !== null),
                hasUserMax = (options.max !== null);
            // if there are no extremes (i.e. no meaningful data was extracted), go with 0 to 100
            if(!extremes.min && !extremes.max) {
                this.handleNoData(options);
                return;
            }
            // if the min or max is such that no data makes it onto the chart, we hard-code some reasonable extremes
            if(extremes.min > extremes.dataMax && extremes.min > 0 && !hasUserMax) {
                options.max = (this.isLogScale()) ? extremes.min + 2 : extremes.min * 2;
                return;
            }
            if(extremes.max < extremes.dataMin && extremes.max < 0 && !hasUserMin) {
                options.min = (this.isLogScale()) ? extremes.max - 2 : extremes.max * 2;
                return;
            }
            // if either data extreme within one tick interval of zero,
            // remove the padding on that side so the axis doesn't extend beyond zero
            if(extremes.dataMin >= 0 && extremes.dataMin <= tickInterval) {
                if(!hasUserMin){
                    options.min = 0;
                }
                options.minPadding = 0;
            }
            if(extremes.dataMax <= 0 && extremes.dataMax >= -1 * tickInterval) {
                if(!hasUserMax){
                    options.max = 0;
                }
                options.maxPadding = 0;
            }

        },

        handleNoData: function(axisOptions) {
            var logScale = this.isLogScale();
            axisOptions.min = 0;
            axisOptions.max = logScale ? 2 : 100;
            if(logScale) {
                axisOptions.tickInterval = 1;
            }
        },

        enforceIntegerMajorUnit: function(options, extremes) {
            var range = extremes.max - extremes.min;
            // if the axis range is ten or greater, require that the major unit be an integer
            if(range >= 10) {
                options.allowDecimals = false;
            }
        }

    });

    return NumericAxis;

});
define('js_charting/helpers/HoverEventThrottler',['jquery'], function($) {

    var Throttler = function(properties){
        properties              = properties || {};
        this.highlightDelay     = properties.highlightDelay || 200;
        this.unhighlightDelay   = properties.unhighlightDelay || 100;
        this.timer              = null;
        this.timer2             = null;
        this.mouseStatus        = 'over';
        this.isSelected         = false;
        this.onMouseOver        = properties.onMouseOver;
        this.onMouseOut         = properties.onMouseOut;
    };

    $.extend(Throttler.prototype, {

        setMouseStatus: function(status) { this.mouseStatus = status; },

        getMouseStatus: function() { return this.mouseStatus; },

        mouseOverHappened: function(someArgs) {
            var that = this,
                args = arguments;

            this.mouseOverFn = function() {
                that.onMouseOver.apply(null, args);
            };
            clearTimeout(this.timer);
            clearTimeout(this.timer2);
            this.setMouseStatus('over');
            this.timeOutManager();
        },

        mouseOutHappened: function(someArgs) {
            var that = this,
                args = arguments;
            this.mouseOutFn = function() {
                that.onMouseOut.apply(null, args);
            };
            this.setMouseStatus('out');
            this.timeOutManager();
        },

        timeOutManager: function(){
            var that = this;

            clearTimeout(this.timer);
            if(this.isSelected) {
                if(this.getMouseStatus()==='over') {
                    this.mouseEventManager();
                }
                else {
                    this.timer2 = setTimeout(function() {
                        that.setMouseStatus('out');
                        that.mouseEventManager();
                    }, that.unhighlightDelay);
                }
            }
            else {
                this.timer = setTimeout(function() {
                    that.isSelected = true;
                    that.mouseEventManager();
                }, that.highlightDelay);
            }
        },

        mouseEventManager: function() {
            var that = this;
            if(this.getMouseStatus()==='over') {
                this.mouseOverFn();
                this.isSelected = true;
                this.setMouseStatus('out');
            }
            else {
                this.mouseOutFn();
                this.isSelected = false;
                this.setMouseStatus('over');
            }
        }
    });

    return Throttler;

});

define('js_charting/components/Legend',[
            'jquery',
            'underscore',
            '../helpers/EventMixin',
            '../helpers/Formatter',
            '../helpers/HoverEventThrottler',
            '../util/parsing_utils',
            '../util/color_utils',
            '../util/dom_utils'
        ],
        function(
            $,
            _,
            EventMixin,
            Formatter,
            HoverEventThrottler,
            parsingUtils,
            colorUtils,
            domUtils
        ) {

    var Legend = function(properties) {
        this.properties = properties || {};
        this.clickEnabled = parsingUtils.normalizeBoolean(this.properties['clickEnabled']);
        this.ellipsisMode = this.OVERFLOW_TO_ELLIPSIS_MAP[this.properties['labelStyle.overflowMode']]
            || this.DEFAULT_ELLIPSIS_MODE;
        this.UNHIGHLIGHTED_COLOR =
            colorUtils.addAlphaToColor(this.UNHIGHLIGHTED_BASE_COLOR, this.UNHIGHLIGHTED_OPACITY);
    };

    Legend.prototype = $.extend({}, EventMixin, {

        HIGHLIGHTED_OPACITY: 1.0,
        UNHIGHLIGHTED_OPACITY: 0.3,
        UNHIGHLIGHTED_BASE_COLOR: 'rgb(150, 150, 150)',
        DEFAULT_PLACEMENT: 'right',
        DEFAULT_ELLIPSIS_MODE: 'middle',

        BASE_CONFIG: {
            borderWidth: 0
        },

        PLACEMENT_OPTIONS: {
            top: true,
            left: true,
            bottom: true,
            right: true,
            none: true
        },

        PLACEMENT_TO_MARGIN_MAP: {
            top: 30,
            left: 15,
            bottom: 15,
            right: 15
        },

        OVERFLOW_TO_ELLIPSIS_MAP: {
            ellipsisStart: 'start',
            ellipsisMiddle: 'middle',
            ellipsisEnd: 'end',
            ellipsisNone: 'none',
            'default': 'start'
        },

        getConfig: function() {
            var placement = this.PLACEMENT_OPTIONS.hasOwnProperty(this.properties['placement']) ?
                    this.properties['placement'] : this.DEFAULT_PLACEMENT,
                isVertical = { left: true, right: true }.hasOwnProperty(placement),
                itemCursorStyle = this.clickEnabled ? 'pointer' : 'auto';
            
            return $.extend(true, {}, this.BASE_CONFIG, {
                enabled: this.properties['isEmpty'] ? false : true,
                align: isVertical ? placement : 'center',
                verticalAlign: isVertical ? 'middle' : placement,
                layout: isVertical ? 'vertical' : 'horizontal',
                margin: this.PLACEMENT_TO_MARGIN_MAP[placement],
                itemStyle: {
                    cursor: itemCursorStyle,
                    color: this.properties['fontColor'] || '#000000'
                },
                itemHoverStyle: {
                    cursor: itemCursorStyle,
                    color: this.properties['fontColor'] || '#000000'
                },
                renderItemsPreHook: _(this.renderItemsPreHook).bind(this),
                renderItemsPostHook: _(this.renderItemsPostHook).bind(this)
            });
        },

        onChartLoad: function(chart) {
            // Works but may need to be changed in the future
            this.hcSeriesList = _(chart.series).filter(function(series){
                return series.options.showInLegend !== false;
            });

            this.addEventHandlers();
        },

        addEventHandlers: function() {
            var that = this,
                properties = {
                    highlightDelay: 125,
                    unhighlightDelay: 50,
                    onMouseOver: function(fieldName) {
                        that.selectField(fieldName);
                        that.trigger('mouseover', [fieldName]);
                    },
                    onMouseOut: function(fieldName) {
                        that.unSelectField(fieldName);
                        that.trigger('mouseout', [fieldName]);
                    }
                },
                throttle = new HoverEventThrottler(properties);

            _(this.hcSeriesList).each(function(series) {
                var fieldName = series.name;
                _(this.getSeriesLegendObjects(series)).each(function(graphic) {
                    domUtils.jQueryOn.call($(graphic.element), 'mouseover', function() {
                        throttle.mouseOverHappened(fieldName);
                    });
                    domUtils.jQueryOn.call($(graphic.element), 'mouseout', function() {
                        throttle.mouseOutHappened(fieldName);
                    });
                    if(this.clickEnabled) {
                        domUtils.jQueryOn.call($(graphic.element), 'click', function(e) {
                            var clickEvent = {
                                type: 'click',
                                modifierKey: (e.ctrlKey || e.metaKey)
                            };
                            that.trigger(clickEvent, [fieldName]);
                        });
                    }
                }, this);
            }, this);
        },

        selectField: function(fieldName) {
            _(this.hcSeriesList).each(function(series) {
                if(series.name !== fieldName) {
                    this.unHighlightField(fieldName, series);
                }
                else {
                    this.highlightField(fieldName, series);
                }
            }, this);
        },

        unSelectField: function(fieldName) {
            _(this.hcSeriesList).each(function(series) {
                if(series.name !== fieldName) {
                    this.highlightField(fieldName, series);
                }
            }, this);
        },

        highlightField: function(fieldName, series) {
            series = series || this.getSeriesByFieldName(fieldName);
            var objects = this.getSeriesLegendObjects(series),
                seriesColor = series.color;
            if(objects.item) {
                objects.item.attr('fill-opacity', this.HIGHLIGHTED_OPACITY);
            }
            if(objects.line) {
                objects.line.attr('stroke', seriesColor);
            }
            if(objects.symbol) {
                objects.symbol.attr({
                    'fill': seriesColor,
                    'stroke': seriesColor
                });
            }
        },

        unHighlightField: function(fieldName, series) {
            series = series || this.getSeriesByFieldName(fieldName);
            var objects = this.getSeriesLegendObjects(series);
            if(objects.item) {
                objects.item.attr('fill-opacity', this.UNHIGHLIGHTED_OPACITY);
            }
            if(objects.line) {
                objects.line.attr('stroke', this.UNHIGHLIGHTED_COLOR);
            }
            if(objects.symbol) {
                objects.symbol.attr({
                    'fill': this.UNHIGHLIGHTED_COLOR,
                    'stroke': this.UNHIGHLIGHTED_COLOR
                });
            }
        },

        getSeriesByFieldName: function(fieldName) {
            return _(this.hcSeriesList).find(function(series) { return series.name === fieldName; });
        },

        getSeriesLegendObjects: function(series) {
            var objects = {};

            if(series.legendItem) {
                objects.item = series.legendItem;
            }
            if(series.legendSymbol) {
                objects.symbol = series.legendSymbol;
            }
            if(series.legendLine) {
                objects.line = series.legendLine;
            }
            return objects;
        },

        destroy: function() {
            this.off();
            this.hcSeriesList = null;
        },

        /**
         * @author sfishel
         *
         * Do some intelligent ellipsizing of the legend labels (if needed) before they are rendered.
         */

        renderItemsPreHook: function(legend) {
            var i, adjusted, fixedWidth, maxWidth,
                options = legend.options,
                itemStyle = legend.itemStyle,
                items = legend.allItems,
                chart = legend.chart,
                renderer = chart.renderer,
                spacingBox = chart.spacingBox,
                horizontalLayout = (options.layout === 'horizontal'),
                defaultFontSize = 12,
                minFontSize = 10,
                symbolWidth = options.symbolWidth,
                symbolPadding = options.symbolPadding,
                boxPadding = legend.padding || 0,
                itemHorizSpacing = 10,
                labels = [],
                formatter = new Formatter(renderer);

            if(horizontalLayout) {
                maxWidth = (items.length > 5) ? Math.floor(spacingBox.width / 6) :
                    Math.floor(spacingBox.width / items.length) - ((symbolWidth + symbolPadding + itemHorizSpacing) * (items.length - 1));
            }
            else {
                maxWidth = Math.floor(spacingBox.width / 6) - (symbolWidth + symbolPadding + boxPadding);
            }

            // make a copy of the original formatting function, since we're going to clobber it
            if(!options.originalFormatter) {
                options.originalFormatter = options.labelFormatter;
            }
            // get all of the legend labels
            for(i = 0; i < items.length; i++) {
                labels.push(options.originalFormatter.call(items[i]));
            }

            adjusted = formatter.adjustLabels(labels, maxWidth, minFontSize, defaultFontSize, this.ellipsisMode);

            // in case of horizontal layout with ellipsized labels, set a fixed width for nice alignment
            if(adjusted.areEllipsized && horizontalLayout && items.length > 5) {
                fixedWidth = maxWidth + symbolWidth + symbolPadding + itemHorizSpacing;
                options.itemWidth = fixedWidth;
            }
            else {
                options.itemWidth = undefined;
            }

            // set the new labels to the name field of each item
            for(i = 0; i < items.length; i++) {
                items[i].ellipsizedName = adjusted.labels[i];
                // if the legendItem is already set this is a resize event, so we need to explicitly reformat the item
                if(items[i].legendItem) {
                    domUtils.setLegendItemText(items[i].legendItem, adjusted.labels[i]);
                    items[i].legendItem.css({ 'font-size': adjusted.fontSize + 'px' });
                }
            }
            // now that the ellipsizedName field has the pre-formatted labels, update the label formatter
            options.labelFormatter = function() {
                return parsingUtils.escapeSVG(this.ellipsizedName);
            };
            // adjust the font size
            itemStyle['font-size'] = adjusted.fontSize + 'px';
            formatter.destroy();
        },

        /**
         * @author sfishel
         *
         * Detect if the legend items will overflow the container (in which case navigation buttons will be shown)
         * and adjust the default values for the vertical positioning and width
         *
         * FIXME: it would be better to do this work after the nav has been rendered instead of
         * hard-coding an expected width
         */

        renderItemsPostHook: function(legend) {
            var NAV_WIDTH = 55,
                options = legend.options,
                padding = legend.padding,
                legendHeight = legend.lastItemY + legend.lastLineHeight,
                availableHeight = legend.chart.spacingBox.height - padding;

            if(legendHeight > availableHeight) {
                options.verticalAlign = 'top';
                options.y = -padding;
                if(legend.offsetWidth < NAV_WIDTH) {
                    options.width = NAV_WIDTH;
                }
            }
            else {
                // SPL-70551, make sure to set things back to defaults in case the chart was resized to a larger height
                var config = this.getConfig();
                $.extend(options, {
                    verticalAlign: config.verticalAlign,
                    y: config.y,
                    width: config.width
                });
            }
        }

    });

    return Legend;

});
define('js_charting/components/PanningScrollbar',['jquery', 'underscore', '../helpers/EventMixin'], function($, _, EventMixin) {

    var PanningScrollbar = function(properties){
        this.properties = properties || {};
    };

    PanningScrollbar.prototype = $.extend({}, EventMixin, {

        onChartLoad: function(chart){
            var parent = this.getParentElement(this.properties['container']);
            this.createPanningSlider(parent, chart);
            this.setSliderPosition(chart);
            this.addEventHandlers(chart);
        },

        onChartLoadOrResize: function(chart) {
            this.setSliderPosition(chart);
        },

        getParentElement: function(container){
            return $(container).parent();
        },

        createPanningSlider: function(parent){
            var $panning = $(".panning");
            if(!($panning.length > 0)) {
                $(parent).after('<div class="panning"></div>');
                $panning.append('<div id="panning-slider"></div>');
            }
        },

        addEventHandlers: function() {
            var that = this,
                panning = $('.panning'),
                delay= 50,
                onPanningScroll= function(){
                    that.setWindowToDisplay(that.pixelToWindowValue(panning));
                    that.trigger('scroll', that.getWindowToDisplay());
                };
            $(panning).bind('scroll', _.throttle(onPanningScroll, delay));
        },

        setSliderPosition: function(chart) {
            var pointsPlottedPerSeries = Math.ceil(this.properties.truncationLimit / (this.properties.numSeries)),
                ptsNotPlottedPerSeries = this.properties.seriesSize - pointsPlottedPerSeries;

            this.numWindows = Math.ceil(ptsNotPlottedPerSeries/pointsPlottedPerSeries);
            this.numberOfWindows = Math.ceil(ptsNotPlottedPerSeries - pointsPlottedPerSeries);

            $('.panning').css({
                'width': chart.plotWidth + 'px',
                'margin-left': chart.plotLeft + 'px',
                'margin-top': '2px',
                'overflow': 'scroll',
                'z-index': '100',
                'display': 'inline-block'
            });

            $('#panning-slider').css({
                'width': (this.numWindows*100) + '%',
                'height': '2px'
            });
        },

        pixelToWindowValue: function(panning){
            var currentPosition, scrollWidth,
                winLen;

            scrollWidth = $("#panning-slider").width();
            winLen = scrollWidth / this.numberOfWindows;
            currentPosition = $(panning).scrollLeft() + (winLen/2);
            return  Math.floor(currentPosition / winLen);
        },

        destroy: function() {
            this.off();
        },

        setWindowToDisplay: function(windowNumber){
            this.windowToDisplay = windowNumber;
        },

        getWindowToDisplay: function(){
            return this.windowToDisplay;
        }

    });

    return PanningScrollbar;

});
define('js_charting/components/Tooltip',['jquery', 'underscore'], function($, _) {

    var Tooltip = function(properties) {
        this.properties = properties || {};
    };

    Tooltip.prototype = {

        BASE_CONFIG: {
            animation: false,
            enabled: true,
            backgroundColor: '#000000',
            borderColor: '#ffffff',
            style: {
                color: '#cccccc'
            },
            /**
             * @author sfishel
             *
             * If the tooltip is too wide for the plot area, clip it left not right.
             *
             * unit test: js_charting/components/test_tooltip.html
             */
            positioner: function(boxWidth, boxHeight, point) {
                var position = this.getPosition(boxWidth, boxHeight, point),
                    plotWidth = this.chart.plotWidth;

                if(boxWidth > plotWidth) {
                    var options = this.options;
                    position.x = options.borderRadius + options.borderWidth;
                }
                return position;
            },
            /**
             * @author sfishel
             *
             * Adjust the tooltip anchor position for column charts.
             * Use a position relative to the selected column instead of a shared one for the series group.
             *
             * unit test: js_charting/components/test_tooltip.html
             */
            getAnchorPostHook: function(points, mouseEvent, anchor) {
                if(points && !_.isArray(points) && points.series.options.type === 'column') {
                    anchor[0] = points.barX;
                }
                return anchor;
            }
        },

        getConfig: function() {
            return $.extend(true, {}, this.BASE_CONFIG, {
                borderColor: this.properties['borderColor']
            });
        }

    };

    return Tooltip;

});
define('js_charting/series/Series',[
            'jquery',
            'underscore',
            '../helpers/EventMixin',
            '../util/color_utils',
            '../util/parsing_utils'
        ],
        function(
            $,
            _,
            EventMixin,
            colorUtils,
            parsingUtils
        ) {

    var Point = function(hcPoint) {
        this.index = hcPoint.index;
        this.seriesName = hcPoint.series.name;
        this.name = hcPoint.name;
        this.y = hcPoint.y;
    };

    var Series = function(properties) {
        this.properties = this.normalizeProperties(properties || {});
        this.id = _.uniqueId('series_');
        this.data = [];
        this.UNHIGHLIGHTED_COLOR =
            colorUtils.addAlphaToColor(this.UNHIGHLIGHTED_BASE_COLOR, this.UNHIGHLIGHTED_OPACITY);
    };

    Series.prototype = $.extend({}, EventMixin, {

        STACK_MODE_MAP: {
            'default': null,
            'stacked': 'normal',
            'stacked100': 'percent'
        },
        CHART_PROPERTY_PREFIX_REGEX: /^chart\./,

        UNHIGHLIGHTED_OPACITY: 0.3,
        UNHIGHLIGHTED_BASE_COLOR: 'rgb(150, 150, 150)',
        DEFAULT_STACK_MODE: null,
        CHARTING_PROPERTY_WHITELIST: [],

        // a centralized normalization method for series properties, subclasses override or extend the
        // CHARTING_PROPERTY_WHITELIST with a list of property names (without the leading "chart.")
        // to be parsed from the chart properties passed to the constructor
        normalizeProperties: function(rawProps) {
            var normalizedProps = $.extend(true, {}, rawProps);
            _(normalizedProps).each(function(value, key) {
                if(this.CHART_PROPERTY_PREFIX_REGEX.test(key)) {
                    delete normalizedProps[key];
                    var strippedKey = key.replace(this.CHART_PROPERTY_PREFIX_REGEX, '');
                    if(_(this.CHARTING_PROPERTY_WHITELIST).contains(strippedKey)) {
                        normalizedProps[strippedKey] = value;
                    }
                }
            }, this);
            return normalizedProps;
        },

        getXAxisIndex: function() {
            return this.properties['xAxis'] || 0;
        },

        setXAxisIndex: function(axisIndex) {
            this.properties['xAxis'] = axisIndex;
        },

        getYAxisIndex: function() {
            return this.properties['yAxis'] || 0;
        },

        setYAxisIndex: function(axisIndex) {
            this.properties['yAxis'] = axisIndex;
        },

        getName: function() {
            return this.properties['name'];
        },

        getLegendKey: function() {
            return this.properties['legendKey'] || this.getName();
        },

        getFieldList: function() {
            return [this.getName()];
        },

        matchesName: function(name) {
            return name === this.getName();
        },

        setData: function(inputData) {
            if(_(inputData.x).isUndefined()) {
                this.data = inputData.y;
            }
            else {
                this.data = _(inputData.x).map(function(value, i) {
                    return [value, inputData.y[i]];
                });
            }
        },

        sliceData: function(series, start, finish){
            series.data = series.data.slice(start, finish);
        },

        applyColorMapping: function(colorMapping) {
            this.color = colorMapping[this.getName()];
        },

        getColor: function() {
            return this.color;
        },

        getStackMode: function() {
            return this.STACK_MODE_MAP[this.properties['stacking']] || this.DEFAULT_STACK_MODE;
        },

        getType: function() {
            return this.type;
        },

        getConfig: function() {
            var that = this,
                config = {
                    type: this.type,
                    id: this.id,
                    name: this.getName(),
                    color: this.color,
                    data: this.data,
                    xAxis: this.getXAxisIndex(),
                    yAxis: this.getYAxisIndex(),
                    stacking: this.getStackMode(),
                    point: {
                        events: {
                            mouseOver: function(e) {
                                var hcPoint = this,
                                    point = new Point(hcPoint);
                                that.trigger('mouseover', [point, that]);
                            },
                            mouseOut: function(e) {
                                var hcPoint = this,
                                    point = new Point(hcPoint);
                                that.trigger('mouseout', [point, that]);
                            }
                        }
                    }
                };

            if(parsingUtils.normalizeBoolean(this.properties['clickEnabled'])) {
                config.point.events.click = function(e) {
                    var hcPoint = this,
                        point = new Point(hcPoint),
                        clickEvent = {
                            type: 'click',
                            modifierKey: (e.ctrlKey || e.metaKey)
                        };
                    that.trigger(clickEvent, [point, that]);
                };
            }

            return config;
        },

        onChartLoad: function(chart) {
            this.hcSeries = chart.get(this.id);

            // FIXME: would be nice to find a way around this
            _(this.hcSeries.data).each(function(point, i) {
                point.index = i;
            });
            // create a back-reference so we can get from the HighCharts series to this object
            this.hcSeries.splSeries = this;
        },

        destroy: function() {
            this.off();
            // remove the back-reference to avoid any reference loops that might confuse the GC
            if(this.hcSeries.splSeries) {
                this.hcSeries.splSeries = null;
            }
            this.hcSeries = null;
        },

        handlePointMouseOver: function(point) {
            this.bringToFront();
        },

        handleLegendMouseOver: function(fieldName) {
            this.bringToFront();
            this.highlight();
        },

        bringToFront: function() {
            if(this.hcSeries.group) {
                this.hcSeries.group.toFront();
            }
            if(this.hcSeries.trackerGroup) {
                this.hcSeries.trackerGroup.toFront();
            }
        },

        // find a way to send the target series and target point to the handler just like a click event
        getTooltipHtml: function(info) {
            info.seriesName = this.getName();
            info.seriesColor = this.getColor();
            return _(this.tooltipTemplate).template(info);
        },

        // stub methods to be overridden as needed by subclasses
        handlePointMouseOut: function(point) { },
        handleLegendMouseOut: function(fieldName) { },
        highlight: function() { },
        unHighlight: function() { },

        tooltipTemplate: '\
            <table class="highcharts-tooltip">\
                <% if(xAxisIsTime) { %>\
                    <tr>\
                        <td style="color: #ffffff;" colpsan="2" style="text-align: left"><%= xValueDisplay %></td>\
                    </tr>\
                <% } else { %>\
                    <tr>\
                        <td style="text-align: left; color: #cccccc;"><%= xAxisName %>:&nbsp;&nbsp;</td>\
                        <td style="text-align: right; color: #ffffff;"><%= xValueDisplay %></td>\
                    </tr>\
                <% } %>\
                    <tr>\
                        <td style="text-align: left; color:<%= seriesColor %>;"><%= seriesName %>:&nbsp;&nbsp;</td>\
                        <td style="text-align: right; color: #ffffff;"><%= yValueDisplay %></td>\
                    </tr>\
            </table>\
        '

    });

    Series.Point = Point;

    return Series;

});
define('js_charting/series/ManyShapeSeries',[
            'jquery',
            'underscore',
            './Series',
            '../util/lang_utils',
            '../util/color_utils'
        ], 
        function(
            $,
            _,
            Series,
            langUtils,
            colorUtils
        ) {

    var ManyShapeSeries = function(properties) {
        Series.call(this, properties);
        this.UNHIGHLIGHTED_BORDER_COLOR =
            colorUtils.addAlphaToColor(this.UNHIGHLIGHTED_BORDER_BASE_COLOR, this.UNHIGHLIGHTED_OPACITY);
    };
    langUtils.inherit(ManyShapeSeries, Series);

    $.extend(ManyShapeSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST:_.union(['seriesSpacing'], Series.prototype.CHARTING_PROPERTY_WHITELIST),

        UNHIGHLIGHTED_BORDER_BASE_COLOR: 'rgb(200, 200, 200)',
        DEFAULT_COLUMN_SPACING: 0.01,
        DEFAULT_COLUMN_GROUP_SPACING: 0.05,
        DEFAULT_BAR_SPACING: 0.02,
        DEFAULT_BAR_GROUP_SPACING: 0.05,

        handlePointMouseOver: function(point) {
            Series.prototype.handlePointMouseOver.call(this, point);
            this.selectPoint(point);
        },

        handlePointMouseOut: function(point) {
            Series.prototype.handlePointMouseOut.call(this, point);
            this.unSelectPoint(point);
        },

        highlight: function() {
            Series.prototype.highlight.call(this);
            _(this.hcSeries.data).each(this.highlightPoint, this);
        },

        unHighlight: function() {
            Series.prototype.unHighlight.call(this);
            _(this.hcSeries.data).each(this.unHighlightPoint, this);
        },

        selectPoint: function(point) {
            var matchingPoint = this.hcSeries.data[point.index];
            this.highlightPoint(matchingPoint);
            _(this.hcSeries.data).chain().without(matchingPoint).each(this.unHighlightPoint, this);
        },

        unSelectPoint: function(point) {
            var matchingPoint = this.hcSeries.data[point.index];
            _(this.hcSeries.data).chain().without(matchingPoint).each(this.highlightPoint, this);
        },

        highlightPoint: function(hcPoint) {
            if(!hcPoint.graphic) {
                return;
            }
            var seriesColor = this.getColor();
            hcPoint.graphic.attr({
                'fill': seriesColor,
                'stroke-width': 0,
                'stroke': seriesColor
            });
        },

        unHighlightPoint: function(hcPoint) {
            if(!hcPoint.graphic) {
                return;
            }
            hcPoint.graphic.attr({
                'fill': this.UNHIGHLIGHTED_COLOR,
                'stroke-width': 1,
                'stroke': this.UNHIGHLIGHTED_BORDER_COLOR
            });
        },

        computeColumnSpacing: function(str) {
            var value = parseFloat(str);
            if(_(value).isNaN()) {
                return this.DEFAULT_COLUMN_SPACING;
            }
            return value * this.DEFAULT_COLUMN_SPACING;
        },

        computeColumnGroupSpacing: function(str) {
            var value = parseFloat(str);
            if(_(value).isNaN()) {
                return this.DEFAULT_COLUMN_GROUP_SPACING;
            }
            return this.DEFAULT_COLUMN_GROUP_SPACING * (1 + value);
        },

        computeBarSpacing: function(str) {
            var value = parseFloat(str);
            if(_(value).isNaN()) {
                return this.DEFAULT_BAR_SPACING;
            }
            return value * this.DEFAULT_BAR_SPACING;
        },

        computeBarGroupSpacing: function(str) {
            var value = parseFloat(str);
            if(_(value).isNaN()) {
                return this.DEFAULT_BAR_GROUP_SPACING;
            }
            return this.DEFAULT_BAR_GROUP_SPACING * (1 + value);
        }

    });

    return ManyShapeSeries;
    
});
define('js_charting/series/ColumnSeries',[
            'jquery',
            'underscore',
            './ManyShapeSeries',
            '../util/lang_utils'
        ],
        function(
            $,
            _,
            ManyShapeSeries,
            langUtils
        ) {

    var ColumnSeries = function(properties) {
        ManyShapeSeries.call(this, properties);
    };
    langUtils.inherit(ColumnSeries, ManyShapeSeries);

    $.extend(ColumnSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST: _.union(['columnSpacing'], ManyShapeSeries.prototype.CHARTING_PROPERTY_WHITELIST),

        type: 'column',

        getConfig: function() {
            var config = ManyShapeSeries.prototype.getConfig.call(this);
            config.pointPadding = this.computeColumnSpacing(this.properties['columnSpacing']);
            config.groupPadding = this.computeColumnGroupSpacing(this.properties['seriesSpacing']);
            return config;
        },

        // SPL-68694, this should be a no-op for column series or it will interfere with click handlers
        bringToFront: function() { }

    });

    return ColumnSeries;

});
define('js_charting/series/BarSeries',[
            'jquery',
            'underscore',
            './ManyShapeSeries',
            '../util/lang_utils'
        ],
        function(
            $,
            _,
            ManyShapeSeries,
            langUtils
        ) {

    var BarSeries = function(properties) {
        ManyShapeSeries.call(this, properties);
    };
    langUtils.inherit(BarSeries, ManyShapeSeries);

    $.extend(BarSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST: _.union(['barSpacing'], ManyShapeSeries.prototype.CHARTING_PROPERTY_WHITELIST),

        type: 'bar',

        getConfig: function() {
            var config = ManyShapeSeries.prototype.getConfig.call(this);
            config.pointPadding = this.computeBarSpacing(this.properties['barSpacing']);
            config.groupPadding = this.computeBarGroupSpacing(this.properties['seriesSpacing']);
            return config;
        },

        // SPL-68694, this should be a no-op for bar series or it will interfere with click handlers
        bringToFront: function() { }

    });

    return BarSeries;

});
define('js_charting/series/SingleShapeSeries',[
            'jquery',
            'underscore',
            './Series',
            '../util/lang_utils'
        ],
        function(
            $,
            _,
            Series,
            langUtils
        ) {

    var SingleShapeSeries = function(properties) {
        Series.call(this, properties);
    };
    langUtils.inherit(SingleShapeSeries, Series);

    $.extend(SingleShapeSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST:_.union(
            ['lineStyle', 'nullValueMode'],
            Series.prototype.CHARTING_PROPERTY_WHITELIST
        ),

        HIGHLIGHTED_OPACITY: 1.0,

        getConfig: function() {
            var config = Series.prototype.getConfig.call(this);
            config.dashStyle = (this.properties['lineStyle'] === 'dashed') ? 'Dash' : 'Solid';
            config.pointPlacement = 'on';
            config.drawPointsPreHook = _(this.drawPointsPreHook).bind(this);
            return config;
        },

        handlePointMouseOver: function(point) {
            Series.prototype.handlePointMouseOver.call(this, point);
            this.highlight();
        },

        drawPointsPreHook: function(series) {
            // SPL-55213, we want to handle the case where some segments contain a single point and would not be visible
            // if showMarkers is true, the marker will take care of what we want, so we're done
            if(series.options.marker && series.options.marker.enabled) {
                return;
            }
            var i, segment,
                segments = series.segments;

            for(i = 0; i < segments.length; i++) {
                // a segments with a length of one contains a single point
                // extend the point's options to draw a small marker on it
                segment = segments[i];
                if(segment.length === 1) {
                    segment[0].update({
                        marker: {
                            enabled: true,
                            radius: 4
                        }
                    }, false);
                }
            }
        }

    });

    return SingleShapeSeries;

});
define('js_charting/series/LineSeries',[
            'jquery',
            'underscore',
            './SingleShapeSeries',
            '../util/lang_utils',
            '../util/parsing_utils'
        ],
        function(
            $,
            _,
            SingleShapeSeries,
            langUtils,
            parsingUtils
        ) {

    var LineSeries = function(properties) {
        SingleShapeSeries.call(this, properties);
    };
    langUtils.inherit(LineSeries, SingleShapeSeries);

    $.extend(LineSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST:_.union(['showMarkers'], SingleShapeSeries.prototype.CHARTING_PROPERTY_WHITELIST),

        type: 'line',

        onChartLoad: function(chart) {
            SingleShapeSeries.prototype.onChartLoad.call(this, chart);
            this.hasMarkers = (this.hcSeries.options.marker.enabled
                && this.hcSeries.options.marker.radius > 0);
        },

        highlight: function() {
            SingleShapeSeries.prototype.highlight.call(this);
            var seriesColor = this.getColor();
            this.hcSeries.graph.attr({
                'stroke': seriesColor,
                'stroke-opacity': this.HIGHLIGHTED_OPACITY
            });
            _(this.hcSeries.data).each(this.highlightPoint, this);
        },

        unHighlight: function() {
            SingleShapeSeries.prototype.unHighlight.call(this);
            this.hcSeries.graph.attr('stroke', this.UNHIGHLIGHTED_COLOR);
            _(this.hcSeries.data).each(this.unHighlightPoint, this);
        },

        highlightPoint: function(hcPoint) {
            var seriesColor = this.getColor();
            if(hcPoint.graphic) {
                hcPoint.graphic.attr('fill', seriesColor);
            }
        },

        unHighlightPoint: function(hcPoint) {
            if(hcPoint.graphic) {
                hcPoint.graphic.attr('fill', this.UNHIGHLIGHTED_COLOR);
            }
        },

        getConfig: function() {
            var config = SingleShapeSeries.prototype.getConfig.call(this);
            config.connectNulls = (this.properties['nullValueMode'] === 'connect');
            $.extend(config,{
                marker: {},
                stacking: this.STACK_MODE_MAP['default']
            });

            config.marker.enabled = parsingUtils.normalizeBoolean(this.properties['showMarkers'], false);

            return config;
        }

    });

    return LineSeries;

});
define('js_charting/series/AreaSeries',[
            'jquery',
            'underscore',
            './SingleShapeSeries',
            '../util/lang_utils',
            '../util/color_utils',
            '../util/parsing_utils'
        ], 
        function(
            $,
            _,
            SingleShapeSeries,
            langUtils,
            colorUtils,
            parsingUtils
        ) {

    var AreaSeries = function(properties) {
        SingleShapeSeries.call(this, properties);
        this.UNHIGHLIGHTED_LINE_COLOR =
            colorUtils.addAlphaToColor(this.UNHIGHLIGHTED_BASE_COLOR, this.UNHIGHLIGHTED_LINE_OPACITY);
    };
    langUtils.inherit(AreaSeries, SingleShapeSeries);

    $.extend(AreaSeries.prototype, {

        HIGHLIGHTED_OPACITY: 0.75,
        UNHIGHLIGHTED_LINE_OPACITY: 0.4,

        CHARTING_PROPERTY_WHITELIST:_.union(['showLines'], SingleShapeSeries.prototype.CHARTING_PROPERTY_WHITELIST),

        type: 'area',

        getConfig: function() {
            var config = SingleShapeSeries.prototype.getConfig.call(this);
            config.fillOpacity = this.HIGHLIGHTED_OPACITY;
            config.connectNulls = (this.properties['nullValueMode'] === 'connect');
            config.lineWidth = parsingUtils.normalizeBoolean(this.properties['showLines'], true) ? 1 : 0;
            return config;
        },

        onChartLoad: function(chart) {
            SingleShapeSeries.prototype.onChartLoad.call(this, chart);
            this.hasLines = (this.hcSeries.options.lineWidth > 0);
            // FIXME: shouldn't have to do this here, try to make it work with highcharts settings
            this.hcSeries.area.attr('fill-opacity', this.HIGHLIGHTED_OPACITY);
        },

        highlight: function() {
            SingleShapeSeries.prototype.highlight.call(this);
            var seriesColor = this.getColor();
            this.hcSeries.area.attr({
                'fill': seriesColor,
                'fill-opacity': this.HIGHLIGHTED_OPACITY
            });
            if(this.hasLines) {
                this.hcSeries.graph.attr({
                    'stroke': seriesColor,
                    'stroke-opacity': 1
                });
            }
        },

        unHighlight: function() {
            SingleShapeSeries.prototype.unHighlight.call(this);
            this.hcSeries.area.attr('fill', this.UNHIGHLIGHTED_COLOR);
            if(this.hasLines) {
                this.hcSeries.graph.attr('stroke', this.UNHIGHLIGHTED_LINE_COLOR);
            }
        }

    });

    return AreaSeries;

});
define('js_charting/series/PieSeries',[
            'jquery',
            'underscore',
            './ManyShapeSeries',
            '../util/lang_utils',
            '../util/parsing_utils',
            'splunk.i18n'
        ], 
        function(
            $,
            _,
            ManyShapeSeries,
            langUtils,
            parsingUtils,
            i18n
        ) {

    var PieSeries = function(properties) {
        ManyShapeSeries.call(this, properties);
        this.collapseFieldName = this.properties.sliceCollapsingLabel || 'other';
        this.collapsePercent = !this.properties.hasOwnProperty('sliceCollapsingThreshold') ? 0.01 :
                                    parseFloat(this.properties.sliceCollapsingThreshold);
    };
    langUtils.inherit(PieSeries, ManyShapeSeries);

    $.extend(PieSeries.prototype, {

        CHARTING_PROPERTY_WHITELIST:_.union(
            ['sliceCollapsingThreshold', 'sliceCollapsingLabel', 'showPercent'],
            ManyShapeSeries.prototype.CHARTING_PROPERTY_WHITELIST
        ),

        type: 'pie',

        fieldList: [],

        getConfig: function() {
            return $.extend(ManyShapeSeries.prototype.getConfig.call(this), {
                translatePreHook: _(this.translatePreHook).bind(this)
            });
        },

        setData: function(inputData) {
            this.data = [];
            var that = this,
                nameSeries = inputData.names,
                sizeSeries = inputData.sizes,
                totalSize = _(sizeSeries).reduce(function(sum, value) { return (sum + value); }, 0),
                cardinality = sizeSeries.length,
                collapsedSize = 0,
                numCollapsed = 0,
                numLessThanThresh = 0,

                passesThreshold = function(value) {
                    return (value > 0 && (value / totalSize) > that.collapsePercent);
                };

            this.fieldList = _(nameSeries).map(parsingUtils.escapeSVG, parsingUtils);
            _(sizeSeries).each(function(value, i) {
                if(!(passesThreshold(sizeSeries[i]))) {
                    numLessThanThresh++;
                }
            }, this);

            _(nameSeries).each(function(name, i) {
                var sizeValue = sizeSeries[i];
                if(passesThreshold(sizeValue) || numLessThanThresh === 1 || cardinality <=10) {
                    this.data.push([name, sizeValue]);
                }
                else {
                    collapsedSize += sizeValue;
                    numCollapsed++;
                    this.fieldList = _(this.fieldList).without(name);
                }
            }, this);

            if(numCollapsed > 0) {
                var collapsedName = this.collapseFieldName + ' (' + numCollapsed + ')';
                this.data.push([collapsedName, collapsedSize]);
                this.fieldList.push('__other');
            }

            if(parsingUtils.normalizeBoolean(this.properties.showPercent)) {
                _(this.data).each(function(dataPoint) {
                    dataPoint[0] += ', ' + i18n.format_percent(dataPoint[1] / totalSize);
                });
            }

        },

        getFieldList: function() {
            return this.fieldList;
        },

        // returns the series data after any processing (like slice collapsing) has been applied
        getData: function() {
            return this.data;
        },

        highlightPoint: function(hcPoint) {
            var pointColor = hcPoint.color;
            hcPoint.graphic.attr({
                'fill': pointColor,
                'stroke-width': 0,
                'stroke': pointColor
            });
        },

        /**
         * @author sfishel
         *
         * Dynamically adjust the pie size based on the height and width of the container
         */

        translatePreHook: function(pieSeries) {
            var chart = pieSeries.chart;
            pieSeries.options.size = Math.min(chart.plotHeight * 0.75, chart.plotWidth / 3);
        },

        tooltipTemplate: '\
            <table class="highcharts-tooltip">\
                <tr>\
                    <td style="text-align: left; color: #cccccc;"><%= sliceFieldName %>:&nbsp;&nbsp;</td>\
                    <td style="text-align: right; color: #ffffff;"><%= sliceName %></td>\
                </tr>\
                <tr>\
                    <td style="text-align: left; color: <%= sliceColor %>;"><%= seriesName %>:&nbsp;&nbsp;</td>\
                    <td style="text-align: right; color: #ffffff;"><%= yValue %></td>\
                </tr>\
                <tr>\
                    <td style="text-align: left; color: <%= sliceColor %>;"><%= seriesName %>%:&nbsp;&nbsp;</td>\
                    <td style="text-align: right; color: #ffffff"><%= yPercent %></td>\
                </tr>\
            </table>\
        '

    });
    
    return PieSeries;
    
});
define('js_charting/series/MultiSeries',[
            'jquery',
            'underscore',
            './Series',
            '../util/lang_utils'
        ], 
        function(
            $,
            _,
            Series,
            langUtils
        ) {

    var MultiSeries = function(properties) {
        Series.call(this, properties);
        this.nestedSeriesList = [];
    };
    langUtils.inherit(MultiSeries, Series);

    $.extend(MultiSeries.prototype, {

        getFieldList: function() {
            return _(this.nestedSeriesList).invoke('getFieldList');
        },

        applyColorMapping: function(colorMapping) {
            _(this.nestedSeriesList).invoke('applyColorMapping', colorMapping);
        },

        matchesName: function(name) {
            return _(this.nestedSeriesList).any(function(series) {
                return series.matchesName(name);
            });
        },

        getConfig: function() {
            return _(this.nestedSeriesList).invoke('getConfig');
        },

        bindNestedSeries: function() {
            var that = this;
            _(this.nestedSeriesList).each(function(series) {
                series.on('mouseover', function(e, point, targetSeries) {
                    that.trigger(e, [point, targetSeries]);
                });
                series.on('mouseout', function(e, point, targetSeries) {
                    that.trigger(e, [point, targetSeries]);
                });
                series.on('click', function(e, point, targetSeries) {
                    that.trigger(e, [point, targetSeries]);
                });
            });
        },

        handlePointMouseOver: function(point) {
            var seriesName = point.seriesName;
            _(this.nestedSeriesList).each(function(series) {
                if(series.matchesName(seriesName)) {
                    series.handlePointMouseOver(point);
                }
                else {
                    series.unHighlight();
                }
            });
        },

        handlePointMouseOut: function(point) {
            var seriesName = point.seriesName;
            _(this.nestedSeriesList).each(function(series) {
                if(series.matchesName(seriesName)) {
                    series.handlePointMouseOut(point);
                }
                else {
                    series.highlight();
                }
            });
        },

        handleLegendMouseOver: function(fieldName) {
            _(this.nestedSeriesList).each(function(series) {
                if(series.matchesName(fieldName)) {
                    series.handleLegendMouseOver(fieldName);
                }
                else {
                    series.unHighlight();
                }
            });
        },

        handleLegendMouseOut: function(fieldName) {
            _(this.nestedSeriesList).each(function(series) {
                if(series.matchesName(fieldName)) {
                    series.handleLegendMouseOut(fieldName);
                }
                else {
                    series.highlight();
                }
            });
        },

        onChartLoad: function(chart) {
            _(this.nestedSeriesList).invoke('onChartLoad', chart);
        },

        destroy: function() {
            this.off();
            _(this.nestedSeriesList).invoke('destroy');
        },

        bringToFront: function() {
            _(this.nestedSeriesList).invoke('bringToFront');
        },

        highlight: function() {
            _(this.nestedSeriesList).invoke('highlight');
        },

        unHighlight: function() {
            _(this.nestedSeriesList).invoke('unHighlight');
        }

    });

    return MultiSeries;

});
define('js_charting/series/ScatterSeries',['jquery', './ManyShapeSeries', '../util/lang_utils'], function($, ManyShapeSeries, langUtils) {

    var ScatterSeries = function(properties) {
        ManyShapeSeries.call(this, properties);
    };
    langUtils.inherit(ScatterSeries, ManyShapeSeries);

    $.extend(ScatterSeries.prototype, {

        type: 'scatter',

        tooltipTemplate: '\
            <table class="highcharts-tooltip">\
                <% if(isMultiSeries) { %>\
                    <tr>\
                        <td style="text-align: left; color: #cccccc;"><%= labelSeriesName %>:&nbsp;&nbsp;</td>\
                        <td style="text-align: right; color:<%= seriesColor %>;"><%= seriesName %></td>\
                    </tr>\
                <% } %>\
                <tr>\
                    <td style="text-align: left; color: #cccccc;"><%= xAxisName %>:&nbsp;&nbsp;</td>\
                    <td style="text-align: right; color: #ffffff;"><%= xValue %></td>\
                </tr>\
                <tr>\
                    <td style="text-align: left; color: #cccccc;"><%= yAxisName %>:&nbsp;&nbsp;</td>\
                    <td style="text-align: right; color: #ffffff;"><%= yValue %></td>\
                </tr>\
            </table>\
        '

    });

    return ScatterSeries;

});
define('js_charting/series/MultiScatterSeries',[
            'jquery',
            'underscore',
            './MultiSeries',
            './ScatterSeries',
            '../util/lang_utils'
        ],
        function(
            $,
            _,
            MultiSeries,
            ScatterSeries,
            langUtils
        ) {

    var MultiScatterSeries = function(properties) {
        MultiSeries.call(this, properties);
        this.nestedSeriesList = [];
    };
    langUtils.inherit(MultiScatterSeries, MultiSeries);

    $.extend(MultiScatterSeries.prototype, {

        setData: function(inputData) {

            var filterDataByNameMatch = function(dataSeries, name) {
                return _(dataSeries).filter(function(point, i) {
                    return inputData.labels[i] === name;
                });
            };

            this.nestedSeriesList = _(inputData.labels).chain()
                .uniq()
                .filter(function(name) {
                    return !!name;
                })
                .map(function(name) {
                    var seriesProps = {
                        name: name,
                        type: 'scatter',
                        clickEnabled: this.properties['clickEnabled']
                    };
                    return new ScatterSeries(seriesProps);
                }, this)
                .value();

            _(this.nestedSeriesList).each(function(series) {
                series.setData({
                    x: filterDataByNameMatch(inputData.x, series.getName()),
                    y: filterDataByNameMatch(inputData.y, series.getName())
                });
            }, this);

            this.bindNestedSeries();
        }

    });

    return MultiScatterSeries;

});
define('js_charting/series/RangeSeries',[
            'jquery',
            'underscore',
            './AreaSeries',
            './LineSeries',
            './MultiSeries',
            '../util/lang_utils'
        ], 
        function(
            $,
            _,
            AreaSeries,
            LineSeries,
            MultiSeries,
            langUtils
        ) {

    var LowerRangeSeries = function(properties) {
        this.threshold = 0;
        AreaSeries.call(this, $.extend({}, properties, {
            lineStyle: 'dashed',
            stacking: 'stacked'
        }));
    };
    langUtils.inherit(LowerRangeSeries, AreaSeries);

    $.extend(LowerRangeSeries.prototype, {

        HIGHLIGHTED_OPACITY: 0,
        UNHIGHLIGHTED_OPACITY: 0,
        UNHIGHLIGHTED_LINE_OPACITY: 0.25,

        setData: function(inputData) {
            AreaSeries.prototype.setData.call(this, inputData);
            var minValue = _(inputData.y).min();
            this.threshold = Math.min(minValue, 0);
        },

        getConfig: function() {
            var config = AreaSeries.prototype.getConfig.call(this);
            config.showInLegend = false;
            config.threshold = this.threshold;
            return config;
        }

    });

    var UpperRangeSeries = function(properties) {
        AreaSeries.call(this, $.extend({}, properties, {
            lineStyle: 'dashed',
            stacking: 'stacked'
        }));
    };
    langUtils.inherit(UpperRangeSeries, AreaSeries);

    $.extend(UpperRangeSeries.prototype, {

        HIGHLIGHTED_OPACITY: 0.25,
        UNHIGHLIGHTED_OPACITY: 0.1,
        UNHIGHLIGHTED_LINE_OPACITY: 0.25,

        getConfig: function() {
            var config = AreaSeries.prototype.getConfig.call(this);
            config.showInLegend = false;
            return config;
        }

    });

    var RangeSeries = function(properties) {
        MultiSeries.call(this, properties);
        this.rangeStackId = _.uniqueId('rangeStack_');

        this.predictedSeries = new LineSeries(properties);
        this.lowerSeries = new LowerRangeSeries($.extend({}, properties, {
            name: properties.names.lower,
            legendKey: this.predictedSeries.getLegendKey(),
            stack: this.rangeStackId
        }));
        this.upperSeries = new UpperRangeSeries($.extend({}, properties, {
            name: properties.names.upper,
            legendKey: this.predictedSeries.getLegendKey(),
            stack: this.rangeStackId
        }));
        this.nestedSeriesList = [this.predictedSeries, this.upperSeries, this.lowerSeries];
        this.bindNestedSeries();
    };
    langUtils.inherit(RangeSeries, MultiSeries);

    $.extend(RangeSeries.prototype, {

        type: 'range',

        getFieldList: function() {
            return this.predictedSeries.getFieldList();
        },

        // to get the right color effects, we have to force the upper and lower series
        // to take on the same color as the predicted series
        applyColorMapping: function(colorMapping) {
            this.predictedSeries.applyColorMapping(colorMapping);
            var predictedColor = this.predictedSeries.getColor(),
                lowerSeriesColorMapping = {},
                upperSeriesColorMapping = {};

            lowerSeriesColorMapping[this.lowerSeries.getName()] = predictedColor;
            this.lowerSeries.applyColorMapping(lowerSeriesColorMapping);

            upperSeriesColorMapping[this.upperSeries.getName()] = predictedColor;
            this.upperSeries.applyColorMapping(upperSeriesColorMapping);
        },

        setData: function(inputData) {
            this.predictedSeries.setData({
                y: inputData.predicted,
                x: inputData.x
            });
            this.lowerSeries.setData({
                y: inputData.lower,
                x: inputData.x
            });

            // TODO: will this work for log scale?
            inputData.upper = _(inputData.upper).map(function(point, i) {
                if(_(point).isNull()) {
                    return null;
                }
                var diff = point - inputData.lower[i];
                return Math.max(diff, 0);
            });
            this.upperSeries.setData({
                y: inputData.upper,
                x: inputData.x
            });
        },

        handlePointMouseOver: function(point) {
            this.bringToFront();
            this.highlight();
        },

        handlePointMouseOut: function(point) { },

        handleLegendMouseOver: function(fieldName) {
            this.bringToFront();
            this.highlight();
        },

        handleLegendMouseOut: function(fieldName) { }

    });
    
    return RangeSeries;
    
});
define('js_charting/series/series_factory',[
            './ColumnSeries',
            './BarSeries',
            './LineSeries',
            './AreaSeries',
            './PieSeries',
            './MultiScatterSeries',
            './ScatterSeries',
            './RangeSeries'
            
        ], 
        function(
            ColumnSeries,
            BarSeries,
            LineSeries,
            AreaSeries,
            PieSeries,
            MultiScatterSeries,
            ScatterSeries,
            RangeSeries
        ) {

    return ({

        create: function(properties) {
            if(properties.type === 'column') {
                return new ColumnSeries(properties);
            }
            if(properties.type === 'bar') {
                return new BarSeries(properties);
            }
            if(properties.type === 'line') {
                return new LineSeries(properties);
            }
            if(properties.type === 'area') {
                return new AreaSeries(properties);
            }
            if(properties.type === 'pie') {
                return new PieSeries(properties);
            }
            if(properties.type === 'scatter') {
                if(properties.multiScatter === true) {
                    return new MultiScatterSeries(properties);
                }
                return new ScatterSeries(properties);
            }
            if(properties.type === 'range') {
                return new RangeSeries(properties);
            }
            return new ColumnSeries(properties);
        }

    });

});
define('js_charting/util/testing_utils',[
            'jquery',
            'underscore',
            'splunk',
            './dom_utils'
        ],
        function(
            $,
            _,
            Splunk,
            domUtils
        ) {

    var initializeTestingMetaData = function(chartWrapper, xFields, type){
        // make sure the wrapper container has an id, this will be used in createGlobalReference
        if(!chartWrapper.$container.attr('id')) {
            chartWrapper.$container.attr('id', chartWrapper.id);
        }
        var chart = chartWrapper.hcChart;
        $(chart.container).addClass(type);
        addDataClasses(chart);
        addAxisClasses(chart);
        if(chart.options.legend.enabled) {
            addLegendClasses(chart);
        }
        if(chart.tooltip && chart.tooltip.refresh) {
            var tooltipRefresh = chart.tooltip.refresh,
                decorateTooltip = (_.find(xFields, function(field){ return (field === '_time'); }) === '_time') ?
                                        addTimeTooltipClasses : addTooltipClasses;

            chart.tooltip.refresh = function(point) {
                tooltipRefresh.call(chart.tooltip, point);
                decorateTooltip(chart);
            };
        }
    };

    var addDataClasses = function(chart) {
        var that = this,
            seriesName, 
            dataElements;

        $('.highcharts-series', $(chart.container)).each(function(i, series) {
            seriesName = chart.series[i].name;
            $(series).attr('id', seriesName + '-series');
            if(domUtils.hasSVG) {
                dataElements = $('rect, path', $(series));
            }
            else {
                dataElements = $('shape', $(series));
            }
            dataElements.each(function(j, elem) {
                addClassToElement(elem, 'spl-display-object');
            });
        });
    };

    var addAxisClasses = function(chart) {
        var that = this,
            i, 
            labelElements;

        $('.highcharts-axis, .highcharts-axis-labels', $(chart.container)).each(function(i, elem) {
            if(domUtils.hasSVG) {
                var loopBBox = elem.getBBox();
                if(loopBBox.width > loopBBox.height) {
                    addClassToElement(elem, 'horizontal-axis');
                }
                else {
                    addClassToElement(elem, 'vertical-axis');
                }
                labelElements = $('text', $(elem));
            }
            else {
                var firstSpan, secondSpan,
                    $spans = $('span', $(elem));
                if($spans.length < 2) {
                    return;
                }
                firstSpan = $spans[0];
                secondSpan = $spans[1];
                if(firstSpan.style.top == secondSpan.style.top) {
                    addClassToElement(elem, 'horizontal-axis');
                }
                else {
                    addClassToElement(elem, 'vertical-axis');
                }
                labelElements = $('span', $(elem));
            }
            labelElements.each(function(j, label) {
                addClassToElement(label, 'spl-text-label');
            });
        });

        for(i = 0; i < chart.xAxis.length; i++) {
            if(chart.xAxis[i].axisTitle) {
                addClassToElement(chart.xAxis[i].axisTitle.element, 'x-axis-title');
            }
        }
        for(i = 0; i < chart.yAxis.length; i++) {
            if(chart.yAxis[i].axisTitle) {
                addClassToElement(chart.yAxis[i].axisTitle.element, 'y-axis-title');
            }
        }
    };

    var addTooltipClasses = function(chart) {
        var i, loopSplit, loopKeyName, loopKeyElem, loopValElem, toolTipCells,
            $tooltip = $('.highcharts-tooltip'),
            tooltipElements = $('tr', $tooltip);

        for(i = 0; i < tooltipElements.length; i++) {
            toolTipCells = $('td', tooltipElements[i]);
            loopSplit = tooltipElements[i].textContent.split(':');
            $(toolTipCells[0]).addClass('key');
            $(toolTipCells[0]).addClass(sanitizeClassName(loopSplit[0] + '-key'));
            $(toolTipCells[1]).addClass('value');
            $(toolTipCells[1]).addClass(sanitizeClassName(loopSplit[0] + '-value'));
        }
    };
    
    var addTimeTooltipClasses = function(chart) {
        var that = this,
            i, loopSplit, loopKeyName, loopKeyElem, loopValElem, toolTipCells,
            $tooltip = $('.highcharts-tooltip'),
            tooltipElements = $('tr', $tooltip);
        
        for(i = 0; i < tooltipElements.length; i++) {
            toolTipCells = $('td', tooltipElements[i]);
            if(i===0){
                $(toolTipCells[0]).addClass('time-value');
                $(toolTipCells[0]).addClass('time');
            } else {
                loopSplit = tooltipElements[i].textContent.split(':');
                $(toolTipCells[0]).addClass('key');
                $(toolTipCells[0]).addClass(sanitizeClassName(loopSplit[0] + '-key'));
                $(toolTipCells[1]).addClass('value');
                $(toolTipCells[1]).addClass(sanitizeClassName(loopSplit[0] + '-value'));
            }
        }
    };

    var addLegendClasses = function(chart) {
        var that = this,
            loopSeriesName;
        $(chart.series).each(function(i, series) {
            if(!series.legendItem) {
                return;
            }
            loopSeriesName = (domUtils.hasSVG) ? series.legendItem.textStr : 
                                             $(series.legendItem.element).html();
            if(series.legendSymbol) {
                addClassToElement(series.legendSymbol.element, 'symbol');
                addClassToElement(series.legendSymbol.element, loopSeriesName + '-symbol');
            }
            if(series.legendLine) {
                addClassToElement(series.legendLine.element, 'symbol');
                addClassToElement(series.legendLine.element, loopSeriesName + '-symbol');
            }
            if(series.legendItem) {
                addClassToElement(series.legendItem.element, 'legend-label');
            }
        });
    };

    var addClassToElement = function(elem, className) {
        className = sanitizeClassName(className);
        if(className === '') {
            return;
        }
        if(domUtils.hasSVG) {
            if(elem.className.baseVal) {
                elem.className.baseVal += " " + className;
            }
            else {
                elem.className.baseVal = className;
            }
        }
        else {
            $(elem).addClass(className);
        }
    };

    var sanitizeClassName = function(className) {
        // the className can potentially come from the search results, so make sure it is valid before
        // attempting to insert it...

        // first remove any leading white space
        className = className.replace(/\s/g, '');
        // if the className doesn't start with a letter or a '-' followed by a letter, it should not be inserted
        if(!/^[-]?[A-Za-z]/.test(className)) {
            return '';
        }
        // now filter out anything that is not a letter, number, '-', or '_'
        return className.replace(/[^A-Za-z0-9_-]/g, "");
    };

    //////////////////////////
    // Gauge specific testing

    var gaugeAddTestingMetadata = function(gaugeWrapper, elements, typeName, value) {
        // make sure the wrapper container has an id, this will be used in createGlobalReference
        if(!gaugeWrapper.$container.attr('id')) {
            gaugeWrapper.$container.attr('id', gaugeWrapper.id);
        }
        var innerContainer = gaugeWrapper.$hcContainer;
        innerContainer.addClass(typeName);
        gaugeUpdate(innerContainer, value);
        if(elements.valueDisplay) {
            addClassToElement(elements.valueDisplay.element, 'gauge-value');
        }
        var key;
        for(key in elements) {
            if(/^tickLabel_/.test(key)) {
                addClassToElement(elements[key].element, 'gauge-tick-label');
            }
        }
        for(key in elements) {
            if(/^colorBand/.test(key)){
                addClassToElement(elements[key].element, 'gauge-color-band');
            }
        }
        $('.gauge-color-band').each(function() {
            $(this).attr('data-band-color', $(this).attr('fill'));
        });

        // this is bad OOP but I think it's better to keep all of this code in one method
        if(elements.fill){
            $(elements.fill.element).attr('data-indicator-color', $(elements.fill.element).attr('fill'));
        }
        if(elements.needle) {
            addClassToElement(elements.needle.element, 'gauge-indicator');
        }
        if(elements.markerLine) {
            addClassToElement(elements.markerLine.element, 'gauge-indicator');
        }
    };

    var gaugeUpdate = function(container, value){
        container.attr('data-gauge-value', value);
    };

    var createGlobalReference = function(wrapperObject, chartObject) {
        Splunk.JSCharting = Splunk.JSCharting || {};
        Splunk.JSCharting.chartByIdMap = Splunk.JSCharting.chartByIdMap || {};
        var id = wrapperObject.$container.attr('id');
        Splunk.JSCharting.chartByIdMap[id] = chartObject;
    };

    return ({

        initializeTestingMetaData: initializeTestingMetaData,
        gaugeAddTestingMetadata: gaugeAddTestingMetadata,
        createGlobalReference: createGlobalReference

    });

});


define('js_charting/visualizations/charts/Chart',[
            'jquery',
            'underscore',
            'highcharts',
            '../Visualization',
            '../../components/ColorPalette',
            '../../components/axes/TimeAxis',
            '../../components/axes/CategoryAxis',
            '../../components/axes/NumericAxis',
            '../../components/Legend',
            '../../components/PanningScrollbar',
            '../../components/Tooltip',
            '../../helpers/HoverEventThrottler',
            '../../series/series_factory',
            'splunk.util',
            '../../util/lang_utils',
            '../../util/testing_utils',
            '../../util/parsing_utils',
            '../../util/color_utils',
            '../../util/time_utils',
            '../../util/dom_utils',
            'util/console'
       ],
       function(
           $,
           _,
           Highcharts,
           Visualization,
           ColorPalette,
           TimeAxis,
           CategoryAxis,
           NumericAxis,
           Legend,
           PanningScrollbar,
           Tooltip,
           HoverEventThrottler,
           seriesFactory,
           splunkUtils,
           langUtils,
           testingUtils,
           parsingUtils,
           colorUtils,
           timeUtils,
           domUtils,
           console
       ) {

    var Chart = function(container, properties) {
        Visualization.call(this, container, properties);
    };
    langUtils.inherit(Chart, Visualization);

    $.extend(Chart.prototype, {

        HOVER_DELAY: 160,
        EXPORT_WIDTH: 600,
        EXPORT_HEIGHT: 400,
        POINT_CSS_SELECTOR: domUtils.hasSVG ? '.highcharts-series > rect' : '.highcharts-series > shape',

        hasLegend: true,
        hasTooltip: true,
        hasXAxis: true,
        hasYAxis: true,

        requiresExternalColors: true,
        externalPaletteMapping: {},
        externalPaletteSize: 0,

        prepare: function(dataSet, properties) {
            // FIXME: should be smart enough here to update the chart in place when possible
            Visualization.prototype.prepare.call(this, dataSet, properties);
            this.benchmark('Prepare Started');
            this.initializeFields();
            var isEmpty = this.isEmpty();
            if(!isEmpty) {
                this.initializeColorPalette();
            }
            this.initializeSeriesList();
            var axesAreInverted = _(this.seriesList).any(function(series) {
                return (series.getType() === 'bar');
            });
            if(this.hasXAxis) {
                this.initializeXAxisList(axesAreInverted);
            }
            if(this.hasYAxis) {
                this.initializeYAxisList(axesAreInverted);
            }
            if(!isEmpty) {
                if(this.hasLegend) {
                    this.initializeLegend();
                }
                if(this.hasTooltip) {
                    this.initializeTooltip();
                }
                this.setAllSeriesData();
                this.bindSeriesEvents();
                if(this.needsPanning){
                    this.initializePanning();
                    this.bindPanningEvents();
                }
            }
        },

        getFieldList: function() {
            return _(this.seriesList).chain().invoke('getFieldList').flatten(true).value();
        },

        setExternalColorPalette: function(fieldIndexMap, paletteTotalSize) {
            this.externalPaletteMapping = $.extend({}, fieldIndexMap);
            this.externalPaletteSize = paletteTotalSize;
        },

        // TODO [sff] the callback shouldn't be called with the Highcharts object
        draw: function(callback) {
            this.benchmark('Draw Started');
            this.applyColorPalette();

            this.hcConfig = $.extend(true, {}, this.BASE_CONFIG, {
                chart: this.getChartConfig(),
                series: this.getSeriesConfigList(),
                xAxis: this.getXAxisConfig(),
                yAxis: this.getYAxisConfig(),
                legend: this.getLegendConfig(),
                tooltip: this.getTooltipConfig(),
                plotOptions: this.getPlotOptionsConfig()
            });

            var that = this;
            if(this.exportMode) {
                if(this.seriesIsTimeBased(this.xFields)) {
                    _(this.hcConfig.xAxis).each(function(xAxis){
                        var xAxisMargin,
                            spanSeries = that.dataSet.getSeriesAsFloats('_span'),
                            span = (spanSeries && spanSeries.length > 0) ? parseInt(spanSeries[0], 10) : 1,
                            secsPerDay = 60 * 60 * 24,
                            secsPerYear = secsPerDay * 365;

                        if(span >= secsPerYear) {
                            xAxisMargin = 15;
                        }
                        else if(span >= secsPerDay) {
                            xAxisMargin = 25;
                        }
                        else {
                            xAxisMargin = 35;
                        }
                        xAxis.title.margin = xAxisMargin;
                    });
                }
                $.extend(true, this.hcConfig, {
                    plotOptions: {
                        series: {
                            enableMouseTracking: false,
                            shadow: false
                        }
                    }
                });

            }
            this.addEventHandlers();
            console.log('config object to be sent to highcharts:', this.hcConfig);

            new Highcharts.Chart(this.hcConfig, function(chart) {
                that.hcChart = chart;
                if(that.testMode) {
                    testingUtils.initializeTestingMetaData(that, that.xFields, that.getClassName());
                    testingUtils.createGlobalReference(that, chart);
                }
                // this event is actually coming from the push state listener in js_charting/js_charting.js
                // we are just using the Highcharts object as a shared event bus
                $(Highcharts).on('baseUriChange.' + that.id, function() {
                    that.$container.find('[clip-path]').each(function() {
                        // just need to unset and reset the clip-path to force a refresh with the new base URI
                        var $this = $(this),
                            clipPath = $this.attr('clip-path');

                        $this.removeAttr('clip-path');
                        $this.attr('clip-path', clipPath);
                    });
                });

                if(callback) {
                    that.benchmark('Draw Finished');
                    callback(that, that.benchmarks);
                }
                // DEBUGGING
                // window.chart = that;
            });
        },

        setSize: function(width, height) {
            if(!this.hcChart) {
                return;
            }
            this.hcChart.setSize(width, height, false);
        },

        destroy: function() {
            if(this.hcChart) {
                this.onChartDestroy();
                this.hcChart.destroy();
                this.hcChart = null;
            }
        },

        getSVG: function() {
            var chart = this.hcChart;
            if(this.hcConfig.legend.enabled) {
                if(this.exportMode && chart.type !== 'scatter') {
                    $(chart.series).each(function(i, loopSeries) {
                        if(!loopSeries.legendSymbol) {
                            return false;
                        }
                        loopSeries.legendSymbol.attr({
                            height: 8,
                            translateY: 4
                        });
                    });
                }
            }

            var $svg = $('.highcharts-container').find('svg');
            $svg.siblings().remove();
            $svg.find('.highcharts-tracker').remove();

            // SPL-65745, remove the clip path that is being applied to the legend, or it will cause labels to be hidden
            $svg.find('.highcharts-legend g[clip-path]').each(function() {
                $(this).removeAttr('clip-path');
            });

            return $svg.parent().html();
        },

        /////////////////////////////////////////////////////////////////////////////////////////
        // [end of public interface]

        processProperties: function() {
            Visualization.prototype.processProperties.call(this);

            // handle enabling chart/legend clicks, there are an annoying number of different ways to specify this
            // the "drilldown" property trumps all others
            if(this.properties.hasOwnProperty('drilldown')) {
                this.chartClickEnabled = this.legendClickEnabled = parsingUtils.normalizeBoolean(this.properties['drilldown']);
            }
            else {
                if(this.properties.hasOwnProperty('chart.clickEnabled')) {
                    this.chartClickEnabled = parsingUtils.normalizeBoolean(this.properties['chart.clickEnabled']);
                }
                else {
                    this.chartClickEnabled = parsingUtils.normalizeBoolean(this.properties['enableChartClick']);
                }
                if(this.properties.hasOwnProperty('chart.legend.clickEnabled')) {
                    this.legendClickEnabled = parsingUtils.normalizeBoolean(this.properties['chart.legend.clickEnabled']);
                }
                else {
                    this.legendClickEnabled = parsingUtils.normalizeBoolean(this.properties['enableLegendClick']);
                }
            }

            if(this.properties['legend.placement'] === 'none') {
                this.hasLegend = false;
            }

            //panning disabled until further notice
            if(false && this.properties['resultTruncationLimit'] > 0){
                this.truncationLimit = this.properties['resultTruncationLimit'];
                this.sliceDataForPanning = true;
            } else if(true || this.properties['resultTruncationLimit'] < 0) {
                this.sliceDataForPanning = false;
            } else {
                var actualPointsPerSeries = (this.dataSet.seriesList.length > 0) ? this.dataSet.seriesList[0].length : 0,
                    maxColumnPoints = ($.browser.msie &&  {"6.0": true, "7.0": true, "8.0": true}.hasOwnProperty($.browser.version)) ? 1000 : 1200,
                    maxLinePoints = 2000,
                    maxPoints = ({line: true, area: true}.hasOwnProperty(this.properties.chart) ? maxLinePoints : maxColumnPoints),
                    numSeries = this.dataSet.fields.length,
                    pointsAllowedPerSeries = Math.floor(maxPoints / numSeries);

                if(actualPointsPerSeries > pointsAllowedPerSeries){
                    this.truncationLimit = pointsAllowedPerSeries;
                    this.sliceDataForPanning = true;
                } else {
                    this.sliceDataForPanning = false;
                }
            }
            if(this.hasXAxis || this.hasYAxis) {
                this.axisColorScheme = {
                    'axis.foregroundColorSoft': this.foregroundColorSoft,
                    'axis.foregroundColorSofter': this.foregroundColorSofter,
                    'axis.fontColor': this.fontColor
                };
            }
            if(this.properties.hasOwnProperty('legend.masterLegend') &&
                    (!this.properties['legend.masterLegend'] || $.trim(this.properties['legend.masterLegend']) === 'null')) {
                this.requiresExternalColors = false;
            }
            this.stackMode = this.properties['chart.stackMode'] || 'default';
            this.legendLabels = parsingUtils.stringToArray(this.properties['legend.labels'] || '[]');
            this.showHideMode = this.properties['data.fieldListMode'] === 'show_hide';
            this.fieldHideList = _.union(
                this.properties['fieldHideList'] || [],
                parsingUtils.stringToArray(this.properties['data.fieldHideList']) || []
            );
            this.fieldShowList = parsingUtils.stringToArray(this.properties['data.fieldShowList']) || [];

            var seriesColorsSetting = this.properties['chart.seriesColors'] || this.properties['seriesColors'];
            this.seriesColors = parsingUtils.stringToHexArray(seriesColorsSetting) || null;
            var fieldColorsSetting = this.properties['chart.fieldColors'] || this.properties['fieldColors'];
            this.internalFieldColors = parsingUtils.stringToObject(fieldColorsSetting || '{}');
            // after the initial parse the field color will be a string representation of a hex number,
            // so loop through and make them true hex numbers (or zero if they can't be parsed)
            _(this.internalFieldColors).each(function(value, key) {
                var hexColor = parseInt(value, 16);
                this.internalFieldColors[key] = _(hexColor).isNaN() ? 0 : hexColor;
            }, this);

            // DEBUGGING: read in yAxisMapping property and yScaleMapping property for multiple y-axes
            this.yAxisMapping = parsingUtils.stringToObject(this.properties['yAxisMapping'] || "{}");
            this.yScaleMapping = parsingUtils.stringToArray(this.properties['yScaleMapping'] || "[]");

            // DEBUGGING: read in xAxisFields and xAxisMapping for multiple x-axes
            this.xAxisFields = parsingUtils.stringToArray(this.properties['xAxisFields'] || "[]");
            this.xAxisMapping = parsingUtils.stringToObject(this.properties['xAxisMapping'] || "{}");

            // DEBUGGING: read in map of field name to series types
            this.seriesTypeMapping = parsingUtils.stringToObject(this.properties['seriesTypeMapping'] || "{}");
        },

        //////////////////////////////////////////////////////////////////////////////////////////////
        // methods for initializing chart components

        initializeFields: function() {
            // TODO: this is where user settings could determine the x-axis field(s)

            var defaultXField = this.dataSet.fieldAt(0);
            this.xFields = (this.xAxisFields && this.xAxisFields.length > 0) ? this.xAxisFields : [defaultXField];

            var allDataFields = this.dataSet.allDataFields();
            if(this.isRangeSeriesMode()) {
                var rangeConfig = this.getRangeSeriesConfig();
                allDataFields = _(allDataFields).without(rangeConfig.lower, rangeConfig.upper);
            }
            this.yFields = _(allDataFields).filter(function(field) {
                return (_(this.xFields).indexOf(field) === -1);
            }, this);
            var fieldWhiteList = $.extend([], this.fieldShowList),
                fieldBlackList = $.extend([], this.fieldHideList),
                intersection = _.intersection(fieldWhiteList, fieldBlackList);

            if(this.showHideMode) {
                fieldBlackList = _.difference(fieldBlackList, intersection);
            }
            else {
                fieldWhiteList = _.difference(fieldWhiteList, intersection);
            }

            this.yFields = _.difference(this.yFields, fieldBlackList);
            if(fieldWhiteList.length > 0) {
                this.yFields = _.intersection(this.yFields, fieldWhiteList);
            }
            // handle the user-specified legend labels
            if(this.legendLabels.length > 0) {
                this.yFields = _.union(this.legendLabels, this.yFields);
            }

        },

        isEmpty: function() {
            return (this.yFields.length === 0);
        },

        initializeColorPalette: function() {
            this.colorPalette = new ColorPalette(this.seriesColors);
        },

        initializeSeriesList: function() {
            if(this.isEmpty()) {
                this.seriesList = [seriesFactory.create({ type: this.type })];
                return;
            }

            var rangeFieldName,
                isRangeSeriesMode = this.isRangeSeriesMode();

            if(isRangeSeriesMode) {
                rangeFieldName = this.getRangeSeriesConfig().predicted;
            }
            this.seriesList = _(this.yFields).map(function(field) {
                // TODO: this is where user settings could determine series type and/or axis mappings
                var customType;
                if(rangeFieldName && rangeFieldName === field) {
                    customType = 'range';
                }
                else if(this.seriesTypeMapping.hasOwnProperty(field)) {
                    customType = this.seriesTypeMapping[field];
                }

                var properties = $.extend(true, {}, this.properties, {
                    type: customType || this.type,
                    name: field,
                    stacking: isRangeSeriesMode ? 'default' : this.stackMode,
                    // TODO [sff] should we just deal with this in the chart click handler?
                    clickEnabled: this.chartClickEnabled
                });

                if(customType === 'range') {
                    properties.names = this.getRangeSeriesConfig();
                }

                // DEBUGGING: allow series to be assigned to y-axes via the 'yAxisMapping' property
                if(this.yAxisMapping[field]) {
                    properties.yAxis = parseInt(this.yAxisMapping[field], 10);
                }
                // DEBUGGING: allow series to be assigned to x-axes via the 'xAxisMapping' property
                if(this.xAxisMapping[field]) {
                    properties.xAxis = parseInt(this.xAxisMapping[field], 10);
                }
                return seriesFactory.create(properties);
            }, this);
        },

        initializeXAxisList: function(inverted) {
            var isEmpty = this.isEmpty();

            // TODO: this is where user settings could specify multiple x-axes
            // TODO: this is where the x-axis type can be inferred from the series types attached to each axis
            this.xAxisList = _(this.xFields).map(function(field, i) {
                var tickmarksBetween = _(this.seriesList).any(function(series) {
                    return (series.getXAxisIndex() === i && { column: true, bar: true }.hasOwnProperty(series.getType()));
                });
                var axisProperties = $.extend(parsingUtils.getXAxisProperties(this.properties), this.axisColorScheme, {
                    'axis.orientation': inverted ? 'vertical' : 'horizontal',
                    'axisLabels.tickmarkPlacement': tickmarksBetween ? 'between' : 'on',
                    'isEmpty': isEmpty
                });
                if(!axisProperties['axisTitle.text']) {
                    axisProperties['axisTitle.text'] = field;
                }
                if(this.seriesIsTimeBased(field)) {
                    axisProperties['axis.spanData'] = this.dataSet.getSeriesAsFloats('_span');
                    axisProperties['axis.categories'] = this.dataSet.getSeriesAsTimestamps(field);
                    return new TimeAxis(axisProperties);
                }
                axisProperties['axis.categories'] = this.dataSet.getSeries(field);
                return new CategoryAxis(axisProperties);
            }, this);
        },

        initializeYAxisList: function(inverted) {
            // TODO: this is where user settings could specify multiple y-axes
            var that = this,
                isEmpty = this.isEmpty();

            this.yAxisList = [];

            // DEBUGGING: for now just make sure there are enough y-axes to satisfy the series
            var maxAxisIndex = _(this.seriesList).chain().invoke('getYAxisIndex').max().value();
            _(maxAxisIndex + 1).times(function(i) {
                var axisProperties = $.extend(parsingUtils.getYAxisProperties(that.properties), that.axisColorScheme, {
                    'axis.orientation': inverted ? 'horizontal' : 'vertical',
                    'isEmpty': isEmpty
                });

                // FIXME: we should do something more intelligent here
                // currently if there is only one series for an axis, use that series's name as the default title
                if(!axisProperties['axisTitle.text']) {
                    var axisSeries = _(that.seriesList).filter(function(series) { return series.getYAxisIndex() === i; });
                    if(axisSeries.length === 1) {
                        axisProperties['axisTitle.text'] = axisSeries[0].getName();
                    }
                }


                // DEBUGGING: use the yScaleMapping list to assign a different scale to each y-axis
                if(that.yScaleMapping && that.yScaleMapping.length > i) {
                    axisProperties['axis.scale'] = that.yScaleMapping[i];
                }

                that.yAxisList.push(new NumericAxis(axisProperties));
            });

        },

        initializeLegend: function() {
            var legendProps = parsingUtils.getLegendProperties(this.properties);
            if(_(legendProps['clickEnabled']).isUndefined()) {
                legendProps['clickEnabled'] = this.legendClickEnabled;
            }
            $.extend(legendProps, {
                fontColor: this.fontColor
            });
            this.legend = new Legend(legendProps);

            var that = this,
                properties = {
                    highlightDelay: 125,
                    unhighlightDelay: 50,
                    onMouseOver: function(fieldName) {
                        that.handleLegendMouseOver(fieldName);
                    },
                    onMouseOut: function(fieldName) {
                        that.handleLegendMouseOut(fieldName);
                    }
                },
                throttle = new HoverEventThrottler(properties);

            this.legend.on('mouseover', function(e, fieldName) {
                throttle.mouseOverHappened(fieldName);
            });
            this.legend.on('mouseout', function(e, fieldName) {
                throttle.mouseOutHappened(fieldName);
            });
            this.legend.on('click', function(e, fieldName) {
                that.handleLegendClick(e, fieldName);
            });
        },

        initializePanning: function(){
            var panningProperties = {
                truncationLimit: this.truncationLimit,
                numSeries: this.dataSet.seriesList.length - 2,
                seriesSize: this.dataSet.seriesList[0].length,
                container: this.$container
            };
            this.panning = new PanningScrollbar(panningProperties);
        },

        initializeTooltip: function() {
            var tooltipProps = {
                borderColor: this.foregroundColorSoft
            };
            this.tooltip = new Tooltip(tooltipProps);
        },

        setAllSeriesData: function() {
            var that = this,
                numberOfSeries = this.seriesList.length,
                totalDataPoints = numberOfSeries * this.dataSet.seriesList[0].length;

            _(this.seriesList).each(function(series) {
                if(series.getType() === 'range') {
                    this.setRangeSeriesData(series);
                } else if (that.sliceDataForPanning && (totalDataPoints > that.truncationLimit)) {
                    this.needsPanning = true;
                    this.setBasicSeriesData(series);
                } else {
                    this.setBasicSeriesData(series);
                }
            }, this);
        },

        setBasicSeriesData: function(series) {
            var xInfo = this.getSeriesXInfo(series),
                yInfo = this.getSeriesYInfo(series);

            if(xInfo.axis instanceof NumericAxis) {
                series.setData({
                    x: this.formatAxisData(xInfo.axis, xInfo.fieldName),
                    y: this.formatAxisData(yInfo.axis, yInfo.fieldName)
                });
            }
            else if(xInfo.axis instanceof TimeAxis) {
                // SPL-67612, handle the case where the last data point was a total value
                // the axis handlers will have removed it from the timestamps, so we just have to sync the array lengths
                var axisTimestamps = xInfo.axis.getCategories(),
                    rawData = this.formatAxisData(yInfo.axis, yInfo.fieldName);

                series.setData({
                    y: rawData.slice(0, axisTimestamps.length)
                });
            }
            else {
                series.setData({
                    y: this.formatAxisData(yInfo.axis, yInfo.fieldName)
                });
            }
            if(this.needsPanning){
                this.sliceSeriesForPanning(series, this.truncationLimit);
            }
        },

        setRangeSeriesData: function(series) {
            var xInfo = this.getSeriesXInfo(series),
                yInfo = this.getSeriesYInfo(series),
                rangeConfig = this.getRangeSeriesConfig(),
                rangeData = {
                    predicted: this.formatAxisData(yInfo.axis, rangeConfig.predicted),
                    lower: this.formatAxisData(yInfo.axis, rangeConfig.lower),
                    upper: this.formatAxisData(yInfo.axis, rangeConfig.upper)
                };

            if(xInfo.axis instanceof NumericAxis) {
                rangeData.x = this.formatAxisData(xInfo.axis, xInfo.fieldName);
            }
            series.setData(rangeData);
        },

        bindSeriesEvents: function() {
            var that = this,
                properties = {
                    highlightDelay: 125,
                    unhighlightDelay: 50,
                    onMouseOver: function(point, series) {
                        that.handlePointMouseOver(point, series);
                    },
                    onMouseOut: function(point, series) {
                        that.handlePointMouseOut(point, series);
                    }
                },
                throttle = new HoverEventThrottler(properties);

            _(this.seriesList).each(function(series) {
                series.on('mouseover', function(e, targetPoint, targetSeries) {
                    throttle.mouseOverHappened(targetPoint, targetSeries);
                });
                series.on('mouseout', function(e, targetPoint, targetSeries) {
                    throttle.mouseOutHappened(targetPoint, targetSeries);
                });
                series.on('click', function(e, targetPoint, targetSeries) {
                    that.handlePointClick(e, targetPoint, targetSeries);
                });
            });

        },

        bindPanningEvents: function() {
            var that = this;
            this.panning.on('scroll', function(e, windowToDisplay){
                that.panningScroll = true;
                that.windowToDisplay = windowToDisplay;
                that.setAllSeriesData();
                that.setPannedData();
                that.setPannedLabels();
                that.hcChart.redraw();
            });
        },

        setPannedData: function(){
            var that = this;
            _(this.hcChart.series).each(function(oldSeries, i){
                oldSeries.setData(that.seriesList[i].data, false);
            });
        },

        setPannedLabels: function() {
            var i,
                originalLabels,
                originalSpans,
                timeCategoryInfo;

            originalLabels = this.dataSet.getSeries('_time');
            originalSpans  = this.dataSet.getSeriesAsFloats('_span');
            originalLabels = originalLabels
                .slice(this.windowToDisplay,
                (this.windowToDisplay)
                    + this.pointsToPlotPerSeries);
            originalSpans = originalSpans
                .slice(this.windowToDisplay,
                (this.windowToDisplay)
                    + this.pointsToPlotPerSeries);
            timeCategoryInfo = timeUtils.convertTimeToCategories(originalLabels, originalSpans, 6);

            //FIXME: we need to handle the bizarre negative indexes when creating the lookup
            //for tooltip formatting (this carries over)
            this.categoryIndexLookup = timeCategoryInfo.categories;

            for(i = -1; i<timeCategoryInfo.categories.length; i++){
                if(i!==timeCategoryInfo.categories.length-1){
                    timeCategoryInfo.categories[i] = timeCategoryInfo.categories[i+1];
                }
            }

            _(this.hcChart.xAxis).each(function(xAxis) {
                xAxis.setCategories(timeCategoryInfo.categories, false);
            });

        },

        handlePointClick: function(event, point, series) {
            var rowContext = {},
                pointIndex = point.index,
                pointInfo = this.getSeriesPointInfo(series, point.index),
                pointClickEvent = {
                    type: 'pointClick',
                    modifierKey: event.modifierKey,
                    name: pointInfo.xAxisName,
                    // 'value' will be inserted later based on the x-axis type
                    name2: pointInfo.yAxisName,
                    value2: pointInfo.yValue
                };

            if(pointInfo.xAxisIsTime) {
                var isoTimeString = this.dataSet.getSeries(pointInfo.xAxisName)[pointIndex];
                pointClickEvent.value = splunkUtils.getEpochTimeFromISO(isoTimeString);
                pointClickEvent._span = this.dataSet.getSeriesAsFloats('_span')[pointIndex];
                rowContext['row.' + pointInfo.xAxisName] = pointClickEvent.value;
            }
            else {
                pointClickEvent.value = pointInfo.xValue;
                rowContext['row.' + pointInfo.xAxisName] = pointInfo.xValue;
            }

            _(this.yFields).each(function(fieldName) {
                rowContext['row.' + fieldName] = this.dataSet.getSeries(fieldName)[pointIndex];
            }, this);
            pointClickEvent.rowContext = rowContext;
            this.trigger(pointClickEvent);
        },

        handlePointMouseOver: function(targetPoint, targetSeries) {
            _(this.seriesList).each(function(series) {
                if(series.matchesName(targetSeries.getName())) {
                    series.handlePointMouseOver(targetPoint);
                }
                else {
                    series.unHighlight();
                }
            });
            if(this.legend) {
                this.legend.selectField(targetSeries.getLegendKey());
            }
        },

        handlePointMouseOut: function(targetPoint, targetSeries) {
            _(this.seriesList).each(function(series) {
                if(series.matchesName(targetSeries.getName())) {
                    series.handlePointMouseOut(targetPoint);
                }
                else {
                    series.highlight();
                }
            });
            if(this.legend) {
                this.legend.unSelectField(targetSeries.getLegendKey());
            }
        },

        handleLegendClick: function(event, fieldName) {
            var legendClickEvent = {
                type: 'legendClick',
                modifierKey: event.modifierKey,
                name2: fieldName
            };
            this.trigger(legendClickEvent);
        },

        handleLegendMouseOver: function(fieldName) {
            _(this.seriesList).each(function(series) {
                if(series.matchesName(fieldName)) {
                    series.handleLegendMouseOver(fieldName);
                }
                else {
                    series.unHighlight();
                }
            });
        },

        handleLegendMouseOut: function(fieldName) {
            _(this.seriesList).each(function(series) {
                if(series.matchesName(fieldName)) {
                    series.handleLegendMouseOut(fieldName);
                }
                else {
                    series.highlight();
                }
            });
        },

        applyColorPalette: function() {
            if(this.isEmpty()) {
                return;
            }
            var colorMapping = {};
            _(this.getFieldList()).each(function(field, i, fieldList) {
                colorMapping[field] = this.computeFieldColor(field, i, fieldList);
            }, this);
            _(this.seriesList).invoke('applyColorMapping', colorMapping);
        },

        //////////////////////////////////////////////////////////////////////////////////
        // methods for generating config objects from chart objects

        getSeriesConfigList: function() {
            return _(this.seriesList).chain().invoke('getConfig').flatten(true).value();
        },

        getXAxisConfig: function() {
            if(!this.hasXAxis) {
                return [];
            }
            return _(this.xAxisList).map(function(axis, i) {
                var config = axis.getConfig();
                if(i > 0) {
                    config.offset = 40;
                }
                return config;
            }, this);
        },

        getYAxisConfig: function() {
            if(!this.hasYAxis) {
                return [];
            }
            return _(this.yAxisList).map(function(axis, i) {
                var config = axis.getConfig();
                if(i % 2 !== 0) {
                    config.opposite = true;
                }
                return config;
            });
        },

        getLegendConfig: function() {
            if(!this.legend) {
                return {};
            }
            return this.legend.getConfig();
        },

        getTooltipConfig: function() {
            if(!this.tooltip) {
                return {};
            }
            var that = this;
            return $.extend(this.tooltip.getConfig(), {
                formatter: function() {
                    // need to look up the instance of Splunk.JSCharting.BaseSeries, not the HighCharts series
                    var series = this.series.splSeries;
                    return that.formatTooltip(series, this.point);

                }
            });
        },

        formatTooltip: function(series, hcPoint) {
            var pointInfo;
            if(this.panningScroll){
                pointInfo = this.getSeriesPointInfo(series, this.categoryIndexLookup.indexOf(hcPoint.category) + this.windowToDisplay);
            } else {
                pointInfo = this.getSeriesPointInfo(series, hcPoint.index);
            }
            return series.getTooltipHtml(pointInfo);
        },

        getChartConfig: function() {
            var config = {
                type: this.type,
                renderTo: this.container,
                backgroundColor: this.backgroundColor,
                borderColor: this.backgroundColor
            };
            // in export mode we need to set explicit width and height
            // we'll honor the width and height of the parent node, unless they are zero
            if(this.exportMode) {
                config.width = this.width || this.EXPORT_WIDTH;
                config.height = this.height || this.EXPORT_HEIGHT;
            }
            return config;
        },

        getPlotOptionsConfig: function() {
            return $.extend(true, {}, this.BASE_PLOT_OPTIONS_CONFIG, {
                series: {
                    cursor: this.chartClickEnabled ? 'pointer' : 'default',
                    enableMouseTracking: this.useMouseTracking()
                }
            });
        },

        ////////////////////////////////////////////////////////////////////////////////////////
        // methods for managing event handlers and effects

        addEventHandlers: function() {
            var that = this;
            this.hcConfig.chart.events = {
                load: function(e) {
                    var chart = this;
                    that.onChartLoad(chart, e);
                    that.onChartLoadOrResize(chart, e);
                },
                redraw: function(e) {
                    var chart = this;
                    that.onChartResize(chart, e);
                    that.onChartLoadOrResize(chart, e);
                }
            };
        },

        onChartLoad: function(chart) {
            if(this.legend) {
                this.legend.onChartLoad(chart);
            }
            if(this.panning){
                this.panning.onChartLoad(chart);
            }
            if(this.xAxisList) {
                _(this.xAxisList).each(function(axis) {
                    axis.onChartLoad(chart);
                });
            }
            if(this.yAxisList) {
                _(this.yAxisList).each(function(axis) {
                    axis.onChartLoad(chart);
                });
            }
            _(this.seriesList).each(function(series) {
                series.onChartLoad(chart);
            });
            if(!this.useMouseTracking()) {
                this.addPointListeners(chart);
            }
        },

        onChartResize: function() { },

        onChartLoadOrResize: function(chart) {
            if(this.panning){
                this.panning.onChartLoadOrResize(chart);
            }
            if(this.xAxisList) {
                _(this.xAxisList).each(function(axis) {
                    axis.onChartLoadOrResize(chart);
                });
            }
            if(this.yAxisList) {
                _(this.yAxisList).each(function(axis) {
                    axis.onChartLoadOrResize(chart);
                });
            }
        },

        onChartDestroy: function() {
            $(Highcharts).off('baseUriChange.' + this.id);
            if(this.legend) {
                this.legend.destroy();
            }
            if(this.xAxisList) {
                _(this.xAxisList).each(function(axis) {
                    axis.destroy();
                });
            }
            if(this.yAxisList) {
                _(this.yAxisList).each(function(axis) {
                    axis.destroy();
                });
            }
            _(this.seriesList).each(function(series) {
                series.destroy();
            });
            if(!this.useMouseTracking()) {
                // clean up any listeners created in addPointListeners
                $(this.hcChart.container).off('.splunk_jscharting');
            }
        },

        addPointListeners: function(chart) {
            var $chartContainer = $(chart.container),
                tooltipSelector = ".highcharts-tooltip *",
                hoveredPoint = null,
                // helper function to extract the corresponding point from a jQuery element
                extractPoint = function($el) {
                    return (chart.series[$el.attr('data-series-index')].data[$el.attr('data-point-index')]);
                };

            // with the VML renderer, have to explicitly destroy the tracker so it doesn't block mouse events
            if(!domUtils.hasSVG && chart.tracker) {
                chart.tracker.destroy();
            }
            // create a closure around the tooltip hide method so that we can make sure we always hide the selected series when it is called
            // this is a work-around for the situation when the mouse moves out of the chart container element without triggering a mouse event
            if(chart.tooltip) {
                var tooltipHide = _(chart.tooltip.hide).bind(chart.tooltip);
                chart.tooltip.hide = function(silent) {
                    tooltipHide();
                    if(!silent && hoveredPoint) {
                        hoveredPoint.firePointEvent('mouseOut');
                        hoveredPoint = null;
                    }
                };
            }

            // decorate each point element with the info we need to map it to its corresponding data object
            var that = this;
            $(chart.series).each(function(i, series) {
                $(series.data).each(function(j, point) {
                    if(point.graphic && point.graphic.element) {
                        var $element = $(point.graphic.element);
                        $element.attr('data-series-index', i);
                        $element.attr('data-point-index', j);
                        if(that.chartClickEnabled) {
                            $element.css('cursor', 'pointer');
                        }
                    }
                });
            });
            // we are not using mouse trackers, so attach event handlers to the chart's container element
            $chartContainer.on('click.splunk_jscharting', function(event) {
                var $target = $(event.target);
                if($target.is(that.POINT_CSS_SELECTOR)) {
                    var point = extractPoint($target);
                    point.firePointEvent('click', event);
                }
            });
            // handle all mouseover events in the container here
            // if they are over the tooltip, ignore them (this avoids the dreaded tooltip flicker)
            // otherwise hide any point that is currently in a 'hover' state and 'hover' the target point as needed
            $chartContainer.on('mouseover.splunk_jscharting', function(event) {
                var $target = $(event.target);
                if($target.is(tooltipSelector)) {
                    return;
                }
                var point = null;
                if($target.is(that.POINT_CSS_SELECTOR)) {
                    point = extractPoint($target);
                }
                if(hoveredPoint && !(point && hoveredPoint === point)) {
                    hoveredPoint.firePointEvent('mouseOut');
                    chart.tooltip.hide(true);
                    hoveredPoint = null;
                }
                if(point) {
                    point.firePointEvent('mouseOver');
                    chart.tooltip.refresh(point);
                    hoveredPoint = point;
                }
            });

        },

        /////////////////////////////////////////////////////////////////////////////////////
        // re-usable helpers

        getSeriesXInfo: function(series) {
            var xIndex = series.getXAxisIndex();
            return ({
                axis: this.xAxisList[xIndex],
                fieldName: this.xFields[xIndex]
            });
        },

        getSeriesYInfo: function(series) {
            return ({
                axis: this.yAxisList[series.getYAxisIndex()],
                fieldName: series.getName()
            });
        },

        getSeriesPointInfo: function(series, pointIndex) {
            var xInfo = this.getSeriesXInfo(series),
                yInfo = this.getSeriesYInfo(series),
                xSeries = this.dataSet.getSeries(xInfo.fieldName),
                ySeries = this.dataSet.getSeries(yInfo.fieldName);

            return ({
                xAxisIsTime: (xInfo.axis instanceof TimeAxis),
                xAxisName: xInfo.fieldName,
                xValue: xSeries[pointIndex],
                xValueDisplay: xInfo.axis.formatValue(xSeries[pointIndex]),
                yAxisName: yInfo.fieldName,
                yValue: ySeries[pointIndex],
                yValueDisplay: yInfo.axis.formatValue(ySeries[pointIndex])
            });
        },

        isRangeSeriesMode: function() {
            return (this.dataSet.hasField('_predicted')
                && this.dataSet.hasField('_lower')
                && this.dataSet.hasField('_upper'));
        },

        getRangeSeriesConfig: function() {
            var predictedName = _(this.dataSet.getSeries('_predicted')).find(function(value) { return !!value; }),
                lowerName = _(this.dataSet.getSeries('_lower')).find(function(value) { return !!value; }),
                upperName = _(this.dataSet.getSeries('_upper')).find(function(value) { return !!value; });

            return ({
                predicted: predictedName,
                lower: lowerName,
                upper: upperName
            });
        },

        useMouseTracking: function() {
            return _(this.seriesList).any(function(series) {
                return series.getType() in { line: true, area: true, range: true };
            });
        },

        seriesIsTimeBased: function(fieldName) {
            return (/^_time/).test(fieldName);
        },

        sliceSeriesForPanning: function(series, truncationLimit) {
            var  numberOfSeries = this.seriesList.length;

            if(numberOfSeries > truncationLimit){
                this.pointsToPlotPerSeries = 1;
            } else {
                this.pointsToPlotPerSeries = Math.ceil(truncationLimit / numberOfSeries);
            }

            if(this.windowToDisplay){
                series.sliceData(series,
                    this.windowToDisplay,
                    (this.windowToDisplay) + this.pointsToPlotPerSeries);
            } else {
                series.sliceData(series, 0, this.pointsToPlotPerSeries);
            }

        },

        formatAxisData: function(axis, fieldName) {
            if(!this.dataSet.hasField(fieldName)) {
                return [];
            }
            return this.dataSet.getSeriesAsFloats(fieldName, {
                scale: axis.isLogScale() ? 'log' : 'linear',
                nullValueMode: this.properties['chart.nullValueMode']
            });
        },

        computeFieldColor: function(field, index, fieldList) {
            if(this.internalFieldColors.hasOwnProperty(field)) {
                return colorUtils.colorFromHex(this.internalFieldColors[field]);
            }
            var useExternalPalette = !_(this.externalPaletteMapping).isEmpty(),
                paletteIndex = useExternalPalette ? this.externalPaletteMapping[field] : index,
                paletteSize = useExternalPalette ? this.externalPaletteSize : fieldList.length;

            return this.colorPalette.getColorAsRgb(field, paletteIndex, paletteSize);
        },

        /////////////////////////////////////////////////////////////////////////////////////
        // templates and default settings

        BASE_CONFIG: {
            chart: {
                animation: false,
                showAxes: true,
                reflow: false
            },
            credits: {
                enabled: false
            },
            legend: {
                enabled: false
            },
            plotOptions: {
                series: {
                    animation: false,
                    events: {
                        legendItemClick: function() {
                            return false;
                        }
                    },
                    borderWidth: 0,
                    shadow: false,
                    turboThreshold: 0
                }
            },
            title: {
                text: null
            },
            tooltip: {
                enabled: false,
                useHTML: true
            }
        },

        BASE_PLOT_OPTIONS_CONFIG: {
            line: {
                stickyTracking: true,
                marker: {
                    states: {
                        hover: {
                            enabled: true,
                            radius: 6
                        }
                    },
                    symbol: 'square',
                    radius: 6
                }
            },
            area: {
                stickyTracking: true,
                lineWidth: 1,
                trackByArea: true,
                marker: {
                    states: {
                        hover: {
                            enabled: true,
                            radius: 6
                        }
                    },
                    symbol: 'square',
                    radius: 6,
                    enabled: false
                }
            },
            column: {
                markers: {
                    enabled: false
                },
                stickyTracking: false
            },
            bar: {
                markers: {
                    enabled: false
                },
                stickyTracking: false
            }
        }

    });

   return Chart;

});

define('js_charting/visualizations/charts/SplitSeriesChart',[
            'jquery',
            'underscore',
            './Chart',
            '../../util/lang_utils'
        ],
        function(
            $,
            _,
            Chart,
            langUtils
        ) {

    var SplitSeriesChart = function(container, properties) {
        Chart.call(this, container, properties);
    };
    langUtils.inherit(SplitSeriesChart, Chart);

    $.extend(SplitSeriesChart.prototype, {

        interAxisSpacing: 10,

        initializeSeriesList: function() {
            Chart.prototype.initializeSeriesList.call(this);

            // give each series its own y-axis
            _(this.seriesList).each(function(series, i) {
                series.setYAxisIndex(i);
            }, this);
        },

        setAllSeriesData: function() {
            Chart.prototype.setAllSeriesData.call(this);
            // memoize the global min and max across all data
            this.globalMin = Infinity;
            this.globalMax = -Infinity;
            _(this.yFields).each(function(field, i) {
                var axis = this.yAxisList[i],
                    data = this.formatAxisData(axis, field);

                this.globalMin = Math.min(this.globalMin, Math.min.apply(Math, data));
                this.globalMax = Math.max(this.globalMax, Math.max.apply(Math, data));
            }, this);
        },

        getYAxisConfig: function() {
            var config = Chart.prototype.getYAxisConfig.call(this);
            _(config).each(function(axisConfig, i) {
                $.extend(axisConfig, {
                    opposite: false,
                    offset: 0,
                    setSizePreHook: _(function(axis) {
                        $.extend(axis.options, this.getAdjustedAxisPosition(axis, i, this.yAxisList.length));
                    }).bind(this)
                });
                var originalExtremesHook = axisConfig.getSeriesExtremesPostHook;
                axisConfig.getSeriesExtremesPostHook = _(function(axis) {
                    axis.dataMax = Math.max(axis.dataMax, this.globalMax);
                    axis.dataMin = Math.min(axis.dataMin, this.globalMin);
                    // make sure to invoke the original hook if it's there
                    if(originalExtremesHook) {
                        originalExtremesHook(axis);
                    }
                }).bind(this);
            }, this);
            return config;
        },

        getSeriesConfigList: function() {
            var config = Chart.prototype.getSeriesConfigList.call(this);
            _(config).each(function(seriesConfig) {
                seriesConfig.stacking = 'normal';
                seriesConfig.afterAnimatePostHook = _(this.updateSeriesClipRect).bind(this);
                seriesConfig.renderPostHook = _(this.updateSeriesClipRect).bind(this);
                seriesConfig.destroyPreHook = _(this.destroySplitSeriesClipRect).bind(this);
                seriesConfig.plotGroupPostHook = _(this.translateSeriesGroup).bind(this);
            }, this);
            return config;
        },

        getAdjustedAxisPosition: function(axis, index, numAxes) {
            var chart = axis.chart;
            if(chart.inverted) {
                var plotWidth = chart.plotWidth,
                    axisWidth = (plotWidth - (this.interAxisSpacing * (numAxes - 1))) / numAxes;

                return ({
                    left: chart.plotLeft + (axisWidth + this.interAxisSpacing) * index,
                    width: axisWidth
                });
            }
            var plotHeight = chart.plotHeight,
                axisHeight = (plotHeight - (this.interAxisSpacing * (numAxes - 1))) / numAxes;

            return ({
                top: chart.plotTop + (axisHeight + this.interAxisSpacing) * index,
                height: axisHeight
            });
        },

        getTooltipConfig: function() {
            var config = Chart.prototype.getTooltipConfig.call(this);
            config.getAnchorPostHook = function(points, mouseEvent, anchor) {
                anchor[0] = points.series.yAxis.left + points.pointWidth;
                return anchor;
            };
            return config;
        },

        updateSeriesClipRect: function(series) {
            var chart = series.chart,
                yAxis = series.yAxis;

            this.destroySplitSeriesClipRect(series);
            if(chart.inverted) {
                // this looks wrong, but this is happening before the 90 degree rotation so x is y and y is x
                series.splitSeriesClipRect = chart.renderer.clipRect(0, -0, chart.plotHeight, yAxis.width);
            }
            else {
                series.splitSeriesClipRect = chart.renderer.clipRect(0, 0, chart.plotWidth, yAxis.height);
            }
            series.group.clip(series.splitSeriesClipRect);
        },

        destroySplitSeriesClipRect: function(series) {
            if(series.hasOwnProperty('splitSeriesClipRect')) {
                series.splitSeriesClipRect.destroy();
            }
        },

        translateSeriesGroup: function(series, group) {
            if(series.chart.inverted) {
                group.translate(series.yAxis.left, 0);
            }
        }

    });

    return SplitSeriesChart;

});
define('js_charting/components/DataLabels',[
            'jquery',
            'underscore',
            '../helpers/EventMixin',
            '../helpers/Formatter',
            '../helpers/HoverEventThrottler'
        ],
        function(
            $,
            _,
            EventMixin,
            Formatter,
            HoverEventThrottler
        ) {

    var DataLabels = function(properties) {
        this.properties = properties || {};
    };

    DataLabels.prototype = $.extend(EventMixin, {

        HIGHLIGHTED_OPACITY: 1.0,
        UNHIGHLIGHTED_OPACITY: 0.3,

        getConfig: function() {
            return ({
                color: this.properties['fontColor'] || '#000000',
                connectorColor: this.properties['foregroundColorSoft'],
                softConnector: false,
                distance: 20,
                style: {
                    cursor: this.properties['clickEnabled'] ? 'pointer' : 'default'
                },
                x: 0.01,
                drawDataLabelsPreHook: _(this.drawDataLabelsPreHook).bind(this),
                drawDataLabelsPostHook: _(this.drawDataLabelsPostHook).bind(this)
            });
        },

        onChartLoad: function(chart) {
            this.hcSeries = chart.series[0];
            this.addEventHandlers();
        },

        addEventHandlers: function() {
            var that = this,
                properties = {
                    highlightDelay: 125,
                    unhighlightDelay: 50,
                    onMouseOver: function(point){
                        that.selectLabel(point);
                        that.trigger('mouseover', [point]);
                    },
                    onMouseOut: function(point){
                        that.unSelectLabel(point);
                        that.trigger('mouseout', [point]);
                    }
                },
                throttle = new HoverEventThrottler(properties);

            _(this.hcSeries.data).each(function(point) {
                var label = point.dataLabel.element;
                $(label).bind('mouseover', function() {
                    throttle.mouseOverHappened(point);
                });
                $(label).bind('mouseout', function() {
                    throttle.mouseOutHappened(point);
                });
                $(label).bind('click', function() {
                    that.trigger('click', [point]);
                });
            });
        },

        destroy: function() {
            this.off();
            this.hcSeries = null;
        },

        selectLabel: function(point) {
            var matchingPoint = this.hcSeries.data[point.index];
            matchingPoint.dataLabel.attr('fill-opacity', this.HIGHLIGHTED_OPACITY);
            _(this.hcSeries.data).chain().without(matchingPoint).each(function(hcPoint) {
                hcPoint.dataLabel.attr('fill-opacity', this.UNHIGHLIGHTED_OPACITY);
            }, this);
        },

        unSelectLabel: function(point) {
            var matchingPoint = this.hcSeries.data[point.index];
            _(this.hcSeries.data).chain().without(matchingPoint).each(function(hcPoint) {
                hcPoint.dataLabel.attr('fill-opacity', this.HIGHLIGHTED_OPACITY);
            }, this);
        },

        /**
         * @author sfishel
         *
         * Before the data label draw routine, overwrite the series getX method so that labels will be aligned vertically.
         * Then make sure all labels will fit in the plot area.
         */

        drawDataLabelsPreHook: function(pieSeries) {
            var chart = pieSeries.chart,
                distance = pieSeries.options.dataLabels.distance,
                center = pieSeries.center,
                radius = center[2] / 2;

            pieSeries.getX = function(y, left) {
                return (chart.plotLeft + center[0] + (left ? (-radius - distance) : (radius + distance / 2)));
            };

            this.fitLabelsToPlotArea(pieSeries);
        },

        fitLabelsToPlotArea: function(series) {
            var i, adjusted,
                options = series.options,
                labelDistance = options.dataLabels.distance,
                size = options.size, // assumes size in pixels TODO: handle percents
                chart = series.chart,
                renderer = chart.renderer,
                formatter = new Formatter(renderer),

                defaultFontSize = 11,
                minFontSize = 9,
                maxWidth = (chart.plotWidth - (size + 2 * labelDistance)) / 2,
                labels = [];

            for(i = 0; i < series.data.length; i++) {
                labels.push(series.options.data[i][0]);
            }
            adjusted = formatter.adjustLabels(labels, maxWidth, minFontSize, defaultFontSize, 'middle');

            for(i = 0; i < series.data.length; i++) {
                series.data[i].name = adjusted.labels[i];
                // check for a redraw, update the font size in place
                if(series.data[i].dataLabel && series.data[i].dataLabel.css) {
                    series.data[i].dataLabel.css({'fontSize': adjusted.fontSize + 'px'});
                }
            }
            $.extend(true, options.dataLabels, {
                style: {
                    'fontSize': adjusted.fontSize + 'px'
                },
                y: Math.floor(adjusted.fontSize / 4) - 3
            });
            formatter.destroy();
        },

        /**
         * @author sfishel
         *
         * After the data labels have been drawn, update the connector paths in place.
         */

        drawDataLabelsPostHook: function(pieSeries) {
            _(pieSeries.points).each(function(point) {
                if(point.connector) {
                    var path = point.connector.attr('d').split(' ');
                    point.connector.attr({ d: this.updateConnectorPath(path) });
                }
            }, this);
        },

        updateConnectorPath: function(path) {
            // the default path consists of three points that create a two-segment line
            // we are going to move the middle point so the outer segment is horizontal

            // first extract the actual points from the SVG-style path declaration
            var firstPoint = {
                    x: parseFloat(path[1]),
                    y: parseFloat(path[2])
                },
                secondPoint = {
                    x: parseFloat(path[4]),
                    y: parseFloat(path[5])
                },
                thirdPoint = {
                    x: parseFloat(path[7]),
                    y: parseFloat(path[8])
                };

            // find the slope of the second line segment, use it to calculate the new middle point
            var secondSegmentSlope = (thirdPoint.y - secondPoint.y) / (thirdPoint.x - secondPoint.x),
                newSecondPoint = {
                    x: thirdPoint.x + (firstPoint.y - thirdPoint.y) / secondSegmentSlope,
                    y: firstPoint.y
                };

            // define the update path and swap it into the original array
            // if the resulting path would back-track on the x-axis (or is a horizontal line),
            // just draw a line directly from the first point to the last
            var wouldBacktrack = isNaN(newSecondPoint.x) || (firstPoint.x >= newSecondPoint.x && newSecondPoint.x <= thirdPoint.x)
                    || (firstPoint.x <= newSecondPoint.x && newSecondPoint.x >= thirdPoint.x),
                newPath = (wouldBacktrack) ?
                    [
                        "M", firstPoint.x, firstPoint.y,
                        "L", thirdPoint.x, thirdPoint.y
                    ] :
                    [
                        "M", firstPoint.x, firstPoint.y,
                        "L", newSecondPoint.x, newSecondPoint.y,
                        "L", thirdPoint.x, thirdPoint.y
                    ];

            return newPath;
        }

    });

    return DataLabels;

});
define('js_charting/visualizations/charts/PieChart',[
            'jquery',
            'underscore',
            'highcharts',
            'splunk.i18n',
            './Chart',
            '../../components/DataLabels',
            '../../helpers/HoverEventThrottler',
            '../../series/series_factory',
            '../../util/lang_utils',
            '../../util/parsing_utils',
            '../../util/dom_utils'
        ], 
        function(
            $,
            _,
            Highcharts,
            i18n,
            Chart,
            DataLabels,
            HoverEventThrottler,
            seriesFactory,
            langUtils,
            parsingUtils,
            domUtils
        ) {

    var PieChart = function(container, properties) {
        Chart.call(this, container, properties);
    };
    langUtils.inherit(PieChart, Chart);

    $.extend(PieChart.prototype, {

        POINT_CSS_SELECTOR: domUtils.hasSVG ? '.highcharts-point > path' : '.highcharts-point > shape',

        hasLegend: false,
        hasXAxis: false,
        hasYAxis: false,

        prepare: function(dataSet, properties) {
            Chart.prototype.prepare.call(this, dataSet, properties);
            this.initializeDataLabels();    
        },

        draw: function(callback) {
            if(this.isEmpty()) {
                this.benchmark('Draw Started');
                this.drawEmptyPieChart();

                if(callback) {
                    this.benchmark('Draw Finished');
                    callback(this, this.benchmarks);
                }
            }
            else {
                Chart.prototype.draw.call(this, callback);    
            }
        },

        processProperties: function() {
            Chart.prototype.processProperties.call(this);
            this.showLabels = this.isEmpty() ? false : parsingUtils.normalizeBoolean(this.properties['chart.showLabels'], true);
        },

        initializeFields: function() {
            this.sliceNameField = this.dataSet.fieldAt(0);
            this.sliceSizeField = this.dataSet.fieldAt(1);
        },

        isEmpty: function() {
            return (this.dataSet.length < 2);
        },

        initializeSeriesList: function() {
            var seriesProps = $.extend({}, this.properties, {
                name: this.sliceSizeField,
                type: 'pie',
                clickEnabled: this.chartClickEnabled
            });

            this.seriesList = [new seriesFactory.create(seriesProps)];
        },

        setAllSeriesData: function() {
            this.seriesList[0].setData({
                names: this.dataSet.getSeries(this.sliceNameField),
                sizes: this.dataSet.getSeriesAsFloats(this.sliceSizeField, { nullValueMode: 'zero' })
            });
        },

        handlePointMouseOver: function(targetPoint) {
            this.seriesList[0].handlePointMouseOver(targetPoint);
            if(this.dataLabels) {
                this.dataLabels.selectLabel(targetPoint);
            }
        },

        handlePointMouseOut: function(targetPoint){
            this.seriesList[0].handlePointMouseOut(targetPoint);
            if(this.dataLabels) {
                this.dataLabels.unSelectLabel(targetPoint);
            }
        },

        handlePointClick: function(event, point) {
            var pointIndex = point.index,
                pointData = this.seriesList[0].getData()[pointIndex],
                sliceName = pointData[0],
                sliceSize = pointData[1].toString(),
                rowContext = {},
                pointClickEvent = {
                    type: 'pointClick',
                    modifierKey: event.modifierKey,
                    name: this.sliceNameField,
                    value: sliceName,
                    name2: this.sliceSizeField,
                    value2: sliceSize,
                    rowContext: rowContext
                };

            rowContext['row.' + this.sliceNameField] = sliceName;
            rowContext['row.' + this.sliceSizeField] = sliceSize;
            this.trigger(pointClickEvent);
        },

        initializeDataLabels: function() {
            var labelProps = {
                fontColor: this.fontColor,
                foregroundColorSoft: this.foregroundColorSoft,
                clickEnabled: parsingUtils.normalizeBoolean(this.properties['chart.clickEnabled'])
                    || parsingUtils.normalizeBoolean(this.properties['enableChartClick'])
            };
            this.dataLabels = new DataLabels(labelProps);
            var that = this,
                properties = {
                    highlightDelay: 75,
                    unhighlightDelay: 50,
                    onMouseOver: function(point){
                        that.seriesList[0].selectPoint(point);
                    },
                    onMouseOut: function(point){
                        that.seriesList[0].unSelectPoint(point);
                    }
                },
                throttle = new HoverEventThrottler(properties);

            this.dataLabels.on('mouseover', function(e, point) {
                throttle.mouseOverHappened(point);
            });
            this.dataLabels.on('mouseout', function(e, point) {
                throttle.mouseOutHappened(point);
            });
            // TODO [sff] add a click handler here for data label drilldown
        },

        getPlotOptionsConfig: function() {
            var that = this;
            return ({
                pie: {
                    dataLabels: $.extend(this.getDataLabelConfig(), {
                        formatter: function() {
                            var formatInfo = this;
                            return parsingUtils.escapeSVG(that.formatDataLabel(formatInfo));
                        }
                    }),
                    borderWidth: 0,
                    stickyTracking: false,
                    cursor: this.chartClickEnabled ? 'pointer' : 'default',
                    enableMouseTracking: this.useMouseTracking()
                }
            });
        },

        getDataLabelConfig: function() {
            if(!this.showLabels) {
                return {
                    enabled: false
                };
            }
            return this.dataLabels.getConfig();
        },

        applyColorPalette: function() {
            // FIXME: this is bad, find a way to encapsulate this in the PieSeries object
            this.BASE_CONFIG = $.extend({}, this.BASE_CONFIG, {
                colors: _(this.getFieldList()).map(this.computeFieldColor, this)
            });
        },

        formatDataLabel: function(info) {
            return info.point.name;
        },

        formatTooltip: function(series, hcPoint) {
            var pointIndex = hcPoint.index,
                pointData = series.getData()[pointIndex],
                pointName = pointData[0],
                pointValue = pointData[1];

            return series.getTooltipHtml({
                sliceFieldName: this.sliceNameField,
                sliceName: pointName,
                sliceColor: hcPoint.color,
                yValue: i18n.format_decimal(pointValue),
                yPercent: i18n.format_percent(hcPoint.percentage / 100)
            });
        },

        drawEmptyPieChart: function() {
            var width = this.$container.width(),
                height = this.$container.height(),
                circleRadius = width / 6.1,
                // widthOfText and heightOfText need to be hard-coded (change these if fontSize, etc. change)
                widthOfText = 128,
                heightOfText = 20,
                xDistanceToText = (width - widthOfText) / 2,
                yDistanceToText = (height + heightOfText) / 2;

            this.renderer = new Highcharts.Renderer(this.container, width, height);

            this.renderer.circle(width / 2, height / 2, circleRadius).attr({
                fill: '#C0C0C0',
                stroke: 'black',
                'stroke-width': 1
            }).add();

            this.renderer.text('No Results', xDistanceToText, yDistanceToText).css({
                fontSize: '26px'
            }).add();
        },

        setSize: function(width, height) {
            if(this.isEmpty()) {
                this.$container.empty();
                this.drawEmptyPieChart();
            }
            else {
                Chart.prototype.setSize.call(this, width, height);    
            }
        },

        useMouseTracking: function() { return false; },

        destroy: function() {
            if(this.renderer) {
                this.renderer.destroy();
                this.$container.empty();
            }
            Chart.prototype.destroy.call(this);
        },

        onChartLoad: function(chart) {
            Chart.prototype.onChartLoad.call(this, chart);
            if(this.dataLabels) {
                this.dataLabels.onChartLoad(chart);
            }
        },

        onChartDestroy: function() {
            Chart.prototype.onChartDestroy.call(this);
            if(this.dataLabels) {
                this.dataLabels.destroy();
            }
        }
    });

    return PieChart;

});
define('js_charting/visualizations/charts/ScatterChart',[
            'jquery',
            'underscore',
            './Chart',
            '../../series/series_factory',
            '../../components/axes/NumericAxis',
            '../../util/lang_utils',
            '../../util/parsing_utils',
            '../../util/dom_utils'
        ],
        function(
            $,
            _,
            Chart,
            seriesFactory,
            NumericAxis,
            langUtils,
            parsingUtils,
            domUtils
        ) {

    var ScatterChart = function(container, properties) {
        Chart.call(this, container, properties);
    };
    langUtils.inherit(ScatterChart, Chart);

    $.extend(ScatterChart.prototype, {

        POINT_CSS_SELECTOR: domUtils.hasSVG ? '.highcharts-markers > path' : '.highcharts-markers > shape',

        initializeFields: function() {
            Chart.prototype.initializeFields.call(this);
            // to support the pivot interface, scatter charts ignore the first column if it is the result of a group-by
            var dataFields = this.dataSet.allDataFields();
            if(this.dataSet.fieldIsGroupby(dataFields[0])) {
                this.markField = dataFields[0];
                dataFields = dataFields.slice(1);
            }
            if(dataFields.length > 2) {
                this.isMultiSeries = true;
                this.labelField = dataFields[0];
                this.xField = dataFields[1];
                this.yField = dataFields[2];
                this.hasLegend = (this.properties['legend.placement'] !== 'none');
            }
            else {
                this.isMultiSeries = false;
                this.xField = dataFields[0];
                this.yField = dataFields[1];
                this.hasLegend = false;
            }
        },

        isEmpty: function() {
            return (this.dataSet.length < 2);
        },

        initializeSeriesList: function() {
            var series;
            if(this.isMultiSeries) {
                series = seriesFactory.create({
                    type: 'scatter',
                    clickEnabled: this.chartClickEnabled,
                    multiScatter: true
                });
                this.seriesList = [series];
            }
            else {
                series = seriesFactory.create({
                    name: _.uniqueId('scatter_field_'),
                    type: 'scatter',
                    clickEnabled: this.chartClickEnabled
                });
                this.seriesList = [series];
            }
        },

        initializeXAxisList: function() {
            var axisProps = $.extend(parsingUtils.getXAxisProperties(this.properties), this.axisColorScheme, {
                'axis.orientation': 'horizontal',
                'isEmpty': this.isEmpty()
            });
            if(!axisProps['axisTitle.text']) {
                axisProps['axisTitle.text'] = this.xField;
            }
            axisProps['gridLines.showMajorLines'] = false;
            this.xAxisList = [new NumericAxis(axisProps)];
        },

        initializeYAxisList: function() {
            var axisProps = $.extend(parsingUtils.getYAxisProperties(this.properties), this.axisColorScheme, {
                'axis.orientation': 'vertical',
                'isEmpty': this.isEmpty()
            });
            if(!axisProps['axisTitle.text']) {
                axisProps['axisTitle.text'] = this.yField;
            }
            this.yAxisList = [new NumericAxis(axisProps)];
        },

        setAllSeriesData: function() {
            var xData = this.formatAxisData(this.xAxisList[0], this.xField),
                yData = this.formatAxisData(this.yAxisList[0], this.yField),
                seriesData = {
                    x: xData,
                    y: yData
                };

            if(this.isMultiSeries) {
                seriesData.labels = this.dataSet.getSeries(this.labelField);
            }
            this.seriesList[0].setData(seriesData);
        },

        getPlotOptionsConfig: function() {
            var markerSize = parseInt(this.properties['chart.markerSize'], 10);
            return ({
                scatter: {
                    stickyTracking: false,
                    marker: {
                        radius: markerSize ? Math.ceil(markerSize * 6 / 4) : 6,
                        symbol: 'square'
                    },
                    cursor: this.chartClickEnabled ? 'pointer' : 'default',
                    enableMouseTracking: this.useMouseTracking()
                }
            });
        },

        useMouseTracking: function() { return false; },

        handlePointClick: function(event, point, series) {
            var pointIndex = point.index,
                seriesName = series.getName(),
                xSeries = this.dataSet.getSeries(this.xField),
                ySeries = this.dataSet.getSeries(this.yField),
                xValue = this.isMultiSeries ? this.filterDataByNameMatch(xSeries, seriesName)[pointIndex] : xSeries[pointIndex],
                yValue = this.isMultiSeries ? this.filterDataByNameMatch(ySeries, seriesName)[pointIndex] : ySeries[pointIndex],
                rowContext = {},

                pointClickEvent = {
                    type: 'pointClick',
                    modifierKey: event.modifierKey,
                    name: this.isMultiSeries ? this.labelField : this.xField,
                    value: this.isMultiSeries ? seriesName : xValue,
                    name2: this.isMultiSeries ? this.xField : this.yField,
                    value2: this.isMultiSeries ? xValue : yValue,
                    rowContext: rowContext
                };

            rowContext['row.' + this.xField] = xValue;
            rowContext['row.' + this.yField] = yValue;
            if(this.isMultiSeries) {
                rowContext['row.' + this.labelField] = seriesName;
            }
            if(this.markField) {
                var markSeries = this.dataSet.getSeries(this.markField),
                    markValue = this.isMultiSeries ? this.filterDataByNameMatch(markSeries, seriesName)[pointIndex] : markSeries[pointIndex];

                rowContext['row.' + this.markField] = markValue;
            }
            this.trigger(pointClickEvent);
        },

        handleLegendClick: function(event, fieldName) {
            var rowContext = {},
                legendClickEvent = {
                    type: 'legendClick',
                    modifierKey: event.modifierKey,
                    name: this.labelField,
                    value: fieldName,
                    rowContext: rowContext
                };

            rowContext['row.' + this.labelField] = fieldName;
            this.trigger(legendClickEvent);
        },

        formatTooltip: function(series, hcPoint) {
            var pointIndex = hcPoint.index,
                xAxis = this.xAxisList[0],
                yAxis = this.yAxisList[0],
                seriesName = series.getName(),
                xSeries = this.dataSet.getSeries(this.xField),
                ySeries = this.dataSet.getSeries(this.yField),
                xValue = this.isMultiSeries ? this.filterDataByNameMatch(xSeries, seriesName)[pointIndex] : xSeries[pointIndex],
                yValue = this.isMultiSeries ? this.filterDataByNameMatch(ySeries, seriesName)[pointIndex] : ySeries[pointIndex],

                templateInfo = {
                    isMultiSeries: this.isMultiSeries,
                    xAxisName: this.xField,
                    xValue: xAxis.formatValue(xValue),
                    yAxisName: this.yField,
                    yValue: yAxis.formatValue(yValue)
                };

            if(this.isMultiSeries) {
                $.extend(templateInfo, {
                    labelSeriesName: this.labelField
                });
            }
            return series.getTooltipHtml(templateInfo);
        },

        // FIXME: this logic is duplicated inside the scatter multi-series
        filterDataByNameMatch: function(dataSeries, name) {
            var labelData = this.dataSet.getSeries(this.labelField);
            return _(dataSeries).filter(function(point, i) {
                return labelData[i] === name;
            });
        }

    });
            
    return ScatterChart;
            
});
define('js_charting/visualizations/gauges/Gauge',[
            'jquery',
            'underscore',
            'highcharts',
            '../Visualization',
            '../../helpers/Formatter',
            '../../components/ColorPalette',
            '../../util/lang_utils',
            '../../util/parsing_utils',
            '../../util/testing_utils',
            '../../util/math_utils',
            '../../util/dom_utils',
            '../../util/color_utils',
            'splunk.i18n'
        ], 
        function(
            $,
            _,
            Highcharts,
            Visualization,
            Formatter,
            ColorPalette,
            langUtils,
            parsingUtils,
            testingUtils,
            mathUtils,
            domUtils,
            colorUtils,
            i18n
        ) {

    var Gauge = function(container, properties) {
        Visualization.call(this, container, properties);
        // for consistency with other chart types, create a <div> inside this container where the gauge will draw
        this.$hcContainer = $('<div />').addClass('highcharts-container').appendTo(this.container);
        this.elements = {};
        this.hasRendered = false;
        this.needsRedraw = true;
    };
    langUtils.inherit(Gauge, Visualization);

    $.extend(Gauge.prototype, {

        WINDOW_RESIZE_DELAY: 100,

        EXPORT_HEIGHT: 400,
        EXPORT_WIDTH: 600,

        MIN_GAUGE_HEIGHT: 25,
        RESIZED_GAUGE_HEIGHT: 200,

        DEFAULT_COLORS: [0x69a847, 0xd5c43b, 0xa6352d],
        DEFAULT_RANGES: [0, 30, 70, 100],
        MAX_TICKS_PER_RANGE: 10,

        showValueByDefault: true,
        showMinorTicksByDefault: true,

        // in export mode we need to set explicit width and height
        // we'll honor the width and height of the parent node, unless they are zero
        getWidth: function() {
            var width = Visualization.prototype.getWidth.call(this);
            if(this.exportMode) {
                return width || this.EXPORT_WIDTH;
            }
            return width;
        },

        getHeight: function() {
            var height = Visualization.prototype.getHeight.call(this);
            if(this.exportMode) {
                return height || this.EXPORT_HEIGHT;
            }
            // Fix for SPL-61657 - make sure the height of the gauge div can't be below a certain threshold
            height = (height < this.MIN_GAUGE_HEIGHT) ? this.RESIZED_GAUGE_HEIGHT : height;
            return height;
        },

        prepare: function(dataSet, properties) {
            var oldRanges = $.extend([], this.ranges);
            Visualization.prototype.prepare.call(this, dataSet, properties);
            if(!parsingUtils.arraysAreEquivalent(oldRanges, this.ranges)) {
                this.needsRedraw = true;
            }
        },

        draw: function(callback) {
            if(this.needsRedraw) {
                this.destroy();
                this.renderer = new Highcharts.Renderer(this.$hcContainer[0], this.getWidth(), this.getHeight());
                this.formatter = new Formatter(this.renderer);
                this.$container.css('backgroundColor', this.backgroundColor);
                this.renderGauge();
                this.nudgeChart();
                this.hasRendered = true;
                if(this.testMode) {
                    testingUtils.gaugeAddTestingMetadata(this, this.elements, this.getClassName(), this.value);
                    testingUtils.createGlobalReference(this, this.getChartObject());
                }
                this.needsRedraw = false;
            }
            else {
                this.updateValue(this.previousValue, this.value);
            }

            if(callback) {
                callback(this);
            }
        },

        setSize: function(width, height) {
            if(!this.hasRendered) {
                return;
            }
            this.destroy();
            this.renderer = new Highcharts.Renderer(this.$hcContainer[0], width, height);
            this.formatter = new Formatter(this.renderer);
            this.renderGauge();
            this.nudgeChart();
            this.hasRendered = true;
        },

        destroy: function() {
            var key;
            // stop any running animations
            this.stopWobble();
            this.$container.stop();
            for(key in this.elements) {
                if(this.elements.hasOwnProperty(key)) {
                    this.elements[key].destroy();
                }
            }
            this.elements = {};
            this.$hcContainer.empty();
            this.$container.css('backgroundColor', '');
            this.hasRendered = false;
        },

        getSVG: function() {
            return this.$container.find('svg').eq(0).parent().html();
        },

        processProperties: function() {
            Visualization.prototype.processProperties.call(this);
            this.colors = this.computeColors();
            this.colorPalette = new ColorPalette(this.colors, true);
            this.ranges = this.computeRanges();
            this.previousValue = this.value;
            this.value = this.computeValue();

            this.majorUnit = parseInt(this.properties['chart.majorUnit'], 10) || null;
            this.showMajorTicks = parsingUtils.normalizeBoolean(this.properties['chart.showMajorTicks'], true);
            this.showMinorTicks = parsingUtils.normalizeBoolean(this.properties['chart.showMinorTicks'], this.showMinorTicksByDefault);
            this.showLabels = parsingUtils.normalizeBoolean(this.properties['chart.showLabels'], true);
            this.showValue = parsingUtils.normalizeBoolean(this.properties['chart.showValue'], this.showValueByDefault);
            this.showRangeBand = parsingUtils.normalizeBoolean(this.properties['chart.showRangeBand'], true);
            this.usePercentageRange = parsingUtils.normalizeBoolean(this.properties['chart.usePercentageRange']);
            this.usePercentageValue = parsingUtils.normalizeBoolean(this.properties['chart.usePercentageValue']);
            this.isShiny = this.properties['chart.style'] !== 'minimal';
        },

        computeColors: function() {
            var userColors = parsingUtils.stringToHexArray(this.properties['chart.gaugeColors'] || this.properties['gaugeColors']);
            return (userColors && userColors.length > 0) ? userColors : this.DEFAULT_COLORS;
        },

        computeRanges: function() {
            var ranges,
                userRanges = parsingUtils.stringToArray(this.properties['chart.rangeValues']),
                autoRanges = parsingUtils.normalizeBoolean(this.properties['gaugeAutoRanges']);
            
            if(!autoRanges && userRanges && userRanges.length > 1) {
                ranges = userRanges;
            } else {
                var seriesIndexes = _.range(1, this.dataSet.length);
                ranges = _(seriesIndexes).map(function(i) {
                    return this.dataSet.seriesAt(i)[0];
                }, this);
            }
            var prevRange = -Infinity,
                floatRanges = [];

            _(ranges).each(function(range) {
                var floatRange = mathUtils.parseFloat(range);
                if(!_(floatRange).isNaN() && floatRange > prevRange) {
                    floatRanges.push(floatRange);
                    prevRange = floatRange;
                }
            });

            return (floatRanges.length > 1) ? floatRanges : this.DEFAULT_RANGES;
        },

        computeValue: function() {
            return (this.dataSet.seriesAt(0)) ? mathUtils.parseFloat(this.dataSet.seriesAt(0)[0]) || 0 : 0;
        },

        updateValue: function(oldValue, newValue) {
            // if the value didn't change, do nothing
            if(oldValue === newValue) {
                return;
            }
            if(this.shouldAnimateTransition(oldValue, newValue)) {
                this.stopWobble();
                this.animateTransition(oldValue, newValue, _(this.drawIndicator).bind(this), _(this.onAnimationFinished).bind(this));
            }
            if(this.showValue) {
                var valueText = this.formatValue(newValue);
                this.updateValueDisplay(valueText);
            }
            if(this.testMode) {
                testingUtils.gaugeUpdate(this.$container, newValue);
            }
        },

        shouldAnimateTransition: function(oldValue, newValue) {
            // if we were already out of range, no need to animate the indicator
            return (this.normalizedTranslateValue(oldValue) !== this.normalizedTranslateValue(newValue));
        },

        drawTicks: function() {
            var i, loopTranslation, loopText,
                tickValues = this.calculateTickValues(this.ranges[0], this.ranges[this.ranges.length - 1], this.MAX_TICKS_PER_RANGE);

            for(i = 0; i < tickValues.length; i++) {
                loopTranslation = this.translateValue(tickValues[i]);
                if(this.showMajorTicks) {
                    this.elements['tickMark_' + tickValues[i]] = this.drawMajorTick(loopTranslation);
                }
                if(this.showLabels) {
                    loopText = this.formatTickLabel(tickValues[i]);
                    this.elements['tickLabel_' + tickValues[i]] = this.drawMajorTickLabel(loopTranslation, loopText);
                }
            }
            // if the labels are visible, check for collisions and remove ticks if needed before drawing the minors
            if(this.showLabels) {
                tickValues = this.removeTicksIfOverlap(tickValues);
            }

            if(this.showMinorTicks) {
                var majorInterval = tickValues[1] - tickValues[0],
                    minorInterval = majorInterval / this.minorsPerMajor,
                    startValue = (this.usePercentageRange) ?
                        this.ranges[0] :
                        tickValues[0] - Math.floor((tickValues[0] - this.ranges[0]) / minorInterval) * minorInterval;

                for(i = startValue; i <= this.ranges[this.ranges.length - 1]; i += minorInterval) {
                    if(!this.showMajorTicks || $.inArray(i, tickValues) < 0) {
                        loopTranslation = this.translateValue(i);
                        this.elements['minorTickMark_' + i] = this.drawMinorTick(loopTranslation);
                    }
                }
            }
        },

        removeTicksIfOverlap: function(tickValues) {
            while(tickValues.length > 2 && this.tickLabelsOverlap(tickValues)) {
                tickValues = this.removeEveryOtherTick(tickValues);
            }
            return tickValues;
        },

        tickLabelsOverlap: function(tickValues) {
            var i, labelOne, labelTwo,
                marginX = 3,
                marginY = 1;

            for(i = 0; i < tickValues.length - 1; i++) {
                labelOne = this.elements['tickLabel_' + tickValues[i]];
                labelTwo = this.elements['tickLabel_' + tickValues[i + 1]];
                if(this.formatter.bBoxesOverlap(labelOne.getBBox(), labelTwo.getBBox(), marginX, marginY)) {
                    return true;
                }
            }
            return false;
        },

        removeEveryOtherTick: function(tickValues) {
            var i,
                newTickValues = [];

            for(i = 0; i < tickValues.length; i++) {
                if(i % 2 === 0) {
                    newTickValues.push(tickValues[i]);
                }
                else {
                    this.elements['tickMark_' + tickValues[i]].destroy();
                    this.elements['tickLabel_' + tickValues[i]].destroy();
                    delete this.elements['tickMark_' + tickValues[i]];
                    delete this.elements['tickLabel_' + tickValues[i]];
                }
            }
            return newTickValues;
        },

        // we can't use the jQuery animation library explicitly to perform complex SVG animations, but
        // we can take advantage of their implementation using a meaningless css property and a custom step function
        animateTransition: function(startVal, endVal, drawFn, finishCallback) {
            var animationRange = endVal - startVal,
                duration = 500,
                animationProperties = {
                    duration: duration,
                    step: function(now) {
                        drawFn(startVal + now);
                        this.nudgeChart();
                    }.bind(this)
                };

            if(finishCallback) {
                animationProperties.complete = function() {
                    finishCallback(endVal);
                };
            }
            // for the animation start and end values, use 0 and animationRange for consistency with the way jQuery handles
            // css properties that it doesn't recognize
            this.$container
                .stop(true, true)
                .css({'animation-progress': 0})
                .animate({'animation-progress': animationRange}, animationProperties);
        },

        onAnimationFinished: function(val) {
            this.checkOutOfRange(val);
        },

        checkOutOfRange: function(val) {
            var totalRange, wobbleCenter, wobbleRange;

            if(val < this.ranges[0]) {
                totalRange = this.ranges[this.ranges.length - 1] - this.ranges[0];
                wobbleRange = totalRange * 0.005;
                wobbleCenter = this.ranges[0] + wobbleRange;
                this.wobble(wobbleCenter, wobbleRange, this.drawIndicator);
            }
            else if(val > this.ranges[this.ranges.length - 1]) {
                totalRange = this.ranges[this.ranges.length - 1] - this.ranges[0];
                wobbleRange = totalRange * 0.005;
                wobbleCenter = this.ranges[this.ranges.length - 1] - wobbleRange;
                this.wobble(wobbleCenter, wobbleRange, this.drawIndicator);
            }
        },

        formatValue: function(val) {
            return (this.usePercentageValue) ?
                this.formatPercent(((val - this.ranges[0]) / (this.ranges[this.ranges.length - 1] - this.ranges[0]))) :
                this.formatNumber(val);
        },

        formatTickLabel: function(val) {
            return (this.usePercentageRange) ?
                this.formatPercent(((val - this.ranges[0]) / (this.ranges[this.ranges.length - 1] - this.ranges[0]))) :
                this.formatNumber(val);
        },

        formatNumber: function(val) {
            var parsedVal = parseFloat(val),
                absVal = Math.abs(parsedVal);
            // if the magnitude is 1 billion or greater or less than one thousandth (and non-zero), express it in scientific notation
            if(absVal >= 1e9 || (absVal !== 0 && absVal < 1e-3)) {
                return i18n.format_scientific(parsedVal, "#.###E0");
            }
            return i18n.format_decimal(parsedVal);
        },

        formatPercent: function(val) {
            return i18n.format_percent(val);
        },

        wobble: function(center, range, drawFn) {
            var self = this,
                wobbleCounter = 0;

            this.wobbleInterval = setInterval(function() {
                var wobbleVal = center + (wobbleCounter % 3 - 1) * range;
                drawFn.call(self, wobbleVal);
                self.nudgeChart();
                wobbleCounter = (wobbleCounter + 1) % 3;
            }, 75);

        },

        stopWobble: function() {
            clearInterval(this.wobbleInterval);
        },

        nudgeChart: function() {
            // sometimes the VML renderer needs a "nudge" in the form of adding an invisible
            // element, this is a no-op for the SVG renderer
            if(domUtils.hasSVG) {
                return;
            }
            if(this.elements.nudgeElement) {
                this.elements.nudgeElement.destroy();
            }
            this.elements.nudgeElement = this.renderer.rect(0, 0, 0, 0).add();
        },

        predictTextWidth: function(text, fontSize) {
            return this.formatter.predictTextWidth(text, fontSize);
        },

        calculateTickValues: function(start, end, numTicks) {
            var i, loopStart,
                range = end - start,
                rawTickInterval = range / (numTicks - 1),
                nearestPowerOfTen = mathUtils.nearestPowerOfTen(rawTickInterval),
                roundTickInterval = nearestPowerOfTen,
                tickValues = [];

            if(this.usePercentageRange) {
                roundTickInterval = (this.majorUnit && !isNaN(this.majorUnit)) ? this.majorUnit : 10;
                for(i = 0; i <= 100; i += roundTickInterval) {
                    tickValues.push(start + (i / 100) * range);
                }
            }
            else {
                if(this.majorUnit && !isNaN(this.majorUnit)) {
                    roundTickInterval = this.majorUnit;
                }
                else {
                    if(range / roundTickInterval > numTicks) {
                        // if the tick interval creates too many ticks, bump up to a factor of two
                        roundTickInterval *= 2;
                    }
                    if(range / roundTickInterval > numTicks) {
                        // if there are still too many ticks, bump up to a factor of five (of the original)
                        roundTickInterval *= (5 / 2);
                    }
                    if(range / roundTickInterval > numTicks) {
                        // if there are still too many ticks, bump up to a factor of ten (of the original)
                        roundTickInterval *= 2;
                    }
                }
                // in normal mode we label in whole numbers, so the tick discovery loop starts at 0 or an appropriate negative number
                // but in percent mode we force it to label the first range value and go from there
                loopStart = (this.usePercentageRange) ?
                    start :
                    (start >= 0) ? 0 : (start - start % roundTickInterval);
                for(i = loopStart; i <= end; i += roundTickInterval) {
                    if(i >= start) {
                        // work-around to deal with floating-point rounding errors
                        tickValues.push(parseFloat(i.toFixed(14)));
                    }
                }
            }
            return tickValues;
        },

        getColorByIndex: function(index) {
            return colorUtils.colorFromHex(this.colorPalette.getColor(null, index, this.ranges.length - 1));
        },

        // this is just creating a stub interface so automated tests won't fail
        getChartObject: function() {
            return {
                series: [
                    {
                        data: [
                               {
                                   y: this.value,
                                   onMouseOver: function() { }
                               }
                        ]
                    }
                ]
            };
        },


        // to be implemented by subclasses
        renderGauge: function() {
            this.updateDimensions();
        },
        translateValue: function() { },
        normalizedTranslateValue: function() { }

    });

    return Gauge;
    
});

define('js_charting/visualizations/gauges/RadialGauge',[
            'jquery',
            'underscore',
            './Gauge',
            '../../util/lang_utils',
            '../../util/math_utils'
        ], 
        function(
            $,
            _,
            Gauge,
            langUtils,
            mathUtils
        ) {

    var RadialGauge = function(container, properties) {
        Gauge.call(this, container, properties);
    };
    langUtils.inherit(RadialGauge, Gauge);

    $.extend(RadialGauge.prototype, {

        showMinorTicksByDefault: false,

        updateDimensions: function() {
            Gauge.prototype.updateDimensions.call(this);
            // since the gauge is circular, have to handle when the container is narrower than it is tall
            if(this.width < this.height) {
                this.$container.height(this.width);
                this.height = this.width;
            }
        },

        processProperties: function() {
            Gauge.prototype.processProperties.call(this);
            this.verticalPadding = 10;
            this.minorsPerMajor = 10;
            this.tickWidth = 1;

            this.startAngle = this.computeStartAngle();
            this.arcAngle = this.computeArcAngle();
        },

        computeStartAngle: function() {
            var angle = parseInt(this.properties['chart.rangeStartAngle'], 10);
            if(_(angle).isNaN()) {
                angle = 45;
            }
            // add 90 to startAngle because we start at south instead of east
            return mathUtils.degreeToRadian(angle + 90);
        },

        computeArcAngle: function() {
            var angle = parseInt(this.properties['chart.rangeArcAngle'], 10) || 270;
            return mathUtils.degreeToRadian(angle);
        },

        renderGauge: function() {
            Gauge.prototype.renderGauge.call(this);
            this.borderWidth = mathUtils.roundWithMin(this.height / 60, 3);
            this.tickOffset = mathUtils.roundWithMin(this.height / 100, 3);
            this.tickLabelOffset = this.borderWidth;
            this.tickFontSize = mathUtils.roundWithMin(this.height / 25, 10);  // in pixels
            this.valueFontSize = mathUtils.roundWithMin(this.height / 15, 15);  // in pixels
            if(this.isShiny) {
                this.needleTailLength = mathUtils.roundWithMin(this.height / 15, 10);
                this.needleTailWidth = mathUtils.roundWithMin(this.height / 50, 6);
                this.knobWidth = mathUtils.roundWithMin(this.height / 30, 7);
            }
            else {
                this.needleWidth = mathUtils.roundWithMin(this.height / 60, 3);
            }
            if(!this.isShiny) {
                this.bandOffset = 0;
                this.bandThickness = mathUtils.roundWithMin(this.height / 30, 7);
            }
            else {
                this.bandOffset = this.borderWidth;
                this.bandThickness = mathUtils.roundWithMin(this.height / 40, 4);
            }
            this.tickColor = (!this.isShiny) ? this.foregroundColor : 'silver';
            this.tickFontColor = (!this.isShiny) ? this.fontColor : 'silver';
            this.valueColor = (!this.isShiny) ? this.fontColor : '#b8b167';
            this.tickLength = mathUtils.roundWithMin(this.height / 20, 4);
            this.minorTickLength = this.tickLength / 2;
            this.radius = (this.height - 2 * (this.verticalPadding + this.borderWidth)) / 2;
            this.valueHeight = this.height - ((this.radius / 4) + this.verticalPadding + this.borderWidth);
            this.needleLength = (!this.isShiny) ? this.radius - (this.bandThickness) / 2 : this.radius;

            this.tickStart = this.radius - this.bandOffset - this.bandThickness - this.tickOffset;
            this.tickEnd = this.tickStart - this.tickLength;
            this.tickLabelPosition = this.tickEnd - this.tickLabelOffset;
            this.minorTickEnd = this.tickStart - this.minorTickLength;

            if(this.isShiny) {
                this.elements.border = this.renderer.circle(this.width / 2,
                    this.height / 2, this.radius + this.borderWidth)
                    .attr({
                        fill: '#edede7',
                        stroke: 'silver',
                        'stroke-width': 1
                    })
                    .add();

                this.elements.background = this.renderer.circle(this.width / 2,
                    this.height / 2, this.radius)
                    .attr({
                        fill: '#000000'
                    })
                    .add();
            }

            if(this.showRangeBand) {
                this.drawColorBand();
            }
            this.drawTicks();
            this.drawIndicator(this.value);
            if(this.showValue) {
                this.drawValueDisplay();
            }

            this.checkOutOfRange(this.value);
        },

        updateValueDisplay: function(valueText) {
            this.elements.valueDisplay.attr({
                text: valueText
            });
        },

        drawColorBand: function() {
            var i, startAngle, endAngle,
                outerRadius = this.radius - this.bandOffset,
                innerRadius = outerRadius - this.bandThickness;

            for(i = 0; i < this.ranges.length - 1; i++) {
                startAngle = this.translateValue(this.ranges[i]);
                endAngle = this.translateValue(this.ranges[i + 1]);

                this.elements['colorBand' + i] = this.renderer.arc(this.width / 2, this.height / 2,
                    outerRadius, innerRadius, startAngle, endAngle)
                    .attr({
                        fill: this.getColorByIndex(i)
                    })
                    .add();
            }
        },

        drawMajorTick: function(angle) {
            return this.renderer.path([
                'M', (this.width / 2) + this.tickStart * Math.cos(angle),
                (this.height / 2) + this.tickStart * Math.sin(angle),
                'L', (this.width / 2) + this.tickEnd * Math.cos(angle),
                (this.height / 2) + this.tickEnd * Math.sin(angle)
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawMajorTickLabel: function(angle, text) {
            var sin = Math.sin(angle),
                labelWidth = this.predictTextWidth(text, this.tickFontSize),
                textAlignment = (angle < (1.5 * Math.PI)) ? 'left' : 'right',
                xOffset = (angle < (1.5 * Math.PI)) ? (-labelWidth / 2) * sin *  sin :
                    (labelWidth / 2) * sin * sin,
                yOffset = (this.tickFontSize / 4) * sin;

            return this.renderer.text(text,
                (this.width / 2) + (this.tickLabelPosition) * Math.cos(angle)
                    + xOffset,
                (this.height / 2) + (this.tickLabelPosition - 4) * sin
                    + (this.tickFontSize / 4) - yOffset
            )
                .attr({
                    align: textAlignment
                })
                .css({
                    color: this.tickFontColor,
                    fontSize: this.tickFontSize + 'px'
                })
                .add();
        },

        drawMinorTick: function(angle) {
            return this.renderer.path([
                'M', (this.width / 2) + this.tickStart * Math.cos(angle),
                (this.height / 2) + this.tickStart * Math.sin(angle),
                'L', (this.width / 2) + this.minorTickEnd * Math.cos(angle),
                (this.height / 2) + this.minorTickEnd * Math.sin(angle)
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawIndicator: function(val) {
            var needlePath, needleStroke, needleStrokeWidth,
                needleFill, needleRidgePath, knobFill,
                valueAngle = this.normalizedTranslateValue(val),
                myCos = Math.cos(valueAngle),
                mySin = Math.sin(valueAngle);

            if(!this.isShiny) {
                needlePath = [
                    'M', (this.width / 2),
                    (this.height / 2),
                    'L', (this.width / 2) + myCos * this.needleLength,
                    (this.height / 2) + mySin * this.needleLength
                ];
                needleStroke = this.foregroundColor;
                needleStrokeWidth = this.needleWidth;
            }
            else {
                needlePath = [
                    'M', (this.width / 2) - this.needleTailLength * myCos,
                    (this.height / 2) - this.needleTailLength * mySin,
                    'L', (this.width / 2) - this.needleTailLength * myCos + this.needleTailWidth * mySin,
                    (this.height / 2) - this.needleTailLength * mySin - this.needleTailWidth * myCos,
                    (this.width / 2) + this.needleLength * myCos,
                    (this.height / 2) + this.needleLength * mySin,
                    (this.width / 2) - this.needleTailLength * myCos - this.needleTailWidth * mySin,
                    (this.height / 2) - this.needleTailLength * mySin + this.needleTailWidth * myCos,
                    (this.width / 2) - this.needleTailLength * myCos,
                    (this.height / 2) - this.needleTailLength * mySin
                ];
                needleFill = {
                    linearGradient: [(this.width / 2) - this.needleTailLength * myCos,
                        (this.height / 2) - this.needleTailLength * mySin,
                        (this.width / 2) - this.needleTailLength * myCos - this.needleTailWidth * mySin,
                        (this.height / 2) - this.needleTailLength * mySin + this.needleTailWidth * myCos],
                    stops: [
                        [0, '#999999'],
                        [0.2, '#cccccc']
                    ]
                };
                needleRidgePath = [
                    'M', (this.width / 2) - (this.needleTailLength - 2) * myCos,
                    (this.height / 2) - (this.needleTailLength - 2) * mySin,
                    'L', (this.width / 2) + (this.needleLength - (this.bandOffset / 2)) * myCos,
                    (this.height / 2) + (this.needleLength - (this.bandOffset / 2)) * mySin
                ];
                knobFill = {
                    linearGradient: [(this.width / 2) + this.knobWidth * mySin,
                        (this.height / 2) - this.knobWidth * myCos,
                        (this.width / 2) - this.knobWidth * mySin,
                        (this.height / 2) + this.knobWidth * myCos],
                    stops: [
                        [0, 'silver'],
                        [0.5, 'black'],
                        [1, 'silver']
                    ]
                };
            }
            if(this.isShiny) {
                if(this.elements.centerKnob) {
                    this.elements.centerKnob.destroy();
                }
                this.elements.centerKnob = this.renderer.circle(this.width / 2, this.height /2, this.knobWidth)
                    .attr({
                        fill: knobFill
                    })
                    .add();
            }
            if(this.elements.needle) {
                this.elements.needle.destroy();
            }
            this.elements.needle = this.renderer.path(needlePath)
                .attr({
                    fill: needleFill || '',
                    stroke: needleStroke || '',
                    'stroke-width': needleStrokeWidth || ''
                })
                .add();
            if(this.isShiny) {
                if(this.elements.needleRidge) {
                    this.elements.needleRidge.destroy();
                }
                this.elements.needleRidge = this.renderer.path(needleRidgePath)
                    .attr({
                        stroke: '#cccccc',
                        'stroke-width': 1
                    })
                    .add();
            }
        },

        drawValueDisplay: function() {
            var valueText = this.formatValue(this.value);
            this.elements.valueDisplay = this.renderer.text(valueText, this.width / 2, this.valueHeight)
                .css({
                    color: this.valueColor,
                    fontSize: this.valueFontSize + 'px',
                    fontWeight: 'bold'
                })
                .attr({
                    align: 'center'
                })
                .add();
        },

        getSVG: function() {
            // a little bit of cleanup is required here since the export renderer doesn't support gradients
            if(this.elements.centerKnob) {
                this.elements.centerKnob.attr({ fill: '#999999' });
            }
            this.elements.needle.attr({ fill: '#bbbbbb' });
            if(this.elements.needleRidge) {
                this.elements.needleRidge.attr({ stroke: '#999999' });
            }
            return Gauge.prototype.getSVG.call(this);
        },

        normalizedTranslateValue: function(val) {
            if(val < this.ranges[0]) {
                return this.translateValue(this.ranges[0]);
            }
            if(val > this.ranges[this.ranges.length - 1]) {
                return this.translateValue(this.ranges[this.ranges.length - 1]);
            }
            return this.translateValue(val);
        },

        translateValue: function(val) {
            var dataRange = this.ranges[this.ranges.length - 1] - this.ranges[0],
                normalizedValue = val - this.ranges[0];

            return this.startAngle + ((normalizedValue / dataRange) * this.arcAngle);
        }

    });

    return RadialGauge;
    
});
define('js_charting/visualizations/gauges/FillerGauge',[
            'jquery',
            './Gauge',
            '../../util/lang_utils',
            '../../util/math_utils',
            '../../util/color_utils'
        ], 
        function(
            $,
            Gauge,
            langUtils,
            mathUtils,
            colorUtils
        ) {

    var FillerGauge = function(container, properties) {
        Gauge.call(this, container, properties);
        this.minorsPerMajor = 5;
        this.minorTickWidth = 1;
    };
    langUtils.inherit(FillerGauge, Gauge);

    $.extend(FillerGauge.prototype, {

        processProperties: function() {
            Gauge.prototype.processProperties.call(this);
        },

        onAnimationFinished: function() {
            // no-op for filler gauges
        },

        renderGauge: function() {
            Gauge.prototype.renderGauge.call(this);
            this.tickColor = this.foregroundColor;
            this.tickFontColor = this.fontColor;
            this.defaultValueColor = (this.isShiny) ? 'black' : this.fontColor;
            this.drawBackground();
            this.drawTicks();
            this.drawIndicator(this.value);
        },

        // use the decimal precision of the old and new values to set things up for a smooth animation
        updateValue: function(oldValue, newValue) {
            var oldPrecision = mathUtils.getDecimalPrecision(oldValue, 3),
                newPrecision = mathUtils.getDecimalPrecision(newValue, 3);

            this.valueAnimationPrecision = Math.max(oldPrecision, newPrecision);
            Gauge.prototype.updateValue.call(this, oldValue, newValue);
        },

        getDisplayValue: function(rawVal) {
            // unless this we are displaying a final value, round the value to the animation precision for a smooth transition
            var multiplier = Math.pow(10, this.valueAnimationPrecision);
            return ((rawVal !== this.value) ? (Math.round(rawVal * multiplier) / multiplier) : rawVal);
        },

        updateValueDisplay: function() {
            // no-op, value display is updated as part of drawIndicator
        },

        // filler gauges animate the change in the value display,
        // so they always animate transitions, even when the values are out of range
        shouldAnimateTransition: function() {
            return true;
        },

        getFillColor: function(val) {
            var i;
            for(i = 0; i < this.ranges.length - 2; i++) {
                if(val < this.ranges[i + 1]) {
                    break;
                }
            }
            return this.getColorByIndex(i);
        },

        // use the value to determine the fill color, then use that color's luminance determine
        // if a light or dark font color should be used
        getValueColor: function(fillColor) {
            var fillColorHex = colorUtils.hexFromColor(fillColor),
                luminanceThreshold = 128,
                darkColor = 'black',
                lightColor = 'white',
                fillLuminance = colorUtils.getLuminance(fillColorHex);

            return (fillLuminance < luminanceThreshold) ? lightColor : darkColor;
        }

    });

    return FillerGauge;
    
});
define('js_charting/visualizations/gauges/HorizontalFillerGauge',[
            'jquery',
            './FillerGauge',
            '../../util/lang_utils',
            '../../util/math_utils'
        ],
        function(
            $,
            FillerGauge,
            langUtils,
            mathUtils
        ) {

    var HorizontalFillerGauge = function(container, properties) {
        FillerGauge.call(this, container, properties);
        this.horizontalPadding = 20;
        this.tickOffset = 5;
        this.tickLength = 15;
        this.tickWidth = 1;
        this.tickLabelOffset = 5;
        this.minorTickLength = Math.floor(this.tickLength / 2);
    };
    langUtils.inherit(HorizontalFillerGauge, FillerGauge);

    $.extend(HorizontalFillerGauge.prototype, {

        renderGauge: function() {
            this.tickFontSize = mathUtils.roundWithMinMax(this.width / 50, 10, 20);  // in pixels
            this.backgroundCornerRad = mathUtils.roundWithMinMax(this.width / 120, 3, 5);
            this.valueFontSize = mathUtils.roundWithMinMax(this.width / 40, 15, 25);  // in pixels
            this.backgroundHeight = this.valueFontSize * 3;
            this.valueBottomPadding = mathUtils.roundWithMinMax(this.width / 100, 5, 10);
            FillerGauge.prototype.renderGauge.call(this);
        },

        drawBackground: function() {
            var tickValues = this.calculateTickValues(this.ranges[0], this.ranges[this.ranges.length - 1], this.MAX_TICKS_PER_RANGE),
                maxTickValue = tickValues[tickValues.length - 1],
                maxTickWidth = this.predictTextWidth(this.formatValue(maxTickValue), this.tickFontSize);

            this.horizontalPadding = Math.max(this.horizontalPadding, maxTickWidth);
            this.backgroundWidth = this.width - (2 * this.horizontalPadding);

            if(this.isShiny) {
                this.elements.background = this.renderer.rect(this.horizontalPadding,
                    (this.height - this.backgroundHeight) / 2, this.backgroundWidth, this.backgroundHeight,
                    this.backgroundCornerRad)
                    .attr({
                        fill: '#edede7',
                        stroke: 'silver',
                        'stroke-width': 1
                    })
                    .add();
            }

            // no actual dependency here, but want to be consistent with sibling class
            this.tickStartY = (this.height + this.backgroundHeight) / 2 + this.tickOffset;
            this.tickEndY = this.tickStartY + this.tickLength;
            this.tickLabelStartY = this.tickEndY + this.tickLabelOffset;
        },

        drawMajorTick: function(offset) {
            var tickOffset = this.horizontalPadding + offset;

            return this.renderer.path([
                'M', tickOffset, this.tickStartY,
                'L', tickOffset, this.tickEndY
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawMajorTickLabel: function(offset, text) {
            var tickOffset = this.horizontalPadding + offset;

            return this.renderer.text(text,
                tickOffset, this.tickLabelStartY + this.tickFontSize
            )
                .attr({
                    align: 'center'
                })
                .css({
                    color: this.tickFontColor,
                    fontSize: this.tickFontSize + 'px'
                })
                .add();
        },

        drawMinorTick: function(offset) {
            var tickOffset = this.horizontalPadding + offset;

            return this.renderer.path([
                'M', tickOffset, this.tickStartY,
                'L', tickOffset, this.tickStartY + this.minorTickLength
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.minorTickWidth
                })
                .add();
        },

        drawIndicator: function(val) {
            // TODO: implement calculation of gradient based on user-defined colors
            // for not we are using solid colors

            var //fillGradient = this.getFillGradient(val),
                fillColor = this.getFillColor(val),
                fillOffset = this.normalizedTranslateValue(val),
                fillTopX,
                fillPath;
            if(fillOffset > 0) {
                fillOffset = Math.max(fillOffset, this.backgroundCornerRad);
                fillTopX = this.horizontalPadding + fillOffset;
                if(!this.isShiny) {
                    fillPath = [
                        'M', this.horizontalPadding,
                        (this.height - this.backgroundHeight) / 2,
                        'L', fillTopX,
                        (this.height - this.backgroundHeight) / 2,
                        fillTopX,
                        (this.height + this.backgroundHeight) / 2,
                        this.horizontalPadding,
                        (this.height + this.backgroundHeight) / 2,
                        this.horizontalPadding,
                        (this.height - this.backgroundHeight) / 2
                    ];
                }
                else {
                    fillPath = [
                        'M', this.horizontalPadding + this.backgroundCornerRad,
                        (this.height - this.backgroundHeight - 2) / 2,
                        'C', this.horizontalPadding + this.backgroundCornerRad,
                        (this.height - this.backgroundHeight - 2) / 2,
                        this.horizontalPadding,
                        (this.height - this.backgroundHeight - 2) / 2,
                        this.horizontalPadding,
                        (this.height - this.backgroundHeight - 2) / 2 + this.backgroundCornerRad,
                        'L', this.horizontalPadding,
                        (this.height + this.backgroundHeight) / 2 - this.backgroundCornerRad,
                        'C', this.horizontalPadding,
                        (this.height + this.backgroundHeight) / 2 - this.backgroundCornerRad,
                        this.horizontalPadding,
                        (this.height + this.backgroundHeight) / 2,
                        this.horizontalPadding + this.backgroundCornerRad,
                        (this.height + this.backgroundHeight) / 2,
                        'L', fillTopX,
                        (this.height + this.backgroundHeight) / 2,
                        fillTopX,
                        (this.height - this.backgroundHeight - 2) / 2,
                        this.horizontalPadding + this.backgroundCornerRad,
                        (this.height - this.backgroundHeight - 2) / 2
                    ];
                }
            }
            else {
                fillPath = [];
            }

            if(this.elements.fill) {
                this.elements.fill.destroy();
            }
            this.elements.fill = this.renderer.path(fillPath)
                .attr({
                    fill: fillColor
                })
                .add();
            if(this.showValue) {
                this.drawValueDisplay(val, fillColor, fillOffset);
            }
        },

        drawValueDisplay: function(val, fillColor, fillOffset) {
            var displayVal = this.getDisplayValue(val),
                fillTopX = this.horizontalPadding + fillOffset,
                valueColor = this.getValueColor(fillColor),
                valueStartX,
                valueText = this.formatValue(displayVal),
                valueTotalWidth = this.predictTextWidth(valueText, this.valueFontSize) + this.valueBottomPadding;

            // determine if the value display can (horizontally) fit inside the fill,
            // if not orient it to the right of the fill
            if(fillOffset >= valueTotalWidth) {
                valueStartX = fillTopX - valueTotalWidth;
            }
            else {
                valueStartX = fillTopX + this.valueBottomPadding;
                valueColor = this.defaultValueColor;
            }
            if(this.elements.valueDisplay) {
                this.elements.valueDisplay.attr({
                    text: valueText,
                    x: valueStartX
                })
                    .css({
                        color: valueColor,
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    }).toFront();
            }
            else {
                this.elements.valueDisplay = this.renderer.text(
                    valueText, valueStartX, (this.height / 2) + this.valueFontSize / 4
                )
                    .css({
                        color: valueColor,
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    })
                    .attr({
                        align: 'left'
                    })
                    .add();
            }
        },

        normalizedTranslateValue: function(val) {
            if(val < this.ranges[0]) {
                return 0;
            }
            if(val > this.ranges[this.ranges.length - 1]) {
                return this.translateValue(this.ranges[this.ranges.length - 1]);
            }
            return this.translateValue(val);
        },

        translateValue: function(val) {
            var dataRange = this.ranges[this.ranges.length - 1] - this.ranges[0],
                normalizedValue = val - this.ranges[0];

            return Math.round((normalizedValue / dataRange) * this.backgroundWidth);
        }

    });

    return HorizontalFillerGauge;

});
define('js_charting/visualizations/gauges/VerticalFillerGauge',[
            'jquery',
            './FillerGauge',
            '../../util/lang_utils',        
            '../../util/math_utils'        
        ], 
        function(
            $,
            FillerGauge,
            langUtils,
            mathUtils
        ) {

    var VerticalFillerGauge = function(container, properties) {
        FillerGauge.call(this, container, properties);
        this.tickWidth = 1;
    };
    langUtils.inherit(VerticalFillerGauge, FillerGauge);

    $.extend(VerticalFillerGauge.prototype, {

        renderGauge: function() {
            this.tickOffset = mathUtils.roundWithMin(this.height / 100, 3);
            this.tickLength = mathUtils.roundWithMin(this.height / 20, 4);
            this.tickLabelOffset = mathUtils.roundWithMin(this.height / 60, 3);
            this.tickFontSize = mathUtils.roundWithMin(this.height / 20, 10);  // in pixels
            this.minorTickLength = this.tickLength / 2;
            this.backgroundCornerRad = mathUtils.roundWithMin(this.height / 60, 3);
            this.valueBottomPadding = mathUtils.roundWithMin(this.height / 30, 5);
            this.valueFontSize = mathUtils.roundWithMin(this.height / 20, 12);  // in pixels
            FillerGauge.prototype.renderGauge.call(this);
        },

        drawBackground: function() {
            this.verticalPadding = 10 + this.tickFontSize / 2;
            this.backgroundWidth = mathUtils.roundWithMin(this.height / 4, 50);
            this.backgroundHeight = this.height - (2 * this.verticalPadding);

            // rather than trying to dynamically increase the width as the values come in, we
            // provide enough room for an order of magnitude greater than the highest range value
            var maxValueWidth = this.determineMaxValueWidth(this.ranges, this.valueFontSize) + 10;

            this.backgroundWidth = Math.max(this.backgroundWidth, maxValueWidth);

            if(this.isShiny) {
                this.elements.background = this.renderer.rect((this.width - this.backgroundWidth) / 2,
                    this.verticalPadding, this.backgroundWidth, this.backgroundHeight,
                    this.backgroundCornerRad)
                    .attr({
                        fill: '#edede7',
                        stroke: 'silver',
                        'stroke-width': 1
                    })
                    .add();
            }

            // these values depend on the adjusted width of the background
            this.tickStartX = (this.width + this.backgroundWidth) / 2 + this.tickOffset;
            this.tickEndX = this.tickStartX + this.tickLength;
            this.tickLabelStartX = this.tickEndX + this.tickLabelOffset;
        },

        determineMaxValueWidth: function(ranges, fontSize) {
            // in percent mode, we can hard-code what the max-width value can be
            if(this.usePercentageValue) {
                return this.predictTextWidth("100.00%", fontSize);
            }
            var i, valueString,
                maxWidth = 0;

            // loop through all ranges and determine which has the greatest width (because of scientific notation, we can't just look at the extremes)
            // additionally add an extra digit to the min and max ranges to accomodate out-of-range values
            for(i = 0; i < ranges.length; i++) {
                valueString = "" + ranges[i];
                if(i === 0 || i === ranges.length - 1) {
                    valueString += "0";
                }
                maxWidth = Math.max(maxWidth, this.predictTextWidth(valueString, fontSize));
            }
            return maxWidth;
        },

        drawMajorTick: function(height) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - height;

            return this.renderer.path([
                'M', this.tickStartX, tickHeight,
                'L', this.tickEndX, tickHeight
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawMajorTickLabel: function(height, text) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - height;

            return this.renderer.text(text,
                this.tickLabelStartX, tickHeight + (this.tickFontSize / 4)
            )
                .attr({
                    align: 'left'
                })
                .css({
                    color: this.tickFontColor,
                    fontSize: this.tickFontSize + 'px'
                })
                .add();
        },

        drawMinorTick: function(height) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - height;

            return this.renderer.path([
                'M', this.tickStartX, tickHeight,
                'L', this.tickStartX + this.minorTickLength, tickHeight
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.minorTickWidth
                })
                .add();
        },

        drawIndicator: function(val) {
            // TODO: implement calculation of gradient based on user-defined colors
            // for now we are using solid colors

            var //fillGradient = this.getFillGradient(val),
                fillColor = this.getFillColor(val),
                fillHeight = this.normalizedTranslateValue(val),
                fillTopY,
                fillPath;
            if(fillHeight > 0) {
                fillHeight = Math.max(fillHeight, this.backgroundCornerRad);
                fillTopY = this.verticalPadding + this.backgroundHeight - fillHeight;
                if(!this.isShiny) {
                    fillPath = [
                        'M', (this.width - this.backgroundWidth) / 2,
                        this.height - this.verticalPadding,
                        'L', (this.width + this.backgroundWidth) / 2,
                        this.height - this.verticalPadding,
                        (this.width + this.backgroundWidth) / 2,
                        fillTopY,
                        (this.width - this.backgroundWidth) / 2,
                        fillTopY,
                        (this.width - this.backgroundWidth) / 2,
                        this.height - this.verticalPadding
                    ];
                }
                else {
                    fillPath = [
                        'M', (this.width - this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding - this.backgroundCornerRad,
                        'C', (this.width - this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding - this.backgroundCornerRad,
                        (this.width - this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding,
                        (this.width - this.backgroundWidth - 2) / 2 + this.backgroundCornerRad,
                        this.height - this.verticalPadding,
                        'L', (this.width + this.backgroundWidth - 2) / 2 - this.backgroundCornerRad,
                        this.height - this.verticalPadding,
                        'C', (this.width + this.backgroundWidth - 2) / 2 - this.backgroundCornerRad,
                        this.height - this.verticalPadding,
                        (this.width + this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding,
                        (this.width + this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding - this.backgroundCornerRad,
                        'L', (this.width + this.backgroundWidth - 2) / 2,
                        fillTopY,
                        (this.width - this.backgroundWidth - 2) / 2,
                        fillTopY,
                        (this.width - this.backgroundWidth - 2) / 2,
                        this.height - this.verticalPadding - this.backgroundCornerRad
                    ];
                }
            }
            else {
                fillPath = [];
            }

            if(this.elements.fill) {
                this.elements.fill.destroy();
            }
            this.elements.fill = this.renderer.path(fillPath)
                .attr({
                    fill: fillColor
                })
                .add();
            if(this.showValue) {
                this.drawValueDisplay(val, fillColor);
            }
        },

        drawValueDisplay: function(val, fillColor) {
            var displayVal = this.getDisplayValue(val),
                fillHeight = this.normalizedTranslateValue(val),
                fillTopY = this.verticalPadding + this.backgroundHeight - fillHeight,
                valueTotalHeight = this.valueFontSize + this.valueBottomPadding,

                valueColor = this.getValueColor(fillColor),
                valueBottomY,
                valueText = this.formatValue(displayVal);

            // determine if the value display can (vertically) fit inside the fill,
            // if not orient it to the bottom of the fill
            if(fillHeight >= valueTotalHeight) {
                valueBottomY = fillTopY + valueTotalHeight - this.valueBottomPadding;
            }
            else {
                valueBottomY = fillTopY - this.valueBottomPadding;
                valueColor = this.defaultValueColor;
            }
            if(this.elements.valueDisplay) {
                this.elements.valueDisplay.attr({
                    text: valueText,
                    y: valueBottomY
                })
                    .css({
                        color: valueColor,
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    }).toFront();
            }
            else {
                this.elements.valueDisplay = this.renderer.text(
                    valueText, this.width / 2, valueBottomY
                )
                    .css({
                        color: valueColor,
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    })
                    .attr({
                        align: 'center'
                    })
                    .add();
            }
        },

        normalizedTranslateValue: function(val) {
            if(val < this.ranges[0]) {
                return 0;
            }
            if(val > this.ranges[this.ranges.length - 1]) {
                return this.translateValue(this.ranges[this.ranges.length - 1]) + 5;
            }
            return this.translateValue(val);
        },

        translateValue: function(val) {
            var dataRange = this.ranges[this.ranges.length - 1] - this.ranges[0],
                normalizedValue = val - this.ranges[0];

            return Math.round((normalizedValue / dataRange) * this.backgroundHeight);
        }

    });

    return VerticalFillerGauge;
    
});
define('js_charting/visualizations/gauges/MarkerGauge',[
            'jquery',
            './Gauge',
            '../../util/lang_utils'
        ],
        function(
            $,
            Gauge,
            langUtils
        ) {

    var MarkerGauge = function(container, properties) {
        Gauge.call(this, container, properties);
        this.bandCornerRad = 0;
        this.tickLabelPaddingRight = 10;
        this.minorsPerMajor = 5;
        this.minorTickWidth = 1;
        this.tickWidth = 1;
    };
    langUtils.inherit(MarkerGauge, Gauge);

    $.extend(MarkerGauge.prototype, {

        showValueByDefault: false,

        renderGauge: function() {
            Gauge.prototype.renderGauge.call(this);
            this.tickColor = (this.isShiny) ? 'black' : this.foregroundColor;
            this.tickFontColor = (this.isShiny) ? 'black' : this.fontColor;
            this.valueOffset = (this.isShiny) ? this.markerSideWidth + 10 : this.valueFontSize;
            this.drawBackground();
            if(this.showRangeBand) {
                this.drawBand();
            }
            this.drawTicks();
            this.drawIndicator(this.value);
            this.checkOutOfRange(this.value);
        },

        updateValueDisplay: function() {
            // no-op, value display is updated as part of drawIndicator
        }

    });

    return MarkerGauge;

});
define('js_charting/visualizations/gauges/HorizontalMarkerGauge',[
            'jquery',
            './MarkerGauge',
            '../../util/lang_utils',
            '../../util/math_utils'
        ],
        function(
            $,
            MarkerGauge,
            langUtils,
            mathUtils
        ) {

    var HorizontalMarkerGauge = function(container, properties) {
        MarkerGauge.call(this, container, properties);
        this.horizontalPadding = 20;
        this.tickOffset = 5;
        this.tickLength = 15;
        this.tickWidth = 1;
        this.tickLabelOffset = 5;
        this.minorTickLength = Math.floor(this.tickLength / 2);
        this.bandHeight = (!this.isShiny) ? 35 : 15;
    };
    langUtils.inherit(HorizontalMarkerGauge, MarkerGauge);

    $.extend(HorizontalMarkerGauge.prototype, {

        renderGauge: function() {
            this.markerWindowHeight = mathUtils.roundWithMinMax(this.width / 30, 30, 80);
            this.markerSideWidth = this.markerWindowHeight / 2;
            this.markerSideCornerRad = this.markerSideWidth / 3;
            this.bandOffsetBottom = 5 + this.markerWindowHeight / 2;
            this.bandOffsetTop = 5 + this.markerWindowHeight / 2;
            this.tickFontSize = mathUtils.roundWithMinMax(this.width / 50, 10, 20);  // in pixels
            this.backgroundCornerRad = mathUtils.roundWithMinMax(this.width / 120, 3, 5);
            this.valueFontSize = mathUtils.roundWithMinMax(this.width / 40, 15, 25);  // in pixels
            this.valueOffset = this.markerSideWidth + 10;
            this.tickLabelPadding = this.tickFontSize / 2;
            this.bandOffsetX = (!this.isShiny) ? 0 : this.tickLabelPadding;
            this.backgroundHeight = this.bandOffsetX + this.bandHeight + this.tickOffset + this.tickLength
                + this.tickLabelOffset + this.tickFontSize + this.tickLabelPadding;
            MarkerGauge.prototype.renderGauge.call(this);
        },

        drawBackground: function(tickValues) {
            tickValues = this.calculateTickValues(this.ranges[0], this.ranges[this.ranges.length - 1], this.MAX_TICKS_PER_RANGE);
            var maxTickValue = tickValues[tickValues.length - 1],
                maxTickWidth = this.predictTextWidth(this.formatValue(maxTickValue), this.tickFontSize);

            this.bandOffsetBottom = Math.max(this.bandOffsetBottom, maxTickWidth);
            this.bandOffsetTop = Math.max(this.bandOffsetTop, maxTickWidth);
            this.backgroundWidth = this.width - (2 * this.horizontalPadding);
            this.bandWidth = this.backgroundWidth - (this.bandOffsetBottom + this.bandOffsetTop);

            if(this.isShiny) {
                this.elements.background = this.renderer.rect(this.horizontalPadding,
                    (this.height - this.backgroundHeight) / 2, this.backgroundWidth, this.backgroundHeight,
                    this.backgroundCornerRad)
                    .attr({
                        fill: '#edede7',
                        stroke: 'silver',
                        'stroke-width': 1
                    })
                    .add();
            }
        },

        drawBand: function() {
            var i, startOffset, endOffset,
                bandStartX = this.horizontalPadding + this.bandOffsetBottom,
                bandTopY = ((this.height - this.backgroundHeight) / 2) + this.bandOffsetX;

            for(i = 0; i < this.ranges.length - 1; i++) {
                startOffset = this.translateValue(this.ranges[i]);
                endOffset = this.translateValue(this.ranges[i + 1]);
                this.elements['colorBand' + i] = this.renderer.rect(
                    bandStartX + startOffset, bandTopY,
                    endOffset - startOffset, this.bandHeight, this.bandCornerRad
                )
                    .attr({
                        fill: this.getColorByIndex(i)
                    })
                    .add();
            }

            this.tickStartY = (this.height - this.backgroundHeight) / 2 + (this.bandOffsetX + this.bandHeight)
                + this.tickOffset;
            this.tickEndY = this.tickStartY + this.tickLength;
            this.tickLabelStartY = this.tickEndY + this.tickLabelOffset;
        },

        drawMajorTick: function(offset) {
            var tickOffset = this.horizontalPadding + this.bandOffsetBottom + offset;

            return this.renderer.path([
                'M', tickOffset, this.tickStartY,
                'L', tickOffset, this.tickEndY
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawMajorTickLabel: function(offset, text) {
            var tickOffset = this.horizontalPadding + this.bandOffsetBottom + offset;

            return this.renderer.text(text,
                tickOffset, this.tickLabelStartY + this.tickFontSize
            )
                .attr({
                    align: 'center'
                })
                .css({
                    color: this.tickFontColor,
                    fontSize: this.tickFontSize + 'px'
                })
                .add();
        },

        drawMinorTick: function(offset) {
            var tickOffset = this.horizontalPadding + this.bandOffsetBottom + offset;

            return this.renderer.path([
                'M', tickOffset, this.tickStartY,
                'L', tickOffset, this.tickStartY + this.minorTickLength
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.minorTickWidth
                })
                .add();
        },

        drawIndicator: function(val) {
            var markerOffset = this.normalizedTranslateValue(val),
                markerStartY = (!this.isShiny) ? (this.height - this.backgroundHeight) / 2 - 10 : (this.height - this.backgroundHeight) / 2,
                markerEndY = (!this.isShiny) ? markerStartY + this.bandHeight + 20 : markerStartY + this.backgroundHeight,
                markerStartX = this.horizontalPadding + this.bandOffsetBottom + markerOffset,
                markerLineWidth = 3, // set to 1 for shiny
                markerLineStroke = this.foregroundColor, // set to red for shiny
                markerLinePath = [
                    'M', markerStartX, markerStartY,
                    'L', markerStartX, markerEndY
                ];

            if(this.isShiny) {
                var markerLHSPath = [
                        'M', markerStartX - this.markerWindowHeight / 2,
                        markerStartY,
                        'L', markerStartX - this.markerWindowHeight / 2,
                        markerStartY  - (this.markerSideWidth - this.markerSideCornerRad),
                        'C', markerStartX - this.markerWindowHeight / 2,
                        markerStartY  - (this.markerSideWidth - this.markerSideCornerRad),
                        markerStartX - this.markerWindowHeight / 2,
                        markerStartY - this.markerSideWidth,
                        markerStartX - (this.markerWindowHeight / 2) + this.markerSideCornerRad,
                        markerStartY - this.markerSideWidth,
                        'L', markerStartX + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                        markerStartY - this.markerSideWidth,
                        'C', markerStartX + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                        markerStartY - this.markerSideWidth,
                        markerStartX + (this.markerWindowHeight / 2),
                        markerStartY - this.markerSideWidth,
                        markerStartX + (this.markerWindowHeight / 2),
                        markerStartY - (this.markerSideWidth - this.markerSideCornerRad),
                        'L', markerStartX + this.markerWindowHeight / 2,
                        markerStartY,
                        markerStartX - this.markerWindowHeight,
                        markerStartY
                    ],
                    markerRHSPath = [
                        'M', markerStartX - this.markerWindowHeight / 2,
                        markerEndY,
                        'L', markerStartX - this.markerWindowHeight / 2,
                        markerEndY + (this.markerSideWidth - this.markerSideCornerRad),
                        'C', markerStartX - this.markerWindowHeight / 2,
                        markerEndY + (this.markerSideWidth - this.markerSideCornerRad),
                        markerStartX - this.markerWindowHeight / 2,
                        markerEndY + this.markerSideWidth,
                        markerStartX - (this.markerWindowHeight / 2) + this.markerSideCornerRad,
                        markerEndY + this.markerSideWidth,
                        'L', markerStartX + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                        markerEndY + this.markerSideWidth,
                        'C', markerStartX + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                        markerEndY + this.markerSideWidth,
                        markerStartX + (this.markerWindowHeight / 2),
                        markerEndY + this.markerSideWidth,
                        markerStartX + (this.markerWindowHeight / 2),
                        markerEndY + (this.markerSideWidth - this.markerSideCornerRad),
                        'L', markerStartX + this.markerWindowHeight / 2,
                        markerEndY,
                        markerStartX - this.markerWindowHeight,
                        markerEndY
                    ],
                    markerBorderPath = [
                        'M', markerStartX - this.markerWindowHeight / 2,
                        markerStartY,
                        'L', markerStartX - this.markerWindowHeight / 2,
                        markerEndY,
                        markerStartX + this.markerWindowHeight / 2,
                        markerEndY,
                        markerStartX + this.markerWindowHeight / 2,
                        markerStartY,
                        markerStartX - this.markerWindowHeight / 2,
                        markerStartY
                    ],
                    markerUnderlinePath = [
                        'M', markerStartX - 1,
                        markerStartY,
                        'L', markerStartX - 1,
                        markerEndY
                    ];
                markerLineStroke = 'red';
                markerLineWidth = 1;

                if(this.elements.markerLHS) {
                    this.elements.markerLHS.destroy();
                }
                this.elements.markerLHS = this.renderer.path(markerLHSPath)
                    .attr({
                        fill: '#cccccc'
                    })
                    .add();
                if(this.elements.markerRHS) {
                    this.elements.markerRHS.destroy();
                }
                this.elements.markerRHS = this.renderer.path(markerRHSPath)
                    .attr({
                        fill: '#cccccc'
                    })
                    .add();
                if(this.elements.markerWindow) {
                    this.elements.markerWindow.destroy();
                }
                this.elements.markerWindow = this.renderer.rect(markerStartX - this.markerWindowHeight / 2,
                    markerStartY, this.markerWindowHeight, this.backgroundHeight, 0)
                    .attr({
                        fill: 'rgba(255, 255, 255, 0.3)'
                    })
                    .add();
                if(this.elements.markerBorder) {
                    this.elements.markerBorder.destroy();
                }
                this.elements.markerBorder = this.renderer.path(markerBorderPath)
                    .attr({
                        stroke: 'white',
                        'stroke-width': 2
                    })
                    .add();
                if(this.elements.markerUnderline) {
                    this.elements.markerUnderline.destroy();
                }
                this.elements.markerUnderline = this.renderer.path(markerUnderlinePath)
                    .attr({
                        stroke: 'white',
                        'stroke-width': 2
                    })
                    .add();
            }

            if(this.elements.markerLine) {
                this.elements.markerLine.destroy();
            }
            this.elements.markerLine = this.renderer.path(markerLinePath)
                .attr({
                    stroke: markerLineStroke,
                    'stroke-width': markerLineWidth
                })
                .add();
            if(this.showValue) {
                this.drawValueDisplay(val);
            }
        },

        drawValueDisplay: function(val) {
            var valueText = this.formatValue(val),
                markerOffset = this.normalizedTranslateValue(val),
                valueX = this.horizontalPadding + this.bandOffsetBottom + markerOffset;

            if(this.elements.valueDisplay) {
                this.elements.valueDisplay.attr({
                    text: valueText,
                    x: valueX
                });
            }
            else {
                this.elements.valueDisplay = this.renderer.text(
                    valueText, valueX, (this.height - this.backgroundHeight) / 2 - this.valueOffset
                )
                    .css({
                        color: 'black',
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    })
                    .attr({
                        align: 'center'
                    })
                    .add();
            }

        },

        normalizedTranslateValue: function(val) {
            if(val < this.ranges[0]) {
                return 0;
            }
            if(val > this.ranges[this.ranges.length - 1]) {
                return this.translateValue(this.ranges[this.ranges.length - 1]);
            }
            return this.translateValue(val);
        },

        translateValue: function(val) {
            var dataRange = this.ranges[this.ranges.length - 1] - this.ranges[0],
                normalizedValue = val - this.ranges[0];

            return Math.round((normalizedValue / dataRange) * this.bandWidth);
        }

    });

    return HorizontalMarkerGauge;
            
});
define('js_charting/visualizations/gauges/VerticalMarkerGauge',[
            'jquery',
            './MarkerGauge',
            '../../util/lang_utils',
            '../../util/math_utils'
        ],
        function(
            $,
            MarkerGauge,
            langUtils,
            mathUtils
        ) {

    var VerticalMarkerGauge = function(container, properties) {
        MarkerGauge.call(this, container, properties);
        this.verticalPadding = 10;
    };
    langUtils.inherit(VerticalMarkerGauge, MarkerGauge);

    $.extend(VerticalMarkerGauge.prototype, {

        renderGauge: function() {
            this.markerWindowHeight = mathUtils.roundWithMin(this.height / 7, 20);
            this.markerSideWidth = this.markerWindowHeight / 2;
            this.markerSideCornerRad = this.markerSideWidth / 3;
            this.bandOffsetBottom = 5 + this.markerWindowHeight / 2;
            this.bandOffsetTop = 5 + this.markerWindowHeight / 2;
            this.tickOffset = mathUtils.roundWithMin(this.height / 100, 3);
            this.tickLength = mathUtils.roundWithMin(this.height / 20, 4);
            this.tickLabelOffset = mathUtils.roundWithMin(this.height / 60, 3);
            this.tickFontSize = mathUtils.roundWithMin(this.height / 20, 10);  // in pixels
            this.minorTickLength = this.tickLength / 2;
            this.backgroundCornerRad = mathUtils.roundWithMin(this.height / 60, 3);
            this.valueFontSize = mathUtils.roundWithMin(this.height / 15, 15);  // in pixels

            this.bandOffsetX = (!this.isShiny) ? 0 : mathUtils.roundWithMin(this.height / 60, 3);
            MarkerGauge.prototype.renderGauge.call(this);
        },

        drawBackground: function() {
            this.backgroundWidth = mathUtils.roundWithMin(this.height / 4, 50);
            var tickValues = this.calculateTickValues(this.ranges[0], this.ranges[this.ranges.length - 1], this.MAX_TICKS_PER_RANGE);
            this.backgroundHeight = this.height - (2 * this.verticalPadding);
            this.bandHeight = this.backgroundHeight - (this.bandOffsetBottom + this.bandOffsetTop);
            this.bandWidth = (!this.isShiny) ? 30 : 10;

            var maxLabelWidth, totalWidthNeeded,
                maxTickValue = tickValues[tickValues.length - 1];

            maxLabelWidth = this.predictTextWidth(this.formatValue(maxTickValue), this.tickFontSize);
            totalWidthNeeded = this.bandOffsetX + this.bandWidth + this.tickOffset + this.tickLength + this.tickLabelOffset
                + maxLabelWidth + this.tickLabelPaddingRight;

            this.backgroundWidth = Math.max(this.backgroundWidth, totalWidthNeeded);

            if(this.isShiny) {
                this.elements.background = this.renderer.rect((this.width - this.backgroundWidth) / 2,
                    this.verticalPadding, this.backgroundWidth, this.backgroundHeight,
                    this.backgroundCornerRad)
                    .attr({
                        fill: '#edede7',
                        stroke: 'silver',
                        'stroke-width': 1
                    })
                    .add();
            }

            // these values depend on the adjusted background width
            this.tickStartX = (this.width - this.backgroundWidth) / 2 + (this.bandOffsetX + this.bandWidth)
                + this.tickOffset;
            this.tickEndX = this.tickStartX + this.tickLength;
            this.tickLabelStartX = this.tickEndX + this.tickLabelOffset;
        },

        drawBand: function() {
            var i, startHeight, endHeight,
                bandLeftX = ((this.width - this.backgroundWidth) / 2) + this.bandOffsetX,
                bandBottomY = this.height - this.verticalPadding - this.bandOffsetBottom;

            for(i = 0; i < this.ranges.length - 1; i++) {
                startHeight = this.translateValue(this.ranges[i]);
                endHeight = this.translateValue(this.ranges[i + 1]);
                this.elements['colorBand' + i] = this.renderer.rect(
                    bandLeftX, bandBottomY - endHeight,
                    this.bandWidth, endHeight - startHeight, this.bandCornerRad
                )
                    .attr({
                        fill: this.getColorByIndex(i)
                    })
                    .add();
            }
        },

        drawMajorTick: function(height) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - (this.bandOffsetBottom + height);

            return this.renderer.path([
                'M', this.tickStartX, tickHeight,
                'L', this.tickEndX, tickHeight
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.tickWidth
                })
                .add();
        },

        drawMajorTickLabel: function(height, text) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - (this.bandOffsetBottom + height);

            return this.renderer.text(text,
                this.tickLabelStartX, tickHeight + (this.tickFontSize / 4)
            )
                .attr({
                    align: 'left'
                })
                .css({
                    color: this.tickFontColor,
                    fontSize: this.tickFontSize + 'px'
                })
                .add();
        },

        drawMinorTick: function(height) {
            var tickHeight = this.verticalPadding + this.backgroundHeight - (this.bandOffsetBottom + height);

            return this.renderer.path([
                'M', this.tickStartX, tickHeight,
                'L', this.tickStartX + this.minorTickLength, tickHeight
            ])
                .attr({
                    stroke: this.tickColor,
                    'stroke-width': this.minorTickWidth
                })
                .add();
        },

        drawIndicator: function(val) {
            var markerLHSPath, markerRHSPath, markerBorderPath, markerUnderlinePath,
                markerHeight = this.normalizedTranslateValue(val),
                markerStartY = this.verticalPadding + this.backgroundHeight
                    - (this.bandOffsetBottom + markerHeight),
                markerStartX = (!this.isShiny) ? (this.width - this.backgroundWidth) / 2 - 10 : (this.width - this.backgroundWidth) / 2,
                markerEndX = (!this.isShiny) ? markerStartX + this.bandWidth + 20 : markerStartX + this.backgroundWidth,
                markerLineStroke = this.foregroundColor, // will be changed to red for shiny
                markerLineWidth = 3, // wil be changed to 1 for shiny
                markerLinePath = [
                    'M', markerStartX, markerStartY,
                    'L', markerEndX, markerStartY
                ];
            if(this.isShiny) {
                markerLHSPath = [
                    'M', markerStartX,
                    markerStartY - this.markerWindowHeight / 2,
                    'L', markerStartX - (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY - this.markerWindowHeight / 2,
                    'C', markerStartX - (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY - this.markerWindowHeight / 2,
                    markerStartX - this.markerSideWidth,
                    markerStartY - this.markerWindowHeight / 2,
                    markerStartX - this.markerSideWidth,
                    markerStartY - (this.markerWindowHeight / 2) + this.markerSideCornerRad,
                    'L', markerStartX - this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                    'C', markerStartX - this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                    markerStartX - this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2),
                    markerStartX - (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY + (this.markerWindowHeight / 2),
                    'L', markerStartX,
                    markerStartY + this.markerWindowHeight / 2,
                    markerStartX,
                    markerStartY - this.markerWindowHeight / 2
                ];
                markerRHSPath = [
                    'M', markerEndX,
                    markerStartY - this.markerWindowHeight / 2,
                    'L', markerEndX + (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY - this.markerWindowHeight / 2,
                    'C', markerEndX + (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY - this.markerWindowHeight / 2,
                    markerEndX + this.markerSideWidth,
                    markerStartY - this.markerWindowHeight / 2,
                    markerEndX + this.markerSideWidth,
                    markerStartY - (this.markerWindowHeight / 2) + this.markerSideCornerRad,
                    'L', markerEndX + this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                    'C', markerEndX + this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2) - this.markerSideCornerRad,
                    markerEndX + this.markerSideWidth,
                    markerStartY + (this.markerWindowHeight / 2),
                    markerEndX + (this.markerSideWidth - this.markerSideCornerRad),
                    markerStartY + (this.markerWindowHeight / 2),
                    'L', markerEndX,
                    markerStartY + this.markerWindowHeight / 2,
                    markerEndX,
                    markerStartY - this.markerWindowHeight / 2
                ];
                markerBorderPath = [
                    'M', markerStartX,
                    markerStartY - this.markerWindowHeight / 2,
                    'L', markerEndX,
                    markerStartY - this.markerWindowHeight / 2,
                    markerEndX,
                    markerStartY + this.markerWindowHeight / 2,
                    markerStartX,
                    markerStartY + this.markerWindowHeight / 2,
                    markerStartX,
                    markerStartY - this.markerWindowHeight / 2
                ];
                markerUnderlinePath = [
                    'M', markerStartX,
                    markerStartY + 1,
                    'L', markerEndX,
                    markerStartY + 1
                ];
                markerLineStroke = 'red';
                markerLineWidth = 1;
            }

            if(this.isShiny) {
                if(this.elements.markerLHS) {
                    this.elements.markerLHS.destroy();
                }
                this.elements.markerLHS = this.renderer.path(markerLHSPath)
                    .attr({
                        fill: '#cccccc'
                    })
                    .add();
                if(this.elements.markerRHS) {
                    this.elements.markerRHS.destroy();
                }
                this.elements.markerRHS = this.renderer.path(markerRHSPath)
                    .attr({
                        fill: '#cccccc'
                    })
                    .add();
                if(this.elements.markerWindow) {
                    this.elements.markerWindow.destroy();
                }
                this.elements.markerWindow = this.renderer.rect(markerStartX,
                    markerStartY - this.markerWindowHeight / 2, this.backgroundWidth,
                    this.markerWindowHeight, 0)
                    .attr({
                        fill: 'rgba(255, 255, 255, 0.3)'
                    })
                    .add();
                if(this.elements.markerBorder) {
                    this.elements.markerBorder.destroy();
                }
                this.elements.markerBorder = this.renderer.path(markerBorderPath)
                    .attr({
                        stroke: 'white',
                        'stroke-width': 2
                    })
                    .add();
                if(this.elements.markerUnderline) {
                    this.elements.markerUnderline.destroy();
                }
                this.elements.markerUnderline = this.renderer.path(markerUnderlinePath)
                    .attr({
                        stroke: 'white',
                        'stroke-width': 2
                    })
                    .add();
            }
            if(this.elements.markerLine) {
                this.elements.markerLine.destroy();
            }
            this.elements.markerLine = this.renderer.path(markerLinePath)
                .attr({
                    stroke: markerLineStroke,
                    'stroke-width': markerLineWidth
                })
                .add();
            if(this.showValue) {
                this.drawValueDisplay(val);
            }

        },

        drawValueDisplay: function(val) {
            var valueText = this.formatValue(val),
                markerHeight = this.normalizedTranslateValue(val),
                valueY = this.verticalPadding + this.backgroundHeight - this.bandOffsetBottom - markerHeight;

            if(this.elements.valueDisplay) {
                this.elements.valueDisplay.attr({
                    text: valueText,
                    y: valueY + this.valueFontSize / 4
                });
            }
            else {
                this.elements.valueDisplay = this.renderer.text(
                    valueText, (this.width - this.backgroundWidth) / 2 - this.valueOffset, valueY + this.valueFontSize / 4
                )
                    .css({
                        color: 'black',
                        fontSize: this.valueFontSize + 'px',
                        fontWeight: 'bold'
                    })
                    .attr({
                        align: 'right'
                    })
                    .add();
            }

        },

        normalizedTranslateValue: function(val) {
            if(val < this.ranges[0]) {
                return 0;
            }
            if(val > this.ranges[this.ranges.length - 1]) {
                return this.translateValue(this.ranges[this.ranges.length - 1]);
            }
            return this.translateValue(val);
        },

        translateValue: function(val) {
            var dataRange = this.ranges[this.ranges.length - 1] - this.ranges[0],
                normalizedValue = val - this.ranges[0];

            return Math.round((normalizedValue / dataRange) * this.bandHeight);
        }

    });

    return VerticalMarkerGauge;
            
});
define('js_charting/js_charting',[
            'jquery', 
            'underscore',
            'highcharts',
            'helpers/user_agent',
            './helpers/DataSet',
            './visualizations/charts/Chart',
            './visualizations/charts/SplitSeriesChart',
            './visualizations/charts/PieChart',
            './visualizations/charts/ScatterChart',
            './visualizations/gauges/RadialGauge',
            './visualizations/gauges/HorizontalFillerGauge',
            './visualizations/gauges/VerticalFillerGauge',
            './visualizations/gauges/HorizontalMarkerGauge',
            './visualizations/gauges/VerticalMarkerGauge',
            './util/parsing_utils'
        ], 
        function(
            $,
            _,
            Highcharts,
            userAgent,
            DataSet,
            Chart,
            SplitSeriesChart,
            PieChart,
            ScatterChart,
            RadialGauge,
            HorizontalFillerGauge,
            VerticalFillerGauge,
            HorizontalMarkerGauge,
            VerticalMarkerGauge,
            parsingUtils
        ) {

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // support for push-state (SPL-64487)
    //
    // In Firefox, a local reference to another node (e.g. <g clip-path="url(#clipPathId)">) will break whenever a push-state
    // or replace-state action is taken (https://bugzilla.mozilla.org/show_bug.cgi?id=652991).
    //
    // We will hook in to the 'pushState' and 'replaceState' methods on the window.history object and fire an event to
    // notify any listeners that they need to update all local references in their SVG.

    if(userAgent.isFirefox()) {
        // this local reference to the window.history is vital, otherwise it can potentially be garbage collected
        // and our changes lost (https://bugzilla.mozilla.org/show_bug.cgi?id=593910)
        var history = window.history;
        _(['pushState', 'replaceState']).each(function(fnName) {
            var original = history[fnName];
            history[fnName] = function() {
                original.apply(history, arguments);
                // kind of hacky to use Highcharts as an event bus, but not sure what else to do
                $(Highcharts).trigger('baseUriChange');
            };
        });
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // namespace-level methods

    // TODO [sff] does this really need to be a public method, or could it be called under the hood from prepare()?
    var extractChartReadyData = function(rawData) {
        if(!rawData || !rawData.fields || !rawData.columns) {
            throw new Error('The data object passed to extractChartReadyData did not contain fields and columns');
        }
        if(rawData.fields.length !== rawData.columns.length) {
            throw new Error('The data object passed to extractChartReadyData must have the same number of fields and columns');
        }
        return new DataSet(rawData);
    };

    var createChart = function(container, properties) {
        if(container instanceof $) {
            container = container[0];
        }
        if(!_(container).isElement()) {
            throw new Error("Invalid first argument to createChart, container must be a valid DOM element or a jQuery object");
        }
        properties = properties || {};
        var chartType = properties['chart'];
        if(chartType === 'pie') {
            return new PieChart(container, properties);
        }
        if(chartType === 'scatter') {
            return new ScatterChart(container, properties);
        }
        if(chartType === 'radialGauge') {
            return new RadialGauge(container, properties);
        }
        if(chartType === 'fillerGauge') {
            return (properties['chart.orientation'] === 'x') ?
                (new HorizontalFillerGauge(container, properties)) :
                (new VerticalFillerGauge(container, properties));
        }
        if(chartType === 'markerGauge') {
            return (properties['chart.orientation'] === 'x') ?
                (new HorizontalMarkerGauge(container, properties)) :
                (new VerticalMarkerGauge(container, properties));
        }
        // only the basic cartesian chart types (bar/column/line/area) support split-series mode
        return (parsingUtils.normalizeBoolean(properties['layout.splitSeries'])) ?
            (new SplitSeriesChart(container, properties)) :
            (new Chart(container, properties));
    };

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // public interface

    return ({
        extractChartReadyData: extractChartReadyData,
        createChart: createChart
    });

});