
// THIS FILE IS PURPOSEFULLY EMPTY FOR R.JS COMPILER
// LOOK IN $SPLUNK_SOURCE/cmake/splunkjs_build/run.js FOR MORE INFO;
define("splunkjs/compiled/views", function(){});

define('views/Base',[
    'jquery',
    'backbone',
    'underscore'
],
function(
    $,
    Backbone,
    _
){
    return Backbone.View.extend({
        awake: true,
        touch: false,

        /**
         * A collection of Backbone.View utilities and conventions to assist with template compilation and cacheing, noop nested views and
         * className naming conventions. The general rule of thumb is to not override native Backbone.View methods but to compliment the core
         * API with simple and useful patterns.
         *
         * @param {Object} options {
         *      @param {String} moduleId (Optional) An id (commonly the requirejs module.id) that is formatted and appended as a className to
         *                                          the root view el. Added as an instance member if passed in via the constructor.
         *
         *      @param {String} template (Optional) An _.template that is passed through the compileTemplate method. Added as an instance member
         *                                          if passed including an additional compiledTemplate instance member (see compileTemplate for
         *                                          specification).
         *  }
         */
        initialize: function() {
            var render = this.render;

            this.children = {};
            this.render = _.bind(function() {
                var start = (new Date()).getTime(), 
                    end;
                if (this.awake) {
                    render.apply(this);
                } else {
                    this.touch = true;
                }
                end = (new Date()).getTime();
                if(this.options.instrument !== false) {
                    this.$el.attr('data-render-time', (end - start)/1000);
                }
                return this;
            }, this);

            if (this.options.moduleId) {
                this.moduleId = this.options.moduleId;
            }
            if (this.moduleId) {
                var className = this.cssNamespace();
                if (!this.options.dontAddModuleIdAsClass) {
                    this.$el.addClass(className);
                }
                this.$el.attr('data-view', this.moduleId);
            }

            if (this.options.template) {
                this.template = this.options.template;
            }
            if (this.template) {
                this.compiledTemplate = this.compileTemplate(this.template);
            }
        },
        /**
         * Replaces render noop proxy to original render routine. Additionally traverses
         * a special children attribute that consists of an object collection of views and
         * calls wake if that method exists.
         * 
         * @param {Object} options {
         *      @param {Boolean} syncRender (Optional) Call the standard (sync) render method over async (debouncedRender) variant.
         * }
         */
        wake: function(options) {
            options || (options = {});
            this.awake = true;
            if (this.touch) {
                this.touch = false;
                if (options.syncRender) {
                    this.render();
                } else {
                    this.debouncedRender();
                }
            }
            _.each(this.children, function(child) {
                if (_.isFunction(child.wake)) {
                    child.wake(options);
                }
            });
            return this;
        },
        /**
         * Stops any subsequent calls to render and proxies them to a noop routine. Additionally traverses
         * a special children attribute that consists of an object collection of views and calls sleep if
         * that method exists.
         */
        sleep: function() {
            this.awake = false;
            _.each(this.children, function(child) {
                if (_.isFunction(child.sleep)) {
                     child.sleep();
                }
            });
            return this;
        },

        // TEMPORARILY COMMENTING THESE OUT UNTIL WE HAVE TIME TO REFACTOR CONFLICTING SUBCLASSES

        /**
         * Shows this view, recursively showing all child views. Child views are shown
         * after this view is shown.
         * 
         * Do not override this method; override the onShow method instead.
         * 
         * @param {String} key (optional) A key representing a "reason" that this view
         * should be shown. This key should correspond to a key previously passed to the
         * hide method. The view is only shown after this method has been called with
         * all keys that were previously passed to the hide method.
         */
        //show: function(key) {
        //    // ensure key is a string
        //    key = (key != null) ? ("" + key) : "";
        //
        //    // we're already showing if no hideKeys are stored
        //    var hideKeys = this._hideKeys;
        //    if (!hideKeys) {
        //        return this;
        //    }
        //
        //    // delete the given key from hideKeys
        //    delete hideKeys[key];
        //
        //    // don't actually show if there are more hideKeys
        //    for (key in hideKeys) {
        //        if (hideKeys.hasOwnProperty(key)) {
        //            return this;
        //        }
        //    }
        //
        //    // delete hideKeys store
        //    this._hideKeys = null;
        //
        //    // show ourself before child views
        //    this.$el.show();
        //
        //    // child views are recursively shown in the onShow method
        //    this.onShow();
        //
        //    return this;
        //},

        /**
         * Hides this view, recursivly hiding all child views. Child views are hidden
         * before this view is hidden.
         * 
         * Do not override this method; override the onHide method instead.
         * 
         * @param {String} key (optional) A key representing a "reason" that this view
         * is being hidden. In order to show the view, the show method must be called
         * with all keys previously passed to this method.
         */
        //hide: function(key) {
        //    // ensure key is a string
        //    key = (key != null) ? ("" + key) : "";
        //
        //    // we're already hidden if previous hideKeys are stored
        //    // store additional key in hideKeys
        //    var hideKeys = this._hideKeys;
        //    if (hideKeys) {
        //        hideKeys[key] = true;
        //        return this;
        //    }
        //
        //    // create hideKeys store and store first key
        //    hideKeys = this._hideKeys = {};
        //    hideKeys[key] = true;
        //
        //    // hide child views before ourself
        //    // child views are recursively hidden in the onHide method
        //    this.onHide();
        //
        //    // hide ourself
        //    this.$el.hide();
        //
        //    return this;
        //},

        /**
         * Recursively shows all child views. Override this method with custom code that
         * should be run when this view is shown. Make sure to call the base
         * implementation when overriding.
         * 
         * This method is automatically called by the show method and should not be
         * called directly.
         */
        //onShow: function() {
        //    // recursively show child views
        //    _.each(this.children, function(child) {
        //        if (_.isFunction(child.show)) {
        //             child.show("views-Base-parent");
        //        }
        //    });
        //},

        /**
         * Recursively hides all child views. Override this method with custom code that
         * should be run when this view is hidden. Make sure to call the base
         * implementation when overriding.
         * 
         * This method is automatically called by the hide method and should not be
         * called directly.
         */
        //onHide: function() {
        //    // recursively hide child views
        //    _.each(this.children, function(child) {
        //        if (_.isFunction(child.hide)) {
        //             child.hide("views-Base-parent");
        //        }
        //    });
        //},

        /**
         * Returns true if this view is showing; false otherwise.
         */
        //isShowing: function() {
        //    // we're showing if there is no hideKeys store
        //    return (this._hideKeys == null);
        //},

        /**
         * Postpone the execution of render until after the input has stopped arriving.
         * Useful for assigning to model/collection change event listeners that should
         * only happen after the input has stopped arriving.
         */
        debouncedRender: function() {
            if (!this._debouncedRender) {
                this._debouncedRender = _.debounce(this.render, 0);
            }
            this._debouncedRender.apply(this, arguments);
        },
        /**
         * Similar to debouncedRender above, but for the reflow method
         */
        debouncedReflow: function() {
            if (!this._debouncedReflow) {
                this._debouncedReflow = _.debounce(this.reflow, 0);
            }
            this._debouncedReflow.apply(this, arguments);
        },
        /**
         * Compiles and memoizes an _.template string into a function that can be evaulated
         * for rendering.
         *
         * @param {String} templateStr An _.template string for compilation into a function.
         * @type {Function}
         * @return A function that can be evaluated for rendering, pass in a data object that
         * that has properties corresponding to the template's free variables.
         */
        compileTemplate: _.memoize(function(templateStr) {
            return _.template(templateStr);
        }),
        /**
         * Tailored for the requirejs module.id format converting into a safe and legal css 
         * class attribute. For example the following module id '/views/shared/SkidRow' 
         * would be converted to 'views-shared-skdrow'.
         */
        cssNamespace: function() {
            return (this.moduleId || '').toLowerCase().replace(/\//g, '-').replace(/\_/g, '').replace(/^views-/, '').replace(/-master$/, '');
        },
        /**
         * Generates a unique namespace that can be humanly cross-referenced to the view. 
         */
        uniqueNS: function() {
            return (this.moduleId || 'unidentified').toLowerCase().replace(/\//g, '-') + '-' + this.cid;
        },
        /**
         * Calling dispose on a Base view will recursively call disose() on  its heirarchy
         * of child views.  All associated event listeners on models and collections
         * will be removed.
         */
        dispose: function() {
            this.stopListening();
        },
        
        stopListening: function() {
            this.modelsOff(this.model);
            this.collectionsOff(this.collection);
            Backbone.View.prototype.stopListening.apply(this, arguments);
        },
        
        remove: function() {
            this.removeChildren();
            if (this._isAddedToDocument) {
                this.onRemovedFromDocument();
                this._isAddedToDocument = false;
            }
            this.stopListening();
            this.$el.remove();
            return this;
        },
        
        debouncedRemove: function(options) {
            options || (options = {});
            var defaults = {
                detach: false
            };
            _.defaults(options, defaults);
            if (options.detach) {
                this.$el.detach();
            }
            if (!this._debouncedRemove) {
                this._debouncedRemove = _.debounce(this.remove, 0);
            }
            this._debouncedRemove.apply(this, arguments);
            return this;
        },
        
        removeChildren: function() {
            _.each(this.children, function(child) {
                if (_.isArray(child)) {
                    _.each(child, function(view) {
                        view.remove();
                    });
                } else {
                    child.remove();
                }
            });
        },
        
        /**
         *  Helper function for deepDestroy, recursively calls off() on its model(s)
         */
        modelsOff: function (model) {
            if (model instanceof Backbone.Model) {
                _.isFunction(model.associatedOff) && model.associatedOff(null, null, this);
                model.off(null, null, this);
            } else {
                _(model).each(function(mod) {
                    _.isFunction(model.associatedOff) && model.associatedOff(null, null, this);
                    this.modelsOff(mod);
                }, this);
            }
            return this;
        },
        /**
         *  Helper function for deepDestroy, recursively calls off() on its collections(s)
         */
         collectionsOff: function(collection) {
            if (collection instanceof Backbone.Collection) {
                collection.off(null, null, this);
            } else {
                _(collection).each(function(coll) {
                    this.collectionsOff(coll);
                }, this);
            }
            return this;
        },

        /**
         * Helper function for removing the view from the DOM while a render occurs. If you call this on subviews in
         * a render function, jQuery will remove all of the subview's event listeners
         */
        detach: function() {
            if (this._isAddedToDocument) {
                this.onRemovedFromDocument();
                this._isAddedToDocument = false;
            }
            this.$el.detach();
        },

        // add instance methods for all commonly used jQuery attachment methods
        appendTo: function($container) { return this.attachToDocument($container, 'appendTo'); },
        prependTo: function($container) { return this.attachToDocument($container, 'prependTo'); },
        replaceAll: function($container) { return this.attachToDocument($container, 'replaceAll'); },
        insertAfter: function($container) { return this.attachToDocument($container, 'insertAfter'); },
        insertBefore: function($container) { return this.attachToDocument($container, 'insertBefore'); },

        /**
         * Attach the view to the given DOM element using the given method.
         * If afterward the view is attached to the document element, the onAddedToDocument method will be called.
         * If the view was already attached to the document element, and the given DOM element is different than
         * the view's current parent element, the onRemovedFromDocument method will be called first.
         *
         * Not meant to be called directly, only as a helper for the more specific attachment methods above.
         *
         * @param $container (DOM element or jQuery object)
         * @param attachmentMethod (a valid jQuery DOM attachment method name)
         */
        attachToDocument: function($container, attachmentMethod) {
            if(_.isString($container)) {
                throw new Error(attachmentMethod + ' does not support selectors or HTML strings');
            }

            // ensure the given $container parameter is a jQuery object
            $container = $($container);

            // if no container, abort
            if ($container.length === 0)
                return this;

            // get the raw DOM container
            var container = $container[0];

            // call onRemovedFromDocument if needed
            var oldParent = this.el.parentNode;
            if (oldParent && (oldParent !== container)) {
                if (this._isAddedToDocument) {
                    this.onRemovedFromDocument();
                    this._isAddedToDocument = false;
                }
            }

            // do the attachment
            this.$el[attachmentMethod]($container);

            // call onAddedToDocument if needed
            if (oldParent !== container) {
                if (this.isAttachedToDocument()) {
                    this._isAddedToDocument = true;
                    this.onAddedToDocument();
                }
            }

            return this;
        },

        /**
         * Called when this view is added to the document. Recursively calls
         * onAddedToDocument on all child views. Override this method with custom code
         * that should be run when this view is added to the document. Make sure to call
         * the base implementation when overriding.
         * 
         * This method is automatically called and should not be called directly.
         */
        onAddedToDocument: function() {
            var self = this;
            _.each(this.children, function(child) {
                if (_.isFunction(child.onAddedToDocument) && self.isAncestorOf(child) && !child._isAddedToDocument) {
                     child._isAddedToDocument = true;
                     child.onAddedToDocument();
                }
            });
        },

        /**
         * Called when this view is removed from the document. Recursively calls
         * onRemovedFromDocument on all child views. Override this method with custom
         * code that should be run when this view is removed from the document. Make
         * sure to call the base implementation when overriding.
         * 
         * This method is automatically called and should not be called directly.
         */
        onRemovedFromDocument: function() {
            var self = this;
            _.each(this.children, function(child) {
                if (_.isFunction(child.onRemovedFromDocument) && self.isAncestorOf(child) && child._isAddedToDocument) {
                     child.onRemovedFromDocument();
                     child._isAddedToDocument = false;
                }
            });
        },

        /**
         * Returns a boolean indicating whether the view is currently attached to the document element
         */
        isAttachedToDocument: function() {
            return $.contains(document.documentElement, this.el);
        },

        /**
         * Returns true if this view is an ancestor of the given view; false otherwise;
         * 
         * @param {Backbone.View} descendant A Backbone.View instance to test against.
         */
        isAncestorOf: function(descendant) {
            return descendant.el ? $.contains(this.el, descendant.el) : false;
        },

        /**
         * Returns true if this view is a descendant of the given view; false otherwise;
         * 
         * @param {Backbone.View} ancestor A Backbone.View instance to test against.
         */
        isDescendantOf: function(ancestor) {
            return ancestor.el ? $.contains(ancestor.el, this.el) : false;
        },

        /**
         * Instruct the view to re-flow itself in its current container.
         * This method doesn't do any actual work beyond calling reflow on all children.
         *
         * Override this method to do any work that is required when the view needs to adjust to its container size.
         * Make sure to call the base implementation when overriding.
         */
        reflow: function() {
            _(this.children).each(function(child) {
                _.isFunction(child.reflow) && child.reflow();
            });
        }

    });
});

define('views/shared/Modal',
    [
        'jquery',
        'underscore',
        'views/Base',
        'bootstrap.transition',
        'bootstrap.modal'
    ],
    function($,
            _,
            Base
            //bootstrap.transition
            //bootstrap.modal
            ) {
        var CLASS_NAME = 'modal fade',
            CLASS_MODAL_WIDE = 'modal-wide',
            HEADER_CLASS = 'modal-header',
            BODY_CLASS = 'modal-body',
            FOOTER_CLASS = 'modal-footer',
            HEADER_SELECTOR = "." + HEADER_CLASS,
            HEADER_TITLE_SELECTOR = HEADER_SELECTOR + " > h3",
            BODY_SELECTOR = "." + BODY_CLASS,
            BODY_FORM_SELECTOR = BODY_SELECTOR + " > div.form",
            FORM_HORIZONTAL = '<div class="form form-horizontal"></div>',
            FORM_HORIZONTAL_COMPLEX = '<div class="form form-horizontal form-complex"></div>',
            FORM_HORIZONTAL_JUSTIFIED = '<div class="form form-horizontal form-justified"></div>',
            FOOTER_SELECTOR = "." + FOOTER_CLASS,
            BUTTON_CANCEL = '<a href="#" class="btn cancel modal-btn-cancel pull-left" data-dismiss="modal">' + _('Cancel').t() + '</a>',
            BUTTON_BACK = '<a href="#" class="btn back modal-btn-back">' + _('Back').t() + '</a>',
            BUTTON_SAVE = '<a href="#" class="btn btn-primary modal-btn-primary pull-right">' + _('Save').t() + '</a>',
            BUTTON_DONE = '<a href="#" class="btn btn-primary modal-btn-primary pull-right" data-dismiss="modal">' + _('Done').t() + '</a>',
            BUTTON_DELETE = '<a href="#" class="btn btn-primary modal-btn-primary">' + _('Delete').t() + '</a>',
            BUTTON_NEXT = '<a href="#" class="btn btn-primary modal-btn-primary">' + _('Next').t() + '</a>',
            BUTTON_CONTINUE = '<a href="#" class="btn modal-btn-continue pull-left" data-dismiss="modal">' + _('Continue Editing').t() + '</a>',
            TEMPLATE = '\
                <div class="' + HEADER_CLASS + '">\
                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>\
                    <h3>&nbsp;</h3>\
                </div>\
                <div class="' +  BODY_CLASS + '">\
                </div>\
                <div class="' + FOOTER_CLASS + '">\
                </div>\
            ';

        // non-exported constants
        var KEY_CODES = {
                ENTER: 13
            },
            TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="password"], textarea';

        return Base.extend({
                className: CLASS_NAME,
                attributes: {
                    style: 'display:none',
                    tabIndex: -1

                },
                initialize: function() {
                    Base.prototype.initialize.apply(this, arguments);

                    var defaults = {
                        show: false,
                        keyboard: true,
                        backdrop: true
                    };
                    this.$el.modal(_.extend({}, defaults, _.pick(this.options, ['backdrop', 'keyboard', 'show', 'remote'])));
                    this.shown = false;

                    //when the hidden event is triggered the modal destroys itself
                    if (this.options.onHiddenRemove) {
                        this.on('hidden', this.remove, this);
                    }
                },
                //if you extend this class and need your own events object then you need to declare it like:
                // $.extend({}, Modal.prototype.events, {
                events: {
                    'show': function(e) {
                        if (e.target !== e.currentTarget) return;
                        this.trigger("show");
                    },
                    'shown': function(e) {
                        if (e.target !== e.currentTarget) return;
                        this.shown = true;
                        // check for any text inputs inside the dialog, focus the first one
                        var $textInputs = this.$(TEXT_INPUT_SELECTOR);
                        if($textInputs.length > 0) {
                            $textInputs.first().focus();
                        }
                        this.trigger("shown");
                    },
                    'hide': function(e) {
                        if (e.target !== e.currentTarget) return;
                        this.trigger("hide");
                    },
                    'hidden': function(e) {
                        if (e.target !== e.currentTarget) return;
                        this.shown = false;
                        this.trigger("hidden");
                    }
                },
                hide: function() {
                    this.$el.modal('hide');
                },
                show: function() {
                    this.$el.modal('show');
                },
                toggle: function() {
                    this.$el.modal('toggle');
                },
                remove: function() {
                    if (this.shown){
                        this.hide();
                    }
                    Base.prototype.remove.apply(this, arguments);
                }
            },
            {
                CLASS_NAME: CLASS_NAME,
                CLASS_MODAL_WIDE: CLASS_MODAL_WIDE,
                HEADER_CLASS: HEADER_CLASS,
                BODY_CLASS: BODY_CLASS,
                FOOTER_CLASS: FOOTER_CLASS,
                HEADER_SELECTOR: HEADER_SELECTOR,
                HEADER_TITLE_SELECTOR: HEADER_TITLE_SELECTOR,
                BODY_SELECTOR: BODY_SELECTOR,
                BODY_FORM_SELECTOR: BODY_FORM_SELECTOR,
                FOOTER_SELECTOR: FOOTER_SELECTOR,
                TEMPLATE: TEMPLATE,
                FORM_HORIZONTAL: FORM_HORIZONTAL,
                FORM_HORIZONTAL_COMPLEX: FORM_HORIZONTAL_COMPLEX,
                FORM_HORIZONTAL_JUSTIFIED: FORM_HORIZONTAL_JUSTIFIED,
                BUTTON_CANCEL: BUTTON_CANCEL,
                BUTTON_BACK: BUTTON_BACK,
                BUTTON_SAVE: BUTTON_SAVE,
                BUTTON_CONTINUE: BUTTON_CONTINUE,
                BUTTON_DELETE: BUTTON_DELETE,
                BUTTON_DONE: BUTTON_DONE,
                BUTTON_NEXT: BUTTON_NEXT,

                // class-level utility method for handling dialog behavior related to key events
                // currently only handles the enter key but could be extended to do more
                // @param event - the jQuery event object
                // @param handlers - a map of key event types to callbacks
                // @param context (optional) the context to use when firing the callback
                handleKeyboardEvent: function(event, handlers, context) {
                    var keyCode = event.which;
                    if(keyCode === KEY_CODES.ENTER && handlers.enter) {
                        var $target = $(event.target);
                        // if the currently focused element is any kind of text input,
                        // make sure to blur it so that any change listeners are notified
                        if($target.is(TEXT_INPUT_SELECTOR)) {
                            $target.blur();
                        }
                        handlers.enter.call(context || null);
                        event.preventDefault();
                    }
                    // we could handle other key events here
                }
            }
        );
    }
);

define('views/shared/controls/Control',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/Base'
],
function(
    $,
    _,
    Backbone,
    module,
    BaseView
){

    /**
     * The base Control class for all controls.
     *
     * When the value has changed (either through a change to the model, calling setValue or a user action), the control
     * dispatches a "change" event with the arguments (newValue, oldValue).
     */
    return BaseView.extend({
        moduleId: module.id,
        className: 'control',
        initialize: function(){
            BaseView.prototype.initialize.apply(this, arguments);
            
            var defaults = {
                    defaultValue: '',
                    enabled: true,
                    flag: false,
                    validate: false,
                    forceUpdate: false,
                    updateModel: true
            };
            _.defaults(this.options, defaults);

            this._value = this.options.defaultValue;

            if (this.model) {
                this.registerListeners();
                this.setValueFromModel(false);
            }
            return this;
        },
        /**
         * registerListeners. Override should there be additional change events that should trigger render or value updates.
         */
        registerListeners: function() {
            this.model.on('change:'+this.options.modelAttribute, this.setValueFromModel, this);
        },
        /**
         * Public value accessor
         */
        getValue: function(){
            return this._value;
        },
        getModelAttribute: function() {
            return this.options.modelAttribute;
        },
        /**
         * Set Value and Update Model,
         */
        setValue: function(value, render){
            var returnValue = this._setValue(value, render);
            if (this.options.updateModel)
                this.updateModel();
            return returnValue;
        },
        /**
         * Set Value. Does not update model.
         */
        _setValue: function(value, render, suppressEvent){
            value = this.normalizeValue(value);
            if (this._value !== value) {
                var oldValue = this._value;

                this._value = value;

                (render === false) || this.render(); // if render is undefined, render anyway.

                if (!suppressEvent)
                    this.trigger('change', value, oldValue);
            }
            return this;
        },
        /**
         * Override this method if the value needs to be normalized before being used.
         */
        normalizeValue: function(value) {
            return value;
        },
        /**
         * Unsets value from the model
         */
        unsetValue: function() {
            this.model.unset(this.getModelAttribute());
        },
        /**
         * Gets the value to use in the control from the model. The default behavior is to return the value
         * of the modelAttribute. Render is called except on initialize.
         */
        setValueFromModel: function(render) {
            this._setValue(this.model.get(this.options.modelAttribute), render);
            return this;
        },
        /**
         * Applies the value from the control to the model. Subclasses should call this in response to user
         * interaction
         */
        updateModel: function() {
            var updateOptions = {
                validate: this.options.validate,
                forceUpdate: this.options.forceUpdate
            };
            if (this.model) {
                return (this.model[this.options.save ? 'save' : 'set']
                    (this.getUpdatedModelAttributes(), updateOptions));
            }
            return true;
        },
        /**
         * Returns a dictionary of attribute key-value pairs to apply when updating the model.
         * Can be overridden by subclasses as needed.
         */
        getUpdatedModelAttributes: function() {
            var updatedAttrs = {};
            updatedAttrs[this.options.modelAttribute] = this._value;
            return updatedAttrs;
        }
    });

});

/**
 *   views/shared/delegates/Base
 *
 *   Desc:
 *     This a base class for other delegates.

 *   @param {Object} (Optional) options An optional object literal having one settings.
 *
 *    Usage:
 *       var p = new DelegateBase({el: {el}})
 *
 *    Options:
 *        el (required): The event delegate
 */


define('views/shared/delegates/Base',[
    'backbone'
],function(
    Backbone
){
    return Backbone.View.extend({
        dispose: function() {
            this.stopListening();
            return this;
        },
        
        // need to override remove, remove should only operate on DOM elements that the view owns,
        // delegate views do not own their root el so letting the superclass get called is not correct
        remove: function() {
            this.dispose();
            return this;
        }
    });
});
/**
 *   views/shared/delegates/Popdown
 *
 *   Desc:
 *     This class applies popdown menus and dialogs.

 *   @param {Object} (Optional) options An optional object literal having one settings.
 *
 *    Usage:
 *       var p = new Popdown({options})
 *
 *    Options:
 *        el (required): The dialog.
 *        arrow: jQuery selector or object for arrow that points up. Defaults to ".arrow".
 *        mode: menu (default) or dialog. Change to dialog to prevent clicks inside the dialog from closing the popdown.
 *        show: true or false (default). Open the menu on initialization.
 *        adjustPosition: true (default) or false. Adjust position will  keep the dialog within the screen margin.
 *        minMargin: Integer. The number of pixels between the edge of the screen and the dialog. Defaults to 20.
 *        ignoreClasses: [] array of HTML classes to ignore clicks inside of so that the popdown does not close
 *
 *    Methods:
 *        show: show the dialog (directly calling show should be avoided and should not be necessary).
 *        hide: hide the dialog.
 *        scrollToVisible: scrolls the page if necessary to show the entire dialog.
 */


define('views/shared/delegates/PopdownDialog',[
    'jquery',
    'underscore',
    'views/shared/delegates/Base'
],function(
    $,
    _,
    DelegateBase
){
    return DelegateBase.extend({
        initialize: function(){
            var defaults = {
                arrow: ".arrow",
                mode: "dialog",  // "menu" or "dialog"
                adjustPosition: true,
                minMargin: 20,
                allowPopUp: true,
                direction:'auto',
                zIndex:'auto',
                scrollContainer: window,
                ignoreClasses: []
            };

            _.defaults(this.options, defaults);
            this.isShown = false;
            
            this.addEventHandlers = _.bind(this.addEventHandlers, this);
            this.dialogClick = _.bind(this.dialogClick, this);

            // if this.$el doesn't already have an id, create a unique one (to be used in show())
            if(!this.$el.attr('id')) {
                this.$el.attr('id', 'dialog-' + this.cid);
            }
            
            if (this.options.show) this.show(this.options.show);
        },
        events: {
            'click': 'dialogClick'
        },
        arrow: function () {
            return this.$el.find(this.options.arrow).first();
        },
        scrollContainer: function () {
            if (!this.$scrollContainer) {
                this.$scrollContainer = $(this.options.scrollContainer);
            }
            return this.$scrollContainer;
        },
        toggle: function ($toggle) {
            this.trigger('toggle', $toggle);
            
            this[this.isShown ? 'hide' : 'show']($toggle);

            this.trigger('toggled', $toggle);

            return true;
        },
        show: function ($toggle) {
            this.trigger('show', $toggle);
            
            if (!this.isShown) {
                _.defer(this.addEventHandlers, $toggle);
            }
            if (this.options.zIndex != 'auto') {
                this.$el.css('zIndex', this.options.zIndex );
            }

            this.options.adjustPosition && $toggle && this.adjustPosition($toggle);
            this.isShown = true;
            this.$el.addClass('open').show();
            // add a data attribute to map the toggle to the open dialog, this is for automated testing
            $toggle.attr('data-dialog-id', this.$el.attr('id'));

            this.trigger('shown', $toggle);
        },
        hide: function () {
            if (!this.isShown) return false;

            this.trigger('hide');

            this.removeEventHandlers();
            this.isShown = false;
            this.$el.removeClass('open').hide();

            this.trigger('hidden');
        },
        addEventHandlers: function($toggle){
            $('html').on('mousedown.popdown.' + this.cid, this.bodyMouseDown.bind(this));
            $(window).on('keydown.' + this.cid, this.windowKeydown.bind(this));
            
            
            if (this.options.scrollContainer !== window) {
                this.scrollPosition = {top: this.scrollContainer().scrollTop(), left: this.scrollContainer().scrollLeft()};
                this.scrollContainer().on('scroll.' + this.cid, this.containerScroll.bind(this));
            }
            
            return this;
        },
        removeEventHandlers: function(){
            $('html').off('.' + this.cid);
            $(window).off('.' + this.cid);
            
            if (this.options.scrollContainer !== window) {
                this.scrollContainer().off('.' + this.cid);
            }
            
            return this;
        },
        dispose: function(){
            this.removeEventHandlers();
            DelegateBase.prototype.dispose.apply(this, arguments);
            return this;
        },
        measure: function($el, offsets){
            var measures = {};
            
            measures.width = $el.outerWidth();
            measures.halfWidth = measures.width / 2;
            measures.height = $el.outerHeight();
            measures.halfHeight = measures.height /2;
            if (offsets !== false) {
                measures.offset = $el.offset();
                measures.position = $el.position();
                measures.center = {
                    left: measures.offset.left + measures.halfWidth,
                    top: measures.offset.top + measures.halfHeight
                };
            }
            return measures;
        },
        adjustPosition: function ($toggle) {
            var dir = this.options.direction;
            this['adjustPosition' + dir.charAt(0).toUpperCase() + dir.slice(1)]($toggle);
        },
        adjustPositionAuto: function ($toggle) {
            this.$el.css({top: -9999, left: -9999, bottom: 'auto'});
            this.$el.show();
        
            var m = {}, //measurements
                shift = {left: 0, top:0}; //necessary corrections to fit in view
            var positionFromTop = true;
            
            m.toggle = this.measure($toggle);
            m.dialog = this.measure(this.$el);
            m.arrow = this.measure(this.arrow(), false);
            m.window = this.measure($(window), false);
            m.window.top =  $(window).scrollTop();
            m.window.bottom = m.window.height + $(window).scrollTop();
            
            // Compensate for different offset parents.
            m.dialogParent = {offset: this.$el.offsetParent().offset()};
            m.toggle.relativeOffset = {
                                left: m.toggle.offset.left - m.dialogParent.offset.left + m.toggle.halfWidth,
                                top: Math.floor(m.toggle.offset.top - m.dialogParent.offset.top)
                            };

            //Determine if the default centering need to be shifted left or right
            if (m.toggle.center.left < m.dialog.halfWidth + this.options.minMargin) { //Needs to be pushed right
                shift.left = (m.dialog.halfWidth - m.toggle.center.left) + this.options.minMargin;
            } else if (m.toggle.center.left + m.dialog.halfWidth + this.options.minMargin  > m.window.width) { //Needs to be pushed left
                shift.left = m.window.width - (m.toggle.center.left + m.dialog.halfWidth + this.options.minMargin);
            }
            shift.left=Math.round(shift.left);
            
            // Determine if there is enough room to pop down
            var popDownDialogBottom =  m.toggle.offset.top + m.toggle.height + m.dialog.height + this.options.minMargin;
            var popUpDialogTop =  m.toggle.offset.top - m.dialog.height -  this.options.minMargin;
            if (popDownDialogBottom > m.window.bottom && this.options.allowPopUp && popUpDialogTop > m.window.top ) {
                //Pop upward
                shift.top=-m.dialog.height - m.arrow.halfWidth;
                shift.bottom= m.toggle.height + m.arrow.halfWidth;
                this.$el.addClass('up');
                
                //If this hasn't been attached the body or some other element, set positionFromTop to false. It will be positioned from the bottom.
                //It's better to position from the bottom so dialogs that change height, like the timerangepicker, are correctly positioned.
                positionFromTop = this.attachDialogTo || this.$el.parent()[0] == $('body')[0];
            } else {
                //Pop downward
                shift.top= m.toggle.height;
                this.$el.removeClass('up');
                if (popDownDialogBottom > m.window.bottom) {
                    //Scroll
                    this.scrollContainer().scrollTop(this.scrollContainer().scrollTop() + popDownDialogBottom - m.window.bottom);
                    
                    //reset the relative offsets
                    m.toggle.offset = $toggle.offset();
                    m.toggle.relativeOffset.top = m.toggle.offset.top - m.dialogParent.offset.top;
                }
            }
            
            //Reset the position and center within the viewable area
            this.position = {
                 top:  positionFromTop ? shift.top + m.toggle.relativeOffset.top : 'auto',
                 left: m.toggle.relativeOffset.left,
                 marginLeft: - m.dialog.halfWidth + shift.left,
                 bottom: positionFromTop ? 'auto' : shift.bottom 
                };
            
            this.$el.css(this.position);
            this.arrow().css('marginLeft', 0 - m.arrow.halfWidth - shift.left);

            //Fix left corner rounding if necessary
            if (m.dialog.halfWidth - m.arrow.halfWidth - shift.left < 8) { //Falling off the left
                this.$el.css('borderTopLeftRadius', Math.max(m.dialog.halfWidth - m.arrow.halfWidth - shift.left, 0));
            } else { //Needs to be pushed left
                this.$el.css('borderTopLeftRadius', '');
            }

        },
        adjustPositionRight: function ($toggle) {
            this.$el.addClass('right');
            this.$el.css({top: -9999, left: -9999});
            this.$el.show();
        
            var m = {}, //measurements
                shift = {left: 0, top:0}, //necessary corrections
                calculateTop = function() {
                    return Math.round(shift.top) + m.toggle.relativeOffset.top - m.dialog.halfHeight + m.toggle.halfHeight;
                }.bind(this); 
            
            m.toggle = this.measure($toggle);
            m.dialog = this.measure(this.$el);
            m.arrow = this.measure(this.arrow(), false);
            m.window = this.measure($(window), false);
            m.window.top =  $(window).scrollTop();
            m.window.bottom = m.window.height + $(window).scrollTop();
            m.arrow.minMargin = 10;
            m.arrow.maxShift = m.dialog.halfHeight - m.arrow.halfHeight - m.arrow.minMargin;
            
            // Compensate for different offset parents.
            m.dialogParent = {offset: this.$el.offsetParent().offset()};
            m.toggle.relativeOffset = {
                                left: m.toggle.offset.left - m.dialogParent.offset.left + m.toggle.width,
                                top: Math.floor(m.toggle.offset.top - m.dialogParent.offset.top)
                            };

            //Determine if the default centering need to be shifted up or down
            if (m.toggle.center.top - m.window.top < m.dialog.halfHeight + this.options.minMargin) { //Needs to be down
                shift.top = (m.dialog.halfHeight - (m.toggle.center.top - m.window.top)) + this.options.minMargin;
            } else if (m.toggle.center.top + m.dialog.halfHeight+ this.options.minMargin  > m.window.bottom ) { //Needs to be pushed up
                shift.top = m.window.bottom - (m.toggle.center.top + m.dialog.halfHeight + this.options.minMargin);
            }
            
            //Make sure it's not partially hidden over the top of page
            if (calculateTop() < this.options.minMargin) {
                shift.top = shift.top + (this.options.minMargin - calculateTop());
            }
            
            //Determine if there is sufficient room to include the point
            if (shift.top > m.arrow.maxShift) { //Needs to be down
                shift.top -= shift.top - m.arrow.maxShift;
            } else if (-shift.top > m.arrow.maxShift) { //Needs to be pushed up
                shift.top -= shift.top+m.arrow.maxShift;
            }
            
            //Reset the position and center within the viewable area
            this.position = {
                 top: calculateTop(),
                 left: m.toggle.relativeOffset.left, marginLeft: m.arrow.halfWidth
                };
                
            
            this.$el.css(this.position);
            this.arrow().css('marginTop', 0 - m.arrow.halfHeight - shift.top);

        },
        containerScroll: function (e)  {
            var newScrollTop = this.scrollContainer().scrollTop(),
                newScrollLeft = this.scrollContainer().scrollLeft();
                
            this.position.top = this.position.top + (this.scrollPosition.top - newScrollTop);
            this.position.left = this.position.left + (this.scrollPosition.left  - newScrollLeft);
            this.$el.css(this.position);
                            
            this.scrollPosition = {top: newScrollTop, left: newScrollLeft};
        },
        bodyMouseDown: function (e) {
            var $target = $(e.target);
            
            //If the menu is already closed, don't do anything.
            if (!this.isShown) return;

            //Ignore clicks inside of the dialog.
            if ($.contains(this.$el[0], e.target) || e.target === this.$el[0]) {
                return;
            }
            
            //Ignore clicks on elements with classes specified in this.options.ignoreClasses
            for(var i = 0; i < this.options.ignoreClasses.length; i++){
                if ($target.closest("." + this.options.ignoreClasses[i]).length) {
                    return;
                }
            }

            this.hide(e);
        },
        dialogClick: function (e) {
            if (this.options.mode != "dialog") {
                this.hide();
            }
        },
        windowKeydown: function (e) {
            var escapeKeyCode = 27,
                enterKeyCode = 13;
            
            if (e.keyCode == escapeKeyCode)  {
                this.hide();
            }
            
            if (e.keyCode == enterKeyCode && !($.contains(this.$el[0], e.target) || e.target === this.$el[0]))  {
                this.hide();
            }
            
            return true;
        },
        pointTo: function($toggle) {
            if (!this.isShown) {
                this.show($toggle);
            } else {
                this.adjustPosition($toggle);
            }
        }
    });
});

/**
 *   views/shared/delegates/Popdown
 *
 *   Desc:
 *     This class applies popdown menus and dialogs.

 *   @param {Object} (Optional) options An optional object literal having one settings.
 *
 *    Usage:
 *       var p = new Popdown({options})
 *
 *    Options:
 *        el (required): The dialog and toggle container. Recommend that this is the offset container for the dialog.
 *        toggle: jQuery selector for the toggles defaults to "> .popdown-toggle, > dropdown-toggle".
 *        dialog: jQuery selector or object for the dialog defaults to "> .popdown-dialog,  > dropdown-menu".
 *        arrow: jQuery selector or object for arrow that points up. Defaults to ".arrow".
 *        mode: menu (default) or dialog. Change to dialog to prevent clicks inside the dialog from closing the popdown.
 *        show: true or false (default). Open the menu on initialization.
 *        adjustPosition: true (default) or false. Adjust position will  keep the dialog within the screen margin.
 *        minMargin: Integer. The number of pixels between the edge of the screen and the dialog. Defaults to 20.
 *        attachDialogTo: jQuery selector or object to attach the dialog element to, usually 'body'
 *                          this can be useful to avoid hidden overflow issues, but should be used with care since any
 *                          scoped CSS selectors or event delegate listeners will no longer work *
 *        ignoreClasses: [] array of HTML classes to ignore clicks inside of so that the popdown does not close
 *
 *    Methods:
 *        show: show the dialog (directly calling show should be avoided and should not be necessary).
 *        hide: hide the dialog.
 *        scrollToVisible: scrolls the page if necessary to show the entire dialog.
 */


define('views/shared/delegates/Popdown',[
    'jquery',
    'underscore',
    'views/shared/delegates/Base',
    'views/shared/delegates/PopdownDialog'
],function(
    $,
    _,
    DelegateBase,
    PopdownDialog
){
    return DelegateBase.extend({
        initialize: function(){
            var defaults = {
                toggle: "> .popdown-toggle, > .dropdown-toggle",
                dialog: "> .popdown-dialog, > .dropdown-menu",
                arrow: ".arrow",
                mode: "menu",  // "menu" or "dialog"
                adjustPosition: true,
                minMargin: 20,
                attachDialogTo: false,
                allowPopUp: true,
                scrollContainer: window,
                ignoreClasses: []
            };

            _.defaults(this.options, defaults);

            this.children = {};
            this.events = {};
            this.events["mousedown " + this.options.toggle] = "toggle";
            this.events["keydown " + this.options.toggle] = "keydownToggle";
            this.events["click " + this.options.toggle] = "clickToggle";
            this.delegateEvents(this.events);
            this.$activeToggle = this.$(this.options.toggle).first();
            

            if (this.options.show) this.show();
        },
        delegate: function () {
            if (!this.children.hasOwnProperty('delegate')) {
                var options = _.clone(this.options);
                options.el = (this.options.dialog instanceof $) ? this.options.dialog[0] : this.$(this.options.dialog)[0] ;
                
                if (_.isString(this.options.scrollContainer)) {                
                    this.options.scrollContainer = this.$activeToggle.closest(this.options.scrollContainer);
                }
                               
                options.scrollConter = (this.options.dialog instanceof $) ? this.options.dialog[0] : this.$(this.options.dialog)[0] ;
                this.children.delegate = new PopdownDialog(options);
                
                this.listenTo(this.children.delegate, 'toggle', this.hearToggle);
                this.listenTo(this.children.delegate, 'toggled', this.hearToggled);
                this.listenTo(this.children.delegate, 'show', this.hearShow);
                this.listenTo(this.children.delegate, 'shown', this.hearShown);
                this.listenTo(this.children.delegate, 'hide', this.hearHide);
                this.listenTo(this.children.delegate, 'hidden', this.hearHidden);
                if (this.options.attachDialogTo) {
                    $(this.options.attachDialogTo).append(this.children.delegate.el);
                }
            }
            return this.children.delegate;
        },
        toggle: function (e) {
            e.preventDefault();

            if ($(e.currentTarget).is('.disabled, :disabled')) return;

            this.delegate().toggle($(e.currentTarget));

            return true;
        },
        hearToggle: function ($toggle) {
            this.trigger('toggle', $toggle);
        },
        hearToggled: function ($toggle) {
            this.trigger('toggled', $toggle);
        },
        show: function () {
            this.delegate().show(this.$activeToggle);
        },
        hearShow: function ($toggle) {
            this.trigger('show', $toggle);

            $(window).on('resize.popdown.' + this.cid, this.windowResize.bind(this));
            this.$activeToggle.removeClass('active');
            this.$activeToggle = $toggle.addClass('active');
   
        },
        hearShown: function ($toggle) {
            this.trigger('shown', $toggle);
        },
        hide: function (e) {
            
            if (!this.delegate().isShown) return false;


            $(window).off('.' + this.cid);
    
            this.$activeToggle.removeClass('active');

            if ($.contains(this.children.delegate.el, $(':focus')[0])) {
                this.$activeToggle.focus();
            }
            this.children.delegate.hide();
        },
        clickToggle: function (e) {
            e.preventDefault();
        },
        keydownToggle: function (e) {
            var enterKeyCode = 13;
            if (e.keyCode == enterKeyCode)  {
                this.toggle(e);
            }
        },
        hearHide: function ($toggle) {
            this.trigger('hide', $toggle);

            this.$activeToggle.removeClass('active');
        },
        hearHidden: function ($toggle) {
            this.trigger('hidden', $toggle);
        },
        dispose: function(){
            this.children.delegate && this.children.delegate.remove();
            DelegateBase.prototype.dispose.apply(this, arguments);
            return this;
        },
        adjustPosition: function () {
            this.delegate();
            this.children.delegate.adjustPosition(this.$activeToggle);
        },
        windowResize: function (e) {
            if (this.children.delegate && this.children.delegate.isShown) this.adjustPosition(this.$activeToggle);
        },
        pointTo: function($activeToggle) {
            this.$activeToggle = $activeToggle;
            this.delegate().adjustPosition(this.$activeToggle);
        },
        remove: function() {
            DelegateBase.prototype.remove.apply(this);
            this.children.delegate && this.children.delegate.remove();
            if (this.children.delegate && this.options.attachDialogTo) {
                this.children.delegate.$el.remove();
            }
            $(window).off('resize.popdown.' + this.cid);
            $(window).off('.' + this.cid);
            return this;
        }
    });
});

define('views/shared/controls/SyntheticSelectControl',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/shared/controls/Control',
    'views/shared/delegates/Popdown'
],
function(
    $,
    _,
    Backbone,
    module,
    Control,
    Popdown
){
    /**
     * Synthetic Select dropdown a-la Bootstrap
     *
     * @param {Object} options
     *                        {Object} model The model to operate on
     *                        {String} modelAttribute The attribute on the model to observe and update on selection
     *                        {Object} items A one-level deep data structure having keys:
     *                                       label (textual display),
     *                                       value (value to store in model)
     *                                       icon (icon name to show in menu and button label)
     *                                       enabled (optional boolean, defaults to true, whether to enable the selection)
     *                                       (ie, {label: 'Foo Bar', value: 'foo', icon: 'bar'}).
     *                        {Object} groupedItems Optionally use if you want optgroup style dropdowns
     *                                 A list data structure whose elements are hashes keys:
     *                                       label (textual display),
     *                                       items see above
     *                        {String} help (Optional) Html to display in the bottom help section
     *                        {String} label (Optional) Html to display as the button label
     *                        {String} toggleClassName (Optional) Class attribute to add to the parent element
     *                        {String} menuClassName (Optional) Class attribute to add to the dialog element
     *                        {String} menuWidth (Optional) narrow, normal, or wide
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     *
     */

    return Control.extend({
        moduleId: module.id,
        className: 'control btn-group',
        keys: {
           UP_ARROW: 38,
           DOWN_ARROW: 40
        },
        initialize: function() {
            var defaults = {
                toggleClassName: '' ,
                menuClassName: '',
                descriptionPosition: 'right',
                label: '',
                popdownOptions: {el: this.el},
                html: ''
            };

            _.defaults(this.options, defaults);
            _.defaults(this.options.popdownOptions, defaults.popdownOptions);
            if (!this.options.items && this.options.groupedItems){
                this.options.items = [];


                if(!(this.options.groupedItems instanceof Array) || 
                    !(this.options.groupedItems[0].items instanceof Array) ||
                    _.isUndefined(this.options.groupedItems[0].items[0].value)){
                    throw new Error("Invalid groupedItems Input"); 
                }

                _.each(this.options.groupedItems, function(value, key){
                    _.each(value.items, function(item, index){
                        this.options.items.push(item);
                    }, this);
                }, this);
            }
            else if (this.options.items) {
                this.options.groupedItems = [];
                var group = {};
                group.label = '';
                group.items = this.options.items;
                this.options.groupedItems.push(group);
            }

            var modelAttribute = this.options.modelAttribute;
            if (modelAttribute) {
                this.$el.attr('data-name', modelAttribute);
            }
            
            Control.prototype.initialize.call(this, arguments);
            
            this.children.popdown = new Popdown(this.options.popdownOptions);
            this.children.popdown.on('shown', this.show.bind(this));
            this.children.popdown.on('hidden', this.hide.bind(this));
        },
        stopListening: function() {
            $(window).off('.' + this.cid);
            this.$menu && this.$menu.off('.' + this.cid);
            Control.prototype.stopListening.apply(this, arguments);
        },
        show: function(){
            this.$menu.find(".icon-check:visible").closest('a').focus();
            this.$menu.on('click.' + this.cid, 'a',this.click.bind(this));
            $(window).on('keydown.' + this.cid, this.keydown.bind(this));
            this.trigger('popdownShown');
        },
        hide: function(){
            $(window).off('.' + this.cid);
            this.$menu.off('.' + this.cid);
            this.trigger('popdownHidden');
        },
        disable: function(){
            this.options.enabled = false;
            this.$('a.dropdown-toggle').addClass('disabled');
        },
        enable: function(){
            this.options.enabled = true;
            this.$('a.dropdown-toggle').removeClass('disabled');
        },
        click: function(e) {
            var $currentTarget = $(e.currentTarget);
            if(!$currentTarget.hasClass('disabled')) {
                this.setValue($currentTarget.data('value'), true);
            }
            e.preventDefault();
        },
        keydown: function (e) {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)  {
                return true;
            }

            var $focused = $(':focus');
            var toggleFocused = false;
            var selectedItem = -1; 
            var optionLength = -1;
            var focusValue = $focused.data("value");
            
            if ($.contains(this.el, $focused[0])) {
                _.each(this.options.items, function(element, key){
                    element['value'] == focusValue? selectedItem = key : false;
                }, this);
            }
            
            if (e.keyCode === this.keys['DOWN_ARROW']) {
                if (selectedItem < this.options.items.length -1 ) {
                    this.$menu.find("[data-value=" + this.options.items[selectedItem + 1]['value'] + "]").focus();
                    return false;
                }
            } else if (e.keyCode === this.keys['UP_ARROW']) {
                if (selectedItem > 0 ) {
                    this.$menu.find("[data-value=" + this.options.items[selectedItem - 1]['value'] + "]").focus();
                    return false;
                } else {
                    this.$(".dropdown-toggle").focus();
                    return false;
                }
            } else if (
                        ((e.keyCode >= 48) && (e.keyCode <= 57))  || //number
                        ((e.keyCode >= 65) && (e.keyCode <= 90))  || //uppercase letter
                        ((e.keyCode >= 97) && (e.keyCode <= 122)) || //lowercase letter
                        ((e.keyCode >= 128) && (e.keyCode <= 165))   //extended letter
                    ) {
                    
                var found = false;
                this.$menu.find(" a").each(function() {
                    if (found) {return;}
                
                    var option = $(this);
                    var firstChar = option.text().replace(/^\s\s*/, '').substring(0, 1).toLowerCase(); 
                    var keyChar = String.fromCharCode(e.keyCode).toLowerCase();                      
                    if (keyChar == firstChar) {
                        option.focus();
                    }
                });
                
            }             
        },
        render: function() {

            var groupedItems = this.options.groupedItems;
            var items = this.options.items;

            if (!items || !items.length) {
                return this;
            }

            var item = _.find(items, function(element) {
                    return _.isEqual(this._value, element.value);
                }, this) || items[0];

            if (!this.el.innerHTML) {
                var template = this.compiledTemplate({
                        items: items,
                        groupedItems: groupedItems,
                        item: item,
                        options: this.options,
                        menuWidthClass: (this.options.menuWidth != "normal" ? "dropdown-menu-" + this.options.menuWidth : '')
                    });
                this.$el.html(template);
                

                //bind that values to the items
                this.$el.find('.dropdown-menu a').each(function(i, el) {
                    $(el).data('value', items[i].value);
                });
                
                this.$menu =  this.$('.dropdown-menu');
            }

            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames); 
            }

            //Hide or show the checkmarks
            this.$menu.find('a').each(function(i, el) {
                var $el = $(el);
                $el.find('.icon-check')[_.isEqual($el.data('value'), item.value) ? 'show' : 'hide']();
            });    
                                    
            //Update the toggle label
            this.$(".dropdown-toggle > .link-label").text(this.options.label + " " + item.label);
            this.$(".dropdown-toggle > i").attr('class',  "icon-" + item.icon);
            
            return this;
        },
        template: '\
            <a class="dropdown-toggle <%- options.toggleClassName %>" href="#">\
                <% if (item.icon) { %> <i class="icon-<%-item.icon%> icon-large"></i><% } %>\
                <span class="link-label"><%- options.label %> <%- item.label %></span><span class="caret"></span>\
            </a>\
            <div class="dropdown-menu dropdown-menu-selectable <%- options.menuClassName %> <%- menuWidthClass %> ">\
            <div class="arrow"></div>\
                <% _.each(groupedItems, function(group, key, fullItems) { %>\
                <ul>\
                <% _.each(group.items, function(element, index, list) { %>\
                    <li><a class="<%- element.enabled === false ? \"disabled\" : \"\"%>" href="#" data-value="<%- element.value %>">\
                        <i class="icon-check"></i>\
                        <% if (element.icon) { %> <i class="icon-<%-element.icon%> icon-large"></i><% } %>\
                        <%- element.label %>\
                        <% if (element.description && (options.descriptionPosition == "right")) { %> <span class="link-description"><%- element.description %></span><% } %>\
                        <% if (element.description && (options.descriptionPosition == "bottom")) { %> <span class="link-description-below"><%- element.description %></span><% } %>\
                    </a></li>\
                <% }); %>\
                </ul>\
                <% }); %>\
            </div>\
        '
    });
});

define('views/shared/controls/SyntheticRadioControl',
        [
            'jquery',
            'underscore',
            'module',
            'views/shared/controls/Control',
            'bootstrap.tooltip'
        ],
        function(
            $,
            _,
            module,
            Control
            // bootstrap tooltip
            ) {
    /**
     * Synthetic Radio Button Bar a-la iPhone
     *
     * @param {Object} options
     *                        {Object} model The model to operate on
     *                        {String} modelAttribute The attribute on the model to observe and update on selection
     *                        {Object} items An array of one-level deep data structures:
     *                                      label (textual display),
     *                                      value (value to store in model)
     *                                      icon (icon name to show in menu and button label)
     *                                      className (class attribute to be applied),
     *                                      tooltip  (Text to display in the tooltip)
     *                                 (ie, {label: 'Foo Bar', value: 'foo', icon: 'bar', className: 'foo'}).
     *                        {String} buttonClassName (Optional) Class attribute to each button element. Default is btn.
     *                        {Boolean} elastic Automatically assigns percentage width to children to completely fill the parent. Defaults to false.
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     */

    return Control.extend({
        className: 'control btn-group',
        moduleId: module.id,
        initialize: function(){
            var defaults = {
                buttonClassName: 'btn',
                elastic: false
            };

            _.defaults(this.options, defaults);


            // dunno if this should be the default but it was hard coded before so defaulting for legacy
            var itemDefaults = {iconSize: 'icon-large'};
            // attempt to default iconSize for each item
            _.each(this.options.items, function(el, i, list){
                _.defaults(el, itemDefaults);
            });
            
            if (this.options.modelAttribute) {
                this.$el.attr('data-name', this.options.modelAttribute);
            }
            
            Control.prototype.initialize.call(this, this.options);
            
        },
        events: {
            'click button': function(e) {
                !this.options.enabled || this.setValue( $(e.currentTarget).data('value'), true);
                e.preventDefault();
            }

        },
        disable: function(){
            this.options.enabled = false;
            this.$('button').addClass('disabled');
        },
        enable: function(){
            this.options.enabled = true;
            this.$('button').removeClass('disabled');
        },
        render: function(){
            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                                items: this.options.items,
                                buttonClassName: this.options.buttonClassName,
                                help: this.options.help,
                                elastic: this.options.elastic,
                                enabled: this.options.enabled,
                                modelAttribute: this.options.modelAttribute
                        });
                this.$el.html(template);
                this.$('[rel="tooltip"]').tooltip({animation:false});

                //bind that values to the items
                var items = this.options.items;
                this.$el.find('button').each(function(i, el) {
                    $(el).attr('data-value', items[i].value).data('value', items[i].value);
                });
            }

            var value = this._value;

            this.$el.find('button').each(function(i, el) {
                var $el = $(el);
                $el[_.isEqual($el.data('value'), value) ? 'addClass' : 'removeClass']('active');
            });

            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames);
            }

            return this;
        },
        template: '\
            <% _.each(items, function(item, index){ %>\
                <button name="<%- modelAttribute || "" %>" \
                        <% if (elastic) { %> style="width:<%- Math.round(100*(1/items.length)) %>%" <% } %> \
                        <% if (item.tooltip) { %> rel="tooltip" title="<%=item.tooltip%>" <% } \
                        %> class="<%=buttonClassName%> <%- item.className || "" %> <%- enabled ? "" : "disabled" %>">\
                    <% if (item.icon) { %> <i class="icon-<%-item.icon%> <%-item.iconSize%>"></i><% } %>\
                    <% if(item.label){ %> <%= item.label%> <%}%>\
                </button>\
            <% }) %>\
        '
    });
});

define('views/shared/controls/SyntheticCheckboxControl',
        [
            'underscore',
            'module',
            'views/shared/controls/Control',
            'splunk.util'
        ],
        function(
            _,
            module,
            Control,
            splunk_util
            ) {
    /**
     * Synthetic Checkbox
     *
     * @param {Object} options
     *                        {Object} model The model to operate on
     *                        {String} modelAttribute The attribute on the model to observe and update on selection
     *                        {Object} items An array of one-level deep data structures:
     *                                 label (textual display),
     *                                      value (value to store in model)
     *                                      icon (icon name to show in menu and button label)
     *                                 (ie, {label: 'Foo Bar', value: 'foo', icon: 'bar'}).
     *                        {Boolean} invertValue (Optional) If true, then a checked checkBox has a value of false and
     *                                  an unchecked has a value of true. This is useful for model attributes that denote a negative
     *                                  (ex. disabled). Defaults to false.
     *                        {String} checkboxClassName (Optional) Class attribute to the button element. Default is btn.
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     */

    return Control.extend({
        className: 'control',
        moduleId: module.id,
        initialize: function(){
            var defaults = {
                checkboxClassName: 'btn',
                defaultValue: false,
                label: ''
            };

            _.defaults(this.options, defaults);
            
            if (this.options.modelAttribute) {
                this.$el.attr('data-name', this.options.modelAttribute);
            }
            
            Control.prototype.initialize.call(this, arguments);
        },
        events: {
            'click label': function(e) {
                !this.options.enabled || this.setValue(!this._value);
                e.preventDefault();
            },
            'click .btn': function(e) {
                e.preventDefault();
            }

        },
        disable: function(){
            this.options.enabled = false;
            this.$('label').addClass('disabled');
            this.$('.btn').addClass('disabled');
        },
        enable: function(){
            this.options.enabled = true;
            this.$('label').removeClass('disabled');
            this.$('.btn').removeClass('disabled');
        },
        normalizeValue: function(value) {
            return splunk_util.normalizeBoolean(value) ? 1 : 0;
        },
        render: function(){
            var checked = this.options.invertValue ? !this.getValue() : this.getValue();

            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                                options: this.options,
                                checked: checked
                        });
                this.$el.html(template);
                
                if (!this.options.enabled) {
                    this.disable();
                }
            } else {
                this.$('.icon-check')[checked ? 'show' : 'hide']();
            }

            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames); 
            }

            return this;
        },
        template: '\
            <label class="checkbox">\
                  <a href="#" data-name="<%- options.modelAttribute || "" %>" class="<%- options.checkboxClassName %>"><i class="icon-check" <% if (!checked) {%>style="display:none"<% } %>></i></a>\
                  <%= options.label%>\
            </label>\
        '
    });
});

define('views/shared/controls/TextareaControl',['underscore', 'module', 'views/shared/controls/Control'], function(_, module, Control) {
    /**
     * Textarea with Bootstrap markup
     *
     * @param {Object} options
     *                        {String} modelAttribute The attribute on the model to observe and update on selection
     *                        {Object} model The model to operate on
     *                        {String} textareaClassName (Optional) Class attribute for the textarea
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     */

    return Control.extend({
        moduleId: module.id,
        initialize: function() {
            var defaults = {
                    textareaClassName: '',
                    placeholder: '',
                    useSyntheticPlaceholder: false
            };
            _.defaults(this.options, defaults);
           
            if (this.options.placeholder && !this.supportsNativePlaceholder()) {
                this.options.useSyntheticPlaceholder = true;
            }
            
            if (this.options.modelAttribute) {
                this.$el.attr('data-name', this.options.modelAttribute);
            }
            
            Control.prototype.initialize.call(this, arguments);
        },
        events: {
            'change textarea': function(e) {
                !this.options.enabled || this.setValue(this.$('textarea').val(), false);
                !this.options.enabled || this.updatePlaceholder();
            },
            'click .placeholder': function(e) {
                !this.options.enabled || this.$textarea.focus();
            },
            'keyup textarea': function(e) {
                this.updatePlaceholder();
            },
            'mouseup textarea': function(e) { //could result in pasted text
                this.updatePlaceholder();
            }

        },
        updatePlaceholder: function() {
           !this.options.useSyntheticPlaceholder || this.$placeholder[this.$textarea.val() === '' ? 'show' : 'hide']();
        },
        supportsNativePlaceholder: function() {
            var test = document.createElement('input');
            if (test.hasOwnProperty && test.hasOwnProperty('placeholder')){
                return true;
            }
            return false;
        },
        disable: function(){
            this.options.enabled = false;
            this.$textarea.hide();
            this.$disabledTextarea.show();
        },
        enable: function(){
            this.options.enabled = true;
            this.$textarea.show();
            this.$disabledTextarea.hide();
        },
        render: function() {
            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                        options: this.options,
                        value: this._value || ''
                    });
                this.$el.html(template);
                this.$textarea = this.$('textarea');
                this.$disabledTextarea = this.$('.uneditable-input');
                !this.options.useSyntheticPlaceholder || (this.$placeholder = this.$('.placeholder'));
            } else {
                this.$textarea.val(this._value);
                this.$disabledTextarea.text(this._value);
            }
            this.updatePlaceholder();
            
            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames);
            }

            return this;
        },
        template: '\
            <span class="uneditable-input uneditable-input-multiline <%= options.inputClassName %>" <% if(options.enabled){ %>style="display:none"<%}%>><%- value %></span>\
            <textarea type="text" name="<%- options.modelAttribute || "" %>" class="<%= options.textareaClassName %>" <% if(options.placeholder && !options.useSyntheticPlaceholder){ %>placeholder="<%- options.placeholder %>"<%}%> <% if(!options.enabled){ %>style="display:none"<%}%>><%- value %></textarea>\
            <% if (options.useSyntheticPlaceholder) { %> <span class="placeholder"><%- options.placeholder %></span><% } %>\
        '
    });
});

define('views/shared/controls/LabelControl',['underscore', 'module', 'views/shared/controls/Control', 'bootstrap.tooltip'], function(_, module, Control /*tooltip*/) {
    /**
     * Text Input with Bootstrap markup
     *
     * @param {Object} options
     *                        {String} modelAttribute The attribute on the model to observe
     *                        {Object} model The model to observe
     *                        {String} inputClassName (Optional) Class attribute for the input
     *                        {Boolean} multiline (Optional) if enabled, behaves more like a textarea: scroll and pre-wrap
     *                        {Boolean} breakword (Optional) If true, words will break. Good for uris.
     *                        {Object} defaultValue (Optional) If the modelAttribute in the model is undefined, then
     *                                 use this value to populate the input
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     *                        {String} tooltip (Optional) Text to display in the tooltip.
     */

    return Control.extend({
        moduleId: module.id,
        initialize: function() {
            var defaults = {
                inputClassName: 'input-label',
                defaultValue: 'label',
                iconSize: 'icon-large'
            };
         
            _.defaults(this.options, defaults);

            Control.prototype.initialize.call(this, arguments);

        },
        render: function() {
            var value = this._value || '';
            
            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                        options: this.options,
                        value: value
                    });

                this.$el.html(template);
                this.$span = this.$('span');
            } else {
                this.$span.text(value);
            }

            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames); 
            }
            
            if (this.options.modelAttribute) {
                this.$el.attr('data-name', this.options.modelAttribute);
            }

            if (this.options.tooltip) {
                this.$('.tooltip-text').tooltip({animation:false, title: this.options.tooltip});
            }
            return this;
        },
        template: '\
            <span class="<%= options.inputClassName %><% if(options.tooltip) { %> tooltip-text<% } %>">\
                <% if (options.icon) { %> <i class="icon-<%-options.icon%> <%-options.iconSize%>"></i><% } %>\
                <%- value %>\
            </span>\
        '
    });
});

define('views/shared/controls/TextControl',['underscore', 'module', 'views/shared/controls/Control'], function(_, module, Control) {
    /**
     * Text Input with Bootstrap markup
     *
     * @param {Object} options
     *                        {String} modelAttribute The attribute on the model to observe and update on selection
     *                        {Object} model The model to operate on
     *                        {String} inputClassName (Optional) Class attribute for the input
     *                        {String} placeholder (Optional) Placeholder text to display in the input if browser supports
     *                        {String} useSyntheticPlaceholder (Optional) If true, use the placeholder value
     *                        {Object} defaultValue (Optional) If the modelAttribute in the model is undefined, then
     *                                 use this value to populate the text input
     *                        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     */

    return Control.extend({
        moduleId: module.id,
        initialize: function() {
            var defaults = {
                    inputClassName: '',
                    placeholder: '',
                    prepend: false,
                    append: false,
                    useSyntheticPlaceholder: false,
                    trimLeadingSpace: true,
                    trimTrailingSpace: true
            };
            _.defaults(this.options, defaults);

            
            if (this.options.placeholder && !this.supportsNativePlaceholder()) {
                this.options.useSyntheticPlaceholder = true;
            }
            
            if (this.options.modelAttribute) {
                this.$el.attr('data-name', this.options.modelAttribute);
            }

            Control.prototype.initialize.call(this, arguments);
        },
        events: {
            'change input': function(e) {
                var inputValue = this.$input.val();
                if(this.options.trimLeadingSpace) {
                    inputValue = inputValue.replace(/^\s+/g, '');
                }
                if(this.options.trimTrailingSpace) {
                    inputValue = inputValue.replace(/\s+$/g, '');
                }
                this.setValue(inputValue, false);
                this.updatePlaceholder();
            },
            'click .placeholder': function(e) {
                this.$input.focus();
            },
            'keyup input': function(e) {
                this.updatePlaceholder();
                this.trigger("keyup", e, this.$input.val());
            },

            'mouseup input': function(e) { //could result in pasted text
                this.updatePlaceholder();
            }

        },

        updatePlaceholder: function() {
           !this.options.useSyntheticPlaceholder || this.$placeholder[this.$input.val() === '' ? 'show' : 'hide']();
        },
        supportsNativePlaceholder: function() {
            var test = document.createElement('input');
            return ('placeholder' in test);
        },
        disable: function(){
            this.$input.hide();
            this.$disabledInput.show();
        },
        enable: function(){
            this.$input.show();
            this.$disabledInput.hide();
        },
        render: function() {
            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                        options: this.options,
                        value: this._value || ''
                    });

                this.$el.html(template);
                this.$input = this.$('input');
                this.$disabledInput = this.$('.uneditable-input');
                !this.options.useSyntheticPlaceholder || (this.$placeholder = this.$('.placeholder'));
                this.options.prepend && this.$el.addClass('input-prepend').prepend(this.options.prepend);
                this.options.append && this.$el.addClass('input-append').append(this.options.append);
            } else {
                this.$input.val(this._value);
                this.$disabledInput.text(this._value);
            }
            this.updatePlaceholder();

            var additionalClassNames = this.options.additionalClassNames;
            if(additionalClassNames) {
                this.$el.addClass(additionalClassNames); 
            }

            return this;
        },
        // TODO: the `for` control-controlCid needs to be hooked up to the input with same `id`
        template: '\
        <span class="uneditable-input <%= options.inputClassName %>" <% if(options.enabled){ %>style="display:none"<%}%>><%- value %></span>\
        <input type="text" name="<%- options.modelAttribute || "" %>" class="<%= options.inputClassName %>" value="<%- value %>" <% if(options.placeholder && !options.useSyntheticPlaceholder){ %>placeholder="<%- options.placeholder %>"<%}%> <% if(!options.enabled){ %>style="display:none"<%}%>>\
            <% if (options.useSyntheticPlaceholder) { %> <span class="placeholder"><%- options.placeholder %></span><% } %>\
        '
    });
});

// footer nav
define('views/shared/controls/DateControl',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/shared/controls/Control',
    'jquery.ui.datepicker'
],
function(
    $,
    _,
    Backbone,
    module,
    Control,
    jqueryDatepicker
){
    /**
     * Synthetic Select drodpown a-la Bootstrap
     * 
     * @param {Object} options
     *        {Object} model The DateTime model to operate on
     *        {String} inputClassName (Optional) Class attribute for the input
     *        {String} additionalClassNames (Optional) Class attribute(s) to add to control
     */
    
    return Control.extend({
        moduleId: module.id,
        initialize: function() {
            var defaults = {
                    inputClassName: '',
                    help: 'MM/DD/YYYY'
            };
            _.defaults(this.options, defaults);
            Control.prototype.initialize.call(this, this.options);
            
            this.model.on('change', this.render, this);
        },
        events: {
            'change input[type=text]': function(e) {
                this.setValue(this.$('input').datepicker('getDate'), false);
            }
        },
        updateModel: function(){
            var updateOptions = {
                validate: this.options.validate,
                forceUpdate: this.options.forceUpdate
            };
            if (this.model) {
                return this.model.setMonDayYearFromJSDate(this._value, updateOptions);
            }
            return true;
        },
        render: function() {
            if (!this.el.innerHTML) {
                var template = _.template(this.template, {
                    options: this.options
                });
                
                this.$el.html(template);

                this.$('input').datepicker({
                    defaultDate: this.model.jsDate()
                });
                
                var additionalClassNames = this.options.additionalClassNames;
                if(additionalClassNames) {
                    this.$el.addClass(additionalClassNames); 
                }
            }

            this.$('input').datepicker('setDate',  this.model.jsDate());
            this.$('input').blur();

            return this;
        },
        template: '\
            <input type="text" size="8" class="<%= options.inputClassName %>" value=""/>\
        '
    });
});

define('views/shared/controls/ControlGroup',
    [
        'jquery',
        'underscore',
        'module',
        'backbone',
        'views/Base',
        'views/shared/controls/Control',
        'views/shared/controls/SyntheticSelectControl',
        'views/shared/controls/SyntheticRadioControl',
        'views/shared/controls/SyntheticCheckboxControl',
        'views/shared/controls/TextControl',
        'views/shared/controls/TextareaControl',
        'views/shared/controls/DateControl',
        'views/shared/controls/LabelControl',
        'bootstrap.tooltip'
    ],
    function
    (
        $,
        _,
        module,
        Backbone,
        Base,
        Control,
        SyntheticSelectControl,
        SyntheticRadioControl,
        SyntheticCheckboxControl,
        TextControl,
        TextareaControl,
        DateControl,
        LabelControl
        //tooltip
    )
{
    /**
     * Wrapper around a Control that adds a label and an error state
     *
     * @param {Object} options
     *                        {String} controlType The attribute on the model to observe and update on selection
     *                        {Object} controlOptions dictionary passed to the control
     *                        {Array or View} controls An array of dictionaries with types and options, and/or views, or a View
     *                        {String} label (Optional) the contents of the label tag
     *                        {Boolean} error (Optional) Whether or not the control group is in an error state
     *                        {Boolean} validate (Optional) Whether controls should use validation when setting model attributes,
     *                                                          defaults to false.
     *                        {Boolean} forceUpdate (Optional) Whether controls should force updates when setting model attributes,
     *                                                          defaults to false
     *                        {Boolean} enabled (Optional) Whether the control group should appear enabled, defaults to true
     *                        {String} tooltip (Optional) Text to display in the tooltip.
     */

    return Base.extend({
        className: 'control-group',
        moduleId: module.id,
        initialize: function() {
            var defaults = {
                    label: '',
                    controls:[],
                    error: false,
                    _errorMsg : "",
                    controlClass: '',
                    enabled: true
            };
            _.defaults(this.options, defaults);


            if (this.options.controls.length == 0) {
                this.options.controls = [{type: this.options.controlType, options: this.options.controlOptions}];
            }

            this.controlTypes= {
                    'SyntheticSelect': SyntheticSelectControl,
                    'SyntheticRadio': SyntheticRadioControl,
                    'SyntheticCheckbox': SyntheticCheckboxControl,
                    'Text': TextControl,
                    'Textarea': TextareaControl,
                    'Date': DateControl,
                    'Label': LabelControl
            };

            Base.prototype.initialize.call(this, arguments);

            if(!this.options.enabled) {
                this.$el.addClass('disabled');
            }

            // normalize controls to an array if it's a single item
            if(!_(this.options.controls).isArray()) {
                this.options.controls = [this.options.controls];
            }

            // create a list to hold the controls (in addition to the children dictionary) so that order can be preserved
            this.childList = [];

            _.each(this.options.controls, function(control, index) {
                // if the control is already a view, just add it to the children object
                if(control instanceof Backbone.View) {
                    this.children['child' + index] = control;
                    this.childList.push(control);
                }
                // otherwise construct a new view using the "type" and "options" fields
                else {
                    // allow a control to inherit the "validate", "forceUpdate" and "enabled" properties from the group options
                    var controlOptions = $.extend(
                        true,
                        {
                            validate: !!this.options.validate,
                            forceUpdate: !!this.options.forceUpdate,
                            enabled: !!this.options.enabled
                        },
                        control.options
                    );
                    var controlView = this.children['child' + index] = new this.controlTypes[control.type](controlOptions);
                    this.childList.push(controlView);
                }
            }, this);
            if(_.isArray(this.options.controls)){
                 _.each(this.options.controls, function(control, index) {
                    if(control.options && control.options.model){
                        control.options.model.on('attributeValidated:' + control.options.modelAttribute, function(isValid, key, error){
                            this.error(!isValid);
                        }, this);
                    }
                 },this);
            }
            if(this.options.controlOptions && (this.options.controlOptions.model instanceof Backbone.Model)) {
                if(!_.isArray(this.options.controlOptions)) {
                    this.options.controlOptions.model.on('attributeValidated:' + this.options.controlOptions.modelAttribute, function(isValid, key, error){
                        this.error(!isValid);
                    }, this);
                }
            }
        },
        events: {
            'click a.tooltip-link': function(e) {
                e.preventDefault();
            }
        },
        render: function() {
            if(!this.el.innerHTML) {
                var template = _.template(this.template, {
                    _: _,
                    controlCid: this.children.child0.cid,
                    label: this.options.label,
                    help: this.options.help,
                    controlClass: this.options.controlClass,
                    helpClass: this.options.helpClass,
                    tooltip: this.options.tooltip
                });
                this.$el.html(template);

                if (this.options.tooltip) {
                    this.$('.tooltip-link').tooltip({animation:false, title: this.options.tooltip});
                }

                _.each(this.childList, function(child) {
                    this.$('.controls').append(child.render().el);
                }, this);
                if (this.options.help) {
                    this.$('.controls').append(this.$('.help-block')); //move the help block back to the end
                }
            }

            // TODO [JCS] How come this is coming from options and not from an internal variable set in error()?
            this.error(this.options.error);

            return this;
        },
        hide: function() {
            this.$el.hide();
        },
        show: function() {
            this.$el.show();
        },
        getModelAttributes: function() {
            var attrs = [];
            _.each(this.childList, function(child) {
                attrs.push(child.getModelAttribute());
            }, this);
            return attrs;
        },
        error: function(state, errorMsg) {
            state ? this.$el.addClass("error") : this.$el.removeClass("error");

            // Store the error message internally. For now, we aren't displaying it.
            this._errorMsg = errorMsg;
            return this;
        },
        getAllControls: function() {
            return _(this.children).filter(function(child) { return child instanceof Control; });
        },
        // TODO: the `for` control-controlCid needs to be hooked up to the input with same `id`
        template: '\
                <label class="control-label" for="control-<%- controlCid %>">\
                <%- label %>\
                <% if (tooltip) { %>\
                    <a href="#" class="tooltip-link"><%- _("?").t() %></a>\
                <% } %>\
                </label>\
                <div class="controls <%- controlClass %>">\
                <% if (help) { %> <span class="help-block <%- helpClass %>"><%= help %></span><% } %>\
                </div>\
                \
        '
    });
});

/**
 *   views/shared/delegates/StopScrollPropagation
 *
 *   Desc:
 *     This class prevents the user from scrolling the page when scrolling a div.

 *   @param {Object} (Optional) options An optional object literal having one settings.
 *
 *    Usage:
 *       var p = new StopScrollPropagation({options})
 *
 *    Options:
 *        el (required): The event delegate.
 *        selector: jQuery selector for the scrolling elements. If not provided, all mousewheel events in the el will not propagate.
 *
 */


define('views/shared/delegates/StopScrollPropagation',['jquery', 'underscore', 'views/shared/delegates/Base'], function($, _, DelegateBase) {
    return DelegateBase.extend({
        initialize: function(){
            var defaults = {
                selector: ""
            };
            _.defaults(this.options, defaults);

            this.events = {};
            this.events["mousewheel " + this.options.selector] = "mousewheel";
            this.events["DOMMouseScroll " + this.options.selector] = "mousewheel";
            this.delegateEvents(this.events);
        },
        mousewheel: function (e) {
            var delta = -e.originalEvent.wheelDelta || e.originalEvent.detail* 20;
            e.currentTarget.scrollTop += delta;
            e.stopPropagation();
            e.preventDefault();
        }

    });
});
/**
 *   views/shared/delegates/TextareaResize
 *
 *   Desc:
 *     This class applies auto resizing to textareas.  Textareas will resize as input changes until it reaches the maximum
 *     number of lines (specified in options, defaults to 5), after which the textarea will scroll.

 *   @param {Object} (Optional) options An optional object literal having non-required settings.
 *
 *    Usage:
 *       var t = new Splunk.TextareaResize({ options array })
 *
 *    Options:
 *        maxLines: (int) number to indicate the maximum lines to expand to.  ex: 5 (limits expansion to 5 lines, scroll after)
 *
 *    Methods:
 *        resizeTextarea: If the view updates the content, it needs to call resizeTextarea().
 *
 *
 *    ***NOTE***: this is a port and modification of the Elastic plugin for jquery.  The original plugin's page can be found here:  http://www.unwrongest.com/projects/elastic/
 */
define('views/shared/delegates/TextareaResize',[
    'jquery',
    'views/shared/delegates/Base',
    'underscore',
    'splunk.logger'
],
function(
    $,
    DelegateBase,
    _,
    sLogger
){
    return DelegateBase.extend({
      maxHeightMultiple: 5,
      maxHeight: null,
      lineHeight: null,
      minHeight: null,
       initialize: function(){

            this.logger = sLogger.getLogger("textarea_resize.js");

            this.content = null;
            this.shadow = null;

            //defaults
            var defaults = {
                maxLines : this.maxHeightMultiple
            };

            _.defaults(this.options, defaults);

            this.lineHeight = parseInt(this.$el.css('lineHeight'),10) || parseInt(this.$el.css('fontSize'),10) + 1 || 20;
            this.minHeight = this.options.minHeight || this.options.lineHeight ;
            this.maxHeight = this.options['maxLines'] * this.lineHeight;

            // Create shadow div that will be identical to the textarea, used for measuring height changes
            this._createShadow();

            //fire off the first one to resize
            this.resizeTextarea();

            //Non element event handlers
            $(window).on('resize', this.resizeTextarea.bind(this));

       },
       /**
        *   function to set up event handles.
        */
       events:{
            "focus" : "_startObserving",
            "blur" : "_stopObserving",
            "keyup" : "resizeTextarea"
       },
       /**
        *   create a shadow div (or twin) of the textarea. we'll use this to measure how tall the textarea should be by copying the content from the
        *   textarea into the div and then measure it
        */
       _createShadow: function() {
            if ( !this.shadow ) {
                //style attributes to copy from the textarea into the shadow div
                var styleAttrs = new Array('paddingTop','paddingRight','paddingBottom','paddingLeft','fontSize','lineHeight','fontFamily','fontWeight', 'wordWrap','whiteSpace','borderLeftWidth','borderLeftColor','borderLeftStyle','borderRightWidth','borderRightColor','borderRightStyle','borderTopWidth','borderTopColor','borderTopStyle','borderBottomWidth','borderBottomColor','borderBottomStyle','boxSizing');

                //create the shadow div (twin)
                this.shadow = $('<div class="shadowTextarea"></div>').css({'position': 'absolute','left':'-9999px','top':'-9999px', 'marginRight' : "-3000px"}).appendTo(this.$el.parent());

                if ( $.browser.mozilla && $.browser.version.substr(0,3) < "1.9" ){ // this is a fix for a bug in ff2
                    this.shadow.css('position','fixed');
                }


                //    copy each of the attribute specified in styleAttributes from the textarea onto the shadow div
                var styles= {};
                _.each(styleAttrs, function(attr){
                    var value = this.$el.css(attr);
                    styles[attr] = (value == "pre") ? "normal" : value; // white-space cannot be pre, as IE likes to think it is.
                }, this);
                this.shadow.css(styles);

                this._adjustShadowWidth();
            }
       },
       /**
        *   function to set the shadow div's width to the textarea width
        */
       _adjustShadowWidth: function() {
          if ( this.shadow ) {
                this.shadow.width(this.$el.width());
          }
       },
       /**
        *   function to actually do the resizing
        */
       resizeTextarea: function() {
           if (this.$el.val() != this.content) {
               this.content = this.$el.val();

               //creating an empty div with the contetns of the input allows us to encode the HTML entities.
               var textareaContent = $('<div/>')
                                .text(this.content).html()
                                .replace(/\n/g, '<br />')
                                + "<span class=''> </span>";

                //set shadow div to have same contents as searchbar
               this.shadow.html(textareaContent);
           }

           //if the height of the two twins is different by more than 3 px.
           this._adjustShadowWidth();
           if(Math.abs(this.shadow.height() - this.$el.height()) > 3){
                var newHeight = this.shadow.height();

                if ( newHeight >= this.maxHeight )
                    this._setHeight(this.maxHeight, 'auto');
                else if ( newHeight <= this.minHeight )
                    this._setHeight(this.minHeight, 'hidden');
                else
                    this._setHeight(newHeight, 'hidden');
                }

        },
        /**
         *  function to set the height of the textarea
         */
        _setHeight: function(height, overflow) {
            var curratedHeight = Math.floor(parseInt(height,10)) - 1; // this seems to be off by 1px for some reason
            if(this.$el.height() != curratedHeight){
                this.$el.height(curratedHeight);
                this.$el.css('overflow', overflow);
            }
        },
        /**
         *  function to observe textarea for changes while focused (polling)
         */
        _startObserving: function() {
            this.timer = setInterval(function(){
                this.resizeTextarea();
            }.bind(this), 200);
        },
        /**
         *  function to cancel observing on textarea blur
         */
        _stopObserving: function(){
            clearInterval(this.timer);
        },
         /**
        *  function to find out if there is more than one line of text.
        */
        isMultiline: function() {
            var lineCount = Math.round(this.$el.height() / this.lineHeight) ;
            return (lineCount > 1);
        },
        remove: function() {
            DelegateBase.prototype.remove.apply(this);
            $(window).off('resize', this.resizeTextarea);
            return this;
        }
    });
});

























define('helpers/FlashMessagesHelper',
    [
        'jquery',
        'underscore',
        'models/FlashMessage',
        'util/splunkd_utils'
    ],
    function($, _, FlashMessageModel, splunkDUtils) {

        /**
         * @param flashMessagesCollection - the collection to use as the target for messages
         * @param options {Object} {
         *     removeDuplicates {Boolean} - (optional) whether to dedup messages with the same content, defaults to false
         *     postProcess {Function} - (optional) a function to perform cleanup of the messages before they are placed in the collection
         *         the list of FlashMessage models will be passed as the only argument (duplicates will already be removed if enabled)
         *         the return value will become the contents of the FlashMessages collection
         * }
         * @constructor
         */

        var FlashMessagesHelper = function(flashMessagesCollection, options) {
            this.options = options || {};
            this.defaults = $.extend(true, {}, this.options);
            
            _.defaults(this.defaults, {
                removeDuplicates: true
            });
            
            if (_.isUndefined(flashMessagesCollection)) {
                throw "FlashMessagesHelper must be created with a valid FlashMessages collection";
            }
            this.flashMessagesCollection = flashMessagesCollection;
            // registered is a dictionary, indexed by model/collection cid
            // each entry is an object containing the model/collection itself,
            //      and (optionally) a whitelist of message types to broadcast
            this.registered = {};
            this.clientModelMessages = {};
            this.serverModelMessages = {};
            this.generalMessages = {};
        };

        FlashMessagesHelper.prototype = {
            // whitelist is optional, it should be a list of message types that should be broadcasted
            // if whitelist is omitted, all messages will be broadcasted
            register: function(obj, whitelist) {
                this.registered[obj.cid] = { instance: obj };
                if(whitelist) {
                    this.registered[obj.cid]['whitelist'] = _(whitelist).isArray() ? whitelist : [whitelist];
                }
                obj.on('serverValidated', _.debounce(this.serverValidationHandler, 0), this);
                obj.on("validated", _.debounce(this.clientValidationHandler, 0), this);
            },
            unregister: function(obj) {
                obj.off(null, null, this);
                delete this.clientModelMessages[obj.cid];
                delete this.serverModelMessages[obj.cid];
                delete this.registered[obj.cid];
            },
            destroy: function() {
                var registeredObjects = _(this.registered).pluck('instance');
                _(registeredObjects).each(function(obj) { this.unregister(obj); }, this);
            },
            clientValidationHandler: function(isValid, model, invalidAttrs) {
                this.clientModelMessages[model.cid] = invalidAttrs;
                this.updateFlashMessageCollection();
            },
            serverValidationHandler: function(isValid, model, messages) {
                this.serverModelMessages[model.cid] = messages;
                this.updateFlashMessageCollection();
            },
            /**
             * Manually add a message to the Flash Messages Collection. Use this if you want to display a message
             * that isn't associated with a model
             *
             * @param id - the caller must generate a unique ID for the message
             * @param message
             *              - type {string} The type of message (splunkDUtils.ERROR | splunkDUtils.WARNING | splunkDUtils.INFO)
             *              - html {string} The message text
             */
            addGeneralMessage: function(id, message) {
                this.generalMessages[id] = message;
                this.updateFlashMessageCollection();
            },
            /**
             * Remove a message from the Flash Messages Collection that was previously added via addMessage.
             *
             * @param id - the caller generated id used in the addMessage call
             */
            removeGeneralMessage: function(id) {
                if (_(this.generalMessages).has(id)) {
                    delete this.generalMessages[id];
                    this.updateFlashMessageCollection();
                }
            },

            /**
             * Returns the number of general messages
             *
             * @return {Number}
             */
            getGeneralMessagesSize: function() {
                return _(this.generalMessages).size();
            },

            /**
             * Returns the number of client validation messages
             *
             * @return {Number}
             */
            getClientModelMessagesSize: function() {
                return _(this.clientModelMessages).size();
            },

            /**
             * Returns the number of server messages
             *
             * @return {Number}
             */
            getServerModelMessagesSize: function() {
                return _(this.serverModelMessages).size();
            },

            /**
             * Update the flash message collection when the clientMessages, serverMessages or generalMessages change
             */
            updateFlashMessageCollection: function() {
                var clientMessages = [], serverMessages = [], generalMessages = [];
                _(this.clientModelMessages).each(function(clientMsgs) {
                    _(clientMsgs).each(function(msg) {
                        clientMessages.push(new FlashMessageModel({ type: splunkDUtils.ERROR, html: msg }));
                    }, this);
                }, this);
                _(this.serverModelMessages).each(function(serverMsgs, cid) {
                    var whitelist = this.registered[cid] ? this.registered[cid].whitelist : null;
                    _(serverMsgs).each(function(msg) {
                        if(!whitelist || _(whitelist).contains(msg.type)) {
                            serverMessages.push(new FlashMessageModel({
                                type: splunkDUtils.normalizeType(msg.type),
                                // make sure to HTML-escape here, since these messages are coming from the server
                                html: _.escape(msg.message)
                            }));
                        }
                    }, this);
                }, this);
                _(this.generalMessages).each(function(msg) {
                    generalMessages.push(new FlashMessageModel({
                        type: splunkDUtils.normalizeType(msg.type),
                        html: msg.html
                    }));
                }, this);
                var allMessages = _.union(clientMessages, serverMessages, generalMessages);
                if (this.defaults.removeDuplicates) {
                    allMessages = _(allMessages).uniq(function(msg) { return msg.get('html'); });
                }
                if (this.defaults.postProcess) {
                    allMessages = this.defaults.postProcess(allMessages);
                }
                this.flashMessagesCollection.reset(allMessages);
            }
        };
    return FlashMessagesHelper;
});

define('views/shared/FlashMessages',
    [
        'underscore',
        'backbone',
        'views/Base', 
        'collections/FlashMessages',
        'helpers/FlashMessagesHelper',
        'module'
    ], 
    function(_, Backbone, Base, FlashMessagesCollection, FlashMessagesHelper,module) {
        return Base.extend({
            moduleId: module.id,
            className: 'alerts',
           /**
            * @param {Object} options {
            *     model: {
            *         <name>: <model to be registered>
            *         ....
            *     },
            *     collection: {
            *         <name>: <collection to be registered>
            *         ....
            *     }
            * }
            */
            initialize: function(options){
                Base.prototype.initialize.call(this, options);                
                this.flashMsgCollection = new FlashMessagesCollection();
                this.flashMsgHelper     = new FlashMessagesHelper(this.flashMsgCollection, this.options.helperOptions);
                this.flashMsgCollection.on('add remove reset',this.render, this);
                
                if (this.model instanceof Backbone.Model){
                    this.flashMsgHelper.register(this.model, this.options.whitelist);
                    
                    //see if we already have errors in the model.error
                    if (this.model.error && this.model.error.get("messages")){
                        this.flashMsgHelper.serverValidationHandler(true, this.model, this.model.error.get("messages"));
                    }     
                } else {
                    _(this.model).each(function(model, k) {
                        this.flashMsgHelper.register(model, this.options.whitelist);
                        
                        //see if we already have errors in the model.error
                        if (model.error && model.error.get("messages")){
                            this.flashMsgHelper.serverValidationHandler(true, model, model.error.get("messages"));
                        }  
                    },this);       
                }
                
                if (this.collection instanceof Backbone.Collection) {
                    this.flashMsgHelper.register(this.collection, this.options.whitelist);
                    this.collection.each(function(model){
                        this.flashMsgHelper.register(model, this.options.whitelist);
                    },this);
                } else {
                    _(this.collection).each(function(collection){
                        this.flashMsgHelper.register(collection, this.options.whitelist);
                        collection.each(function(model){
                            this.flashMsgHelper.register(model, this.options.whitelist);
                        },this);
                    },this);
                }
            },
            /**
             * Listen to validation events from a given object
             *
             * @param obj - the object to listen on
             * @param whitelist (optional) - the array of event types to listen for. If ommitted, then we listen to all events
             */
            register: function(obj, whitelist) {
                this.flashMsgHelper.register(obj, whitelist);
            },
            /**
             * Stop listening to validation events from a given object
             *
             * @param obj - the object to stop listen to
             */
            unregister: function(obj) {
                this.flashMsgHelper.unregister(obj);
            },
            remove: function() {
                this.flashMsgCollection.off(null,null, this);
                this.flashMsgHelper.destroy();
                return Base.prototype.remove.apply(this, arguments);
            },
            render: function() {
                this.$el.empty();
                this.$el.append(this.compiledTemplate({ flashMessages: this.flashMsgCollection }));
                (!this.flashMsgCollection.length) ? this.$el.hide() : this.$el.show();
                return this;
            },
            template: '\
                <% flashMessages.each(function(flashMessage){ %> \
                    <div class="alert alert-<%- flashMessage.get("type") %>">\
                        <i class="icon-alert"></i>\
                        <%= flashMessage.get("html") %>\
                    </div>\
                <% }); %> \
            '
        });
    }
);
