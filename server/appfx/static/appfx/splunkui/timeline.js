define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('splunkui');
    var BaseControl = require("./basecontrol");

    // Let's load the timeline script
    var timelinePrefix = AppFx.STATIC_PREFIX + "appfx/splunkjs/splunk.ui.timeline.min.js";
    var timelineToken = splunkjs.UI.loadTimeline(timelinePrefix);

    require("css!./timeline.css");
    
    var EPS = 0.001;
    var ZOOM_PRESETS = {
        "millisecond": 1 - EPS,
        "second": 1000,
        "minute": 60 * 1000,
        "hour": 60 * 60 * 1000,
        "day": 24 * 60 * 60 * 1000,
        "month": 31 * 24 * 60 * 60 * 1000,
        "year": 365 * 24 * 60 * 60 * 1000,
        "10year": 10 * 365 * 24 * 60 * 60 * 1000
    };
    
    var Timeline = BaseControl.extend(
        // Instance
        {
            className: "appfx-timeline",

            options: {
                contextid: null,
                datasource: "timeline"
            },
            
            initialize: function() {
                this.configure();
                
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

                if (!context) 
                    return;

                this.context = context;
                this.datasource = this.context.data(this.settings.get("datasource"), {
                    condition: function(context) {
                        var content = context.get("data");
                        var statusBuckets = content.statusBuckets;
                        var eventCount = content.eventCount;
                        
                        return statusBuckets > 0 && eventCount > 0;
                    }
                });
                context.on("search:start", this.onSearchStart, this);
                context.on("search:progress", this.onSearchProgress, this);
                context.on("search:cancelled", this.onSearchCancelled, this);
                this.datasource.on("data", this.onTimelineUpdated, this);
            },
            
            render: function() {
                this.$el.html(_.template(Timeline.template));
                
                if (this.timeline) {
                    this.timeline.timeline.remove();
                    this.timeline = null;
                }
                this.createNewTimeline();

                return this;
            },
            
            clearTimeline: function() {
                // Clear the timeline by setting everything to 0
                if (this.timeline) {
                    this.timeline.updateWithJSON({buckets:[], event_count: 0, cursor_time: 0});
                }
            },
            
            disableControls: function() {
                this.$("a.timeline-control:not([data-control='zoomout'])")
                    .addClass("disabled");
            },
            
            enableControls: function() {
                this.$("a.timeline-control:not([data-control='zoomout'])")
                    .removeClass("disabled");
            },
            
            onSelectionChanged: function() {
                this.enableControls();
            },
            
            createNewTimeline: function() {                
                var that = this;
                splunkjs.UI.ready(timelineToken, function() {
                    if (that.timeline) {
                        // If we alread have a timeline, just return,
                        // as we don't want to create another one.
                        return;
                    }
                    
                    var timelineContainer = that.$(".timeline-container");
                    that.timeline = new splunkjs.UI.Timeline.Timeline(timelineContainer);
                    
                    that.timeline.timeline.addEventListener('selectionChanged', function(e) {
                        that.onSelectionChanged(e);
                    });
                    
                    that.updateTimeline();
                });
            },
            
            updateTimeline: function() {
                if (!this.timelineData || !this.timeline) {
                    return;
                }

                var data = this.timelineData;
                this.timeline.updateWithJSON(data);
                
                var scale = this.timeline.timeline.getTimelineScale();
                if (scale) {
                    var formatNumber = this.timeline.timeline.externalInterface.formatNumericString;
                    var scaleText = formatNumber(
                        "1 bar = %s " + scale.unit, 
                        "1 bar = %s " + scale.unit + "s", scale.value
                    );
                    this.$(".timeline-scale").text(scaleText);
                }
                
                var earliest = this.timeline.timeline.getActualSelectionMinimum();
                var latest = this.timeline.timeline.getActualSelectionMaximum();
                var delta = (latest - earliest) * 1000;
                var canZoomOut = delta < ZOOM_PRESETS["10year"];
                
                var zoomOutControl = this.$("a.timeline-control[data-control='zoomout']");
                if (canZoomOut) {
                    zoomOutControl.removeClass("disabled");
                }
                else {
                    zoomOutControl.addClass("disabled");
                }
            },
            
            onTimelineUpdated: function() {
                this.timelineData = this.datasource.data();
                this.updateTimeline();  
            },
            
            onSearchProgress: function(properties, job) {
                return;
            },
            
            onSearchStart: function() {
                this.clearTimeline();
            },
            
            onSearchCancelled: function() {
                this.clearTimeline();
            },
            
            events: {
                "click a.timeline-control:not(.disabled)": "onTimelineControlClicked"
            },
            
            onTimelineControlClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                this.disableControls();
                
                var control = $(e.currentTarget).attr("data-control");
                switch(control) {
                    case "zoomout": {
                        var time = {};
                        
                        var earliest = this.timeline.timeline.getActualSelectionMinimum();
                        var latest = this.timeline.timeline.getActualSelectionMaximum();
                        var delta = (latest - earliest) * 1000;
                        
                        if (delta >= ZOOM_PRESETS["10year"]) {
                            // do nothing, we don't zoom past 10 years
                            break;
                        }
                        else if (delta >= ZOOM_PRESETS["year"]) {
                            time.earliest_time = "-9y@y";
                            time.latest_time = "+y@y";
                        }
                        else if (delta >= ZOOM_PRESETS["month"]) {
                            time.earliest_time = "@y";
                            time.latest_time = "+y@y";
                        }
                        else if (delta >= ZOOM_PRESETS["day"]) {
                            time.earliest_time = "@mon";
                            time.latest_time = "+mon@mon";
                        }
                        else if (delta >= ZOOM_PRESETS["hour"]) {
                            time.earliest_time = "@d";
                            time.latest_time = "+d@d";
                        }
                        else if (delta >= ZOOM_PRESETS["minute"]) {
                            time.earliest_time = "@h";
                            time.latest_time = "+h@h";
                        }
                        else if (delta >= ZOOM_PRESETS["second"]) {
                            time.earliest_time = "@m";
                            time.latest_time = "+m@m";
                        }
                        else if (delta >= ZOOM_PRESETS["millisecond"]) {
                            time.earliest_time = "@s";
                            time.latest_time = "+s@s";
                        }
                        
                        if (this.context) {
                            this.context.search.set(time);
                            this.context.trigger("search:timerange", time, "custom");
                        }
                        
                        break;
                    }
                    case "zoomtoselection": {
                        var selection = {
                              earliest_time: this.timeline.timeline.getActualSelectionMinimum(),
                              latest_time: this.timeline.timeline.getActualSelectionMaximum()
                        };
                        
                        // Clear the selection
                        this.timeline.timeline.setSelectionMinimum(NaN);
                        this.timeline.timeline.setSelectionMaximum(NaN);
                        
                        // Trigger the event
                        if (this.context) {
                            this.context.search.set(selection);
                            this.context.trigger("search:timerange", selection, "custom");
                        }
                        break;
                    }
                    case "deselect": {
                        this.timeline.timeline.setSelectionMinimum(NaN);
                        this.timeline.timeline.setSelectionMaximum(NaN);
                        break;
                    }
                }
            }
        },
        // Class
        {
            template:' \
<div class="timeline-wrapper"> \
    <div class="timeline-controls"> \
        <a class="timeline-control pull-left" href="#" data-control="zoomout"> \
            <span class="font-icon">⊕</span> Zoom out \
        </a> \
        <a class="timeline-control pull-left disabled" href="#" data-control="zoomtoselection"> \
            <span class="font-icon">⊖</span> Zoom to selection \
        </a> \
        <a class="timeline-control pull-left disabled" href="#" data-control="deselect"> \
            <span class="font-icon">⊗</span> Deselect \
        </a> \
        <div class="timeline-scale pull-right"></div> \
    </div> \
    <div class="timeline-container clearfix"> \
    </div> \
</div>'
        }
    );
    
    AppFx.Components.registerType('appfx-timeline', Timeline);
    
    return Timeline;
});
