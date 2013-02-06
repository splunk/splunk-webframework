// Copyright 2012 Splunk, Inc.

// UNDONE: Parser should default input entities with no type to text, instead
//  of sprinkling the checks throughout the validator and renderer.

define(function(require, exports, module) {
    var _ = require('underscore');
    var AppFx = require('../appfx');
    var Backbone = require("backbone");
    var BaseControl = require("../basecontrol");

    // Require the controls
    require("../chart");
    require("../resulttable");
    require("../eventtable/eventtable");
    require("../forms");
    require("../single");
    require("../timepicker");

    // Require the contexts
    require("../searchcontext");
    require("../savedsearchcontext");

    // Require 3rd part libs
    require("./gridster/jquery.gridster");

    require("css!./simplexml.css");
    require("css!./gridster/jquery.gridster.css");

    // UNDONE: searchString/searchTemplate/... should be choices
    var schema = (function() {
        // Nominal type to identify schema choice declarations.
        var Choice = function(attrs) {
            // The default is to choose based on entity kind.
            this.$choose = function(entity) {
                if (!entity.kind) return null;
                return this[entity.kind];
            };

            if (attrs) _.extend(this, attrs);
        };

        // Nominal type to identify schema entity declarations. The function
        // takes an argument vector of dicts that represent an "inheritance"
        // chain of attributes with which to extend the base "Entity".
        var Entity = function(/*argv*/) {
            this.kind = String; // All entites have a kind
            for (var i = 0; i < arguments.length; ++i)
                _.extend(this, arguments[i]);
        }

        // Answers if the given schema represents a schema choice.
        var isChoice = function(schema) {
            return schema instanceof Choice;
        };

        // Answers if the given schema represents a simple type.
        var isSimple = function(schema) {
            // NOTE: instanceof doesn't work on simple types.
            return schema == String || schema == Object || schema == Number;
        };

        // Schema declarations
        var chart,
            dashboard,  // A dashboard style layout
            entity,     // An abstract base entity
            event,      // An event view
            fieldset,   // A form input fieldset
            form,       // A form style layout
            html,       // A literal HTML view
            input,      // An abastract base input
            inputs,     // A choice of inputs
            panel,      // A choice of views, with possible grouping
            root,       // The schema root
            row,        // a single dashboard row
            select,     // An abstract base selection input (dropdown or radio)
            simple,     // An abstract base simplexml layout (dashboard or form)
            single,     // A single value view
            table,      // A table view
            view;       // An abstract base view

        entity = new Entity();

        view = new Entity({
            earliestTime: String,
            fields: String,
            latestTime: String,
            options: Object,
            searchString: String,
            searchName: String,
            searchTemplate: String,
            // searchPostProcess: String,
            title: String,
        });

        chart = new Entity(view, {});

        event = new Entity(view, {});

        form = new Entity(view, {});

        html = new Entity({
            content: String
        });

        single = new Entity(view, {});

        table = new Entity(view, {});

        panel = new Choice({
            chart: chart,
            event: event,
            html: html,
            single: single,
            table: table,
        });

        row = new Entity({
            grouping: String,
            panels: [panel]
        });

        simple = new Entity({
            label: String,
            rows: [row],
            searchString: String
        });

        dashboard = new Entity(simple);

        inputBase = new Entity({
            default: String,
            // searchWhenChanged: Boolean,
            label: String,
            options: Object,
            populatingSearch: {
                fieldForValue: String,
                fieldForLabel: String,
                earliest: String,
                latest: String,
                $text: String
            },
            populatingSavedSearch: {
                fieldForValue: String,
                fieldForLabel: String,
                $text: String
            },
            prefix: String,
            suffix: String,
            token: String,
            type: String
        });

        select = new Entity(inputBase, {
            choices: [Object] // UNDONE: item schema
        });

        text = new Entity(inputBase, {
            seed: String
        });

        input = new Choice({
            // Inputs choose based on entity `type`
            $choose: function(entity) {
                if (entity.kind != "input") return null;
                return this[entity.type || "text"]; // UNDONE
            },
            dropdown: select,
            radio: select,
            text: text,
            time: inputBase,
        });

        fieldset = new Entity({
            autoRun: String,
            inputs: [input],
            submitButton: String
        });

        form = new Entity(simple, {
            class: String,
            searchTemplate: String,
            earliestTime: String,
            latestTime: String,
            fieldset: fieldset
        });

        root = new Choice({
            dashboard: dashboard,
            form: form
        });

        var warning = function(message) {
            console.log("Warning: " + message);
            return false;
        };

        return {
            dashboard: dashboard,
            form: form,
            root: root,

            // simple: Object/String/Number
            // array:  [schema]
            // choice: Choice
            // entity: Entity
            validate: function(data, schema) {
                schema = schema || root; // defaults to root

                if (!data) return true; // ??

                // Verify that the data value conforms to the expected simple
                // type.
                if (isSimple(schema))
                    return data.constructor == schema;

                // Verify that the data value conforms to one of the possible
                // schema choices.
                if (isChoice(schema)) {
                    var chosen = schema.$choose(data);
                    if (!chosen)
                        // Entity not allowed in this context
                        return warning("Unexpected entity: " + data.kind);
                    return this.validate(data, chosen);
                }

                // Verify that the data value conforms to the expected array
                if (_.isArray(schema)) {
                    if (!_.isArray(data))
                        return warning("An array was expected: " + data);
                    var valid = true;
                    var itemSchema = schema[0];
                    for (var i = 0; i < data.length; ++i) {
                        var item = data[i];
                        valid &= this.validate(item, itemSchema);
                    }
                    return valid;
                }

                if (_.isArray(data))
                    return warning("Unexpected array value: " + data);

                if (!_.isObject(data))
                    return warning("Expected an entity value: " + data);

                //
                // Verify that the data value conforms to the expected entity
                // schema.
                //
                //   1. Verify that all instance attributes appear in the
                //      schema
                //   2. Recurse to verify that the instance values are
                //      compatible with the type speecified in the schema.
                //
                var valid = true;
                var keys = _.keys(data);
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (!_.has(schema, key)) {
                        valid &= warning("Unexpected attribute: " + key);
                        continue;
                    }
                    itemSchema = schema[key];
                    if (!itemSchema) { // Internal error
                        valid &= warning("No schema for attribute: " + key);
                        continue;
                    }
                    valid &= this.validate(data[key], itemSchema);
                }
                return valid;
            }
        };
    })();

    var parser = {
        // Rewrite the simplexml model into canonical form. Note that this is
        // a destructive operation!
        parse: function(model) {
            model.rows = this.parseRows(model.rows); 
            return model;
        },

        parseRow: function(row) {
            if (!row.grouping)
                return row;

            var panels = row.panels;
            if (panels.length == 0)
                return row;

            // The grouping value is a comma separated list of counts of
            // consecutive items that are to be grouped together; rewrite
            // this into a list of explicit `group` entities that contain
            // the grouped members.

            var grouping = row.grouping.split(',');
            for (var i = 0; i < grouping.length; ++i)
                grouping[i] = parseInt(grouping[i]);

            var groupCount = grouping.length;
            if (groupCount > 3)
                groupCount = 3;

            var result = { panels: [] };
            for (var index = 0, groupNum = 0; groupNum < groupCount; ++groupNum) {
                // Note that the `grouping` attribute may specify more elements
                // than actualy exist!
                var count = grouping[groupNum];
                var groupNext = index + count; // First item of next group
                if (groupNext > panels.length) // Sometimes Simple XML lies
                    groupNext = panels.length;

                var group = { kind: 'group', members: [] };
                for (; index < groupNext; ++index) {
                    var member = panels[index];

                    // The group takes the title of the first member title seen
                    if (!group.title && member.title)
                        group.title = member.title;

                    group.members.push(member);
                }
                result.panels.push(group);
            }
            return result;
        },

        parseRows: function(rows) {
            for (var i = 0; i < rows.length; ++i)
                rows[i] = this.parseRow(rows[i]);
            return rows;
        },

        // Parse the options for a chart panel.
        parseChart: function(data) {
            // Process options - pass 1
            var options = this.parseInput(data);

            _.each(data.options, function(value, key) {
                // Remove 'charting.' prefix from chart property names
                if (key.indexOf("charting.") == 0)
                    key = key.slice(9);
                options[key] = value;
            });
            options.type = options.chart || "line";

            return options;
        },

        // Parse the options for an event panel.
        parseEvent: function(data) {
            return this.parsePanel(data);
        },

        // Parse options common to all inputs.
        parseInput: function(data) {
            var options = data.options || {}

            // Default is supported by all inputs and has replaced the now
            // deprecated `seed` option which is only supported on text inputs.
            if (data.default)
                options.default = data.default;

            return options;
        },

        // Parse options common to all panels.
        parsePanel: function(data) {
            var options = data.options || {};

            if (data.fields)
                options.field_list = data.fields;

            return options;
        },

        // Parse options for a selection input (dropdown & radio).
        parseSelect: function(data) {
            var options = this.parseInput(data);

            // Extract the field options from any populating search associated
            // with the input.
            var populatingKeys = [
               'populatingSearch', 
               'populatingSavedSearch' ];
            for (var i = 0; i < populatingKeys.length; ++i) {
                var populatingKey = populatingKeys[i];
                var populatingSearch = data[populatingKey];
                if (populatingSearch) {
                    if (populatingSearch.fieldForLabel)
                        options.labelField = populatingSearch.fieldForLabel;
                    if (populatingSearch.fieldForValue)
                        options.valueField = populatingSearch.fieldForValue;
                }
            }

            return options;
        },

        // Parse the search description for the given model and return a
        // record containing the corresponding search kind and options.
        parseSearch: function(data) {
            // Prefix the given query with the search command if necessarry.
            var fixupQuery = function(query) {
                query = query.trim();
                if (query[0] == '|' || query.indexOf("search ") == 0)
                    return query;
                return "search " + query;
            };

            var options = {};

            // Check the variations based on a search query
            var query = data.searchString || data.searchTemplate;
            if (query) {
                options.search = fixupQuery(query);
                options.autostart = false;
                if (data.earliestTime)
                    options.earliest_time = data.earliestTime;
                if (data.latestTime)
                    options.latest_time = data.latestTime;
                return {
                    kind: "appfx-searchcontext",
                    options: options
                }
            }

            var search = data.populatingSearch;
            if (search) {
                options.search = fixupQuery(search['$text']);
                options.autostart = true;
                if (search.earliest)
                    options.earliest_time = search.earliest;
                if (search.latest)
                    options.latest_time = search.latest;
                return {
                    kind: "appfx-searchcontext",
                    populating: true,
                    options: options
                };
            }

            // Check to see if its a saved search.
            var searchName = data.searchName;
            if (searchName) {
                options.searchname = searchName.trim();
                options.autostart = true;
                if (data.earliestTime)
                    options.earliest_time = data.earliestTime;
                if (data.latestTime)
                    options.latest_time = data.latestTime;
                return {
                    kind: "appfx-savedsearchcontext",
                    options: options
                };
            }

            // No search was specified
            return undefined;
        },

        parseSingle: function(data) {
            return this.parsePanel(data);
        },

        parseTable: function(data) {
            return this.parsePanel(data);
        },

        // Parse options common to all text inputs
        parseText: function(data) {
            var options = this.parseInput(data);

            if (data.seed)
                options.seed = data.seed;

            return options;
        },

        parseTime: function(data) {
            return this.parseInput(data);
        }
    };

    var templates = {
        submit: "<div class='input'><button class='btn submit'>Search</button></div>",
        title: "<div class='row-fluid'><div class='span12'><h3><%= title %></h3></div></div>",
        unknownInput: "<label class='unknown'>Unknown: <%= text %></label>"
    };

    // A jQuery append helper that supports array values! Takes advantage
    // of the fact that jQuery's append supports multiple arguments.
    append = function(el, value) {
        el.append.apply(el, _.isArray(value) ? value : [value]);
        return el;
    };

    // Interpolate the given template string & data and return an instance
    // of the corresponding jQuery object(s).
    var render = function(templateString, data) {
        return $(_.template(templateString, data || {}));
    };

    var renderComponent = function(kind, form, prefix, data) {
        var name = prefix + '-' + kind;

        var type = undefined;
        var options = undefined;

        switch (data.kind) {
        case "input":
            switch (data.type) {
            case "dropdown":
                type = "appfx-select";
                options = parser.parseSelect(data);
                break;
            case "radio":
                type = "appfx-radio";
                options = parser.parseSelect(data);
                break;
            case "text":
            case undefined: // defaults to text
                type = "appfx-textbox";
                options = parser.parseText(data);
                break;
            case "time":
                type = "appfx-timepicker";
                options = parser.parseTime(data);
                break;
            default:
                type = data.type;
                options = parser.parseInput(data);
                break;
            }
            break;
        case "chart":
            type = "appfx-chart";
            options = parser.parseChart(data);
            break;
        case "event":
            type = "appfx-eventtable";
            options = parser.parseEvent(data);
            break;
        case "single":
            type = "appfx-single";
            options = parser.parseSingle(data);
            break;
        case "table":
            type = "appfx-resulttable";
            options = parser.parseTable(data);
            break;
        default:
            type = data.kind;
            options = parser.parsePanel(data);
            break;
        }

        // Non-input components to the ambient search context.
        var contextName = data.kind == "input" ? "" : form._ambientSearch();
        var contextInfo = parser.parseSearch(data);
        if (contextInfo) {
            contextName = prefix + '-search';
            contextName = form._createSearch(contextName, contextInfo);
        }

        // Create the control
        var site = $("<div>").attr("id", name);
        options.el = site;
        options.contextid = contextName;
        var control = form._createControl(type, name, options);

        // If the control has an input token associated with it, then
        // record the input arguments: prefix, suffix and the control
        // supplying the input value in the map of input tokens.
        if (data.token) {
            var input = { control: control };
            if (data.prefix) input.prefix = data.prefix;
            if (data.suffix) input.suffix = data.suffix;
            form.inputs[data.token] = input;
        }

        return site;
    };

    // Render panel content for the given model
    var renderContent = function(form, prefix, panel) {
        switch (panel.kind) {
        case "html":
            return $(panel.content);

        case "group":
            return renderGroup(form, prefix, panel);

        case "chart":
        case "event":
        case "single":
        case "table":
            return renderComponent(panel.kind, form, prefix, panel);

        case "list":
        default:
            break;
        }
        return renderObject(form, panel);
    };

    var renderFieldset = function(form, prefix, model) {
        var result = $("<div class='span12'>");

        var inputs = model.inputs;
        for (var i = 0; i < inputs.length; ++i) {
            renderInput(form, prefix+"-i"+i, inputs[i]).appendTo(result);
        }

        // Submit button defaults to true
        var submitButton = true;
        if (model.submitButton)
            submitButton = model.submitButton === 'true';

        if (submitButton)
            render(templates.submit).appendTo(result);

        return $("<div class='row-fluid'>").append(result);
    };

    var renderInput = function(form, prefix, model) {
        var kind = model.type || "text";

        var input;
        switch (kind) {
        case "dropdown":
        case "radio":
        case "text":
        case "time":
            input = renderComponent(kind, form, prefix, model);
            break;

        default:
            input = render(templates.unknownInput, {text: model.type});
            break;
        }

        var label = $("<label>")
            .text(model.label || model.token || kind);

        return $("<div class='input'>")
            .append(label)
            .append(input);
    };

    var renderGroup = function(form, prefix, group) {
        var result = $("<div class='group'>");

        var members = group.members;
        for (var i = 0; i < members.length; ++i) {
            var member = members[i];
            renderContent(form, prefix+"m"+i, member).appendTo(result);
        }

        return result;
    };

    // Render data for an unknown component
    var renderObject = function(form, model) {
        return DataView.render(form, model);
    };

    // Render a panel with the given head & body content.
    var renderPanel = function(head, body) {
        return $("<div class='panel'>").append(
            $("<div class='panel-head'><h4>" + head + "</h4></div>"),
            $("<div class='panel-body'>").append(body));
    };

    // Renders JSON data as a nested HTML definition list.
    var OutlineView = {
        render: function(form, data) {
            var that = this;
            var result = $("<dl class='outline-view'>");
            _.each(_.keys(data).sort(), function(key) {
                var value = data[key];
                if (_.isObject(value))
                    value = that.render(form, value);
                $("<dt>").append(key).appendTo(result);
                $("<dd>").append(value).appendTo(result);
            });
            return result;
        },
    };

    // Renders JSON data as a nested HTML table.
    var DataView = {
        _renderArray: function(form, data) {
            var result = $("<table class='dataview-list'>");
            for (var i = 0; i < data.length; ++i) {
                var value = this.render(form, data[i]);
                var row = $("<tr>");
                $("<td class='dataview-list'>").append(i).appendTo(row);
                $("<td class='dataview-list'>").append(value).appendTo(row);
                row.appendTo(result);
            }
            return result;
        },

        _renderObject: function(form, data) {
            var that = this;
            var result = $("<table class='dataview'>");
            _.each(_.keys(data).sort(), function(key) {
                var value = that.render(form, data[key]);
                var row = $("<tr>");
                $("<td class='dataview'>").append(key).appendTo(row);
                $("<td class='dataview'>").append(value).appendTo(row);
                row.appendTo(result);
            });
            return result;
        },

        render: function(form, value) {
            var that = this;

            if (_.isArray(value))
                return this._renderArray(form, value);

            if (_.isObject(value))
                return this._renderObject(form, value);

            return value;
        },
    };

    // Renders a dashboard using a gridster style layout
    var GridsterView = Backbone.View.extend({
        // options: { form, model, name }
        initialize: function(options) {
            this.form = options.form;
            this.model = options.model; // view model
            this.name = options.name;
        },

        render: function() {
            var model = this.model;

            if (model.label)
                render(templates.title, {title: model.label})
                    .appendTo(this.$el);

            var layout = $("<div class='gridster'>").appendTo(this.$el);
            var panels = $("<ul>").appendTo(layout);

            // Grid size in cells, 
            var grid = { x: 6, y: undefined };

            // Grid physical cell size, in pixels
            var cell = { x: undefined, y: 10 };

            // Grid margins, in pixels. Note: the layout code below does 
            // not handle margins > 0!
            var margins = { x: 0, y: 0 };

            // Position of panel in cell coordinates
            var x, y, xspan, yspan;

            // Add a new panel with the given content, size & location.
            var addPanel = function(content, options) {
                var site = $("<li>")
                    .attr("data-col", options.x)
                    .attr("data-row", options.y)
                    .attr("data-sizex", options.xspan)
                    .append(content)
                    .appendTo(panels);
                // Once the content has been appended, the site's initial
                // dimensions are available, so we can set any variable grid
                // dimensions to match the content
                var yspan = options.yspan;
                if (yspan == "*") 
                    yspan = Math.ceil(content.height() / cell.y);
                site.attr("data-sizey", yspan);
                return site;
            };

            y = 1;

            if (model.fieldset) {
                var content = renderFieldset(this.form, this.name, model.fieldset);
                var options = { x: 1, y: y, xspan: 6, yspan: "*" };
                var site = addPanel(content, options);
                y += site.data("sizey");
            }

            var rowModels = model.rows;
            for (var i = 0; i < rowModels.length; ++i) {
                var rowModel = rowModels[i];

                // Default physical row  height
                rowModel.height = 200;

                var panelModels = rowModel.panels;
                if (!panelModels || panelModels.length == 0)
                    continue;

                // Compute panel spans for this row
                var panelCount = panelModels.length;
                xspan = grid.x / panelCount; // 6, 3 or 2

                // Size yspan based on initial content size
                yspan = "*";

                // The row-span will be the max yspan of panels on the row
                rspan = 0;

                x = 1;
                for (var j = 0; j < panelModels.length; ++j) {
                    var panelModel = panelModels[j];
                    var content = renderPanel(
                        panelModel.title,
                        renderContent(
                            this.form, this.name+"-r"+i+"c"+j, panelModel));
                    var options = {x: x, y: y, xspan: xspan, yspan: yspan };
                    var site = addPanel(content, options);

                    // Retrieve actual yspan of this panel
                    yspan = site.data("sizey");

                    // Record the largest yspan on this row as the row span.
                    if (yspan > rspan) 
                        rspan = yspan;

                    x += xspan;
                }
                y += rspan;
            }

            // Record the count of grid y-axis cells
            grid.y = y-1;

            // Enable gridster on the layout
            var enable = function() {
                // Set the initial widget size so the grid fills the container
                var el = $(".gridster ul", this.$el);
                var width = el.width();
                cell.x = Math.floor(width / grid.x);
                var gridster = el.gridster({ 
                    widget_base_dimensions: [cell.x, cell.y],
                    widget_margins: [margins.x, margins.y],
                    widget_selector: "li",
                    min_rows: rowModels.length,
                    min_cols: 6,
                    max_cols: 6
                }).data("gridster");
                return gridster;
            };

            var gridster = enable();

            var resize = function() {
                // Recalc widget size so that the widgets fill the current
                // container size. 
                var el = $(".gridster ul", this.$el);
                var width = el.width();
                cell.x = Math.floor(width / grid.x);
                // Note: the following code was borrowed from a pull request
                // on the gridster.js GitHub repo, and appears to work, but its
                // unclear if this method is robust and will continue to work
                // in future versions of gridster. Hopefully gridster will add
                // this as a built-in feature of the library.
                gridster.options.widget_base_dimensions = [cell.x, cell.y];
                gridster.generate_grid_and_stylesheet();
                gridster.get_widgets_from_DOM();
                gridster.set_dom_grid_height();
            };

            $(window).resize(_.debounce(resize, 50));

            return this;
        }
    });

    // Renders one row of a static dashboard.
    var renderRow = function(form, prefix, rowModel) {
        var row = $("<div class='row-fluid'>");

        var panelModels = rowModel.panels;
        if (panelModels.length == 0)
            return row;

        // Column span of each panel
        var span = 12 / panelModels.length;
        for (var i = 0; i < panelModels.length; ++i) {
            var panelModel = panelModels[i];
            var content = renderContent(form, prefix+"c"+i, panelModel);
            var panel = renderPanel(panelModel.title || "", content);
            $("<div class='span" + span + "'>")
                .append(panel)
                .appendTo(row);
        }

        return row;
    };

    // Renders a static, bootstrap styled dashboard
    var StaticView = Backbone.View.extend({
        initialize: function(options) {
            this.form = options.form;
            this.model = options.model; // view model
            this.name = options.name;
        },

        render: function() {
            var form = this.form;
            var model = this.model;
            var prefix = this.name;

            if (model.label)
                render(templates.title, {title: model.label})
                    .appendTo(this.$el);

            if (model.fieldset)
                renderFieldset(form, prefix, model.fieldset)
                    .appendTo(this.$el);

            var rows = model.rows;
            for (var i = 0; i < rows.length; ++i)
                renderRow(form, prefix+"-r"+i, rows[i])
                    .appendTo(this.$el);

            return this;
        }
    });

    // A Simple XML Form.
    var SimpleXml = BaseControl.extend({
        className: "simplexml",

        options: {
            app: "-",
            debug: false,
            validate: true
        },

        initialize: function(options) {
            this.configure();
            
            // UNDONE: change:url should call update, and other settings change
            //  should probably just call render.
            this.settings.on("change", this.update, this);
            this.update();
        },

        // Returns the name of the single, "ambient" search
        _ambientSearch: function() {
            return this.name + "-search";
        },

        _createControl: function(kind, name, options) {
            var control = AppFx.Components.create(kind, name, options);
            this.controls.push(control);
            return control;
        },

        // Create a search based on the given name and `searchInfo` and return
        // the name of the created search.
        _createSearch: function(name, searchInfo) {
            // NOTE: AppFx still requires that contexts be created *before*
            // any components that reference them, so we create them here
            // although we dont dispatch them until the view is fully rendered
            var options = {
                app: this.settings.get("app") || "-",
                cache: true,
                preview: true
            };
            searchInfo.options = _.extend(options, searchInfo.options);
            searchInfo.context = AppFx.Components.create(
                searchInfo.kind, name, searchInfo.options);

            this.searches[name] = searchInfo;
            this.searchCount++;

            return name;
        },

        // Respond to the submit button
        _onSubmit: function(e) {
            var that = e.data;
            that._submit();
        },

        _start: function() {
            // Render each control
            _.each(this.controls, function(control) {
                control.render();
            });

            // Tell all contexts that init is complete and they can start
            _.each(this.searches, function(search, name) {
                search.context.start();
            });

            // Attach a click handler for any submit button(s)
            $(".submit", this.$el).click(this, this._onSubmit);

            // Trigger that we are done.
            this.trigger("done");
        },

        // Submit all pending searches
        _submit: function() {
            // Collect current values from all input controls.
            var values = {}
            _.each(this.inputs, function(input, token) {
                var value = "";
                if (input.prefix) value += input.prefix;
                value += input.control.val();
                if (input.suffix) value += input.suffix;
                values[token] = value;
            });

            // For all non-populating searches, set the token values on the
            // search query model and dispatch the search
            _.each(this.searches, function(search, name) {
                if (search.populating) return;
                search.context.query.set(values);
                search.context.startSearch();
            });
        },

        render: function() {
            if (!this.data)
                return;

            if (this.settings.get("validate"))
                schema.validate(this.data);

            var model = parser.parse(this.data);

            // UNDONE: Move the following to canonicalize
            switch (model.kind) {
            case "dashboard":
                this.autostart = true;
                break;

            case "form":
                this.autostart = !!(model.fieldset && model.fieldset.autoRun);
                break
            }

            // All forms & dashboards have an optional, ambient search
            // UNDONE: Set root.search in canonicalize
            var info = parser.parseSearch(model);
            if (info) this._createSearch(this._ambientSearch(), info);

            var body = $("<div class='container-fluid'>").addClass(model.kind);
            if (model['class']) body.addClass(model['class']);

            this.$el.html(body);

            // Append the debug view
            var content;
            if (false && this.settings.get("debug")) {
                renderPanel("", DataView.render(this, model)).appendTo(body);
            }
            else {
                type = StaticView
                // type = GridsterView;
                view = new type({
                    el: body,
                    form: this,
                    model: model,
                    name: this.name
                });
                view.render();
            }

            this._start();

            if (this.autostart)
                this._submit();

            return this;
        },

        empty: function() {
            // Remove entire view from DOM
            this.$el.empty();

            // Cancel searches and remove context instances from registry
            _.each(this.searches, function(value, key) {
                AppFx.Components.revokeInstance(key);
            });

            // Remove control instances from registry
            _.each(this.controls, function(control) {
                AppFx.Components.revokeInstance(control.name);
            });

            this.data = null;
            this.controls = [];
            this.searches = {};
            this.searchCount = 0;
            this.inputs = {};
        },

        // Make AJAX request to retrieve view data and then render.
        update: function() {
            this.empty();

            var url = this.settings.get("url");
            if (!url) return;

            var that = this;
            $.ajax({
                url: url + "?output_mode=json",
                success: function(data) {
                    that.data = JSON.parse(data);
                    that.render();
                }
            });
        },
    });

    AppFx.Components.registerType('simplexml', SimpleXml);

    return SimpleXml;
});
