
define('util/beacon',['jquery', 'uri/route', 'splunk.util'], function($, route, splunkutil) {
    var exports = {
        ping: function(root, locale, params) {
            params || (params = {});
            var path = route.img(root, locale, '@' + Math.random(), 'beacon.gif'),
                img = new Image(),
                defaults = {
                    client_time: (new Date).getTime()
                };
            img.src = path + '?' + splunkutil.propToQueryString($.extend(true, {}, defaults, params || {}));
        }
    };
    return exports;
});
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
                    menuWidth: 'narrow',
                    toggleClassName: 'btn',
                    items: [],
                    model: this.model,
                    modelAttribute: 'display.prefs.searchContext',
                    popdownOptions: {attachDialogTo:'body'}
                }, this.options);

                this.collection.on('change', this.update, this);
                SyntheticSelectControl.prototype.initialize.call(this, this.options);
            },
            update: function() {
                this.options.items = [];
                this.collection.each(function(model) {
                    var navData = model.get('navData');
                    if (navData && navData.searchView) {
                        var appmodel = this.options.applicationModel;

                        var appIcon = route.appIcon(
                            appmodel.get('root'),
                            appmodel.get('locale'),
                            appmodel.get('owner'),
                            model.get('appName')
                        );

                        this.options.items.push({
                            value: model.get('appName'),
                            label: model.get('appLabel'),
                            icon: appIcon
                        });
                    }
                }.bind(this));
                this.$el.empty();
                this.render();
            },
            template: '\
                <a class="dropdown-toggle <%- options.toggleClassName %>" href="#">\
                    <span class="label-prefix"><%= _("App: ").t() %></span> <span class="js-app-label link-label"><%- options.label %> <%- item.label %></span><span class="caret"></span>\
                </a>\
                <div class="dropdown-menu dropdown-menu-selectable dropdown-menu-tall <%- options.menuClassName %> <%- menuWidthClass %> ">\
                <div class="arrow"></div>\
                    <ul class="menu-list">\
                    <% _.each(items, function(element, index, list) { %>\
                        <li><a href="#" data-value="<%- element.value %>">\
                            <i class="icon-check"></i>\
                            <% if (element.icon) { %> <img src="<%-element.icon%>" alt="icon" class="menu-icon"><% } %>\
                            <span class="menu-label"><%- element.label %></span>\
                        </a></li>\
                    <% }); %>\
                    </ul>\
                </div>\
            '
        });
    }
);

define('util/dom_utils',
    [],
    function() {
        
        //see: http://stackoverflow.com/questions/512528/set-cursor-position-in-html-textbox
        //submission by mcpDESIGNS
        var setCaretPosition = function(el, caretPos) {            
            el.value = el.value;
            // ^ this is used to not only get "focus", but
            // to make sure we don't have it everything -selected-
            // (it causes an issue in chrome, and having it doesn't hurt any other browser)

            if (el !== null) {
                if (el.createTextRange) {
                    var range = el.createTextRange();
                    range.move('character', caretPos);
                    range.select();
                    return true;
                } else {
                    // (el.selectionStart === 0 added for Firefox bug)
                    if (el.setSelectionRange && (el.selectionStart || el.selectionStart === 0)) {
                        el.focus();
                        el.setSelectionRange(caretPos, caretPos);
                        return true;
                    } else { // fail city, fortunately this never happens (as far as I've tested) :)
                        el.focus();
                        return false;
                    }
                }
            }
        };
        
        //see: http://stackoverflow.com/questions/2897155/get-cursor-position-within-an-text-input-field
        //sbumission by Max
        var getCaretPosition = function(el) {
            var caretPos, selection;

            if (el.selectionStart || el.selectionStart === 0) {
                caretPos = el.selectionStart;
            } else if (document.selection) {
                // IE Support
                el.focus();
                selection = document.selection.createRange();
                selection.moveStart('character', -el.value.length);
                caretPos = selection.text.length;
            }
            
            return caretPos;
        };
        
        return {
            setCaretPosition: setCaretPosition,
            getCaretPosition: getCaretPosition
        };        
    }
);
define('views/shared/searchbar/Input',
    [
        'jquery',
        'underscore',
        'module',
        'views/Base',
        'views/shared/delegates/TextareaResize',
        'splunk.util',
        'util/dom_utils',
        'jquery.bgiframe',
        'splunk.jquery.csrf'
    ],
    function($, _, module, BaseView, TextareaResize, splunk_util, dom_utils /* remaining dependencies do not export */) {
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
               }
               
               this.options = $.extend(true, {}, this.options, (options || {}));

               var defaults = {
                   useTypeahead: true,
                   useAssistant: true,
                   useAutoFocus: true,
                   autoOpenAssistant: splunk_util.normalizeBoolean(this.model.get('display.prefs.autoOpenSearchAssistant')),
                   showCommandHelp: true,
                   showCommandHistory: true,
                   showFieldInfo: true,
                   maxSearchBarLines: 80,
                   minWithForTwoColumns: 560,
                   singleton: false,
                   disableOnSubmit: false
               };
               _.defaults(this.options, defaults);

               this.assistant = {
                   enabled: false,
                   rolloverEnabled: true, //required to override mouseenter function during keyboard scrolling.
                   fillPending: false,
                   needsUpdate: false,
                   cursor: 0,
                   timer: 0,
                   rolloverTimer: 0
               };
               this.multiline = false;

               // None Contained Event Binding
               this.model.on('change:search', function(){
                   this.setSearchString(this.model.get('search') || "");
                   if (this.hasOwnProperty("resize")) {
                       this.children.resize.resizeTextarea();
                       this.updateMultiline();
                   }
               }, this);
               
               this.model.on('applied', function(options){
                   this._onFormSubmit(options);
               }, this);
               
               if (this.options.singleton) {
                   this.model.on('enableSearchInput', function() {
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
               'mousedown .search-assistant-resize' :       'resizeAssistant'
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

               if (splunk_util.normalizeBoolean(this.model.get('display.prefs.autoOpenSearchAssistant')) !== isEnabled) {
                   this.model.set({'display.prefs.autoOpenSearchAssistant': isEnabled});
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
                   clearTimeout(this.assistant.timer);
                   this.assistant.timer = setTimeout(this.fillAssistant.bind(this), this.options.assistantDelay);
               }
               this.onSearchFieldChange();

               var searchInput = this.getSearchFieldValue();
               this.model.set({search: searchInput}, {silent: true});

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
               // Exit early if closeAssistant has been called before render has created all of the views
               if (!this.$assistantContainer)
                    return false;

               this.$assistantContainer.hide();
               this.$assistantAutoOpenToggle.hide();
               this.assistant.enabled = false;
               this.assistant.fillPending = false;
               this.$assistantActivator.addClass("icon-triangle-down-small").removeClass("icon-triangle-up-small");
               this.$assistantResize.removeClass("search-assistant-resize-active");
               this.$el.removeClass('search-assistant-open');
               return true;
           },
           openAssistant: function() {
               if (!this.options.useAssistant) {
                   return false;
               }
               if (this.assistant.fillPending) return false;
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
               if (this.assistant.fillPending) {
                   this.assistant.needsUpdate = true;
                   return false;
               }

               var searchString = this._getUserEnteredSearch();
               //TODO: revisit multi app namespace support
               var namespace    = 'search';//Splunk.util.getCurrentApp();

               this.$assistantContainer.load(
            	   splunk_util.make_url('/api/shelper'), {
                       'snippet': 'true',
                       'namespace': namespace,
                       'search': searchString,
                       'useTypeahead': this.options.useTypeahead,
                       'useAssistant': this.options.useAssistant,
                       'showCommandHelp': this.options.showCommandHelp,
                       'showCommandHistory': this.options.showCommandHistory,
                       'showFieldInfo': this.options.showFieldInfo
                   },
                   this.fillAssistantCompleteCallback.bind(this)
               );
               this.assistant.fillPending = true;

               return true;
           },
           fillAssistantCompleteCallback: function() {
               this.assistant.fillPending = false;
               if (!this.assistant.enabled) {
                   this.assistant.needsUpdate = false;
                   return false;
               }
               if (this.assistant.needsUpdate) {
                   this.assistant.needsUpdate = false;
                   this.fillAssistant();
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
                   clearTimeout(this.assistant.timer);
                   this.assistant.timer = setTimeout(this.fillAssistant.bind(this), this.options.assistantDelay);
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
                   var currentSearch = this.model.get('search'),
                       searchInput = this.getSearchFieldValue();

                   if (currentSearch !== searchInput){
                       this.model.set({ search: searchInput }, options);
                   } else {
                       if (!options.silent) {
                           this.model.unset("search", {silent: true});
                           this.model.set({search: searchInput});
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
                       inputValue = this.model.get('search') || "";

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
                   this.$('.search-field').val(this.model.get('search') || '');
               }
               
               if (this.options.disableOnSubmit) {
                   this.$('.search-field').attr('disabled', false);
               }
               
               return this;
           },
           reflow: function() {
               var el = this.$('.search-field').get(0),
                   inputValue = this.model.get('search') || "",
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
                   return BaseView.prototype.remove.apply(this, arguments);
               }
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
        'util/beacon',
        'views/Base',
        'views/shared/searchbar/Apps',
        'views/shared/searchbar/Input',
        'views/shared/timerangepicker/Master',
        'views/shared/searchbar/Submit'
    ],
    function($, _, Backbone, module, beacon, BaseView, Apps, Input, TimeRangePicker, Submit) {
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
                beacon.ping(this.model.application.get('root'), this.model.application.get('locale'), {event: 'ui.searchbar.ready'});
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
define('splunkjs/mvc/searchbarview',['require','exports','module','underscore','./mvc','backbone','./basesplunkview','./timepickerview','views/shared/searchbar/Master','models/TimeRange','./utils','splunk.config','./sharedmodels','css!../css/search-bar'],function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('./mvc');
    var Backbone = require("backbone");
    var BaseSplunkView = require("./basesplunkview");
    var TimePickerView = require("./timepickerview");
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
                timepicker: true,
                value: undefined
            },
            
            initialize: function() {
                var that = this;
                
                this.configure();
                this.settings.enablePush("value");
                
                // Initialize value with default, if provided
                var defaultValue = this.settings.get("default");
                if (defaultValue !== undefined &&
                    this.settings.get("value") === undefined)
                {
                    this.settings.set("value", defaultValue);
                }
                
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
                
                var createTimepicker = function(settings, searchbar) {
                    var options = _.extend(
                        { managerid: settings.get("managerid") },
                        settings.extractWithPrefix('timepicker_'));
                    
                    if (searchbar) {
                        options["timepicker"] = searchbar.children.timeRangePicker;
                        options["el"] = searchbar.children.timeRangePicker.el;
                    }
                    
                    return new TimePickerView(options);
                };
                
                // We cannot create the searchbar/timepicker until these internal models
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
                    
                    // We can either have the timepicker created or not by this 
                    // point (depending on whether the deferred was done before
                    // $.when was called). We create it if it is not already created,
                    // otherwise we set the appropriate properties on it.
                    if (that.timepicker) {
                        // Set the appropriate things on the timepicker now that it is
                        // created. Note that we are depending on the fact that this
                        // will execute before the deferred handler in the timepicker.
                        that.timepicker.setElement(that.searchbar.children.timeRangePicker.el);
                        that.timepicker.settings.set("timepicker", that.searchbar.children.timeRangePicker);
                    }
                    else {
                        that.timepicker = createTimepicker(that.settings, that.searchbar);
                    }
                });

    
                if (!this.timepicker) {
                    // We create the timepicker wrapper ahead of time so that we can
                    // reference it (e.g. mySearchbar.timepicker) before the deferreds
                    // are resolved.
                    this.timepicker = createTimepicker(this.settings);
                }
                
                // Update view if model changes
                this.settings.on("change:value", function(model, value, options) {
                    options = options || {};
                    var suppressValSet = options._self;
                    if (!suppressValSet) {
                        that.val(value || "");
                    }
                });
                
                this.bindToComponent(this.settings.get("managerid"), this._onManagerChange, this);
                
                this._state.on("change:search", this._onSearchChange, this);
                this.settings.on("change:timepicker", this._onDisplayTimePickerChange, this);
            },
            
            _onDisplayTimePickerChange: function() {
                // We cannot work with the searchbar/timepicker until they
                // are done being created.
                var that = this;
                $.when(this._dfd).done(function() {
                    if (that.settings.get("timepicker")) {
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
                // We cannot work with the searchbar/timepicker until they
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
                    
                    // Ensure we properly show/hide the timepicker
                    that._onDisplayTimePickerChange();
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

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*!\n * Splunk shoestrap\n * import and override bootstrap vars & mixins\n */\n.clearfix {\n  *zoom: 1;\n}\n.clearfix:before,\n.clearfix:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.clearfix:after {\n  clear: both;\n}\n.hide-text {\n  font: 0/0 a;\n  color: transparent;\n  text-shadow: none;\n  background-color: transparent;\n  border: 0;\n}\n.input-block-level {\n  display: block;\n  width: 100%;\n  min-height: 26px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ie7-force-layout {\n  *min-width: 0;\n}\n/* search bar\n\n    TODO: cleanup this markup\n\n    <div class=\"search-bar-wrapper views-shared-searchbar\">\n        <form class=\"search-form\" action=\"\" method=\"get\">\n            <table class=\"search-bar\">\n                <tbody>\n                    <tr>\n                        <td width=\"100%\" class=\"search-input\">\n                            <div id=\"search\" class=\"shared-searchbar-input\">\n                                <div class=\"search-field-background\"></div>\n                                <div class=\"search-field-wrapper\">\n                                    <label class=\"placeholder-text\" for=\"221845.81376217483\" style=\"display: block;\">enter search here...</label>\n                                    <textarea autocapitalize=\"off\" autocorrect=\"off\" id=\"221845.81376217483\" class=\"search-field\" spellcheck=\"false\" name=\"q\" value=\"\"></textarea>\n                                    <div class=\"shadowTextarea\" ></div>\n                                </div>\n                                <div class=\"search-assistant-wrapper\">\n                                    <div class=\"search-assistant-container-wrapper\">\n                                        <div class=\"search-assistant-container\"></div>\n                                    </div><a style=\"display:none;\" href=\"\" class=\"search-assistant-autoopen-toggle\">Auto Open</a>\n                                    <div class=\"search-assistant-resize\"></div><a class=\"search-assistant-activator icon-triangle-down-small\" href=\"#\"></a>\n                                </div>\n                            </div>\n                        </td>\n                        <td class=\"search-apps\">\n                            <!-- optional apps dropdwon here\n                            <div class=\"control btn-group shared-searchbar-apps\" data-name=\"app\" data-view=\"views/shared/searchbar/Apps\" data-render-time=\"0.005\">\n                                <a href=\"#\" class=\"dropdown-toggle btn\">App: <span class=\"link-label\">Search &amp; Reporting</span></a>\n                            </div> -->\n                        </td>\n                        <td class=\"search-timerange\">\n                            <div class=\"view-new-time-range-picker btn-group pull-left views-shared-timerangepicker\">\n                                <a href=\"#\" class=\"splBorder splBorder-nsew splBackground-primary btn\">\n                                    <span class=\"time-label\">All-time</span></a>\n                            </div>\n                        </td>\n                        <td class=\"search-button\">\n                            <div class=\"shared-searchbar-submit\" data-view=\"views/shared/searchbar/Submit\" data-render-time=\"0\">\n                                <button type=\"submit\" class=\"btn\"><i class=\"icon-search-thin\"></i></button>\n                            </div>\n                        </td>\n                    </tr>\n                </tbody>\n            </table>\n        </form>\n    </div><!-- /.search-bar-wrapper -->\n\n*/\nform.search-form {\n  margin-bottom: 0;\n}\n.search-bar .btn,\n.search-bar .btn.dropdown-toggle {\n  -webkit-border-radius: 0;\n  -moz-border-radius: 0;\n  border-radius: 0;\n  margin-right: -1px;\n  line-height: 28px;\n  white-space: nowrap;\n}\n.search-bar td {\n  padding: 0;\n  vertical-align: top;\n}\n.search-bar td.search-input {\n  width: 100%;\n}\n.search-bar .search-field-background {\n  height: 36px;\n  background-color: #e9e9e9;\n  background-color: #ebebeb;\n  background-image: -moz-linear-gradient(top, #f5f5f5, #dcdcdc);\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#f5f5f5), to(#dcdcdc));\n  background-image: -webkit-linear-gradient(top, #f5f5f5, #dcdcdc);\n  background-image: -o-linear-gradient(top, #f5f5f5, #dcdcdc);\n  background-image: linear-gradient(to bottom, #f5f5f5, #dcdcdc);\n  background-repeat: repeat-x;\n  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#fff5f5f5\', endColorstr=\'#ffdcdcdc\', GradientType=0);\n  border: 1px solid #aeaeae;\n  border-top-color: #b7b7b7;\n  border-bottom-color: #989898;\n  text-shadow: 0 1px 0 #ffffff;\n  -webkit-box-shadow: 0px 1px 1px rgba(0, 0, 0, 0.08);\n  -moz-box-shadow: 0px 1px 1px rgba(0, 0, 0, 0.08);\n  box-shadow: 0px 1px 1px rgba(0, 0, 0, 0.08);\n  text-shadow: none;\n  color: #333333;\n  border-right: none;\n  -webkit-border-top-left-radius: 4px;\n  -moz-border-radius-topleft: 4px;\n  border-top-left-radius: 4px;\n  -webkit-border-bottom-left-radius: 4px;\n  -moz-border-radius-bottomleft: 4px;\n  border-bottom-left-radius: 4px;\n  margin: -4px -4px -34px -4px;\n}\n.search-bar .search-timerange .btn {\n  white-space: nowrap;\n  -webkit-border-radius: 0;\n  -moz-border-radius: 0;\n  border-radius: 0;\n  min-width: 55px;\n  *display: inline;\n  *zoom: 1;\n  *height: 28px;\n  *position: relative;\n  *margin-top: -1px;\n}\n.search-bar .search-button .btn {\n  -webkit-border-top-right-radius: 4px;\n  -moz-border-radius-topright: 4px;\n  border-top-right-radius: 4px;\n  -webkit-border-bottom-right-radius: 4px;\n  -moz-border-radius-bottomright: 4px;\n  border-bottom-right-radius: 4px;\n  margin-left: -2px;\n  font-size: 26px;\n  *height: 28px;\n}\n.search-bar .time-label {\n  display: inline-block;\n  *display: inline;\n  vertical-align: middle;\n  line-height: 1.2em;\n  *line-height: 28px;\n  max-width: 10em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n/* search input main form\n\n*/\n.shared-searchbar-input {\n  position: relative;\n  padding: 4px;\n}\n.shared-searchbar-input label.placeholder-text {\n  display: none;\n  padding: 4px 0 0 5px;\n  line-height: 16px;\n  display: block;\n  position: absolute;\n  margin: 0;\n  top: 6px;\n  left: 6px;\n  color: #999999;\n  z-index: 403;\n  cursor: text;\n  min-height: 30px;\n}\n.shared-searchbar-input textarea[disabled=\"disabled\"] {\n  background-color: #eeeeee;\n}\n.shared-searchbar-input textarea.search-field {\n  min-height: 30px;\n  width: 100%;\n  display: block;\n  line-height: 20px;\n  margin: 0;\n  overflow: hidden;\n  resize: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n  border: 1px solid #aeaeae;\n  border-top-color: #b7b7b7;\n  border-bottom-color: #989898;\n  box-shadow: inset 1px 1px 5px rgba(0, 0, 0, 0.35);\n  position: relative;\n  z-index: 402;\n  font-family: \'Droid Sans Mono\', Consolas, Monaco, \'Courier New\', Courier, monospace;\n  *padding: 0;\n  *height: 20px;\n  *vertical-align: middle;\n}\n.shared-searchbar-input.multiline .search-assistant-resize {\n  margin: 0;\n}\n.shared-searchbar-input.multiline textarea.search-field,\n.shared-searchbar-input.search-assistant-open textarea.search-field {\n  -webkit-border-bottom-right-radius: 0;\n  -moz-border-radius-bottomright: 0;\n  border-bottom-right-radius: 0;\n  -webkit-border-bottom-left-radius: 0;\n  -moz-border-radius-bottomleft: 0;\n  border-bottom-left-radius: 0;\n  border-bottom-color: #cccccc;\n}\n/* dropdown search helper for autocomplete and search language suggestions\n\n    FIXME: markup missing\n\n*/\n.search-assistant-wrapper {\n  position: relative;\n  z-index: 406;\n  width: 100%;\n  height: 0;\n}\n.search-assistant-wrapper .search-assistant-autoopen-toggle {\n  height: 20px;\n  position: absolute;\n  right: 17px;\n  top: 0;\n  padding: 5px 3px 5px 10px;\n  background-color: rgba(245, 245, 245, 0.8);\n}\n.search-assistant-wrapper .search-assistant-autoopen-toggle > .icon-check {\n  text-decoration: none;\n  display: inline-block;\n  margin-right: 3px;\n}\n.search-assistant-wrapper .search-assistant-container {\n  display: none;\n  position: relative;\n  border: 1px solid #cccccc;\n  border-bottom: none;\n  border-top: none;\n  overflow: auto;\n  background: #eeeeee url(\'/static/img/skins/default/bg_search_assistant.png\') left top repeat-y;\n  background: -moz-linear-gradient(left, #ffffff 369px, transparent 370px), #f5f5f5;\n  background: -ms-linear-gradient(left, #ffffff 369px, transparent 370px), #f5f5f5;\n  background: -webkit-gradient(linear, 369px 0, 370px 0, from(#ffffff), to(transparent)), #f5f5f5;\n  background: -webkit-linear-gradient(left, #ffffff 369px, transparent 370px), #f5f5f5;\n  background: linear-gradient(left, #ffffff 369px, transparent 370px), #f5f5f5;\n  background-position: 0 0;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper,\n.search-assistant-wrapper .search-assistant-container .saHelpWrapper {\n  float: left;\n  max-width: 50%;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper {\n  margin-right: -370px;\n  width: 370px;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper h4 {\n  font-size: inherit;\n  color: #333333;\n  font-weight: normal;\n  padding: 5px 10px 0 5px;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a + h4 {\n  margin-top: 10px;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a {\n  color: #1a799;\n  padding: 0 10px 0 5px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.search-assistant-wrapper .search-assistant-container .saTypeaheadWrapper a:hover {\n  text-decoration: none;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpWrapper {\n  margin-left: 370px;\n  max-width: 605px;\n}\n.search-assistant-wrapper .search-assistant-container .saNotice > strong {\n  font-weight: normal;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent {\n  padding: 9px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent:before {\n  content: \'\';\n  display: block;\n  float: right;\n  height: 20px;\n  width: 85px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .splFont-mono {\n  background: transparent;\n  border: none;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4 {\n  margin-top: 1px;\n  font-size: inherit;\n  color: #333333;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4:first-child {\n  margin-top: 0;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .intro > h4 {\n  color: #65a637;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .intro + h4 {\n  margin-top: 10px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav {\n  margin-top: 10px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav h4 {\n  color: #333333;\n  display: inline;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saHeadingNav .splPipe {\n  display: inline-block;\n  width: 30px;\n  overflow: hidden;\n  text-indent: 50px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent h4.saExamplesHeader {\n  margin-top: 10px;\n  color: #333333;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent .saExamples {\n  margin-top: 0px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dt {\n  margin-top: 10px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dt,\n.search-assistant-wrapper .search-assistant-container .saHelpContent dt h4 {\n  font-weight: normal;\n  color: #333333;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent dd {\n  margin-left: 20px;\n}\n.search-assistant-wrapper .search-assistant-container .saHelpContent a {\n  cursor: pointer;\n}\n.search-assistant-wrapper .search-assistant-container code {\n  color: #73A550;\n}\n.search-assistant-wrapper .search-assistant-container .introstep {\n  font-weight: bold;\n  margin-top: 1em;\n  display: block;\n}\n.search-assistant-wrapper .search-assistant-container .sakeyword {\n  display: block;\n}\n.search-assistant-wrapper .search-assistant-container .sakeyword:focus,\n.search-assistant-wrapper .search-assistant-container .sakeyword:hover {\n  background-color: #eeeeee;\n  cursor: pointer;\n}\n.search-assistant-wrapper .search-assistant-container .saClearBottom {\n  *zoom: 1;\n}\n.search-assistant-wrapper .search-assistant-container .saClearBottom:before,\n.search-assistant-wrapper .search-assistant-container .saClearBottom:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.search-assistant-wrapper .search-assistant-container .saClearBottom:after {\n  clear: both;\n}\n.search-assistant-wrapper .search-assistant-resize {\n  height: 3px;\n  margin: 0 3px;\n  background-color: #dcdcdc;\n  border: 0 solid #b7b7b7;\n  border-top-color: #b7b7b7;\n  border-bottom-color: #989898;\n  border-bottom-width: 1px;\n}\n.search-assistant-wrapper .search-assistant-open .search-assistant-resize {\n  margin: 0;\n}\n.search-assistant-wrapper .search-assistant-resize-active {\n  margin: 0;\n  cursor: ns-resize;\n}\n.search-assistant-wrapper .search-assistant-resize-active:before {\n  content: \"\";\n  display: block;\n  height: 1px;\n  width: 10px;\n  margin: 0 auto;\n  border-width: 1px 0;\n  border-style: solid;\n  opacity: 0.8;\n  filter: alpha(opacity=80);\n}\n.search-assistant-wrapper .search-assistant-activator {\n  background-color: #dcdcdc;\n  cursor: pointer;\n  -webkit-border-radius: 4px;\n  -moz-border-radius: 4px;\n  border-radius: 4px;\n  -webkit-border-top-left-radius: 0;\n  -moz-border-radius-topleft: 0;\n  border-top-left-radius: 0;\n  -webkit-border-top-right-radius: 0;\n  -moz-border-radius-topright: 0;\n  border-top-right-radius: 0;\n  border: none;\n  width: 20px;\n  height: 10px;\n  line-height: 10px;\n  display: block;\n  color: #333333;\n  text-align: center;\n  margin-top: -1px;\n  text-decoration: none;\n  border: 1px solid #aeaeae;\n  border-bottom-color: 1px solid #989898;\n  border-top: none;\n}\n.search-assistant-wrapper.search-assistant-enabled {\n  -webkit-box-shadow: 0 3px 7px rgba(0, 0, 0, 0.3);\n  -moz-box-shadow: 0 3px 7px rgba(0, 0, 0, 0.3);\n  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.3);\n}\n.multiline .search-assistant-resize,\n.search-assistant-open .search-assistant-resize {\n  border-width: 1px;\n}\n.search-bar-primary .btn {\n  background-color: #5c9732;\n  background-image: -moz-linear-gradient(top, #65a637, #4e802a);\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));\n  background-image: -webkit-linear-gradient(top, #65a637, #4e802a);\n  background-image: -o-linear-gradient(top, #65a637, #4e802a);\n  background-image: linear-gradient(to bottom, #65a637, #4e802a);\n  background-repeat: repeat-x;\n  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);\n  border-color: #426d24;\n  border-top-color: #4e802a;\n  border-bottom-color: #32521b;\n  color: #ffffff;\n  text-shadow: 0 -1px 0 rgba(51, 51, 51, 0.7);\n}\n.search-bar-primary .btn:hover {\n  background-color: #8cca5f;\n  background-color: #7db44d;\n  background-image: -moz-linear-gradient(top, #95ca5f, #599331);\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#95ca5f), to(#599331));\n  background-image: -webkit-linear-gradient(top, #95ca5f, #599331);\n  background-image: -o-linear-gradient(top, #95ca5f, #599331);\n  background-image: linear-gradient(to bottom, #95ca5f, #599331);\n  background-repeat: repeat-x;\n  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff95ca5f\', endColorstr=\'#ff599331\', GradientType=0);\n  border-color: #55802a;\n  border-bottom-color: #36591e;\n  border-top-color: #629331;\n  background-position: 0 0;\n}\n.search-bar-primary .search-field-wrapper-inner {\n  background-color: #5c9732;\n  background-image: -moz-linear-gradient(top, #65a637, #4e802a);\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));\n  background-image: -webkit-linear-gradient(top, #65a637, #4e802a);\n  background-image: -o-linear-gradient(top, #65a637, #4e802a);\n  background-image: linear-gradient(to bottom, #65a637, #4e802a);\n  background-repeat: repeat-x;\n  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);\n  border-color: #426d24;\n  border-top-color: #4e802a;\n  border-bottom-color: #32521b;\n}\n.search-bar-primary .search-field-background {\n  background-color: #5c9732;\n  background-image: -moz-linear-gradient(top, #65a637, #4e802a);\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(#65a637), to(#4e802a));\n  background-image: -webkit-linear-gradient(top, #65a637, #4e802a);\n  background-image: -o-linear-gradient(top, #65a637, #4e802a);\n  background-image: linear-gradient(to bottom, #65a637, #4e802a);\n  background-repeat: repeat-x;\n  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr=\'#ff65a637\', endColorstr=\'#ff4e802a\', GradientType=0);\n  border-color: #426d24;\n  border-top-color: #4e802a;\n  border-bottom-color: #32521b;\n}\n.search-bar-primary .search-assistant-resize {\n  background-color: #primaryBackgroundColor;\n  border-top: 1px solid #primaryBorderTopColor;\n  border-bottom: 1px solid #32521b;\n}\n.search-bar-primary .search-assistant-activator {\n  background-color: #4e802a;\n  color: #ffffff;\n  border-color: #32521b;\n}\n.search-bar-primary .search-assistant-resize {\n  background-color: #4e802a;\n  color: #ffffff;\n  border-color: #32521b;\n}\n.search-bar-primary .multiline .search-assistant-resize {\n  border-right-color: #426d24;\n  border-left-color: #426d24;\n}\n.search-bar-primary .search-assistant-resize-active {\n  border-left: 1px solid #32521b;\n}\n.search-bar-primary textarea.search-field {\n  border: 1px solid #426d24;\n  border-top-color: #4e802a;\n  border-bottom-color: #32521b;\n}\n.search-bar-primary .search-apps .link-label,\n.search-bar-primary .search-apps .label-prefix {\n  display: inline-block;\n  *display: inline;\n  /* IE7 inline-block hack */\n\n  *zoom: 1;\n  vertical-align: middle;\n  line-height: 1.2em;\n  max-width: 10em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.search-bar-primary .search-apps .caret {\n  line-height: 1em;\n  vertical-align: middle;\n}\n.lt-ie9 .shared-search-input {\n  height: 28px;\n}\n.lt-ie9 .search-field-wrapper {\n  height: 28px;\n}\n.lt-ie9 .placeholder-text {\n  padding: 2px 0 !important;\n  min-height: 15px !important;\n}\n.lt-ie9 .search-field {\n  padding: 2px 5px 0 5px;\n  min-height: 26px !important;\n}\n.lt-ie9 .search-assistant-wrapper {\n  top: 2px;\n  *top: 1px;\n}\n.ie7 .search-bar-wrapper {\n  *position: relative;\n  *z-index: 1;\n}\n.ie7 .search-bar * {\n  *min-width: 1px;\n}\n.ie7 .icon-search-thin {\n  *line-height: 1.2em;\n}\n@media print {\n  .shared-searchbar-input {\n    padding: 0 !important;\n  }\n  .search-bar.search-bar-primary {\n    width: 100%;\n  }\n  .search-bar.search-bar-primary td {\n    display: block;\n    width: 100%;\n  }\n  .search-field {\n    border: none !important;\n    padding: 0 0 10px 0 !important;\n    -webkit-box-shadow: none !important;\n    -moz-box-shadow: none !important;\n    box-shadow: none !important;\n  }\n  .search-field-background,\n  .search-assistant-wrapper,\n  .search-button {\n    display: none !important;\n  }\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 