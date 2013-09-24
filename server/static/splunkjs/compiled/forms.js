
// THIS FILE IS PURPOSEFULLY EMPTY FOR R.JS COMPILER
// IT IS A COMPILER TARGET FILE, AS WE CANNOT CREATE NEW FILES DYNAMICALLY FOR 
// THE COMPILER;
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
            
            // Handle the default value
            this._onDefaultChange();
            
            this.settings.on("change:disabled", this._onDisable, this);
            this.settings.on("change:default", this._onDefaultChange, this);
        },
        
        _onDefaultChange: function(model, value, options) {   
            var oldDefaultValue = this.settings.previous("default");
                 
            // Initialize value with default, if provided.
            var defaultValue = this.settings.get("default");
            var calledFromConstructor = !model;
            if (defaultValue === undefined && calledFromConstructor) {
                var supportsSeedSetting = _.contains(
                    _.keys(this.constructor.prototype.options), "seed");
                
                if (supportsSeedSetting) {
                    // The `seed` option has been deprecated and replaced by the
                    // `default` option, which is supported on all inputs. If a text
                    // input has both, the `default` wins.
                    defaultValue = this.settings.get("seed");
                }
            }
            
            var currentValue = this.settings.get('value');
            if (defaultValue !== undefined &&
                (currentValue === oldDefaultValue || currentValue === undefined))
            {
                this.val(defaultValue);
            }
        },

        _onChange: function(e) {
            this.trigger("change", this.val(), this);
        },

        _onDisable: function(e) {
            var state = this.settings.get("disabled");
            this._disable(state);
        },
        
        _disable: function(state) {
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

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/checkbox.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/checkboxview',['require','exports','module','underscore','jquery','./baseinputview','css!../css/checkbox.css'],function(require, exports, module) {

    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInputView = require("./baseinputview");

    require("css!../css/checkbox.css");

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
                this.settings.set("value", Boolean(value));
                this._onChange();
            }
            return this.val();
        }
    });
    
    return CheckboxView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/choice.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/basechoiceview',['require','exports','module','underscore','util/console','./baseinputview','./messages','bootstrap.tooltip','css!../css/choice.css'],function(require, exports, module) {
    var _ = require('underscore');
    var console = require('util/console');
    var BaseInputView = require("./baseinputview");
    var Messages = require("./messages");
    var Tooltip = require("bootstrap.tooltip");

    require("css!../css/choice.css");

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
            
            this._$messageEl = this.$(".splunk-choice-input-message span");

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
            this.trigger('change', this.val(), this);
        },
        
        _displayMessage: function(messageName) {
            var info = messageName;
            if (_.isString(messageName)) {
                info = Messages.resolve(messageName);
            }
            
            // For the choice views, we have very limited space to render
            // messages, and so we render them to a specific message container
            // created in _updateView. We also replace the original message with
            // one that is more appropriate for the choice view.
            var message = "";
            var originalMessage = "";
            switch (messageName) {
                case "no-events":
                case "no-results":
                case "no-stats": {
                    message = _("Search produced no results.").t();
                    originalMessage = "";
                    
                    // We need to update the view with the empty search results,
                    // otherwise we may end up displaying stale data.
                    this._updateView(this._viz, []);
                    break;
                }
                case "waiting":
                case "waiting-queued":
                case "waiting-preparing": {
                    message = _("Populating...").t();
                    originalMessage = "";
                    break;
                }
                default: {
                    if (info.level === "error") {
                        message = _("Could not create search.").t();
                        originalMessage = info.message || "";
                    }
                    else {
                        message = "";
                        originalMessage = "";
                    }
                    break;
                }
            }
            
            // Put the message as the text, but also put the original message
            // as the tooltip.
            this._$messageEl.text(message);
            this._$messageEl.attr("title", originalMessage);
            this._$messageEl.tooltip('destroy');
            this._$messageEl.tooltip({animation: false});
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
            
            // Create the message area if one does not exist, and clear it.
            if (!this._$messageEl.length) {
                var $messageContainer = $("<div class='splunk-choice-input-message'></div>").appendTo(this.el);
                this._$messageEl = $("<span></span>").appendTo($messageContainer);
            }
            this._$messageEl.text('');
            
            // If there is no data, we disable the input, but if there is,
            // we may still need to disable it.
            if (!data || data.length === 0) {
                // We use the raw disable mechanism, because we don't want to
                // change our disabled state.
                this._disable(true);
            }
            else {
                this._onDisable();    
            }
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
            var oldValue = this.settings.get('value');

            var oldValueAsArray = asArray(oldValue);
            var newValueAsArray = asArray(newValue);
            
            if (arguments.length === 0) {
                return oldValueAsArray;
            }
            
            var sortedOldValue = _.clone(oldValueAsArray).sort();
            var sortedNewValue = _.clone(newValueAsArray).sort();

            // Don't change the value if the new value is logically equal to the old value (ignoring order).
            // However, if the old value is undefined, we go ahead and set it anyway
            // to coerce it into an empty array.
            if (_.isEqual(sortedOldValue, sortedNewValue) && sortedOldValue.length > 0) {
                return oldValue;
            }

            this.settings.set('value', newValueAsArray);
            
            return newValueAsArray;
        }
    });
    
    return BaseMultiChoiceView;
});
define('splunkjs/mvc/checkboxgroupview',['require','exports','module','underscore','jquery','./basemultichoiceview','css!../css/checkbox.css'],function(require, exports, module) {

    var _ = require('underscore');
    var $ = require('jquery');
    var BaseMultiChoiceView = require("./basemultichoiceview");

    require("css!../css/checkbox.css");

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
        
        className: "splunk-checkboxgroup splunk-choice-input",
        
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
        
        createView: function() {
            this.$el.empty();
            return $("<div class='splunk-checkboxgroup-choices'/>").appendTo(this.el);
        },

        updateView: function(viz, data) {            
            viz.empty();

            // If there is no data, we don't want to just render a message,
            // because that will look odd. Instead, we render a single checkbox
            // that will subsequently get disabled (in BaseChoiceView), plus
            // the message. Finally, we also set the label to " " to make sure it
            // gets picked up.
            if (!data || data.length === 0) {
                data = [{value: "", label: " "}];
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

                viz.append(choice);
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
        className: "splunk-radiogroup splunk-choice-input",
        
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
        
        createView: function() {
            this.$el.empty();
            return $("<fieldset class='splunk-radiogroup-choices'/>").appendTo(this.el);
        },

        updateView: function(viz, data) {
            viz.empty();

            // If there is no data, we don't want to just render a message,
            // because that will look odd. Instead, we render a single radio
            // that will subsequently get disabled (in BaseChoiceView), plus
            // the message.
            if (!data || data.length === 0) {
                data = [{value: "", label: " "}];
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

                viz.append(choice);
            });

            return this;
        }
    });
    
    return RadioGroupView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('contrib/select2-3.3.1/select2.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/select2.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/basedropdownviewmixin',['require','exports','module','underscore','jquery','select2/select2','util/console','css!contrib/select2-3.3.1/select2.css','css!../css/select2.css'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var Select2 = require("select2/select2");
    var console = require("util/console");

    require("css!contrib/select2-3.3.1/select2.css");
    require("css!../css/select2.css");

    var BaseDropdownViewMixin = {
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
            "change select": "onDomChange",
            "selected select": "onDomChange"
        },
        
        _setSelect2Value: function(value) {                
            // We need to update the select2 control, but to do that 
            // properly and handle the cases of value="", we need to compute
            // {id: value, text: label} objects.
            // First, we create these objects for any selected value
            var valueAsArray = this.valueIsList ? value : [value];
            var selectedValues = [];
            _.each(this._vizData, function(row) {
                if (_.contains(valueAsArray, row.value)) {
                    selectedValues.push({
                        id: row.value,
                        text: row.label
                    });
                }
            });
            
            // Now, we set the value appropriately.
            if (this.valueIsList) {
                this._viz.select2('data', selectedValues);
            }
            else if (!this.valueIsList && selectedValues.length > 0) {
                this._viz.select2('data', selectedValues[0]);
            }
            else {
                this._viz.select2('val', undefined);
            }
        },

        updateDomVal: function() {
            if (this.$('.select2-container.placeholder').length == 0) {
                var value = this.settings.get('value');
                
                // Update the raw DOM
                this.$('option:selected').prop('selected', false);
                this._viz.val(this.settings.get('value'));

                // Update select2
                this._setSelect2Value(value);
            }
        },

        _domVal: function() {
            var value = undefined;
            var valueObject = this._viz.select2('data');
            if (this.valueIsList) {
                value = _.pluck(valueObject, "id");
            }
            else {
                value = valueObject === null ? undefined : valueObject.id;
            }
            return value;
        },

        onDomChange: function(e) {
            // This function can get called when two separate events are triggered:
            // 1. The 'selected' event, which is triggered whenever select2 goes from
            // one value to another, but not to the undefined state.
            // 2. The 'change' event, which is triggered whenever select2 goes from
            // any value to another value, except the from the undefined to a value
            // that is "".
            // 
            // The above is due to a shortcoming in Select2, where an option with
            // value="" is seen the same as the "undefined" (placeholder) state.
            // Given this, we register for both values, and use the 'selected'
            // event, except to deduce the value -> undefined transition.
            var value = this._domVal();
            
            // Unfortunately, the above rules don't quite apply for the case 
            // of multiselect, so for that case, we use always use the 'change'
            // event.
            if (this.valueIsList && e.type === "selected") {
                return;
            }
            
            // If the type is change and the value isn't equal to undefined,
            // then we can stop, because we already handled this in the 'selected'
            // event.
            if (!this.valueIsList && e.type === "change" && value !== undefined) {
                return;
            }
            
            this.val(value);
        },

        _onDisable: function(e) {
            if (!this._viz) {
                return;
            }
            
            this._disable(this.settings.get("disabled"));
        },
        
        _disable: function(state) {
            this._viz.prop("disabled", state);
        },

        _select2: function(item, options) {
            var selectOptions = _.extend({
                minimumResultsForSearch: parseInt(this.settings.get('minimumResultsForSearch'), 10),
                allowClear: this.settings.get('showClearButton'),
                placeholder: '',
                formatResult: function(item, el) {
                    // Update each row in the open dropdown to have a tooltip
                    el.attr('title', item.text);
                    return _.escape(item.text);
                },
                formatSelection: function(item, el) {
                    // Update the select box itself to have a tooltip
                    el.attr('title', item.text);
                    return item.text;
                }
            }, options || {});
            item.select2("close");
            item.select2(selectOptions);
        },

        createView: function() {
            var select = $(this.selectRoot);
            this.$el.html(select);
            select.width(this.settings.get('width'));
            this._select2(select);
            return select;
        },

        updateView: function(viz, data) {
            viz.empty();
            this._vizData = data;

            if (data.length === 0) {
                this._select2(viz, {placeholder: ''});
                return this;
            }
            
            var hasEmptyValueOption = _.any(data, function(d) { return (d.value === ""); });

            // Select2 requires an empty <option/> element to be present
            // if the 'placeholder' and 'allowClear' options are set. We don't
            // want it to clash with any user-specified options, so we give it
            // a particular value (but no label, so it is still empty from 
            // Select2's point of view) if we already have an option with an
            // empty value.
            viz.append($("<option/>").attr("value", hasEmptyValueOption ? "__placeholder" : undefined));

            // Get the actual value of the control
            var controlValue = this.valueIsList ? this.settings.get("value") : [this.settings.get("value")];

            _.each(data, function(row) {
                // Create the <option> tag for this entry and ensure we sync
                // up the display value if it is the currently selected one.
                var option = $("<option/>").text(row.label || '').attr('value', row.value);
                if (_.contains(controlValue, row.value)) {
                    option.attr('selected', 'selected');
                }
                viz.append(option);
            });
            
            this.updateDomVal();
            
            return this;
        }
    };
    return BaseDropdownViewMixin;
});

define('splunkjs/mvc/multidropdownview',['require','exports','module','underscore','./basemultichoiceview','./basedropdownviewmixin'],function(require, exports, module) {
    var _ = require('underscore');
    var BaseMultiChoiceView = require("./basemultichoiceview");
    var BaseDropdownViewMixin = require("./basedropdownviewmixin");

    // See http://ricostacruz.com/backbone-patterns/#mixins for
    // this mixin pattern.
    var MultiDropdownView = BaseMultiChoiceView.extend(
        _.extend({}, BaseDropdownViewMixin, {
            moduleId: module.id,
            
            className: "splunk-multidropdown splunk-choice-input",
            selectRoot: '<select multiple="multiple"/>',
            valueIsList: true,
            
            initialize: function() {
                this.options = _.extend({}, BaseMultiChoiceView.prototype.options, this.options);
                BaseMultiChoiceView.prototype.initialize.apply(this, arguments);
                this.settings.on("change:width", _.debounce(this.render, 0), this);
            }
        })
    );

    return MultiDropdownView;
});

define('splunkjs/mvc/multiselectview',['require','util/console','./multidropdownview'],function(require) {
    var console = require('util/console');
    
    console.warn(
        '%s is deprecated. Please require %s instead.',
        'splunkjs/mvc/simpleform/multiselectview',
        'splunkjs/mvc/simpleform/multidropdownview');
    
    return require('./multidropdownview');
});

define('splunkjs/mvc/dropdownview',['require','exports','module','underscore','./basechoiceview','./basedropdownviewmixin'],function(require, exports, module) {
    var _ = require('underscore');
    var BaseChoiceView = require("./basechoiceview");
    var BaseDropdownViewMixin = require("./basedropdownviewmixin");

    // See http://ricostacruz.com/backbone-patterns/#mixins for
    // this mixin pattern.
    var SelectView = BaseChoiceView.extend(
        _.extend({}, BaseDropdownViewMixin, {
            moduleId: module.id,
            
            className: "splunk-dropdown splunk-choice-input",
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

define('splunkjs/mvc/selectview',['require','util/console','./dropdownview'],function(require) {
    var console = require('util/console');
    
    console.warn(
        '%s is deprecated. Please require %s instead.',
        'splunkjs/mvc/selectview',
        'splunkjs/mvc/dropdownview');
    
    return require('./dropdownview');
});

define('splunkjs/mvc/textinputview',['require','exports','module','underscore','jquery','./baseinputview'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInputView = require("./baseinputview");

    /**
     * Displays an editable text field.
     * 
     * Does not report changes to the displayed value on every keypress.
     * Instead, delays until focus is lost or the user presses enter.
     */
    var TextInputView = BaseInputView.extend({
        moduleId: module.id,
        
        className: "splunk-textinput",

        options: {
            "default": undefined,
            "type": "text",
            seed: undefined,
            value: undefined,
            disabled: false
        },

        events: {
            "change input": "_onDomValueChange"
        },
        
        initialize: function() {
            this.options = _.extend({}, BaseInputView.prototype.options, this.options);
            BaseInputView.prototype.initialize.apply(this, arguments);
            
            // Update view if model changes
            this.settings.on("change:value", this._onValueChange, this);
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
            
            this._inputId = (this.id + '-input');
        },
        
        _onDomValueChange: function() {
            var input = $("input", this.$el);
            this.val(input.val());
        },
        
        _onValueChange: function(ctx, value, options) {
            var input = $("input", this.$el);
            input.val(this.settings.get("value"));
            
            this._onChange();
        },
        
        getInputId: function() {
            return this._inputId;  
        },

        createView: function() {
            var viz = $(_.template(
                "<input type='<%= type %>' id='<%= id %>' value='<%- value %>'/>", 
                {
                    type: this.settings.get("type"),
                    id: this._inputId,
                    value: this.settings.get("value")
                }
            ));
            this.$el.html(viz);
            return viz;
        },

        updateView: function(data, viz) {
            return this;
        },

        // Get or set the current input's value.
        val: function(value) {
            var input = $("input", this.$el);
            if (arguments.length === 0) {
                return this.settings.get("value");
            }

            if (value !== this.settings.get("value")) {
                input.val(value || "");
                this.settings.set("value", value);
            }
            
            return this.val();
        }
    });
    
    return TextInputView;
});

define('splunkjs/mvc/textboxview',['require','util/console','./textinputview'],function(require) {
    var console = require('util/console');
    
    console.warn(
        '%s is deprecated. Please require %s instead.',
        'splunkjs/mvc/simpleform/textboxview',
        'splunkjs/mvc/simpleform/textinputview');
    
    return require('./textinputview');
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.splunk-checkboxgroup .choice label, .splunk-checkbox .choice label {\n        display: inline-block;\n        margin-left: 0.4em;        \n}.splunk-choice-input .splunk-choice-input-message {\n    color: gray;\n    font-size: 11px;\n    height: 0;\n    overflow: visible;\n}\n\n.splunk-choice-input {\n    padding-bottom: 15px;\n}.splunk-radiogroup input {\n    margin-left: 2px;\n    margin-right: 10px;\n}\n.splunk-radiogroup .choice label {\n    display: inline;\n}/*\nVersion: 3.3.1 Timestamp: Wed Feb 20 09:57:22 PST 2013\n*/\n.select2-container {\n    position: relative;\n    display: inline-block;\n    /* inline-block for ie7 */\n    zoom: 1;\n    *display: inline;\n    vertical-align: top;\n}\n\n.select2-container,\n.select2-drop,\n.select2-search,\n.select2-search input{\n  /*\n    Force border-box so that % widths fit the parent\n    container without overlap because of margin/padding.\n\n    More Info : http://www.quirksmode.org/css/box.html\n  */\n  -webkit-box-sizing: border-box; /* webkit */\n   -khtml-box-sizing: border-box; /* konqueror */\n     -moz-box-sizing: border-box; /* firefox */\n      -ms-box-sizing: border-box; /* ie */\n          box-sizing: border-box; /* css3 */\n}\n\n.select2-container .select2-choice {\n    display: block;\n    height: 26px;\n    padding: 0 0 0 8px;\n    overflow: hidden;\n    position: relative;\n\n    border: 1px solid #aaa;\n    white-space: nowrap;\n    line-height: 26px;\n    color: #444;\n    text-decoration: none;\n\n    -webkit-border-radius: 4px;\n       -moz-border-radius: 4px;\n            border-radius: 4px;\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n\n    background-color: #fff;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #eeeeee), color-stop(0.5, white));\n    background-image: -webkit-linear-gradient(center bottom, #eeeeee 0%, white 50%);\n    background-image: -moz-linear-gradient(center bottom, #eeeeee 0%, white 50%);\n    background-image: -o-linear-gradient(bottom, #eeeeee 0%, #ffffff 50%);\n    background-image: -ms-linear-gradient(top, #ffffff 0%, #eeeeee 50%);\n    filter: progid:DXImageTransform.Microsoft.gradient(startColorstr = \'#ffffff\', endColorstr = \'#eeeeee\', GradientType = 0);\n    background-image: linear-gradient(top, #ffffff 0%, #eeeeee 50%);\n}\n\n.select2-container.select2-drop-above .select2-choice {\n    border-bottom-color: #aaa;\n\n    -webkit-border-radius:0 0 4px 4px;\n       -moz-border-radius:0 0 4px 4px;\n            border-radius:0 0 4px 4px;\n\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #eeeeee), color-stop(0.9, white));\n    background-image: -webkit-linear-gradient(center bottom, #eeeeee 0%, white 90%);\n    background-image: -moz-linear-gradient(center bottom, #eeeeee 0%, white 90%);\n    background-image: -o-linear-gradient(bottom, #eeeeee 0%, white 90%);\n    background-image: -ms-linear-gradient(top, #eeeeee 0%,#ffffff 90%);\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#ffffff\', endColorstr=\'#eeeeee\',GradientType=0 );\n    background-image: linear-gradient(top, #eeeeee 0%,#ffffff 90%);\n}\n\n.select2-container .select2-choice span {\n    margin-right: 26px;\n    display: block;\n    overflow: hidden;\n\n    white-space: nowrap;\n\n    -ms-text-overflow: ellipsis;\n     -o-text-overflow: ellipsis;\n        text-overflow: ellipsis;\n}\n\n.select2-container .select2-choice abbr {\n    display: block;\n    width: 12px;\n    height: 12px;\n    position: absolute;\n    right: 26px;\n    top: 8px;\n\n    font-size: 1px;\n    text-decoration: none;\n\n    border: 0;\n    background: url(\'contrib/select2-3.3.1/select2.png\') right top no-repeat;\n    cursor: pointer;\n    outline: 0;\n}\n.select2-container .select2-choice abbr:hover {\n    background-position: right -11px;\n    cursor: pointer;\n}\n\n.select2-drop-mask {\n    position: absolute;\n    left: 0;\n    top: 0;\n    z-index: 9998;\n    opacity: 0;\n}\n\n.select2-drop {\n    width: 100%;\n    margin-top:-1px;\n    position: absolute;\n    z-index: 9999;\n    top: 100%;\n\n    background: #fff;\n    color: #000;\n    border: 1px solid #aaa;\n    border-top: 0;\n\n    -webkit-border-radius: 0 0 4px 4px;\n       -moz-border-radius: 0 0 4px 4px;\n            border-radius: 0 0 4px 4px;\n\n    -webkit-box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n       -moz-box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n            box-shadow: 0 4px 5px rgba(0, 0, 0, .15);\n}\n\n.select2-drop.select2-drop-above {\n    margin-top: 1px;\n    border-top: 1px solid #aaa;\n    border-bottom: 0;\n\n    -webkit-border-radius: 4px 4px 0 0;\n       -moz-border-radius: 4px 4px 0 0;\n            border-radius: 4px 4px 0 0;\n\n    -webkit-box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n       -moz-box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n            box-shadow: 0 -4px 5px rgba(0, 0, 0, .15);\n}\n\n.select2-container .select2-choice div {\n    display: block;\n    width: 18px;\n    height: 100%;\n    position: absolute;\n    right: 0;\n    top: 0;\n\n    border-left: 1px solid #aaa;\n    -webkit-border-radius: 0 4px 4px 0;\n       -moz-border-radius: 0 4px 4px 0;\n            border-radius: 0 4px 4px 0;\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    background: #ccc;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, #ccc), color-stop(0.6, #eee));\n    background-image: -webkit-linear-gradient(center bottom, #ccc 0%, #eee 60%);\n    background-image: -moz-linear-gradient(center bottom, #ccc 0%, #eee 60%);\n    background-image: -o-linear-gradient(bottom, #ccc 0%, #eee 60%);\n    background-image: -ms-linear-gradient(top, #cccccc 0%, #eeeeee 60%);\n    filter: progid:DXImageTransform.Microsoft.gradient(startColorstr = \'#eeeeee\', endColorstr = \'#cccccc\', GradientType = 0);\n    background-image: linear-gradient(top, #cccccc 0%, #eeeeee 60%);\n}\n\n.select2-container .select2-choice div b {\n    display: block;\n    width: 100%;\n    height: 100%;\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 0 1px;\n}\n\n.select2-search {\n    display: inline-block;\n    width: 100%;\n    min-height: 26px;\n    margin: 0;\n    padding-left: 4px;\n    padding-right: 4px;\n\n    position: relative;\n    z-index: 10000;\n\n    white-space: nowrap;\n}\n\n.select2-search-hidden {\n    display: block;\n    position: absolute;\n    left: -10000px;\n}\n\n.select2-search input {\n    width: 100%;\n    height: auto !important;\n    min-height: 26px;\n    padding: 4px 20px 4px 5px;\n    margin: 0;\n\n    outline: 0;\n    font-family: sans-serif;\n    font-size: 1em;\n\n    border: 1px solid #aaa;\n    -webkit-border-radius: 0;\n       -moz-border-radius: 0;\n            border-radius: 0;\n\n    -webkit-box-shadow: none;\n       -moz-box-shadow: none;\n            box-shadow: none;\n\n    background: #fff url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px;\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -webkit-gradient(linear, left bottom, left top, color-stop(0.85, white), color-stop(0.99, #eeeeee));\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -webkit-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -moz-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -o-linear-gradient(bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, -ms-linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2.png\') no-repeat 100% -22px, linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n}\n\n.select2-drop.select2-drop-above .select2-search input {\n    margin-top: 4px;\n}\n\n.select2-search input.select2-active {\n    background: #fff url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%;\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -webkit-gradient(linear, left bottom, left top, color-stop(0.85, white), color-stop(0.99, #eeeeee));\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -webkit-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -moz-linear-gradient(center bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -o-linear-gradient(bottom, white 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, -ms-linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n    background: url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%, linear-gradient(top, #ffffff 85%, #eeeeee 99%);\n}\n\n.select2-container-active .select2-choice,\n.select2-container-active .select2-choices {\n    border: 1px solid #5897fb;\n    outline: none;\n\n    -webkit-box-shadow: 0 0 5px rgba(0,0,0,.3);\n       -moz-box-shadow: 0 0 5px rgba(0,0,0,.3);\n            box-shadow: 0 0 5px rgba(0,0,0,.3);\n}\n\n.select2-dropdown-open .select2-choice {\n    border-bottom-color: transparent;\n    -webkit-box-shadow: 0 1px 0 #fff inset;\n       -moz-box-shadow: 0 1px 0 #fff inset;\n            box-shadow: 0 1px 0 #fff inset;\n\n    -webkit-border-bottom-left-radius: 0;\n        -moz-border-radius-bottomleft: 0;\n            border-bottom-left-radius: 0;\n\n    -webkit-border-bottom-right-radius: 0;\n        -moz-border-radius-bottomright: 0;\n            border-bottom-right-radius: 0;\n\n    background-color: #eee;\n    background-image: -webkit-gradient(linear, left bottom, left top, color-stop(0, white), color-stop(0.5, #eeeeee));\n    background-image: -webkit-linear-gradient(center bottom, white 0%, #eeeeee 50%);\n    background-image: -moz-linear-gradient(center bottom, white 0%, #eeeeee 50%);\n    background-image: -o-linear-gradient(bottom, white 0%, #eeeeee 50%);\n    background-image: -ms-linear-gradient(top, #ffffff 0%,#eeeeee 50%);\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#eeeeee\', endColorstr=\'#ffffff\',GradientType=0 );\n    background-image: linear-gradient(top, #ffffff 0%,#eeeeee 50%);\n}\n\n.select2-dropdown-open .select2-choice div {\n    background: transparent;\n    border-left: none;\n    filter: none;\n}\n.select2-dropdown-open .select2-choice div b {\n    background-position: -18px 1px;\n}\n\n/* results */\n.select2-results {\n    max-height: 200px;\n    padding: 0 0 0 4px;\n    margin: 4px 4px 4px 0;\n    position: relative;\n    overflow-x: hidden;\n    overflow-y: auto;\n    -webkit-tap-highlight-color: rgba(0,0,0,0);\n}\n\n.select2-results ul.select2-result-sub {\n    margin: 0;\n}\n\n.select2-results ul.select2-result-sub > li .select2-result-label { padding-left: 20px }\n.select2-results ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 40px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 60px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 80px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 100px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 110px }\n.select2-results ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub ul.select2-result-sub > li .select2-result-label { padding-left: 120px }\n\n.select2-results li {\n    list-style: none;\n    display: list-item;\n    background-image: none;\n}\n\n.select2-results li.select2-result-with-children > .select2-result-label {\n    font-weight: bold;\n}\n\n.select2-results .select2-result-label {\n    padding: 3px 7px 4px;\n    margin: 0;\n    cursor: pointer;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n}\n\n.select2-results .select2-highlighted {\n    background: #3875d7;\n    color: #fff;\n}\n\n.select2-results li em {\n    background: #feffde;\n    font-style: normal;\n}\n\n.select2-results .select2-highlighted em {\n    background: transparent;\n}\n\n.select2-results .select2-highlighted ul {\n    background: white;\n    color: #000;\n}\n\n\n.select2-results .select2-no-results,\n.select2-results .select2-searching,\n.select2-results .select2-selection-limit {\n    background: #f4f4f4;\n    display: list-item;\n}\n\n/*\ndisabled look for disabled choices in the results dropdown\n*/\n.select2-results .select2-disabled.select2-highlighted {\n    color: #666;\n    background: #f4f4f4;\n    display: list-item;\n    cursor: default;\n}\n.select2-results .select2-disabled {\n  background: #f4f4f4;\n  display: list-item;\n  cursor: default;\n}\n\n.select2-results .select2-selected {\n    display: none;\n}\n\n.select2-more-results.select2-active {\n    background: #f4f4f4 url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100%;\n}\n\n.select2-more-results {\n    background: #f4f4f4;\n    display: list-item;\n}\n\n/* disabled styles */\n\n.select2-container.select2-container-disabled .select2-choice {\n    background-color: #f4f4f4;\n    background-image: none;\n    border: 1px solid #ddd;\n    cursor: default;\n}\n\n.select2-container.select2-container-disabled .select2-choice div {\n    background-color: #f4f4f4;\n    background-image: none;\n    border-left: 0;\n}\n\n.select2-container.select2-container-disabled .select2-choice abbr {\n    display: none\n}\n\n\n/* multiselect */\n\n.select2-container-multi .select2-choices {\n    height: auto !important;\n    height: 1%;\n    margin: 0;\n    padding: 0;\n    position: relative;\n\n    border: 1px solid #aaa;\n    cursor: text;\n    overflow: hidden;\n\n    background-color: #fff;\n    background-image: -webkit-gradient(linear, 0% 0%, 0% 100%, color-stop(1%, #eeeeee), color-stop(15%, #ffffff));\n    background-image: -webkit-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -moz-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -o-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: -ms-linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n    background-image: linear-gradient(top, #eeeeee 1%, #ffffff 15%);\n}\n\n.select2-locked {\n  padding: 3px 5px 3px 5px !important;\n}\n\n.select2-container-multi .select2-choices {\n    min-height: 26px;\n}\n\n.select2-container-multi.select2-container-active .select2-choices {\n    border: 1px solid #5897fb;\n    outline: none;\n\n    -webkit-box-shadow: 0 0 5px rgba(0,0,0,.3);\n       -moz-box-shadow: 0 0 5px rgba(0,0,0,.3);\n            box-shadow: 0 0 5px rgba(0,0,0,.3);\n}\n.select2-container-multi .select2-choices li {\n    float: left;\n    list-style: none;\n}\n.select2-container-multi .select2-choices .select2-search-field {\n    margin: 0;\n    padding: 0;\n    white-space: nowrap;\n}\n\n.select2-container-multi .select2-choices .select2-search-field input {\n    padding: 5px;\n    margin: 1px 0;\n\n    font-family: sans-serif;\n    font-size: 100%;\n    color: #666;\n    outline: 0;\n    border: 0;\n    -webkit-box-shadow: none;\n       -moz-box-shadow: none;\n            box-shadow: none;\n    background: transparent !important;\n}\n\n.select2-container-multi .select2-choices .select2-search-field input.select2-active {\n    background: #fff url(\'contrib/select2-3.3.1/select2-spinner.gif\') no-repeat 100% !important;\n}\n\n.select2-default {\n    color: #999 !important;\n}\n\n.select2-container-multi .select2-choices .select2-search-choice {\n    padding: 3px 5px 3px 18px;\n    margin: 3px 0 3px 5px;\n    position: relative;\n\n    line-height: 13px;\n    color: #333;\n    cursor: default;\n    border: 1px solid #aaaaaa;\n\n    -webkit-border-radius: 3px;\n       -moz-border-radius: 3px;\n            border-radius: 3px;\n\n    -webkit-box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n       -moz-box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n            box-shadow: 0 0 2px #ffffff inset, 0 1px 0 rgba(0,0,0,0.05);\n\n    -webkit-background-clip: padding-box;\n       -moz-background-clip: padding;\n            background-clip: padding-box;\n\n    -webkit-touch-callout: none;\n      -webkit-user-select: none;\n       -khtml-user-select: none;\n         -moz-user-select: none;\n          -ms-user-select: none;\n              user-select: none;\n\n    background-color: #e4e4e4;\n    filter: progid:DXImageTransform.Microsoft.gradient( startColorstr=\'#eeeeee\', endColorstr=\'#f4f4f4\', GradientType=0 );\n    background-image: -webkit-gradient(linear, 0% 0%, 0% 100%, color-stop(20%, #f4f4f4), color-stop(50%, #f0f0f0), color-stop(52%, #e8e8e8), color-stop(100%, #eeeeee));\n    background-image: -webkit-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -moz-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -o-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: -ms-linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n    background-image: linear-gradient(top, #f4f4f4 20%, #f0f0f0 50%, #e8e8e8 52%, #eeeeee 100%);\n}\n.select2-container-multi .select2-choices .select2-search-choice span {\n    cursor: default;\n}\n.select2-container-multi .select2-choices .select2-search-choice-focus {\n    background: #d4d4d4;\n}\n\n.select2-search-choice-close {\n    display: block;\n    width: 12px;\n    height: 13px;\n    position: absolute;\n    right: 3px;\n    top: 4px;\n\n    font-size: 1px;\n    outline: none;\n    background: url(\'contrib/select2-3.3.1/select2.png\') right top no-repeat;\n}\n\n.select2-container-multi .select2-search-choice-close {\n    left: 3px;\n}\n\n.select2-container-multi .select2-choices .select2-search-choice .select2-search-choice-close:hover {\n  background-position: right -11px;\n}\n.select2-container-multi .select2-choices .select2-search-choice-focus .select2-search-choice-close {\n    background-position: right -11px;\n}\n\n/* disabled styles */\n.select2-container-multi.select2-container-disabled .select2-choices{\n    background-color: #f4f4f4;\n    background-image: none;\n    border: 1px solid #ddd;\n    cursor: default;\n}\n\n.select2-container-multi.select2-container-disabled .select2-choices .select2-search-choice {\n    padding: 3px 5px 3px 5px;\n    border: 1px solid #ddd;\n    background-image: none;\n    background-color: #f4f4f4;\n}\n\n.select2-container-multi.select2-container-disabled .select2-choices .select2-search-choice .select2-search-choice-close {\n    display: none;\n}\n/* end multiselect */\n\n\n.select2-result-selectable .select2-match,\n.select2-result-unselectable .select2-match {\n    text-decoration: underline;\n}\n\n.select2-offscreen {\n    position: absolute;\n    left: -10000px;\n}\n\n/* Retina-ize icons */\n\n@media only screen and (-webkit-min-device-pixel-ratio: 1.5), only screen and (min-resolution: 144dpi)  {\n  .select2-search input, .select2-search-choice-close, .select2-container .select2-choice abbr, .select2-container .select2-choice div b {\n      background-image: url(\'contrib/select2-3.3.1/select2x2.png\') !important;\n      background-repeat: no-repeat !important;\n      background-size: 60px 40px !important;\n  }\n  .select2-search input {\n      background-position: 100% -21px !important;\n  }\n}\n.clearfix{*zoom:1;}.clearfix:before,.clearfix:after{display:table;content:\"\";line-height:0;}\n.clearfix:after{clear:both;}\n.hide-text{font:0/0 a;color:transparent;text-shadow:none;background-color:transparent;border:0;}\n.input-block-level{display:block;width:100%;min-height:26px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;}\n.ie7-force-layout{*min-width:0;}\n.select2-container{min-width:200px;margin-bottom:8px;}.select2-container .select2-choice{background-color:#ebebeb;background-image:-moz-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#f5f5f5), to(#dcdcdc));background-image:-webkit-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-o-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:linear-gradient(to bottom, #f5f5f5, #dcdcdc);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#fff5f5f5\', endColorstr=\'#ffdcdcdc\', GradientType=0);background-color:#e9e9e9;border:1px solid #aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;color:#333333;text-shadow:0 1px 0 #ffffff;-webkit-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);-moz-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);height:24px;line-height:24px;}.select2-container .select2-choice:hover{background-color:#f5f5f5;background-image:-moz-linear-gradient(top, #ffffff, #e5e5e5);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#ffffff), to(#e5e5e5));background-image:-webkit-linear-gradient(top, #ffffff, #e5e5e5);background-image:-o-linear-gradient(top, #ffffff, #e5e5e5);background-image:linear-gradient(to bottom, #ffffff, #e5e5e5);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ffffffff\', endColorstr=\'#ffe5e5e5\', GradientType=0);background-color:#eeeeee;border-color:#aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;background-position:0 0;}\n.select2-container .select2-choice span{text-shadow:0 1px 0 #ffffff;}\n.select2-container .select2-choice div{width:auto;padding-left:8px;padding-right:8px;background:transparent;border-left:none;}.select2-container .select2-choice div:after{display:inline-block;font-family:\"Splunk Icons\";content:\"\\25BE\";font-size:inherit;opacity:0.8;filter:alpha(opacity=80);}\n.select2-container .select2-choice div:hover{opacity:1;filter:alpha(opacity=100);}\n.select2-container .select2-choice div b{display:none;}\n.select2-container .select2-choice .select2-search-choice-close{background:none;top:1px;}.select2-container .select2-choice .select2-search-choice-close:before{display:inline-block;font-family:\"Splunk Icons\";content:\"\\2297\";font-size:16px;opacity:0.8;filter:alpha(opacity=80);}\n.select2-container .select2-choice .select2-search-choice-close:hover{opacity:1;filter:alpha(opacity=100);}\n.select2-drop{background-color:#e9e9e9;background-color:#e7e7e7;background-image:-moz-linear-gradient(top, #dfdfdf, #f3f3f3);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#dfdfdf), to(#f3f3f3));background-image:-webkit-linear-gradient(top, #dfdfdf, #f3f3f3);background-image:-o-linear-gradient(top, #dfdfdf, #f3f3f3);background-image:linear-gradient(to bottom, #dfdfdf, #f3f3f3);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ffdfdfdf\', endColorstr=\'#fff3f3f3\', GradientType=0);border:1px solid #aeaeae;border-bottom-color:#989898;border-top-color:#b7b7b7;filter:progid:DXImageTransform.Microsoft.gradient(enabled = false);box-shadow:1px 6px 5px rgba(0, 0, 0, 0.3);-webkit-border-radius:8px;-moz-border-radius:8px;border-radius:8px;-webkit-border-top-left-radius:0;-moz-border-radius-topleft:0;border-top-left-radius:0;-webkit-border-top-right-radius:0;-moz-border-radius-topright:0;border-top-right-radius:0;border-top:none;padding:5px;}.select2-drop .select2-search{padding-left:0;padding-right:0;}.select2-drop .select2-search input{-webkit-border-radius:15px;-moz-border-radius:15px;border-radius:15px;margin-bottom:5px;}\n.select2-drop .select2-results{border:1px solid #a9a9a9;border-bottom-color:#909090;border-top-color:#b6b6b6;-webkit-border-radius:4px;-moz-border-radius:4px;border-radius:4px;background-color:#ffffff;padding:0;margin:0;}.select2-drop .select2-results .select2-result-selectable{background-color:#ffffff;border-top:1px dotted #dddddd;color:#5379af;}.select2-drop .select2-results .select2-result-selectable:hover{color:#32496a;background:#eeeeee;}\n.select2-drop .select2-results .select2-result-selectable:first-child{-webkit-border-top-left-radius:4px;-moz-border-radius-topleft:4px;border-top-left-radius:4px;-webkit-border-top-right-radius:4px;-moz-border-radius-topright:4px;border-top-right-radius:4px;border-top:none;}\n.select2-drop .select2-results .select2-result-selectable:last-child{-webkit-border-bottom-left-radius:4px;-moz-border-radius-bottomleft:4px;border-bottom-left-radius:4px;-webkit-border-bottom-right-radius:4px;-moz-border-radius-bottomright:4px;border-bottom-right-radius:4px;}\n.select2-drop .select2-no-results{text-align:center;color:red;}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 