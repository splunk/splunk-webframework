// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var AppFx = require('splunkui');
    var BaseControl = require("./basecontrol");
    var Messages = require("./messages");
    
    var DataView = BaseControl.extend({
        className: "appfx-dataview",

        options: {
            contextid: null,
            datasource: "preview",
            template: "",
            messages: false
        },

        initialize: function() {
            this.configure();
            this.settings.on("change:template", this.render, this);
            
            this.bindToComponent(this.settings.get("contextid"), this._onContextChange, this);
        },

        _onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }
            if (this.datasource) {
                this.datasource.off(null, null, this);
                this.datasource.destroy();
                this.datasource = null;
            }

            if (!context) {
                this.message('no-search');
                return;
            }

            this.context = context;            
            this.datasource = context.data(this.settings.get("datasource"), {
                output_mode: "json"
            });
            context.on("search:start", this._onSearchStart, this);
            context.on("search:progress", this._onSearchProgress, this);
            context.on("search:cancelled", this._onSearchCancelled, this);
            this.datasource.on("data", this.render, this);
        },

        _onSearchCancelled: function() { 
            this.message('cancelled', this.$el);
        },

        _onSearchProgress: function(properties, job) { 
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = content.isDone || false;

            if (previewCount === 0 && isJobDone) {
                this.message('no-results', this.$el);
                return;
            }
            
            if (previewCount === 0) {
                this.message('waiting', this.$el);
                return;
            }
        },
        
        _onSearchStart: function() { 
            this.message('waiting', this.$el);
        },
        
        message: function(info) {
            if (this.settings.get("messages"))
                Messages.render(info, this.$el);
        },

        render: function() {
            if (!this.datasource || !this.datasource.hasData())
                return this;

            var template = this.settings.get("template") || "";
            var html = _.template(template, this.datasource.data());
            this.$el.html(html);

            return this;
        }
    });
    
    AppFx.Components.registerType('appfx-dataview', DataView);
    
    return DataView;
});