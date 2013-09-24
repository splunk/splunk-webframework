
// 

define('splunkjs/mvc/dataview',['require','exports','module','underscore','./mvc','./basesplunkview','./messages'],function(require, exports, module) {
    var _ = require('underscore');
    var mvc = require('./mvc');
    var BaseSplunkView = require("./basesplunkview");
    var Messages = require("./messages");
    
    var DataView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-dataview",

        options: {
            managerid: null,
            data: "preview",
            template: "",
            templateName: "",
            messages: false
        },

        initialize: function() {
            this.configure();
            this.settings.on("change:template", this.render, this);
            
            this.bindToComponentSetting('managerid', this._onManagerChange, this);
            
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
                this.resultsModel.destroy();
                this.resultsModel = null;
            }

            if (!manager) {
                this.message('no-search');
                return;
            }
            
            // Clear any messages, since we have a new manager.
            this.message("empty");

            this.manager = manager;            
            this.resultsModel = manager.data(this.settings.get("data"), {
                output_mode: "json"
            });

            manager.on("search:start", this._onSearchStart, this);
            manager.on("search:progress", this._onSearchProgress, this);
            manager.on("search:cancelled", this._onSearchCancelled, this);
            manager.on("search:error", this._onSearchError, this);
            this.resultsModel.on("data", this.render, this);
            this.resultsModel.on("error", this._onSearchError, this);
            
            manager.replayLastSearchEvent(this);
        },

        _onSearchCancelled: function() {
            this._isJobDone = false;
            this.message('cancelled', this.$el);
        },

        _onSearchProgress: function(properties, job) { 
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = this._isJobDone = content.isDone || false;

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
            this._isJobDone = false;
            this.message('waiting', this.$el);
        },
            
        _onSearchError: function(message, err) {
            this._isJobDone = false;
            var msg = message;
            if(err && err.data && err.data.messages && err.data.messages.length) {
                msg = _(err.data.messages).pluck('text').join('; ');
            }
            this.message({
                level: "error",
                icon: "warning-sign",
                message: msg
            });
        },
        
        message: function(info) {
            if (this.settings.get("messages")) {
                Messages.render(info, this.$el);
            }
        },

        render: function() {
            if (this.resultsModel) {
                if (!this.resultsModel.hasData() && this._isJobDone) {
                    this.message("no-results");
                    return this;
                }
            }
            if (!this.resultsModel) {
                return this;
            }

            var template = this.settings.get("template") || "";
            var templateName = this.settings.get("templateName") || "";

            if (!template && templateName) {
                if ($('#' + templateName).length > 0) {
                    template = $('#' + templateName).html();
                }
            }
            
            if (!template) {
                this.message({
                    level: "error",
                    icon: "warning-sign",
                    message: "There is no template to render."
                });
                return;
            }
            
            var html = _.template(template, this.resultsModel.data());
            this.$el.html(html);

            return this;
        }
    });
    
    return DataView;
});
