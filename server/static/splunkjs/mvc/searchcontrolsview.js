
define('views/shared/jobstatus/Spinner',['underscore', 'module', 'views/shared/WaitSpinner', 'splunk.util'],function(_, module, SpinnerView, splunkutil) {
    return SpinnerView.extend({
        className: 'pull-left',
        moduleId: module.id,
        initialize: function() {
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
                    // earliestTime is only safe to display if the job is not over all-time
                    earliest_date: this.model.isOverAllTime() ? null : time_utils.isoToDateObject(earliest_iso),
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
                        <% if(earliest_date) { %>\
                            <%- splunkUtil.sprintf(_("(Partial results for %s to %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(earliest_date), "short", "full"), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                        <% } else { %>\
                            <%- splunkUtil.sprintf(_("(Partial results for before %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                        <% } %>\
                    <% } else { %>\
                        <% if(earliest_date) { %>\
                            <%- splunkUtil.sprintf(_("(%s to %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(earliest_date), "short", "full"), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                        <% } else { %>\
                            <%- splunkUtil.sprintf(_("(before %s)").t(), i18n.format_datetime_microseconds(time_utils.jsDateToSplunkDateTimeWithMicroseconds(latest_date), "short", "full")) %>\
                        <% } %>\
                    <% } %>\
                <% } else if (model.isRunning()) { %>\
                    <%= splunkUtil.sprintf(i18n.ungettext("%s of %s event matched", "%s of %s events matched", scanCount), \'<span class="number">\' + eventCount + \'</span>\', \'<span class="number">\' + scanCount + \'</span>\') %>\
                <% } else if (model.entry.content.get("isPaused")) { %>\
                    <i class="icon-warning icon-warning-paused"></i><%- _("Your search is paused.").t() %>\
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
        attributes: { href: '#' },
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            'click': function(e) {
                e.preventDefault();
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
        attributes: { href: '#' },
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        events: {
            "click": function(e) {
                e.preventDefault();
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
        attributes: { href: '#' },
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.entry.content.on('change', this.render, this);
        },
        events: {
            'click': function(e) {
                e.preventDefault();
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
        attributes: { href: '#' },
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
        'models/Job',
        'uri/route',
        'util/splunkd_utils',
        'util/time_utils'
     ],
     function(_, Backbone, module, Modal, FlashMessages, ControlGroup, SearchJobModel, route, splunkd_utils, time_utils){
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
                        append: '<a class="add-on bookmark" href="' + this.linkToJob + '"><i class="icon-bookmark"></i><span class="hide-text">' + _("Splunk Search Job").t() + '</span></a>'
                    }
                });

                this.on("hidden", function() {
                    this.model.searchJob.fetch();
                }, this);
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .btn-primary': function(e) {
                    e.preventDefault();
                    
                    //TODO: SPL-75065, SPL-75098 because the job endpoint cannot handle parallel requests
                    //we must send all of our changes serially. Sending these requests serially will
                    //make the process slower in systems with slow response times. When SplunkD is fixed 
                    //go back to parallel requests.

                    var everyoneRead = this.model.inmem.get('everyoneRead'),
                        selectedTTL = this.model.inmem.entry.content.get("ttl"),
                        isRealTime = this.model.inmem.entry.content.get("isRealTimeSearch"),
                        aclDeferred = $.Deferred(),
                        saveDeferred = $.Deferred();

                    if (this.everyoneRead !== everyoneRead) {
                        var options = {
                            success: function(model, response) {
                                aclDeferred.resolve();
                            },
                            error: function(model, response) {
                                aclDeferred.resolve();
                            }
                        };
                        
                        if (everyoneRead) {
                            this.model.inmem.makeWorldReadable(options);
                        } else {
                            this.model.inmem.undoWorldReadable(options);
                        }
                    } else {
                        aclDeferred.resolve();
                    }

                    $.when(aclDeferred).then(function(){
                        var options = {
                            success: function(model, response) {
                                saveDeferred.resolve();
                            },
                            error: function(model, response) {
                                saveDeferred.resolve();
                            }
                        };
                        
                        if ((this.startTTL !== selectedTTL) && ((selectedTTL === this.defaultTTL) || (selectedTTL === this.defaultSaveTTL))){
                            if (selectedTTL === this.defaultTTL) {
                                this.model.inmem.unsaveJob(
                                   $.extend(true, options, {
                                       data: {
                                           auto_cancel: SearchJobModel.DEFAULT_AUTO_CANCEL
                                       }
                                   })
                                );
                            } else if (selectedTTL === this.defaultSaveTTL) {
                                if (isRealTime) {
                                    this.model.inmem.saveJob(
                                        $.extend(true, options, {
                                            data: {
                                                auto_cancel: SearchJobModel.DEFAULT_AUTO_CANCEL
                                            }
                                        })
                                    );
                                } else {
                                    //if the job is not realtime then we use the job endpoint's inherent clear of auto_pause and auto_cancel
                                    this.model.inmem.saveJob(options);
                                }
                            }
                        } else {
                            saveDeferred.resolve();
                        }                        
                    }.bind(this));

                    $.when(saveDeferred).then(function() {
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
                        'learnmore.alert.email'
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
                    help: splunkUtil.sprintf(_('Email must be configured in System&nbsp;Settings > Alert&nbsp;Email&nbsp;Settings. %s').t(), ' <a href="' + configEmailHelpLink + '" target="_blank">' + _("Learn More").t() + ' <i class="icon-external"></i></a>')
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
                    },
                    help: _('Comma separated list.').t()
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
                    
                    //TODO: SPL-75065, SPL-75098 because the job endpoint cannot handle parallel requests
                    //we must send all of our changes serially. Sending these requests serially will
                    //make the process slower in systems with slow response times. When SplunkD is fixed 
                    //go back to parallel requests.
                                        
                    var shouldEmail = this.model.inmem.get("email"),
                        email_subject = this.model.inmem.get("subject"),
                        email_list = this.model.inmem.get("addresses"),
                        perms = this.model.inmem.entry.acl.permsToObj(),
                        read = perms.read,
                        everyoneRead = (_.indexOf(read, "*") != -1),
                        saveControlDeferred = $.Deferred(),
                        aclDeferred = $.Deferred(),
                        disablePreviewDeferred = $.Deferred(),
                        saveBackgroundDeferred = this.model.inmem.saveIsBackground();
                    
                    $.when(saveBackgroundDeferred).then(function() {
                        var options = {
                            success: function(model, response) {
                                saveControlDeferred.resolve();
                            },
                            error: function(model, response) {
                                saveControlDeferred.resolve();
                            }
                        };
                        
                        if (shouldEmail) {
                            this.model.inmem.saveJob(
                                $.extend(true, options, {
                                    data: {
                                        email_list: email_list,
                                        email_subject: email_subject
                                    }
                                })
                            );
                        } else {
                            this.model.inmem.saveJob(options);
                        } 
                    }.bind(this));
                    
                    $.when(saveControlDeferred).then(function() {
                        if (!everyoneRead) {
                            this.model.inmem.makeWorldReadable({
                                success: function(model, response) {
                                    aclDeferred.resolve();
                                },
                                error: function(model, response) {
                                    aclDeferred.resolve();
                                }
                            });
                        } else {
                            aclDeferred.resolve();
                        }                        
                    }.bind(this));

                    $.when(aclDeferred).then(function() {
                        this.model.inmem.disablePreview({
                            success: function(model, response) {
                                disablePreviewDeferred.resolve();
                            },
                            error: function(model, response) {
                                disablePreviewDeferred.resolve();
                            }
                        });
                    }.bind(this));
                    
                    $.when(disablePreviewDeferred).then(function(){
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
                        append: '<a class="add-on bookmark" href="' + linkToJob + '"><i class="icon-bookmark"></i><span class="hide-text">' + _("Splunk Search Job").t() + '</span></a>'
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
                var iconClassName = splunkd_utils.normalizeType(type) == 'info' ? 'icon-info-circle' : 'icon-warning';
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
            className: 'pull-right btn-group includes-job-menu',
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
                        if(child.isActive()) {
                            var wasFocused = child.$el.is(':focus');
                            this.$el.append(child.$el);
                            if(wasFocused) {
                                child.$el.focus();
                            }
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
                        append: '<a class="add-on bookmark" href="' + this.linkToJob + '"><i class="icon-bookmark"></i><span class="hide-text">' + _("Splunk Search Job").t() + '</span></a>'
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
        'models/Job',
        'bootstrap.tooltip'
    ],
    function(_, module, Base, ShareDialog, SearchJobModel) {
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
                            auto_cancel: SearchJobModel.DEFAULT_AUTO_CANCEL
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
                this.model.searchJob.entry.content.on('change:dispatchState', _.debounce(this.enableDisable, 0), this);
            },
            events: {
                'click': function(e) {
                    if(!this.$el.hasClass('disabled')) {
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
                    }
                    e.preventDefault();
                }
            },
            enableDisable: function() {
                if (this.model.searchJob.isPreparing() ||
                   ((this.model.searchJob.isReportSearch() || this.model.searchJob.isRealtime()) && !this.model.searchJob.entry.content.get('isDone'))) {
                    this.$el.tooltip('hide');
                    this.$el.data('tooltip', false);
                    this.$el.tooltip({animation:false, title:_('Export - You can only export results for completed jobs.').t(), container: 'body'});
                    this.$el.addClass('disabled');
                } else {
                    this.$el.tooltip('hide');
                    this.$el.data('tooltip', false);
                    this.$el.tooltip({animation:false, title:_('Export').t(), container: 'body'});
                    this.$el.removeClass('disabled');
                }
            },
            render: function() {
                this.enableDisable();
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
                options.toggleClassName = "btn btn-small dropdown-toggle-search-mode";
                options.menuClassName = "dropdown-menu-search-mode";
                options.iconClassName = "link-icon";
                SyntheticSelectControl.prototype.initialize.call(this, options);
            }
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
                } else if (this.model.searchJob.entry.content.get("isFailed")) {
                    error = splunkUtil.sprintf(_('The search job has failed due to an error. You may be able view the job in the %s.').t(), link);
                }
                
                if (error) {
                    template = _.template(this.errorTemplate, {
                        _: _,
                        link: link,
                        splunkUtil: splunkUtil,
                        error: error
                    });
                    
                    this.el.innerHTML = template;                    
                }

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
            return request ? (!request.get('earliest_time') && !request.get('latest_time')) : false;
        },

        isRealtime: function() {
            var request = this.entry.content.request;
            return request && (
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
                
                this.bindToComponentSetting('managerid', this.onManagerChange, this);
                
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

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.clearfix{*zoom:1;}.clearfix:before,.clearfix:after{display:table;content:\"\";line-height:0;}\n.clearfix:after{clear:both;}\n.hide-text{font:0/0 a;color:transparent;text-shadow:none;background-color:transparent;border:0;}\n.input-block-level{display:block;width:100%;min-height:26px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;}\n.ie7-force-layout{*min-width:0;}\n.dropdown-toggle-search-mode i[class^=\"icon-\"]::before{vertical-align:top;}\n.dropdown-menu-search-mode{width:26em;}.dropdown-menu-search-mode .link-label{*display:block;}\n.dropdown-menu-search-mode a{padding-left:45px !important;}\n.dropdown-menu-search-mode .link-description{color:#999999;display:block;font-size:0.85em;}\n.dropdown-menu-search-mode .link-icon{display:block;position:absolute;color:#999999;left:0;top:5px;font-size:2em;width:1.5em;line-height:1em;opacity:0.8;filter:alpha(opacity=80);}\n.dropdown-menu-search-mode a .icon-check{left:30px;}\n.dropdown-menu-search-mode li>a{white-space:normal;}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 