
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
            
            this.bindToComponent(this.settings.get("managerid"), this._onManagerChange, this);
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

            this.manager = manager;            
            this.resultsModel = manager.data(this.settings.get("data"), {
                output_mode: "json"
            });

            manager.on("search:start", this._onSearchStart, this);
            manager.on("search:progress", this._onSearchProgress, this);
            manager.on("search:cancelled", this._onSearchCancelled, this);
            this.resultsModel.on("data", this.render, this);
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
            if (!this.resultsModel || !this.resultsModel.hasData())
                return this;

            var template = this.settings.get("template") || "";
            var templateName = this.settings.get("templateName") || "";

            if (!template) {
                if ($('#' + templateName).length > 0) {
                    template = $('#' + templateName).html();
                }
            }

            var html = _.template(template, this.resultsModel.data());
            this.$el.html(html);

            return this;
        }
    });
    
    return DataView;
});
