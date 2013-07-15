
define('views/shared/SingleValue',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base',
        'splunk.util',
        'uri/route'
    ],
    function($, _, module, Base, splunkUtil, route) {


        var getStringRepresentation = function(label, formatted) {
            if (_.isFunction(label)) {
                try {
                    label = label(formatted);
                } catch (e) {
                    return '';
                }
            }

            return label;
        };

        return Base.extend({
            moduleId: module.id,
            className: "single-value",
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                this.model.state.on('change:display.visualizations.singlevalue.beforeLabel change:display.visualizations.singlevalue.afterLabel change:display.visualizations.singlevalue.underLabel change:display.visualizations.singlevalue.additionalClass', this.debouncedRender, this);
                this.model.searchResultsColumn.on('change:fields', this.render, this);
            },
            getResultField: function(field) {
                var columns = $.extend(true, [], this.model.searchResultsColumn.get('columns')),
                    fields  = this.getFieldNames();

                _(columns).each(function(column, i) { column.push(fields[i]); });
                fields = _(fields).filter(function(field) {
                    return (field === '_time') || (field.charAt(0) != '_');
                });
                columns = _(columns).filter(function(column) {
                    return (_.indexOf(fields, column[column.length-1]) >= 0);
                });
                for (var i = 0; i < columns.length; i++) {
                    if (columns[i][1]=== field){
                        return columns[i][0];
                    }
                }
                return (columns[0] && columns[0][0]) ? columns[0][0]: '';
            },
            // fields can either be a list of strings or a list of dictionaries each with a 'name' entry
            // depending on whether 'show_metadata' is enabled
            getFieldNames: function() {
                var fields = this.model.searchResultsColumn.get('fields');
                if(!fields || fields.length === 0) {
                    return [];
                }
                if(_.isObject(fields[0])) {
                    return _(fields).pluck('name');
                }
                return $.extend([], fields);
            },
            setSeverity: function() {
                if(this.model.searchResultsColumn.get('fields')) {
                    var fields = _(this.model.searchResultsColumn.get('fields')).pluck('name'),
                        i = fields.indexOf('range');
                    if(i > -1) {
                        this.$('span.single-result').addClass(this.model.searchResultsColumn.get('columns')[i][0]);
                    }
                }
            },
            render: function() {
                var extracted = this.getResultField(this.model.state.get("display.visualizations.singlevalue.field")),
                    html = this.compiledTemplate({
                        extracted: extracted,
                        beforeLabel: getStringRepresentation(this.model.state.get("display.visualizations.singlevalue.beforeLabel") || "", extracted),
                        afterLabel: getStringRepresentation(this.model.state.get("display.visualizations.singlevalue.afterLabel") || "", extracted),
                        underLabel: getStringRepresentation(this.model.state.get("display.visualizations.singlevalue.underLabel") || "", extracted)
                    }),
                    cls = [this.model.state.get('display.visualizations.singlevalue.additionalClass'),
                           this.getResultField(this.model.state.get('display.visualizations.singlevalue.classField'))];
                this.$el.addClass(cls.join(' '));
                this.$el.html(html);
                this.wrapLinks();
                this.setSeverity();
                return this;
            },
            wrapLinks: function(){
                var linkFields = this.model.state.get('display.visualizations.singlevalue.linkFields') || "",
                    linkView = this.model.state.get('display.visualizations.singlevalue.linkView'),
                    linkSearch = this.model.state.get('display.visualizations.singlevalue.linkSearch'),
                    link, url;
                if(linkView) {
                    // For links like "/app/foo/bar" generate the absolute URL
                    if(linkView.charAt(0) === '/') {
                        url = splunkUtil.make_full_url(linkView, { q: linkSearch });
                    } else {
                        // Treat anything else as a simple view name
                        if(this.model.application) {
                            // If the application model is there, use uri.route to create an absolute URL to the target view
                            url = route.page(this.model.application.get('root'), this.model.application.get('locale'), this.model.application.get('app'), linkView, {
                                data: {
                                    q: linkSearch
                                }
                            });
                        } else {
                            // Fallback: Create a relative link to the target view
                            url = [ linkView, splunkUtil.propToQueryString({ q: linkSearch }) ].join('?');
                        }
                    }
                    link = $('<a />').attr('href',url);
                    _.each({'beforelabel': 'before-label', 'afterlabel': 'after-label', 'underlabel': 'under-label', 'result': 'single-result'}, function(cls, key){
                        if (linkFields.indexOf(key) > -1 && linkView){
                            this.$('.'+cls).wrap(link);
                        }
                    }, this);
                }
            },
            template: '\
                <span class="before-label">\
                    <%- beforeLabel %>\
                </span>\
                <span class="single-result">\
                    <%- extracted %>\
                </span>\
                <span class="after-label">\
                    <%- afterLabel %>\
                </span>\
                <br>\
                <span class="under-label">\
                    <%- underLabel %>\
                </span>\
            '
        });
    }
 );

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/single-value.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
// 

define('splunkjs/mvc/singleview',['require','exports','module','jquery','./mvc','./basesplunkview','./settings','views/shared/SingleValue','backbone','./utils','./messages','underscore','css!../css/single-value'],function(require, exports, module) {
    var $ = require('jquery');
    var mvc = require("./mvc");
    var BaseSplunkView = require("./basesplunkview");
    var Settings = require("./settings");
    var SingleValue = require("views/shared/SingleValue");
    var Backbone = require('backbone');
    var Utils = require('./utils');
    var Messages = require('./messages');
    var _ = require('underscore');

    require("css!../css/single-value");

    var SingleView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-single",

        options: {
            data: "preview",
            beforeLabel: "",
            afterLabel: "",
            field:"",
            classField: ""
        },
        
        omitFromSettings: ['el', 'reportModel'],

        initialize: function() {
            this.configure();
            mvc.enableDynamicTokens(this.settings);
            this.model = this.options.reportModel || new Backbone.Model();
            this.settings._sync = Utils.syncModels(this.settings, this.model, {
                auto: true,
                prefix: 'display.visualizations.singlevalue.',
                include: ["additionalClass","linkView","field","linkFields","classField","beforeLabel","afterLabel",
                          "underLabel","linkSearch"]
            });

            this.results = new Backbone.Model({
                columns: [],
                fields: []
            });
            var pageInfo = Utils.getPageInfo();
            this.model.application = new Backbone.Model({ root: pageInfo.root, locale: pageInfo.locale, app: pageInfo.app, page: pageInfo.page });
            this.bindToComponent(this.options.managerid, this._onManagerChange, this);
            this.settings.on("change", this.render, this);
        },

        _onManagerChange: function(managers, manager) {
            if (this.manager) {
                this.manager.off(null, null, this);
                this.manager = null;
            }
            if (this.resultsModel) {
                this.resultsModel.off(null, null, this);
                this.resultsModel = null;
            }

            this._searchStatus = null;

            this._clearResults();

            if (!manager) {
                return;
            }

            this.manager = manager;

            manager.on('search:start search:progress', this.onSearchProgress, this);
            manager.on('search:done', this.onSearchDone, this);
            manager.on('search:error', this.onSearchError, this);
            manager.on('search:fail', this.onSearchFailed, this);

            this.resultsModel = this.manager.data(this.settings.get("data"), {
                output_mode: "json_cols",
                count: 1,
                offset: 0,
                show_empty_fields: "True"
            });
            this.resultsModel.on("data", this._onDataUpdate, this);

            manager.replayLastSearchEvent(this);
        },

        onSearchProgress: function(properties) {
            var previewCount = ((properties || {}).content || {}).resultPreviewCount || 0;
            this._searchStatus = { state: "running", previewCount: previewCount };
            this.render();
        },

        onSearchDone: function(properties) {
            var previewCount = ((properties || {}).content || {}).resultPreviewCount || 0;
            this._searchStatus = { state: "done", previewCount: previewCount };
            this.render();
        },

        onSearchError: function(message, err) {
            var msg = message;
            if(err && err.data && err.data.messages && err.data.messages.length) {
                msg = _(err.data.messages).pluck('text').join('; ');
            }
            this._searchStatus = { state: "error", message: msg };
            this.render();
        },

        onSearchFailed: function(state) {
            var msg = _('The search failed.').t();
            if(state && state.content && state.content.messages) {
                msg = _(state.content.messages).pluck('text').join('; ');
            }
            this._searchStatus = { state: "error", message: msg };
            this.render();
        },

        _clearResults: function() {
            this.results.set({
                columns: null,
                fields: null
            },{ unset: true });
        },
        _onDataUpdate: function() {
            if(this.resultsModel.hasData()) {
                this.results.set({
                    columns: this.resultsModel.data().columns,
                    fields: this.resultsModel.data().fields
                });
            } else {
                this._clearResults();
            }
            this.render();
        },

        render: function() {

            var searchStatus = this._searchStatus || null;
            var haveResults = searchStatus && searchStatus.previewCount;
            var resultsLoaded = haveResults && this.resultsModel && this.resultsModel.hasData();

            var message = null;
            if(searchStatus) {
                switch(searchStatus.state) {
                    case "running":
                        if(!haveResults) {
                            message = "waiting";
                        }
                        break;
                    case "cancelled":
                        message = "cancelled";
                        break;
                    case "done":
                        if(!haveResults) {
                            message = "no-results";
                        } else if(!resultsLoaded) {
                            message = "waiting";
                        }
                        break;
                    case "error":
                        message = {
                            level: "warning",
                            icon: "warning-sign",
                            message: searchStatus.message
                        };
                        break;
                }
            }

            if(message) {

                if(!this.messageElement) {
                    this.messageElement = $('<div class="msg"></div>');
                }

                if(message === 'waiting') {
                    this.messageElement.addClass('waiting').html('<div class="single-value"><span class="single-result">&hellip;</span></div>');
                } else if(message === 'no-results') {
                    this.messageElement.addClass('no-results').html('<div class="single-value"><span class="single-result">N/A</span></div>');
                } else {
                    Messages.render(message, this.messageElement.removeClass('waiting'));
                }

                this.$el.append(this.messageElement);
            } else {
                if(this.messageElement) {
                    this.messageElement.remove();
                    this.messageElement = null;
                }
            }

            if(searchStatus && resultsLoaded && !message) {
                if(!this.singleValue) {
                    this.singleValue = new SingleValue({
                        model: {
                            searchResultsColumn: this.results,
                            state: this.model,
                            application: this.model.application
                        }
                    });
                }
                this.singleValue.render().appendTo(this.el);
            } else if(this.singleValue) {
                this.singleValue.remove();
                this.singleValue = null;
            }

            this.trigger('rendered', this);

            return this;
        },
        remove: function() {
            if(this.singleValue) {
                this.singleValue.remove();
            }
            if(this.settings) {
                this.settings.off();
                if(this.settings._sync) {
                    this.settings._sync.destroy();
                }
            }
            BaseSplunkView.prototype.remove.call(this);
        }
    });

    return SingleView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*!\n * Splunk shoestrap\n * import and override bootstrap vars & mixins\n */\n.clearfix {\n  *zoom: 1;\n}\n.clearfix:before,\n.clearfix:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.clearfix:after {\n  clear: both;\n}\n.hide-text {\n  font: 0/0 a;\n  color: transparent;\n  text-shadow: none;\n  background-color: transparent;\n  border: 0;\n}\n.input-block-level {\n  display: block;\n  width: 100%;\n  min-height: 26px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ie7-force-layout {\n  *min-width: 0;\n}\n/* component for displaying a single value with some annotations\n\n\t<div class=\"single-value shared-singlevalue\" data-view=\"views/shared/SingleValue\">\n\t    <span class=\"before-label\">before</span>\n\t    <span class=\"single-result\">Single Value Result</span>\n\t    <span class=\"after-label\">after</span>\n\t    <br>\n\t    <span class=\"under-label\">under</span>\n\t</div>\n\n*/\n.single-value {\n  margin: 20px;\n  display: inline-block;\n  *display: inline;\n  /* IE7 inline-block hack */\n\n  *zoom: 1;\n  text-align: center;\n}\n.single-value .single-result {\n  font-size: 24px;\n  font-weight: bold;\n  word-wrap: break-word;\n}\n.single-value .under-label {\n  text-transform: uppercase;\n  color: #999;\n  font-size: 11px;\n}\n.single-value .severe {\n  color: #ff1f24;\n}\n.single-value .high {\n  color: #ff7e00;\n}\n.single-value .elevated {\n  color: #ffb800;\n}\n.single-value .guarded {\n  color: #4da6df;\n}\n.single-value .low {\n  color: #00b932;\n}\n.single-value .None {\n  color: #999;\n}\n.single-value.severe .single-result {\n  color: #ff1f24;\n}\n.single-value.high .single-result {\n  color: #ff7e00;\n}\n.single-value.elevated .single-result {\n  color: #ffb800;\n}\n.single-value.guarded .single-result {\n  color: #4da6df;\n}\n.single-value.low .single-result {\n  color: #00b932;\n}\n.single-value.None .single-result {\n  color: #999;\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 