// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var AppFx = require("appfx.main");
    var BaseControl = require("appfx/splunkui/basecontrol");
    var _ = require("underscore");

    require("css!appfx/splunkui/single.css");

    //
    // options:
    //   * afterLabel
    //   * beforeLabel
    //   * field
    //   * classField
    //
    // UNDONE:
    //   * additionalClass
    //   * linkView
    //   * linkFields = result | beforeLabel | afterLabel
    //
    var Single = BaseControl.extend({
        className: "appfx-single",

        options: {
            contextid: null,
            datasource: "preview",
            field: "",
            beforeLabel: "",
            afterLabel: "",
            classField: ""
        },
            
        initialize: function() {
            this.configure();
            this.settings.on(
                "change:field change:beforeLabel change:afterLabel change:classField",
                _.debounce(this.render), this);
            
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

            if (!context) 
                return;

            this.context = context;
            this.datasource = context.data(this.settings.get("datasource"), {
                count: 1, 
                offset: 0
            });
            this.datasource.on("data", this.render, this);
        },

        render: function() {
            this.$el.empty();

            var content = $("<span>")
                .addClass("appfx-single-content")
                .appendTo(this.$el);
                
            var value = "...";
            var classField = "";
            if (this.datasource && this.datasource.hasData()) {
                // Display the designated field from the first row of the result.
                var data = this.datasource.collection();
                var record = data.at(0);
                var field = this.settings.get("field");
                if (!field) field = data.raw.fields[0];
                value = record.get(field);
                
                classField = this.settings.get("classField");
            }

            if (classField) 
                content.addClass(record.get(classField));

            var beforeLabel = this.settings.get("beforeLabel");
            if (beforeLabel) {
                $("<span>")
                    .addClass("appfx-single-label")
                    .addClass("appfx-single-label-before")
                    .html(beforeLabel)
                    .appendTo(content);
            }

            $("<span>")
                .addClass("appfx-single-result")
                .html(value)
                .appendTo(content);

            var afterLabel = this.settings.get("afterLabel");
            if (afterLabel) {
                $("<span>")
                    .addClass("appfx-single-label)")
                    .addClass("appfx-single-label-after")
                    .html(afterLabel)
                    .appendTo(content);
            }

            return this;
        }
    });
    
    AppFx.Components.registerType('appfx-single', Single);
    
    return Single;
});
