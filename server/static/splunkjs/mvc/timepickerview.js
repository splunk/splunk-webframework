
define('views/shared/timerangepicker/dialog/Presets',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base',
    'util/time_utils'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    time_utils
){
    return BaseView.extend({
        moduleId: module.id,
        className: 'accordion-inner',
        /**
         * @param {Object} options {
         *     model: <models.TimeRange>,
         *     collection (Optional): <collections.services.data.ui.TimesV2>
         *     showRealTime (Optional): hide or show RealTime in the Presets panel.
         *     showRealTimeOnly (Optional): Only show RealTime in the Presets panel.
         *     showRelative (Optional): hide or show the Relative in the Presets panel.
         *     showAllTime (Optional): hide or show All Time in the Presets panel.
         * }
         */
        initialize: function() {
            this.label = _('Presets').t();

            var defaults = {
                showRealTime:true,
                showRealTimeOnly:false,
                showRelative:true, //currently partially supported. Some may slip through.
                showAllTime:true
            };


            _.defaults(this.options, defaults);

            BaseView.prototype.initialize.call(this, arguments);
            if (this.collection) {
                this.collection.on('reset', this.render, this);
            }
        },
        supportsRange: function() {
            var earliest = this.model.get('earliest'),
                latest = this.model.get('latest');

            return time_utils.generateAllTimeLabel(earliest, latest) || time_utils.findPresetLabel(this.collection, earliest, latest);
        },
        events: {
            'click a' : function(e) {
                e.preventDefault();
                var $target = $(e.currentTarget);
                this.model.save({
                    'earliest': $target.data('earliest'),
                    'latest': $target.data('latest')
                });
                this.model.trigger('applied');
            }
        },
        render: function() {
            var periodPresets = this.options.showRelative && !this.options.showRealTimeOnly ? this.collection.filterToPeriod() : false,
                hasPeriodPresets = periodPresets && periodPresets.length,
                lastPresets = this.options.showRelative && !this.options.showRealTimeOnly ? this.collection.filterToLast() : false,
                hasLastPresets = lastPresets && lastPresets.length;

            var template = _.template(this.template, {
                    _: _,
                    realTimePresets: this.options.showRealTime ? this.collection.filterToRealTime() : false,
                    periodPresets: periodPresets,
                    hasPeriodPresets: hasPeriodPresets,
                    lastPresets: lastPresets,
                    hasLastPresets: hasLastPresets,
                    otherPresets: !this.options.showRealTimeOnly ? this.collection.filterToOther() : false,
                    options: this.options,
                    isAllTime: this.isAllTime,
                    listElementPartial: this.listElementPartial
                });
            this.$el.html(template);
            return this;
        },
        isAllTime: function(model) {
            var noEarliest = !model.entry.content.get("earliest_time") || model.entry.content.get("earliest_time") == "0",
                noLatest =  !model.entry.content.get("latest_time") || model.entry.content.get("latest_time") == "now";

            return noEarliest && noLatest;
        },
        listElementPartial: _.template('\
            <li><a href="#" data-earliest="<%- model.entry.content.get("earliest_time") || "" %>" data-latest="<%- model.entry.content.get("latest_time") || "" %>"><%- model.entry.content.get("label") %></a></li>\
        '),
        template: '\
            <% if (realTimePresets && realTimePresets.length) { %>\
                <ul class="unstyled presets-group">\
                    <li><%- _("Real-time").t() %></li>\
                    <% _.each(realTimePresets, function(model) { %>\
                        <%= listElementPartial({model: model}) %>\
                    <% }); %>\
                </ul>\
                <div class="presets-divider-wrap"><div class="presets-divider"></div></div>\
            <% } %>\
            <% if (hasPeriodPresets && hasLastPresets) { %>\
                    <ul class="unstyled presets-group">\
                        <li><%- _("Relative").t() %></li>\
                        <% _.each(periodPresets, function(model) { %>\
                            <%= listElementPartial({model: model}) %>\
                        <% }); %>\
                    </ul>\
                    <ul class="unstyled presets-group">\
                        <li>&nbsp;</li>\
                        <% _.each(lastPresets, function(model) { %>\
                             <%= listElementPartial({model: model}) %>\
                        <% }); %>\
                    </ul>\
                    <div class="presets-divider-wrap"><div class="presets-divider"></div></div>\
            <% } else if (hasPeriodPresets) { %>\
                <ul class="unstyled presets-group">\
                    <li><%- _("Relative").t() %></li>\
                    <% _.each(periodPresets, function(model) { %>\
                        <%= listElementPartial({model: model}) %>\
                    <% }); %>\
                </ul>\
                <div class="presets-divider-wrap"><div class="presets-divider"></div></div>\
            <% } else if (hasLastPresets) { %>\
                <ul class="unstyled presets-group">\
                    <li><%- _("Relative").t() %></li>\
                    <% _.each(lastPresets, function(model) { %>\
                        <%= listElementPartial({model: model}) %>\
                   <% }); %>\
                </ul>\
                <div class="presets-divider-wrap"><div class="presets-divider"></div></div>\
            <% } %>\
            <% if (otherPresets && otherPresets.length) { %>\
                <ul class="unstyled presets-group">\
                    <li><%- _("Other").t() %></li>\
                    <% _.each(otherPresets, function(model) { %>\
                        <% if (!(isAllTime(model) && !options.showAllTime)) { %>\
                            <%= listElementPartial({model: model}) %>\
                        <% } %>\
                    <% }); %>\
                </ul>\
            <% } %>\
        '
    });
});

define('views/shared/timerangepicker/dialog/Relative',
    [
        "jquery",
        "underscore",
        "backbone",
        "module",
        "models/services/search/TimeParser",
        "models/TimeRange",
        "views/Base",
        "views/shared/controls/SyntheticSelectControl",
        "views/shared/FlashMessages",
        "util/time_utils",
        "util/splunkd_utils",
        "splunk.i18n"
    ],
    function($, _, Backbone, module, TimeParserModel, TimeRangeModel, BaseView, SyntheticSelectControl, FlashMessages, time_utils, splunkd_utils, i18n) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'accordion-inner',
            initialize: function(options) {
                BaseView.prototype.initialize.call(this, arguments);
                this.label = _('Relative').t();

                this.model = {
                    range: this.model,
                    workingRange: new TimeRangeModel($.extend(true, {}, this.model.toJSON())),
                    earliestTimeParser: new TimeParserModel({
                        key: time_utils.stripRTSafe(this.model.get("earliest"), false),
                        value: this.model.get("earliest_iso")
                    }),
                    latestTimeParser: new TimeParserModel({
                        key: time_utils.stripRTSafe(this.model.get("latest"), true),
                        value: this.model.get("latest_iso")
                    })
                };

                this.rangeMap = {
                        's': {
                            earliest: _('Beginning of second').t(),
                            latest: _('Beginning of current second').t()
                        },
                        'm': {
                            earliest: _('Beginning of minute').t(),
                            latest: _('Beginning of current minute').t()
                        },
                        'h': {
                            earliest: _('Beginning of hour').t(),
                            latest: _('Beginning of current hour').t()
                        },
                        'd': {
                            earliest: _('Beginning of day').t(),
                            latest: _('Beginning of today').t()
                        },
                        'w': {
                            earliest: _('First day of week').t(),
                            latest: _('First day of this week').t()
                        },
                        'mon': {
                            earliest: _('First day of month').t(),
                            latest: _('First day of this month').t()
                        },
                        'q': {
                            earliest: _('First day of quarter').t(),
                            latest: _('First day of this quarter').t()
                        },
                        'y': {
                            earliest: _('First day of year').t(),
                            latest: _('First day of this year').t()
                        }
                };

                this.model.workingRange.set('relative_range_unit', 's');

                this.children.rangeTypeSelect = new SyntheticSelectControl({
                    model: this.model.workingRange,
                    items: [
                        {value: 's', label: _('Seconds Ago').t()},
                        {value: 'm', label: _('Minutes Ago').t()},
                        {value: 'h', label: _('Hours Ago').t()},
                        {value: 'd', label: _('Days Ago').t()},
                        {value: 'w', label: _('Weeks Ago').t()},
                        {value: 'mon', label: _('Months Ago').t()},
                        {value: 'q', label: _('Quarters Ago').t()},
                        {value: 'y', label: _('Years Ago').t()}
                    ],
                    modelAttribute: 'relative_range_unit',
                    className: 'btn-group timerangepicker-relative_range_unit',
                    toggleClassName: 'btn',
                    menuWidth: 'narrow',
                    popdownOptions: {attachDialogTo:'body'},
                    save: false
                });

                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        earliestTimeParser: this.model.earliestTimeParser,
                        latestTimeParser: this.model.latestTimeParser
                    }
                });

                this.model.workingRange.on("change:relative_range_unit", function() {
                    var range = this.model.workingRange.get("relative_range_unit");
                    this.$(".earliest_snap_label .text").html(this.rangeMap[range].earliest);
                    this.$(".latest_snap_label .text").html(this.rangeMap[range].latest);
                    this.fetchEarliestTime();
                    this.fetchLatestTime();
                }, this);

                this.model.workingRange.on("change:relative_earliest_snap_to change:relative_earliest_value", _.debounce(this.fetchEarliestTime, 0), this);
                this.model.workingRange.on("change:relative_latest_snap_to", _.debounce(this.fetchLatestTime, 0), this);

                this.model.earliestTimeParser.on("change", this.updateEarliestHint, this);

                this.model.earliestTimeParser.on("error", function() {
                    this.$("#earliest_hint_" + this.cid).html(this.model.earliestTimeParser.error.get("messages")[0].message);
                    this.disableApply();
                }, this);

                this.model.latestTimeParser.on("change", this.updateLatestHint, this);

                this.model.latestTimeParser.on("error", function() {
                    this.$("#latest_hint_" + this.cid).html(this.model.latestTimeParser.error.get("messages")[0].message);
                    this.disableApply();
                }, this);

                this.model.range.on('change:earliest change:latest prepopulate', _.debounce(this.prepopulate, 0), this);

            },
            updateEarliestHint: function() {
                var date = time_utils.isoToDateObject(this.model.earliestTimeParser.get("value"));
                this.$("#earliest_hint_" + this.cid).html(i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(date), "short", "full"));
                this.enableApply();                
            },
            updateLatestHint: function() {
                var date = time_utils.isoToDateObject(this.model.latestTimeParser.get("value"));
                this.$("#latest_hint_" + this.cid).html(i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(date), "short", "full"));
                this.enableApply();                
            },
            prepopulate: function() {
                var earliestParse = this.model.range.getTimeParse('earliest'),
                    latestParse = this.model.range.getTimeParse('latest'),
                    attrValues = {};

                if (!earliestParse) return;

                attrValues.relative_earliest_value = earliestParse.amount;
                attrValues.relative_earliest_snap_to = (earliestParse.hasSnap ? 1 : 0);
                attrValues.relative_latest_snap_to = ((latestParse && latestParse.hasSnap) ? 1 : 0);
                if (this.rangeMap.hasOwnProperty(earliestParse.unit)) {
                    attrValues.relative_range_unit = earliestParse.unit;
                }

                this.model.workingRange.set(attrValues);

                this.$('.earliest_input').val(earliestParse.amount);
                this.$('[name=earliest_snap][value=' + this.model.workingRange.get('relative_earliest_snap_to') + ']').prop('checked', true);
                this.$('[name=latest_snap][value=' + this.model.workingRange.get('relative_latest_snap_to') + ']').prop('checked', true);
            },
            supportsRange: function() {
                return time_utils.generateRelativeTimeLabel(this.model.range.get('earliest'), this.model.range.get('latest'));
            },
            getEarliestTime: function() {
                var amount = this.model.workingRange.get('relative_earliest_value'),
                    unit = this.model.workingRange.get('relative_range_unit') || "s",
                    snap = this.model.workingRange.get('relative_earliest_snap_to');
                if (!amount){
                    return null;
                }
                return "-" + amount + unit + (snap ? ("@" + unit) : "");
            },
            fetchEarliestTime: function() {
                var time = this.getEarliestTime(),
                    id = time_utils.stripRTSafe(this.model.earliestTimeParser.id, false);
                
                if (time && (time !== id)) {
                    this.model.earliestTimeParser.fetch({
                        data : {
                            time: time
                        }
                    });
                } else if (this.model.earliestTimeParser.get("value")) {
                    this.updateEarliestHint();
                } else {
                    this.$("#earliest_hint_" + this.cid).html("");
                    this.enableApply();
                }
            },
            getLatestTime: function() {
                var type = this.model.workingRange.get('relative_range_unit') || "mon",
                    snap = this.model.workingRange.get('relative_latest_snap_to'),
                    time = "now";
                if (snap){
                    time = "@" + type;
                }
                return time;
            },
            fetchLatestTime: function() {
                var time = this.getLatestTime(),
                    id = this.model.latestTimeParser.id;
                
                if (time && (time !== id)) {
                    this.model.latestTimeParser.fetch({
                        data : {
                            time: time
                        }
                    });
                } else if (this.model.latestTimeParser.get("value")) {
                    this.updateLatestHint();
                } else {
                    this.$("#latest_hint_" + this.cid).html("");
                }
            },
            events: {
                "keyup .earliest_input": function(event) {
                    this.model.workingRange.set('relative_earliest_value', this.$("#earliest_" + this.cid).val());
                },
                "change .earliest_snap": function(event) {
                    var value = parseInt(this.$("input:radio[name=earliest_snap]:checked").val(), 10);
                    this.model.workingRange.set("relative_earliest_snap_to", value);
                },
                "change .latest_snap": function(event) {
                    var value = parseInt(this.$("input:radio[name=latest_snap]:checked").val(), 10);
                    this.model.workingRange.set("relative_latest_snap_to", value);
                },
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }

                    var that = this,
                        earliest = this.getEarliestTime(),
                        latest = this.getLatestTime();

                    if (!earliest){
                        var error = splunkd_utils.createSplunkDMessage(splunkd_utils.ERROR, "Earliest cannot be blank.");
                        this.model.earliestTimeParser.trigger("error", this.model.earliestTimeParser, error);
                        return false;
                    }

                    this.disableApply();

                    this.model.workingRange.save(
                        {
                            earliest: earliest,
                            latest: latest
                        },
                        {
                            success: function(model) {
                                that.enableApply();
                                that.model.range.set({
                                    'earliest': earliest,
                                    'latest': latest,
                                    'earliest_epoch': model.get('earliest_epoch'),
                                    'latest_epoch': model.get('latest_epoch'),
                                    'earliest_iso': model.get('earliest_iso'),
                                    'latest_iso': model.get('latest_iso'),
                                    'earliest_date': new Date(model.get('earliest_date').getTime()),
                                    'latest_date': new Date(model.get('latest_date').getTime())
                                });
                                that.model.range.trigger("applied");
                            },
                            error: function(model, error) {
                                that.disableApply();
                            }
                        }
                    );
                    event.preventDefault();
                }
            },
            generateLabel: function() {
                return "Custom Time";
            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                var template = _.template(this.template, {
                    cid: this.cid,
                    time: this.model.workingRange.get('relative_earliest_value') || "",
                    rangeMap: this.rangeMap,
                    selectedRange: this.model.workingRange.get('relative_range_unit') || _("mon").t(),
                    _: _
                });
                this.$el.html(template);

                this.$el.prepend(this.children.flashMessages.render().el);
                this.children.rangeTypeSelect.render().$el.insertAfter(this.$(".earliest_input"));
                if (this.model.latestTimeParser.isNew()) {
                    this.fetchLatestTime(); 
                }

                return this;
            },
            template:  '\
                <table class="form form-inline">\
                    <tbody class="relative-time-container" style="white-space:nowrap;">\
                        <tr>\
                            <td class="earliest_time">\
                                <table>\
                                    <tbody>\
                                        <tr>\
                                            <td>\
                                                <label class="control-label" for="earliest_<%- cid %>">\
                                                    <%- _("Earliest:").t() %>\
                                                </label>\
                                            </td>\
                                            <td>\
                                                <div class="input-append">\
                                                <input type="text" size="5" value="<%- time %>" class="earliest_input timerangepicker-relative-earliest-time" id="earliest_<%- cid %>"/>\
                                                </div>\
                                                <label for="earliest_no_snap_to_<%- cid %>" class="radio"><input type="radio" name="earliest_snap" class="earliest_snap" id="earliest_no_snap_to_<%- cid %>" value="0" checked="checked"/>\
                                                     <%- _("No Snap-to").t() %>\
                                                </label>\
                                                <label class="earliest_snap_label radio" for="earliest_snap_to_<%- cid %>"><input type="radio" name="earliest_snap" class="earliest_snap" id="earliest_snap_to_<%- cid %>" value="1"/>\
                                                <span class="text"><%= rangeMap[selectedRange].earliest %></span></label>\
                                            </td>\
                                        </tr>\
                                        <tr>\
                                            <td></td>\
                                            <td>\
                                                <span id="earliest_hint_<%- cid %>" class="help-block help-block-timestamp"></span>\
                                            </td>\
                                        </tr>\
                                    </tbody>\
                                </table>\
                            </td>\
                            <td class="latest_time">\
                                <table>\
                                    <tbody>\
                                        <tr>\
                                            <td>\
                                                <label class="control-label" for="<%- cid %>">\
                                                    <%- _("Latest:").t() %>\
                                                </label>\
                                            </td>\
                                            <td>\
                                                <label for="latest_no_snap_to_<%- cid %>" class="radio"><input type="radio" name="latest_snap" class="latest_snap" id="latest_no_snap_to_<%- cid %>" value="0" checked="checked"/>\
                                                   <%- _("now").t() %>\
                                                </label>\
                                                <label class="latest_snap_label radio" for="latest_snap_to_<%- cid %>"><input type="radio" name="latest_snap" class="latest_snap" id="latest_snap_to_<%- cid %>" value="1"/>\
                                                <span class="text"><%= rangeMap[selectedRange].latest %></span></label>\
                                            </td>\
                                        </tr>\
                                        <tr>\
                                            <td></td>\
                                            <td>\
                                                <span id="latest_hint_<%- cid %>" class="help-block help-block-timestamp"></span>\
                                            </td>\
                                        </tr>\
                                    </tbody>\
                                </table>\
                            </td>\
                            <td><button class="apply btn" id="apply_<%- cid %>">\
                                <%- _("Apply").t() %>\
                            </button></td>\
                        </tr>\
                    </tbody>\
                </table>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/RealTime',
	[
        "jquery",
        "underscore",
        "backbone",
        "module",
        "models/services/search/TimeParser",
        "models/TimeRange",
        "views/Base",
        "views/shared/controls/SyntheticSelectControl",
        "views/shared/FlashMessages",
        "util/time_utils",
        "splunk.i18n"
    ],
    function($, _, Backbone, module, TimeParserModel, TimeRangeModel, BaseView, SyntheticSelectControl, FlashMessages, time_utils, i18n) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'accordion-inner',
            initialize: function(options) {
                BaseView.prototype.initialize.call(this, arguments);
                this.label = _('Real-time').t();

                this.model = {
                    range: this.model,
                    workingRange: new TimeRangeModel($.extend(true, {}, this.model.toJSON())),
                    earliestTimeParser: new TimeParserModel({
                        key: time_utils.stripRTSafe(this.model.get("earliest"), false),
                        value: this.model.get("earliest_iso")
                    })
                };

                this.model.workingRange.set('realtime_range_type', 's');

                this.children.rangeTypeSelect = new SyntheticSelectControl({
                    model: this.model.workingRange,
                    items: [
                        {value: 's', label: _('Seconds Ago').t()},
                        {value: 'm', label: _('Minutes Ago').t()},
                        {value: 'h', label: _('Hours Ago').t()},
                        {value: 'd', label: _('Days Ago').t()},
                        {value: 'w', label: _('Weeks Ago').t()},
                        {value: 'mon', label: _('Months Ago').t()},
                        {value: 'q', label: _('Quarters Ago').t()},
                        {value: 'y', label: _('Years Ago').t()}
                    ],
                    modelAttribute: 'realtime_range_type',
                    className: 'btn-group timerangepicker-realtime_range_type',
                    toggleClassName: 'btn',
                    menuWidth: 'narrow',
                    popdownOptions: {attachDialogTo:'body'},
                    save: false
                });

                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        earliestTimeParser: this.model.earliestTimeParser
                    }
                });

                this.model.workingRange.on("change:realtime_range_type change:realtime_earliest_value", _.debounce(function() {
                    this.fetchEarliestTime();
                }.bind(this), 0), this);

                this.model.earliestTimeParser.on("change", this.updateEarliestHint, this);

                this.model.earliestTimeParser.on("error", function() {
                    this.$("#hint_" + this.cid).html(this.model.earliestTimeParser.error.get("messages")[0].message);
                    this.disableApply();
                }, this);

                this.model.range.on('change:earliest change:latest prepopulate', _.debounce(this.prepopulate, 0), this);

            },
            updateEarliestHint: function() {
                var date = time_utils.isoToDateObject(this.model.earliestTimeParser.get("value"));
                this.$("#hint_" + this.cid).html(i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(date), "short", "full"));
                this.enableApply();                  
            },
            prepopulate: function() {
               var earliestParse = this.model.range.getTimeParse('earliest'),
                   attrValues = {};

               if (!earliestParse) { return;}

               this.$('.earliest_input').val(earliestParse.amount);

               attrValues.realtime_earliest_value = earliestParse.amount;
               attrValues.realtime_range_type = earliestParse.unit;

               this.model.workingRange.set(attrValues);
            },
            supportsRange: function() {
                var earliestParse = this.model.range.getTimeParse('earliest'),
                    latestParse = this.model.range.getTimeParse('latest');

                if (!earliestParse) { return false; }

                return earliestParse.isRealTime && earliestParse.amount && !earliestParse.snapUnit
                        && latestParse.isRealTime && latestParse.isNow && !latestParse.snapUnit ;
            },
            getEarliestTime: function(withoutRT) {
                var amount = this.model.workingRange.get('realtime_earliest_value'),
                    type = this.model.workingRange.get('realtime_range_type') || "mon";

                if (!amount){
                    return null;
                }
                return (withoutRT ? "" : "rt") + "-" + amount + type;
            },
            fetchEarliestTime: function() {
                var time = this.getEarliestTime(true),
                    id = time_utils.stripRTSafe(this.model.earliestTimeParser.id, false);
                
                if (time && (time !== id)) {
                    this.model.earliestTimeParser.fetch({
                        data : {
                            time: time
                        }
                    });
                } else if (this.model.earliestTimeParser.get("value")) {
                    this.updateEarliestHint();
                } else {
                    this.$("#hint_" + this.cid).html("");
                    this.enableApply();
                }
            },
            events: {
                "keyup .earliest_input": function(event) {
                    this.model.workingRange.set('realtime_earliest_value', this.$("#earliest_" + this.cid).val());
                },
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }

                    var that = this,
                        earliest = this.getEarliestTime();
                    this.disableApply();

                    this.model.workingRange.save(
                            {
                                earliest: earliest,
                                latest: "rtnow"
                            },
                            {
                                success: function(model) {
                                    that.enableApply();
                                    that.model.range.set({
                                        'earliest': earliest,
                                        'latest': "rtnow",
                                        'earliest_epoch': model.get('earliest_epoch'),
                                        'latest_epoch': model.get('latest_epoch'),
                                        'earliest_iso': model.get('earliest_iso'),
                                        'latest_iso': model.get('latest_iso'),
                                        'earliest_date': new Date(model.get('earliest_date').getTime()),
                                        'latest_date': new Date(model.get('latest_date').getTime())
                                    });
                                    that.model.range.trigger("applied");
                                },
                                error: function(model, error) {
                                    that.enableApply();
                                }
                            }
                    );
                    event.preventDefault();
                }
            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid,
                    time: ""
                });
                this.$el.html(template);

                this.$el.prepend(this.children.flashMessages.render().el);
                this.children.rangeTypeSelect.render().$el.insertAfter(this.$(".earliest_input"));

                return this;
            },
            template:  '\
                <table class="form form-inline">\
                    <tbody>\
                        <tr>\
                            <td>\
                                <label class="control-label" for="earliest_<%- cid %>"><%- _("Earliest:").t() %></label>\
                            </td>\
                            <td>\
                                <div class="input-append"><input type="text" size="5" value="<%- time %>" class="earliest_input timerangepicker-real-time-earliest-time" id="earliest_<%- cid %>"/></div>\
                            </td>\
                            <td>\
                                <label class="control-label"><%- _("Latest:").t() %></label>\
                            </td>\
                            <td>\
                                <span class="form-value">now</span>\
                            </td>\
                            <td><button class="apply btn" id="apply_<%- cid %>"><%- _("Apply").t() %></button></td>\
                        </tr>\
                        <tr>\
                            <td></td>\
                            <td>\
                                <span id="hint_<%- cid %>" class="help-block help-block-timestamp"></span>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/daterange/BetweenDates',[
        "jquery",
        "underscore",
        "backbone",
        "module",
        "models/DateInput",
        "models/TimeRange",
        'views/Base',
        "views/shared/controls/DateControl",
        "views/shared/FlashMessages"
      ],
     function($, _, Backbone, module, DateInputModel, TimeRangeModel, Base, DateControl, FlashMessages) {
        return Base.extend({
            tagName: 'tbody',
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.call(this, arguments);
            
                this.model = {range: this.model, workingRange: new TimeRangeModel()};
                    
                this.today = new Date();
                this.today.setHours(0, 0, 0, 0);
            
                this.model.latestDateInput = new DateInputModel();
                this.model.latestDateInput.setFromJSDate(this.today, {silent:true});
            
                this.yesterday = new Date();
                this.yesterday.setDate(this.yesterday.getDate() - 1);
                this.yesterday.setHours(0, 0, 0, 0);
            
                this.model.earliestDateInput = new DateInputModel();
                this.model.earliestDateInput.setFromJSDate(this.yesterday, {silent:true});
            
                this.children.earliestTimeInput = new DateControl({
                    model: this.model.earliestDateInput,
                    inputClassName: "timerangepicker-earliest-date",
                    validate: true
                });
            
                this.children.latestTimeInput = new DateControl({
                    model: this.model.latestDateInput,
                    inputClassName: "timerangepicker-latest-date",
                    validate: true
                });
            
                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        earliestDateInput: this.model.earliestDateInput,
                        latestDateInput: this.model.latestDateInput
                    }
                });
                
                this.model.range.on('change:earliest_date change:latest_date prepopulate', _.debounce(this.prepopulate, 0), this);
                
                this.model.earliestDateInput.on("validated:invalid", this.disableApply, this);
                this.model.earliestDateInput.on("validated:valid", this.enableApply, this);
                
                this.model.earliestDateInput.on("change", function(){
                    this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    this.model.workingRange.trigger("serverValidated", true, this.model.workingRange, []);
                }, this);
                
                this.model.latestDateInput.on("validated:invalid", this.disableApply, this);
                this.model.latestDateInput.on("validated:valid", this.enableApply, this);
                
                this.model.latestDateInput.on("change", function(){
                    this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    this.model.workingRange.trigger("serverValidated", true, this.model.workingRange, []);
                }, this);
            },
            prepopulate: function() {
                var earliest = this.model.range.get('earliest_date'),
                    latest =  this.model.range.get('latest_date');
                
                if (!this.model.range.hasNoEarliest() && earliest) {
                    this.model.earliestDateInput.setFromJSDate(earliest, {validate: true});
                }
                if (latest) {
                    var latestDate= new Date(latest.getTime());
                    
                    if (latestDate.getHours() == 0) {
                        latestDate.setDate((latestDate.getDate() - 1), {validate: true});
                    }
                    this.model.latestDateInput.setFromJSDate(latestDate, {validate: true});
                }
            },
            events: {
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }
                    
                    this.model.earliestDateInput.setHoursMinSecFromStr("00:00:00.000", {silent:true, validate: true});
                    this.model.latestDateInput.setHoursMinSecFromStr("24:00:00.000", {silent:true, validate: true});

                    var that = this,
                    earliestIsoWithoutTZ = this.model.earliestDateInput.isoWithoutTZ(),
                    latestIsoWithoutTZ = this.model.latestDateInput.isoWithoutTZ();

                    this.disableApply();
                    
                    this.model.workingRange.save(
                            {
                                earliest: earliestIsoWithoutTZ,
                                latest: latestIsoWithoutTZ
                                
                            }, 
                            {
                                success: function(model) {
                                    that.enableApply();
                                    that.model.range.set({
                                        'earliest': model.get('earliest_epoch'),
                                        'latest': model.get('latest_epoch'),
                                        'earliest_epoch': model.get('earliest_epoch'),
                                        'latest_epoch': model.get('latest_epoch'),
                                        'earliest_iso': model.get('earliest_iso'),
                                        'latest_iso': model.get('latest_iso'),
                                        'earliest_date': new Date(model.get('earliest_date').getTime()),
                                        'latest_date': new Date(model.get('latest_date').getTime())
                                    });
                                    that.model.range.trigger("applied");
                                },
                                error: function(model, error) {
                                    that.enableApply();
                                }
                            }
                    );
                    event.preventDefault();
                }
            },
            generateLabel: function() {
                //This is a temporary generator. Should move this into the model?
                var earliest = this.model.earliestDateInput.jsDate();
                var latest = this.model.latestDateInput.jsDate();
                latest.setDate(latest.getDate() -1);

                return earliest.toDateString().slice(4, -5) + " - " + latest.toDateString().slice(4, -5);

            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid
                });
                this.$el.html(template);

                this.$(".flash_messages").append(this.children.flashMessages.render().el);
                $(this.children.earliestTimeInput.render().el).prependTo(this.$('.earliest-date'));
                $(this.children.latestTimeInput.render().el).prependTo(this.$('.latest'));

                return this;
            },
            template: '\
                <tr><td class="flash_messages" colspan="4"></td></tr>\
                <tr>\
                    <td class="earliest-date"><span class="help-block"><%- _("00:00:00").t() %></span></td>\
                    <td><label class="control-label"><%- _("and").t() %></label></td>\
                    <td class="latest"><span class="help-block"><%- _("24:00:00").t() %></span></td>\
                    <td><button class="apply btn" id="apply_<%- cid %>"><%- _("Apply").t() %></button></td>\
                </tr>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/daterange/BeforeDate',[
        "jquery",
        "underscore",
        "backbone",
        "module",
        "models/DateInput",
        "models/TimeRange",
        'views/Base',
        "views/shared/controls/DateControl",
        "views/shared/FlashMessages"
      ],
     function($, _, Backbone, module, DateInputModel, TimeRangeModel, Base, DateControl, FlashMessages) {
        return Base.extend({
            tagName: 'tbody',
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.call(this, arguments);
        
                this.model = {
                    range: this.model,
                    workingRange: new TimeRangeModel(),
                    latestDateInput: new DateInputModel()
                };
            
                this.today = new Date();
                this.today.setHours(0, 0, 0, 0);
                this.model.latestDateInput.setFromJSDate(this.today, {silent:true});
        
                this.children.latestTimeInput = new DateControl({
                    model:  this.model.latestDateInput,
                    validate: true
                });
                
                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        latestDateInput: this.model.latestDateInput
                    }
                });
            
                this.model.range.on('change:latest_date prepopulate', _.debounce(this.prepopulate, 0), this);
                
                this.model.latestDateInput.on("validated:invalid", this.disableApply, this);
                this.model.latestDateInput.on("validated:valid", this.enableApply, this);
                
                this.model.latestDateInput.on("change", function(){
                    this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    this.model.workingRange.trigger("serverValidated", true, this.model.workingRange, []);
                }, this);
            },
            prepopulate: function() {
                var latest = this.model.range.get('latest_date');
                
                if (latest) {
                    this.model.latestDateInput.setFromJSDate(latest, {validate: true});
                    this.model.latestDateInput.setHoursMinSecFromStr("00:00:00.000", {silent:true});
                }
            },
            events: {
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }
                
                    this.model.latestDateInput.setHoursMinSecFromStr("00:00:00.000", {silent:true, validate:true});
            
                    var that = this,
                    latestIsoWithoutTZ = this.model.latestDateInput.isoWithoutTZ();
            
                    this.disableApply();
            
                    this.model.workingRange.save(
                            {
                                earliest: "",
                                latest: latestIsoWithoutTZ
                            }, 
                            {
                                success: function(model) {
                                    that.enableApply();
                                    that.model.range.set({
                                        'earliest': "",
                                        'latest': model.get('latest_epoch'),
                                        'earliest_epoch': model.get('earliest_epoch'),
                                        'latest_epoch': model.get('latest_epoch'),
                                        'earliest_iso': model.get('earliest_iso'),
                                        'latest_iso': model.get('latest_iso'),
                                        'earliest_date': new Date(0),
                                        'latest_date': new Date(model.get('latest_date').getTime())
                                    });
                                    that.model.range.trigger("applied");
                                },
                                error: function(model, error) {
                                    that.enableApply();
                                }
                            }
                    );
                    event.preventDefault();
                }
            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid
                });
                this.$el.html(template);

                this.$(".flash_messages").append(this.children.flashMessages.render().el);
                this.$(".latest_time").prepend(this.children.latestTimeInput.render().el); 
                return this;
            },
            template: '\
                <tr>\
                <td class="flash_messages"></td>\
                <td class="latest_time"><span class="help-block"><%- _("00:00:00").t() %></span></td>\
                <td><button class="apply btn" id="apply_<%- cid %>"><%- _("Apply").t() %></button></td>\
                </tr>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/daterange/AfterDate',
    [
        "jquery",
        "underscore",
        "backbone",
        "module",
        "models/DateInput",
        "models/TimeRange",
        'views/Base',
        "views/shared/controls/DateControl",
        "views/shared/FlashMessages"
    ],
    function($, _, Backbone, module, DateInputModel, TimeRangeModel, Base, DateControl, FlashMessages) {
        return Base.extend({
            tagName: 'tbody',
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.call(this, arguments);
            
                this.model = {
                    range: this.model,
                    workingRange: new TimeRangeModel(),
                    earliestDateInput: new DateInputModel()
                };
                    
                this.yesterday = new Date();
                this.yesterday.setDate(this.yesterday.getDate() - 1);
                this.yesterday.setHours(0, 0, 0, 0);
                this.model.earliestDateInput.setFromJSDate(this.yesterday, {silent:true});
            
                this.children.earliestTimeInput = new DateControl({
                    model: this.model.earliestDateInput,
                    validate: true
                });
                
                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        earliestDateInput: this.model.earliestDateInput
                    }
                });
                    
                this.model.range.on('change:earliest_date prepopulate', _.debounce(this.prepopulate, 0), this);
                
                this.model.earliestDateInput.on("validated:invalid", this.disableApply, this);
                this.model.earliestDateInput.on("validated:valid", this.enableApply, this);
                
                this.model.earliestDateInput.on("change", function(){
                    this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    this.model.workingRange.trigger("serverValidated", true, this.model.workingRange, []);
                }, this);
            },
            prepopulate: function() {
                var earliest = this.model.range.get('earliest_date');
                
                if (earliest && !this.model.range.hasNoEarliest()) {
                    this.model.earliestDateInput.setFromJSDate(earliest, {validate: true});
                    this.model.earliestDateInput.setHoursMinSecFromStr("00:00:00.000", {silent:true});
                }
            },
            events: {
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }
                
                    var that = this,
                    earliestIsoWithoutTZ = this.model.earliestDateInput.isoWithoutTZ();
                    this.disableApply();
            
                    this.model.workingRange.save(
                            {
                                earliest: earliestIsoWithoutTZ,
                                latest: "now"
                            }, 
                            {
                                success: function(model) {
                                    that.enableApply();
                                    that.model.range.set({
                                        'earliest': model.get('earliest_epoch'),
                                        'latest': 'now',
                                        'earliest_epoch': model.get('earliest_epoch'),
                                        'latest_epoch': model.get('latest_epoch'),
                                        'earliest_iso': model.get('earliest_iso'),
                                        'latest_iso': model.get('latest_iso'),
                                        'earliest_date': new Date(model.get('earliest_date').getTime()),
                                        'latest_date': new Date(model.get('latest_date').getTime())
                                    });
                                    that.model.range.trigger("applied");
                                },
                                error: function(model, error) {
                                    that.enableApply();
                                }
                            }
                    );
                    event.preventDefault();
                }
            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid
                });
                this.$el.html(template);
                this.$(".flash_messages").append(this.children.flashMessages.render().el);
                this.$(".earliest_time").prepend(this.children.earliestTimeInput.render().el); 
                return this;
            },
            template: '\
                <tr>\
                <td class="earliest_time"><span class="help-block"><%- _("00:00:00").t() %></span></td>\
                <td><button class="apply btn" id="apply_<%- cid %>"><%- _("Apply").t() %></button></td>\
                </tr>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/daterange/Master',[
        "jquery",
        "underscore",
        "backbone",
        "module",
        "views/Base",
        "views/shared/controls/SyntheticSelectControl",
        "views/shared/timerangepicker/dialog/daterange/BetweenDates",
        "views/shared/timerangepicker/dialog/daterange/BeforeDate",
        "views/shared/timerangepicker/dialog/daterange/AfterDate",
        "views/shared/FlashMessages"
        ],
        function($, _, Backbone, module, BaseView, SyntheticSelectControl, BetweenDates, BeforeDate, AfterDate, FlashMessages) {
            return BaseView.extend({
                className: 'accordion-inner',
                moduleId: module.id,
                initialize: function(options) {
                    BaseView.prototype.initialize.call(this, arguments);

                    this.label = _("Date Range").t();

                    this.children.rangeTypeSelect = new SyntheticSelectControl({
                        model: this.model,
                        items: [
                            {value: 'between_dates', label: _('Between').t()},
                            {value: 'before_date', label: _('Before').t()},
                            {value: 'after_date', label: _('Since').t()}
                        ],
                        modelAttribute: 'range_type',
                        className: 'timerangepicker-range-type',
                        toggleClassName: 'btn',
                        menuWidth: 'narrow',
                        popdownOptions: {attachDialogTo:'body'},
                        save: false
                    });

                    var rangeTypeOptions = {
                        model: this.model,
                        parentCid: this.cid
                    };
                    this.children.betweenDates = new BetweenDates(rangeTypeOptions);
                    this.children.beforeDate = new BeforeDate(rangeTypeOptions);
                    this.children.afterDate = new AfterDate(rangeTypeOptions);

                    this.model.on("change:range_type", function() {
                        var range_type = this.model.get('range_type') || "";
                        this.children.betweenDates.$el.hide();
                        this.children.beforeDate.$el.hide();
                        this.children.afterDate.$el.hide();
                        switch(range_type){
                            case "before_date":
                                this.children.beforeDate.$el.show();
                                break;
                            case "after_date":
                                this.children.afterDate.$el.show();
                                break;
                            default:
                                this.children.betweenDates.$el.show();
                            break;
                        }
                    }, this);

                    this.model.on('change:earliest change:latest prepopulate', _.debounce(this.prepopulate, 0), this);

                },
                prepopulate: function() {
                    var earliestIsAbsolute = this.model.isAbsolute('earliest'),
                        hasNoEarliest = this.model.hasNoEarliest(),
                        latestIsAbsolute =  this.model.isAbsolute('latest');

                    if (!hasNoEarliest && earliestIsAbsolute && latestIsAbsolute) {
                        this.model.set('range_type', 'between_dates');
                    } else if (hasNoEarliest && latestIsAbsolute) {
                        this.model.set('range_type', 'before_date');
                    } else if (earliestIsAbsolute && this.model.latestIsNow()) {
                        this.model.set('range_type', 'after_date');
                    }
                },
                supportsRange: function() {
                    var supportsEarliest = false,
                        supportsLatest = false,
                        hasNoEarliest = this.model.hasNoEarliest(),
                        latestIsNow = this.model.latestIsNow(),
                        earliestIsWholeDay = this.model.isWholeDay('earliest'),
                        latestIsWholeDay = this.model.isWholeDay('latest');

                    if (hasNoEarliest && latestIsNow) {
                        return false;
                    }

                    return (earliestIsWholeDay && latestIsWholeDay)
                            || (earliestIsWholeDay && latestIsNow)
                            || (hasNoEarliest && latestIsWholeDay);
                },
                render: function() {
                    this.$el.append( this.children.rangeTypeSelect.render().el);

                    var template = _.template(this.template, {
                        cid: this.cid
                    });
                    this.$el.append(template);

                    this.$('.date-range-container').append(this.children.betweenDates.render().el);
                    this.$('.date-range-container').append(this.children.beforeDate.render().el);
                    this.children.beforeDate.$el.hide();
                    this.$('.date-range-container').append(this.children.afterDate.render().el);
                    this.children.afterDate.$el.hide();

                    return this;
                },
                template: '\
                    <table class="form form-inline date-range-container">\
                    </table>\
                '
        });
    }
);

// footer nav
define('views/shared/timerangepicker/dialog/dateandtimerange/timeinput/HoursMinutesSeconds',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView
){
    return BaseView.extend({
        tagName: 'div',
        className: "view-time-range-picker-time-and-date-range-hours-minutes-seconds pull-left",
        moduleId: module.id,
        initialize: function() {
            BaseView.prototype.initialize.call(this, arguments);
            
            this.model.on("attributeValidated:second", function(isValid, key, error) {
                if (isValid) {
                    this.$("input").removeClass("error");
                } else {
                    this.$("input").addClass("error");
                }
            }, this);
            
            this.model.on("change", this.updateTime, this);
        },
        events: {
            'keyup input[type="text"]': function(){
                this.model.off("change", this.updateTime, this);
                this.model.setHoursMinSecFromStr(this.$('input').val(), {validate: true});
                this.model.on("change", this.updateTime, this);
            }
        },
        updateTime: function() {
            var time = this.model.time();
            this.$('input').val(time).removeClass("error");
        },
        render: function() {
            var time = this.model.time();
            
            var template = _.template(this.template, {
                time: time
            });
            this.$el.html(template);
            
            return this;
        },
        template: '\
            <input type="text" size="10" value="<%- time %>"/>\
            <span class="help-block"><%- _("HH:MM:SS.SSS").t() %></span>\
            '
    });
});

define('views/shared/timerangepicker/dialog/dateandtimerange/timeinput/Master',[
            "jquery",
            "underscore",
            "backbone",
             "module",
             "views/Base",
             "views/shared/controls/DateControl",
             "views/shared/timerangepicker/dialog/dateandtimerange/timeinput/HoursMinutesSeconds"
      ],
     function($, _, Backbone, module, BaseView, DateControl, HoursMinutesSeconds) {
        return BaseView.extend({
            tagName: 'table',
            className: 'form form-inline pull-left',
            moduleId: module.id,
            initialize: function() {
                BaseView.prototype.initialize.call(this, arguments);
            
                this.children.monthDayYear = new DateControl({
                    parentCid: this.cid,
                    model: this.model.dateTime,
                    className: 'control pull-left',
                    inputClassName: this.options.inputClassName || 'date',
                    validate: true
                });
            
                this.children.hoursMinutesSeconds = new HoursMinutesSeconds({
                    model: this.model.dateTime
                });
            },
            render: function() {
                if (!this.el.innerHTML) {
                    var template = _.template(this.template, {
                        _: _,
                        cid: this.cid,
                        label: this.options.label
                    });
                    this.$el.html(template);
                
                    this.$("td").last().append(this.children.monthDayYear.render().el);
                    this.$("td").last().append(this.children.hoursMinutesSeconds.render().el);
                } else {
                    this.children.monthDayYear.render();
                    this.children.hoursMinutesSeconds.render();
                }
                return this;
            },
            template: '\
                <tbody>\
                    <tr>\
                        <td>\
                            <label class="control-label" for="monthdayyear_<%- cid %>"><%- label %><%- _(":").t() %></label>\
                        </td>\
                        <td>\
                        </td>\
                    </tr>\
                </tbody>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/dateandtimerange/Master',
        [
            "jquery",
            "underscore",
            "backbone",
            "module",
            "models/DateInput",
            "models/TimeRange",
            "views/Base",
            "views/shared/timerangepicker/dialog/dateandtimerange/timeinput/Master",
            "views/shared/FlashMessages",
            "util/time_utils"
        ],
        function($, _, Backbone, module, DateInputModel, TimeRangeModel, BaseView, TimeInput, FlashMessages, time_utils) {
            return BaseView.extend({
                className: 'accordion-inner',
                moduleId: module.id,
                initialize: function() {
                    BaseView.prototype.initialize.call(this, arguments);
            
                    this.model = {
                        range: this.model,
                        workingRange: new TimeRangeModel(),
                        earliestDateInput: new DateInputModel(),
                        latestDateInput: new DateInputModel()
                    };
                        
                    this.label = _("Date & Time Range").t();
                    this.earliest_errored = false;
                    this.latest_errored = false;
            
                    this.today = new Date();
                    this.today.setHours(12, 0, 0, 0);
                    this.model.latestDateInput.setFromJSDate(this.today, {silent:true});
            
                    this.yesterday = new Date();
                    this.yesterday.setDate(this.yesterday.getDate() - 1);
                    this.yesterday.setHours(12, 0, 0, 0);
                    this.model.earliestDateInput.setFromJSDate(this.yesterday, {silent:true});
                    
                    this.children.flashMessages = new FlashMessages({
                        model: {
                            workingRange: this.model.workingRange,
                            earliestDateInput: this.model.earliestDateInput,
                            latestDateInput: this.model.latestDateInput                          
                        }
                    });
                    
                    //views
                    this.children.earliestTimeInput = new TimeInput({
                        label: _("Earliest").t(),
                        inputClassName: 'date-earliest',
                        model: {
                            dateTime: this.model.earliestDateInput
                        }
                    });
            
                    this.children.latestTimeInput = new TimeInput({
                        label: _("Latest").t(),
                        inputClassName: 'date-latest',
                        model: {
                            dateTime: this.model.latestDateInput
                        }
                    });
                    
                    this.model.workingRange.on("sync error", this.enableApply, this);
                    
                    this.model.earliestDateInput.on("validated:invalid", function(){
                        this.earliest_errored = true;
                        this.disableApply();
                    }, this);
                    this.model.earliestDateInput.on("validated:valid", function(){
                        this.earliest_errored = false;
                        this.enableApply();
                    }, this);
                    
                    this.model.latestDateInput.on("validated:invalid", function(){
                        this.latest_errored = true;
                        this.disableApply();
                    }, this);
                    this.model.latestDateInput.on("validated:valid", function(){
                        this.latest_errored = false;
                        this.enableApply();
                    }, this);
                    
                    this.model.earliestDateInput.on("change", function(){
                        this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    }, this);
                    
                    this.model.latestDateInput.on("change", function(){
                        this.model.workingRange.trigger("validated", true, this.model.workingRange, {});
                    }, this);
                    
                    this.model.range.on('change:earliest_iso change:latest_iso prepopulate', _.debounce(this.prepopulate, 0), this);        
                },
                remove: function() {
                    BaseView.prototype.remove.apply(this, arguments);
                    this.model.workingRange.deepOff();
                    this.model.workingRange.fetchAbort();
                },
                prepopulate: function() {
                    var earliest = this.model.range.get('earliest_iso'),
                        latest =  this.model.range.get('latest_iso'),
                        earliest_date = this.model.range.get('earliest_date'),
                        latest_date = this.model.range.get('latest_date');
                                        
                    if (earliest_date) {
                        this.model.earliestDateInput.setFromJSDate(earliest_date, {validate: true});
                    }
                    if (latest_date) {
                        this.model.latestDateInput.setFromJSDate(latest_date, {validate: true});
                    }
                },
                supportsRange: function() {
                    return time_utils.generateDateTimeRangeLabel(this.model.range.get('earliest'), this.model.range.get('latest'));
                },
                events: {
                    "click .apply": function(event) {
                        if ($(event.currentTarget).hasClass("disabled")) {
                            event.preventDefault();
                            return;
                        }
                    
                        if (!this.earliest_errored && !this.latest_errored){
                            var that = this,
                            earliestIsoWithoutTZ = this.model.earliestDateInput.isoWithoutTZ(),
                            latestIsoWithoutTZ = this.model.latestDateInput.isoWithoutTZ();

                            this.disableApply();
                            this.model.workingRange.save(
                                    {
                                        earliest: earliestIsoWithoutTZ,
                                        latest: latestIsoWithoutTZ
                                    },
                                    {
                                        success: function(model) {
                                            that.enableApply();
                                            that.model.range.set({
                                                'earliest': model.get('earliest_epoch'),
                                                'latest': model.get('latest_epoch'),
                                                'earliest_epoch': model.get('earliest_epoch'),
                                                'latest_epoch': model.get('latest_epoch'),
                                                'earliest_iso': model.get('earliest_iso'),
                                                'latest_iso': model.get('latest_iso'),
                                                'earliest_date': new Date(model.get('earliest_date').getTime()),
                                                'latest_date': new Date(model.get('latest_date').getTime())
                                            });
                                            that.model.range.trigger("applied");
                                        },
                                        error: function(model, error) {
                                            that.enableApply();
                                        }
                                    }
                            );
                        }
                        event.preventDefault();
                    }
                },
                enableApply: function() {
                    this.$("#apply_" + this.cid).removeClass('disabled');
                },
                disableApply: function() {
                    this.$("#apply_" + this.cid).addClass('disabled');
                },
                render: function() {
                    var template = _.template(this.template, {
                        _: _,
                        cid: this.cid
                    });
                    this.$el.html(template);

                    this.children.flashMessages.render().$el.insertBefore(this.$(".apply"));
                    this.children.earliestTimeInput.render().$el.insertBefore(this.$(".apply"));
                    this.children.latestTimeInput.render().$el.insertBefore(this.$(".apply"));

                    return this;
                },
                template: '\
                    <button class="apply btn pull-left" id="apply_<%- cid %>"><%- _("Apply").t() %></button>\
                '
        });
    }
);

// footer nav
define('views/shared/timerangepicker/dialog/advanced/timeinput/Hint',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base',
    'util/time_utils',
    'splunk.i18n'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    time_utils,
    i18n
){
    return BaseView.extend({
        moduleId: module.id,
        initialize: function() {
            BaseView.prototype.initialize.call(this, arguments);
            this.model.timeParser.on('error sync', this.render, this);
        },
        render: function() {
            var parseError = this.model.timeParser.error.get("messages"),
                date = time_utils.isoToDateObject(this.model.timeParser.get("value")),
                error = parseError || isNaN(date.getTime());
                
            var template = _.template(this.template, {
                    _: _,
                    timeParser: this.model.timeParser,
                    error: error,
                    value: error || i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(date), "short", "full")
                });
            this.$el.html(template);
            return this;
        },
        template: '\
            <% if (error) { %>\
                <%- _("Invalid time").t() %>\
            <% } else if (timeParser.get("value")) { %>\
                <%- value %>\
            <% } %>\
            '
    });
});

define('views/shared/timerangepicker/dialog/advanced/timeinput/Master',[
    'jquery',
    'underscore',
    'backbone',
    "module",
    "views/Base",
    "views/shared/timerangepicker/dialog/advanced/timeinput/Hint",
    "util/time_utils"
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    Hint,
    time_utils
){
        return BaseView.extend({
            tagName: 'table',
            className: 'form form-inline pull-left',
            moduleId: module.id,
            initialize: function() {
                BaseView.prototype.initialize.call(this, arguments);
                
                this.children.hint = new Hint({
                    model: {
                        timeParser: this.model.timeParser
                    }
                });
                
                this.model.working.on('change:' + this.options.modelAttribute, function() {
                    this.update_value();
                    this.update_hint();
                }, this);
            },
            events: {
                'keyup input[type="text"]': 'update_hint',
                'focusout input[type="text"]': 'update_hint'
            },
            update_hint: function(event) {
                var time = time_utils.stripRTSafe((this.$('input').val() || this.options.blankValue), this.options.isLatest),
                    id = time_utils.stripRTSafe(this.model.timeParser.id, this.options.isLatest);

                if (time !== id) {
                    this.model.timeParser.fetch({
                        data: {
                            time: time_utils.stripRTSafe(time, this.options.isLatest)
                        }
                    });                   
                } 
            },
            update_value: function() {
                var time = this.model.working.get(this.options.modelAttribute) || "";
                if (time !== this.options.blankValue){
                    this.$('input').val(time);
                }
            },
            render: function() {                
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid,
                    label: this.options.label,
                    time: this.model.working.get(this.options.modelAttribute) || ""
                });
                this.$el.html(template);
            
                //hint
                this.$("#hint_" + this.cid).html(this.children.hint.render().el);
                this.update_hint();
                
                return this;
            },
            template: '\
                <tbody>\
                    <tr>\
                        <td>\
                            <label class="control-label" for="<%- cid %>"><%- label %><%- _(":").t() %></label>\
                        </td>\
                        <td>\
                            <input type="text" size="20" value="<%- time %>" id="<%- cid %>"/>\
                            <span id="hint_<%- cid %>" class="help-block help-block-timestamp"></span>\
                        </td>\
                    </tr>\
                </tbody>\
            '
        });
    }
);

define('views/shared/timerangepicker/dialog/advanced/Master',
    [
        'jquery',
        'underscore',
        'backbone',
        "module",
        "views/Base",
        "models/services/search/TimeParser",
        "models/TimeRange",
        "views/shared/timerangepicker/dialog/advanced/timeinput/Master",
        "views/shared/FlashMessages",
        'uri/route',
        'util/console',
        "util/time_utils"
    ],
    function($, _, Backbone, module, BaseView, TimeParserModel, TimeRangeModel, TimeInput, FlashMessages, route, console, time_utils) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'accordion-inner',
            initialize: function() {
                BaseView.prototype.initialize.call(this, arguments);
                
                this.label = _("Advanced").t();
                
                var workingTimeRangeAttributes = $.extend(true, {
                    enableRealTime: this.options.enableCustomAdvancedRealTime
                }, this.model.timeRange.toJSON());

                this.model = {
                    appLocal: this.model.appLocal,
                    application: this.model.application,
                    range: this.model.timeRange,
                    workingRange: new TimeRangeModel(workingTimeRangeAttributes),
                    earliestTimeParser: new TimeParserModel({
                        key: time_utils.stripRTSafe(this.model.timeRange.get("earliest"), false),
                        value: this.model.timeRange.get("earliest_iso")
                    }),
                    latestTimeParser: new TimeParserModel({
                        key: time_utils.stripRTSafe(this.model.timeRange.get("latest"), true),
                        value: this.model.timeRange.get("latest_iso")
                    })
                };

                this.children.earliestTimeInput = new TimeInput({
                    model: {
                        working: this.model.workingRange,
                        timeParser: this.model.earliestTimeParser
                    },
                    label: _("Earliest").t(),
                    blankValue: '0',
                    modelAttribute: "earliest",
                    isLatest: false
                });

                this.children.latestTimeInput = new TimeInput({
                    model: {
                        working: this.model.workingRange,
                        timeParser: this.model.latestTimeParser
                    },
                    label: _("Latest").t(),
                    blankValue: 'now',
                    modelAttribute: "latest",
                    isLatest: true
                });

                this.children.flashMessages = new FlashMessages({
                    model: {
                        workingRange: this.model.workingRange,
                        earliestTimeParser: this.model.earliestTimeParser,
                        latestTimeParser: this.model.latestTimeParser
                    }
                });

                this.model.range.on('change:earliest change:latest prepopulate', _.debounce(function() {
                   this.model.workingRange.set({
                       'earliest': this.model.range.get('earliest'), 
                       'latest': this.model.range.get('latest')
                   });
                }, 0), this);
                
                this.model.workingRange.on('validated', function(validated, model, error_payload){
                    if (!validated) {
                        this.enableApply();
                    }
                }, this);
            },
            remove: function() {
                BaseView.prototype.remove.apply(this, arguments);
                _.chain(this.model).omit(['appLocal', 'application', 'range']).each(function(model){
                    model.deepOff();
                    model.fetchAbort();
                });
             },
            supportsRange: function() {
                return true; //supports anything
            },
            events: {
                "click .apply": function(event) {
                    if ($(event.currentTarget).hasClass("disabled")) {
                        event.preventDefault();
                        return;
                    }

                    var that = this,
                        earliest = this.children.earliestTimeInput.$('input').val() || '0',
                        latest = this.children.latestTimeInput.$('input').val() || 'now';

                    this.disableApply();
                    
                    this.model.workingRange.save(
                            {
                                earliest: earliest,
                                latest: latest
                            },
                            {
                                success: function(model) {
                                    that.enableApply();
                                    that.model.range.set({
                                        'earliest': model.get('earliest'),
                                        'latest': model.get('latest'),
                                        'earliest_epoch': model.get('earliest_epoch'),
                                        'latest_epoch': model.get('latest_epoch'),
                                        'earliest_iso': model.get('earliest_iso'),
                                        'latest_iso': model.get('latest_iso'),
                                        'earliest_date': new Date(model.get('earliest_date').getTime()),
                                        'latest_date': new Date(model.get('latest_date').getTime())
                                    });
                                    that.model.range.trigger("applied");
                                },
                                error: function(model, error) {
                                    that.enableApply();
                                }
                            }
                    );
                    event.preventDefault();
                }
            },
            enableApply: function() {
                this.$("#apply_" + this.cid).removeClass('disabled');
            },
            disableApply: function() {
                this.$("#apply_" + this.cid).addClass('disabled');
            },
            render: function() {
                // TODO: 'Remove if statement after all consumers pass the appLocal and application model'
                var docRoute = "http://docs.splunk.com/";
                if (this.model.appLocal && this.model.application) {
                    docRoute = route.docHelp(
                        this.model.application.get("root"),
                        this.model.application.get("locale"),
                        'learnmore.timerange.picker',
                        this.model.application.get("app"),
                        this.model.appLocal.entry.content.get('version'),
                        this.model.appLocal.appAllowsDisable()
                    );
                } else {
                    console.warn("The timerangepicker advanced view needs the AppLocal and Application model passed to it");
                }
                var template = _.template(this.template, {
                    _: _,
                    cid: this.cid,
                    docRoute: docRoute
                });
                this.$el.html(template);
                this.children.flashMessages.render().$el.insertBefore(this.$(".apply"));
                this.children.earliestTimeInput.render().$el.insertBefore(this.$(".apply"));
                this.children.latestTimeInput.render().$el.insertBefore(this.$(".apply"));

                return this;
            },
            template: '\
                    <button class="apply btn" id="apply_<%- cid %>"><%- _("Apply").t() %></button>\
                    <a href="<%- docRoute %>" target="_blank" title="<%- _("Splunk help").t() %>" class="btn-documentation" style="line-height:22px;"><%- _("Documentation").t() %> <i class="icon-external"></i></a>\
            '
    });
}
);

/**
 *   views/shared/delegates/Accordion
 *
 *   Desc:
 *     This class applies accordion behaviors.
 *     Default markup is based on Twitter Bootstrap's Collapse
 *     http://twitter.github.com/bootstrap/
 *
 *     @param {Object} (Optional) options An optional object literal having one or more settings.
 *
 *    Usage:
 *       var p = new Popdown({options})
 *
 *    Options:
 *        el (required): The event delegate.
 *        group: jQuery selector for the toggle and body wrapper ".accordion-group".
 *        toggle: jQuery selector for the accordion group's toggle. Defaults to ".accordion-toggle".
 *        body: jQuery selector for the accordion group's body. Defaults to ".accordion-body".
 *        default: jQuery selector or object for the default group. Defaults to ".accordion-group:first-child".
 *
 *    Methods:
 *        show: show a panel. Parameters are the group, which can be a selector or jQuery object, and a boolean to enable or disable animation.
 */


define('views/shared/delegates/Accordion',[
    'jquery',
    'underscore',
    'views/shared/delegates/Base'
],function(
    $,
    _,
    DelegateBase
){
    return DelegateBase.extend({
        initialize: function(){
            var defaults = {
                group: ".accordion-group",
                toggle: ".accordion-toggle",
                body: ".accordion-body",
                defaultGroup: ".accordion-group:first-child",
                icon: ".icon-accordion-toggle",
                inactiveIconClass: "icon-triangle-right-small",
                activeIconClass: "icon-triangle-down-small",
                activeClass: "active",
                speed: 300
            };

            _.defaults(this.options, defaults);

            //setup
            this.$(this.options.body).hide();
            this.$(this.options.icon).addClass(this.options.inactiveIconClass);
            
            //show the default group all
            this.show(this.$(this.options.defaultGroup), false);
        },
        events: {
            'click .accordion-toggle': 'toggle'
        },
        toggle: function (e) {
            e.preventDefault();      
            var $group = $(e.currentTarget).closest(this.options.group);
            
            //if the group is already active, do nothing.
            if ($group.hasClass(this.options.activeClass)) {
                return;
            }
            
            this.trigger('toggle'); 
            this.show($group, true);
            this.trigger('toggled');
        },
        show: function (group, animate) {
            var that = this,
                $newGroup = $(group),
                $activeGroup = this.$(this.options.group + '.' + this.options.activeClass),
                showComplete = function () {
                  that.trigger('shown');
                },
                hideComplete = function () {
                  that.trigger('hidden');
                };
                
            //ignore if the item is already active.
            this.trigger('show');
            this.trigger('hide');
            
            //Swap the active classes.
            $activeGroup.removeClass(this.options.activeClass);
            $newGroup.addClass(this.options.activeClass);
            
            //Swap the icon classes
            $activeGroup.find(this.options.icon).addClass(this.options.inactiveIconClass).removeClass(this.options.activeIconClass);
            $newGroup.find(this.options.icon).addClass(this.options.activeIconClass).removeClass(this.options.inactiveIconClass);
            
            //Show hide the body
            if (animate){
                $activeGroup.find(this.options.body).slideUp({duration:this.options.speed, queue: false, complete:hideComplete});
                $newGroup.find(this.options.body).slideDown({duration:this.options.speed, queue: false, complete:showComplete});
            } else {
                $activeGroup.find(this.options.body).hide({duration:0, queue: false, complete:hideComplete});
                $newGroup.find(this.options.body).show({duration:0, queue: false, complete:showComplete});
            }
            
        }

    });
});
define('views/shared/timerangepicker/dialog/Master',[
        'jquery',
        'underscore',
        'backbone',
        'module',
        'models/services/authentication/User',
        'views/Base',
        'views/shared/timerangepicker/dialog/Presets',
        'views/shared/timerangepicker/dialog/Relative',
        'views/shared/timerangepicker/dialog/RealTime',
        'views/shared/timerangepicker/dialog/daterange/Master',
        'views/shared/timerangepicker/dialog/dateandtimerange/Master',
        'views/shared/timerangepicker/dialog/advanced/Master',
        'views/shared/delegates/Accordion'
    ],
    function($, _, Backbone, module, UserModel, BaseView, Presets, Relative, RealTime, DateRange, DateAndTimeRange, Advanced, Accordion) {
        /**
         * @param {Object} options {
         *     model: {
         *          timeRange: <models.TimeRange>,
         *          user: <models.services.authentication.User>,
         *          appLocal: <models.services.AppLocal>,
         *          application: <models.Application>
         *     },
         *     collection (Optional): <collections.services.data.ui.TimesV2>
         *     showPresets (Optional): hide or show the Presets panel.
         *     showPresetsRealTime (Optional): hide or show RealTime in the Presets panel.
         *     showPresetsRealTimeOnly (Optional): Only show RealTime in the Presets panel.
         *     showPresetsRelative (Optional): hide or show the Relative in the Presets panel.
         *     showPresetsAllTime (Optional): hide or show All Time in the Presets panel.
         *     showCustom (Optional): hide or show all the Custom panels.
         *     showCustomRealTime (Optional): hide or show the RealTime panel.
         *     showCustomRelative (Optional): hide or show the Relative panel.
         *     showCustomDate (Optional): hide or show the Date Range panel.
         *     showCustomDateTime (Optional): hide or show the Date Time Range panel.
         *     showCustomAdvanced (Optional): hide or show the Advanced panel.
         *     enableCustomAdvancedRealTime (optional): allows the advanced inputs to accept realtime values
         * }
         */
        return BaseView.extend({
            moduleId: module.id,
            className: 'accordion view-new-time-range-picker-dialog',
            initialize: function() {
                this.model.user = this.model.user || new UserModel();
                var canRTSearch = this.model.user.canRTSearch(),
                    defaults = {
                        showPresets:true,
                        showPresetsRealTime: canRTSearch,
                        showPresetsRealTimeOnly:false,
                        showPresetsRelative:true,
                        showPresetsAllTime:true,
                        showCustom:true,
                        showCustomRealTime: canRTSearch,
                        showCustomRelative:true,
                        showCustomDate:true,
                        showCustomDateTime:true,
                        showCustomAdvanced:true,
                        enableCustomAdvancedRealTime: canRTSearch
                    };
                
                _.defaults(this.options, defaults);
                BaseView.prototype.initialize.call(this, arguments);

                this.renderedDfd = $.Deferred();
                
                //Panels
                if (this.options.showPresets && this.collection) {
                    this.children.presets = new Presets({
                        collection: this.collection,
                        model: this.model.timeRange,
                        showRealTime:this.options.showPresetsRealTime,
                        showRealTimeOnly:this.options.showPresetsRealTimeOnly,
                        showRelative:this.options.showPresetsRelative,
                        showAllTime:this.options.showPresetsAllTime
                    });
                }
                if (this.options.showCustom) {
                    if (this.options.showCustomRelative) {
                        this.children.relative = new Relative({model: this.model.timeRange});
                    }
                    if (this.options.showCustomRealTime) {
                        this.children.realtime = new RealTime({model: this.model.timeRange});
                    }
                    if (this.options.showCustomDate) {
                        this.children.daterange = new DateRange({model: this.model.timeRange});
                    }
                    if (this.options.showCustomDateTime) {
                        this.children.dateandtimerange = new DateAndTimeRange({model: this.model.timeRange});
                    }
                    if (this.options.showCustomAdvanced) {
                        this.children.advanced = new Advanced({
                            model: {
                                timeRange: this.model.timeRange,
                                appLocal: this.model.appLocal,
                                application: this.model.application
                            },
                            enableCustomAdvancedRealTime: this.options.enableCustomAdvancedRealTime
                        });
                    }
                }
                
                //note this listens for changes on earliest_epoch and latest_epoch because they change after the ajax request completes.
                this.model.timeRange.on('change:earliest_epoch change:latest_epoch', _.debounce(this.onChange, 0), this);
                this.collection.on('reset', this.onChange, this);
            },
            onChange: function() {
                $.when(this.renderedDfd).then(function() {
                    return this.$el.is(":visible") ? false : this.children.accordion.show(this.getBestGroup(), false);
                }.bind(this));

            },
            getBestGroup: function() {
                var bestPanel = false;
                
                _.each(this.children, function(panel, key) {
                    if (bestPanel) return false;
                    bestPanel = panel.supportsRange() ? panel : bestPanel;
                }, this);
                
                bestPanel = bestPanel || this.children.presets || this.children.advanced || this.children.daterange || this.children.dateandtimerange || this.children.relative || this.children.realtime;
                
                return bestPanel.$el.closest('.accordion-group');
            },
            render: function() {
                var template = _.template(this.template, {
                    cid: this.cid,
                    panels: this.children
                });
                this.$el.html(template);
                
                _.each(this.children, function(panel, key) { 
                    this.$("#" + key + "_" + this.cid + ' .accordion-body').append(panel.render().el);
                }, this);

                this.children.accordion = new Accordion({el: this.el, defaultGroup: this.getBestGroup()});
                this.renderedDfd.resolve();
                return this;
            },
            template: '\
                <% _.each(panels, function(panel, key) { %> \
                <div class="accordion-group" id="<%- key + "_" + cid %>">\
                    <div class="accordion-heading">\
                      <a class="accordion-toggle" href="#">\
                        <i class="icon-accordion-toggle"></i><%- panel.label %>\
                      </a>\
                    </div>\
                    <div class="accordion-body">\
                    </div>\
                </div>\
                <% }); %> \
            '
      });
  }
);

define('views/shared/timerangepicker/Master',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base',
        'views/shared/timerangepicker/dialog/Master',
        'views/shared/delegates/Popdown',
        'collections/SplunkDsBase',
        'splunk.util',
        'util/console'
    ],
    function($, _, module, BaseView, Dialog, Popdown, SplunkDsBaseV2, splunk_util, console) {
        /**
         * @param {Object} options {
         *      model: {
         *          state: <models.services.SavedSearch.entry.content>,
         *          timeRange: <models.TimeRange>,
         *          user: <models.services.admin.User>,
         *          appLocal: <models.services.AppLocal>,
         *          application: <models.Application>
         *      },
         *      collection: <collections.services.data.ui.TimesV2>
         *      {String} timerangeClassName (Optional) Class attribute to the button element. Default is btn.
         *      {Object} dialogOptions: (Optional) Keys and values passed to the dialog for customization. See views/shared/timerangepicker/dialog/Master.
         * }
         */
        return BaseView.extend({
            moduleId: module.id,
            className: 'btn-group',
            initialize: function(options) {
                var defaults = {
                    timerangeClassName: 'btn'
                };

                _.defaults(this.options, defaults);

                BaseView.prototype.initialize.call(this, options);
               
                this.children.dialog = new Dialog(
                    $.extend(
                        {
                            model: {
                                timeRange: this.model.timeRange,
                                user: this.model.user,
                                appLocal: this.model.appLocal,
                                application: this.model.application
                            },
                            collection: this.collection
                        },
                        this.options.dialogOptions || {}
                     )
                );
                
                if (this.collection) {
                    this.collection.on('reset', function(){
                        console.log("timerangepicker setting label because of collection reset");
                        this.setLabel();
                    }, this);
                }
                this.listenToModels();
                this.model.timeRange.trigger("prepopulate");
            },
            listenToModels: function() {
                this.model.timeRange.on('change:earliest change:latest', _.debounce(this.timeRangeChange, 0), this);
                this.model.timeRange.on('applied', this.timeRangeApplied, this);
                this.model.timeRange.on('change:earliest_epoch change:latest_epoch change:earliest change:latest', _.debounce(this.setLabel, 0), this);
                this.model.state.on('change:dispatch.earliest_time change:dispatch.latest_time', _.debounce(this.stateChange, 0), this);
            },
            stopListeningToModels: function() {
                this.model.timeRange.off(null, null, this);
                this.model.state.off(null, null, this);
            },
            stateChange: function() {
                this.stopListeningToModels();
                var enableRealTime = this.model.timeRange.get("enableRealTime");
                this.model.timeRange.clear({silent:true});
                this.model.timeRange.set({enableRealTime: enableRealTime});
                this.model.timeRange.save(
                    {
                        'earliest': this.model.state.get('dispatch.earliest_time'),
                        'latest':this.model.state.get('dispatch.latest_time')
                    },
                    {
                        wait: true,
                        success: function(model, response) {
                            this.listenToModels();
                            this.setLabel();
                        }.bind(this),
                        error: function(model, response) {
                            this.listenToModels();
                            this.setLabel();
                        }.bind(this)
                    }
                );
            },
            timeRangeChange: function() {
                this.stopListeningToModels();
                this.model.state.set({
                    'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                    'dispatch.latest_time':this.model.timeRange.get('latest')
                });
                this.listenToModels();
            },
            timeRangeApplied: function() {
                this.children.popdown.hide();
                this.model.state.trigger("applied", {silent: splunk_util.normalizeBoolean(this.model.state.get('disable_timerange_trigger'))});
            },
            setLabel: function() {
                var timeLabel = this.model.timeRange.generateLabel(this.collection || new SplunkDsBaseV2());
                this.$el.children('a').find(".time-label").text(timeLabel);
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    options: this.options
                }));

                this.$('.popdown-dialog').append(this.children.dialog.render().el);

                this.children.popdown = new Popdown({
                    el: this.el,
                    toggle:'> a',
                    mode: "dialog",
                    attachDialogTo: 'body',
                    ignoreClasses: [
                        "ui-datepicker",
                        "ui-datepicker-header",
                        "dropdown-menu"
                    ]
                });
                
                this.children.popdown.on('shown', function() {
                    if (this.children.dialog.$(".accordion-group.active").length){
                        return;
                    }
                    var timePanel = "presets";
                    this.children.dialog.children[timePanel].$el.closest(".accordion-group").find(".accordion-toggle").first().click();
                }, this);
                                
                this.setLabel();

                return this;
            },
            template: '\
                <a class=" splBorder splBorder-nsew splBackground-primary <%- options.timerangeClassName %>" href="#"><span class="time-label"></span><span class="caret"></span></a>\
                <div class="popdown-dialog">\
                    <div class="arrow"></div>\
                </div>\
                '
        });
    }
);

define('splunkjs/mvc/sharedmodels',['require','exports','module','jquery','underscore','models/Application','models/services/AppLocal','models/services/authentication/User','collections/services/data/ui/Times','./utils','splunk.config','util/splunkd_utils'],function(require, exports, module) {    
    var $ = require('jquery');
    var _ = require('underscore');
    var AppModel = require('models/Application');
    var AppLocalModel = require('models/services/AppLocal');
    var UserModel = require('models/services/authentication/User');
    var TimeRangesCollection = require('collections/services/data/ui/Times');
    var utils = require('./utils');
    var splunkConfig = require('splunk.config');
    var splunkd_utils = require('util/splunkd_utils');
    
    var pageInfo = utils.getPageInfo();
    
    // The format for this object is:
    //  model name:
    //      model: an instance of the model
    //      fetch: a function with no arguments to use the above model and call
    //          'fetch' on it, storing the returned deferred on the model and returning
    //          that deferred. If the model does not need a fetch, just have a
    //          function that returns a deferred.
    var _STORAGE = {
        appLocal: {
            model: new AppLocalModel(),
            fetch: _.memoize(function() {
                var appModel = _STORAGE['app'].model;
                var model = _STORAGE['appLocal'].model;
                var dfd = model.dfd = model.fetch({
                    url: splunkd_utils.fullpath(model.url + "/" + appModel.get("app")),
                    data: {
                        app: appModel.get("app"),
                        owner: appModel.get("owner")
                    }
                });
                
                model.dfd = dfd;
                return dfd;
            })
        },
        user: {
            model: new UserModel(),
            fetch: _.memoize(function() {
                var appModel = _STORAGE['app'].model;
                var model = _STORAGE['user'].model;
                var dfd = model.dfd = model.fetch({
                    url: splunkd_utils.fullpath(model.url + "/" + appModel.get("owner")),
                    data: {
                        app: appModel.get("app"),
                        owner: appModel.get("owner")
                    }
                });
                
                model.dfd = dfd;
                return dfd;
            })
        },
        times: {
            model: new TimeRangesCollection(),
            fetch: _.memoize(function() {
                var appModel = _STORAGE['app'].model;
                var model = _STORAGE['times'].model;
                var dfd = model.dfd = model.fetch({
                    data: {
                        app: appModel.get("app"),
                        owner: appModel.get("owner")
                    }
                });
                
                return dfd;
            })
        },
        app: {
            model: new AppModel({
                owner: splunkConfig.USERNAME,
                locale: pageInfo.locale,
                app: pageInfo.app,
                page: pageInfo.page
            }),
            fetch: function() { return $.Deferred().resolve(_STORAGE['app'].model); }
        }
    };
    
    return {
        get: function(name) {
            if (!_STORAGE.hasOwnProperty(name)) {
                throw new Error("There is no shared model '" + name + "'");
            }
            
            var container = _STORAGE[name];
            container.fetch();
            
            return container.model;
        }
    };
});
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/timerange-picker.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/timepickerview',['require','exports','module','underscore','./mvc','backbone','./basesplunkview','views/shared/timerangepicker/Master','models/TimeRange','./utils','splunk.config','./sharedmodels','css!../css/timerange-picker'],function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('./mvc');
    var Backbone = require("backbone");
    var BaseSplunkView = require("./basesplunkview");
    var InternalTimeRangePicker = require('views/shared/timerangepicker/Master');
    var TimeRangeModel = require('models/TimeRange');
    var utils = require('./utils'), SplunkConfig = require('splunk.config');
    var sharedModels = require('./sharedmodels');

    require("css!../css/timerange-picker");
    
    var TimePickerView = BaseSplunkView.extend(
        // Instance
        {
            moduleId: module.id,
            
            className: "splunk-timepicker",
            
            options: {
                'default': undefined,
                managerid: null,
                earliest_time: '',
                latest_time: '',
                preset: undefined,
                value: undefined
            },
            
            initialize: function() {
                var that = this;
                
                this.configure();
                this.settings.enablePush("value");
                
                // Initialize value with default, if provided
                var defaultValue = this.settings.get("default");
                if (defaultValue !== undefined &&
                    this.settings.get("value") === undefined)
                {
                    this.settings.set("value", defaultValue);
                }
                
                var initialValue = this.settings.get("value");
                if (initialValue === undefined) {
                    initialValue = {
                        'earliest_time': this.settings.get("earliest_time"),
                        'latest_time': this.settings.get("latest_time")
                    };
                }
                
                this._state = new Backbone.Model({
                    'dispatch.earliest_time': initialValue['earliest_time'],
                    'dispatch.latest_time': initialValue['latest_time']
                });
                
                // Get the shared models
                var appModel = sharedModels.get("app");
                var userModel = sharedModels.get("user");
                var appLocalModel = sharedModels.get("appLocal");
                var timesCollection = this._timesCollection = sharedModels.get("times");
                
                // We cannot create the timepicker until these internal models
                // have been fetched, and so we wait on them being done.
                this._pickerDfd = $.when(timesCollection.dfd, userModel.dfd, appLocalModel.dfd).done(function() {
                    if (that.settings.get("timepicker")) {
                        that.timepicker = that.settings.get("timepicker");
                        that._state = that.timepicker.model.state;
                        
                        // Unset from settings, so we don't keep it around
                        that.settings.unset("timepicker");
                    } 
                    else {                  
                        var timeRangeModel = new TimeRangeModel();
                        timeRangeModel.save({
                            'earliest': that.settings.get("earliest_time"),
                            'latest': that.settings.get("latest_time")
                        });
                        
                        that.timepicker = new InternalTimeRangePicker({
                            className: "controls",
                            model: {
                                state: that._state,
                                timeRange: timeRangeModel,
                                user: userModel,
                                appLocal: appLocalModel,
                                application: appModel
                            },
                            collection: timesCollection
                        });
                    }
                
                    // We don't register the change handler on the internal 
                    // state until we're done creating the timepicker
                    that._state.on(
                        "change:dispatch.earliest_time change:dispatch.latest_time", 
                        _.debounce(that._onTimeRangeChange), 
                        that
                    );
                });
                    
                // Whenever the times collection changes and/or the preset changes,
                // we update the timepicker
                this._timesCollection.on("change reset", this._onTimePresetUpdate, this);
                this.settings.on("change:preset", this._onTimePresetUpdate, this);
                
                // Update view if model changes
                this.settings.on("change:value", function(model, value, options) {
                    that.val(value || {earliest_time: '', latest_time: ''});
                });
                
                // Update model if view changes
                this.on("change", function(value) {
                    that.settings.set("value", value);
                });
                
                this.bindToComponent(this.settings.get("managerid"), this._onManagerChange, this);
            },
            
            _onTimePresetUpdate: function() {
                var preset = this.settings.get("preset");
                if (!preset) {
                    return;
                }
                
                // We can only look at the times collection when it has finished
                // fetching
                var that = this;
                $.when(this._pickerDfd).done(function() {
                    var timeModel = that._timesCollection.find(function(model) {
                        return model.entry.content.get("label") === preset;
                    });
                    
                    if (!timeModel) {
                        return;
                    }
                    
                    that.val({
                        earliest_time: timeModel.entry.content.get('earliest_time'),
                        latest_time: timeModel.entry.content.get('latest_time')
                    });
                });
            },
            
            _onManagerChange: function(managers, manager) {
                if (this.manager) {
                    this.manager.off(null, null, this);
                    this.manager = null;
                }

                this.manager = manager;
                if (manager.search) {
                    this.listenTo(
                        manager.search, 
                        "change:earliest_time change:latest_time", 
                        _.debounce(this._onManagerTimeRangeChange)
                    );
                    
                    this._onManagerTimeRangeChange();
                }
            },
            
            _onManagerTimeRangeChange: function() {
                // Get the current time range                
                var timeRange = this.val();
                
                // The manager's time range, if it has one, overrides the timepicker's
                // current range.
                timeRange.earliest_time = this.manager.search.get("earliest_time") || timeRange.earliest_time;
                timeRange.latest_time = this.manager.search.get("latest_time") || timeRange.latest_time;
                
                // Set it back
                this._setTimeRange(timeRange);
            },
            
            _onTimeRangeChange: function(model, value, options) {
                if (!options || (options && !options._self)) {
                    this.trigger("change", this._getTimeRange(), this);
                }
            },
            
            render: function() {
                var that = this;
                $.when(this._pickerDfd).done(function() {
                    that.timepicker.render();
                    that.$el.append(that.timepicker.el);
                    
                    // Ensure we have the right time preset set
                    that._onTimePresetUpdate();
                });
                                
                return this;
            },
            
            val: function(newValue) {
                if (newValue !== undefined) {
                    var oldValue = this.val();
                    
                    this._setTimeRange(newValue);
                    var realNewValue = this.val();
                    
                    // Trigger change event manually since programmatic DOM
                    // manipulations don't trigger events automatically.
                    if (!_.isEqual(realNewValue, oldValue)) {
                        this.trigger('change', realNewValue);
                    }
                }
                else {
                    return this._getTimeRange();
                }
            },
            
            _setTimeRange: function(value) {
                this._state.set({
                    "dispatch.earliest_time": value.earliest_time,
                    "dispatch.latest_time": value.latest_time 
                }, { _self: true });
            },
            
            _getTimeRange: function() {
                return {
                    "earliest_time": this._state.get("dispatch.earliest_time"),
                    "latest_time": this._state.get("dispatch.latest_time")
                };
            }
        }
    );
    
    return TimePickerView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*!\n * Splunk shoestrap\n * import and override bootstrap vars & mixins\n */\n.clearfix {\n  *zoom: 1;\n}\n.clearfix:before,\n.clearfix:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.clearfix:after {\n  clear: both;\n}\n.hide-text {\n  font: 0/0 a;\n  color: transparent;\n  text-shadow: none;\n  background-color: transparent;\n  border: 0;\n}\n.input-block-level {\n  display: block;\n  width: 100%;\n  min-height: 26px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ie7-force-layout {\n  *min-width: 0;\n}\n/* time range picker dialog\n\n\tFIXME: markup missing\n\n*/\n.shared-timerangepicker-dialog {\n  width: 640px;\n}\n.shared-timerangepicker-dialog td {\n  vertical-align: top;\n}\n.timeRangeMenu,\n.trpCustomDateTime {\n  display: none;\n}\n.help-block-timestamp {\n  min-height: 1em;\n  line-height: 1em;\n  padding: 3px;\n  margin-top: 5px;\n  margin-right: 15px;\n  border-radius: 3px;\n  background-color: #eeeeee;\n}\n.timerangepicker-range-type {\n  margin-right: 25px;\n  float: left;\n}\n.timerangepicker-range-type .btn {\n  min-width: 65px;\n}\ninput.timerangepicker-earliest-date {\n  margin-right: 0;\n}\ninput.timerangepicker-real-time-earliest-time,\ninput.timerangepicker-relative-earliest-time {\n  margin-right: 0;\n}\n.timerangepicker-realtime_range_type,\n.timerangepicker-relative_range_type {\n  display: inline-block;\n  vertical-align: middle;\n  margin-right: 25px;\n}\n.shared-timerangepicker-dialog-daterange-betweendates > tr:first-child > td {\n  padding-bottom: 0;\n}\n.shared-timerangepicker-dialog-daterange-betweendates > tr:first-child > td > .alerts {\n  margin-top: 0;\n}\n.form-inline .radio {\n  line-height: 18px;\n  padding-top: 5px;\n  padding-bottom: 5px;\n  display: block;\n}\n.form-inline .radio + .radio {\n  padding-top: 0;\n}\ninput.date-before-time {\n  margin-right: 5px;\n}\n.advanced-time-documentation {\n  clear: left;\n  margin: 10px 0 0 55px;\n  display: block;\n  float: left;\n}\n/* Presets */\n.presets-group {\n  float: left;\n  width: 130px;\n}\n.presets-group + .presets-group {\n  margin-left: 10px;\n}\n.presets-divider-wrap {\n  float: left;\n  margin: 10px;\n}\n.presets-divider {\n  position: absolute;\n  top: 10px;\n  bottom: 10px;\n  border-right: 1px solid #cccccc;\n}\n.presets-group li {\n  color: #999999;\n  padding-left: 20px;\n  text-indent: -20px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 