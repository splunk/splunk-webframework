define(function (require, exports, module) {
    var _ = require("underscore");
    var mvc = require('splunjs.mvc');
    var Backbone = require('backbone');
    var BaseControl = require("./basecontrol");
    var SimonsTable = require('views/shared/results_table/ResultsTableMaster');
    var Messages = require("./messages");
    var Paginator = require("./paginator");

    var SimpleTableControl = BaseControl.extend({
        className: 'splunk-table',
        initialize: function () {

            var results = this.results = new Backbone.Model({
                rows: [],
                fields: []
            });
            var metadata = this.metadata = new Backbone.Model({
                count: this.options.hasOwnProperty('count') ? parseInt(this.options.count, 10) : 10,
                offset: 0
            });
            metadata.on('change', this.fetchResults, this);

            var table = this.table = new SimonsTable({
                enableTableDock: false,
                el: $('<div></div>').appendTo(this.el),
                model: {
                    results: results,
                    metadata: metadata,
                    format: new Backbone.Model()
                }
            });

            if(this.options.format) {
                // TODO-Sigi: Handle other formats?
                var sparklineSettings = {};
                _.each(this.options.format, function(formats,field) {
                    _.each(formats, function(format){
                        if(format.type === 'sparkline') {
                            sparklineSettings[field] = format.options;
                        }
                    });
                });

                if(!_(sparklineSettings).isEmpty()) {
                    table.model.format.set({
                        "display.statistics.sparkline.format": sparklineSettings
                    },{silent: true});
                }
            }

            table.model.format.set({
                "display.statistics.overlay": this.options.dataOverlayMode,
                "display.statistics.rowNumbers": this.options.hasOwnProperty('displayRowNumbers') ? this.options.displayRowNumbers : "True",
                "display.statistics.stripedRows": true,
                "display.statistics.drilldown": 'cell'
            });

            if(this.options.showPager !== false) {
                var ct = $('<div></div>')[this.options.pagerPosition === 'bottom' ? 'appendTo':'prependTo' ](this.el);
                var p = this.paginator = mvc.Components.create('appfx-paginator', _.uniqueId(this.name+'-paginator'), {
                    el: ct,
                    pageSize: metadata.get('count')
                });
                p.settings.on('change:page', function(){
                    var count = metadata.get('count'), page = p.settings.get('page');
                    console.log('offset: ', count*page, count, page);
                    this.metadata.set('offset', count*page);
                }, this);
            }

            table.on('cellClick', this.emitDrilldownEvent, this);
            this.bindToComponent(this.options.context, this.onContextChange, this);
        },

        emitDrilldownEvent: function(e) {
            var data = {
                "click.name": e.name,
                "click.value": e.value
            };
            if(e.hasOwnProperty('name2')) {
                _.extend(data, {
                    "click.name2": e.name2,
                    "click.value2": e.value2
                });
            }
            _.extend(data, e.rowContext);
            this.trigger('drilldown', { field: e.name2 || e.name, data: data, event: e });
        },

        onContextChange: function (contexts, context) {
            if(this.context) {
                this.context.off(null, null, this);
            }
            if(this.data) {
                this.data.off(null, null, this);
            }
            this.context = context;
            this.data = this.context.data("preview", {
                autofetch: false
            });
            this.context.on("search:start", this.onSearchStart, this);
            this.context.on("search:progress", this.onSearchProgress, this);
            this.context.on("search:cancelled", this.onSearchCancelled, this);
            this.context.on("search:error", this.onSearchError, this);
            this.data.on("data", this.renderResults, this);
        },
        renderMessage: function(msg) {
            var el = this.$('.msg');
            if(!el.length) {
                el = $('<div class="msg"></div>').appendTo(this.table.$el);
            }
            Messages.render(msg, el);
        },
        onSearchStart: function() {
            this.renderMessage('waiting');
        },
        onSearchProgress: function(properties) {
            properties = properties || {};
            var job = properties.content || {};
            var previewCount = job.resultPreviewCount || 0;

            if (previewCount === 0) {
                if(job.isDone) {
                    this.renderMessage('no-results');
                } else {
                    this.renderMessage('waiting');
                }
            } else {
                if(this.paginator) {
                    this.paginator.settings.set('itemCount', previewCount);
                }
                if(this.data) {
                    this.fetchResults();
                }
            }
        },
        onSearchCancelled: function() {
            this.renderMessage('cancelled');
        },

        onSearchError: function(message) {
            this.renderMessage({
                level: "warning",
                icon: "warning-sign",
                message: message
            });
        },
        fetchResults: function() {
            if(!this.data) {
                return;
            }
            var args = {
                output_mode: "json_rows",
                count: this.metadata.get("count"),
                offset: this.metadata.get("offset"),
                show_empty_fields: "True"
            };
            if(this.metadata.has('sortKey')) {
                args.search = [
                    '|','sort', this.metadata.get('sortDirection') === 'desc' ? '-':'',
                    JSON.stringify(this.metadata.get('sortKey'))
                ].join(' ');
            }
            this.data.fetch(args);
        },
        renderResults: function() {
            this.results.set({
                rows: this.data.data().rows,
                fields: this.data.data().fields
            });
        },
        render: function () {
            this.table.render();
            if(this.paginator) {
                this.paginator.render();
            }
            return this;
        }
    });
    mvc.Components.registerType('splunk-table', SimpleTableControl);
    return SimpleTableControl;
});