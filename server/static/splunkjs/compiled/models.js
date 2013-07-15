
// THIS FILE IS PURPOSEFULLY EMPTY FOR R.JS COMPILER
// LOOK IN $SPLUNK_SOURCE/cmake/splunkjs_build/run.js FOR MORE INFO;
define("splunkjs/compiled/models", function(){});

/**
 * A base collection with some generic useful methods/behaviors
 *
 * TODO: lots of repeated code here and in the base model for broadcasting errors, safe fetch, and the fetch data model
 *       consider one or more mixins
 *
 * TODO: potential memory leaks when binding to events on the fetchData model, do we need a hook for disposing of collections?
 */

define('collections/Base',
    [
        'jquery',
        'underscore',
        'backbone',
        'mixins/xhrmanagement',
        'models/Base',
        'splunk.util',
        'util/splunkd_utils'
    ],
    function($, _, Backbone, xhrmanagement, Base, splunkUtils, splunkDUtils) {
        var BaseCollection = Backbone.Collection.extend({
            initialize: function(models, options) {
                Backbone.Collection.prototype.initialize.apply(this, arguments);
                this.fetchData = (options && options.fetchData) ? options.fetchData : new Base();
                this.fetchData.on('change', _.debounce(function() { this.safeFetch(); }, 0), this);
                this.associated = this.associated || {};
                this.on('sync', this._onsync, this);
                this.on('error', this._onerror, this);
                this.on('reset', this.previousModelsOff, this);
            },
            fetch: function(options) {
                // merge the contents of the fetchData model into options.data
                var mergedOptions = $.extend(true, {}, {data: this.fetchData.toJSON()}, options);
                this.fetchXhr = Backbone.Collection.prototype.fetch.call(this, mergedOptions);
                // on successful fetch, handle any calls to safeFetch that came in while we were in-flight
                var that = this;
                this.fetchXhr.done(function() {
                    if(that.touched) {
                        that.safeFetch.apply(that, that.touched);
                    }
                });
                return this.fetchXhr;
            },
            _onerror: function(collection, response, options) {
                var messages = splunkDUtils.xhrErrorResponseParser(response, this.id);
                this.trigger('serverValidated', false, this, messages);
            },
            _onsync: function(collection, response, options) {
                var messages  = this.parseSplunkDMessages(response),
                    hasErrors = _(messages).any(function(message) {
                        return (message.type === splunkDUtils.ERROR || message.type === splunkDUtils.FATAL);
                    });
                this.trigger('serverValidated', !hasErrors, this, messages);
            },
            parseSplunkDMessages: function(response) {
                if(!response) {
                    return [];
                }
                return splunkDUtils.parseMessagesObject(response.messages);
            },
            deepOff: function() {
                xhrmanagement.deepOff.apply(this, arguments);
                this.each(function(model) {
                    if (_.isFunction(model.deepOff)) {
                        model.deepOff();
                    }
                });
            },
            associatedOff: function(events, callback, context) {
                _(this.associated).each(function(associated) {
                    associated.off(events, callback, context);
                    if(_.isFunction(associated.associatedOff)) {
                        associated.associatedOff(events, callback, context);
                    }
                }, this);
                
                this.each(function(model) {
                    if(_.isFunction(model.associatedOff)) {
                        model.associatedOff(events, callback, context);
                    }
                });
                // fetchData is not part of the associated container, but should still be unbound
                this.fetchData.off(events, callback, context);
            },
            previousModelsOff: function(models, options) {
                _(options.previousModels).each(function(model) {
                    if (_.isFunction(model.deepOff)) {
                        model.deepOff();
                    }
                });
            },
            reverse: function(options) {
                options || (options = {});
                var reversedModels = [].concat(this.models).reverse();
                if (options.mutate===false) {
                    return reversedModels;
                }
                this.reset(reversedModels, options);
            },
            isValid: function(options) {
                return this.all(function(model) { return model.isValid(options); });
            },
            // Backbone's collection clone makes a shallow copy (the models are shared references)
            // this version will clone each model and put the clones in the new collection
            deepClone: function() {
                return new this.constructor(this.invoke('clone'));
            },
            /* start patches */
            _reset: function() {
                this.length = 0;
                this.models = [];
                this._byId  = {};
            }
            /* end patches */
        });
        _.extend(BaseCollection.prototype, xhrmanagement);
        
        return BaseCollection;
    }
);

define('models/SplunkDWhiteList',
    [
        'jquery',
        'backbone',
        'underscore',
        'models/Base',
        'util/splunkd_utils'
     ],
     function($, Backbone, _, BaseModel, splunkDUtils) {
        return BaseModel.extend({
            initialize: function(options) {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            concatOptionalRequired: function() {
                var optional = (this.get('optional') || []).slice(0),
                required = (this.get('required') || []).slice(0);
                return optional.concat(required);
            },
            url: '',
            sync: function(method, model, options) {
                var  defaults = {
                        data:{
                            output_mode: 'json'
                        },
                        url: _.isFunction(model.url) ? model.url() : model.url
                };
                switch(method) {
                    case 'read':
                        defaults.data = _.extend(defaults.data, options.data || {});
                        delete options.data;
                        defaults.url = splunkDUtils.fullpath(defaults.url);
                        break;
                    default:
                        throw new Error('invalid method: ' + method);
                }
                return Backbone.sync.call(this, method, model, $.extend(true, defaults, options));
            },
            parse: function(response){
                var entity = (response.entry ? $.extend(true, {}, response.entry[0]) : {}),
                data = entity.fields || {};
                
                if (data.wildcard) {
                    data.wildcard = splunkDUtils.addAnchorsToWildcardArray(data.wildcard);
                }
                
                return data;
            }
        });
    }
);

define('models/services/ACL',
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

define('models/ACLReadOnly',
    [
         'jquery',
         'underscore',
         'backbone',
         'models/Base',
         'util/splunkd_utils'
     ],
     function($, _, Backbone, BaseModel, splunkd_utils) {
        return BaseModel.extend({
            initialize: function(attributes, options) {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            permsToObj: function() {
                var perms = $.extend(true, {}, this.get('perms'));
                perms.read = perms.read || [];
                perms.write = perms.write || [];
                return perms;
            },
            toDataPayload: function() {
                var perms = this.permsToObj(),
                    data = {
                        sharing: this.get('sharing'),
                        owner: this.get('owner')
                    };

                if (data.sharing !== splunkd_utils.USER && perms.read.length !== 0) {
                    if (_.indexOf(perms.read, '*') != -1) {
                        data['perms.read'] = '*';
                    } else {
                        data['perms.read'] = perms.read.join(',');
                    }
                }

                if (data.sharing !== splunkd_utils.USER && perms.write.length !== 0) {
                    if (_.indexOf(perms.write, '*') != -1) {
                        data['perms.write'] = '*';
                    } else {
                        data['perms.write'] = perms.write.join(',');
                    }
                }

                return data;
            },
            canWrite: function() {
                return this.get('can_write');
            }
        });
    }
);

define('models/SplunkDBase',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/Base',
        'models/SplunkDWhiteList',
        'models/services/ACL',
        'models/ACLReadOnly',
        'util/splunkd_utils',
        'util/console'
    ],
    function($, _, Backbone, BaseModel, SplunkDWhiteList, ACLModel, ACLReadOnlyModel, splunkDUtils, console) {

        //private sync CRUD methods
        var syncCreate = function(model, options){
            var bbXHR, splunkDWhiteListXHR, url,
	            deferredResponse = $.Deferred(),
	            defaults = {data: {output_mode: 'json'}};

            url = _.isFunction(model.url) ? model.url() : model.url;
            splunkDWhiteListXHR = this.splunkDWhiteList.fetch({
                url: splunkDUtils.fullpath(url, {}) + '/_new',
                success: function(splunkDWhiteListModel, response) {
                    var app_and_owner = {};
                    if (options.data){
                        app_and_owner = $.extend(app_and_owner, { //JQuery purges undefined
                            app: options.data.app || undefined,
                            owner: options.data.owner || undefined,
                            sharing: options.data.sharing || undefined
                        });
                    }
                    defaults.url = splunkDUtils.fullpath(url, app_and_owner);
                    
                    defaults.processData = true;
                    $.extend(true, defaults.data, model.whiteListAttributes());
                    $.extend(true, defaults, options);
                    
                    delete defaults.data.app;
                    delete defaults.data.owner;
                    delete defaults.data.sharing;

                    bbXHR = Backbone.sync.call(null, "create", model, defaults);
                    bbXHR.done(function() {
                        deferredResponse.resolve.apply(deferredResponse, arguments);
                    });
                    bbXHR.fail(function() {
                        deferredResponse.reject.apply(deferredResponse, arguments);
                    });
                }
            });
            splunkDWhiteListXHR.fail(function() {
                deferredResponse.reject.apply(deferredResponse, arguments);
            });
            return deferredResponse.promise();
        },
        syncRead = function(model, options){
            var bbXHR, url,
	            deferredResponse = $.Deferred(),
	            defaults = {data: {output_mode: 'json'}};

            if (model.isNew()){
                url = _.isFunction(model.url) ? model.url() : model.url;
                url += "/_new";
            }else if(model.urlRoot){
                url = model.urlRoot +'/'+ model.id;
            } else {
                url = model.id;
            }
            
            var app_and_owner = {};
            if (options.data){
                app_and_owner = $.extend(app_and_owner, { //JQuery purges undefined
                    app: options.data.app || undefined,
                    owner: options.data.owner || undefined,
                    sharing: options.data.sharing || undefined
                });
            }
            defaults.url = splunkDUtils.fullpath(url, app_and_owner);
            
            $.extend(true, defaults, options);
            delete defaults.data.app;
            delete defaults.data.owner;
            delete defaults.data.sharing;
            
            bbXHR = Backbone.sync.call(this, "read", model, defaults);
            bbXHR.done(function() {
                deferredResponse.resolve.apply(deferredResponse, arguments);
            });
            bbXHR.fail(function() {
                deferredResponse.reject.apply(deferredResponse, arguments);
            });
            return deferredResponse.promise();
        },
        syncUpdate = function(model, options){
            var bbXHR, splunkDWhiteListXHR, url,
	            deferredResponse = $.Deferred(),
	            defaults = {data: {output_mode: 'json'}},
	            id = model.id;

            url = splunkDUtils.fullpath(id, {});
            this.splunkDWhiteList.clear();
            splunkDWhiteListXHR = this.splunkDWhiteList.fetch({
                url: url,
                success: function(splunkDWhiteListModel) {
                    $.extend(true, defaults.data, model.whiteListAttributes());
                    $.extend(true, defaults, options);
                    defaults.processData = true;
                    defaults.type = 'POST';
                    defaults.url = url;

                    bbXHR = Backbone.sync.call(null, "update", model, defaults);
                    bbXHR.done(function() {
                        deferredResponse.resolve.apply(deferredResponse, arguments);
                    });
                    bbXHR.fail(function() {
                        deferredResponse.reject.apply(deferredResponse, arguments);
                    });
                }
            });
            splunkDWhiteListXHR.fail(function() {
                deferredResponse.reject.apply(deferredResponse, arguments);
            });
            return deferredResponse.promise();
        },
        syncDelete = function(model, options){
            var bbXHR,
	            deferredResponse = $.Deferred(),
	            defaults = {data: {output_mode: 'json'}};

            if(options.data && options.data.output_mode){
                //add layering of url if specified by user
                defaults.url = splunkDUtils.fullpath(model.id, {}) + '?output_mode=' + encodeURIComponent(options.data.output_mode);
                delete options.data.output_mode;
            } else {
                //add layering of url if specified by user
                defaults.url = splunkDUtils.fullpath(model.id, {}) + '?output_mode=' + encodeURIComponent(defaults.data.output_mode);
                delete defaults.data.output_mode;
            }
            $.extend(true, defaults, options);
            defaults.processData = true;

            bbXHR = Backbone.sync.call(this, "delete", model, defaults);
            bbXHR.done(function() {
                deferredResponse.resolve.apply(deferredResponse, arguments);
            });
            bbXHR.fail(function() {
                deferredResponse.reject.apply(deferredResponse, arguments);
            });
            return deferredResponse.promise();
        };

        var Model = BaseModel.extend({
            initialize: function(attributes, options) {
                BaseModel.prototype.initialize.apply(this, arguments);
                this.splunkDWhiteList = options && options.splunkDWhiteList ?
                        options.splunkDWhiteList : new SplunkDWhiteList();
                
                this.initializeAssociated();
                
                this.on("change:id", function() {
                    var alt = this.id;
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
                    messages = _.union(messages, splunkDUtils.parseMessagesObject(response.entry[0].messages));
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
                    $.extend(this.entry, {
                        links: new RootClass.Entry.Links(),
                        acl: new RootClass.Entry.ACL(),
                        content: new RootClass.Entry.Content(),
                        fields: new RootClass.Entry.Fields()
                    });
                    this.entry.associated.links = this.entry.links;
                    this.entry.associated.acl = this.entry.acl;
                    this.entry.associated.content = this.entry.content;
                    this.entry.associated.fields = this.entry.fields;
                }
                this.associated.entry = this.entry;
                
                //associated EAI models
                this.acl = this.acl || new ACLModel();
                this.associated.acl = this.acl;
            },
            url: '',
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

                var newRegex = /.\/_new$/;
                
                if (!response || !response.entry || response.entry.length === 0) {
                    console.log('Response has no content to parse');
                    return;
                }
                var response_entry = response.entry[0];

                //id
                //this needs to be the first thing so that people can get !isNew()
                if (!newRegex.test(response_entry.links.alternate)){
                    this.id = response_entry.links.alternate;
                    response.id = response_entry.links.alternate;
                    this.acl.set('id', this.id + '/acl');
                }

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
                this.entry.content.set(response_entry.content);
                delete response_entry.content;
                
                if (response_entry.fields && response_entry.fields.wildcard) {
                    response_entry.fields.wildcard = splunkDUtils.addAnchorsToWildcardArray(response_entry.fields.wildcard);
                }
                this.entry.fields.set(response_entry.fields);
                delete response_entry.fields;
                this.entry.set(response_entry);
                delete response.entry;
                return response;
            },
            whiteListAttributes: function() {
                var whiteListOptAndReq = this.splunkDWhiteList.concatOptionalRequired(),
                    whiteListWild = this.splunkDWhiteList.get('wildcard') || [],
                    contentAttrs = this.entry.content.filterByKeys(whiteListOptAndReq, {allowEmpty: true});

                return _.extend(contentAttrs, this.entry.content.filterByWildcards(whiteListWild, {allowEmpty: true}));
            },
            setFromSplunkD: function(payload, options) {
                this.attributes = {};
                var cloned_payload = $.extend(true, {}, payload),
                    newRegex = /.\/_new$/;

                var oldId = this.id;
                //object assignment
                if (cloned_payload) {
                    if (cloned_payload.entry && cloned_payload.entry[0]) {
                        var payload_entry = cloned_payload.entry[0];

                        if(payload_entry.links){
                            //id
                            //this needs to be the first thing so that people can get !isNew()
                            if (payload_entry.links.alternate && !newRegex.test(payload_entry.links.alternate)){
                                this.set({id: payload_entry.links.alternate}, {silent: true});
                                this.acl.set({id: payload_entry.links.alternate + "/acl"}, options);
                            }

                            this.entry.links.set(payload_entry.links, options);
                            delete payload_entry.links;
                        }

                        if(payload_entry.acl){
                            this.entry.acl.set(payload_entry.acl, options);
                            delete payload_entry.acl;
                        }
                        if(payload_entry.content){
                            this.entry.content.set(payload_entry.content, options);
                            delete payload_entry.content;
                        }
                        if(payload_entry.fields){
                            if (payload_entry.fields.wildcard) {
                                payload_entry.fields.wildcard = splunkDUtils.addAnchorsToWildcardArray(payload_entry.fields.wildcard);
                            }
                            
                            this.entry.fields.set(payload_entry.fields, options);
                            delete payload_entry.fields;
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
                payload.entry[0].fields = $.extend(true, {}, this.entry.fields.toJSON());

                //cleanup
                delete payload.id;
                return payload;
            }
        },
        {
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
                    Content: BaseModel,
                    Fields: BaseModel
                }
            )
        });

        return Model;
    }
);

/**
 * A reusable model encapsulating the fetch data for EAI endpoints.
 *
 * Adds special handling of the "sortKey" and "sortDirection" attributes, which are mapped to the keys that
 * the EAI-like endpoints expect, and the "filter" attribute, which is mapped from a dictionary of string pairs
 * to a filter search string.
 */

define('models/fetch_data/EAIFetchData',[
            'underscore',
            'models/Base'
        ], 
        function(
            _,
            Base
        ) {

    return Base.extend({

        defaults: {
            filter: {}
        },

        toJSON: function() {
            var json = Base.prototype.toJSON.call(this);

            if(json.sortKey) {
                json.sort_key = json.sortKey;
                json.sort_dir = json.sortDirection;
            }
            delete json.sortKey;
            delete json.sortDirection;

            if(_(json.filter).size() > 0) {
                var search = [];
                _(json.filter).each(function(match, key) {
                    search.push(key + '=*' + match + '*');
                });
                json.search = search.join(' ');
            }
            delete json.filter;

            return json;
        }

    });

});
define('collections/SplunkDsBase',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/SplunkDBase',
        'models/fetch_data/EAIFetchData',
        'collections/Base',
        'util/splunkd_utils'
    ],
    function(
        $,
        _,
        Backbone,
        SplunkDBaseModel,
        EAIFetchData,
        Base,
        splunkDUtils
    )
    {
        return Base.extend({
            model: SplunkDBaseModel,
            initialize: function(models, options) {
                options = options || {};
                options.fetchData = options.fetchData || new EAIFetchData();
                Base.prototype.initialize.call(this, models, options);
            },
            sync: function(method, collection, options) {
                options = options || {};
                var bbXHR, url,
                    defaults = {data: {output_mode: 'json'}, traditional: true};

                switch (method) {
                    case 'read':
                        url = _.isFunction(collection.url) ? collection.url() : collection.url;
                        var appOwner = {};
                        if(options.data){
                            appOwner = $.extend(appOwner, { //JQuery purges undefined
                                app: options.data.app || undefined,
                                owner: options.data.owner || undefined,
                                sharing: options.data.sharing || undefined
                            });
                        }
                        defaults.url = splunkDUtils.fullpath(url, appOwner);
                        $.extend(true, defaults, options);

                        delete defaults.data.app;
                        delete defaults.data.owner;
                        delete defaults.data.sharing;

                        return Backbone.sync.call(this, "read", collection, defaults);
                    default:
                        throw new Error('invalid method: ' + method);
                }
            },
            parse: function(response){
                var results = response.entry,
                    header = $.extend(true, {}, response);
                delete header.entry;

                return _.map(results, function(result) {
                    var container = $.extend(true, {}, header);
                    container.entry = [$.extend(true, {}, result)];
                    return container;
                });
            },
            setFromSplunkD: function(payload, options){
                // have to use parse=true or the reset won't work correctly
                this.reset(payload, $.extend({parse: true}, options));
            }
        }, {
            // When fetching with user equal to wildcard adding this string to the search param will 
            // limit results to items shared with or created by the owner.
            availableWithUserWildCardSearchString: function(owner) {
                return '((eai:acl.sharing="user" AND eai:acl.owner="' + owner + '") OR (eai:acl.sharing!="user"))';
            }
        });
    }
);
define('models/SystemMenuSection',[
    'models/Base'
],
function(
    BaseModel
){
    return BaseModel.extend({
        initialize: function(){
            BaseModel.prototype.initialize.apply(this, arguments);
            
            //TODO lame...
            if( !this.get('items') ){
                this.set({items: []});
            }
        }
    });
});
define('collections/SystemMenuSections',[
    'models/SystemMenuSection',
    'collections/Base'
],
function(
    SystemMenuSectionModel,
    BaseCollection
){
    return BaseCollection.extend({
        model: SystemMenuSectionModel,
        initialize: function() {
            BaseCollection.prototype.initialize.apply(this, arguments);
        },
        comparator: function(a, b){
            var x = a.get('order'),
                y = b.get('order');
            if(x === y){
                return 0;
            }
            return x > y ? 1 : -1;
        }
    });
});
define('models/FlashMessage',
    [
        'models/Base'
    ],
    function(BaseModel) {
        return BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            idAttribute: 'key'
        });
    }
);

define('collections/FlashMessages',
        [
            'collections/Base',
            "models/FlashMessage"
        ],
        function(BaseCollection, FlashMessageModel) {
            return BaseCollection.extend({
                model: FlashMessageModel,
                initialize: function() {
                    BaseCollection.prototype.initialize.apply(this, arguments);
                }
            });
        }
);

define('models/services/AppLocal',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "apps/local",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            },
            appAllowsDisable: function() {
                return this.entry.links.get("disable") ? true : false;
            }
        });
    }
);
define('collections/services/AppLocals',
    [
        "jquery",
        "underscore",
        "backbone",
        "models/services/AppLocal",
        "collections/SplunkDsBase",
        'util/general_utils'
    ],
    function($, _, Backbone, AppModel, SplunkDsBaseCollection, general_utils) {
        return SplunkDsBaseCollection.extend({
            model: AppModel,
            url: "apps/local",
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            },
            /* sort the apps collection based on user preference (appOrderString).
            any app not declared in the indexDictionary, is sorted alphabetically */
            sortWithString: function(appOrderString){
                //FOR SAFETY cast to string
                appOrderString = typeof appOrderString === 'string' ? appOrderString : '';
                var indexDictionary = {};
                var appOrderArray = appOrderString.split(',');
                if(_.isArray(appOrderArray) && appOrderArray.length > 0){
                    for(var i=0, len=appOrderArray.length; i<len; i++){
                        indexDictionary[appOrderArray[i]] = i;
                    }
                }

                this.comparator = function(appA, appB){
                    var nameA = appA.entry.get('name'),
                        nameB = appB.entry.get('name'),
                        labelA = appA.entry.content.get('label'),
                        labelB = appB.entry.content.get('label'),
                        positionA = indexDictionary[nameA],
                        positionB = indexDictionary[nameB],
                        isNumberA = _.isNumber(positionA),
                        isNumberB = _.isNumber(positionB);
                    if(isNumberA && isNumberB){
                        return positionA < positionB ? -1 : 1;
                    }
                    if(!isNumberA && !isNumberB){
                        return general_utils.compareWithDirection(labelA, labelB, false);
                    }
                    if(isNumberA && !isNumberB){
                        return -1;
                    }
                    if(!isNumberA && isNumberB){
                        return 1;
                    }
                };
                this.sort();
            }
        });
    }
);
define('models/services/authentication/CurrentContext',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "authentication/current-context",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('collections/services/authentication/CurrentContexts',
    [
        "models/services/authentication/CurrentContext",
        "collections/SplunkDsBase"
    ],
    function(CurrentContextModel, SplunkDsBaseCollection) {
        return SplunkDsBaseCollection.extend({
            model: CurrentContextModel,
            url: "authentication/current-context",
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('models/services/data/ui/Manager',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "data/ui/manager",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('collections/services/data/ui/Managers',
    [
        "models/services/data/ui/Manager",
        "collections/SplunkDsBase"
    ],
    function(ManagerModel, SplunkDsBaseCollection) {
        return SplunkDsBaseCollection.extend({
            url: "data/ui/manager",
            model: ManagerModel,
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
// moment.js
// version : 2.0.0
// author : Tim Wood
// license : MIT
// momentjs.com

(function (undefined) {

    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = "2.0.0",
        round = Math.round, i,
        // internal storage for language config files
        languages = {},

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(\d*)?\.?(\d+)\:(\d+)\:(\d+)\.?(\d{3})?/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|SS?S?|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing tokens
        parseMultipleFormatChunker = /([0-9a-zA-Z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+)/gi,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenWord = /[0-9]*[a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/i, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO seperator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123

        // preliminary iso regex
        // 0000-00-00 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000
        isoRegex = /^\s*\d{4}-\d\d-\d\d((T| )(\d\d(:\d\d(:\d\d(\.\d\d?\d?)?)?)?)?([\+\-]\d\d:?\d\d)?)?/,
        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.S', /(T| )\d\d:\d\d:\d\d\.\d{1,3}/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            w : 'week',
            M : 'month',
            y : 'year'
        },

        // format function strings
        formatFunctions = {},

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.lang().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.lang().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.lang().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.lang().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.lang().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return this.weekYear();
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return this.isoWeekYear();
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return ~~(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(~~(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(a / 60), 2) + ":" + leftZeroFill(~~a % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(~~(10 * a / 6), 4);
            },
            X    : function () {
                return this.unix();
            }
        };

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.lang().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Language() {

    }

    // Moment prototype object
    function Moment(config) {
        extend(this, config);
    }

    // Duration Constructor
    function Duration(duration) {
        var data = this._data = {},
            years = duration.years || duration.year || duration.y || 0,
            months = duration.months || duration.month || duration.M || 0,
            weeks = duration.weeks || duration.week || duration.w || 0,
            days = duration.days || duration.day || duration.d || 0,
            hours = duration.hours || duration.hour || duration.h || 0,
            minutes = duration.minutes || duration.minute || duration.m || 0,
            seconds = duration.seconds || duration.second || duration.s || 0,
            milliseconds = duration.milliseconds || duration.millisecond || duration.ms || 0;

        // representation for dateAddRemove
        this._milliseconds = milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = months +
            years * 12;

        // The following code bubbles up values, see the tests for
        // examples of what that means.
        data.milliseconds = milliseconds % 1000;
        seconds += absRound(milliseconds / 1000);

        data.seconds = seconds % 60;
        minutes += absRound(seconds / 60);

        data.minutes = minutes % 60;
        hours += absRound(minutes / 60);

        data.hours = hours % 24;
        days += absRound(hours / 24);

        days += weeks * 7;
        data.days = days % 30;

        months += absRound(days / 30);

        data.months = months % 12;
        years += absRound(months / 12);

        data.years = years;
    }


    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }
        return a;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength) {
        var output = number + '';
        while (output.length < targetLength) {
            output = '0' + output;
        }
        return output;
    }

    // helper function for _.addTime and _.subtractTime
    function addOrSubtractDurationFromMoment(mom, duration, isAdding) {
        var ms = duration._milliseconds,
            d = duration._days,
            M = duration._months,
            currentDate;

        if (ms) {
            mom._d.setTime(+mom + ms * isAdding);
        }
        if (d) {
            mom.date(mom.date() + d * isAdding);
        }
        if (M) {
            currentDate = mom.date();
            mom.date(1)
                .month(mom.month() + M * isAdding)
                .date(Math.min(currentDate, mom.daysInMonth()));
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if (~~array1[i] !== ~~array2[i]) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        return units ? unitAliases[units] || units.toLowerCase().replace(/(.)s$/, '$1') : units;
    }


    /************************************
        Languages
    ************************************/


    Language.prototype = {
        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : "h:mm A",
            L : "MM/DD/YYYY",
            LL : "MMMM D YYYY",
            LLL : "MMMM D YYYY LT",
            LLLL : "dddd, MMMM D YYYY LT"
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },
        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace("%d", number);
        },
        _ordinal : "%d",

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },
        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        }
    };

    // Loads a language definition into the `languages` cache.  The function
    // takes a key and optionally values.  If not in the browser and no values
    // are provided, it will load the language file module.  As a convenience,
    // this function also returns the language values.
    function loadLang(key, values) {
        values.abbr = key;
        if (!languages[key]) {
            languages[key] = new Language();
        }
        languages[key].set(values);
        return languages[key];
    }

    // Determines which language definition to use and returns it.
    //
    // With no parameters, it will return the global language.  If you
    // pass in a language key, such as 'en', it will return the
    // definition for 'en', so long as 'en' has already been loaded using
    // moment.lang.
    function getLangDefinition(key) {
        if (!key) {
            return moment.fn._lang;
        }
        if (!languages[key] && hasModule) {
            require('./lang/' + key);
        }
        return languages[key];
    }


    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[.*\]/)) {
            return input.replace(/^\[|\]$/g, "");
        }
        return input.replace(/\\/g, "");
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = "";
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return m.lang().longDateFormat(input) || input;
        }

        while (i-- && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        }

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token) {
        switch (token) {
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
            return parseTokenFourDigits;
        case 'YYYYY':
            return parseTokenSixDigits;
        case 'S':
        case 'SS':
        case 'SSS':
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
        case 'a':
        case 'A':
            return parseTokenWord;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
            return parseTokenOneOrTwoDigits;
        default :
            return new RegExp(token.replace('\\', ''));
        }
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, b,
            datePartArray = config._a;

        switch (token) {
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            datePartArray[1] = (input == null) ? 0 : ~~input - 1;
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = getLangDefinition(config._l).monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[1] = a;
            } else {
                config._isValid = false;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DDDD
        case 'DD' : // fall through to DDDD
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                datePartArray[2] = ~~input;
            }
            break;
        // YEAR
        case 'YY' :
            datePartArray[0] = ~~input + (~~input > 68 ? 1900 : 2000);
            break;
        case 'YYYY' :
        case 'YYYYY' :
            datePartArray[0] = ~~input;
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = ((input + '').toLowerCase() === 'pm');
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[3] = ~~input;
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[4] = ~~input;
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[5] = ~~input;
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
            datePartArray[6] = ~~ (('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            a = (input + '').match(parseTimezoneChunker);
            if (a && a[1]) {
                config._tzh = ~~a[1];
            }
            if (a && a[2]) {
                config._tzm = ~~a[2];
            }
            // reverse offsets
            if (a && a[0] === '+') {
                config._tzh = -config._tzh;
                config._tzm = -config._tzm;
            }
            break;
        }

        // if the input is null, the date is not valid
        if (input == null) {
            config._isValid = false;
        }
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromArray(config) {
        var i, date, input = [];

        if (config._d) {
            return;
        }

        for (i = 0; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid
        input[3] += config._tzh || 0;
        input[4] += config._tzm || 0;

        date = new Date(0);

        if (config._useUTC) {
            date.setUTCFullYear(input[0], input[1], input[2]);
            date.setUTCHours(input[3], input[4], input[5], input[6]);
        } else {
            date.setFullYear(input[0], input[1], input[2]);
            date.setHours(input[3], input[4], input[5], input[6]);
        }

        config._d = date;
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var tokens = config._f.match(formattingTokens),
            string = config._i,
            i, parsedInput;

        config._a = [];

        for (i = 0; i < tokens.length; i++) {
            parsedInput = (getParseRegexForToken(tokens[i]).exec(string) || [])[0];
            if (parsedInput) {
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            }
            // don't parse if its not a known token
            if (formatTokenFunctions[tokens[i]]) {
                addTimeToArrayFromToken(tokens[i], parsedInput, config);
            }
        }
        // handle am pm
        if (config._isPm && config._a[3] < 12) {
            config._a[3] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[3] === 12) {
            config._a[3] = 0;
        }
        // return
        dateFromArray(config);
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            tempMoment,
            bestMoment,

            scoreToBeat = 99,
            i,
            currentScore;

        for (i = config._f.length; i > 0; i--) {
            tempConfig = extend({}, config);
            tempConfig._f = config._f[i - 1];
            makeDateFromStringAndFormat(tempConfig);
            tempMoment = new Moment(tempConfig);

            if (tempMoment.isValid()) {
                bestMoment = tempMoment;
                break;
            }

            currentScore = compareArrays(tempConfig._a, tempMoment.toArray());

            if (currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempMoment;
            }
        }

        extend(config, bestMoment);
    }

    // date from iso format
    function makeDateFromString(config) {
        var i,
            string = config._i;
        if (isoRegex.exec(string)) {
            config._f = 'YYYY-MM-DDT';
            for (i = 0; i < 4; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (parseTokenTimezone.exec(string)) {
                config._f += " Z";
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._d = new Date(string);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i,
            matched = aspNetJsonRegex.exec(input);

        if (input === undefined) {
            config._d = new Date();
        } else if (matched) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromArray(config);
        } else {
            config._d = input instanceof Date ? new Date(+input) : new Date(input);
        }
    }


    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
            minutes = round(seconds / 60),
            hours = round(minutes / 60),
            days = round(hours / 24),
            years = round(days / 365),
            args = seconds < 45 && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < 45 && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < 22 && ['hh', hours] ||
                days === 1 && ['d'] ||
                days <= 25 && ['dd', days] ||
                days <= 45 && ['M'] ||
                days < 345 && ['MM', round(days / 30)] ||
                years === 1 && ['y'] || ['yy', years];
        args[2] = withoutSuffix;
        args[3] = milliseconds > 0;
        args[4] = lang;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }


    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        if (input === null || input === '') {
            return null;
        }

        if (typeof input === 'string') {
            config._i = input = getLangDefinition().preparse(input);
        }

        if (moment.isMoment(input)) {
            config = extend({}, input);
            config._d = new Date(+input._d);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, lang) {
        return makeMoment({
            _i : input,
            _f : format,
            _l : lang,
            _isUTC : false
        });
    };

    // creating with utc
    moment.utc = function (input, format, lang) {
        return makeMoment({
            _useUTC : true,
            _isUTC : true,
            _l : lang,
            _i : input,
            _f : format
        });
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var isDuration = moment.isDuration(input),
            isNumber = (typeof input === 'number'),
            duration = (isDuration ? input._data : (isNumber ? {} : input)),
            matched = aspNetTimeSpanJsonRegex.exec(input),
            sign,
            ret;

        if (isNumber) {
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (matched) {
            sign = (matched[1] === "-") ? -1 : 1;
            duration = {
                y: 0,
                d: ~~matched[2] * sign,
                h: ~~matched[3] * sign,
                m: ~~matched[4] * sign,
                s: ~~matched[5] * sign,
                ms: ~~matched[6] * sign
            };
        }

        ret = new Duration(duration);

        if (isDuration && input.hasOwnProperty('_lang')) {
            ret._lang = input._lang;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // This function will load languages and then set the global language.  If
    // no arguments are passed in, it will simply return the current global
    // language key.
    moment.lang = function (key, values) {
        var i;

        if (!key) {
            return moment.fn._lang._abbr;
        }
        if (values) {
            loadLang(key, values);
        } else if (!languages[key]) {
            getLangDefinition(key);
        }
        moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);
    };

    // returns language data
    moment.langData = function (key) {
        if (key && key._lang && key._lang._abbr) {
            key = key._lang._abbr;
        }
        return getLangDefinition(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment;
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };


    /************************************
        Moment Prototype
    ************************************/


    moment.fn = Moment.prototype = {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d;
        },

        unix : function () {
            return Math.floor(+this._d / 1000);
        },

        toString : function () {
            return this.format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._d;
        },

        toJSON : function () {
            return formatMoment(moment(this).utc(), 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            if (this._isValid == null) {
                if (this._a) {
                    this._isValid = !compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray());
                } else {
                    this._isValid = !isNaN(this._d.getTime());
                }
            }
            return !!this._isValid;
        },

        utc : function () {
            this._isUTC = true;
            return this;
        },

        local : function () {
            this._isUTC = false;
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.lang().postformat(output);
        },

        add : function (input, val) {
            var dur;
            // switch args to support add('s', 1) and add(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, 1);
            return this;
        },

        subtract : function (input, val) {
            var dur;
            // switch args to support subtract('s', 1) and subtract(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, -1);
            return this;
        },

        diff : function (input, units, asFloat) {
            var that = this._isUTC ? moment(input).utc() : moment(input).local(),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                output += ((this - moment(this).startOf('month')) - (that - moment(that).startOf('month'))) / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that) - zoneDiff;
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? diff / 864e5 : // 1000 * 60 * 60 * 24
                    units === 'week' ? diff / 6048e5 : // 1000 * 60 * 60 * 24 * 7
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function () {
            var diff = this.diff(moment().startOf('day'), 'days', true),
                format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.lang().calendar(format, this));
        },

        isLeapYear : function () {
            var year = this.year();
            return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        },

        isDST : function () {
            return (this.zone() < moment([this.year()]).zone() ||
                this.zone() < moment([this.year(), 5]).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().weekdaysParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }
                return this.add({ d : input - day });
            } else {
                return day;
            }
        },

        month : function (input) {
            var utc = this._isUTC ? 'UTC' : '';
            if (input != null) {
                if (typeof input === 'string') {
                    input = this.lang().monthsParse(input);
                    if (typeof input !== 'number') {
                        return this;
                    }
                }
                this._d['set' + utc + 'Month'](input);
                return this;
            } else {
                return this._d['get' + utc + 'Month']();
            }
        },

        startOf: function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.day(0);
            }

            return this;
        },

        endOf: function (units) {
            return this.startOf(units).add(units, 1).subtract('ms', 1);
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) === +moment(input).startOf(units);
        },

        zone : function () {
            return this._isUTC ? 0 : this._d.getTimezoneOffset();
        },

        daysInMonth : function () {
            return moment.utc([this.year(), this.month() + 1, 0]).date();
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add("d", (input - dayOfYear));
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;
            return input == null ? year : this.add("y", (input - year));
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add("y", (input - year));
        },

        week : function (input) {
            var week = this.lang().week(this);
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        weekday : function (input) {
            var weekday = (this._d.getDay() + 7 - this.lang()._week.dow) % 7;
            return input == null ? weekday : this.add("d", input - weekday);
        },

        isoWeekday : function (input) {
            // iso weeks start on monday, which is 1, so we subtract 1 (and add
            // 7 for negative mod to work).
            var weekday = (this._d.getDay() + 6) % 7;
            return input == null ? weekday : this.add("d", input - weekday);
        },

        // If passed a language key, it will set the language for this
        // instance.  Otherwise, it will return the language configuration
        // variables for this instance.
        lang : function (key) {
            if (key === undefined) {
                return this._lang;
            } else {
                this._lang = getLangDefinition(key);
                return this;
            }
        }
    };

    // helper for adding shortcuts
    function makeGetterAndSetter(name, key) {
        moment.fn[name] = moment.fn[name + 's'] = function (input) {
            var utc = this._isUTC ? 'UTC' : '';
            if (input != null) {
                this._d['set' + utc + key](input);
                return this;
            } else {
                return this._d['get' + utc + key]();
            }
        };
    }

    // loop through and add shortcuts (Month, Date, Hours, Minutes, Seconds, Milliseconds)
    for (i = 0; i < proxyGettersAndSetters.length; i ++) {
        makeGetterAndSetter(proxyGettersAndSetters[i].toLowerCase().replace(/s$/, ''), proxyGettersAndSetters[i]);
    }

    // add shortcut for year (uses different syntax than the getter/setter 'year' == 'FullYear')
    makeGetterAndSetter('year', 'FullYear');

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;

    /************************************
        Duration Prototype
    ************************************/


    moment.duration.fn = Duration.prototype = {
        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              ~~(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var difference = +this,
                output = relativeTime(difference, !withSuffix, this.lang());

            if (withSuffix) {
                output = this.lang().pastFuture(difference, output);
            }

            return this.lang().postformat(output);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            units = normalizeUnits(units);
            return this['as' + units.charAt(0).toUpperCase() + units.slice(1) + 's']();
        },

        lang : moment.fn.lang
    };

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    function makeDurationAsGetter(name, factor) {
        moment.duration.fn['as' + name] = function () {
            return +this / factor;
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationAsGetter(i, unitMillisecondFactors[i]);
            makeDurationGetter(i.toLowerCase());
        }
    }

    makeDurationAsGetter('Weeks', 6048e5);
    moment.duration.fn.asMonths = function () {
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;
    };


    /************************************
        Default Lang
    ************************************/


    // Set default language, other languages will inherit from English.
    moment.lang('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (~~ (number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });


    /************************************
        Exposing Moment
    ************************************/


    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    }
    /*global ender:false */
    if (typeof ender === 'undefined') {
        // here, `this` means `window` in the browser, or `global` on the server
        // add `moment` as a global object via a string identifier,
        // for Closure Compiler "advanced" mode
        this['moment'] = moment;
    }
    /*global define:false */
    if (typeof define === "function" && define.amd) {
        define("moment", [], function () {
            return moment;
        });
    }
}).call(this);

define('util/moment',['splunk.i18n', 'moment'],function(i18n, moment){
    var initFn = i18n.moment_install;
    if(typeof initFn === 'function') {
        initFn(moment);
    }
    return moment;
});
define('util/time_utils',
    [
        'underscore',
        'splunk.i18n',
        'splunk.util',
        'util/moment'
    ],
    function(_, i18n, splunkUtils, moment) {

        var BD_TIME_REGEX_MILLIS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)[+-]{1}\d{2}[:]?\d{2}$/,
            BD_TIME_REGEX_NO_MILLIS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[+-]{1}\d{2}[:]?\d{2}$/,
            u = {},
            language = i18n.locale_name().substring(0, 2),
            ISO_PATTERN = '%Y-%m-%dT%H:%M:%S.%Q%:z';
        
        u.s = u.sec = u.secs = u.second = u.seconds = {abbr: "s",  singular: _("second").t(), plural: _("seconds").t()};
        u.m = u.min = u.mins = u.minute = u.minutes = {abbr: "m", singular: _("minute").t(), plural: _("minutes").t()};
        u.h = u.hr  = u.hrs  = u.hour   = u.hours   = {abbr: "h", singular: _("hour").t(), plural: _("hours").t()};
        u.d = u.day = u.days = {abbr: "d", singular: _("day").t(), plural: _("days").t()};
        u.w = u.week = u.weeks = {abbr: "w", singular: _("week").t(), plural: _("weeks").t()};
        u.mon = u.month = u.months = {abbr: "mon", singular: _("month").t(), plural: _("months").t()};
        u.q = u.qtr = u.qtrs = u.quarter = u.quarters = {abbr: "q", singular: _("quarter").t(), plural: _("quarters").t()};
        u.y = u.yr = u.yrs = u.year = u.years = {abbr: "y", singular: _("year").t(), plural: _("years").t()};
            
        var TIME_UNITS = u;
    
        var BdTime = function(isoString) {
            var bdPieces = BD_TIME_REGEX_MILLIS.exec(isoString) || BD_TIME_REGEX_NO_MILLIS.exec(isoString);
            if(!bdPieces) {
                this.isInvalid = true;
            }
            else {
                this.year   = parseInt(bdPieces[1], 10);
                this.month  = parseInt(bdPieces[2], 10);
                this.day    = parseInt(bdPieces[3], 10);
                this.hour   = parseInt(bdPieces[4], 10);
                this.minute = parseInt(bdPieces[5], 10);
                this.second = parseInt(bdPieces[6], 10);
                this.millisecond = bdPieces.length > 7 ? parseInt(bdPieces[7], 10) : 0;
            }
        };
    
        var extractBdTime = function(timeString) {
            return new BdTime(timeString);
        };
    
        var bdTimeToDateObject = function(bdTime) {
            var year     = bdTime.year,
                month    = bdTime.month - 1,
                day      = bdTime.day,
                hour     = bdTime.hour,
                minute   = bdTime.minute,
                second   = bdTime.second,
                millisecond = bdTime.millisecond;
    
            return new Date(year, month, day, hour, minute, second, millisecond);
        };
    
        var isoToDateObject = function(isoString) {
            var bdTime = extractBdTime(isoString);
            return bdTimeToDateObject(bdTime);
        };
        
        var jsDateToSplunkDateTimeWithMicroseconds = function(jsDate) {
            var dateTime = new i18n.DateTime({
                date: jsDate,
                year: jsDate.getFullYear(),
                month: jsDate.getMonth() + 1,
                day: jsDate.getDate(),
                hour: jsDate.getHours(),
                minute: jsDate.getMinutes(),
                second: jsDate.getSeconds(),
                microsecond: jsDate.getMilliseconds() * 1000
            });
            dateTime.weekday = function() {
                var d = this.date.getDay() - 1;
                if (d < 0)
                    d = 6;
                return d;
            };
            return dateTime;
        };
    
        var determineLabelGranularity = function(times) {
            if(times.length === 1) {
                return 'second';
            }
            if(!(times[0] instanceof BdTime)) {
                times = _(times).map(extractBdTime);
            }
            var seconds = [],
                minutes = [],
                hours   = [],
                days    = [],
                months  = [],
    
                allInListMatch = function(list, matchMe) {
                    for(var i = 0; i < list.length; i++) {
                        if(list[i] !== matchMe) {
                            return false;
                        }
                    }
                    return true;
                };
    
            _(times).each(function(time){
                seconds.push(time.second);
                minutes.push(time.minute);
                hours.push(time.hour);
                days.push(time.day);
                months.push(time.month);
            });
    
            if(!allInListMatch(seconds, 0)) {
                return 'second';
            }
            if(!allInListMatch(minutes, 0)) {
                return 'minute';
            }
            if((!allInListMatch(hours, 0))) {
                return 'hour';
            }
            if(!allInListMatch(days, 1)) {
                return 'day';
            }
            if(!allInListMatch(months, 1)) {
                return 'month';
            }
            return 'year';
        };
    
        var isValidIsoTime = function(str) {
            return BD_TIME_REGEX_MILLIS.test(str) || BD_TIME_REGEX_NO_MILLIS.test(str);
        };
        
    
        /**
         * Epoch seconds to LocaleString
         * @param epochTime
         * @return {String}
         */
        var convertToLocalTime = function(epochTime) {
            if (!epochTime) {
                return null;
            }
            return new Date(epochTime*1000).toLocaleString();
        };
    
        /**
         * Converts time difference to "1 year, 6 months ago"; "20 minutes, 30 seconds ago"
         * @param endTime Unix epoch seconds
         * @param startTime [optional] Unix epoch seconds; By default - current time.
         * @param withoutSuffix [optional] true to omit the "ago" suffix
         * @return {String}
         */
        var convertToRelativeTime = function(endTime, startTime, withoutSuffix) {
            if (!endTime) {
                return null;
            }
            var endMoment = moment.unix(endTime);
            return startTime !== undefined ?
                    endMoment.from(moment.unix(startTime), withoutSuffix) :
                    endMoment.fromNow(withoutSuffix);
        };

        /**
         * Converts parsed time amount and unit to seconds. Converts 1h to 3600.
         * @param amount {Number}
         * @param unit {String} ('s', 'm', 'h', 'd')
         * @return {Number}
         */
        var convertAmountAndUnitToSeconds = function(amount, unit) {
            var seconds = amount;
            switch (unit) {
                case 'd':
                    seconds *= 24 * 60 * 60;
                    break;
                case 'h':
                    seconds *= 60 * 60;
                    break;
                case 'm':
                    seconds *= 60;
                    break;
            }
            return seconds;
        };

        var getRelativeStringFromSeconds = function(seconds, removeAgo) {
            if (_.isString(seconds)) {
                seconds = parseInt(seconds, 10);
            }
            
            var now = new Date(),
                startTime = now.getTime() / 1000,
                endTime = startTime - seconds;
            
            return convertToRelativeTime(endTime, startTime, removeAgo);
        };
        
        /*  
         * Normalize units to their shortest abbreviations.
         * Required is an optional parameter, defaults to true.
         * If required and there is no match, s is returned.
         * 
         */
        var normalizeUnit = function(abbr, required) {
            var hasUnit = TIME_UNITS.hasOwnProperty(abbr),
                defaultUnit = required === false ? '' : TIME_UNITS.s.abbr;
            return hasUnit ? TIME_UNITS[abbr].abbr : defaultUnit;
        };
        
        var parseTimeString = function(timeString){
            if (!_.isString(timeString)) {
                return false;
            }
            //This regex is not a validator of splunk time! Use the TimeParser for that!
            //-1, -1s, -1@s, -1s@s, +1, +1s, +1@s, +1s@s, s@s, rt@s, @s, rtnow, now
            var parse = timeString.match(/^\s*(rt|)([-+]?)(\d*)([a-zA-Z]*)(@?)([a-zA-Z]*)(\d*)\s*$/);
                                           //   1     2     3       4       5       6      7
            if (parse) {
                var normalizedUnit = normalizeUnit(parse[4], false),
                    hasSnap = (parse[5] !== '');
                
                return {
                    amount: (normalizedUnit ? (parseInt(parse[3], 10) || 1) : 0),
                    unit: normalizedUnit,
                    hasSnap: hasSnap,
                    snapUnit: normalizeUnit(parse[6], false),
                    snapUnitAmount: parseInt(parse[7], 10),
                    isNow: parse[4] === "now",
                    isRealTime: parse[1] === 'rt',
                    isPositive: parse[2] === "+" || true,
                    parse: parse 
                };
            }
            
            return false;
        };
        
        var isRealtime = function(time) {
            return (_.isString(time) && time.indexOf("rt") === 0);
        };
        
        var stripRTSafe = function(timeString, isLatest) {
            var sign,
                parsedTimeString,
                strippedString;
            
            if (!isRealtime(timeString)) {
                return timeString;
            }
            
            parsedTimeString = parseTimeString(timeString);
            if (!parsedTimeString) {
                return timeString;
            }
            
            if (parsedTimeString.unit || parsedTimeString.isNow) {
                return parsedTimeString.parse.slice(2, parsedTimeString.parse.length).join("");
            }
            
            strippedString = parsedTimeString.parse.slice(3, parsedTimeString.parse.length).join("");
            if (strippedString) {
                sign = parsedTimeString.isPositive ? "+" : "-";
                return sign + strippedString;
            }
            
            if (isLatest) {
                return "now";
            } else {
                return "0";
            }
        };

        var rangeFromIsoAndOffset = function(iso, offset) {
            var lowerRange = new Date(iso),
                upperRange = new Date(iso);
            switch(offset) {
                case 'w': 
                    lowerRange.setDate(lowerRange.getDate()-7);
                    upperRange.setDate(upperRange.getDate()+7);
                    break;
                case 'd': 
                    lowerRange.setDate(lowerRange.getDate()-1);
                    upperRange.setDate(upperRange.getDate()+1);
                    break;
                case 'h': 
                    lowerRange.setHours(lowerRange.getHours()-1);
                    upperRange.setHours(upperRange.getHours()+1);
                    break;
                case 'm': 
                    lowerRange.setMinutes(lowerRange.getMinutes()-1);
                    upperRange.setMinutes(upperRange.getMinutes()+1);
                    break;
                case 's': 
                    lowerRange.setSeconds(lowerRange.getSeconds()-1);
                    upperRange.setSeconds(upperRange.getSeconds()+1);
                    break;
                case 'ms': 
                    lowerRange.setMilliseconds(lowerRange.getMilliseconds()-1);
                    upperRange.setMilliseconds(upperRange.getMilliseconds()+1);
                    break;
            }
            return { lowerRange: lowerRange, upperRange: upperRange }; 
        };
        
        var isAbsolute = function(time) {
            if (time === undefined) {
                return false;
            }
            return _.isNumber(time) || !(/^(now|-|\+|@|rt).*/.test(time));
        };
        
        var isEpoch = function(time) {
            return _.isNumber(time) || (_.isString(time) && /^\d+((\.\d+)|(\d*))$/.test(time) && time !== '0');
        };
        
        var timeAndJsDateIsWholeDay = function(time, jsDate) {
            if (isAbsolute(time) && jsDate) {
                return (jsDate.getHours() == 0) && (jsDate.getMinutes() == 0) && (jsDate.getSeconds() == 0) && (jsDate.getMilliseconds() == 0);
            }
            return false;
        };
        
        var isNow = function(time) {        
            if (!time) {
                return true;
            }
            return (_.isString(time) && ((time === '') || (/now/.test(time))));
        };
        
        var isEmpty = function(time) {
            if (time === '0') {
                return true;
            }
            return (!time);
        };
        
        var findPresetLabel = function(presetsCollection, earliest, latest) {
            var presetModel;
            
            if (presetsCollection.length > 0) {
                //TODO: this should probably get moved to the Times collection
                presetModel = presetsCollection.find(function(model) {
                    var timesConfEarliest = model.entry.content.get("earliest_time"),
                        timesConfLatest = model.entry.content.get("latest_time"),
                        noEarliests = (isEmpty(timesConfEarliest) && isEmpty(earliest)),
                        noLatests = (isEmpty(timesConfLatest) && isEmpty(latest)),
                        isDisabled = model.isDisabled(),
                        isSubMenu = model.isSubMenu();
                    
                    return ((!isDisabled && !isSubMenu) && (noEarliests || (timesConfEarliest == earliest)) && (noLatests || (timesConfLatest == latest)));
                });
                
                if (presetModel) {
                    return presetModel.entry.content.get("label");
                }
            }
            return false;
        };
        
        var generateRealtimeLabel = function(earliest, latest) {
            var earliestParse, latestIsNow;
            
            if (isRealtime(earliest) || isRealtime(latest)) {
                earliestParse = parseTimeString(earliest);
                latestIsNow = isNow(latest);
                
                var labelTemplates = {
                    s:_("%t second window").t(),
                    m: _("%t minute window").t(),
                    h: _("%t hour window").t(),
                    d: _("%t day window").t(),
                    w: _("%t week window").t(),
                    mon: _("%t month window").t(),
                    q: _("%t quarter window").t(),
                    y: _("%t year window").t()
                };
            
                //A windowed time with a latest time of now.
                if (earliestParse && earliestParse.amount && latestIsNow && labelTemplates.hasOwnProperty(earliestParse.unit)) {
                    return labelTemplates[earliestParse.unit].replace(/%t/, earliestParse.amount);
                } 
                
                //Other Real-Time.
                return _("Real-time").t();
            }
            return false;
        };
        
        var generateRelativeTimeLabel = function(earliest, latest) {
            var earliestParse = parseTimeString(earliest),
                latestIsNow = isNow(latest),
                latestParse = parseTimeString(latest);
            
            if (!earliestParse || earliestParse.isRealTime || latestParse.isRealTime) {
                return false;
            }
            
            if (earliestParse.amount
                    && (!earliestParse.snapUnit || earliestParse.unit === earliestParse.snapUnit)
                    && (latestParse.isNow || latestParse.snapUnit)
                    && (!latestParse.snapUnit || earliestParse.unit === latestParse.snapUnit)) {
                var relativeLabel = _("Last %amount %unit").t();
                relativeLabel = relativeLabel.replace(/%amount/, earliestParse.amount);
                relativeLabel = relativeLabel.replace(/%unit/, TIME_UNITS[earliestParse.unit][earliestParse.amount > 1? 'plural' : 'singular']);
                return relativeLabel;
            }
            
            return false;
        };
        
        var generateBetweenTimeLabel = function(earliest, earliestJSDate, latest, latestJSDate) {
            var earliestIsWholeDay = timeAndJsDateIsWholeDay(earliest, earliestJSDate),
                latestIsWholeDay = timeAndJsDateIsWholeDay(latest, latestJSDate);
            
            if (earliestIsWholeDay && latestIsWholeDay) {
                if (language == 'en') {
                    return i18n.format_datetime_range(null, earliestJSDate, latestJSDate, true);
                } else {
                    var dateLabel = _("%1 through %2").t();
                    var labelDate = new Date(latestJSDate.getTime());
                    labelDate.setDate(labelDate.getDate() -1);
                    return dateLabel.replace('%1', i18n.format_date(earliestJSDate, 'short')).replace('%2', i18n.format_date(labelDate, 'short'));
                }
            }
            
            return false;
        };
        
        var generateSinceDateLabel = function(earliest, earliestJSDate, latest){
            var earliestIsWholeDay = timeAndJsDateIsWholeDay(earliest, earliestJSDate),
                latestIsNow = isNow(latest);
            
            if (earliestIsWholeDay && latestIsNow) {
                var dateLabel = _("Since %1").t();
                return dateLabel.replace('%1', i18n.format_date(earliestJSDate, 'short'));
            }
            
            return false;
        };
        
        var generateBeforeDateLabel = function(earliest, latest, latestJSDate) {            
            if (isEmpty(earliest) && timeAndJsDateIsWholeDay(latest, latestJSDate)) {
                var dateLabel = _("Before %1").t();
                return dateLabel.replace('%1', i18n.format_date(latestJSDate, 'short'));
            }
            
            return false;
        };
        
        var generateDateTimeRangeLabel = function(earliest, latest) {
            if (!isEmpty(earliest) && isAbsolute(earliest) && isAbsolute(latest)) {
                return _("Date time range").t();
            }
            return false;
        };
        
        var generateSinceTimeRangeLabel = function(earliest, latest) {
            if (isAbsolute(earliest) && isNow(latest)) {
                return _("Since date time").t();
            }
            return false;
         };
         
         var generateBeforeTimeRangeLabel = function(earliest, latest) {
             if (isEmpty(earliest) && isAbsolute(latest)) {
                 return _("Before date time").t();
             }
             return false;
         };
         
         var generateAllTimeLabel = function(earliest, latest) {
             if (isEmpty(earliest) && isNow(latest)) {
                 return _("All time").t();
             }
             return false;
         };
    
        /**
        * presets: <collections.services.data.ui.TimesV2>
        **/
        var generateLabel = function(presetsCollection, earliest, earliestJSDate, latest, latestJSDate) {
            return generateAllTimeLabel(earliest, latest) ||
                findPresetLabel(presetsCollection, earliest, latest) ||
                generateRealtimeLabel(earliest, latest) ||
                generateRelativeTimeLabel(earliest, latest) ||
                generateBetweenTimeLabel(earliest, earliestJSDate, latest, latestJSDate) ||
                generateSinceDateLabel(earliest, earliestJSDate, latest) ||
                generateBeforeDateLabel(earliest, latest, latestJSDate) ||
                generateDateTimeRangeLabel(earliest, latest) ||
                generateSinceTimeRangeLabel(earliest, latest) ||
                generateBeforeTimeRangeLabel(earliest, latest) ||
                _("Custom time").t();
        };
        
        return ({
            extractBdTime: extractBdTime,
            bdTimeToDateObject: bdTimeToDateObject,
            rangeFromIsoAndOffset: rangeFromIsoAndOffset,
            isoToDateObject: isoToDateObject,
            determineLabelGranularity: determineLabelGranularity,
            isValidIsoTime: isValidIsoTime,
            TIME_UNITS: TIME_UNITS,
            ISO_PATTERN: ISO_PATTERN,
            normalizeUnit: normalizeUnit,
            parseTimeString: parseTimeString,
            isRealtime: isRealtime,
            stripRTSafe: stripRTSafe,
            isAbsolute: isAbsolute,
            isEpoch: isEpoch,
            timeAndJsDateIsWholeDay: timeAndJsDateIsWholeDay,
            isNow: isNow,
            isEmpty: isEmpty,
            findPresetLabel: findPresetLabel,
            generateRealtimeLabel: generateRealtimeLabel,
            generateRelativeTimeLabel: generateRelativeTimeLabel,
            generateBetweenTimeLabel: generateBetweenTimeLabel,
            generateSinceDateLabel: generateSinceDateLabel,
            generateBeforeDateLabel: generateBeforeDateLabel,
            generateDateTimeRangeLabel: generateDateTimeRangeLabel,
            generateSinceTimeRangeLabel: generateSinceTimeRangeLabel,
            generateBeforeTimeRangeLabel: generateBeforeTimeRangeLabel,
            generateAllTimeLabel: generateAllTimeLabel,
            generateLabel: generateLabel,
            convertToRelativeTime: convertToRelativeTime,
            convertToLocalTime: convertToLocalTime,
            jsDateToSplunkDateTimeWithMicroseconds: jsDateToSplunkDateTimeWithMicroseconds,
            getRelativeStringFromSeconds: getRelativeStringFromSeconds,
            convertAmountAndUnitToSeconds: convertAmountAndUnitToSeconds
        });
    }
);

define('models/services/data/ui/Time',
    [
        'jquery',
        'splunk.util',
        'models/SplunkDBase',
        'util/time_utils'
    ],
    function($, splunkutil, SplunkDBaseModel, time_utils) {
        return SplunkDBaseModel.extend({
            url: "data/ui/times",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            },
            isRealTime: function() {
                if (this.isDisabled()) {
                    return false;
                }
                return time_utils.isRealtime(this.entry.content.get("latest_time"));
            },
            isPeriod: function() {
                if (this.isDisabled()) {
                    return false;
                }
                
                var earliest =  this.entry.content.get("earliest_time");
                var latest =  this.entry.content.get("latest_time");
                
                if (earliest && (earliest.indexOf("@") != -1) && (earliest.indexOf("-") != 0)) return true; // Period to date 
                if (earliest && latest && (earliest.indexOf("@") != -1) && (latest.indexOf("@") != -1)) return true;  // Previous period
                
                return false;
            },
            isLast: function() {
                if (this.isDisabled()) {
                    return false;
                }
                
                if (this.isPeriod()) {
                    return false;
                }
            
                var earliest =  this.entry.content.get("earliest_time");
                if (!earliest) {
                    return false;
                }
                return (earliest.indexOf("-") == 0);
            },
            isOther: function() {
                if (this.isDisabled()) {
                    return false;
                }
                
                return !this.isRealTime() && !this.isPeriod() && !this.isLast() && !this.isSubMenu();
            },
            isDisabled: function() {
                return this.entry.content.get("disabled");
            },
            isSubMenu: function() {
                return this.entry.content.get('is_sub_menu') === '1';
            }
        });
    }
);
define('collections/services/data/ui/Times',
    [
        'models/services/data/ui/Time',
        'collections/SplunkDsBase'
    ],
    function(TimeModel, SplunkDsBaseCollection) {
        return SplunkDsBaseCollection.extend({
            url: 'data/ui/times',
            model: TimeModel,
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            },
            filterToRealTime: function(type) {
                return this.filter(function(model) {
                    return model.isRealTime();
                });
            },
            filterToPeriod: function(type) {
                return this.filter(function(model) {
                    return model.isPeriod();
                });
            },
            filterToLast: function(type) {
                return this.filter(function(model) {
                    return model.isLast();
                });
            },
            filterToOther: function(type) {
                return this.filter(function(model) {
                    return model.isOther();
                });
            },
            comparator: function(model) {
                return parseInt(model.entry.content.get('order'), 10);
            }
        });
    }
);
define('models/services/data/ui/View',
    [
     'jquery',
     'splunk.util',
     'models/SplunkDBase',
     'underscore'
    ],
    function($, splunkutil, SplunkDBaseModel, _) {
        return SplunkDBaseModel.extend({
            url: "data/ui/views",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            },
            isXML: function() {
                return this.entry.content.get('eai:type') === 'views';
            },
            isHTML: function() {
                return this.entry.content.get('eai:type') === 'html';
            },
            getViewType: function() {
                var typeLabel = 'n/a';
                if(this.isXML()) {
                    typeLabel = 'XML';
                } else if(this.isHTML()) {
                    typeLabel = 'HTML';
                }
                return typeLabel;
            },
            getLabel: function() {
                return this.entry.content.get('label') || this.entry.get('name');
            },
            isRoot: function(nodeName) {
                if(!this.isXML()) {
                    return false;
                }
                var data = this.entry.content.get('eai:data'),
                    $xmlDoc = $($.parseXML(data)),
                    rootNode = $xmlDoc.find(':eq(0)')[0];
                if (!rootNode) { 
                    return false;
                }
                function lower(s){ return (s && s.toLowerCase()) || s; }
                return arguments.length > 1 ?
                        _.any(arguments, function(nodeName){ return lower(rootNode.nodeName) === lower(nodeName); }) :
                        lower(rootNode.nodeName) === lower(nodeName);
            },
            isAdvanced: function(visibility) {
                var data, $xmlDoc, $root, type, isVisible;
                if (!this.isRoot('view')) { 
                    return false; 
                }
                if (visibility) {
                    data = this.entry.content.get('eai:data');
                    $xmlDoc = $($.parseXML(data));
                    $root = $xmlDoc.find(':eq(0)');
                    type = $root.attr('type');
                    isVisible = $root.attr('isVisible');
                    if (type && type=='html') {
                        return false;
                    }
                    if(isVisible && !splunkutil.normalizeBoolean(isVisible)){
                        return false;
                    }
                }
                return true;
            },
            isDashboard: function() {
                return this.isRoot('dashboard');
            },
            isForm: function() {
                return this.isRoot('form');
            },
            isSimpleXML: function() {
                return this.isXML() && this.isRoot('dashboard','form');
            }
        });
    }
);

define('collections/services/data/ui/Views',
    [
        'jquery',
        'backbone',
        'models/services/data/ui/View',
        'collections/SplunkDsBase',
        'splunk.util'
    ],
    function($, Backbone, ViewModel, SplunkDsBaseCollection, splunk_utils) {
        return SplunkDsBaseCollection.extend({
            url: 'data/ui/views',
            model: ViewModel,
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            }
        });
    }
);

define('models/services/Message',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: 'messages',
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);

define('collections/services/Messages',
    [
        "jquery",
        "models/services/Message",
        "collections/SplunkDsBase"
    ],
    function($, MessageModel, SplunkDsBaseCollection) {
        return SplunkDsBaseCollection.extend({
            model: MessageModel,
            url: 'messages',
            initialize: function() {
                SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
            },
            destroyAll: function() {
                if (this.destroying === true) {
                    return this.destroyDFD;
                }
                this.destroying = true;
                var that = this;
                this.destroyDFD = new $.Deferred(function(dfd){
                    function destroyNext() {
                        var dummyDefered = new $.Deferred();
                        if (that.length > 0) {
                            var model = that.pop();
                            var destroyPromise = model.destroy() || dummyDefered.resolve().promise();
                            destroyPromise.always( destroyNext);
                            return destroyPromise;
                        }
                        else {
                            dfd.resolve();
                        }
                    }
                    destroyNext();
                });
                this.destroyDFD.then(function() {
                    that.destroying = false;
                });
                return this.destroyDFD.promise();
            }
        });
    }
);

define('models/services/SavedSearch',
    [
         'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "saved/searches",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('collections/services/SavedSearches',
    [
        'models/services/SavedSearch',
        'collections/SplunkDsBase'
    ],
    function(Model, Collection) {
        return Collection.extend({
            initialize: function() {
                Collection.prototype.initialize.apply(this, arguments);
            },
            url: 'saved/searches',
            model: Model
        });
    }
);

define('models/services/search/TimeParser',
    [
        'jquery',
        'underscore',
        'backbone',
        'models/Base',
        'util/splunkd_utils'
    ],
    function($, _, Backbone, BaseModel, splunkd_utils) {
        return BaseModel.extend({
            initialize: function(options) {
                BaseModel.prototype.initialize.call(this, options);
            },
            sync: function(method, model, options) {
                switch (method) {
                    case 'read':
                        var syncOptions = splunkd_utils.prepareSyncOptions(options, model.url);
                        if (options.data.time === ''){
                            model.set({key: '', value: ''});
                            return;
                        }
                        return Backbone.sync.call(this, 'read', model, syncOptions);
                    default:
                        throw 'Operation not supported';
                }
            },
            url: "/services/search/timeparser",
            parse:  function(response) {
                if (!response) {
                    return {};
                }
                var key = _.keys(response)[0],
                    value = response[key];
                return {
                    key: key,
                    value: value
                };
            },
            idAttribute: 'key'
        });
    }
);
define('collections/services/search/TimeParsers',
    [
        "underscore",
        "backbone",
        "models/services/search/TimeParser",
        "collections/Base",
        "util/splunkd_utils"
    ],
    function(_, Backbone, TimeParserModel, CollectionsBase, splunkDUtils) {
        return CollectionsBase.extend({
            model: TimeParserModel,
            intialize: function() {
                CollectionsBase.prototype.initialize.apply(this, arguments);
            },
            sync: function(method, collection, options) {
                var appOwner = {},
                    defaults = {
                        data: {output_mode: "json"},
                        traditional: true
                    };
                switch (method) {
                    case 'read':
                        if (options && options.data){
                            appOwner = $.extend(appOwner, { //JQuery purges undefined
                                app: options.data.app || undefined,
                                owner: options.data.owner || undefined
                            });
                            delete options.data.app;
                            delete options.data.owner;
                        }
                        defaults.url = splunkDUtils.fullpath(collection.url, appOwner);
                        $.extend(true, defaults, options || {});
                        return Backbone.sync.call(this, 'read', collection, defaults);
                    default:
                        throw 'Operation not supported';
                }
            },
            url: "/services/search/timeparser",
            parse: function(response) {
                var model,
                    models = [];
                for (var key in response) {
                    model = {};
                    model[key] = response[key];
                    models.push(model);
                }
                return models;
            }
        });
    }
);

define('models/Application',
    [
        'models/Base'
    ],
    function(BaseModel) {
        return BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            getPermissions: function(permission){
            	return {
            		app: this.get("app"),
            		owner: ((permission === 'private') ? this.get("owner") : 'nobody')
            	};
            }
        });
    }
);
define('models/DateInput',
    [
        'jquery',
        'underscore',
        'models/Base',
        'jquery.ui.datepicker',
        'strftime'
    ],
    function($, _, BaseModel) {

        var ISO_WITH_TZ_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)/;

        var DateTime = BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            defaults: function() {
                var now = new Date();
                return this.convertDateToAttrsObject(now);
            },
            validation: {
                year: {
                    required: true,
                    range: [1000, 9999],
                    pattern: 'digits',
                    msg: _("Year must be a 4 digit number.").t()
                },
                month: {
                    required: true,
                    range: [0, 11],
                    pattern: 'digits',
                    msg: _("Month must be a number between 0 and 11.").t()
                },
                day: {
                    required: true,
                    range: [1, 31],
                    pattern: 'digits',
                    msg: _("Day must be a number between 1 and 31.").t()
                },
                hour: [
                    {
                        required: true,
                        range: [0, 24],
                        pattern: 'digits',
                        msg: _("Hour must be a number between 0 and 24.").t()
                    },
                    {
                        fn: 'validateFullTime'
                    }
                ],
                minute: [
                    {
                        required: true,
                        range: [0, 59],
                        pattern: 'digits',
                        msg: _("Minute must be a number between 0 and 59.").t()
                    },
                    {
                        fn: 'validateFullTime'
                    }
                ],
                second: [
                    {
                        required: true,
                        range: [0, 59],
                        pattern: 'digits',
                        msg: _("Second must be a number between 0 and 59.").t()
                    },
                    {
                        fn: 'validateFullTime'
                    }
                ],
                millisecond: [
                    {
                        required: true,
                        range: [0, 999],
                        pattern: 'digits',
                        msg: _("Millisecond must be a number between 0 and 999.").t()
                    },
                    {
                        fn: 'validateFullTime'
                    }
                ]
            },
            validateFullTime: function(value, attr, computedState) {
                if (computedState.hour === 24) {
                    if (((attr === "minute") || (attr === "second") || (attr === "millisecond")) && (value > 0)) {
                        return _("You cannot set the time greater than 24:00:00.000.").t();
                    }
                }
            },
            setHoursMinSecFromStr: function(time, options) {
                //assumes format hours:min:sec.millsec (00:00:00.000)
                var error_msg, error_object,
                    timeArray = time.split(":");
                if (timeArray.length == 3){
                    var secondsArray = timeArray[2].split('.');
                    if (secondsArray.length == 2){
                        return this.set(
                            {
                                hour: parseInt(timeArray[0], 10),
                                minute: parseInt(timeArray[1], 10),
                                second: parseInt(secondsArray[0], 10),
                                millisecond: parseInt(secondsArray[1], 10)
                            },
                            options
                        );
                    }
                    error_msg = _("Could not parse the time stamp given into second and millisecond.").t();                    
                } else {
                    error_msg = _("Could not parse the time stamp given into hour, minute, second, and millisecond.").t();
                }
                error_object = {
                    second: error_msg
                };
                this.trigger("validated", false, this, error_object);
                this.trigger("validated:invalid", this, error_object);
                return false;
            },
            setMonDayYearFromJSDate: function(jsDate, options) {
                return this.set(
                    {
                        year: jsDate.getFullYear(),
                        month: jsDate.getMonth(),
                        day: jsDate.getDate(),
                        hour: 0,
                        minute: 0,
                        second: 0,
                        millisecond: 0
                    }, 
                    options
                );
            },
            setFromJSDate: function(jsDate, options) {
                return this.set(this.convertDateToAttrsObject(jsDate), options);
            },
            jsDate: function(){
                var year = this.get('year'),
                    month = this.get('month'),
                    day = this.get('day'),
                    hour =  this.get('hour'),
                    minute = this.get('minute'),
                    second = this.get('second'),
                    millisecond = this.get('millisecond');
                if (this.isValid(true) && !_.isUndefined(year) && !_.isUndefined(month) &&
                        !_.isUndefined(day) && !_.isUndefined(hour) && !_.isUndefined(minute) &&
                        !_.isUndefined(second) && !_.isUndefined(millisecond)){
                    return new Date(year, month, day, hour, minute, second, millisecond);
                }
                throw "You have an invalid DateTime object for creating a JSDate.";
            },
            strftime: function(formatString) {
                return this.jsDate().strftime(formatString);
            },
            isoWithoutTZ: function(){
                return this.strftime("%Y-%m-%dT%H:%M:%S.%Q");
            },
            unixEpoch: function(){
                return this.strftime("%s.%Q");
            },
            time: function(){
                return this.strftime("%H:%M:%S.%Q");
            },
            dateFormat: function(){
                return $.datepicker._defaults['dateFormat'];
            },
            formattedDate: function(){
                return $.datepicker.formatDate(this.dateFormat(), this.jsDate());
            },
            convertDateToAttrsObject: function(jsDate) {
                return ({
                    year: jsDate.getFullYear(),
                    month: jsDate.getMonth(),
                    day: jsDate.getDate(),
                    hour: jsDate.getHours(),
                    minute: jsDate.getMinutes(),
                    second: jsDate.getSeconds(),
                    millisecond: jsDate.getMilliseconds()
                });
            }
        },
        // class-level properties
        {
            createFromIsoString: function(isoString) {
                var pieces = ISO_WITH_TZ_REGEX.exec(isoString);
                if(!pieces || pieces.length !== 8) {
                    throw ('Invalid ISO string: ' + isoString);
                }
                // the above only verifies that the time string had the correct format,
                // next make sure it also represents a valid time
                var dtModel = new DateTime({
                    year: parseInt(pieces[1], 10),
                    month: parseInt(pieces[2], 10) - 1, // convert to zero-indexed
                    day: parseInt(pieces[3], 10),
                    hour: parseInt(pieces[4], 10),
                    minute: parseInt(pieces[5], 10),
                    second: parseInt(pieces[6], 10),
                    millisecond: parseInt(pieces[7], 10)
                });

                if(!dtModel.isValid(true)) {
                    throw ('Invalid time encoded: ' + isoString);
                }
                return dtModel;
            }
        });

        return DateTime;
    }
);

define('models/TimeRange',
    [
        'jquery',
        'underscore',
        'splunk.i18n',
        'models/Base',
        'collections/services/search/TimeParsers',
        'util/splunkd_utils',
        'util/time_utils'
    ],
    function($, _, i18n, BaseModel, TimeParsersCollection, splunkd_utils, time_utils) {
        return BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
                this.timeParsers = new TimeParsersCollection();
                this.associated.timeParsers = this.timeParsers;
                this.units = time_utils.TIME_UNITS;
            },
            defaults: {
                enableRealTime: true
            },
            validation: {
                earliest: [
                    {},
                    {
                        fn: 'validateTime'
                    }
                ],
                latest: [
                    {},
                    {
                        fn: 'validateTime'
                    }
                ]
            },
            validateTime: function(value, attr, computedState) {
                var earliest_time_attr = (computedState.earliest || ""),
                    latest_time_attr = (computedState.latest || ""),
                    enableRealTime = this.get('enableRealTime'),
                    is_earliest_rt = time_utils.isRealtime(earliest_time_attr),
                    is_latest_rt = time_utils.isRealtime(latest_time_attr),
                    earliest_time = time_utils.stripRTSafe(earliest_time_attr, false),
                    latest_time = time_utils.stripRTSafe(latest_time_attr, true);
                
                if (earliest_time && latest_time && (earliest_time === latest_time) && (attr === "latest")) {
                    return _("You cannot have equivalent times.").t();
                } else if (!enableRealTime) {
                    if (((is_earliest_rt && is_latest_rt) && (attr === "latest")) ||
                            ((is_earliest_rt && !is_latest_rt && (attr === "earliest")) ||
                            (is_latest_rt && !is_earliest_rt && (attr === "latest")))) {
                        return _("rt time values are not allowed").t();
                    }
                } else {
                    if (is_earliest_rt && !is_latest_rt && (attr === "latest")) {
                        return _("You must set a rt value for latest time if you set a rt value for earliest time.").t();
                    } else if (!is_earliest_rt && is_latest_rt && (attr === "earliest")) {
                        return _("You must set a rt value for earliest time if you set a rt value for latest time.").t();
                    }                    
                }
            },
            sync: function(method, model, options) {
                var deferredResponse = $.Deferred(),
                    rootModel = model,
                    rootOptions = options,
                    timeParsers,
                    timeParsersISO,
                    times = [],
                    data = {},
                    error_msg,
                    latest,
                    earliest;
                switch (method) {
                    case 'create':
                        earliest = time_utils.stripRTSafe(((model.get('earliest') || '') + ''), false);
                        if (earliest) {
                            times.push(earliest);
                        }   
                        latest = time_utils.stripRTSafe(((model.get('latest') || '') + ''), true);
                        if (latest) {
                            times.push(latest);
                        }
                        if (!times.length) {
                            options.success(model, data, options);
                            model.trigger('sync', model, data, options);
                            deferredResponse.resolve.apply(this, []);
                            return deferredResponse.promise();
                        }

                        //get epoch
                        this.timeParsers.reset([]);
                        this.timeParsersXHR = this.timeParsers.fetch({
                            data: {
                                time: times,
                                output_time_format: '%s.%Q|%Y-%m-%dT%H:%M:%S.%Q%:z'
                            },  
                            success: function() {
                                var timeParserEarliest = this.timeParsers.get(earliest),
                                    timeParserEarliestParts = timeParserEarliest ? (timeParserEarliest.get('value') || '').split('|') : [],
                                    timeParserEarliestEpoch = timeParserEarliestParts[0],
                                    timeParserEarliestISO = timeParserEarliestParts[1],
                                    timeParserLatest = this.timeParsers.get(latest),
                                    timeParserLatestParts = timeParserLatest ? (timeParserLatest.get('value') || '').split('|') : [],
                                    timeParserLatestEpoch = timeParserLatestParts[0],
                                    timeParserLatestISO = timeParserLatestParts[1];
                                if (timeParserEarliest) {
                                    data.earliest_epoch = parseFloat(timeParserEarliestEpoch);
                                }
                                if (timeParserLatest) {
                                    data.latest_epoch = parseFloat(timeParserLatestEpoch);
                                }
                                if (timeParserEarliestISO) {
                                    data.earliest_iso = timeParserEarliestISO;
                                    data.earliest_date = time_utils.isoToDateObject(timeParserEarliestISO);
                                }
                                if (timeParserLatestISO) {
                                    data.latest_iso = timeParserLatestISO;
                                    data.latest_date = time_utils.isoToDateObject(timeParserLatestISO);
                                }
                                if (timeParserEarliest && timeParserLatest) {
                                    var earliestRounded = (Math.round(data.earliest_epoch * 1000) / 1000),
                                        latestRounded = (Math.round(data.latest_epoch * 1000) / 1000);
                                    
                                    if (earliestRounded === latestRounded) {
                                        error_msg = splunkd_utils.createSplunkDMessage(
                                            splunkd_utils.ERROR,
                                            _("You cannot have equivalent times.").t()
                                        );
                                    }
                                    if (earliestRounded > latestRounded) {
                                        error_msg = splunkd_utils.createSplunkDMessage(
                                            splunkd_utils.ERROR,
                                            _("Earliest time cannot be greater than latest time.").t()
                                        );
                                    }
                                    if (error_msg) {
                                        rootOptions.error && rootOptions.error(rootModel, error_msg, rootOptions);
                                        rootModel.trigger('error', rootModel, error_msg, rootOptions);
                                        deferredResponse.reject.call(this, error_msg, 'error');
                                        return;
                                    }
                                }
                                rootOptions.success(rootModel, data, rootOptions);
                                rootModel.trigger('sync', rootModel, data, rootOptions);
                                deferredResponse.resolve.apply(this, arguments);
                            }.bind(this),
                            error: function() {
                                var message = splunkd_utils.createSplunkDMessage(
                                    splunkd_utils.ERROR,
                                    _("You have an invalid time in your range.").t()
                                );
                                rootOptions.error && rootOptions.error(rootModel, message, rootOptions);
                                rootModel.trigger('error', rootModel, message, rootOptions);
                                deferredResponse.reject.apply(this, arguments);
                            }
                        });
                        return deferredResponse.promise();
                    default:
                        throw 'Operation not supported';
                }
            },
            
            /**
             * Convenience pass through methods to time_utils
             */
            getTimeParse: function(attr) {
                return time_utils.parseTimeString(this.get(attr));
            },
            isRealtime: function(attr) {
                return time_utils.isRealtime(this.get(attr));
            },
            isAbsolute: function(attr) {
                return time_utils.isAbsolute(this.get(attr));
            },
            isEpoch: function(attr) {
                return time_utils.isEpoch(this.get(attr));
            },
            isWholeDay: function(attr) {
                return time_utils.timeAndJsDateIsWholeDay(this.get(attr), this.get(attr + '_date'));
            },
            latestIsNow: function() {
                return time_utils.isNow(this.get('latest'));
            },
            hasNoEarliest: function() {
                return time_utils.isEmpty(this.get('earliest'));
            },

            /**
            * presets: <collections.services.data.ui.TimesV2>
            **/
            generateLabel: function(presets) {               
                return time_utils.generateLabel(presets, this.get('earliest'), this.get("earliest_date"), this.get('latest'), this.get("latest_date"));
            },
            fetchAbort: function() {
                BaseModel.prototype.fetchAbort();
                if (this.timeParsersXHR && this.timeParsersXHR.state && this.timeParsersXHR.state()==='pending') {
                    this.timeParsersXHR.abort();
                }
            }
        });
    }
);

define('models/services/authentication/User',[
    'underscore',
    'models/SplunkDBase'
],
function(_, SplunkDBaseModel) {
    return SplunkDBaseModel.extend({
        urlRoot: "authentication/users",
        url: "authentication/users",
        initialize: function() {
            SplunkDBaseModel.prototype.initialize.apply(this, arguments);
        },
        getCapabilities: function() {
            return this.entry.content.get('capabilities') || [];
        },
        //the ability to run searches.
        canSearch: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "search") !== -1);
        },
        //the ability to run real-time searches.
        canRTSearch: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "rtsearch") !== -1);
        },
        canScheduleRTSearch: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "schedule_rtsearch") !== -1);
        },
        //the ability to schedule saved searches, create and update alerts, review triggered alert information, and turn on report acceleration for searches.
        canScheduleSearch: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "schedule_search") !== -1);
        },
        //the ability to add new or edit existing inputs
        canEditMonitor: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "edit_monitor") !== -1);
        },
        canManageRemoteApps: function() {
            return this.isNew() || (_.indexOf(this.getCapabilities(), "rest_apps_management") !== -1);
        }
    });
});
define('models/services/data/ui/Nav',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "data/ui/nav",
            id: "data/ui/nav",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('models/services/data/UserPref',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "data/user-prefs",
            id: "data/user-prefs/general",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);
define('models/services/server/ServerInfo',
    [
        'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            urlRoot: "server/info",
            id: 'server-info',
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);

define('util/router_utils',
    [
        'jquery',
        'backbone',
        'splunk.util'
    ],
    function($, Backbone, splunkutil) {
        var exports = {},
            routeStripper = /^[#\/]|\s+$/g;

        //Introduced in 0.9.9, see https://github.com/documentcloud/backbone/issues/2440
        Backbone.history.getFragment = function(fragment, forcePushState) {
          var trailingSlash = /\/$/;
          if (fragment == null) {
              if (this._hasPushState || !this._wantsHashChange || forcePushState) {
                  fragment = this.location.pathname;
                  var search = window.location.search;
                  if (search) {
                      fragment += search;
                  }
                  var root = this.root.replace(trailingSlash, '');
                  if (!fragment.indexOf(root)) {
                      fragment = fragment.substr(root.length);
                  }
              } else {
                  fragment = this.getHash();
              }
          }
          return exports.strip_route(fragment);
        };

        exports.strip_route = function(route) {
            return route.replace(routeStripper, '');
        };

        exports.start_backbone_history = function() {
            var hasPushstate = "pushState" in window.history;
            if (!hasPushstate) {
                $(document).ready(function() {
                    var hash = Backbone.history.getHash(),
                        splitHash = hash.split('?'),
                        hashPath = splitHash[0] || "",
                        hashQuery = splunkutil.queryStringToProp(splitHash[1] || ''),
                        locationQuery = splunkutil.queryStringToProp(window.location.search.split('?')[1] || ''),
                        mergedQuery = $.extend(locationQuery, hashQuery),
                        flattenedQuery = splunkutil.propToQueryString(mergedQuery);

                    window.location.hash = (hashPath ? hashPath : exports.strip_route(window.location.pathname))
                                                + (flattenedQuery ? ("?" + flattenedQuery) : "");
                    Backbone.history.start();
                });
            } else {
                Backbone.history.start({pushState: true});
            }
        };
        return exports;
    }
);
define('models/classicurl',
    [
        'jquery',
        'splunk.util',
        'backbone',
        'models/Base',
        'util/router_utils'
    ],
    function($, util, Backbone, BaseModel, routerUtils) {
        var Model = BaseModel.extend({
            id: 'classicURL',
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            sync: function(method, model, options) {
                var resp,
                    state,
                    dfd = $.Deferred();
                options = options || {};

                var silentClear = options.silentClear;
                var replaceState = options.replaceState;

                delete options.silentClear;
                delete options.replaceState;

                if (silentClear) {
                    model.clear({silent: true});
                }

                if (method==='read') {
                    resp = model.currentQueryString();
                } else if (method==='create' || method==='update') {
                    state = model.toURLEncodedQueryString();
                    if (replaceState){
                        model.replaceState(state, options);
                    } else {
                        model.pushState(state, options);
                    }
                    resp = this.currentQueryString();
                } else if (method==='delete') {
                    this.pushState('', options);
                    resp = this.currentQueryString();
                } else {
                    throw new Error('invalid method: ' + method);
                }
                options.success(model, resp, options);
                return dfd.resolve(model, resp, options).promise();
            },
            parse: function(response) {
                return util.queryStringToProp(response);
            },
            currentQueryString: function() {
                var fragment;
                if (Backbone.history._hasPushState) {
                    return window.location.href.split('?')[1] || '';//not safe to read directly
                }
                fragment = window.location.href.split('#')[1] || '';//not safe to read directly
                return fragment.split('?')[1] || '';
            },
            pushState: function(data, options) {
                if (data){
                    data = '?' + data;
                }
                Backbone.history.navigate(this.root() + data, $.extend(true, {}, options, {replace: false}));
            },
            replaceState: function(data, options) {
                if (data) {
                    data = '?' + data;
                }
                Backbone.history.navigate(this.root() + data, $.extend(true, {}, options, {replace: true}));
            },
            root: function() {
                return Backbone.history._hasPushState ? window.location.pathname :
                        '#' + routerUtils.strip_route(window.location.pathname);
            }
        });
        return new Model();
    }
);
