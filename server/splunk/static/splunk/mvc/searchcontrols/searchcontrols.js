require.config({
    shim: {
        "splunk/contrib/spin": {
            deps: [],
            exports: "Spinner"
        },
    }
});

define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('splunkjs.mvc');
    var BaseControl = require("../basecontrol");
    var Spinner = require('splunk/contrib/spin');

    require("css!./searchcontrols.css");
    
    var SearchControls = BaseControl.extend(
        // Instance
        {
            className: "appfx-searchcontrols",
            
            options: {
                contextid: null
            },
            
            initialize: function() {
                this.configure();
                
                var opts = {
                    lines: 13, // The number of lines to draw
                    length: 2, // The length of each line
                    width: 2, // The line thickness
                    radius: 4, // The radius of the inner circle
                    rotate: 0, // The rotation offset
                    color: '#000', // #rgb or #rrggbb
                    speed: 1, // Rounds per second
                    trail: 51, // Afterglow percentage
                    shadow: false, // Whether to render a shadow
                    hwaccel: false, // Whether to use hardware acceleration
                    className: 'spinner', // The CSS class to assign to the spinner
                    zIndex: 2e9, // The z-index (defaults to 2000000000)
                    top: '66%', // Top position relative to parent in px
                    left: '50%' // Left position relative to parent in px
                };
                var spinner = new Spinner(opts).spin();
                this.spinner = spinner;
                this.searchMode = "smart";
                
                this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
            },
            
            onContextChange: function(contexts, context) {
                if (this.context) {
                    this.context.off(null, null, this);
                    this.context.search.off(null, null, this);
                }
                
                this.context = context;

                if (context) {
                    context.on("search:start", this.onSearchStart, this);
                    context.on("search:progress", this.onSearchProgress, this);
                    context.on("search:fail", this.onSearchFail, this);
                    context.on("search:cancelled", this.onSearchCancelled, this);  
                    context.search.on("change:adhoc_search_level", this.onSearchModeChange, this);
                
                    if (!context.search.has("adhoc_search_level")) {
                        context.search.set("adhoc_search_level", this.searchMode, {silent: true});
                    }
                }
            },
            
            render: function() {
                // Only render as a result of an event callback                  
                this.$el.html(_.template(SearchControls.template, {
                    job: this.jobProperties,
                    searchMode: this.searchMode
                }));
                
                if (this.jobProperties) {
                    $(this.spinner.el).appendTo(this.$(".spinner-container"));
                }                
                
                return this;
            },
            
            events: {
                "click .control-main > a.btn:not(.disabled)": "onControlButtonClicked",
                "click .control-bunny ul li a": "onBunnyButtonClicked"
            },
            
            onControlButtonClicked: function(e) {                
                e.stopPropagation();
                e.preventDefault();
                
                if (!this.context) {
                    return;
                }
                
                var controlMethod = $(e.currentTarget).find("i.ir").attr("data-control").trim();
                
                if (this.context[controlMethod]) {
                    this.context[controlMethod]();
                }
            },
            
            onBunnyButtonClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                if (!this.context) {
                    return;
                }
                
                var controlMethod = this.searchMode = $(e.currentTarget).attr("data-control").trim();
                
                this.context.search.set("adhoc_search_level", controlMethod);
            },
            
            onSearchStart: function(properties) {
                this.jobProperties = null;
            },
            
            onSearchFail: function(properties) {
                this.jobProperties = properties.content || {};
                this.render();
            },
            
            onSearchProgress: function(properties) {
                this.jobProperties = properties.content || {};
                this.render();
            },
            
            onSearchCancelled: function() {
                this.jobProperties = null;
                this.render();
            },
            
            onSearchModeChange: function() {
                if (!this.context) {
                    return;
                }
                
                this.searchMode = this.context.search.get("adhoc_search_level") || "smart";
                this.render();
            },
        },
        // Class
        {
            template:' \
<div class="search-controls clearfix"> \
    <% if (job) { %> \
    <div class="btn-toolbar pull-left"> \
        <div class="status"> \
            <% if (!job.isDone && job.isPaused) { %> \
                <i class="icon-pause"></i> \
            <% } else if (job.isDone) { %> \
                <i class="icon-check"></i> \
            <% } else if (!job.isDone) { %> \
                <div class="spinner-container"></div> \
            <% } %> \
            <span class="number"><%= job.eventCount %></span> matched \
        </div> \
    </div> \
    <% } %> \
    <div class="btn-toolbar pull-right"> \
        <% if (job) { %> \
        <div class="status pull-left"> \
            <span class="number"><%= job.scanCount %></span> scanned \
        </div> \
        <div class="btn-group control-main"> \
            <a href="#" class="btn"> \
                <% if(!job.isDone && !job.isFinalized) { %><i data-control="finalize" class="ir icon-stop">stop</i><% } %> \
                <% if(job.isDone || job.isFinalized) { %><i data-control="cancel" class="ir icon-cancel">cancel</i><% } %> \
            </a> \
            <a href="#" class="btn <% if(job.isDone) print("disabled") %>"> \
                <% if(job.isPaused) { %><i data-control="unpause" class="ir icon-play">play</i><% } %> \
                <% if(!job.isPaused) { %><i data-control="pause" class="ir icon-pause">pause</i><% } %> \
            </a> \
            <div class="btn-combo"> \
                <a href="#" data-toggle="dropdown" class="btn dropdown-toggle"> \
                  <i class="ir icon-gear">action</i> \
                  <span class="caret"></span> \
                </a> \
                <ul class="dropdown-menu control-extra"> \
                  <li><a href="#"><i class="icon-blank"></i>Send Job to Background</a></li> \
                  <li><a href="#"><i class="icon-blank"></i>Inspect Job</a></li> \
                  <li><a href="#"><i class="icon-blank"></i>Delete Job</a></li> \
                  <li class="divider"></li> \
                  <li><a href="#"><i class="icon-blank"></i>Share Job</a></li> \
                  <li> \
                    <a href="#"> \
                        <i class="icon-check"></i>Expire Automatically <span class="small light">(~1 day)</span> \
                    </a> \
                  </li> \
                </ul> \
            </div> \
        </div> \
        <% } %> \
        <div class="btn-group control-bunny"> \
            <a href="#" data-toggle="dropdown" class="btn dropdown-toggle"> \
              <i class="icon-bunny"></i> <span class="searchmode"><% print(searchMode.toUpperCase()) %> MODE</span> \
              <span class="caret"></span> \
            </a> \
            <ul class="dropdown-menu"> \
              <li><a data-control="fast" href="#"> \
                <i class="icon-<% print(searchMode==="fast" ? "check" : "blank") %>"></i>Fast Mode</a> \
              </li> \
              <li><a data-control="smart" href="#"> \
                <i class="icon-<% print(searchMode==="smart" ? "check" : "blank") %>"></i>Smart Mode</a> \
              </li> \
              <li><a data-control="verbose" href="#"> \
                <i class="icon-<% print(searchMode==="verbose" ? "check" : "blank") %>"></i>Verbose Mode</a> \
              </li> \
            </ul> \
        </div> \
    </div> \
</div>'
        }
    );

    splunkjs.mvc.Components.registerType('appfx-searchcontrols', SearchControls);
    
    return SearchControls;
});
