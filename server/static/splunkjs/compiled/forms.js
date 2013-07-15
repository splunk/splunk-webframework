
// THIS FILE IS PURPOSEFULLY EMPTY FOR R.JS COMPILER
// LOOK IN $SPLUNK_SOURCE/cmake/splunkjs_build/run.js FOR MORE INFO;
define("splunkjs/compiled/forms", function(){});

define('splunkjs/mvc/baseinputview',['require','exports','module','underscore','jquery','./simplesplunkview'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var SimpleSplunkView = require("./simplesplunkview");

    /**
     * Private abstract base class for form input views.  Provides
     * a render() option that draws if static content is available
     * and there is no dynamic manager provided.
     */
    var BaseInputView = SimpleSplunkView.extend({
        output_mode: 'json',
        
        options: {
            disabled: false,
            managerid: null,
            data: "preview"
        },

        initialize: function(options) {
            SimpleSplunkView.prototype.initialize.apply(this, arguments);
            
            // The 'value' setting is always pushed
            this.settings.enablePush("value");
            
            // Initialize value with default, if provided
            var defaultValue = this.settings.get("default");
            if (defaultValue === undefined) {
                var supportsSeedSetting = _.contains(
                    _.keys(this.constructor.prototype.options), "seed");
                
                if (supportsSeedSetting) {
                    // The `seed` option has been deprecated and replaced by the
                    // `default` option, which is supported on all inputs. If a text
                    // input has both, the `default` wins.
                    defaultValue = this.settings.get("seed");
                }
            }
            if (defaultValue !== undefined &&
                this.settings.get('value') === undefined)
            {
                this.val(defaultValue);
            }
            
            this.settings.on("change:disabled", this._onDisable, this);
        },

        _onChange: function(e) {
            this.trigger("change", this);
        },

        _onDisable: function(e) {
            var state = this.settings.get("disabled");
            this.$('input').prop("disabled", state);
        },

        render: function() {
            this._updateView(this._viz, this._data || []);
            return this;
        },

        // Skip the empty data check.  Empty data is acceptable for
        // form objects.

        _updateView: function() {
            var data = this._data || [];
 
            if (!this._viz) {
                this._createView(data); 
            }

            if (!this._viz) {
                return; // Couldn't create the visualization
            }

            this.updateView(this._viz, data);
            this._onDisable();
        },

        createView: function() {
            // Must return true to tell view that a valid
            // visualization exists.
            return true;  
        },
        
        // Get or set the current inputs value.
        val: function(value, selector) {
            selector = selector || "input";
            var input = $(selector, this.$el);
            if (value) {
                return input.val(value);
            }
            return input.val();
        }
    });
    
    return BaseInputView;
});

define('splunkjs/mvc/checkboxview',['require','exports','module','underscore','jquery','./baseinputview'],function(require, exports, module) {

    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInputView = require("./baseinputview");

    /**
     * Displays a boolean checkbox.
     */
    var CheckboxView = BaseInputView.extend({
        moduleId: module.id,
        
        className: "splunk-checkbox",
        inputType: "checkbox", 

        options: {
            "default": undefined,
            value: undefined,
            disabled: false
        },

        events: {
            "change input:checkbox": "_onChange"
        },
        
        initialize: function() {
            this.options = _.extend({}, BaseInputView.prototype.options, this.options);
            BaseInputView.prototype.initialize.apply(this, arguments);
            
            // Update view if model changes.
            this.settings.on("change", this.render, this);
            
            // Update model if view changes.
            var that = this;
            this.on("change", function() {
                that.settings.set("value", this.val());
            });
        },

        createView: function() {
            var viz = $("<input type='" + this.inputType + "'>");
            this.$el.html(viz);
            return viz;
        },

        updateView: function(viz, data) {
            this.val(this.settings.get("value") || false);
            return this;
        },

        // Get or set the current input's value.
        val: function(value) {
            var input = $("input", this.$el);
            if (value === undefined) {
                return input.prop('checked');
            }

            if (value !== this.val()) {
                input.prop('checked', Boolean(value));
                this._onChange();
                this.settings.set("value", Boolean(value));
            }
            return this.val();
        }
    });
    
    return CheckboxView;
});

define('splunkjs/mvc/basechoiceview',['require','exports','module','underscore','util/console','./baseinputview'],function(require, exports, module) {
    var _ = require('underscore');
    var console = require('util/console');
    var BaseInputView = require("./baseinputview");

    /**
     * Private abstract base class for form input views that 
     * present static and dynamic choices.  
     *
     * This class presents choices, which consist of a value 
     * and an optional label to display.  If the label is not
     * provided, the value will be displayed.
     *
     * Options:
     * 
     *     valueField: Field to use for option value (and optionally,
     *         option label)
     *
     *     labelField: Field to use for option label, will default to
     *         valueField if not provided.
     */
    var BaseChoiceView = BaseInputView.extend({
        options: {
            "choices": []
        },

        initialize: function() {
            var that = this;

            this.options = _.extend({}, BaseInputView.prototype.options, this.options);
            BaseInputView.prototype.initialize.apply(this, arguments);

            this.manager = null;
            this.resultsModel = null;

            this.settings.on("change:value", this._onValueChange, this);
            this.settings.on("change:choices change:valueField change:labelField change:default",
                             _.debounce(this.render, 0), this);
        },

        updateDomVal: function(value) {
            // Given the value passed in, change the HTML of this
            // control to reflect the current value.
            throw new Error("Abstract method.  Must override");
        },
        
        _onValueChange: function(ctx, value, options) {
            this.updateDomVal(value);
            this.trigger('change', this);
        },

        convertDataToChoices: function(data) {
            // Given a new set of dynamic data, transforms all sources
            // of choices into a value/label pair suitable for DOM
            // rendering.  Merges static and dynamic data into a
            // single array.
            data = data || this._data;
            var valueField = this.settings.get("valueField") || 'value';
            var labelField = this.settings.get("labelField") || valueField;
            var choices = Array.prototype.slice.call(this.settings.get('choices') || []);

            choices = choices.concat(_.map((data || []), function(row) {
                return {
                    label: row[labelField],
                    value: row[valueField]
                };
            }));

            // De-duplicate values list, as HTML controls don't handle
            // them well.
            var originalChoicesLength = choices.length;
            choices = _.uniq(choices, false, function(i) { return i.value; });
            if (originalChoicesLength != choices.length) {
                console.log("Choice control received search result with duplicate values. Recommend dedupe of data source.");
            }
            return choices;
        },

        _updateView: function(viz, data) {
            data = this.convertDataToChoices(data);

            if (!this._viz) {
                this._createView(data); 
                if (!this._viz) {
                    return; 
                }
            }

            this.updateView(this._viz, data);
            this._onDisable();
        },

        val: function(newValue) {
            if (arguments.length === 0) {
                return this.settings.get("value");
            }

            if (newValue !== this.settings.get("value")) {
                this.settings.set('value', newValue);
            }
            
            return this.settings.get('value');
        }
        
    });
    
    return BaseChoiceView;
});

define('splunkjs/mvc/basemultichoiceview',['require','exports','module','underscore','./basechoiceview'],function(require, exports, module) {
    var _ = require('underscore');
    var BaseChoiceView = require("./basechoiceview");

    var asArray = function(obj) {
        if (obj === undefined) {
            return [];
        }
        return _.isArray(obj) ? obj : [obj];
    };

    /**
     * Base class for choice arrays that can have multiple choice
     * values selected.  All controls based on this class always
     * take and return arrays of values.
     */
    var BaseMultiChoiceView = BaseChoiceView.extend({
        val: function(newValue) {
            var oldValue = this.settings.get('value') || [];
            newValue = newValue || [];

            if (arguments.length === 0) {
                return oldValue;
            }

            newValue = asArray(newValue);
            oldValue.sort();
            newValue.sort();

            if (_.isEqual(oldValue, newValue)) {
                return oldValue;
            }

            this.settings.set('value', newValue);
            return newValue;
        }
    });
    
    return BaseMultiChoiceView;
});

define('splunkjs/mvc/checkboxgroupview',['require','exports','module','underscore','jquery','./basemultichoiceview'],function(require, exports, module) {

    var _ = require('underscore');
    var $ = require('jquery');
    var BaseMultiChoiceView = require("./basemultichoiceview");

    var asArray = function(obj) {
        if (obj === undefined) {
            return [];
        }
        return _.isArray(obj) ? obj : [obj];
    };

    /**
     * Displays a list of boolean checkboxes.  This control's value is
     * always the array of selected checkbox values.
     */
    var CheckboxGroupView = BaseMultiChoiceView.extend({
        moduleId: module.id,
        
        className: "splunk-checkboxgroup",
        
        options: {
            valueField: "",
            labelField: "",
            "default": undefined,
            choices: [],
            value: undefined,
            disabled: false
        },

        events: {
            "change input:checkbox": "onDomChange"
        },
        
        initialize: function() {
            this.options = _.extend({}, BaseMultiChoiceView.prototype.options, this.options);
            BaseMultiChoiceView.prototype.initialize.apply(this, arguments);
        },

        _domVal: function() {
            return this.$('input:checkbox:checked').map(function(index, checkbox) {
                return $(checkbox).val();
            }).get();
        },

        onDomChange: function(event) {
            this.val(this._domVal());
        },

        updateDomVal: function(values) {
            this.$('input:checkbox:checked').prop('checked', false);
            _.each(values, function(val) { 
                this.$('input:checkbox[value="' + val + '"]').prop('checked', 'checked');
            });
        },

        updateView: function(viz, data) {
            this.$el.empty();

            if (!data) {
                this.$el.html(_("No results").t());
                return this;
            }

            var that = this;
            var currentValues = this.settings.get("value");
            var id = this.id;

            _.each(data || [], function(entry, idx) {
                var itemId = id + idx;
                var input = $('<input type="checkbox" />')
                    .attr({name: id, value: entry.value, id: itemId});
                
                if (_.contains(currentValues, entry.value)) {
                    input.prop({'checked': 'checked'});
                }

                var choice = $('<div class="choice" />')
                    .append(input)
                    .append($('<label />')
                            .attr("for", itemId)
                            .text(entry.label || "(null)"));

                    that.$el.append(choice);
            });

            return this;
        }
    });
    
    return CheckboxGroupView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/radio.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/radiogroupview',['require','exports','module','underscore','jquery','./basechoiceview','css!../css/radio.css'],function(require, exports, module) {

    var _ = require('underscore');
    var $ = require('jquery');
    var BaseChoiceView = require("./basechoiceview");

    require("css!../css/radio.css");

    /**
     * Displays a list of radio buttons.
     *  
     * The value of this control is the value of the single button
     * selected, or undefined if no button is selected.
     */
    var RadioGroupView = BaseChoiceView.extend({
        moduleId: module.id,
        className: "splunk-radiogroup",
        
        options: {
            valueField: "",
            labelField: "",
            "default": undefined,
            "choices": [],
            disabled: false,
            value: undefined
        },

        events: {
            "change input:radio": "onDomChange"
        },

        initialize: function() {
            this.options = _.extend({}, BaseChoiceView.prototype.options, this.options);
            BaseChoiceView.prototype.initialize.apply(this, arguments);
        },

        _domVal: function() {
            return this.$("input:radio:checked").val();
        },

        onDomChange: function() {
            this.val(this._domVal());
        },

        updateDomVal: function(value) {
            this.$('input:radio').prop('checked', false);
            this.$('input:radio[value="' + value + '"]').prop('checked', 'checked');
        },

        updateView: function(viz, data) {
            this.$el.empty();

            if (!data) {
                this.$el.text(_("No results").t());
                return this;
            }

            var that = this;
            var controlValue = this.settings.get("value");
            var id = this.id;

            _.each(data || [], function(entry, idx) {
                var itemId = id + String(idx);
                // As this control is represented by a group of HTML
                // objects, each object must have its own unique ID.
                var input = $('<input type="radio" />')
                    .attr({name: id, value: entry.value, id: itemId});

                if (entry.value == controlValue) {
                    input.prop({'checked': 'checked'});
                }

                var choice = $('<div class="choice" />')
                    .append(input)
                    .append($('<label />')
                            .attr("for", itemId)
                            .text(entry.label));

                that.$el.append(choice);
            });

            return this;
        }
    });
    
    return RadioGroupView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/select.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('contrib/select2-3.3.1/select2.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/baseselectviewmixin',['require','exports','module','underscore','jquery','select2/select2','util/console','css!../css/select.css','css!contrib/select2-3.3.1/select2.css'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var Select2 = require("select2/select2");
    var console = require("util/console");
    
    require("css!../css/select.css");
    require("css!contrib/select2-3.3.1/select2.css");
    
    var BaseSelectViewMixin = {
        
        options: {
            managerid: null,
            valueField: "",
            labelField: "",
            choices: [],
            "default": undefined,
            width: 200,
            minimumResultsForSearch: 8,
            showClearButton: true, // allow a selection to be cleared from the dropdown itself
            disabled: false,
            value: undefined
        },
        
        events: {
            "change select": "onDomChange"
        },
        
        updateDomVal: function(value) {
            if (this.$('.select2-container.placeholder').length == 0) {
                this.$('option:selected').prop('selected', false);
                this._viz.val(this.settings.get('value'));
                this._select2(this._viz); // Keep select2 widget in sync
            }
        },
        
        _domVal: function() {
            // The underlying select2 control takes on the value ''
            // (in single-select mode) or null (in multi-select mode)
            // when no value is selected.  We must convert this to
            // undefined to conform to our API for scalars, and an
            // empty list for sequences.
            return this._viz.val() || (this.valueIsList ? [] : undefined);
        },

        onDomChange: function() {
            this.val(this._domVal());
        },
        
        _onDisable: function(e) {
            var state = this.settings.get("disabled");
            this._viz.prop("disabled", state);
        },
        
        _displayMessage: function(label) {
            this._viz.html($("<option>"));
            this._select2(this._viz, {placeholder: label});
        },
        
        _select2: function(item, options) {
            var selectOptions = _.extend({
                minimumResultsForSearch: parseInt(this.settings.get('minimumResultsForSearch'), 10),
                allowClear: this.settings.get('showClearButton'),
                placeholder: ''
            }, options || {});
            item.select2("close");
            item.select2(selectOptions);
        },
        
        createView: function() {
            var select = $(this.selectRoot);
            this.$el.html(select);
            select.width(this.settings.get('width'));
            return select;
        },
        
        updateView: function(viz, data) {
            viz.empty();

            if (_.any(data, function(d) { return (d.value === ""); })) {
                console.log("The empty string is not a valid value for HTML select controls.");
            }
            
            if (data.length === 0) {
                this._displayMessage(_("No results").t());
                return this;
            }  

            // Select2 requires an empty <option/> element to be present
            // if the 'placeholder' and 'allowClear' options are set.
            viz.append($("<option />"));
            
            // Get the actual value of the control
            var controlValue = this.valueIsList ? this.settings.get("value") : [this.settings.get("value")];
            
            _.each(data, function(row) {
                // Create the <option> tag for this entry and ensure we sync
                // up the display value if it is the currently selected one.
                var option = $("<option />").text(row.label || '').attr('value', row.value);
                if (_.contains(controlValue, row.value)) {
                    option.prop('selected', 'selected');
                }
                viz.append(option);
            });
            
            this._select2(viz, {placeholder: ''});
            return this;
        }
    };
    return BaseSelectViewMixin;
});

define('splunkjs/mvc/multiselectview',['require','exports','module','underscore','./basemultichoiceview','./baseselectviewmixin'],function(require, exports, module) {
    var _ = require('underscore');
    var BaseMultiChoiceView = require("./basemultichoiceview");
    var BaseSelectViewMixin = require("./baseselectviewmixin");

    // See http://ricostacruz.com/backbone-patterns/#mixins for
    // this mixin pattern.
    var MultiSelectView = BaseMultiChoiceView.extend(
        _.extend({}, BaseSelectViewMixin, {
            moduleId: module.id,
            
            className: "splunk-multiselect",
            selectRoot: '<select multiple="multiple"/>',
            valueIsList: true,
            
            initialize: function() {
                this.options = _.extend({}, BaseMultiChoiceView.prototype.options, this.options);
                BaseMultiChoiceView.prototype.initialize.apply(this, arguments);
                this.settings.on("change:width", _.debounce(this.render, 0), this);
            }
        })
    );

    return MultiSelectView;
});

define('splunkjs/mvc/selectview',['require','exports','module','underscore','./basechoiceview','./baseselectviewmixin'],function(require, exports, module) {
    var _ = require('underscore');
    var BaseChoiceView = require("./basechoiceview");
    var BaseSelectViewMixin = require("./baseselectviewmixin");

    // See http://ricostacruz.com/backbone-patterns/#mixins for
    // this mixin pattern.
    var SelectView = BaseChoiceView.extend(
        _.extend({}, BaseSelectViewMixin, {
            moduleId: module.id,
            
            className: "splunk-select",
            selectRoot: '<select />',
            valueIsList: false,
            
            initialize: function() {
                this.options = _.extend({}, BaseChoiceView.prototype.options, this.options);
                BaseChoiceView.prototype.initialize.apply(this, arguments);
                this.settings.on("change:width", _.debounce(this.render, 0), this);
            }
        })
    );

    return SelectView;
});

define('splunkjs/mvc/textboxview',['require','exports','module','underscore','jquery','./baseinputview'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInputView = require("./baseinputview");

    /**
     * Displays an editable text field.
     * 
     * Does not report changes to the displayed value on every keypress.
     * Instead, delays until focus is lost or the user presses enter.
     */
    var TextBoxView = BaseInputView.extend({
        moduleId: module.id,
        
        className: "splunk-textbox",

        options: {
            "default": undefined,
            "type": "text",
            seed: undefined,
            value: undefined,
            disabled: false
        },

        events: {
            "change input": "_onChange"
        },
        
        initialize: function() {
            this.options = _.extend({}, BaseInputView.prototype.options, this.options);
            BaseInputView.prototype.initialize.apply(this, arguments);
            
            // Update view if model changes
            this.settings.on("change", this.render, this);

            // Update model if view changes
            var that = this;
            this.on("change", function() {
                that.settings.set("value", that.val());
            });

            // Only types available to this object
            if (! _.contains(["text", "password"], this.settings.get("type"))) {
                this.settings.set("type", "text");
            }
        },

        createView: function() {
            var viz = $("<input type='" + this.settings.get("type") + "'>");
            this.$el.html(viz);
            return viz;
        },

        updateView: function(data, viz) {
            this.val(this.settings.get("value") || "");
            return this;
        },

        // Get or set the current input's value.
        val: function(value) {
            var input = $("input", this.$el);
            if (value === undefined) {
                return input.val();
            }

            if (value !== this.val()) {
                input.val(value);
                this._onChange();
            
                this.settings.set("value", value);
            }
            
            return this.val();
        }
    });
    
    return TextBoxView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.splunk-radio input {\n    margin-left: 2px;\n    margin-right: 10px;\n}\n.splunk-radio .choice label {\n    display: inline;\n}.splunk-select div.select2-container {\n    margin-bottom: 9px;\n}\n\n.splunk-select .select2-container .select2-choice {\n    height: 24px;\n    line-height: 24px;\n}\n.splunk-select .select2-container .select2-choice div b {\n\n}\n/*\nVersion: 3.3.1 Timestamp: Wed Feb 20 09:57:22 PST 2013\n*/\n.select2-container {\n    position: relative;\n    display: inline-block;\n    /* inline-block for ie7 */\n    zoom: 1;\n    *display: inline;\n    vertical-align: top;\n}\n\n.select2-container,\n.select2-drop,\n.select2-search,\n.select2-search input{\n  /*\n    Force border-box so that % widths fit the parent\n    container without overlap because of margin/padding.\n\n    More Info : http://www.quirksmode.org/css/box.html\n  */\n  -webkit-box-sizing: border-box; /* webkit */\n   -khtml-box-sizing: border-box; /* konqueror */\n     -moz-box-sizing: border-box; /* firefox */\n      -ms-box-sizing: border-box; /* ie */\n          box-sizing: border-box; /* css3 */\n}\n\n.select2-container .select2-choice {\n    display: block;\n    height: 26px;\n    padding: 0 0 0 8px;\n    overflow: hidden;\n    position: relative;\n\n    border: 1px solid #aaa;\n    white-space: nowrap;\n    line-height: 26px;\n    color: #444;\n    text-decoration: none;\n\n    -webkit-border-radius: 4px;\n       -moz-border-radius: 4px;\n            border-radius: 4px;\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n\n    background-color: #fff;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #eeeeee), color-stop(0.5, white));\n    background-image: -webkit-linear-gradient(center bottom, #eeeeee 0%, white 50%);\n    background-image: -moz-linear-gradient(center bottom, #eeeeee 0%, white 50%);\n    background-image: -o-linear-gradient(bottom, #eeeeee 0%, #ffffff 50%);\n    background-image: -ms-linear-gradient(top, #ffffff 0%, #eeeeee 50%);\n    filter: progid:DXImageTransform.Microsoft.gradient(startColorstr = \'#ffffff\', endColorstr = \'#eeeeee\', GradientType = 0);\n    background-image: linear-gradient(top, #ffffff 0%, #eeeeee 50%);\n}\n\n.select2-container.select2-drop-above .select2-choice {\n    border-bottom-color: #aaa;\n\n    -webkit-border-radius:0 0 4px 4px;\n       -moz-border-radius:0 0 4px 4px;\n            border-radius:0 0 4px 4px;\n\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #eeeeee), color-stop(0.9, white));\n    background-image: -webkit-linear-gradient(center bottom, #eeeeee 0%, white 90%);\n    background-image: -moz-linear-gradient(center bottom, #eeeeee 0%, white 90%);\n    background-image: -o-linear-gradient(bottom, #eeeeee 0%, white 90%);\n    background-image: -ms-linear-gradient(top, #eeeeee 0%,#ffffff 90%);\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#ffffff\', endColorstr=\'#eeeeee\',GradientType=0 );\n    background-image: linear-gradient(top, #eeeeee 0%,#ffffff 90%);\n}\n\n.select2-container .select2-choice span {\n    margin-right: 26px;\n    display: block;\n    overflow: hidden;\n\n    white-space: nowrap;\n\n    -ms-text-overflow: ellipsis;\n     -o-text-overflow: ellipsis;\n        text-overflow: ellipsis;\n}\n\n.select2-container .select2-choice abbr {\n    display: block;\n    width: 12px;\n    height: 12px;\n    position: absolute;\n    right: 26px;\n    top: 8px;\n\n    font-size: 1px;\n    text-decoration: none;\n\n    border: 0;\n    background: url(\'contrib/select2-3.3.1/select2.png\') right top no-repeat;\n    cursor: pointer;\n    outline: 0;\n}\n.select2-container .select2-choice abbr:hover {\n    background-position: right -11px;\n    cursor: pointer;\n}\n\n.select2-drop-mask {\n    position: absolute;\n    left: 0;\n    top: 0;\n    z-index: 9998;\n    opacity: 0;\n}\n\n.select2-drop {\n    width: 100%;\n    margin-top:-1px;\n    position: absolute;\n    z-index: 9999;\n    top: 100%;\n\n    background: #fff;\n    color: #000;\n    border: 1px solid #aaa;\n    border-top: 0;\n\n    -webkit-border-radius: 0 0 4px 4px;\n       -moz-border-radius: 0 0 4px 4px;\n            border-radius: 0 0 4px 4px;\n\n    -webkit-box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n       -moz-box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n            box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n}\n\n.select2-drop.select2-drop-above {\n    margin-top: 1px;\n    border-top: 1px solid #aaa;\n    border-bottom: 0;\n\n    -webkit-border-radius: 4px 4px 0 0;\n       -moz-border-radius: 4px 4px 0 0;\n            border-radius: 4px 4px 0 0;\n\n    -webkit-box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n       -moz-box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n            box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n}\n\n.select2-container .select2-choice div {\n    display: block;\n    width: 18px;\n    height: 100%;\n    position: absolute;\n    right: 0;\n    top: 0;\n\n    border-left: 1px solid #aaa;\n    -webkit-border-radius: 0 4px 4px 0;\n       -moz-border-radius: 0 4px 4px 0;\n            border-radius: 0 4px 4px 0;\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    background: #ccc;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #ccc), color-stop(0.6, #eee));\n    background-image: -webkit-linear-gradient(center bottom, #ccc 0%, #eee 60%);\n    background-image: -moz-linear-gradient(center bottom, #ccc 0%, #eee 60%);\n    background-image: -o-linear-gradient(bottom, #ccc 0%, #eee 60%);\n    background-image: -ms-linear-gradient(top, #cccccc 0%, #eeeeee 60%);\n    filter: progid:DXImageTransform.Microsoft.gradient(startColorstr = \'#eeeeee\', endColorstr = \'#cccccc\', GradientType = 0);\n    background-image: linear-gradient(top, #cccccc 0%, #eeeeee 60%);\n}\n\n.select2-container .select2-choice div b {\n    display: block;\n    width: 100%;\n    height: 100%;\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 0 1px;\n}\n\n.select2-search {\n    display: inline-block;\n    width: 100%;\n    min-height: 26px;\n    margin: 0;\n    padding-left: 4px;\n    padding-right: 4px;\n\n    position: relative;\n    z-index: 10000;\n\n    white-space: nowrap;\n}\n\n.select2-search-hidden {\n    display: block;\n    position: absolute;\n    left: -10000px;\n}\n\n.select2-search input {\n    width: 100%;\n    height: auto !important;\n    min-height: 26px;\n    padding: 4px 20px 4px 5px;\n    margin: 0;\n\n    outline: 0;\n    font-family: sans-serif;\n    font-size: 1em;\n\n    border: 1px solid #aaa;\n    -webkit-border-radius: 0;\n       -moz-border-radius: 0;\n            border-radius: 0;\n\n    -webkit-box-shadow: none;\n       -moz-box-shadow: none;\n            box-shadow: none;\n\n    background: #fff url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px;\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -webkit-gradient(linear, left bottom, left top, color-stop(0.85, white), color-stop(0.99, #eeeeee));\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -webkit-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -moz-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -o-linear-gradient(bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -ms-linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n}\n\n.select2-drop.select2-drop-above .select2-search input {\n    margin-top: 4px;\n}\n\n.select2-search input.select2-active {\n    background: #fff url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%;\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -webkit-gradient(linear, left bottom, left top, color-stop(0.85, white), color-stop(0.99, #eeeeee));\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -webkit-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -moz-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -o-linear-gradient(bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -ms-linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n}\n\n.select2-container-active .select2-choice,\n.select2-container-active .select2-choices {\n    border: 1px solid #5897fb;\n    outline: none;\n\n    -webkit-box-shadow: 0 0 5px rgba(0,0,0,.3);\n       -moz-box-shadow: 0 0 5px rgba(0,0,0,.3);\n            box-shadow: 0 0 5px rgba(0,0,0,.3);\n}\n\n.select2-dropdown-open .select2-choice {\n    border-bottom-color: transparent;\n    -webkit-box-shadow: 0 1px 0 #fff inset;\n       -moz-box-shadow: 0 1px 0 #fff inset;\n            box-shadow: 0 1px 0 #fff inset;\n\n    -webkit-border-bottom-left-radius: 0;\n        -moz-border-radius-bottomleft: 0;\n            border-bottom-left-radius: 0;\n\n    -webkit-border-bottom-right-radius: 0;\n        -moz-border-radius-bottomright: 0;\n            border-bottom-right-radius: 0;\n\n    background-color: #eee;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, white), color-stop(0.5, #eeeeee));\n    background-image: -webkit-linear-gradient(center bottom, white 0%, #eeeeee 50%);\n    background-image: -moz-linear-gradient(center bottom, white 0%, #eeeeee 50%);\n    background-image: -o-linear-gradient(bottom, white 0%, #eeeeee 50%);\n    background-image: -ms-linear-gradient(top, #ffffff 0%,#eeeeee 50%);\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#eeeeee\', endColorstr=\'#ffffff\',GradientType=0 );\n    background-image: linear-gradient(top, #ffffff 0%,#eeeeee 50%);\n}\n\n.select2-dropdown-open .select2-choice div {\n    background: transparent;\n    border-left: none;\n    filter: none;\n}\n.select2-dropdown-open .select2-choice div b {\n    background-position: -18px 1px;\n}\n\n/* results */\n.select2-results {\n    max-height: 200px;\n    padding: 0 0 0 4px;\n    margin: 4px 4px 4px 0;\n    position: relative;\n    overflow-x: hidden;\n    overflow-y: auto;\n    -webkit-tap-highlight-color: rgba(0,0,0,0);\n}\n\n.select2-results ul.select2-result-sub {\n    margin: 0;\n}\n\n.select2-results ul.select2-result-sub > li .select2-result-label { padding-left: 20px }\n.select2-results ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 40px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 60px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 80px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 100px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 110px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 120px }\n\n.select2-results li {\n    list-style: none;\n    display: list-item;\n    background-image: none;\n}\n\n.select2-results li.select2-result-with-children > .select2-result-label {\n    font-weight: bold;\n}\n\n.select2-results .select2-result-label {\n    padding: 3px 7px 4px;\n    margin: 0;\n    cursor: pointer;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n}\n\n.select2-results .select2-highlighted {\n    background: #3875d7;\n    color: #fff;\n}\n\n.select2-results li em {\n    background: #feffde;\n    font-style: normal;\n}\n\n.select2-results .select2-highlighted em {\n    background: transparent;\n}\n\n.select2-results .select2-highlighted ul {\n    background: white;\n    color: #000;\n}\n\n\n.select2-results .select2-no-results,\n.select2-results .select2-searching,\n.select2-results .select2-selection-limit {\n    background: #f4f4f4;\n    display: list-item;\n}\n\n/*\ndisabled look for disabled choices in the results dropdown\n*/\n.select2-results .select2-disabled.select2-highlighted {\n    color: #666;\n    background: #f4f4f4;\n    display: list-item;\n    cursor: default;\n}\n.select2-results .select2-disabled {\n  background: #f4f4f4;\n  display: list-item;\n  cursor: default;\n}\n\n.select2-results .select2-selected {\n    display: none;\n}\n\n.select2-more-results.select2-active {\n    background: #f4f4f4 url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%;\n}\n\n.select2-more-results {\n    background: #f4f4f4;\n    display: list-item;\n}\n\n/* disabled styles */\n\n.select2-container.select2-container-disabled .select2-choice {\n    background-color: #f4f4f4;\n    background-image: none;\n    border: 1px solid #ddd;\n    cursor: default;\n}\n\n.select2-container.select2-container-disabled .select2-choice div {\n    background-color: #f4f4f4;\n    background-image: none;\n    border-left: 0;\n}\n\n.select2-container.select2-container-disabled .select2-choice abbr {\n    display: none\n}\n\n\n/* multiselect */\n\n.select2-container-multi .select2-choices {\n    height: auto !important;\n    height: 1%;\n    margin: 0;\n    padding: 0;\n    position: relative;\n\n    border: 1px solid #aaa;\n    cursor: text;\n    overflow: hidden;\n\n    background-color: #fff;\n    background-image: -webkit-gradient(linear, 0% 0%, 0% 100%, color-stop(1%, #eeeeee), color-stop(15%, #ffffff));\n    background-image: -webkit-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -moz-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -o-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -ms-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n}\n\n.select2-locked {\n  padding: 3px 5px 3px 5px !important;\n}\n\n.select2-container-multi .select2-choices {\n    min-height: 26px;\n}\n\n.select2-container-multi.select2-container-active .select2-choices {\n    border: 1px solid #5897fb;\n    outline: none;\n\n    -webkit-box-shadow: 0 0 5px rgba(0,0,0,.3);\n       -moz-box-shadow: 0 0 5px rgba(0,0,0,.3);\n            box-shadow: 0 0 5px rgba(0,0,0,.3);\n}\n.select2-container-multi .select2-choices li {\n    float: left;\n    list-style: none;\n}\n.select2-container-multi .select2-choices .select2-search-field {\n    margin: 0;\n    padding: 0;\n    white-space: nowrap;\n}\n\n.select2-container-multi .select2-choices .select2-search-field input {\n    padding: 5px;\n    margin: 1px 0;\n\n    font-family: sans-serif;\n    font-size: 100%;\n    color: #666;\n    outline: 0;\n    border: 0;\n    -webkit-box-shadow: none;\n       -moz-box-shadow: none;\n            box-shadow: none;\n    background: transparent !important;\n}\n\n.select2-container-multi .select2-choices .select2-search-field input.select2-active {\n    background: #fff url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100% !important;\n}\n\n.select2-default {\n    color: #999 !important;\n}\n\n.select2-container-multi .select2-choices .select2-search-choice {\n    padding: 3px 5px 3px 18px;\n    margin: 3px 0 3px 5px;\n    position: relative;\n\n    line-height: 13px;\n    color: #333;\n    cursor: default;\n    border: 1px solid #aaaaaa;\n\n    -webkit-border-radius: 3px;\n       -moz-border-radius: 3px;\n            border-radius: 3px;\n\n    -webkit-box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n       -moz-box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n            box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n\n    background-color: #e4e4e4;\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#eeeeee\', endColorstr=\'#f4f4f4\', GradientType=0 );\n    background-image: -webkit-gradient(linear, 0% 0%, 0% 100%, color-stop(20%, #f4f4f4), color-stop(50%, #f0f0f0), color-stop(52%, #e8e8e8), color-stop(100%, #eeeeee));\n    background-image: -webkit-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -moz-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -o-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -ms-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n}\n.select2-container-multi .select2-choices .select2-search-choice span {\n    cursor: default;\n}\n.select2-container-multi .select2-choices .select2-search-choice-focus {\n    background: #d4d4d4;\n}\n\n.select2-search-choice-close {\n    display: block;\n    width: 12px;\n    height: 13px;\n    position: absolute;\n    right: 3px;\n    top: 4px;\n\n    font-size: 1px;\n    outline: none;\n    background: url(\'contrib/select2-3.3.1/select2.png\') right top no-repeat;\n}\n\n.select2-container-multi .select2-search-choice-close {\n    left: 3px;\n}\n\n.select2-container-multi .select2-choices .select2-search-choice .select2-search-choice-close:hover {\n  background-position: right -11px;\n}\n.select2-container-multi .select2-choices .select2-search-choice-focus .select2-search-choice-close {\n    background-position: right -11px;\n}\n\n/* disabled styles */\n.select2-container-multi.select2-container-disabled .select2-choices{\n    background-color: #f4f4f4;\n    background-image: none;\n    border: 1px solid #ddd;\n    cursor: default;\n}\n\n.select2-container-multi.select2-container-disabled .select2-choices .select2-search-choice {\n    padding: 3px 5px 3px 5px;\n    border: 1px solid #ddd;\n    background-image: none;\n    background-color: #f4f4f4;\n}\n\n.select2-container-multi.select2-container-disabled .select2-choices .select2-search-choice .select2-search-choice-close {\n    display: none;\n}\n/* end multiselect */\n\n\n.select2-result-selectable .select2-match,\n.select2-result-unselectable .select2-match {\n    text-decoration: underline;\n}\n\n.select2-offscreen {\n    position: absolute;\n    left: -10000px;\n}\n\n/* Retina-ize icons */\n\n@media only screen and (-webkit-min-device-pixel-ratio: 1.5), only screen and (min-resolution: 144dpi)  {\n  .select2-search input, .select2-search-choice-close, .select2-container .select2-choice abbr, .select2-container .select2-choice div b {\n      background-image: url(\'contrib/select2-3.3.1/select2x2.png\') !important;\n      background-repeat: no-repeat !important;\n      background-size: 60px 40px !important;\n  }\n  .select2-search input {\n      background-position: 100% -21px !important;\n  }\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 