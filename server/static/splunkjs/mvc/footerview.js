
define('contrib/text!views/shared/footer/AboutDialog.html',[],function () { return '<dl class="list-dotted">\n    <dt><%= _(\'Splunk Version\').t() %></dt>\n    <dd><%= version %></dd>\n    <dt><%= _(\'Splunk Build\').t() %></dt>\n    <dd><%= build %></dd>\n</dl>\n<dl class="list-dotted">\n    <dt><%= _(\'Current App\').t() %></dt>\n    <dd><%= currentApp %></dd>\n    <% if (appVersion) { %>\n        <dt><%= _(\'App Version\').t() %></dt>\n        <dd><%= appVersion %></dd>\n    <% } %>\n    <% if (appBuild) { %>\n        <dt><%= _(\'App Build\').t() %></dt>\n        <dd><%= appBuild %></dd>\n    <% } %>\n</dl>\n<% if (listOfProducts) { %>\n<dl class="list-dotted">\n    <dt><%= _(\'List of Products: \').t() %></dt>\n    <dd><%= listOfProducts %></dd>\n</dl>\n<% } %>\n<dl class="list-dotted">\n    <dt><%= _(\'Server Name\').t() %></dt>\n    <dd><%= serverName %></dd>\n</dl>\n';});

define('views/shared/footer/AboutDialog',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/Modal',
        'contrib/text!views/shared/footer/AboutDialog.html'
    ],
    function(
        _,
         module,
         Base,
         Modal,
         Template
    ){
        return Modal.extend({
            moduleId: module.id,
            template: Template,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                var that = this,
                    currentAppName = that.model.applicationModel.get('app'),
                    currentApp;
                if (currentAppName === 'launcher') {
                    that.currentAppLabel = _('Home').t();
                } else {
                    currentApp = that.collection.find(function(app) {
                        return app.entry.get('name') === currentAppName;
                    });
                    that.currentAppLabel = currentApp ? currentApp.entry.content.get('label') : _('N/A').t();
                }

                this.model.serverInfo.on('change reset', function() {
                    this.render();
                }, this);
            },
            getListOfProducts: function() {
                var addOns = this.model.serverInfo.entry.content.get('addOns'),
                    result;

                if (addOns && !$.isEmptyObject(addOns)) {
                    result = _(addOns).keys().join(', ');
                }
                return result;
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("About Splunk").t());

                var template = this.compiledTemplate({
                    serverName: this.model.serverInfo.entry.content.get('serverName') || _('N/A').t(),
                    version: this.model.serverInfo.entry.content.get('version') || _('N/A').t(),
                    build: this.model.serverInfo.entry.content.get('build') || _('N/A').t(),
                    appVersion: this.model.appLocal.entry.content.get('version') || null,
                    appBuild: this.model.appLocal.entry.content.get('build') || null,
                    listOfProducts: this.getListOfProducts(),
                    currentApp: this.currentAppLabel
                });
                this.$(Modal.BODY_SELECTOR).html(template);

                return this;
            }
        });
    });

define('contrib/text!views/shared/footer/Master.html',[],function () { return '<ul class="nav nav-footer">\n    <li><a href="#" id="about"><%= _(\'About\').t() %></a></li>\n\n    <li><a href="http://www.splunk.com/r/support" target="_blank"><%= _(\'Support\').t() %></a></li>\n    <li><a href="http://www.splunk.com/r/bugs" target="_blank"><%= _(\'File a Bug\').t() %></a></li>\n    <li><a href="<%- makeDocLink(currentPageDocLocation) %>" target="_blank"><%- _("Documentation").t() %></a></li>\n    <li><a href="http://www.splunk.com/r/privacy" target="_blank"><%= _(\'Privacy Policy\').t() %></a></li>\n</ul>\n<p class="copyright">&copy; 2005-<%=new Date().getFullYear()%> <%= _(\'Splunk Inc. All rights reserved.\').t() %></p>\n';});

define('views/shared/footer/Master',[
    'jquery',
    'module',
    'views/Base',
    './AboutDialog',
    'models/services/server/ServerInfo',
    'models/Application',
    'models/services/AppLocal',
    'collections/services/AppLocals',
    'contrib/text!views/shared/footer/Master.html',
    'uri/route',
    'util/splunkd_utils'
],
    function(
        $,
        module,
        BaseView,
        AboutDialogView,
        ServerInfoModel,
        ApplicationModel,
        AppLocalModel,
        AppsCollection,
        footerTemplate,
        route,
        splunkDUtils
        ){
        var View = BaseView.extend({
                moduleId: module.id,
                className: 'splunkified',
                template: footerTemplate,
                initialize: function() {
                    BaseView.prototype.initialize.apply(this, arguments);

                    // can only render once we have application and appLocal ready
                    var applicationModelDeferred = $.Deferred();
                    var appLocalModelDeferred = $.Deferred();

                    if (this.options.model.application.get('app')) {
                        applicationModelDeferred.resolve();
                    } else {
                        this.options.model.application.on('change reset', applicationModelDeferred.resolve);
                    }     

                    if (this.options.model.appLocal.entry.content.get('version')) {
                        appLocalModelDeferred.resolve();
                    } else {
                        this.options.model.appLocal.on('change reset', appLocalModelDeferred.resolve);
                    }
                    
                    $.when(applicationModelDeferred, appLocalModelDeferred).done(this.render.bind(this));
                },
                events: {
                    'click a[id=about]': function(e) {
                        this.children.aboutDialog = new AboutDialogView({
                            collection: this.options.collection.apps,
                            model: {
                                applicationModel: this.options.model.application,
                                appLocal: this.options.model.appLocal,
                                serverInfo: this.options.model.serverInfo
                            },
                            onHiddenRemove: true
                        });
                        //for compatibility with the module system, this needs to be wrapped in an extra div.
                        this.modalWrapper = $('<div class="splunk-components">').appendTo("body").append(this.children.aboutDialog.render().el);
                        this.children.aboutDialog.once('hidden', function() {
                            this.modalWrapper.remove();
                        }, this);
                        
                        this.children.aboutDialog.show();
                        e.preventDefault();
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
                render: function() {
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
                    return this;
                }
            },
            {
                create: function(options){
                    options = options || {};
                    options.model = options.model || {};
                    options.collection = options.collection || {};
                    if (!options.model.serverInfo) {
                        options.model.serverInfo = new ServerInfoModel();
                        options.model.serverInfo.fetch();
                    }
                    var applicationDfd = $.Deferred();
                    if(!options.model.application){
                        options.model.application = new ApplicationModel();
                    }
                    
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
                                    url: splunkDUtils.fullpath(options.model.appLocal.url + "/" + options.model.application.get("app")),
                                    data: {
                                        app: options.model.application.get("app"),
                                        owner: options.model.application.get("owner")
                                    }
                                });
                            }
                        });
                    }

                    if (!options.collection.apps) {
                        options.collection.apps = new AppsCollection();
                        options.collection.apps.fetch({
                            data: {
                                sort_key: 'name',
                                sort_dir: 'desc',
                                app: '-' ,
                                owner: options.model.application.get('owner'),
                                search: 'visible=true AND disabled=0 AND name!=launcher',
                                count:-1
                            }
                        });
                    }

                    return new View(options);
                }
            });
        return View;
    });

define('splunkjs/mvc/footerview',['require','exports','module','jquery','underscore','./mvc','./basesplunkview','views/shared/footer/Master','./sharedmodels'],function (require, exports, module) {
    var $ = require('jquery');
    var _ = require('underscore');
    var mvc = require('./mvc');
    var BaseSplunkView = require("./basesplunkview");
    var Footer = require('views/shared/footer/Master');
    var sharedModels = require('./sharedmodels');

    var FooterView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: 'splunk-footer',
        initialize: function() {
            var appModel = sharedModels.get("app");
            var appLocalModel = sharedModels.get("appLocal");
            var serverInfoModel = sharedModels.get("serverInfo");
            var appLocals = sharedModels.get("appLocals");

            this.dfd = $.when.apply($, [
                appModel.dfd,
                appLocalModel.dfd,
                serverInfoModel.dfd,
                appLocals.dfd
            ]);
            this.dfd.done(_.bind(function(){
                this.footer = Footer.create({
                    model: {
                        application: appModel,
                        appLocal: appLocalModel,
                        serverInfo: serverInfoModel
                    },
                    collection: {
                        apps: appLocals
                    }
                });
            }, this));
        },
        render: function() {
            this.dfd.done(_.bind(function(){
                this.$el.append(this.footer.render().el);
            }, this));
            return this;
        }
    });

    return FooterView;
});