// Copyright 2012 Splunk, Inc.

// UNDONE: I am concerned about hardcoded version# in require statement below

define(function(require, exports, module) {
    var _ = require('underscore');
    var mvc = require('splunk.mvc');
    var BaseControl = require("./basecontrol");

    // jQuery 1.8 broke select2.js < v3.2, fix is in select2 master branch
    var Select2 = require("splunk/contrib/select2-3.3-2012.11.02/select2");

    // The inputs all share a single stylesheet
    require("css!./forms.css");

    // Private abstract base class for form input controls.
    var Input = BaseControl.extend({
        options: {
            contextid: null,
        },
        
        initialize: function() {
            this.configure();
            
            this.bindToComponent(this.settings.get("contextid"), this._onContextChange, this);
        },

        // Returns the affiliated search job
        _job: function() {
            if (!this.context || !this.context.manager)
                return null;
            return this.context.manager.job;
        },

        _onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }

            if (!context)
                return;

            this.context = context;
            context.on("search:progress", this._onSearchProgress, this);
            this._update(this._job());
        },

        _onSearchProgress: function(properties, job) {             
            this._update(job);
        },
        
        _update: function(job) {
            // Abstract
        },

        render: function() {
            // Abstract
            return this;
        },
        
        // Get or set the current inputs value.
        val: function(value, selector) {
            selector = selector || "input";
            var input = $(selector, this.$el);
            if (value) return input.val(value);
            return input.val();
        }
    });

    var Radio = Input.extend({
        className: "appfx-radio",
        
        options: {
            choices: null,
            valueField: "",
            labelField: "",
            default: null
        },

        events: {
            "change input:radio": "_onChange"
        },
        
        initialize: function() {
            Input.prototype.initialize.apply(this, arguments);
            
            this.settings.on(
                "change:choices change:valueField change:labelField change:default",
                _.debounce(this.render), this);  
        },

        // Propagate the radio selection change event
        _onChange: function(e) {
            this.trigger("change", this);
        },

        // Update the contents of the control if necessarry.
        _update: function(job) {
            if (!this.isRendered)
                return this;

            if (!this.context)
                return this._updateContent(null);

            job = job || this._job();

            // Render the placeholder value if the search is not done
            var loading = !job || !job.properties().isDone;
            if (loading) {
                this.$el.html("Loading..");
                return this;
            }
            
            var that = this;
            job.preview({output_mode: "json"}, function(err, data) {
                that._updateContent(data);
            });

            return this;
        },

        // Updates the contents of the control based on the given search data
        _updateContent: function(data) {
            this.$el.empty();

            var results = data && data.results;
            var choices = this.settings.get("choices");

            if (!choices && !results) {
                this.$el.html($("No results"));
                return this;
            }

            // Use the component name for the radio group name
            var name = this.settings.get("name");

            // Append a radio button with the given value and label
            function radio(el, value, label) {
                // UNDONE: template
                
                if (label.charAt(0) != ' ') label = ' '+label;
                var input = "<input type='radio' name='" + name + "' value='" + value + "'>";
                el.append(input, label, "<br>");
            };

            // Add static radio options
            var that = this;
            _.each(choices, function(choice) {
                radio(that.$el, choice.value, choice.label); 
            });

            var valueField = this.settings.get("valueField");
            var labelField = this.settings.get("labelField") || valueField;

            // Add dynamic options, if any
            if (results) {
                for (var i = 0; i < results.length; ++i) {
                    var entry = results[i];
                    var label = entry[labelField] || "(null)";
                    var value = entry[valueField];
                    radio(this.$el, value, label);
                }
            }

            // Set the default selection if specified
            var selected = this.settings.get("default");
            if (selected)
                this.val(selected);

            return this;
        },

        // UNDONE: There is an assumption that this is called before any call
        // to _onSearchProgress.
        render: function() {
            this.isRendered = true;

            return this._update(this._job());
        },

        val: function(value) {
            if (value) {
                // Attempt to check the given value
                $("input:radio[value='" + value + "']", this.$el)
                    .attr('checked', "checked");
            }
            return $("input:radio:checked", this.$el).val();
        }
    });

    splunkjs.mvc.Components.registerType("appfx-radio", Radio);

    //
    // A select box whose contents is populated by the results of a search.
    // The option value and option text are taken from the fields given in the
    // corresponding `valueField` and `labelField` settings.get("") The component does 
    // not display previews. It can bind to a search context that provides 
    // previews but it will ignore any preview results.
    //
    // The control currently uses the `select2` library which provides some
    // convenient features and styling for select boxes.
    //
    // labelField
    //
    //   Field to use for option label, will default to valueField if not 
    //   provided.
    //
    // valueField 
    //
    //   Field to use for option value (and, optionally, option label)
    //
    // CONSIDER: Rename Select => DropDown or ComboBox and/or ListBox
    // CONSIDER: Overrides for rendering `Loading` and `No results` so the code
    //   can be shared in the base class and can be subclassed.
    //
    require("css!splunk/contrib/select2-3.3-2012.11.02/select2.css");

    var Select = BaseControl.extend({
        className: "appfx-select",

        options: {
            contextid: null,
            choices: null,
            valueField: "",
            labelField: "",
            default: null
        },

        events: {
            "change select": "_onChange"
        },

        initialize: function() {
            this.configure();
            this.settings.on(
                "change:choices change:valueField change:labelField change:default",
                _.debounce(this.render), this);
            
            this.bindToComponent(this.settings.get("contextid"), this._onContextChange, this);
        },
        
        // Returns the affiliated search job
        _job: function() {
            if (!this.context || !this.context.manager)
                return null;
            return this.context.manager.job;
        },

        // Propagate the select option change event
        _onChange: function(e) {
            this.trigger("change", this);
        },

        _onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }

            if (!context) 
                return;

            this.context = context;
            this.context.on("search:progress", this._onSearchProgress, this);
            this._update();
        },

        _onSearchProgress: function(properties, job) {             
            this._update(job);
        },
        
        _update: function(job) {
            if (!this.isRendered)
                return this;

            var select = $("select", this.$el);

            if (!this.context)
                return this._updateContent(null);

            job = job || this._job();

            // Render the placeholder value if the search is not done
            var loading = !job || !job.properties().isDone;
            if (loading) {
                // NOTE: An empty option is rquired to display the placeholder
                select.html($("<option>"));
                select.select2({ placeholder: "Loading.." });
                return this;
            }
            
            var that = this;
            job.preview({output_mode: "json"}, function(err, data) {
                that._updateContent(data);
            });

            return this;
        },

        // Updates the contents of the control.
        _updateContent: function(data) {
            var select = $("select", this.$el).empty();

            var results = data && data.results;
            var choices = this.settings.get("choices");

            if (!choices && !results) {
                select.html($("<option>"));
                select.select2({ placeholder: "No results" });
                return this;
            }

            // Add static settings.get("")
            _.each(choices, function(choice) {
                select.append(new Option(choice.label, choice.value));
            });

            // Add dynamic options, if any
            if (results) {
                var valueField = this.settings.get("valueField");
                var labelField = this.settings.get("labelField") || valueField;
                for (var i = 0; i < results.length; ++i) {
                    var row = results[i];
                    var label = row[labelField];
                    var value = row[valueField];
                    if (!label && !value) continue;
                    var option = $("<option>");
                    if (label) option.text(label);
                    if (value) option.attr("value", value);
                    select.append(option);
                }
            }

            select.select2({ placeholder: null });

            // Set the default selection if specified
            var selected = this.settings.get("default");
            if (selected)
                this.val(selected);

            return this;
        },

        // UNDONE: There is an assumption that this is called before any call
        // to _onSearchProgress.
        render: function() {
            this.isRendered = true;

            // Render the initial select element if it does not exist
            var select = $("select", this.$el);
            if (select.length == 0)
                this.$el.html($("<select>"));

            return this._update(this._job());
        },
        
        val: function(value) {
            var select = $("select", this.$el);
            if (!value) // Get value
                return select.val();
            select.val(value);
            select.select2(); // Keep select2 widget in sync
        }
    });
    
    splunkjs.mvc.Components.registerType("appfx-select", Select);

    var TextBox = Input.extend({
        className: "appfx-textbox",

        options: {
            default: "",
            seed: ""
        },

        events: {
            "change": "_onChange"
        },
        
        initialize: function() {
            Input.prototype.initialize.apply(this, arguments);
            this.settings.on("change:default change:seed", _.debounce(this.render), this);  
        },

        // Propagate the radio selection change event
        _onChange: function(e) {
            this.trigger("change", this);
        },

        render: function() {
            this.isRendered = true;

            this.$el.html($("<input type='text'>"));

            // The `seed` option has been deprecated and replaced by the
            // `default` option, which is supported on all inputs. If a text
            // input has both the `default` wins.
            var selected = this.settings.get("default");
            if (selected) {
                this.val(selected);
            }
            else {
                var seed = this.settings.get("seed");
                if (seed)
                    this.val(seed);
            }
            
            return this;
        },
    });

    splunkjs.mvc.Components.registerType("appfx-textbox", TextBox);
    
    return {
        Radio: Radio,
        Select: Select,
        TextBox: TextBox
    };
});
