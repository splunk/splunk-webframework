
define('collections/services/data/ui/Navs',
    [
        "models/services/data/ui/Nav",
        "collections/SplunkDsBase"
    ],
    function(NavModel, SplunkDsBaseCollection) {
        return SplunkDsBaseCollection.extend({
            url: "data/ui/nav",
            model: NavModel,
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/mvc/aceheader/acemenubuilder.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
/* Menu building class. COPIED FROM exposed/js/menu_builder.js and modified to fit your screen (splunkjs/mvc) */
/*
 *    Usage:
 *     var foo = new Splunk.MenuBuilder({options array}); 
 *
 *    Options:
 *         - containerDiv : reference to the container div (this.container usually)
 *         - menuDict : JSON dictionary of menu contents/structure
 *         - activator : Jquery selector for menu activator, usually an <a> tag ex: $('#_menuActivator')
 *         - menuOpenClass : class to apply to the activator when open
 *         - menuClasses : String, list of classes to apply to the top-level outer wrapper of the menu.  Can be multiple classes, space seperated. ex: 'class1 class2 ..'
 *         - autoInit : automatically build the menu. Defaults to true;
 *         - showOnInit : build menu and immediately show it, defaults to false
 *         - fadeEffects : use a fadeIn effect for when showing the menu, defaults to true
 *
 *    Menu Dictionary:
 *      The menu is built from the menuDict object passed in.  The variety of options is confusing, this is a first pass at doc'ing.
 *      Menu Dict Options:
 *          label: {string} text to display in the menu item (ex: Save Search)
 *          uri:   {string} becomes the href of the menu item
 *          style: {string} list of classes (separated by spaces) to apply to this menu item
 *          items: {array} used to define a submenu
 *              ex: {
 *                      label: 'sub menu 1',
 *                      items: [
 *                                { 
 *                                  label: 'sub menu item 1'
 *                                  uri: 'http://foo.com'
 *                                },
 *                                { 
 *                                  label: 'sub menu item 2'
 *                                  uri: 'http://bar.com'
 *                                }
 *                      ]
 *                  }
 *          callback: {function} defines a callback function to fire when menu item is clicked                     
 *          attrs: {array} array of attributes and their values to apply to the menu item
 *              ex: {
 *                      label: 'foo',
 *                      attrs: {
 *                                  'attr1' : 'attr1Value',
 *                                  'attr2' : 'attr2Value'
 *                              }
 *                   } 
 *          showInFilter: If a filter is defined for this menu, show only menu items that have that filter set in their 'showInFilter' property.
 *          divider: {string} creates a divider div, value is the class to apply to the divider (splDivider is pre-defined in default skin)
 *          menuType: {string} optionally specify special menu type:
 *                     - 'htmlBlock' : specifies that for this menu (or submenu), the contents will be a simple html block.  used in conjuction with 'element' and optionally 'action'
 *                          ex: {
 *                                  menuType: 'htmlBlock',
 *                                  element: '.specialElement',
 *                                  action: 'clone'  
 *                               }
 *                     - 'grouping' : specifies that this is a menu grouping header, which can be used to group menu items under a common header. 'label' becomes header
 *                          ex: {
 *                                  menuType: 'grouping',
 *                                  label: 'Group 1'
 *                               }
 *                           
 *           element:  {JQuery selector} used in conjuction with menuType: 'htmlBlock', this JQuery selector indicates the element to put into the html block menu or submenu
 *           action: {string} defines a special action to use with menuTyp: 'htmlBlock'.  currently, the only option is 'clone', which causes the element specified with the 'element' property to be cloned into the html block.  default is to remove the element from its current position and move it within the dom
 *           popup : if property is present, the uri of the menu item will open in a new window
 *           remove: if property is present, menu will be removed on click
 *
 *          Examples:
 *              Basic Menu :
 *                   var newMenu = [
 *                                      {
 *                                          label : 'Item 1',
 *                                          uri: 'http://www.splunk.com',
 *                                          callback : function(){ alert('foo'); }
 *                                      },
 *                                      {
 *                                           label : 'Item 2',
 *                                           uri: 'http://splunkbase.com'
 *                                           style: 'specialFoofyClass'
 *                                      }
 *                                  ]
 *                            
 *             Menu with submenu :
 *                  var newMenu = [
 *                                    {
 *                                        label : 'Item 1',
 *                                        uri : 'http://www.splunk.com'
 *                                    },
 *                                    {
 *                                        label : 'Item 2',
 *                                        items : [
 *                                              {
 *                                                  label : 'Submenu Item 1',
 *                                                  uri : 'http://www.splunk.com'
 *                                              },
 *                                              {
 *                                                  label : 'Submenu Item 2',
 *                                                  uri : 'http://www.splunk.com'
 *                                              }                                                    
 *                                        ]
 *                                    }
 *                                  ]
 *              Menu with divider and groupings :
 *                  var newMenu = [
 *                                  {
 *                                      menuType: 'grouping',
 *                                      label: 'Group 1'
 *                                  },
 *                                  {
 *                                      label: 'Item 1',
 *                                      uri: 'http://www.splunk.com'
 *                                  },
 *                                  {
 *                                      label: 'Item 2',
 *                                      uri: 'http://www.splunk.com'
 *                                  },
 *                                  {
 *                                      divider: 'splDivider'
 *                                  },
 *                                      menuType: 'grouping',
 *                                      label: 'Group 2'
 *                                  },
 *                                  {
 *                                      label: 'Item 1',
 *                                      uri: 'http://www.splunk.com'
 *                                  },
 *                                  {
 *                                      label: 'Item 2',
 *                                      uri: 'http://www.splunk.com'
 *                                  } 
 *                                ]                      
 *    
 */

define('splunkjs/mvc/aceheader/acemenubuilder',['require','exports','module','../mvc','../basesplunkview','jquery','jquery.ui.position','css!./acemenubuilder'],function (require, exports, module) {
    var mvc = require('../mvc');
    var BaseSplunkView = require('../basesplunkview');
    var $ = require('jquery');
    require('jquery.ui.position');
    require('css!./acemenubuilder');

    var smartTrim = function(string, maxLength) {
        if (!string) return string;
        if (maxLength < 1) return string;
        if (string.length <= maxLength) return string;
        if (maxLength == 1) return string.substring(0,1) + '...';

        var midpoint = Math.ceil(string.length / 2);
        var toremove = string.length - maxLength;
        var lstrip = Math.ceil(toremove/2);
        var rstrip = toremove - lstrip;
        return string.substring(0, midpoint-lstrip) + '...' + string.substring(midpoint+rstrip);
    };

    /**
     * Meant to be a sane wrapper to the insane world of window.open.
     * This should probably just be merged with this.popup. Get popup's centering goodness
     * and open's options management, safer focus call.
     *
     * Be default, calling this method opens a new window with the same width and height as
     * the calling window.  It also centers the new window on the user's screen.
     * To change the width and height of the new window set 'width' and 'height' values to
     * the passed in options object.  To change the position of the new window, set 'top'
     * and 'left' in the passed in options parameter.
     *
     * @param uri {String} path to the new window object.
     * @param name {String} name of the new window object.
     * @param args {Object} dictionary of key / value pairs used to manage the window's options.
     */
    var popupOpen = function(uri, name, options) {

        // Set defaults
        options = $.extend({
            resizable: true,
            scrollbars: true,
            toolbar: true,
            location: true,
            menubar: true,
            width: $(window).width(),
            height: $(window).height()
        }, options);

        if (!options['top']) options['top'] = Math.max(0, screen.availHeight/2 - options['height']/2);
        if (!options['left']) options['left'] = Math.max(0, screen.availWidth/2 - options['width']/2);
        options['screenX'] = options['left'];
        options['screenY'] = options['top'];

        var compiled_options = [];
        for (var key in options) {
            if (options[key] === true) options[key] = 'yes';
            if (options[key] === false) options[key] = 'no';
            compiled_options.push(key + '=' + options[key]);
        }

        name = 'w' + name.replace(/[^a-zA-Z 0-9]+/g,'');
        
        var newWindow = window.open(uri, name, compiled_options.join(','));
        if (newWindow && newWindow.focus) newWindow.focus();
        return newWindow;
    };

    var AceMenuBuilder = BaseSplunkView.extend({
        _containerDiv    : null, //reference to the container
        _menuOpen         : null, //flag: is menu open
        _menuActivator    : null, //reference to menu activator
        _menuTimer        : null, //timer to be used for timeouts
        _menuActivationTime : 0, //time to be used to prevent double activation errors
        _timeoutDelay    : null, //default timeout delay
        _menu            : null, //reference for the menu  
        
        // define the max number of characters to display per menu item   
        MAX_ITEM_LENGTH: 50,
        
        // number of milliseconds to animate fades
        FADE_DURATION: 100,
        
        initialize: function(options) {       
            //defaults
            this._menuOpen = false;
            this._timeoutDelay = 5000;
            this._menu = false;
            this._menuOpen = false;
        
           
            this._options = {
                containerDiv  : false,
                menuDict      : false,
                activator     : false,
                menuOpenClass : false,
                menuClasses   : '',
                autoInit      : true,
                showOnInit    : false,
                fadeEffects   : false,
                filter        : false
            };
           
            // Set the options using the defaults
            if (options) $.extend(this._options, options);
           
            // Build the menu on initialize if asked to do so.
            if (this._options.autoInit) this.menuInit();
        },

        menuInit: function() {
            // build the dictionary into a menu
            this._menu = this.buildMenu(this._options['menuDict'], 1);

            // add menu class and any classes they specified
            var extraClasses;
            if ( this._options['menuClasses'] ) {
                extraClasses = this._options['menuClasses'];   
            } else {
                extraClasses = "splunk-splMenu-primary";   
            }
            this._menu.addClass('splunk-splMenu ' + extraClasses);

            // attach menu to container
            $('body').append(this._menu);

            // used to reduce the .bind(this) calls
            var moduleInstance = this;

            // attach click to menu activator
            if ( this._options['activator'] ) {
                this._menuActivator = $(this._options['activator']); // again, cast with $() to be sure. this also allows jquery selectors to be valid
                this._menuActivator.click(this._onActivatorClick.bind(this));
            } 

            //add hovers for menu
            this._menu.hover(function() {
                    clearTimeout(moduleInstance._menuTimer);
                },
                function() {
                    clearTimeout(moduleInstance._menuTimer);
                    moduleInstance._menuTimer = setTimeout( function() {
                            moduleInstance.hideMenu();
                        }, moduleInstance._timeoutDelay);
                }
            );

            //add top-level click event handler
            $(this._menu).bind('click', function(evt){
                this.onMenuClick(evt);	
            }.bind(this));
    		
    		// hard stopping clicks from escaping the html block in menus.  for some reason testing if we're in the menu block in a top-level handler fails to catch all clicks
            $('.htmlBlock', this._menu).click(function(evt){
                 evt.stopPropagation();
            });

            //add submenu arrows span and hover actions
            $('li.hasSubMenu', this._menu)
                .hover( function(){
                    clearTimeout(moduleInstance._menuTimer);
                    moduleInstance.menuOver(this);
                }, function(){
                    clearTimeout(moduleInstance._menuTimer);
                    moduleInstance._menuTimer = setTimeout(function(){ moduleInstance.menuOut(this); }.bind(this),400);
                });
            
            //show the menu now.
            if(this._options.showOnInit){
                setTimeout(this.showMenu.bind(this), 0);
            }
                   
            //for Navigation with the keyboard through top nav ~ TOP LEVEL
            var curActivator;
            
            $(this._menuActivator).focus(function(evt){ //opens the dropdown when Activator is focused
               	if ( !this._menuOpen ) {
               		this._onActivatorFocus(evt);
               		curActivator = $(this._menuActivator);
               	}
            }.bind(this));        
            
            //Listener to capture the anchor with the current focus
            var curFocus;
            $("a").focus(function(){
            	curFocus = $(this);   
            });        
            
            //Listens for a keypress when focus is on the Activator
            $(this._menuActivator).bind('keydown',function(evt){  
          		var kc = evt.keyCode;       		
           		if(kc == 9){
           			this.hideMenu();
           			return true;
           		}else if(kc == 40){
            		if ( this._menuOpen ) {
               			$("a:first",this._menu).focus();
           			}
            		return false;
            	}        	
           	}.bind(this));
            
            //for Navigation with the keyboard through top nav ~ IN DROPDOWN       	
            $(this._menu).bind('keydown',function(evt){
               	 var kc = evt.keyCode,
            	     hasSubMenu = (curFocus.parent().hasClass('hasSubMenu')),
            	     subMenuWrapper = (hasSubMenu && kc == 37)?curFocus.parents('li.hasSubMenu').slice(1,2):curFocus.parents('li.hasSubMenu:first'),
            	     submenu = subMenuWrapper.children('div.splunk-outerMenuWrapper:first');        	
            	if(kc == 9){ //tab
            	    this.hideMenu();   // needs to happen before focus for IE9?
            		curActivator.focus();
                    this.hideMenu(); // this needs to happen again after focus for IE9?
            		return true;
            	} else if(kc == 38){ // Up arrow
            		if(curFocus.parent().prev().is("div")){   //need this to skip the 'div' separators
               			curFocus.parent().prev().prev().children("a").focus();
               			return false;
               		}else{
               			curFocus.parent().prev().children("a").focus();
               			return false;
               		}           		
            	}else if(kc == 40){ //down arrow 
            	    if(curFocus.parent().next().is("div")){   //needed to skip the 'div' separators
               			curFocus.parent().next().next().children("a").focus();
               			return false;
               		}else{
               			curFocus.parent().next().children("a").focus();
               			return false;
               		}
            	}else if(kc == 39 && hasSubMenu){ //right arrow on submenu activator
            		this.menuOver(subMenuWrapper);
            		$("li > a:first", submenu).focus();
            	}
            	else if(kc == 37){ //left arrow in submenu   
            		subMenuWrapper.children('a:first').focus();
            		submenu.hide();		
            	}
            }.bind(this));
            
            
            
            $(document).click(this._onDocumentClick.bind(this));
            $("body").bind("focusin", function(evt) {
            	if($(evt.target).is("select")){
            		this._onDocumentClick(evt);        		
            	}
            }.bind(this));
            $(window).resize(this._onWindowResize.bind(this));

        },
        /* top-level click handler */
        onMenuClick: function(evt){
            var t = evt.target;
    		var isA = $(t).is('a');
    		
            //stop clicks on submenu parent items
            if (!isA || isA && $(t).parent('li.hasSubMenu').length ) {
    			evt.stopPropagation();
                return false;
            } else {
                $('a', t).click();
            }
        },
        /* function for hovering over an li containing a submenu */
        menuOver: function(orig) {
            this.hideSubMenus(orig); 
            $(orig).addClass('sfhover');
           
            var submenu = $(orig).children('div.splunk-outerMenuWrapper');

            var hangRight = ($(orig).offset().left + $(orig).width() + submenu.width() > $(window).width());
            var submenuLeft = (hangRight) ? -submenu.width() : $(orig).parent('div').parent('ul').width();
            submenu.css({left:submenuLeft});
    	    //submenu.bgiframe();
            submenu.show();
        },
       
        /* function for mouseout of submenu, hides submenu */
        menuOut: function(orig) { 
            $(orig).removeClass('sfhover');
            $(orig).children('div.splunk-outerMenuWrapper').hide();
        },
       
        /* build menu structure from the JSON dict passed */
        buildMenu: function(menuDict, menuLevel) {
            var menu = $('<div class="splunk-outerMenuWrapper splunk-splShadow"><ul></ul></div>');
            $.each(menuDict, function(index,menuitem) {

                // If a filter is defined for this menu, show only menu items that have that filter set in their 'showInFilter' property.
                if (this._options.filter !== false) {
                    if ( menuitem.hasOwnProperty("showInFilter") && (menuitem.showInFilter != undefined) ) {
                        var l = menuitem.showInFilter.length;
                        var hasMatch = false;
                        for ( var i=0; i<l; i++ ) {
                           if ( menuitem.showInFilter[i] == this._options.filter ) hasMatch = true;
                        }
                        if ( !hasMatch ) return true; // If nothing matches, onto the next...
                    } else {
                        return true; // If the menu has a filter set and the menuitem does not, toss out the menuitem.
                    }
                }

                var itemClasses = '';
           
                // apply any styles to this item if specified in the menu dictionary
                if (menuitem.hasOwnProperty('style')){
                    itemClasses += menuitem.style;
                }

                if ( menuitem.hasOwnProperty('divider') ) {  // NOTE: Need to figure this out, I don't really like this approach.  we need a way to specify a divider element,
                                                             //       but not tie implementation to the JSON dict
                    newNode = $('<div class="actionsMenuDivider"></div>');  // currently using a div with the class passed
                } else if ( menuitem.hasOwnProperty('menuType') && menuitem.menuType == 'htmlBlock') { // htmlBlocks are to drop in the contents of a div, or possibly html returned remotely via ajax
                    if ( menuitem.hasOwnProperty('element') ) {
                        // html block to place in menu comes from an existing element with class elementClass
                        // grab the element and shove it into the menu structure
                        newNode = $('<li class="' + itemClasses + ' htmlBlock"></li>');

                        if ( menuitem.hasOwnProperty('action') && menuitem.action == 'clone' ) { //clone element and add it in
                            $(menuitem.element).clone(true).appendTo(newNode);
                        } else { //actually insert the dom node itself
                            $(menuitem.element).appendTo(newNode);
                        }
                    }
                    
                    // Allow callbacks using jQuery's typical callback binding ('this' refers to calling element in callback)
                    if (menuitem.hasOwnProperty('callback')) {
                        newNode.click(function(event){
                            this.hideMenu(menuitem.callback, event);
                            event.stopPropagation();
                            return false;
                        }.bind(this));
                    }
                } else {
                    var label = '';

                    //NOTE: again, probably not the best approach to this, we need a way to specify grouping headers.
                    if ( menuitem.hasOwnProperty('menuType') && menuitem.menuType == 'grouping') { //treat label as a header, further uls as the items to be grouped
                        label = $('<p class="splunkMenuGroupingHeader">').html(menuitem.label);
                    } else {

                        var href = 'javascript:void(0);';
                        var attrs = '';
                       
                        if (menuitem.hasOwnProperty('uri')){
                            href = menuitem.uri;
                        }
                        label = $('<a>')
                            .attr("href", href)
                           	.attr("tabindex","-1")
                            .addClass("menuItemLink")
                            .html(smartTrim(menuitem.label, this.MAX_ITEM_LENGTH));

                        if (menuitem.hasOwnProperty('attrs')) {
                            for (var key in menuitem.attrs) {
                                label.attr(key, menuitem.attrs[key]);                               
                            }
                        }
                        
                        if (menuitem.hasOwnProperty('popup')) {
                            label.click(function(){
                                popupOpen(this.href, menuitem.popup);
                                return false;
                            });
                        }

                        if (menuitem.hasOwnProperty('remove')) {
                            label.click(function(){
                                this.removeMenu();
                            }.bind(this));
                        }
                        
                        if (menuitem.hasOwnProperty('data')) {
                            label.data('data', menuitem.data);
                        }
                    }
                    
                    var newNode = $('<li class="' + itemClasses + '">').append(label);

                    if ( menuitem.hasOwnProperty('items') ) {
                        newNode
                          .append('<span class="splIcon splIcon-triangle-4-e dropDown"></span>')
                          .addClass('hasSubMenu')
                          .append( this.buildMenu(menuitem.items) );
                    }
               
                    // Allow callbacks using jQuery's typical callback binding ('this' refers to calling element in callback)
                    if (menuitem.hasOwnProperty('callback')) {
                        newNode.click(function(event){
                            this.hideMenu(menuitem.callback, event);
                            event.stopPropagation();
                            return false;
                        }.bind(this));
                    }
                    
                }
                   menu.children('ul').append(newNode);
            }.bind(this));

            // inner wrapper element for extra styling needs.  unfortunate, but necessary for additional styling options
            menu.children('ul').children('*').wrapAll('<div class="splunk-innerMenuWrapper"></div>');
    		
    		return menu;
            
        },
       
        /**
         * Removes the menu and deactivates the activator control.
         *
         */
        removeMenu: function() {
            // Remove click actions from the menu
            this._menuActivator.unbind('click');
           
            // Remove the event handlers from the menu itself
            this._menu.unbind('click').unbind('hover');
           
            // Kill the menu. This will also remove any data associated with the menu.
            this._menu.remove();
        },
       
        /**
         * Removes the current menu and builds a new one
         * using a new menu dictionary.
         *
         * TODO better updating of menu items without rebuilding the entire menu structure
         */
        updateMenu: function(menuDict) {
            var originalShowOnInitVal = this._options.showOnInit;
            
            if(this._menuOpen){
                this._options.showOnInit = true;
            }
            
            this.removeMenu();        
            this._options.menuDict = menuDict;
            this.menuInit();
            
            this._options.showOnInit = originalShowOnInitVal;
        },
       
        /* function to position and show menu */
        showMenu: function() {        

            //using Brandon Aaron's bgiframe plugin to fix select element bleed-through in IE6
            // this._menu.bgiframe();
          
            this._menuOpen = true;

            if ( this._options["menuOpenClass"] ) {
                this._menuActivator.addClass(this._options["menuOpenClass"]);
            } else {
                this._menuActivator.addClass('menuOpen');
            }
            
            // adding a testing hook class
            this._menu.addClass('splOpenMenu');
            if ( this._options['fadeEffects'] ) {
                this._menu.fadeIn(this.FADE_DURATION);
            } else {
                this._menu.show();
            }
            this.setPosition();
    	
        },
       
        setPosition: function() {
    	
            var t = $(this._menuActivator);
            
            var menu = this._menu;
            menu.position({
                of: t,
                my: 'left top',
                at: 'left bottom',
                collision: 'fit none'
            });
    	
        },
       
        /* function to hide all submenus
                NOTE: not sure we want to go down this path, where everything is so heavily DOM-dependent.
         */
        hideSubMenus: function(orig) {
            if (typeof orig === 'undefined') {
                orig = this._menu;
            } else {
                orig = $(orig).parent();
            }
            orig.find('.hasSubMenu').each(  //loop over all menu items that have submenus
                function(){
                    if ( this != orig ) { //if this hover is triggered on the currently open menu, don't hide it's submenus
                       $(this).children('div.splunk-outerMenuWrapper').hide();
                    }
                }
            );
        },
       
        /* function to hide the menu */
        /* @param {function} callback - if they assigned a callback to a menu item, fire it after the menu closes */
        /* @param {Object} event - a JQuery normalized event */
        hideMenu: function(callback, event) {
            this._menuOpen = false;
            if ( this._options["menuOpenClass"] ) {
                this._menuActivator.removeClass(this._options["menuOpenClass"]);
            } else {
                this._menuActivator.removeClass('menuOpen');
            }
            this.hideSubMenus();
            
            // if this menu is being closed because of another menu being opened,
            // do a fast hide
            // removing the testing hook class
            this._menu.removeClass('splOpenMenu');
            if (!this._menuOpen && !callback) {
                this._menu.fadeOut(this.FADE_DURATION);
                //jQuery 1.6.2 started using timing control for script-based animations using the new requestAnimationFrame.
                //FF 8.X was not hiding menus so we defer this operation to the end of the stack maintaining the smooth animation for
                //friends and family.
                setTimeout(function(){this._menu.hide();}.bind(this), this.FADE_DURATION);
            } else {
                this._menu.hide();   
                return callback(event);
            }
        },
       
        
         /* function to handle closing of the menu */
         _onDocumentClick: function(evt) {
    	 	 if ( 
    	 	 	!this._menuOpen || // isn't open
    	 	 	!this._menuActivator || // don't have an object
    	 	 	!this._menuActivator.length || //  object doesn't have anything in it.
    	 	 	this._menuActivator.is(evt.target) || // clicked on the activator.
    	 	 	$.contains(this._menuActivator[0], evt.target) // clicked on a child of the activator
    	 	 	) {
    	 	 	
    	 	 	// if anything above is true, then return – don't hide anything.
    	         return true;
    	     }
    	     
    	     this.hideMenu();
         },
         
      
       /* function to reposition the menu on window resize */
       _onWindowResize: function(evt) {
       		if (this._menuOpen) {
     	     	this.setPosition();
     	    }
       },
       
        /* function to handle activating the menu */
        _onActivatorFocus: function(evt) {
        	//Prevent this from firing twice in a 1/4 second
        	//This allows focus and click to activate the menu without interfering.
        	var time = new Date();
    		if ((time - this._menuActivationTime) < 250) return true ;
    		this._menuActivationTime = time;
        	
        	
            if (this._menuOpen) {
                this.hideMenu();
            } else {
            	this.showMenu();
            }
        },
        
         /* function to handle click on the menu activator */
         _onActivatorClick: function(evt) {
             evt.preventDefault();
             this._menuActivator.focus(); 
             this._onActivatorFocus(); //Note, this can cause double call for _onActivatorFocus
         },
          
        /* getter for a handle on the menu */
        getMenu: function(){
            return this._menu;
        },
       
        /* getter for the menu activator */
        getActivator: function () {
            return this._menuActivator;
        }
    });

    return AceMenuBuilder;
});
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/mvc/aceheader/aceheader.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/aceheader/aceheader',['require','exports','module','underscore','jquery','../mvc','../basesplunkview','helpers/AppNav','collections/services/data/ui/Navs','collections/services/data/ui/Views','collections/services/SavedSearches','splunk.config','./acemenubuilder','collections/services/AppLocals','splunk.util','css!./aceheader'],function (require, exports, module) {
	var _ = require('underscore');
	var $ = require('jquery');
	var mvc = require('../mvc');
	var BaseSplunkView = require('../basesplunkview');
	var AppNav = require('helpers/AppNav');
	var NavsCollection = require('collections/services/data/ui/Navs');
	var ViewsCollection = require('collections/services/data/ui/Views');
	var SavedSearchesCollection = require('collections/services/SavedSearches');
	var SplunkConfig = require('splunk.config');
	var AceMenuBuilder = require('./acemenubuilder');
	var AppsCollection = require('collections/services/AppLocals');
	var SplunkUtil = require('splunk.util');
	require("css!./aceheader");

	// private state
	var initialized = false; 
	var appName = '';
	var owner = '';
    var userDisplayName = '';
    var appDisplayName = '';
	var navData = null;
	var allMenuData = null;
	var apps = [];


	// private functions

	// Ripped off from AppBar.js
	var transposeMenuData = function(menu, options){
        var output = [];
        options = options || {};
        var isTop = (options.hasOwnProperty("isTop"))?options.isTop:false;
        var isActive = (options.hasOwnProperty("isActive"))?options.isActive:false;
        for(var i=0; i<menu.length; i++){
            var menuEntry = menu[i];
            var replacement = {};
            
            if(menuEntry.hasOwnProperty("submenu")){
                var transpose = transposeMenuData(menuEntry.submenu, {isActive:isActive});
                var subnode = transpose.output;
                isActive = transpose.isActive;
                replacement["items"] = subnode;
                replacement["label"] = (menuEntry.hasOwnProperty("label"))?menuEntry.label:"";
            
            } else {
                replacement = menuEntry;

                // add class to menu item for private items; possible 'sharing'
                // values are 'user', 'app', 'system', 'global'.  see eai:acl
                if (menuEntry['sharing'] == 'user') {
                    replacement['style'] = 'splUserCreated';
                }
            }
            
            if(isTop && isActive){
                replacement["isActive"] = true;
            }
            output.push(replacement);
        }
        return {output:output, isActive:isActive};
    };
	// Ripped off from AppBar.js
  	var parseNavConfig = function(navConfig){
        var transpose = transposeMenuData(navConfig, {isTop:true});
        var menuData = {};
        for(var i=0; i<transpose.output.length; i++){
            if(transpose.output[i].hasOwnProperty("items")){
                menuData["splunk-navmenu_" + i] = transpose.output[i].items;
            }else{
                continue;
            }
        }
        return menuData;
    };
	// Ripped off from AppBar.js
    var generateMainMenus = function(menuData, container){
        // setup the menu systems for all of the app menus
        for (var key in menuData) {
            if (menuData.hasOwnProperty(key)) {
                new AceMenuBuilder({
                    containerDiv: container,
                    menuDict: menuData[key],
                    activator: $('#' + key),
                    menuClasses: 'splunk-splMenu-primary ' + key
                });
            }
        }
    };

    

	var AceHeader = BaseSplunkView.extend({
		className: 'splunk-ace-header',
		tagName: 'header',
        
        options: {
            'appbar': true
        },
        
		initialize: function() {
            this.configure();
            
			var _this = this;
			appName = SplunkConfig.APP; 
			owner = SplunkConfig.USERNAME;
            userDisplayName = SplunkConfig.USER_DISPLAYNAME;
            appDisplayName = SplunkConfig.APP_DISPLAYNAME;

			// This is shamelessly ripped from Homepage.js
			var navsDfd = $.Deferred();
			var navsCollection = new NavsCollection();
			navsCollection.on('reset change', navsDfd.resolve);
			navsCollection.fetch({ data: { app: '-', owner: owner, count: -1 }});


			var parseViewsDfd = $.Deferred();
			var viewsCollection = new ViewsCollection();
			viewsCollection.fetch({data: {app:'-', owner: owner, count: -1, digest: 1}});
            viewsCollection.on('reset change', function() {
                parseViewsDfd.resolve(viewsCollection);
            });


            var searchesDfd = $.Deferred();
            var savedSearchesCollection = new SavedSearchesCollection();
            savedSearchesCollection.fetch({data:{app:'-', owner: owner, search:'is_visible=1 AND disabled=0', count:-1}}); 
            savedSearchesCollection.on('reset change', searchesDfd.resolve);

            var appsCollection = new AppsCollection();
            var appsDfd = $.Deferred();
            appsCollection.fetch({data:{'sort_key':'name', 'sort_dir':'desc', app: appName, owner: owner, search: 'visible=true AND name!=launcher', count:-1}});
            appsCollection.on('reset sort change', appsDfd.resolve);

			$.when(
				appsDfd,
				navsDfd,
				parseViewsDfd,
				searchesDfd
			).done(function(appsCollection, navsCollection, parsedViewLabels, savedSearches) {
				savedSearches = savedSearches[0];
                navsCollection = navsCollection[0];
                apps = appsCollection[0];
				var navModel = navsCollection.get('/servicesNS/nobody/' + appName + '/data/ui/nav/default');
				allMenuData = AppNav.parseNavModel(navModel, parsedViewLabels, savedSearches).nav; 
				
				navData = parseNavConfig(allMenuData);

				initialized = true;
				_this.render();
			});


		},
		render: function() {
			if (initialized) {
				this.$el.html(_.template(AceHeader.template, {
					navData: allMenuData,
					appNamespace: appName, 
					userName: userDisplayName, 
					appDisplayName: appDisplayName,
                    appbar: this.settings.get("appbar")
				}));


				var appsNavData = [];

				apps.each(function(app) {
                    // We are generating a Splunkweb URL for these, which means
                    // we have to go through a redirect cycle. That's OK,
                    // and on par with what we have for the Bubbles header.
					appsNavData.push({
						label: app.entry.content.get('label'),
						uri: SplunkUtil.make_url('app', app.entry.get('name')) 
					});
				});
                
                appsNavData = _.sortBy(appsNavData, function(app) { 
                    return (app.label || "").toLowerCase(); 
                });
				
				appsNavData.push({
					divider: true
				});

				appsNavData.push({
					label: 'Home',
					uri: SplunkUtil.make_url('app', 'launcher')
				});
				appsNavData.push({
					label: 'Manage apps...',
					uri: SplunkUtil.make_url('manager', 'search', 'apps', 'local')
				});
				appsNavData.push({
					label: 'Find more apps...',
					uri: SplunkUtil.make_url('manager', 'search', 'apps', 'remote')
				});

				generateMainMenus(navData, this.el);



				new AceMenuBuilder({
					activator: $('#splunk-applicationsMenuActivator'),
					menuDict: appsNavData,
					menuClasses: 'splunk-splMenu-primary splunk-app-menu'
				});

			}
			return this;
		}
		
	},
	// Class static
	{
		template: '\
		<div> \
	        <ul class="splunk-account-bar-items"> \
			    <li> \
        			<a href="/en-US/manager/<%= appNamespace %>/authentication/changepassword/admin?action=edit" class="splunk-user-full-name"><%- userName %></a> \
    			</li> \
    			<li class="splunk-account-divider">|</li> \
			    <li id="splunk-applicationsMenuActivator"> \
			        <a href="#" >App<span class="splunk-dropdown-icon splunk-triangle-1"></span></a> \
			    </li> \
			    <li class="splunk-account-divider">|</li> \
		        <li> \
		            <a href="/en-US/manager/<%= appNamespace %>">Manager</a> \
		        </li> \
		        <li class="splunk-account-divider">|</li> \
		        <li> \
		            <a href="/en-US/alerts/<%= appNamespace %>" class="alerts_opener">Alerts</a> \
		        </li> \
		        <li class="splunk-account-divider">|</li> \
		        <li> \
		            <a href="/en-US/app/<%= appNamespace %>/job_management" class="job_manager_opener">Jobs</a> \
		        </li> \
		        <li class="splunk-account-divider">|</li> \
		        <li> \
		            <a href="/en-US/account/logout">Logout</a> \
		        </li> \
		    </ul> \
		    <div class="splunk-app-logo-container"> \
		    	<a href="/en-US/app/<%= appNamespace %>" class="splunk-app-logo"></a> \
		    	<h1><%= appDisplayName %></h1> \
		    </div> \
		    <div class="splunk-clear"></div> \
    	</div> \
        <% if (appbar) { %> \
        <div class="splunk-navigation-header"> \
			<ul> \
			<% _.each(navData, function(navItem, index) { %> \
				<% if (navItem.submenu) { %> \
					<li class="splunk-has-menu dropdown"> \
						<a href="#" id="splunk-navmenu_<%= index %>"><%= navItem.label %><span class="splunk-dropdown-icon splunk-triangle-2"></span></a> \
					</li> \
				<% } else { %> \
					<li> \
						<a href="<%= navItem.uri %>"><%= navItem.label %></a> \
					</li> \
				<% } %> \
	        <% }); %> \
			</ul> \
	    </div> \
        <% } %>'
	});

	return AceHeader;
});
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/* menu classes\n---------------------------------*/\n\n.splunk-splMenu {\n    font-size: 11px;\n    font-family: Arial, Helvetica, sans-serif;\n}\n\n/* primary menu - white */\n.splunk-splMenu-primary, .splunk-splMenu-primary a {\n    color: #333;\n}\n.splunk-splMenu-primary li.disabled a {\n    color:#999;\n}\n.splunk-splMenu-primary ul {\n    background-color: #FFF;\n}\n\n/* primary menu hover styles */\n.splunk-splMenu-primary li:hover {\n    background: #f3ecbb;\n}\n.splunk-splMenu-primary ul li.htmlBlock:hover {\n    background-color: transparent;\n}\n\n/* secondary menu - black */\n.splunk-splMenu-secondary, .splunk-splMenu-secondary a {\n    color: #CCC;\n}\n.splunk-splMenu-secondary li.disabled a {\n    color:#999;\n}\n.splunk-splMenu-secondary ul {\n    background-color: #000;\n    border-color: #333;\n}\n\n/* primary menu hover styles */\n.splunk-splMenu-secondary li:hover {\n    background-color: #7b9059;\n}\n.splunk-splMenu-secondary a:hover {\n    color: #FFF;\n}\n.splunk-splMenu-secondary ul li.htmlBlock:hover {\n    background-color: transparent;\n}\n\n.splunk-splShadow {\n    background: url(/static/img/skins/default/shadow_soft.png) no-repeat bottom right;\n    -moz-border-radius-bottomleft: 16px; /*is this supposed to be different?*/\n    -moz-border-radius-topright: 17px;\n    -webkit-border-top-right-radius: 17px;\n    -webkit-border-bottom-left-radius: 17px;\n    border-top-right-radius:17px;\n    border-bottom-left-radius:17px;\n    _background: none;\n    padding: 0 8px 9px 0;\n}\n\n/*** Structural menu styles, default ***/\n.splunk-splMenu, .splunk-splMenu div.splunk-outerMenuWrapper {\n    position: absolute;\n    display: none;\n    text-align: left;\n    border-color: #ccc;\n}\n\n.splunk-splMenu, .splunk-splMenu * {\n    margin: 0;\n    list-style: none;\n    z-index: 500;\n}\n\n.splunk-splMenu div.splunk-outerMenuWrapper {\n    left:80px;  /* set the left width in your menu style to line up where you want it, use negatives to line up on the left */\n    top:0px;\n}\n\n.splunk-splMenu a {\n    display: block;\n    padding: 5px 10px;\n    width: 140px;\n    text-decoration: none;\n    overflow: hidden;\n    *width:auto;\n}\n.splunk-splMenu a:hover {\n   _text-decoration: none;\n}\n.splunk-splMenu ul {\n    border: 1px solid #ccc;\n}\n.splunk-splMenu ul div.splunk-innerMenuWrapper {\n    padding: 5px 0px;\n    width: 160px;\n}\n.splunk-splMenu ul li {\n    width: 160px;\n    _width: auto;\n    _height:20px;\n    *list-style-position: outside;\n    padding: 0px;\n    position: relative;\n    word-wrap: break-word;\n    cursor: pointer;\n}\n.splunk-splMenu .actionsMenuDivider {\n    border-bottom-width: 1px;\n    border-bottom-style: solid;\n    margin: 3px 0px;\n}\n\n/** arrows **/\n\n.splunk-splMenu li.hasSubMenu span.splIcon {\n    position: absolute;\n    right: 5px;\n    top:10px;\n}\n\n.splunk-splMenu li.hasSubMenu span.splIcon {\n    position: absolute;\n    right: 5px;\n    top: 10px;\n}\n.splunk-splMenu .splIcon-triangle-4-e {\n    background-position: -67px -407px;\n    background-color: transparent;\n}\n\n.splunk-splMenu .splIcon {\n    background-image: url(/en-US/static/img/skins/default/splIcons.gif);\n}\n.splunk-splMenu .dropDown {\n    text-indent: -10000px;\n    width: 6px;\n    height: 6px;\n    overflow: hidden;\n}\n\n.splunk-splMenu .actionsMenuDivider {\n    border-bottom-width: 1px;\n    border-bottom-style: solid;\n    margin: 3px 0px;\n    border-color: #ccc;\n}\n\n/* TODO reconcile URLs */\nheader.splunk-ace-header {\n    background: #000 url(/en-US/static/img/skins/default/bg_appHeaderWrapper.png) repeat-x;\n\tcolor: #666;\n\tfont-family: Arial,Helvetica,sans-serif;\n\tfont-size: 11px;\n}\n\nheader.splunk-ace-header a {\n\tcolor: #CCC;\n\ttext-decoration: none;\n}\n\nheader.splunk-ace-header .splunk-account-bar-items {\n\tdisplay: block;\n\tfloat: right;\n\tmargin: 3px 5px 0 0;\n\tpadding: 0;\n\tlist-style: none none;\n}\n\nheader.splunk-ace-header .splunk-account-bar-items li {\n\tmargin: 0;\n\tfloat: left;\n\tpadding-right: 5px;\n\tline-height: 22px;\n}\n\nheader.splunk-ace-header .splunk-account-bar-items li a:hover {\n\ttext-decoration: underline;\n}\n\nheader.splunk-ace-header .splunk-account-bar-items li.splunk-account-divider {\n\tmargin: 0 6px 0 1px;\n\tpadding: 0;\n} \n\nheader.splunk-ace-header .splunk-app-logo-container {\n\tpadding-left: 10px;\n}\n\nheader.splunk-ace-header .splunk-app-logo-container a.splunk-app-logo {\n\tdisplay: inline-block;\n\tfloat: left;\n\theight: 43px;\n\twidth: 80px;\n\tbackground: url(/en-US/static/img/skins/default/splunk_logo_black.png) no-repeat 0 0;\n}\n\nheader.splunk-ace-header .splunk-app-logo-container h1 {\n\tdisplay: inline-block;\n\tfloat: left;\n\tcolor: #73a550;\n\tline-height: 43px;\n\tfont-size: 18px;\n\tfont-weight: normal;\n\tmargin: 0;\n}\n\ndiv.splunk-clear {\n\tclear: both;\n}\n\nheader.splunk-ace-header .splunk-navigation-header {\n\tbackground-image: none;\n\theight: 28px;\n\tpadding: 0;\n}\n\nheader.splunk-ace-header .splunk-navigation-header ul {\n\tlist-style: none none;\n\tmargin: 0;\n\tpadding: 0;\n}\n\nheader.splunk-ace-header .splunk-navigation-header ul li {\n\tfloat: left;\n\tpadding-bottom: 0;\n\tpadding-left: 0;\n\tmargin-bottom: 0;\n\tmargin-left: 0;\n\tline-height: 28px;\n}\n\n header.splunk-ace-header .splunk-navigation-header ul li a {\n \tdisplay: block;\n \tpadding: 0 10px;\n \tfont-size: 11px;\n \tfont-weight: bold;\n    outline: none;\n}\n\nheader.splunk-ace-header .splunk-navigation-header ul li.splunk-has-menu a {\n    padding-right: 23px;\n    position: relative;\n}\n\nheader.splunk-ace-header .splunk-user-full-name {\n\tfont-weight: bold;\n}\n\nheader.splunk-ace-header .splunk-dropdown-icon {\n\tbackground-repeat: no-repeat;\n\tcursor: pointer;\n\tdisplay: block;\n\tbackground-image: url(/en-US/static/img/skins/default/splIcons.gif);\n\tbackground-color: transparent;\n}\n\nheader.splunk-ace-header .splunk-dropdown-icon.splunk-triangle-1 {\n\twidth: 5px;\n\theight: 5px;\n\tbackground-position: -47px -367px;\n\tfloat: right;\n\tmargin: 10px 0 0 5px;\n}\n\nheader.splunk-ace-header .splunk-dropdown-icon.splunk-triangle-2 {\n\tposition: absolute;\n\tright: 10px;\n\ttop: 13px;\n\tbackground-position: -27px -367px;\n\ttext-indent: -10000px;\n\twidth: 6px;\n\theight: 6px;\n\toverflow: hidden;\n}\n\nheader.splunk-ace-header .splunk-navigation-header ul li a:hover,\nheader.splunk-ace-header .splunk-navigation-header ul li a.menuOpen {\n    background: url(/en-US/static/img/skins/default/overlay_white_28.png) repeat-x 0 0;\n}\n\nheader.splunk-ace-header .splunk-navigation-header ul.menu-list li {\n    float: none;\n}\n\nheader.splunk-ace-header #splunk-applicationsMenuActivator {\n    cursor: pointer;\n}\n\nheader.splunk-ace-header #splunk-applicationsMenuActivator:hover {\n    text-decoration: underline;\n}\n\ndiv.splunk-splMenu-primary.splunk-app-menu {\n    background: none !important;\n}\ndiv.splunk-splMenu-primary.splunk-app-menu ul {\n    background-color: transparent;\n    border: 1px solid #333;\n\n}\ndiv.splunk-splMenu-primary.splunk-app-menu ul li a {\n    z-index: 9999;\n    padding-top: 5px;\n    padding-bottom: 5px;\n    line-height: 14px;\n    color: #CCC;\n}\n\ndiv.splunk-splMenu-primary.splunk-app-menu .splunk-innerMenuWrapper {\n    background-color: black;\n}\n\ndiv.splunk-splMenu-primary.splunk-app-menu ul li a:hover {\n    background: #7b9059;\n    color: #fff;\n}\n\ndiv.splunk-splMenu-primary.splunk-app-menu ul .actionsMenuDivider {\n    margin: 0;\n    padding: 0;\n}'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 