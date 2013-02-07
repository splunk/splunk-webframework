define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('splunkui');
    var BaseControl = require("./basecontrol");

    require("css!./timepicker");

    TIME_PRESETS = {
        'rt-30s'      : { earliest_time: 'rt-30s', latest_time: 'rt' },
        'rt-1m'       : { earliest_time: 'rt-1m', latest_time: 'rt' },
        'rt-5m'       : { earliest_time: 'rt-5m', latest_time: 'rt' },
        'rt-30m'      : { earliest_time: 'rt-30m', latest_time: 'rt' },
        'rt-1h'       : { earliest_time: 'rt-1h', latest_time: 'rt' },
        'rt'          : { earliest_time: 'rt', latest_time: 'rt' },
        'today'       : { earliest_time: '@d', latest_time: 'now' },
        'week'        : { earliest_time: '@w0', latest_time: 'now' },
        'bizweek'     : { earliest_time: '@w1', latest_time: 'now' },
        'month'       : { earliest_time: '@mon', latest_time: 'now' },
        'year'        : { earliest_time: '@y', latest_time: 'now' },
        'yesterday'   : { earliest_time: '-1d@d', latest_time: '@d' },
        'prev-week'   : { earliest_time: '-7d@w0', latest_time: '@w0' },
        'prev-bizweek': { earliest_time: '-6d@w1', latest_time: '-1d@w6' },
        'prev-month'  : { earliest_time: '-1mon@mon', latest_time: '@mon' },
        'prev-year'   : { earliest_time: '-1y@y', latest_time: '@y' },
        'ht-15m'      : { earliest_time: '-15m@m', latest_time: 'now' },
        'ht-60m'      : { earliest_time: '-60m@m', latest_time: 'now' },
        'ht-4h'       : { earliest_time: '-4h@m', latest_time: 'now' },
        'ht-24h'      : { earliest_time: '-24h@h', latest_time: 'now' },
        'ht-7d'       : { earliest_time: '-7d@d', latest_time: 'now' },
        'ht-30d'      : { earliest_time: '-30d@d', latest_time: 'now' },
        'alltime'     : { earliest_time: null, latest_time: null }
    };
    
    LABEL_PRESETS = {
        'rt-30s'      : '30 Second Window',
        'rt-1m'       : '1 Minute Window',
        'rt-5m'       : '5 Minute Window',
        'rt-30m'      : '30 Minute Window',
        'rt-1h'       : '1 Hour Window',
        'rt'          : 'All Time (Real-time)',
        'today'       : 'Today',
        'week'        : 'Week to date',
        'bizweek'     : 'Business week to date',
        'month'       : 'Month to date',
        'year'        : 'Year to date',
        'yesterday'   : 'Yesterday',
        'prev-week'   : 'Previous Week',
        'prev-bizweek': 'Previous Business Week',
        'prev-month'  : 'Previous Month',
        'prev-year'   : 'Previous Year',
        'ht-15m'      : 'Last 15 minutes',
        'ht-60m'      : 'Last 60 minutes',
        'ht-4h'       : 'Last 4 hours',
        'ht-24h'      : 'Last 24 hours',
        'ht-7d'       : 'Last 7 days',
        'ht-30d'      : 'Last 30 days',
        'alltime'     : 'All Time',
        'custom'      : 'Custom'
    };
    
    var TimePicker = BaseControl.extend(
        // Instance
        {
            className: "appfx-timepicker",

            events: {
                "click a[data-preset]": "onPresetClicked"
            },

            options: {
                contextid: null,
                preset: "alltime"
            },
        
            initialize: function() {
                this.configure();
                this.settings.on("change:preset", this.onPresetChange, this);
                
                this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
            },
            
            onContextChange: function(contexts, context) {
                if (this.context) {
                    this.context.off(null, null, this);
                    this.context = null;
                }

                if (!context)
                    return;
                
                this.context = context;
                this.context.on("search:timerange", this.onTimeRangeChanged, this);
                this.updateContextPreset();
            },

            onPresetChange: function() {
                this.updateContextPreset();
                this.render();
            },

            onPresetClicked: function(e) {
                e.preventDefault();
                
                var preset = $(e.currentTarget).attr("data-preset");
                this.settings.set({preset: preset});
            },

            onTimeRangeChanged: function(range, preset) {
                this.render();
            },
            
            render: function() {
                var preset = this.settings.get("preset");
                this.$el.html(_.template(TimePicker.template, {
                    label: LABEL_PRESETS[preset]
                }));
                return this;
            },
            
            // Update the time preset on the current search context.
            updateContextPreset: function() {
                if (!this.context)
                    return;

                var preset = this.settings.get("preset");
                if (!preset)
                    return;

                var timeRange = TIME_PRESETS[preset] || {};

                // this.context.search.set(timeRange, {silent: true});
                this.context.search.set(timeRange, {silent: false});
            }
        },
        // Class
        {
            template:' \
<div class="search-timerange"> \
  <div class="btn-group"> \
      <a href="" class="btn btn-primary dropdown-toggle" data-toggle="dropdown"> \
          <%= label %> \
          <b class="caret"></b> \
      </a> \
      <ul class="dropdown-menu pull-right"> \
        <li><a href="#" data-preset="ht-15m">Last 15 minutes</a></li> \
        <li><a href="#" data-preset="ht-60m">Last 60 minutes</a></li> \
        <li><a href="#" data-preset="ht-4h">Last 4 hours</a></li> \
        <li><a href="#" data-preset="ht-24h">Last 24 hours</a></li> \
        <li><a href="#" data-preset="ht-7d">Last 7 days</a></li> \
        <li><a href="#" data-preset="ht-30d">Last 30 days</a></li> \
        <li class="dropdown-submenu pull-left"> \
          <a href="#">Real-time</a> \
          <ul class="dropdown-menu"> \
            <li><a href="#" data-preset="rt-30s">30 second window</a></li> \
            <li><a href="#" data-preset="rt-1m">1 minute window</a></li> \
            <li><a href="#" data-preset="rt-5m">5 minute window</a></li> \
            <li><a href="#" data-preset="rt-30m">30 minute window</a></li> \
            <li><a href="#" data-preset="rt-1h">1 hour window</a></li> \
            <li><a href="#" data-preset="rt">All Time (Real-time)</a></li> \
          </ul> \
        </li> \
        <li class="dropdown-submenu pull-left"> \
          <a href="#">Other</a> \
          <ul class="dropdown-menu"> \
            <li><a href="#" data-preset="today">Today</a></li> \
            <li><a href="#" data-preset="week">Week to date</a></li> \
            <li><a href="#" data-preset="bizweek">Business week to date</a></li> \
            <li><a href="#" data-preset="month">Month to date</a></li> \
            <li><a href="#" data-preset="year">Year to date</a></li> \
            <li><a href="#" data-preset="yesterday">Yesterday</a></li> \
            <li><a href="#" data-preset="prev-week">Previous week</a></li> \
            <li><a href="#" data-preset="prev-bizweek">Previous business week</a></li> \
            <li><a href="#" data-preset="prev-month">Previous month</a></li> \
            <li><a href="#" data-preset="prev-year">Previous year</a></li> \
          </ul> \
        </li> \
        <li><a href="#" data-preset="alltime">All time</a></li> \
        <li><a href="#">Custom time...</a></li> \
      </ul> \
  </div> \
</div>'
        }
    );
  
    AppFx.Components.registerType('appfx-timepicker', TimePicker);
    
    return TimePicker;
});
