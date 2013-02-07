require.config({
    shim: {
        "appfx/contrib/spin": {
            deps: [],
            exports: "Spinner"
        },
    }
});

define(function(require, exports, module) {
    var _ = require('underscore');
    var AppFx = require('splunkui');
    var BaseControl = require("./basecontrol");
    var Spinner = require('appfx/contrib/spin');

    require("css!./jobstatus.css");
    
    var JobStatus = BaseControl.extend(
        {
            className: "appfx-jobstatus",
            
            options: {
                contextid: null
            },
            
            initialize: function() {                
                this.configure();

                var opts = {
                    lines: 13, // The number of lines to draw
                    length: 2, // The length of each line
                    width: 2, // The line thickness
                    radius: 3, // The radius of the inner circle
                    rotate: 0, // The rotation offset
                    color: '#000', // #rgb or #rrggbb
                    speed: 1, // Rounds per second
                    trail: 51, // Afterglow percentage
                    shadow: false, // Whether to render a shadow
                    hwaccel: false, // Whether to use hardware acceleration
                    className: 'spinner', // The CSS class to assign to the spinner
                    zIndex: 2e9, // The z-index (defaults to 2000000000)
                };
                this.spinner = new Spinner(opts).spin();
                
                this.status = { 
                    actions: [], 
                    disabled: "disabled", 
                    currentState: "", 
                    percentageProgress: "" 
                };
                
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
                this.context.on("search:start", this.onSearchStart, this);
                this.context.on("search:progress", this.onSearchProgress, this);
                this.context.on("search:fail", this.onSearchFail, this);
                this.context.on("search:cancelled", this.onSearchCancelled, this);  
            },
            
            render: function() {
                // Only render as a result of an event callback                  
                this.$el.html(_.template(JobStatus.template, this.status));
                
                if (this.status.spinner) {
                    $(this.spinner.el).appendTo(this.$(".spinner-container"));
                }
                
                return this;
            },
            
            events: {
            },
            
            states: {
                "PAUSED": "Paused",
                "FINALIZING": "Finalizing",
                "DONE": "Complete"
            },
            
            onSearchStart: function(properties) {
                this.status = { actions: [], disabled: "disabled", currentState: "", percentageProgress: "" };
                this.render();
            },
            
            onSearchFail: function(properties) {                
                this.status = { actions: [], disabled: "disabled", currentState: "", percentageProgress: "" };
                this.render();
            },
            
            onSearchProgress: function(properties) {
                var content = properties.content || {};
                var status = {};
                
                status.percentageProgress = Math.floor(content.doneProgress * 100) + "%";
                status.currentState = this.states[content.dispatchState] || status.percentageProgress;
                status.disabled = "";
                
                var actions = status.actions = [];
                switch(content.dispatchState) {
                    case "PAUSED": {
                        actions.push("play");
                        actions.push("stop");
                        status.spinner = true;
                        break;
                    }
                    case "FINALIZING": {
                        actions.push("cancel");
                        status.percentageProgress = "0%";
                        status.spinner = true;
                        break;
                    }
                    case "DONE": {
                        actions.push("rotate");
                        status.percentageProgress = "0%";
                        break;
                    }
                    case "FAILED": {
                        // do nothing
                        break;
                    }
                    case "QUEUEING":
                    case "RUNNING":
                    case "PARSING": {
                        actions.push("pause");
                        actions.push("stop");
                        status.spinner = true;
                        break;
                    }
                }
                
                this.status = status;
                this.render();
            },
            
            onSearchCancelled: function() {
                this.status = { actions: [], disabled: "disabled", currentState: "", percentageProgress: "" };
                this.render();
            },
            
        },
        // Class
        {
            template: ' \
<div class="job-bar splunk"> \
    <div class="btn-group control-main"> \
        <button href="#" class="btn btn-mini <%= disabled %>">Job \
            <div class="spinner-container" style="display: inline-block;"></div> \
        </button> \
        <div class="progress progress-striped active"> \
          <div class="bar" style="width: <%= percentageProgress %>;"> \
            <span style="padding-left: 10px;"><%= currentState %></span> \
          </div> \
        </div> \
        <% for(var i = 0; i < actions.length; i++) { var action = actions[i]; %> \
            <button href="#" class="btn btn-mini" data-action="<%= action %>"><i class="icon-<%= action %>"></i></button> \
        <% } %> \
    </div> \
</div>'
        }
    );

    AppFx.Components.registerType('appfx-jobstatus', JobStatus);
    
    return JobStatus;
});
