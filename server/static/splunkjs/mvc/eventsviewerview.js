
define('views/shared/delegates/Modalize',
    [
        'jquery',
        'underscore',
        'views/shared/delegates/Base'
    ],
    function(
        $,
        _,
       DelegateBase
    ){
        return DelegateBase.extend({
            initialize: function() {
                var defaults = {
                    tbody: '> tbody',
                    parentContainerSelector: 'div',
                    overlayZIndex: 404
                };
                _.defaults(this.options, defaults);
                DelegateBase.prototype.initialize.apply(this, arguments);
            },
            show: function(rowIdx, optArg) {
                this.cleanup();
                if(!_.isNumber(rowIdx)) return;
                
                this.rowIdx = rowIdx; 
                this.optArg = optArg;
                var $row = this.$(this.options.tbody).children(':not(".field-row")').eq(this.rowIdx),
                    dimens = {
                        topHeight: 0,
                        bottomHeight: 0,
                        tableHeaderHeight: 0,
                        dockedThead: 0,
                        width: this.$el[0].scrollWidth + 'px'
                    };
                this.$el.append(this.$top = $('<div class="modalize-table-top" />'));
                this.$el.append(this.$bottom = $('<div class="modalize-table-bottom" />'));
                $('.main-section-body').append(this.$overlay = $('<div class="modalize-table-overlay" />'));

                this.addEventHandlers(_.debounce(function(rowIdx, optArg) { this.show(rowIdx, optArg); }.bind(this), 100));
                
                $row.prevAll(':visible').each(function(index, el) {
                    dimens.topHeight += $(el).outerHeight(true);
	            });
                $row.nextAll(':visible').each(function(index, el) {
                    if(!(optArg && (index==0))) {
                        dimens.bottomHeight += $(el).outerHeight(true);
                    }
	            });
                this.$el.find('> table:not(.table-expanded, .table-embed)').each(function(i, el) {
                    dimens.tableHeaderHeight += $(el).find('tr').first().height();
                });
                this.applycss(dimens);
            },
            addEventHandlers: function(show) {
                var unmodalize = function() {
                    this.$top.remove();
                    this.$bottom.remove();
                    this.$overlay.remove();
                    this.trigger('unmodalize', this.rowIdx);
                    this.$el.closest(this.options.parentContainerSelector).css({
                        'z-index': 0 
                    });
                }.bind(this);
                this.$top.on('click', unmodalize);
                this.$bottom.on('click', unmodalize);
                this.$overlay.on('click', unmodalize);

                this.lastHeight = $(window).height();
                this.lastWidth  = $(window).width();
                $(window).on('resize.' + this.cid, function() {
                    var height = $(window).height(),
                        width  = $(window).width();
                    if(height != this.lastHeight  || width != this.lastWidth) {
                        this.lastHeight = height;
                        this.lastWidth = width;
                        show(this.rowIdx, this.optArg);
                    } 
                }.bind(this));
            },
            cleanup: function() {
                if(this.rowIdx) { 
                    delete this.rowIdx;
                }
                this.$top && this.$top.remove();
                this.$bottom && this.$bottom.remove();
                this.$overlay && this.$overlay.remove();
                $(window).off('.' + this.cid);
                this.$el.closest(this.options.parentContainerSelector).css({
                    'z-index': 0 
                });
            },
            applycss: function(dimens) {
                this.$el.closest(this.options.parentContainerSelector).css({
                    'z-index': this.options.overlayZIndex + 1
                });
                this.$top.css({
                    'width': dimens.width,
                    'height': dimens.topHeight + dimens.tableHeaderHeight + 'px'
                });
                this.$bottom.css({
                    'width': dimens.width,
                    'height': dimens.bottomHeight + 'px'
                });
                this.$overlay.css({
                    'z-index': this.options.overlayZIndex
                });
            },
            remove: function() {
                DelegateBase.prototype.remove.apply(this);
                $(window).off('resize.' + this.cid);
                return this;
            }
        });
    }
);

define('views/shared/eventsviewer/shared/TableHead',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'splunk.util',
        'helpers/user_agent'
    ],
    function(
        _,
        $,
        module,
        BaseView,
        util,
        user_agent
    )
    {
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'thead',
            /**
             * @param {Object} options {
             *     model: <model.services.SavedSearch> (Optional),
             *     labels: <Array>,
             *     allowRowExpand: true|false
             *     allowLineNum: true|false
             * }
             */
            initialize: function() {
                var defaults = {
                    allowLineNum: true
                };
                this.options = $.extend(true, defaults, this.options);
                BaseView.prototype.initialize.apply(this, arguments);
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    _: _,
                    is_ie7: (user_agent.isIE7()) ? 'ie7': '',
                    labels: this.options.labels || [],
                    allowRowExpand: this.options.allowRowExpand,
                    allowLineNum: this.options.allowLineNum
                }));
                return this;
            },
            template: '\
                <tr>\
                    <% if (allowRowExpand) { %>\
                        <th class="col-info"><i class="icon-info"></i></th>\
                    <% } %>\
                    <% if (allowLineNum) { %>\
                        <th class="line-num <%- is_ie7 %>">&nbsp;</i></th>\
                    <% } %>\
                    <% _.each(labels, function(label, index) { %>\
                        <th class="col-<%- index %> <%- is_ie7 %>"><%- _(label).t() %></th>\
                    <% }) %>\
                </tr>\
            '
        });
    }
);

define('views/shared/PopTart',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/delegates/PopdownDialog'
    ],
    function(_, module, Base, PopdownDialogDelegate) {
        return Base.extend({
            moduleId: module.id,
            className: 'popdown-dialog',
            initialize: function(options) {
                options = options || {};
                var defaults = {
                    direction:'auto',
                    adjustPosition: true
                };
                _.defaults(options, defaults);
                
                Base.prototype.initialize.apply(this, arguments);
                this.children.popdownDialogDelegate = new PopdownDialogDelegate({
                    el: this.el,
                    ignoreClasses: this.options.ignoreClasses, 
                    adjustPosition: this.options.adjustPosition,
                    show: this.options.show,
                    mode: this.options.mode, // "menu" or "dialog"
                    direction: this.options.direction,
                    arrow: this.options.arrow,
                    minMargin: this.options.minMargin,
                    allowPopUp: this.options.allowPopUp,
                    scrollContainer: this.options.scrollContainer
                });
                this.children.popdownDialogDelegate.on('all', function() {
                    this.trigger.apply(this, arguments);
                }, this);
                if (this.options.onHiddenRemove) {
                    this.on('hidden', this.remove, this);
                }
                this.on('shown', function(e) {
                    this.shown = true;
                },this);
                this.on('hidden', function(e) {
                    this.shown = false;
                },this);
            },
            toggle: function () {
                return this.children.popdownDialogDelegate.toggle();
            },
            show: function ($toggle) {
                this.children.popdownDialogDelegate.show($toggle);
            },
            hide: function () {
                this.children.popdownDialogDelegate.hide();
            },
            render: function() {
                this.el.innerHTML = this.template;
                return this;
            },
            remove: function() {
                if(this.shown) {
                    this.hide();
                }
                Base.prototype.remove.apply(this, arguments);

            },
            template: '\
                <div class="arrow"></div>\
                <div class="popdown-dialog-body popdown-dialog-padded"></div>\
            ',
            template_menu: '\
                <div class="arrow"></div>\
            '
        });
    }
);

define('contrib/text!views/shared/FieldInfo.html',[],function () { return '<% if (field) { %>\n    <a href="#" class="close"><i class="icon-close"></i></a>\n    <h2 class="field-info-header"><%- field.get(\'name\') %></h2>\n    <div class="divider"></div>\n    <% if (selectableFields) { %>\n        <div class="pull-right">\n            <label class="select-field-label"><%- _("Selected").t() %></label>\n            <div class="btn-group">\n                <% var is_selected_field = selectedFields.findWhere({\'name\': field.get(\'name\')}); %>\n                <button class="btn select <%- is_selected_field ? \'active\' : \'\' %>" data-field-name="<%- field.get(\'name\') %>"><%- _("Yes").t() %></button>\n                <button class="btn unselect <%- is_selected_field ? \'\' : \'active\' %>" data-field-name="<%- field.get(\'name\') %>"><%- _("No").t() %></button>\n            </div>\n        </div>\n    <% } %>\n    <p><%- field.get("is_exact") ? "" : ">" %><%- field.get("distinct_count") %> <%- (field.get("distinct_count")>1) ?  _("Values").t(): _("Value").t() %>, <%= i18n.format_percent(summary.frequency(field.get(\'name\'))) %> <%- _("of events").t() %></p>\n    <h3 class="reports-header"><%- _("Reports").t() %></h3>\n    <% if (field.isNumeric()) { %>\n        <ul class="fields-numeric inline">\n            <li><a href="#" data-visualization="line" data-report="avgbytime" data-field="<%- field.get(\'name\') %>"><%- _("Average over time").t() %></a></li>\n            <li><a href="#" data-visualization="line" data-report="maxbytime" data-field="<%- field.get(\'name\') %>"><%- _("Maximum value over time").t() %></a></li>\n            <li><a href="#" data-visualization="line" data-report="minbytime" data-field="<%- field.get(\'name\') %>"><%- _("Minimum value time").t() %></a></li>\n        </ul>\n    <% } %>\n    <ul class="fields-values inline">\n        <li><a href="#" data-visualization="bar" data-report="top" data-field="<%- field.get(\'name\') %>"><%- _("Top values").t() %></a></li>\n        <li><a href="#" data-visualization="line" data-report="topbytime" data-field="<%- field.get(\'name\') %>"><%- _("Top values by time").t() %></a></li>\n        <li><a href="#" data-visualization="line" data-report="rare" data-field="<%- field.get(\'name\') %>"><%- _("Rare values").t() %></a></li>\n    </ul>\n    <ul class="fields-events inline">\n        <li><a href="#" data-report="fieldvalue" data-field="<%- field.get(\'name\') %>" data-field-value="*"><%- _("Events with this field").t() %></a></li>\n    </ul>\n    <% if (field.isNumeric()) { %>\n        <ul class="field-stats inline">\n            <li>\n                <strong class="stats-label"><%- _("Avg").t() %>:</strong>\n                <span class="val numeric"><%- field.get("mean") %></span>\n            </li>\n            <li>\n                <strong class="stats-label"><%- _("Min").t() %>:</strong>\n                <span class="val numeric"><%- field.get("min") %></span>\n            </li>\n            <li>\n                <strong class="stats-label"><%- _("Max").t() %>:</strong>\n                <span class="val numeric"><%- field.get("max") %></span>\n            </li>\n            <li>\n                <strong class="stats-label"><%- _("Std").t() %>&nbsp;<%- _("Dev").t() %>:</strong>\n                <span class="val numeric"><%- field.get("stdev") %></span>\n            </li>\n        </ul>\n    <% } %>\n    <table class="table table-condensed table-dotted">\n        <thead>\n            <tr>\n            <% if (field.get(\'modes\').length >= 10) { %>\n                <th class="value"><strong><%- _("Top 10 Values").t() %></strong></th>\n            <% } else { %>\n                <th class="value"><strong><%- _("Values").t() %></strong></th>\n            <% } %>\n            <td class="count"><%- _("Count").t() %></td>\n                <td class="percent">%</td>\n                <td class="bar">&nbsp;</td>\n            </tr>\n        </thead>\n        <tbody>\n            <% _.each(field.get(\'modes\'), function(mode) { %>\n                <tr>\n                    <td class="value"><a href="#" data-report="fieldvalue" data-field="<%- field.get(\'name\') %>" data-value="<%- mode.value %>"><%- mode.value %></a></td>\n                    <td class="count"><%- format_decimal(mode.count || -1) %></td>\n                    <% percent = mode.count/field.get(\'count\') %>\n                    <td class="percent"><%- format_percent(percent) %></td>\n                    <td class="bar">\n                        <div style="width:<%- Math.round(percent * 100) %>%;" class="graph-bar"></div>\n                    </td>\n                </tr>\n            <% }); %>\n        </tbody>\n    </table>\n<% } %>\n';});

define('views/shared/FieldInfo',
    [
        'underscore',
        'module',
        'views/shared/PopTart',
        'splunk.i18n',
        'models/services/search/IntentionsParser',
        'contrib/text!views/shared/FieldInfo.html'
    ],
    function(
        _,
        module,
        PopTartView,
        i18n,
        IntentionsParser,
        template
    )
    {
        return PopTartView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *      model: {
             *          field: <model.services.search.jobs.SummaryV2.fields.field[0]>,
             *          summary: <model.services.search.jobs.SummaryV2>,
             *          report: <models.services.SavedSearch>
             *      },
             *      collection: {
             *          selectedFields: <collections.SelectedFields>
             *      }
             *      selectableFields: true|false 
             * }
             */
            initialize: function() {
                PopTartView.prototype.initialize.apply(this, arguments);
                var defaults = {
                    selectableFields: true
                };
                this.options = $.extend(true, defaults, this.options);
                this.model.intentionsParser = new IntentionsParser();
                this.model.intentionsParser.on('change', function() {
                    var search = this.model.intentionsParser.fullSearch();
                    if(this.model.intentionsParser.has('visualization')) {
                        this.model.report.entry.content.set({
                            'search': search, 
                            'display.general.type': 'visualizations',
                            'display.visualizations.charting.chart': this.model.intentionsParser.get('visualization')
                        });
                    } else {
                        this.model.report.entry.content.set('search', search);
                    }
                    this.model.report.trigger('eventsviewer:drilldown');
                }, this);
                this.model.summary.fields.on('reset', this.render, this);
                this.collection.selectedFields.on('add remove reset', this.render, this);
                this.model.field.on('change', this.render, this);
            },
            events: {
                'click .unselect': function(e) {
                    this.collection.selectedFields.remove(
                        this.collection.selectedFields.findWhere({'name': $(e.currentTarget).data().fieldName})
                    );
                    e.preventDefault();
                },
                'click .select': function(e) {
                    this.collection.selectedFields.push({'name': $(e.currentTarget).data().fieldName}); 
                    e.preventDefault();
                },
                'click .close': function(e) {
                    this.hide(); 
                    e.preventDefault();
                },
                'click ul.fields-values > li > a[data-field]': function(e) {
                    var $target = $(e.currentTarget),
                        data = $target.data(),
                        field = data.field,
                        report = data.report;
                    this.model.intentionsParser.clear({silent: true});
                    this.model.intentionsParser.set({ 'visualization': data.visualization }, {silent: true});
                    this.model.intentionsParser.fetch({
                        data: {
                            q: this.model.report.entry.content.get('search'),
                            action: report,
                            field: field,
                            app: this.model.application.get('app'),
                            owner: this.model.application.get('owner')
                        }
                    });
                    e.preventDefault();
                },
                'click ul.fields-events > li >  a[data-field]': function(e) {
                    var $target = $(e.currentTarget),
                        data = $target.data(),
                        field = data.field,
                        report = data.report;
                    this.model.intentionsParser.clear({silent: true});
                    this.model.intentionsParser.fetch({
                        data: {
                            q: this.model.report.entry.content.get('search'),
                            action: report,
                            field: field,
                            value: '*',
                            app: this.model.application.get('app'),
                            owner: this.model.application.get('owner')
                        }
                    });
                    e.preventDefault();
                },
                'click ul.fields-numeric > li >  a[data-field]': function(e) {
                    var $target = $(e.currentTarget),
                        data = $target.data(),
                        field = data.field,
                        report = data.report;
                    this.model.intentionsParser.clear({silent: true});
                    this.model.intentionsParser.set({ 'visualization': data.visualization }, {silent: true});
                    this.model.intentionsParser.fetch({
                        data: {
                            q: this.model.report.entry.content.get('search'),
                            action: report,
                            field: field,
                            app: this.model.application.get('app'),
                            owner: this.model.application.get('owner')
                        }
                    });
                    e.preventDefault();
                },
                'click td.value >  a': function(e) {
                    var $target = $(e.currentTarget),
                        data = $target.data();
                    this.model.intentionsParser.clear({silent: true});
                    this.model.intentionsParser.fetch({
                        data: {
                            q: this.model.report.entry.content.get('search'),
                            stripReportsSearch: false,
                            action: data.report,
                            field: data.field,
                            value: data.value,
                            app: this.model.application.get('app'),
                            owner: this.model.application.get('owner')
                        }
                    });
                    e.preventDefault();
                }
            },
            render: function() {
                var html = this.compiledTemplate({
                    field: this.model.summary.fields.findWhere({'name': this.model.field.get('name')}),
                    summary: this.model.summary,
                    selectedFields: this.collection.selectedFields,
                    i18n: i18n,
                    _:_,
                    selectableFields: this.options.selectableFields
                });
                this.$el.html(PopTartView.prototype.template);
                this.$('.popdown-dialog-body').html(html);
                return this;
            },
            template: template
        });
    }
);

define('views/shared/eventsviewer/shared/fieldactions/TagDialog',
    [
        'underscore',
        'module',
        'models/services/saved/FVTags',
        'views/shared/Modal',
        'views/shared/controls/ControlGroup',
        'views/shared/FlashMessages'
    ],
    function(_, module, FVTags, Modal, ControlGroup, FlashMessage) {
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                this.children.flashMessage = new FlashMessage({ model: this.model.tags });
                this.children.field = new ControlGroup({
                    className: 'field-value control-group',
                    controlType: 'Textarea',
                    controlOptions: {
                        modelAttribute: 'name',
                        model: this.model.tags.entry.content,
                        save: false,
                        placeholder: 'Optional',
                        enabled: false
                    },
                    label: _('Field Value').t()
                });

                this.children.tags = new ControlGroup({
                    className: 'tags control-group',
                    controlType: 'Textarea',
                    controlOptions: {
                        modelAttribute: 'ui.tags',
                        model: this.model.tags.entry.content,
                        save: false,
                        placeholder: ''
                    },
                    label: _('Tag(s)').t(),
                    help: _('Comma or space separated list of tags.').t()
                });
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .btn-primary': function(e) {
                    var data = this.model.application.getPermissions('private'),
                        tags = FVTags.tagStringtoArray(_.escape(this.model.tags.entry.content.get('ui.tags')));

                    this.model.tags.resetTags(tags);
                    this.model.tags.entry.content.unset('ui.tags');
                    if(this.model.tags.id) {
                        data = {};
                        if (!tags.length) {
                            this.model.tags.destroy();
                            this.trigger('tags_saved');
                            this.hide();
                            e.preventDefault();
                            return;
                        }
                    }

                    this.model.tags.save({}, {
                        data:  data,
                        success: function(model, response) {
                            this.trigger('tags_saved');
                            this.hide();
                        }.bind(this)
                    });
                    e.preventDefault();
                }
            }),
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Create Tags").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.field.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.tags.render().el);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
                return this;
            }
        }
    );
});


define('views/shared/eventsviewer/shared/fieldactions/Master',
    [
        'underscore',
        'module',
        'views/Base',
        'models/SplunkDBase',
        'models/services/saved/FVTags',
        'views/shared/eventsviewer/shared/fieldactions/TagDialog'
    ],
    function(_, module, BaseView, SplunkDModel, FVTags, TagDialog) {
        return BaseView.extend({
           moduleId: module.id,
           /**
            * @param {Object} options {
            *      model: {
            *         application: <models.Application>,
            *         summary: <models.services.search.jobs.SummaryV2>
            *     },
            *     collection: <collections.UIWorkflowActions>
            * }
            */
            tagName: 'li',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.tags = new FVTags();
                this.fieldName = this.options.fieldName; 
                this.fieldValue = this.options.fieldValue;
            },
            events: {
                'click .editTag': function(e) {
                    this.trigger('hide');
                    
                    this.model.tags.entry.content.set('name', this.fieldName + '=' + this.fieldValue);
                    this.children.tagDialog = new TagDialog({
                        model: {
                            tags: this.model.tags,
                            application: this.model.application
                        },
                        onHiddenRemove: true
                    });
                    
                    this.children.tagDialog.on('tags_saved', function() {
                        this.model.result.setTags(this.fieldName, this.fieldValue, this.model.tags.entry.content.get('tags'));
                    },this);

                    this.model.tags.setId(
                        this.model.application.get('app'),
                        this.model.application.get('owner'),
                        this.fieldName, this.fieldValue
                    );

                    this.model.clonedTags = new SplunkDModel();
                    this.model.clonedTags.setFromSplunkD(this.model.tags.toSplunkD());
                    this.model.clonedTags.id = this.model.tags.id;
                    this.model.clonedTags.fetch({
                        success: function() {
                            $("body").append(this.children.tagDialog.render().el);
                            this.model.tags.setFromSplunkD(this.model.clonedTags.toSplunkD());
                            this.model.tags.entry.content.set('ui.tags',FVTags.tagArraytoString(this.model.tags.entry.content.get('tags')));
                            this.children.tagDialog.show();
                        }.bind(this),
                        error: function() {
                            $("body").append(this.children.tagDialog.render().el);
                            this.model.tags.setFromSplunkD(this.model.clonedTags.toSplunkD());
                            this.model.tags.unset('id');
                            this.children.tagDialog.show();
                        }.bind(this)
                    });
                    e.preventDefault();
                }
            },
            render: function() {
                this.el.innerHTML = this.compiledTemplate({_:_});
                return this;
            },
            template: '\
                    <a href="#" class="editTag"><%- _("Edit Tags").t() %></a>\
            '
        });
    }
);


define('views/shared/eventsviewer/shared/WorkflowActions',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/shared/PopTart',
        'views/shared/eventsviewer/shared/fieldactions/Master',
        'splunk.util',
        'uri/route'
    ], 
    function($, _, Backbone, module, PopTartView, FieldActions, util, route) {
        return PopTartView.extend({
           /**
            * @param {Object} options {
            *      model: {
            *         application: <models.Application>,
            *         summary: <models.services.search.jobs.SummaryV2>
            *         field: <models.services.search.jobs.SummaryV2.fields[i]
            *     },
            *     collection: <collections.services.data.ui.WorkflowActions>
            * } 
            */
            className: 'dropdown-menu',
            moduleId: module.id,
            initialize: function(){
                PopTartView.prototype.initialize.apply(this, arguments);
                this.children.editTagsActivator = new FieldActions({ 
                    model: this.model,
                    fieldValue: this.options.fieldValue,
                    fieldName: this.options.fieldName
                });
                this.isFieldAction =  (this.options.fieldName && this.options.fieldValue);
                this.children.editTagsActivator.on('hide', this.remove, this);
            },
            events: {
                'click a.actions': function(e) {
                    var m, obj = {}, 
                        index         = $(e.target).data('offset'),
                        model         = this.collection.at(index),
                        isInEventMenu = (model.entry.content.get('display_location') == 'event_menu'),
                        event         = $.extend({}, this.model.event.toJSON()),
                        sid           = this.model.searchJob.get('id'),
                        offset        = this.model.result.offset(this.options.index),
                        namespace     = this.model.application.get('app'),
                        latest_time   = this.model.event.get('_time');

                    _(model.entry.content.toJSON()).each(function(value, k){ 
                        obj[k] = (typeof value == 'string') ?
                            model.fieldSubstitute(model.systemSubstitute(value, sid, offset, namespace, latest_time, this.options.fieldName, this.options.fieldValue), event) :value; 
                    },this);
                    m = new Backbone.Model(obj);
                    this.hide();
                    return (model.entry.content.get('type') === 'link') ? this.link(m): this.search(m);
                }
            },
            uri: function(uri) {
                return uri.indexOf('/') === 0 ? route.encodeRoot(this.model.application.get('root'), this.model.application.get('locale')) + uri : uri;
            },
            link: function(model) {
                var uri = this.uri(model.get('link.uri'));
                if (model.get('link.method').toLowerCase() === 'get') {
                    if(model.get('link.target') === 'self') {
                        window.location.href = uri;
                    } else {
                        window.open(uri, '_blank');
                    }
                    return true;
                }
                var $form = $('<form class="workflow-action"/>');
                $form.attr('target', '_'+model.get('link.target'));
                $form.attr('action', uri);
                $form.attr('method', 'post');
                _(model.get('link.payload')).each(function(v, k) {
                    $form.append($('<input/>').attr({
                        'type': 'hidden',
                        'name': k,
                        'value': v
                    }));        
                }, this);
                $('body').append($form);
                $('form.workflow-action').submit().remove();
                return false;
            },
            search: function(model){
                var options = {data: {}};
                if (util.normalizeBoolean(model.get('search.preserve_timerange'))) {
                    if(this.model.report.entry.content.get('dispatch.earliest_time'))
                        options.data.earliest = this.model.report.entry.content.get('dispatch.earliest_time');
                    if(this.model.report.entry.content.get('dispatchu.latest_time'))
                        options.data.latest = this.model.report.entry.content.get('dispatch.latest_time');
                } 
                if (model.get('search.earliest') || model.get('search.latest')) {
                    options.data.earliest = model.get('search.earliest');
                    options.data.latest = model.get('search.latest');
                }
                options.data.q = model.get('search.search_string');
                var url = route.page(
                    this.model.application.get('root'),
                    this.model.application.get('locale'),  
                    model.get('eai:appName'), 
                    this.model.application.get('page'),
                    options
                );
                if(model.get('search.target') === 'self'){
                    window.location.href = url;
                } else {
                    window.open(url, '_blank');
                }
                return false;
            },    
            render: function() {
                this.$el.html(PopTartView.prototype.template_menu);
                this.$el.append(this.compiledTemplate({  
                    collection: this.collection,
                    actions: this.options.actions,
                    event: $.extend({}, this.model.event.toJSON()),
                    isField: this.isFieldAction,
                    _: _
                }));
                
                if(this.options.tags)
                    this.$('ul').prepend(this.children.editTagsActivator.render().el);
                return this;
            },
            template: '\
                <ul>\
                    <% _.each(actions, function(i) { %>\
                        <% var model = collection.at(i); %>\
                        <% if(model) {%>\
                            <li>\
                                <a class="actions" href="#" data-offset="<%-i%>"> <%- _(model.fieldSubstitute(model.entry.content.get("label"), event)).t()  %></a>\
                            </li>\
                        <% } %>\
                    <% }); %>\
                </ul>\
            '
        });
    }
);


define('views/shared/eventsviewer/shared/TimeInfo',
    [
        'underscore',
        'jquery',
        'module',
        'util/time_utils',
        'splunk.util',
        'views/shared/PopTart',
        'strftime'
    ],
    function(_, $, module, timeutils, splunkutils, PopTartView) {
        return PopTartView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *          report: <models.services.SavedSearch>,
             *     }
             * }
             */
            initialize: function() {
                PopTartView.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click td > a.et-lt': function(e) {
                    var $target = $(e.currentTarget),
                        timebounds = $target.data().time;
                    if(timebounds === 'before'){
                        this.model.report.entry.content.set('dispatch.latest_time', this.options.time);
                    } else if (timebounds == 'after') {
                        this.model.report.entry.content.set('dispatch.earliest_time', this.options.time);  
                    } else {
                        var et = parseFloat(splunkutils.getEpochTimeFromISO(this.options.time)), //inclusive
                            lt = et + 0.001; //exclusive
                        this.model.report.entry.content.set({
                            'dispatch.latest_time': lt,
                            'dispatch.earliest_time': et
                        });  
                    }
                    this.model.report.trigger('eventsviewer:drilldown');
                    e.preventDefault();
                },
                'click td > a.time-range': function(e) {
                    var $target = $(e.currentTarget),
                        ranges  = timeutils.rangeFromIsoAndOffset(this.options.time, $target.data().timeUnit);
                    this.model.report.entry.content.set({
                        'dispatch.latest_time': ranges.upperRange.strftime("%s.%Q"),
                        'dispatch.earliest_time': ranges.lowerRange.strftime("%s.%Q")
                    });  
                    this.model.report.trigger('eventsviewer:drilldown');
                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(PopTartView.prototype.template);
                this.$('.popdown-dialog-body').html(this.template);
                return this;
            },
            template: '\
                <h3>_time</h3>\
                <table>\
                    <thead>\
                        <tr><th>Events Before or After</th><th>Nearby Events</th></tr>\
                    </thead>\
                    <tbody>\
                        <tr>\
                            <td>\
                                <a class="et-lt" data-time="before" href="#">Before this time</a><br>\
                                <a class="et-lt" data-time="after" href="#">After this time</a><br>\
                                <a class="et-lt" data-time="at" href="#">At this time</a><br>\
                            </td>\
                            <td>\
                                <a class="time-range" data-time-unit="w" href="#">+/- 1 week</a><br>\
                                <a class="time-range" data-time-unit="d" href="#">+/- 1 day</a><br>\
                                <a class="time-range" data-time-unit="h" href="#">+/- 1 hour</a><br>\
                                <a class="time-range" data-time-unit="m" href="#">+/- 1 minute</a><br>\
                                <a class="time-range" data-time-unit="s" href="#">+/- 1 second</a><br>\
                                <a class="time-range" data-time-unit="ms" href="#">+/- 1 milliseconds</a><br>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
            '
        });
    }
);

define('collections/UIWorkflowActions',['backbone', 'underscore', 'models/UIWorkflowAction', 'collections/Base'],
    function(Backbone, _, WorkFlowAction, BaseCollection){
        return BaseCollection.extend({
            url: '/<%- locale %>/api/field/actions/<%-clientApp%>/<%-sid%>/<%-offset%>',
            model: WorkFlowAction,
            initialize: function() {
                BaseCollection.prototype.initialize.apply(this, arguments);
            },
            sync: function(method, collection, options) {
                options || (options = {});
                options.data || (options.data = {});
                
                options.url = _(this.url).template({
                    locale: options.data.locale || 'en-US',
                    clientApp: options.data.clientApp,
                    sid: options.data.sid,
                    offset: options.data.offset
                });
                delete options.data.locale;
                delete options.data.clientApp;
                delete options.data.sid;
                delete options.data.offset;
                return Backbone.sync.call(this, method, this, options);
            },
            parse: function(response){
                return response.data;
            }
        });
    }
);

define('views/shared/eventsviewer/shared/BaseFields',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/FieldInfo',
        'views/shared/eventsviewer/shared/WorkflowActions',
        'views/shared/eventsviewer/shared/fieldactions/Master',
        'views/shared/eventsviewer/shared/TimeInfo',
        'collections/UIWorkflowActions',
        'models/services/search/IntentionsParser',
        'models/DateInput'
    ],
    function(
        $,
        _,
        Backbone,
        module,
        BaseView,
        FieldInfo,
        WorkflowActionsView,
        FieldActions,
        TimeInfoView,
        WorkflowActionsCollection,
        IntentionsParser,
        DateInput
    ){
        return BaseView.extend({
            /**
             * @param {Object} options {
             *      model: {
             *         event: <models.services.search.job.ResultsV2.result[i]>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         application: <model.Application>,
             *         report: <models.services.SavedSearch>,
             *         searchJob: <models.Job>
             *     }
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false
             * }
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.intentionsParser = new IntentionsParser();
                this.model.intentionsParser.on('change', function() {
                    this.model.report.entry.content.set('search', this.model.intentionsParser.fullSearch());
                    this.model.report.trigger('eventsviewer:drilldown');
                }, this);
                this.model.event.on('change', this.render, this);
             
                this.collection.selectedFields.on('reset add remove', function() {
                    if(this.options.idx === this.model.state.get('modalize')) {
                        this.render(); 
                    }
                }, this);
            },
            events: {
                'click .field-value a.f-v': function(e) {
                    var $value = $(e.target),
                        value = $.trim($value.text()),
                        field = $.trim($value.data().fieldName);
                    this.model.intentionsParser.clear({silent: true});
                    this.model.intentionsParser.fetch({
                        data: {
                            q: this.model.report.entry.content.get('search'),
                            stripReportsSearch: false,
                            action: 'fieldvalue',
                            field: field,
                            value: value,
                            app: this.model.application.get('app'),
                            owner: this.model.application.get('owner')
                        }
                    });
                    e.preventDefault();
                },
                'click .tag': 'tagClick', 
                'click .field-value .tag': 'tagClick',
                'click ._time': function(e) {
                    e.preventDefault();
                },
                'click .field-info': function(e) {
                    e.preventDefault();
                },
                'click .field-actions': function(e) {
                    e.preventDefault();
                },
                'click .event-actions': function(e) {
                    e.preventDefault();
                },
                'mousedown ._time': 'openTimeInfo',
                'mousedown .field-info': 'openFieldInfo',
                'mousedown .field-actions': 'openFieldActions',
                'mousedown .event-actions': 'openEventActions',
                'keydown ._time': function(e) {
                    if (e.keyCode == 13)  {
                        this.openTimeInfo(e);
                    }
                },
                'keydown .field-info': function(e) {
                    if (e.keyCode == 13)  {
                        this.openFieldInfo(e);
                    }
                },
                'keydown .field-actions': function(e) {
                    if (e.keyCode == 13)  {
                        this.openFieldActions(e);
                    }
                },
                'keydown .event-actions': function(e) {
                    if (e.keyCode == 13)  {
                        this.openEventActions(e);
                    }
                }
            },
            tagClick: function(e) {
                var $value = $(e.target),
                    value  = $.trim($value.text()),
                    field  = $.trim($value.data().taggedFieldName);
                this.model.intentionsParser.clear({silent: true});
                this.model.intentionsParser.fetch({
                    data: {
                        q: this.model.searchJob.getStrippedEventSearch(),
                        action: 'fieldvalue',
                        field: field,
                        value: value,
                        app: this.model.application.get('app'),
                        owner: this.model.application.get('owner')
                    }
                });
                e.preventDefault();
            },
            openTimeInfo: function(e) {
                var $target = $(e.currentTarget),
                    time = $target.data().time;
                    
                if (this.children.time && this.children.time.shown) {
                    this.children.time.hide();
                }
                
                this.children.time = new TimeInfoView({
                    model: {
                        report: this.model.report
                    },
                    time: time,
                    onHiddenRemove: true
                });
                $('body').append(this.children.time.render().el);
                this.children.time.show($target);
                e.preventDefault();
            },
            openFieldInfo: function(e) {
                var $target = $(e.currentTarget);
                var field = this.model.summary.fields.findWhere({'name': $target.attr('data-field-name') });
                var fieldName = field.get('name');
                
                if (this.children.fieldInfo && this.children.fieldInfo.shown) {
                    this.children.fieldInfo.hide();
                    if(this.lastMenu == (fieldName+'-field-info'))
                        return true;
                }
                
                if (!field) {
                    alert(_("This event is no longer within the results window.").t());
                }
                
                this.children.fieldInfo = new FieldInfo({
                    model: {
                        field: field,
                        summary: this.model.summary,
                        report: this.model.report,
                        application: this.model.application
                    },
                    collection: {selectedFields: this.collection.selectedFields},
                    onHiddenRemove: true,
                    selectableFields: this.options.selectableFields
                });
                this.lastMenu = fieldName + "-field-info";
                if(!_.isNumber(this.model.state.get('modalize'))){
                    this.model.state.set({
                        'modalize': this.options.idx,
                        'sleep': true
                    });
                }
                $('body').append(this.children.fieldInfo.render().el);
                this.children.fieldInfo.show($target);
                e.preventDefault();
            },
            openFieldActions: function(e) {
                var $target = $(e.currentTarget),
                    fieldName = $target.attr('data-field-name'),
                    fieldValue = $.trim($target.closest('tr').find('.f-v').text());
                
                if (this.children.fieldActions && this.children.fieldActions.shown) {
                    this.children.fieldActions.hide();
                    if(this.lastMenu == (fieldName+'-field-actions'))
                        return true;
                }
                
                this.children.fieldActions = new WorkflowActionsView({
                    model: this.model,
                    collection: this.collection.workflowActions,
                    actions: this.collection.workflowActions.getFieldActions(fieldName, this.model.event),
                    fieldName: fieldName,
                    fieldValue: fieldValue,
                    tags: true,
                    mode: 'menu',
                    onHiddenRemove: true
                });
                this.lastMenu = fieldName + "-field-actions";
                if(!_.isNumber(this.model.state.get('modalize'))){
                    this.model.state.set({
                        'modalize': this.options.idx,
                        'sleep': true
                    });
                }
                $('body').append(this.children.fieldActions.render().el);
                this.children.fieldActions.show($target);
                e.preventDefault();
            },
            openEventActions: function(e) {
                var $target = $(e.currentTarget),
                    index = this.model.result.results.indexOf(this.model.event); 
                if (this.children.eventActions && this.children.eventActions.shown) {
                    this.children.eventActions.hide();
                    return true;
                }
                
                this.children.eventActions = new WorkflowActionsView({
                    model: this.model,
                    collection: this.collection.workflowActions,
                    actions: this.collection.workflowActions.getEventActions(this.model.event),
                    index: index,
                    tags: false,
                    mode: 'menu',
                    onHiddenRemove: true
                });
                $('body').append(this.children.eventActions.render().el);
                this.children.eventActions.show($target);
                e.preventDefault();
            },
            _partial: _.template('\
                <%  _(fields).each(function(field, i) { %>\
                    <% var fieldlist = m.get(field) %>\
                    <% if(fieldlist.length > 1){ %>\
                        <%  _(fieldlist).each(function(mv_field, j) { %>\
                            <tr>\
                               <% if(i==0 && j==0 && label) { %>\
                                   <td rowspan="<%= m.getFieldsLength(fields) %>" class="field-type"><%- label %></td>\
                               <% } %>\
                               <% if(selectableFields && j==0) { %>\
                                   <td rowspan="<%= fieldlist.length %>" class="col-visibility"><label class="checkbox">\
                                   <a href="#" data-name="Everyone.read" class="btn <%- iconVisibility ? "hide" : "show" %>-field">\
                                   <% if(iconVisibility) { %>\
                                    <i class="icon-check"></i>\
                                    <% } %>\
                                   </label></td>\
                               <% } %>\
                               <% if(j==0 && slen>0) {%>\
                                    <td rowspan="<%=fieldlist.length %>" class="field-key">\
                                        <a class="popdown-toggle field-info" href="#" data-field-name="<%- field %>">\
                                            <span><%- field %></span><span class="caret"></span>\
                                        </a>\
                                    </td>\
                               <% } else if(j==0 && slen==0) { %>\
                                    <td rowspan="<%=fieldlist.length %>" class="field-key">\
                                        <span  data-field-name="<%- field %>"><%- field %></span>\
                                    </td>\
                               <% } %>\
                               <td class="field-value">\
                                   <a data-field-name="<%- field %>"  class="f-v" href="#"><%- mv_field %></a>\
                                   <% var tags = r.getTags(field, mv_field); %>\
                                   <% if (tags.length) { %>\
                                       (<% _(tags).each(function(tag, idx){ %><a data-tagged-field-name="tag::<%- field %>" class="tag" href="#"><%- tag %><%if(idx!=tags.length-1){%> <%}%></a><% }); %>)\
                                   <% } %>\
                               </td>\
                               <td  class="actions popdown">\
                                       <a class="popdown-toggle field-actions" href="#" data-field-name="<%- field %>">\
                                           <span class="caret"></span>\
                                       </a>\
                               </td>\
                            </tr>\
                        <% }) %>\
                    <% } else { %>\
                        <tr>\
                           <% if(i==0 && label) { %>\
                               <td rowspan="<%= m.getFieldsLength(fields) %>" class="field-type"><%- label %></td>\
                           <% } %>\
                           <% if(selectableFields) { %>\
                               <td rowspan="<%= fieldlist.length %>" class="col-visibility"><label class="checkbox">\
                               <a href="#" data-name="Everyone.read" class="btn <%- iconVisibility ? "hide" : "show" %>-field">\
                               <% if(iconVisibility) { %>\
                                <i class="icon-check"></i>\
                                <% } %>\
                               </a></label></td>\
                           <% } %>\
                           <% if(slen >0) { %>\
                               <td class="field-key">\
                                   <a class="popdown-toggle field-info" href="#" data-field-name="<%- field %>">\
                                       <span><%- field %></span><span class="caret"></span>\
                                   </a>\
                               </td>\
                           <% } else { %>\
                                <td class="field-key">\
                                    <span  data-field-name="<%- field %>"><%- field %></span>\
                                </td>\
                           <% } %>\
                           <td class="field-value">\
                               <a data-field-name="<%- field %>"  class="f-v" href="#"><%- m.get(field)[0] %></a>\
                               <% var tags = r.getTags(field, m.get(field)); %>\
                               <% if (tags.length > 0) { %>\
                                   (<% _(tags).each(function(tag, idx){ %><a data-field-name="<%- field %>" data-tagged-field-name="tag::<%- field %>" class="tag" href="#"><%- tag %><%if(idx!=tags.length-1){%> <%}%></a><% }); %>)\
                               <% } %>\
                           </td>\
                           <td  class="actions">\
                                   <a class="popdown-toggle field-actions" href="#" data-field-name="<%- field %>">\
                                       <i class="icon-triangle-down-small"></i>\
                                   </a>\
                           </td>\
                       </tr>\
                   <% } %>\
               <% }); %>\
           ')
        });
    }
);

define('views/shared/eventsviewer/shared/EventFields',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/delegates/PopdownDialog',
        'views/shared/FieldInfo',
        'views/shared/eventsviewer/shared/WorkflowActions',
        'views/shared/eventsviewer/shared/fieldactions/Master',
        'views/shared/eventsviewer/shared/BaseFields',
        'collections/UIWorkflowActions',
        'models/services/search/IntentionsParser'
    ],
    function(
        $,
        _,
        Backbone,
        module,
        BaseView,
        Popdown,
        FieldInfo,
        WorkflowActionsView,
        EditTags,
        FieldsView,
        WorkflowactionsCollection,
        IntentionsParser
     ){
        return FieldsView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *      model: {
             *         event: <models.services.search.job.ResultsV2.result[i]>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         application: <model.Application>,
             *         searchJob: <models.Job>
             *     }
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *     },
             *     selectableFields: true|false,
             *     swappingKey: The swap key to observe a loading event on
             * }
             */
            initialize: function(){
                FieldsView.prototype.initialize.apply(this, arguments);
                this.swappingKey = this.options.swappingKey;
                this.showAllLines = this.options.showAllLines;
                
                this.model.event.on('change', function(model, options) {
                    if(options.swap) {
                        this.isSwapping = false;
                    }
                    this.render();
                }, this);

                this.model.event.on('failed-swap', function() {
                    this.$('.event-fields-loading').text(_('We were unable to provide the correct event').t());
                },this);
                
                this.model.state.on('change:timeExpanded', this.render, this);
                
                this.isSwapping = true;                
                this.model.state.on('change:'+this.showAllLines, function() { this.isSwapping = true; },this);
                this.model.state.on('unmodalize'+this.options.idx, function() { this.isSwapping = true; },this);
                this.model.result.on(this.swappingKey, function() { this.isSwapping = true; }, this);
            },
            events: $.extend({}, FieldsView.prototype.events, {
                'click ._time-expand' : function(e) {
                    this.model.state.set('timeExpanded', !this.model.state.get('timeExpanded'));
                    e.preventDefault();
                },
                'click a.show-field': function(e) {
                   var $eye = $(e.currentTarget),
                       fieldName = $.trim($eye.closest('td').siblings('.field-key').text());
                   this.collection.selectedFields.push({ 'name': fieldName });
                   e.preventDefault();
                },
                'click a.hide-field': function(e) {
                   var $eye = $(e.currentTarget),
                        fieldName = $.trim($eye.closest('td').siblings('.field-key').text());
                    this.collection.selectedFields.remove(this.collection.selectedFields.find(function(model) {
                        return model.get('name')===fieldName;
                    }, this));
                    e.preventDefault();
                 },
                 'click a.btn.disabled': function(e) {
                    e.preventDefault();
                 }
            }),
            setMaxWidth: function() {
                if (!this.el.innerHTML || !this.$el.is(":visible")) {
                    return false;
                }
            
                var $stylesheet =  $("#"+this.cid+"-styles");
                $stylesheet && $stylesheet.remove();
                
                var $wrapper = this.$el.closest('table').parent(),
                    wrapperWidth=$wrapper.width(),
                    wrapperLeft=$wrapper.offset().left - $wrapper.scrollLeft(),
                    margin=20,
                    elLeft=this.$el.offset().left,
                    maxWidth= wrapperWidth - (elLeft - wrapperLeft) - margin,
                    maxWidthPx = (maxWidth > 500? maxWidth : 500) + "px";
                
                this.$('table').css('maxWidth', maxWidthPx);
            },
            reflow: function() {
                this.setMaxWidth();
            },
            render: function() {
                var strippedfields = this.model.event.strip(),
                    selectedfields = _.intersection(strippedfields, this.collection.selectedFields.pluck('name')).sort(),
                    eventfields = _.difference(_.intersection(strippedfields, this.model.event.notSystemOrTime()), selectedfields).sort(),
                    timefields = _.difference(this.model.event.time(), selectedfields).sort(),
                    timefieldsNoTime = _.difference(timefields, ['_time']),
                    systemfields = _.difference(this.model.event.system(), selectedfields).sort();
                 
                this.$el.html(this.compiledTemplate({
                    selectedfields: selectedfields,
                    eventfields: eventfields,
                    timefields: (this.model.state.get('timeExpanded')) ? timefieldsNoTime : [],
                    systemfields: systemfields,
                    expanded: (timefields.length === 1) ? '': (this.model.state.get('timeExpanded') ? 'icon-minus-circle': 'icon-plus-circle'),
                    selectableFields: this.options.selectableFields,
                    hideEventActions: (this.model.searchJob.isRealtime()),
                    r: this.model.result,
                    m: this.model.event,
                    slen: this.model.summary.fields.length,
                    _partial: this._partial,
                    isSwapping: false,
                    _:_
                }));
                this.setMaxWidth();
                return this;
            },
            template:'\
                <% if (!isSwapping) { %>\
                    <% if (!hideEventActions) { %>\
                        <a class="btn popdown-toggle event-actions" href="#"><span><%-_("Event Actions").t()%></span><span class="caret"></span></a>\
                    <% } %>\
                    <table class="table table-condensed table-embed table-expanded table-dotted">\
                        <thead>\
                            <th class="col-field-type"><%- _("Type").t() %></th>\
                            <% if(selectableFields){ %> <th class="col-visibility"><label class="checkbox"><a href="#" class="btn disabled"><i class="icon-check"></i></a></label></th><% } %>\
                            <th class="col-field-name"><%- _("Field").t() %></th>\
                            <th class="col-field-value"><%- _("Value").t() %></th>\
                            <th class="col-field-action"><%- _("Actions").t() %></th>\
                        </thead>\
                        <tbody>\
                        <%= _partial({fields: selectedfields, slen: slen, iconVisibility: true, m: m, r:r, label: _("Selected").t(), selectableFields: selectableFields}) %>\
                        <%= _partial({fields: eventfields, slen: slen, iconVisibility: false, m: m, r:r, label: _("Event").t(), selectableFields: selectableFields}) %>\
                        <tr>\
                            <td rowspan="<%- timefields.length+1 %>" class="field-type"><%- _("Time").t() %><a class="_time-expand <%= expanded %>" href=""></a></td>\
                            <% if (selectableFields) { %>\
                                <td></td>\
                            <% } %>\
                           <td class="time">\
                               <a class="popdown-toggle _time" href="#" data-time="<%- m.get("_time")[0] %>">\
                                   <span>_time</span><span class="caret"></span>\
                               </a>\
                           </td>\
                           <td class="field-value f-v"><%- m.get("_time")[0] %>\
                               <% var tags = r.getTags("_time", m.get("_time")); %>\
                               <% if (tags.length > 0) { %>(<% _(tags).each(function(tag, idx){ %><a data-field-name="_time" data-tagged-field-name="tag::_time" class="tag" href="#"><%- tag %><%if(idx!=tags.length-1){%> <%}%></a><% }); %>)<% } %>\
                           </td>\
                           <td class="actions"></td>\
                        </tr>\
                        <%= _partial({fields: timefields, slen: slen, iconVisibility: false, m: m, r:r, label: null, selectableFields: selectableFields}) %>\
                        <%= _partial({fields: systemfields, slen: slen, iconVisibility: false, m: m, r:r, label: _("Default").t(), selectableFields: selectableFields}) %>\
                        </tbody>\
                    </table>\
                <% } else { %>\
                    <div class="event-fields-loading">Loading...</div>\
                <% } %>\
            '
        });
    }
);

define('keyboard/SearchModifier',["underscore"], function(_) {
    /**
     * A lil utility to translate modifier keys pressed to a search action (negate and/or replace)
     * Finds the best match of modifier key bindings based on navigator.userAgent.
     * Merges custom and defaults members and peforms reverse iteration where the lowest index 
     * custom entry takes highest precedent and defaults takes lowest.
     */
    function Modifier(options) {
        options || (options = {});
        var defaults = options.defaults || _.extend({}, Modifier.defaults),
            custom = options.custom || _.extend([], Modifier.custom);
        this.map = this.parse(defaults, custom);
    }
    Modifier.prototype = {
        isNegation: function(e) {
            return !!e[this.map.negate];
        },
        isReplacement: function(e) {
            return !!e[this.map.replace];
        },
        parse: function(defaults, custom) {
            var userAgent = navigator.userAgent || "",
                modifierMatch = null;
            for (var i=custom.length-1; i>-1; i--) {
                var modifier = custom[i];
                if (userAgent.search(modifier.userAgentRex)!=-1) {
                    modifierMatch = modifier;
                }
            }
            if(!modifierMatch) {
                modifierMatch = defaults;
            }
            return modifierMatch;
        }
    };
    Modifier.custom = [
        {"userAgentRex": /Macintosh/, "negate": "altKey", "replace": "metaKey"},//note: FF altKey+metaKey and click results in hand only possible negate/replace combo is shiftKey+metaKey or shiftKey+altKey.
        {"userAgentRex": /Linux.*Chrome/, "negate": "ctrlKey", "replace": "shiftKey"},
        {"userAgentRex": /Linux/, "negate": "ctrlKey", "replace": "metaKey"},
        {"userAgentRex": /Windows/, "negate": "altKey", "replace": "ctrlKey"}
    ];
    Modifier.defaults = {"userAgentRex": /.*/, "negate": "altKey", "replace": "metaKey"};
    return Modifier;
});

define('views/shared/JSONTree',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base'
    ],
    function($, _, module, BaseView) {
        return BaseView.extend({
            moduleId: module.id,
            className: "json-tree",
            /**
             * @param {Object} options {
             *     json: <json stringified object>
             *     isValidJSON: <a flag allowing opt-out of safe set json routine>
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                var defaults = {
                        isValidJSON: false,
                        json: '{}'
                };
                this.options = $.extend(true, defaults, this.options);
                
                this.setJSON(this.options.json, this.options.isValidJSON);
            },
            setJSON: function(json, optout) {
                var parsed;
                if(optout) {
                    return !(this._json = json);
                }

                if(typeof json !== 'string') {
                    json = JSON.stringify(json);
                } 

                try{
                    parsed = JSON.parse(json);
                } catch(e) {}
                
                this._json = parsed;
            }, 
            isJSON: function() {
                return !!this._json;
            },
            events: {
                'click .jsexpands': function(e) {
                    var $target = $(e.currentTarget);
                    this.trigger('interaction');
                    this.interacted = true;
                    $target.removeClass('jsexpands').addClass('jscollapse').text('[-]');
                    $target.next().show();
                    e.preventDefault();
                },
                'click .jscollapse': function(e) {
                    var $target = $(e.currentTarget);
                    this.trigger('interaction');
                    this.interacted = true;
                    $target.removeClass('jscollapse').addClass('jsexpands').text('[+]');
                    $target.next().hide();
                    e.preventDefault();
                }
            },
            printJSON: function(obj, indent, view) {
                var newIndent   = indent + 2,
                    returnValue = [],
                    level       = newIndent/2,
                    type        = typeof obj;
                
                if(!_.isObject(obj)) {   
                    return [view._type({ type: type, obj: obj})];               
                } else {
                    var isObj = !(obj instanceof Array),
                        list  = (isObj) ? _.keys(obj).sort() : obj.sort();

                    returnValue.push(view._bracket({isObj: isObj})); 
                    (list.length>0) && returnValue.push(view._state({expands: !(level<2), level: level }).trim());          
                    returnValue.push((level!==1)? '<span style="display: none;">': '<span>');
                    
                    for(var i=0; i<list.length; i++){
                        returnValue.push(view._indent({newIndent: newIndent}));
                        (isObj) ?
                            returnValue.push(
                                view._key({ 
                                    val: list[i], 
                                    level:level,
                                    pjson: view.printJSON,
                                    obj: obj,
                                    nIndent: newIndent,
                                    view: view
                                })):
                            returnValue.push(view.printJSON(list[i], newIndent, view));
                    }
                    returnValue.push(view._closeIndent({closingIndent: newIndent-1}), view._closeBracket({isObj: isObj}));
                }
                return _.flatten(returnValue).join('');                
            },
            render: function() {
                if(!this.interacted) {
                   this.$el.html(this.printJSON(this._json, 0, this));
                }
                return this;
            },
            _type: _.template('<span class="t <%- type %>"><%- obj %></span>'),
            _bracket: _.template('<span><%if(isObj){%>{<%}else{%>[<%}%></span>'),
            _state: _.template('\
                <% if(expands) { %>\
                    <a class="jsexpands level-<%-level%>">[+]</a>\
                <% } else { %>\
                    <a class="jscollapse level-<%-level%>">[-]</a>\
                <% } %>\
            '),
            _indent: _.template('<br><span><%-Array(newIndent+1).join(" ")%></span>'),
            _key: _.template('<span class="key level-<%-level%>"><span class="key-name"><%-val%></span>:<%= pjson(obj[val], nIndent, view) %></span>'),
            _closeIndent: _.template('</span><br><span class="level-<%-closingIndent%>"><%-Array(closingIndent).join(" ")%>'),
            _closeBracket: _.template('<%if(isObj){ %><span>}</span><%}else{%><span>]</span><%}%></span>')
        });
    }
 );

 define('views/shared/eventsviewer/shared/RawField',
    [
        'underscore',
        'module',
        'keyboard/SearchModifier',
        'splunk.util', 
        'views/Base',
        'models/services/search/IntentionsParser',
        'models/services/search/jobs/Result',
        'views/shared/JSONTree'
    ],
    function(_, module, KeyboardSearchModifier, util, BaseView, IntentionsParser, ResultModel, JSONTree){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'div',
            /**
             * @param {Object} options {
             *     model: {
             *         event: <models.services.search.job.ResultsV2.results[i]>,
             *         result: <models.services.search.job.ResultsV2,
             *         report: <models.services.SavedSearch>,
             *         searchJob: <models.Job>
             *     },
             *     collection: {
             *         eventRenderers: <collections.services.configs.EventRenderers>
             *     }
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.keyboardSearchModifier = new KeyboardSearchModifier();
                
                this.rowExpanded = 'rowExpanded' + this.options.idx;
                this.jsonInteraction = 'interaction' + this.options.idx;
                this.isSyntaxHighlighted = 'isSyntaxHighlighted' + this.options.idx;
                this.showAllLines = 'showAllLines' + this.options.idx;

                this.children.json = new JSONTree({
                    json: this.model.event.rawToText()
                });
                
                this._isJSON = this.children.json.isJSON();
                
                this.model.state.set(this.isSyntaxHighlighted, this._isJSON); 
                this.model.state.on('change:'+this.isSyntaxHighlighted, this.render, this);

                this.model.intentionsParser = new IntentionsParser();


                this.model.intentionsParser.on('change', function() {
                    this.model.report.entry.content.set('search', this.model.intentionsParser.fullSearch());
                    this.model.report.trigger('eventsviewer:drilldown');
                }, this);

                
                this.model.resultWorking = new ResultModel();
                this.model.resultWorking.results.on('reset', function() {
                    var event = this.model.resultWorking.results.at(0);
                    if (event) {
                        this.model.event.replace(event.toJSON());
                    }
                }, this);
                this.model.event.on('change', function() {
                    this.children.json.setJSON(this.model.event.rawToText(), false);
                    this.render(); 
                }, this);


                this.model.report.entry.content.on('change:display.events.type', function () {
                    var wrap = util.normalizeBoolean(this.model.report.entry.content.get("display.events.list.wrap")),
                        $raw = this.$('.raw-event');
                    $raw.removeClass('wrap');
                    if(this.model.report.entry.content.get('display.events.type') === 'raw' || wrap) {
                       $raw.addClass('wrap');
                    } 
                },this);
                this.model.report.entry.content.on('change:display.events.list.wrap', function () {
                    var wrap = util.normalizeBoolean(this.model.report.entry.content.get("display.events.list.wrap")),
                        $raw = this.$('.raw-event');
                    (wrap && !$raw.hasClass('wrap')) ? $raw.addClass('wrap') : $raw.removeClass('wrap');
                },this);
                
                this.children.json.on('interaction', function() {
                    if(!this.model.state.get(this.rowExpanded)) {
                        this.model.state.trigger(this.jsonInteraction);
                    }
                },this);
            },
            visibility: function() {
                if(this.model.state.get(this.isSyntaxHighlighted)) {
                    this.$('.toggle-raw-json').text(_("Show as raw text").t());
                } else {
                    this.$('.toggle-raw-json').text(_("Show syntax highlighted").t());
                }
            },
            events: {
                'mouseover .t': function(e) {
                    var $elem = this.getSegmentParent(e.target);
                    $elem.addClass('h');
                    e.preventDefault();
                },
                'mouseout .t': function(e) {
                    var $elem = this.getSegmentParent(e.target);
                    $elem.removeClass('h');

                },
                'click .t': function(e) {
                    var $root = this.getSegmentRoot($(e.currentTarget)), data;
                    if(!$root) {
                        $root = this.getSegmentParent(e.currentTarget);
                    }
                    data = {
                        value: $root.text(),
                        app: this.model.application.get('app'),
                        owner: this.model.application.get('owner'),
                        stripReportsSearch: false
                    };

                    this.model.intentionsParser.clear({silent: true});
                    if ($root.hasClass('a')) {
                        data = $.extend(data, {
                            q: this.model.report.entry.content.get('search'),
                            action: 'removeterm'
                        });
                    } else {
                        data = $.extend(data, {
                            q: this.keyboardSearchModifier.isReplacement(e) ? '*' : this.model.report.entry.content.get('search'),
                            action: 'addterm',
                            negate: this.keyboardSearchModifier.isNegation(e)
                        });
                    }
                    this.model.intentionsParser.fetch({data: data});
                    return false;
                },
                'click .hideinline': function(e) {
                    this.model.state.set(this.showAllLines, false);
                    e.preventDefault();
                 },
                'click .showinline': function(e) {
                    this.model.state.set(this.showAllLines, true); 
                    e.preventDefault();
                },
                'click .toggle-raw-json': function(e) {
                    this.model.state.set(this.isSyntaxHighlighted, !this.model.state.get(this.isSyntaxHighlighted)); 
                    e.preventDefault();
                }
            },
            getSegmentParent: function(element){
                var parent = element.parentNode;
                if (parent.childNodes[parent.childNodes.length-1]==element && $(parent).hasClass('t')) {
                    element = parent;
                }
                return $(element);
            },
            getSegmentRoot: function($element) {
                if($element.hasClass('event')) {
                    return void(0);
                } else if($element.hasClass('a')) {
                    return $element;
                } else {
                    return this.getSegmentRoot($element.parent());
                }
            },
            render: function() {
                var wrap = true,
                    content = this.model.report.entry.content,
                    type = content.get('display.events.type'),
                    linecount = parseInt(this.model.event.get('_fulllinecount'), 10),
                    decorations = {
                        'decoration_audit_valid': {"msg": "Valid", "label": "label-success", "icon": "icon-check-circle"} ,
                        'decoration_audit_gap': {"msg": "Gap", "label": "label-warning", "icon": "icon-minus-circle"} ,
                        'decoration_audit_tampered': {"msg": "Tampered!", "label": "label-important", "icon": "icon-alert-circle"} ,
                        'decoration_audit_cantvalidate': {"msg": "Can't validate!", "label": "label-info", "icon": "icon-question-circle" }
                    };
                if(type === 'list') {
                    wrap = util.normalizeBoolean(content.get('display.events.list.wrap'));
                }
                this.el.innerHTML = this.compiledTemplate({
                    _:_,
                    isTable: (this.model.report.entry.content.get('display.events.type') === 'table'),
                    isJSON: this._isJSON,
                    model: this.model.event,
                    linecount: linecount,
                    wrap: wrap,  
                    expanded: this.model.state.get(this.showAllLines),
                    decorations: decorations,
                    rawTextOnly: this.options.noSegmentation
                });
                
                var $rawevent = this.$('.raw-event');
                if(!this.options.noSegmentation && this._isJSON) {
                    if(this.model.state.get(this.isSyntaxHighlighted)){
                        this.$('.json-event').append(this.children.json.render().el);
                    } else {
                        var segmentation = this.model.event.getRaw();

                        $rawevent.removeClass('raw-event').hide();
                        $rawevent[0].innerHTML = segmentation;
                        $rawevent.addClass('raw-event').show();
                    }
                } else if(this.options.noSegmentation) {
                    this.$('.raw-event').append(this.model.event.rawToText());
                } else {
                    this.$('.raw-event').append(this.model.event.getRaw());
                }
                this.visibility();
                return this;
            },
            template: '\
                <% if(model.has("_decoration") && decorations[model.get("_decoration")]) { %>\
                    <% var decoration = decorations[model.get("_decoration")]; %>\
                    <span class="audit label  <%- decoration.label %>"><i class="<%- decoration.icon %>"></i> <%- decoration.msg %></span>\
                <% } %>\
                <pre class="json-event"></pre>\
                <div class="raw-event normal <% if(wrap){ %> wrap <% } %>"></div>\
                <% if(isJSON && !isTable) { %><a href="#" class="toggle-raw-json"><%- _("Show as raw text").t() %></a> <% } %>\
                <% if (expanded) { %>\
                    <a href="#" class="hideinline">Collapse</a>\
                <% } else if (model.isTruncated()) { %>\
                    <a href="#" class="showinline">Show all <%= linecount %> lines</a>\
                <% } %>\
            '
        });
    }
);

 define('views/shared/eventsviewer/raw/body/Row',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/eventsviewer/shared/EventFields',
        'views/shared/eventsviewer/shared/RawField'
    ],
    function($, _, Backbone, module, BaseView, EventFieldsView, RawField){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tr',
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         event: <models.services.search.job.ResultsV2.results[i]>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>
             *     },             
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions> 
             *     },
             *     selectableFields: true|false,
             *     allowRowExpand: true|false
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                
                //suite of namespaced keys
                this.rowExpanded = 'rowExpanded' + this.options.idx;
                this.jsonInteraction = 'interaction' + this.options.idx;
                this.swappingKey = 'swapResult' + this.options.idx;
                this.showAllLines = 'showAllLines' + this.options.idx;
                this.pendingRemove = 'pendingRemove' + this.options.idx;
                
                this.model.renderer = this.collection.eventRenderers.getRenderer(this.model.event.get('eventtype'));
                
                this.children.raw = new RawField({ 
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        report: this.model.report,
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    },
                    idx: this.options.idx
                });
                this.model.state.on('change:'+this.rowExpanded , this.visibility, this);
                
                //actors that expand the row && modalize
                this.model.state.on(this.jsonInteraction, this.clickToExpandRow, this);
                this.model.state.on('change:'+this.showAllLines, function() {
                    this.clickToExpandRow();
                }, this); 
                this.model.state.on('unmodalize'+this.options.idx, function() { 
                    this.clickToExpandRow(true); 
                }, this);
                
                this.model.result.on('tags-updated', function() { 
                    if(this.model.state.get(this.rowExpanded))  
                        this.render(); 
                }, this);
                
                this.model.report.entry.content.on('change:display.prefs.events.offset', this.collapseState, this);
            },
            events: {
                'click td.expands': function(e) {
                    this.eventFieldsFactory();
                    if (this.model.state.get(this.pendingRemove)) {
                        if(this.model.state.get(this.rowExpanded)) {
                            this.collapseState();
                        } else {
                            this.expandState();
                        }
                        e.preventDefault();
                        return;
                    }
                    this.clickToExpandRow(true);
                    e.preventDefault();
                }
            },
            eventFieldsFactory: function() {
                if (this.children.eventFields) {
                    this.children.eventFields.remove();
                }
                this.children.eventFields = new EventFieldsView({
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        summary: this.model.summary,
                        application: this.model.application,
                        report: this.model.report,
                        searchJob: this.model.searchJob
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand,
                    idx: this.options.idx,
                    swappingKey: this.swappingKey,
                    showAllLines: this.showAllLines
                });
                this.$('.event').find(this.children.raw.el).after(this.children.eventFields.render().el);
            },
            clickToExpandRow: function(isRowClick) {
                var options = {
                    'index':  this.options.idx,
                    'rtindex': this.model.result.results.length - this.options.idx - 1,
                    'showAllLines': this.model.state.get(this.showAllLines) 
                };
                
                if(!this.children.eventFields) {
                    this.eventFieldsFactory();
                }
                // Either a row click or show all lines click 
                if(!this.model.state.get(this.rowExpanded)) {
                    this.expandState();
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                
                // Collapse row click
                } else if(this.model.state.get(this.rowExpanded) && isRowClick) {
                    this.model.state.unset(this.showAllLines, {silent: true}); // force hide all lines
                    options.showAllLines = this.model.state.get(this.showAllLines); //update options
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                    this.collapseState();
                //interaction with show/hide more lines
                } else {
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                }
                this.model.state.unset('timeExpanded', {silent: true});                    
            },
            expandState: function() {
                this.model.state.set(this.rowExpanded, true);
                this.model.state.set('sleep', true);
            },
            collapseState: function() {
                this.model.state.unset('modalize');
                this.model.state.unset(this.rowExpanded);
                this.model.state.unset('sleep');
            },
            debouncedRemove: function() {
                this.model.state.set(this.pendingRemove, true);
                BaseView.prototype.debouncedRemove.apply(this, arguments);
                return this;
            },
            visibility: function() {
                var $arrow =  this.$('td.expands > a > i').removeClass('icon-triangle-right-small icon-triangle-down-small');
                if (this.model.state.get(this.rowExpanded) && this.options.allowRowExpand) {
                    $arrow.addClass('icon-triangle-down-small');
                    this.eventFieldsFactory();
                } else {
                    $arrow.addClass('icon-triangle-right-small');
                    if (this.children.eventFields) {
                        this.children.eventFields.remove();
                    }
                }
                this.children.raw.visibility();
                this.reflow();
            },
            render: function() {
                var root = this.el;
                //rows are read only (innerHTML) for ie
                this.$el.find('> td').each(function(key, element) {
                    root.removeChild(element);
                });
                this.$el.append(this.compiledTemplate({ 
                    expanded: this.model.state.get(this.rowExpanded),
                    colorClass: (this.model.renderer) ? this.model.renderer.entry.content.get('css_class'): '',
                    allowRowExpand: this.options.allowRowExpand
                }));
                this.$('.event').append(this.children.raw.render().el);
                this.visibility();
                return this;
            },
            reflow: function() {
               (this.model.state.get(this.rowExpanded)) ?
                    this.model.state.set('modalize', this.options.idx):
                    this.model.state.unset('modalize');
            },
            template: '\
                <% if (allowRowExpand) { %>\
                    <td class="expands <%- colorClass %>">\
                        <a href="#"><i class="icon-triangle-<%- expanded ? "down" : "right" %>-small"></i></a>\
                    </td>\
                <% } %>\
                <td class="event"></td>\
            '
        });
    }
);

define('views/shared/eventsviewer/raw/body/Master',
    [
        'underscore',
        'module',
        'models/Base',
        'views/Base',
        'views/shared/eventsviewer/raw/body/Row',
        'util/console'
    ],
    function(_, module, BaseModel, BaseView, Row, console){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tbody',
            type: 'raw',
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.jobs.ResultsV2>,
             *         summary: <model.services.search.jobs.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false,
             *     allowRowExpand: true|false
             * } 
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.result.results.on('reset', this.debouncedRender, this);
                this.model.report.entry.content.on('change:display.events.rowNumbers', this.debouncedRender, this);
                this.model.state.on('change:sleep', function() {
                    this.model.state.get('sleep') ? this.sleep({lite: true}) : this.wake({lite: true});
                }, this);
            },
            sleep: function(options) {
                (options && options.lite) ? (this.awake = false) : BaseView.prototype.sleep.apply(this);
                return this;
            },
            wake: function(options) {
                if(options && options.lite){
                    this.awake = true;
                    if (this.touch) {
                        this.render();
                    }
                } else {
                    BaseView.prototype.wake.apply(this);
                }
                return this;
            },
            isSelected: function() {
                return (this.model.report.entry.content.get('display.events.type') === this.type);
            },
            cleanup: function() {
                 this.$el.empty();
                 _.chain(this.children).values().invoke('debouncedRemove', {detach: true}).values();
                 this.children = {};
            },
            render: function() {
                this.trigger('rows:pre-remove');
                this.cleanup();
                var fragment = document.createDocumentFragment(),
                    isRealTimeSearch = this.model.searchJob ? this.model.searchJob.entry.content.get('isRealTimeSearch') : false, //for data model
                    results = isRealTimeSearch ? this.model.result.results.reverse({mutate: false}) : this.model.result.results.models;

                console.debug('Events Raw: rendering', results.length, 'events', isRealTimeSearch ? 'in real-time mode' : 'in historical mode');
                _.each(results, function(event, idx) {
                    this.children['row_' + idx] = new Row({ 
                        model: { 
                            event : event, 
                            result: this.model.result,
                            report: this.model.report,
                            state: this.model.state,
                            summary: this.model.summary,
                            application: this.model.application,
                            searchJob: this.model.searchJob
                        }, 
                        collection: { 
                            workflowActions: this.collection.workflowActions,
                            eventRenderers: this.collection.eventRenderers,
                            selectedFields: this.collection.selectedFields
                        },
                        idx: idx,
                        selectableFields: this.options.selectableFields,
                        allowRowExpand: this.options.allowRowExpand
                    });
                    fragment.appendChild(this.children['row_' + idx].render().el);
                }, this);
                this.el.appendChild(fragment);
                
                //bulk purge of remove mutex
                _(this.model.state.toJSON()).each(function(value, key) {
                    if(key.indexOf('pendingRemove') === 0) {
                        this.model.state.unset(key);
                    }
                },this);
                
                this.trigger('rows:added');
                return this;
            }
        });
    }
);

define('views/shared/eventsviewer/raw/Master',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'models/Base',
        'views/Base',
        'views/shared/delegates/Modalize',
        'views/shared/eventsviewer/shared/TableHead',
        'views/shared/eventsviewer/raw/body/Master'
    ],
    function($, _, Backbone, module, BaseModel,  BaseView, Modalize, TableHeadView, TableBodyView){
        return BaseView.extend({
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.jobs.ResultsV2>,
             *         summary: <model.services.search.jobs.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false,
             *     allowRowExpand: true|false
             * }
             */
            className: 'scrolling-table-wrapper',
            moduleId: module.id,
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.state = this.model.state || new BaseModel();
                this.children.modalize = new Modalize({el: this.el, tbody: '> table > tbody'});
                this.children.head = new TableHeadView({
                    labels: ['Event'],
                    allowRowExpand: this.options.allowRowExpand,
                    allowLineNum: false
                });
                this.children.body = new TableBodyView({
                    model: {
                        result: this.model.result,
                        state: this.model.state,
                        summary: this.model.summary,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application
                    },
                    collection: { 
                        workflowActions: this.collection.workflowActions,
                        eventRenderers: this.collection.eventRenderers,
                        selectedFields: this.collection.selectedFields 
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand
                });

                //Modalize 
                var modalize = _.debounce(this.modalize);
                this.model.state.on('change:modalize', modalize, this);
                this.collection.selectedFields.on('reset add remove', modalize, this);
                
                this.children.modalize.on('unmodalize', function(idx) {
                    this.model.state.trigger('unmodalize'+idx);
                },this);
                
                this.children.body.on('rows:pre-remove', function() { this.$el.css('minHeight', this.$el.height()); },this);
                this.children.body.on('rows:added', function() { this.$el.css('minHeight', ''); },this);
            },
            modalize: function() {
                this.children.modalize.show(this.model.state.get('modalize'));
            },
            render: function() {
                this.$el.html(this.template);
                this.$('> table.events-results').append(this.children.head.render().el);
                this.$('> table.events-results').append(this.children.body.render().el);
                return this;
            },
            template: '\
                <table class="table table-chrome table-row-expanding events-results events-results-table"></table>\
            '
        });
    }
);

define('views/shared/TableHead',
    [
        'underscore',
        'backbone',
        'module',
        'views/Base'
    ],
    function(
        _,
        Backbone,
        module,
        BaseView
    )
    {
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'thead',
            /**
             * @param {Object} options {
             *     model: <Backbone.Model>
             * }
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                var defaults = {
                    columns: [] // hash: label, sortKey (optional)
                };
                _.defaults(this.options, defaults);
                this.model.on('change:sortKey change:sortDirection', this.debouncedRender, this);
            },
            events: {
                'click th': function(e) {
                    var $target = $(e.currentTarget),
                        sortKey = $target.attr('data-key'),
                        sortDirection = $target.hasClass('asc') ? 'desc': 'asc';
                    if (!sortKey) {
                        return true;
                    }
                    this.model.set({sortKey: sortKey, sortDirection: sortDirection});
                    e.preventDefault();
                },
                'click th > a': function(e) {
                    e.preventDefault();
                }
            },
            render: function() {
                var html = this.compiledTemplate({
                    _: _,
                    columns: this.options.columns,
                    model: this.model
                });
                this.$el.html(html);
                return this;
            },
            template: '\
                <tr class="">\
                    <% _.each(columns, function(value, sortKey) { %>\
                        <% var sortableClassName = (value.sortKey) ? "sorts" : "" %>\
                        <% var activeClassName = model.get("sortKey") && value.sortKey==model.get("sortKey") ? "active " + model.get("sortDirection") : "" %>\
                        <th data-key="<%- value.sortKey || "" %>" class="<%- sortableClassName %> <%- activeClassName %> <%- value.className || "" %>" <%- value.colSpan ? "colspan=" + value.colSpan : "" %> >\
                        <% if (value.html) { %>\
                            <%= value.html %>\
                        <% } else if (value.sortKey) { %>\
                            <a href="#"><%- value.label %><i class="icon-sorts <%- activeClassName %>"></i></a>\
                        <% } else { %>\
                            <%- value.label %>\
                        <% } %>\
                        </th>\
                    <% }) %>\
                </tr>\
            '
        });
    }
);

define('views/shared/eventsviewer/list/body/row/SelectedFields',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/delegates/Popdown',
        'views/shared/FieldInfo',
        'views/shared/eventsviewer/shared/WorkflowActions',
        'views/shared/eventsviewer/shared/BaseFields'
    ],
    function($, _, Backbone, module, BaseView, Popdown, FieldInfo, WorkflowActionsView, BaseFieldsView){
        return BaseFieldsView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *      model: {
             *         event: <models.services.search.job.ResultsV2.results[i]>,
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *     },
             *     selectableFields: true|false
             */
            initialize: function(){
                BaseFieldsView.prototype.initialize.apply(this, arguments);
                this.rowExpanded = 'rowExpanded' + this.options.idx;
            },
            render: function() {
                var strippedfields = this.model.event.strip(),
                    selectedfields = _.intersection(strippedfields, this.collection.selectedFields.pluck('name')).sort();
                this.$el.html(this.compiledTemplate({
                    selectedfields: selectedfields,
                    selectableFields: this.options.selectableFields,
                    m: this.model.event,
                    slen: this.model.summary.fields.length,
                    r: this.model.result,
                    _partial: this._partial,
                    _condensedSelectedFields: this._condensedSelectedFields,
                    selected: selectedfields.length,
                    _:_
                }));                
                return this;
            },
            _condensedSelectedFields: _.template('\
                <ul class="condensed-selected-fields">\
                <%  _(fields).each(function(field, i) { %>\
                    <% var values = m.get(field) %>\
                    <li>\
                        <% _(values).each(function(value, idx) { %>\
                            <span class="field"><%- field %> =</span>\
                            <span class="field-value"><a class="f-v" data-field-name="<%-field %>" title="<%= value ? value : "&nbsp;"%>"><% if(value) {%><%- value %><% } else { %>&nbsp;<% } %></a></span>\
                            <% var tags = r.getTags(field, value); %>\
                            <% if (tags.length) { %>\
                                  <% _(tags).each(function(tag, idx){ %><a data-tagged-field-name="tag::<%- field %>" class="tag" href="#"><%- tag %>\
                                        <%if(idx!=tags.length-1){%> <%}%>\
                                    </a><% }); %>\
                            <% } %>\
                        <% }) %>\
                    </li>\
                <% }) %>\
              </ul>\
            '),
            _noncondensedSelectedFields: _.template('\
                <table class="table table-condensed table-embed outer-template table-dotted">\
                    <tbody>\
                        <!-- FIXME: this should be inside the row below -->\
                        <tr class="row-more-fields">\
                            <td></td>\
                            <td></td>\
                            <td></td>\
                            <td class="col-more-fields" rowspan="4">\
                                <a href="#" class="more-fields"><%- selected %> of <%- total %> fields</a>\
                            </td>\
                        </tr>\
                        <%= _partial({fields: selectedfields, slen: slen, m: m, r:r, label: void(0), selectableFields: false}) %>\
                    </tbody>\
                </table>\
            '),
            template: '\
                <% if (selected) { %>\
                    <%= _condensedSelectedFields({ fields: selectedfields, m: m, r:r, _:_ }) %>\
                <% } %>\
           '
           // <!-- <%= _noncondensedSelectedFields({fields: selectedfields, _partial: _partial, _:_, slen: slen, m: m, r:r, label: void(0), selectableFields: false}) %> -->\
        });
    }
);

define('views/shared/eventsviewer/list/body/row/Master',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/TableHead',
        'views/shared/eventsviewer/list/body/row/SelectedFields',
        'views/shared/eventsviewer/shared/EventFields',
        'views/shared/eventsviewer/shared/RawField',
        'splunk.util'
    ],
    function(
        $,
        _,
        Backbone,
        module,
        BaseView,
        TableHeadView,
        SelectedFieldsView,
        EventFieldsView,
        RawField,
        splunkUtil
    ){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tr',
            /**
             * @param {Object} options {
             *      model: {
             *         event: <models.services.search.job.ResultsV2.results[i]>,
             *         result: <models.services.search.job.ResultsV2>,
             *         state: <models.Base>,
             *         summary: <models.services.searchjob.SummaryV2>,
             *         report: <models.services.SavedSearch>,
             *         searchJob: <models.Job>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>,
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                
                //suite of namespaced keys
                this.rowExpanded = 'rowExpanded' + this.options.idx;
                this.jsonInteraction = 'interaction' + this.options.idx;
                this.swappingKey = 'swapResult' + this.options.idx;
                this.showAllLines = 'showAllLines' + this.options.idx;
                this.pendingRemove = 'pendingRemove' + this.options.idx;
                
                this.model.renderer = this.collection.eventRenderers.getRenderer(this.model.event.get('eventtype'));
                
                //event 
                this.children.raw = new RawField({
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        report: this.model.report,
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    },
                    collection: {
                        eventRenderers: this.collection.eventRenderers
                    },
                    idx: this.options.idx
                });
                //collapsed view
                this.children.selectedFields = new SelectedFieldsView({
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        summary: this.model.summary,
                        application: this.model.application,
                        report: this.model.report,
                        searchJob: this.model.searchJob
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        workflowActions: this.collection.workflowActions
                    },
                    idx: this.options.idx,
                    selectableFields: this.options.selectableFields
                });
                this.model.state.on('change:'+this.rowExpanded , this.visibility, this);
                
                //actors that expand the row && modalize
                this.model.state.on(this.jsonInteraction, this.clickToExpandRow, this);
                this.model.state.on('change:'+this.showAllLines, function() {
                    this.clickToExpandRow();
                }, this); 
                this.model.state.on('unmodalize'+this.options.idx, function() {
                    this.clickToExpandRow(true); 
                }, this);
                
                this.model.result.on('tags-updated', function() { 
                    if(this.model.state.get(this.rowExpanded)) { 
                        this.render(); 
                    }
                }, this);
                this.model.report.entry.content.on('change:display.prefs.events.offset', this.collapseState, this);
            },
            events: {
                'click td.expands': function(e) {
                    this.eventFieldsFactory();
                    
                    if (this.model.state.get(this.pendingRemove)) {
                        if(this.model.state.get(this.rowExpanded)) {
                            this.collapseState();
                        } else {
                            this.expandState();
                        }
                        e.preventDefault();
                        return;
                    }
                    this.clickToExpandRow(true);
                    e.preventDefault();
                },
                'click .formated-time': function(e) {
                    var epoch = splunkUtil.getEpochTimeFromISO($(e.currentTarget).data().timeIso);
                    this.model.report.entry.content.set({
                        'dispatch.earliest_time': epoch,
                        'dispatch.latest_time': '' + (parseFloat(epoch) + 1)
                    });
                    this.model.report.trigger('eventsviewer:drilldown');
                    e.preventDefault();
                } 
            },
            eventFieldsFactory: function() {
                if (this.children.eventFields) {
                    this.children.eventFields.remove();
                }
                this.children.eventFields = new EventFieldsView({
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        summary: this.model.summary,
                        application: this.model.application,
                        report: this.model.report,
                        searchJob: this.model.searchJob
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand,
                    idx: this.options.idx,
                    swappingKey: this.swappingKey,
                    showAllLines: this.showAllLines
                });
                this.$('.event').find(this.children.raw.el).after(this.children.eventFields.render().el);
            },
            clickToExpandRow: function(isRowClick) {
                var options = {
                    'index':  this.options.idx,
                    'rtindex': this.model.result.results.length - this.options.idx - 1,
                    'showAllLines': this.model.state.get(this.showAllLines) 
                };
                if(!this.children.eventFields) {
                    this.eventFieldsFactory();
                }
                // Either a row click or show all lines click 
                if(!this.model.state.get(this.rowExpanded)) {
                    this.expandState();
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                
                // Collapse row click
                } else if(this.model.state.get(this.rowExpanded) && isRowClick) {
                    this.model.state.unset(this.showAllLines, {silent: true}); // force hide all lines
                    options.showAllLines = this.model.state.get(this.showAllLines); //update options
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                    this.collapseState();
                //interaction with show/hide more lines
                } else {
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                }
                this.model.state.unset('timeExpanded', {silent: true});                    
            },
            expandState: function() {
                this.model.state.set(this.rowExpanded, true);
                this.model.state.set('sleep', true);
            },
            collapseState: function() {
                this.model.state.unset('modalize');
                this.model.state.unset(this.rowExpanded);
                this.model.state.unset('sleep');
            },
            debouncedRemove: function() {
                this.model.state.set(this.pendingRemove, true);
                BaseView.prototype.debouncedRemove.apply(this, arguments);
                return this;
            },
            visibility: function() {
                var $arrow =  this.$('td.expands > a > i').removeClass('icon-triangle-right-small icon-triangle-down-small');
                if (this.model.state.get(this.rowExpanded) && this.options.allowRowExpand) {
                    $arrow.addClass('icon-triangle-down-small');
                    this.eventFieldsFactory();
                } else {
                    $arrow.addClass('icon-triangle-right-small');
                    this.children.selectedFields.wake().$el.css('display', '');
                    if (this.children.eventFields) {
                        this.children.eventFields.remove();
                    }
                }
                this.children.raw.visibility();
                this.reflow();
            },
            render: function() {
               var root = this.el;
               //rows are read only (innerHTML) for ie
               this.$el.find('> td').each(function(key, element) {
                   root.removeChild(element);
               });
               this.$el.append(this.compiledTemplate({
                    $: $,
                    event: this.model.event,
                    lineNum: this.options.lineNum,
                    application: this.model.application,
                    expanded: this.model.state.get(this.rowExpanded),
                    formattedTime: this.model.event.formattedTime(),
                    colorClass: (this.model.renderer) ? this.model.renderer.entry.content.get('css_class'): '',
                    allowRowExpand: this.options.allowRowExpand
                }));
                
                this.$('.event').append(this.children.raw.render().el);
                this.$('.event').append(this.children.selectedFields.render().el);

                this.visibility();
                return this;
            },
            reflow: function() {
               (this.model.state.get(this.rowExpanded)) ?
                    this.model.state.set('modalize', this.options.idx):
                    this.model.state.unset('modalize');
                    
                BaseView.prototype.reflow.apply(this, arguments);
            },
            template: '\
                <% if (allowRowExpand) { %>\
                <td class="expands <%- colorClass %>">\
                    <a href="#"><i class="icon-triangle-<%- expanded ? "down" : "right" %>-small"></i></a>\
                </td>\
                <% } %>\
                <td class="line-num"><span><%- lineNum %></span></td>\
                <td class="_time">\
                    <span class="formated-time" data-time-iso="<%- event.get("_time") %>">\
                    <% if(application.get("locale").indexOf("en") > -1){ %>\
                         <span><%- $.trim(formattedTime.slice(0, formattedTime.indexOf(" "))) %></span>\
                         <br>\
                         <span><%- $.trim(formattedTime.slice(formattedTime.indexOf(" "))) %></span>\
                    <% } else { %>\
                         <%- formattedTime %>\
                    <% } %>\
                    </span>\
                </td>\
                <td class="event"></td>\
            '
        });
    }
);

define('views/shared/eventsviewer/list/body/Master',
    [
        'module',
        'underscore',
        'models/Base',
        'views/Base',
        'views/shared/eventsviewer/list/body/row/Master',
        'util/console'
    ],
    function(module, _, BaseModel, BaseView, Row, console){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tbody',
            type: 'list',
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         summary: <model.services.search.job.SummaryV2>
             *         state: <models.BaseV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>,
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false  
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.result.results.on('reset', this.debouncedRender, this);
                this.model.state.on('change:sleep', function() {
                    this.model.state.get('sleep') ? this.sleep({lite: true}) : this.wake({lite: true});
                }, this);
            },
            sleep: function(options) {
                (options && options.lite) ? (this.awake = false) : BaseView.prototype.sleep.apply(this);
                return this;
            },
            wake: function(options) {
                if(options && options.lite){
                    this.awake = true;
                    if (this.touch) {
                        this.render();
                    }
                } else {
                    BaseView.prototype.wake.apply(this);
                }
                return this;
            },
            isSelected: function() {
                return (this.model.report.entry.content.get('display.events.type') === this.type);
            },
            cleanup: function() {
                _.chain(this.children).values().invoke('debouncedRemove', {detach: true}).values();
                this.children = {};
            },
            render: function() {
                this.trigger('rows:pre-remove');
                this.cleanup();
                var fragment = document.createDocumentFragment(),
                    isRealTimeSearch = this.model.searchJob.entry.content.get('isRealTimeSearch'),
                    results = isRealTimeSearch ? this.model.result.results.reverse({mutate: false}) : this.model.result.results.models;

                console.debug('Events Lister: rendering', results.length, 'events', isRealTimeSearch ? 'in real-time mode' : 'in historical mode');
                _.each(results, function(event, idx) {
                    var lineNum,
                        id = 'row_' + idx;
                    if (this.model.searchJob.entry.content.get('isRealTimeSearch')) {
                        lineNum = this.model.result.endOffset() - idx;
                    } else {
                        lineNum = this.model.result.get('init_offset') + idx + 1;
                    }
                    this.children[id] = new Row({ 
                        lineNum: lineNum,
                        model: {
                            state: this.model.state,
                            event: event,
                            result: this.model.result,
                            summary: this.model.summary,
                            report: this.model.report,
                            application: this.model.application,
                            searchJob: this.model.searchJob
                        },
                        collection: {
                            selectedFields: this.collection.selectedFields,
                            eventRenderers: this.collection.eventRenderers,
                            workflowActions: this.collection.workflowActions
                        },
                        idx: idx,
                        selectableFields: this.options.selectableFields,
                        allowRowExpand: this.options.allowRowExpand
                    });
                    fragment.appendChild(this.children[id].render().el);
                }, this);
                this.el.appendChild(fragment);
                
                //bulk purge of remove mutex
                _(this.model.state.toJSON()).each(function(value, key) {
                    if(key.indexOf('pendingRemove') === 0) {
                        this.model.state.unset(key);
                    }
                },this);
                
                this.trigger('rows:added');
                return this;
            }
        });
    }
);

define('views/shared/eventsviewer/list/Master',
    [
        'underscore',
        'module',
        'models/Base',
        'splunk.i18n',
        'util/time_utils',
        'views/Base',
        'views/shared/delegates/Modalize',
        'views/shared/delegates/TableDock',
        'views/shared/eventsviewer/shared/TableHead',
        'views/shared/eventsviewer/list/body/Master',
        'splunk.util'
    ],
    function(_, module, BaseModel, i18n, time_utils,  BaseView, Modalize, TableDock, TableHeadView, TableBodyView, util){
        return BaseView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>,
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>
             *     },
             *     selectableFields: true|false,
             *     allowRowExpand: true|false              
             */
            className: 'scrolling-table-wrapper',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.state = this.model.state || new BaseModel();
                this.children.modalize = new Modalize({el: this.el, tbody: '> table > tbody'});
                this.children.head = new TableHeadView({
                    model: this.model.report,
                    labels: ['Time', 'Event'],
                    allowRowExpand: this.options.allowRowExpand
                });
                this.children.body = new TableBodyView({
                    model: { 
                        result: this.model.result,
                        summary: this.model.summary,
                        state: this.model.state,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        eventRenderers: this.collection.eventRenderers,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand
                });
                
                if (this.options.headerMode==='dock') {
                    this.children.tableDock = new TableDock({ el: this.el, offset: 36, defaultLayout: 'fixed'});
                }
                
                var modalize = _.debounce(this.modalize);
                this.model.state.on('change:modalize', modalize, this);
                
                this.collection.selectedFields.on('reset add remove', modalize, this);
                
                this.model.report.entry.content.on('change:display.events.rowNumbers', function() {
                     this.$('table:not(.table-embed)').toggleClass('hide-line-num');
                     this.deferUpdateDock();
                }, this);
                
                this.model.report.entry.content.on('change:display.events.list.wrap', function() {
                     this.deferUpdateDock();
                }, this);
                
                this.model.result.results.on('reset', function() {
                    if(!_.isNumber(this.model.state.get('modalize'))) {
                        this.deferUpdateDock();
                    }
                }, this);
                
                /*
                 * The modalize delegate relays clicks on the modazlize mask back to 
                 * its creator.  This is translated into a row specific event
                 * which will set the state model into a collapsed state.
                 */
                this.children.modalize.on('unmodalize', function(idx) {
                    this.model.state.trigger('unmodalize'+idx);
                    this.children.tableDock && this.children.tableDock.enable();
                },this);

                this.model.state.on('change:modalize', function(model) {
                    if(this.children.tableDock) {
                        _.isNumber(model.get('modalize')) ? this.children.tableDock.disable() : this.children.tableDock.enable();
                    }
                },this);
                
                this.children.body.on('rows:pre-remove', function() { this.$el.css('minHeight', this.$el.height()); },this);
                this.children.body.on('rows:added', function() { this.$el.css('minHeight', ''); },this);
            },
            remove: function() {
                BaseView.prototype.remove.apply(this, arguments);
                $(window).off('.'+this.cid);
            },
            modalize: function() {
                this.children.modalize.show(this.model.state.get('modalize'));
                if(this.model.state.get('modalize')) {
                    this.children.tableDock && this.children.tableDock.disable();
                }
            },
            deferUpdateDock: function() {
                if (this.children.tableDock) {
                    _.defer(this.children.tableDock.update.bind(this.children.tableDock));
                }
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                     hidelinenums: !util.normalizeBoolean(this.model.report.entry.content.get("display.events.rowNumbers")),
                     cid: this.cid
                }));
                this.$('> table.events-results').append(this.children.head.render().el);
                this.$('> table.events-results').append(this.children.body.render().el);
                return this;
            },
            template: '\
                <table class="table table-chrome <% if(hidelinenums){ %> hide-line-num <% } %> table-row-expanding events-results events-results-table" id="<%= cid %>-table"></table>\
            '
        });
    }
);

define('views/shared/eventsviewer/table/TableHead',
    [
        'underscore',
        'module',
        'views/Base',
        'splunk.util',
        'helpers/user_agent'
    ],
    function(
        _,
        module,
        BaseView,
        util,
        user_agent
    )
    {
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'thead',
            /**
             * @param {Object} options {
             *     model: <models.services.SavedSearch>,
             *     collection: <Backbone.Collection>
             * }
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.collection.intersectedFields.on('reset', this.render,this);
                this.model.entry.content.on('change:display.events.rowNumbers change:display.events.table.sortDirection change:display.events.table.sortColumn', this.render, this);
            },
            events: {
                'click th': function(e) {
                    var $target = $(e.currentTarget);
                    this.model.entry.content.set({
                        'display.events.table.sortDirection': ($target.hasClass('asc') ? 'desc' : 'asc'),
                        'display.events.table.sortColumn': $target.attr('data-name')
                    });
                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    collection: this.collection.intersectedFields,
                    hasRowNum: util.normalizeBoolean(this.model.entry.content.get('display.events.rowNumbers')),
                    allowRowExpand: this.options.allowRowExpand,
                    content: this.model.entry.content,
                    reorderableHandle: this.options.selectableFields ? 'on': 'off',
                    isRealTime: this.options.isRealTime,
                    is_ie7: (user_agent.isIE7()) ? 'ie7': '',
                    _: _
                }));
                return this;
            },
            template: '\
                <tr class="">\
                    <% if (allowRowExpand) { %>\
                        <th class="col-info"><i class="icon-info"></i></th>\
                    <% } %>\
                    <% if(hasRowNum) { %>\
                        <th class="line-num <%- is_ie7 %>">&nbsp;</th>\
                    <% }%>\
                    <th class="col-time <%- content.get("display.events.table.sortColumn") ? "sorts" : "" %> <%- is_ie7 %>">_time</th>\
                    <% collection.each(function(model) { %>\
                        <% var active = (!isRealTime && (content.get("display.events.table.sortColumn") == model.get("name"))) ? "active": ""%>\
                        <% var dir = (!isRealTime && (active==="active")) ? content.get("display.events.table.sortDirection") : ""%>\
                        <% var sorts = (!isRealTime) ? "sorts" : ""; %>\
                        <th class=" reorderable <%- sorts %> <%-active%> <%-dir%>" data-name="<%- model.get("name") %>"><span class="reorderable-label <%- reorderableHandle %>"><%- _(model.get("name")).t() %></span></th>\
                    <% }) %>\
                </tr>\
            '
        });
    }
);


define('views/shared/eventsviewer/table/body/PrimaryRow',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'models/services/search/IntentionsParser',
        'views/Base',
        'splunk.util'
    ],
    function($, _, Backbone, module, IntentionsParser, BaseView, splunkutil){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tr',
            /**
             * @param {Object} options {
             *     model: { 
             *         event: <models.services.search.job.ResultsV2.results[i]>,
             *         report: <models.services.SavedSearch>,
             *         state: <models.Base>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *     }
             *     
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.$el.addClass((!!(this.options.idx%2))?'even':'odd');
                this.model.renderer = this.collection.eventRenderers.getRenderer(this.model.event.get('eventtype'));
               
                //suite of namespaced keys
                this.rowExpanded = 'rowExpanded' + this.options.idx;
                this.jsonInteraction = 'interaction' + this.options.idx;
                this.swappingKey = 'swapResult' + this.options.idx;
                this.showAllLines = 'showAllLines' + this.options.idx;
                this.pendingRemove = 'pendingRemove' + this.options.idx;
                
                this.model.intentionsParser = new IntentionsParser(); 
                this.model.intentionsParser.on('change', function() {
                    this.model.report.entry.content.set('search', this.model.intentionsParser.fullSearch());
                    this.model.report.trigger('eventsviewer:drilldown');
                }, this);
                this.model.report.entry.content.on('change:display.events.table.drilldown', this.render, this);
                this.model.state.on('change:'+this.rowExpanded , this.debouncedRender, this);
                
                this.model.state.on(this.jsonInteraction, this.clickToExpandRow, this);
                this.model.state.on('change:'+this.showAllLines, function() {
                    this.clickToExpandRow();
                }, this); 
                this.model.state.on('unmodalize'+this.options.idx, function() {
                    this.clickToExpandRow(true); 
                }, this);
                
                this.collection.selectedFields.on('reset add remove', this.render, this);
                this.model.report.entry.content.on('change:display.prefs.events.offset', this.collapseState, this);
                this.model.report.entry.content.on('change:display.events.list.wrap', function () {
                    var wrap = splunkutil.normalizeBoolean(this.model.report.entry.content.get("display.events.list.wrap")),
                        $cells = this.$('a.field-val').parents('td');
                   (wrap) ? $cells.removeClass('no-wrap'):  $cells.addClass('no-wrap');
                },this);
            },
            events: {
                'click td.expands': function(e) {
                    if (this.model.state.get(this.pendingRemove)) {
                        if(this.model.state.get(this.rowExpanded)) {
                            this.collapseState();
                        } else {
                            this.expandState();
                        }
                        e.preventDefault();
                        return;
                    }
               
                    this.clickToExpandRow(true);
                    e.preventDefault();
                },
                'click ._time-drilldown > a': function(e) {
                    e.preventDefault(); // handled by the cell.
                },
                'click ._time-drilldown': function(e) {
                    if(splunkutil.normalizeBoolean(this.model.report.entry.content.get('display.events.table.drilldown'))){
                        var epoch = splunkutil.getEpochTimeFromISO($(e.currentTarget).find('a').data().timeIso);
                        this.model.report.entry.content.set({
                            'dispatch.earliest_time': epoch,
                            'dispatch.latest_time': '' + (parseFloat(epoch) + 1)
                        });
                        this.model.report.trigger('eventsviewer:drilldown');
                        e.preventDefault();
                    }
                },
                'click .one-value-drilldown > a.field-val': function(e) {
                    e.preventDefault(); // handled by the cell.
                },
                'click .one-value-drilldown': function(e) {
                    e.preventDefault();
                    this.drilldown($(e.currentTarget).find('a'));
                },
                'click .multi-value-drilldown > a.field-val': function(e) {
                    e.preventDefault();
                    this.drilldown($(e.currentTarget));
                }
            },
            clickToExpandRow: function(isRowClick) {
                var options = {
                    'index':  this.options.idx,
                    'rtindex': this.model.result.results.length - this.options.idx - 1,
                    'showAllLines': this.model.state.get(this.showAllLines) 
                };
                if(!this.model.state.get(this.rowExpanded)) {
                    this.expandState();
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                
                // Collapse row click
                } else if(this.model.state.get(this.rowExpanded) && isRowClick) {
                    this.model.state.unset(this.showAllLines, {silent: true}); // force hide all lines
                    options.showAllLines = this.model.state.get(this.showAllLines); //update options
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                    this.collapseState();
                //interaction with show/hide more lines
                } else {
                    this.model.result.stopReset = true;
                    this.model.result.trigger('swap-single-event ' + this.swappingKey, options);
                }
                this.model.state.unset('timeExpanded', {silent: true});                    
            },
            debouncedRemove: function() {
                this.model.state.set(this.pendingRemove, true);
                BaseView.prototype.debouncedRemove.apply(this, arguments);
                return this;
            },
            drilldown: function($target) {
                var field = $target.data().name,
                    value = $.trim($target.text());
                this.model.intentionsParser.clear({silent: true});
                this.model.intentionsParser.fetch({
                    data: {
                        q: this.model.report.entry.content.get('search'),
                        action: 'fieldvalue', 
                        field: field,
                        value: value,
                        app: this.model.application.get('app'),
                        owner: this.model.application.get('owner')
                    }
                });
            },
            expandState: function() {
                this.model.state.set(this.rowExpanded, true);
                this.model.state.set('sleep', true);
            },
            collapseState: function() {
                this.model.state.unset('modalize');
                this.model.state.unset(this.rowExpanded);
                this.model.state.unset('sleep');
            },
            render: function() {
                var root = this.el;
                //rows are read only (innerHTML) for ie
                this.$el.find('> td').each(function(key, element) {
                    root.removeChild(element);
                });
                this.$el.append(this.compiledTemplate({
                    $: $,
                    _:_,
                    event: this.model.event,
                    lineNum: this.options.lineNum,
                    expanded: this.model.state.get(this.rowExpanded),
                    drilldown: splunkutil.normalizeBoolean(this.model.report.entry.content.get('display.events.table.drilldown')),
                    application: this.model.application,
                    selectedFields: this.collection.selectedFields,
                    colorClass: (this.model.renderer) ? this.model.renderer.entry.content.get('css_class'): '',
                    formattedTime: this.model.event.formattedTime(),
                    allowRowExpand: this.options.allowRowExpand,
                    wrap: splunkutil.normalizeBoolean(this.model.report.entry.content.get('display.events.table.wrap')),
                    splunkutil: splunkutil
                }));
                return this;
            },
            reflow: function() {
               (this.model.state.get(this.rowExpanded)) ?
                    this.model.state.set('modalize', this.options.idx):
                    this.model.state.unset('modalize');
            },
            template: '\
                <% if (allowRowExpand) { %>\
                    <td <%if(expanded) {%>rowspan=2<%}%> class="expands <%- colorClass %>">\
                        <a href="#"><i class="icon-triangle-<%- expanded ? "down" : "right" %>-small"></i></a>\
                    </td>\
                <% } %>\
                <td class="line-num"><span><%- lineNum %></span></td>\
                <td class="_time <%= drilldown ? "_time-drilldown" : ""  %>">\
                    <% if(drilldown) { %>\
                        <a data-time-iso="<%- event.get("_time") %>">\
                    <% } else { %>\
                        <span data-time-iso="<%- event.get("_time") %>">\
                    <% } %>\
                        <% if(application.get("locale").indexOf("en") > -1){ %>\
                             <span><%- $.trim(formattedTime.slice(0, formattedTime.indexOf(" "))) %></span>\
                             <br>\
                             <span><%- $.trim(formattedTime.slice(formattedTime.indexOf(" "))) %></span>\
                        <% } else { %>\
                             <%- formattedTime %>\
                        <% } %>\
                    <% if(drilldown) { %>  </a>  <% } else { %> </span> <% } %>\
                </td>\
                <% selectedFields.each(function(model) { %>\
                    <% var fields = event.get(model.get("name")); %>\
                    <% if (drilldown) { %>\
                        <td class="<% if(!wrap) { %>no-wrap<% } %> <%= drilldown && fields && fields.length > 1 ? "multi-value-drilldown" : ""  %> <%= drilldown && fields && fields.length == 1 ? "one-value-drilldown" : ""  %>"><% _(fields).each(function(field) { %><a class="field-val" data-name="<%- model.get("name") %>"><%- field %></a><% }) %></td>\
                    <% } else { %>\
                        <td class="<% if(!wrap) { %>no-wrap<% } %>"><% _(fields).each(function(field) { %><span class="field-val" data-name="<%- model.get("name") %>"><%- field %></span><% }) %></td>\
                    <% } %>\
                <% }) %>\
            '
        });
    }
);  

 define('views/shared/eventsviewer/table/body/SecondaryRow',
    [
        'module',
        'underscore',
        'views/Base',
        'views/shared/eventsviewer/shared/EventFields',
        'views/shared/eventsviewer/shared/RawField',
        'splunk.util'
    ],
    function(module, _, BaseView, EventFields, RawField,  util){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tr',
            className: 'field-row',
            /**
             * @param {Object} options {
             *      model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         event: <models.services.search.job.ResultsV2.result[i]>,
             *         summary: <model.services.search.job.SummaryV2>
             *         state: <models.Base>,
             *         application: <models.Application>
             *     }
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         workflowActions: <collections.services.data.ui.WorkflowActions> 
             *     },
             *     selectableFields: true|false
             * } 
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                this.$el.addClass((!!(this.options.idx%2))?'even':'odd');
                this.children.eventFields = new EventFields({
                    model: { 
                        event: this.model.event,
                        report: this.model.report,
                        summary: this.model.summary,
                        result: this.model.result,
                        state: this.model.state,
                        application: this.model.application,
                        searchJob: this.model.searchJob
                    },
                    collection: {
                        workflowActions: this.collection.workflowActions,
                        selectedFields: this.collection.selectedFields
                    },
                    selectableFields: this.options.selectableFields,
                    idx: this.options.idx
                });
                //event 
                this.children.raw = new RawField({
                    model: {
                        event: this.model.event,
                        state: this.model.state,
                        result: this.model.result,
                        report: this.model.report,
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    },
                    noSegmentation: true,
                    idx: this.options.idx
                });
                
                this.rowExpanded = 'rowExpanded' + this.options.idx;
                this.model.state.on('change:'+this.rowExpanded , this.visibility, this);
                
                this.model.result.on('tags-updated', function() { 
                    if(this.model.state.get(this.rowExpanded))  
                        this.render(); 
                }, this);
                
                this.model.state.on('unmodalize'+this.options.idx, this.collapseState, this);
                this.collection.selectedFields.on('reset add remove', function() {
                    if(!_.isNumber(this.model.state.get('modalize')) && this.model.state.get(this.rowExpanded)) {
                        this.$('.event').attr('colspan', this.getCalculatedColSpan());
                    }
                }, this);
            },
            visibility: function() {
                var $arrow =  this.$('td.expands > a > i').removeClass('icon-triangle-right-small icon-triangle-down-small');
                if (this.model.state.get(this.rowExpanded)) {
                    this.$el.css('display', '');
                    $arrow.addClass('icon-triangle-down-small');
                    this.children.raw.wake().$el.show();
                    this.children.eventFields.touch = true;
                    this.children.eventFields.wake({syncRender: true}).$el.show();
                } else {
                    this.$el.hide();
                    $arrow.addClass('icon-triangle-right-small');
                    this.children.raw.sleep().$el.hide();
                    this.children.eventFields.sleep().$el.hide();
                }
                this.reflow();
            },
            getCalculatedColSpan: function() {
                return this.collection.selectedFields.length + 1 +((util.normalizeBoolean(
                    this.model.report.entry.content.get("display.events.rowNumbers"))
                ) ? 1 : 0);
            
            },
            collapseState: function() {
                this.model.state.unset('modalize');
                this.model.state.unset(this.rowExpanded);
                this.model.state.unset('sleep');
            },
            render: function() {
                var root = this.el;
                //rows are read only (innerHTML) for ie
                this.$el.find('> td').each(function(key, element) {
                    root.removeChild(element);
                });
                this.$el.append(this.compiledTemplate({
                    cspan: this.getCalculatedColSpan(), 
                    raw: this.model.event.rawToText()
                }));
                this.$('.event').append(this.children.raw.render().el);
                this.$('.event').append(this.children.eventFields.render().el);
                this.visibility();
                return this;
            },
            reflow: function() {
               (this.model.state.get(this.rowExpanded)) ?
                    this.model.state.set('modalize', this.options.idx):
                    this.model.state.unset('modalize');
                    
                BaseView.prototype.reflow.apply(this, arguments);
            },
            template: '\
                <td class="event" colspan="<%- cspan %>"></td>\
            '
        });
    }
);  

define('views/shared/eventsviewer/table/body/Master',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'models/Base',
        'views/Base',
        'views/shared/eventsviewer/table/body/PrimaryRow',
        'views/shared/eventsviewer/table/body/SecondaryRow',
        'util/console'
    ],
    function($, _, Backbone, module, BaseModel, BaseView, PrimaryRow, SecondaryRow, console){
        return BaseView.extend({
            moduleId: module.id,
            tagName: 'tbody',
            type: 'table',
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions> 
             *     },
             *     selectableFields: true|false
             * } 
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.result.results.on('reset', this.debouncedRender, this);
                this.model.state.on('change:sleep', function() {
                    this.model.state.get('sleep') ? this.sleep({lite: true}) : this.wake({lite: true});
                }, this);
                this.collection.intersectedFields.on('reset', this.debouncedRender, this); 
            },
            sleep: function(options) {
                (options && options.lite) ? (this.awake = false) : BaseView.prototype.sleep.apply(this);
                return this;
            },
            wake: function(options) {
                if(options && options.lite){
                    this.awake = true;
                    if (this.touch) {
                        this.render();
                    }
                } else {
                    BaseView.prototype.wake.apply(this);
                }
                return this;
            },
            isSelected: function() {
                return (this.model.report.entry.content.get('display.events.type') === this.type);
            },
            cleanup: function() {
                 this.$el.empty();
                 _.chain(this.children).values().invoke('debouncedRemove', {detach: true}).values();
                 this.children = {};
            },
            render: function() {
                this.trigger('rows:pre-remove');
                this.cleanup();
                var fragment = document.createDocumentFragment(),
                    isRealTimeSearch = this.model.searchJob.entry.content.get('isRealTimeSearch'),
                    results = isRealTimeSearch ? this.model.result.results.reverse({mutate: false}) : this.model.result.results.models;

                console.debug('Events Table: rendering', results.length, 'events', isRealTimeSearch ? 'in real-time mode' : 'in historical mode');
                _.each(results, function(event, idx) {
                    var lineNum;

                    if (this.model.searchJob.entry.content.get('isRealTimeSearch')) {
                        lineNum = this.model.result.endOffset() - idx;
                    } else {
                        lineNum = this.model.result.get('init_offset') + idx + 1;
                    }

                    this.children['masterRow_' + idx] = new PrimaryRow({ 
                        model: { 
                            event : event, 
                            report: this.model.report,
                            application: this.model.application,
                            searchJob: this.model.searchJob,
                            result: this.model.result,
                            state: this.model.state
                        }, 
                        collection: {
                            eventRenderers: this.collection.eventRenderers,
                            selectedFields: this.collection.intersectedFields
                        },
                        lineNum: lineNum,
                        idx: idx,
                        allowRowExpand: this.options.allowRowExpand
                    });
                    fragment.appendChild(this.children['masterRow_' + idx].render().el);
                    
                    this.children['fieldRow_' + idx] = new SecondaryRow({
                        model: { 
                            event : event,
                            report: this.model.report,
                            result: this.model.result,
                            summary: this.model.summary,
                            state: this.model.state,
                            application: this.model.application,
                            searchJob: this.model.searchJob
                        }, 
                        collection: {
                            workflowActions: this.collection.workflowActions,
                            selectedFields: this.collection.selectedFields
                        },
                        idx: idx,
                        selectableFields: this.options.selectableFields
                    });
                    fragment.appendChild(this.children['fieldRow_' + idx].render().el);
                },this);
                this.el.appendChild(fragment);
                
                //bulk purge of remove mutex
                _(this.model.state.toJSON()).each(function(value, key) {
                    if(key.indexOf('pendingRemove') === 0) {
                        this.model.state.unset(key);
                    }
                },this);
                
                this.trigger('rows:added');
                this.reflow();
                return this;
            },
            reflow: function() {
                this.model.state.trigger('init-draggable');
            }
        });
    }
);

define('views/shared/eventsviewer/table/Master',
    [
        'module',
        'underscore',
        'splunk.i18n',
        'splunk.util',
        'util/time_utils',
        'jquery.ui.draggable',
        'models/Base',
        'views/Base',
        'views/shared/delegates/Modalize',
        'views/shared/delegates/TableDock',
        'views/shared/eventsviewer/table/TableHead',
        'views/shared/eventsviewer/table/body/Master'
    ],
    function(module, _, i18n, util, time_utils, undefined, BaseModel, BaseView, Modalize, TableDock, TableHeadView, TableBodyView){
        return BaseView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.job.ResultsV2>,
             *         summary: <model.services.search.job.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>,
             *         state: <models.BaseV2> (optional)
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions> 
             *     },
             *     selectableFields: true|false,
             *     headerMode: dock|none (eventually this will have static mode),
             *     allowRowExpand: true|false
             */
            className: 'scrolling-table-wrapper',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                
                this.drag = {};
                
                this.collection.intersectedFields = this.collection.selectedFields.deepClone();                

                this.model.state = this.model.state || new BaseModel();
                this.children.modalize = new Modalize({el: this.el, tbody: '> table > tbody'});

                this.children.head = new TableHeadView({
                    model: this.model.report,
                    collection: { 
                        intersectedFields: this.collection.intersectedFields,
                        selectedFields: this.collection.selectedFields
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand,
                    isRealTime: this.model.searchJob.entry.content.get('isRealTimeSearch')
                });

                this.children.body = new TableBodyView({
                    model: {
                        result: this.model.result,
                        state: this.model.state,
                        summary: this.model.summary,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application
                    },
                    collection: { 
                        workflowActions: this.collection.workflowActions,
                        intersectedFields: this.collection.intersectedFields,
                        eventRenderers: this.collection.eventRenderers,
                        selectedFields: this.collection.selectedFields
                    },
                    selectableFields: this.options.selectableFields,
                    allowRowExpand: this.options.allowRowExpand
                });
                
                this.model.state.on('init-draggable', this.initDraggable, this);
                
                if (this.options.headerMode==='dock') {
                    this.children.tableDock = new TableDock({ el: this.el, offset: 36, defaultLayout: 'fixed'});
                }
                
                var modalize = _.debounce(function(idx, optArg) { this.modalize(idx, optArg); }.bind(this), 0);
                
                this.model.state.on('change:modalize', function(model) {
                    if(this.children.tableDock) 
                        _.isNumber(model.get('modalize')) ? this.children.tableDock.disable() : this.children.tableDock.enable();
                    modalize(this.model.state.get('modalize'), 'table');
                },this);
                
                this.children.modalize.on('unmodalize', function(idx) {
                    this.model.state.trigger('unmodalize'+idx);
                    this.children.tableDock.enable();
                    this.updateIntersectedFields();
                },this);

                this.collection.selectedFields.on('reset add remove', function(model, collection, index) {
                    if(_.isNumber(this.model.state.get('modalize'))) {
                        return;
                    }
                    if(model.get('name') === this.model.report.entry.content.get('display.events.table.sortColumn')) {
                        this.model.report.entry.content.set({
                            'display.events.table.sortColumn': '',
                            'display.events.table.sortDirection': ''
                        }); 
                    }
                    this.updateIntersectedFields();
                    modalize(this.model.state.get('modalize'), 'table');
                }, this);
                
                this.model.result.results.on('reset', function() {
                    if(!_.isNumber(this.model.state.get('modalize'))) {
                        this.updateIntersectedFields();
                    }
                }, this);

                this.collection.intersectedFields.on('reset', this.updateDock,this); 

                this.model.report.entry.content.on('change:display.events.rowNumbers', function() { 
                    this.$('table:not(.table-embed)').toggleClass('hide-line-num');
                }, this);
                
                this.model.report.entry.content.on('change:display.events.table.wrap', this.updateDock, this);
                
                this.model.report.entry.content.on('change:display.page.search.showFields change:display.prefs.events.offset', this.updateDock, this);
                
                if (this.options.selectableFields && this.children.tableDock) {
                    this.children.tableDock.on('updated', this.initDraggable, this);
                }
                
                this.children.body.on('rows:pre-remove', function() { this.$el.css('minHeight', this.$el.height()); },this);
                this.children.body.on('rows:added', function() { this.$el.css('minHeight', ''); },this);

            },
            updateIntersectedFields: function() {
                var fields = [], models = [];
                if(!!this.model.result.results.length){
                    _.each(_(this.collection.selectedFields.pluck('name')).intersection(this.model.result.fields.pluck('name')), function(value) {
                        models.push({name: value});
                    });
                    this.collection.intersectedFields.reset(models); 
                }
            },
            remove: function() {
                BaseView.prototype.remove.apply(this, arguments);
                $(window).off('.'+this.cid);
            },
            reflow: function() {
                BaseView.prototype.reflow.apply(this, arguments);
                if(this.isAttachedToDocument() && this.children.head.$el.is(':visible')) {
                    this.updateDock();
                }

            },
            style: function() {
                var maxWidth=this.$el.width();
                return "#"+this.cid+"-table .table-expanded{max-width:" + (maxWidth ? maxWidth - 80 : 500) + "px}";
            
            },
            modalize: function(idx, optArg) {
                this.children.modalize.show(idx, optArg);
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                     hidelinenums: !util.normalizeBoolean(this.model.report.entry.content.get("display.events.rowNumbers")),
                     cid: this.cid
                }));

                this.$('> table.events-results').append(this.children.head.render().el).append(this.children.body.render().el);
                return this;
            },
            initDraggable: function() {
                if (this.options.selectableFields) {
                    this.drag.$theads = this.$el.find('.reorderable');
                    //TO DO!!!!!!!!
                    //1) Needs to add draggables to the dockable header;
                    //2) Needs to get called after table header, body and header dock are fully rendered;
                    this.drag.$theads.draggable({
                        helper: this.dragHelper.bind(this),
                        start: this.startDrag.bind(this),
                        stop: this.stopDrag.bind(this),
                        drag: this.dragged.bind(this), 
                        containment: this.el,
                        distance: 5,
                        scroll: true
                    });
                }
            },
            updateDock: function() {
                if (this.children.tableDock) {
                    this.children.tableDock.update();
                }
            },
            dragHelper: function(e, ui) {
                this.drag.$th = $(e.currentTarget).addClass('moving');
                this.drag.thOffsetTop = this.drag.$th.offset().top;
                this.drag.containerLeft = this.$el.position().left;
                this.drag.$insertionCursor = this.$('.table-insertion-cursor');
                    
                this.drag.$insertionCursor.show();
                this.drag.$helper = $("<div class='reorderable-helper'><span class='reorderable-label'>" + this.drag.$th.text() + "</span></div>").appendTo(this.$el);
                this.drag.$helper.width(this.drag.$th.width());
                this.drag.$helper.css('marginRight', -this.drag.$th.width() + 'px');
                this.findInsertionPoints();
                return this.drag.$helper[0];
            },
            findInsertionPoints: function() {
                this.drag.insertionPoints = [];
                var $headers = this.$('> table > thead > tr > th.reorderable');
                var originalEl = $headers.filter('[data-name=' + this.drag.$th.data('name') + ']')[0]; //this compensates for the possibility of dragging the docked clone
                var originalIndex = this.drag.originalIndex = $headers.index(originalEl);
                
                $headers.each(function(index, el) {
                    var $el = $(el),
                        left = $el.position().left + this.$el.scrollLeft(); 
                        
                    if (index < originalIndex ) { 
                        this.drag.insertionPoints.push({left: left, index: index});
                    } else if (index == originalIndex ) { 
                        this.drag.insertionPoints.push({left: left, index: index});
                        this.drag.insertionPoints.push({left:left + $el.outerWidth(), index: index});
                    } else {
                        this.drag.insertionPoints.push({left:left + $el.outerWidth(), index: index});
                    }
                }.bind(this));
            },
            findClosestInsertion: function(e, ui) {
                if(ui.helper.offset().top - this.drag.thOffsetTop > 100) {
                    return -1;
                } else {
                    var closest = -1,
                        closestDistance = 10000000,
                        cursorLeft = (e.pageX - this.drag.containerLeft) + this.$el.scrollLeft();
                        
                        $.each(this.drag.insertionPoints, function name(index, point) {
                            var distance = Math.abs(point.left - cursorLeft);
                            if (distance < closestDistance) {
                                closest = point;
                                closestDistance = distance;
                            }   
                        });
                   return closest;
                }
            },
            startDrag: function(e, ui){
                    //TO DO!!!!!!!!
                    //need to stop rendering;
            }, 
            stopDrag: function(e, ui){
                var closest = this.findClosestInsertion(e, ui),
                    movingModel = this.collection.selectedFields.findWhere({'name': this.drag.$th.data().name});
                if (closest == -1) {
                    this.collection.selectedFields.remove(movingModel);
                } else if (closest.index !== this.drag.originalIndex) {
                    this.collection.selectedFields.remove(movingModel, {silent: true});
                    this.collection.selectedFields.add(movingModel, {at: closest.index});
                }
                this.drag.$th.removeClass('moving');
                this.drag.$insertionCursor.hide();
            },
            dragged: function(e, ui) {
                var closest = this.findClosestInsertion(e, ui);
                if (closest === -1) { 
                    this.drag.$insertionCursor.hide();
                    ui.helper.addClass("reorderable-remove");
                } else {
                    this.drag.$insertionCursor.show().css('left', closest.left);
                    ui.helper.removeClass("reorderable-remove");
                }
            },
            template: '\
                <table class="table table-chrome table-striped <% if(hidelinenums){ %> hide-line-num <% } %> table-row-expanding events-results events-results-table" id="<%= cid %>-table"></table>\
                <div class="table-insertion-cursor"></div>\
            '
        });
    }
);

define('views/shared/eventsviewer/Master',
    [
        'jquery',
        'underscore',
        'module',
        'models/Base',
        'models/services/search/jobs/Result',
        'views/Base',
        'views/shared/eventsviewer/raw/Master',
        'views/shared/eventsviewer/list/Master',
        'views/shared/eventsviewer/table/Master'
    ],
    function($, _, module, BaseModel, ResultModel, BaseView, EventsRawView, EventsListView, EventsTableView){
        return BaseView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         result: <models.services.search.jobs.ResultsV2>,
             *         summary: <model.services.search.jobs.SummaryV2>,
             *         searchJob: <models.Job>,
             *         report: <models.services.SavedSearch>,
             *         application: <models.Application>,
             *         state: <models.BaseV2> (optional)
             *     },
             *     collection: {
             *         selectedFields: <collections.SelectedFields>
             *         eventRenderers: <collections.services.configs.EventRenderers>,
             *         workflowActions: <collections.services.data.ui.WorkflowActions>,
             *     },
             *     selectableFields: true|false,
             *     headerMode: dock|none (eventually this will have static mode),
             *     allowRowExpand: true|false
             * }
             */
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                var defaults = {
                        selectableFields: true,
                        headerMode: 'dock',
                        allowRowExpand: true,
                        scrollToTopOnPagination: false
                };
                this.options = $.extend(true, defaults, this.options);
                
                this.rendered = {
                    list: false,
                    table: false,
                    raw: false
                };

                //CLONE RESULTS 
                this.model._result = new ResultModel();
                
                this.model._result.setFromSplunkD(this.model.result.responseText ? JSON.parse(this.model.result.responseText) : {});
                this.model.result.results.on('reset', function() {
                    if(!this.model._result.stopReset) {
                        this.model._result.setFromSplunkD(JSON.parse(this.model.result.responseText), {clone: true});
                    }
                },this);
                
                this.model.state = this.model.state || new BaseModel();
                this.model.listState =  new BaseModel();
                this.model.tableState =  new BaseModel();
                this.model.rawState =  new BaseModel();
                this.model.resultWorking = new ResultModel();
                
                this.model._result.results.on('reset', this.wake, this); 
                
                this.children.list = new EventsListView({
                    model: { 
                        result: this.model._result,
                        summary: this.model.summary,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application,
                        state: this.model.listState
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        eventRenderers: this.collection.eventRenderers,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: this.options.selectableFields,
                    headerMode: this.options.headerMode,
                    allowRowExpand: this.options.allowRowExpand
                });
                
                this.children.raw = new EventsRawView({
                    model: { 
                        result: this.model._result,
                        summary: this.model.summary,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application,
                        state: this.model.rawState
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        eventRenderers: this.collection.eventRenderers,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: false,
                    allowRowExpand: this.options.allowRowExpand
                });
                 
                this.children.table = new EventsTableView({
                    model: { 
                        result: this.model._result,
                        summary: this.model.summary,
                        searchJob: this.model.searchJob,
                        report: this.model.report,
                        application: this.model.application,
                        state: this.model.tableState
                    },
                    collection: {
                        selectedFields: this.collection.selectedFields,
                        eventRenderers: this.collection.eventRenderers,
                        workflowActions: this.collection.workflowActions
                    },
                    selectableFields: this.options.selectableFields,
                    headerMode: this.options.headerMode,
                    allowRowExpand: this.options.allowRowExpand
                });
                this.model.report.entry.content.on('change:display.events.type', function(m, val, options) {
                    if(m.previousAttributes()['display.events.type'] !== 'table' &&  m.get('display.events.type') !== 'table'){
                        this.wake();
                    }
                }, this);

                
                this.model.listState.on('change:modalize', function(model) {
                    this.model.state.set('modalize', model.get('modalize'));  
                }, this);
                this.model.rawState.on('change:modalize', function(model) {
                    this.model.state.set('modalize', model.get('modalize'));  
                }, this);
                this.model.tableState.on('change:modalize', function(model) {
                    this.model.state.set('modalize', model.get('modalize'));  
                }, this);
                this.model.state.on('unmodalize', function(idx) {
                    this.model.listState.trigger('unmodalize'+idx);
                    this.model.rawState.trigger('unmodalize'+idx);
                    this.model.tableState.trigger('unmodalize'+idx);
                },this);
                this.model.state.on('change:fieldpicker', function() { 
                    this.children.table && this.children.table.updateDock();
                },this);
                
                this.model.report.entry.content.on('change:display.page.search.showFields', function() {
                    this.children.table.updateDock();
                    this.children.list.deferUpdateDock();
                },this);
                    
                this.model._result.on('swap-single-event', function(options) {
                    this.fetchResultWithAllFields(options);
                }, this);

                this.model.report.entry.content.on('change:display.prefs.events.offset', function() {
                    if(this.options.scrollToTopOnPagination) {
                        var containerTop = this.$el.offset().top,
                            currentScrollPos = $(document).scrollTop(),
                            headerHeight = this.$el.children(':visible').find('thead:visible').height(),
                            eventControlsHeight = $('.events-controls-inner').height();
                        if(currentScrollPos > containerTop)
                            $(document).scrollTop(containerTop - (headerHeight + eventControlsHeight));
                    }
                },this);
            
            },
            events: {
                'click .header-table-docked.disabled': function(e) {
                    this.model.state.trigger('unmodalize', this.model.state.get('modalize'));
                    this.model.state.unset('modalize');
                    e.preventDefault();
                }
            },
            wake: function() {
                var type = this.model.report.entry.content.get('display.events.type');
                
                if(!this.rendered[type]) {
                    this._render(type);
                }

                if (_.isNumber(this.model.state.get('modalize'))) {
                    return this;
                }
                switch (type) {
                    case 'raw':
                        this.children.list.sleep().$el.hide();
                        this.children.raw.wake().$el.show();
                        this.children.table.sleep().$el.hide(); 
                        break;
                    case 'list':
                        this.children.list.wake().$el.show();
                        this.children.raw.sleep().$el.hide();
                        this.children.table.sleep().$el.hide();
                        break;
                    case 'table':
                        this.children.list.sleep().$el.hide();
                        this.children.raw.sleep().$el.hide();
                        this.children.table.wake().$el.show();
                        break;
                    default: 
                        this.children.list.sleep().$el.hide();
                        this.children.raw.sleep().$el.hide();
                        this.children.table.sleep().$el.hide();
                        break;
                }
                return this;
            },
            fetchResultWithAllFields: function(options) {
                var offset,
                    search,
                    dispatchState = this.model.searchJob.entry.content.get('dispatchState'),
                    isRealtime = this.model.searchJob.isRealtime(),
                    eventModel = this.model._result.results.at((isRealtime) ? options.rtindex : options.index);
                
                if(isRealtime) {
                    search = ['search _serial=', eventModel.get('_serial')[0], ' AND ', 'splunk_server=', eventModel.get('splunk_server')[0], ' | head 1'].join('');
                } else {
                    offset = this.model._result.offset(options.index);
                    search = this.model.report.getSortingSearch();
                }

                this.model.resultWorking.id = this.model.searchJob.entry.links.get('events');
                this.model.resultWorking.fetch({
                    data: $.extend(true, {}, {
                        offset: offset,
                        count: 1,
                        earliest_time: this.model.report.entry.content.get('display.events.timelineEarliestTime'),
                        latest_time: this.model.report.entry.content.get('display.events.timelineLatestTime'),
                        segmentation:  this.model.report.entry.content.get('display.events.list.drilldown'),
                        max_lines: (options.showAllLines) ? 0: this.model.report.getNearestMaxlines(),
                        truncation_mode: 'abstract',
                        search: search
                    }),
                    success: function(model, response) {
                        var matchedModel = model.results.at(0);
                        if (matchedModel) {
                            eventModel.replace(matchedModel.toJSON(), {swap: true});
                        } else {
                            eventModel.trigger('failed-swap');
                        }
                        this.manageState(dispatchState);
                    }.bind(this),
                    error: function(model, response) {
                        eventModel.trigger('failed-swap');
                        this.manageState(dispatchState);
                    }.bind(this)
                });    
            },
            manageState: function(dispatchState) {
                this.model._result.stopReset = false;
                if(this.model.searchJob.entry.content.get('dispatchState') !== dispatchState) {
                    this.model.result.trigger('forcefetch'); 
                }
            },
            _render: function(type) {
                this.$el.append(this.children[type].render().el);
                this.rendered[type] = true;
            },
            render: function() {
                this._render(this.model.report.entry.content.get('display.events.type'));
                this.wake();
                return this;
            }
        });
    }
);

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/events-viewer.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/eventsviewerview',['require','exports','module','jquery','underscore','backbone','splunk.util','collections/SelectedFields','collections/services/configs/EventRenderers','collections/services/data/ui/WorkflowActions','models/Job','models/services/search/jobs/Result','models/services/search/jobs/Summary','uri/route','util/console','views/shared/eventsviewer/Master','./basesplunkview','./messages','./mvc','./paginatorview','./utils','./sharedmodels','splunk.util','./tokenawaremodel','models/Report','css!../css/events-viewer'],function(require, exports, module) {

    var $ = require("jquery");
    var _ = require("underscore");
    var Backbone = require("backbone");
    var SplunkUtil = require("splunk.util");
    var SelectedFieldsCollection = require("collections/SelectedFields");
    var EventRenderersCollection = require("collections/services/configs/EventRenderers");
    var WorkflowActionsCollection = require("collections/services/data/ui/WorkflowActions");
    var SearchJobModel = require("models/Job");
    var ResultModel = require("models/services/search/jobs/Result");
    var SummaryModel = require("models/services/search/jobs/Summary");
    var Route = require("uri/route");
    var console = require("util/console");
    var EventsViewerMaster = require("views/shared/eventsviewer/Master");
    var BaseSplunkView = require("./basesplunkview");
    var Messages = require("./messages");
    var mvc = require("./mvc");
    var PaginatorView = require("./paginatorview");
    var Utils = require("./utils");
    var sharedModels = require('./sharedmodels');
    var util = require('splunk.util');
    var TokenAwareModel = require('./tokenawaremodel');
    var ReportModel = require('models/Report'); 

    require("css!../css/events-viewer");

    // This regex will take a space or comma separated list of fields, with quotes
    // for escaping strings with spaces in them, and match each individual
    // field.
    var fieldSplitterRegex = /(["'].*?["']|[^"',\s]+)(?=\s*|\s*,|\s*$)/g;

    // This regex will take a string that may or may not have leading quotes,
    // and strip them.
    var quoteStripperRegex = /^["']|["|']$/g;

    var EventsViewerView = BaseSplunkView.extend({

        className: "splunk-events-viewer",

        options: {
            "managerid": null,
            "data": "events",
            "showPager": true,
            "pagerPosition": "bottom",
            "drilldownRedirect": true
        },

        reportDefaults: {
            "display.events.fields": '["host", "source", "sourcetype"]',
            "display.events.type": "list",
            "display.prefs.events.count": 10,
            "display.events.rowNumbers": "1",
            "display.events.maxLines": 5,
            "display.events.histogram": "0",
            "display.events.raw.drilldown": "full",
            "display.events.list.wrap": "1",
            "display.events.list.drilldown": "full",
            "display.events.table.wrap": "1",
            "display.events.table.drilldown": "0",
            "display.events.table.sortDirection": "asc"
        },
        
        omitFromSettings: ["el", "id", "name", "manager", 
                           "reportModel", "displayRowNumbers", "segmentation", 
                           "softWrap"],

        normalizeOptions: function(settings, options) {
            if (options.hasOwnProperty("rowNumbers")) {
                settings.set("rowNumbers", SplunkUtil.normalizeBoolean(options.rowNumbers) ? "1" : "0");
            } else if (options.hasOwnProperty("displayRowNumbers")) {
                settings.set("rowNumbers", SplunkUtil.normalizeBoolean(options.displayRowNumbers) ? "1" : "0");
            }

            if (options.hasOwnProperty("raw.drilldown")) {
                settings.set("raw.drilldown", options["raw.drilldown"]);
            } else if (options.hasOwnProperty("segmentation")) {
                settings.set("raw.drilldown", options.segmentation);
            }

            if (options.hasOwnProperty("list.drilldown")) {
                settings.set("list.drilldown", options["list.drilldown"]);
            } else if (options.hasOwnProperty("segmentation")) {
                settings.set("list.drilldown", options.segmentation);
            }

            if (options.hasOwnProperty("table.drilldown")) {
                settings.set("table.drilldown", SplunkUtil.normalizeBoolean(options["table.drilldown"]) ? "1" : "0");
            } else if (options.hasOwnProperty("segmentation")) {
                settings.set("table.drilldown", (options.segmentation !== "none") ? "1" : "0");
            }

            if (options.hasOwnProperty("list.wrap")) {
                settings.set("list.wrap", SplunkUtil.normalizeBoolean(options["list.wrap"]) ? "1" : "0");
            } else if (options.hasOwnProperty("softWrap")) {
                settings.set("list.wrap", SplunkUtil.normalizeBoolean(options.softWrap) ? "1" : "0");
            }

            if (options.hasOwnProperty("table.wrap")) {
                settings.set("table.wrap", SplunkUtil.normalizeBoolean(options["table.wrap"]) ? "1" : "0");
            } else if (options.hasOwnProperty("softWrap")) {
                settings.set("table.wrap", SplunkUtil.normalizeBoolean(options.softWrap) ? "1" : "0");
            }

            if (!options.hasOwnProperty("count") && !settings.has("count")) {
                settings.set("count", this.reportDefaults['display.prefs.events.count']);
            }
        },

        initialize: function(options) {
            this.configure();
            this.model = this.options.reportModel || TokenAwareModel._createReportModel(this.reportDefaults);
            this.settings._sync = Utils.syncModels({
                source: this.settings,
                dest: this.model,
                prefix: "display.events.",
                include: ["fields", "type", "count", "rowNumbers", "maxLines", "raw.drilldown", "list.drilldown",
                    "list.wrap", "table.drilldown", "table.wrap", "table.sortDirection", "table.sortColumn"],
                exclude: ["drilldownRedirect", "managerid"],
                auto: true,
                alias: {
                    count: 'display.prefs.events.count'
                }
            });
            this.settings.on("change", this.onSettingsChange, this);
            this.model.on("change", this.onReportChange, this);

            this.normalizeOptions(this.settings, options);

            this.resultModel = new ResultModel();

            this.summaryModel = new SummaryModel();

            this.searchJobModel = new SearchJobModel();

            this.reportModel = new ReportModel();
            this.reportModel.entry = { content: this.model };
            this.reportModel.on("eventsviewer:drilldown", this.onReportDrilldown, this);

            this.applicationModel = sharedModels.get("app");

            this.selectedFieldsCollection = new SelectedFieldsCollection();

            this.workflowActionsCollection = new WorkflowActionsCollection();
            this.workflowActionsCollection.fetch({
                data: {
                    app: this.applicationModel.get("app"),
                    owner: this.applicationModel.get("owner"),
                    count: -1,
                    sort_key: "name"
                },
                success: _.bind(function() {
                    this._isWorkflowActionsCollectionReady = true;
                    this.render();
                }, this)
            });

            this.eventRenderersCollection = new EventRenderersCollection();
            this.eventRenderersCollection.fetch({
                success: _.bind(function() {
                    this._isEventRenderersCollectionReady = true;
                    this.render();
                }, this)
            });

            this._lastJobFetched = null;

            this.updateSelectedFields();
            this.bindToComponentSetting('managerid', this.onManagerChange, this);
            
            // If we don't have a manager by this point, then we're going to
            // kick the manager change machinery so that it does whatever is
            // necessary when no manager is present.
            if (!this.manager) {
                this.onManagerChange(mvc.Components, null);
            }
        },

        onManagerChange: function(ctxs, manager) {
            if (this.manager) {
                this.manager.off(null, null, this);
                this.manager = null;
            }
            if (this.eventData) {
                this.eventData.off();
                this.eventData.destroy();
                this.eventData = null;
            }
            if (this.summaryData) {
                this.summaryData.off();
                this.summaryData.destroy();
                this.summaryData = null;
            }

            this._searchStatus = null;
            this._eventCount = 0;
            this._isSummaryModelReady = false;
            this._isSearchJobModelReady = false;
            this._lastJobFetched = null;

            this.resultModel.setFromSplunkD({});
            this.summaryModel.setFromSplunkD({});

            if (!manager) {
                this._searchStatus = { state: "nomanager" };
                this.render();
                return;
            }
            
            // Clear any messages, since we have a new manager.
            this._searchStatus = { state: "start" };

            this.manager = manager;
            this.manager.on("search:start", this.onSearchStart, this);
            this.manager.on("search:progress", this.onSearchProgress, this);
            this.manager.on("search:done", this.onSearchDone, this);
            this.manager.on("search:cancelled", this.onSearchCancelled, this);
            this.manager.on("search:error", this.onSearchError, this);
            this.manager.on("search:fail", this.onSearchFailed, this);

            this.eventData = this.manager.data("events", {
                autofetch: false,
                output_mode: "json",
                truncation_mode: "abstract"
            });
            this.eventData.on("data", this.onEventData, this);
            this.eventData.on("error", this.onSearchError, this);

            this.summaryData = this.manager.data("summary", {
                autofetch: false,
                output_mode: "json",
                top_count: 10,
                output_time_format: "%d/%m/%y %l:%M:%S.%Q %p"
            });
            this.summaryData.on("data", this.onSummaryData, this);
            this.summaryData.on("error", this.onSearchError, this);

            // Handle existing job
            var content = this.manager.get("data");
            if (content && content.eventAvailableCount) {
                this.onSearchStart(content);
                this.onSearchProgress({ content: content });
                if (content.isDone) {
                    this.onSearchDone({ content: content });
                }
            } else {
                this.render();
            }
            manager.replayLastSearchEvent(this);
        },
        
        _fetchJob: function(job) {
            this._isRealTimeSearch = job.isRealTimeSearch;
            if (this._lastJobFetched !== job.sid) {
                this._lastJobFetched = job.sid;
                this.searchJobModel.set("id", job.sid);
                this.searchJobModel.fetch({
                    success: _.bind(function() {
                        if (!this._isSearchJobModelReady) {
                            this._isSearchJobModelReady = true;
                            this.render();
                        }
                    }, this)
                });
            }
        },

        onSearchStart: function(job) {
            this._searchStatus = { state: "running" };
            this._eventCount = 0;
            this._statusBuckets = undefined;
            this._lastJobFetched = null;
            this._isSummaryModelReady = false;
            this._isSearchJobModelReady = false;

            this.resultModel.setFromSplunkD({});
            this.summaryModel.setFromSplunkD({});
            this._fetchJob(job);

            this.render();
        },

        onSearchProgress: function(properties) {
            this._searchStatus = { state: "running" };
            properties = properties || {};
            var job = properties.content || {};
            var eventCount = job.eventAvailableCount || 0;
            var statusBuckets = this._statusBuckets = job.statusBuckets || 0;
            var searchString = properties.name;
            
            this._fetchJob(job);
            
            // If we have a search string, then we set it on the report model,
            // otherwise things like the intentions parser don't work. We do it
            // silently however to ensure that nobody picks it up until they 
            // need it.
            if (searchString) {
                // Since this search comes from the API, we need to strip away
                // the leading search command safely.
                searchString = SplunkUtil.stripLeadingSearchCommand(searchString);
                this.reportModel.entry.content.set('search', searchString, {silent: true});
            }

            this._eventCount = eventCount;
            
            if (eventCount > 0) {
                this.updateEventData();
            }

            if (statusBuckets > 0) {
                this.updateSummaryData();
            }

            this.render();
        },

        onSearchDone: function(properties) {
            this._searchStatus = { state: "done" };

            properties = properties || {};
            var job = properties.content || {};
            var eventCount = job.eventAvailableCount || 0;
            this._fetchJob(job);
            
            this._eventCount = eventCount;

            this.updateEventData();
            this.updateSummaryData();
            this.render();
        },

        onSearchCancelled: function() {
            this._searchStatus = { state: "cancelled" };
            this.render();
        },

        onSearchError: function(message, err) {
            var msg = Messages.getSearchErrorMessage(err) || message;
            this._searchStatus = { state: "error", message: msg };
            this.render();
        },

        onSearchFailed: function(state) {
            var msg = Messages.getSearchFailureMessage(state);
            this._searchStatus = { state: "error", message:  msg };
            this.render();
        },

        onEventData: function(model, data) {
            this.resultModel.setFromSplunkD(data);
            this.render();
        },

        onSummaryData: function(model, data) {
            this.summaryModel.setFromSplunkD(data);
            if (!this._isSummaryModelReady) {
                this._isSummaryModelReady = true;
                this.render();
            }
        },

        onSettingsChange: function(model) {
            if (model.hasChanged('fields')) {
                this.updateSelectedFields();
            }
            if (model.hasChanged("showPager") ||
                model.hasChanged("pagerPosition") ||
                model.hasChanged("count") ||
                model.hasChanged("fields")) {
                this.render();
            }
            if (model.hasChanged("showPager") ||
                model.hasChanged("type") ||
                model.hasChanged("count") ||
                model.hasChanged("maxLines") ||
                model.hasChanged("raw.drilldown") ||
                model.hasChanged("list.drilldown")) {
                this.updateEventData();
            }
        },

        onReportChange: function(model) {
            if (model.hasChanged("display.events.table.sortColumn") ||
                model.hasChanged("display.events.table.sortDirection")) {
                this.updateEventData();
            }
        },

        onReportDrilldown: function() {
            var model = this.model;

            var search = model.get("search");
            var earliest = model.hasChanged("dispatch.earliest_time") ? model.get("dispatch.earliest_time") : null;
            var latest = model.hasChanged("dispatch.latest_time") ? model.get("dispatch.latest_time") : null;

            // Set up the handlers for default drilldown behavior and preventing
            // the default behavior
            var preventRedirect = false;
            var defaultDrilldown = _.once(_.bind(this.drilldown, this, search, earliest, latest));
            var preventDefault = function() {
                preventRedirect = true;
            };

            // Trigger the event
            this.trigger(
                "drilldown",
                { search: search, drilldown: defaultDrilldown, preventDefault: preventDefault }
            );

            // Now that the event is trigged, if there is a default action of
            // redirecting, we will execute it (depending on whether the user
            // executed preventDefault()).
            if (this.settings.get("drilldownRedirect") && !preventRedirect) {
                defaultDrilldown();
            }
        },

        onPageChange: function() {
            this.updateEventData();
        },

        drilldown: function(search, earliest, latest) {
            if (!search) {
                return;
            }

            var manager = this.manager;
            if (!manager) {
                return;
            }

            if (manager.job) {
                if (earliest == null) {
                    earliest = manager.job.properties().searchEarliestTime;
                }
                if (latest == null) {
                    latest = manager.job.properties().searchLatestTime;
                }
                if (!earliest && manager.job.properties().earliestTime){
                    earliest = util.getEpochTimeFromISO(manager.job.properties().earliestTime);
                }
                if (!latest && manager.job.properties().latestTime){
                    latest = util.getEpochTimeFromISO(manager.job.properties().latestTime);
                }
            }

            var params = { 
                q: search,
                earliest: earliest || '',
                latest: latest || ''
            };

            var pageInfo = Utils.getPageInfo();
            var url = Route.search(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
            Utils.redirect(url);
        },

        updateEventData: function() {
            if (this.eventData) {
                var pageSize = this.paginator ? parseInt(this.paginator.settings.get("pageSize"), 10) : 0;
                var page = this.paginator ? parseInt(this.paginator.settings.get("page"), 10) : 0;
                var type = this.settings.get("type");
                var offset = pageSize * page;
                var count = Math.max(parseInt(this.settings.get("count"), 10) || this.reportDefaults['display.prefs.events.count'], 1);
                if (this._isRealTimeSearch) {
                    // For real-time searches we want the tail of available events, therefore we set a negative offset
                    // based on the currently selected page
                    offset = 0 - count - offset;
                }
                var maxLines = parseInt(this.settings.get("maxLines"), 10);
                var rawDrilldown = this.settings.get("raw.drilldown");
                var listDrilldown =  this.settings.get("list.drilldown");
                var tableSortColumn = this.model.get("display.events.table.sortColumn");
                var tableSortDirection = this.model.get("display.events.table.sortDirection");
                var segmentation = null;
                var search = null;

                // determine segmentation

                if (type === "raw") {
                    segmentation = rawDrilldown;
                } else if (type === "list") {
                    segmentation = listDrilldown;
                }

                // Ensuring segmentation is one of "inner", "outer", or "full".
                // Although "none" is a valid value for segmentation,
                // and segmentation is an optional parameter for the events endpoint,
                // either case causes the Result model to throw errors.
                segmentation = segmentation ? segmentation.toLowerCase() : null;
                switch (segmentation) {
                    case "inner":
                    case "outer":
                    case "full":
                    case "none":
                        break;
                    default:
                        segmentation = "full";
                        break;
                }

                // determine post process search for table sorting

                if ((type === "table") && tableSortColumn) {
                    if (tableSortDirection === "desc") {
                        search = "| sort " + (offset + count) + " - " + tableSortColumn;
                    } else {
                        search = "| sort " + (offset + count) + " " + tableSortColumn;
                    }
                }

                //add in fields required for events viewer
                var fields = this.settings.get("fields");
                fields = _.union(fields,['_raw', '_time', '_audit', '_decoration', 'eventtype', 'linecount', '_fulllinecount']);
                if (this._isRealTimeSearch){
                    fields = _.union(fields, ['_serial', 'splunk_server']);
                }

                // fetch events
                this.eventData.set({
                    offset: offset,
                    count: count,
                    max_lines: maxLines,
                    segmentation: segmentation,
                    search: search,
                    fields: fields
                });

                this.eventData.fetch();
            }
        },

        updateSummaryData: function() {
            if (this.summaryData) {
                this.summaryData.fetch();
            }
        },

        updateSelectedFields: function() {
            var fields = this.settings.get("fields");

            // update selected fields

            if (fields) {
                if (_.isString(fields)) {
                    fields = $.trim(fields);
                    if (fields[0] === '[' && fields.slice(-1) === ']') {
                        // treat fields as JSON if the start and end with a square bracket
                        try {
                            fields = JSON.parse(fields);
                        } catch (e) {
                            // ignore
                        }
                    } else {
                        // Since this is a string, we're going to treat it as a
                        // space separated list of strings, with quoting. This is
                        // similar to what Splunk's 'fields' command takes.
                        fields = _.map(fields.match(fieldSplitterRegex), function(field) {
                            return field.replace(quoteStripperRegex, "");
                        });
                        // Update setting with JSON formatted string
                        this.settings.set('fields', JSON.stringify(fields));
                    }
                } else {
                    // Update setting with JSON formatted string
                    this.settings.set('fields', JSON.stringify(fields));
                }
                // convert list of fields to list of name:field pairs for consumption by backbone collection
                fields = _.map(fields, function(field) {
                    return { name: field };
                });

                // handle fields * case
                if ((fields.length === 0) || (fields[0].name === "*")) {
                    fields = _.filter(this.resultModel.fields.toJSON(), function(field) {
                        return (field.name.charAt(0) !== "_");
                    });
                }
            }
            this.selectedFieldsCollection.reset(fields);
        },

        render: function() {
            var searchStatus = this._searchStatus || null;
            var eventCount = this._eventCount || 0;
            var hasStatusBuckets = this._statusBuckets === undefined || this._statusBuckets > 0;
            var isSummaryModelReady = (this._isSummaryModelReady === true);
            var isSearchJobModelReady = (this._isSearchJobModelReady === true);
            var isWorkflowActionsCollectionReady = (this._isWorkflowActionsCollectionReady === true);
            var isEventRenderersCollectionReady = (this._isEventRenderersCollectionReady === true);
            var areModelsReady = (isSummaryModelReady && isSearchJobModelReady && isWorkflowActionsCollectionReady && isEventRenderersCollectionReady);
            var showPager = SplunkUtil.normalizeBoolean(this.settings.get("showPager"));
            var pagerPosition = this.settings.get("pagerPosition");
            var count = Math.max(parseInt(this.settings.get("count"), 10), 1);

            // render message

            var message = null;
            if (searchStatus) {
                switch (searchStatus.state) {
                    case "nomanager":
                        message = "no-search";
                        break;
                    case "start":
                        message = "empty";
                        break;
                    case "running":
                        if (hasStatusBuckets && (eventCount === 0) || !areModelsReady) {
                            message = "waiting";
                        }
                        if (!hasStatusBuckets) {
                            message = "no-events";
                        }
                        break;
                    case "cancelled":
                        message = "cancelled";
                        break;
                    case "done":
                        if (eventCount === 0) {
                            message = "no-events";
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

            if (message) {
                if (!this.messageElement) {
                    this.messageElement = $('<div class="msg"></div>');
                }

                Messages.render(message, this.messageElement);

                this.$el.append(this.messageElement);
            } else {
                if (this.messageElement) {
                    this.messageElement.remove();
                    this.messageElement = null;
                }
            }

            // render eventsViewer
            if (areModelsReady && searchStatus && !message) {
                if (!this.eventsViewer) {
                    this.eventsViewer = new EventsViewerMaster({
                        model: {
                            result: this.resultModel,  // <models.services.search.jobs.Results>
                            summary: this.summaryModel,  // <models.services.search.jobs.Summary>
                            searchJob: this.searchJobModel,  // <models.Job>
                            report: this.reportModel,  // <models.services.SavedSearch>
                            application: this.applicationModel//,  // <models.Application>
                        },
                        collection: {
                            selectedFields: this.selectedFieldsCollection,  // <collections.SelectedFields>
                            workflowActions: this.workflowActionsCollection,  // <collections.services.data.ui.WorkflowActions>
                            eventRenderers: this.eventRenderersCollection  // <collections/services/configs/EventRenderers>
                        },
                        selectableFields: false,  // true|false
                        headerMode: "none",  // dock|none (eventually this will have static mode)
                        allowRowExpand: true  // true|false
                    });
                    this.eventsViewer.render();
                }

                this.$el.append(this.eventsViewer.el);
            } else {
                if (this.eventsViewer) {
                    this.eventsViewer.remove();
                    this.eventsViewer = null;
                }
            }

            // render paginator

            if (areModelsReady && searchStatus && !message && showPager) {
                if (!this.paginator) {
                    this.paginator = new PaginatorView({
                        id: _.uniqueId(this.id + "-paginator")
                    });
                    this.paginator.settings.on("change:page", this.onPageChange, this);
                }

                this.paginator.settings.set({
                    pageSize: count,
                    itemCount: eventCount
                });

                if (pagerPosition === "top") {
                    this.$el.prepend(this.paginator.el);
                } else {
                    this.$el.append(this.paginator.el);
                }
            } else {
                if (this.paginator) {
                    this.paginator.settings.off("change:page", this.onPageChange, this);
                    this.paginator.remove();
                    this.paginator = null;
                }
            }

            this.trigger('rendered', this);

            return this;
        },

        remove: function() {
            if (this.eventsViewer) {
                this.eventsViewer.remove();
                this.eventsViewer = null;
            }

            if (this.paginator) {
                this.paginator.settings.off("change:page", this.onPageChange, this);
                this.paginator.remove();
                this.paginator = null;
            }

            if (this.eventData) {
                this.eventData.off();
                this.eventData.destroy();
                this.eventData = null;
            }

            if (this.summaryData) {
                this.summaryData.off();
                this.summaryData.destroy();
                this.summaryData = null;
            }

            if (this.settings) {
                this.settings.off();
                if (this.settings._sync) {
                    this.settings._sync.destroy();
                }
            }

            if (this.model) {
                this.model.off("change", this.onReportChange, this);
            }

            BaseSplunkView.prototype.remove.call(this);
        }

    });

    return EventsViewerView;

});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.clearfix{*zoom:1;}.clearfix:before,.clearfix:after{display:table;content:\"\";line-height:0;}\n.clearfix:after{clear:both;}\n.hide-text{font:0/0 a;color:transparent;text-shadow:none;background-color:transparent;border:0;}\n.input-block-level{display:block;width:100%;min-height:26px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;}\n.ie7-force-layout{*min-width:0;}\n.timeline-results-wrapper{clear:both;min-height:400px;*zoom:1;}.timeline-results-wrapper:before,.timeline-results-wrapper:after{display:table;content:\"\";line-height:0;}\n.timeline-results-wrapper:after{clear:both;}\n.event .raw-event,.event .json-event{font-family:\"Droid Sans Mono\",\"Consolas\",\"Monaco\",\"Courier New\",Courier,monospace;font-size:12px;color:#333333;padding:0;border:none;background-color:transparent;margin:auto;padding:auto;}.event .raw-event em,.event .json-event em{font-style:normal ;}\n.event .raw-event .a,.event .json-event .a,.event .raw-event .h,.event .json-event .h,.event .raw-event .fields .v:hover,.event .json-event .fields .v:hover,.event .raw-event .fields .tg:hover,.event .json-event .fields .tg:hover,.event .raw-event .time:hover,.event .json-event .time:hover{background-color:#fde9a8;border-top:4px solid #fde9a8;border-bottom:4px solid #fde9a8;color:#32496a;}\n.event .raw-event .key-name,.event .json-event .key-name{color:#d85d3c;font-weight:bold;}\n.event .raw-event .string,.event .json-event .string{color:#1abb97;}\n.event .raw-event .number,.event .json-event .number{color:#956d95;}\n.event .raw-event .boolean,.event .json-event .boolean{color:#f7902b;}\n.event .raw-event .null,.event .json-event .null{color:#f7902b;}\n.shared-eventsviewer{border-left:1px solid #e5e5e5;}.shared-eventsviewer th.col-0,.shared-eventsviewer th.line-num,.shared-eventsviewer th.col-time{width:1px;}\n.shared-eventsviewer th.col-time.ie7,.shared-eventsviewer th.col-0.ie7{width:150px;}\n.shared-eventsviewer th.line-num.ie7{width:50px;}\n.shared-eventsviewer th.col-0:last-child,.shared-eventsviewer th.col-time:last-child{width:auto;}\n.shared-eventsviewer td._time>span>span{white-space:nowrap;}\n.shared-eventsviewer .shared-eventsviewer-table-body-primaryrow>td.no-wrap{white-space:pre;}\n.shared-eventsviewer td.expands.et_blue{background-color:#5379af;border-right:1px solid #5379af !important;}.shared-eventsviewer td.expands.et_blue:hover{background-color:#6b8cba !important;}\n.shared-eventsviewer td.expands.et_green{background-color:#9ac23c;border-right:1px solid #9ac23c !important;}.shared-eventsviewer td.expands.et_green:hover{background-color:#a8cb57 !important;}\n.shared-eventsviewer td.expands.et_magenta{background-color:#dd86af;border-right:1px solid #dd86af !important;}.shared-eventsviewer td.expands.et_magenta:hover{background-color:#e5a2c1 !important;}\n.shared-eventsviewer td.expands.et_orange{background-color:#f7902b;border-right:1px solid #f7902b !important;}.shared-eventsviewer td.expands.et_orange:hover{background-color:#f8a24d !important;}\n.shared-eventsviewer td.expands.et_purple{background-color:#956d95;border-right:1px solid #956d95 !important;}.shared-eventsviewer td.expands.et_purple:hover{background-color:#a482a4 !important;}\n.shared-eventsviewer td.expands.et_red{background-color:#d85d3c;border-right:1px solid #d85d3c !important;}.shared-eventsviewer td.expands.et_red:hover{background-color:#de765a !important;}\n.shared-eventsviewer td.expands.et_sky{background-color:#6ab7c7;border-right:1px solid #6ab7c7 !important;}.shared-eventsviewer td.expands.et_sky:hover{background-color:#84c4d1 !important;}\n.shared-eventsviewer td.expands.et_teal{background-color:#1abb97;border-right:1px solid #1abb97 !important;}.shared-eventsviewer td.expands.et_teal:hover{background-color:#1edab0 !important;}\n.shared-eventsviewer td.expands.et_yellow{background-color:#fac51c;border-right:1px solid #fac51c !important;}.shared-eventsviewer td.expands.et_yellow:hover{background-color:#fbce3f !important;}\n.shared-eventsviewer .event-fields-loading{padding:20px 0;color:#999999;}\n.shared-eventsviewer ul.condensed-selected-fields{margin:5px 0 0 0;max-width:100%;}.shared-eventsviewer ul.condensed-selected-fields li{color:#999999;margin-right:10px;float:left;list-style:none;display:inline;max-width:100%;}.shared-eventsviewer ul.condensed-selected-fields li>:last-child{padding-right:10px;border-right:1px dashed #cccccc;}\n.shared-eventsviewer ul.condensed-selected-fields li:last-child{margin-right:0;}.shared-eventsviewer ul.condensed-selected-fields li:last-child>:last-child{padding-right:0;border-right:none;}\n.shared-eventsviewer ul.condensed-selected-fields li .field-value{display:inline-block;}\n.shared-eventsviewer ul.condensed-selected-fields li .f-v{display:inline-block;max-width:500px;word-wrap:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top;}\n.shared-eventsviewer ul.condensed-selected-fields li .f-v,.shared-eventsviewer ul.condensed-selected-fields li .more-fields{color:#333333;cursor:pointer;}.shared-eventsviewer ul.condensed-selected-fields li .f-v:hover,.shared-eventsviewer ul.condensed-selected-fields li .more-fields:hover{color:#32496a;}\n.shared-eventsviewer ul.condensed-selected-fields li>.tag{color:inherit;}.shared-eventsviewer ul.condensed-selected-fields li>.tag:hover{color:#32496a;}\n.shared-eventsviewer .formated-time:hover{color:#32496a;text-decoration:underline;cursor:pointer;}\n.shared-eventsviewer .table-embed{margin-top:10px;margin-bottom:0;background-color:transparent;width:auto;clear:left;min-width:0;}.shared-eventsviewer .table-embed th:first-child{padding-left:0;}\n.shared-eventsviewer .table-embed td>a._time-expand{display:inline;margin-left:2px;}\n.shared-eventsviewer .table-embed td>a._time-expand:hover{text-decoration:none;}\n.shared-eventsviewer .table-embed td{border-bottom:none ;line-height:20px;}\n.shared-eventsviewer .table-embed tbody:first-child tr:first-child td{border-top:none ;}\n.shared-eventsviewer .table-embed a{text-decoration:none;display:block;min-width:16px;padding:0 3px;}.shared-eventsviewer .table-embed a:hover{background:#ebebeb;color:#32496a !important;}\n.shared-eventsviewer .table-embed a._time-expand:hover,.shared-eventsviewer .table-embed a.more-fields:hover{text-decoration:underline;background:none;}\n.shared-eventsviewer .table-embed .field-actions{font-size:14px;height:20px;overflow:hidden;text-align:center;padding-right:0;}\n.shared-eventsviewer .table-embed .btn-group{font-size:inherit;}\n.shared-eventsviewer .table-embed .field-type{padding-left:0;}\n.shared-eventsviewer .table-embed .field-key{padding:0 8px 0 0;}\n.shared-eventsviewer .table-embed td.field-value{word-break:break-all;padding-left:0;}\n.shared-eventsviewer .table-embed .field-value a{display:inline-block;}\n.shared-eventsviewer tr.row-more-fields+tr>td{border-top:none;border-bottom:none;}\n.shared-eventsviewer .col-more-fields{padding-left:10px;vertical-align:middle;}\n.shared-eventsviewer .col-visibility{text-align:left;font-size:20px;padding:0 !important;width:auto;}.shared-eventsviewer .col-visibility .checkbox{padding:1px 5px 1px 0;margin:0;}.shared-eventsviewer .col-visibility .checkbox>a,.shared-eventsviewer .col-visibility .checkbox>a:hover{padding:0;color:#333333 !important;}\n.shared-eventsviewer th.col-visibility{padding-bottom:4px !important;}\n.shared-eventsviewer th.col-field-name,.shared-eventsviewer th.col-field-value{padding-left:4px;}\n.shared-eventsviewer a:hover .icon-hidden{color:inherit;}\n.shared-eventsviewer .table-expanded a{color:#5379af !important;}\n.shared-eventsviewer .table-expanded a:hover{color:#32496a !important;}\n.shared-eventsviewer .table{margin-bottom:0;}\n.shared-eventsviewer .hide-line-num th.line-num,.shared-eventsviewer .hide-line-num td.line-num{display:none;}\n.shared-eventsviewer .normal.raw-event{background-color:inherit;border:none;white-space:pre;}\n.shared-eventsviewer .normal.raw-event.wrap{white-space:pre-wrap;}\n.shared-eventsviewer .event-actions{margin-top:10px;}\n.shared-eventsviewer .showinline,.shared-eventsviewer .hideinline{white-space:nowrap;word-wrap:normal;display:block;}\n.shared-eventsviewer-list,.shared-eventsviewer-table,.shared-eventsviewer-raw{background:#ffffff;}\n.events-results-table{min-width:100%;width:auto;*width:100%;}.events-results-table>tbody>tr>td>a,.events-results-table>tbody>tr>td>span.field-val{text-decoration:none;display:block;}\n.events-results-table>tbody>tr>td.one-value-drilldown:hover,.events-results-table>tbody>tr>td._time-drilldown:hover,.events-results-table>tbody>tr>td.multi-value-drilldown>a.field-val:hover{background-color:#e4e4e4;cursor:pointer;}\n.events-results-table>tbody>tr>td.one-value-drilldown:hover>a.field-val,.events-results-table>tbody>tr>td._time-drilldown:hover>a{color:#32496a;}\n.docked-header-table>table{border-top:0;}\n.reorderable-label{position:relative;display:block;padding:4px 8px 4px 18px;}\n.sorts .reorderable-label:after{font-family:\"Splunk Icons\";content:\"\\2195 \";padding-left:5px;color:#bbbbbb;}\n.sorts.asc .reorderable-label:after,.sorts.Asc .reorderable-label:after{content:\"\\21A5 \";color:#333333;}\n.sorts.desc .reorderable-label:after,.sorts.Desc .reorderable-label:after{content:\"\\21A7 \";color:#333333;}\n.reorderable-helper{background-color:#d85d3c;background-color:#ebebeb;background-image:-moz-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#f5f5f5), to(#dcdcdc));background-image:-webkit-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-o-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:linear-gradient(to bottom, #f5f5f5, #dcdcdc);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#fff5f5f5\', endColorstr=\'#ffdcdcdc\', GradientType=0);background-color:#e9e9e9;border:1px solid #aeaeae;color:#333333;text-shadow:0 1px 0 #ffffff;-webkit-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);-moz-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);background-color:#f5f5f5;background-image:-moz-linear-gradient(top, #ffffff, #e5e5e5);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#ffffff), to(#e5e5e5));background-image:-webkit-linear-gradient(top, #ffffff, #e5e5e5);background-image:-o-linear-gradient(top, #ffffff, #e5e5e5);background-image:linear-gradient(to bottom, #ffffff, #e5e5e5);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ffffffff\', endColorstr=\'#ffe5e5e5\', GradientType=0);background-color:#eeeeee;border-color:#aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;background-position:0 0;-webkit-border-radius:0;-moz-border-radius:0;border-radius:0;z-index:10;line-height:16px;}\n.reorderable-helper.reorderable-remove{background-color:#fdf7f5;background-image:-moz-linear-gradient(top, #ffffff, #faeae6);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#ffffff), to(#faeae6));background-image:-webkit-linear-gradient(top, #ffffff, #faeae6);background-image:-o-linear-gradient(top, #ffffff, #faeae6);background-image:linear-gradient(to bottom, #ffffff, #faeae6);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ffffffff\', endColorstr=\'#fffaeae6\', GradientType=0);border-color:#cfb3ab;}\nth.reorderable{cursor:move;padding:0;}th.reorderable.sorts:after{display:none;}\n.on.reorderable-label:before{content:\"\";position:absolute;display:block;height:20px;width:7px;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVQIW2M0Njb+f/bsWUYYzciABuAyOFUAAKKMEAXhn6ySAAAAAElFTkSuQmCC) repeat;top:2px;left:4px;opacity:0.5;margin-bottom:-10px;}\nth.reorderable.moving{color:transparent;text-shadow:none;background:#cccccc;}\nth.reorderable.moving .reorderable-label:before{background:none;}\nth.reorderable.moving .reorderable-label:after{color:transparent;}\n.table-insertion-cursor{border-left:1px dashed #d85d3c;position:absolute;top:0;left:-100px;bottom:0;margin-left:-1px;display:none;}\n@media print{td.expands,td.actions,th.col-info{display:none !important;} .reorderable-label{padding-left:8px !important;}.reorderable-label:before{background:none !important;} .shared-eventsviewer pre.raw-event{word-break:break-all !important;word-wrap:break-word !important;overflow-wrap:break-word !important;white-space:normal !important;} .shared-eventsviewer,.events-viewer-wrapper{max-width:100% !important;width:100% !important;overflow:hidden !important;}}.shared-fieldinfo{width:600px;}.shared-fieldinfo .popdown-dialog-body{padding:0 20px 20px 20px;}\n.shared-fieldinfo h2{margin:-1px -21px 10px -21px;line-height:40px;font-size:16px;font-weight:normal;padding:0 60px 0 20px;background-color:#ebebeb;background-image:-moz-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#f5f5f5), to(#dcdcdc));background-image:-webkit-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-o-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:linear-gradient(to bottom, #f5f5f5, #dcdcdc);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#fff5f5f5\', endColorstr=\'#ffdcdcdc\', GradientType=0);background-color:#e9e9e9;border:1px solid #aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;color:#333333;text-shadow:0 1px 0 #ffffff;-webkit-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);-moz-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);-webkit-border-top-right-radius:4px;-moz-border-radius-topright:4px;border-top-right-radius:4px;-webkit-border-top-left-radius:4px;-moz-border-radius-topleft:4px;border-top-left-radius:4px;border-bottom:1px solid #a9a9a9;box-shadow:none;*zoom:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.shared-fieldinfo h3{font-size:12px;font-weight:bold;margin:15px 0 0 0;}\n.shared-fieldinfo p{line-height:30px;}\n.shared-fieldinfo .select-field-label{display:inline-block;margin:0 5px 0 20px;line-height:26px;color:#999999;vertical-align:top;}\n.shared-fieldinfo .fields-values>li,.shared-fieldinfo .fields-numeric>li{width:30%;}\n.shared-fieldinfo .graph-bar{margin:0 20px 0 0;height:16px;background-color:#999999;background-color:#b8b8b8;background-image:-moz-linear-gradient(top, #cccccc, #999999);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#cccccc), to(#999999));background-image:-webkit-linear-gradient(top, #cccccc, #999999);background-image:-o-linear-gradient(top, #cccccc, #999999);background-image:linear-gradient(to bottom, #cccccc, #999999);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ffcccccc\', endColorstr=\'#ff999999\', GradientType=0);max-width:100%;}\n.shared-fieldinfo table.table-condensed{margin:13px -20px -5px -20px;width:598px;}\n.shared-fieldinfo td.value{max-width:200px;word-wrap:break-word;padding-left:20px;}\n.shared-fieldinfo th.value{padding-left:20px;}\n.shared-fieldinfo ul.inline{line-height:20px;margin-bottom:0;}.shared-fieldinfo ul.inline li{padding-left:0;}\n.shared-fieldinfo .close{display:block;top:15px;right:20px;opacity:0.4;filter:alpha(opacity=40);overflow:hidden;position:absolute;}.shared-fieldinfo .close:hover{opacity:0.8;filter:alpha(opacity=80);}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 