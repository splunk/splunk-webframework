require.config({
    shim: {
        "./jquery.dragdrop": {
            deps: [],
            exports: "jQuery.fn.sortable"
        }
    }
});

define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('splunkjs.mvc');
    var Backbone = require("backbone");
    var BaseControl = require("../basecontrol");
    var DragDrop = require("./jquery.dragdrop");
    var Messages = require("../messages");

    require("css!./eventtable.css");

    var FIXED_PAGE_WINDOW_SIZE = 11;
            
    var getPagination = function(eventCount, offset, perPage) {
        var currentPage = Math.floor(offset / perPage) + 1;
        var totalPages = Math.ceil(eventCount / perPage);
        
        if (totalPages <= FIXED_PAGE_WINDOW_SIZE) {
            return {
                start: 1,
                end: totalPages + 1,
                current: currentPage,
                total: totalPages
            }
        }  
        
        var start = (currentPage - 1) - FIXED_PAGE_WINDOW_SIZE / 2;
        var end = (currentPage - 1) + FIXED_PAGE_WINDOW_SIZE / 2;
        
        if ((FIXED_PAGE_WINDOW_SIZE % 2) === 0) {
            end--;
        }
        
        if (start < 0) {
            end += (-start);
            start = 0;
        }
        else if (end > totalPages) {
            start = totalPages - FIXED_PAGE_WINDOW_SIZE;
            end = totalPages;
        }
        else {
            end++;
        }
        
        return {
            start: Math.ceil(start + 1),
            end: Math.floor(end + 1),
            current: currentPage,
            total: totalPages
        };
    };
    
    var FieldAdderView = Backbone.View.extend(
        {
            initialize: function(options) {
                this.summaryData = options.summaryData;
                this.fields = options.fields;
            },
            
            render: function() {
                this.$el.append(_.template(FieldAdderView.template, {
                    availableFields: this.fields.get("available")
                }));
            
                return this;
            },
            
            events: {
                "click a[data-field]": "onAddFieldClicked"
            },
            
            onAddFieldClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                var chosenFields = this.fields.get("chosen").slice();
                var availableFields = this.fields.get("available").slice();
                
                // A utility function to help us add all the fields
                // that are above a certain coverage threshold
                var that = this;
                var addFieldsWithEnoughCoverage = function(threshold) {
                    var eventCount = that.summaryData.event_count;
                    for(var i = 0; i < availableFields.length; i++) {
                        var fieldName = availableFields[i];
                        var field = that.summaryData.fields[fieldName];
                        var frequency = field.count / eventCount;
                        
                        if (frequency >= threshold && chosenFields.indexOf(fieldName)) {
                            chosenFields.push(fieldName);
                        }
                    }
                };
                
                var fieldName = $(e.currentTarget).attr("data-field");
                if (fieldName[0] === ">" && fieldName[1] === "=") {
                    switch (fieldName) {
                        case ">=100per": {
                            addFieldsWithEnoughCoverage(1);
                            break;
                        }
                        case ">=80per": {
                            addFieldsWithEnoughCoverage(0.8);
                            break;
                        }
                        case ">=50per": {
                            addFieldsWithEnoughCoverage(0.5);
                            break;
                        }
                    }
                }
                else if (chosenFields.indexOf(fieldName) < 0) {
                    chosenFields.push(fieldName);
                }
                                
                availableFields = _.difference(availableFields, chosenFields);
                that.fields.set({chosen: chosenFields, available: availableFields});
            },
        },
        {
            template: ' \
<div class="dropdown pull-left"> \
    <a href="#" class="btn btn-mini dropdown-toggle add-fields" data-toggle="dropdown"> \
        <span class="font-icon">+</span> \
    </a> \
    <ul class="dropdown-menu"> \
        <div>\
        <% for(var i = 0; i < availableFields.length; i++) { %> \
            <li> \
                <a href="#" data-field="<%= availableFields[i] %>"><%= availableFields[i] %></a> \
            </li> \
        <% } %> \
        </div> \
        <li class="divider"></li> \
        <li><a href="#" data-field=">=100per">Add fields with 100% coverage</a></li> \
        <li><a href="#" data-field=">=80per">Add fields with >80% coverage</a></li> \
        <li><a href="#" data-field=">=50per">Add fields with >50% coverage</a></li> \
    </ul> \
</div>'
        }
    );
    
    var FieldHeaderView = Backbone.View.extend(
        {
            tagName: 'div',
            className: 'field',
            
            initialize: function(options) {
                this.field = options.field;
                this.fields = options.fields;
                this.sorting = options.sorting;
                this.sortingEnabled = options.sortingEnabled;
                this.removeEnabled = options.removeEnabled;
                this.reorderingEnabled = options.reorderingEnabled;
                
                if (this.sortingEnabled && this.sorting.get("field") === this.field) {
                    this.sort = this.sorting.get("direction");
                }
            },
            
            render: function() {
                this.$el.html(_.template(FieldHeaderView.template, {
                    field: this.field,
                    sort: this.sort,
                    sortingEnabled: this.sortingEnabled,
                    removeEnabled: this.removeEnabled,
                    reorderingEnabled: this.reorderingEnabled
                }));
            
                this.$el.attr('data-field', this.field);
            
                return this;
            },
            
            events: {
                "click a.field-action": "onFieldActionClicked"
            },
            
            onFieldActionClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                var action = $(e.currentTarget).attr("data-action");
                var fieldName = $(e.currentTarget).parents("[data-field]").attr("data-field");
                
                if (action === "remove") {
                    var chosenFields = this.fields.get("chosen").slice();
                    var availableFields = this.fields.get("available").slice();
                    
                    if (chosenFields.indexOf(fieldName) >= 0) {
                        chosenFields = _.without(chosenFields, fieldName);
                        availableFields.push(fieldName);
                        availableFields.sort();
                        
                        this.fields.set({chosen: chosenFields, available: availableFields});
                    }
                }
                else if (action === "sort") {
                    var field = fieldName;
                    var direction = "-";
                    
                    if (this.sorting.get("field") === fieldName) {
                        direction = this.sorting.get("direction") === "+" ? "-" : "+";
                    }
                    
                    this.sorting.set({field: field, direction: direction});
                }
            }
        },
        {
            template: ' \
<span class="field-label <% print(reorderingEnabled ? "reorderable" : "") %>"><%= field %></span> \
<% if (removeEnabled) { %> \
    <a href="#" class="field-action" data-action="remove"> \
        <span class="font-icon">✗</span> \
    </a> \
<% } %> \
<% if (sortingEnabled) { %> \
    <a href="#" class="field-action" data-action="sort"> \
        <span class="font-icon"> \
            <% if(sort && sort === "+") print("↥") %> \
            <% if(sort && sort === "-") print("↧") %> \
            <% if(!sort) print("↕") %> \
        </span> \
    </a> \
<% } %>'
        }
    );

    var EventListItemView = Backbone.View.extend(
        {
            tagName: 'tr',
            
            initialize: function(options) {
                this.event = options.event;
                this.fields = options.fields;
                this.showRowNumbers = options.showRowNumbers;
            },
            
            render: function() {
                this.$el.html(_.template(EventListItemView.template, {
                    event: this.event,
                    chosenFields: this.fields.get("chosen"),
                    showRowNumbers: this.showRowNumbers
                }));
                
                return this;
            }
        },
        {
            template: ' \
<% if (showRowNumbers) { %> \
    <td class="row-number"><% print(parseInt(event._serial)+1) %></td> \
<% } %> \
<td class="event-dropdown"> \
    <div class="btn-group"> \
      <button class="btn btn-mini dropdown-toggle" data-toggle="dropdown"> \
        <span class="caret"></span> \
      </button> \
      <ul class="dropdown-menu"> \
        <li><a href="#">Option 1</a></li> \
        <li><a href="#">Option 2</a></li> \
        <li><a href="#">Option 3</a></li> \
      </ul> \
    </div> \
</td> \
<td class="date-content"><%= event._time %></td> \
<td class="raw-content"> \
    <span class="content"><%= event._raw %></span> \
    <div class="event-field-info"> \
        <% for(var i = 0; i < chosenFields.length; i++) { %> \
            <% if (!event.hasOwnProperty(chosenFields[i]) || !event[chosenFields[i]]) continue %> \
            <div class="event-field-name"><%=chosenFields[i]%>:</div> \
            <span class="event-field-value"><% print(event[chosenFields[i]]) %></span> \
        <% } %> \
    </div> \
</td>'
        });

    var EventTableItemView = Backbone.View.extend(
        {
            tagName: 'tr',
            
            initialize: function(options) {
                this.event = options.event;
                this.fields = options.fields;
                this.showRowNumbers = options.showRowNumbers;
            },
            
            render: function() {
                this.$el.html(_.template(EventTableItemView.template, {
                    event: this.event,
                    chosenFields: this.fields.get("chosen"),
                    showRowNumbers: this.showRowNumbers
                }));
                
                return this;
            }
        },
        {
            template: ' \
<% if (showRowNumbers) { %> \
    <td class="row-number"><% print(parseInt(event._serial)+1) %></td> \
<% } %> \
<td class="event-dropdown"> \
    <div class="btn-group"> \
      <button class="btn btn-mini dropdown-toggle" data-toggle="dropdown"> \
        <span class="caret"></span> \
      </button> \
      <ul class="dropdown-menu"> \
        <li><a href="#">Option 1</a></li> \
        <li><a href="#">Option 2</a></li> \
        <li><a href="#">Option 3</a></li> \
      </ul> \
    </div> \
</td> \
<td class="date-content"><%= event._time %></td> \
<% for(var i = 0; i < chosenFields.length; i++) { %> \
    <td class="field-content"> \
        <span class="field-value"><% print(event[chosenFields[i]] || "") %></span> \
    </td> \
<% } %>'
        });

    var EventTabularView = Backbone.View.extend(
        {            
            initialize: function(options) {
                this.allEvents = options.events;
                this.fields = options.fields;
                this.showRowNumbers = options.showRowNumbers;
                this.summaryData = options.summaryData;
                this.sorting = options.sorting;
            },
            
            render: function() {
                // Render the basic template
                this.$el.html(_.template(EventTabularView.template, {
                    summary: this.summaryData,
                    availableFields: this.fields.get("available"),
                    chosenFields: this.fields.get("chosen"),
                    showRowNumbers: this.showRowNumbers,
                    sortedField: this.sorting.get("field"),
                    sortDirection: this.sorting.get("direction")
                }));
                
                // Add all the individual events
                var that = this;
                var renderedEvents = [];
                _.each(this.allEvents.get("events"), function(event) {
                    var renderedEvent = new EventTableItemView({
                        event: event,
                        fields: that.fields,
                        sorting: that.sorting,
                        showRowNumbers: that.showRowNumbers
                    });
                    
                    renderedEvents.push(renderedEvent.render().el);
                });
                this.$("tbody").append(renderedEvents);
                
                // Add the _time field
                var renderedTimeField = new FieldHeaderView({
                    field: "_time",
                    sortingEnabled: true,
                    removeEnabled: false,
                    sorting: this.sorting,
                    reorderingEnabled: false
                });
                
                $(renderedTimeField.render().el)
                    .appendTo(this.$("thead tr.fields-container"))
                    .wrap("<th></th>");
                
                // Add all the chosen fields (as headers)
                var renderedFields = [];
                _.each(this.fields.get("chosen"), function(chosenField) {
                     var renderedField = new FieldHeaderView({
                        field: chosenField,
                        fields: that.fields,
                        removeEnabled: true,
                        sortingEnabled: true,
                        sorting: that.sorting,
                        reorderingEnabled: true
                     });
                     
                     renderedFields.push(renderedField.render().el);
                });
                
                $(renderedFields)
                    .appendTo(this.$("thead tr.fields-container"))
                    .wrap("<th class='sortable'></th>");
                
                // Add the field adder (+) button
                var fieldAdder = new FieldAdderView({
                    el: this.$(".field-adder"),
                    fields: this.fields,
                    summaryData: this.summaryData
                }).render();
                
                // Set up drag/drop reordering
                this.$(".fields-container")
                    .sortable({ items: 'th.sortable'})
                    .bind('sortstop', function() {
                        var fields = that.$(".fields-container th.sortable div.field");
                        var chosenFields = $.map(fields, function(field, idx) {
                            return $(field).attr("data-field");
                        });
                        
                        that.fields.set("chosen", chosenFields);
                    });
                
                return this;
            }
        },
        {
            template: ' \
<table class="table table-striped table-chrome event-table"> \
    <thead> \
        <tr class="fields-container"> \
            <% if (showRowNumbers) { %> \
                <th></th> \
            <% } %> \
            <th class="field-adder"></th> \
        </tr> \
    </thead> \
    <tbody class="rows"> \
    </tbody>\
</table>'
        });

    var EventListView = Backbone.View.extend(
        {            
            initialize: function(options) {
                this.allEvents = options.events;
                this.fields = options.fields;
                this.showRowNumbers = options.showRowNumbers;
                this.summaryData = options.summaryData;
            },
            
            render: function() {
                this.$el.html(_.template(EventListView.template, {
                    summary: this.summaryData,
                    availableFields: this.fields.get("available"),
                    chosenFields: this.fields.get("chosen"),
                    showRowNumbers: this.showRowNumbers
                }));
                
                // Add the individual events
                var that = this;
                var renderedEvents = [];
                _.each(this.allEvents.get("events"), function(event) {
                    var renderedEvent = new EventListItemView({
                        event: event,
                        fields: that.fields,
                        showRowNumbers: that.showRowNumbers
                    });
                    
                    renderedEvents.push(renderedEvent.render().el);
                });
                this.$("tbody").append(renderedEvents);
                
                // Add all the chosen fields as headers
                var renderedFields = [];
                _.each(this.fields.get("chosen"), function(chosenField) {
                     var renderedField = new FieldHeaderView({
                        field: chosenField,
                        fields: that.fields,
                        removeEnabled: true,
                        reorderingEnabled: true
                     });
                     
                     renderedFields.push(renderedField.render().el);
                });
                
                this.$(".fields-container").prepend(renderedFields);
                
                // Add the field adder (+) button
                var fieldAdder = new FieldAdderView({
                    el: this.$(".fields-container"),
                    fields: this.fields,
                    summaryData: this.summaryData
                }).render();
                
                this.$(".fields-container")
                    .sortable({ items: 'div.field'})
                    .bind('sortstop', function() {
                        var fields = that.$(".fields-container div.field");
                        var chosenFields = $.map(fields, function(field, idx) {
                            return $(field).attr("data-field");
                        });
                        
                        that.fields.set("chosen", chosenFields);
                    });
                
                return this;
            }
        },
        {
            template: ' \
<table class="table table-striped table-chrome event-list"> \
    <tbody class="rows"> \
        <% if (summary) { %> \
        <tr class="even"> \
            <% if (showRowNumbers) { %> \
                <td class="row-number"></td> \
            <% } %> \
            <td class="event-dropdown"></td> \
            <td class="date-content"></td> \
            <td class="raw-content fields-container"> \
            </td> \
        </tr> \
        <% } %> \
    </tbody> \
</table>'
        });

    var EventTable = BaseControl.extend(
        // Instance
        {
            className: "appfx-eventtable",

            options: {
                "event-datasource": "events",
                "summary-datasource": "summary"
            },
            
            initialize: function(options) {
                // A model representing the current set of events
                this.fetchedEvents = new Backbone.Model({events: []});
                
                // A model representing the current available and chosen fields
                this.fields = new Backbone.Model({chosen: [], available: []});
                
                // A model representing the current sorting (field and direction)
                this.sorting = new Backbone.Model({field: null, direction: null});
                
                // Defaults for various options
                this.currentOffset = 0;
                this.eventsPerPage = 10;
                this.displayFormat = "list";
                this.showRowNumbers = true;
                this.numLines = 10;
                
                this.fields.on("change", this.render, this);
                this.sorting.on("change", this.goToOffset, this);
                
                Messages.render('not-started', this.$el);

                this.bindToComponent(options.contextid, this.onContextChange, this);
            },
            
            onContextChange: function(contexts, context) {
                if (this.context) {
                    this.context.off(null, null, this);
                }
                if (this.eventData) {
                    this.eventData.off(null, null, this);
                    this.eventData.destroy();
                    this.eventData = null;
                }
                if (this.summaryDatasource) {
                    this.summaryDatasource.off(null, null, this);
                    this.summaryDatasource.destroy();
                    this.summaryDatasource = null;
                }

                this.context = context;
                this.eventData = null;
                this.summaryDatasource = null;
                
                if (context) {
                    this.eventData = this.context.data(this.options["event-datasource"], {
                        autofetch: false
                    });
                    this.summaryDatasource = this.context.data(this.options["summary-datasource"], {
                        autofetch: false
                    });
                    context.on("search:start", this.onSearchStart, this);
                    context.on("search:error", this.onSearchError, this);
                    context.on("search:cancelled", this.onSearchCancelled, this);
                    context.on("search:progress", this.onSearchProgress, this);
                }
            },
            
            render: function() {
                var that = this;
                
                // Only render as a result of an event callback    
                if (this.fetchedEvents.get("events").length > 0) {
                    var pagination = getPagination(this.eventCount, this.currentOffset, this.eventsPerPage);
                    
                    this.$el.html(_.template(EventTable.template, { 
                        pagination: pagination,
                        perPage: this.eventsPerPage,
                        displayFormat: this.displayFormat,
                        showRowNumbers: this.showRowNumbers,
                        numLines: this.numLines
                    }));
                    
                    var tableEl = this.$(".table-wrapper");
                    var options = {
                        el: tableEl,
                        events: this.fetchedEvents,
                        fields: this.fields,
                        showRowNumbers: this.showRowNumbers,
                        summaryData: this.summaryData,
                        sorting: this.sorting
                    };
                    
                    var mainBody = this.displayFormat === "list" ?
                        new EventListView(options) :
                        new EventTabularView(options);
                        
                    mainBody.render();
                }

                return this;
            },
            
            goToOffset: function() {                
                var that = this;
                var offset = this.currentOffset;
                
                var sortSearch = "";
                if (this.sorting.get("field")) {
                    sortSearch = "| sort " 
                        + this.sorting.get("direction") 
                        + " " 
                        + this.sorting.get("field");
                }
                
                if (!that.eventData) {
                    return;
                }
                
                that.eventData.set({
                    count: that.eventsPerPage,
                    max_lines: this.numLines,
                    offset: offset,
                    output_time_format: "%d/%m/%y %l:%M:%S.%Q %p",
                    segmentation: "raw",
                    show_empty_fields: "True",
                    time_format: "%s.%Q",
                    truncation_mode: "abstract",
                    search: sortSearch,
                });
                that.eventData.fetch({
                    success: function() {
                        var events = that.eventData.data();
                        if (events && events.rows && events.fields) {
                            var fetchedEvents = [];
                            that.currentOffset = offset;
                            
                            var rawIndex = events.fields.indexOf("_raw");
                            var timeIndex = events.fields.indexOf("_time");
                            
                            for(var i = 0; i < events.rows.length; i++) {
                                var ev = {};
                                var row = events.rows[i];
                                var raw = row[rawIndex];
                                var time = row[timeIndex];
                                var type = ((i+1) % 2) === 0 ? "even" : "odd";
                                var index = i + that.currentOffset + 1;
                                
                                for(var j = 0; j < row.length; j++) {
                                    ev[events.fields[j]] = row[j];
                                }
                                
                                ev._serial = offset + i;
                                fetchedEvents.push(ev);
                            }
                            
                            that.fetchedEvents.set("events", fetchedEvents, {silent: true});
                            that.render();
                        }
                    }
                });
            },
            
            onSearchStart: function(properties, job) {
                this.currentOffset = 0;
                this.job = null;
                Messages.render('waiting', this.$el);
            },
            
            onSearchCancelled: function() {
                this.currentOffset = 0;
                this.job = null;
                Messages.render('cancelled', this.$el);
            },
            
            onSearchError: function(message) {
                this.currentOffset = 0;
                this.job = null;
                Messages.render({
                    level: "warning",
                    icon: "warning-sign",
                    message: message
                }, this.$el);
            },
            
            onSearchProgress: function(properties, job) {
                var that = this;
                this.eventCount = properties.content.eventCount || 0;
                this.job = job;
                
                var eventAvailableCount = properties.content.eventAvailableCount;
                var isJobDone = properties.content.isDone;
                
                if (isJobDone && eventAvailableCount === 0) {
                    Messages.render('no-events', this.$el);
                    return;
                }
                
                this.goToOffset();
                
                // TODO: fix this, we are re-rendering
                // for no reason
                if (properties.content.statusBuckets > 0 && this.summaryDatasource) {
                    this.summaryDatasource.set({
                        top_count: 10,
                        output_time_format: "%d/%m/%y %l:%M:%S.%Q %p"
                    });
                    this.summaryDatasource.fetch({
                        success: function() {
                            var summary = that.summaryDatasource.data();
                            
                            that.summaryData = summary;
                            that.fields.set(
                                "available",
                                _.difference(
                                    _.keys(summary.fields), 
                                    that.fields.get("chosen")
                                ), 
                                {silent: true}
                            );
                            
                            that.render();
                        }
                    });
                }
            },
            
            events: {
                "click .pagination-container li:not(.disabled,.active) a": "onPaginationClicked",
                "click .event-table-perpage li a": "onPerPageClicked",
                "click .event-table-format li a": "onFormatClicked"
            },
            
            onFormatClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                var action = $(e.currentTarget).attr("data-action");
                
                switch(action) {
                    case "list": {
                        this.displayFormat = "list";
                        break;
                    }
                    case "tabular": {
                        this.displayFormat = "tabular";
                        break;
                    }
                    case "row-numbers": {
                        this.showRowNumbers = !this.showRowNumbers;
                        break;
                    }
                    case "10lines": {
                        this.numLines = 10;
                        this.goToOffset();
                        break;
                    }
                    case "20lines": {
                        this.numLines = 20;
                        this.goToOffset();
                        break;
                    }
                    case "50lines": {
                        this.numLines = 50;
                        this.goToOffset();
                        break;
                    }
                    case "100lines": {
                        this.numLines = 100;
                        this.goToOffset();
                        break;
                    }
                    case "200lines": {
                        this.numLines = 200;
                        this.goToOffset();
                        break;
                    }
                    case "all-lines": {
                        this.numLines = 0;
                        this.goToOffset();
                        break;
                    }
                }
                
                this.render();
            },
            
            onPerPageClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                var perPage = $(e.currentTarget).attr("data-page").trim();
                
                this.eventsPerPage = parseInt(perPage);
                this.goToOffset();
            },
            
            onPaginationClicked: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                var page = $(e.currentTarget).attr("data-page");
                
                var offset = 0;
                if (page === 'next') {
                    offset = this.currentOffset + this.eventsPerPage;
                }
                else if (page === 'prev') {
                    offset = this.currentOffset - this.eventsPerPage;
                }
                else {
                    offset = (page - 1) * this.eventsPerPage;
                }
                
                offset = Math.max(0, Math.min(offset, this.eventCount));
                this.currentOffset = offset;
                
                this.goToOffset();
            },
        },
        // Class
        {
            template:' \
<div class="event-table-container"> \
    <div class="options-container"> \
        <div class="dropdown event-table-perpage pull-left"> \
          <a class="dropdown-toggle" data-toggle="dropdown" href="#"><%= perPage %> per page<b class="caret"></b></a> \
          <ul class="dropdown-menu"> \
            <li> \
                <a href="#" data-page="10" > \
                    <i class="icon-<% print(perPage === 10 ? "check" : "blank") %>"></i> \
                    10 per page \
                </a> \
            </li> \
            <li> \
                <a href="#" data-page="20" > \
                    <i class="icon-<% print(perPage === 20 ? "check" : "blank") %>"></i> \
                    20 per page \
                </a> \
            </li> \
            <li> \
                <a href="#" data-page="50" > \
                    <i class="icon-<% print(perPage === 50 ? "check" : "blank") %>"></i> \
                    50 per page \
                </a> \
            </li> \
            <li> \
                <a href="#" data-page="100"> \
                    <i class="icon-<% print(perPage === 100 ? "check" : "blank") %>"></i> \
                    100 per page \
                </a> \
            </li> \
          </ul> \
        </div> \
        <div class="dropdown event-table-format pull-left"> \
          <a class="dropdown-toggle" data-toggle="dropdown" href="#">Format Results<b class="caret"></b></a> \
          <ul class="dropdown-menu"> \
            <li> \
                <a href="#" data-action="list"> \
                    <i class="icon-<% print(displayFormat === "list" ? "check" : "blank") %> "></i> \
                    List \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="tabular"> \
                    <i class="icon-<% print(displayFormat === "tabular" ? "check" : "blank") %> "></i> \
                    Table \
                </a> \
            </li> \
            <li class="divider"></li> \
            <li> \
                <a href="#" data-action="row-numbers"> \
                    <i class="icon-<% print(showRowNumbers ? "check" : "blank") %> "></i> \
                    Row numbers \
                </a> \
            </li> \
            <li class="divider"></li> \
            <li> \
                <a href="#" data-action="10lines"> \
                    <i class="icon-<% print(numLines === 10 ? "check" : "blank") %> "></i> \
                    Max 10 lines \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="20lines"> \
                    <i class="icon-<% print(numLines === 20 ? "check" : "blank") %> "></i> \
                    Max 20 lines \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="50lines"> \
                    <i class="icon-<% print(numLines === 50 ? "check" : "blank") %> "></i> \
                    Max 50 lines \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="100lines"> \
                    <i class="icon-<% print(numLines === 100 ? "check" : "blank") %> "></i> \
                    Max 100 lines \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="200lines"> \
                    <i class="icon-<% print(numLines === 200 ? "check" : "blank") %> "></i> \
                    Max 200 lines \
                </a> \
            </li> \
            <li> \
                <a href="#" data-action="all-lines"> \
                    <i class="icon-<% print(numLines === 0 ? "check" : "blank") %> "></i> \
                    All lines \
                </a> \
            </li> \
          </ul> \
        </div> \
        <div class="pull-right pagination-container"> \
            <div class="pagination"> \
              <ul> \
                <li class="<% print(pagination.current === 1 ? "disabled" : "") %>"> \
                    <a href="#" data-page="prev">« prev</a> \
                </li> \
                <% for(var i = pagination.start; i < pagination.end; i++) { %> \
                    <li class="<% print(pagination.current === i ? "active" : "") %>"> \
                        <a href="#" data-page="<%= i %>"><%= i %></a> \
                    </li> \
                <% } %> \
                <li class="<% print(pagination.current === pagination.total ? "disabled" : "") %>"> \
                    <a href="#" data-page="next">next »</a> \
                </li> \
              </ul> \
            </div> \
        </div> \
    </div> \
    <div class="table-wrapper"> \
    </div> \
</div>'
        }
    );

    splunkjs.mvc.Components.registerType('appfx-eventtable', EventTable);
    
    return EventTable;
});
