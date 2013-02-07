// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('splunkui');
    var Backbone = require('backbone');
    var BaseControl = require("./basecontrol");
    var Messages = require("./messages");

    require("css!./resulttable.css");
        
    var allowedKey = function(key) {
        return !(key[0] === "_" && key !== "_time");
    };

    var ResultTableHeaderView = Backbone.View.extend({
        tagName: 'tr',
        
        initialize: function() {
            this.fields = this.options.fields;
        },
        
        render: function() {
            this.$el.html(_.template(ResultTableHeaderView.template, {
                fields: this.fields,
                allowed: allowedKey
            }));
            
            return this;
        }
    },
    {
        template: ' \
<th class="result-table-header-cell result-table-header-row-number"></td> \
<% _.each(fields, function(key, idx) { %> \
    <% if (!allowed(key)) return; %> \
    <th class="sorts" data-column="<%= idx %>" data-key="<%= key %>""><%=key%></td> \
<% }); %>'
    });

    var ResultTableRowView = Backbone.View.extend({
        tagName: 'tr',
        
        initialize: function() {
            this.fields = this.options.fields;
            this.formatters = this.options.formatters || {};
            
            var that = this;
            _.each(this.fields, function(field) {
                // Make sure we have a formatter for every field, even if it is
                // just the identity formatter
                that.formatters[field] = that.formatters[field] || function(value) { 
                    return value;
                };
            });
        },
        
        render: function() {
            var model = this.model.toJSON();
            
            this.$el.html(_.template(ResultTableRowView.template, {
                model: model, 
                fields: this.fields,
                allowed: allowedKey,
                formatters: this.formatters
            }));
            
            return this;
        }
    },
    {
        template: ' \
<td class="result-table-cell result-table-row-number"><%=model._serial%></td> \
<% _.each(fields, function(key, idx) { %> \
    <% if (!allowed(key)) return; %> \
    <td class="result-table-cell" data-column="<%= idx %>" data-key="<%= key %>""><%=formatters[key](model[key] || "")%></td> \
<% }); %>'
    });

    var ResultTable = BaseControl.extend({
        className: "appfx-resulttable clearfix",

        events: {
            "click tr[data-index]": "onRowClicked",
            "click td[data-column][data-key]": "onCellClicked"
        },

        options: {
            contextid: null,
            datasource: "preview",
            itemCount: -1,
            page: 0,
            pageSize: 10,
            headerView: ResultTableHeaderView,
            rowView: ResultTableRowView,
            fields: null,
            formatters: null
        },
        
        initialize: function() {
            this.configure();
            this.settings.on("change:page change:pageSize", _.debounce(this.onSelfPaginationChange), this);
            this.settings.on(
                "change:rowView change:headerView change:fields change:formatters", 
                _.debounce(this.render), this);

            this.bindToComponent(this.settings.get("paginator"), this.onPaginatorChange, this);
            this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
        },
        
        onContextChange: function(contexts, context) {
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
                Messages.render('no-search', this.$el);
                return;
            }

            this.context = context;
            this.datasource = this.context.data(this.settings.get("datasource"), {
                output_mode: "json_rows", 
                output_time_format: "%d/%m/%y %l:%M:%S.%Q %p",
                show_empty_fields: "True",
                count: this.settings.get("pageSize"),
                offset: this.settings.get("page") * this.settings.get("pageSize")
            });
            
            context.on("search:start", this.onSearchStart, this);
            context.on("search:progress", this.onSearchProgress, this);
            context.on("search:cancelled", this.onSearchCancelled, this);
            context.on("search:error", this.onSearchError, this);
            this.datasource.on("data", this.onDataChanged, this);
        },

        onPaginatorChange: function(components, paginator) {
            if (this.paginator) {
                this.paginator.off(null, null, this);
            }

            this.paginator = paginator;

            this.paginator.settings.set({
                page: this.settings.get("page"),
                pageSize: this.settings.get("pageSize"),
                itemCount: this.settings.get("itemCount")
            });

            this.paginator.settings.on(
                "change:page change:pageSize", 
                _.debounce(this.onPaginationChange), this);
        },
        
        onDataChanged: function() {
            this.collection = this.datasource.collection();
            this.render();  
        },
        
        onRowClicked: function(e) {
            var index = parseInt($(e.currentTarget).attr("data-index"));
            var model = this.collection.at(index);
            
            if (model) {
                this.trigger("clicked:row",
                    {
                        model: model,
                        index: index,
                        originalEvent: e,
                        component: this
                    },
                    this
                );
            }
        },
        
        onCellClicked: function(e) {
            var index = parseInt($(e.currentTarget).parent().attr("data-index"));
            var column = $(e.currentTarget).attr("data-column");
            var key = $(e.currentTarget).attr("data-key");
            var model = this.collection.at(index);
            var value = model.get(key);
            
            if (model) {
                this.trigger("clicked:cell",
                    {
                        model: model,
                        index: index,
                        column: column,
                        key: key,
                        value: value,
                        originalEvent: e,
                        component: this
                    },
                    this
                );
            }
        },
        
        render: function() {
            this.$el.html(_.template(ResultTable.template));

            if (!this.datasource || !this.datasource.hasData()) {
                return this;
            }

            var fields = this.settings.get("fields") || this.collection.raw.fields;
            var formatters = this.settings.get("formatters");
            var RowView = this.settings.get("rowView");
            var HeaderView = this.settings.get("headerView");
            
            var headerView = new HeaderView({fields: fields});
            
            var els = [];
            this.collection.each(function(model, idx) {
                var rowView = new RowView({
                    model: model, 
                    fields: fields, 
                    formatters: formatters
                });
                els.push(rowView.render().el);
                
                rowView.$el.attr("data-index", idx);
            });
            
            this.$("thead").html('').append(headerView.render().$el);
            this.$("tbody").html('').append(els);
            
            return this;
        },
        
        // Handle paginator page settings change.
        onPaginationChange: function(model) {
            var page = this.paginator.settings.get("page");
            var pageSize = this.paginator.settings.get("pageSize");
            var startingIndex = page * pageSize;
            
            this.settings.set({
                page: page,
                pageSize: pageSize
            });
            
            this.datasource.set({
                count: pageSize,
                offset: startingIndex
            });
        },
        
        // Handle pagination change on ourselves
        onSelfPaginationChange: function() {
            var page = this.settings.get("page");
            var pageSize = this.settings.get("pageSize");
            var startingIndex = page * pageSize;
            
            this.datasource.set({
                conut: pageSize,
                offset: startingIndex    
            });
        },

        onSearchProgress: function(properties, job) {                
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = content.isDone || false;
            var isReportSearch = !!content.reportSearch;
            
            /* UNDONE: The simplexml app and all form search examples in the
               formlab app trigger this condition.
            if (isJobDone && !isReportSearch) {
                Messages.render('no-stats', this.$el);
                return;
            }
            */
            
            if (previewCount === 0 && isJobDone) {
                Messages.render('no-results', this.$el);
                return;
            }
            
            if (previewCount === 0) {
                Messages.render('waiting', this.$el);
                return;
            }
            
            if (this.datasource) {
                this.settings.set("itemCount", previewCount);
                if (this.paginator) {
                    this.paginator.settings.set({
                        itemCount: this.settings.get("itemCount")
                    });
                }
            }
        },
        
        onSearchStart: function() { 
            Messages.render('waiting', this.$el);
        },
        
        onSearchCancelled: function() { 
            Messages.render('cancelled', this.$el);
        },
            
        onSearchError: function(message) {
            Messages.render({
                level: "warning",
                icon: "warning-sign",
                message: message
            }, this.$el);
        }
    },
    {
        template: '\
<table class="table table-striped table-chrome">\
  <thead></thead>\
  <tbody></tbody>\
</table>'
    });
    
    AppFx.Components.registerType('appfx-resulttable', ResultTable);
    
    return ResultTable;
});
