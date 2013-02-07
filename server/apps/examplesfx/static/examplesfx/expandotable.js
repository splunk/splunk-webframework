// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var mvc = require('splunk.mvc');
    var BaseControl = require("splunk.mvc/basecontrol");
    var _ = require("underscore");

    var ExpandoTable = BaseControl.extend({
        className: "examplesfx-expandotable",

        options: {
            contextid: null,
            table: null,
            datasource: "results",
            valueField: "",
            targetToken: "",
            template: ""
        },

        initialize: function() {
            this.configure();
            
            // A complete control would rebind in the case that any of the
            // settings change, but this is sufficient for this example.
            
            // In this case, we're binding both to a search context and to a
            // table, because we don't know if they exist yet or not, and could
            // change in the future.
            this.bindToComponent(this.settings.get("table"), this.onTableChange, this);
            this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
        },
        
        onContextChange: function(contexts, context) {
            // Deregister from any old contexts and datasources
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }
            if (this.datasource) {
                this.datasource.off(null, null, this);
                this.datasource.destroy();
                this.datasource = null;
            }
            
            // Bail out if there is no new context (e.g. is somebody removed
            // a context with the name we bound to).
            if (!context) {
                return;
            }

            this.context = context;
            this.datasource = this.context.data(this.settings.get("datasource"), {
                count: 1
            });
            
            // In this example, we will register just for data updates. However,
            // if we wanted to show search messages (such as errors), we would have
            // to bind to the search context too.
            this.datasource.on("data", this.onDataChanged, this);
        },

        onTableChange: function(components, table) {
            if (this.table) {
                this.table.off(null, null, this);
            }

            this.table = table;

            if (!table) {
                return;
            }

            var that = this;
            this.table.on("clicked:row", function(e) {
                if (!that.context) {
                    return;
                }

                // Get the value that was clicked                    
                var value = e.model.get(that.settings.get("valueField"));
                
                // Get the row DOM node
                var row = $(e.originalEvent.target).closest("tr");
                
                // Remove any previous info rows
                var tbody = row.parent();
                var rows = row.siblings();
                
                that.$("tr.toggled").removeClass("toggled");
                that.$("tr.info-box").remove();
                
                // Add that we are toggled
                row.addClass("toggled");
                
                // We need to find the number of columns in the table, which will be the number
                // of fields in the search, plus one for the index.
                var numColumns = that.table.datasource.data().fields.length + 1;
                
                // Create the new row and add it to the DOM after the clicked row
                var newRow = $("<tr class='info-box'><td class='info-td' colspan='" + numColumns + "'></td></tr>");
                row.after(newRow);
                
                // Here we set the value onto the query, and start the search
                that.context.query.set(that.settings.get("targetToken"), value.trim());
                that.context.startSearch();
            });
        },
        
        render: function(content) {
            this.$el.empty();

            if (this.table) {
                this.$el.append(this.table.$el);
            }

            return this;
        },
        
        onDataChanged: function() {
            // When there is data, render the template
            if (this.datasource.hasData()) {
                var infoBox = this.$("td.info-td");
                var data = this.datasource.collection().at(0);
                infoBox.html(_.template(this.settings.get("template"), data.toJSON()));
            }
        },
    });
    
    // We prefix with our app name to make sure there are no collisions.
    splunkjs.mvc.Components.registerType('examplesfx-expandotable', ExpandoTable);
    
    return ExpandoTable;
});