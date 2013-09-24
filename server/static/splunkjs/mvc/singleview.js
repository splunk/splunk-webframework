
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
                fields = _(fields).filter(function(_field) {
                    return (_field === '_time') || (_field === '_raw') || (_field.charAt(0) != '_');
                });
                columns = _(columns).filter(function(column) {
                    return (_.indexOf(fields, column[column.length-1]) >= 0);
                });
                if(!field) {
                    // If the result field is unspecified - use the first of the filtered fields
                    field = fields[0];
                    if (columns.length && columns[0].length){
                        return columns[0][0];
                    } else {
                        return _('N/A').t();
                    }
                }
                for (var i = 0; i < columns.length; i++) {
                    if (columns[i][columns[i].length - 1]===field){
                        return columns[i][0];
                    }
                }
                return _('N/A').t();
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
                if(linkView && linkSearch) {
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
define('splunkjs/mvc/singleview',['require','exports','module','underscore','jquery','./mvc','./basesplunkview','./settings','views/shared/SingleValue','backbone','./utils','./messages','./tokenawaremodel','css!../css/single-value'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var mvc = require("./mvc");
    var BaseSplunkView = require("./basesplunkview");
    var Settings = require("./settings");
    var SingleValue = require("views/shared/SingleValue");
    var Backbone = require('backbone');
    var Utils = require('./utils');
    var Messages = require('./messages');
    var TokenAwareModel = require('./tokenawaremodel');

    require("css!../css/single-value");

    var SingleView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-single",

        options: {
            data: "preview",
            beforeLabel: "",
            afterLabel: "",
            field:"",
            classField: "",
            linkView: "search"
        },
        
        omitFromSettings: ['el', 'reportModel'],

        initialize: function() {
            this.configure();
            this.model = this.options.reportModel || TokenAwareModel._createReportModel();
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
            this.bindToComponentSetting('managerid', this._onManagerChange, this);
            this.settings.on("change", this.render, this);
            
            // If we don't have a manager by this point, then we're going to
            // kick the manager change machinery so that it does whatever is
            // necessary when no manager is present.
            if (!this.manager) {
                this._onManagerChange(mvc.Components, null);
            }
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
                this._searchStatus = { state: "nomanager" };
                this.render();
                return;
            }
            
            // Clear any messages, since we have a new manager.
            this._searchStatus = { state: "start" };

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
            this.resultsModel.on("error", this.onSearchError, this);

            var replayed = manager.replayLastSearchEvent(this);
            
            if (!replayed) {
                this.render();
            }
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
            var msg = Messages.getSearchErrorMessage(err) || message;
            this._searchStatus = { state: "error", message: msg };
            this.render();
        },

        onSearchFailed: function(state) {
            var msg = Messages.getSearchFailureMessage(state);
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
                // If there are no results, then we need to update our preview
                // count. If the search is not done yet, this will simply get
                // updated on the next progress/done event.
                if (this._searchStatus) {
                    this._searchStatus.previewCount = 0;
                }
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
                    case "nomanager":
                        message = "no-search";
                        break;
                    case "start":
                        message = "empty";
                        break;
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
                            level: "error",
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

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.clearfix{*zoom:1;}.clearfix:before,.clearfix:after{display:table;content:\"\";line-height:0;}\n.clearfix:after{clear:both;}\n.hide-text{font:0/0 a;color:transparent;text-shadow:none;background-color:transparent;border:0;}\n.input-block-level{display:block;width:100%;min-height:26px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;}\n.ie7-force-layout{*min-width:0;}\n.single-value{margin:20px;display:inline-block;*display:inline;*zoom:1;text-align:center;}.single-value .single-result{font-size:24px;font-weight:bold;word-wrap:break-word;}\n.single-value .before-label{margin-right:1em;}\n.single-value .after-label{margin-left:1em;}\n.single-value .under-label{text-transform:uppercase;color:#999999;font-size:11px;}\n.single-value .severe,.single-value.severe .single-result{color:#d85d3c;}\n.single-value .high,.single-value.high .single-result{color:#f7902b;}\n.single-value .elevated,.single-value.elevated .single-result{color:#fac51c;}\n.single-value .guarded,.single-value.guarded .single-result{color:#6ab7c7;}\n.single-value .low,.single-value.low .single-result{color:#65a637;}\n.single-value .None,.single-value.None .single-result{color:#999999;}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 