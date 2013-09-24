
define('views/shared/searchbar/Apps',
    [
        'underscore',
        'module',
        'views/shared/controls/SyntheticSelectControl',
        'uri/route'
    ],
    function(_, module, SyntheticSelectControl, route) {
        return SyntheticSelectControl.extend({
            moduleId: module.id,
            initialize: function() {
                this.options = _.defaults({
                    className: 'btn-group',
                    toggleClassName: 'btn',
                    iconURLClassName: "menu-icon",
                    menuClassName: "dropdown-menu-tall dropdown-menu-apps",
                    label: _("App: ").t(),
                    items: [],
                    model: this.model,
                    modelAttribute: 'display.prefs.searchContext',
                    popdownOptions: {attachDialogTo:'body'}
                }, this.options);

                this.collection.on('change', _.debounce(this.update, 0), this);
                SyntheticSelectControl.prototype.initialize.call(this, this.options);

                this.update();
            },
            update: function() {
                var items = [];
                this.collection.each(function(model) {
                    var navData = model.get('navData');
                    if (navData && navData.searchView) {
                        var appmodel = this.options.applicationModel;

                        var appIcon = route.appIconAlt(
                            appmodel.get('root'),
                            appmodel.get('locale'),
                            appmodel.get('owner'),
                            model.get('appName')
                        );

                        items.push({
                            value: model.get('appName'),
                            label: model.get('appLabel'),
                            iconURL: appIcon
                        });
                    }
                }.bind(this));

                this.setItems(items);
            }
        });
    }
);

define('models/SHelper',
    [
        'jquery',
        'underscore',
        'models/Base',
        'backbone',
        'splunk.util'
    ],
    function($, _, BaseModel, Backbone, splunkUtil) {
        var SHelper = BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            url: splunkUtil.make_url('api/shelper'),
            sync: function(method, model, options) {
                if (method!=='read') {
                    throw new Error('invalid method: ' + method);
                }
                options = options || {};
                var defaults = {
                        data: {},
                        dataType: 'text'
                    },
                    url = _.isFunction(model.url) ? model.url() : model.url || model.id;
                defaults.url = url;
                $.extend(true, defaults, options);
                return Backbone.sync.call(this, method, model, defaults);
            },
            parse: function(response) {
                return {raw: response};
            }
        });
        return SHelper;
    }
);
define('views/shared/searchbar/Input',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base',
        'views/shared/delegates/TextareaResize',
        'models/SHelper',
        'splunk.util',
        'util/dom_utils',
        'jquery.bgiframe',
        'splunk.jquery.csrf'
    ],
    function($, _, module, BaseView, TextareaResize, SHelperModel, splunk_util, dom_utils /* remaining dependencies do not export */) {
        var View = BaseView.extend({
           keys: {
               ENTER : 13,
               UP_ARROW: 38,
               DOWN_ARROW: 40,
               LEFT_ARROW: 37,
               RIGHT_ARROW: 39,
               PAGE_DOWN: 34,
               PAGE_UP: 33,
               SPACE_BAR: 32,
               TAB: 9,
               ESCAPE: 27
           },
           moduleId: module.id,
           id: 'search',
           /**
            * @param {Object} options {
            *     model: <models.Report.entry.content>
            * }
            */
           initialize: function(options) {
               if (!this.children) {
                   BaseView.prototype.initialize.apply(this, arguments);
                   this.debouncedFillAssistant = _.debounce(this.fillAssistant, 250).bind(this);
               }
               
               this.options = $.extend(true, {}, this.options, (options || {}));

               var defaults = {
                   useTypeahead: true,
                   useAssistant: true,
                   useAutoFocus: true,
                   autoOpenAssistant: splunk_util.normalizeBoolean(this.model.get('display.prefs.autoOpenSearchAssistant')),
                   showCommandHelp: true,
                   showCommandHistory: true,
                   showFieldInfo: false,
                   maxSearchBarLines: 80,
                   minWithForTwoColumns: 560,
                   singleton: false,
                   disableOnSubmit: false,
                   assistantDelay: 200
               };
               _.defaults(this.options, defaults);

               this.assistant = {
                   enabled: false,
                   rolloverEnabled: true, //required to override mouseenter function during keyboard scrolling.
                   cursor: 0,
                   rolloverTimer: 0
               };
               this.multiline = false;
               
               var reportContentModel = this.model;
               this.model = {
                    content: reportContentModel,
                    sHelper: new SHelperModel()     
               };
               
               // None Contained Event Binding
               this.model.content.on('change:search', function(){
                   this.setSearchString(this.model.content.get('search') || "");
                   if (this.hasOwnProperty("resize")) {
                       this.children.resize.resizeTextarea();
                       this.updateMultiline();
                   }
               }, this);
               
               this.model.content.on('applied', function(options){
                   this._onFormSubmit(options);
               }, this);
               
               if (this.options.singleton) {
                   this.model.content.on('enableSearchInput', function() {
                       this.$('.search-field').attr('disabled', false);
                   }, this);                   
               }
               
               if (!this.$el.html()) {
                   $(window).on('resize.' + this.uniqueNS(), this.setAssistantWidth.bind(this));
    
                   $(document).on('keyup.' + this.uniqueNS(), function(e) {
                       if (e.keyCode == this.keys['ESCAPE']) {
                           this.closeAssistant();
                       }
                   }.bind(this));
                   
                   $(document).on('click.' + this.uniqueNS(), function(e) {
                       if ((e.target === this.$el[0]) ||($.contains(this.$el[0], e.target))) {
                           return;
                       }
                       this.closeAssistant();
                  }.bind(this));

              }

           },
           events: {
               'click     .search-assistant-autoopen-toggle' :    'toggleAutoOpen',
               'click     .search-assistant-activator' :   'toggleAssistant',
               'focus     .search-field' :                 'onSearchFieldFocus',
               'keydown   .search-field' :                 'onSearchFieldKeyDown',
               'keyup     .search-field' :                 'onSearchFieldKeyUp',
               'keydown   a.sakeyword' :                   'onKeywordKeyDown',
               'keyup     a.sakeyword' :                   'onKeywordKeyUp',
               'keyup     .salink' :                       'onKeywordKeyUp',
               'click     .search-assistant-container a' : 'onSuggestionSelect',
               'mousedown .search-assistant-resize' :       'resizeAssistant',
               //this is a port of the generated javascript from within the shelper mako template
               'click .saMoreLink': function(evt) {
                   var $element = $(evt.target);
                   if ($element.hasClass('saMoreLinkOpen')) {
                       $element.removeClass('saMoreLinkOpen')
                              .html(_.t('More &raquo;'));
                       $($element.attr('divToShow')).css('display','none');   
                   } else {
                       $element.addClass('saMoreLinkOpen')
                              .html(_.t('&laquo; Less'));
                       $($element.attr('divToShow')).css('display', 'block');
                   }
               }
           }, 
           toggleAutoOpen: function(e) {
               this.setAutoOpen(!this.options.autoOpenAssistant);
               e.preventDefault();
           },
           setAutoOpen: function(isEnabled) {
               if (typeof(isEnabled) == 'undefined') {
                   isEnabled = this.options.autoOpenAssistant;
               } else {
                   this.options.autoOpenAssistant = isEnabled;
               }

               if (splunk_util.normalizeBoolean(this.model.content.get('display.prefs.autoOpenSearchAssistant')) !== isEnabled) {
                   this.model.content.set({'display.prefs.autoOpenSearchAssistant': isEnabled});
               }

               this.$assistantAutoOpenToggle.find("i").toggleClass('icon-check', this.options.autoOpenAssistant);
           },
           onSearchFieldFocus: function(e) {
               this.assistant.cursor = - 1;
               this._highlightKeyword(this.assistant.cursor);
               return true;
           },
           onSearchFieldKeyUp: function(e) {
               if (e.metaKey || e.ctrlKey) {
                   return true;
               }
               this.updateMultiline();
               switch (e.keyCode) {
                   case this.keys['ESCAPE']:
                       return true; //don't open the search assistant.
                   case this.keys['ENTER']:
                       return false;
                   default:
                       break;
               }

               if (!this.assistant.enabled) {
                   if (this.options.autoOpenAssistant) {
                       this.openAssistant();
                   }
               } else {
                   this.debouncedFillAssistant();
               }
               this.onSearchFieldChange();

               var searchInput = this.getSearchFieldValue();
               this.model.content.set({search: searchInput}, {silent: true});

               return true;
           },
           onSearchFieldKeyDown: function(e) {
               if (e.metaKey || e.ctrlKey) {
                   return true;
               }
               switch (e.keyCode) {
                   case this.keys['TAB']:
                       this.closeAssistant();
                       break;
                   case this.keys['DOWN_ARROW']:
                       // Left bracket and down arrow register as 40. If the shift key is down, then it must be a bracket.
                       if (!e.shiftKey) return this.onSearchFieldDownArrow(e);
                       break;
                   case this.keys['ENTER']:
                       return this.onSearchFieldEnter(e);
                   default:
                       break;
               }
               return true;
           },
           onSearchFieldDownArrow: function(e) {
               if (this.assistant.enabled && this.$assistantKeywordCount>0 && (!this.children.resize.isMultiline() || this.children.resize.caretIsLast())) {
                   this.selectNextKeyword();
                   return false;
               } else if (!this.assistant.enabled && (this.getSearchFieldValue() =='')) {
                   this.openAssistant();
               }
           },
           updateMultiline: function() {
               // add mulitline class for state style
               var multiline = this.children.resize.isMultiline();

               if (multiline &&( multiline != this.multiline)) {
                 this.$el.addClass('multiline');
                 this.multiline = true;
               } else if (!multiline && (multiline != this.multiline)) {
                 this.$el.removeClass('multiline');
                 this.multiline = false;
               }
           },
           resizeAssistant: function(e) {
               var startY = e.pageY;
               var startHeight = this.$assistantContainer.height();
               e.preventDefault();
               e.stopPropagation();

               this.$assistantResize.on("click.assistantResizeActive",
                   function(e){
                       e.preventDefault();
                       e.stopPropagation();
                       return false;
                   }.bind(this)
               );

               $(document).on("mousemove.assistantResizeActive",
                   function(e){
                       var newHeight = startHeight - (startY - e.pageY);
                       newHeight = newHeight < 75 ? 0 : newHeight;
                       newHeight = Math.min(newHeight, 500);
                       this.setAssistantHeight(newHeight);
                       e.preventDefault();
                       e.stopPropagation();
                       return false;
                   }.bind(this)
               );

               $(document).on("mouseup.assistantResizeActive",
                   function(e){
                       var newHeight = startHeight - (startY - e.pageY);
                       if (newHeight < 75) {
                           this.closeAssistant();
                           this.setAssistantHeight(startHeight);
                       }
                       $(document).off(".assistantResizeActive");
                   }.bind(this)
               );
               return false;
           },
           toggleAssistant: function(e) {
               this.searchFieldfocus();
               if (this.assistant.enabled) {
                   this.closeAssistant();
               } else {
                   this.openAssistant();
               }
               e.preventDefault();
           },
           closeAssistant: function() {
               this.model.sHelper.fetchAbort();
               // Exit early if closeAssistant has been called before render has created all of the views
               if (!this.$assistantContainer)
                    return false;

               this.$assistantContainer.hide();
               this.$assistantAutoOpenToggle.hide();
               this.assistant.enabled = false;
               this.model.sHelper.fetchAbort();
               this.$assistantActivator.addClass("icon-triangle-down-small").removeClass("icon-triangle-up-small");
               this.$assistantResize.removeClass("search-assistant-resize-active");
               this.$el.removeClass('search-assistant-open');
               return true;
           },
           openAssistant: function() {
               if (!this.options.useAssistant) {
                   return false;
               }
               this.assistant.enabled = true;
               this.$assistantActivator.addClass("icon-triangle-up-small").removeClass("icon-triangle-down-small");
               this.$assistantResize.addClass("search-assistant-resize-active");
               this.$el.addClass('search-assistant-open');
               this.fillAssistant();
               return true;
           },
           _getUserEnteredSearch: function() {
               var q = this.$searchField.attr('value') || '*';
               q = splunk_util.addLeadingSearchCommand(q, true);
               return q;
           },
           fillAssistant: function() {
               if (!this.assistant.enabled) return false;
               var searchString = this._getUserEnteredSearch();
               
               //TODO: revisit multi app namespace support
               var namespace    = 'search';//Splunk.util.getCurrentApp();
               
               this.model.sHelper.safeFetch({
                   data: {
                       'snippet': 'true',
                       'snippetEmbedJS': 'false',
                       'namespace': namespace,
                       'search': searchString,
                       'useTypeahead': this.options.useTypeahead,
                       'useAssistant': this.options.useAssistant,
                       'showCommandHelp': this.options.showCommandHelp,
                       'showCommandHistory': this.options.showCommandHistory,
                       'showFieldInfo': this.options.showFieldInfo
                   },
                   success: function() {
                       this.$assistantContainer.html(this.model.sHelper.get('raw') || '');
                       this.fillAssistantCompleteCallback();
                   }.bind(this)
               });
               return true;
           },
           fillAssistantCompleteCallback: function() {
               if (!this.assistant.enabled) {
                   return false;
               }
               this.setAssistantWidth();
               this.$assistantContainer.show().bgiframe().scrollTop(0);
               this.$assistantAutoOpenToggle.show();
               this.setAssistantHeight(this.$assistantContainer.height() || 250);

               this.$assistantKeywordCount = this.$('.sakeyword').length;
               this.assistant.cursor = -1;
               this.searchFieldfocus();

               return true;
           },
           setAssistantHeight: function(newHeight) {
               if (newHeight > 500) newHeight = 500; // make sure we don't go over 500px
               this.$assistantContainer.height(newHeight);
               this.$('.saHelpWrapper').css('min-height', newHeight);
           },
           setAssistantWidth: function() {
               var assistantInner = this.$('.assistantInner');

               if(assistantInner.length && (this.$searchField.width() < this.options.minWithForTwoColumns)) {
                   assistantInner.addClass('assistant-inner-narrow');
               } else {
                   assistantInner.removeClass('assistant-inner-narrow');
               }
               return true;
           },
           onSearchFieldChange: function() {
                if (this.searchFieldIsEmpty()) {
                   this.$label.show();
                   return true;
                } else {
                   this.$label.hide();
                   return false;
                }
           },
           searchFieldIsEmpty: function() {
               return (this.getSearchFieldValue().length == 0);
           },
           getSearchFieldValue: function(){
               return $.trim(this.$searchField.attr('value'));
           },
           onKeywordKeyUp: function(e) {
               if (e.metaKey || e.ctrlKey || e.shiftKey) {
                   return true;
               }
               switch (e.keyCode) {
                   case this.keys['DOWN_ARROW']:
                   case this.keys['UP_ARROW']:
                   case this.keys['TAB']:
                   case this.keys['ENTER']:
                   case this.keys['LEFT_ARROW']:
                   case this.keys['RIGHT_ARROW']:
                   case this.keys['SPACE_BAR']:
                       return false;
                   default:
                       break;
               }

               if (!this.assistant.enabled) {
                   if (this.options.autoOpenAssistant) {
                       this.openAssistant();
                   }
               } else {
                   this.fillAssistant();
               }
               return true;
           },
           selectNextKeyword: function() {
               if (this.assistant.cursor >= (this.$assistantKeywordCount-1)) {
                   this.assistant.cursor = this.$assistantKeywordCount - 1;
               } else {
                   this.assistant.cursor += 1;
                   this._highlightKeyword(this.assistant.cursor);
               }
               return true;
           },
           onSearchFieldEnter: function(e) {

               //ctrl-enter|shift-enter adds line to the textarea
               if (e.ctrlKey || e.shiftKey) {
                   return true;
               }

               if (this.assistant.enabled) {
                   this.closeAssistant();
               }
               this._onFormSubmit();

               return false;
           },

           _highlightKeyword: function(keywordPosition) {
               // set the CSS style for selected
               var el = $('.sakeyword', this.$assistantContainer
                   ).removeClass('saKeywordSelected'
                   ).slice(keywordPosition, keywordPosition + 1
                   ).addClass('saKeywordSelected');

               if (el.length) {
                   // keep selected item in view
                   var win = this.$assistantContainer;
                   var visibleWindowTop = win.scrollTop();
                   var visibleWindowBottom = win.scrollTop() + win.height();
                   var elementTop = el.position().top + visibleWindowTop;

                   var elementHeight = el.outerHeight();
                   if (elementTop < visibleWindowTop) {
                       win.scrollTop(elementTop);
                   } else if (elementTop + elementHeight > visibleWindowBottom) {
                       win.scrollTop(elementTop + elementHeight - win.height());
                   }

                   el.focus();
               }
               return true;
           },
           _onFormSubmit: function(options) {
               options = options || {};
               // don't do anything if there's nothing in the search box
               if (this.searchFieldIsEmpty()) {
                   return false;
               } else {
                   if (this.options.disableOnSubmit) {
                       this.$('.search-field').attr('disabled', true);
                   }
                   var currentSearch = this.model.content.get('search'),
                       searchInput = this.getSearchFieldValue();

                   if (currentSearch !== searchInput){
                       this.model.content.set({ search: searchInput }, options);
                   } else {
                       if (!options.silent) {
                           this.model.content.unset("search", {silent: true});
                           this.model.content.set({search: searchInput});
                       }
                   }

                   return true;
               }
           },
           onKeywordKeyDown: function(e) {
               if (e.metaKey || e.ctrlKey) {
                   return true;
               }
               switch (e.keyCode) {
               case this.keys['DOWN_ARROW']:
                   // Left bracket and down arrow register as 40. If the shift key is down, then it must be a bracket.
                   if (!e.shiftKey) return this.onSearchFieldDownArrow(e);
                   break;
               case this.keys['UP_ARROW']:
                   return this.onKeywordUpArrow(e);
               case this.keys['TAB']:
               case this.keys['ENTER']:
               case this.keys['RIGHT_ARROW']:
               case this.keys['SPACE_BAR']:
                   return this.onSuggestionSelect(e);
               default:
                   break;
               }
               return true;
           },
           onKeywordUpArrow: function(e) {
               if (this.assistant.enabled && (this.$assistantKeywordCount>0)) {
                   this.selectPreviousKeyword();
                   return false;
               }
           },
           selectPreviousKeyword: function() {
               if (this.assistant.cursor <= 0) {
                   this.assistant.cursor = -1;
                   this.searchFieldfocus();
               } else {
                   this.assistant.cursor -= 1;
               }
               this._highlightKeyword(this.assistant.cursor);
               return true;
           },
           onSuggestionSelect: function(e) {
               var newval = $.trim($(e.currentTarget).attr('replacement'));

               if (!this.assistant.enabled || !newval) {
                   return true;
               }

               if (newval.substr(-1) != '=') {
                      newval += ' '; // don't add space after =
               }
               this.setSearchString(newval);
               this.fillAssistant();

               //Set the cursor position to the end
               dom_utils.setCaretPosition(this.$('.search-field').get(0), this.$searchField.attr('value').length);

               e.preventDefault();
           },
           /**
            * Sometimes, like when we're resurrecting a search, we will
            * write our own input value.
            */
           setSearchString: function(terms) {
               this.$searchField.attr('value', terms);
               this.onSearchFieldChange();
               this.searchFieldfocus();
               if (this.children.resize) {
                   this.children.resize.resizeTextarea();
                   this.updateMultiline();
               }
           },
           searchFieldfocus: function() {
               if (!this.$('.search-field').attr('disabled')) {
                   this.$('.search-field').focus();
               }
           },
           render: function() {
               var html = this.$el.html();
               if ((this.options.singleton && !html) || !this.options.singleton) {
                   var self = this,
                       inputValue = this.model.content.get('search') || "";

                   var template = _.template(this.template, {
                       showButton: true,
                       label: 'Search',
                       id: Math.random() * 600000,
                       inputValue: inputValue,
                       _: _
                   });

                   this.$el.html(template);

                   // Setup shortcuts
                   this.$label = this.$('label');
                   this.$assistantWrapper = this.$('.search-assistant-wrapper');
                   this.$assistantContainer = this.$('.search-assistant-container');
                   this.$assistantAutoOpenToggle = this.$('.search-assistant-autoopen-toggle');
                   this.$assistantActivator = this.$('.search-assistant-activator');
                   this.$searchField = this.$('.search-field');
                   this.$assistantResize = this.$('.search-assistant-resize');

                   this.setAutoOpen();
                   this.paste = function() {
                       this.onSearchFieldChange();
                   };
                    
                    this.$('.search-field').bind('input propertychange', function() { this.paste(); }.bind(this));

                   _.defer(function(){
                       if (self.options.useAutoFocus) {
                           self.searchFieldfocus();
                       }
                       var maxLines = Math.floor(($(window).height() - 100) / parseInt(this.$('.search-field').css('lineHeight'), 10));
                       self.children.resize = new TextareaResize({el: self.$searchField[0], maxLines: maxLines, minHeight: 20});
                       self.updateMultiline();
                   });

                   if (!this.options.useAssistant) {
                       this.$assistantWrapper.hide();
                   }

                   this.onSearchFieldChange();
               } else {
                   this.$('.search-field').val(this.model.content.get('search') || '');
               }
               
               if (this.options.disableOnSubmit) {
                   this.$('.search-field').attr('disabled', false);
               }
               
               return this;
           },
           reflow: function() {
               var el = this.$('.search-field').get(0),
                   inputValue = this.model.content.get('search') || "",
                   currentCaretPos = dom_utils.getCaretPosition(el);
               dom_utils.setCaretPosition(el, (currentCaretPos || inputValue.length));
               BaseView.prototype.reflow.apply(this, arguments);
           },
           remove: function() {
               if (!this.options.singleton) {
                   $(window).off('resize.' + this.uniqueNS());
                   $(document).off('keyup.' + this.uniqueNS());
                   $(document).off('click.' + this.uniqueNS());
                   $(document).on('mousemove.assistantResizeActive');
                   $(document).on('mouseup.assistantResizeActive'); 
                   this.$('.search-field').off('input propertychange', this.paste);
                   return BaseView.prototype.remove.apply(this, arguments);
               }
               this.model.sHelper.fetchAbort();
               return this;
           },
           template: '\
                <div class="search-field-background"> \
                </div> \
                <div class="search-field-wrapper"> \
                    <label for="<%- id %>" class="placeholder-text"><%- _("enter search here...").t() %></label> \
                    <textarea rows="1" name="q" spellcheck="false" class="search-field" id="<%- id %>" autocorrect="off" autocapitalize="off"><%- inputValue %></textarea> \
                </div> \
                <div class="search-assistant-wrapper"> \
                    <div class="search-assistant-container-wrapper"><div class="search-assistant-container"></div></div> \
                    <a class="search-assistant-autoopen-toggle" href="" style="display:none;"><i></i><%= _("Auto Open").t() %></a> \
                       <div class="search-assistant-resize"></div> \
                    <a href="#" class="search-assistant-activator icon-triangle-down-small"></a>\
                </div> \
             '
        },
        {
            instance: function(options) {
                if (!options || !options.model) {
                    throw new Error("You must define a state model to use this instance static method");
                }
                if (!View._instance) {
                    View._instance = new View(options);
                } else {
                    View._instance.stopListening();
                    View._instance._configure(options);
                    View._instance.initialize(options);
                }
                return View._instance;
            }
        });
        return View;
    }
);


define('views/shared/searchbar/Submit',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base'
    ],
    function($, _, Backbone, module, BaseView) {
        return BaseView.extend({
            moduleId: module.id,
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click .btn': function(e) {
                    this.model.trigger('applied');
                    e.preventDefault();
                }
            },
            render: function() {
                var template = _.template(this.template, {});
                this.$el.html(template);

                return this;
            },
            template: '\
                <a class="btn" href="#"><i class="icon-search-thin"></i></a>\
            '
        });
    }
);

define('views/shared/searchbar/Master',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/searchbar/Apps',
        'views/shared/searchbar/Input',
        'views/shared/timerangepicker/Master',
        'views/shared/searchbar/Submit'
    ],
    function($, _, Backbone, module, BaseView, Apps, Input, TimeRangePicker, Submit) {
        return BaseView.extend({
            moduleId: module.id,
            className: 'search-bar-wrapper',
            /**
             * @param {Object} options {
             *     model: {
             *         state: <models.Report.entry.content>,
             *         timeRange: <models.TimeRange>,
             *         appLocal: <models.services.AppLocal>,
             *         user: <models.services.authentication.User>,
             *         application: <models.Application>
             *     },
             *     collection: {
             *         times (Optional): <collections.services.data.ui.TimesV2>,
             *         apps (Optional): <collections.services.AppsLocals>
             *     }
             * }
             */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);

                _.defaults(this.options, {
                    showTimeRangePicker:true,
                    singletonInput: false,
                    disableOnSubmit: false,
                    primaryAction: false
                });
                this.showTimeRangePicker = this.options.showTimeRangePicker;

                if (this.collection && this.collection.apps) {
                    this.children.apps = new Apps({
                        collection: this.collection.apps,
                        model: this.model.state,
                        applicationModel: this.model.application
                    });
                }

                if (this.options.singletonInput) {
                    this.children.searchInput = Input.instance({
                        model: this.model.state,
                        singleton: this.options.singletonInput,
                        disableOnSubmit: this.options.disableOnSubmit
                    });
                } else {
                    this.children.searchInput = new Input({
                        model: this.model.state
                    });                    
                }


                if (this.showTimeRangePicker) {
                    this.children.timeRangePicker = new TimeRangePicker({
                        model: {
                            state: this.model.state,
                            timeRange: this.model.timeRange,
                            appLocal: this.model.appLocal,
                            user: this.model.user,
                            application: this.model.application
                        },
                        collection: this.collection.times,
                        timerangeClassName: 'btn'
                    });
                }

                this.children.submit = new Submit({
                    model: this.model.state
                });

            },
            render: function() {
                var template = _.template(this.template, {showTimeRangePicker: this.showTimeRangePicker, primary: this.options.primaryAction});
                this.$el.html(template);

                if (this.children.apps) {
                    this.$('.search-apps').append(this.children.apps.render().el);
                }
                this.$('.search-input').append(this.children.searchInput.render().el);
                if (this.showTimeRangePicker) {
                    this.$('.search-timerange').append(this.children.timeRangePicker.render().el);
                }
                this.$('.search-button').append(this.children.submit.render().el);
                return this;
            },
            template: '\
                <form method="get" action="" class="search-form">\
                    <table class="search-bar <%- primary ? "search-bar-primary" : "" %>">\
                        <tbody>\
                            <tr>\
                                <td class="search-input" width="100%"></td>\
                                <td class="search-apps"></td>\
                                <% if (showTimeRangePicker) { %>\
                                    <td class="search-timerange"></td>\
                                <% } %>\
                                <td class="search-button"></td>\
                            </tr>\
                        </tbody>\
                    </table>\
                </form>\
            '
        });
    }
);

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/search-bar.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/searchbarview',['require','exports','module','underscore','./mvc','backbone','./basesplunkview','util/console','./timerangeview','views/shared/searchbar/Master','models/TimeRange','./utils','splunk.config','./sharedmodels','css!../css/search-bar'],function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('./mvc');
    var Backbone = require("backbone");
    var BaseSplunkView = require("./basesplunkview");
    var console = require('util/console');
    var TimeRangeView = require("./timerangeview");
    var InternalSearchBar = require("views/shared/searchbar/Master");
    var TimeRangeModel = require('models/TimeRange');
    var utils = require('./utils'), SplunkConfig = require('splunk.config');
    var sharedModels = require('./sharedmodels');

    require("css!../css/search-bar");
    
    var SearchBarView = BaseSplunkView.extend(
        // Instance
        {
            moduleId: module.id,
            
            className: "splunk-searchbar",
            
            options: {
                "default": undefined,
                managerid: null,
                timerange: true,
                value: undefined
            },
            
            initialize: function() {
                var that = this;
                
                this.configure();
                this.settings.enablePush("value");
                
                if (this.settings.has('timepicker')) {
                    console.warn(
                        'The "%s" setting of class "%s" is deprecated. Use "%s" instead.',
                        'timepicker', 'SearchBarView', 'timerange');
                    this.settings.set('timerange', this.settings.get('timepicker'));
                    this.settings.unset('timepicker');
                }
                
                // Initialize value with default, if provided
                this._onDefaultChange();
                
                this._state = new Backbone.Model({
                    'dispatch.earliest_time': this.settings.get("earliest_time"),
                    'dispatch.latest_time': this.settings.get("latest_time"),
                    'search': this.settings.get('value') || ""
                });
                
                // Get the shared models
                var appModel = sharedModels.get("app");
                var userModel = sharedModels.get("user");
                var appLocalModel = sharedModels.get("appLocal");
                var timesCollection = sharedModels.get("times");
                
                var timeRangeModel = new TimeRangeModel();
                timeRangeModel.save({
                    'earliest': this.settings.get("earliest_time"),
                    'latest': this.settings.get("latest_time")
                });
                
                var createTimeRange = function(settings, searchbar) {
                    var timeRangeOptions = settings.extractWithPrefix('timerange_');
                    var timePickerOptions = settings.extractWithPrefix('timepicker_');
                    if (!_.isEmpty(timePickerOptions)) {
                        console.warn(
                            'The "%s" settings of class "%s" are deprecated. Use "%s" instead.',
                            'timepicker_*', 'SearchBarView', 'timerange_*');
                    }
                    
                    var options = _.extend(
                        { managerid: settings.get("managerid") },
                        timeRangeOptions,
                        timePickerOptions);
                    
                    if (searchbar) {
                        options["timepicker"] = searchbar.children.timeRangePicker;
                        options["el"] = searchbar.children.timeRangePicker.el;
                    }
                    
                    return new TimeRangeView(options);
                };
                
                // We cannot create the searchbar/timerange until these internal models
                // have been fetched, and so we wait on them being done.
                this._dfd = $.when(timesCollection.dfd, userModel.dfd, appLocalModel.dfd).done(function() {
                    that.searchbar = new InternalSearchBar({
                        showTimeRangePicker: true,
                        collection: {
                            times: timesCollection
                        },
                        model: {
                            state: that._state,
                            timeRange: timeRangeModel,
                            user: userModel,
                            appLocal: appLocalModel,
                            application: appModel
                        }
                    });
                    that.searchbar.children.searchInput.options.useAssistant = false;
                    that.searchbar.children.searchInput.options.disableOnSubmit = false;
                    
                    // We can either have the timerange created or not by this 
                    // point (depending on whether the deferred was done before
                    // $.when was called). We create it if it is not already created,
                    // otherwise we set the appropriate properties on it.
                    if (that.timerange) {
                        // Set the appropriate things on the timerange now that it is
                        // created. Note that we are depending on the fact that this
                        // will execute before the deferred handler in the timerange.
                        that.timerange.setElement(that.searchbar.children.timeRangePicker.el);
                        that.timerange.settings.set("timepicker", that.searchbar.children.timeRangePicker);
                    }
                    else {
                        that.timerange = createTimeRange(that.settings, that.searchbar);
                        
                        // Permit deprecated access to the 'timepicker' field
                        that.timepicker = that.timerange;
                    }
                });

    
                if (!this.timerange) {
                    // We create the timerange wrapper ahead of time so that we can
                    // reference it (e.g. mySearchbar.timerange) before the deferreds
                    // are resolved.
                    this.timerange = createTimeRange(this.settings);
                    
                    // Permit deprecated access to the 'timepicker' field
                    this.timepicker = this.timerange;
                }
                
                // Update view if model changes
                this.settings.on("change:value", function(model, value, options) {
                    options = options || {};
                    var suppressValSet = options._self;
                    if (!suppressValSet) {
                        that.val(value || "");
                    }
                });
                
                this.bindToComponentSetting('managerid', this._onManagerChange, this);
                
                this._state.on("change:search", this._onSearchChange, this);
                this.settings.on("change:timerange", this._onDisplayTimeRangeChange, this);
                this.settings.on("change:default", this._onDefaultChange, this);
            },
            
            _onDefaultChange: function(model, value, options) {
                // Initialize value with default, if provided
                var oldDefaultValue = this.settings.previous("default");
                var defaultValue = this.settings.get("default");
                var currentValue = this.settings.get('value');
                
                if (defaultValue !== undefined &&
                    (currentValue === oldDefaultValue || currentValue === undefined))
                {
                    this.settings.set('value', defaultValue);
                }
            },
            
            _onDisplayTimeRangeChange: function() {
                // We cannot work with the searchbar/timerange until they
                // are done being created.
                var that = this;
                $.when(this._dfd).done(function() {
                    if (that.settings.get("timerange")) {
                        that.searchbar.children.timeRangePicker.$el.show();
                    }
                    else {
                        that.searchbar.children.timeRangePicker.$el.hide();
                    }
                });
            },
            
            _onManagerChange: function(managers, manager) {
                if (this.manager) {
                    this.manager.off(null, null, this);
                    this.manager = null;
                }

                this.manager = manager;
                
                // We defer setting the query to let the underlying search bar
                // have enough to finish setting up. Since we might get a 
                // a manager synchronously, it may have not finished setting up
                // (e.g. it is setting its own deferred actions).
                var that = this;
                _.defer(function() {
                    that._updateQuery();
                });
            },
            
            render: function() {
                // We cannot work with the searchbar/timerange until they
                // are done being created.
                var that = this;
                $.when(this._dfd).done(function() {
                    // Remove the internal searchbar
                    that.searchbar.$el.detach();
                    
                    // Clear ourselves
                    that.$el.html('');
                    
                    // Re-render and re-append
                    that.searchbar.render();
                    that.$el.append(that.searchbar.el);
                    
                    // Ensure we properly show/hide the timerange
                    that._onDisplayTimeRangeChange();
                });
                                
                return this;
            },
            
            val: function(value) {
                if (value !== undefined) {
                    this._setSearch(value);
                    
                    /* 
                     * Force firing of a new change event, even if the new
                     * value is the same as the old value. This provides
                     * the expected behavior if the user presses enter in
                     * a search box to refresh the search.
                     */
                    this.settings.unset("value", {_self: true});
                    this.settings.set("value", value, {_self: true});
                    
                    this.trigger("change", value, this);
                }
                else {
                    return this._getSearch();
                }
            },
            
            _onSearchChange: function(model, value, options) {
                options = options || {};
                var suppressValSet = options._self;
                if (!suppressValSet) {
                    this.val(value);
                }
            },
            
            _getSearch: function() {
                return this._state.get("search");
            },
            
            _setSearch: function(newSearch) {
                this._state.set("search", newSearch, {_self: true});
            },
            
            _updateQuery: function() {
                // If we have a previous search query set, display it
                if (this.manager) {
                    var currentSearch = this._state.get("search") || "";
                    var newSearch = (this.manager.query.resolve() || "").trim();
                    
                    if (!currentSearch && newSearch) {
                        this._setSearch(newSearch);
                    }
                }
            }
        }
    );
    
    return SearchBarView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('.clearfix{*zoom:1;}.clearfix:before,.clearfix:after{display:table;content:\"\";line-height:0;}\n.clearfix:after{clear:both;}\n.hide-text{font:0/0 a;color:transparent;text-shadow:none;background-color:transparent;border:0;}\n.input-block-level{display:block;width:100%;min-height:26px;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;}\n.ie7-force-layout{*min-width:0;}\nform.search-form{margin-bottom:0;}\n.search-bar .btn,.search-bar .btn.dropdown-toggle{-webkit-border-radius:0;-moz-border-radius:0;border-radius:0;margin-right:-1px;line-height:28px;height:28px;white-space:nowrap;}\n.search-bar td{padding:0;vertical-align:top;}\n.search-bar td.search-input{width:100%;}\n.search-bar .search-field-background{height:36px;background-color:#ebebeb;background-image:-moz-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#f5f5f5), to(#dcdcdc));background-image:-webkit-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:-o-linear-gradient(top, #f5f5f5, #dcdcdc);background-image:linear-gradient(to bottom, #f5f5f5, #dcdcdc);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#fff5f5f5\', endColorstr=\'#ffdcdcdc\', GradientType=0);background-color:#e9e9e9;border:1px solid #aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;text-shadow:0 1px 0 #ffffff;-webkit-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);-moz-box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);box-shadow:0px 1px 1px rgba(0, 0, 0, 0.08);text-shadow:none;color:#333333;border-right:none;-webkit-border-top-left-radius:4px;-moz-border-radius-topleft:4px;border-top-left-radius:4px;-webkit-border-bottom-left-radius:4px;-moz-border-radius-bottomleft:4px;border-bottom-left-radius:4px;margin:-4px -4px -34px -4px;}\n.search-bar .search-timerange .btn{white-space:nowrap;-webkit-border-radius:0;-moz-border-radius:0;border-radius:0;min-width:55px;*display:inline;*zoom:1;*position:relative;*margin-top:-1px;}\n.search-bar .search-button .btn{-webkit-border-top-right-radius:4px;-moz-border-radius-topright:4px;border-top-right-radius:4px;-webkit-border-bottom-right-radius:4px;-moz-border-radius-bottomright:4px;border-bottom-right-radius:4px;margin-left:-2px;font-size:26px;}\n.search-bar .search-timerange .shared-timerangepicker .btn .time-label{display:inline-block;*display:inline;vertical-align:middle;max-width:10em;overflow:hidden;text-overflow:ellipsis;}\n.shared-searchbar-input{position:relative;padding:4px;}.shared-searchbar-input label.placeholder-text{display:none;padding:4px 0 0 5px;line-height:16px;display:block;position:absolute;margin:0;top:6px;left:6px;color:#999999;z-index:403;cursor:text;min-height:30px;}\n.shared-searchbar-input textarea[disabled=\"disabled\"]{background-color:#eeeeee;}\n.shared-searchbar-input textarea.search-field{min-height:30px;width:100%;display:block;line-height:20px;margin:0;overflow:hidden;resize:none;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;border:1px solid #aeaeae;border-top-color:#b7b7b7;border-bottom-color:#989898;box-shadow:inset 1px 1px 5px rgba(0, 0, 0, 0.35);position:relative;z-index:402;font-family:\'Droid Sans Mono\',Consolas,Monaco,\'Courier New\',Courier,monospace;*padding:0;*height:20px;*vertical-align:middle;}\n.shared-searchbar-input .shadowTextarea{*white-space:pre;*word-wrap:break-word;}\n.shared-searchbar-input.multiline .search-assistant-resize{margin:0;}\n.shared-searchbar-input.multiline textarea.search-field,.shared-searchbar-input.search-assistant-open textarea.search-field{-webkit-border-bottom-right-radius:0;-moz-border-radius-bottomright:0;border-bottom-right-radius:0;-webkit-border-bottom-left-radius:0;-moz-border-radius-bottomleft:0;border-bottom-left-radius:0;border-bottom-color:#cccccc;}\n.search-assistant-wrapper{position:relative;z-index:406;width:100%;height:0;}.search-assistant-wrapper .search-assistant-autoopen-toggle{height:20px;position:absolute;right:17px;top:0;padding:5px 3px 5px 10px;background-color:rgba(245, 245, 245, 0.8);}.search-assistant-wrapper .search-assistant-autoopen-toggle>.icon-check{text-decoration:none;display:inline-block;margin-right:3px;}\n.search-assistant-wrapper .search-assistant-container{display:none;position:relative;border:1px solid #cccccc;border-bottom:none;border-top:none;overflow:auto;background:#eeeeee url(\'/static/img/skins/default/bg_search_assistant.png\') left top repeat-y;background:-moz-linear-gradient(left, #ffffff 369px, transparent 370px),#f5f5f5;background:-ms-linear-gradient(left, #ffffff 369px, transparent 370px),#f5f5f5;background:-webkit-gradient(linear, 369px 0, 370px 0, from(#ffffff), to(transparent)),#f5f5f5;background:-webkit-linear-gradient(left, #ffffff 369px, transparent 370px),#f5f5f5;background:linear-gradient(left, #ffffff 369px, transparent 370px),#f5f5f5;background-position:0 0;}.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper,.search-assistant-wrapper .search-assistant-container .saHelpWrapper{float:left;max-width:50%;}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper{margin-right:-370px;width:370px;}.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper h4{font-size:inherit;color:#333333;font-weight:normal;padding:5px 10px 0 5px;}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a+h4{margin-top:10px;}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a{padding:0 10px 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a:hover{text-decoration:none;}\n.search-assistant-wrapper .search-assistant-container .saHelpWrapper{margin-left:370px;max-width:605px;}\n.search-assistant-wrapper .search-assistant-container .saNotice>strong{font-weight:normal;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent{padding:9px;}.search-assistant-wrapper .search-assistant-container .saHelpContent:before{content:\'\';display:block;float:right;height:20px;width:85px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .splFont-mono{background:transparent;border:none;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4{margin-top:1px;font-size:inherit;color:#333333;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4:first-child{margin-top:0;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .intro>h4{color:#65a637;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .intro+h4{margin-top:10px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav{margin-top:10px;}.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav h4{color:#333333;display:inline;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav .splPipe{display:inline-block;width:30px;overflow:hidden;text-indent:50px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4.saExamplesHeader{margin-top:10px;color:#333333;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saExamples{margin-top:0px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dt{margin-top:10px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dt,.search-assistant-wrapper .search-assistant-container .saHelpContent dt h4{font-weight:normal;color:#333333;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dd{margin-left:20px;}\n.search-assistant-wrapper .search-assistant-container .saHelpContent a{cursor:pointer;}\n.search-assistant-wrapper .search-assistant-container code{color:#65a637;}\n.search-assistant-wrapper .search-assistant-container .introstep{font-weight:bold;margin-top:1em;display:block;}\n.search-assistant-wrapper .search-assistant-container .sakeyword{display:block;}.search-assistant-wrapper .search-assistant-container .sakeyword:focus,.search-assistant-wrapper .search-assistant-container .sakeyword:hover{background-color:#eeeeee;cursor:pointer;}\n.search-assistant-wrapper .search-assistant-container .saClearBottom{*zoom:1;}.search-assistant-wrapper .search-assistant-container .saClearBottom:before,.search-assistant-wrapper .search-assistant-container .saClearBottom:after{display:table;content:\"\";line-height:0;}\n.search-assistant-wrapper .search-assistant-container .saClearBottom:after{clear:both;}\n.search-assistant-wrapper .search-assistant-resize{height:3px;margin:0 3px;background-color:#dcdcdc;border:0 solid #b7b7b7;border-top-color:#b7b7b7;border-bottom-color:#989898;border-bottom-width:1px;}\n.search-assistant-wrapper .search-assistant-open .search-assistant-resize{margin:0;}\n.search-assistant-wrapper .search-assistant-resize-active{margin:0;cursor:ns-resize;}\n.search-assistant-wrapper .search-assistant-resize-active:before{content:\"\";display:block;height:1px;width:10px;margin:0 auto;border-width:1px 0;border-style:solid;opacity:0.8;filter:alpha(opacity=80);}\n.search-assistant-wrapper .search-assistant-activator{background-color:#dcdcdc;cursor:pointer;-webkit-border-radius:4px;-moz-border-radius:4px;border-radius:4px;-webkit-border-top-left-radius:0;-moz-border-radius-topleft:0;border-top-left-radius:0;-webkit-border-top-right-radius:0;-moz-border-radius-topright:0;border-top-right-radius:0;border:none;width:20px;height:10px;line-height:10px;display:block;color:#333333;text-align:center;margin-top:-1px;text-decoration:none;border:1px solid #aeaeae;border-bottom-color:1px solid #989898;border-top:none;}\n.search-assistant-wrapper.search-assistant-enabled{-webkit-box-shadow:0 3px 7px rgba(0, 0, 0, 0.3);-moz-box-shadow:0 3px 7px rgba(0, 0, 0, 0.3);box-shadow:0 3px 7px rgba(0, 0, 0, 0.3);}\n.multiline .search-assistant-resize,.search-assistant-open .search-assistant-resize{border-width:1px;}\n.search-bar-primary .btn{background-color:#5c9732;background-image:-moz-linear-gradient(top, #65a637, #4e802a);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));background-image:-webkit-linear-gradient(top, #65a637, #4e802a);background-image:-o-linear-gradient(top, #65a637, #4e802a);background-image:linear-gradient(to bottom, #65a637, #4e802a);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);border-color:#426d24;border-top-color:#4e802a;border-bottom-color:#32521b;color:#ffffff;text-shadow:0 -1px 0 rgba(51, 51, 51, 0.7);}.search-bar-primary .btn:hover{background-color:#7db44d;background-image:-moz-linear-gradient(top, #95ca5f, #599331);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#95ca5f), to(#599331));background-image:-webkit-linear-gradient(top, #95ca5f, #599331);background-image:-o-linear-gradient(top, #95ca5f, #599331);background-image:linear-gradient(to bottom, #95ca5f, #599331);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff95ca5f\', endColorstr=\'#ff599331\', GradientType=0);background-color:#8cca5f;border-color:#55802a;border-bottom-color:#36591e;border-top-color:#629331;background-position:0 0;}\n.search-bar-primary .search-field-wrapper-inner{background-color:#5c9732;background-image:-moz-linear-gradient(top, #65a637, #4e802a);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));background-image:-webkit-linear-gradient(top, #65a637, #4e802a);background-image:-o-linear-gradient(top, #65a637, #4e802a);background-image:linear-gradient(to bottom, #65a637, #4e802a);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);border-color:#426d24;border-top-color:#4e802a;border-bottom-color:#32521b;}\n.search-bar-primary .search-field-background{background-color:#5c9732;background-image:-moz-linear-gradient(top, #65a637, #4e802a);background-image:-webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));background-image:-webkit-linear-gradient(top, #65a637, #4e802a);background-image:-o-linear-gradient(top, #65a637, #4e802a);background-image:linear-gradient(to bottom, #65a637, #4e802a);background-repeat:repeat-x;filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);border-color:#426d24;border-top-color:#4e802a;border-bottom-color:#32521b;}\n.search-bar-primary .search-assistant-resize{border-bottom:1px solid #32521b;}\n.search-bar-primary .search-assistant-activator{background-color:#4e802a;color:#ffffff;border-color:#32521b;}\n.search-bar-primary .search-assistant-resize{background-color:#4e802a;color:#ffffff;border-color:#32521b;}\n.search-bar-primary .multiline .search-assistant-resize{border-right-color:#426d24;border-left-color:#426d24;}\n.search-bar-primary .search-assistant-resize-active{border-left:1px solid #32521b;}\n.search-bar-primary textarea.search-field{border:1px solid #426d24;border-top-color:#4e802a;border-bottom-color:#32521b;}\n.search-bar-primary .search-apps .link-label,.search-bar-primary .search-apps .label-prefix{display:inline-block;*display:inline;*zoom:1;vertical-align:middle;line-height:1.2em;max-width:10em;overflow:hidden;text-overflow:ellipsis;}\n.search-bar-primary .search-apps .caret{line-height:1em;vertical-align:middle;}\n.dropdown-menu-apps li{line-height:20px;position:relative;}\n.dropdown-menu-apps .link-label{display:block;white-space:nowrap;word-wrap:normal;overflow:hidden;text-overflow:ellipsis;padding-right:28px;}\n.dropdown-menu-apps .menu-icon{width:18px;height:18px;position:absolute;right:10px;top:7px;}\n.lt-ie9 .shared-search-input{min-height:28px;}\n.lt-ie9 .search-field-wrapper{min-height:28px;}\n.lt-ie9 .placeholder-text{padding:2px 0 !important;min-height:15px !important;}\n.lt-ie9 .search-field{padding:2px 5px 0 5px;min-height:26px !important;}\n.lt-ie9 .search-assistant-wrapper{*top:1px;}\n.ie7 .search-bar-wrapper{*position:relative;*z-index:1;}\n.ie7 .search-bar *{*min-width:1px;}\n.ie7 .icon-search-thin{*line-height:1.2em;}\n@media print{.shared-searchbar-input{padding:0 !important;} .search-bar.search-bar-primary{width:100%;display:block;}.search-bar.search-bar-primary td,.search-bar.search-bar-primary tbody,.search-bar.search-bar-primary tr{display:block;width:100%;} .search-field{display:none !important;} .shadowTextarea{width:100% !important;left:auto !important;top:auto !important;position:static !important;border-color:transparent !important;} .search-field-background,.search-assistant-wrapper,.search-button{display:none !important;}}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 