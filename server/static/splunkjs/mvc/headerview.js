
define('contrib/text!views/shared/splunkbar/AppMenu.html',[],function () { return '<%\n    currentAppname = currentApp ? currentApp.name : \'search\';   // TODO: search fallback is not always safe assumption\n%>\n<a href="#" class="dropdown-toggle"><%- currentApp ? _(\'App\').t()+\': \' + currentApp.label : _(\'Apps\').t() %><b class="caret"></b></a>\n<div class="dropdown-menu dropdown-menu-selectable dropdown-menu-tall" id="global-apps-menu">\n    <div class="arrow"></div>\n    <ul class="menu-list">\n        <% _.each(apps, function(i) { %>\n        <li>\n            <a href="<%- i.href %>">\n                <% if (currentApp && i.name === currentApp.name) { %> <i class="icon-check"></i><% } %>\n                <% if (i.icon) { %> <img data-icosrc="<%-i.icon%>" alt="menu icon" class="menu-icon"><% } %>\n                <span class="menu-label"><%= i.label %></span>\n            </a>\n        </li>\n        <% }); %>\n    </ul>\n\n    <a class="btn nav-btn" href="<%- make_url(\'manager\', currentAppname, \'apps\',\'remote\') %>"><%- _("Find More Apps").t() %></a>\n    <a class="btn nav-btn" href="<%- make_url(\'manager\', currentAppname, \'apps\',\'local\') %>"><%- _("Manage Apps").t() %></a>\n</div>\n';});

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
            events:{
                'click': 'setIcons'
            },
            moduleId: module.id,
            template: appsTemplate,
            tagName: 'li',
            className: 'dropdown menu-apps',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.currentApp = this.model.application.get('app') === 'launcher' ? null : this.model.application.get('app');
                this.collection.apps.on('change reset', this.render, this);
                // handle the case when collection.apps is already set
                if (this.collection.apps.length > 0) {
                    this.render();
                }
            },
            render: function() {
                var that = this,
                    app,
                    curApp = null,
                    apps = this.collection.apps.map(function(model, key, list) {
                        var appIcon = route.appIcon(
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
                    ico.attr('src', ico.attr('data-icosrc'));
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
            this.$el.html($html);
            var popup = this.$el.find('#global-system-menu');
            this.children.popdown = new Popdown({el:popup.parent(), mode: 'dialog'});

            return this;
        },
        addSections: function($menu){
            var self = this;
            this.collection.sections.each(function(section){
                if (section.get('items') && section.get('items').length === 0) {
                    return;
                }
                var sectionView = self.children[section.get('id')] = new SystemMenuSection({
                    model: section
                });
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
            var msgFullId = this.model.id,
                msgId = (this.model.entry.get('name')||''),
                msg,
                msgLevel = this.model.entry.content.get('severity') || 'warn';
            if (msgId && this.messageMap[msgId]) {
                msg = this.messageMap[msgId];
            } else {
                msg = this.model.entry.content.get("message") || "";
            }
            var html = this.compiledTemplate({
                msgId: msgId,
                msgFullId: msgFullId,
                msg: splunk_util.getWikiTransform(msg),
                msgLevel: msgLevel
            });
            this.$el = $(html);
            return this;
        },
        template: '<li class="<%- msgLevel %>" data-id="<%- msgFullId %>">\
            <span class="message-content"><%= msg %></span>\
            <a href="#" class="delete-message icon-x-circle ir">x</a>\
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
            <span><%= msg %></span>\
            <a href="#" class="delete-message icon-x-circle ir">x</a>\
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
        'contrib/text!views/shared/splunkbar/messages/Master.html'
    ],
    function($, _, module, BaseView, Popdown, StopScrollPropagation, MessagesCollection, MessageView, LegacyMessageView, MasterTemplate) {
        return BaseView.extend({
            moduleId: module.id,
            template: MasterTemplate,
            tagName: 'li',
            className: 'dropdown messages',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                this.legacyMessages = this.collection.legacyMessages || false;
                this.collection = this.collection.messages;
                this.collection.on('reset remove', this.renderMessages, this);

                if(this.legacyMessages){
                    this.legacyMessages.on('reset remove', this.renderMessages, this);
                }
            },
            events: {
                'click .message-list .delete-message': 'deleteMessage',
                'click .delete-all-messages': 'deleteAllMessages'
            },
            render: function() {
                //destroy already existing popdowns...
                var html = this.compiledTemplate({collection: this.collection});
                this.$el.html(html);
                this.children.popdown = new Popdown({el:this.el, mode: 'dialog'});
                this.children.stopScrollPropagation = new StopScrollPropagation({el:this.$('#global-messages-menu ul'), mode: 'dialog'});
                
                return this;
            },
            renderMessages: function() {
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
                var $li = $(evt.target).parent();
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

                if (this.collection.length === 0 && this.legacyMessages!==false && this.legacyMessages.length === 0) {
                    this.children.popdown.hide();
                }
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

define('contrib/text!views/shared/splunkbar/HelpMenu.html',[],function () { return '<a href="#" class="dropdown-toggle"><%- _("Help").t() %><b class="caret"></b></a>\n<div class="dropdown-menu" id="global-help-menu">\n    <div class="arrow"></div>\n    <ul>\n        <li><a class="external" href="<%- makeDocLink(\'search_app.tutorial\') %>" target="_blank"><%- _("Tutorials").t() %></a></li>\n        <li><a class="external" href="http://splunk-base.splunk.com/" target="_blank"><%- _("Splunk Answers").t() %></a></li>\n        <li><a class="external" href="http://www.splunk.com/support" target="_blank"><%- _("Contact Support").t() %></a></li>\n        <li><a class="external" href="<%- makeDocLink(currentPageDocLocation) %>" target="_blank"><%- _("Documentation").t() %></a></li>\n    </ul>\n    <form class="form-search" action="#help" method="get">\n    </form>\n</div>\n';});

define('views/shared/splunkbar/HelpMenu',
[
    'underscore',
    'jquery',
    'module',
    'views/Base',
    'views/shared/delegates/Popdown',
    'views/shared/controls/TextControl',
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
            this.children.searchInput = new TextControl({placeholder: _('Search Documentation').t(), inputClassName: 'input-medium search-query'});
            this.model.appLocal.on('change reset', this.render, this);
        },
        events: {
            'keypress input': "onDocsSearch"
        },
        render: function(){
            // location is in form: app.<app_name>.<page_name>
            var currentPageDocLocation = [
                    'app',
                    this.model.application.get('app'),
                    this.model.application.get('page')
                ].join(".");
            var html = this.compiledTemplate({
                makeDocLink: this.makeDocLink.bind(this),
                currentPageDocLocation: currentPageDocLocation
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
                this.children.popdown.hide();
                evt.preventDefault();
            }
        },
        makeDocLink: function(location) {
            return route.docHelp(
                this.model.application.get("root"),
                this.model.application.get("locale"),
                location,
                this.model.application.get("app"),
                this.model.appLocal.entry.content.get('version'),
                this.model.appLocal.appAllowsDisable(),
                this.model.appLocal.entry.content.get('docs_section_override')
            );
        }
    });
});

//fgnass.github.com/spin.js#v1.2.7
!function(window, document, undefined) {

  /**
   * Copyright (c) 2011 Felix Gnass [fgnass at neteye dot de]
   * Licensed under the MIT license
   */

  var prefixes = ['webkit', 'Moz', 'ms', 'O'] /* Vendor prefixes */
    , animations = {} /* Animation rules keyed by their name */
    , useCssAnimations

  /**
   * Utility function to create elements. If no tag name is given,
   * a DIV is created. Optionally properties can be passed.
   */
  function createEl(tag, prop) {
    var el = document.createElement(tag || 'div')
      , n

    for(n in prop) el[n] = prop[n]
    return el
  }

  /**
   * Appends children and returns the parent.
   */
  function ins(parent /* child1, child2, ...*/) {
    for (var i=1, n=arguments.length; i<n; i++)
      parent.appendChild(arguments[i])

    return parent
  }

  /**
   * Insert a new stylesheet to hold the @keyframe or VML rules.
   */
  var sheet = function() {
    var el = createEl('style', {type : 'text/css'})
    ins(document.getElementsByTagName('head')[0], el)
    return el.sheet || el.styleSheet
  }()

  /**
   * Creates an opacity keyframe animation rule and returns its name.
   * Since most mobile Webkits have timing issues with animation-delay,
   * we create separate rules for each line/segment.
   */
  function addAnimation(alpha, trail, i, lines) {
    var name = ['opacity', trail, ~~(alpha*100), i, lines].join('-')
      , start = 0.01 + i/lines*100
      , z = Math.max(1 - (1-alpha) / trail * (100-start), alpha)
      , prefix = useCssAnimations.substring(0, useCssAnimations.indexOf('Animation')).toLowerCase()
      , pre = prefix && '-'+prefix+'-' || ''

    if (!animations[name]) {
      sheet.insertRule(
        '@' + pre + 'keyframes ' + name + '{' +
        '0%{opacity:' + z + '}' +
        start + '%{opacity:' + alpha + '}' +
        (start+0.01) + '%{opacity:1}' +
        (start+trail) % 100 + '%{opacity:' + alpha + '}' +
        '100%{opacity:' + z + '}' +
        '}', sheet.cssRules.length)

      animations[name] = 1
    }
    return name
  }

  /**
   * Tries various vendor prefixes and returns the first supported property.
   **/
  function vendor(el, prop) {
    var s = el.style
      , pp
      , i

    if(s[prop] !== undefined) return prop
    prop = prop.charAt(0).toUpperCase() + prop.slice(1)
    for(i=0; i<prefixes.length; i++) {
      pp = prefixes[i]+prop
      if(s[pp] !== undefined) return pp
    }
  }

  /**
   * Sets multiple style properties at once.
   */
  function css(el, prop) {
    for (var n in prop)
      el.style[vendor(el, n)||n] = prop[n]

    return el
  }

  /**
   * Fills in default values.
   */
  function merge(obj) {
    for (var i=1; i < arguments.length; i++) {
      var def = arguments[i]
      for (var n in def)
        if (obj[n] === undefined) obj[n] = def[n]
    }
    return obj
  }

  /**
   * Returns the absolute page-offset of the given element.
   */
  function pos(el) {
    var o = { x:el.offsetLeft, y:el.offsetTop }
    while((el = el.offsetParent))
      o.x+=el.offsetLeft, o.y+=el.offsetTop

    return o
  }

  var defaults = {
    lines: 12,            // The number of lines to draw
    length: 7,            // The length of each line
    width: 5,             // The line thickness
    radius: 10,           // The radius of the inner circle
    rotate: 0,            // Rotation offset
    corners: 1,           // Roundness (0..1)
    color: '#000',        // #rgb or #rrggbb
    speed: 1,             // Rounds per second
    trail: 100,           // Afterglow percentage
    opacity: 1/4,         // Opacity of the lines
    fps: 20,              // Frames per second when using setTimeout()
    zIndex: 2e9,          // Use a high z-index by default
    className: 'spinner', // CSS class to assign to the element
    top: 'auto',          // center vertically
    left: 'auto',         // center horizontally
    position: 'relative'  // element position
  }

  /** The constructor */
  var Spinner = function Spinner(o) {
    if (!this.spin) return new Spinner(o)
    this.opts = merge(o || {}, Spinner.defaults, defaults)
  }

  Spinner.defaults = {}

  merge(Spinner.prototype, {
    spin: function(target) {
      this.stop()
      var self = this
        , o = self.opts
        , el = self.el = css(createEl(0, {className: o.className}), {position: o.position, width: 0, zIndex: o.zIndex})
        , mid = o.radius+o.length+o.width
        , ep // element position
        , tp // target position

      if (target) {
        target.insertBefore(el, target.firstChild||null)
        tp = pos(target)
        ep = pos(el)
        css(el, {
          left: (o.left == 'auto' ? tp.x-ep.x + (target.offsetWidth >> 1) : parseInt(o.left, 10) + mid) + 'px',
          top: (o.top == 'auto' ? tp.y-ep.y + (target.offsetHeight >> 1) : parseInt(o.top, 10) + mid)  + 'px'
        })
      }

      el.setAttribute('aria-role', 'progressbar')
      self.lines(el, self.opts)

      if (!useCssAnimations) {
        // No CSS animation support, use setTimeout() instead
        var i = 0
          , fps = o.fps
          , f = fps/o.speed
          , ostep = (1-o.opacity) / (f*o.trail / 100)
          , astep = f/o.lines

        ;(function anim() {
          i++;
          for (var s=o.lines; s; s--) {
            var alpha = Math.max(1-(i+s*astep)%f * ostep, o.opacity)
            self.opacity(el, o.lines-s, alpha, o)
          }
          self.timeout = self.el && setTimeout(anim, ~~(1000/fps))
        })()
      }
      return self
    },

    stop: function() {
      var el = this.el
      if (el) {
        clearTimeout(this.timeout)
        if (el.parentNode) el.parentNode.removeChild(el)
        this.el = undefined
      }
      return this
    },

    lines: function(el, o) {
      var i = 0
        , seg

      function fill(color, shadow) {
        return css(createEl(), {
          position: 'absolute',
          width: (o.length+o.width) + 'px',
          height: o.width + 'px',
          background: color,
          boxShadow: shadow,
          transformOrigin: 'left',
          transform: 'rotate(' + ~~(360/o.lines*i+o.rotate) + 'deg) translate(' + o.radius+'px' +',0)',
          borderRadius: (o.corners * o.width>>1) + 'px'
        })
      }

      for (; i < o.lines; i++) {
        seg = css(createEl(), {
          position: 'absolute',
          top: 1+~(o.width/2) + 'px',
          transform: o.hwaccel ? 'translate3d(0,0,0)' : '',
          opacity: o.opacity,
          animation: useCssAnimations && addAnimation(o.opacity, o.trail, i, o.lines) + ' ' + 1/o.speed + 's linear infinite'
        })

        if (o.shadow) ins(seg, css(fill('#000', '0 0 4px ' + '#000'), {top: 2+'px'}))

        ins(el, ins(seg, fill(o.color, '0 0 1px rgba(0,0,0,.1)')))
      }
      return el
    },

    opacity: function(el, i, val) {
      if (i < el.childNodes.length) el.childNodes[i].style.opacity = val
    }

  })

  /////////////////////////////////////////////////////////////////////////
  // VML rendering for IE
  /////////////////////////////////////////////////////////////////////////

  /**
   * Check and init VML support
   */
  ;(function() {

    function vml(tag, attr) {
      return createEl('<' + tag + ' xmlns="urn:schemas-microsoft.com:vml" class="spin-vml">', attr)
    }

    var s = css(createEl('group'), {behavior: 'url(#default#VML)'})

    if (!vendor(s, 'transform') && s.adj) {

      // VML support detected. Insert CSS rule ...
      sheet.addRule('.spin-vml', 'behavior:url(#default#VML)')

      Spinner.prototype.lines = function(el, o) {
        var r = o.length+o.width
          , s = 2*r

        function grp() {
          return css(
            vml('group', {
              coordsize: s + ' ' + s,
              coordorigin: -r + ' ' + -r
            }),
            { width: s, height: s }
          )
        }

        var margin = -(o.width+o.length)*2 + 'px'
          , g = css(grp(), {position: 'absolute', top: margin, left: margin})
          , i

        function seg(i, dx, filter) {
          ins(g,
            ins(css(grp(), {rotation: 360 / o.lines * i + 'deg', left: ~~dx}),
              ins(css(vml('roundrect', {arcsize: o.corners}), {
                  width: r,
                  height: o.width,
                  left: o.radius,
                  top: -o.width>>1,
                  filter: filter
                }),
                vml('fill', {color: o.color, opacity: o.opacity}),
                vml('stroke', {opacity: 0}) // transparent stroke to fix color bleeding upon opacity change
              )
            )
          )
        }

        if (o.shadow)
          for (i = 1; i <= o.lines; i++)
            seg(i, -2, 'progid:DXImageTransform.Microsoft.Blur(pixelradius=2,makeshadow=1,shadowopacity=.3)')

        for (i = 1; i <= o.lines; i++) seg(i)
        return ins(el, g)
      }

      Spinner.prototype.opacity = function(el, i, val, o) {
        var c = el.firstChild
        o = o.shadow && o.lines || 0
        if (c && i+o < c.childNodes.length) {
          c = c.childNodes[i+o]; c = c && c.firstChild; c = c && c.firstChild
          if (c) c.opacity = val
        }
      }
    }
    else
      useCssAnimations = vendor(s, 'animation')
  })()

  if (typeof define == 'function' && define.amd)
    define('spin',[],function() { return Spinner })
  else
    window.Spinner = Spinner

}(window, document);

define('views/shared/WaitSpinner',['underscore', 'module', 'views/Base', 'spin'], function(_, module, BaseView, Spinner) {
    return BaseView.extend({
        moduleId: module.id,
        tagName: 'div',
        initialize: function(){
            var defaults = {
              lines: 8, // The number of lines to draw
              length: 2, // The length of each line
              width: 2, // The line thickness
              radius: 3, // The radius of the inner circle
              corners: 1, // Corner roundness (0..1)
              rotate: 0, // The rotation offset
              color: '#333', // #rgb or #rrggbb
              speed: 1, // Rounds per second
              trail: 60, // Afterglow percentage
              shadow: false, // Whether to render a shadow
              hwaccel: false, // Whether to use hardware acceleration
              className: 'spinner', // The CSS class to assign to the spinner
              zIndex: 0, // The z-index (defaults to 2000000000)
              top: '0', // Top position relative to parent in px
              left: '0' // Left position relative to parent in px
            };
            
            _.defaults(this.options, defaults);
        
            BaseView.prototype.initialize.apply(this, arguments);            
            this.spinner = new Spinner(this.options);
            this.active=false;
            
        },
        stop:  function() {
            this.active=false;
            this.spinner.stop();
            return this;
        },
        start:  function() {
            this.active=true;
            this.spinner.spin(this.el);
            return this;
        },
        render: function() {
            return this;
        }
    });
});

define('contrib/text!views/shared/splunkbar/messages/NoConnectionOverlay.html',[],function () { return '<div class="modal-backdrop fade in"></div>\n<div class="modal disconnection-warning-modal">\n\t<h3>Reconnecting to Splunk server</h3>\n\t<p>Your network connection may have been lost or Splunk server may be down.</p>\n</div>';});

define('views/shared/splunkbar/messages/NoConnectionOverlay',[
    'underscore',
    'module',
    'views/Base',
    'views/shared/WaitSpinner',
    'contrib/text!views/shared/splunkbar/messages/NoConnectionOverlay.html'
],
    function(
        _,
        module,
        BaseView,
        WaitSpinnerView,
        Template
        ){
        return BaseView.extend({
            moduleId: module.id,
            template: Template,
            className: 'splunk-components',
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                var spinnerOptions = {
                  lines: 9, // The number of lines to draw
                  length: 6, // The length of each line
                  width: 3, // The line thickness
                  radius: 6, // The radius of the inner circle
                  corners: 1, // Corner roundness (0..1)
                  color: '#569A23', // #rgb or #rrggbb
                  className: 'disconnection-warning-spinner'
                };
                
                this.children.spinner = new WaitSpinnerView(spinnerOptions);
                this.visible = true;
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

define('models/services/configs/Web',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "configs/conf-web",
            urlRoot: "configs/conf-web",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
// (c) 2012 Uzi Kilon, Splunk Inc.
// Backbone Poller may be freely distributed under the MIT license.
define('helpers/polling_manager',[
    'underscore',
    'jquery',
    'backbone'
],
function(
    _,
    $,
    Backbone
){
        // Private variables
        var pollerDefaults = {
            delay: 1000,
            stopOnError: true,
            condition: function(){return true;}
        };
        var eventTypes = ['start', 'stop', 'success', 'error', 'complete'];

        /**
         * Private Poller
         */
        var Poller = function Poller(model, options) {
            this.set(model, options);
        };
        _.extend(Poller.prototype, Backbone.Events, {
            set: function(model, options) {
                this.model = model;
                this.options = _.extend(_.clone(pollerDefaults), options || {});

                _.each(eventTypes, function(eventName){
                    var handler = this.options[eventName];
                    if(typeof handler === 'function') {
                        this.on(eventName, handler, this);
                    }
                }, this);

                if ( this.model instanceof Backbone.Model ) {
                    this.model.on('destroy', this.stop, this);
                }

                return this.stop({silent: true});
            },
            start: function(options){
                if(this.active() === true) {
                    return this;
                }
                options = options || {};
                if(!options.silent) {
                    this.trigger('start');
                }
                this.options.active = true;
                run(this);
                return this;
            },
            stop: function(options){
                options = options || {};
                if(!options.silent) {
                    this.trigger('stop');
                }
                this.options.active = false;
                clearTimeout(this.timeoutId);
                if(this.xhr && typeof this.xhr.abort === 'function') {
                    this.xhr.abort();
                }
                this.xhr = null;
                return this;
            },
            active: function(){
                return this.options.active === true;
            }
        });

        // private methods
        function run(poller) {
            if ( poller.active() !== true ) {
                window.clearTimeout(poller.timeoutId);
                return ;
            }

            var onSuccess = function(){
                poller.trigger('success');
                poller.model.off('sync', onSuccess);
            };
            
            var options = $.extend(true, {}, poller.options || {}, {
                success: function(model, response, options) {
                    poller.trigger('success');
                    if( poller.options.condition(poller.model) !== true ) {
                        poller.trigger('complete');
                        poller.stop({silent: true});
                    }
                    else {
                        poller.timeoutId = window.setTimeout(function(){ run(poller); }, poller.options.delay);
                    }
                },
                error: function(model, response, options){
                    poller.trigger('error');
                    if (poller.options.stopOnError) {
                        poller.stop({silent: true});
                    } else {
                        poller.timeoutId = window.setTimeout(function(){ run(poller); }, poller.options.delay);
                    }
                }
            });
            poller.xhr = poller.model.fetch(options);
        }

        /**
         * Polling Manager
         */
        var pollers = [];

        return {
            get: function(model) {
                return _.find(pollers, function(poller){
                    return poller.model === model;
                });
            },
            getPoller: function(model, options){
                var poller = this.get(model);
                if( poller ) {
                    poller.set(model, options);
                }
                else {
                    poller = new Poller(model, options);
                    pollers.push(poller);
                }
                return poller;
            },
            start: function(model, options) {
                return this.getPoller(model, options).start({silent: true});
            },
            stop: function(model) {
                var poller = this.get(model);
                if( poller ) {
                    poller.stop();
                    return true;
                }
                return false;
            },
            size: function(){
                return pollers.length;
            }
        };
    }
);
define('contrib/text!views/shared/splunkbar/Master.html',[],function () { return '\n<div class="navbar-inner">\n    <div class="no_connection-overlay"></div>\n    <a href="<%-homeLink%>" class="brand" title="splunk &gt; <%- _(\'listen to your data\').t() %>">splunk<strong>&gt;</strong></a>\n    <ul class="navbar-global-nav nav">\n        <li class="dropdown apps">\n            <a href="#" class="dropdown-toggle"><%- _("Apps").t() %><b class="caret"></b></a>\n        </li>\n    </ul>\n\n    <ul class="navbar-global-nav nav pull-right">\n        <li class="dropdown user"><a href="#" class="dropdown-toggle"><%- _("Admin").t() %><b class="caret"></b></a></li>\n        <li class="dropdown messages"><a href="#" class="dropdown-toggle"><%- _("Messages").t() %><b class="caret"></b></a></li>\n        <li class="dropdown system<%- options.section==\'system\' ? \' active \' : \'\'%>">\n            <a href="#" class="dropdown-toggle"><%- _("System").t() %><b class="caret"></b></a>\n        </li>\n        <li class="dropdown activity"><a href="#"><%- _("Activity").t() %></a></li>\n        <li class="dropdown help"><a href="#" class="dropdown-toggle"><%- _("Help").t() %><b class="caret"></b></a></li>\n    </ul><!-- /.user-nav -->\n</div><!-- /.navbar-inner -->\n';});

// splunk bar
define('views/shared/splunkbar/Master',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'splunk.util',
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
    'util/splunkd_utils'
],
function(
    $,
     _,
     Backbone,
     module,
     splunk_util,
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
     splunkDUtils
){
    var View = BaseView.extend({
        moduleId: module.id,
        template: globalTemplate,
        className: 'navbar',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.MAX_RETRIES_BEFORE_FAIL = 2;
        },
        render: function() {
            var homeLink = route.page(
                this.model.application.get('root'),
                this.model.application.get('locale'),
                'launcher',
                'home'
            );
            var cntRetries = 0;
            var html = this.compiledTemplate({
                makeUrl: splunk_util.make_url,
                options: this.options,
                homeLink: homeLink
            });
            this.$el.html(html);

            this.children.apps = new AppMenuView({
                collection: this.collection,
                model: this.model
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

            this.children.messages = new MessagesView({
                collection: {
                    messages: this.collection.messages,
                    legacyMessages: this.collection.legacyMessages
                }
            });

            this.children.noConnectionOverlay = new NoConnectionOverlay();
            $('body').append(this.children.noConnectionOverlay.render().el);

            this.collection.messages.on('serverValidated', function(success, context, messages) {
                if (success) {
                    this.children.noConnectionOverlay.hide();
                    cntRetries = 0;
                    return;
                }
                var netErrorMsg = _.find(messages, function(msg) {
                    return msg.type == splunkDUtils.NETWORK_ERROR || 'network_error';
                });
                if (netErrorMsg) {
                    if (cntRetries == this.MAX_RETRIES_BEFORE_FAIL) {
                        this.children.noConnectionOverlay.show();
                    } else {
                        cntRetries += 1;
                    }
                }
            }, this);
            this.$('.messages.dropdown').replaceWith(this.children.messages.render().el);


            this.children.activityMenu = new ActivityMenu({
                model: {
                    user: this.model.user,
                    application: this.model.application
                }
            });
            this.$('.activity').replaceWith(this.children.activityMenu.el);

            this.children.helpMenu = new HelpMenu({
                model: {
                    application: this.model.application,
                    appLocal: this.model.appLocal,
                    serverInfo: this.model.serverInfo
                }
            });
            this.$('.help').replaceWith(this.children.helpMenu.render().el);
    
            // highlight the active menu
            var activeMenu = this.getActiveMenu();

            if (activeMenu) {
                activeMenu.addClass("active");
            }

            return this;
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

            var activeMenu = null; 
            if (activityPages.indexOf(appAndPage) > -1 ||
                path.indexOf(jobManagerPage) > -1 ||
                path.indexOf(triggeredAlertsPage) > -1) {
                activeMenu = this.$(".activity");
            } else if (path.indexOf(changePasswordPage) > -1) {
                activeMenu = this.$('.user');
            } else if (path.indexOf(managerPage) > -1) {
                activeMenu = this.$(".menu-system");
            } else if (path.indexOf(homePage) > -1) {
                activeMenu = this.$(".brand");
            } else {
                activeMenu = this.$(".menu-apps");
            }
            return activeMenu; 
        }
    },
        
    {
        create: function(options){
            var MESSAGES_POLLING_DELAY = 2000;

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
            }

            applicationDfd.done(function() {
                if (options.model.application.get("app") !== 'system') {
                    options.model.appLocal.fetch({
                        url: splunkDUtils.fullpath(options.model.appLocal.url + "/" + options.model.application.get("app")),
                        data: {
                            app: options.model.application.get("app"),
                            owner: options.model.application.get("owner")
                        }
                    });
                }
            });

            var currentUserIdDfd = $.Deferred();
            currentUserIdDfd.resolve(options.model.application.get('owner'));

            if(!options.collection.apps){
                var appsCollection = options.collection.apps = new AppsCollection();
                $.when(currentUserIdDfd).done(function(){
                    var appsDfd = $.Deferred();
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

                    var userPrefModel = new UserPrefModel();
                    userPrefModel.fetch({data: {app:'user-prefs', owner: options.model.application.get('owner'), count:-1}});
                    userPrefModel.on('change', function(){
                        appsDfd.done(function(){
                            appsCollection.sortWithString(userPrefModel.entry.content.get('appOrder'));
                        });
                    });
                });
            }

            var currentUserDfd = $.Deferred();
            if(!options.model.user){
                options.model.user = new UserModel();
                $.when(currentUserIdDfd).done(function(currentUserId){
                    options.model.user.set('id', currentUserId);
                    options.model.user.fetch();
                });
            }
            options.model.user.on('reset', function(){
                currentUserDfd.resolve(options.model.user);
            });

            if (!options.collection.messages) {
                options.collection.messages = new MessagesCollection();
            }
            var messagePoller = polling_manager.start(options.collection.messages, {delay: MESSAGES_POLLING_DELAY, stopOnError: false, data: {count: 1000}});

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
                        order = manager.entry.content.get('menu.order') || 1000,
                        pageStart = route.encodeRoot(options.model.application.get('root'), options.model.application.get('locale')),
                        url = pageStart + splunk_util.sprintf(menuUrl, {namespace: options.model.application.get('app') || 'NOTHING'});

                    if(sectionName){
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

define('contrib/text!views/shared/AppNav-SlideNavTemplate.html',[],function () { return '<%if(!submenu){return "";}%>\n<ul class="slidenavList scroll-group">\n    <% _.each(submenu, function(i, index) { %>\n    <li data-index="<%=index%>" class="<%=i.divider ? \'divider\':\'\'%>">\n        <% if(!i.divider){ %>\n            <% if(i.submenu && i.submenu.length>0){ %>\n                <a href="#">\n                    <%- _(i.label).t() %>\n                </a>\n                <i class="icon-triangle-right-small"></i>\n            <%}else if (i.hasOwnProperty(\'reportUri\')) { %>\n                <a href="<%=i.reportUri%>" class="primary-link">\n                    <%- _(i.label).t() %>\n                </a>\n                <a href="<%=i.uri%>" class="secondary-link">\n                    <i class="icon-<%= i.hasOwnProperty(\'dispatchView\') && i.dispatchView === \'pivot\' ? \'pivot\' : \'search\' %>"></i>\n                </a>\n            <%} else { %>\n                <a href="<%=i.uri%>">\n                    <%- _(i.label).t() %>\n                </a>\n            <%}%>\n        <%}%>\n    </li>\n    <% }); %>\n</ul>\n';});

define('splunk.widget.slidenav',['jquery', 'jquery.ui.widget', 'jquery.ui.position'], function($){
    return $.widget( "splunk.slidenav", {
        options: {
            levelTemplate: '',
            navData: {},
            childPropertyName: 'children'
        },
        _create: function(){
            var self = this;
            this.isAnimating = false;
            this.$el = $(this.element);
            //TODO pete lets figure out how to remove this class
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
            selected.domReference = selected.domReference || this.addLevel(selected);
            this._chain.push(this.slide(selected.domReference.show()));
            this.$backButton.show();
        },
        back: function(){
            if(this._chain.length <= 1 || this.isAnimating){
                return false;
            }
            if(this._chain.length === 2){
                this.$backButton.hide();
            }
            var $hide = this._chain.pop();
            this.slide(this._chain[this._chain.length-1], function(){
                $hide.scrollTop(0).hide();
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
            return this.options.templateBack || '<div class="backbutton" style="display: none;"><a href="#" class="slidenavback "><i class="icon-triangle-left-small"></i>Back</a></div>';
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
                        childPropertyName: 'submenu'
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
            this.model.appNav.on('change:nav', this.render, this);
            this.model.application.on('change:page', this.setActiveItem, this);
            this.render();
        },
        render: function() {
            var self = this;
            var navData = this.model.appNav.get('nav');
            if(!navData){return this;}

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

define('contrib/text!views/shared/appbar/AppLabel.html',[],function () { return '<a class="app-link" href="<%=appLink%>">\n    <div class="app-logo" style="display:none">\n        <img class="app-logo-img" src="<%=appLogo%>" alt="<%-appLabel%>" />\n    </div>\n\n    <div class="app-name" style="display:none">\n        <span class="app-label">\n            <%-_(appLabel).t()%>\n        </span>\n    </div>\n</a>\n';});

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
        render: function() {
            var self = this;
            
            var html = _.template(templateAppLabel, {
                appLink: this.model.appNav.get('link'),
                appLabel: this.model.appNav.get('label'),
                appIcon: this.model.appNav.get('icon'),
                appLogo: this.model.appNav.get('logo')
            });
            this.$el.html(html);

            if (this.model.appNav.get('logo')) {
                var img = this.$el.find('.app-logo-img');
                img.load(function(){
                    if(parseInt(this.width, 10) > 2){
                        self.$el.find('.app-logo').show();
                        self.$el.find('.app-name').hide();
                    }else{
                        self.$el.find('.app-logo').hide();
                        self.$el.find('.app-name').show();
                    }
                });
            } else {
                this.$el.find('.app-logo').hide();
                this.$el.find('.app-name').show();
            }

            return this;
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
                    itName = it.entry.get('name');
                if (itApp != app) {
                    return false;
                }
                if (match) {
                    return (match && itName.toLowerCase().indexOf(match.toLowerCase())>-1);
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
                    uri: splunk_util.make_full_url('app/'+app+'/@go', {'s': saved.id}),
                    sharing: saved.get('sharing'),
                    label: name,
                    reportUri: splunk_util.make_full_url('app/'+app+'/report', {'s': saved.id})
                };
                if (saved.entry.content.get('request.ui_dispatch_view')) {
                    obj.dispatchView = saved.entry.content.get('request.ui_dispatch_view');
                }
            } else {
                return false;
            }
            return obj;
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
                    var href = $node.attr('href');
                    if(href.indexOf('/') === 0 && href[1] !== '/'){
                        href = splunk_util.make_url(href);
                    }
                    obj = {
                        label: $node.text(),
                        uri: href,
                        viewName: $node.attr('name') || ''
                    };

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
                return model.entry.acl.get('app') == app;
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
    }
);

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

                this.render();
                this.setBannerColor();
                this.model.appNav.on('change:color', this.setBannerColor, this);
            },
            render: function() {
                var html = _.template(templateMaster);
                this.$el.html(html);
                this.$el.find('.nav').html(this.children.appNav.el);
                this.$el.find('.app-name').html(this.children.appLabel.el);

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
                    this.$el.css('filter', gradients[i]);
                }
            }
        },
        {
            END_GRADIENT_LUMINOSITY: 0.90,
            createWithAppNavUrl: function(options){
                var self = this;
                options.model.application.on('change', function(appModel){
                    var url = route.appNavUrl(appModel.get('root'), appModel.get('locale'), appModel.get('app'));
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
                            appModel.get('app')
                        );

                        appLogo = route.appLogo(
                            options.model.application.get('root'),
                            options.model.application.get('locale') || '',
                            options.model.application.get('owner'),
                            appModel.get('app')
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
                options.model.appNav = new (Backbone.Model.extend())();

                if(options.appServerUrl){
                    this.createWithAppNavUrl(options);
                }else{
                    this.createWithBackbone(options);
                }

                return new View(options);
            }
        });
    return View;
});

define('splunkjs/mvc/headerview',['require','exports','module','underscore','./mvc','./basesplunkview','views/shared/splunkbar/Master','views/shared/appbar/Master','models/Application','./utils','splunk.config'],function (require, exports, module) {
    var _ = require("underscore"),
        mvc = require('./mvc'),
        BaseSplunkView = require("./basesplunkview"),
        GlobalNav = require('views/shared/splunkbar/Master'),
        AppNav = require('views/shared/appbar/Master'),
        ApplicationModel = require('models/Application'),
        utils = require('./utils'),
        splunkConfig = require('splunk.config');


    var HeaderView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: 'splunk-header',

        options: {
            appbar: true
        },

        initialize: function() {
            this.configure();
            var pageInfo = utils.getPageInfo();
            var applicationModel = new ApplicationModel({
                owner: splunkConfig.USERNAME
            });

            this.globalNav = GlobalNav.create({
                model: {
                    application: applicationModel
                }
            });

            if(this.settings.get('appbar')){
                this.appNav = AppNav.create({
                    model: {
                        application: applicationModel
                    }
                });
            }

            applicationModel.set({
                root: pageInfo.root,
                locale: pageInfo.locale,
                app: pageInfo.app,
                page: pageInfo.page
            });
        },
        render: function() {
            this.$el.empty()
                .append(this.globalNav.render().el);
            if(this.settings.get('appbar')){
                this.$el.append(this.appNav.render().el);
            }
            return this;
        }
    });

    return HeaderView;
});
