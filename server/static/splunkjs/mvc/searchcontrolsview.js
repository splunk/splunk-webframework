
define('views/shared/jobstatus/Spinner',['underscore', 'module', 'views/shared/WaitSpinner'],function(_, module, SpinnerView) {
    return SpinnerView.extend({
        className: 'pull-left',
        moduleId: module.id,
        initialize: function() {
            var defaults = {
              top: '3', // Top position relative to parent in px
              left: '3' // Left position relative to parent in px
            };
            
            _.defaults(this.options, defaults);
            
           SpinnerView.prototype.initialize.apply(this, arguments);
           this.model.entry.content.on('change:dispatchState change:isDone change:isPaused', this.debouncedRender, this);
        },
        render: function() {
            var active = !(this.model.entry.content.get("isDone") || this.model.entry.content.get("isPaused") || this.model.isNew());
            
            if (this.active === active) {
                return this;
            }
            
            this.$el[active ? 'show' : 'hide']()[active ? 'addClass' : 'removeClass']('active');
            this[active ? 'start' : 'stop']();
            this.active = active;
            return this;
        }
    });
});

define('views/shared/jobstatus/Count',['underscore', 'module', 'views/Base', 'util/time_utils', 'splunk.i18n', 'splunk.util'],function(_,module, BaseView, time_utils, i18n, splunkUtil) {
    return BaseView.extend({
        className: 'status',
        moduleId: module.id,
        initialize: function() {
           BaseView.prototype.initialize.apply(this, arguments);
           this.model.on('jobProgress prepared sync', this.render, this);
           this.model.on('destroy', this.empty, this);
        },
        empty: function() {
            this.$el.empty();
            return this;
        },
        render: function() {
            if (this.canvasLoader) {
                this.canvasLoader.kill();
                this.canvasLoader = null;
            }
            
            var progress = _("Starting job...").t(),
                isRealTimeSearch = this.model.entry.content.get("isRealTimeSearch");
            
            if (this.model.entry.content.get("isDone")) {
                progress = _("Complete").t();
            } else if (this.model.isFinalizing()) {
                progress = _("Finalizing job...").t();
            } else if (this.model.entry.content.get("isPaused")) {
                progress = _("Paused").t();
            } else if (isRealTimeSearch) {
                progress = _("Real-time").t();
            } else if (this.model.isQueued()) {
                progress = _("Queued").t();
            } else if (this.model.isParsing()) {
                progress = _("Parsing job...").t();
            }
            
            var loaderId = 'loader-' + this.cid,
                earliest_iso = this.model.entry.content.get("earliestTime"),
                latest_iso = this.model.latestTimeSafe(),
                template = this.compiledTemplate({
                    progress: progress,
                    earliest_date: earliest_iso ? time_utils.isoToDateObject(earliest_iso) : new Date(0),
                    latest_date: latest_iso ? time_utils.isoToDateObject(latest_iso) : new Date(0),
                    eventCount: i18n.format_decimal(this.model.entry.content.get("eventCount") || 0),
                    scanCount: i18n.format_decimal(this.model.entry.content.get("scanCount") || 0),
                    model: this.model,
                    loaderId: loaderId,
                    time_utils: time_utils,
                    i18n: i18n,
                    splunkUtil: splunkUtil,
                    _: _
                });
            this.$el.html(template);

            return this;
        },
        template: '\
            <% if (!model.isNew()) { %>\
                <% if (model.entry.content.get("isDone")) { %>\
                    <%= splunkUtil.sprintf(i18n.ungettext("%s event", "%s events", eventCount), \'<span class="number">\' + eventCount + \'</span>\') %>\
                    <%if (model.entry.content.get("isFinalized")) { %>\
                        <%- splunkUtil.sprintf(_("(Partial results for %s to %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(earliest_date), "short", "full"), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                    <% } else { %>\
                        <%- splunkUtil.sprintf(_("(%s to %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(earliest_date), "short", "full"), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                    <% } %>\
                <% } else if (model.isRunning()) { %>\
                    <%= splunkUtil.sprintf(i18n.ungettext("%s of %s event matched", "%s of %s events matched", scanCount), \'<span class="number">\' + eventCount + \'</span>\', \'<span class="number">\' + scanCount + \'</span>\') %>\
                <% } else if (model.entry.content.get("isPaused")) { %>\
                    <i class="icon-alert icon-alert-paused"></i><%- _("Your search is paused.").t() %>\
                <% } else { %>\
                    <%- progress %>\
                <% } %>\
            <% } %>\
        '
    });
});

define('views/shared/jobstatus/controls/Progress',['underscore','module', 'views/Base', 'bootstrap.tooltip'], function(_, module, BaseView /* bootstrap tooltip */) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'progress-bar',
        tagName: 'div',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.entry.content.on('change', this.render, this);
            this.model.on('change:id', this.render, this);
        },
        render: function() {
            if(!this.el.innerHTML) {
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                this.$('.progress-label-percentage').tooltip({animation:false, title:_('Percentage of the time range scanned.').t()});
            }

            if (this.model.isNew()) {
                this.$el.hide();
                return this;
            }
            
            var isRealTimeSearch = this.model.entry.content.get("isRealTimeSearch");
            
            if (this.model.isRunning() && !isRealTimeSearch){
                this.$el.show().children('span[class!="progress-label-percentage"]').hide();
                var percentage = (this.model.entry.content.get('doneProgress') * 100.0).toFixed(1);
                this.$('.progress-animation').show().css('width', percentage + '%');
                this.$('.progress-label-percentage').text(percentage + _('%').t()).show();
            } else {
                this.$el.show().children().hide();
                if (this.model.entry.content.get("isDone")) {
                    this.$('.progress-label-complete').show();
                } else if (this.model.isFinalizing()) {
                    this.$('.progress-label-finalizing').show();
                    this.$('.progress-animation-wrapper').show().css('width', '');
                } else if (this.model.entry.content.get("isPaused")) {
                    this.$('.progress-label-paused').show();
                } else if (isRealTimeSearch) {
                    this.$('.progress-animation-wrapper').show().css('width', '');
                    this.$('.progress-label-realtime').show();
                } else if (this.model.isQueued()) {
                    this.$('.progress-animation-wrapper').show().css('width', '');
                    this.$('.progress-label-queued').show();
                } else if (this.model.isParsing()) {
                    this.$('.progress-animation-wrapper').show().css('width', '');
                    this.$('.progress-label-parsing').show();
                } else {
                    this.$el.hide();
                }
            }

            return this;
        },
        template: '\
                <div class="progress-animation"></div>\
                <span class="progress-label progress-label-complete"><%- _("Complete").t() %></span>\
                <span class="progress-label progress-label-finalizing"><%- _("Finalizing...").t() %></span>\
                <span class="progress-label progress-label-paused"><%- _("Paused").t() %></span>\
                <span class="progress-label progress-label-realtime"><%- _("Real-time").t() %></span>\
        		<span class="progress-label progress-label-queued"><%- _("Queued").t() %></span>\
        		<span class="progress-label progress-label-parsing"><%- _("Parsing").t() %></span>\
                <span class="progress-label progress-label-percentage"><%- _("0%").t() %></span>\
        '
    });
});

define('views/shared/jobstatus/controls/Cancel',['underscore', 'module', 'views/Base'], function(_, module, BaseView) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'cancel btn btn-small btn-square',
        tagName: 'a',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            'click': function() {
                this.model.destroy();
                this.model.clear();
            }
        },
        isActive: function() {
            return !this.model.isNew() && !this.model.entry.content.get('isDone');
        },
        render: function() {
            this.$el.html('<i class="icon-trash"></i><span class="hide-text">' + _("Cancel").t() + '</span>');
            return this;
        }
    });
});

define('views/shared/jobstatus/controls/Stop',['underscore','module', 'views/Base'], function(_, module, BaseView) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'stop btn btn-small btn-square',
        tagName: 'a',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            "click": function() {
                if (this.model.isQueued() || this.model.isParsing()) {
                    this.model.destroy({
                        success: function() {
                            this.model.clear();
                        }.bind(this)
                    });
                } else {
                    this.model.finalize({
                        success: function() {
                            this.model.fetch();
                        }.bind(this)
                    });
                }
            }
        },
        isActive: function() {
            return !this.model.isNew() && !this.model.entry.content.get('isDone');
        },
        render: function() {
            this.$el.html('<i class="icon-stop"></i><span class="hide-text">' + _("Stop").t() + '</span>');
            return this;
        }
    });
});

define('views/shared/jobstatus/controls/PlayPause',['jquery', 'underscore', 'module', 'views/Base'], function($, _, module, BaseView) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'playpause btn btn-small btn-square',
        tagName: 'a',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.entry.content.on('change', this.render, this);
        },
        events: {
            'click': function(e) {
                var action = $(e.currentTarget).data('mode'),
                    options = {
                        success: function() {
                            this.model.fetch();
                        }.bind(this)
                    };

                if(action === 'pause') {
                    this.model.pause(options);
                }
                else if(action === 'unpause') {
                    this.model.unpause(options);
                }
            }
        },
        isActive: function() {
            return (this.model.isRunning() || this.model.entry.content.get('isPaused'));
        },
        render: function() {
            if (this.model.entry.content.get('isPaused')) {
                this.$el.data('mode', 'unpause').html('<i class="icon-play"></i><span class="hide-text">' + _("Unpause").t() + '</span>');
            } else {
                this.$el.data('mode', 'pause').html('<i class="icon-pause"></i><span class="hide-text">' + _("Pause").t() + '</span>');
            }
            this.$el.show();
            return this;
        }
    });
});

define('views/shared/jobstatus/controls/Reload',['underscore', 'module', 'views/Base'], function(_, module, BaseView) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'reload btn btn-small btn-square',
        tagName: 'a',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            "click": function(e) {
                e.preventDefault();
                // just trigger a custom event on the job model and let upstream logic handle it
                this.model.trigger('reload');
            }
        },
        isActive: function() {
            // active only when the job is complete
            return this.model.entry.content.get('isDone');
        },
        render: function() {
            this.$el.html('<i class="icon-rotate-counter"></i><span class="hide-text">' + _('Reload').t() + '</span>');
            return this;
        }
    });
});

define('views/shared/jobstatus/controls/menu/Messages',
    [        
        'underscore',
        'module',
        'views/Base',
        'util/splunkd_utils'
    ], 
    function(_, module, BaseView, splunkd_utils) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'job_messages',
            tagName: 'ul',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                
                this.model.searchJob.on('serverValidated', this.checkMessages, this);
            },
            checkMessages: function(isValid, model, messages) {
                var filteredMessages = splunkd_utils.filterMessagesByTypes(messages, [splunkd_utils.INFO, splunkd_utils.WARNING]);
                
                if (filteredMessages.length) {
                    this.showMessages(filteredMessages);
                } else {
                    this.$el.empty();
                }
            },
            showMessages: function(messages) {
                this.$el.empty();
                _.each(messages, function(message, index){
                    this.$el.append(
                        _.template(this.messagesTemplate, {
                            message: message
                        })
                    );
                }.bind(this));
            },
            render: function() {
                this.checkMessages();
                return this;
            },
            messagesTemplate: '\
                <li class="job_message"><%- message.text %></li>\
            '
        });
    }
);
define('views/shared/jobstatus/controls/menu/EditModal',
    [
        'underscore',
        'backbone',
        'module',
        'views/shared/Modal',
        'views/shared/FlashMessages',
        'views/shared/controls/ControlGroup',
        'uri/route',
        'util/splunkd_utils',
        'util/time_utils'
     ],
     function(_, Backbone, module, Modal, FlashMessages, ControlGroup, route, splunkd_utils, time_utils){
        return Modal.extend({
            /**
             * @param {Object} options {
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
             *  }
             */
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.inmem = this.model.searchJob.clone();
                this.children.flashMessages = new FlashMessages({ model: this.model.inmem });
                
                var currApp = this.model.application.get("app"),
                    currOwner = this.model.application.get("owner"),
                    perms = this.model.inmem.entry.acl.permsToObj(),
                    read = perms.read;
                
                this.everyoneRead = (_.indexOf(read, "*") != -1);
                this.model.inmem.set("everyoneRead", this.everyoneRead);
                
                this.startTTL = this.model.inmem.entry.content.get("ttl");
                this.defaultTTL = parseInt(this.model.searchJob.entry.content.get("defaultTTL"), 10);
                this.defaultSaveTTL = parseInt(this.model.searchJob.entry.content.get("defaultSaveTTL"), 10);
                    
                this.linkToJob = route.search(
                    this.model.application.get('root'),
                    this.model.application.get('locale'),
                    this.model.application.get("app"),
                    {
                        data: {
                            sid: this.model.inmem.id 
                        },
                        absolute: true
                    }
                );

                //owner
                this.children.owner = new ControlGroup({
                    label: _("Owner").t(),
                    controlType:'Label',
                    controlOptions: {
                        model: this.model.inmem.entry.acl,
                        modelAttribute: 'owner'
                    }
                });
                
                //app
                this.children.app = new ControlGroup({
                    label: _("App").t(),
                    controlType:'Label',
                    controlOptions: {
                        model: this.model.inmem.entry.acl,
                        modelAttribute: 'app'
                    }
                });
                
                //permissions toggle
                this.children.permissions = new ControlGroup({
                    label: _("Read Permissions").t(),
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-2",
                        items: [
                            { value: false, label: _('Private').t() },
                            { value: true, label: _('Everyone').t() }
                        ],
                        model: this.model.inmem,
                        modelAttribute: 'everyoneRead'
                    }
                });
                
                //lifetime toggle
                this.children.lifetime = new ControlGroup({
                    label: _("Lifetime").t(),
                    controlType:'SyntheticRadio',
                    tooltip: _("The job will be deleted if it's not accessed in its lifetime.  Calculated from the time the job finishes.").t(),
                    controlOptions: {
                        className: "btn-group btn-group-2",
                        items: [
                            { value: this.defaultTTL, label: time_utils.getRelativeStringFromSeconds(this.defaultTTL, true) },
                            { value: this.defaultSaveTTL, label: time_utils.getRelativeStringFromSeconds(this.defaultSaveTTL, true) }
                        ],
                        model: this.model.inmem.entry.content,
                        modelAttribute: 'ttl'
                    }
                });
                
                //link to job
                this.children.link = new ControlGroup({
                    label: _("Link To Job").t(),
                    controlType:'Text',
                    help: _('Copy or bookmark the link by right-clicking the icon, or drag the icon into your bookmarks bar.').t(),
                    controlOptions: {
                        defaultValue: this.linkToJob,
                        append: '<a class="add-on bookmark" href="' + this.linkToJob + '"><i class="icon-bookmark ir">' + _("Splunk Search Job").t() + '</i></a>'
                    }
                });

                this.on("hidden", function() {
                    this.model.searchJob.fetch();
                }, this);  
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .btn-primary': function(e) {
                    e.preventDefault();
                    
                    var everyoneRead = this.model.inmem.get('everyoneRead'),
                        selectedTTL = this.model.inmem.entry.content.get("ttl"),
                        isRealTime = this.model.inmem.entry.content.get("isRealTimeSearch"),
                        aclDeferred, saveDeferred;

                    if (this.everyoneRead !== everyoneRead) {
                        if (everyoneRead) {
                            aclDeferred = this.model.inmem.makeWorldReadable(); 
                        } else {
                            aclDeferred = this.model.inmem.undoWorldReadable(); 
                        }
                    } else {
                        aclDeferred = true;
                    }
                    
                    if ((this.startTTL !== selectedTTL) && ((selectedTTL === this.defaultTTL) || (selectedTTL === this.defaultSaveTTL))){
                        if (selectedTTL === this.defaultTTL) {
                            saveDeferred = this.model.inmem.unsaveJob({
                                auto_cancel: 100
                            });
                        }

                        if (selectedTTL === this.defaultSaveTTL) {
                            if (isRealTime) {
                                saveDeferred = this.model.inmem.saveJob({
                                    auto_cancel: 100
                                });
                            } else {
                                //if the job is not realtime then we use the job endpoint's inherent clear of auto_pause and auto_cancel
                                saveDeferred = this.model.inmem.saveJob();                            
                            }
                        }
                    } else {
                        saveDeferred = true;
                    }
                    
                    $.when(aclDeferred, saveDeferred).then(function() {
                        this.hide();
                    }.bind(this));                    
                },
                'click a.bookmark': function(e) {
                    e.preventDefault();
                }
            }),
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Job Settings").t());

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.owner.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.app.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.permissions.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.lifetime.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.link.render().el);

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

                return this;
            }
        });
    }
);

define('views/shared/jobstatus/controls/menu/Edit',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/controls/menu/EditModal'
    ],
    function(_, module, BaseView, EditModal) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'edit',
            tagName: 'li',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click a[class!="disabled"]': function(e) {
                    this.children.editModal = new EditModal({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.editModal.render().el);
                    this.children.editModal.show();

                    e.preventDefault();
                },
                'click a.disabled': function(e) {
                    e.preventDefault();
                }
            },
            render: function() {
                var canWrite = this.model.searchJob.entry.acl.canWrite();
                if (canWrite){
                    this.$el.html('<a href="#">' + _("Edit Job Settings").t() + '</a>');
                } else {
                    this.$el.html('<a href="#" class="disabled">' + _("Edit Job Settings").t() + '</a>');
                }
                return this;
            }
        }
    );
});

define('views/shared/jobstatus/controls/menu/sendbackgroundmodal/Settings',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/FlashMessages',
        'views/shared/Modal',
        'splunk.util',
        'uri/route',
        'util/console'
     ],
     function(
        _,
        module,
        Base,
        ControlGroup,
        FlashMessages,
        Modal,
        splunkUtil,
        route,
        console
     ){
        return Base.extend({
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);

                this.children.flashMessages = new FlashMessages({
                    model: {
                        inmen: this.model.inmem
                    }
                });

                // TODO: 'Remove if statement after all consumers pass the appLocal and application model'
                var configEmailHelpLink = "http://docs.splunk.com/";
                if (this.model.appLocal && this.model.application) {
                    configEmailHelpLink = route.docHelp(
                        this.model.application.get("root"),
                        this.model.application.get("locale"),
                        'learnmore.alert.email',
                        this.model.application.get("app"),
                        this.model.appLocal.entry.content.get('version'),
                        this.model.appLocal.appAllowsDisable()
                    );
                } else {
                    console.warn("The settings view needs the AppLocal and Application model passed to it");
                }

                //email checkbox
                this.children.email = new ControlGroup({
                    label: _("Email when complete").t(),
                    controlType:'SyntheticCheckbox',
                    controlOptions: {
                        model: this.model.inmem,
                        modelAttribute: 'email',
                        value: true
                    },
                    help: splunkUtil.sprintf(_('To send emails you must configure the settings in System Settings > Alert Email Settings. %s').t(), ' <a href="' + configEmailHelpLink + '" target="_blank">' + _("Learn More").t() + '</a>')
                });

                //email subject
                this.children.subject = new ControlGroup({
                    label: _("Email Subject Line").t(),
                    controlType:'Text',
                    controlOptions: {
                        model: this.model.inmem,
                        modelAttribute: 'subject'
                    }
                });

                //email addresses
                this.children.addresses = new ControlGroup({
                    label: _("Email Addresses").t(),
                    controlType:'Textarea',
                    controlOptions: {
                        model: this.model.inmem,
                        modelAttribute: 'addresses'
                    }
                });

                //include results
                /*
                 * TODO: the backend does not support attaching the results to the background
                 * finish email. When it does, add this back.
                this.children.results = new ControlGroup({
                    label: "Include Results",
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-2",
                        items: [
                            { value: 'none', label: 'None' },
                            { value: 'text', label: 'Text' },
                            { value: 'csv', label: 'CSV' },
                            { value: 'csv', label: 'PDF' }
                        ],
                        model: this.model.inmem,
                        modelAttribute: 'results'
                    }
                });
                */
                
                this.model.inmem.on("change:email", function(){
                    var shouldEmail = this.model.inmem.get("email");
                    if (shouldEmail) {
                        this.children.subject.$el.show();
                        this.children.addresses.$el.show();
                        //this.children.results.$el.show();
                    } else {
                        this.children.subject.$el.hide();
                        this.children.addresses.$el.hide();
                       //this.children.results.$el.hide();
                    }
                }, this);
            },
            events: {
                "click .modal-btn-primary" : function(e) {
                    e.preventDefault();
                                        
                    var shouldEmail = this.model.inmem.get("email"),
                        email_subject = this.model.inmem.get("subject"),
                        email_list = this.model.inmem.get("addresses"),
                        saveBackgroundDeferred,
                        saveControlDeferred,
                        disablePreviewDeferred;
                    
                    saveBackgroundDeferred = this.model.inmem.saveIsBackground();
                    
                    if (shouldEmail) {
                        saveControlDeferred = this.model.inmem.saveJob({
                            data: {
                                email_list: email_list,
                                email_subject: email_subject
                            }
                        });
                    } else {
                        saveControlDeferred = this.model.inmem.saveJob();
                    }
                    
                    disablePreviewDeferred = this.model.inmem.disablePreview();
                    
                    $.when(saveBackgroundDeferred, saveControlDeferred, disablePreviewDeferred).then(function(){
                        var fetch = this.model.inmem.fetch();
                        
                        $.when(fetch).then(function() {
                            this.model.inmem.trigger('saveSuccess');
                        }.bind(this));
                    }.bind(this));
                }
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Send Job to Background").t());

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.email.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.subject.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.addresses.render().el);
                //this.$(Modal.BODY_FORM_SELECTOR).append(this.children.results.render().el);
                this.children.subject.$el.hide();
                this.children.addresses.$el.hide();
                //this.children.results.$el.hide();

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append('<a class="btn btn-primary modal-btn-primary">' + _("Send to Background").t() + '</a>');

                return this;
            }
        });
    }
);
define('views/shared/jobstatus/controls/menu/sendbackgroundmodal/Success',
    [
         'underscore',
         'module',
         'views/Base',
         'views/shared/Modal',
         'views/shared/controls/ControlGroup',
         'uri/route',
         'util/time_utils',
         'splunk.util'
     ],
     function(_, module, Base, Modal, ControlGroup, route, time_utils, splunkUtil){
        return Base.extend({
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                
                var linkToJob = route.search(
                    this.model.application.get('root'),    
                    this.model.application.get('locale'),
                    this.model.application.get("app"),
                    {
                        data: {
                            sid: this.model.inmem.id 
                        },
                        absolute: true
                    }
                );
                
                //link to job
                this.children.link = new ControlGroup({
                    label: _("Link To Job").t(),
                    controlType:'Text',
                    help: _('Copy or bookmark the link by right-clicking the icon, or drag the icon into your bookmarks bar.').t(),
                    controlOptions: {
                        defaultValue: linkToJob,
                        append: '<a class="add-on bookmark" href="' + linkToJob + '"><i class="icon-bookmark ir">' + _("Splunk Search Job").t() + '</i></a>'
                    }
                });
                
                
                this.model.inmem.entry.content.on("change:ttl", this.updateTTL, this);
            },
            events: $.extend({}, Modal.prototype.events, {
                'click a.bookmark': function(e) {
                    e.preventDefault();
                }
            }),
            updateTTL: function() {
                var ttl = this.model.inmem.entry.acl.get("ttl") || 0,
                    time = time_utils.getRelativeStringFromSeconds(ttl, true);                
                
                this.$(".ttl").html(time);
            },
            render: function() {
                var template = this.compiledTemplate({
                    _: _,
                    splunkUtil: splunkUtil
                });
                
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("The Job is Running in the Background").t());

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.link.render().el);
                
                this.$(Modal.BODY_SELECTOR).prepend(template);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_DONE);
                this.updateTTL();

                return this;
            },
            template: '\
                <p>\
                    <%= splunkUtil.sprintf(_("The job&#39;s lifetime has been extended to %s.").t(), \'<span class="ttl">0</span>\') %>\
                </p>\
            '
        });
    }
);
define('views/shared/jobstatus/controls/menu/sendbackgroundmodal/Master',
    [
         'underscore',
         'backbone',
         'module',
         'views/shared/Modal',
         'views/shared/jobstatus/controls/menu/sendbackgroundmodal/Settings',
         'views/shared/jobstatus/controls/menu/sendbackgroundmodal/Success'
     ],
     function(_, Backbone, module, Modal, Settings, Success){
        return Modal.extend({
            /**
             * @param {Object} options {
             *  model:  {
             *      searchJob: <models.services.search.Job>,
             *      application: <models.Application>,
             *      appLocal: <models.services.AppLocal>
             *  }
             * 
             */
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                
                this.model.inmem = this.model.searchJob.clone();
                this.model.inmem.set({
                    email: false,
                    results: "none",
                    subject: _("Splunk Job Complete: $name$").t()
                });

                this.children.settings = new Settings({
                    model: {
                        application: this.model.application,
                        inmem: this.model.inmem,
                        appLocal: this.model.appLocal
                    }
                });

                this.children.success = new Success({
                    model: {
                        application: this.model.application,
                        inmem: this.model.inmem
                    }
                });

                this.model.inmem.on('saveSuccess', function(){
                    this.children.settings.$el.hide();
                    this.children.success.$el.show();
                },this);

                this.on("hidden", function() {
                    if (this.model.inmem.isBackground()) {
                        this.model.searchJob.trigger("close");
                    }
                }, this);  
            },
            render: function() {
                this.$el.append(this.children.settings.render().el);
                this.$el.append(this.children.success.render().el);
                this.children.success.$el.hide();
            }
        });
    }
);
define('views/shared/jobstatus/controls/menu/SendBackground',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/controls/menu/sendbackgroundmodal/Master'
    ],
    function(_, module, BaseView, SendBackgroundModal) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'send-background',
            tagName: 'li',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.model.searchJob.entry.content.on('change', this.render, this);
            },
            events: {
                'click a[class!="disabled"]': function(e) {
                    this.children.sendBackgroundModal = new SendBackgroundModal({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application,
                            appLocal: this.model.appLocal
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.sendBackgroundModal.render().el);
                    this.children.sendBackgroundModal.show();

                    e.preventDefault();
                },
                'click a.disabled': function(e) {
                    e.preventDefault();
                }
            },
            render: function() {
                var canWrite = this.model.searchJob.entry.acl.canWrite(),
                    isBackground = this.model.searchJob.isBackground(),
                    isRealTime = this.model.searchJob.entry.content.get("isRealTimeSearch");

                this.$el.html('<a href="#">Send Job to Background</a>');
                
                if (canWrite && this.model.searchJob.isRunning() && !isRealTime && !isBackground){
                    this.$el.html('<a href="#">' + _("Send Job to Background").t() + '</a>');
                } else {
                    this.$el.html('<a href="#" class="disabled">' + _("Send Job to Background").t() + '</a>');
                }
                
                return this;
            }
        });
    }
);

define('views/shared/jobstatus/controls/menu/Inspect',['underscore', 'module', 'views/Base', 'uri/route', 'splunk.window'], function(_, module, BaseView, route, splunkwindow) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'inspect',
        tagName: 'li',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            'click a': function(e) {
                splunkwindow.open(
                    route.jobInspector(this.model.application.get('root'), this.model.application.get('locale'), this.model.application.get('app'), this.model.searchJob.id),
                    'splunk_job_inspector',
                    {
                        width: 870, 
                        height: 560,
                        menubar: false
                    }
                );
                e.preventDefault();
            }
        },
        render: function() {
            this.$el.html('<a href="#">' + _('Inspect Job').t() + '</a>');
            return this;
        }
    });
});

define('views/shared/jobstatus/controls/menu/DeleteModal',
    [    'underscore',
         'backbone',
         'module',
         'views/shared/Modal',
         'views/shared/FlashMessages'
     ],
     function(_, Backbone, module, Modal, FlashMessages){
        return Modal.extend({
            /**
             * @param {Object} options {
                    model:  <models.services.search.Job>
             *      collection: <collections.services.properties.Limits>
             *  }
             */
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                this.children.flashMessages = new FlashMessages({ model: this.model });
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .btn-primary': function(e) {
                    this.model.destroy({
                        success: function(model, response){
                            this.hide();
                            this.model.unset("id");
                        }.bind(this)
                    });
                    
                    e.preventDefault();
                }
            }),
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Delete Job").t());

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                this.$(Modal.BODY_FORM_SELECTOR).append("<p>" + _("Are You Sure?").t() + "</p>");

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_DELETE);

                return this;
            }
        });
    }
);
define('views/shared/jobstatus/controls/menu/Delete',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/controls/menu/DeleteModal'
    ],
    function(_, module, BaseView, DeleteModal) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'delete',
            tagName: 'li',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click a[class!="disabled"]': function(e) {
                    this.children.deleteModal = new DeleteModal({
                        model: this.model.searchJob,
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.deleteModal.render().el);
                    this.children.deleteModal.show();

                    e.preventDefault();
                },
                'click a.disabled': function(e) {
                    e.preventDefault();
                }
            },
            render: function() {
                var canWrite = this.model.searchJob.entry.acl.canWrite();
                if (canWrite){
                    this.$el.html('<a href="#">' + _("Delete Job").t() + '</a>');
                } else {
                    this.$el.html('<a href="#" class="disabled">' + _("Delete Job").t() + '</a>');
                }
                return this;
            }
        });
    }
);
define('views/shared/jobstatus/controls/menu/Master',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/controls/menu/Messages',
        'views/shared/jobstatus/controls/menu/Edit',
        'views/shared/jobstatus/controls/menu/SendBackground',
        'views/shared/jobstatus/controls/menu/Inspect',
        'views/shared/jobstatus/controls/menu/Delete',
        'views/shared/delegates/Popdown',
        'util/splunkd_utils'
    ],
    function(_, module, BaseView, Messages, Edit, SendBackground, Inspect, Delete, Popdown, splunkd_utils) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'job-menu btn-combo',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                this.children.messages = new Messages({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });
                
                this.children.edit = new Edit({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });

                this.children.sendBackground = new SendBackground({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application,
                        appLocal: this.model.appLocal
                    }
                });

                this.children.inspect = new Inspect({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });

                this.children.del = new Delete({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });
                
                this.model.searchJob.on("serverValidated", this.checkMessages, this);
            },
            checkMessages: function(isValid, model, messages) {
                var hasInfo = splunkd_utils.messagesContainsOneOfTypes(messages, [splunkd_utils.INFO]),
                    hasWarning = splunkd_utils.messagesContainsOneOfTypes(messages, [splunkd_utils.WARNING]);
                
                if (hasWarning) {
                    this.showMessageIndicator(splunkd_utils.WARNING);
                } else if (hasInfo) {
                    this.showMessageIndicator(splunkd_utils.INFO);
                } else {
                    this.$(".message-indicator").hide();
                    this.children.messages.$el.hide();
                }
            },
            showMessageIndicator: function(type) {
                var iconClassName = splunkd_utils.normalizeType(type) == 'info' ? 'icon-info-circle' : 'icon-alert';
                this.$(".message-indicator").attr('class', 'message-indicator ' + iconClassName).show();
                
                this.children.messages.$el.show();
            },
            render: function() {
                var $ul;
                if (this.$el.html().length) {
                    return this;
                }
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                
                this.$('.dropdown-menu > .arrow').after(this.children.messages.render().el);
                
                $ul = this.$('.controls');
                $ul.append(this.children.edit.render().el);
                $ul.append(this.children.sendBackground.render().el);
                $ul.append(this.children.inspect.render().el);

                if(this.options.allowDelete) {
                    $ul.append(this.children.del.render().el);
                }

                this.children.popdown = new Popdown({el: this.el, attachDialogTo:'body'});
                
                this.checkMessages();
                return this;
            },
            template: '\
                <a class="btn btn-small dropdown-toggle" href="#">\
                    <i class="message-indicator" style="display:none"></i>\
                    <%- _("Job").t() %><span class="caret"></span>\
                </a>\
                <div class="dropdown-menu">\
                    <div class="arrow"></div>\
                    <ul class="controls"></ul>\
                </div>\
            '
        });
    }
);

define('views/shared/jobstatus/controls/Master',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/controls/Progress',
        'views/shared/jobstatus/controls/Cancel',
        'views/shared/jobstatus/controls/Stop',
        'views/shared/jobstatus/controls/PlayPause',
        'views/shared/jobstatus/controls/Reload',
        'views/shared/jobstatus/controls/menu/Master',
        'util/console'
    ],
    function(_, module, BaseView, Progress, Cancel, Stop, PlayPause, Reload, Menu, console) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'views-shared-jobstatus-controls-master btn-group pull-right includes-job-menu',
            initialize: function(){
                BaseView.prototype.initialize.apply(this, arguments);
                
                if (this.options.showJobMenu !== false) {
                    this.children.menu = new Menu({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application,
                            appLocal: this.model.appLocal
                        },
                        allowDelete: this.options.allowDelete
                    });
                } else {
                    this.$el.removeClass('includes-job-menu');
                }
                
                this.children.progress = new Progress({model: this.model.searchJob});
                this.children.playPause = new PlayPause({model: this.model.searchJob});
                //TODO: hiding cancel for now because it doesn't show up in the prototype
                //this.children.cancel = new Cancel({model: this.model});
                this.children.stop = new Stop({model: this.model.searchJob});
                if(this.options.enableReload) {
                    this.children.reload = new Reload({model: this.model.searchJob});
                }

                this.model.searchJob.entry.content.on('change', this.render, this);
            },
            render: function() {
                if (!this.el.innerHTML) {
                    _.each(this.children, function(child) {
                        this.$el.append(child.render().$el);
                    }, this);
                }
                this.model.searchJob.isNew() ? this.$el.hide() : this.$el.show();

                var dynamicChildren = [
                    this.children.playPause,
                    //this.children.cancel,
                    this.children.stop
                ];
                if(this.options.enableReload) {
                    dynamicChildren.push(this.children.reload);
                }
                _.each(dynamicChildren, function(child) {
	                    if (child.isActive()) {
	                        this.$el.append(child.$el);
	                    } else {
	                        child.$el.detach();
	                    }
                }, this);

                return this;
            }
        });
    }
);

define('views/shared/jobstatus/buttons/ShareDialog',
    [
         'jquery',
         'underscore',
         'module',
         'views/Base',
         'views/shared/Modal',
         'views/shared/controls/ControlGroup',
         'views/shared/jobstatus/controls/menu/EditModal',
         'uri/route',
         'util/time_utils',
         'splunk.util'
     ],
     function($, _, module, Base, Modal, ControlGroup, EditModal, route, time_utils, splunkUtil){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                
                this.linkToJob = route.search(
                    this.model.application.get('root'),     
                    this.model.application.get('locale'),
                    this.model.application.get("app"),
                    {
                        data: {
                            sid: this.model.searchJob.id 
                        },
                        absolute: true
                    }
                );
                
                //link to job
                this.children.link = new ControlGroup({
                    label: _("Link To Job").t(),
                    controlType:'Text',
                    help: _('Copy or bookmark the link by right-clicking the icon, or drag the icon into your bookmarks bar.').t(),
                    controlOptions: {
                        defaultValue: this.linkToJob,
                        append: '<a class="add-on bookmark" href="' + this.linkToJob + '"><i class="icon-bookmark ir">' + _("Splunk Search Job").t() + '</i></a>'
                    }
                });
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .jobSettings': function(e) {
                    this.hide();
                    
                    this.children.editModal = new EditModal({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.editModal.render().el);
                    this.children.editModal.show();
                    
                    e.preventDefault();
                },
                'click a.bookmark': function(e) {
                    e.preventDefault();
                }
            }),
            render: function() {
                var ttl = this.model.searchJob.entry.acl.get("ttl") || 0,
                    time = time_utils.getRelativeStringFromSeconds(ttl, true);
                
                var template = this.compiledTemplate({
                    settingsAnchor: '<a class="jobSettings" href="#">' + _("Job&nbsp;Settings").t() + '</a>',
                    time: time,
                    _: _,
                    splunkUtil: splunkUtil
                });
                
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Share Job").t());

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.link.render().el);
                
                this.$(Modal.BODY_SELECTOR).prepend(template);

                return this;
            },
            template: '\
                <p>\
                    <%=  splunkUtil.sprintf(_("The job&#39;s lifetime has been extended to %s and read permissions have been set to Everyone. Manage the job via %s.").t(), time, settingsAnchor) %>\
                </p>\
            '
        });
    }
);
define('views/shared/jobstatus/buttons/ShareButton',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/buttons/ShareDialog',
        'bootstrap.tooltip'
    ],
    function(_, module, Base, ShareDialog) {
        return Base.extend({
            moduleId: module.id,
            className: 'share btn btn-small btn-square disabled',
            tagName: 'a',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.$el.html('<i class="icon-share"></i><span class="hide-text">' + _("Share").t() + '</span>');
                this.$el.tooltip({animation:false, title:_('Share').t(), container: 'body'});

                this.defaultSaveTTL = parseInt(this.model.searchJob.entry.content.get("defaultSaveTTL"), 10);

                this.model.searchJob.entry.acl.on("change", this.render, this);
                this.model.searchJob.entry.content.on("change:ttl", this.render, this);
            },
            events: {
                'click': function(e) {
                    var $target = $(e.currentTarget),
                        isRealTime = this.model.searchJob.entry.content.get("isRealTimeSearch"),
                        saveDeferred;

                    e.preventDefault();

                    if ($target.hasClass("disabled")) {
                        return;
                    }

                    //do the work of sharing the job
                    if (isRealTime) {
                        saveDeferred = this.model.searchJob.saveJob({
                            auto_cancel: 100
                        });
                    } else {
                        //if the job is not realtime then we use the job endpoint's inherent clear of auto_pause and auto_cancel
                        saveDeferred = this.model.searchJob.saveJob();
                    }
                    $.when(saveDeferred).then(function() {
                        this.model.searchJob.makeWorldReadable({success: function() {
                            var fetch = this.model.searchJob.fetch();

                            $.when(fetch).then(function() {
                                this.children.shareDialog = new ShareDialog({
                                    model: {
                                        searchJob: this.model.searchJob,
                                        application: this.model.application
                                    },
                                    onHiddenRemove: true
                                });

                                $("body").append(this.children.shareDialog.render().el);
                                this.children.shareDialog.show();
                            }.bind(this));
                        }.bind(this)});
                    }.bind(this));
                }
            },
            render: function() {
                var canWrite = this.model.searchJob.entry.acl.canWrite(),
                    isShared = this.model.searchJob.isSharedAccordingToTTL(this.defaultSaveTTL);

                if (canWrite){
                    this.$el.removeClass("disabled");
                } else {
                    this.$el.addClass("disabled");
                }
                return this;
            }
        });
    }
);

define('models/AlertAction',['underscore','models/SplunkDBase'],function(_, Base){

    return Base.extend({
        urlRoot: 'configs/conf-alert_actions',
        getSetting: function(key, defaultValue) {
            return this.entry.content.has(key) ? this.entry.content.get(key) : defaultValue;
        },
        initialize: function() {
            Base.prototype.initialize.apply(this, arguments);
        }
    });

});
define('models/services/search/jobs/Control',
    [
         'jquery',
         'backbone',
         'models/Base',
         'util/splunkd_utils'
     ],
     function($, Backbone, BaseModel, splunkDUtils) {
        return BaseModel.extend({
            initialize: function(attributes, options) {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            sync: function(method, model, options) {
                var defaults = {
                    data: {
                        output_mode: 'json'
                    }
                };
                switch(method) {
                case 'update':
                    defaults.processData = true;
                    defaults.type = 'POST';
                    defaults.url = splunkDUtils.fullpath(model.id);
                    $.extend(true, defaults, options);
                    break;
                default:
                    throw new Error('invalid method: ' + method);
                }
                return Backbone.sync.call(this, method, model, defaults);
            }
        });
    }
);

define('models/services/search/jobs/Summary',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/Base',
        'collections/Base',
        'util/splunkd_utils'
    ],
    function(
        $,
        _,
        Backbone,
        BaseModel,
        BaseCollection,
        splunkdutils
    ) 
    {
        var Field = BaseModel.extend(
            {
                initialize: function() {
                    BaseModel.prototype.initialize.apply(this, arguments);
                },
                isNumeric: function() {
                    return this.get('numeric_count') > this.get('count') / 2;
                }
            }
        );
        var Fields = BaseCollection.extend({
            model: Field
        });
        
        var Model = BaseModel.extend({
            url: '',
            initialize: function(data, options) {
                BaseModel.prototype.initialize.apply(this, arguments);
                this.initializeAssociated();
                if (options && options.splunkDPayload) {
                    this.setFromSplunkD(options.splunkDPayload, {silent: true});
                }
            },
            initializeAssociated: function() {
                // do a dynamic lookup of the current constructor so that this method is inheritance-friendly
                var RootClass = this.constructor;
                this.associated = this.associated || {};
                //instance level models
                this.fields = this.fields || new RootClass.Fields();
                this.associated.fields = this.fields;
            },
            sync: function(method, model, options) {
                if (method!=='read') {
                    throw new Error('invalid method: ' + method);
                }
                options = options || {};
                var appOwner = {},
                    defaults = {data: {output_mode: 'json'}},
                    url = _.isFunction(model.url) ? model.url() : model.url || model.id;
                    
                if(options.data){
                    appOwner = $.extend(appOwner, { //JQuery purges undefined
                        app: options.data.app || undefined,
                        owner: options.data.owner || undefined,
                        sharing: options.data.sharing || undefined
                    });
                }
                defaults.url = splunkdutils.fullpath(url, appOwner);
                $.extend(true, defaults, options);
                delete defaults.data.app;
                delete defaults.data.owner;
                delete defaults.data.sharing;
                return Backbone.sync.call(this, method, model, defaults);
            },
            _fields: function(data) {
                data = $.extend(true, {}, data); 
                var fields = [];
                _.each(data, function(fieldValue, fieldName) {
                    var field = {name: fieldName};
                    _.each(fieldValue, function(fieldPropertyValue, fieldPropertyName){
                        field[fieldPropertyName] = fieldPropertyValue;
                    });
                    fields.push(field);
                }, this);
                return fields;
            },
            parse: function(response) {
                response = $.extend(true, {}, response);
                this.initializeAssociated();
                if (!response) {
                    return {};
                }
                var fields = this._fields(response.fields);
                delete response.fields;
                this.set(response);
                this.fields.reset(fields);
                return {};
            },
            setFromSplunkD: function(payload, options) {
                var fields;
                payload = $.extend(true, {}, payload);
                this.attributes = {};
                if (payload) {
                    fields = this._fields(payload.fields);
                    this.fields.reset(fields, options);
                    delete payload.fields;
                    this.set(payload, options);
                }
            },
            filterByMinFrequency: function(frequency) {
                var eventCount = this.get('event_count');
                return this.associated.fields.filter(function(field) {
                    return (field.get('count')/eventCount) >= frequency;
                });
            },
            frequency: function(fieldName) {
                var field = this.findByFieldName(fieldName);
                if (!field) {
                    return 0;
                }
                return field.get('count')/this.get('event_count');
            },
            findByFieldName: function(fieldName) {
                return this.fields.where({name: fieldName})[0];
            },
            distribution: function(fieldName) {
                var fieldHistogram,
                    field = this.findByFieldName(fieldName),
                    rootHistogram = this.get('histogram');
                if (!field) {
                    return [];
                }
                fieldHistogram = field.get('histogram');
                if (!rootHistogram || !fieldHistogram) {
                    return [];
                }

                var numBuckets = Math.min(rootHistogram.length, fieldHistogram.length);
                
                // flatten histogram and summaryHistogram data into arrays of counts and totals
                var counts = [];
                var totals = [];
                var i;
                for (i = 0; i < numBuckets; i++) {
                    counts.push(fieldHistogram[i].count);
                    totals.push(rootHistogram[i].count);
                }
    
                // merge buckets so there are no more than maxBuckets
                var maxBuckets = 30;
                var mergedCounts;
                var mergedTotals;
                while (numBuckets > maxBuckets) {
                    mergedCounts = [];
                    mergedTotals = [];
                    for (i = numBuckets - 1; i >= 0; i -= 2) {
                        if (i > 0) {
                            mergedCounts.unshift(counts[i] + counts[i - 1]);
                            mergedTotals.unshift(totals[i] + totals[i - 1]);
                        } else {
                            mergedCounts.unshift(counts[i]);
                            mergedTotals.unshift(totals[i]);
                        }
                    }
                    counts = mergedCounts;
                    totals = mergedTotals;
                    numBuckets = counts.length;
                }
    
                // compute percentages from counts and totals
                var percentages = [];
                for (i = 0; i < numBuckets; i++) {
                    percentages.push((totals[i] > 0) ? (Math.min(100, ((counts[i] / totals[i]) * 100))) : 0);
                }
                
                return percentages;
            }            
        },
        {
            Fields: Fields,
            Field: Field
        });
        
        return Model;
    }
);

// TODO: a lot of repeated code here and SplunkDBaseV2, consider making this a subclass of SplunkDBaseV2

define('models/services/search/Job',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/Base',
        'models/ACLReadOnly',
        'models/services/ACL',
        'models/services/search/jobs/Control',
        'models/services/search/jobs/Summary',
        'util/splunkd_utils',
        'splunk.util',
        'util/console'
    ],
    function($, _, Backbone, BaseModel, ACLReadOnlyModel, ACLModel, ControlModel, SummaryModel, splunkd_utils, splunkUtil, console) {

        //private sync CRUD methods
        var syncCreate = function(model, options){
            var rootOptions = options,
                rootModel = model,
                deferredResponse = $.Deferred(),
                createModel = new BaseModel(),
                fetchModel = new BaseModel(),
                //TODO: we have some defaults but in reality people should be responsible for passing these
                //in options.data like they are responsible for app and owner
                //Simon asks: does the endpoint set any of these defaults for us????
                createDefaults = {
                    data: {
                        rf: "*",
                        auto_cancel: 100,
                        status_buckets: 300,
                        output_mode: 'json'
                    }
                },
                app_and_owner = {},
                customAttrs = this.getCustomDataPayload();
           
            options = options || {};
            options.data = options.data || {};
            app_and_owner = $.extend(app_and_owner, { //JQuery purges undefined
                app: options.data.app || undefined,
                owner: options.data.owner || undefined,
                sharing: options.data.sharing || undefined
            });
            
            var url = splunkd_utils.fullpath(model.url, app_and_owner);
            
            //append the values from the entry.content.custom model
            $.extend(true, createDefaults.data, customAttrs || {});
            $.extend(true, createDefaults.data, options.data);
            delete createDefaults.data.app;
            delete createDefaults.data.owner;
            delete createDefaults.data.sharing;
            
            //add the leading search command if it isn't present
            if (createDefaults.data.search) {
                createDefaults.data.search = splunkUtil.addLeadingSearchCommand(createDefaults.data.search, true);
            }
            
            //reset options.data to only the app and owner
            options.data = $.extend(true, {}, app_and_owner);
            
            //TODO: Maybe we should be faithful to SplunkD here and make it the consumer's responsibility to fetch after create
            //this would mean that parse would need to handle the sid only payload and the full object payload
            createModel.save({}, {
                url: url,
                processData: true,
                data: createDefaults.data,
                success: function(createModel, response, options) {
                    // need an id so that in case of an empty response we don't blow up
                    rootModel.set('id', createModel.get('sid'));
                    fetchModel.fetch({
                        url: url + "/" + createModel.get("sid"),
                        data: {
                            output_mode: "json"
                        },
                        success: function(fetchModel, response, options) {
                            rootOptions.success.call(null, rootModel, response, rootOptions);
                            rootModel.trigger('sync', rootModel, response, rootOptions);
                            deferredResponse.resolve.apply(deferredResponse, arguments);
                        },
                        error: function(fetchModel, response, options) {
                            if(rootOptions.error) {
                                rootOptions.error.call(null, rootModel, response, rootOptions);
                            }
                            rootModel.trigger('error', rootModel, response, rootOptions);
                            deferredResponse.reject.apply(deferredResponse, arguments);
                        }
                    });
                },
                error: function(createModel, response, options) {
                    if(rootOptions.error) {
                        rootOptions.error.call(null, rootModel, response, rootOptions);
                    }
                    rootModel.trigger('error', rootModel, response, rootOptions);
                    deferredResponse.reject.apply(deferredResponse, arguments);
                }
            });
            return deferredResponse.promise();
        },
        syncRead = function(model, options){
            var defaults = {
                    data: {
                        output_mode: 'json'
                    }
                },
                app_and_owner = {};

            if (model.isNew()){
                throw new Error('You cannot read a job without an id.');
            }
            
            if (options && options.data){
                app_and_owner = $.extend(app_and_owner, { //JQuery purges undefined
                    app: options.data.app || undefined,
                    owner: options.data.owner || undefined,
                    sharing: options.data.sharing || undefined
                });
            }

            defaults.url = splunkd_utils.fullpath(model.url + "/" + model.id, app_and_owner);
            $.extend(true, defaults, options || {});
            
            delete defaults.data.app;
            delete defaults.data.owner;
            delete defaults.data.sharing;
            
            return Backbone.sync.call(this, "read", model, defaults);
        },
        syncUpdate = function(model, options){
            var defaults = {data: {output_mode: 'json'}},
                app_and_owner = {},
                customAttrs = this.getCustomDataPayload();
            
            if (options && options.data){
                app_and_owner = $.extend(app_and_owner, { //JQuery purges undefined
                    app: options.data.app || undefined,
                    owner: options.data.owner || undefined,
                    sharing: options.data.sharing || undefined
                });
            }
            
            //append the values from the entry.content.custom model
            $.extend(true, defaults.data, customAttrs || {});

            defaults.url = splunkd_utils.fullpath(model.url + "/" + model.id, app_and_owner);
            defaults.processData = true;
            defaults.type = 'POST';
            
            $.extend(true, defaults, options || {});
            
            delete defaults.data.app;
            delete defaults.data.owner;
            delete defaults.data.sharing;
            
            return Backbone.sync.call(this, "update", model, defaults);
        },
        syncDelete = function(model, options){
            var defaults = {data: {output_mode: 'json'}},
                url = model.url + "/" + model.id;

            if(options.data && options.data.output_mode){
                //add layering of url if specified by user
                defaults.url = splunkd_utils.fullpath(url, {}) + '?output_mode=' + encodeURIComponent(options.data.output_mode);
                delete options.data.output_mode;
            } else {
                //add layering of url if specified by user
                defaults.url = splunkd_utils.fullpath(url, {}) + '?output_mode=' + encodeURIComponent(defaults.data.output_mode);
                delete defaults.data.output_mode;
            }
            $.extend(true, defaults, options);
            defaults.processData = true;

            return Backbone.sync.call(this, "delete", model, defaults);
        };
        
        var Model = BaseModel.extend({
            url: "search/jobs",
            initialize: function(attributes, options) {
                BaseModel.prototype.initialize.apply(this, arguments);
                
                this.initializeAssociated();
                
                this.entry.links.on("change:control", function() {
                    this.control.set('id', this.entry.links.get('control'));
                }, this);

                this.entry.links.on("change:summary", function() {
                    this.summary.set('id', this.entry.links.get('summary'));
                }, this);

                this.entry.links.on("change:alternate", function() {
                    var alt = this.entry.links.get('alternate');
                    if (alt) {
                        alt = alt + "/acl";
                    }
                    this.acl.set('id', alt);
                }, this);

                if (options && options.splunkDPayload){
                    this.setFromSplunkD(options.splunkDPayload, {silent: true});
                }
            },
            parseSplunkDMessages: function(response) {
                var messages = BaseModel.prototype.parseSplunkDMessages.call(this, response);
                if(response && response.entry && response.entry.length > 0) {
                    var entry = response.entry[0],
                        content = entry.content || {};

                    messages = _.union(
                        messages,
                        splunkd_utils.parseMessagesObject(entry.messages),
                        splunkd_utils.parseMessagesObject(content.messages)
                    );
                    // handle zombie jobs, which often show up without any associated messages
                    if(content.isZombie) {
                        messages.push(splunkd_utils.createMessageObject(splunkd_utils.FATAL, 'Job terminated unexpectedly'));
                    }
                }
                return messages;
            },
            initializeAssociated: function() {
                // do a dynamic lookup of the current constructor so that this method is inheritance-friendly
                var RootClass = this.constructor;
                this.associated = this.associated || {};

                //instance level models
                this.links = this.links || new RootClass.Links();
                this.associated.links = this.links;
                
                this.generator = this.generator || new RootClass.Generator();
                this.associated.generator = this.generator;
                
                this.paging = this.paging || new RootClass.Paging();
                this.associated.paging = this.paging;

                //nested instance level on entry
                if (!this.entry){
                    this.entry = new RootClass.Entry();

                    this.entry.links = new RootClass.Entry.Links();
                    this.entry.associated.links = this.entry.links;

                    this.entry.acl = new RootClass.Entry.ACL();
                    this.entry.associated.acl = this.entry.acl;

                    //nested on content
                    this.entry.content = new RootClass.Entry.Content();

                    this.entry.content.performance = new RootClass.Entry.Content.Performance();
                    this.entry.content.associated.performance = this.entry.content.performance;

                    this.entry.content.request = new RootClass.Entry.Content.Request();
                    this.entry.content.associated.request = this.entry.content.request;
                    
                    this.entry.content.runtime = new RootClass.Entry.Content.Runtime();
                    this.entry.content.associated.runtime = this.entry.content.runtime;
                    
                    this.entry.content.custom = new RootClass.Entry.Content.Custom();
                    this.entry.content.associated.custom = this.entry.content.custom;
                    
                    this.entry.associated.content = this.entry.content;
                }
                this.associated.entry = this.entry;
                
                //associated EAI endpoint models
                this.control = this.control || new ControlModel();
                this.associated.control = this.control;
                
                this.summary = this.summary || new SummaryModel();
                this.associated.summary = this.summary;
                
                this.acl = this.acl || new ACLModel();
                this.associated.acl = this.acl;
            },
            sync: function(method, model, options) {
                switch(method){
                    case 'create':
                        return syncCreate.call(this, model, options);
                    case 'read':
                        return syncRead.call(this, model, options);
                    case 'update':
                        return syncUpdate.call(this, model, options);
                    case 'delete':
                        return syncDelete.call(this, model, options);
                    default:
                        throw new Error('invalid method: ' + method);
                }
            },
            parse: function(response) {
                // make a defensive copy of response since we are going to modify it
                response = $.extend(true, {}, response);
                //when called from the collection fetch we will need to ensure that our
                //associated models are initialized because parse is called before
                //initialize
                this.initializeAssociated();
                
                if (!response || !response.entry || response.entry.length === 0) {
                    console.log('Response has no content to parse');
                    return;
                }
                var response_entry = response.entry[0];

                //id
                //this needs to be the first thing so that people can get !isNew()
                this.id = response_entry.content.sid;
                response.id = response_entry.content.sid;

                //top-level
                this.links.set(response.links);
                delete response.links;
                this.generator.set(response.generator);
                delete response.generator;
                this.paging.set(response.paging);
                delete response.paging;
                
                //sub-entry
                this.entry.links.set(response_entry.links);
                delete response_entry.links;
                
                this.entry.acl.set(response_entry.acl);
                delete response_entry.acl;
                
                //sub-content
                this.entry.content.performance.set(response_entry.content.performance);
                delete response_entry.content.performance;
                
                this.entry.content.request.set(response_entry.content.request);
                delete response_entry.content.request;
                
                this.entry.content.runtime.set(response_entry.content.runtime);
                delete response_entry.content.runtime;
                
                this.entry.content.custom.set(response_entry.content.custom);
                delete response_entry.content.custom;
                
                //content remainder
                this.entry.content.set(response_entry.content);
                delete response_entry.content;
                
                //entry remainder
                this.entry.set(response_entry);
                delete response.entry;
                return response;
            },
            setFromSplunkD: function(payload, options) {
                this.attributes = {};
                var cloned_payload = $.extend(true, {}, payload);
                var oldId = this.id;

                //object assignment
                if (cloned_payload) {
                    if (cloned_payload.entry && cloned_payload.entry[0]) {
                        var payload_entry = cloned_payload.entry[0];

                        if(payload_entry.content){
                            //id
                            //this needs to be the first thing so that people can get !isNew()
                            this.set({id: payload_entry.content.sid}, {silent: true});
                            cloned_payload.id = payload_entry.content.sid;

                            if (payload_entry.content.performance) {
                                this.entry.content.performance.set(payload_entry.content.performance, options);
                                delete payload_entry.content.performance;
                            }

                            if (payload_entry.content.request) {
                                this.entry.content.request.set(payload_entry.content.request, options);
                                delete payload_entry.content.request;
                            }
                            
                            if (payload_entry.content.runtime) {
                                this.entry.content.runtime.set(payload_entry.content.runtime, options);
                                delete payload_entry.content.runtime;
                            }
                            
                            if (payload_entry.content.custom) {
                                this.entry.content.custom.set(payload_entry.content.custom, options);
                                delete payload_entry.content.custom;
                            }

                            this.entry.content.set(payload_entry.content, options);
                            delete payload_entry.content;
                        }

                        if(payload_entry.links){
                            this.entry.links.set(payload_entry.links, options);
                            if (payload_entry.links.control) {
                                this.control.set('id', payload_entry.links.control, options);
                            }
                            if (payload_entry.links.summary) {
                                this.summary.set('id', payload_entry.links.summary, options);
                            }
                            if (payload_entry.links.alternate) {
                                this.acl.set('id', payload_entry.links.alternate + "/acl", options);
                            }
                            delete payload_entry.links;
                        }

                        if(payload_entry.acl){
                            this.entry.acl.set(payload_entry.acl, options);
                            delete payload_entry.acl;
                        }
                        
                        this.entry.set(payload_entry, options);
                        delete cloned_payload.entry;
                    }
                    if(cloned_payload.links) {
                        this.links.set(cloned_payload.links, options);
                        delete cloned_payload.links;
                    }
                    if(cloned_payload.generator) {
                        this.generator.set(cloned_payload.generator, options);
                        delete cloned_payload.generator;
                    }
                    if(cloned_payload.paging) {
                        this.paging.set(cloned_payload.paging, options);
                        delete cloned_payload.paging;
                    }
                    
                    //reset the internal root model due to pre-init routine
                    this.set(cloned_payload, options);
                    if(this.id !== oldId) {
                        this.trigger('change:' + this.idAttribute);
                    }
                }
            },
            toSplunkD: function() {
                var payload = {};

                payload = $.extend(true, {}, this.toJSON());

                payload.links = $.extend(true, {}, this.links.toJSON());
                payload.generator = $.extend(true, {}, this.generator.toJSON());
                payload.paging = $.extend(true, {}, this.paging.toJSON());
                payload.entry = [$.extend(true, {}, this.entry.toJSON())];

                payload.entry[0].links = $.extend(true, {}, this.entry.links.toJSON());
                payload.entry[0].acl = $.extend(true, {}, this.entry.acl.toJSON());
                payload.entry[0].content = $.extend(true, {}, this.entry.content.toJSON());

                payload.entry[0].content.performance = $.extend(true, {}, this.entry.content.performance.toJSON());
                payload.entry[0].content.request = $.extend(true, {}, this.entry.content.request.toJSON());
                payload.entry[0].content.runtime = $.extend(true, {}, this.entry.content.runtime.toJSON());
                payload.entry[0].content.custom = $.extend(true, {}, this.entry.content.custom.toJSON());

                //cleanup
                delete payload.id;

                return payload;
            },
            getCustomDataPayload: function() {
                var payload = $.extend(true, {}, this.entry.content.custom.toJSON()),
                    keys = _.keys(payload);
                
                _.each(keys, function(key){
                    var newKey = "custom." + key;
                    payload[newKey] = payload[key];
                    delete payload[key];
                });
                
                return payload;
            },
            canSummarize: function() {
                return splunkUtil.normalizeBoolean(this.entry.content.get('canSummarize'));
            }
        },
        {
            // constants for the dispatch states
            QUEUED: 'QUEUED',
            PARSING: 'PARSING',
            RUNNING: 'RUNNING',
            PAUSED: 'PAUSED',
            FINALIZING: 'FINALIZING',
            FAILED: 'FAILED',
            DONE: 'DONE',

            Links: BaseModel,
            Generator: BaseModel,
            Paging: BaseModel,
            Entry: BaseModel.extend(
                {
                    initialize: function() {
                        BaseModel.prototype.initialize.apply(this, arguments);
                    }
                },
                {
                    Links: BaseModel,
                    ACL: ACLReadOnlyModel,
                    Content: BaseModel.extend(
                        {
                            initialize: function() {
                                BaseModel.prototype.initialize.apply(this, arguments);
                            }
                        }, 
                        {
                            Performance: BaseModel,
                            Request: BaseModel,
                            Runtime: BaseModel,
                            Custom: BaseModel
                        }
	                )
                }
            )
        });

        return Model;
    }
);

define('util/Ticker',['underscore', 'backbone'], function(_, Backbone) {
    var Ticker = function(delay) {
        this.delay = delay || 1000;
    };
    _.extend(Ticker.prototype, Backbone.Events, {
        start: function(force) {
            if (this._intervalId) {
                return;
            }
            if (force) {
                this.force();
            }
            this._intervalId = setInterval(
                function() {
                    this.trigger('tick', (new Date).getTime());
                }.bind(this),
                this.delay
            );
        },
        stop: function() {
            if (this._intervalId) {
                clearInterval(this._intervalId);
                delete this._intervalId;
            }
        },
        reset: function(options) {
            options || (options = {});
            this.stop();
            if (options.delay) {
                this.delay = options.delay;
            }
            this.start(options.force);
        },
        force: function() {
            this.trigger('tick', (new Date).getTime());
            if (this._intervalId) {
                this.reset();
            }
        }
    });
    return Ticker;
});
define('models/Job',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/services/search/Job',
        'helpers/polling_manager',
        'util/splunkd_utils',
        'util/time_utils',
        'util/console',
        'splunk.util',
        'util/Ticker'
    ],
    function($, _, Backbone, SearchJob, polling_manager, splunkd_utils, time_utils, console, splunkUtil, Ticker) {
        
        // -------------- private helpers --------------- //
        
        var DEFAULT_POLLING_INTERVAL = 1000,
            KEEP_ALIVE_INTERVAL = 60000,
            DEFAULT_POLLING_OPTIONS = {
                delay: DEFAULT_POLLING_INTERVAL,
                condition: function(model) {
                    return ((model.entry.content.get('isDone') !== true) && (model.entry.content.get('isFailed') !== true));
                }
            };
        
        // a helper object to encapsulate the behavior of a job-associated observable model or collection
        var ManagedChildObject = function(observable, fetchParams, parent) {
            this.observable = observable;
            this.fetchParams = fetchParams || {};
            var oldFetch = observable.fetch;

            observable.fetch = function(options) {
                options = options || {};
                options.sid = parent.id;
                return oldFetch.call(observable, options);
            };
            this.xhr = null;
        };
        
        ManagedChildObject.prototype = {
                
            fetch: function(baseParams) {
                this.abortXhr();
                var customParams = _(this.fetchParams).isFunction() ? this.fetchParams() : this.fetchParams;
                this.xhr = this.observable.fetch($.extend(true, {}, customParams, baseParams));
            },

            destroy: function() {
                this.abortXhr();
                if(this.observable instanceof Backbone.Model) {
                    this.observable.clear();
                }
                else if(this.observable instanceof Backbone.Collection) {
                    this.observable.reset();
                }
                this.observable.trigger('destroy');
            },

            getObservable: function() {
                return this.observable;
            },

            abortXhr: function() {
                if(this.xhr && _(this.xhr.abort).isFunction()) {
                    this.xhr.abort();
                }
                this.xhr = null;
            }

        };
        
        var JobModel = SearchJob.extend({
            initialize: function(attributes, options) {
                SearchJob.prototype.initialize.apply(this, arguments);
                options = options || {};
                
                this.enableSimplePoller = options.enableSimplePoller || false;
                
                //poller setup
                this.pollingOptions = $.extend(true, {}, DEFAULT_POLLING_OPTIONS, options);
                
                this.prepared = (this.entry.content.get('dispatchState') && !this.isPreparing());
                this.processKeepAlive = options.processKeepAlive || false;
                this.keepAlivePoller = null;
                this.keepAliveInterval = options.keepAliveInterval || KEEP_ALIVE_INTERVAL;

                this.entry.content.on('change', function() {
                    var changedAttributes = this.entry.content.changedAttributes(),
                        previousAttributes = this.entry.content.previousAttributes();

                    this.handleJobProgress(changedAttributes, previousAttributes);
                }, this);
                
                this.entry.content.on("change:dispatchState", function() {
                    if (this.entry.content.get('dispatchState') && !this.isPreparing() && !this.prepared) {
                        this.prepared = true;
                        this.trigger("prepared");
                    }
                }, this);

                //new simplistic polling with safeFetch and a ticker
                if (this.enableSimplePoller) {
                    //poll aggressively to begin with
                    this.ticker = new Ticker(parseInt(this.pollingOptions.delay/13, 10));
                    this.ticker.on('tick', function() {
                        this.safeFetch({
                            data: {
                                app: this.entry.acl.get('app'),
                                owner: this.entry.acl.get('owner'),
                                sharing: this.entry.acl.get('sharing')
                            }
                        });
                    }, this);
                    this.entry.content.on('change:dispatchState', function() {
                        //stop polling when the job is done
                        if (this.entry.content.get('isDone')) {
                            this.ticker.stop();
                          //easy now cowboy; lets poll less aggressively now that we have results
                        } else if (this.prepared) {
                            this.ticker.reset({
                                delay: this.pollingOptions.delay, 
                                force: true
                            });
                        }
                    }, this);
                //traditional complex and not intuitive 
                } else {
                    this.jobPoller = polling_manager.getPoller(this, this.pollingOptions);
                    this.childObjects = [];
                    this.preserveChildrenOnDestroy = options.preserveChildrenOnDestroy || false;
                    this.entry.acl.on('change', function() {
                        //update the job poller to be able to fetch from the correct location
                        $.extend(this.jobPoller.options, {
                            data: {
                                app: this.entry.acl.get("app"),
                                owner: this.entry.acl.get("owner"),
                                sharing: this.entry.acl.get("sharing")
                            }
                        });
                    }, this);
                }
                
                this.error.on("change", function(){
                    if (splunkd_utils.messagesContainsOneOfTypes(this.error.get("messages"), [splunkd_utils.NOT_FOUND])) {
                        this.handleJobDestroy();
                    }
                }, this);
                
                this.entry.content.on("change:isFailed", function(){
                    if (this.entry.content.get("isFailed") === true) {
                        this.handleJobDestroy();
                    }
                }, this);
                
                this.on('destroy', this.handleJobDestroy, this);
            },
            
            handleJobProgress: function(changed, previous) {
                if (this.isNew()) {
                    return false;
                }
                
                var jobIsRealTime = this.entry.content.get('isRealTimeSearch'),
                    jobIsReportSearch = this.entry.content.get('reportSearch'),
                    jobAdHocModeIsVerbose = (this.getAdhocSearchMode() === splunkd_utils.VERBOSE),
                    jobPreviewEnabled = this.entry.content.get('isPreviewEnabled'),
                    jobIsDoneInModel = this.entry.content.get('isDone'),
                    changeIsEmpty = _.isEmpty(changed);
                
                // if the job is not previewable and also not done, ignore the progress 
                if (
                    changeIsEmpty ||
                    (!jobIsDoneInModel && jobIsReportSearch && !jobPreviewEnabled && !jobAdHocModeIsVerbose)
                ) {
                    return false;
                }
                
                // examine changes to the job model and determine if the child objects should be updated
                var scanCountChanged = !_(changed.scanCount).isUndefined() && (changed.scanCount > previous.scanCount),
                    eventCountChanged = !_(changed.eventCount).isUndefined(),
                    resultCountChanged = !_(changed.resultCount).isUndefined(),
                    jobIsDone = !_(changed.isDone).isUndefined() && (changed.isDone === true),
                    jobIsUpdated = scanCountChanged || eventCountChanged || resultCountChanged || jobIsDone || jobIsRealTime;

                if (!jobIsUpdated) {
                    return false;
                }
                
                //we have determined that the job has been updated, so go and fetch the managed child object
                this.trigger("jobProgress");
                
                if (!this.enableSimplePoller) {
                    this.fetchManagedChildren();
                }
                
                if (jobIsDone && this.processKeepAlive) {
                    this.startKeepAlive();
                }
                
                return true;
            },
            
            handleJobDestroy: function() {
                if (!this.enableSimplePoller) {
                    if (!this.preserveChildrenOnDestroy) {
                        _(this.childObjects).each(function(observer) {
                            observer.destroy();
                        });
                    }
                }
                
                this.stopPolling();
                this.processKeepAlive = false;
                this.stopKeepAlive();
            },
            
            startKeepAlive: function() {
                this.keepAlivePoller = new Ticker(this.keepAliveInterval);
                this.keepAlivePoller.on('tick', function() {
                    this.control.save({}, {
                        data: {
                            action: 'touch' 
                        },
                        success: function(model, response, options) {
                            console.log('touched job:', model.id);
                        }.bind(this),
                        error: function(model, response, options) {
                            if (response.hasOwnProperty('status') && (response.status == 0 || response.status == 12029)) {
                                return;
                            }
                            console.log("error touching job (stopping keep alive):", model.id);
                            this.keepAlivePoller.stop();
                        }.bind(this)
                    });
                }, this);
                this.keepAlivePoller.start();
            },
            
            stopKeepAlive: function() {
                if (this.keepAlivePoller) {
                    this.keepAlivePoller.stop();
                }
            },
            
            startPolling: function() {
                if (this.enableSimplePoller) {
                    if (!this.entry.content.get('isDone') && !this.entry.content.get('isFailed')) {
                        this.ticker.start(true);
                    }
                } else {
                    this.jobPoller.start();
                }
            },
            
            stopPolling: function() {
                if (this.enableSimplePoller) {
                    this.ticker.stop();
                } else {
                    this.jobPoller.stop();
                }
            },
            
            noParamControlUpdate: function(action, options) {
                if(options && options.data) {
                    delete options.data;
                }
                return this.control.save({}, $.extend(true, options, { data: { action: action } }));                
            },

            pause: function(options) {
                return this.noParamControlUpdate("pause", options);
            },

            unpause: function(options) {
                return this.noParamControlUpdate("unpause", options);
            },

            finalize: function(options) {
                return this.noParamControlUpdate("finalize", options);
            },
            
            cancel: function(options) {
                return this.noParamControlUpdate("cancel", options);
            },
            
            touch: function(options) {
                return this.noParamControlUpdate("touch", options);
            },
            
            setTTL: function(ttl, options) {
                if(options && options.data) {
                    delete options.data;
                }
                return this.control.save({}, $.extend(true, options, { data: { action: 'setttl', ttl: ttl} }));
            },
            
            setPriority: function(priority, options) {
                if(options && options.data) {
                    delete options.data;
                }
                return this.control.save({}, $.extend(true, options, { data: { action: 'setpriority', priority: priority} } ));
            },
            
            enablePreview: function(options) {
                return this.noParamControlUpdate("enablepreview", options);
            },
            
            disablePreview: function(options) {
                return this.noParamControlUpdate("disablepreview", options);
            },
            
            saveControlUpdate: function(action, options) {
                options = options || {};
                options.data = options.data || {};
                
                var data = {
                    action: action,
                    auto_cancel: options.data.auto_cancel,
                    auto_pause: options.data.auto_pause,
                    email_list: options.data.email_list,
                    email_subject: options.data.email_subject,
                    email_results: options.data.email_results,
                    ttl: options.data.ttl
                }; 
                
                if(options && options.data) {
                    delete options.data;
                }
                
                return this.control.save({}, $.extend(true, options, {data: data}));               
            },
            
            saveJob: function(options) {                
                return this.saveControlUpdate("save", options);
            },
            
            unsaveJob: function(options) {
                return this.saveControlUpdate("unsave", options);
            },
            
            makeWorldReadable: function(options) {
                var owner = this.entry.acl.get("owner"),
                    data = {
                        sharing: splunkd_utils.GLOBAL,
                        owner: this.entry.acl.get("owner"),
                        'perms.read': "*"                
                    };
                
                if (options && options.data) {
                    delete options.data;
                }
                
                return this.acl.save({}, $.extend(true, options, { data: data }));                
            },
            
            undoWorldReadable: function(options) {
                var owner = this.entry.acl.get("owner"),
                    data = {
                        sharing: splunkd_utils.GLOBAL,
                        owner: owner,
                        'perms.read': ""              
                    };
                
                if (options && options.data) {
                    delete options.data;
                }
                
                return this.acl.save({}, $.extend(true, options, { data: data }));                
            },
            
            isSharedAccordingToTTL: function(defaultSaveTTL) {
                var perms = this.entry.acl.permsToObj();
                if ((perms.read.indexOf("*") != -1) && (this.entry.content.get("ttl") === defaultSaveTTL)) {
                    return true;
                }
                return false;
            },
            
            saveIsBackground: function(options) {
                this.entry.content.custom.set("isBackground", "1");
                return this.save({}, options);
            },
            
            isBackground: function() {
                return splunkUtil.normalizeBoolean(this.entry.content.custom.get("isBackground"));
            }, 
            
            /**
             * Register an external model or collection to be refreshed whenever the job has progress.
             *
             * @param observable {Model | Collection} the model or collection to register
             * @param fetchParams {Object | Function} at fetch time the object or the result of calling the function will be merged with the default fetch parameters
             */

            register: function(observable, fetchParams) {
                var childObject = new ManagedChildObject(observable, fetchParams, this);
                this.childObjects.push(childObject);
                if(this.entry.content.get('isDone') === true) {
                    childObject.fetch({ sid: this.id });
                }
            },
            
            /**
             * Explicitly triggers a fetch of a previously-registered model or collection
             *
             * @param observable {Model | Collection} to be looked up in the instance-level childObjects array
             */

            fetchManagedChild: function(observable) {
                var childObject = _(this.childObjects).find(function(object) { return object.getObservable() === observable; });
                if(!childObject) {
                    console.error('Search Job Manager: can only refresh an object that has already been registered', observable);
                    return false;
                }
                childObject.fetch({ sid: this.id });
            },
            
            fetchManagedChildren: function() {
                _(this.childObjects).each(function(observer) {
                    observer.fetch({ sid: this.id });
                }.bind(this));               
            },
            
            resultCountSafe: function() {
                return (this.entry.content.get('isPreviewEnabled') && !this.entry.content.get('isDone')) ? this.entry.content.get('resultPreviewCount') : this.entry.content.get('resultCount');
            },
            
            eventAvailableCountSafe: function() {
                return (this.entry.content.get('statusBuckets') == 0) ? this.resultCountSafe() : this.entry.content.get('eventAvailableCount');
            },


            // a job can be dispatched without a latest time, in which case return the published time
            latestTimeSafe: function() {
                var entry = this.entry;
                return entry.content.get('latestTime') || entry.get('published');
            },
            
            isQueued: function() {
                return this.checkUppercaseValue('dispatchState', JobModel.QUEUED);
            },
            
            isParsing: function() {
                return this.checkUppercaseValue('dispatchState', JobModel.PARSING);
            },
            
            isFinalizing: function() {
                return this.checkUppercaseValue('dispatchState', JobModel.FINALIZING);
            },
            
            isPreparing: function() {
                return this.isQueued() || this.isParsing();
            },
            
            isRunning: function() {
                return !this.isNew() && !this.entry.content.get('isPaused') && !this.entry.content.get('isDone') && !this.isPreparing() && !this.isFinalizing();
            },
            
            isReportSearch: function() {
                return (this.entry.content.get('reportSearch') ? true : false);
            },

            // returns true if the job was dispatched over all time, returns false for all-time real-time
            isOverAllTime: function() {
                var request = this.entry.content.request;
                return (!this.getDispatchEarliestTime() && !this.getDispatchLatestTime());
            },

            isRealtime: function() {
                var request = this.entry.content.request;
                return (
                    time_utils.isRealtime(this.getDispatchEarliestTime()) &&
                    time_utils.isRealtime(this.getDispatchLatestTime())
                );
            },
            
            checkUppercaseValue: function(key, uc_value) {
                var value = this.entry.content.get(key);
                if (!value) {
                    return false;
                }
                return (value.toUpperCase() === uc_value);
            },
            
            getDispatchEarliestTime: function() {
                var earliest = this.entry.content.request.get('earliest_time');
                if (earliest === void(0)) {
                    return this.entry.content.get('searchEarliestTime');
                }
                return earliest;
            },
            
            getDispatchLatestTime: function() {
                var latest = this.entry.content.request.get('latest_time');
                if (latest === void(0)) {
                    return this.entry.content.get('searchLatestTime');
                }
                return latest;
            },
            
            getSearch: function() {
                var search = this.entry.get('name');
                if (!search) {
                    return this.entry.content.request.get('search');
                }
                return search;
            },
            
            getAdhocSearchMode: function() {
                var mode = this.entry.content.request.get('adhoc_search_level'),
                    delegate;
                if (!mode) {
                    delegate = this.entry.content.get('delegate');
                    if (this.entry.content.get('isSavedSearch') && delegate === 'scheduler') {
                        return splunkd_utils.FAST;
                    }
                }
                return mode;
            }
            
        },
        {
            createMetaDataSearch: function(search, deferred, applicationModel) {                
                var job = new JobModel({}, {delay: 4000, enableSimplePoller: true});
                    
                job.save({}, {
                    data: {
                        app: applicationModel.get("app"),
                        owner: applicationModel.get("owner"),
                        search: search,
                        preview: "true",
                        earliest_time: "rt",
                        latest_time: "rt",
                        auto_cancel: 100,
                        max_count: 100000
                    },
                    success: function(model, response) {
                        deferred.resolve();
                    },
                    error: function(model, response) {
                        deferred.resolve();
                    }
                });
                
                return job;
            }
        });
        
        return JobModel;
    }
);

define('util/pdf_utils',['underscore', 'jquery', 'splunk.util', 'util/console', 'models/AlertAction', 'models/Job', 'splunk.config'], function(_, $, splunkUtil, console, AlertAction, Job, splunkConfig) {

    var TYPE_PDFGEN = 'pdfgen', TYPE_DEPRECATED = 'deprecated';

    /**
     * Check the availibility of the PDF Generator
     * @return a jQuery Deferred object that is resolved if a PDF Server is available or rejected if not.
     *       The deferred callbacks receive 2 arguments:
     *          - a boolean indicating the availability
     *          - the type (string) of the PDF server if available ("pdfgen" or "deprecated")
     */
    var isPdfServiceAvailable = _.once(function(force) {
        var dfd = $.Deferred();
        $.get(splunkUtil.make_full_url('splunkd/__raw/services/pdfgen/is_available')).success(function(data) {
            if(force !== undefined) {
                data = force;
            }
            if(data === TYPE_PDFGEN) {
                dfd.resolve(true, data);
            } else if(data === 'deprecated') {
                $.getJSON(splunkUtil.make_url('report/is_enabled')).success(function(data) {
                    if(data && data.status == 'enabled') {
                        dfd.resolve(true, TYPE_DEPRECATED);
                    } else {
                        dfd.reject(false, data && data.status);
                    }
                }).error(function() {
                            dfd.reject(false);
                        });
            } else {
                dfd.reject(false);
            }
        }).error(function() {
                    dfd.reject(false);
                });
        return dfd.promise();
    });

    /**
     * Get the email alert settings (models.AlertAction)
     * @returns a jQuery Deferred object that is resolved when the settings are loaded
     */
    var getEmailAlertSettings = _.once(function() {
        var dfd = $.Deferred();
        var emailAlertSettings = new AlertAction({ id: 'email' });

        emailAlertSettings.fetch().done(function() {
            dfd.resolve(emailAlertSettings);
        }).fail(function() {
                    dfd.reject();
                });

        return dfd.promise();
    });

    /**
     * Starts a search to send test email with the PDF version of a view via Email (using the sendemail command)
     * @param view (String) name of the dashboard
     * @param app (String) app of the dashboard
     * @param to (String) comma-separated list of recipients
     * @param options { paperSize: (String), paperOrientation: (String) }
     * @returns A jQuery Deferred object that is resolved once the search has successfully completed
     */
    function sendPDFEmail(view, app, to, options) {
        var dfd = $.Deferred();

        getEmailAlertSettings().done(function(emailSettings) {

            to = to.split(/[,\s]+/).join(',');

            var commandParams = {
                'server': emailSettings.getSetting('mailserver', 'localhost'),
                'use_ssl': emailSettings.getSetting('use_ssl', 'false'),
                'use_tls': emailSettings.getSetting('use_tls', 'false'),
                'to': to,
                'sendpdf': 'True',
                'from': emailSettings.getSetting('from', 'splunk@localhost'),
                'papersize': options.paperSize || 'a2',
                'paperorientation': options.paperOrientation || 'portrait',
                'pdfview': view
            };
            var searchString = '| sendemail ' + _(commandParams).map(function(v, k) {
                return [k, JSON.stringify(v)].join('=');
            }).join(' ');

            console.log('Starting search %o', searchString);

            var job = new Job();
            job.save({}, {
                data: {
                    search: searchString,
                    earliest_time: '0',
                    latest_time: 'now',
                    app: app,
                    namespace: app,
                    owner: splunkConfig.USERNAME,
                    ui_dispatch_app: app,
                    ui_dispatch_view: view,
                    preview: false
                }
            }).done(_.bind(function() {
                        job.startPolling();
                        job.entry.content.on('change:isDone', function(m, isDone) {
                            if(isDone) {
                                var messages = job.entry.content.get('messages');

                                _(messages).each(function(msg) {
                                    if(msg.type === 'ERROR') {
                                        console.error(msg.text);
                                    }
                                });

                                if(_(messages).any(function(msg) { return msg.type === 'ERROR'; })) {
                                    dfd.reject(_(messages).pluck('text')[0]);
                                } else {
                                    dfd.resolve();
                                }

                                _.defer(_.bind(job.destroy, job));
                            }
                        });
                        job.entry.content.on('change:isFailed', function(m, isFailed) {
                            if(isFailed) {
                                dfd.reject();
                            }
                            _.defer(_.bind(job.destroy, job));
                        });
                        job.on('error', function() {
                            dfd.reject('Error creating search job');
                            _.defer(_.bind(job.destroy, job));
                        });

                    }, this)).fail(_.bind(function() {
                        console.log('Search creation fail', arguments);
                    }, this));

        }).fail(function() {
                    dfd.reject();
                });

        return dfd.promise();
    }

    /** Workaround for SPL-67453 - double-encode certain XML characters */
    function encodeXMLForCustomEndpoint(xml) {
        return xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var downloadReportFromXML = function(xml, app, params) {
        var baseURL = splunkUtil.make_full_url("splunkd/__raw/services/pdfgen/render");
        var form = $('<form method="POST" target="_blank"></form>').attr('action', baseURL);
        $('<input/>').attr({ type: 'hidden', name: 'input-dashboard-xml', value: encodeXMLForCustomEndpoint(xml) }).appendTo(form);
        $('<input/>').attr({ type: 'hidden', name: 'namespace', value: app }).appendTo(form);
        $('<input/>').attr({ type: 'hidden', name: 'splunk_form_key', value: splunkConfig['FORM_KEY'] }).appendTo(form);
        if(params) {
            _.each(params, function(v, k) {
                $('<input/>').attr({ type: 'hidden', name: k, value: v }).appendTo(form);
            });
        }
        console.log('submitting form', form[0]);
        form.appendTo(document.body).submit();
        _.defer(function() {
            form.remove();
        });
    };

    /**
     * Generates the download URL for the PDF version of a dashboard|report
     * @param view the name of the dashboard|report
     * @param app the app the dashboard|report is defined in
     * @param params a object containing additional parameters for pdfgen (ignored for deprecated pdf server)
     * @param viewType dashboard|report. the type of the view defaults to dashboard
     * @returns a jQuery Deferred object that is resolved if the PDF Server is available. The first callback argument is
     * the download URL
     */
    var getRenderURL = function(view, app, params, viewType) {
        var dfd = $.Deferred();

        isPdfServiceAvailable().done(function(bool, type) {
            var inputType = viewType ? 'input-' + viewType : 'input-dashboard',
                    data = {
                        'namespace': app
                    };
            data[inputType] = view;

            if(type === TYPE_PDFGEN) {
                params = _.extend(
                        data,
                        params || {});
                dfd.resolve(splunkUtil.make_full_url("splunkd/__raw/services/pdfgen/render", params));
            } else if(type === TYPE_DEPRECATED) {
                dfd.resolve([splunkUtil.make_url('app', app, view), splunkUtil.propToQueryString({ output: 'pdf' })].join('?'));
            } else {
                dfd.reject();
            }
        }).fail(function() {
                    dfd.reject();
                });
        return dfd.promise();
    };

    return {
        isPdfServiceAvailable: isPdfServiceAvailable,
        getRenderURL: getRenderURL,
        downloadReportFromXML: downloadReportFromXML,
        getEmailAlertSettings: getEmailAlertSettings,
        sendTestEmail: sendPDFEmail
    };
});
define('views/shared/jobstatus/buttons/ExportResultsDialog',[
    'underscore',
    'models/Base',
    'module',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'views/shared/FlashMessages',
    'uri/route',
    'util/pdf_utils',
    'util/math_utils'
    ],
    function(
        _,
        Base,
        module,
        Modal,
        ControlGroup,
        FlashMessagesV2,
        route,
        pdfUtils,
        mathUtils
    ) {
    return Modal.extend({
        moduleId: module.id,
         /**
         * @param {Object} options {
         *      model: {
         *          searchJob: <helpers.ModelProxy>,
         *          application: <models.Application>,
         *          report: <models.Report> (Only required for export to pdf. If passed in pdf will be a format option.)
         *      }
         * }
         */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);
            var Inmem = Base.extend({
                defaults: {
                    fileName: '',
                    format: 'csv',
                    limitResults: 'unlimited',
                    maxResults: 1000
                },
                validation: {
                    maxResults: {
                        fn: 'validateMaxResults'
                    }
                },
                validateMaxResults: function(value, attr, computedState){
                    if ((computedState.format === 'pdf' || computedState.limitResults === 'limit') &&
                        (!mathUtils.isInteger(value) || parseFloat(value) <= 0 )) {
                            return _('Max results must be an integer greater than 0').t();
                    }
                }
            });

            this.model = {
                searchJob: this.model.searchJob,
                application: this.model.application,
                report:this.model.report,
                inmem: new Inmem()
            };

            this.children.flashMessage = new FlashMessagesV2({ model: this.model.inmem });

            this.deferredPdfAvailable = $.Deferred();
            this.deferredInitializeFormat = $.Deferred();

            if (this.model.report) {
                this.deferredPdfAvailable = pdfUtils.isPdfServiceAvailable();
            } else {
                this.deferredPdfAvailable.resolve(false);
            }

            $.when(this.deferredPdfAvailable).then(function(available) {
                var items = [
                    {
                        label: _('CSV').t(),
                        value: 'csv'
                    },
                    {
                        label: _('XML').t(),
                        value: 'xml'
                    },
                    {
                        label: _('JSON').t(),
                        value: 'json'
                    }
                ];

                if(this.model.report && available) {
                    items.unshift({
                        label: _('PDF').t(),
                        value: 'pdf'
                    });
                }

                if(!this.model.searchJob.isReportSearch()) {
                    items.unshift({
                        label: _('Raw Events').t(),
                        value: 'raw'
                    });
                }

                this.children.formatControl = new ControlGroup({
                    controlType: 'SyntheticSelect',
                    controlOptions: {
                        modelAttribute: 'format',
                        model: this.model.inmem,
                        items: items,
                        save: false,
                        toggleClassName: 'btn',
                        labelPosition: 'outside',
                        elastic: true
                    },
                    label: _('Format').t()
                });

                this.deferredInitializeFormat.resolve();
            }.bind(this));

            this.children.filenameControl = new ControlGroup({
                controlType: 'Text',
                controlOptions: {
                    modelAttribute: 'fileName',
                    model: this.model.inmem
                },
                label: _('File Name').t()
            });

            this.children.limitResultsControl = new ControlGroup({
                controlType: 'SyntheticRadio',
                controlOptions: {
                    modelAttribute: 'limitResults',
                    model: this.model.inmem,
                    items: [
                        {
                            label: _('Unlimited').t(),
                            value: 'unlimited'
                        },
                        {
                            label: _('Limited').t(),
                            value: 'limit'
                        }
                    ],
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    elastic: true
                },
                label: _('Number of Results').t()
            });

            this.children.maxResultsControl = new ControlGroup({
                controlType: 'Text',
                controlOptions: {
                    modelAttribute: 'maxResults',
                    model: this.model.inmem
                },
                label: _('Max Results').t()
            });

            this.model.inmem.on('change:limitResults', this.toggleMaxResults, this);

            this.model.inmem.on('change:format', this.toggleByFormat, this);

            this.model.inmem.on('validated', function(isValid, model, invalidResults){
                if(isValid) {
                    var format = this.model.inmem.get('format'),
                        maxResults = this.model.inmem.get('maxResults'),
                        count = (this.model.inmem.get('limitResults') === 'limit') ? maxResults : 0;
                    if (format === 'pdf') {
                        var orientationSuffix = '',
                            orientation = this.model.report.entry.content.get('action.email.reportPaperOrientation'),
                            pageSize = this.model.report.entry.content.get('action.email.reportPaperSize') || 'a2';
                        if(orientation === 'landscape') {
                            orientationSuffix = '-landscape';
                        }
                        pdfUtils.getRenderURL(
                            this.model.report.entry.get('name'),
                            this.model.report.entry.acl.get('app'),
                            {
                                'sid': this.model.searchJob.id,
                                'paper-size': pageSize + orientationSuffix,
                                'max-rows-per-table': maxResults
                            },
                            'report'
                        ).done(function(url){
                            this.hide();
                            window.open(url);
                        }.bind(this));
                    } else {
                        window.location.href = route.exportUrl(this.model.application.get("root"), this.model.application.get("locale"), this.model.searchJob.get('id'),
                            this.model.inmem.get('fileName'), this.model.inmem.get('format'), this.model.inmem.get('limitResults'),
                            maxResults, count, !!this.model.searchJob.entry.content.get('reportSearch'));
                        this.hide();
                    }
                }
            },this);
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
                this.model.inmem.validate();
                e.preventDefault();
            }
        }),
        toggleByFormat: function() {
            if(this.model.inmem.get('format') === 'pdf') {
                this.children.filenameControl.$el.hide();
                this.children.limitResultsControl.$el.hide();
                this.children.maxResultsControl.$el.show();
            } else {
                this.children.filenameControl.$el.show();
                this.children.limitResultsControl.$el.show();
                this.toggleMaxResults();
            }
        },
        toggleMaxResults: function() {
            if(this.model.inmem.get('limitResults') === 'unlimited') {
                this.children.maxResultsControl.$el.hide();
            } else {
                this.children.maxResultsControl.$el.show();
            }
        },
        render : function() {
            $.when(this.deferredInitializeFormat).then(function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Export Results").t());

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL_JUSTIFIED);

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.formatControl.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.filenameControl.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.limitResultsControl.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.maxResultsControl.render().el);

                this.toggleByFormat();
                this.toggleMaxResults();

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _("Export").t() + '</a>');

                return this;
            }.bind(this));
        }
    });
});

define('views/shared/jobstatus/buttons/ExportButton',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/jobstatus/buttons/ExportResultsDialog',
        'bootstrap.tooltip'
    ],
    function(_, module, Base, ExportDialog) {
        return Base.extend({
            moduleId: module.id,
            className: 'export btn btn-small btn-square',
            tagName: 'a',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.$el.html('<i class="icon-export"></i><span class="hide-text">' + _("Export").t() + '</span>');
                this.$el.tooltip({animation:false, title:_('Export').t(), container: 'body'});
            },
            events: {
                'click': function(e) {
                    this.children.exportDialog = new ExportDialog({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application,
                            report:this.model.report
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.exportDialog.render().el);
                    this.children.exportDialog.show();

                    e.preventDefault();
                }
            },
            render: function() {
                return this;
            }
        });
    }
);

define('views/shared/jobstatus/buttons/PrintButton',
    [
        'underscore',
        'module',
        'views/Base',
        'helpers/Printer',
        'bootstrap.tooltip'
    ],
    function(_, module, Base, Printer) {
        return Base.extend({
            moduleId: module.id,
            className: 'print btn btn-small btn-square',
            tagName: 'a',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.$el.html('<i class="icon-print"></i><span class="hide-text">' + _("Print").t() + '</span>');
                this.$el.tooltip({animation:false, title:_('Print').t(), container: 'body'});
            },
            events: {
                'click': function(e) {
                    Printer.printPage();
                    return false;
                }
            },
            render: function() {
                return this;
            }
        });
    }
);

define('views/shared/jobstatus/buttons/Master',
    [
        'module',
        'views/Base',
        'views/shared/jobstatus/buttons/ShareButton',
        'views/shared/jobstatus/buttons/ExportButton',
        'views/shared/jobstatus/buttons/PrintButton'
    ],
    function(module, Base, ShareButton, ExportButton, PrintButton) {
        /**
         * View Hierarchy:
         *
         * Share
         * Export
         * Print
         */
        return Base.extend({
            moduleId: module.id,
            className: 'pull-right export-print-group btn-group',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);

                //Share
                this.children.shareButton = new ShareButton({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });

                //Export
                this.children.exportButton = new ExportButton({
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application,
                        report: this.model.report
                    }
                });

                //Print
                this.children.printButton = new PrintButton();
            },
            render: function() {
                this.$el.append(this.children.shareButton.render().el);
                this.$el.append(this.children.exportButton.render().el);
                this.$el.append(this.children.printButton.render().el);

                return this;
            }
        });
    }
);

define('views/shared/jobstatus/SearchMode',
    [
        'underscore',
        'module',
        'views/shared/controls/SyntheticSelectControl',
        'util/splunkd_utils'
    ], 
    function(_, module, SyntheticSelectControl, splunkd_utils){
        return SyntheticSelectControl.extend({
            className: 'btn-group pull-right',
            moduleId: module.id,
            initialize: function(options) {
                options.items = [
                    {value: splunkd_utils.FAST, label: _('Fast Mode').t(), icon: 'lightning', description: _('Field discovery off for event searches. No event or field data for stats searches.').t()},
                    {value: splunkd_utils.SMART, label: _('Smart Mode').t(), icon: 'bulb', description: _('Field discovery on for event searches. No event or field data for stats searches.').t()},
                    {value: splunkd_utils.VERBOSE, label: _('Verbose Mode').t(), icon: 'speech-bubble', description: _('All event & field data.').t()}
                ];
                options.modelAttribute = 'display.page.search.mode';
                options.defaultValue = splunkd_utils.SMART;
                SyntheticSelectControl.prototype.initialize.call(this, options);
            },
            template: '\
                <a class="btn dropdown-toggle btn-small dropdown-toggle-search-mode"  href="#">\
                    <% if (item.icon) { %> <i class="icon-<%-item.icon%> icon-large"></i><% } %>\
                    <span class="link-label"><%- item.label %></span><span class="caret"></span>\
                </a>\
                <div class="dropdown-menu dropdown-menu-search-mode">\
                    <div class="arrow"></div>\
                    <ul>\
                        <% _.each(items, function(element, index, list) { %>\
                            <li>\
                                <a href="#" data-value="<%- element.value %>">\
                                    <i class="icon-check"></i>\
                                    <i class="icon-<%-element.icon%> link-icon"></i>\
                                    <span class="link-label"><%- element.label %></span>\
                                    <span class="link-description"><%- element.description %></span>\
                                </a>\
                            </li>\
                        <% }); %>\
                    </ul>\
                </div>\
            '
        });
    }
);

define('views/shared/jobstatus/AutoPause',
    [
        'underscore',
        'module',
        'views/Base',
        'util/splunkd_utils',
        'splunk.util',
        'splunk.i18n'
    ],
    function(
        _,
        module,
        Base,
        splunkd_utils,
        splunkUtil,
        i18n
    ){
        return Base.extend({
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                
                this.autoPauseInterval = parseInt(this.model.searchJob.entry.content.runtime.get("auto_pause"), 10) * 1000;
                this.autoPauseStartTime = new Date();
                                
                this.model.searchJob.entry.content.on("change:isDone change:isPaused", this.debouncedRender, this);
                this.model.searchJob.on("sync", this.render, this);
            },
            events: {
                'click a.auto-pause-cancel': function(e) {
                    e.preventDefault();
                    
                    this.model.searchJob.saveJob({
                        data: {
                            auto_pause: 0
                        },
                        success: function(model, response) {
                            this.remove();
                        }.bind(this)
                    });
                }
            },
            render: function() {
              if (this.model.searchJob.isNew() || this.model.searchJob.entry.content.get('isDone') || this.model.searchJob.entry.content.get('isPaused') || parseInt(this.model.searchJob.entry.content.runtime.get('auto_pause'), 10) === 0) {
                  this.$el.hide();
                  this.remove();
              } else {
                  var elapsedTime = parseInt((new Date()) - this.autoPauseStartTime, 10);
                  var timeRemaining = Math.round((this.autoPauseInterval - elapsedTime) / 1000);
                  
                  var template = this.compiledTemplate({
                      _: _,
                      i18n: i18n,
                      splunkUtil: splunkUtil,
                      timeRemaining: timeRemaining
                  });
                  
                  this.el.innerHTML = template;                  
              }
              
              return this;
            },
            template: '\
                <div class="alert alert-warning">\
                    <i class="icon-alert"></i>\
                    <%- splunkUtil.sprintf(i18n.ungettext("Your search will automatically pause in %s second.", "Your search will automatically pause in %s seconds.", timeRemaining), timeRemaining) %>\
                    <a href="#" class="auto-pause-cancel"><%- _("Do not pause").t() %></a>\
                </div>\
            '
        });
    }
);

define('views/shared/jobstatus/Master',
    [
        'underscore',
        'module',
        'models/classicurl',
        'views/Base',
        'views/shared/jobstatus/Spinner',
        'views/shared/jobstatus/Count',
        'views/shared/jobstatus/controls/Master',
        'views/shared/jobstatus/buttons/Master',
        'views/shared/jobstatus/SearchMode',
        'views/shared/jobstatus/AutoPause',
        'uri/route',
        'splunk.window',
        'splunk.util',
        'util/splunkd_utils'
    ],
    function(_, module, classicurlModel, BaseView, Spinner, Count, Controls, Buttons, SearchMode, AutoPause, route, splunkwindow, splunkUtil, splunkd_utils) {
        return BaseView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         state: <models.BaseModel>,
             *         searchJob: <helpers.ModelProxy>,
             *         application: <models.Application>,
             *         appLocal: <models.services.AppLocal>,
             *         report: <models.Report> (Only required for export to pdf. If passed in pdf will be a format option.)
             *     },
             *     enableSearchMode: <Boolean> Controls the display of adhoc search mode via bunny button.
             *     enableReload: <Boolean> Controls if the reload button will be shown when the job is done, defaults to false
             *     allowDelete: <Boolean> Controls if delete job link is displayed.
             * }
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                this.errorTypes = [splunkd_utils.FATAL, splunkd_utils.ERROR, splunkd_utils.NOT_FOUND];

                var defaults = {
                    allowDelete: true
                };

                _.defaults(this.options, defaults);
                // searchMode
                if (this.options.enableSearchMode) {
                    this.children.searchMode = new SearchMode({
                        model: this.model.state,
                        btnClass: 'btn-mini',
                        rightAlign: true
                    });
                }

                if (this.options.showJobButtons !== false) {
                    this.children.buttons = new Buttons({
                        model: {
                            searchJob: this.model.searchJob,
                            application: this.model.application,
                            report: this.model.report
                        }
                    });
                }

                //controls
                this.children.controls = new Controls({
                    showJobMenu: this.options.showJobMenu,
                    allowDelete: this.options.allowDelete,
                    enableReload: this.options.enableReload,
                    model: {
                        searchJob: this.model.searchJob,
                        application: this.model.application,
                        appLocal: this.model.appLocal
                    }
                });
                
                //count
                this.children.count = new Count({model: this.model.searchJob});
                //spinner
                this.children.spinner = new Spinner({model: this.model.searchJob});
                //AutoPause
               
                if (this.options.showAutoPause) {
                    this.children.autoPause = new AutoPause({
                        model: {
                            searchJob: this.model.searchJob
                        }
                    });
                }
                
                this.model.searchJob.on("sync error", function() {
                    var messages = this.model.searchJob.error.get("messages");
                    if (splunkd_utils.messagesContainsOneOfTypes(messages, this.errorTypes)) {
                        this.renderError(messages);
                    }
                }, this);
                
                this.model.searchJob.control.on("error", function() {
                    var messages = this.model.searchJob.control.error.get("messages");
                    if (splunkd_utils.messagesContainsOneOfTypes(messages, this.errorTypes)) {
                        this.renderError(messages);
                    }
                }, this);
            },
            events: {
                'click a.job_inspector': function(e) {
                    splunkwindow.open(
                        route.jobInspector(this.model.application.get('root'), this.model.application.get('locale'), this.model.application.get('app'), this.model.searchJob.id),
                        'splunk_job_inspector',
                        {
                            width: 870, 
                            height: 560,
                            menubar: false
                        }
                    );
                    e.preventDefault();
                }
            },
            render: function() {
                if (splunkd_utils.messagesContainsOneOfTypes(this.model.searchJob.error.get("messages"), this.errorTypes)) {
                    return this.renderError();
                }
                
                if (this.options.showAutoPause) {
                    this.$el.append(this.children.autoPause.render().el);
                }

                if (this.options.enableSearchMode) {
                    this.$el.append(this.children.searchMode.render().el);
                }

                if(this.options.showJobButtons !== false) {
                    this.$el.append(this.children.buttons.render().el);
                }

                this.$el.append(this.children.controls.render().el);
                
                this.$el.append(this.children.spinner.render().el);
                this.$el.append(this.children.count.render().el);
                
                return this;
            },
            renderError: function(messages) {
                var link = '<a class="job_inspector" href="#">' + _('Job Inspector').t() + '</a>',
                    id = this.model.searchJob.id || _('unknown').t(),
                    error, template;
                
                if (splunkd_utils.messagesContainsOneOfTypes(messages, [splunkd_utils.NOT_FOUND])) {
                    error = splunkUtil.sprintf(_('The search job "%s" was canceled remotely or expired.').t(), id);
                } else {
                    error = splunkUtil.sprintf(_('The search job has failed due to an error. You may be able view the job in the %s.').t(), link);
                }
                
                template = _.template(this.errorTemplate, {
                    _: _,
                    link: link,
                    splunkUtil: splunkUtil,
                    error: error
                });
                
                this.el.innerHTML = template;
                return this;
            },
            errorTemplate: '\
                <div class="alert alert-error">\
                    <i class="icon-alert"></i>\
                    <%= error %>\
                </div>\
            ',
            notFoundTemplate: '\
                <div class="alert alert-error">\
                    <i class="icon-alert"></i>\
                    <%= splunkUtil.sprintf(_("The job has failed due to an error. You may be able view the job in the %s.").t(), link) %>\
                </div>\
            '
        });
    }
);

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/bunny-button.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/searchcontrolsview',['require','exports','module','underscore','backbone','./mvc','./basesplunkview','views/shared/jobstatus/Master','models/ACLReadOnly','models/Application','splunk.config','./utils','util/time_utils','./sharedmodels','css!../css/bunny-button'],function(require, exports, module) {
    var _ = require("underscore");
    var Backbone = require("backbone");
    var mvc = require('./mvc');
    var BaseSplunkView = require("./basesplunkview");
    var JobStatus = require('views/shared/jobstatus/Master');
    var ACLReadOnlyModel = require('models/ACLReadOnly');
    var ApplicationModel = require('models/Application');
    var splunkConfig = require('splunk.config');
    var utils = require('./utils');
    var time_utils = require('util/time_utils');
    var sharedModels = require('./sharedmodels');
    
    require("css!../css/bunny-button");
    
    var JobModel = Backbone.Model.extend({
        constructor: function() {
            this.control = new Backbone.Model();
            this.error = new Backbone.Model();
            this.entry = new Backbone.Model();
            this.entry.content = new Backbone.Model();  
            this.entry.content.custom = new Backbone.Model();
            this.entry.acl = new ACLReadOnlyModel();
            
            Backbone.Model.prototype.constructor.apply(this, arguments);  
        },
        
        initialize: function() {
            this._isNew = true;
        },
        
        set: function() {
            Backbone.Model.prototype.set.apply(this, arguments);  
            Backbone.Model.prototype.set.apply(this.entry.content, arguments);
        },
        
        isNew: function() {
            return this._isNew;
        },
        
        fetch: function() {
            return this;
        },
        
        clear: function() {
            this.entry.clear();
            this.entry.content.clear();
            this.entry.content.custom.clear();
            
            this._isNew = true;  
        },
        
        destroy: function(options) {
            this.cancel();
            
            if (options.success) {
                options.success();
            }
        },
        
        pause: function(options) {
            if (this.manager) {
                this.manager.pause();
            }
        },

        unpause: function(options) {
            if (this.manager) {
                this.manager.unpause();
            }
        },

        finalize: function(options) {
            if (this.manager) {
                this.manager.finalize();
            }
        },
        
        cancel: function(options) {
            if (this.manager) {
                this.manager.cancel();
            }
        },
        
        touch: function(options) {
            if (this.manager) {
                this.manager.touch();
            }
        },
            
        saveIsBackground: function(options) {
            this.entry.content.custom.set("isBackground", "1");
        },
        
        isBackground: function() {
            return this.entry.content.custom.get("isBackground") === "1";
        }, 
        
        resultCountSafe: function() {
            return (this.entry.content.get('isPreviewEnabled') && !this.entry.content.get('isDone')) ? this.entry.content.get('resultPreviewCount') : this.entry.content.get('resultCount');
        },
        
        eventAvailableCountSafe: function() {
            return (this.entry.content.get('statusBuckets') == 0) ? this.resultCountSafe() : this.entry.content.get('eventAvailableCount');
        },


        // a job can be dispatched without a latest time, in which case return the published time
        latestTimeSafe: function() {
            var entry = this.entry;
            return entry.content.get('latestTime') || entry.get('published');
        },
        
        isQueued: function() {
            return this.checkUppercaseValue('dispatchState', JobModel.QUEUED);
        },
        
        isParsing: function() {
            return this.checkUppercaseValue('dispatchState', JobModel.PARSING);
        },
        
        isFinalizing: function() {
            return this.checkUppercaseValue('dispatchState', JobModel.FINALIZING);
        },
        
        isPreparing: function() {
            return this.isQueued() || this.isParsing();
        },
        
        isRunning: function() {
            return !this.isNew() && !this.entry.content.get('isPaused') && !this.entry.content.get('isDone') && !this.isPreparing() && !this.isFinalizing();
        },
        
        isAdHocLevelFast: function() {
            return this.checkUppercaseValue('adhoc_search_level', "FAST");
        },
        
        isReportSearch: function() {
            return (this.entry.content.get('reportSearch') ? true : false);
        },

        // returns true if the job was dispatched over all time, returns false for all-time real-time
        isOverAllTime: function() {
            var request = this.entry.content.request;
            return (!request.get('earliest_time') && !request.get('latest_time'));
        },

        isRealtime: function() {
            var request = this.entry.content.request;
            return (
                time_utils.isRealtime(request.get('earliest_time')) &&
                time_utils.isRealtime(request.get('latest_time'))
            );
        },
        
        checkUppercaseValue: function(key, uc_value) {
            var value = this.entry.content.get(key);
            if (!value) {
                return false;
            }
            return (value.toUpperCase() === uc_value);
        }
    }, {
        // constants for the dispatch states
        QUEUED: 'QUEUED',
        PARSING: 'PARSING',
        RUNNING: 'RUNNING',
        PAUSED: 'PAUSED',
        FINALIZING: 'FINALIZING',
        FAILED: 'FAILED',
        DONE: 'DONE'
    });
    
    var SearchControlsView = BaseSplunkView.extend(
        // Instance
        {
            moduleId: module.id,
            
            className: "splunk-searchcontrols",
            
            options: {
                managerid: null
            },
            
            initialize: function() {
                this.configure();
                
                var pageInfo = utils.getPageInfo();
                
                this._searchJob = new JobModel();
                this._state = new Backbone.Model({
                    "display.page.search.mode": "smart"
                });
                
                // Get the shared models
                var appModel = sharedModels.get("app");
                var appLocalModel = sharedModels.get("appLocal");
                
                var that = this;
                this._statusDfd = $.when(appLocalModel.dfd).done(function() {
                    that.jobStatus = new JobStatus({
                        model: {
                            searchJob: that._searchJob,
                            state: that._state,
                            application: appModel,
                            appLocal: appLocalModel
                        },
                        collection: {
                            limits: new Backbone.Collection()
                        },
                        enableSearchMode: true,
                        showAutoPause: false,
                        showJobButtons: false
                    });
                });
                
                this.bindToComponent(this.settings.get("managerid"), this.onManagerChange, this);
                
                this._state.on("change", this._onSearchModeChange, this);
            },
            
            onManagerChange: function(managers, manager) {
                if (this.manager) {
                    this.manager.off(null, null, this);
                    this.manager.search.off(null, null, this);
                }
                
                this.manager = manager;

                if (manager) {
                    this._searchJob.manager = manager;
                    
                    manager.on("search:start", this._onSearchStart, this);
                    manager.on("search:cancelled", this._onSearchCancelled, this);
                    manager.on("search:failed", this._onSearchFailed, this);
                    manager.on("search:progress", this._onSearchProgress, this);
                    
                    if (this.manager.search.get("adhoc_search_level")) {
                        this._state.set("display.page.search.mode", this.manager.search.get("adhoc_search_level"));
                    }
                    else {
                        this._onSearchModeChange();
                    }
                }
            },
            
            render: function() {
                // We can't use the job status until it is created
                var that = this;
                $.when(this._statusDfd).done(function() {
                    that.$el.append(that.jobStatus.render().el);
                });
                return this;
            },
            
            _onSearchModeChange: function() {
                var searchMode = this._state.get("display.page.search.mode");
                if (searchMode && this.manager) {
                    this.manager.search.set("adhoc_search_level", searchMode);
                }
            },
            
            _onSearchStart: function(properties) {        
                this._searchJob._isNew = true;     
                this._searchJob.clear();
            },
            
            _onSearchCancelled: function(properties) {       
                this._searchJob._isNew = true;      
                this._searchJob.clear();
            },
            
            _onSearchFailed: function(properties) {             
                this._searchJob._isNew = true;
                this._searchJob.clear();
            },
            
            _onSearchProgress: function(properties) {                
                this._searchJob._isNew = false;
                this._searchJob.entry.set(properties);
                this._searchJob.entry.content.set(properties.content);
                this._searchJob.entry.acl.set(properties.acl);
                this._searchJob.trigger("jobProgress");
                
                if (properties.content && properties.content.sid) {
                    this._searchJob.id = properties.content.sid;
                }
                
                // We can't use the job status until it is created
                var that = this;
                $.when(this._statusDfd).done(function() {
                    _.each(that.jobStatus.children.controls.children.menu.children, function(child) {
                        child.render(); 
                    });
                });
            }
        }
    );
    
    return SearchControlsView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*!\n * Splunk shoestrap\n * import and override bootstrap vars & mixins\n */\n.clearfix {\n  *zoom: 1;\n}\n.clearfix:before,\n.clearfix:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.clearfix:after {\n  clear: both;\n}\n.hide-text {\n  font: 0/0 a;\n  color: transparent;\n  text-shadow: none;\n  background-color: transparent;\n  border: 0;\n}\n.input-block-level {\n  display: block;\n  width: 100%;\n  min-height: 26px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ie7-force-layout {\n  *min-width: 0;\n}\n/* ad hoc search mode selector\n    overview: button + dropdown + synthetic select\n    FIXME: why does this not use data-toggle and open class?\n    also why does this not use either dropdown or popdown or synthetic select?\n    TODO: does this need btn-group? maybe just use relative container\n\n    <div class=\"btn-group view-searchmode\">\n        <a href=\"#\" class=\"btn btn-small dropdown-toggle dropdown-toggle-search-mode\" data-toggle=\"dropdown\">\n            <i class=\"icon-bulb\"></i>\n            <span class=\"link-label\">Smart Mode</span>\n        </a>\n        <div class=\"dropdown-menu dropdown-menu-search-mode\" style=\"display:block;\">\n            <div class=\"arrow\"></div>\n            <ul>\n                <li>\n                    <a data-value=\"fast\" href=\"#\">\n                        <span class=\"link-label\">Fast Mode</span>\n                        <span class=\"link-description\">\n                            Field discovery on for event searches. No event or field data for stats searches.\n                        </span>\n                    </a>\n                </li>\n                <li>\n                    <a data-value=\"smart\" href=\"#\">\n                        <span class=\"link-label\">Smart Mode</span>\n                        <span class=\"link-description\">\n                            Field discovery off for event searches. No event or field data for stats searches.\n                        </span>\n                    </a>\n                </li>\n                <li>\n                    <a data-value=\"verbose\" href=\"#\">\n                        <span class=\"link-label\">Verbose Mode</span>\n                        <span class=\"link-description\">All event &amp; field data</span>\n                    </a>\n                </li>\n            </ul>\n        </div><!-- /.dropdown-menu -->\n    </div><!-- /.btn-group -->\n\n*/\n.dropdown-toggle-search-mode i[class^=\"icon-\"]::before {\n  vertical-align: top;\n}\n.dropdown-menu-search-mode {\n  width: 26em;\n}\n.dropdown-menu-search-mode .link-label {\n  *display: block;\n}\n.dropdown-menu-search-mode a {\n  padding-left: 45px !important;\n}\n.dropdown-menu-search-mode .link-description {\n  color: #999999;\n  display: block;\n  font-size: 0.85em;\n}\n.dropdown-menu-search-mode .link-icon {\n  display: block;\n  position: absolute;\n  color: #999999;\n  left: 0;\n  top: 5px;\n  font-size: 2em;\n  width: 1.5em;\n  line-height: 1em;\n  opacity: 0.8;\n  filter: alpha(opacity=80);\n}\n.dropdown-menu-search-mode a .icon-check {\n  left: 30px;\n}\n.dropdown-menu-search-mode li > a {\n  white-space: normal;\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 