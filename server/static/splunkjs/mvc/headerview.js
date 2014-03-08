
define('contrib/text!views/shared/splunkbar/AppMenu.html',[],function () { return '<%\n    currentAppname = currentApp ? currentApp.name : \'search\';   // TODO: search fallback is not always safe assumption\n%>\n<a href="#" class="dropdown-toggle"><%- currentApp ? _(\'App: \').t() + _(currentApp.label).t() : _(\'Apps\').t() %><b class="caret"></b></a>\n<div class="dropdown-menu dropdown-menu-selectable dropdown-menu-tall" id="global-apps-menu">\n    <div class="arrow"></div>\n    <ul class="menu-list">\n        <% _.each(apps, function(i) { %>\n        <li>\n            <a href="<%- i.href %>">\n                <% if (currentApp && i.name === currentApp.name) { %> <i class="icon-check"></i><% } %>\n                <% if (i.icon) { %> <img data-icosrc="<%-i.icon%>" alt="menu icon" class="menu-icon" style="display:none;"><% } %>\n                <span class="menu-label"><%= _(i.label).t() %></span>\n            </a>\n        </li>\n        <% }); %>\n    </ul>\n\n    <a class="btn nav-btn" href="<%- make_url(\'manager\', currentAppname, \'apps\',\'remote\') %>"><%- _("Find More Apps").t() %></a>\n    <a class="btn nav-btn" href="<%- make_url(\'manager\', currentAppname, \'apps\',\'local\') %>"><%- _("Manage Apps").t() %></a>\n</div>\n';});

define('views/shared/splunkbar/AppMenu',
    [
        'jquery',
        'module',
        'views/Base',
        'views/shared/delegates/Popdown',
        'splunk.util',
        'contrib/text!views/shared/splunkbar/AppMenu.html',
        'uri/route'
    ],
    function(
        $,
        module,
        BaseView,
        Popdown,
        splunk_util,
        appsTemplate,
        route
    ){
        return BaseView.extend({
            moduleId: module.id,
            template: appsTemplate,
            tagName: 'li',
            className: 'dropdown menu-apps',
            initialize: function() {
                this.haveIcons = false;
                BaseView.prototype.initialize.apply(this, arguments);

                if(this.options.activeMenu && this.options.activeMenu.name === 'app'){
                    this.currentApp = this.model.application.get('app');
                }
                this.render();
                this.collection.apps.on('ready change', this.debouncedRender, this);
                // handle the case when collection.apps is already set
                if (this.collection.apps.length > 0) {
                    this.debouncedRender();
                }
            },
            render: function() {
                this.haveIcons = false;
                var that = this,
                    app,
                    curApp = null,
                    apps = this.collection.apps.map(function(model, key, list) {
                        var appIcon = route.appIconAlt(
                            that.model.application.get('root'),
                            that.model.application.get('locale'),
                            that.model.application.get('owner'),
                            model.entry.get('name')
                        );

                        app = {
                            href: splunk_util.make_url('/app/'+ model.entry.get('name')),
                            label: model.entry.content.get('label'),
                            name: model.entry.get('name'),
                            icon: appIcon
                        };
                        if(model.entry.get('name') === that.currentApp) {
                            curApp = app;
                        }
                        return app;
                    }),
                    html = this.compiledTemplate({
                        apps: apps,
                        currentApp: curApp,
                        make_url: splunk_util.make_url
                    });
                this.$el.html(html);
                this.popdown = new Popdown({el:this.$('#global-apps-menu').parent(), mode: 'dialog'});
                this.popdown.on('show', this.setIcons, this);
                return this;
            },
            setIcons: function(){
                if(this.haveIcons){
                    return;
                }
                this.haveIcons = true;
                var icons = this.$el.find('.menu-icon');
                icons.each(function(index, ico){
                    ico = $(ico);
                    ico.attr('src', ico.attr('data-icosrc')).show();
                });
            }
        });
    });

define('contrib/text!views/shared/splunkbar/SystemMenuSection.html',[],function () { return '\n<i class="icon icon-<%-this.model.get(\'icon\')%>"></i>\n<h5><%=this.model.get(\'label\')%></h5>\n<ul class="menu">\n    <%_.each(this.model.get(\'items\'), function(item, i){ %>\n        <li><a href="<%-item.get(\'url\')%>"><%-_(item.entry.content.get(\'menu.label\')).t() || _(item.entry.get(\'name\')).t() || \'\'%></a></li>\n    <%});%>\n</ul>';});

define('views/shared/splunkbar/SystemMenuSection',[
    'jquery',
    'underscore',
    'module',
    'views/Base',
    'contrib/text!views/shared/splunkbar/SystemMenuSection.html'
],
function(
    $,
    _,
    module,
    BaseView,
    systemMenuSectionTemplate
){
    return BaseView.extend({
        moduleId: module.id,
        template: systemMenuSectionTemplate,
        className: 'menu-section',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            var itemsArray = this.model.get('items');
            itemsArray.sort(function(a,b){
                return parseInt(a.get('order'), 10) - parseInt(b.get('order'), 10);
            });
        },
        render: function() {
            var html = this.compiledTemplate(this.model);
            this.$el.html(html);
            return this;
        }
    });
});
define('contrib/text!views/shared/splunkbar/SystemMenu.html',[],function () { return '<a href="#" class="dropdown-toggle"><%- _("Settings").t() %><b class="caret"></b></a>\n<div class="popdown-dialog mega-menu" id="global-system-menu">\n    <div class="arrow"></div>\n    <div class="popdown-dialog-body">\n    </div><!-- /.popdown-dialog-body -->\n</div><!-- /.podown -->';});

define('views/shared/splunkbar/SystemMenu',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'splunk.util',
    'views/Base',
    'views/shared/delegates/Popdown',
    'views/shared/splunkbar/SystemMenuSection',
    'contrib/text!views/shared/splunkbar/SystemMenu.html'
],
function(
    $,
    _,
    Backbone,
    module,
    splunk_util,
    BaseView,
    Popdown,
    SystemMenuSection,
    systemMenuTemplate
){
    return BaseView.extend({
        moduleId: module.id,
        template: systemMenuTemplate,
        tagName: 'li',
        className: 'dropdown menu-system',
        initialize: function() {
            var self = this;
            BaseView.prototype.initialize.apply(this, arguments);
            self.debouncedRender();
            this.collection.sections.on('ready', function(){
                self.debouncedRender();
            }, this);
        },
        render: function() {
            var html = this.compiledTemplate({});
            var $html = $(html);
            var $menu = $html.find('.popdown-dialog-body');
                
            this.addSections($menu);
            if(this.sectionCount < 2) {
                $menu.parent().addClass('mega-menu-narrow');
            }
            this.$el.html($html);
            
            var popup = this.$el.find('#global-system-menu');
            this.children.popdown = new Popdown({el:popup.parent(), mode: 'dialog'});

            return this;
        },
        addSections: function($menu){
            var self = this;
            this.sectionCount = 0;
            this.collection.sections.each(function(section){
                if (section.get('items') && section.get('items').length === 0) {
                    return;
                }
                var sectionView = self.children[section.get('id')] = new SystemMenuSection({
                    model: section
                });
                
                self.sectionCount++;
                $menu.append(sectionView.render().el);
            });
        }
    });
});

define('contrib/text!views/shared/splunkbar/UserMenu.html',[],function () { return '<a href="#" class="dropdown-toggle"><span class="realname"><%-realName%></span><b class="caret"></b></a>\n<div class="dropdown-menu dropdown-menu-narrow global-user-menu">\n    <div class="arrow"></div>\n    <ul>\n        <li><a href="<%-accountLink%>" class="edit"><%- _("Edit Account").t() %></a></li>\n        <% if (logoutLink) { %>\n        <li><a href="<%-logoutLink%>" class="logout"><%- _("Logout").t() %></a></li>\n        <% } %>\n    </ul>\n</div>';});

define('views/shared/splunkbar/UserMenu',[
    'underscore',
    'module',
    'views/Base',
    'views/shared/delegates/Popdown',
    'contrib/text!views/shared/splunkbar/UserMenu.html',
    'uri/route'
],
function(
    _,
    module,
    BaseView,
    Popdown,
    userMenuTemplate,
    route
){
    return BaseView.extend({
        moduleId: module.id,
        template: userMenuTemplate,
        tagName: 'li',
        className: 'dropdown user',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.user.on('change', this.render, this);
            this.model.webConf.on('change', function() {
                this.SSOModeOn = (
                    typeof this.model.webConf.entry.content.get('trustedIP') !== 'undefined' &&
                    this.model.webConf.entry.content.get('trustedIP').length > 0);
                this.render();
            }, this);

            if (this.model.user.entry.get('name')) {
                this.render();
            }
        },
        render: function() {
            var realName = this.model.user.entry.content.get('realname'),
                userName = this.model.user.entry.get('name');
            if (!realName || !realName.length) {
                realName = userName;
            }

            var rootUrl = this.model.application.get('root');
            var locale = this.model.application.get('locale');

            var accountLink = route.manager(
                rootUrl,
                locale,
                this.model.application.get('app'),
                [
                    'authentication',
                    'changepassword',
                    userName
                ],
                {
                    data: { action: 'edit' }
                }
            );

            var logoutLink = this.SSOModeOn ? null : route.logout(rootUrl, locale);
            var html = this.compiledTemplate({
                userName: userName,
                realName: realName,
                accountLink: accountLink,
                logoutLink: logoutLink
            });
            this.$el.html(html);
            var popup = this.$el.find('.global-user-menu');
            this.popdown = new Popdown({el:popup.parent(), mode: 'dialog'});
            return this;
        }
    });
});

// splunk bar
define('views/shared/splunkbar/messages/Message',
[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base',
    'splunk.util',
    'util/time_utils'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    splunk_util,
    time_utils
){
    /**
     * View Hierarchy:
     *
     * Messages
     */
    return BaseView.extend({
        moduleId: module.id,
        className: 'view-navbar-global navbar navbar-fixed-top',
        messageMap: {
            'restart_required': _('Splunk must be restarted for changes to take effect. [[/manager/search/control|Click here to restart from the Manager]].').t()
        },
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
        },
        render: function() {
            var msgFullId = this.model.id,
                msgId = (this.model.entry.get('name')||''),
                msg,
                msgLevel = this.model.entry.content.get('severity') || 'warn';
            if (msgId && this.messageMap[msgId]) {
                msg = this.messageMap[msgId];
            } else {
                msg = this.model.entry.content.get("message") || "";
            }

            var msgTime = this.model.entry.content.get("timeCreated_epochSecs");
            msgTime = msgTime ? time_utils.convertToLocalTime(msgTime) : "";
            var html = this.compiledTemplate({
                msgId: msgId,
                msgFullId: msgFullId,
                msg: splunk_util.getWikiTransform(msg),
                msgLevel: msgLevel,
                msgTime: msgTime
            });
            this.$el = $(html);
            return this;
        },
        template: '<li class="<%- msgLevel %>" data-id="<%- msgFullId %>">\
                <i class="message-icon icon-<%- msgLevel %>"></i>\
                <span class="message-content"><%= msg %></span>\
                <span class="message-time"><%= msgTime %></span>\
                <a href="#" class="delete-message"><i class="icon-x-circle"></i></a>\
            </li>'
    });
});

// splunk bar
define('views/shared/splunkbar/messages/LegacyMessage',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'splunk.util'
    ],
    function(
        $,
        _,
        Backbone,
        module,
        BaseView,
        splunk_util
        ){
        /**
         * View Hierarchy:
         *
         * Messages
         */
        return BaseView.extend({
            moduleId: module.id,
            className: 'view-navbar-global navbar navbar-fixed-top',
            messageMap: {
                'restart_required': _('Splunk must be restarted for changes to take effect. [[/manager/search/control|Click here to restart from the Manager]].').t()
            },
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
            },
            render: function() {

                var msgId = (this.model.get('id')||'').toLowerCase(),
                    msg,
                    msgLevel = this.model.get('severity') || 'warn';
                if (msgId && this.messageMap[msgId]) {
                    msg = this.messageMap[msgId];
                } else {
                    msg = this.model.get("content") || "";
                }
                var html = this.compiledTemplate({
                    msgId: msgId,
                    msg: splunk_util.getWikiTransform(msg),
                    msgLevel: msgLevel
                });
                this.$el = $(html);
                return this;
            },
            template: '<li class="<%- msgLevel %>" data-islegacy="1" data-id="<%- msgId %>">\
                <span class="message-content"><%= msg %></span>\
                <a href="#" class="delete-message"><i class="icon-x-circle"></i></a>\
            </li>'
        });
    });

define('contrib/text!views/shared/splunkbar/messages/Master.html',[],function () { return '<a href="#" class="dropdown-toggle">\n    <span class="label label-warning" style="display: none;"><%- collection.length %></span> <%- _("Messages").t() %><b class="caret"></b>\n</a>\n<div class="dropdown-menu" id="global-messages-menu">\n\n    <div class="arrow"></div>\n    <ul class="message-list" style="display: none;">\n    </ul>\n    <div class="no-messages">\n        <%- _("You have no messages.").t() %>\n    </div>\n    <a href="#" class="delete-all-messages btn pull-right" style="display: none;"><%- _("Delete All").t() %></a>\n</div>\n';});

define('views/shared/splunkbar/messages/Master',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base',
        'views/shared/delegates/Popdown',
        'views/shared/delegates/StopScrollPropagation',
        'collections/services/Messages',
        'views/shared/splunkbar/messages/Message',
        'views/shared/splunkbar/messages/LegacyMessage',
        'contrib/text!views/shared/splunkbar/messages/Master.html',
        'util/general_utils'
    ],
    function($, _, module, BaseView, Popdown, StopScrollPropagation, MessagesCollection, MessageView, LegacyMessageView, MasterTemplate, general_utils) {
        return BaseView.extend({
            moduleId: module.id,
            template: MasterTemplate,
            tagName: 'li',
            className: 'dropdown messages',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.legacyMessages = this.collection.legacyMessages || false;
                this.collection = this.collection.messages;
                this.collection.on('change reset remove', this.renderMessages, this);
                if(this.legacyMessages){
                    this.legacyMessages.on('reset remove', this.renderMessages, this);
                }
                this.isLocalMouseSelection = false;
            },
            events: {
                'click .message-list .delete-message': 'deleteMessage',
                'click .delete-all-messages': 'deleteAllMessages',
                'mouseup .message-list': function() {
                    // this is to stop message refresh only when selection is LOCAL to .message-list
                    this.isLocalMouseSelection = true;
                }
            },
            render: function() {
                //destroy already existing popdowns...
                var html = this.compiledTemplate({collection: this.collection});
                this.$el.html(html);
                this.children.popdown = new Popdown({el:this.el, mode: 'dialog'});
                this.children.stopScrollPropagation = new StopScrollPropagation({el:this.$('#global-messages-menu ul'), mode: 'dialog'});

                return this;
            },
            renderMessages: function(forceUpdate) {
                if(forceUpdate !== true &&
                    this.isLocalMouseSelection &&
                    general_utils.getMouseSelection() && general_utils.getMouseSelection().length>0) {
                    return;
                }
                this.isLocalMouseSelection = false;
                var numMessages = this.collection.length;
                if(this.legacyMessages){
                    numMessages = numMessages + this.legacyMessages.length;
                }

                this.$('.label-warning').text(numMessages);

                //remove existing message children
                _.each(this.children, function(view, key){
                    if (key.substr(0, 7) == 'message') {
                        this.children[key].remove();
                        delete this.children[key];
                    }
                }, this);

                //iterate through collection
                var messageView;

                this.collection.each(function(model, key){
                    //create view
                    messageView = new MessageView({model: model});
                    this.children['message' + model.get("id")] = messageView;
                    this.$('#global-messages-menu .message-list').append(messageView.render().$el);
                    //bind destruction of model to delete view
                }, this);

                var numLegacyMessages = 0;
                if(this.legacyMessages){
                    numLegacyMessages = this.legacyMessages.length;
                    this.legacyMessages.each(function(model){
                        messageView = new LegacyMessageView({model: model});
                        this.children['messageLegacy' + model.get("id")] = messageView;
                        this.$('#global-messages-menu .message-list').append(messageView.render().$el);
                    }, this);
                }


                if (this.collection.length > 0 || numLegacyMessages > 0) {
                    this.$(".label-warning, .delete-all-messages, .message-list").show();
                    this.$('#global-messages-menu').addClass('dropdown-menu-wide');
                    this.$(".no-messages").hide();

                    if(this.$('#global-messages-menu').is(':visible')) {
                        this.children.popdown.adjustPosition();
                    }
                } else {
                    this.$(".label-warning, .delete-all-messages, .message-list").hide();
                    this.$('#global-messages-menu').removeClass('dropdown-menu-wide');
                    this.$(".no-messages").show();
                }

            },
            deleteMessage: function(evt) {
                evt.preventDefault();
                var $li = $(evt.currentTarget).parent();
                var id = $li.data('id');
                var isLegacy = $li.data('islegacy');

                var toRemove;
                if(this.legacyMessages && isLegacy){
                    toRemove = this.legacyMessages.get(id);
                    if(toRemove){
                        this.legacyMessages.remove( toRemove );
                    }
                }else{
                    toRemove = this.collection.get(id);
                    if(toRemove){
                        toRemove.destroy();
                    }
                }

                if (this.collection.length === 0 && (this.legacyMessages === false || this.legacyMessages.length === 0)) {
                    this.children.popdown.hide();
                }

                this.renderMessages(true);
            },
            deleteAllMessages: function(evt) {
                evt.preventDefault();
                this.collection.destroyAll();

                if(this.legacyMessages){
                    this.legacyMessages.reset();
                }
                this.children.popdown.hide();
            }
        });
    }
);

define('contrib/text!views/shared/splunkbar/ActivityMenu.html',[],function () { return '<a href="#" class="dropdown-toggle"><%- _("Activity").t() %><b class="caret"></b></a>\n<div class="dropdown-menu dropdown-menu-narrow" id="global-activity-menu">\n    <div class="arrow"></div>\n    <ul>\n        <li>\n            <a class="primary-link" href="<%= jobLink %>"><%- _("Jobs").t() %></a>\n            <a class="secondary-link" href="<%= jobLink %>" target="_blank"><i class="icon-external"></i></a>\n        </li>\n        <li>\n            <a class="primary-link" href="<%= alertsLink %>"><%- _("Triggered Alerts").t() %></a>\n            <a class="secondary-link" href="<%= alertsLink %>" target="_blank"><i class="icon-external"></i></a>\n        </li>\n\t<% if (typeof statusLink !== "undefined" && statusLink !== null) { %>\n\t\t<li>\n\t\t    <a class="primary-link" href="<%= statusLink %>"><%- _("System Activity").t() %></a>\n\t\t    <a class="secondary-link" href="<%= statusLink %>" target="_blank"><i class="icon-external"></i></a>\n\t\t</li>\n\t<% } %>\n    </ul>\n</div>\n';});

define('views/shared/splunkbar/ActivityMenu',
[
    'underscore',
    'jquery',
    'module',
    'views/Base',
    'views/shared/delegates/Popdown',
    'contrib/text!views/shared/splunkbar/ActivityMenu.html',
    'splunk.util',
    'uri/route'
],
function(
    _,
    $,
    module,
    BaseView,
    Popdown,
    activityMenuTemplate,
    splunk_util,
    route
){
    return BaseView.extend({
        moduleId: module.id,
        template: activityMenuTemplate,
        tagName: 'li',
        className: 'dropdown activity',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            this.render();
            this.model.application.on('change', this.render);
            this.model.user.on('change', this.render);
        },
        render: function(){
            // can't render unless we have app and roles info
            if (typeof this.model.application.get('app') === "undefined" ||
                typeof this.model.user.entry.content.get('roles') === "undefined") {
                return this;
            } else {
                var app = this.model.application.get('app'),
                    isAdmin = (this.model.user.entry.content.get('roles').indexOf('admin') > -1),
                    jobLink = route.page(
                        this.model.application.get('root'),
                        this.model.application.get('locale'),
                        app,
                        'job_management'
                    ),
                    alertsLink = route.triggeredAlerts(this.model.application.get('root'), this.model.application.get('locale'), app),
                    statusLink = null;
                    
                // if we are currently in the system namespace, route job link through search namespace
                //  job_management page cannot be loaded within system namespace
                if (app == 'system') {
                    jobLink = route.page(
                        this.model.application.get('root'),
                        this.model.application.get('locale'),
                        'search',
                        'job_management'
                    );
                }

                if (isAdmin) {
                    // only build statusLink if the user is admin
                    statusLink = route.page(
                        this.model.application.get('root'),
                        this.model.application.get('locale'),
                        'search',
                        'status_index');
                }
                
                var html = this.compiledTemplate({jobLink:jobLink, alertsLink:alertsLink, statusLink:statusLink});
                this.$el.html(html);

                this.children.popdown = new Popdown({el:this.el, mode: 'dialog'});

                return this;
            }
        }
    });
});

define('contrib/text!views/shared/whatsnewdialog/Master.html',[],function () { return '<h2><%=_("Powerful Analytics").t()%></h2>\n<div class="feature">\n    <h3><%=_("Data Models & Pivot").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/pivot.png">\n    <p><%=_("Define semantic models to represent data meaningfully and consistently. Explore and visualize data without the search language.").t()%></p>\n    <a href="<%=docLink%>whatsnew.pivot" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("High Performance Analytics Store").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/columnar.png">\n    <p><%=_("High performance store that accelerates data models by delivering extremely high performance data retrieval for analytical operations.").t()%></p>\n    <a href="<%=docLink%>whatsnew.columnaranalytics" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("Predictive Analytics").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/predictive.png">\n    <p><%=_("Find patterns in data to predict system capacity and resource utilization.").t()%></p>\n    <a href="<%=docLink%>whatsnew.predictiveanalytics" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<h2><%=_("More Intuitive User Experience").t()%></h2>\n<div class="feature">\n    <h3><%=_("New Home Experience").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/home.png">\n    <p><%=_("New menu system enabling rapid navigation to key functions.").t()%></p>\n    <a href="<%=docLink%>whatsnew.newhome" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("New Search Experience").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/search.png">\n    <p><%=_("New interactive experience for rich report authoring and searching.").t()%></p>\n    <a href="<%=docLink%>whatsnew.newsearch" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n\n\n\n<h2><%=_("Simplified Management").t()%></h2>\n<div class="feature">\n    <h3><%=_("Simplified Cluster Management").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/clustering.png">\n    <p><%=_("Monitor Splunk high availability services for business critical deployments at scale.").t()%></p>\n    <a href="<%=docLink%>whatsnew.simplifiedclustermanagement" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("Forwarder Management").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/forwarders.png">\n    <p><%=_("New visual management interface to deploy and monitor thousands of configurations.").t()%></p>\n    <a href="<%=docLink%>whatsnew.forwardermanagement" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("Dynamic File Headers").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/fileheaders.png">\n    <p><%=_("Automatic mapping of fields from file headers either locally or from forwarders.").t()%></p>\n    <a href="<%=docLink%>whatsnew.dynamicfileheaders" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<h2><%=_("Rich Developer Experience").t()%></h2>\n<div class="feature">\n    <h3><%=_("Simple XML Editing").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/simplexml.png">\n    <p><%=_("Build more interactive dashboards and user workflows with ease.").t()%></p>\n    <a href="<%=docLink%>whatsnew.simplexmlediting" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("Integrated Web Framework").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/webframework.png">\n    <p><%=_("New framework for building custom Splunk web applications using HTML, JavaScript, and Django.").t()%></p>\n    <a href="<%=docLink%>whatsnew.integratedwebframework" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>\n\n<div class="feature">\n    <h3><%=_("Native Splunk Maps").t()%></h3>\n    <img src="<%=imgPath%>/skins/default/whatsnew/maps.png">\n    <p><%=_("Integrated maps that display geographic data and summaries.").t()%></p>\n    <a href="<%=docLink%>whatsnew.nativemaps" class="external" target="_blank"><%=_("Documentation").t()%></a>\n</div>';});

define('views/shared/whatsnewdialog/Master',
[
    'jquery',
    'underscore',
    'module',
    'views/Base',
    'views/shared/Modal',
    'uri/route',
    'splunk.util',
    'contrib/text!views/shared/whatsnewdialog/Master.html'
],
function(
    $,
    _,
    module,
    Base,
    Modal,
    route,
    splunk_util,
    Template
){
    return Modal.extend({
        moduleId: module.id,
        template: Template,
        initialize: function() {
            Modal.prototype.initialize.apply(this, arguments);
            var self = this;
            this.on('hidden', function(){
                self.$el.remove();
                self.modalWrapper.remove();
                if(self.model.userPref && self.model.userPref.entry && self.model.userPref.entry.content){
                    self.model.userPref.entry.content.set('showWhatsNew', 0);
                    self.model.userPref.save();
                }
            });
            this.render();
        },
        render: function() {
            var imgPath = splunk_util.make_url('/static/img/');
            var docLink = route.docHelp(this.model.application.get("root"), this.model.application.get("locale"), '');
            var template = this.compiledTemplate({imgPath: imgPath, docLink: docLink});

            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("What's new in 6.0").t());
            this.$(Modal.FOOTER_SELECTOR).append('<a href="http://splunk.com/goto/splunk6demoapp" class="btn btn-primary external btn-large modal-btn-primary pull-right" target="_blank">' + _('Learn More').t() + '</a>');
            this.$(Modal.BODY_SELECTOR).html(template);
            this.modalWrapper = $('<div class="splunk-components"></div>');
            $(this.el).appendTo(this.modalWrapper);
            this.modalWrapper.appendTo('body');
            this.show();
            return this;
        }
    });
});

define('contrib/text!views/shared/splunkbar/HelpMenu.html',[],function () { return '<a href="#" class="dropdown-toggle"><%- _("Help").t() %><b class="caret"></b></a>\n<div class="dropdown-menu" id="global-help-menu">\n    <div class="arrow"></div>\n    <ul>\n        <li><a class="whatsnew" href="#"><%- _("What\'s New in 6.0").t() %></a></li>\n        <li><a class="external" href="<%- makeDocLink(\'search_app.tutorial\') %>" target="_blank"><%- _("Tutorials").t() %></a></li>\n        <li><a class="external" href="http://splunk-base.splunk.com/" target="_blank"><%- _("Splunk Answers").t() %></a></li>\n        <li><a class="external" href="http://www.splunk.com/support" target="_blank"><%- _("Contact Support").t() %></a></li>\n        <li><a class="external" href="<%- docLink %>" target="_blank"><%- _("Documentation").t() %></a></li>\n    </ul>\n    <form class="form-search" action="#help" method="get">\n    </form>\n</div>\n';});

define('views/shared/splunkbar/HelpMenu',
[
    'underscore',
    'jquery',
    'module',
    'views/Base',
    'views/shared/delegates/Popdown',
    'views/shared/controls/TextControl',
    'views/shared/whatsnewdialog/Master',
    'contrib/text!views/shared/splunkbar/HelpMenu.html',
    'splunk.util',
    'uri/route'
],
function(
    _,
    $,
    module,
    BaseView,
    Popdown,
    TextControl,
    WhatsNewDialogView,
    helpMenuTemplate,
    splunk_util,
    route
){
    return BaseView.extend({
        moduleId: module.id,
        template: helpMenuTemplate,
        tagName: 'li',
        className: 'dropdown help',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            this.children.searchInput = new TextControl({
                placeholder: _('Search Documentation').t(),
                inputClassName: 'input-medium search-query'
            });
            this.model.appLocal.on('change reset', this.debouncedRender, this);
            this.debouncedRender();
        },
        events: {
            'keypress input': "onDocsSearch",
            'click .whatsnew': 'onWhatsNew',
            'click .dropdown-menu a': 'closePopdown'
        },
        render: function(){
            var html = this.compiledTemplate({
                docLink: this.makeDocLinkForPage(),
                makeDocLink: this.makeDocLink.bind(this)
            });
            this.$el.html(html);

            var popup = this.$('#global-help-menu');
            popup.find('.form-search').append(this.children.searchInput.render().el);
            this.children.popdown = new Popdown({el:popup.parent(), mode: 'dialog'});
            return this;
        },
        onDocsSearch: function(evt){
            if (evt.keyCode === 13){ //ENTER
                var s = $(evt.target).val();
                evt.preventDefault();
                evt.stopPropagation();
                $.when(this.serverInfoDfd).then(function(){
                    var url = route.docSearch(this.model.application.get('locale'), this.model.serverInfo.entry.content.get('version'), splunk_util.normalizeBoolean(this.model.serverInfo.entry.content.get('isFree')), splunk_util.normalizeBoolean(this.model.serverInfo.entry.content.get('isTrial')), s);
                    window.open(url);
                }.bind(this));
                $(evt.target).val('');
                this.closePopdown();
                evt.preventDefault();
            }
        },
        makeDocLink: function(location) {
            return route.docHelpInAppContext(
                this.model.application.get("root"),
                this.model.application.get("locale"),
                location,
                this.model.application.get("app"),
                this.model.appLocal.entry.content.get('version'),
                this.model.appLocal.appAllowsDisable(),
                this.model.appLocal.entry.content.get('docs_section_override')
            );
        },
        makeDocLinkForPage: function() {
            //this is the generic doc link based on the current location
            var link = '/help',
                location;

            if(this.model.application.get('page') === '_admin'){
                // making help link for manager page
                location = 'manager';
                if(window && window.location && typeof window.location.pathname === 'string'){
                    //get the location from the browser
                    var pathname = window.location.pathname;
                    //remove '/manager/' and all characters before
                    pathname = pathname.substring(pathname.indexOf('/manager/')+9);
                    //next we should have app namespace to remove
                    pathname = pathname.substring(pathname.indexOf('/')+1);
                    //change slashes to dots
                    pathname = pathname.replace(new RegExp('/', 'g'), '.');
                    location += '.'+pathname;
                }

                link = route.docHelp(
                    this.model.application.get("root"),
                    this.model.application.get("locale"),
                    location
                );

            }else{
                // making help link for app page
                // location is in form: app.<app_name>.<page_name>
                location = [
                    'app',
                    this.model.application.get('app'),
                    this.model.application.get('page')
                ].join(".");

                link = this.makeDocLink(location);

            }
            return link;
        },
        onWhatsNew: function(e){
            if(e){
                e.preventDefault();
            }
            this.children.whatsNewDialog = new WhatsNewDialogView({
                model: this.model
            });
        },
        closePopdown: function(e){
            this.children.popdown.hide();
        }
    });
});

define('views/shared/WaitSpinner',['underscore', 'module', 'views/Base'], function(_, module, BaseView, splunkUtil) {
    
    
    return BaseView.extend({
        moduleId: module.id,
        tagName: 'div',
        initialize: function(){
            var defaults = {
              size: 'small',
              color: 'gray',
              frameWidth: 14, //px
              frameCount: 8,
              fps: 10
            };
            
            _.defaults(this.options, defaults);
        
            BaseView.prototype.initialize.apply(this, arguments);
            
            this.$el.addClass('spinner-' + this.options.size + '-' + this.options.color);
            this.frame=0;
        },
        stop:  function() {
            this.active=false;
            this.interval && window.clearInterval(this.interval);
            return this;
        },
        start:  function() {
            this.active=true;
            this.interval && window.clearInterval(this.interval);
            this.interval=setInterval(this.step.bind(this), 1000/this.options.fps);
            return this;
        },
        step:  function() {
            this.$el.css('backgroundPosition', '-' + (this.frame * this.options.frameWidth) + 'px top ');
            
            this.frame++;
            this.frame = this.frame == this.options.frameCount ? 0 : this.frame; 
        
            return this;
        },
        remove: function() {
            this.stop();
            BaseView.prototype.remove.apply(this, arguments);
        },
        render: function() {
            return this;
        }
    });
});

define('contrib/text!views/shared/splunkbar/messages/NoConnectionOverlay.html',[],function () { return '<div class="modal-backdrop fade in"></div>\n<div class="modal disconnection-warning-modal">\n\t<h3><%= _("Reconnecting to Splunk server").t() %></h3>\n\t<p><%= _("Your network connection may have been lost or Splunk server may be down.").t() %></p>\n</div>\n';});

define('views/shared/splunkbar/messages/NoConnectionOverlay',[
    'underscore',
    'module',
    'views/Base',
    'views/shared/WaitSpinner',
    'contrib/text!views/shared/splunkbar/messages/NoConnectionOverlay.html',
    'splunk.util'
],
    function(
        _,
        module,
        BaseView,
        WaitSpinnerView,
        Template,
        splunkUtil
        ){
        
        var image = new Image();
        image.src = splunkUtil.make_url("/static/img/skins/default/loading_medium_green.png");
        var image2x = new Image();
        image2x.src = splunkUtil.make_url("/static/img/skins/default/loading_medium_green_2x.png");
        
        
        return BaseView.extend({
            moduleId: module.id,
            template: Template,
            className: 'splunk-components',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                var spinnerOptions = {
                    color: 'green',
                    size: 'medium',
                    frameWidth: 19
                };
                
                this.children.spinner = new WaitSpinnerView(spinnerOptions);
                this.visible = false;
                this.$el.hide();
            },
            show: function() {
                if (this.visible) {
                    return;
                }
                
                this.visible = true;
                this.$el.show();
                this.children.spinner.start();
            },
            hide: function() {
                if (!this.visible) {
                    return;
                }
                
                this.visible = false;
                this.$el.hide();
                this.children.spinner.stop();
            },
            render: function() {
                this.$el.html(this.compiledTemplate);
                this.$(".modal").append(this.children.spinner.render().el);
                return this;
            }
        });
    });

define('contrib/text!views/shared/splunkbar/Master.html',[],function () { return '\n<div class="navbar-inner">\n    <div class="no_connection-overlay"></div>\n    <a href="<%-homeLink%>" class="brand" title="splunk &gt; <%- _(\'listen to your data\').t() %>">splunk<strong>&gt;</strong></a>\n    <ul class="navbar-global-nav nav">\n        <li class="dropdown apps">\n            <a href="#" class="dropdown-toggle"><%- _("Apps").t() %><b class="caret"></b></a>\n        </li>\n    </ul>\n\n    <ul class="navbar-global-nav nav pull-right">\n        <li class="dropdown user"></li>\n        <li class="dropdown messages"><a href="#" class="dropdown-toggle"><%- _("Messages").t() %><b class="caret"></b></a></li>\n        <li class="dropdown system<%- options.section==\'system\' ? \' active \' : \'\'%>">\n            <a href="#" class="dropdown-toggle"><%- _("System").t() %><b class="caret"></b></a>\n        </li>\n        <li class="dropdown activity"><a href="#"><%- _("Activity").t() %></a></li>\n        <li class="dropdown help"><a href="#" class="dropdown-toggle"><%- _("Help").t() %><b class="caret"></b></a></li>\n    </ul><!-- /.user-nav -->\n</div><!-- /.navbar-inner -->\n';});

define('util/csrf_protection',
    [
        'jquery',
        'splunk.util'
    ],
    function($, splunkUtils) {
        var HEADER_NAME = 'X-Splunk-Form-Key';
        var FORM_KEY = splunkUtils.getFormKey();

        if ($) {
            $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
                if (options['type'] && options['type'].toUpperCase() == 'GET') return;
                jqXHR.setRequestHeader(HEADER_NAME, FORM_KEY);
            });

            $(document).ready(function() {
                $(document).bind('ajaxError', function(event, xhr, opts, err) {
                    // because we'll get a 401 when logout is clicked, prevent 
                    // /en-US/account/login?return_to=/en-US/account/logout from happening
                    var pathname = window.location.pathname;
                    if (xhr.status === 401 && pathname.indexOf('/account/logout') === -1) {
                        document.location = splunkUtils.make_url('account/login?return_to=' + encodeURIComponent(pathname + document.location.search));
                        return;
                    }
                });
            });
        } else {
            throw "Splunk's jQuery.ajax extension requires jQuery.";   
        }
    }
);

/* Insert a jQuery ajax prefilter that sets options.cache=false for all GET requests
 * This is a preventative measure to avoid an intermittent bug in Chrome 28 (see SPL-71743)
 */ 

define('util/ajax_no_cache',
    [
        'jquery'
    ],
    function($) {
        if ($) {
            $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
                if (options.type && options.type.toUpperCase() == 'GET' && options.cache === undefined) {
                    options.cache = false;
                }
            });

        } else {
            throw "ajax_no_cache requires jQuery.";   
        }
    }
);

// splunk bar
define('views/shared/splunkbar/Master',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'splunk.util',
    'helpers/Session',
    'views/Base',
    'views/shared/delegates/Popdown',
    'views/shared/splunkbar/AppMenu',
    'views/shared/splunkbar/SystemMenu',
    'views/shared/splunkbar/UserMenu',
    'views/shared/splunkbar/messages/Master',
    'views/shared/splunkbar/ActivityMenu',
    'views/shared/splunkbar/HelpMenu',
    'views/shared/splunkbar/messages/NoConnectionOverlay',
    'models/services/data/UserPref',
    'models/services/AppLocal',
    'models/services/authentication/User',
    'models/services/server/ServerInfo',
    'models/services/configs/Web',
    'models/Application',
    'collections/services/authentication/CurrentContexts',
    'collections/services/AppLocals',
    'collections/services/Messages',
    'collections/services/data/ui/Managers',
    'collections/SystemMenuSections',
    'helpers/polling_manager',
    'contrib/text!views/shared/splunkbar/Master.html',
    'uri/route',
    'splunk.util',
    'util/splunkd_utils',
    'util/csrf_protection',
    'util/ajax_no_cache'
],
function(
    $,
     _,
     Backbone,
     module,
     splunk_util,
     Session,
     BaseView,
     Popdown,
     AppMenuView,
     SystemMenu,
     UserMenu,
     MessagesView,
     ActivityMenu,
     HelpMenu,
     NoConnectionOverlay,
     UserPrefModel,
     AppLocalModel,
     UserModel,
     ServerInfoModel,
     WebConfModel,
     ApplicationModel,
     CurrentContextsCollection,
     AppsCollection,
     MessagesCollection,
     ManagersCollection,
     SystemMenuSectionsCollection,
     polling_manager,
     globalTemplate,
     route,
     splunkUtil,
     splunkDUtils
){
    var View = BaseView.extend({
        moduleId: module.id,
        template: globalTemplate,
        className: 'navbar',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.MAX_RETRIES_BEFORE_FAIL = 3;
            this.MESSAGES_POLLING_DELAY_STANDARD = 60000;
            this.MESSAGES_POLLING_DELAY_HI_FREQ = 1000;
            this.isFreeDfd = $.Deferred();
            this.cntRetries = 0;
            if (this.model.serverInfo.entry.content.has('isFree')){
                if (splunkUtil.normalizeBoolean(this.model.serverInfo.entry.content.get('isFree'))) {
                    this.isFreeDfd.resolve();
                } else {
                    this.isFreeDfd.reject();
                }
            } else {
                this.model.serverInfo.on('change reset', function() {
                    if (splunkUtil.normalizeBoolean(this.model.serverInfo.entry.content.get('isFree'))) {
                        this.isFreeDfd.resolve();
                    } else {
                        this.isFreeDfd.reject();
                    }
                }.bind(this));
            }
            Session.on('restart timeout', function() {
                polling_manager.stop(this.collection.messages);
            }, this);
            Session.on('start', function() {
                polling_manager.start(this.collection.messages);
            }, this);
        },
        remove: function() {
            BaseView.prototype.remove.apply(this, arguments);
            Session.off('restart timeout start', null, this);
            return this;
        },
        render: function() {
            var homeLink = route.page(
                this.model.application.get('root'),
                this.model.application.get('locale'),
                'launcher',
                'home'
            );
            var html = this.compiledTemplate({
                makeUrl: splunk_util.make_url,
                options: this.options,
                homeLink: homeLink
            });
            this.$el.html(html);

            var activeMenu = this.getActiveMenu();

            this.children.apps = new AppMenuView({
                collection: this.collection,
                model: this.model,
                activeMenu: activeMenu
            });
            this.$('.apps.dropdown').replaceWith(this.children.apps.el);

            this.children.systemMenu = new SystemMenu({
                collection: {
                    sections: this.collection.sections
                },
                model: {
                    application: this.model.application
                }
            });
            this.$('.system.dropdown').replaceWith(this.children.systemMenu.el);

            this.isFreeDfd.fail(function() {
                this.children.userMenu = new UserMenu({
                    collection: {
                        currentContext: this.model.currentContext //this represents the current logged in user
                    },
                    model: {
                        user: this.model.user,
                        application: this.model.application,
                        webConf: this.model.webConf
                    }
                });
                this.$('.user.dropdown').replaceWith(this.children.userMenu.el);
            }.bind(this));

            this.children.messages = new MessagesView({
                collection: {
                    messages: this.collection.messages,
                    legacyMessages: this.collection.legacyMessages
                }
            });

            this.children.noConnectionOverlay = new NoConnectionOverlay();
            $('body').append(this.children.noConnectionOverlay.render().el);

            this.collection.messages.on('serverValidated', function(success, context, messages) {
                if (success && this.cntRetries > 0) {
                    this.restartMessagePolling(this.MESSAGES_POLLING_DELAY_STANDARD);
                    this.children.noConnectionOverlay.hide();
                    this.cntRetries = 0;
                    return;
                }
                var netErrorMsg = _.find(messages, function(msg) {
                    return msg.type == splunkDUtils.NETWORK_ERROR || 'network_error';
                });
                if (netErrorMsg) {
                    if (this.cntRetries == 0) {
                        this.restartMessagePolling(this.MESSAGES_POLLING_DELAY_HI_FREQ);
                    }
                    if (this.cntRetries >= this.MAX_RETRIES_BEFORE_FAIL) {
                        this.children.noConnectionOverlay.show();
                    }
                    this.cntRetries += 1;
                }
            }, this);
            this.$('.messages.dropdown').replaceWith(this.children.messages.render().el);
            this.restartMessagePolling(this.MESSAGES_POLLING_DELAY_STANDARD);

            this.children.activityMenu = new ActivityMenu({
                model: {
                    user: this.model.user,
                    application: this.model.application
                }
            });
            this.$('.activity').replaceWith(this.children.activityMenu.el);

            this.children.helpMenu = new HelpMenu({
                model: this.model
            });
            this.$('.help').replaceWith(this.children.helpMenu.el);

            // highlight the active menu
            if (activeMenu){
                this.$(activeMenu.selector).addClass("active");
            }

            return this;
        },
        restartMessagePolling: function(interval) {
            polling_manager.stop(this.collection.messages);
            polling_manager.start(this.collection.messages, {delay: interval, ui_inactivity: true,  stopOnError: false, data: {count: 1000}});
        },
        getActiveMenu: function() {
            // the active menu is based on the current page
            // get path
            var path = Backbone.history.location.pathname;
            var pathComponents = path.split("/"),
                pathComponentsLen = pathComponents.length;
            var appAndPageComponents = [pathComponents[pathComponentsLen-2], pathComponents[pathComponentsLen-1]];
            var appAndPage = appAndPageComponents.join("/");
            var locale = this.model.application.get('locale');
            var app = this.model.application.get('app');

            var activityPages = ["search/status_index",
                                 "search/search_status", "search/search_detail_activity", "search/search_activity_by_user",
                                 "search/splunkweb_status", "search/internal_messages",
                                 "search/scheduler_status", "search/scheduler_user_app", "search/scheduler_savedsearch", "search/scheduler_status_errors", "search/pdf_activity"];
            var changePasswordPage = "authentication/changepassword";
            var jobManagerPage = app + '/job_management';
            var triggeredAlertsPage = locale + '/alerts';
            var homePage = "launcher/home";
            var managerPage = locale + "/manager";

            var activeMenuSelector = null;
            var activeMenuName = '';
            if (activityPages.indexOf(appAndPage) > -1 ||
                path.indexOf(jobManagerPage) > -1 ||
                path.indexOf(triggeredAlertsPage) > -1) {
                activeMenuSelector = '.activity';
                activeMenuName = "activity";
            } else if (path.indexOf(changePasswordPage) > -1) {
                activeMenuSelector = '.user';
                activeMenuName = "user";
            } else if (path.indexOf(managerPage) > -1) {
                activeMenuSelector = 'menu-system';
                activeMenuName = "manager";
            } else if (path.indexOf(homePage) > -1) {
                activeMenuSelector = '.brand';
                activeMenuName = "home";
            } else {
                activeMenuSelector = '.menu-apps';
                activeMenuName = "app";
            }

            return {
                selector: activeMenuSelector,
                name: activeMenuName
            };
        }
    },
    {
        create: function(options){
            options = options || {};
            options.collection = options.collection || {};
            options.model = options.model || {};

            //the APPLICATION model is REQUIRED argument from the consumer. If its not passed, make up an empty one, to keep things rendering, and assure continuance
            //TODO should log this
            var applicationDfd = $.Deferred();
            if(!options.model.application){
                options.model.application = new ApplicationModel();
            }
            // handle both when the application model is already filled and when it has yet to complete fetching
            if (options.model.application.get('app')) {
                applicationDfd.resolve();
            } else {
                options.model.application.on('change', applicationDfd.resolve);
            }

            if(!options.model.appLocal) {
                options.model.appLocal = new AppLocalModel();
                applicationDfd.done(function() {
                    if (options.model.application.get("app") !== 'system') {
                        options.model.appLocal.fetch({
                            url: splunkDUtils.fullpath(options.model.appLocal.url + "/" + encodeURIComponent(options.model.application.get("app"))),
                            data: {
                                app: options.model.application.get("app"),
                                owner: options.model.application.get("owner")
                            }
                        });
                    }
                });
            }

            var currentUserIdDfd = $.Deferred();
            currentUserIdDfd.resolve(options.model.application.get('owner'));

            var appsDfd = $.Deferred();

            var appsCollection;
            if(!options.collection.apps){
                appsCollection = options.collection.apps = new AppsCollection();
                $.when(currentUserIdDfd).done(function(){
                    appsCollection.fetch({
                        data: {
                            sort_key: 'name',
                            sort_dir: 'desc',
                            app: '-' ,
                            owner: options.model.application.get('owner'),
                            search: 'visible=true AND disabled=0 AND name!=launcher',
                            count: -1
                        }
                    });
                    appsCollection.on('reset sort', appsDfd.resolve);
                });
            } else {
                appsDfd.resolve();
            }

            if (!options.model.userPref){
                options.model.userPref = new UserPrefModel();
                options.model.userPref.fetch({data: {app:'user-prefs', owner: options.model.application.get('owner'), count:-1}});
                appsCollection = options.collection.apps;
                options.model.userPref.on('change', function(){
                    appsDfd.done(function(){
                        appsCollection.sortWithString(options.model.userPref.entry.content.get('appOrder'));
                        appsCollection.trigger('ready');
                    });
                });
            }

            var currentUserDfd = $.Deferred();
            if(!options.model.user){
                options.model.user = new UserModel();
                $.when(currentUserIdDfd).done(function(currentUserId){
                    options.model.user.set('id', encodeURIComponent(currentUserId));
                    options.model.user.fetch();
                });
            }
            options.model.user.on('reset', function(){
                currentUserDfd.resolve(options.model.user);
            });

            if (!options.collection.messages) {
                options.collection.messages = new MessagesCollection();
            }

            if (!options.collection.managers){
                options.collection.managers = new ManagersCollection();
                $.when(currentUserIdDfd).done(function(currentUsername){
                    options.collection.managers.fetch({
                        data: {
                            app: '-',
                            owner: currentUsername,
                            count: 0,
                            digest: 1
                        }
                    });
                });
            }

            var sections = options.collection.sections = new SystemMenuSectionsCollection();

            sections.add({
                id: 'knowledge_configurations',
                label: _('Knowledge').t(),
                icon: 'bookmark',
                order: 1
            });
            sections.add({
                id: 'auth_configurations',
                label: _('Users and authentication').t(),
                icon: 'user',
                order: 6
            });
            sections.add({
                id: 'deployment_configurations',
                label: _('Distributed environment').t(),
                icon: 'distributed-environment',
                order: 5
            });
            sections.add({
                id: 'system_configurations',
                label: _('System').t(),
                icon: 'settings',
                order: 2
            });
            sections.add({
                id: 'data_configurations',
                label: _('Data').t(),
                icon: 'data',
                order: 4
            });

            options.collection.managers.on('reset', function(){
                options.collection.managers.each(function(manager){
                    var menuUrl = manager.entry.content.get('menu.url') || '',
                        sectionName = manager.entry.content.get('menu.name'),
                        disabledByLicense = splunkUtil.normalizeBoolean(manager.entry.content.get('disabled_by_license') || false),
                        order = manager.entry.content.get('menu.order') || 1000,
                        pageStart = route.encodeRoot(options.model.application.get('root'), options.model.application.get('locale')),
                        url = pageStart + splunk_util.sprintf(menuUrl, {namespace: options.model.application.get('app') || 'NOTHING'});

                    if(!disabledByLicense && sectionName){
                        var section = sections.get(sectionName);
                        if(section){
                            var sectionItems = section.get('items');
                            if(sectionItems){
                                sectionItems.push(manager);
                            }
                        }
                    }

                    manager.set({
                        url: url,
                        order: order
                    });
                });

                sections.trigger('ready');
            });

            if (!options.model.serverInfo) {
                options.model.serverInfo = new ServerInfoModel();
                options.model.serverInfo.fetch();
            }

            options.model.webConf = new WebConfModel({id: 'settings'});
            options.model.webConf.fetch();

            return new View(options);
        }
    });
    return View;
});

define('contrib/text!views/shared/appbar/NavItem.html',[],function () { return '<% var hasSubmenu = item.submenu && item.submenu.length && item.submenu.length > 0; %>\n<a href="<%-item.uri%>" title="<%-item.label%>" class="<%=hasSubmenu ? \'dropdown-toggle\' : \'\'%>" <%=hasSubmenu ? \'data-toggle="popdown"\' : \'\'%>>\n    <%=_(item.label).t()%>\n    <%if(hasSubmenu){%>\n       <b class="caret"></b>\n    <%}%>\n</a>\n<%if(hasSubmenu){%>\n    <div class="dropdown-menu">\n    \t<div class="arrow"></div>\n    \t<div class="slideNavPlaceHolder"></div>\n    </div>\n<%}%>\n';});

define('contrib/text!views/shared/AppNav-SlideNavTemplate.html',[],function () { return '<%if(!submenu){return "";}%>\n<ul class="slidenavList scroll-group">\n    <% _.each(submenu, function(i, index) { %>\n    <li data-index="<%=index%>" class="<%=i.divider ? \'divider\':\'\'%>">\n        <% if(!i.divider){ %>\n            <% if(i.submenu && i.submenu.length>0){ %>\n                <a href="#">\n                    <%- _.unescape(_(i.label).t()) %>\n                </a>\n                <i class="icon-triangle-right-small"></i>\n            <%}else if (i.hasOwnProperty(\'reportUri\')) { %>\n                <a href="<%=i.reportUri%>" class="primary-link">\n                    <%- _.unescape(_(i.label).t()) %>\n                </a>\n                <a href="<%=i.uri%>" class="secondary-link">\n                    <i class="icon-<%= i.hasOwnProperty(\'dispatchView\') && i.dispatchView === \'pivot\' ? \'pivot\' : \'search\' %>"></i>\n                </a>\n            <%} else { %>\n                <a href="<%=i.uri%>">\n                    <%- _.unescape(_(i.label).t()) %>\n                </a>\n            <%}%>\n        <%}%>\n    </li>\n    <% }); %>\n</ul>\n';});

define('splunk.widget.slidenav',['jquery', 'jquery.ui.widget', 'jquery.ui.position'], function($){
    return $.widget( "splunk.slidenav", {
        options: {
            levelTemplate: '',
            navData: {},
            childPropertyName: 'children',
            backText: 'Back'
        },
        _create: function(){
            var self = this;
            this.isAnimating = false;
            this.$el = $(this.element);
            this.$wrap = $('<div class="auto"></div>');
            this.$el.append(this.$wrap);
            this._chain = [this.addLevel(this.options.navData)];
            this.$backButton = $(self.templateBack());
            this.$el.prepend(this.$backButton);
            this.$backButton.on('click', function(event){
                self.back();
                event.preventDefault();
            });
            this.$el.on('click', 'LI', function(event){
                var li = $(event.target).closest('LI');
                self.select(li, event);
            });
        },
        addLevel: function(navData){
            var newLevel = $(this.options.levelTemplate(navData));
            this.$wrap.append(newLevel);
            if(this._chain){
                newLevel.position({
                    of: this._chain[this._chain.length-1],
                    my: 'left top',
                    at: 'right top',
                    collision: 'none',
                    offset: "0 0"
                });
            }
            newLevel.data('slidenav', navData);
            return newLevel;
        },
        select: function(selected, event){
            if(this.isAnimating){
                return false;
            }
            var ul = selected.closest('ul'),
                navData = ul.data('slidenav'),
                selectedIndex = selected.data("index");
            selected = navData[this.options.childPropertyName][selectedIndex];
            if(selected[this.options.childPropertyName] && selected[this.options.childPropertyName].length > 0){
                if(event){
                    event.preventDefault();
                }
                this.next(selected);
            }else{
                this._trigger('select', event, selected);
            }
        },
        next: function(selected){
            var current = this._chain[this._chain.length-1] || null;
            selected.domReference = selected.domReference || this.addLevel(selected);
            this._chain.push(this.slide(selected.domReference.show(), function(){
                current.find('a').prop('tabindex', '-1');
                selected.domReference.find('a').first().focus();
            }));
            this.$backButton.show();
        },
        back: function(){
            if(this._chain.length <= 1 || this.isAnimating){
                return false;
            }
            if(this._chain.length === 2){
                this.$backButton.hide();
            }
            var $hide = this._chain.pop(),
                to = this._chain[this._chain.length-1];
            this.slide(to, function(){
                $hide.scrollTop(0).hide();
                to.find('a').prop('tabindex', '0');
            });
        },
        slide: function(to, callback){
            var self = this;
            this.$wrap.outerHeight(to.outerHeight());
            this.isAnimating = true;
            this.$wrap.animate({
                left: -to.position().left
            }, {
                duration: 200,
                complete: function(){
                    self.isAnimating = false;
                    if(callback){
                        callback.apply(self, arguments);
                    }
                }
            });
            return to;
        },
        templateBack: function(){
            return this.options.templateBack || '<div class="backbutton" style="display: none;"><a href="#" class="slidenavback "><i class="icon-triangle-left-small"></i>'+this.options.backText+'</a></div>';
        }
    });
});

define('views/shared/appbar/NavItem',[
    'jquery',
    'underscore',
    'module',
    'views/Base',
    'views/shared/delegates/Popdown',
    'contrib/text!views/shared/appbar/NavItem.html',
    'contrib/text!views/shared/AppNav-SlideNavTemplate.html',
    'views/shared/delegates/StopScrollPropagation',
    'splunk.widget.slidenav'//no import
],
function(
    $,
    _,
    module,
    BaseView,
    Popdown,
    templateNavItem,
    templateSlideNav,
    StopScrollPropagation
){
    var templateSlideNavCompiled = _.template(templateSlideNav);
    var View = BaseView.extend({
            moduleId: module.id,
            className: 'nav-item',
            tagName: 'li',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
            },
            render: function() {
                var html;
                if (this.options.navItemObj.divider) {
                    html = _.template(this.dividerTemplate, {});
                } else {
                    html = _.template(templateNavItem, {
                        item: this.options.navItemObj,
                        isActive: this.options.isActive
                    });
                }
                this.$el.append(html);
                this.$el.addClass('nav-item-'+this.options.navItemObj.viewName);
                if(this.options.navItemObj.submenu && this.options.navItemObj.submenu.length > 0){
                    this.$el.addClass('dropdown');
                    this.slideNav = this.$el.find('.slideNavPlaceHolder').slidenav({
                        navData: this.options.navItemObj,
                        levelTemplate: templateSlideNavCompiled,
                        childPropertyName: 'submenu',
                        backText: _('Back').t()
                    });

                    this.popdown = new Popdown({
                        el: this.$el,
                        dialog: this.slidenav,
                        mode: 'dialog'
                    });

                    this.children.stopScrollPropagation = new StopScrollPropagation({el:this.slideNav.find('.slidenavList')});
                }

                return this;
            },
            dividerTemplate: '<span class="divider" style="display: block;float: left;height: 10px;margin: 0 15px;opacity: 0.2;"></span>'
        }
    );
    return View;
});

define('views/shared/appbar/AppNav',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base',
    'views/shared/appbar/NavItem'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    NavItem
){
    return BaseView.extend({
        moduleId: module.id,
        tagName: 'ul',
        className: 'nav nav-pills',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.appNav.on('change:nav', this.debouncedRender, this);
            this.model.application.on('change:page', this.setActiveItem, this);
            this.debouncedRender();
        },
        render: function() {
            var self = this;
            var navData = this.model.appNav.get('nav');
            if(!navData){return this;}

            this.$el.html('');
            $.each(navData, function(index, navItemObj){
                var navItemView = new NavItem({
                    navItemObj: navItemObj
                });
                self.$el.append(navItemView.render().$el);
            });

            this.setActiveItem.call(this);

            return this;
        },
        setActiveItem: function(){
            var self = this;

            if(this.model.application.get('page')){
                var activePage = this.model.application.get('page');
                var activeItem = self.$el.find('.nav-item-'+activePage);
                activeItem.addClass('active');
            }
        }
    });
});

define('contrib/text!views/shared/appbar/AppLabel.html',[],function () { return '<a class="app-link" href="<%=appLink%>">\n    <div class="app-logo"></div>\n\n    <div class="app-name">\n        <span class="app-label">\n            <%-_(appLabel).t()%>\n        </span>\n    </div>\n</a>\n';});

define('views/shared/appbar/AppLabel',[
    'underscore',
    'module',
    'views/Base',
    'contrib/text!views/shared/appbar/AppLabel.html'
],
function(
    _,
    module,
    BaseView,
    templateAppLabel
){
    return BaseView.extend({
        moduleId: module.id,
        className: 'app-bar-label-wrapper',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.appNav.on('change', this.render, this);
        },
        showLogo: function(){
            this.$el.find('.app-logo').show();
            this.$el.find('.app-name').hide();
        },
        showName: function(){
            this.$el.find('.app-name').show();
            this.$el.find('.app-logo').hide();
        },
        render: function(){
            var label = this.model.appNav.get('label') || '';

            var html = _.template(templateAppLabel, {
                appLink: this.model.appNav.get('link'),
                appLabel: label,
                appIcon: this.model.appNav.get('icon'),
                appLogo: this.model.appNav.get('logo')
            });
            this.$el.html(html);

            this.setAppLabelDisplay();

            return this;
        },
        setAppLabelDisplay: function(){
            if (this.model.appNav.get('logo')) {
                var img = new Image();
                img.onload = function(){
                    if(parseInt(img.width, 10) < 2){
                        this.showName();
                    }else{
                        this.$el.find('.app-logo').empty().append(img);
                        this.showLogo();
                    }
                }.bind(this);

                img.onerror = function(){
                    this.showName();
                }.bind(this);

                img.src = this.model.appNav.get('logo');
            }
        }
    });
});

define('contrib/text!views/shared/appbar/Master.html',[],function () { return '<h2 class="app-name pull-right"></h2>\n<div class="nav">\n</div>\n';});

/**
 * @author Leo
 *
 * Produces a JSON object containing necessary data to construct an app's navigation menu.
 *
 */
define('helpers/AppNav',[
    'jquery',
    'underscore',
    'backbone',
    'splunk.util'
],
function (
    $,
    _,
    Backbone,
    splunk_util
){
    var app,
        views,
        rootEndpoint,
        searches,
        nav,
        seenViews = [],
        seenSearches = [];

    /**
     * Filters the collection to models belonging to the current app, optionally with name matching a string and
     * optionally among those that haven't been processed yet.
     *
     * @param collection Input collection
     * @param match {String} optional String to match
     * @param seen {Array} optional list of already processed objects that should be skipped
     * @return {Array} filtered array of models
     */
    function getMatchingItems(collection, match, seen) {
        return collection.filter(function(it) {
            var itApp =  it.entry.acl.get('app'),
                itName = it.entry.get('name'),
                isGlobal = it.entry.acl.get('sharing') === 'global';
            if (!isGlobal && itApp !== app) {
                return false;
            }
            if (match) {
                return (itName.toLowerCase().indexOf(match.toLowerCase())>-1 && !(seen && seen.indexOf(app+'/'+itName)>-1));
            } else {
                return !(seen && seen.indexOf(app+'/'+itName)>-1);
            }
        });
    }

    /**
     * Searches views collection for a view name to get its label
     *
     * @param name {String} view name
     * @return {Object} containing view label
     */
    function getViewProps(viewName) {
        var obj, view, i, v;
        views = views || [];
        for (i=0; i<views.length; i++) {
            v = views.at(i);
            if (v.entry.get('name').toLowerCase() === viewName.toLowerCase()) {
                // allow either a view local to the current app
                if (v.entry.acl.get('app') == app) {
                    view = v;
                    break; // local views have priority over global ones

                // or a globally shared view from another app
                } else if (v.entry.acl.get('sharing') == 'global') {
                    view = v;
                }
            }
        }

        if (view) {
            if (!view.entry.content.get('isVisible')) {
                return false;
            }
            obj = {
                label: view.entry.content.get('label') || viewName,
                uri: splunk_util.make_url('app', app, viewName),
                viewName: viewName,
                app: app
            };
        } else {
            return false;
        }
        return obj;
    }

    /**
     * Searches saved searches collection for a search name to get its properties
     * @param name {String} search name
     * @return {Object} containing search properties
     */
    function getSavedProps(name) {
        var obj,
            saved = searches.find(function(s) {
                return (s.entry.get('name').toLowerCase() === name.toLowerCase());
            });
        if (saved) {
            obj = {
                uri: splunk_util.make_full_url('app/'+encodeURIComponent(app)+'/@go', {'s': saved.id}),
                sharing: saved.get('sharing'),
                label: name,
                reportUri: splunk_util.make_full_url('app/'+encodeURIComponent(app)+'/report', {'s': saved.id})
            };
            if (saved.entry.content.get('request.ui_dispatch_view')) {
                obj.dispatchView = saved.entry.content.get('request.ui_dispatch_view');
            }
        } else {
            return false;
        }
        return obj;
    }

    function sanatizeHref(href){
        if(typeof href !== 'string'){
            return false;
        }
        var decodedhref = $("<div></div>").html(href).text();
        decodedhref = window.decodeURI(decodedhref);
        decodedhref = decodedhref.replace(/(\r\n|\n|\r|\s)/gm,'').toLowerCase();
        if(decodedhref.indexOf(':') > -1 &&
            decodedhref.indexOf('javascript:') > -1 ||
            decodedhref.indexOf('vbscript:') > -1 ||
            decodedhref.indexOf('data:') > -1 ||
            decodedhref.indexOf('livescript:') > -1){
            href = false;
        }
        return href;
    }

    /**
     * Recursively go through nav xml, building a json object
     *
     * @param nav {xml}
     * @return {Object} JSON object
     */
    function parseNavXml(nav) {
        var output = [],
            c;
        for (c=0; c<nav.length; c++) {
            var node = nav[c],
                $node = $(node),
                nodeName = splunk_util.lowerTrimStr(node.nodeName),
                obj;

            if (nodeName === 'collection') {
                obj = {
                    label: $node.attr('label'),
                    uri: '#'
                };
                // recursion warning!
                var children = parseNavXml($node.children());
                if (!children.submenu.length ||
                    !_.find(children.submenu, function(obj) { return !obj.divider; })) {
                    // skip empty collections and ones containing only dividers
                    continue;
                }
                _.extend(obj, children);
            /*
            Views
             */
            } else if (nodeName === 'view') {
                var viewName = $node.attr('name'),
                    isDefault = splunk_util.normalizeBoolean($node.attr('default')||"false"),
                    source = splunk_util.lowerTrimStr($node.attr('source')),
                    match = $node.attr('match');

                if (viewName) {
                    obj = getViewProps(viewName);
                    if (!obj) {
                        continue;
                    }
                    if (isDefault) {
                        obj.isDefault = isDefault;
                    }
                    // mark as seen
                    seenViews.push(app+'/'+viewName);

                } else if (source) {
                    var matchedViews = [],
                        i;
                    if (source == 'all') {
                        matchedViews = getMatchingItems(views, match);
                    } else if (source == 'unclassified') {
                        matchedViews = getMatchingItems(views, match, seenViews);
                    }
                    for (i=0; i<matchedViews.length; i++) {
                        viewName = matchedViews[i].entry.get('name');
                        obj = getViewProps(viewName);
                        if (!obj) {
                            continue;
                        }
                        if (!matchedViews[i].entry.content.get('isDashboard')) {
                            continue;
                        }
                        // mark as seen
                        seenViews.push(app+'/'+viewName);
                        output.push(obj);
                    }
                    obj = false;
                }

            /*
             Saved searches
             */
            } else if (nodeName === 'saved') {
                var savedName = $node.attr('name');
                source = splunk_util.lowerTrimStr($node.attr('source'));
                match = $node.attr('match');

                if (savedName) {
                    obj = getSavedProps(savedName);
                    if (!obj) {
                        continue;
                    }
                    seenSearches.push(app+'/'+savedName);
                } else if (source) {
                    var matchedSearches = [];
                    if (source == 'all') {
                        matchedSearches = getMatchingItems(searches, match);
                    } else if (source == 'unclassified') {
                        matchedSearches = getMatchingItems(searches, match, seenSearches);
                    }
                    for (i=0; i<matchedSearches.length; i++) {
                        savedName = matchedSearches[i].entry.get('name');
                        obj = getSavedProps(savedName);
                        if (!obj) {
                            continue;
                        }
                        // mark as seen
                        seenSearches.push(app+'/'+savedName);
                        output.push(obj);
                    }
                    obj = false;
                }
            } else if (nodeName === 'a') {
                var href = sanatizeHref($node.attr('href'));
                if(href===false){
                    obj=false;
                }else{
                    if (href.indexOf('/') === 0 && href[1] !== '/'){
                        href = splunk_util.make_url(href);
                    }
                    obj = {
                        label: $node.text(),
                        uri: href,
                        viewName: $node.attr('name') || ''
                    };
                }
            } else if (nodeName === 'divider') {
                obj = {
                    label: '',
                    divider: true
                };
            } else {
                obj = {
                    label: 'unknown node in nav'
                };
            }

            if (obj) {
                output.push(obj);
            }

        }
        return {submenu: output};
    }

    function parseNavModel(nav, viewsCollection, savedSearchCollection, rootPath){
        var xmlNavString = nav.entry.content.get('eai:data').replace(/\&/g, "&amp;"),
            navXmlObj = $($.parseXML(xmlNavString)),
            root = navXmlObj.find('nav'),
            searchView = root.attr('search_view'),
            appColor = root.attr('color');

        seenViews = seenSearches = [];
        app = nav.entry.content.get('eai:appName');
        views = viewsCollection;
        rootEndpoint = rootPath || '';
        searches = new Backbone.Collection(savedSearchCollection.filter(function(model) {
            var appMatch = model.entry.acl.get('app') == app,
                isGlobal = model.entry.acl.get('sharing') == 'global';
            return appMatch || isGlobal;
        }));
        return {
            nav: parseNavXml(root.children()).submenu,
            searchView: searchView,
            color: appColor
        };
    }

    /**
     * Entry point, kicking off the parsing.
     *
     * @param navsCollection {Collection} output of /data/ui/nav endpoint
     * @param viewsCollection {Collection} output of /data/ui/views endpoint
     * @param savedSearchCollection {Collection} output of /saved/searches endpoint
     *
     * @return {Array} of JSON objects or null if appname is undefined or nav coll is empty
     */
    function parseNavCollection(navsCollection, viewsCollection, savedSearchCollection, rootPath) {
        var result = [];
        rootEndpoint = rootPath || '';
        seenViews = seenSearches = [];
        if (!navsCollection || navsCollection.length == 0) {
            return null;
        }
        navsCollection.each(function(nav){
            result.push(
                parseNavModel(nav,viewsCollection, savedSearchCollection)
            );
        });
        return result;
    }

    return {
        parseNavModel: parseNavModel,
        parseNavCollection: parseNavCollection
    };
});
/**
 * Util package for working with colors.
 */
define('util/color_utils',['underscore'], function(_) {

    var hslColorFromRgbColor = function(rgbColor) {
        /**
         * convert from [r,g,b] to [h,s,l]
         *  r,g,b: [0,255]
         *  h: [0,360)
         *  s: [0,100]
         *  l: [0,100]
         *  Uses algorithm as specified on Wikipedia http://en.wikipedia.org/wiki/HSL_and_HSV
         */

        var r = rgbColor[0];
        var g = rgbColor[1];
        var b = rgbColor[2];
        var computedH = 0;
        var computedS = 0;
        var computedL = 0;

        if (r === null || g === null || b === null ||
            isNaN(r) || isNaN(g)|| isNaN(b) ) {
            return null;
        }

        if (r < 0 || g < 0 || b < 0 ||
            r > 255 || g > 255 || b > 255) {
            return null;
        }

        r = r / 255;
        g = g / 255;
        b = b / 255;
        var minRGB = Math.min(r, Math.min(g, b));
        var maxRGB = Math.max(r, Math.max(g, b));
        var chroma = maxRGB - minRGB;

        var h_prime = 0;
        if (chroma == 0) {
            h_prime = 0;
        }
        else if (maxRGB == r) {
            h_prime = ((g - b) / chroma) % 6;
        } else if (maxRGB == g) {
            h_prime = ((b - r) / chroma) + 2;
        } else if (maxRGB == b) {
            h_prime = ((r - g) / chroma) + 4;
        }

        var h = h_prime * 60;
        while (h < 0)
        {
            h += 360;
        }
        while (h > 360)
        {
            h -= 360;
        }

        var l = 0.5 * (maxRGB + minRGB);

        var s = 0;
        if (chroma == 0) {
            s = 0;
        } else {
            s = chroma / (1 - Math.abs(2 * l - 1));
        }

        if (s < 0) { s = 0; }
        if (s > 1) { s = 1; }
        if (l < 0) { l = 0; }
        if (l > 1) { l = 1; }

        return [h, s * 100, l * 100];
    };

    var rgbColorFromHslColor = function(hslColor) {
        /**
         * convert from [h,s,l] to [r,g,b]
         *  r,g,b: [0,255]
         *  h: [0,360)
         *  s: [0,100]
         *  l: [0,100]
         *  Uses algorithm as specified on Wikipedia http://en.wikipedia.org/wiki/HSL_and_HSV
         */
        if (hslColor.length != 3) {
            return null;
        }

        var h = hslColor[0],
            s = hslColor[1],
            l = hslColor[2];

        s = s / 100;
        l = l / 100;

        while (h < 0)
        {
            h += 360;
        }
        while (h > 360)
        {
            h -= 360;
        }

        if (h < 0 || h > 360 ||
            s < 0 || s > 1 ||
            l < 0 || l > 1)
        {
            return null;
        }

        // chroma
        var c = (1 - Math.abs(2 * l - 1)) * s;

        // determine color components (sans lightness)
        var h1 = h / 60;
        var x = c * (1 - Math.abs((h1 % 2) - 1));
        var r1 = 0,
            g1 = 0,
            b1 = 0;

        if (h1 < 1) {
            r1 = c;
            g1 = x;
        } else if (h1 < 2) {
            r1 = x;
            g1 = c;
        } else if (h1 < 3) {
            g1 = c;
            b1 = x;
        } else if (h1 < 4) {
            g1 = x;
            b1 = c;
        } else if (h1 < 5) {
            r1 = x;
            b1 = c;
        } else {
            r1 = c;
            b1 = x;
        }

        // add lightness component to get r,g,b
        var m = l - 0.5 * c;
        var r = r1 + m,
            g = g1 + m,
            b = b1 + m;

        // return in [0,255] range
        r *= 255;
        g *= 255;
        b *= 255;

        return [r, g, b];
    };

    var rgbColorFromRgbString = function(rgbColorString) {
        /**
         * given "rgb(r,g,b)" converts to [r,g,b]
         */

        var rgbValueStrings = rgbColorString.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (rgbValueStrings === null) {
            return null;
        }

        var rgbColor = [parseInt(rgbValueStrings[1], 10),
                        parseInt(rgbValueStrings[2], 10),
                        parseInt(rgbValueStrings[3], 10)];

        return rgbColor;
    };

    var rgbStringFromRgbColor = function(rgbColor) {
        /**
         * given [r,g,b] returns "rgb(r,g,b)"
         *  r, g, b are all rounded to nearest integers
         */
        if (rgbColor.length != 3) {
            return null;
        }

        var roundedRgbColor = _.map(rgbColor, Math.round);
        var rgbString = "rgb(" + roundedRgbColor[0] + ", " + roundedRgbColor[1] + ", " + roundedRgbColor[2] + ")";
        return rgbString;
    };

    var hslStringFromHslColor = function(hslColor) {
        /**
         * given [h,s,l] returns "hsl(h,s%,l%)"
         *  h, s, l are all rounded to nearest integers
         */
        if (hslColor.length != 3) {
            return null;
        }
        var roundedHslColor = _.map(hslColor, Math.round);
        var hslString = "hsl(" + roundedHslColor[0] + ", " + roundedHslColor[1] + "%, " + roundedHslColor[2] + "%)";
        return hslString;
    };

    var hslColorFromHslString = function(hslColorString) {
        /**
         * given "hsl(h,s%,l%)" returns [h,s,l]
         */
        var hslValueStrings = hslColorString.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/);
        if (hslValueStrings === null) {
            return null;
        }

        var hslColor = [parseInt(hslValueStrings[1], 10),
                        parseInt(hslValueStrings[2], 10),
                        parseInt(hslValueStrings[3], 10)];

        return hslColor;
    };

    var rgbColorFromHexString = function(hexColorString) {
        /**
         * given "#RRGGBB" returns [r,g,b]
         */
        var normHexColorString = normalizeHexString(hexColorString);
        var hexValueStrings = normHexColorString.match(/^#?([\dA-Fa-f]{2})([\dA-Fa-f]{2})([\dA-Fa-f]{2})$/);
        if (hexValueStrings === null) {
            return null;
        }

        var rgbColor = [parseInt(hexValueStrings[1], 16),
                        parseInt(hexValueStrings[2], 16),
                        parseInt(hexValueStrings[3], 16)];

        return rgbColor;
    };

    var hexStringFromRgbColor = function(rgbColor) {
        /**
         * given [r,g,b] returns "#RRGGBB"
         *  r,g,b rounded to nearest integers
         */
        if (rgbColor.length != 3) {
            return null;
        }

        var roundedRgbColor = _.map(rgbColor, Math.round);
        var hexComponents = _.map(roundedRgbColor, function(num) {
            var hex = num.toString(16);
            if (hex.length < 2) {
                hex = "0" + hex;
            }
            return hex.toUpperCase();
        });
        var hexString = "#" + hexComponents[0] + hexComponents[1] + hexComponents[2];
        return hexString;
    };

    var normalizeHexString = function(hexString) {
        /**
         * given "rrggbb", "RRGGBB", "#rrggbb", "#RRGGBB" returns "#RRGGBB"
         */
        var normString = '#' + hexString.replace('#','');
        normString = normString.toUpperCase();
        // check for #RGB, to convert to #RRGGBB
        var hexValueStrings = normString.match(/^#?([\dA-F])([\dA-F])([\dA-F])$/);
        if (hexValueStrings !== null) {
            normString = '#' + hexValueStrings[1] + hexValueStrings[1] +
                               hexValueStrings[2] + hexValueStrings[2] +
                               hexValueStrings[3] + hexValueStrings[3];
        }
        return normString;
    };

    var modifyLuminosityOfHslColor = function(hslColor, luminosityMultiplier){
        /**
         * adjusts the luminosity of the specified hsl color by multiplying by luminosityMultiplier
         *  l is clamped to within [0,100]
         */
        var modHslColor = hslColor.slice(0);

        modHslColor[2] *= luminosityMultiplier;
        if (modHslColor[2] > 100) {
            modHslColor[2] = 100;
        } else if (modHslColor[2] < 0) {
            modHslColor[2] = 100;
        }

        return modHslColor;
    };

    var modifyLuminosityOfRgbColor = function(rgbColor, luminosityMultiplier){
        /**
         * adjusts the luminosity of the specified rgb color by luminosityMultiplier
         *   1 - convert to hsl
         *   2 - l *= luminosityMultiplier AND clamp(0,100)
         *   3 - convert back to rgb
         */
        var hslColor = hslColorFromRgbColor(rgbColor);
        var modHslColor = modifyLuminosityOfHslColor(hslColor, luminosityMultiplier);
        var modRgbColor = rgbColorFromHslColor(modHslColor);
        return modRgbColor;
    };

    var modifyLuminosityOfHexString = function(hexString, luminosityMultiplier){
        /**
         * adjusts the luminosity of the specified rgb color by luminosityMultiplier
         *   1 - convert to rgb, then to hsl
         *   2 - l *= luminosityMultiplier AND clamp(0,100)
         *   3 - convert back to rgb, then to hex
         */
        var rgbColor = rgbColorFromHexString(hexString);
        var modRgbColor = modifyLuminosityOfRgbColor(rgbColor, luminosityMultiplier);
        var modHexString = hexStringFromRgbColor(modRgbColor);
        return modHexString;
    };

    var generateGradientStylesWithMidColor = function(startColor, midColor, colorStop, endColor){
        /**
         * returns array of gradient style directives that cover set of browsers
         * builds gradient from three colors, places the midColor at colorStop percent
         *  startColor, midColor, endColor are css interpretable colors
         *  colorStop is "stop%", e.g. "50%", "80%"
         */
        var gradients =
            [
                ' -webkit-gradient(linear, 0 0, 0 100%, from(@startColor), color-stop(@colorStop, @midColor), to(@endColor)) ',
                ' -webkit-linear-gradient(@startColor, @midColor @colorStop, @endColor) ',
                ' -moz-linear-gradient(top, @startColor, @midColor @colorStop, @endColor) ',
                ' -o-linear-gradient(@startColor, @midColor @colorStop, @endColor) ',
                ' linear-gradient(@startColor, @midColor @colorStop, @endColor) ',
                // note: this uses filter instead of bg-image
                " progid:DXImageTransform.Microsoft.gradient(startColorstr='@startColor', endColorstr='@endColor', GradientType=0) "  // IE9 and down, gets no color-stop at all for proper fallback
            ];
        for (var i=0;i<gradients.length;i++){
            gradients[i] = gradients[i].replace(/@startColor/g, startColor);
            gradients[i] = gradients[i].replace(/@midColor/g, midColor);
            gradients[i] = gradients[i].replace(/@colorStop/g, colorStop);
            gradients[i] = gradients[i].replace(/@endColor/g, endColor);
        }
        return gradients;
    };

    var generateGradientStyles = function(startColor, endColor){
        /**
         * returns array of gradient style directives that cover set of browsers
         * builds gradient from two colors
         *  startColor, endColor are css interpretable colors
         */
        var gradients =
            [
                ' -moz-linear-gradient(top, @startColor, @endColor) ', // FF 3.6+
                ' -webkit-gradient(linear, 0 0, 0 100%, from(@startColor), to(@endColor))', // Safari 4+, Chrome 2+
                ' -webkit-linear-gradient(top, @startColor, @endColor) ', // Safari 5.1+, Chrome 10+
                ' -o-linear-gradient(top, @startColor, @endColor) ', // Opera 11.10
                ' linear-gradient(to bottom, @startColor, @endColor) ', // Standard, IE10
                // note: this uses filter instead of bg-image
                " progid:DXImageTransform.Microsoft.gradient(startColorstr='@startColor', endColorstr='@endColor', GradientType=0)  " // IE9 and down
            ];
        for (var i=0;i<gradients.length;i++){
            gradients[i] = gradients[i].replace(/@startColor/g, startColor);
            gradients[i] = gradients[i].replace(/@endColor/g, endColor);
        }
        return gradients;
    };

    return {
        hslColorFromRgbColor: hslColorFromRgbColor,
        rgbColorFromHslColor: rgbColorFromHslColor,
        hslColorFromHslString: hslColorFromHslString,
        rgbColorFromRgbString: rgbColorFromRgbString,
        hslStringFromHslColor: hslStringFromHslColor,
        rgbStringFromRgbColor: rgbStringFromRgbColor,
        rgbColorFromHexString: rgbColorFromHexString,
        hexStringFromRgbColor: hexStringFromRgbColor,
        normalizeHexString: normalizeHexString,
        modifyLuminosityOfHslColor: modifyLuminosityOfHslColor,
        modifyLuminosityOfRgbColor: modifyLuminosityOfRgbColor,
        modifyLuminosityOfHexString: modifyLuminosityOfHexString,
        generateGradientStylesWithMidColor: generateGradientStylesWithMidColor,
        generateGradientStyles: generateGradientStyles
    };
});

define('views/shared/appbar/Master',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base',
    'views/shared/appbar/NavItem',
    'views/shared/appbar/AppNav',
    'views/shared/appbar/AppLabel',
    'models/Application',
    'models/services/data/ui/Nav',
    'models/services/AppLocal',
    'collections/services/data/ui/Views',
    'collections/services/SavedSearches',
    'contrib/text!views/shared/appbar/Master.html',
    'helpers/AppNav',
    'uri/route',
    'util/color_utils'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView,
    NavItem,
    AppNavView,
    AppLabelView,
    ApplicationModel,
    NavModel,
    AppModel,
    ViewsCollection,
    SavedSearchesCollection,
    templateMaster,
    appNavParser,
    route,
    color_utils
){
    var View = BaseView.extend({
        moduleId: module.id,
        className: 'app-bar',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);

            this.children.appNav = new AppNavView({
                model: this.model,
                collection: this.collection
            });

            this.children.appLabel = new AppLabelView({
                model: this.model,
                collection: this.collection
            });

            this.setBannerColor();
            this.model.appNav.on('change:color', this.setBannerColor, this);

            this.debouncedRender();
        },
        render: function() {
            var html = _.template(templateMaster);
            this.$el.html(html);
            this.$el.find('.nav').html(this.children.appNav.el);
            this.$el.find('.app-name').html(this.children.appLabel.render().el);

            return this;
        },
        setBannerColor: function(){
            if(!this.model.appNav){return false;}

            var navColor = this.model.appNav.get('color');
            if(!navColor){return false;}

            this.$el.css('background-color', navColor);

            var navColorNorm = color_utils.normalizeHexString(navColor);
            var darkerColorEnd = color_utils.modifyLuminosityOfHexString(navColor, View.END_GRADIENT_LUMINOSITY);

            var gradients = color_utils.generateGradientStyles(navColorNorm, darkerColorEnd);

            for (var i=0;i<gradients.length;i++){
                this.$el.css('background-image', gradients[i]);
                // FIXME: ghetto hack for IE since it uses filter instead of bg-img
                // BG filters cause clipping issues so removing gradients for IE < 9
                // this.$el.css('filter', gradients[i]);
            }
        }
    },
    {
        END_GRADIENT_LUMINOSITY: 0.90,
        createWithAppNavUrl: function(options){
            var self = this;
            var url = route.appNavUrl(options.model.application.get('root'), options.model.application.get('locale'), options.model.application.get('app'));
            $.ajax({
                url: url,
                dataType:'json'
            }).done(function(data){
                var appLink, appIcon, appLogo, reportRoute;
                appLink = route.page(
                    options.model.application.get('root'),
                    options.model.application.get('locale') || '',
                    options.model.application.get('app')
                );

                appIcon = route.appIcon(
                    options.model.application.get('root'),
                    options.model.application.get('locale') || '',
                    options.model.application.get('owner'),
                    options.model.application.get('app')
                );

                appLogo = route.appLogo(
                    options.model.application.get('root'),
                    options.model.application.get('locale') || '',
                    options.model.application.get('owner'),
                    options.model.application.get('app')
                );

                reportRoute = route.page(
                    options.model.application.get('root'),
                    options.model.application.get('locale') || '',
                    options.model.application.get('app'),
                    'report');

                options.model.appNav.set({
                    nav: data.nav,
                    color: data.color,
                    label: data.label,
                    icon: appIcon,
                    logo: appLogo,
                    link: appLink,
                    defaultView: data.defaultView
                    //searchView: 'not implemented TODO'
                });
            }).fail(function(){
                self.createWithBackbone(options);
            });
        },
        createWithAppNavModel: function(options) {
            var appLink, appIcon, appLogo, reportRoute;

            appLink = route.page(
                options.model.application.get('root'),
                options.model.application.get('locale') || '',
                options.model.application.get('app')
            );

            appIcon = route.appIcon(
                options.model.application.get('root'),
                options.model.application.get('locale') || '',
                options.model.application.get('owner'),
                options.model.application.get('app')
            );

            appLogo = route.appLogo(
                options.model.application.get('root'),
                options.model.application.get('locale') || '',
                options.model.application.get('owner'),
                options.model.application.get('app')
            );

            reportRoute = route.page(
                options.model.application.get('root'),
                options.model.application.get('locale') || '',
                options.model.application.get('app'),
                'report');

            options.model.appNav.set({
                nav: options.model.appNav.entry.content.get('nav'),
                color: options.model.appNav.entry.content.get('color'),
                label: options.model.appNav.entry.content.get('label'),
                icon: appIcon,
                logo: appLogo,
                link: appLink,
                defaultView: options.model.appNav.entry.content.get('defaultView')
                //searchView: 'not implemented TODO'
            });
        },
        createWithBackbone: function(options){
            var applicationDfd = $.Deferred();
            var appNavDfd = $.Deferred();
            var viewsDfd = $.Deferred();
            var savedSearchesDfd = $.Deferred();
            function updateNavData(){
                if(appNavDfd.state() === 'resolved' && viewsDfd.state() === 'resolved' && savedSearchesDfd.state() === 'resolved'){
                    var data = appNavParser.parseNavModel(options.model.splunkDappNav, options.collection.views, options.collection.savedSearches, options.model.application.get('root'));

                    var appLink, appIcon, appLabel, appLogo;
                    appLink = route.page(
                        options.model.application.get('root'),
                        options.model.application.get('locale') || '',
                        options.model.application.get('app')
                    );

                    appIcon = route.appIcon(
                        options.model.application.get('root'),
                        options.model.application.get('locale') || '',
                        options.model.application.get('owner'),
                        options.model.application.get('app')
                    );

                    appLogo = route.appLogo(
                        options.model.application.get('root'),
                        options.model.application.get('locale') || '',
                        options.model.application.get('owner'),
                        options.model.application.get('app')
                    );

                    if(options.model.app && options.model.app.entry && options.model.app.entry.content && options.model.app.entry.content.get('label')){
                        appLabel = options.model.app.entry.content.get('label') || '';
                    }

                    options.model.appNav.set({
                        nav: data.nav,
                        color: data.color,
                        label: appLabel,
                        icon: appIcon,
                        link: appLink,
                        logo: appLogo,
                        searchView: data.searchView
                        //defaultView: 'not implemented TODO'
                    });
                }
            }

            var app = options.model.application.get('app');
            var owner = options.model.application.get('owner');
            if(app && owner){
                applicationDfd.resolve(app, owner);
            }

            options.model.application.on('change', function(){
                var app = options.model.application.get('app');
                var owner = options.model.application.get('owner');
                if(app && owner){
                    applicationDfd.resolve(app, owner);
                }
            });

            if(!options.model.app){
                options.model.app = new AppModel();
                applicationDfd.done(function(app, owner){
                    options.model.app.set({id:'apps/local/' + app});
                    options.model.app.fetch({data: {app: app, owner: owner}});
                });
            }

            if(!options.collection.views){
                options.collection.views = new ViewsCollection();
                applicationDfd.done(function(app, owner){
                    options.collection.views.fetch({data: {app: app, owner: owner, count: -1, digest: 1}});
                });
            }

            if(!options.collection.savedSearches){
                options.collection.savedSearches = new SavedSearchesCollection();
                applicationDfd.done(function(app, owner){
                    options.collection.savedSearches.fetch({data: {app: app, owner: '-', search:'is_visible=1 AND disabled=0', count:-1}}); //TODO: _with_new=1?
                });
            }

            if(!options.model.splunkDappNav){
                options.model.splunkDappNav = new NavModel();
                applicationDfd.done(function(app, owner){
                    options.model.splunkDappNav.fetch({data: {app: app, owner: owner}});
                });
            }

            options.collection.views.on('reset', function(){
                viewsDfd.resolve();
                updateNavData();
            });

            options.collection.savedSearches.on('reset', function(){
                savedSearchesDfd.resolve();
                updateNavData();
            });

            options.model.splunkDappNav.on('change', function(){
                appNavDfd.resolve();
                updateNavData();
            });

        },
        create: function(options){
            options = options || {};
            options.collection = options.collection || {};
            options.model = options.model || {};
            if (options.model.appNav) {
                this.createWithAppNavModel(options);
            } else {
                options.model.appNav = new (Backbone.Model.extend())();
                if(options.appServerUrl){
                    this.createWithAppNavUrl(options);
                }else{
                    this.createWithBackbone(options);
                }
            }
            return new View(options);
        }
    });
    return View;
});

define('splunkjs/mvc/headerview',['require','exports','module','underscore','jquery','./mvc','./basesplunkview','views/shared/splunkbar/Master','views/shared/appbar/Master','./sharedmodels','helpers/user_agent'],function (require, exports, module) {
    var _ = require("underscore"),
        $ = require('jquery'),
        mvc = require('./mvc'),
        BaseSplunkView = require("./basesplunkview"),
        GlobalNav = require('views/shared/splunkbar/Master'),
        AppNav = require('views/shared/appbar/Master'),
        sharedModels = require('./sharedmodels'),
        userAgent = require('helpers/user_agent');


    var HeaderView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: 'splunk-header',

        options: {
            appbar: true,
            acceleratedAppNav: false
        },

        initialize: function() {
            this.configure();
            this.model = this.model || {};
            this.model.application= sharedModels.get("app");
            this.model.user= sharedModels.get("user");
            this.model.appLocal= sharedModels.get("appLocal");
            this.model.serverInfo= sharedModels.get("serverInfo");

            var acceleratedAppNav = this.settings.get('acceleratedAppNav') && userAgent.isIE7();
            this.collection = this.collection || {};
            this.collection.appLocals = sharedModels.get("appLocals");

            this.dfd = $.when.apply($, [
                this.model.application.dfd,
                this.model.user.dfd,
                this.model.appLocal.dfd,
                this.model.serverInfo.dfd,
                this.collection.appLocals.dfd
            ]);

            this.dfd.done(_.bind(function(){

                this.globalNav = GlobalNav.create({
                    model: {
                        application: this.model.application,
                        appLocal: this.model.appLocal,
                        user: this.model.user,
                        serverInfo: this.model.serverInfo
                    },
                    collection: {
                        apps: this.collection.appLocals
                    }
                });

                if(this.settings.get('appbar')){
                    this.appNav = AppNav.create({
                        model: {
                            application: this.model.application,
                            app: this.model.appLocal
                        },
                        appServerUrl: acceleratedAppNav
                    });
                }
            }, this));
        },
        render: function() {
            this.dfd.done(_.bind(function(){
                this.$el.empty()
                    .append(this.globalNav.render().el);
                if(this.settings.get('appbar')){
                    this.$el.append(this.appNav.render().el);
                }
            }, this));
            return this;
        }
    });

    return HeaderView;
});
