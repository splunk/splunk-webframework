
define('swfobject',{});
Splunk.namespace("Splunk.Messenger");

/**
 * A controller like class who carries a message.
 *
 * Example:
 * var broker = new Splunk.Messenger.Bus();
 *
 * //Send a message.
 * broker.send("info", "Info message a", "foobar_b", null, null);
 * broker.send("info", "Info message b", "foobar_a", null, null);
 *
 * //Get all messages.
 * broker.receive(null, null, function(message){
 *     alert("Got some arbitrary message object.");
 * });
 *
 * //Get all messages filtered by level 'info'.
 * broker.receive({"level":"info"}, null, function(message){
 *     alert("Got a a message object with a level of info.");
 * });
 *
 * //Get all messages filtered by level 'info' and ordered by date.
 * broker.receive({"level":"info"}, ['date'], function(msg){
 *     alert("Got a message object with a level of info sorted by date (latest first).");
 * });
 */
Splunk.Messenger.Bus = $.klass({
    DATE_FORMAT: "%Y-%m-%dT%H:%M:%S",
    MAX_SUBJECTS_BUFFER: 100,
    MAX_OBSERVERS_BUFFER: 200,
    /**
     * Initializes Messenger Bus.
     */
    initialize: function(){
        this.count = 1;
        this.id = 0;
        this.logger = Splunk.Logger.getLogger("Splunk.Messenger.Bus");
        this.observers = [];
        this.subjects = [];
        $(window).bind("unload", this.gc.bind(this));
    },
    /**
     * Create a new observer object.
     *
     * @param {Object||null} filter An object literal key/value filter: {(key) {String} One of x properties for an Object: (value) {String || RegExp} An arbitrary string value to match or regular expression object, all matching.
     * @param {Array||null} sort An Array of key values to sort by.
     * @param {Boolean} negate If you wish to negate the entire filter, matching only items that do not match the filter.
     * @param {Boolean} cancel Stop the propogation of notification to other observers.
     * @return An new observer object.
     * @type Object
     */
    createObserver: function(filter, sort, callback, negate, cancel){
        filter.control = filter.hasOwnProperty('control') ? filter.control : true;
        return {
            'filter':filter,
            'sort':sort,
            'callback':callback,
            'negate':negate,
            'cancel':cancel
        };
    },
    /**
     * Create a new subject object.
     *
     * @param {String} level The severity level.
     * @param {String} content The message content.
     * @param {*} className The class identifier for the message of any type.
     * @param {String} date The UTC ISO Date.
     * @param {String} id An id value (Does not have to be unique).
     * @return An new subject object.
     * @type Object
     */
    createSubject: function(level, content, className, date, id, control){
        return {
            'level':level,
            'control':control,
            'content':content,
            'className':className,
            'date':date,
            'id': id
        };
    },
    /**
     * Filter an Array of Objects given an arbitrary set of key/value pairs.
     *
     * @param {Array} arrayOfObjects An array of object literal values.
     * @param {Object} kv An object literal key/value filter: {(key) {String} One of x properties for an Object: (value) {String || RegExp} An arbitrary string value to match or regular expression object, all matching.
     * @return Matching (included) and non-matching (excluded) subject(s).
     * @type Object
     */
    filter: function(arrayOfObjects, kv){
        var included = [];
        var excluded = [];
        for(i=0; i<arrayOfObjects.length; i++){
            var object = arrayOfObjects[i];
            var match = true;
            for(var k in kv){
                if(kv.hasOwnProperty(k) && object.hasOwnProperty(k) && object[k] !== undefined &&
                    ((k=='control' && (kv[kv]||!object[k])
                    || ((kv[k] instanceof RegExp)?object[k].search(kv[k])!=-1:kv[k]==object[k])))){
                    continue;
                }else{
                    match = false;
                    break;
                }
            }
            if(match){
                included.push(object);
            }else{
                excluded.push(object);
            }
        }
        return {"included":included, "excluded":excluded};
    },
    /**
     * Garbage collection routine.
     */
    gc: function(){
        this.observers = [];
    },
    /**
     * Create an empty subject object.
     *
     * @return An empy subject.
     * @type Object
     */
    getEmptySubject: function(){
        return this.createSubject("", "", "", "", "", false);
    },
    /**
     * Get a unique id with zero padding.
     */
    getUniqueId: function(){
        this.id++;
        var paddingLength = [this.MAX_OBSERVERS_BUFFER].join("").length + 1;
        var zeropad = [this.id, ""].join("");
        while(zeropad.length<paddingLength){
            zeropad = ["0", zeropad].join("");
        }
        return zeropad;
    },
    /**
     * Get matching subject item(s) based on optional filter and sort criteria.
     *
     * @param {Boolean} del Delete the entire message queue after retrieval.
     * @param {Object||null} filter An object literal key/value filter: {(key) {String} One of x properties for an Object: (value) {String || RegExp} An arbitrary string value to match or regular expression object, all matching.
     * @param {Array||null} sort An Array of key values to sort by.
     * @param {Boolean} (Optional) negate If you wish to negate the entire filter, matching only items that do not match the filter.
     * @return Matched subject(s).
     * @type Array
     */
    getSubjects: function(del, filter, sort, negate){
        negate = arguments[3] || false;
        //this.logger.info("Filter negation enabled", arguments);
        var filtered = (filter && this.hasSubjectProperty(filter))?this.filter(this.subjects, filter):{"included":this.subjects.concat([]), "excluded":[]};
        var included = (negate)?filtered.excluded:filtered.included;
        var excluded = (negate)?filtered.included:filtered.excluded;
        if(del){
            this.subjects = excluded;
        }
        return (sort && sort.length>0)?this.sort(included, sort):included;
    },
    /**
     * Get the length of matching subjects.
     *
     * @param {Object||null} filter An object literal key/value filter: {(key) {String} One of x properties for an Object: (value) {String || RegExp} An arbitrary string value to match or regular expression object, all matching.
     * @param {Boolean} (Optional) negate If you wish to negate the entire filter, matching only items that do not match the filter.
     * @return The length of matching queue entities.
     * @type Number
     */
    getSubjectLength: function(filter){
        var negate = arguments[1] || false;
        return this.getSubjects(false, filter, null, negate).length;
    },
    /**
     * Check if an object has a subject property.
     *
     * @param {Object} object An object to check properties against.
     * @return If the object has a queue entity property.
     * @type Boolean
     */
    hasSubjectProperty: function(object){
        for(var property in object){
            if(this.isValidSubjectProperty(property)){
                return true;
            }
        }
        return false;
    },
    /**
     * Check if a subject has all required properties.
     *
     * @param {Object} object An object to check properties against.
     * @return If the object is a valid queue entity.
     * @type Boolean
     */
    isValidSubject: function(object){
        var subject = this.getEmptySubject();
        for(var property in subject){
            if(subject.hasOwnProperty(property) && !object.hasOwnProperty(property)){
                return false;
            }
        }
        return true;
    },
    /**
     * Check if subject property is valid.
     *
     * @param {String} property A property to validate.
     * @return If the property is a queue entity property.
     * @type Boolean
     */
    isValidSubjectProperty: function(property){
        var subject = this.getEmptySubject();
        return (subject.hasOwnProperty(property))?true:false;
    },
    /**
     * Send notification to all observers.
     *
     * @param {Array} observers An array of observers.
     */
    notify: function(observers){
        //this.logger.info("notify subject(s)");
        observers = observers.concat([]).sort(this.observerNotifySortby.bind(this));
        var observer;
        for(var j=0; j<observers.length; j++){
            observer = observers[j];
            var subjects = this.getSubjects(observer.cancel, observer.filter, observer.sort, observer.negate);
            for(var k=0; k<subjects.length; k++){
                var subject = subjects[k];
                this.logger.info(subject);
                try{
                    observer.callback(subject);
                }catch(e){
                    //setTimeout(function(e){throw e;}, 0);//Keep on trucking...
                }
            }
        }
        for(var l=0; l<observers.length; l++){
            observer = observers[l];
            this.getSubjects(true, observer.filter, null, observer.negate);//remove all matched observers.
        }
    },
    /**
     * Sort pattern for observer notification.
     *
     * @param {Object} a
     * @param {Object} b
     * @return Defaults to 0, no sort required.
     * @type Number
     * @return
     * < 0: Sort "a" to be a lower index than "b"
     * = 0: "a" and "b" should be considered equal, and no sorting performed.
     * > 0: Sort "b" to be a lower index than "a".
     */
    observerNotifySortby: function(a, b){
        return 0;
    },
    /**
     * Create an observer of subjects(s).
     *
     * @param {Object||null} filter An object literal key/value filter: {(key) {String} One of x properties for an Object: (value) {String || RegExp} An arbitrary string value to match or regular expression object, all matching.
     * @param {Array||null} sort An Array of key values to sort by.
     * @param {Function} callback A callback handler to call with the matching message.
     * @param {Boolean} negate If you wish to negate the entire filter, matching only items that do not match the filter.
     * @param {Boolean} cancel Stop the propogation of notification to other observers.
     */
    receive: function(filter, sort, callback, negate, cancel){
        var observer = this.createObserver(filter, sort, callback, negate, cancel);
        if(this.observers.length>=this.MAX_OBSERVERS_BUFFER){
            this.logger.warn("observers length exceeds MAX_OBSERVERS_BUFFER constraint of", this.MAX_OBSERVERS_BUFFER, "dropping earliest item.");
            this.observers.shift();
        }
        this.observers.push(observer);
        this.notify([observer]);
    },
    /**
     * Send a subject.
     *
     * @param {String} level The severity level.
     * @param {String} content The message string text.
     * @param {*} className The class identifier for the message of any type.
     * @param {String || null} id An id value (Does not have to be unique), if null generates a unique value.
     * @param {String || null} date An optional UTC ISO Date, if null defaults value of now is added.
     */
    send: function(level, content, className, id, date, control){
        //this.logger.info("send message");
        date = date || (new Date()).strftime(this.DATE_FORMAT);
        id = id || this.getUniqueId();
        control = control ? true : false;
        var subject = this.createSubject(level, content, className, date, id, control);
        if(this.subjects.length>=this.MAX_SUBJECTS_BUFFER){
            this.logger.warn("subjects length exceeds MAX_SUBJECTS_BUFFER constraint of", this.MAX_SUBJECTS_BUFFER, "dropping earliest item.");
            this.subjects.shift();
        }
        this.logger.info(sprintf('MSG [%s, %s] %s', level, className, content));
        this.subjects.push(subject);
        this.notify(this.observers);
    },
    /**
     * Sort an Array of Objects given an arbitrary set of key/value pairs in (default is alpha ordering).
     *
     * @param {Array} arrayOfObjects An array of object literal values.
     * @param {Array} key An Array of key values to sort by.
     * @return A sorted array of objects.
     * @type Object
     */
    sort: function(arrayOfObjects, keys){
        var sortedArray = arrayOfObjects.concat([]);
        for(var i=0; i<keys.length; i++){
            var k = keys[i];
            sortedArray.sort(function(a, b){
                if(!a.hasOwnProperty(k) || !b.hasOwnProperty(k)){
                    this.logger.warn("Cannot sort with invalid key", k);
                    return 0;
                }else{
                    return ([a[k], b[k]].sort()[0]!==a[k])?1:-1;
                }
            });
        }
        return sortedArray;
    }
});
/**
 * Augment Bus for application specific implementation. Based on className hierarchy and splunkd server messaging.
 * Overrides send and receive methods.
 *
 * Example:
 * var broker = Splunk.Messenger.System.getInstance();
 *
 * //Send a message.
 * broker.send("info", "splunk", "This is a message");
 * broker.send("info", "splunk.search.job", "This is a message");
 * broker.send("info", "splunk.search", "This is a message");
 *
 * //Get all messages.
 * broker.receive("splunk.search.job", function(message){
 *     alert("Got one message matching className splunk.search.job.");
 * });
 *
 * broker.receive("splunk", function(message){
 *     alert("Got any message matching className splunk or splunk.search");
 * });
 *
 * //Get all non-matching messages.
 * broker.receive("*", function(msg){
 *     alert("Got a message that is neither splunk, splunk.search or splunk.search.job");
 * });
 */
Splunk.Messenger.System = $.klass(Splunk.Messenger.Bus, {
    RECEIVE_WILD_CARD: "*",
    RECEIVE_LEVELS: ["persistent", "info", "warn", "error", "fatal"],
    RECEIVE_LEVEL: "fatal",
    REQUEST_TIMEOUT: 5000,
    SERVER_ENABLED: true,
    SERVER_POLL_INTERVAL: 60000,
    SERVER_RESOURCE: Splunk.util.make_url("/api/messages/index"),
    SERVER_CLASSIFIER: "splunk.services",
    SERVER_SESSION_EXPIRED_MESSAGE: _("Your session has expired."),
    SERVER_DOWN_MESSAGE: _("Your network connection may have been lost or Splunk web may be down."),
    SERVER_BACK_UP_MESSAGE: _("Your network connection was either restored or Splunk web was restarted."),    
    
    // number of consecutive request failures to throw warning to user
    // about potential connection issues
    OFFLINE_WARNING_THRESHOLD: 2,

    /**
     * Intializes Messenger System.
     *
     * @param {Object} super
     */
    initialize: function($super){
        $super();
        this.logger = Splunk.Logger.getLogger("Splunk.Messenger.System");
        this.intervalId = null;
        this.isRequestQueued = false;
        this.isServerDown = false;
        this.errorCount = 0;
        this.abortRequests = false;
        this.previousEtag = "";
        if(this.SERVER_ENABLED && typeof DISABLE_MESSENGER === 'undefined') {
            setTimeout(this.getServerMessages.bind(this), 0);//chrome throttle for status code of 0
            this.startPoller();
        }
        $(document).bind("SessionTimeout", this.onSessionTimeout.bind(this));
        $(document).bind("SessionStart", this.onSessionStart.bind(this));
    },
    /**
     * Serialize a className into a hierarchy matching RegExp object.
     *
     * @param {String} className
     * @type RegExp
     * @return RegExp serialized className.
     */
    classNameSerialize: function(className){
        var regex;
        if(!className)
            className = this.RECEIVE_WILD_CARD;
        if(className===this.RECEIVE_WILD_CARD){
            regex = /./;
        }else{
            var classNameParts = className.split(".");
            if(classNameParts.length===0){
                classNameParts = [className];
            }
            var pattern = "^" + classNameParts.join("\.");
            try{
                regex = new RegExp(pattern);
            }catch(e){
                this.logger.error("Could not create RegExp object for className", className);
                return null;
            }
        }
        return regex;
    },
    /**
     * Retrieve messages from the app server.
     */
    getServerMessages: function(){
        if(!this.isRequestQueued && !this.abortRequests){
            this.isRequestQueued = true;
            $.ajax({
                type: "GET",
                url: this.SERVER_RESOURCE,
                dataType: "text",
                beforeSend: function(XMLHttpRequest){
                    try {
                        XMLHttpRequest.setRequestHeader("If-None-Match", this.previousEtag);
                    } catch(e) {
                        // IE6 does not have setRequestHeader()
                    }
                }.bind(this),
                timeout: this.REQUEST_TIMEOUT,
                error: this.onServerMessagesError.bind(this),
                complete: this.onServerMessagesComplete.bind(this)
            });
            //this.logger.info("Getting messages from server.");
        }
    },
    /**
     * Override sort pattern for observer notification. Follows class hiearchy pattern: aaa.bbb.ccc, aaa.bbb, aaa, *.
     *
     * @param {Object} a
     * @param {Object} b
     * @return Defaults to 0, no sort required.
     * @type Number
     * @return
     * < 0: Sort "a" to be a lower index than "b"
     * = 0: "a" and "b" should be considered equal, and no sorting performed.
     * > 0: Sort "b" to be a lower index than "a".
     */
    observerNotifySortby: function(a, b){
        var classNameA = (a.filter.className instanceof RegExp)?a.filter.className.toString():a.filter.className;
        var classNameB = (b.filter.className instanceof RegExp)?b.filter.className.toString():b.filter.className;
        var classNameWildCard = this.classNameSerialize(this.RECEIVE_WILD_CARD).toString();
        if(classNameA===classNameWildCard){    
            return 1;
        }else if(classNameB===classNameWildCard){
            return -1;
        }else{
            return ([classNameA, classNameB].sort()[0]!==classNameA)?1:-1;
        }
    },
    /**
     * Handle error repsonse from jQuery $.ajax
     */
    onServerMessagesError: function(){
        //this.logger.error("onServerMessagesError fired");
    },
    /**
     * Handle a splunk appserver jsonresponse envelope.
     *
     * @param {Object} data The XMLHttpRequest object.
     * @param {String} textStatus A string describing the type of success of the request.
     */
    onServerMessagesComplete: function(data, textStatus){
        this.isRequestQueued = false;
        this.previousEtag = data.getResponseHeader("Etag");
        switch(data.status){
            case 0:
         	case 12029: //IE9(prob 8 as well) has it's own HTTP error status of 12029.. WTF?! 
                this.errorCount++;
         		this.previousEtag = new Date();
                if (this.errorCount >= this.OFFLINE_WARNING_THRESHOLD) {
                    this.isServerDown = true;
                    this.send("error", this.SERVER_CLASSIFIER, this.SERVER_DOWN_MESSAGE);
                    this.logger.warn("Server message timeout, offline");           	
                }
            	break;
            case 304:
                this.errorCount = 0;
                break;
            case 412:
                this.abortRequests = true;
                this.send("error", this.SERVER_CLASSIFIER, this.SERVER_SESSION_EXPIRED_MESSAGE);
                this.logger.warn("Server message session expired, abort further requests.");
                break;
            case 200:
                this.errorCount = 0;
                if(this.isServerDown){
                    this.logger.info("Server message back online.");
                    this.isServerDown = false;
                    this.previousEtag = new Date();
                    
                    // all messages from this persistent store should be marked as 'persistent'
                    this.send("persistent", this.SERVER_CLASSIFIER, this.SERVER_BACK_UP_MESSAGE);
                    break;
                }
                this.processResponse(data);
                break;
            default:
                break;
        }
    },
    /**
     * Handle Splunk.Session start event, ensure abortRequests is false to enable poller http requests.
     * 
     * @param {Object} event A jQuery event object.
     * @param {Date} date The fire time of the event.
     */    
    onSessionStart: function(event, date){
        this.logger.info("Starting message poller...");
        this.abortRequests = false;
    },    
    /**
     * Handle Splunk.Session timeout event, ensure abortRequests is true to cancel poller http requests.
     * 
     * @param {Object} event A jQuery event object.
     * @param {Date} date The fire time of the event.
     */
    onSessionTimeout: function(event, date){
        this.logger.info("Stopping message poller...");
        this.abortRequests = true;
    },
    /**
     * Process response data from messages endpoint.
     * 
     * @param {Object} data The XMLHttpRequest object.
     */
    processResponse: function(data){
        try{
            this.logger.info("Server message process response");
            data = JSON.parse(data.responseText);
        }catch(e){
            this.logger.warn("Could not parse server messages with error");
            return;
        }
        for(var i=0; i<data.messages.length; i++){
            var dataObj = data.messages[i];
            if(dataObj.hasOwnProperty("type") && dataObj.hasOwnProperty("message")){
                try{
                    this.send(dataObj.type.toLowerCase(), this.SERVER_CLASSIFIER, dataObj.message, dataObj.id);
                }catch(e){
                    this.logger.error("Could not send message through bus", e);
                }
            }else{
                this.logger.error("Missing jsonresponse property from app server.");
            }
        }        
    },
    /**
     * Override receive method based on className and id.
     *
     * @param {String} className The class identifier for the message following ("foo.bar" convention, "*" for all non-matched classNames)
     * @param {Function} callback A callback handler to call with the matching message.
     * @param {String} (Optional) id An id value (Does not have to be unique).
     */
    receive: function($super, className, callback, id, control){

        if(!className)
            className = this.RECEIVE_WILD_CARD;
        var classNameRegExp = this.classNameSerialize(className);
        if(!classNameRegExp){
            return;
        }
        for(var i=0; i<this.RECEIVE_LEVELS.length; i++){
            var filter = {};
            filter.className = classNameRegExp;
            if(id){
                filter.id = id;
            }
            if(control)
                filter.control = true;
            filter.level = this.RECEIVE_LEVELS[i];
            var uniqueReceiver = true;
            for(var j=0; j<this.observers.length; j++){
                var observerFilter = this.observers[j].filter;
                if((observerFilter.level && observerFilter.level===filter.level) && (observerFilter.className && observerFilter.className.toString()===filter.className.toString())){
                    uniqueReceiver = false;
                    this.logger.warn("Can't add another receiver with level", filter.level, "for already observed className", className);
                    break;
                }
            }
            if(uniqueReceiver){
                $super(filter, null, callback, false, true);
            }
            if(this.RECEIVE_LEVELS[i]===this.RECEIVE_LEVEL){
                break;
            }
        }
    },
    /**
     * Reset polling the server at a set interval for messages.
     */
    resetPoller: function(){
        if(this.intervalId){
            clearInterval(this.intervalId);
        }
        this.startPoller();
    },
    /**
     * Override send method.
     *
     * @param {String} level The severity level.
     * @param {String} className className The class identifier for the message following ("foo.bar" convention)
     * @param {String} content The message string text.
     * @param {String} (Optional) id An id value (Does not have to be unique).
     */
    send: function($super, level, className, content, id, control){
        id = id || null;
        if(jQuery.inArray(level, this.RECEIVE_LEVELS)!=-1){
            if(this.SERVER_ENABLED){
                this.resetPoller();
            }
            $super(level, content, className, id, null, control);
        }else{
            this.logger.warn("Message not sent, invalid message level -", level, "- needs to be one of", this.RECEIVE_LEVELS.join(","));
        }
    },
    /**
     * Start polling the server at a set interval for messages.
     */
    startPoller: function(){
        this.intervalId = setInterval(this.getServerMessages.bind(this), this.SERVER_POLL_INTERVAL);
    },
    /**
     * Inject a control event to instruct listeners to clear their display
     */
    clear: function() {
        this.send('info', 'control', 'CLEAR', null, true);
    }
});
Splunk.Messenger.System.instance = null;
/**
 * Singleton reference to Messenger System object.
 *
 * @return A reference to a shared Messenger System object.
 * @type Object
 */
Splunk.Messenger.System.getInstance = function(){
    if(!Splunk.Messenger.System.instance){
        Splunk.Messenger.System.instance = new Splunk.Messenger.System();
    }
    return Splunk.Messenger.System.instance;
};

define("splunk.messenger", ["splunk","splunk.util","splunk.logger","splunk.i18n","lowpro"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Splunk.Messenger;
    };
}(this)));

/**
 * Requires:
 * jg_global
 * jg_library
 */

jg_import.define("splunk.time.TimeZone", function()
{
jg_namespace("splunk.time", function()
{

	this.TimeZone = jg_extend(Object, function(TimeZone, base)
	{

		// Public Methods

		this.getStandardOffset = function()
		{
			return 0;
		};

		this.getOffset = function(time)
		{
			return 0;
		};

	});

});
});

jg_import.define("splunk.time.SimpleTimeZone", function()
{
jg_namespace("splunk.time", function()
{

	var TimeZone = jg_import("splunk.time.TimeZone");

	this.SimpleTimeZone = jg_extend(TimeZone, function(SimpleTimeZone, base)
	{

		// Private Properties

		this._offset = 0;

		// Constructor

		this.constructor = function(offset)
		{
			this._offset = (offset !== undefined) ? offset : 0;
		};

		// Public Methods

		this.getStandardOffset = function()
		{
			return this._offset;
		};

		this.getOffset = function(time)
		{
			return this._offset;
		};

	});

});
});

jg_import.define("splunk.time.LocalTimeZone", function()
{
jg_namespace("splunk.time", function()
{

	var TimeZone = jg_import("splunk.time.TimeZone");

	this.LocalTimeZone = jg_extend(TimeZone, function(LocalTimeZone, base)
	{

		// Public Methods

		this.getStandardOffset = function()
		{
			var date = new Date(0);
			return -date.getTimezoneOffset() * 60;
		};

		this.getOffset = function(time)
		{
			var date = new Date(time * 1000);
			return -date.getTimezoneOffset() * 60;
		};

	});

});
});

jg_import.define("splunk.time.TimeZones", function()
{
jg_namespace("splunk.time", function()
{

	var LocalTimeZone = jg_import("splunk.time.LocalTimeZone");
	var SimpleTimeZone = jg_import("splunk.time.SimpleTimeZone");

	this.TimeZones = jg_static(function(TimeZones)
	{

		// Public Static Constants

		TimeZones.LOCAL = new LocalTimeZone();
		TimeZones.UTC = new SimpleTimeZone(0);

	});

});
});

jg_import.define("splunk.time.DateTime", function()
{
jg_namespace("splunk.time", function()
{

	var SimpleTimeZone = jg_import("splunk.time.SimpleTimeZone");
	var TimeZone = jg_import("splunk.time.TimeZone");
	var TimeZones = jg_import("splunk.time.TimeZones");

	this.DateTime = jg_extend(Object, function(DateTime, base)
	{

		// Private Static Constants

		var _ISO_DATE_TIME_PATTERN = /([\+\-])?(\d{4,})(?:(?:\-(\d{2}))(?:(?:\-(\d{2}))(?:(?:[T ](\d{2}))(?:(?:\:(\d{2}))(?:(?:\:(\d{2}(?:\.\d+)?)))?)?(?:(Z)|([\+\-])(\d{2})(?:\:(\d{2}))?)?)?)?)?/;

		// Private Static Methods

		var _normalizePrecision = function(value)
		{
			return Number(value.toFixed(6));
		};

		var _pad = function(value, digits, fractionDigits)
		{
			/*jsl:ignore*/
			// this comparison triggers the 'useless comparison' error
			if (value != value)
				return "NaN";
			/*jsl:end*/
			if (value == Infinity)
				return "Infinity";
			if (value == -Infinity)
				return "-Infinity";

			digits = (digits !== undefined) ? digits : 0;
			fractionDigits = (fractionDigits !== undefined) ? fractionDigits : 0;

			var str = value.toFixed(20);

			var decimalIndex = str.indexOf(".");
			if (decimalIndex < 0)
				decimalIndex = str.length;
			else if (fractionDigits < 1)
				str = str.substring(0, decimalIndex);
			else
				str = str.substring(0, decimalIndex) + "." + str.substring(decimalIndex + 1, decimalIndex + fractionDigits + 1);

			for (var i = decimalIndex; i < digits; i++)
				str = "0" + str;

			return str;
		};

		// Private Properties

		this._year = 0;
		this._month = 1;
		this._day = 1;
		this._weekday = 0;
		this._hours = 0;
		this._minutes = 0;
		this._seconds = 0;
		this._timeZone = TimeZones.LOCAL;
		this._timeZoneOffset = 0;
		this._time = 0;

		this._isValid = true;

		// Constructor

		this.constructor = function(yearOrTimevalue, month, day, hours, minutes, seconds, timeZone)
		{
			switch (arguments.length)
			{
				case 0:
					var now = new Date();
					this._time = now.getTime() / 1000;
					this._updateProperties();
					break;
				case 1:
					if (typeof yearOrTimevalue === "number")
					{
						this._time = yearOrTimevalue;
						this._updateProperties();
					}
					else if (typeof yearOrTimevalue === "string")
					{
						var matches = _ISO_DATE_TIME_PATTERN.exec(yearOrTimevalue);
						var numMatches = matches ? matches.length : 0;
						var match;

						match = (numMatches > 1) ? matches[1] : null;
						var yearSign = (match == "-") ? -1 : 1;

						match = (numMatches > 2) ? matches[2] : null;
						this._year = match ? yearSign * Number(match) : 0;

						match = (numMatches > 3) ? matches[3] : null;
						this._month = match ? Number(match) : 1;

						match = (numMatches > 4) ? matches[4] : null;
						this._day = match ? Number(match) : 1;

						match = (numMatches > 5) ? matches[5] : null;
						this._hours = match ? Number(match) : 0;

						match = (numMatches > 6) ? matches[6] : null;
						this._minutes = match ? Number(match) : 0;

						match = (numMatches > 7) ? matches[7] : null;
						this._seconds = match ? Number(match) : 0;

						match = (numMatches > 8) ? matches[8] : null;
						var timeZoneUTC = (match == "Z");

						match = (numMatches > 9) ? matches[9] : null;
						var timeZoneSign = (match == "-") ? -1 : 1;

						match = (numMatches > 10) ? matches[10] : null;
						var timeZoneHours = match ? Number(match) : NaN;

						match = (numMatches > 11) ? matches[11] : null;
						var timeZoneMinutes = match ? Number(match) : NaN;

						if (timeZoneUTC)
							this._timeZone = TimeZones.UTC;
						else if (!isNaN(timeZoneHours) && !isNaN(timeZoneMinutes))
							this._timeZone = new SimpleTimeZone(timeZoneSign * (timeZoneHours * 60 + timeZoneMinutes) * 60);
						else
							this._timeZone = TimeZones.LOCAL;

						this._updateTime();
					}
					else
					{
						this._time = NaN;
						this._updateProperties();
					}
					break;
				default:
					if (typeof yearOrTimevalue === "number")
					{
						this._year = yearOrTimevalue;
						this._month = (month !== undefined) ? month : 1;
						this._day = (day !== undefined) ? day : 1;
						this._hours = (hours !== undefined) ? hours : 0;
						this._minutes = (minutes !== undefined) ? minutes : 0;
						this._seconds = (seconds !== undefined) ? seconds : 0;
						this._timeZone = (timeZone instanceof TimeZone) ? timeZone : TimeZones.LOCAL;
						this._updateTime();
					}
					else
					{
						this._time = NaN;
						this._updateProperties();
					}
					break;
			}
		};

		// Public Getters/Setters

		this.getYear = function()
		{
			return this._year;
		};
		this.setYear = function(value)
		{
			this._year = value;
			this._updateTime();
		};

		this.getMonth = function()
		{
			return this._month;
		};
		this.setMonth = function(value)
		{
			this._month = value;
			this._updateTime();
		};

		this.getDay = function()
		{
			return this._day;
		};
		this.setDay = function(value)
		{
			this._day = value;
			this._updateTime();
		};

		this.getWeekday = function()
		{
			return this._weekday;
		};

		this.getHours = function()
		{
			return this._hours;
		};
		this.setHours = function(value)
		{
			this._hours = value;
			this._updateTime();
		};

		this.getMinutes = function()
		{
			return this._minutes;
		};
		this.setMinutes = function(value)
		{
			this._minutes = value;
			this._updateTime();
		};

		this.getSeconds = function()
		{
			return this._seconds;
		};
		this.setSeconds = function(value)
		{
			this._seconds = value;
			this._updateTime();
		};

		this.getTimeZone = function()
		{
			return this._timeZone;
		};
		this.setTimeZone = function(value)
		{
			this._timeZone = (value instanceof TimeZone) ? value : TimeZones.LOCAL;
			this._updateTime();
		};

		this.getTimeZoneOffset = function()
		{
			return this._timeZoneOffset;
		};

		this.getTime = function()
		{
			return this._time;
		};
		this.setTime = function(value)
		{
			this._time = value;
			this._updateProperties();
		};

		// Public Methods

		this.toUTC = function()
		{
			return this.toTimeZone(TimeZones.UTC);
		};

		this.toLocal = function()
		{
			return this.toTimeZone(TimeZones.LOCAL);
		};

		this.toTimeZone = function(timeZone)
		{
			var date = new DateTime();
			date.setTimeZone(timeZone);
			date.setTime(this._time);
			return date;
		};

		this.clone = function()
		{
			var date = new DateTime();
			date.setTimeZone(this._timeZone);
			date.setTime(this._time);
			return date;
		};

		this.equals = function(toCompare)
		{
			return ((this._time === toCompare._time) && (this._timeZoneOffset === toCompare._timeZoneOffset));
		};

		this.toString = function()
		{
			if (!this._isValid)
				return "Invalid Date";

			var str = "";
			if (this._year < 0)
				str += "-" + _pad(-this._year, 4);
			else
				str += _pad(this._year, 4);
			str += "-" + _pad(this._month, 2) + "-" + _pad(this._day, 2);
			str += "T" + _pad(this._hours, 2) + ":" + _pad(this._minutes, 2) + ":" + _pad(this._seconds, 2, 3);

			var timeZoneOffset = this._timeZoneOffset / 60;
			if (timeZoneOffset == 0)
			{
				str += "Z";
			}
			else
			{
				if (timeZoneOffset < 0)
					str += "-";
				else
					str += "+";
				if (timeZoneOffset < 0)
					timeZoneOffset = -timeZoneOffset;
				var timeZoneHours = Math.floor(timeZoneOffset / 60);
				var timeZoneMinutes = Math.floor(timeZoneOffset % 60);
				str += _pad(timeZoneHours, 2) + ":" + _pad(timeZoneMinutes, 2);
			}

			return str;
		};

		this.valueOf = function()
		{
			return this._time;
		};

		// Private Methods

		this._updateTime = function()
		{
			if (this._validate())
			{
				var years = this._year;
				var months = this._month - 1;
				var days = this._day - 1;
				var hours = this._hours;
				var minutes = this._minutes;
				var seconds = this._seconds;

				var secondsPerMinute = 60;
				var secondsPerHour = secondsPerMinute * 60;
				var secondsPerDay = secondsPerHour * 24;

				var totalMonths = months + years * 12;
				var wholeMonths = Math.floor(totalMonths);
				var subMonths = totalMonths - wholeMonths;

				var totalSeconds = seconds + (minutes * secondsPerMinute) + (hours * secondsPerHour) + (days * secondsPerDay);
				var wholeSeconds = Math.floor(totalSeconds);
				var subSeconds = totalSeconds - wholeSeconds;

				var date = new Date(0);
				date.setUTCFullYear(0);
				date.setUTCMonth(wholeMonths);

				if (subMonths != 0)
				{
					date.setUTCMonth(date.getUTCMonth() + 1);
					date.setUTCDate(0);

					var monthsTotalSeconds = date.getUTCDate() * subMonths * secondsPerDay;
					var monthsWholeSeconds = Math.floor(monthsTotalSeconds);
					var monthsSubSeconds = monthsTotalSeconds - monthsWholeSeconds;

					wholeSeconds += monthsWholeSeconds;
					subSeconds += monthsSubSeconds;
					if (subSeconds >= 1)
					{
						subSeconds--;
						wholeSeconds++;
					}

					date.setUTCDate(1);
				}

				date.setUTCSeconds(wholeSeconds);

				var time = (date.getTime() / 1000) + subSeconds;
				var timeZone = this._timeZone;

				this._time = time - timeZone.getOffset(time - timeZone.getStandardOffset());

				this._updateProperties();
			}
		};

		this._updateProperties = function()
		{
			if (this._validate())
			{
				var time = _normalizePrecision(this._time);
				var timeZoneOffset = _normalizePrecision(this._timeZone.getOffset(time));

				var totalSeconds = time + timeZoneOffset;
				var wholeSeconds = Math.floor(totalSeconds);
				var subSeconds = _normalizePrecision(totalSeconds - wholeSeconds);
				if (subSeconds >= 1)
				{
					subSeconds = 0;
					wholeSeconds++;
				}

				var date = new Date(wholeSeconds * 1000);

				this._year = date.getUTCFullYear();
				this._month = date.getUTCMonth() + 1;
				this._day = date.getUTCDate();
				this._weekday = date.getUTCDay();
				this._hours = date.getUTCHours();
				this._minutes = date.getUTCMinutes();
				this._seconds = date.getUTCSeconds() + subSeconds;

				this._time = time;
				this._timeZoneOffset = timeZoneOffset;

				this._validate();
			}
		};

		this._validate = function()
		{
			if (this._isValid)
			{
				this._year *= 1;
				this._month *= 1;
				this._day *= 1;
				this._weekday *= 1;
				this._hours *= 1;
				this._minutes *= 1;
				this._seconds *= 1;
				this._timeZoneOffset *= 1;
				this._time *= 1;
				var checksum = this._year + this._month + this._day + this._weekday + this._hours + this._minutes + this._seconds + this._timeZoneOffset + this._time;
				if (isNaN(checksum) || (checksum == Infinity) || (checksum == -Infinity) || !this._timeZone)
					this._isValid = false;
			}
			else
			{
				this._year *= 1;
				this._time *= 1;
				if ((this._year > -Infinity) && (this._year < Infinity))
				{
					this._month = 1;
					this._day = 1;
					this._hours = 0;
					this._minutes = 0;
					this._seconds = 0;
					this._isValid = true;
				}
				else if ((this._time > -Infinity) && (this._time < Infinity))
				{
					this._isValid = true;
				}
			}

			if (!this._isValid)
			{
				this._year = NaN;
				this._month = NaN;
				this._day = NaN;
				this._weekday = NaN;
				this._hours = NaN;
				this._minutes = NaN;
				this._seconds = NaN;
				this._timeZoneOffset = NaN;
				this._time = NaN;
			}

			return this._isValid;
		};

	});

});
});

jg_import.define("splunk.time.Duration", function()
{
jg_namespace("splunk.time", function()
{

	this.Duration = jg_extend(Object, function(Duration, base)
	{

		// Private Static Constants

		var _ISO_DURATION_PATTERN = /P(?:(\-?\d+(?:\.\d+)?)Y)?(?:(\-?\d+(?:\.\d+)?)M)?(?:(\-?\d+(?:\.\d+)?)D)?(?:T(?:(\-?\d+(?:\.\d+)?)H)?(?:(\-?\d+(?:\.\d+)?)M)?(?:(\-?\d+(?:\.\d+)?)S)?)?/;

		// Public Properties

		this.years = 0;
		this.months = 0;
		this.days = 0;
		this.hours = 0;
		this.minutes = 0;
		this.seconds = 0;

		// Constructor

		this.constructor = function(yearsOrTimestring, months, days, hours, minutes, seconds)
		{
			if ((arguments.length == 1) && (typeof yearsOrTimestring === "string"))
			{
				var matches = _ISO_DURATION_PATTERN.exec(yearsOrTimestring);
				var numMatches = matches ? matches.length : 0;
				var match;

				match = (numMatches > 1) ? matches[1] : null;
				this.years = match ? Number(match) : 0;

				match = (numMatches > 2) ? matches[2] : null;
				this.months = match ? Number(match) : 0;

				match = (numMatches > 3) ? matches[3] : null;
				this.days = match ? Number(match) : 0;

				match = (numMatches > 4) ? matches[4] : null;
				this.hours = match ? Number(match) : 0;

				match = (numMatches > 5) ? matches[5] : null;
				this.minutes = match ? Number(match) : 0;

				match = (numMatches > 6) ? matches[6] : null;
				this.seconds = match ? Number(match) : 0;
			}
			else
			{
				this.years = (typeof yearsOrTimestring === "number") ? yearsOrTimestring : 0;
				this.months = (months !== undefined) ? months : 0;
				this.days = (days !== undefined) ? days : 0;
				this.hours = (hours !== undefined) ? hours : 0;
				this.minutes = (minutes !== undefined) ? minutes : 0;
				this.seconds = (seconds !== undefined) ? seconds : 0;
			}
		};

		// Public Methods

		this.clone = function()
		{
			return new Duration(this.years, this.months, this.days, this.hours, this.minutes, this.seconds);
		};

		this.equals = function(toCompare)
		{
			return ((this.years == toCompare.years) &&
			        (this.months == toCompare.months) &&
			        (this.days == toCompare.days) &&
			        (this.hours == toCompare.hours) &&
			        (this.minutes == toCompare.minutes) &&
			        (this.seconds == toCompare.seconds));
		};

		this.toString = function()
		{
			var str = "";
			str += "P" + this.years + "Y" + this.months + "M" + this.days + "D";
			str += "T" + this.hours + "H" + this.minutes + "M" + this.seconds + "S";
			return str;
		};

	});

});
});

jg_import.define("splunk.time.SplunkTimeZone", function()
{
jg_namespace("splunk.time", function()
{

	var ArrayUtils = jg_import("jgatt.utils.ArrayUtils");
	var TimeZone = jg_import("splunk.time.TimeZone");

	this.SplunkTimeZone = jg_extend(TimeZone, function(SplunkTimeZone, base)
	{

		// Private Properties

		this._standardOffset = 0;
		this._serializedTimeZone = null;

		this._isConstant = false;
		this._offsetList = null;
		this._timeList = null;
		this._indexList = null;

		// Constructor

		this.constructor = function(serializedTimeZone)
		{
			if (serializedTimeZone == null)
				throw new Error("Parameter serializedTimeZone must be non-null.");
			if (typeof serializedTimeZone !== "string")
				throw new Error("Parameter serializedTimeZone must be a string.");

			this._serializedTimeZone = serializedTimeZone;

			this._offsetList = [];
			this._timeList = [];
			this._indexList = [];

			this._parseSerializedTimeZone(serializedTimeZone);
		};

		// Public Methods

		this.getSerializedTimeZone = function()
		{
			return this._serializedTimeZone;
		};

		this.getStandardOffset = function()
		{
			return this._standardOffset;
		};

		this.getOffset = function(time)
		{
			if (this._isConstant)
				return this._standardOffset;

			var offsetList = this._offsetList;
			var numOffsets = offsetList.length;
			if (numOffsets == 0)
				return 0;

			if (numOffsets == 1)
				return offsetList[0];

			var timeList = this._timeList;
			var numTimes = timeList.length;
			if (numTimes == 0)
				return 0;

			var timeIndex;
			if (numTimes == 1)
			{
				timeIndex = 0;
			}
			else
			{
				timeIndex = ArrayUtils.binarySearch(timeList, time);
				if (timeIndex < -1)
					timeIndex = -timeIndex - 2;
				else if (timeIndex == -1)
					timeIndex = 0;
			}

			var offsetIndex = this._indexList[timeIndex];
			return offsetList[offsetIndex];
		};

		// Private Methods

		this._parseSerializedTimeZone = function(serializedTimeZone)
		{
			// ### SERIALIZED TIMEZONE FORMAT 1.0
			// Y-25200 YW 50 44 54
			// Y-28800 NW 50 53 54
			// Y-25200 YW 50 57 54
			// Y-25200 YG 50 50 54
			// @-1633269600 0
			// @-1615129200 1
			// @-1601820000 0
			// @-1583679600 1

			// ### SERIALIZED TIMEZONE FORMAT 1.0
			// C0
			// Y0 NW 47 4D 54

			if (!serializedTimeZone)
				return;

			var entries = serializedTimeZone.split(";");
			var entry;
			for (var i = 0, l = entries.length; i < l; i++)
			{
				entry = entries[i];
				if (entry)
				{
					switch (entry.charAt(0))
					{
						case "C":
							if (this._parseC(entry.substring(1, entry.length)))
								return;
							break;
						case "Y":
							this._parseY(entry.substring(1, entry.length));
							break;
						case "@":
							this._parseAt(entry.substring(1, entry.length));
							break;
					}
				}
			}

			this._standardOffset = this.getOffset(0);
		};

		this._parseC = function(entry)
		{
			// 0

			if (!entry)
				return false;

			var time = Number(entry);
			if (isNaN(time))
				return false;

			this._standardOffset = time;
			this._isConstant = true;

			return true;
		};

		this._parseY = function(entry)
		{
			// -25200 YW 50 44 54

			if (!entry)
				return;

			var elements = entry.split(" ");
			if (elements.length < 1)
				return;

			var element = elements[0];
			if (!element)
				return;

			var offset = Number(element);
			if (isNaN(offset))
				return;

			this._offsetList.push(offset);
		};

		this._parseAt = function(entry)
		{
			// -1633269600 0

			if (!entry)
				return;

			var elements = entry.split(" ");
			if (elements.length < 2)
				return;

			var element = elements[0];
			if (!element)
				return;

			var time = Number(element);
			if (isNaN(time))
				return;

			element = elements[1];
			if (!element)
				return;

			var index = Number(element);
			if (isNaN(index))
				return;

			index = Math.floor(index);
			if ((index < 0) || (index >= this._offsetList.length))
				return;

			this._timeList.push(time);
			this._indexList.push(index);
		};

	});

});
});

jg_import.define("splunk.time.TimeUtils", function()
{
jg_namespace("splunk.time", function()
{

	var DateTime = jg_import("splunk.time.DateTime");
	var Duration = jg_import("splunk.time.Duration");
	var SimpleTimeZone = jg_import("splunk.time.SimpleTimeZone");
	var TimeZones = jg_import("splunk.time.TimeZones");

	this.TimeUtils = jg_static(function(TimeUtils)
	{

		// Public Static Constants

		TimeUtils.EPOCH = new DateTime(0).toUTC();

		// Public Static Methods

		TimeUtils.daysInMonth = function(date)
		{
			date = new DateTime(date.getYear(), date.getMonth() + 1, 0, 0, 0, 0, TimeZones.UTC);
			return date.getDay();
		};

		TimeUtils.addDurations = function(duration1, duration2)
		{
			return new Duration(duration1.years + duration2.years, duration1.months + duration2.months, duration1.days + duration2.days, duration1.hours + duration2.hours, duration1.minutes + duration2.minutes, duration1.seconds + duration2.seconds);
		};

		TimeUtils.addDateDuration = function(date, duration)
		{
			if ((duration.years == 0) && (duration.months == 0) && (duration.days == 0))
				date = date.clone();
			else
				date = new DateTime(date.getYear() + duration.years, date.getMonth() + duration.months, date.getDay() + duration.days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getTimeZone());
			date.setTime(date.getTime() + (duration.hours * 3600 + duration.minutes * 60 + duration.seconds));
			return date;
		};

		TimeUtils.subtractDates = function(date1, date2)
		{
			date2 = date2.toTimeZone(date1.getTimeZone());

			var isNegative = (date1.getTime() < date2.getTime());
			if (isNegative)
			{
				var temp = date1;
				date1 = date2;
				date2 = temp;
			}

			var sameTimeZoneOffset = (date1.getTimeZoneOffset() == date2.getTimeZoneOffset());

			var years;
			var months;
			var days;
			var hours;
			var minutes;
			var seconds;

			var date3;
			if (sameTimeZoneOffset)
			{
				date3 = date1;
			}
			else if ((date1.getYear() == date2.getYear()) && (date1.getMonth() == date2.getMonth()) && (date1.getDay() == date2.getDay()))
			{
				date3 = date2;
			}
			else
			{
				date3 = new DateTime(date1.getYear(), date1.getMonth(), date1.getDay(), date2.getHours(), date2.getMinutes(), date2.getSeconds(), date2.getTimeZone());
				if (date3.getTime() > date1.getTime())
				{
					date3 = new DateTime(date1.getYear(), date1.getMonth(), date1.getDay() - 1, date2.getHours(), date2.getMinutes(), date2.getSeconds(), date2.getTimeZone());
					if ((date3.getTime() < date2.getTime()) || ((date3.getYear() == date2.getYear()) && (date3.getMonth() == date2.getMonth()) && (date3.getDay() == date2.getDay())))
						date3 = date2;
				}
			}

			years = date3.getYear() - date2.getYear();
			months = date3.getMonth() - date2.getMonth();
			days = date3.getDay() - date2.getDay();

			if (sameTimeZoneOffset)
			{
				hours = date3.getHours() - date2.getHours();
				minutes = date3.getMinutes() - date2.getMinutes();
				seconds = date3.getSeconds() - date2.getSeconds();

				if (seconds < 0)
				{
					seconds += 60;
					minutes--;
				}

				if (minutes < 0)
				{
					minutes += 60;
					hours--;
				}

				if (hours < 0)
				{
					hours += 24;
					days--;
				}

				seconds = _normalizePrecision(seconds);
			}
			else
			{
				seconds = date1.getTime() - date3.getTime();
				var wholeSeconds = Math.floor(seconds);
				var subSeconds = _normalizePrecision(seconds - wholeSeconds);
				if (subSeconds >= 1)
				{
					subSeconds = 0;
					wholeSeconds++;
				}

				minutes = Math.floor(wholeSeconds / 60);
				seconds = (wholeSeconds % 60) + subSeconds;

				hours = Math.floor(minutes / 60);
				minutes %= 60;
			}

			if (days < 0)
			{
				date3 = new DateTime(date2.getYear(), date2.getMonth() + 1, 0, 0, 0, 0, TimeZones.UTC);
				days += date3.getDay();
				months--;
			}

			if (months < 0)
			{
				months += 12;
				years--;
			}

			if (isNegative)
			{
				years = -years;
				months = -months;
				days = -days;
				hours = -hours;
				minutes = -minutes;
				seconds = -seconds;
			}

			return new Duration(years, months, days, hours, minutes, seconds);
		};

		TimeUtils.subtractDurations = function(duration1, duration2)
		{
			return new Duration(duration1.years - duration2.years, duration1.months - duration2.months, duration1.days - duration2.days, duration1.hours - duration2.hours, duration1.minutes - duration2.minutes, duration1.seconds - duration2.seconds);
		};

		TimeUtils.subtractDateDuration = function(date, duration)
		{
			if ((duration.years == 0) && (duration.months == 0) && (duration.days == 0))
				date = date.clone();
			else
				date = new DateTime(date.getYear() - duration.years, date.getMonth() - duration.months, date.getDay() - duration.days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getTimeZone());
			date.setTime(date.getTime() - (duration.hours * 3600 + duration.minutes * 60 + duration.seconds));
			return date;
		};

		TimeUtils.multiplyDuration = function(duration, scalar)
		{
			return new Duration(duration.years * scalar, duration.months * scalar, duration.days * scalar, duration.hours * scalar, duration.minutes * scalar, duration.seconds * scalar);
		};

		TimeUtils.divideDuration = function(duration, scalar)
		{
			return new Duration(duration.years / scalar, duration.months / scalar, duration.days / scalar, duration.hours / scalar, duration.minutes / scalar, duration.seconds / scalar);
		};

		TimeUtils.ceilDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_ceilDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.ceilDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_floorDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_ceilDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.floorDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_floorDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.floorDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_ceilDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_floorDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.roundDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_roundDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.roundDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_roundDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_roundDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.normalizeDuration = function(duration, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			return TimeUtils.subtractDates(date, referenceDate);
		};

		TimeUtils.durationToSeconds = function(duration, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			return _normalizePrecision(date.getTime() - referenceDate.getTime());
		};

		TimeUtils.secondsToDuration = function(seconds, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = new DateTime(referenceDate.getTime() + seconds).toTimeZone(referenceDate.getTimeZone());
			return TimeUtils.subtractDates(date, referenceDate);
		};

		// Private Static Methods

		var _ceilDateInternal = function(date, units)
		{
			var ceilYear = (units.years > 0);
			var ceilMonth = ceilYear || (units.months > 0);
			var ceilDay = ceilMonth || (units.days > 0);
			var ceilHours = ceilDay || (units.hours > 0);
			var ceilMinutes = ceilHours || (units.minutes > 0);
			var ceilSeconds = ceilMinutes || (units.seconds > 0);

			if (!ceilSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.min(Math.ceil(date.getSeconds() / units.seconds) * units.seconds, 60));
				else
					date.setSeconds(60);
			}

			if (!ceilMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.min(Math.ceil(date.getMinutes() / units.minutes) * units.minutes, 60));
				else
					date.setMinutes(60);
			}

			if (!ceilHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.min(Math.ceil(date.getHours() / units.hours) * units.hours, 24));
				else
					date.setHours(24);
			}

			if (!ceilDay)
				return;

			if (date.getDay() > 1)
			{
				var daysInMonth = TimeUtils.daysInMonth(date);
				if (units.days > 0)
					date.setDay(Math.min(Math.ceil((date.getDay() - 1) / units.days) * units.days, daysInMonth) + 1);
				else
					date.setDay(daysInMonth + 1);
			}

			if (!ceilMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.min(Math.ceil((date.getMonth() - 1) / units.months) * units.months, 12) + 1);
				else
					date.setMonth(12 + 1);
			}

			if (!ceilYear)
				return;

			if (units.years > 0)
				date.setYear(Math.ceil(date.getYear() / units.years) * units.years);
		};

		var _ceilDurationInternal = function(duration, units, referenceDate)
		{
			var ceilYears = (units.years > 0);
			var ceilMonths = ceilYears || (units.months > 0);
			var ceilDays = ceilMonths || (units.days > 0);
			var ceilHours = ceilDays || (units.hours > 0);
			var ceilMinutes = ceilHours || (units.minutes > 0);
			var ceilSeconds = ceilMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!ceilSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.min(Math.ceil(duration.seconds / units.seconds) * units.seconds, 60);
				else
					duration.seconds = 60;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.min(Math.ceil(duration.minutes / units.minutes) * units.minutes, 60);
				else
					duration.minutes = 60;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.min(Math.ceil(duration.hours / units.hours) * units.hours, 24);
				else
					duration.hours = 24;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.min(Math.ceil(duration.days / units.days) * units.days, daysInMonth);
				else
					duration.days = daysInMonth;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.min(Math.ceil(duration.months / units.months) * units.months, 12);
				else
					duration.months = 12;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.ceil(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _floorDateInternal = function(date, units)
		{
			var floorYear = (units.years > 0);
			var floorMonth = floorYear || (units.months > 0);
			var floorDay = floorMonth || (units.days > 0);
			var floorHours = floorDay || (units.hours > 0);
			var floorMinutes = floorHours || (units.minutes > 0);
			var floorSeconds = floorMinutes || (units.seconds > 0);

			if (!floorSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.floor(date.getSeconds() / units.seconds) * units.seconds);
				else
					date.setSeconds(0);
			}

			if (!floorMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.floor(date.getMinutes() / units.minutes) * units.minutes);
				else
					date.setMinutes(0);
			}

			if (!floorHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.floor(date.getHours() / units.hours) * units.hours);
				else
					date.setHours(0);
			}

			if (!floorDay)
				return;

			if (date.getDay() > 1)
			{
				if (units.days > 0)
					date.setDay(Math.floor((date.getDay() - 1) / units.days) * units.days + 1);
				else
					date.setDay(1);
			}

			if (!floorMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.floor((date.getMonth() - 1) / units.months) * units.months + 1);
				else
					date.setMonth(1);
			}

			if (!floorYear)
				return;

			if (units.years > 0)
				date.setYear(Math.floor(date.getYear() / units.years) * units.years);
		};

		var _floorDurationInternal = function(duration, units, referenceDate)
		{
			var floorYears = (units.years > 0);
			var floorMonths = floorYears || (units.months > 0);
			var floorDays = floorMonths || (units.days > 0);
			var floorHours = floorDays || (units.hours > 0);
			var floorMinutes = floorHours || (units.minutes > 0);
			var floorSeconds = floorMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!floorSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.floor(duration.seconds / units.seconds) * units.seconds;
				else
					duration.seconds = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.floor(duration.minutes / units.minutes) * units.minutes;
				else
					duration.minutes = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.floor(duration.hours / units.hours) * units.hours;
				else
					duration.hours = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.floor(duration.days / units.days) * units.days;
				else
					duration.days = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.floor(duration.months / units.months) * units.months;
				else
					duration.months = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.floor(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _roundDateInternal = function(date, units)
		{
			var roundYear = (units.years > 0);
			var roundMonth = roundYear || (units.months > 0);
			var roundDay = roundMonth || (units.days > 0);
			var roundHours = roundDay || (units.hours > 0);
			var roundMinutes = roundHours || (units.minutes > 0);
			var roundSeconds = roundMinutes || (units.seconds > 0);

			if (!roundSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.min(Math.round(date.getSeconds() / units.seconds) * units.seconds, 60));
				else if (date.getSeconds() >= 30)
					date.setSeconds(60);
				else
					date.setSeconds(0);
			}

			if (!roundMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.min(Math.round(date.getMinutes() / units.minutes) * units.minutes, 60));
				else if (date.getMinutes() >= 30)
					date.setMinutes(60);
				else
					date.setMinutes(0);
			}

			if (!roundHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.min(Math.round(date.getHours() / units.hours) * units.hours, 24));
				else if (date.getHours() >= 12)
					date.setHours(24);
				else
					date.setHours(0);
			}

			if (!roundDay)
				return;

			if (date.getDay() > 1)
			{
				var daysInMonth = TimeUtils.daysInMonth(date);
				if (units.days > 0)
					date.setDay(Math.min(Math.round((date.getDay() - 1) / units.days) * units.days, daysInMonth) + 1);
				else if (date.getDay() >= Math.floor(daysInMonth / 2 + 1))
					date.setDay(daysInMonth + 1);
				else
					date.setDay(1);
			}

			if (!roundMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.min(Math.round((date.getMonth() - 1) / units.months) * units.months, 12) + 1);
				else if (date.getMonth() >= (6 + 1))
					date.setMonth(12 + 1);
				else
					date.setMonth(1);
			}

			if (!roundYear)
				return;

			if (units.years > 0)
				date.setYear(Math.round(date.getYear() / units.years) * units.years);
		};

		var _roundDurationInternal = function(duration, units, referenceDate)
		{
			var roundYears = (units.years > 0);
			var roundMonths = roundYears || (units.months > 0);
			var roundDays = roundMonths || (units.days > 0);
			var roundHours = roundDays || (units.hours > 0);
			var roundMinutes = roundHours || (units.minutes > 0);
			var roundSeconds = roundMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!roundSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.min(Math.round(duration.seconds / units.seconds) * units.seconds, 60);
				else if (duration.seconds >= 30)
					duration.seconds = 60;
				else
					duration.seconds = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.min(Math.round(duration.minutes / units.minutes) * units.minutes, 60);
				else if (duration.minutes >= 30)
					duration.minutes = 60;
				else
					duration.minutes = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.min(Math.round(duration.hours / units.hours) * units.hours, 24);
				else if (duration.hours >= 12)
					duration.hours = 24;
				else
					duration.hours = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.min(Math.round(duration.days / units.days) * units.days, daysInMonth);
				else if (duration.days >= Math.floor(daysInMonth / 2))
					duration.days = daysInMonth;
				else
					duration.days = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.min(Math.round(duration.months / units.months) * units.months, 12);
				else if (duration.months >= 6)
					duration.months = 12;
				else
					duration.months = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.round(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _toTimeZoneStable = function(date, timeZone)
		{
			var date2 = date.toTimeZone(timeZone);
			if ((date2.getYear() == date.getYear()) && (date2.getMonth() == date.getMonth()) && (date2.getDay() == date.getDay()) &&
			    (date2.getHours() == date.getHours()) && (date2.getMinutes() == date.getMinutes()) && (date2.getSeconds() == date.getSeconds()))
				return date2;

			var date3 = date.clone();
			date3.setTimeZone(timeZone);
			if ((date3.getYear() == date.getYear()) && (date3.getMonth() == date.getMonth()) && (date3.getDay() == date.getDay()) &&
			    (date3.getHours() == date.getHours()) && (date3.getMinutes() == date.getMinutes()) && (date3.getSeconds() == date.getSeconds()))
				return date3;

			return date2;
		};

		var _normalizeDuration = function(duration, daysInMonth)
		{
			var years = duration.years;
			var wholeYears = Math.floor(years);
			var subYears = years - wholeYears;

			var months = duration.months + subYears * 12;
			var wholeMonths = Math.floor(months);
			var subMonths = months - wholeMonths;

			var days = duration.days + subMonths * daysInMonth;
			var wholeDays = Math.floor(days);
			var subDays = days - wholeDays;

			var hours = duration.hours + subDays * 24;
			var wholeHours = Math.floor(hours);
			var subHours = hours - wholeHours;

			var minutes = duration.minutes + subHours * 60;
			var wholeMinutes = Math.floor(minutes);
			var subMinutes = minutes - wholeMinutes;

			var seconds = duration.seconds + subMinutes * 60;
			var wholeSeconds = Math.floor(seconds);
			var subSeconds = _normalizePrecision(seconds - wholeSeconds);
			if (subSeconds >= 1)
			{
				subSeconds = 0;
				wholeSeconds++;
			}

			wholeMinutes += Math.floor(wholeSeconds / 60);
			wholeSeconds %= 60;

			wholeHours += Math.floor(wholeMinutes / 60);
			wholeMinutes %= 60;

			wholeDays += Math.floor(wholeHours / 24);
			wholeHours %= 24;

			wholeMonths += Math.floor(wholeDays / daysInMonth);
			wholeDays %= daysInMonth;

			wholeYears += Math.floor(wholeMonths / 12);
			wholeMonths %= 12;

			duration.years = wholeYears;
			duration.months = wholeMonths;
			duration.days = wholeDays;
			duration.hours = wholeHours;
			duration.minutes = wholeMinutes;
			duration.seconds = wholeSeconds + subSeconds;
		};

		var _normalizePrecision = function(value)
		{
			return Number(value.toFixed(6));
		};

	});

});
});

define("splunk.time", ["jg_global","jgatt"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.splunk.time;
    };
}(this)));

////////////////////////////////////////////////////////////////////////////////
// TimeRange objects
////////////////////////////////////////////////////////////////////////////////

/**
 * General purpose object to hold any time range, whether it's an absolute range, 
 * relative time range, real time range. 
 * Any kind of range may omit startTime or endTime, which means it's unbounded
 * on that end.
 * A range unbounded on both ends is treated as an 'All time' range.
 */
Splunk.TimeRange = $.klass({
    _absoluteArgs : {},
    _relativeArgs : {},

    _fallbackAbsoluteTimeFormat: "%s.%Q",
    _isSubRangeOfJob: false,

    _unitMap : {},
    YEAR        : 0,
    MONTH       : 1,
    DAY         : 2,
    HOUR        : 3,
    MINUTE      : 4,
    SECOND      : 5,
    MILLISECOND : 6,
    CUSTOM_RELATIVE_RANGE_HEADER: _("over custom relative time range"),
    GENERIC_REAL_TIME_RANGE_HEADER: _("%s (real-time)"),
    CUSTOM_REAL_TIME_RANGE_HEADER: _("in custom real-time range"),

    DATE_METHODS  : [
        // Dont wrap any of these year, month, day values in _(). They are part of the logic here and never displayed.
        // instead it's the values in this._unitMap that get localized.
        {name: "year",   getter : "getFullYear",     setter: "setFullYear", minValue: "1974"},
        {name: "month",  getter : "getMonth",        setter: "setMonth",    minValue: "0"},
        {name: "day",    getter : "getDate",         setter: "setDate",     minValue: "1"},
        {name: "hour",   getter : "getHours",        setter: "setHours",    minValue: "0"},
        {name: "minute", getter : "getMinutes",      setter: "setMinutes",  minValue: "0"},
        {name: "second", getter : "getSeconds",      setter: "setSeconds",  minValue: "0"},
        {name: "millisecond", getter : "getMilliseconds", setter: "setMilliseconds",  minValue: "0"}
    ],

    initialize: function(earliestArg, latestArg) {
        // keeping clone() up to date is a pain. This is either cheating, or a
        // smart way of with that problem. See usage within clone()
        this._constructorArgs = [earliestArg, latestArg];

        // looks crazy, but im just trying to cover the full range of abbreviations
        // that are supported by the backend.
        var u = this._unitMap;
        u.s = u.sec = u.secs = u.second = u.seconds = _("second");
        u.m = u.min = u.mins = u.minute = u.minutes = _("minute");
        u.h = u.hr  = u.hrs  = u.hour   = u.hours   = _("hour");
        u.d = u.day = u.days   = _("day");
        // weeks were removed entirely at some point and then re-added.  See src/util/TimeParser.cpp
        u.w = u.week           = _("week");
        u.mon = u.month = u.months = _("month");
        u.y = u.yr = u.yrs   = u.year   = u.years   = _("year");

        this._absoluteArgs = {
            "earliest" : false,
            "latest"   : false
        };
        this._relativeArgs = {
            "earliest" : false,
            "latest" : false
        };
        if (earliestArg=="now") earliestArg="0s";
        if (latestArg=="now")   latestArg="0s";
        
        this.logger = Splunk.Logger.getLogger("time_range.js");
        // we assume when a timerange is created directly that its the full range.
        this._isSubRangeOfJob = false;
        
        this._absoluteArgs["earliest"] = this.parseAbsoluteArgs(earliestArg);
        this._absoluteArgs["latest"]   = this.parseAbsoluteArgs(latestArg);
        
        if (this.isAbsolute()) {
            var tz = Splunk.Globals["timeZone"];
            this.serverOffsetAtEarliest = tz.getOffset(this._absoluteArgs["earliest"].valueOf()/1000) /60;
            this.serverOffsetAtLatest   = tz.getOffset(this._absoluteArgs["latest"].valueOf()/1000)/60;
        }
        
        // if its not an absolute term, try it as a relative term.
        if (!this._absoluteArgs["earliest"]) {
            this._relativeArgs["earliest"] = this.parseRelativeArgs(earliestArg);
        }
        if (!this._absoluteArgs["latest"]) {
            this._relativeArgs["latest"] = this.parseRelativeArgs(latestArg);
        }
        // if that failed, then we are left with everything null, which is fine it just means
        // an 'All Time' search.
    },

    /**
     * returns true if this timeRange contains the given date.  
     * Should only be used on absolute ranges. 
     * EG: always returns true if this is a purely relative or real-time range.
     */
    containsTime: function(dateObj) {
        var earliestTime = this.getAbsoluteEarliestTime();
        var latestTime   = this.getAbsoluteLatestTime();
        if (!earliestTime && !latestTime) return true;
        return (earliestTime <= dateObj  && latestTime > dateObj);
    },

    /**
     * returns true if the given range is contained by or equal to this instance.
     * In the case where this is a relative range, it will always assume that it contains
     * absolute ranges.  Because of how the timeline is implemented, this never seems to
     * come up as a shortcoming.
     * TODO - fix using this.containsTime
     */
    containsRange: function(range) {
        // if this is a range over all time, then it contains all time ranges. (including other "all time" ranges )
        // All time contains everybody, including other All Time
        if (this.isAllTime()) return true;
        // Nobody can contain All Time, except others which hit the case above.
        if (range.isAllTime()) return false;
        // if these ranges are identical, then true.
        if (this.equalToRange(range)) return true;

        // Currently relative ranges will ALWAYS claim to contain absolute ranges.
        if (this.relativeTerm  && !range.relativeTerm) return true;

        // trivial but expensive case of them being identical.  happens a lot.
        if (
            this.getEarliestTimeTerms() == range.getEarliestTimeTerms() &&
            this.getLatestTimeTerms() == range.getLatestTimeTerms()
            ) {
            return true;
        }

        if (this.getAbsoluteEarliestTime() > range.getAbsoluteEarliestTime())  return false;
        else if (this.getAbsoluteLatestTime() < range.getAbsoluteLatestTime()) return false;

        return true;
    },

    /** 
     * in all 4.0.X code, +0s would always get substituted for 'now'.  So there are tons of 
     * saved searches and links out there with latest=+0s in them, even though the corresponding 
     * times.conf stanza said "now".  
     * in 4.1 we no longer have to do the switch but as a result we have to treat "+0s" and "now" 
     * as equivalent to avoid old saved searches displaying 'over custom relative time' in headers
     */
    normalizeEquivalentNowValues : function(relativeArg) {
        if (relativeArg == "+0s") return "now";
        else return relativeArg;
    },

    /**
     * returns true if the given range is exactly equal to this instance.
     */
    equalToRange: function(range) {
        if (this===range) return true;
        
        if (this.normalizeEquivalentNowValues(this.getRelativeEarliestTime()) != this.normalizeEquivalentNowValues(range.getRelativeEarliestTime())) return false;
        if (this.normalizeEquivalentNowValues(this.getRelativeLatestTime()) != this.normalizeEquivalentNowValues(range.getRelativeLatestTime())) return false;
        
        if (typeof(this.getAbsoluteEarliestTime()) != typeof(range.getAbsoluteEarliestTime())) return false;
        if (typeof(this.getAbsoluteLatestTime()) != typeof(range.getAbsoluteLatestTime())) return false;
        
        var rangeEarliestTime = range.getAbsoluteEarliestTime();
        if (this.getAbsoluteEarliestTime() && rangeEarliestTime &&  this.getAbsoluteEarliestTime().getTime() != rangeEarliestTime.getTime()) return false;
        var rangeLatestTime   = range.getAbsoluteLatestTime();
        if (this.getAbsoluteLatestTime() && rangeLatestTime && this.getAbsoluteLatestTime().getTime() != rangeLatestTime.getTime()) return false;
        return true;
    },

    /**
     * @returns -1 if the timeRange isnt governed by a relative searchTerm at all.
     * Otherwise an integer representing the number of milliseconds between earliestTime and latestTime.
     */
    getDuration: function() {
        if (this.relativeTerm) return -1;
        else if (this.getAbsoluteLatestTime() && this.getAbsoluteEarliestTime()) {
            return this.getAbsoluteLatestTime() - this.getAbsoluteEarliestTime();
        }
        else return -1;
    },

    

    isAllTime: function() {
        return (this.isAbsolute() || this.isRelative()) ? false : true;
    },

    isAbsolute: function() {
        return ((this.getAbsoluteEarliestTime() && this.getAbsoluteEarliestTime().valueOf() != 0) || this.getAbsoluteLatestTime())? true:false;
    },

    isRelative: function() {
        return (this._relativeArgs["earliest"] || this._relativeArgs["latest"])? true:false;
    },
        
    isRealTime: function() {
        if (this._relativeArgs["earliest"] && this._relativeArgs["earliest"]["isRealTime"]) return true;
        else if (this._relativeArgs["latest"] && this._relativeArgs["latest"]["isRealTime"]) return true;
        return false;
    },
    
    /** 
     * If the Splunk.TimeRange instance attached to a Splunk.Search instance 
     * has been modified to represent a subrange, (with the start and end times 
     * corresponding to boundaries on the timelineData structure in splunkd), 
     * then that client is required to call setAsSubRangeOfJob(true)
     * Other code may then need to check this flag to determine whether a new 
     * search needs to be dispatched.
     */
    isSubRangeOfJob: function() {
        return this._isSubRangeOfJob;
    },

    setAsSubRangeOfJob: function(isSubRange) {
        this._isSubRangeOfJob = isSubRange;
    },
    
    getEarliestTimeTerms: function() {
        var timeTerms = [];
        if (this.getAbsoluteEarliestTime()) {
            var epochTime = this.getAbsoluteEarliestTime().getTime() / 1000;
            timeTerms.push(epochTime);
        } else if (this._relativeArgs["earliest"]) {
            timeTerms.push(this.getRelativeEarliestTime());
        }
        return timeTerms.join(" ");
    },

    getLatestTimeTerms: function() {
        var timeTerms = [];
        if (this.getAbsoluteLatestTime()) {
            var epochTime = this.getAbsoluteLatestTime().getTime() / 1000;
            timeTerms.push(epochTime);
        } else if (this._relativeArgs["latest"]) {
            timeTerms.push(this.getRelativeLatestTime());
        }
        return timeTerms.join(" ");
    },

    /*
     * We currently do no intelligent snapping on generic zoom in cases although
     * we certainly could in the future and it would be nice for our users.
     */
    zoomIn: function() {
        var duration = this.getDuration();
        if (!duration) this.logger.error("Assertion failed - TimeRange.zoomOut not implemented for relative time terms range=" + this.toConciseString());

        this._absoluteArgs["earliest"].setTime(this.getAbsoluteEarliestTime().getTime() + Math.round(duration/2));
        return new Splunk.TimeRange(this._absoluteArgs["earliest"], this._absoluteArgs["latest"], this.serverOffsetAtEarliest, this.serverOffsetAtLatest);
    },

    /*
     * Basically zooms out to quadruple the duration, leaving the latest side of
     * the range unchanged.  However if the range on the endtime side is specified
     * down to more granular units than the starttime, and if there's
     * nice round number boundaries nearby, this method will snap both the 
     * earliest and latest sides of the range out to that level of granularity
     * The best way to understand more is to go to the unit tests
     * and read the testcases.
     */
    zoomOut: function() {
        if (!this.getDuration())
            this.logger.error("Assertion failed - TimeRange.zoomOut not implemented for relative time terms range=" + this.toConciseString());

        // import time classes
        var DateTime = splunk.time.DateTime;
        var Duration = splunk.time.Duration;
        var SplunkTimeZone = splunk.time.SplunkTimeZone;
        var TimeUtils = splunk.time.TimeUtils;

        // get server time zone
        var timeZone = new SplunkTimeZone(Splunk.util.getConfigValue("SERVER_ZONEINFO"));

        // get earliest as DateTime object in server time zone
        var earliest = new DateTime(this._absoluteArgs["earliest"].getTime() / 1000).toTimeZone(timeZone);

        // get latest as DateTime object in server time zone
        var latest = new DateTime(this._absoluteArgs["latest"].getTime() / 1000).toTimeZone(timeZone);

        // compute duration
        var duration = TimeUtils.subtractDates(latest, earliest);

        // compute snapping units based on most significant unit of duration
        var units = new Duration();
        if ((duration.years > 0) || (duration.months > 0))
            units.years = 1;
        else if (duration.days > 0)
            units.months = 1;
        else if (duration.hours > 0)
            units.days = 1;
        else if (duration.minutes > 0)
            units.hours = 1;
        else if (duration.seconds >= 1)
            units.minutes = 1;
        else if (duration.seconds > 0)
            units.seconds = 1;

        // zoom duration to units or to a multiple of 10 years
        duration = (duration.years < 1) ? units.clone() : new Duration(Math.ceil((duration.years * 2) / 10) * 10);

        // snap latest to duration
        latest = TimeUtils.ceilDate(latest, duration);

        // ensure latest is not greater than snapped now
        var isLatest = false;
        var now = TimeUtils.ceilDate(new DateTime().toTimeZone(timeZone), units);
        if (latest.getTime() >= now.getTime())
        {
            latest = now;
            isLatest = true;
        }

        // compute new earliest as either latest minus duration or floored earliest, whichever is earlier
        var earliest2 = TimeUtils.subtractDateDuration(latest, duration);
        earliest = (earliest2.getTime() <= earliest.getTime()) ? earliest2 : TimeUtils.floorDate(earliest, units);

        // ensure earliest is not less than epoch
        var isEarliest = false;
        if (earliest.getTime() <= 0)
        {
            earliest.setTime(1);  // other places throughout the codebase don't seem to like 0
            isEarliest = true;
        }

        // if isEarliest and isLatest, or duration > 20 years, return all time
        if ((isEarliest && isLatest) || (TimeUtils.subtractDates(latest, earliest).years > 20))
        {
            this._absoluteArgs["earliest"] = false;
            this._absoluteArgs["latest"] = false;
            return new Splunk.TimeRange(0);
        }

        // else, return zoomed out time range
        this._absoluteArgs["earliest"].setTime(earliest.getTime() * 1000);
        this._absoluteArgs["latest"].setTime(latest.getTime() * 1000);
        return new Splunk.TimeRange(earliest.getTime(), latest.getTime());
    },
    
    /**
     * PRIVATE method to not duplicate code between getRelativeEarliestTime and
     * getRelativeLatestTime()
     */
    genericGetForRelativeArg:function(which) {
        if (which=="earliest" && this._constructorArgs[0]) return this._constructorArgs[0];
        else if (this._constructorArgs[1]) return this._constructorArgs[1];
        
        // THIS CODE IS UNLOVED BUT IT SEEMS NOT ENTIRELY DEAD. 
        // In theory if everything gets set from the constructors, 
        // then parroting back the constructor args (see above) is fine. 
        // in practice however at a couple places we still fall in here.

        if (!this._relativeArgs.hasOwnProperty(which)) return false;
        var dict = this._relativeArgs[which];
        var str = [];
        if (dict["isRealTime"]) str.push("rt");
        if (dict.hasOwnProperty("count")) {
            if (dict["count"] >= 0) str.push("+");
            str.push(dict["count"]);
        }
        if (dict.hasOwnProperty("units")) {
            str.push(dict["units"]);
        }
        if (dict.hasOwnProperty("snapUnits")) {
            str.push("@" + dict["snapUnits"]);
        }

        return str.join("");
    },

    /**
     * PRIVATE gets the earliestTime when it is a relative time term.
     */
    getRelativeEarliestTime: function() {
        return this.genericGetForRelativeArg("earliest");
    },

    /**
     * PRIVATE gets the latestTime when it is a relative time term.
     */
    getRelativeLatestTime: function() {
        return this.genericGetForRelativeArg("latest");
    },

    /**
     * PRIVATE returns the earliestTime as a JS Date object.
     */
    getAbsoluteEarliestTime: function() {
        return this._absoluteArgs["earliest"];
    },

    /**
     * PRIVATE returns the latestTime as a JS Date object.
     */
    getAbsoluteLatestTime: function() {
        return this._absoluteArgs["latest"];
    },

    /**
     * PRIVATE tries to parse the argument as a relative time string, into its
     * internal representation used by TimeRange.
     */
    parseRelativeArgs: function(arg) {
        
        if (!arg) return false;
        if (arg.indexOf(" ")!=-1) this.logger.error("Assertion failed - Currently we can only deal with a single relative term at a time. ");
        var relativeDict = {};

        // check for the real time flag, make a note and then remove it.
        if (arg.indexOf("rt") == 0) {
            relativeDict["isRealTime"] = true;
            arg = arg.substring(2);
        }
        // split off the @ term, if there is one.
        var splitArgs = arg.split("@");
        arg = splitArgs[0] || false;
        if (splitArgs.length > 1) {
            relativeDict["snapUnits"] = splitArgs[1];
        }
        if (arg && Splunk.util.isInt(parseInt(arg, 10))) {
            relativeDict["count"] = parseInt(arg, 10);
            relativeDict["units"] = Splunk.util.trim(arg.replace(relativeDict["count"], ""), "+") || "s";
        }
        return relativeDict;
    },

    /**
     * PRIVATE tries to parse the argument as either a Date object literal, or a
     * int or float representing seconds since the epoch 
     * NOTE: epochTime values are always to be displayed in the server's timezone.  
     * It is illegal to grab a js Date Object for now() and then use its epochtime 
     * value.  What you need can probably be found in the TimeRange class.
     */
    parseAbsoluteArgs: function(arg, serverOffsetThen) {
        if (!arg && !Splunk.util.isInt(arg)) return false;
        if (arg && arg.charAt && (arg.charAt(0) == "+" || arg.charAt(0) == "-" || arg.substring(0,2) == "rt" || arg=="now") ) return false;
        if (arg instanceof Date) {
            return arg;
        } else if (arg && ("" + arg).match(Splunk.TimeRange.UTCRegex)) {
            var d = new Date();
            d.setTime(arg * 1000);
            return d;
        } else {
            //  try and parse them as strings containing absolute dates
            var parsedDate = Splunk.util.parseDate(arg, this.getTimeFormat());
            return parsedDate;
        }
        return false;
    },

    /**
     * Serializes the timeRange. Generally for debug statements. 
     * For human-readable purposes, use toConciseString()
     */
    toString: function() {
        var str = [];
        if (this.getAbsoluteEarliestTime()) {
            str.push(this.getAbsoluteEarliestTime());
        }
        if (this.getAbsoluteLatestTime()) {
            str.push(this.getAbsoluteLatestTime());
        }
        if (this.getRelativeEarliestTime()) {
            str.push(this.getRelativeEarliestTime());
        }
        if (this.getRelativeLatestTime()) {
            str.push(this.getRelativeLatestTime());
        }
        return str.join(" ");
    },
   
    /**
     * returns a compact localized description of the range.
     */
    toConciseString: function() {        
        if (this.isAbsolute()) {
            // open ended ranges are supported so be careful not to use new Date() by default (which would result in the browser's current time).
            var earliestTime = null;
            var latestTime   = null;
            if (this.getAbsoluteEarliestTime()) {
                earliestTime = new Date();
                earliestTime.setTime(this._absoluteArgs["earliest"].valueOf());
                // correct timezone offsets.
                if (Splunk.TimeRange.CORRECT_OFFSET_ON_DISPLAY) {
                    var earliestDelta = Splunk.util.getTimezoneOffsetDelta(this.serverOffsetAtEarliest, earliestTime);
                    earliestTime.setTime(earliestTime.valueOf() - earliestDelta);
                }
            }
            if (this.getAbsoluteLatestTime()) {
                latestTime = new Date();
                latestTime.setTime(this._absoluteArgs["latest"].valueOf());
                // correct timezone offsets.
                if (Splunk.TimeRange.CORRECT_OFFSET_ON_DISPLAY) {
                    var latestDelta   = Splunk.util.getTimezoneOffsetDelta(this.serverOffsetAtLatest, latestTime);
                    latestTime.setTime(latestTime.valueOf()     - latestDelta);
                }
            }
            // defers to i18n format_daterange function.
            return format_datetime_range(Splunk.util.getConfigValue('LOCALE', "NONE"), earliestTime, latestTime);
        } else if (this.isRealTime()) {
            var relativeRangeHeader = this.formatRelativeRange();
            if (relativeRangeHeader == this.CUSTOM_RELATIVE_RANGE_HEADER) {
                return this.CUSTOM_REAL_TIME_RANGE_HEADER;
            } else {
                return sprintf(this.GENERIC_REAL_TIME_RANGE_HEADER, relativeRangeHeader);
            }
        } else if (this.isRelative() && !this.isRealTime()) {
            return this.formatRelativeRange();
        } else {
            return _("over all time");
        }
    },
    
    formatRelativeRange: function() {
        var relEarliest = this._relativeArgs["earliest"];
        var relLatest   = this._relativeArgs["latest"];
        if (relEarliest.hasOwnProperty("snapUnits")) {
            if (relLatest.hasOwnProperty("snapUnits") != relLatest.hasOwnProperty("snapUnits")) {
                throw("Assertion failed - we dont support cases where one side has snapUnits and the other does not.");
            }
            // Special cases for 'today' 'yesterday', 'this week', 'previous week'
            if (this._unitMap[relEarliest["snapUnits"]] == "day"
                && this._unitMap[relLatest["snapUnits"]] == "day") {
                if (!relEarliest.hasOwnProperty("count")
                    && relLatest.hasOwnProperty("count")
                    && relLatest["count"] == 1) {
                    return _("today");
                }
                else if (!relLatest.hasOwnProperty("count")
                    && relEarliest.hasOwnProperty("count")
                    && relEarliest["count"] == -1) {
                    return _("yesterday");
                }
            }
            // check for the form @something  +1something@something,  which is 'This Something'
            if (!relEarliest.hasOwnProperty("count")
                    && relLatest.hasOwnProperty("count")
                    && relLatest["count"] == 1) {
                return sprintf(_("during this %(singleUnitOfTime)s"), {singleUnitOfTime: this._unitMap[relEarliest["snapUnits"]]});
            }
            // if this is in the form -1something@something  @something,  ie 'Last Something'
            // first make sure it has an earliest count, it has no latest count, and the earliest count is 1.
            if (!relLatest.hasOwnProperty("count")
                    && relEarliest.hasOwnProperty("count")
                    && relEarliest["count"] == -1) {
                // make sure the snap Units on the earliest term match the main units.
                if (relEarliest.hasOwnProperty("snapUnits") && (relEarliest["snapUnits"] == relEarliest["units"])) {
                    // make sure the snap units on the latest term also match
                    if (relLatest.hasOwnProperty("snapUnits") && (relLatest["snapUnits"] == relEarliest["units"])) {
                        return sprintf(_("during last %(singleUnitOfTime)s"), {singleUnitOfTime: this._unitMap[relEarliest["snapUnits"]]});
                    }
                }
            }
        }
        if (relEarliest.hasOwnProperty("units") && this._unitMap.hasOwnProperty(relEarliest["units"]) 
            && !relLatest.hasOwnProperty("snapUnits") 
            && ((!relLatest.hasOwnProperty("units") && !relLatest.hasOwnProperty("count")) || relLatest["count"] ==0) ) {
            // catches cases like "in the last month",  "in the last hour", regardless of snap term
            if (relEarliest.hasOwnProperty("count") && relEarliest["count"] == -1 ) {
                if (!relEarliest.hasOwnProperty("snapUnits") || (relEarliest["snapUnits"] == relEarliest["units"])) {
                    // TRANS: in this particular case the range is exactly one month (or one hour or one minute).
                    return sprintf(_("in the last %(unitOfTime)s"), {unitOfTime: this._unitMap[relEarliest["units"]]});
                }
            }
            // catches cases like "in the last 4 months",  "in the last 7 hours", also regardless of snap term
            else if (relEarliest.hasOwnProperty("units") && relEarliest.hasOwnProperty("count")) {
                // make sure there's either no earliest snap time, or it matches the unit
                if (!relEarliest.hasOwnProperty("snapUnits") || relEarliest["snapUnits"] == relEarliest["units"]) {
                    // TRANS: TODO - still need to ungettext this plural form and remove the hardcoded S below... However since the value is dynamic in the code it requires further thought.
                    return sprintf(_("in the last %(count)s %(unitOfTime)ss"), {count: -relEarliest["count"], unitOfTime: this._unitMap[relEarliest["units"]]});
                }
            }
        }
        return this.CUSTOM_RELATIVE_RANGE_HEADER;
    },

    /**
     * Copies a new TimeRange instance and returns.  Useful for when you
     * want to pass a TimeRange property, but you dont entirely trust the
     * receiver to leave it unchanged.
     */
    clone: function() {
        var range = new Splunk.TimeRange(this._constructorArgs[0], this._constructorArgs[1], this._constructorArgs[2], this._constructorArgs[3]);
        range.setAsSubRangeOfJob(this.isSubRangeOfJob());
        return range;
    },
    /**
     * Deprecated version of clone().  Deprecated 7/26/2010 for consistency. 
     * other objects in splunk.* have a clone() method. No others have a 
     * copy() method.
     */
    copy: function() {
        return this.clone();
    },
    
    strftime: function(date, timeFormat) {
        return date.strftime(timeFormat || this.getTimeFormat());
    },
    
    getTimeFormat: function() {
        return Splunk.util.getConfigValue('DISPATCH_TIME_FORMAT', this._fallbackAbsoluteTimeFormat);
    }
});
Splunk.TimeRange.UTCRegex = new RegExp("^[0-9]*(\.[0-9]+)?$");
Splunk.TimeRange.CORRECT_OFFSET_ON_DISPLAY = true;
Splunk.TimeRange.relativeArgsToString = function(count, units, snapUnits) {
    // doesnt matter but we pick earliest.
    var which = 'earliest';
    var range = new Splunk.TimeRange();
    range._relativeArgs[which] = {count: count, units:units, snapUnits:snapUnits};
    return range.genericGetForRelativeArg(which);
};






Splunk.TimeZone = $.klass({

    initialize: function(serializedTimeZone) {
        this._serializedTimeZone = serializedTimeZone;
        
        this._standardOffset = null; //Number 
        this._serializedTimeZone = null;  //String;

        this._isConstant = false;
        this._offsetList =[];
        this._timeList   =[];
        this._indexList  =[];

        this._parseSerializedTimeZone(serializedTimeZone);
    },

    getSerializedTimeZone: function () {
        return this._serializedTimeZone;
    },

    numericBinarySearch: function(list, value) {
        if (!list) throw new TypeError("Parameter list must be non-null.");
        var high = list.length - 1;
        if (high < 0) return -1;

        var low = 0;
        var mid;
        var comp;

        while (low <= high) {
            mid = parseInt(low + (high - low) / 2, 10);
            comp = (value - list[mid]);
            
            if (comp < 0) {
                high = mid - 1;
            } else if (comp > 0) {
                low = mid + 1;
            } else {
                return mid;
            }
        }
        return -low - 1;
    },

    getOffset: function(epochTime) {
        if (this._isConstant) return this._standardOffset;

        var offsetList = this._offsetList;
        var numOffsets = offsetList.length;
        if (numOffsets == 0) return 0;

        if (numOffsets == 1) return offsetList[0];

        var timeList = this._timeList;
        var numTimes = timeList.length;
        if (numTimes == 0) return 0;

        var timeIndex;
        if (numTimes == 1) {
            timeIndex = 0;
        }
        else {
            timeIndex = this.numericBinarySearch(timeList, epochTime);
            if (timeIndex < -1) {
                timeIndex = -timeIndex - 2;
            } else if (timeIndex == -1) {
                timeIndex = 0;
            }
        }
        var offsetIndex = this._indexList[timeIndex];
        return offsetList[offsetIndex];
    },

    _parseSerializedTimeZone: function (serializedTimeZone) {
        // ### SERIALIZED TIMEZONE FORMAT 1.0
        // Y-25200 YW 50 44 54
        // Y-28800 NW 50 53 54
        // Y-25200 YW 50 57 54
        // Y-25200 YG 50 50 54
        // @-1633269600 0
        // @-1615129200 1
        // @-1601820000 0
        // @-1583679600 1

        // ### SERIALIZED TIMEZONE FORMAT 1.0
        // C0
        // Y0 NW 47 4D 54
        
        if (!serializedTimeZone)
            return;

        var entries = serializedTimeZone.split(";");
        for (var i=0; i<entries.length; i++) {
            var entry = entries[i];
            if (entry) {
                switch (entry.charAt(0)) {
                    case "C":
                        
                        if (this._parseC(entry.substring(1, entry.length)))
                            return;
                        break;
                    case "Y":
                        
                        this._parseY(entry.substring(1, entry.length));
                        break;
                    case "@":
                        this._parseAt(entry.substring(1, entry.length));
                        break;
                    default:
                        break;
                }
            }
        }

        this._standardOffset = this.getOffset(0);
    },

    _parseC: function(entry) {
        // 0    
        if (!entry) return false;

        var time = parseInt(entry, 10);
        /*jsl:ignore*/
        // this comparison triggers the 'useless comparison' error
        if (time != time) return false;
        /*jsl:end*/

        this._standardOffset = time;
        this._isConstant = true;

        return true;
    },

    _parseY: function(entry) {
        // -25200 YW 50 44 54

        if (!entry) return;
        
        var elements = entry.split(" ");
        if (elements.length < 1) return;

        var element = elements[0];
        if (!element) return;
        
        var offset = parseInt(element, 10);
        /*jsl:ignore*/
        // this comparison triggers the 'useless comparison' error
        if (offset != offset) return;
        /*jsl:end*/

        this._offsetList.push(offset);
    },

    _parseAt: function (entry) {
        // -1633269600 0

        if (!entry) return;

        var elements = entry.split(" ");
        if (elements.length < 2) return;

        var element = elements[0];
        if (!element) return;

        var time = parseInt(element, 10);
        /*jsl:ignore*/
        // this comparison triggers the 'useless comparison' error
        if (time != time) return;
        /*jsl:end*/

        element = elements[1];
        if (!element)  return;

        var index = parseInt(element, 10);
        /*jsl:ignore*/
        // this comparison triggers the 'useless comparison' error
        if (index != index) return;
        /*jsl:end*/

        index = parseInt(index, 10);
        if ((index < 0) || (index >= this._offsetList.length)) return;

        this._timeList.push(time);
        this._indexList.push(index);
    }
});


define("splunk.timerange", ["splunk","splunk.util","splunk.logger","splunk.i18n","splunk.time","lowpro"], (function (global) {
    return function () {
        var ret, fn;
       fn = function (Splunk) {
                Splunk.namespace("Globals");
                if (!Splunk.Globals.timeZone)
                    Splunk.Globals.timeZone = new Splunk.TimeZone(Splunk.util.getConfigValue('SERVER_ZONEINFO'));
                return Splunk.TimeRange;
            };
        ret = fn.apply(global, arguments);
        return ret || global.Splunk.Timerange;
    };
}(this)));

///////////////////////////////////////////////////////////////////////////////
// Provides common popup window/dialogs
///////////////////////////////////////////////////////////////////////////////


Splunk.window = {
    
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
    open: function(uri, name, options) {

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
    },
    
    /**
     * Opens the job manager as a popup window
     */
    openJobManager: function(getArgs) {
        var app = Splunk.util.getCurrentApp();
        if (app == "UNKNOWN_APP") app = "search";
        var url = Splunk.util.make_url('app', app, 'job_management');
        if (getArgs) url += "?" + Splunk.util.propToQueryString(getArgs);
        var spawnedWindow = this.open(
            url, 
            'splunk_job_manager',
            {
                width: 900,
                height: 600,
                'menubar': false
            }
        );
        return spawnedWindow;
    },
    
    openAerts: function(href) {
        return this.open(href, 'splunk_alerts', {width: 900, height: 600, 'menubar': false});
    },
    
    openJobInspector: function(sid) {
        var url = Splunk.util.make_url('search', 'inspector');
        
        if (!sid) {
            alert(_('Cannot open job inspector; no search job ID provided!'));
            return false;
        }
        
        var getArgs = {
            sid: sid,
            namespace: Splunk.util.getCurrentApp()
        };
        url += "?" + Splunk.util.propToQueryString(getArgs);
        //set width and height slightly less than openJobManager so when open on top of job manager the window can be easily identified
        var spawnedWindow = this.open(
            url, 
            'splunk_job_inspector',
            {
                width: 870, 
                height: 560,
                'menubar': false
            }
        );
        return spawnedWindow;
    }
    
};
define("splunk.window", ["splunk","splunk.util","splunk.i18n"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Splunk.window;
    };
}(this)));

/**
 * The JABridge class provides a standard interface to Flash movies that implement AS JABridge interface.
 *
 * @class JABrige
 * @param id {String} The target id/name attribute of the embedded swf element.
 */
Splunk.JABridge = function(id){
    // Singleton based on id
    if(Splunk.JABridge.instances[id]){
        return Splunk.JABridge.instances[id];
    }
    // Private members
    var self = this,
        isConnected = false, //Connection status
        properties = {},
        propertiesArray = [],
        methods = {},
        methodsArray = [],
        events = {},
        eventsArray = [],
        hasListeners = {},
        isInitialized = false,
        isNotified = false,
        eventListeners = {},
        notifyConnectTimeout,
        connectCallback, //Reference to the callback method on connect
        closeCallback, //References to the callback method on close
        inDocumentElement; //The object reference to the in document embedded swf element
    /**
     * Slice utility for a closures "arguments" property. The argument property is an Array like
     * structure that is missing common methods.
     */
    var argumentsSlice = function(args, start, end){
        var argList = [];
        end = end || args.length;
        for(var i=start; i<end; i++){
            argList.push(args[i]);
        }
        return argList;
    };
    /**
     * The Array indexOf method is not supported accross all platforms.
     */
    var indexOf = function(array, item){
        if(array.indexOf){
            return array.indexOf(item);
        }else{
            for(var i=0; i<array.length; i++){
                if(array[i]==item){
                    return i;
                }
            }
            return -1;
        }
    };
    var notifyConnect = function(){
        isNotified = true;
        connectCallback();
    };
    /**
     * Sends operation command to Flash movie.
     */
    var sendOperation = function(operation){
        operation = Splunk.JABridge.Cerealizer.serialize(operation);
        var response;
        if(!inDocumentElement){
            inDocumentElement = self.getFlashElement();
        }
        if(inDocumentElement){
            var method = inDocumentElement[Splunk.JABridge.RECEIVER_METHOD];
            if(method){
                response = inDocumentElement[Splunk.JABridge.RECEIVER_METHOD](operation);//Shorthand method(operation) or apply does not work with consistently.
                response = Splunk.JABridge.Cerealizer.deserialize(response);
            }
        }
        if(response==null){
            throw new Error("Null response object. Connection may have been lost.");
        }
        if(typeof(response)!="object"){
            throw new Error("Invalid response object.");
        }
        if(response.success!=true){
            if(response.message){
                throw new Error(response.message);
            }
            throw new Error("Uknown error.");
        }
        return response.result;
    };
    var processConnect = function(){
        if(!isConnected){
            isConnected = true;
            //Post-event handler
            notifyConnectTimeout = setTimeout(notifyConnect, 0);
        }
        return Splunk.JABridge.successResponse();
    };
    var processClose = function(){
        if(isConnected){
            clearTimeout(notifyConnectTimeout);
            var wasNotified = isNotified;
            hasListeners = {};
            eventListeners = {};
            isConnected = false;
            isNotified = false;
            var closeCallbackCopy = closeCallback;
            if(wasNotified && (closeCallbackCopy!=null)){
                try{
                    closeCallback();
                }catch(err){
                    setTimeout(function(){throw err;}, 0);
                }
            }
        }
        return Splunk.JABridge.successResponse();
    };
    var processGetInterface = function(){
        var i = 0,
            propertySet = [],
            methodSet = [],
            eventSet = [],
            property,
            method,
            event;
        for(i=0; i<propertiesArray.length; i++){
            var propertyDescriptor = propertiesArray[i];
            property = {};
            property.name = propertyDescriptor.name;
            if(propertyDescriptor.getter==null){
                property.access = "write-only";
            }else if(propertyDescriptor.setter == null){
                property.access = "read-only";
            }else{
                property.access = "read-write";
            }
            property.type = propertyDescriptor.type;
            property.description = propertyDescriptor.description;
            propertySet.push(property);
        }   
        for(i=0; i<methodsArray.length; i++){
            var methodDescriptor = methodsArray[i];
            method = {};
            method.name = methodDescriptor.name;
            method.parameters = methodDescriptor.parameters;
            method.returnType = methodDescriptor.returnType;
            method.description = methodDescriptor.description;
            methodSet.push(method);
        }
        for(i=0; i<eventsArray.length; i++){
            var eventDescriptor = eventsArray[i];
            event = {};
            event.name = eventDescriptor.name;
            event.parameters = eventDescriptor.parameters;
            event.description = eventDescriptor.description;
            eventSet.push(event);
        }
        return Splunk.JABridge.resultResponse({"properties":propertySet, "methods":methodSet, "events":eventSet});               
    };
    var processGetProperty = function(propertyName){
        var response;
        try{
            var propertyDescriptor = properties[propertyName];
            if(!propertyDescriptor){
                throw new Error("Unknown property " + propertyName + ".");
            }
            if(propertyDescriptor.getter==null){
                throw new Error("Property " + propertyName + " is write-only.");
            }
            var result = propertyDescriptor.getter();
            response = Splunk.JABridge.resultResponse(result);
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var processSetProperty = function(propertyName, value){
        var response;
        try{
            var propertyDescriptor = properties[propertyName];
            if(!propertyDescriptor){
                throw new Error("Unknown property " + propertyName + ".");
            }
            if(propertyDescriptor.setter==null){
                throw new Error("Property " + propertyName + " is read-only.");
            }
            propertyDescriptor.setter(value);
            response = Splunk.JABridge.successResponse();           
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var processCallMethod = function(methodName, args){
        var response;
        try{
            var methodDescriptor = methods[methodName];
            if(!methodDescriptor){
                throw new Error("Unknown method " + methodName + ".");
            }
            if(!(args instanceof Array)){
                args = [args];
            }
            var result = methodDescriptor.method.apply(null, args);
            response = Splunk.JABridge.resultResponse(result);
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var processAddEventListener = function(eventName){
        var response;
        try{
            var eventDescriptor = events[eventName];
            if(!eventDescriptor){
                throw new Error("Unknown event " + eventName + ".");
            }
            hasListeners[eventName] = true;
            response = Splunk.JABridge.successResponse();
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var processRemoveEventListener = function(eventName){
        var response;
        try{
            var eventDescriptor = events[eventName];
            if(!eventDescriptor){
                throw new Error("Uknown event " + eventName + ".");
            }
            delete hasListeners[eventName];
            response = Splunk.JABridge.successResponse();
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var processDispatchEvent = function(eventName, args){
        var reponse;
        try{
            if(!(args instanceof Array)){
                args = [args];
            }
            var listeners = eventListeners[eventName];
            if(listeners!=null){
                listeners = listeners.concat();
                for(var i=0; i<listeners.length; i++){
                    listeners[i].apply(null, args);
                }
            }
            response = Splunk.JABridge.successResponse();
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    var addInterfaceToString = function(interfaceDescriptor){
        interfaceDescriptor.toString = function(){
            var header = "----------------------------------------\n";
            str = "";
            str += header;
            str += "properties\n";
            str += header;
            str += "\n";
            for(var i in this.properties){
                var property = this.properties[i];
                str += property.name;
                if(property.type){
                    str += ":" + property.type;
                }
                if(property.access=="read-only"){
                    str += " [read-only]";
                }else if(property.access=="write-only"){
                    str += " [write-only]";
                }
                if(property.description){
                    str += "\n" + property.description;
                }
                str += "\n\n";
            }
            str += header;
            str += "methods\n";
            str += header;
            str += "\n";
            for(var k in this.methods){
                var method = this.methods[k];
                str += method.name;
                str += "(";
                if(method.parameters){
                    for(var j=0; j<method.parameters.length; j++){
                        if(j>0){
                            str += ", ";
                        }
                        str += method.parameters[j];
                    }
                }
                str += ")";
                if(method.returnType){
                    str += ":" + method.returnType;
                }
                if(method.description){
                    str += "\n" + method.description;
                }
                str += "\n\n";
            }
            str += header;
            str += "events\n";
            str += header;
            str += "\n";
            for(var l in this.events){
                var event = this.events[l];
                str += event.name;
                str += "(";
                if(event.parameters){
                    for(var m=0; m<event.parameters.length; m++){
                        if(m>0){
                            str += ", ";
                        }
                        str += event.parameters[m];
                    }
                }
                str += ")";
                if(event.description){
                    str += "\n" + event.description;
                }
                str += "\n\n";
            }   
            return str;
        };
    };
    /**
     * Getting the reference to an embedded Flash movie is inconsistent due to the use
     * of the non-standard embed element in many implementations.
     */
    self.getFlashElement = function(){
        return window[id] || document.getElementById(id);
    };
    self.isConnected = function(){
        return isConnected;
    };
    self.id = function(){
        return id;
    };
    self.getInterface = function(){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);
        }
        try{
            var interfaceDescriptor = sendOperation({"type":"getInterface"});
            addInterfaceToString(interfaceDescriptor);
        }catch (err){
            throw new Error(err.message);
        }
        return interfaceDescriptor;
    };
    self.getProperty = function(propertyName){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);
        }
        try{
            var value = sendOperation({"type":"getProperty", "propertyName":propertyName});
        }catch(err){
            throw new Error(err.message);
        }
        return value;
    };
    self.setProperty = function(propertyName, value){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);           
        }
        try{
            sendOperation({"type":"setProperty", "propertyName":propertyName, "value":value});
        }catch(err){
            throw new Error(err.message);
        }
    };   
    self.callMethod = function(methodName){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);           
        }
        var result;
        var args = argumentsSlice(arguments, 1);
         try{
            result = sendOperation({"type":"callMethod", "methodName":methodName, "arguments":args});
        }catch(err){
            throw new Error(err.message);
        }
        return result;
    };
    self.addEventListener = function(eventName, listener){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);           
        }
        var listeners = eventListeners[eventName];
        if(listeners==null){
            try{
                sendOperation({"type":"addEventListener", "eventName":eventName});
            }catch(err){
                throw new Error(err.message);
            }
            listeners = eventListeners[eventName] = [];
            listeners.push(listener);
        }else if(indexOf(listeners, listener)<0){
            listeners.push(listener);               
        }
    };
    self.removeEventListener = function(eventName, listener){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);           
        }       
        var listeners = eventListeners[eventName];
        if(listeners!=null){
            var index = indexOf(listeners, listener);
            if(index>=0){
                listeners.splice(index, 1);
                if(listeners.length==0){
                    delete eventListeners[eventName];
                    try{
                        sendOperation({"type":"removeEventListener", "eventName":eventName});
                    }catch(err){
                        throw new Error(err.message);
                    }                                       
                }
            }
        }
    };
    self.receiveOperation = function(operation){
        if(!isInitialized){
            return null;
        }
        if(operation==null){
            throw new Error("A null communication object.");
        }
        if(typeof(operation)!="object"){
            throw new Error("Invalid communication object.");
        }
        if(!operation.type){
            throw new Error("A null operation type.");
        }
        try{
            switch(operation.type){
                case "close":
                    response = processClose();
                    break;
                case "connect":
                    response = processConnect();
                    break;
                case "getInterface":
                    response = processGetInterface();
                    break;
                case "getProperty":
                    response = processGetProperty(operation.propertyName);
                    break;
                case "setProperty":
                    response = processSetProperty(operation.propertyName, operation.value);
                    break;
                case "callMethod":
                    response = processCallMethod(operation.methodName, operation.arguments);
                    break;
                case "addEventListener":
                    response = processAddEventListener(operation.eventName);
                    break;
                case "removeEventListener":
                    response = processRemoveEventListener(operation.eventName);
                    break;
                case "dispatchEvent":
                    response = processDispatchEvent(operation.eventName, operation.arguments);
                    break;
                default:
                    response = Splunk.JABridge.errorResponse("Unknown operation " + operation.type + ".");
                    break;
            }
        }catch(err){
            response = Splunk.JABridge.errorResponse(err.message);
        }
        return response;
    };
    /**
     * Expose a JavaScript property to Flash.
     * @method addProperty
     * @param {String} propertyName Exposed reference name of property.
     * @param {Function/null} getter (Optional) Handler that returns a property or null. If getter is null,  setter must be defined.
     * @param {Function/null} setter (Optional) Handler that sets a property or null. If setter is null, getter must be defined.
     * @param {String} type (Optional) Return type documentation.
     * @param {String} description (Optional) General description documentation.
     */
    self.addProperty = function(propertyName, getter, setter, type, description){
        if(isInitialized){
            throw new Error(Splunk.JABridge.INITIALIZED_ERROR);
        }
        if(getter==null && setter==null){
            throw new Error("One of paramaters getter or setter must be non-null");
        }
        if(properties[propertyName]){
            throw new Error("Property already defined.");       
        }
        var propertyDescriptor = new Splunk.JABridge.PropertyDescriptor(propertyName, getter, setter, type, description);
        properties[propertyName] = propertyDescriptor;
        propertiesArray.push(propertyDescriptor);
    };   
    /**
     * Expose a JavaScript method to Flash.
     * @method addMethod
     * @param {String} methodName Exposed reference name of method.
     * @param {Function} method (Optional) Handler that is called.
     * @param {Array} parameters (Optional) Array of String parameter documentation.
     * @param {String} returnType (Optional) Return type documentation.
     * @param {String} description (Optional) General description documentation.
     */
    self.addMethod = function(methodName, method, parameters, returnType, description){
        if(isInitialized){
            throw new Error(Splunk.JABridge.INITIALIZED_ERROR);
        }
        if(methods[methodName]){
            throw new Error("Method already defined.");       
        }
        var methodDescriptor = new Splunk.JABridge.MethodDescriptor(methodName, method, parameters, returnType, description);
        methods[methodName] = methodDescriptor;
        methodsArray.push(methodDescriptor);
    };
    /**
     * Expose a JavaScript event to Flash.
     * @method addEvent
     * @param {String} eventName Exposed reference name of event.
     * @param {Array} parameters (Optional) Array of String parameter documentation.
     * @param {String} description (Optional) General description documentation.
     */
    self.addEvent = function(eventName, parameters, description){
        if(isInitialized){
            throw new Error(Splunk.JABridge.INITIALIZED_ERROR);   
        }
        if(events[eventName]){
            throw new Error("Event already defined.");
        }
        var eventDescriptor = new Splunk.JABridge.EventDescriptor(eventName, parameters, description);
        events[eventName] = eventDescriptor;
        eventsArray.push(eventDescriptor);
    };
    /**
     * Dispatch an exposed JavaScript event to Flash.
     * @method dispatchEvent
     * @param {String} eventName Exposed reference name of event to trigger.
     */   
    self.dispatchEvent = function(eventName){
        if(!isConnected){
            throw new Error(Splunk.JABridge.CONNECTION_ERROR);
        }
        var args = argumentsSlice(arguments, 1);
        if(!events[eventName]){
            throw new Error("Unknown event " + eventName + ".");
        }
        if(!hasListeners[eventName]){
            return;
        }
        try{
            sendOperation({"type":"dispatchEvent", "eventName":eventName, "arguments":args});
        }catch(err){
            throw new Error(err.message);
        }
    };
    /**
     * Close the bridge, remove event listeners, reset connection state and fire the close callback handler.
     */
    self.close = function(){
        if(!isInitialized){
            return;
        }
        clearTimeout(notifyConnectTimeout);
        var wasConnected = isConnected;
        var wasNotified = isNotified;
        var closeCallbackCopy = closeCallback;
        hasListeners = {};
        eventListeners = {};
        isConnected = false;
        connectCallback = null;
        closeCallback = null;
        isInitialized = false;
        isNotified = false;
        if(wasConnected){
            try{
                sendOperation({"type":"close", "id":id});
            }catch(err){}
            if(wasNotified && (closeCallbackCopy!=null)){
                try{
                    closeCallbackCopy();
                }catch(err){
                    setTimeout(function(){throw err;}, 0);
                }
            }
        }
    };
    /**
     * Close the bridge, delete reference in static instances, self-destruct.
     */
    self.dispose = function(){
        self.close();
        delete Splunk.JABridge.instances[id];
        for(var i in self){
            if(self.hasOwnProperty(i)){
                delete self[i];
            }
        }
    };
    /**
     * Connect a JavaScript interface to a Flash movie.
     * @method connect
     * @param {Function} callback1 Callback to be fired when JavaScript/Flash connection negotiation completed.
     * @param {Function} callback2 Callback to be fired when JavaScript/Flash connection has been closed.
     */
    self.connect = function(callback1, callback2){
        if(callback1!=null && callback1==Splunk.JABridge.connectAll){
            if(!isInitialized || isConnected){
                return;
            }
        }else{
            if(callback1==null){
                throw new Error("A callback must be defined in order for a JavaScript/Flash connection negotiation.");
            }
            self.close();
            connectCallback = callback1;
            closeCallback = callback2;
            isInitialized = true;
        }
        try{
            sendOperation({"type":"connect", "id":id});
            isConnected = true;
            notifyConnectTimeout = setTimeout(notifyConnect, 0);
        }catch(err){}
    };
    self.JABridge = function(){
        Splunk.JABridge.instances[id] = self;
    }();
};
//Class members.
Splunk.JABridge.RECEIVER_METHOD = "JABridge_receiveOperation"; //ActionScript ExternalInteface exposed receiver method.
Splunk.JABridge.CONNECTION_ERROR = "JABridge not connected.";
Splunk.JABridge.INITIALIZED_ERROR = "JABridge already initialized.";
Splunk.JABridge.getInstance = function(id){
    return new Splunk.JABridge(id);
};
Splunk.JABridge.instances = {};
Splunk.JABridge.successResponse = function(){
    return {"success":true};
};
Splunk.JABridge.resultResponse = function(result){
    return {"success":true, "result":result};
};
Splunk.JABridge.errorResponse = function(message){
    return {"success":false, "message":message};
};
Splunk.JABridge.receiveOperation = function(operation){
    var response;
    try{
        operation = Splunk.JABridge.Cerealizer.deserialize(operation);
        if(!operation.id){
            if(!Splunk.JABridge.isConnectAll){
                Splunk.JABridge.isConnectAll = true;
                setTimeout(Splunk.JABridge.connectAll, 0);
            }
            response = Splunk.JABridge.errorResponse("null operation id.");
        }else{
            var instance = Splunk.JABridge.instances[operation.id];
            if(instance!=null){
                response = instance.receiveOperation(operation);
            }
        }
    }catch(error){
        response = Splunk.JABridge.errorResponse(error.message);
    }
    return Splunk.JABridge.Cerealizer.serialize(response);
};
JABridge_receiveOperation = Splunk.JABridge.receiveOperation;
Splunk.JABridge.isConnectAll = false;
Splunk.JABridge.connectAll = function(){
    var instances = Splunk.JABridge.instances;
    for(var i in instances){
         if(instances.hasOwnProperty(i)){
            instances[i].connect(Splunk.JABridge.connectAll);
         }
    }
    Splunk.JABridge.isConnectAll = false;
};
Splunk.JABridge.PropertyDescriptor = function(name, getter, setter, type, description){
    var self = this;
        self.name = name;
        self.getter = getter;
        self.setter = setter;
        self.type = type;
        self.description = description;
};
Splunk.JABridge.MethodDescriptor = function(name, method, parameters, returnType, description){
    var self = this;
        self.name = name;
        self.method = method;
        self.parameters = parameters;
        self.returnType = returnType;
        self.description = description;
};
Splunk.JABridge.EventDescriptor = function(name, parameters, description){
    var self = this;
        self.name = name;
        self.parameters = parameters;
        self.description = description;
};
Splunk.JABridge.Cerealizer = new function(){
    var self = this;
    var references = [];
    var tokens = "";
    var tokenCount = 0;
    var tokenIndex = 0;
    self.serialize = function(value){
        references = [];
        var str = serializeValue(value);
        references = null;
        return str;
    };
    self.deserialize = function(str){
        var value;
        try{
            references = new Array();
            tokens = str;
            tokenCount = tokens?tokens.length:0;
            tokenIndex = 0;
            value = deserializeNext();
            if(tokenIndex<tokenCount){
                throw new Error("Unexpected token.");
            }
        }catch(e){
            throw new Error("Deserialize error at index " + tokenIndex + ": " + e.message);
        }finally{
            references = null;
            tokens = null;
            tokenCount = 0;
            tokenIndex = 0;
        }
        return value;
    };
    var arrayIndexOf = function(array, item, fromIndex){
        if(array.indexOf){
            return array.indexOf(item, fromIndex);
        }else{
            for(var i = fromIndex || 0; i<array.length; i++){
                if(array[i]===item){
                    return i;
                }
            }
            return -1;
        }
    };
    var serializeValue = function(value){
        if(value===null){
            return "";
        }
        switch(typeof(value)){
            case "number":
                return serializeNumber(value);
            case "boolean":
                return serializeBoolean(value);
            case "string":
                return serializeString(value);
            case "object":
                var ref = serializeReference(value);
                if(ref){
                    return ref;
                }
                if(value instanceof Array){
                    return serializeArray(value);
                }else{
                    return serializeObject(value);
                }
            default:
                return "";
        }
    };
    var serializeNumber = function(num){
        return "#" + String(num) + "#";
    };
    var serializeBoolean = function(bool){
        return (bool?"t":"f");
    };
    var serializeString = function(str){
        return "\"" + escape(str) + "\"";
    };
    var serializeArray = function(arr){
        references.push(arr);
        var str = "";
        str += "[";
        var length = arr.length;
        for(var i=0; i<length; i++){
            if(i>0){
                str += ",";
            }
            str += serializeValue(arr[i]);
        }
        str += "]";
        return str;
    };
    var serializeObject = function(obj){
        references.push(obj);
        var str = "";
        str += "{";
        var i = 0;
        for(var p in obj){
            if(i>0){
                str += ",";
            }
            str += escape(p) + ":" + serializeValue(obj[p]);
            i++;
        }
        str += "}";
        return str;
    };
    var serializeReference = function(ref){
        var index = arrayIndexOf(references, ref);
        if(index>=0){
            return "@" + index + "@";
        }
        return null;
    };
    var deserializeNext = function(){
        if(tokenIndex>=tokenCount){
            return null;
        }
        switch(tokens.charAt(tokenIndex)){
            case "#":
                return deserializeNumber();
            case "t":
            case "f":
                return deserializeBoolean();
            case "\"":
                return deserializeString();
            case "[":
                return deserializeArray();
            case "{":
                return deserializeObject();
            case "@":
                return deserializeReference();
            default:
                return null;
        }
    };
    var deserializeNumber = function(){
        tokenIndex++;//eat #
        var endIndex = arrayIndexOf(tokens, "#", tokenIndex);
        if(endIndex<0){
            throw new Error("Expecting closing #.");
        }
        if(endIndex==tokenIndex){
            throw new Error("Expecting number.");
        }
        var num = Number(tokens.substring(tokenIndex, endIndex));
        tokenIndex = endIndex + 1;
        return num;
    };
    var deserializeBoolean = function(){
        return (tokens.charAt(tokenIndex++)=="t");
    };
    var deserializeString = function(){
        tokenIndex++;//eat "
        var endIndex = arrayIndexOf(tokens, "\"", tokenIndex);
        if(endIndex<0){
            throw new Error("Expecting closing quote.");
        }
        var str = unescape(tokens.substring(tokenIndex, endIndex));
        tokenIndex = endIndex + 1;
        return str;
    };
    var deserializeArray = function(){
        tokenIndex++;//eat [
        if(tokenIndex>=tokenCount){
            throw new Error("Expecting closing brace.");
        }
        var arr = [];
        references.push(arr);
        var token = tokens.charAt(tokenIndex);
        if(token == "]"){
            tokenIndex++;
            return arr;
        }
        while(true){
            arr.push(deserializeNext());
            if(tokenIndex>=tokenCount){
                throw new Error("Expecting closing brace.");
            }
            token = tokens.charAt(tokenIndex++);
            if(token=="]"){
                break;
            }
            if(token!=","){
                throw new Error("Expecting comma or closing brace.");
            }
        }
        return arr;
    };
    var deserializeObject = function(){
        tokenIndex++;//eat {
        if(tokenIndex>=tokenCount){
            throw new Error("Expecting closing bracket.");
        }
        var obj = {};
        references.push(obj);
        var token = tokens.charAt(tokenIndex);
        if(token=="}"){
            tokenIndex++;
            return obj;
        }
        var colonIndex;
        var propertyName;
        while(true){
            colonIndex = arrayIndexOf(tokens, ":", tokenIndex);
            if(colonIndex<0){
                throw new Error("Expecting colon.");
            }
            propertyName = unescape(tokens.substring(tokenIndex, colonIndex));
            tokenIndex = colonIndex + 1;
            obj[propertyName] = deserializeNext();
            if(tokenIndex>=tokenCount){
                throw new Error("Expecting closing bracket.");
            }
            token = tokens.charAt(tokenIndex++);
            if(token=="}"){
                break;
            }
            if(token!=","){
                throw new Error("Expecting comma or closing bracket.");
            }
        }
        return obj;
    };
    var deserializeReference = function(){
        tokenIndex++;//eat @
        var endIndex = arrayIndexOf(tokens, "@", tokenIndex);
        if (endIndex<0){
            throw new Error("Expecting closing @.");
        }
        if(endIndex==tokenIndex){
            throw new Error("Expecting integer reference.");
        }
        var referenceIndex = Math.round(Number(tokens.substring(tokenIndex, endIndex)));
        if(isNaN(referenceIndex) || (referenceIndex<0) || (referenceIndex>=references.length)){
            throw new Error("Invalid reference.");
        }
        tokenIndex = endIndex + 1;
        return references[referenceIndex];
    };
};
define("splunk.jabridge", ["splunk"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Splunk.JABridge;
    };
}(this)));

define('splunk/charting/LogScale',['require','jg_global','jgatt'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var NumberUtils = require("jgatt").utils.NumberUtils;

	return jg_extend(Object, function(LogScale, base)
	{

		// Private Properties

		this._base = 0;
		this._baseMultiplier = 0;

		// Constructor

		this.constructor = function(base)
		{
			if ((base != null) && (typeof base !== "number"))
				throw new Error("Parameter base must be a number.");

			this._base = ((base > 0) && (base < Infinity)) ? base : 10;
			this._baseMultiplier = Math.log(this._base);
		};

		// Public Getters/Setters

		this.base = function()
		{
			return this._base;
		};

		// Public Methods

		this.valueToScale = function(value)
		{
			if (this._base <= 1)
				return 0;

			var scale = 0;

			var isNegative = (value < 0);

			if (isNegative)
				value = -value;

			if (value < this._base)
				value += (this._base - value) / this._base;
			scale = Math.log(value) / this._baseMultiplier;

			scale = NumberUtils.toPrecision(scale, -1);

			if (isNegative)
				scale = -scale;

			return scale;
		};

		this.scaleToValue = function(scale)
		{
			if (this._base <= 1)
				return 0;

			var value = 0;

			var isNegative = (scale < 0);

			if (isNegative)
				scale = -scale;

			value = Math.exp(scale * this._baseMultiplier);
			if (value < this._base)
				value = this._base * (value - 1) / (this._base - 1);

			value = NumberUtils.toPrecision(value, -1);

			if (isNegative)
				value = -value;

			return value;
		};

	});

});

define('splunk/time/TimeZone',['require','jg_global'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;

	return jg_extend(Object, function(TimeZone, base)
	{

		// Public Methods

		this.getStandardOffset = function()
		{
			return 0;
		};

		this.getOffset = function(time)
		{
			return 0;
		};

	});

});

define('splunk/time/SimpleTimeZone',['require','jg_global','splunk/time/TimeZone'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var TimeZone = require("splunk/time/TimeZone");

	return jg_extend(TimeZone, function(SimpleTimeZone, base)
	{

		// Private Properties

		this._offset = 0;

		// Constructor

		this.constructor = function(offset)
		{
			this._offset = (offset !== undefined) ? offset : 0;
		};

		// Public Methods

		this.getStandardOffset = function()
		{
			return this._offset;
		};

		this.getOffset = function(time)
		{
			return this._offset;
		};

	});

});

define('splunk/time/LocalTimeZone',['require','jg_global','splunk/time/TimeZone'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var TimeZone = require("splunk/time/TimeZone");

	return jg_extend(TimeZone, function(LocalTimeZone, base)
	{

		// Public Methods

		this.getStandardOffset = function()
		{
			var date = new Date(0);
			return -date.getTimezoneOffset() * 60;
		};

		this.getOffset = function(time)
		{
			var date = new Date(time * 1000);
			return -date.getTimezoneOffset() * 60;
		};

	});

});

define('splunk/time/TimeZones',['require','jg_global','splunk/time/LocalTimeZone','splunk/time/SimpleTimeZone'],function(require)
{

	var jg_static = require("jg_global").jg_static;
	var LocalTimeZone = require("splunk/time/LocalTimeZone");
	var SimpleTimeZone = require("splunk/time/SimpleTimeZone");

	return jg_static(function(TimeZones)
	{

		// Public Static Constants

		TimeZones.LOCAL = new LocalTimeZone();
		TimeZones.UTC = new SimpleTimeZone(0);

	});

});

define('splunk/time/DateTime',['require','jg_global','splunk/time/SimpleTimeZone','splunk/time/TimeZone','splunk/time/TimeZones'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var SimpleTimeZone = require("splunk/time/SimpleTimeZone");
	var TimeZone = require("splunk/time/TimeZone");
	var TimeZones = require("splunk/time/TimeZones");

	return jg_extend(Object, function(DateTime, base)
	{

		// Private Static Constants

		var _ISO_DATE_TIME_PATTERN = /([\+\-])?(\d{4,})(?:(?:\-(\d{2}))(?:(?:\-(\d{2}))(?:(?:[T ](\d{2}))(?:(?:\:(\d{2}))(?:(?:\:(\d{2}(?:\.\d+)?)))?)?(?:(Z)|([\+\-])(\d{2})(?:\:(\d{2}))?)?)?)?)?/;

		// Private Static Methods

		var _normalizePrecision = function(value)
		{
			return Number(value.toFixed(6));
		};

		var _pad = function(value, digits, fractionDigits)
		{
			/*jsl:ignore*/
			// this comparison triggers the 'useless comparison' error
			if (value != value)
				return "NaN";
			/*jsl:end*/
			if (value == Infinity)
				return "Infinity";
			if (value == -Infinity)
				return "-Infinity";

			digits = (digits !== undefined) ? digits : 0;
			fractionDigits = (fractionDigits !== undefined) ? fractionDigits : 0;

			var str = value.toFixed(20);

			var decimalIndex = str.indexOf(".");
			if (decimalIndex < 0)
				decimalIndex = str.length;
			else if (fractionDigits < 1)
				str = str.substring(0, decimalIndex);
			else
				str = str.substring(0, decimalIndex) + "." + str.substring(decimalIndex + 1, decimalIndex + fractionDigits + 1);

			for (var i = decimalIndex; i < digits; i++)
				str = "0" + str;

			return str;
		};

		// Private Properties

		this._year = 0;
		this._month = 1;
		this._day = 1;
		this._weekday = 0;
		this._hours = 0;
		this._minutes = 0;
		this._seconds = 0;
		this._timeZone = TimeZones.LOCAL;
		this._timeZoneOffset = 0;
		this._time = 0;

		this._isValid = true;

		// Constructor

		this.constructor = function(yearOrTimevalue, month, day, hours, minutes, seconds, timeZone)
		{
			switch (arguments.length)
			{
				case 0:
					var now = new Date();
					this._time = now.getTime() / 1000;
					this._updateProperties();
					break;
				case 1:
					if (typeof yearOrTimevalue === "number")
					{
						this._time = yearOrTimevalue;
						this._updateProperties();
					}
					else if (typeof yearOrTimevalue === "string")
					{
						var matches = _ISO_DATE_TIME_PATTERN.exec(yearOrTimevalue);
						var numMatches = matches ? matches.length : 0;
						var match;

						match = (numMatches > 1) ? matches[1] : null;
						var yearSign = (match == "-") ? -1 : 1;

						match = (numMatches > 2) ? matches[2] : null;
						this._year = match ? yearSign * Number(match) : 0;

						match = (numMatches > 3) ? matches[3] : null;
						this._month = match ? Number(match) : 1;

						match = (numMatches > 4) ? matches[4] : null;
						this._day = match ? Number(match) : 1;

						match = (numMatches > 5) ? matches[5] : null;
						this._hours = match ? Number(match) : 0;

						match = (numMatches > 6) ? matches[6] : null;
						this._minutes = match ? Number(match) : 0;

						match = (numMatches > 7) ? matches[7] : null;
						this._seconds = match ? Number(match) : 0;

						match = (numMatches > 8) ? matches[8] : null;
						var timeZoneUTC = (match == "Z");

						match = (numMatches > 9) ? matches[9] : null;
						var timeZoneSign = (match == "-") ? -1 : 1;

						match = (numMatches > 10) ? matches[10] : null;
						var timeZoneHours = match ? Number(match) : NaN;

						match = (numMatches > 11) ? matches[11] : null;
						var timeZoneMinutes = match ? Number(match) : NaN;

						if (timeZoneUTC)
							this._timeZone = TimeZones.UTC;
						else if (!isNaN(timeZoneHours) && !isNaN(timeZoneMinutes))
							this._timeZone = new SimpleTimeZone(timeZoneSign * (timeZoneHours * 60 + timeZoneMinutes) * 60);
						else
							this._timeZone = TimeZones.LOCAL;

						this._updateTime();
					}
					else
					{
						this._time = NaN;
						this._updateProperties();
					}
					break;
				default:
					if (typeof yearOrTimevalue === "number")
					{
						this._year = yearOrTimevalue;
						this._month = (month !== undefined) ? month : 1;
						this._day = (day !== undefined) ? day : 1;
						this._hours = (hours !== undefined) ? hours : 0;
						this._minutes = (minutes !== undefined) ? minutes : 0;
						this._seconds = (seconds !== undefined) ? seconds : 0;
						this._timeZone = (timeZone instanceof TimeZone) ? timeZone : TimeZones.LOCAL;
						this._updateTime();
					}
					else
					{
						this._time = NaN;
						this._updateProperties();
					}
					break;
			}
		};

		// Public Getters/Setters

		this.getYear = function()
		{
			return this._year;
		};
		this.setYear = function(value)
		{
			this._year = value;
			this._updateTime();
		};

		this.getMonth = function()
		{
			return this._month;
		};
		this.setMonth = function(value)
		{
			this._month = value;
			this._updateTime();
		};

		this.getDay = function()
		{
			return this._day;
		};
		this.setDay = function(value)
		{
			this._day = value;
			this._updateTime();
		};

		this.getWeekday = function()
		{
			return this._weekday;
		};

		this.getHours = function()
		{
			return this._hours;
		};
		this.setHours = function(value)
		{
			this._hours = value;
			this._updateTime();
		};

		this.getMinutes = function()
		{
			return this._minutes;
		};
		this.setMinutes = function(value)
		{
			this._minutes = value;
			this._updateTime();
		};

		this.getSeconds = function()
		{
			return this._seconds;
		};
		this.setSeconds = function(value)
		{
			this._seconds = value;
			this._updateTime();
		};

		this.getTimeZone = function()
		{
			return this._timeZone;
		};
		this.setTimeZone = function(value)
		{
			this._timeZone = (value instanceof TimeZone) ? value : TimeZones.LOCAL;
			this._updateTime();
		};

		this.getTimeZoneOffset = function()
		{
			return this._timeZoneOffset;
		};

		this.getTime = function()
		{
			return this._time;
		};
		this.setTime = function(value)
		{
			this._time = value;
			this._updateProperties();
		};

		// Public Methods

		this.toUTC = function()
		{
			return this.toTimeZone(TimeZones.UTC);
		};

		this.toLocal = function()
		{
			return this.toTimeZone(TimeZones.LOCAL);
		};

		this.toTimeZone = function(timeZone)
		{
			var date = new DateTime();
			date.setTimeZone(timeZone);
			date.setTime(this._time);
			return date;
		};

		this.clone = function()
		{
			var date = new DateTime();
			date.setTimeZone(this._timeZone);
			date.setTime(this._time);
			return date;
		};

		this.equals = function(toCompare)
		{
			return ((this._time === toCompare._time) && (this._timeZoneOffset === toCompare._timeZoneOffset));
		};

		this.toString = function()
		{
			if (!this._isValid)
				return "Invalid Date";

			var str = "";
			if (this._year < 0)
				str += "-" + _pad(-this._year, 4);
			else
				str += _pad(this._year, 4);
			str += "-" + _pad(this._month, 2) + "-" + _pad(this._day, 2);
			str += "T" + _pad(this._hours, 2) + ":" + _pad(this._minutes, 2) + ":" + _pad(this._seconds, 2, 3);

			var timeZoneOffset = this._timeZoneOffset / 60;
			if (timeZoneOffset == 0)
			{
				str += "Z";
			}
			else
			{
				if (timeZoneOffset < 0)
					str += "-";
				else
					str += "+";
				if (timeZoneOffset < 0)
					timeZoneOffset = -timeZoneOffset;
				var timeZoneHours = Math.floor(timeZoneOffset / 60);
				var timeZoneMinutes = Math.floor(timeZoneOffset % 60);
				str += _pad(timeZoneHours, 2) + ":" + _pad(timeZoneMinutes, 2);
			}

			return str;
		};

		this.valueOf = function()
		{
			return this._time;
		};

		// Private Methods

		this._updateTime = function()
		{
			if (this._validate())
			{
				var years = this._year;
				var months = this._month - 1;
				var days = this._day - 1;
				var hours = this._hours;
				var minutes = this._minutes;
				var seconds = this._seconds;

				var secondsPerMinute = 60;
				var secondsPerHour = secondsPerMinute * 60;
				var secondsPerDay = secondsPerHour * 24;

				var totalMonths = months + years * 12;
				var wholeMonths = Math.floor(totalMonths);
				var subMonths = totalMonths - wholeMonths;

				var totalSeconds = seconds + (minutes * secondsPerMinute) + (hours * secondsPerHour) + (days * secondsPerDay);
				var wholeSeconds = Math.floor(totalSeconds);
				var subSeconds = totalSeconds - wholeSeconds;

				var date = new Date(0);
				date.setUTCFullYear(0);
				date.setUTCMonth(wholeMonths);

				if (subMonths != 0)
				{
					date.setUTCMonth(date.getUTCMonth() + 1);
					date.setUTCDate(0);

					var monthsTotalSeconds = date.getUTCDate() * subMonths * secondsPerDay;
					var monthsWholeSeconds = Math.floor(monthsTotalSeconds);
					var monthsSubSeconds = monthsTotalSeconds - monthsWholeSeconds;

					wholeSeconds += monthsWholeSeconds;
					subSeconds += monthsSubSeconds;
					if (subSeconds >= 1)
					{
						subSeconds--;
						wholeSeconds++;
					}

					date.setUTCDate(1);
				}

				date.setUTCSeconds(wholeSeconds);

				var time = (date.getTime() / 1000) + subSeconds;
				var timeZone = this._timeZone;

				this._time = time - timeZone.getOffset(time - timeZone.getStandardOffset());

				this._updateProperties();
			}
		};

		this._updateProperties = function()
		{
			if (this._validate())
			{
				var time = _normalizePrecision(this._time);
				var timeZoneOffset = _normalizePrecision(this._timeZone.getOffset(time));

				var totalSeconds = time + timeZoneOffset;
				var wholeSeconds = Math.floor(totalSeconds);
				var subSeconds = _normalizePrecision(totalSeconds - wholeSeconds);
				if (subSeconds >= 1)
				{
					subSeconds = 0;
					wholeSeconds++;
				}

				var date = new Date(wholeSeconds * 1000);

				this._year = date.getUTCFullYear();
				this._month = date.getUTCMonth() + 1;
				this._day = date.getUTCDate();
				this._weekday = date.getUTCDay();
				this._hours = date.getUTCHours();
				this._minutes = date.getUTCMinutes();
				this._seconds = date.getUTCSeconds() + subSeconds;

				this._time = time;
				this._timeZoneOffset = timeZoneOffset;

				this._validate();
			}
		};

		this._validate = function()
		{
			if (this._isValid)
			{
				this._year *= 1;
				this._month *= 1;
				this._day *= 1;
				this._weekday *= 1;
				this._hours *= 1;
				this._minutes *= 1;
				this._seconds *= 1;
				this._timeZoneOffset *= 1;
				this._time *= 1;
				var checksum = this._year + this._month + this._day + this._weekday + this._hours + this._minutes + this._seconds + this._timeZoneOffset + this._time;
				if (isNaN(checksum) || (checksum == Infinity) || (checksum == -Infinity) || !this._timeZone)
					this._isValid = false;
			}
			else
			{
				this._year *= 1;
				this._time *= 1;
				if ((this._year > -Infinity) && (this._year < Infinity))
				{
					this._month = 1;
					this._day = 1;
					this._hours = 0;
					this._minutes = 0;
					this._seconds = 0;
					this._isValid = true;
				}
				else if ((this._time > -Infinity) && (this._time < Infinity))
				{
					this._isValid = true;
				}
			}

			if (!this._isValid)
			{
				this._year = NaN;
				this._month = NaN;
				this._day = NaN;
				this._weekday = NaN;
				this._hours = NaN;
				this._minutes = NaN;
				this._seconds = NaN;
				this._timeZoneOffset = NaN;
				this._time = NaN;
			}

			return this._isValid;
		};

	});

});

define('splunk/viz/GraphicsVizBase',['require','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/viz/VizBase'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Point = require("jgatt").geom.Point;
	var Graphics = require("jgatt").graphics.Graphics;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var PropertyComparator = require("jgatt").utils.PropertyComparator;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var VizBase = require("splunk/viz/VizBase");

	return jg_extend(VizBase, function(GraphicsVizBase, base)
	{

		// Public Passes

		this.renderGraphicsPass = new ValidatePass("renderGraphics", 2, new PropertyComparator("renderGraphicsPriority"));

		// Public Properties

		this.x = new ObservableProperty("x", Number, 0)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : 0;
			})
			.setter(function(value)
			{
				this.setStyle({ left: value + "px" });
			});

		this.y = new ObservableProperty("y", Number, 0)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : 0;
			})
			.setter(function(value)
			{
				this.setStyle({ top: value + "px" });
			});

		this.width = new ObservableProperty("width", Number, 0)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.height = new ObservableProperty("height", Number, 0)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.renderGraphicsPriority = 0;
		this.graphics = null;

		// Constructor

		this.constructor = function(html)
		{
			base.constructor.call(this, html);

			this.addStyleClass("splunk-viz-GraphicsVizBase");

			this.setStyle({ position: "absolute", left: "0px", top: "0px" });

			this.graphics = new Graphics();
			this.graphics.appendTo(this.element);

			this.invalidate("renderGraphicsPass");
		};

		// Public Methods

		this.renderGraphics = function()
		{
			this.validatePreceding("renderGraphicsPass");

			if (this.isValid("renderGraphicsPass"))
				return;

			var width = this.getInternal("width");
			var height = this.getInternal("height");

			var graphics = this.graphics;
			graphics.setSize(width, height);

			this.renderGraphicsOverride(graphics, width, height);

			this.setValid("renderGraphicsPass");
		};

		this.localToGlobal = function(point)
		{
			if (point == null)
				throw new Error("Parameter point must be non-null.");
			if (!(point instanceof Point))
				throw new Error("Parameter point must be of type splunk.geom.Point.");

			var offset = this.$element.offset();
			return new Point(point.x + offset.left, point.y + offset.top);
		};

		this.globalToLocal = function(point)
		{
			if (point == null)
				throw new Error("Parameter point must be non-null.");
			if (!(point instanceof Point))
				throw new Error("Parameter point must be of type splunk.geom.Point.");

			var offset = this.$element.offset();
			return new Point(point.x - offset.left, point.y - offset.top);
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
		};

	});

});

define('splunk/charting/Histogram',['require','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/LogScale','splunk/time/DateTime','splunk/viz/GraphicsVizBase'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var EventData = require("jgatt").events.EventData;
	var Point = require("jgatt").geom.Point;
	var Rectangle = require("jgatt").geom.Rectangle;
	var Graphics = require("jgatt").graphics.Graphics;
	var DrawingUtils = require("jgatt").graphics.brushes.DrawingUtils;
	var Brush = require("jgatt").graphics.brushes.Brush;
	var SolidFillBrush = require("jgatt").graphics.brushes.SolidFillBrush;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var Property = require("jgatt").properties.Property;
	var ArrayUtils = require("jgatt").utils.ArrayUtils;
	var Comparator = require("jgatt").utils.Comparator;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var LogScale = require("splunk/charting/LogScale");
	var DateTime = require("splunk/time/DateTime");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	var Histogram = jg_extend(GraphicsVizBase, function(Histogram, base)
	{

		// Public Passes

		this.processDataPass = new ValidatePass("processData", 0.1);
		this.updateRangeXPass = new ValidatePass("updateRangeX", 0.2);
		this.updateRangeYPass = new ValidatePass("updateRangeY", 0.2);

		// Public Events

		this.rangeXChanged = new ChainedEvent("rangeXChanged", this.changed);
		this.rangeYChanged = new ChainedEvent("rangeYChanged", this.changed);
		this.containedRangeXChanged = new ChainedEvent("containedRangeXChanged", this.changed);
		this.containedRangeYChanged = new ChainedEvent("containedRangeYChanged", this.changed);

		// Public Properties

		this.data = new ObservableProperty("data", Array, null)
			.onChanged(function(e)
			{
				this.invalidate("processDataPass");
			});

		this.brush = new ObservableProperty("brush", Brush, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.minimumX = new ObservableProperty("minimumX", Number, NaN)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangeXPass");
			});

		this.maximumX = new ObservableProperty("maximumX", Number, NaN)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangeXPass");
			});

		this.minimumY = new ObservableProperty("minimumY", Number, NaN)
			.readFilter(function(value)
			{
				return this.valueToAbsoluteY(value);
			})
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? this.absoluteToValueY(value) : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangeYPass");
			});

		this.maximumY = new ObservableProperty("maximumY", Number, NaN)
			.readFilter(function(value)
			{
				return this.valueToAbsoluteY(value);
			})
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? this.absoluteToValueY(value) : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangeYPass");
			});

		this.scaleY = new ObservableProperty("scaleY", LogScale, null)
			.onChanged(function(e)
			{
				this._cachedScaleY = e.newValue;
				this.invalidate("processDataPass");
			});

		this.containedMinimumX = new Property("containedMinimumX", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeXPass");
			})
			.getter(function()
			{
				return this._containedMinimumX;
			});

		this.containedMaximumX = new Property("containedMaximumX", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeXPass");
			})
			.getter(function()
			{
				return this._containedMaximumX;
			});

		this.containedMinimumY = new Property("containedMinimumY", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeYPass");
			})
			.getter(function()
			{
				return this._containedMinimumY;
			});

		this.containedMaximumY = new Property("containedMaximumY", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeYPass");
			})
			.getter(function()
			{
				return this._containedMaximumY;
			});

		this.actualMinimumX = new Property("actualMinimumX", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeXPass");
			})
			.getter(function()
			{
				return this._actualMinimumX;
			});

		this.actualMaximumX = new Property("actualMaximumX", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeXPass");
			})
			.getter(function()
			{
				return this._actualMaximumX;
			});

		this.actualMinimumY = new Property("actualMinimumY", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeYPass");
			})
			.getter(function()
			{
				return this._actualMinimumY;
			});

		this.actualMaximumY = new Property("actualMaximumY", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangeYPass");
			})
			.getter(function()
			{
				return this._actualMaximumY;
			});

		// Private Properties

		this._cachedScaleY = null;
		this._containedMinimumX = 0;
		this._containedMaximumX = 0;
		this._containedMinimumY = 0;
		this._containedMaximumY = 100;
		this._actualMinimumX = 0;
		this._actualMaximumX = 0;
		this._actualMinimumY = 0;
		this._actualMaximumY = 100;

		this._actualRangeX = 0;
		this._actualRangeY = 100;
		this._actualScaleY = null;
		this._valueDatasX = null;
		this._valueDatasY = null;
		this._renderDatas = null;
		this._sortComparator = null;
		this._searchComparator = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-Histogram");

			var now = new DateTime();
			now = now.toUTC();
			now.setMinutes(0);
			now.setSeconds(0);
			this._containedMinimumX = now.getTime();
			this._containedMaximumX = now.getTime() + 3600;
			this._actualMinimumX = this._containedMinimumX;
			this._actualMaximumX = this._containedMaximumX;
			this._actualRangeX = this._actualMaximumX - this._actualMinimumX;

			this._valueDatasX = [];
			this._valueDatasY = [];
			this._renderDatas = [];
			this._sortComparator = new SortComparator();
			this._searchComparator = new SearchComparator();
		};

		// Public Methods

		this.processData = function()
		{
			this.validatePreceding("processDataPass");

			if (this.isValid("processDataPass"))
				return;

			this.invalidate("updateRangeXPass");
			this.invalidate("updateRangeYPass");

			var valueDatasX = this._valueDatasX = [];
			var valueDatasY = this._valueDatasY = [];
			var renderDatas = this._renderDatas = [];

			var buckets = this.getInternal("data");
			var numBuckets = buckets ? buckets.length : 0;
			if (numBuckets > 0)
			{
				var bucket;
				var valueDataX1;
				var valueDataX2;
				var valueDataY1;
				var valueDataY2 = { value: 0, absolute: this.valueToAbsoluteY(0) };
				var renderData;
				var i;

				valueDatasY.push(valueDataY2);

				for (i = 0; i < numBuckets; i++)
				{
					bucket = buckets[i];

					valueDataX1 = { value: bucket.x1, absolute: this.valueToAbsoluteX(bucket.x1) };
					valueDataX2 = { value: bucket.x2, absolute: this.valueToAbsoluteX(bucket.x2) };
					valueDataY1 = { value: bucket.y, absolute: this.valueToAbsoluteY(bucket.y) };

					if ((valueDataX1.absolute > -Infinity) && (valueDataX1.absolute < Infinity) &&
					    (valueDataX2.absolute > -Infinity) && (valueDataX2.absolute < Infinity) &&
					    (valueDataY1.absolute > -Infinity) && (valueDataY1.absolute < Infinity))
					{
						renderData = { valueDataX1: valueDataX1, valueDataX2: valueDataX2, valueDataY1: valueDataY1, valueDataY2: valueDataY2 };
						renderData.data = { x1: valueDataX1.value, x2: valueDataX2.value, y: valueDataY1.value };
						renderData.bounds = null;

						valueDatasX.push(valueDataX1);
						valueDatasX.push(valueDataX2);
						valueDatasY.push(valueDataY1);
						renderDatas.push(renderData);
					}
				}
			}

			this.setValid("processDataPass");
		};

		this.updateRangeX = function()
		{
			this.validatePreceding("updateRangeXPass");

			if (this.isValid("updateRangeXPass"))
				return;

			this.invalidate("renderGraphicsPass");

			var valueDatasX = this._valueDatasX;
			var numValueDatasX = valueDatasX.length;
			var valueDataX1;
			var minimumX = Infinity;
			var maximumX = -Infinity;
			var i;

			for (i = 0; i < numValueDatasX; i++)
			{
				valueDataX1 = valueDatasX[i];
				if (valueDataX1.absolute < minimumX)
					minimumX = valueDataX1.absolute;
				if (valueDataX1.absolute > maximumX)
					maximumX = valueDataX1.absolute;
			}

			if (minimumX == Infinity)
			{
				// default range is current hour
				var now = new DateTime();
				now = now.toUTC();
				now.setMinutes(0);
				now.setSeconds(0);
				minimumX = now.getTime();
				maximumX = now.getTime() + 3600;
			}

			var containedRangeXChanged = ((minimumX != this._containedMinimumX) || (maximumX != this._containedMaximumX));

			this._containedMinimumX = minimumX;
			this._containedMaximumX = maximumX;

			var assignedMinimumX = this.getInternal("minimumX");
			if (!isNaN(assignedMinimumX))
				minimumX = assignedMinimumX;

			var assignedMaximumX = this.getInternal("maximumX");
			if (!isNaN(assignedMaximumX))
				maximumX = assignedMaximumX;

			if (minimumX > maximumX)
			{
				var temp = minimumX;
				minimumX = maximumX;
				maximumX = temp;
			}

			var rangeX = maximumX - minimumX;
			for (i = 0; i < numValueDatasX; i++)
			{
				valueDataX1 = valueDatasX[i];
				valueDataX1.relative = (rangeX > 0) ? (valueDataX1.absolute - minimumX) / rangeX : 0;
			}

			ArrayUtils.sort(this._renderDatas, this._sortComparator);

			var rangeXChanged = ((minimumX != this._actualMinimumX) || (maximumX != this._actualMaximumX));

			this._actualMinimumX = minimumX;
			this._actualMaximumX = maximumX;
			this._actualRangeX = rangeX;

			this.setValid("updateRangeXPass");

			if (containedRangeXChanged)
				this.dispatchEvent("containedRangeXChanged", new EventData());
			if (rangeXChanged)
				this.dispatchEvent("rangeXChanged", new EventData());
		};

		this.updateRangeY = function()
		{
			this.validatePreceding("updateRangeYPass");

			if (this.isValid("updateRangeYPass"))
				return;

			this.invalidate("renderGraphicsPass");

			var valueDatasY = this._valueDatasY;
			var numValueDatasY = valueDatasY.length;
			var valueDataY1;
			var minimumY = Infinity;
			var maximumY = -Infinity;
			var i;

			for (i = 0; i < numValueDatasY; i++)
			{
				valueDataY1 = valueDatasY[i];
				if (valueDataY1.absolute < minimumY)
					minimumY = valueDataY1.absolute;
				if (valueDataY1.absolute > maximumY)
					maximumY = valueDataY1.absolute;
			}

			if (minimumY == Infinity)
			{
				// default range is 0-100
				minimumY = this.valueToAbsoluteY(0);
				maximumY = this.valueToAbsoluteY(100);
			}
			else
			{
				// extend range to round units
				var maxUnits = 50;
				var extendedMinimumY = minimumY;
				var extendedMaximumY = maximumY;
				var unit;
				var numUnits;
				for (i = 0; i < 2; i++)
				{
					unit = this._computeAutoUnits(extendedMaximumY - extendedMinimumY);

					// verify unit is greater than zero
					if (unit <= 0)
						break;

					// snap unit to integer if required
					if ((extendedMaximumY - extendedMinimumY) >= 1)
						unit = Math.max(Math.round(unit), 1);

					// scale unit if numUnits is greater than maxUnits
					numUnits = 1 + Math.floor((extendedMaximumY - extendedMinimumY) / unit);
					unit *= Math.ceil(numUnits / maxUnits);

					// snap minimumY and maximumY to unit
					extendedMinimumY = Math.ceil(minimumY / unit) * unit;
					if (extendedMinimumY != minimumY)
						extendedMinimumY -= unit;
					extendedMaximumY = Math.ceil(maximumY / unit) * unit;
				}
				minimumY = extendedMinimumY;
				maximumY = extendedMaximumY;
			}

			var containedRangeYChanged = ((minimumY != this._containedMinimumY) || (maximumY != this._containedMaximumY));

			this._containedMinimumY = minimumY;
			this._containedMaximumY = maximumY;

			var assignedMinimumY = this.getInternal("minimumY");
			if (!isNaN(assignedMinimumY))
				minimumY = this.valueToAbsoluteY(assignedMinimumY);

			var assignedMaximumY = this.getInternal("maximumY");
			if (!isNaN(assignedMaximumY))
				maximumY = this.valueToAbsoluteY(assignedMaximumY);

			if (minimumY > maximumY)
			{
				var temp = minimumY;
				minimumY = maximumY;
				maximumY = temp;
			}

			var rangeY = maximumY - minimumY;
			for (i = 0; i < numValueDatasY; i++)
			{
				valueDataY1 = valueDatasY[i];
				valueDataY1.relative = (rangeY > 0) ? (valueDataY1.absolute - minimumY) / rangeY : 0;
			}
			var scaleY = this._cachedScaleY;

			var rangeYChanged = ((minimumY != this._actualMinimumY) || (maximumY != this._actualMaximumY) || (scaleY != this._actualScaleY));

			this._actualMinimumY = minimumY;
			this._actualMaximumY = maximumY;
			this._actualRangeY = rangeY;
			this._actualScaleY = scaleY;

			this.setValid("updateRangeYPass");

			if (containedRangeYChanged)
				this.dispatchEvent("containedRangeYChanged", new EventData());
			if (rangeYChanged)
				this.dispatchEvent("rangeYChanged", new EventData());
		};

		this.valueToAbsoluteX = function(value)
		{
			if (value == null)
				return NaN;
			if (value instanceof DateTime)
				return value.getTime();
			if (value instanceof Date)
				return (value.getTime() / 1000);
			if (typeof value === "string")
			{
				if (!value)
					return NaN;
				var num = Number(value);
				if (!isNaN(num))
					return ((num > -Infinity) && (num < Infinity)) ? num : NaN;
				var date = new DateTime(value);
				return date.getTime();
			}
			if (typeof value === "number")
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			return NaN;
		};

		this.absoluteToValueX = function(absolute)
		{
			if ((absolute > -Infinity) && (absolute < Infinity))
				return (new DateTime(absolute)).toUTC();
			return null;
		};

		this.absoluteToRelativeX = function(absolute)
		{
			return (absolute - this._actualMinimumX) / this._actualRangeX;
		};

		this.relativeToAbsoluteX = function(relative)
		{
			return this._actualMinimumX + this._actualRangeX * relative;
		};

		this.valueToAbsoluteY = function(value)
		{
			var scaleY = this._cachedScaleY;
			if (scaleY)
				return scaleY.valueToScale(NumberUtils.parseNumber(value));
			return NumberUtils.parseNumber(value);
		};

		this.absoluteToValueY = function(absolute)
		{
			if ((absolute > -Infinity) && (absolute < Infinity))
			{
				var scaleY = this._cachedScaleY;
				if (scaleY)
					return scaleY.scaleToValue(Number(absolute));
				return Number(absolute);
			}
			return NaN;
		};

		this.absoluteToRelativeY = function(absolute)
		{
			return (absolute - this._actualMinimumY) / this._actualRangeY;
		};

		this.relativeToAbsoluteY = function(relative)
		{
			return this._actualMinimumY + this._actualRangeY * relative;
		};

		this.getDataUnderPoint = function(x, y)
		{
			this.validate("renderGraphicsPass");

			if ((y < 0) || (y > this.getInternal("height")))
				return null;

			var index = ArrayUtils.binarySearch(this._renderDatas, x / this.getInternal("width"), this._searchComparator);
			if (index < 0)
				return null;

			var renderData = this._renderDatas[index];
			return { data: renderData.data, bounds: renderData.bounds };
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var valueDatasX = this._valueDatasX;
			var valueDatasY = this._valueDatasY;
			var renderDatas = this._renderDatas;
			var numValueDatasX = valueDatasX.length;
			var numValueDatasY = valueDatasY.length;
			var numRenderDatas = renderDatas.length;
			var valueDataX1;
			var valueDataX2;
			var valueDataY1;
			var valueDataY2;
			var renderData;
			var i;

			for (i = 0; i < numValueDatasX; i++)
			{
				valueDataX1 = valueDatasX[i];
				valueDataX1.pixel = Math.round(width * valueDataX1.relative);
			}

			for (i = 0; i < numValueDatasY; i++)
			{
				valueDataY1 = valueDatasY[i];
				valueDataY1.pixel = Math.round(height * (1 - valueDataY1.relative));
			}

			var zeroData = (valueDatasY.length > 0) ? valueDatasY[0] : null;
			var zeroPixel = zeroData ? zeroData.pixel : height;
			var brushBounds1 = [ new Point(0, 0), new Point(width, 0), new Point(width, zeroPixel), new Point(0, zeroPixel) ];
			var brushBounds2 = [ new Point(0, zeroPixel), new Point(width, zeroPixel), new Point(width, height), new Point(0, height) ];
			var brushBounds;
			var x1;
			var x2;
			var y1;
			var y2;
			var temp;

			var brush = this.getInternal("brush");
			if (!brush)
				brush = new SolidFillBrush(0x000000, 1);

			graphics.clear();

			for (i = 0; i < numRenderDatas; i++)
			{
				renderData = renderDatas[i];
				valueDataX1 = renderData.valueDataX1;
				valueDataX2 = renderData.valueDataX2;
				valueDataY1 = renderData.valueDataY1;
				valueDataY2 = renderData.valueDataY2;

				if ((Math.max(valueDataX1.relative, valueDataX2.relative) < 0) ||
				    (Math.min(valueDataX1.relative, valueDataX2.relative) > 1) ||
				    (Math.max(valueDataY1.relative, valueDataY2.relative) < 0) ||
				    (Math.min(valueDataY1.relative, valueDataY2.relative) > 1))
					continue;

				x1 = valueDataX1.pixel;
				x2 = valueDataX2.pixel;
				y1 = valueDataY1.pixel;
				y2 = valueDataY2.pixel;

				if (x1 < x2)
					x1++;
				else
					x2++;

				if (x1 == x2)
				{
					if (valueDataX1.relative < valueDataX2.relative)
						x2++;
					else if (valueDataX1.relative > valueDataX2.relative)
						x2--;
				}

				if (y1 == y2)
				{
					if (valueDataY1.relative < valueDataY2.relative)
						y1++;
					else if (valueDataY1.relative > valueDataY2.relative)
						y1--;
				}

				if (x1 > x2)
				{
					temp = x1;
					x1 = x2;
					x2 = temp;
				}

				renderData.bounds = new Rectangle(x1, y1, x2 - x1, 0);

				brushBounds = (y1 <= y2) ? brushBounds1 : brushBounds2;

				brush.beginBrush(graphics, null, brushBounds);
				DrawingUtils.drawRectangle(brush, x1, y1, x2 - x1, y2 - y1);
				brush.endBrush();
			}
		};

		// Private Methods

		this._computeAutoUnits = function(range)
		{
			if (range <= 0)
				return 0;

			var significand = range / 10;
			var exponent = 0;

			if (significand > 0)
			{
				var str = significand.toExponential(20);
				var eIndex = str.indexOf("e");
				if (eIndex >= 0)
				{
					significand = Number(str.substring(0, eIndex));
					exponent = Number(str.substring(eIndex + 1, str.length));
				}
			}

			significand = Math.ceil(significand);

			if (significand > 5)
				significand = 10;
			else if (significand > 2)
				significand = 5;

			return significand * Math.pow(10, exponent);
		};

	});

	// Private Classes

	var SortComparator = jg_extend(Comparator, function(SortComparator, base)
	{

		// Public Methods

		this.compare = function(renderData1, renderData2)
		{
			var x11 = renderData1.valueDataX1.relative;
			var x21 = renderData2.valueDataX1.relative;
			if (x11 < x21)
				return -1;
			if (x11 > x21)
				return 1;
			return 0;
		};

	});

	var SearchComparator = jg_extend(Comparator, function(SearchComparator, base)
	{

		// Public Methods

		this.compare = function(x, renderData)
		{
			var x1 = renderData.valueDataX1.relative;
			var x2 = renderData.valueDataX2.relative;
			if (x < x1)
				return -1;
			if (x >= x2)
				return 1;
			return 0;
		};

	});

	return Histogram;

});

define('splunk/charting/ClickDragRangeMarker',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/Histogram','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var Event = require("jgatt").events.Event;
	var EventData = require("jgatt").events.EventData;
	var Matrix = require("jgatt").geom.Matrix;
	var Point = require("jgatt").geom.Point;
	var Graphics = require("jgatt").graphics.Graphics;
	var DrawingUtils = require("jgatt").graphics.brushes.DrawingUtils;
	var GradientFillBrush = require("jgatt").graphics.brushes.GradientFillBrush;
	var SolidFillBrush = require("jgatt").graphics.brushes.SolidFillBrush;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var PropertyTween = require("jgatt").motion.PropertyTween;
	var TweenRunner = require("jgatt").motion.TweenRunner;
	var CubicEaser = require("jgatt").motion.easers.CubicEaser;
	var EaseDirection = require("jgatt").motion.easers.EaseDirection;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var Property = require("jgatt").properties.Property;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var StringUtils = require("jgatt").utils.StringUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var Histogram = require("splunk/charting/Histogram");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(ClickDragRangeMarker, base)
	{

		// Public Passes

		this.updateRangePass = new ValidatePass("updateRange", 0.4);

		// Public Events

		this.rangeChanged = new ChainedEvent("rangeChanged", this.changed);
		this.dragStart = new Event("dragStart", EventData);
		this.dragComplete = new Event("dragComplete", EventData);

		// Public Properties

		this.foregroundColor = new ObservableProperty("foregroundColor", Number, 0x000000)
			.writeFilter(function(value)
			{
				return !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.histogram = new ObservableProperty("histogram", Histogram, null)
			.onChanged(function(e)
			{
				var target = e.target;
				if ((target === this) || ((target instanceof Histogram) && (e.event === target.rangeXChanged)))
					this.invalidate("updateRangePass");
			});

		this.minimum = new ObservableProperty("minimum", Number, NaN)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangePass");
			});

		this.maximum = new ObservableProperty("maximum", Number, NaN)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateRangePass");
			});

		this.minimumSnap = new ObservableProperty("minimumSnap", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("updateRangePass");
			});

		this.maximumSnap = new ObservableProperty("maximumSnap", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("updateRangePass");
			});

		this.minimumFormat = new ObservableProperty("minimumFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.maximumFormat = new ObservableProperty("maximumFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.rangeFormat = new ObservableProperty("rangeFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.actualMinimum = new Property("actualMinimum", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangePass");
			})
			.getter(function()
			{
				return this._actualMinimum;
			});

		this.actualMaximum = new Property("actualMaximum", Number, null, true)
			.onRead(function()
			{
				this.validate("updateRangePass");
			})
			.getter(function()
			{
				return this._actualMaximum;
			});

		this.labelOpacity = new ObservableProperty("labelOpacity", Number, 0)
			.onChanged(function(e)
			{
				this._redrawLabelOpacity();
			});

		// Private Properties

		this._actualMinimum = NaN;
		this._actualMaximum = NaN;
		this._relativeMinimum = 0;
		this._relativeMaximum = 1;
		this._fillBrush = null;
		this._lineBrush = null;
		this._backgroundBrush = null;
		this._labelGraphics = null;
		this._minimumLabel = null;
		this._maximumLabel = null;
		this._rangeLabel = null;
		this._rangeLabelClip = null;
		this._labelContainer = null;
		this._moveHotspot = null;
		this._areLabelsVisible = false;
		this._dragMode = null;
		this._pressMouseX = 0;
		this._pressMinimum = 0;
		this._pressMaximum = 1;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this, "<div tabindex=\"0\"></div>");

			this.addStyleClass("splunk-charting-ClickDragRangeMarker");

			this.setStyle({ outline: "none" });

			this._self_mouseOver = FunctionUtils.bind(this._self_mouseOver, this);
			this._self_mouseOut = FunctionUtils.bind(this._self_mouseOut, this);
			this._self_mouseMove = FunctionUtils.bind(this._self_mouseMove, this);
			this._self_mouseDown = FunctionUtils.bind(this._self_mouseDown, this);
			this._self_keyDown = FunctionUtils.bind(this._self_keyDown, this);
			this._document_mouseUp = FunctionUtils.bind(this._document_mouseUp, this);
			this._document_mouseMove = FunctionUtils.bind(this._document_mouseMove, this);
			this._document_mouseLeave = FunctionUtils.bind(this._document_mouseLeave, this);

			this._fillBrush = new GradientFillBrush("linear", [ 0xD1D1D1, 0xB8B8B8 ], [ 1, 1 ], [ 0, 1 ]);
			this._fillBrush.set("tileTransform", new Matrix(0, 1, -1, 0));

			this._lineBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.4, 1, "square");

			this._backgroundBrush = new SolidFillBrush(0xEAEAEA, 0.66);

			this._labelGraphics = new Graphics();

			this._minimumLabel = document.createElement("span");
			$(this._minimumLabel).addClass("splunk-charting-label");
			$(this._minimumLabel).css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });

			this._maximumLabel = document.createElement("span");
			$(this._maximumLabel).addClass("splunk-charting-label");
			$(this._maximumLabel).css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });

			this._rangeLabel = document.createElement("span");
			$(this._rangeLabel).addClass("splunk-charting-label");
			$(this._rangeLabel).css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });

			this._rangeLabelClip = document.createElement("div");
			this._rangeLabelClip.appendChild(this._rangeLabel);
			$(this._rangeLabelClip).css({ position: "absolute", left: "0px", top: "0px", margin: "0px", padding: "0px", overflow: "hidden" });

			this._labelContainer = document.createElement("div");
			this._labelGraphics.appendTo(this._labelContainer);
			this._labelContainer.appendChild(this._minimumLabel);
			this._labelContainer.appendChild(this._maximumLabel);
			this._labelContainer.appendChild(this._rangeLabelClip);
			$(this._labelContainer).css({ position: "absolute", left: "0px", top: "0px", margin: "0px", padding: "0px" });

			this._moveHotspot = document.createElement("div");
			$(this._moveHotspot).css({ position: "absolute", left: "0px", top: "0px", margin: "0px", padding: "0px", cursor: "move", visibility: "hidden" });

			this.$element.bind("mouseover", this._self_mouseOver);
			this.$element.bind("mouseout", this._self_mouseOut);
			this.$element.bind("mousemove", this._self_mouseMove);
			this.$element.bind("mousedown", this._self_mouseDown);
			this.$element.bind("keydown", this._self_keyDown);

			this.element.appendChild(this._labelContainer);
			this.element.appendChild(this._moveHotspot);
		};

		// Public Methods

		this.updateRange = function()
		{
			this.validatePreceding("updateRangePass");

			if (this.isValid("updateRangePass"))
				return;

			var actualMinimum = this.getInternal("minimum");
			var actualMaximum = this.getInternal("maximum");
			var relativeMinimum = 0;
			var relativeMaximum = 1;

			var histogram = this.getInternal("histogram");
			if (histogram)
			{
				var histogramMinimumX = histogram.get("actualMinimumX");
				var histogramMaximumX = histogram.get("actualMaximumX");
				var histogramRangeX = histogramMaximumX - histogramMinimumX;

				var minimumSnap = this.getInternal("minimumSnap");
				if ((minimumSnap != null) && !isNaN(actualMinimum))
					actualMinimum = minimumSnap(actualMinimum);

				var maximumSnap = this.getInternal("maximumSnap");
				if ((maximumSnap != null) && !isNaN(actualMaximum))
					actualMaximum = maximumSnap(actualMaximum);

				if (!isNaN(actualMinimum))
					relativeMinimum = (histogramRangeX > 0) ? ((actualMinimum - histogramMinimumX) / histogramRangeX) : 0;
				else
					actualMinimum = histogramMinimumX;

				if (!isNaN(actualMaximum))
					relativeMaximum = (histogramRangeX > 0) ? ((actualMaximum - histogramMinimumX) / histogramRangeX) : 1;
				else
					actualMaximum = histogramMaximumX;

				var temp;
				if (actualMinimum > actualMaximum)
				{
					temp = actualMinimum;
					actualMinimum = actualMaximum;
					actualMaximum = temp;

					temp = relativeMinimum;
					relativeMinimum = relativeMaximum;
					relativeMaximum = temp;
				}
			}

			var actualChanged = ((actualMinimum != this._actualMinimum) || (actualMaximum != this._actualMaximum));
			var relativeChanged = ((relativeMinimum != this._relativeMinimum) || (relativeMaximum != this._relativeMaximum));

			this._actualMinimum = actualMinimum;
			this._actualMaximum = actualMaximum;
			this._relativeMinimum = relativeMinimum;
			this._relativeMaximum = relativeMaximum;

			if (actualChanged || relativeChanged)
				this.invalidate("renderGraphicsPass");

			this.setValid("updateRangePass");

			if (actualChanged)
				this.dispatchEvent("rangeChanged", new EventData());
		};

		this.isDragging = function()
		{
			return (this._dragMode != null);
		};

		// Protected Methods

		this.onAppend = function()
		{
			$(document).bind("mousemove", this._document_mouseMove);
			$(document).bind("mouseleave", this._document_mouseLeave);
		};

		this.onRemove = function()
		{
			$(document).unbind("mouseup", this._document_mouseUp);
			$(document).unbind("mousemove", this._document_mouseMove);
			$(document).unbind("mouseleave", this._document_mouseLeave);
		};

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var actualMinimum = this._actualMinimum;
			var actualMaximum = this._actualMaximum;
			var relativeMinimum = this._relativeMinimum;
			var relativeMaximum = this._relativeMaximum;
			var minimumLabel = $(this._minimumLabel);
			var maximumLabel = $(this._maximumLabel);
			var rangeLabel = $(this._rangeLabel);
			var rangeLabelClip = $(this._rangeLabelClip);
			var moveHotspot = $(this._moveHotspot);

			// format labels

			var minimumFormat = this.getInternal("minimumFormat");
			if (isNaN(actualMinimum))
				minimumLabel.html("");
			else if (!minimumFormat)
				minimumLabel.html(StringUtils.escapeHTML(actualMinimum));
			else
				minimumLabel.html(StringUtils.escapeHTML(minimumFormat(actualMinimum)));

			var maximumFormat = this.getInternal("maximumFormat");
			if (isNaN(actualMaximum))
				maximumLabel.html("");
			else if (!maximumFormat)
				maximumLabel.html(StringUtils.escapeHTML(actualMaximum));
			else
				maximumLabel.html(StringUtils.escapeHTML(maximumFormat(actualMaximum)));

			var rangeFormat = this.getInternal("rangeFormat");
			if (!rangeFormat || isNaN(actualMinimum) || isNaN(actualMaximum))
				rangeLabel.html("");
			else
				rangeLabel.html(StringUtils.escapeHTML(rangeFormat(actualMinimum, actualMaximum)));

			// compute placements

			if (relativeMinimum > relativeMaximum)
			{
				var temp;

				temp = relativeMinimum;
				relativeMinimum = relativeMaximum;
				relativeMaximum = temp;

				temp = minimumLabel;
				minimumLabel = maximumLabel;
				maximumLabel = temp;
			}

			var x1 = 0;
			var x2 = Math.round(width * relativeMinimum);
			var x3 = Math.round(width * relativeMaximum);
			var x4 = Math.round(width);

			var y1 = 0;
			var y2 = Math.round(height);

			x2 = NumberUtils.minMax(x2, x1, x4);
			x3 = NumberUtils.minMax(x3, x1, x4);

			// layout labels

			var minimumLabelBounds = {};
			minimumLabelBounds.width = Math.round(minimumLabel.outerWidth(true));
			minimumLabelBounds.height = 20;
			minimumLabelBounds.x = x2 - minimumLabelBounds.width;
			minimumLabelBounds.y = Math.min(y2 - minimumLabelBounds.height, 0);

			var maximumLabelBounds = {};
			maximumLabelBounds.width = Math.round(maximumLabel.outerWidth(true));
			maximumLabelBounds.height = 20;
			maximumLabelBounds.x = x3;
			maximumLabelBounds.y = Math.min(y2 - maximumLabelBounds.height, 0);

			var rangeLabelBounds = {};
			rangeLabelBounds.width = Math.min(Math.round(rangeLabel.outerWidth(true)), x3 - x2);
			rangeLabelBounds.height = 20;
			rangeLabelBounds.x = x2 + Math.round((x3 - x2 - rangeLabelBounds.width) / 2);
			rangeLabelBounds.y = y2;

			if ((maximumLabelBounds.x + maximumLabelBounds.width) > x4)
				maximumLabelBounds.x = x4 - maximumLabelBounds.width;
			if ((minimumLabelBounds.x + minimumLabelBounds.width) > maximumLabelBounds.x)
				minimumLabelBounds.x = maximumLabelBounds.x - minimumLabelBounds.width;

			if (minimumLabelBounds.x < 0)
				minimumLabelBounds.x = 0;
			if (maximumLabelBounds.x < (minimumLabelBounds.x + minimumLabelBounds.width))
				maximumLabelBounds.x = minimumLabelBounds.x + minimumLabelBounds.width;

			minimumLabel.css(
			{
				left: minimumLabelBounds.x + "px",
				top: minimumLabelBounds.y + Math.round((minimumLabelBounds.height - minimumLabel.outerHeight(true)) / 2) + "px"
			});

			maximumLabel.css(
			{
				left: maximumLabelBounds.x + "px",
				top: maximumLabelBounds.y + Math.round((maximumLabelBounds.height - maximumLabel.outerHeight(true)) / 2) + "px"
			});

			rangeLabel.css(
			{
				top: Math.round((rangeLabelBounds.height - rangeLabel.outerHeight(true)) / 2) + "px"
			});

			rangeLabelClip.css(
			{
				left: rangeLabelBounds.x + "px",
				top: rangeLabelBounds.y + "px",
				width: rangeLabelBounds.width + "px",
				height: rangeLabelBounds.height + "px"
			});

			// layout hotspot

			moveHotspot.css(
			{
				left: x2 + "px",
				top: y1 + "px",
				width: (x3 - x2) + "px",
				height: (y2 - y1) + "px",
				visibility: ((this._dragMode === "move") || (!this._dragMode && ((relativeMinimum > 0) || (relativeMaximum < 1)))) ? "" : "hidden"
			});

			// draw background

			graphics.clear();

			var backgroundBrush = this._backgroundBrush;

			backgroundBrush.beginBrush(graphics);
			DrawingUtils.drawRectangle(backgroundBrush, Math.min(x1 + 1, x4), y1, Math.max(x2 - 1, 0), y2);
			backgroundBrush.endBrush();

			backgroundBrush.beginBrush(graphics);
			DrawingUtils.drawRectangle(backgroundBrush, Math.min(x3 + 1, x4), y1, Math.max(x4 - x3 - 1, 0), y2);
			backgroundBrush.endBrush();

			// draw lines

			graphics = this._labelGraphics;
			graphics.clear();
			graphics.setSize(width + 1, height + 20);  // pad graphics width and height so we can draw outside bounds

			var lineBrush = this._lineBrush;
			lineBrush.set("color", this.getInternal("foregroundColor"));

			lineBrush.beginBrush(graphics);
			lineBrush.moveTo(x2, minimumLabelBounds.y);
			lineBrush.lineTo(x2, y2 + 20);
			lineBrush.endBrush();

			lineBrush.beginBrush(graphics);
			lineBrush.moveTo(x3, maximumLabelBounds.y);
			lineBrush.lineTo(x3, y2 + 20);
			lineBrush.endBrush();

			// draw fills

			var fillBrush = this._fillBrush;

			fillBrush.beginBrush(graphics);
			DrawingUtils.drawRectangle(fillBrush, minimumLabelBounds.x + 1, minimumLabelBounds.y, minimumLabelBounds.width - 1, minimumLabelBounds.height);
			fillBrush.endBrush();

			fillBrush.beginBrush(graphics);
			DrawingUtils.drawRectangle(fillBrush, maximumLabelBounds.x + 1, maximumLabelBounds.y, maximumLabelBounds.width - 1, maximumLabelBounds.height);
			fillBrush.endBrush();

			fillBrush.beginBrush(graphics);
			DrawingUtils.drawRectangle(fillBrush, x2 + 1, y2, Math.max(x3 - x2 - 1, 0), 20);
			fillBrush.endBrush();

			this._redrawLabelOpacity();
		};

		// Private Methods

		this._redrawLabelOpacity = function()
		{
			var opacity = this.getInternal(this.labelOpacity);
			$(this._labelContainer).css(
			{
				opacity: opacity + "",
				filter: "alpha(opacity=" + Math.round(opacity * 100) + ")",
				visibility: (opacity > 0) ? "" : "hidden"
			});
		};

		this._updateShowLabels = function(mouseLocal, enableShow)
		{
			if (isNaN(this.getInternal("minimum")) && isNaN(this.getInternal("maximum")) &&
			    ((mouseLocal.x < 0) || (mouseLocal.x > this.getInternal("width")) || (mouseLocal.y < 0) || (mouseLocal.y > this.getInternal("height"))))
				this._hideLabels();
			else if (enableShow !== false)
				this._showLabels();
		};

		this._showLabels = function()
		{
			if (this._areLabelsVisible)
				return;

			this._areLabelsVisible = true;

			var tween = new PropertyTween(this, "labelOpacity", null, 1, new CubicEaser(EaseDirection.OUT));
			TweenRunner.start(tween, 0.3);
		};

		this._hideLabels = function()
		{
			if (!this._areLabelsVisible)
				return;

			this._areLabelsVisible = false;

			var tween = new PropertyTween(this, "labelOpacity", null, 0, new CubicEaser(EaseDirection.OUT));
			TweenRunner.start(tween, 0.3);
		};

		this._beginDrag = function(mouseLocal, dragMode)
		{
			if (this._dragMode || !dragMode)
				return;

			this._dragMode = dragMode;

			this._pressMouseX = mouseLocal.x;
			this._pressMinimum = this._relativeMinimum;
			this._pressMaximum = this._relativeMaximum;

			this._updateDrag(mouseLocal);

			this.dispatchEvent("dragStart", new EventData());
		};

		this._endDrag = function()
		{
			if (!this._dragMode)
				return;

			var dragMode = this._dragMode;
			this._dragMode = null;

			this.validate("updateRangePass");

			switch (dragMode)
			{
				case "new":
				case "inside":
					// select single bucket
					this._selectOne();
					break;
				case "outside":
					// select all
					this._selectAll();
					break;
				case "select":
					// if nothing or everything is selected, select all
					if ((this._relativeMinimum == this._relativeMaximum) || ((this._relativeMinimum <= 0) && (this._relativeMaximum >= 1)))
						this._selectAll();
					break;
			}

			this.invalidate("renderGraphicsPass");

			this.dispatchEvent("dragComplete", new EventData());
		};

		this._updateDrag = function(mouseLocal)
		{
			if (!this._dragMode)
				return;

			switch (this._dragMode)
			{
				case "new":
					this._updateDragStart(mouseLocal, "select");
					break;
				case "inside":
					this._updateDragStart(mouseLocal, "move");
					break;
				case "outside":
					this._updateDragStart(mouseLocal, "select");
					break;
				case "select":
					this._updateDragSelect(mouseLocal);
					break;
				case "move":
					this._updateDragMove(mouseLocal);
					break;
			}
		};

		this._updateDragStart = function(mouseLocal, nextDragMode)
		{
			if (Math.abs(mouseLocal.x - this._pressMouseX) < 4)
				return;

			this._dragMode = nextDragMode;

			this._updateDrag(mouseLocal);
		};

		this._updateDragSelect = function(mouseLocal)
		{
			var histogram = this.getInternal("histogram");
			if (!histogram)
				return;

			var width = this.getInternal("width");
			if (width <= 0)
				return;

			var pressMouseX = NumberUtils.minMax(this._pressMouseX, 0, width);
			var mouseX = NumberUtils.minMax(mouseLocal.x, 0, width);

			var relativeMinimum = pressMouseX / width;
			var relativeMaximum = mouseX / width;

			var histogramMinimumX = histogram.get("actualMinimumX");
			var histogramMaximumX = histogram.get("actualMaximumX");
			var histogramRangeX = histogramMaximumX - histogramMinimumX;

			var minimum = histogramMinimumX + histogramRangeX * relativeMinimum;
			var maximum = histogramMinimumX + histogramRangeX * relativeMaximum;
			if (minimum > maximum)
			{
				var temp = minimum;
				minimum = maximum;
				maximum = temp;
			}

			var minimumSnap = this.getInternal("minimumSnap");
			if ((minimumSnap != null) && !isNaN(minimum))
				minimum = minimumSnap(minimum, true);

			var maximumSnap = this.getInternal("maximumSnap");
			if ((maximumSnap != null) && !isNaN(maximum))
				maximum = maximumSnap(maximum, true);

			this.set("minimum", minimum);
			this.set("maximum", maximum);
		};

		this._updateDragMove = function(mouseLocal)
		{
			var histogram = this.getInternal("histogram");
			if (!histogram)
				return;

			var width = this.getInternal("width");
			if (width <= 0)
				return;

			var diff = (mouseLocal.x - this._pressMouseX) / width;
			diff = NumberUtils.minMax(diff, -this._pressMinimum, 1 - this._pressMaximum);

			var relativeMinimum = this._pressMinimum + diff;
			var relativeMaximum  = this._pressMaximum + diff;

			var histogramMinimumX = histogram.get("actualMinimumX");
			var histogramMaximumX = histogram.get("actualMaximumX");
			var histogramRangeX = histogramMaximumX - histogramMinimumX;

			var minimum = histogramMinimumX + histogramRangeX * relativeMinimum;
			var maximum = histogramMinimumX + histogramRangeX * relativeMaximum;

			this.set("minimum", minimum);
			this.set("maximum", maximum);
		};

		this._selectOne = function()
		{
			var histogram = this.getInternal("histogram");
			if (!histogram)
				return;

			var width = this.getInternal("width");
			if (width <= 0)
				return;

			var pressMouseX = NumberUtils.minMax(this._pressMouseX, 0, width);
			var relativePress = pressMouseX / width;

			var histogramMinimumX = histogram.get("actualMinimumX");
			var histogramMaximumX = histogram.get("actualMaximumX");
			var histogramRangeX = histogramMaximumX - histogramMinimumX;

			var minimum = histogramMinimumX + histogramRangeX * relativePress;
			var maximum = minimum;

			var minimumSnap = this.getInternal("minimumSnap");
			if ((minimumSnap != null) && !isNaN(minimum))
				minimum = minimumSnap(minimum, true);

			var maximumSnap = this.getInternal("maximumSnap");
			if ((maximumSnap != null) && !isNaN(maximum))
				maximum = maximumSnap(maximum, true);

			this.set("minimum", minimum);
			this.set("maximum", maximum);
			this.validate("updateRangePass");
		};

		this._selectAll = function()
		{
			this.set("minimum", NaN);
			this.set("maximum", NaN);
			this.validate("updateRangePass");
		};

		this._self_mouseOver = function(e)
		{
			if (this._dragMode)
				return;

			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));
			this._updateShowLabels(mouseLocal);
		};

		this._self_mouseOut = function(e)
		{
			if (this._dragMode)
				return;

			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));
			this._updateShowLabels(mouseLocal);
		};

		this._self_mouseMove = function(e)
		{
			if (this._dragMode)
				return;

			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));
			this._updateShowLabels(mouseLocal);
		};

		this._self_mouseDown = function(e)
		{
			var width = this.getInternal("width");
			var height = this.getInternal("height");
			if ((width <= 0) || (height <= 0))
				return;

			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));
			var mouseX = mouseLocal.x / width;
			var mouseY = mouseLocal.y / height;
			if ((mouseX < 0) || (mouseX > 1) || (mouseY < 0) || (mouseY > 1))
				return;

			this.element.focus();

			$(document).bind("mouseup", this._document_mouseUp);

			if ((this._relativeMinimum <= 0) && (this._relativeMaximum >= 1))
				this._beginDrag(mouseLocal, "new");
			else if ((mouseX > this._relativeMinimum) && (mouseX < this._relativeMaximum))
				this._beginDrag(mouseLocal, "inside");
			else
				this._beginDrag(mouseLocal, "outside");

			return false;
		};

		this._self_keyDown = function(e)
		{
			if (this._dragMode)
				return;

			if (e.keyCode == 27) // esc
			{
				// clicking outside selection selects all
				if (!isNaN(this.getInternal("minimum")) || !isNaN(this.getInternal("maximum")))
				{
					this._beginDrag(new Point(0, 0), "outside");
					this._endDrag();
				}
			}
		};

		this._document_mouseUp = function(e)
		{
			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));

			$(document).unbind("mouseup", this._document_mouseUp);

			this._endDrag();
			this._updateShowLabels(mouseLocal, false);
		};

		this._document_mouseMove = function(e)
		{
			var mouseLocal = this.globalToLocal(new Point(e.pageX, e.pageY));
			if (this._dragMode)
				this._updateDrag(mouseLocal);
			else
				this._updateShowLabels(mouseLocal, false);
		};

		this._document_mouseLeave = function(e)
		{
			if (!this._dragMode)
				this._updateShowLabels(new Point(-1, -1), false);
		};

	});

});

define('splunk/charting/CursorMarker',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/Histogram','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var Matrix = require("jgatt").geom.Matrix;
	var Graphics = require("jgatt").graphics.Graphics;
	var DrawingUtils = require("jgatt").graphics.brushes.DrawingUtils;
	var GradientFillBrush = require("jgatt").graphics.brushes.GradientFillBrush;
	var SolidFillBrush = require("jgatt").graphics.brushes.SolidFillBrush;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var StringUtils = require("jgatt").utils.StringUtils;
	var Histogram = require("splunk/charting/Histogram");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(CursorMarker, base)
	{

		// Public Properties

		this.foregroundColor = new ObservableProperty("foregroundColor", Number, 0x000000)
			.writeFilter(function(value)
			{
				return !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.histogram = new ObservableProperty("histogram", Histogram, null)
			.onChanged(function(e)
			{
				var target = e.target;
				if ((target === this) || ((target instanceof Histogram) && (e.event === target.rangeXChanged)))
					this.invalidate("renderGraphicsPass");
			});

		this.value = new ObservableProperty("value", Number, NaN)
			.writeFilter(function(value)
			{
				return ((value > -Infinity) && (value < Infinity)) ? value : NaN;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.valueSnap = new ObservableProperty("valueSnap", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.valueFormat = new ObservableProperty("valueFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.labelOpacity = new ObservableProperty("labelOpacity", Number, 1)
			.onChanged(function(e)
			{
				this._redrawLabelOpacity();
			});

		// Private Properties

		this._fillBrush = null;
		this._lineBrush = null;
		this._backgroundBrush = null;
		this._labelGraphics = null;
		this._valueLabel = null;
		this._labelContainer = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-CursorMarker");

			this._fillBrush = new GradientFillBrush("linear", [ 0xD1D1D1, 0xB8B8B8 ], [ 1, 1 ], [ 0, 1 ]);
			this._fillBrush.set("tileTransform", new Matrix(0, 1, -1, 0));

			this._lineBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.4, 1, "square");

			this._backgroundBrush = new SolidFillBrush(0xEAEAEA, 0.66);

			this._labelGraphics = new Graphics();

			this._valueLabel = document.createElement("span");
			$(this._valueLabel).addClass("splunk-charting-label");
			$(this._valueLabel).css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });

			this._labelContainer = document.createElement("div");
			this._labelGraphics.appendTo(this._labelContainer);
			this._labelContainer.appendChild(this._valueLabel);
			$(this._labelContainer).css({ position: "absolute", left: "0px", top: "0px", margin: "0px", padding: "0px" });

			this.element.appendChild(this._labelContainer);
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var value = this.getInternal("value");
			var displayValue = value;
			var relativeValue = 0;
			var valueLabel = $(this._valueLabel);

			var histogram = this.getInternal("histogram");
			if (histogram)
			{
				var histogramMinimumX = histogram.get("actualMinimumX");
				var histogramMaximumX = histogram.get("actualMaximumX");
				var histogramRangeX = histogramMaximumX - histogramMinimumX;

				var valueSnap = this.getInternal("valueSnap");
				if (valueSnap && !isNaN(value))
					displayValue = valueSnap(value);

				if (!isNaN(value))
					relativeValue = (histogramRangeX > 0) ? ((value - histogramMinimumX) / histogramRangeX) : 0;
			}

			// format label

			var valueFormat = this.getInternal("valueFormat");
			if (isNaN(displayValue))
				valueLabel.html("");
			else if (!valueFormat)
				valueLabel.html(StringUtils.escapeHTML(displayValue));
			else
				valueLabel.html(StringUtils.escapeHTML(valueFormat(displayValue)));

			// compute placements

			var x1 = 0;
			var x2 = Math.round(width * Math.min(Math.max(relativeValue, 0), 1));

			var y1 = 0;
			var y2 = Math.round(height);

			// layout label

			var valueLabelBounds = {};
			valueLabelBounds.width = Math.round(valueLabel.outerWidth(true));
			valueLabelBounds.height = 20;
			valueLabelBounds.x = Math.max(x2 - valueLabelBounds.width, 0);
			valueLabelBounds.y = Math.min(y2 - valueLabelBounds.height, 0);

			valueLabel.css(
			{
				left: valueLabelBounds.x + "px",
				top: valueLabelBounds.y + Math.round((valueLabelBounds.height - valueLabel.outerHeight(true)) / 2) + "px",
				visibility: ((relativeValue > 0) && (relativeValue <= 1)) ? "" : "hidden"
			});

			// draw background

			graphics.clear();

			if (relativeValue > 0)
			{
				var backgroundBrush = this._backgroundBrush;
				backgroundBrush.beginBrush(graphics);
				DrawingUtils.drawRectangle(backgroundBrush, x1, y1, x2 - x1, y2 - y1);
				backgroundBrush.endBrush();
			}

			// draw line and fill

			var labelGraphics = this._labelGraphics;
			labelGraphics.clear();
			labelGraphics.setSize(width, height);

			if ((relativeValue > 0) && (relativeValue <= 1))
			{
				var lineBrush = this._lineBrush;
				lineBrush.set("color", this.getInternal("foregroundColor"));
				lineBrush.beginBrush(graphics);
				lineBrush.moveTo(x2, y1);
				lineBrush.lineTo(x2, y2);
				lineBrush.endBrush();

				var fillBrush = this._fillBrush;
				fillBrush.beginBrush(labelGraphics);
				DrawingUtils.drawRectangle(fillBrush, valueLabelBounds.x + 1, valueLabelBounds.y, valueLabelBounds.width - 1, valueLabelBounds.height);
				fillBrush.endBrush();
			}

			this._redrawLabelOpacity();
		};

		// Private Methods

		this._redrawLabelOpacity = function()
		{
			var opacity = this.getInternal(this.labelOpacity);
			$(this._labelContainer).css(
			{
				opacity: opacity + "",
				filter: "alpha(opacity=" + Math.round(opacity * 100) + ")",
				visibility: (opacity > 0) ? "" : "hidden"
			});
		};

	});

});

define('splunk/charting/NumericAxisLabels',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/Histogram','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var EventData = require("jgatt").events.EventData;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var ArrayProperty = require("jgatt").properties.ArrayProperty;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var Property = require("jgatt").properties.Property;
	var StringUtils = require("jgatt").utils.StringUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var Histogram = require("splunk/charting/Histogram");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(NumericAxisLabels, base)
	{

		// Public Passes

		this.updateLabelsPass = new ValidatePass("updateLabels", 0.3);

		// Public Events

		this.labelsChanged = new ChainedEvent("labelsChanged", this.changed);

		// Public Properties

		this.placement = new ObservableProperty("placement", String, "left")
			.writeFilter(function(value)
			{
				switch (value)
				{
					case "left":
					case "right":
						return value;
					default:
						return "left";
				}
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.foregroundColor = new ObservableProperty("foregroundColor", Number, 0x000000)
			.writeFilter(function(value)
			{
				return !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.histogram = new ObservableProperty("histogram", Histogram, null)
			.onChanged(function(e)
			{
				var target = e.target;
				if ((target === this) || ((target instanceof Histogram) && (e.event === target.rangeYChanged)))
					this.invalidate("updateLabelsPass");
			});

		this.labelFormat = new ObservableProperty("labelFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("updateLabelsPass");
			});

		this.actualUnit = new Property("actualUnit", Number, null, true)
			.onRead(function()
			{
				this.validate("updateLabelsPass");
			})
			.getter(function()
			{
				return this._actualUnit;
			});

		this.positions = new ArrayProperty("positions", Number, null, true)
			.onRead(function()
			{
				this.validate("updateLabelsPass");
			})
			.getter(function()
			{
				var value = [];
				var labelInfos = this._labelInfos;
				var labelInfo;
				for (var i = 0, l = labelInfos.length; i < l; i++)
				{
					labelInfo = labelInfos[i];
					if (labelInfo.visible)
						value.push(labelInfo.relative);
				}
				return value;
			});

		// Private Properties

		this._actualUnit = 0;
		this._lineBrush = null;
		this._tickBrush = null;
		this._labelInfos = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-NumericAxisLabels");

			this._lineBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.2, 1, "square");

			this._tickBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.1, 1);

			this._labelInfos = [];
		};

		// Public Methods

		this.updateLabels = function()
		{
			this.validatePreceding("updateLabelsPass");

			if (this.isValid("updateLabelsPass"))
				return;

			this.invalidate("renderGraphicsPass");

			var element = this.element;
			var labelFormat = this.getInternal("labelFormat");
			var labelInfos = this._labelInfos;
			var numLabelInfos = labelInfos.length;
			var numNewLabelInfos = 0;
			var labelInfo;

			try
			{
				var maxMajorUnits = 50;

				// set default value for actualUnit
				this._actualUnit = 0;

				// get histogram and verify not null
				var histogram = this.getInternal("histogram");
				if (!histogram)
					return;

				// get minimum and maximum and verify not equal
				var minimum = histogram.get("actualMinimumY");
				var maximum = histogram.get("actualMaximumY");
				if (minimum == maximum)
					return;

				// scale minimum and maximum if required
				var scale = histogram.get("scaleY");
				var scaleMajorUnit = (scale != null);
				var minimumScaled = minimum;
				var maximumScaled = maximum;
				if (scaleMajorUnit)
				{
					minimum = scale.scaleToValue(minimum);
					maximum = scale.scaleToValue(maximum);
				}
				var rangeScaled = maximumScaled - minimumScaled;

				// compute majorUnit
				var majorUnit = this._computeAutoUnits(rangeScaled);

				// verify majorUnit is greater than zero
				if (majorUnit <= 0)
					return;

				// snap majorUnit to integer
				if (rangeScaled >= 1)
					majorUnit = Math.max(Math.round(majorUnit), 1);

				// scale majorUnit if numMajorUnits is greater than maxMajorUnits
				var numMajorUnits = 1 + Math.floor(rangeScaled / majorUnit);
				majorUnit *= Math.ceil(numMajorUnits / maxMajorUnits);

				// update actualUnit
				this._actualUnit = majorUnit;

				// snap minimum and maximum to majorUnit
				var minimumScaled2 = Math.ceil(minimumScaled / majorUnit) * majorUnit - majorUnit;
				var maximumScaled2 = Math.ceil(maximumScaled / majorUnit) * majorUnit;

				// compute label info
				var majorValue;
				var majorValue2;
				var majorRelative;
				for (majorValue = minimumScaled2; majorValue <= maximumScaled2; majorValue += majorUnit)
				{
					majorValue2 = scaleMajorUnit ? scale.scaleToValue(majorValue) : majorValue;
					majorRelative = (majorValue - minimumScaled) / rangeScaled;
					if ((majorRelative > 0) && (majorRelative <= 1))
					{
						if (numNewLabelInfos < numLabelInfos)
						{
							labelInfo = labelInfos[numNewLabelInfos];
						}
						else
						{
							labelInfo = {};
							labelInfo.label = document.createElement("span");
							labelInfo.queryLabel = $(labelInfo.label);
							labelInfo.queryLabel.addClass("splunk-charting-label");
							labelInfo.queryLabel.css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });
							labelInfos.push(labelInfo);
							element.appendChild(labelInfo.label);
						}

						labelInfo.relative = majorRelative;

						if (labelFormat)
							labelInfo.queryLabel.html(StringUtils.escapeHTML(labelFormat(majorValue2)));
						else
							labelInfo.queryLabel.html(StringUtils.escapeHTML(majorValue2));

						numNewLabelInfos++;
					}
				}
			}
			finally
			{
				// remove labels
				for (var i = labelInfos.length - 1; i >= numNewLabelInfos; i--)
				{
					labelInfo = labelInfos.pop();
					element = labelInfo.label.parentNode;
					if (element)
						element.removeChild(labelInfo.label);
				}

				this.setValid("updateLabelsPass");
			}
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var isPlacementLeft = (this.getInternal("placement") != "right");
			var lineBrush = this._lineBrush;
			var tickBrush = this._tickBrush;
			var labelInfos = this._labelInfos;
			var numLabelInfos = labelInfos.length;
			var labelInfo;
			var labelInfo2;
			var labelWidth = 0;
			var tickWidth = 25;
			var numOverlaps = 0;
			var i;
			var j;

			// measure labels and prepare for rendering
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];

				labelInfo.y = Math.round(height * (1 - labelInfo.relative));
				labelInfo.width = Math.round(labelInfo.queryLabel.outerWidth(true));
				labelInfo.height = Math.round(labelInfo.queryLabel.outerHeight(true));
				labelInfo.visible = true;

				labelWidth = Math.max(labelWidth, labelInfo.width);
			}
			width = Math.max(labelWidth, tickWidth);
			this.setInternal("width", width);
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];
				labelInfo.x = isPlacementLeft ? (width - labelInfo.width) : 0;
			}

			// compute numOverlaps
			for (i = numLabelInfos - 1; i >= 0; i--)
			{
				labelInfo = labelInfos[i];
				for (j = i - 1; j >= 0; j--)
				{
					labelInfo2 = labelInfos[j];
					if (labelInfo2.y >= (labelInfo.y + labelInfo.height))
						break;
					numOverlaps = Math.max(numOverlaps, i - j);
				}
			}

			// mark overlapping labels as not visible
			if (numOverlaps > 0)
			{
				numOverlaps++;
				for (i = 0; i < numLabelInfos; i++)
				{
					if (((numLabelInfos - i - 1) % numOverlaps) != 0)
						labelInfos[i].visible = false;
				}
			}

			// mark labels that fall outside render bounds as not visible
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];
				if ((labelInfo.y + labelInfo.height) <= height)
					break;
				labelInfo.visible = false;
			}

			// layout labels and render ticks
			graphics.clear();
			graphics.setSize(width + (isPlacementLeft ? 1 : 0), height + 1);  // set graphics size according to computed width plus padding for axis lines
			tickBrush.set("color", this.getInternal("foregroundColor"));
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];
				labelInfo.queryLabel.css(
				{
					left: labelInfo.x + "px",
					top: labelInfo.y + "px",
					visibility: labelInfo.visible ? "" : "hidden"
				});

				if (labelInfo.visible)
				{
					tickBrush.beginBrush(graphics);
					if (isPlacementLeft)
					{
						tickBrush.moveTo(width, labelInfo.y);
						tickBrush.lineTo(width - tickWidth, labelInfo.y);
					}
					else
					{
						tickBrush.moveTo(0, labelInfo.y);
						tickBrush.lineTo(tickWidth, labelInfo.y);
					}
					tickBrush.endBrush();
				}
			}
			lineBrush.set("color", this.getInternal("foregroundColor"));
			lineBrush.beginBrush(graphics);
			if (isPlacementLeft)
			{
				lineBrush.moveTo(width, 0);
				lineBrush.lineTo(width, Math.round(height));
			}
			else
			{
				lineBrush.moveTo(0, 0);
				lineBrush.lineTo(0, Math.round(height));
			}
			lineBrush.endBrush();

			this.dispatchEvent("labelsChanged", new EventData());
		};

		// Private Methods

		this._computeAutoUnits = function(range)
		{
			if (range <= 0)
				return 0;

			var significand = range / 10;
			var exponent = 0;

			if (significand > 0)
			{
				var str = significand.toExponential(20);
				var eIndex = str.indexOf("e");
				if (eIndex >= 0)
				{
					significand = Number(str.substring(0, eIndex));
					exponent = Number(str.substring(eIndex + 1, str.length));
				}
			}

			significand = Math.ceil(significand);

			if (significand > 5)
				significand = 10;
			else if (significand > 2)
				significand = 5;

			return significand * Math.pow(10, exponent);
		};

	});

});

define('splunk/charting/GridLines',['require','jg_global','jgatt','jgatt','splunk/charting/NumericAxisLabels','splunk/viz/GraphicsVizBase'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var NumericAxisLabels = require("splunk/charting/NumericAxisLabels");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(GridLines, base)
	{

		// Public Properties

		this.foregroundColor = new ObservableProperty("foregroundColor", Number, 0x000000)
			.writeFilter(function(value)
			{
				return !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.axisLabels = new ObservableProperty("axisLabels", NumericAxisLabels, null)
			.onChanged(function(e)
			{
				var target = e.target;
				if ((target === this) || ((target instanceof NumericAxisLabels) && (e.event === target.labelsChanged)))
					this.invalidate("renderGraphicsPass");
			});

		// Private Properties

		this._lineBrush = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-GridLines");

			this._lineBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.1, 1);
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			graphics.clear();

			var axisLabels = this.getInternal("axisLabels");
			if (!axisLabels)
				return;

			var lineBrush = this._lineBrush;
			lineBrush.set("color", this.getInternal("foregroundColor"));

			var positions = axisLabels.get("positions");
			var numPositions = positions.length;
			var position;
			var y;
			for (var i = 0; i < numPositions; i++)
			{
				position = positions[i];
				y = Math.round(height * (1 - position));
				lineBrush.beginBrush(graphics);
				lineBrush.moveTo(0, y);
				lineBrush.lineTo(width, y);
				lineBrush.endBrush();
			}
		};

	});

});

define('splunk/time/Duration',['require','jg_global'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;

	return jg_extend(Object, function(Duration, base)
	{

		// Private Static Constants

		var _ISO_DURATION_PATTERN = /P(?:(\-?\d+(?:\.\d+)?)Y)?(?:(\-?\d+(?:\.\d+)?)M)?(?:(\-?\d+(?:\.\d+)?)D)?(?:T(?:(\-?\d+(?:\.\d+)?)H)?(?:(\-?\d+(?:\.\d+)?)M)?(?:(\-?\d+(?:\.\d+)?)S)?)?/;

		// Public Properties

		this.years = 0;
		this.months = 0;
		this.days = 0;
		this.hours = 0;
		this.minutes = 0;
		this.seconds = 0;

		// Constructor

		this.constructor = function(yearsOrTimestring, months, days, hours, minutes, seconds)
		{
			if ((arguments.length == 1) && (typeof yearsOrTimestring === "string"))
			{
				var matches = _ISO_DURATION_PATTERN.exec(yearsOrTimestring);
				var numMatches = matches ? matches.length : 0;
				var match;

				match = (numMatches > 1) ? matches[1] : null;
				this.years = match ? Number(match) : 0;

				match = (numMatches > 2) ? matches[2] : null;
				this.months = match ? Number(match) : 0;

				match = (numMatches > 3) ? matches[3] : null;
				this.days = match ? Number(match) : 0;

				match = (numMatches > 4) ? matches[4] : null;
				this.hours = match ? Number(match) : 0;

				match = (numMatches > 5) ? matches[5] : null;
				this.minutes = match ? Number(match) : 0;

				match = (numMatches > 6) ? matches[6] : null;
				this.seconds = match ? Number(match) : 0;
			}
			else
			{
				this.years = (typeof yearsOrTimestring === "number") ? yearsOrTimestring : 0;
				this.months = (months !== undefined) ? months : 0;
				this.days = (days !== undefined) ? days : 0;
				this.hours = (hours !== undefined) ? hours : 0;
				this.minutes = (minutes !== undefined) ? minutes : 0;
				this.seconds = (seconds !== undefined) ? seconds : 0;
			}
		};

		// Public Methods

		this.clone = function()
		{
			return new Duration(this.years, this.months, this.days, this.hours, this.minutes, this.seconds);
		};

		this.equals = function(toCompare)
		{
			return ((this.years == toCompare.years) &&
			        (this.months == toCompare.months) &&
			        (this.days == toCompare.days) &&
			        (this.hours == toCompare.hours) &&
			        (this.minutes == toCompare.minutes) &&
			        (this.seconds == toCompare.seconds));
		};

		this.toString = function()
		{
			var str = "";
			str += "P" + this.years + "Y" + this.months + "M" + this.days + "D";
			str += "T" + this.hours + "H" + this.minutes + "M" + this.seconds + "S";
			return str;
		};

	});

});

define('splunk/time/TimeUtils',['require','jg_global','splunk/time/DateTime','splunk/time/Duration','splunk/time/SimpleTimeZone','splunk/time/TimeZones'],function(require)
{

	var jg_static = require("jg_global").jg_static;
	var DateTime = require("splunk/time/DateTime");
	var Duration = require("splunk/time/Duration");
	var SimpleTimeZone = require("splunk/time/SimpleTimeZone");
	var TimeZones = require("splunk/time/TimeZones");

	return jg_static(function(TimeUtils)
	{

		// Public Static Constants

		TimeUtils.EPOCH = new DateTime(0).toUTC();

		// Public Static Methods

		TimeUtils.daysInMonth = function(date)
		{
			date = new DateTime(date.getYear(), date.getMonth() + 1, 0, 0, 0, 0, TimeZones.UTC);
			return date.getDay();
		};

		TimeUtils.addDurations = function(duration1, duration2)
		{
			return new Duration(duration1.years + duration2.years, duration1.months + duration2.months, duration1.days + duration2.days, duration1.hours + duration2.hours, duration1.minutes + duration2.minutes, duration1.seconds + duration2.seconds);
		};

		TimeUtils.addDateDuration = function(date, duration)
		{
			if ((duration.years == 0) && (duration.months == 0) && (duration.days == 0))
				date = date.clone();
			else
				date = new DateTime(date.getYear() + duration.years, date.getMonth() + duration.months, date.getDay() + duration.days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getTimeZone());
			date.setTime(date.getTime() + (duration.hours * 3600 + duration.minutes * 60 + duration.seconds));
			return date;
		};

		TimeUtils.subtractDates = function(date1, date2)
		{
			date2 = date2.toTimeZone(date1.getTimeZone());

			var isNegative = (date1.getTime() < date2.getTime());
			if (isNegative)
			{
				var temp = date1;
				date1 = date2;
				date2 = temp;
			}

			var sameTimeZoneOffset = (date1.getTimeZoneOffset() == date2.getTimeZoneOffset());

			var years;
			var months;
			var days;
			var hours;
			var minutes;
			var seconds;

			var date3;
			if (sameTimeZoneOffset)
			{
				date3 = date1;
			}
			else if ((date1.getYear() == date2.getYear()) && (date1.getMonth() == date2.getMonth()) && (date1.getDay() == date2.getDay()))
			{
				date3 = date2;
			}
			else
			{
				date3 = new DateTime(date1.getYear(), date1.getMonth(), date1.getDay(), date2.getHours(), date2.getMinutes(), date2.getSeconds(), date2.getTimeZone());
				if (date3.getTime() > date1.getTime())
				{
					date3 = new DateTime(date1.getYear(), date1.getMonth(), date1.getDay() - 1, date2.getHours(), date2.getMinutes(), date2.getSeconds(), date2.getTimeZone());
					if ((date3.getTime() < date2.getTime()) || ((date3.getYear() == date2.getYear()) && (date3.getMonth() == date2.getMonth()) && (date3.getDay() == date2.getDay())))
						date3 = date2;
				}
			}

			years = date3.getYear() - date2.getYear();
			months = date3.getMonth() - date2.getMonth();
			days = date3.getDay() - date2.getDay();

			if (sameTimeZoneOffset)
			{
				hours = date3.getHours() - date2.getHours();
				minutes = date3.getMinutes() - date2.getMinutes();
				seconds = date3.getSeconds() - date2.getSeconds();

				if (seconds < 0)
				{
					seconds += 60;
					minutes--;
				}

				if (minutes < 0)
				{
					minutes += 60;
					hours--;
				}

				if (hours < 0)
				{
					hours += 24;
					days--;
				}

				seconds = _normalizePrecision(seconds);
			}
			else
			{
				seconds = date1.getTime() - date3.getTime();
				var wholeSeconds = Math.floor(seconds);
				var subSeconds = _normalizePrecision(seconds - wholeSeconds);
				if (subSeconds >= 1)
				{
					subSeconds = 0;
					wholeSeconds++;
				}

				minutes = Math.floor(wholeSeconds / 60);
				seconds = (wholeSeconds % 60) + subSeconds;

				hours = Math.floor(minutes / 60);
				minutes %= 60;
			}

			if (days < 0)
			{
				date3 = new DateTime(date2.getYear(), date2.getMonth() + 1, 0, 0, 0, 0, TimeZones.UTC);
				days += date3.getDay();
				months--;
			}

			if (months < 0)
			{
				months += 12;
				years--;
			}

			if (isNegative)
			{
				years = -years;
				months = -months;
				days = -days;
				hours = -hours;
				minutes = -minutes;
				seconds = -seconds;
			}

			return new Duration(years, months, days, hours, minutes, seconds);
		};

		TimeUtils.subtractDurations = function(duration1, duration2)
		{
			return new Duration(duration1.years - duration2.years, duration1.months - duration2.months, duration1.days - duration2.days, duration1.hours - duration2.hours, duration1.minutes - duration2.minutes, duration1.seconds - duration2.seconds);
		};

		TimeUtils.subtractDateDuration = function(date, duration)
		{
			if ((duration.years == 0) && (duration.months == 0) && (duration.days == 0))
				date = date.clone();
			else
				date = new DateTime(date.getYear() - duration.years, date.getMonth() - duration.months, date.getDay() - duration.days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getTimeZone());
			date.setTime(date.getTime() - (duration.hours * 3600 + duration.minutes * 60 + duration.seconds));
			return date;
		};

		TimeUtils.multiplyDuration = function(duration, scalar)
		{
			return new Duration(duration.years * scalar, duration.months * scalar, duration.days * scalar, duration.hours * scalar, duration.minutes * scalar, duration.seconds * scalar);
		};

		TimeUtils.divideDuration = function(duration, scalar)
		{
			return new Duration(duration.years / scalar, duration.months / scalar, duration.days / scalar, duration.hours / scalar, duration.minutes / scalar, duration.seconds / scalar);
		};

		TimeUtils.ceilDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_ceilDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.ceilDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_floorDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_ceilDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.floorDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_floorDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.floorDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_ceilDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_floorDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.roundDate = function(date, units)
		{
			var date2 = date.toTimeZone(new SimpleTimeZone(date.getTimeZoneOffset()));
			_roundDateInternal(date2, units);
			return _toTimeZoneStable(date2, date.getTimeZone());
		};

		TimeUtils.roundDuration = function(duration, units, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			var isNegative = (date.getTime() < referenceDate.getTime());
			duration = isNegative ? TimeUtils.subtractDates(referenceDate, date) : TimeUtils.subtractDates(date, referenceDate);

			if (!units)
			{
				units = new Duration();
				if (duration.years > 0)
					units.years = 1;
				else if (duration.months > 0)
					units.months = 1;
				else if (duration.days > 0)
					units.days = 1;
				else if (duration.hours > 0)
					units.hours = 1;
				else if (duration.minutes > 0)
					units.minutes = 1;
				else if (duration.seconds > 0)
					units.seconds = 1;
			}

			if (isNegative)
			{
				_roundDurationInternal(duration, units, date);
				return TimeUtils.multiplyDuration(duration, -1);
			}

			_roundDurationInternal(duration, units, referenceDate);
			return duration;
		};

		TimeUtils.normalizeDuration = function(duration, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			return TimeUtils.subtractDates(date, referenceDate);
		};

		TimeUtils.durationToSeconds = function(duration, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = TimeUtils.addDateDuration(referenceDate, duration);
			return _normalizePrecision(date.getTime() - referenceDate.getTime());
		};

		TimeUtils.secondsToDuration = function(seconds, referenceDate)
		{
			if (!referenceDate)
				referenceDate = TimeUtils.EPOCH;

			var date = new DateTime(referenceDate.getTime() + seconds).toTimeZone(referenceDate.getTimeZone());
			return TimeUtils.subtractDates(date, referenceDate);
		};

		// Private Static Methods

		var _ceilDateInternal = function(date, units)
		{
			var ceilYear = (units.years > 0);
			var ceilMonth = ceilYear || (units.months > 0);
			var ceilDay = ceilMonth || (units.days > 0);
			var ceilHours = ceilDay || (units.hours > 0);
			var ceilMinutes = ceilHours || (units.minutes > 0);
			var ceilSeconds = ceilMinutes || (units.seconds > 0);

			if (!ceilSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.min(Math.ceil(date.getSeconds() / units.seconds) * units.seconds, 60));
				else
					date.setSeconds(60);
			}

			if (!ceilMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.min(Math.ceil(date.getMinutes() / units.minutes) * units.minutes, 60));
				else
					date.setMinutes(60);
			}

			if (!ceilHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.min(Math.ceil(date.getHours() / units.hours) * units.hours, 24));
				else
					date.setHours(24);
			}

			if (!ceilDay)
				return;

			if (date.getDay() > 1)
			{
				var daysInMonth = TimeUtils.daysInMonth(date);
				if (units.days > 0)
					date.setDay(Math.min(Math.ceil((date.getDay() - 1) / units.days) * units.days, daysInMonth) + 1);
				else
					date.setDay(daysInMonth + 1);
			}

			if (!ceilMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.min(Math.ceil((date.getMonth() - 1) / units.months) * units.months, 12) + 1);
				else
					date.setMonth(12 + 1);
			}

			if (!ceilYear)
				return;

			if (units.years > 0)
				date.setYear(Math.ceil(date.getYear() / units.years) * units.years);
		};

		var _ceilDurationInternal = function(duration, units, referenceDate)
		{
			var ceilYears = (units.years > 0);
			var ceilMonths = ceilYears || (units.months > 0);
			var ceilDays = ceilMonths || (units.days > 0);
			var ceilHours = ceilDays || (units.hours > 0);
			var ceilMinutes = ceilHours || (units.minutes > 0);
			var ceilSeconds = ceilMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!ceilSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.min(Math.ceil(duration.seconds / units.seconds) * units.seconds, 60);
				else
					duration.seconds = 60;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.min(Math.ceil(duration.minutes / units.minutes) * units.minutes, 60);
				else
					duration.minutes = 60;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.min(Math.ceil(duration.hours / units.hours) * units.hours, 24);
				else
					duration.hours = 24;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.min(Math.ceil(duration.days / units.days) * units.days, daysInMonth);
				else
					duration.days = daysInMonth;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.min(Math.ceil(duration.months / units.months) * units.months, 12);
				else
					duration.months = 12;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!ceilYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.ceil(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _floorDateInternal = function(date, units)
		{
			var floorYear = (units.years > 0);
			var floorMonth = floorYear || (units.months > 0);
			var floorDay = floorMonth || (units.days > 0);
			var floorHours = floorDay || (units.hours > 0);
			var floorMinutes = floorHours || (units.minutes > 0);
			var floorSeconds = floorMinutes || (units.seconds > 0);

			if (!floorSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.floor(date.getSeconds() / units.seconds) * units.seconds);
				else
					date.setSeconds(0);
			}

			if (!floorMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.floor(date.getMinutes() / units.minutes) * units.minutes);
				else
					date.setMinutes(0);
			}

			if (!floorHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.floor(date.getHours() / units.hours) * units.hours);
				else
					date.setHours(0);
			}

			if (!floorDay)
				return;

			if (date.getDay() > 1)
			{
				if (units.days > 0)
					date.setDay(Math.floor((date.getDay() - 1) / units.days) * units.days + 1);
				else
					date.setDay(1);
			}

			if (!floorMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.floor((date.getMonth() - 1) / units.months) * units.months + 1);
				else
					date.setMonth(1);
			}

			if (!floorYear)
				return;

			if (units.years > 0)
				date.setYear(Math.floor(date.getYear() / units.years) * units.years);
		};

		var _floorDurationInternal = function(duration, units, referenceDate)
		{
			var floorYears = (units.years > 0);
			var floorMonths = floorYears || (units.months > 0);
			var floorDays = floorMonths || (units.days > 0);
			var floorHours = floorDays || (units.hours > 0);
			var floorMinutes = floorHours || (units.minutes > 0);
			var floorSeconds = floorMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!floorSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.floor(duration.seconds / units.seconds) * units.seconds;
				else
					duration.seconds = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.floor(duration.minutes / units.minutes) * units.minutes;
				else
					duration.minutes = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.floor(duration.hours / units.hours) * units.hours;
				else
					duration.hours = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.floor(duration.days / units.days) * units.days;
				else
					duration.days = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.floor(duration.months / units.months) * units.months;
				else
					duration.months = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!floorYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.floor(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _roundDateInternal = function(date, units)
		{
			var roundYear = (units.years > 0);
			var roundMonth = roundYear || (units.months > 0);
			var roundDay = roundMonth || (units.days > 0);
			var roundHours = roundDay || (units.hours > 0);
			var roundMinutes = roundHours || (units.minutes > 0);
			var roundSeconds = roundMinutes || (units.seconds > 0);

			if (!roundSeconds)
				return;

			if (date.getSeconds() > 0)
			{
				if (units.seconds > 0)
					date.setSeconds(Math.min(Math.round(date.getSeconds() / units.seconds) * units.seconds, 60));
				else if (date.getSeconds() >= 30)
					date.setSeconds(60);
				else
					date.setSeconds(0);
			}

			if (!roundMinutes)
				return;

			if (date.getMinutes() > 0)
			{
				if (units.minutes > 0)
					date.setMinutes(Math.min(Math.round(date.getMinutes() / units.minutes) * units.minutes, 60));
				else if (date.getMinutes() >= 30)
					date.setMinutes(60);
				else
					date.setMinutes(0);
			}

			if (!roundHours)
				return;

			if (date.getHours() > 0)
			{
				if (units.hours > 0)
					date.setHours(Math.min(Math.round(date.getHours() / units.hours) * units.hours, 24));
				else if (date.getHours() >= 12)
					date.setHours(24);
				else
					date.setHours(0);
			}

			if (!roundDay)
				return;

			if (date.getDay() > 1)
			{
				var daysInMonth = TimeUtils.daysInMonth(date);
				if (units.days > 0)
					date.setDay(Math.min(Math.round((date.getDay() - 1) / units.days) * units.days, daysInMonth) + 1);
				else if (date.getDay() >= Math.floor(daysInMonth / 2 + 1))
					date.setDay(daysInMonth + 1);
				else
					date.setDay(1);
			}

			if (!roundMonth)
				return;

			if (date.getMonth() > 1)
			{
				if (units.months > 0)
					date.setMonth(Math.min(Math.round((date.getMonth() - 1) / units.months) * units.months, 12) + 1);
				else if (date.getMonth() >= (6 + 1))
					date.setMonth(12 + 1);
				else
					date.setMonth(1);
			}

			if (!roundYear)
				return;

			if (units.years > 0)
				date.setYear(Math.round(date.getYear() / units.years) * units.years);
		};

		var _roundDurationInternal = function(duration, units, referenceDate)
		{
			var roundYears = (units.years > 0);
			var roundMonths = roundYears || (units.months > 0);
			var roundDays = roundMonths || (units.days > 0);
			var roundHours = roundDays || (units.hours > 0);
			var roundMinutes = roundHours || (units.minutes > 0);
			var roundSeconds = roundMinutes || (units.seconds > 0);

			var daysInMonth = TimeUtils.daysInMonth(referenceDate);

			if (!roundSeconds)
				return;

			if (duration.seconds > 0)
			{
				if (units.seconds > 0)
					duration.seconds = Math.min(Math.round(duration.seconds / units.seconds) * units.seconds, 60);
				else if (duration.seconds >= 30)
					duration.seconds = 60;
				else
					duration.seconds = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundMinutes)
				return;

			if (duration.minutes > 0)
			{
				if (units.minutes > 0)
					duration.minutes = Math.min(Math.round(duration.minutes / units.minutes) * units.minutes, 60);
				else if (duration.minutes >= 30)
					duration.minutes = 60;
				else
					duration.minutes = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundHours)
				return;

			if (duration.hours > 0)
			{
				if (units.hours > 0)
					duration.hours = Math.min(Math.round(duration.hours / units.hours) * units.hours, 24);
				else if (duration.hours >= 12)
					duration.hours = 24;
				else
					duration.hours = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundDays)
				return;

			if (duration.days > 0)
			{
				if (units.days > 0)
					duration.days = Math.min(Math.round(duration.days / units.days) * units.days, daysInMonth);
				else if (duration.days >= Math.floor(daysInMonth / 2))
					duration.days = daysInMonth;
				else
					duration.days = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundMonths)
				return;

			if (duration.months > 0)
			{
				if (units.months > 0)
					duration.months = Math.min(Math.round(duration.months / units.months) * units.months, 12);
				else if (duration.months >= 6)
					duration.months = 12;
				else
					duration.months = 0;
				_normalizeDuration(duration, daysInMonth);
			}

			if (!roundYears)
				return;

			if (units.years > 0)
			{
				duration.years = Math.round(duration.years / units.years) * units.years;
				_normalizeDuration(duration, daysInMonth);
			}
		};

		var _toTimeZoneStable = function(date, timeZone)
		{
			var date2 = date.toTimeZone(timeZone);
			if ((date2.getYear() == date.getYear()) && (date2.getMonth() == date.getMonth()) && (date2.getDay() == date.getDay()) &&
			    (date2.getHours() == date.getHours()) && (date2.getMinutes() == date.getMinutes()) && (date2.getSeconds() == date.getSeconds()))
				return date2;

			var date3 = date.clone();
			date3.setTimeZone(timeZone);
			if ((date3.getYear() == date.getYear()) && (date3.getMonth() == date.getMonth()) && (date3.getDay() == date.getDay()) &&
			    (date3.getHours() == date.getHours()) && (date3.getMinutes() == date.getMinutes()) && (date3.getSeconds() == date.getSeconds()))
				return date3;

			return date2;
		};

		var _normalizeDuration = function(duration, daysInMonth)
		{
			var years = duration.years;
			var wholeYears = Math.floor(years);
			var subYears = years - wholeYears;

			var months = duration.months + subYears * 12;
			var wholeMonths = Math.floor(months);
			var subMonths = months - wholeMonths;

			var days = duration.days + subMonths * daysInMonth;
			var wholeDays = Math.floor(days);
			var subDays = days - wholeDays;

			var hours = duration.hours + subDays * 24;
			var wholeHours = Math.floor(hours);
			var subHours = hours - wholeHours;

			var minutes = duration.minutes + subHours * 60;
			var wholeMinutes = Math.floor(minutes);
			var subMinutes = minutes - wholeMinutes;

			var seconds = duration.seconds + subMinutes * 60;
			var wholeSeconds = Math.floor(seconds);
			var subSeconds = _normalizePrecision(seconds - wholeSeconds);
			if (subSeconds >= 1)
			{
				subSeconds = 0;
				wholeSeconds++;
			}

			wholeMinutes += Math.floor(wholeSeconds / 60);
			wholeSeconds %= 60;

			wholeHours += Math.floor(wholeMinutes / 60);
			wholeMinutes %= 60;

			wholeDays += Math.floor(wholeHours / 24);
			wholeHours %= 24;

			wholeMonths += Math.floor(wholeDays / daysInMonth);
			wholeDays %= daysInMonth;

			wholeYears += Math.floor(wholeMonths / 12);
			wholeMonths %= 12;

			duration.years = wholeYears;
			duration.months = wholeMonths;
			duration.days = wholeDays;
			duration.hours = wholeHours;
			duration.minutes = wholeMinutes;
			duration.seconds = wholeSeconds + subSeconds;
		};

		var _normalizePrecision = function(value)
		{
			return Number(value.toFixed(6));
		};

	});

});

define('splunk/charting/TimeAxisLabels',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/Histogram','splunk/time/DateTime','splunk/time/Duration','splunk/time/TimeUtils','splunk/time/TimeZone','splunk/time/TimeZones','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var EventData = require("jgatt").events.EventData;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var ArrayProperty = require("jgatt").properties.ArrayProperty;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var Property = require("jgatt").properties.Property;
	var StringUtils = require("jgatt").utils.StringUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var Histogram = require("splunk/charting/Histogram");
	var DateTime = require("splunk/time/DateTime");
	var Duration = require("splunk/time/Duration");
	var TimeUtils = require("splunk/time/TimeUtils");
	var TimeZone = require("splunk/time/TimeZone");
	var TimeZones = require("splunk/time/TimeZones");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(TimeAxisLabels, base)
	{

		// Public Passes

		this.updateLabelsPass = new ValidatePass("updateLabels", 0.3);

		// Public Events

		this.labelsChanged = new ChainedEvent("labelsChanged", this.changed);

		// Public Properties

		this.foregroundColor = new ObservableProperty("foregroundColor", Number, 0x000000)
			.writeFilter(function(value)
			{
				return !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.histogram = new ObservableProperty("histogram", Histogram, null)
			.onChanged(function(e)
			{
				var target = e.target;
				if ((target === this) || ((target instanceof Histogram) && (e.event === target.rangeXChanged)))
					this.invalidate("updateLabelsPass");
			});

		this.timeZone = new ObservableProperty("timeZone", TimeZone, TimeZones.LOCAL)
			.onChanged(function(e)
			{
				this.invalidate("updateLabelsPass");
			});

		this.labelFormat = new ObservableProperty("labelFormat", Function, null)
			.onChanged(function(e)
			{
				this.invalidate("updateLabelsPass");
			});

		this.actualUnit = new Property("actualUnit", Duration, null, true)
			.onRead(function()
			{
				this.validate("updateLabelsPass");
			})
			.getter(function()
			{
				return this._actualUnit.clone();
			});

		this.positions = new ArrayProperty("positions", Number, null, true)
			.onRead(function()
			{
				this.validate("updateLabelsPass");
			})
			.getter(function()
			{
				var value = [];
				var labelInfos = this._labelInfos;
				var labelInfo;
				for (var i = 0, l = labelInfos.length; i < l; i++)
				{
					labelInfo = labelInfos[i];
					if (labelInfo.visible)
						value.push(labelInfo.relative);
				}
				return value;
			});

		// Private Properties

		this._actualUnit = null;
		this._lineBrush = null;
		this._labelInfos = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-TimeAxisLabels");

			this._actualUnit = new Duration();

			this._lineBrush = new SolidStrokeBrush(this.getInternal("foregroundColor"), 0.2, 1, "square");

			this._labelInfos = [];
		};

		// Public Methods

		this.updateLabels = function()
		{
			this.validatePreceding("updateLabelsPass");

			if (this.isValid("updateLabelsPass"))
				return;

			this.invalidate("renderGraphicsPass");

			var element = this.element;
			var labelFormat = this.getInternal("labelFormat");
			var labelInfos = this._labelInfos;
			var numLabelInfos = labelInfos.length;
			var numNewLabelInfos = 0;
			var labelInfo;

			try
			{
				var maxMajorUnits = 50;

				// set default value for actualUnit
				this._actualUnit = new Duration();

				// get histogram and verify not null
				var histogram = this.getInternal("histogram");
				if (!histogram)
					return;

				// get minimum and maximum and verify not equal
				var minimum = histogram.get("actualMinimumX");
				var maximum = histogram.get("actualMaximumX");
				var range = maximum - minimum;
				if (range == 0)
					return;

				// adjust minimum and maximum for timeZone
				var timeZone = this.getInternal("timeZone");
				var minimumTime = new DateTime(minimum);
				var maximumTime = new DateTime(maximum);
				minimumTime = minimumTime.toTimeZone(timeZone);
				maximumTime = maximumTime.toTimeZone(timeZone);

				// compute majorUnit
				var majorUnit = this._computeAutoUnits(TimeUtils.subtractDates(maximumTime, minimumTime));

				// compute majorUnit time and verify greater than zero
				var majorUnitTime = TimeUtils.durationToSeconds(majorUnit, minimumTime);
				if (majorUnitTime <= 0)
					return;

				// scale majorUnit if numMajorUnits is greater than maxMajorUnits
				var numMajorUnits = 1 + Math.floor((maximum - minimum) / majorUnitTime);
				majorUnit = TimeUtils.multiplyDuration(majorUnit, Math.ceil(numMajorUnits / maxMajorUnits));

				// update actualUnit
				this._actualUnit = majorUnit;

				// snap minimum and maximum to majorUnit
				minimumTime = TimeUtils.subtractDateDuration(TimeUtils.ceilDate(minimumTime, majorUnit), majorUnit);
				maximumTime = TimeUtils.ceilDate(maximumTime, majorUnit);

				// compute label info
				var majorValue;
				var majorRelative;
				var majorUnitNum = 1;
				for (majorValue = minimumTime; majorValue.getTime() <= maximumTime.getTime(); majorUnitNum++)
				{
					majorRelative = (majorValue.getTime() - minimum) / range;
					if ((majorRelative >= 0) && (majorRelative < 1))
					{
						if (numNewLabelInfos < numLabelInfos)
						{
							labelInfo = labelInfos[numNewLabelInfos];
						}
						else
						{
							labelInfo = {};
							labelInfo.label = document.createElement("span");
							labelInfo.queryLabel = $(labelInfo.label);
							labelInfo.queryLabel.addClass("splunk-charting-label");
							labelInfo.queryLabel.css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });
							labelInfos.push(labelInfo);
							element.appendChild(labelInfo.label);
						}

						labelInfo.relative = majorRelative;

						if (labelFormat)
							labelInfo.queryLabel.html(StringUtils.escapeHTML(labelFormat(majorValue)));
						else
							labelInfo.queryLabel.html(StringUtils.escapeHTML(majorValue));

						numNewLabelInfos++;
					}
					majorValue = TimeUtils.addDateDuration(minimumTime, TimeUtils.multiplyDuration(majorUnit, majorUnitNum));
				}
			}
			finally
			{
				// remove labels
				for (var i = labelInfos.length - 1; i >= numNewLabelInfos; i--)
				{
					labelInfo = labelInfos.pop();
					element = labelInfo.label.parentNode;
					if (element)
						element.removeChild(labelInfo.label);
				}

				this.setValid("updateLabelsPass");
			}
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var lineBrush = this._lineBrush;
			var labelInfos = this._labelInfos;
			var numLabelInfos = labelInfos.length;
			var labelInfo;
			var labelInfo2;
			var labelHeight = 0;
			var tickHeight = 25;
			var numOverlaps = 0;
			var i;
			var j;

			// measure labels and prepare for rendering
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];

				labelInfo.x = Math.round(width * labelInfo.relative);
				labelInfo.y = 0;
				labelInfo.width = Math.round(labelInfo.queryLabel.outerWidth(true));
				labelInfo.height = Math.round(labelInfo.queryLabel.outerHeight(true));
				labelInfo.visible = true;

				labelHeight = Math.max(labelHeight, labelInfo.height);
			}
			height = Math.max(labelHeight, tickHeight);
			this.setInternal("height", height);

			// compute numOverlaps
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];
				for (j = i + 1; j < numLabelInfos; j++)
				{
					labelInfo2 = labelInfos[j];
					if (labelInfo2.x >= (labelInfo.x + labelInfo.width))
						break;
					numOverlaps = Math.max(numOverlaps, j - i);
				}
			}

			// mark overlapping labels as not visible
			if (numOverlaps > 0)
			{
				numOverlaps++;
				for (i = 0; i < numLabelInfos; i++)
				{
					if ((i % numOverlaps) != 0)
						labelInfos[i].visible = false;
				}
			}

			// mark labels that fall outside render bounds as not visible
			for (i = numLabelInfos - 1; i >= 0; i--)
			{
				labelInfo = labelInfos[i];
				if ((labelInfo.x + labelInfo.width) <= width)
					break;
				labelInfo.visible = false;
			}

			// layout labels and render ticks
			graphics.clear();
			graphics.setSize(width + 1, height);  // set graphics size according to computed height plus padding for axis lines
			lineBrush.set("color", this.getInternal("foregroundColor"));
			for (i = 0; i < numLabelInfos; i++)
			{
				labelInfo = labelInfos[i];
				labelInfo.queryLabel.css(
				{
					left: labelInfo.x + "px",
					top: labelInfo.y + "px",
					visibility: labelInfo.visible ? "" : "hidden"
				});

				if (labelInfo.visible)
				{
					lineBrush.beginBrush(graphics);
					lineBrush.moveTo(labelInfo.x, 0);
					lineBrush.lineTo(labelInfo.x, tickHeight);
					lineBrush.endBrush();
				}
			}
			lineBrush.beginBrush(graphics);
			lineBrush.moveTo(0, 0);
			lineBrush.lineTo(Math.round(width), 0);
			lineBrush.endBrush();

			this.dispatchEvent("labelsChanged", new EventData());
		};

		// Private Methods

		this._computeAutoUnits = function(range)
		{
			if (TimeUtils.durationToSeconds(range) <= 0)
				return new Duration();

			var date = new DateTime(range.years, range.months + 1, range.days + 1, range.hours, range.minutes, range.seconds, TimeZones.UTC);

			range = new Duration(date.getYear(), date.getMonth() - 1, date.getDay() - 1, date.getHours(), date.getMinutes(), date.getSeconds());

			var diff;
			var significand;
			var exponent;
			var str;
			var eIndex;

			diff = range.years;
			if (diff > 2)
			{
				significand = diff / 10;
				exponent = 0;

				if (significand > 0)
				{
					str = significand.toExponential(20);
					eIndex = str.indexOf("e");
					if (eIndex >= 0)
					{
						significand = Number(str.substring(0, eIndex));
						exponent = Number(str.substring(eIndex + 1, str.length));
					}
				}

				significand = Math.ceil(significand);

				if (significand > 5)
					significand = 10;
				else if (significand > 2)
					significand = 5;

				return new Duration(Math.ceil(significand * Math.pow(10, exponent)));
			}

			diff = range.months + diff * 12;
			if (diff > 2)
			{
				if (diff > 18)
					return new Duration(0, 4);
				else if (diff > 12)
					return new Duration(0, 3);
				else if (diff > 6)
					return new Duration(0, 2);
				else
					return new Duration(0, 1);
			}

			diff = range.days + diff * 30;
			if (diff > 2)
			{
				if (diff > 49)
					return new Duration(0, 0, 14);
				else if (diff > 28)
					return new Duration(0, 0, 7);
				else if (diff > 14)
					return new Duration(0, 0, 4);
				else if (diff > 7)
					return new Duration(0, 0, 2);
				else
					return new Duration(0, 0, 1);
			}

			diff = range.hours + diff * 24;
			if (diff > 2)
			{
				if (diff > 36)
					return new Duration(0, 0, 0, 12);
				else if (diff > 24)
					return new Duration(0, 0, 0, 6);
				else if (diff > 12)
					return new Duration(0, 0, 0, 4);
				else if (diff > 6)
					return new Duration(0, 0, 0, 2);
				else
					return new Duration(0, 0, 0, 1);
			}

			diff = range.minutes + diff * 60;
			if (diff > 2)
			{
				if (diff > 105)
					return new Duration(0, 0, 0, 0, 30);
				else if (diff > 70)
					return new Duration(0, 0, 0, 0, 15);
				else if (diff > 35)
					return new Duration(0, 0, 0, 0, 10);
				else if (diff > 14)
					return new Duration(0, 0, 0, 0, 5);
				else if (diff > 7)
					return new Duration(0, 0, 0, 0, 2);
				else
					return new Duration(0, 0, 0, 0, 1);
			}

			diff = range.seconds + diff * 60;
			if (diff > 2)
			{
				if (diff > 105)
					return new Duration(0, 0, 0, 0, 0, 30);
				else if (diff > 70)
					return new Duration(0, 0, 0, 0, 0, 15);
				else if (diff > 35)
					return new Duration(0, 0, 0, 0, 0, 10);
				else if (diff > 14)
					return new Duration(0, 0, 0, 0, 0, 5);
				else if (diff > 7)
					return new Duration(0, 0, 0, 0, 0, 2);
				else
					return new Duration(0, 0, 0, 0, 0, 1);
			}

			significand = diff / 10;
			exponent = 0;

			if (significand > 0)
			{
				str = significand.toExponential(20);
				eIndex = str.indexOf("e");
				if (eIndex >= 0)
				{
					significand = Number(str.substring(0, eIndex));
					exponent = Number(str.substring(eIndex + 1, str.length));
				}
			}

			significand = Math.ceil(significand);

			if (significand > 5)
				significand = 10;
			else if (significand > 2)
				significand = 5;

			return new Duration(0, 0, 0, 0, 0, significand * Math.pow(10, exponent));
		};

	});

});

define('splunk/charting/Tooltip',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var Matrix = require("jgatt").geom.Matrix;
	var Point = require("jgatt").geom.Point;
	var Rectangle = require("jgatt").geom.Rectangle;
	var GradientFillBrush = require("jgatt").graphics.brushes.GradientFillBrush;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var StringUtils = require("jgatt").utils.StringUtils;
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(Tooltip, base)
	{

		// Public Properties

		this.value = new ObservableProperty("value", String, null)
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.viewBounds = new ObservableProperty("viewBounds", Rectangle, new Rectangle())
			.readFilter(function(value)
			{
				return value.clone();
			})
			.writeFilter(function(value)
			{
				if (value)
				{
					value = value.clone();
					if (value.width < 0)
					{
						value.x += value.width;
						value.width = -value.width;
					}
					if (value.height < 0)
					{
						value.y += value.height;
						value.height = -value.height;
					}
				}
				else
				{
					value = new Rectangle();
				}
				return value;
			})
			.changedComparator(function(oldValue, newValue)
			{
				return !oldValue.equals(newValue);
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.targetBounds = new ObservableProperty("targetBounds", Rectangle, new Rectangle())
			.readFilter(function(value)
			{
				return value.clone();
			})
			.writeFilter(function(value)
			{
				if (value)
				{
					value = value.clone();
					if (value.width < 0)
					{
						value.x += value.width;
						value.width = -value.width;
					}
					if (value.height < 0)
					{
						value.y += value.height;
						value.height = -value.height;
					}
				}
				else
				{
					value = new Rectangle();
				}
				return value;
			})
			.changedComparator(function(oldValue, newValue)
			{
				return !oldValue.equals(newValue);
			})
			.onChanged(function(e)
			{
				this.invalidate("renderGraphicsPass");
			});

		// Private Properties

		this._backgroundBrush = null;
		this._valueLabel = null;
		this._isShowing = true;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-Tooltip");

			this._backgroundBrush = new GradientFillBrush("linear", [ 0x333333, 0x000000 ], [ 1, 1 ], [ 0, 1 ]);
			this._backgroundBrush.set("tileTransform", new Matrix(0, 1, -1, 0));

			this._valueLabel = document.createElement("span");
			$(this._valueLabel).addClass("splunk-charting-label");
			$(this._valueLabel).css({ position: "absolute", left: "0px", top: "0px", "white-space": "pre" });

			this.element.appendChild(this._valueLabel);

			this.hide();
		};

		// Public Methods

		this.show = function()
		{
			if (this._isShowing)
				return;

			this._isShowing = true;

			this.validate("renderGraphicsPass");

			this.setStyle({ visibility: "" });
		};

		this.hide = function()
		{
			if (!this._isShowing)
				return;

			this._isShowing = false;

			this.setStyle({ visibility: "hidden" });
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var valueLabel = $(this._valueLabel);
			var value = this.getInternal("value");
			if (!value)
				valueLabel.html("");
			else
				valueLabel.html(StringUtils.escapeHTML(value));

			var contentWidth = valueLabel.outerWidth(true);
			var contentHeight = valueLabel.outerHeight(true);

			var pointerLength = 7;
			var pointerThickness = 14 / 2;

			var viewBounds = this.getInternal("viewBounds");
			var viewWidth = viewBounds.width;
			var viewHeight = viewBounds.height;
			var viewLeft = viewBounds.x;
			var viewRight = viewLeft + viewWidth;
			var viewTop = viewBounds.y;
			var viewBottom = viewTop + viewHeight;

			var targetBounds = this.getInternal("targetBounds");
			var targetWidth = targetBounds.width;
			var targetHeight = targetBounds.height;
			var targetLeft = targetBounds.x;
			var targetRight = targetLeft + targetWidth;
			var targetTop = targetBounds.y;
			var targetBottom = targetTop + targetHeight;

			var marginLeft = 10;
			var marginRight = 10;
			var marginTop = 10;
			var marginBottom = 10;
			var marginX = marginLeft + marginRight;
			var marginY = marginTop + marginBottom;
			var marginScaleX = (marginX > 0) ? NumberUtils.minMax((viewWidth - contentWidth) / marginX, 0, 1) : 0;
			var marginScaleY = (marginY > 0) ? NumberUtils.minMax((viewHeight - contentHeight) / marginY, 0, 1) : 0;

			var alignmentX = 0.5;
			var alignmentY = 0.5;

			// determine placement

			var placement;
			if (((targetLeft + targetRight) / 2) > ((viewLeft + viewRight) / 2))
				placement = "left";
			else
				placement = "right";

			// compute targetPosition (in global coordinates) and pointerPosition (in local coordinates)

			var targetPosition;
			var pointerPosition;
			if (placement == "left")
			{
				marginTop *= marginScaleY;
				marginBottom *= marginScaleY;
				targetPosition = new Point(targetLeft, targetTop * (1 - alignmentY) + targetBottom * alignmentY);
				targetPosition.x = NumberUtils.minMax(targetPosition.x, viewLeft + marginLeft + contentWidth + pointerLength, targetRight);
				targetPosition.x = NumberUtils.minMax(targetPosition.x, viewLeft + contentWidth + pointerLength, viewRight);
				targetPosition.y = NumberUtils.maxMin(targetPosition.y, viewBottom, viewTop);
				pointerPosition = new Point(contentWidth + pointerLength, contentHeight * alignmentY);
				pointerPosition.y = NumberUtils.minMax(pointerPosition.y, contentHeight - Math.max(viewBottom - marginBottom - targetPosition.y, 0), Math.max(targetPosition.y - viewTop - marginTop, 0));
			}
			else
			{
				marginTop *= marginScaleY;
				marginBottom *= marginScaleY;
				targetPosition = new Point(targetRight, targetTop * (1 - alignmentY) + targetBottom * alignmentY);
				targetPosition.x = NumberUtils.maxMin(targetPosition.x, viewRight - marginRight - contentWidth - pointerLength, targetLeft);
				targetPosition.x = NumberUtils.maxMin(targetPosition.x, viewRight - contentWidth - pointerLength, viewLeft);
				targetPosition.y = NumberUtils.maxMin(targetPosition.y, viewBottom, viewTop);
				pointerPosition = new Point(0, contentHeight * alignmentY);
				pointerPosition.y = NumberUtils.minMax(pointerPosition.y, contentHeight - Math.max(viewBottom - marginBottom - targetPosition.y, 0), Math.max(targetPosition.y - viewTop - marginTop, 0));
			}

			// snap positions to pixels

			targetPosition.x = Math.round(targetPosition.x);
			targetPosition.y = Math.round(targetPosition.y);
			pointerPosition.x = Math.round(pointerPosition.x);
			pointerPosition.y = Math.round(pointerPosition.y);

			// convert targetPosition to local coordinates and offset this position

			targetPosition = this.globalToLocal(targetPosition);
			this.set("x", this.get("x") + (targetPosition.x - pointerPosition.x));
			this.set("y", this.get("y") + (targetPosition.y - pointerPosition.y));

			// render

			graphics.clear();
			graphics.setSize(contentWidth + pointerLength, contentHeight);

			var backgroundBrush = this._backgroundBrush;
			var p1;
			var p2;
			var p3;
			var p4;

			if (placement == "left")
			{
				p1 = new Point(0, 0);
				p2 = new Point(contentWidth, 0);
				p3 = new Point(contentWidth, contentHeight);
				p4 = new Point(0, contentHeight);

				backgroundBrush.beginBrush(graphics, null, [ p1, p2, p3, p4 ]);
				backgroundBrush.moveTo(p1.x, p1.y);
				backgroundBrush.lineTo(p2.x, p2.y);
				backgroundBrush.lineTo(p2.x, NumberUtils.maxMin(pointerPosition.y - pointerThickness, p3.y - pointerThickness, p2.y));
				backgroundBrush.lineTo(pointerPosition.x, pointerPosition.y);
				backgroundBrush.lineTo(p2.x, NumberUtils.minMax(pointerPosition.y + pointerThickness, p2.y + pointerThickness, p3.y));
				backgroundBrush.lineTo(p3.x, p3.y);
				backgroundBrush.lineTo(p4.x, p4.y);
				backgroundBrush.lineTo(p1.x, p1.y);
				backgroundBrush.endBrush();
			}
			else
			{
				p1 = new Point(pointerLength, 0);
				p2 = new Point(pointerLength + contentWidth, 0);
				p3 = new Point(pointerLength + contentWidth, contentHeight);
				p4 = new Point(pointerLength, contentHeight);

				backgroundBrush.beginBrush(graphics, null, [ p1, p2, p3, p4 ]);
				backgroundBrush.moveTo(p1.x, p1.y);
				backgroundBrush.lineTo(p2.x, p2.y);
				backgroundBrush.lineTo(p3.x, p3.y);
				backgroundBrush.lineTo(p4.x, p4.y);
				backgroundBrush.lineTo(p4.x, NumberUtils.minMax(pointerPosition.y + pointerThickness, p1.y + pointerThickness, p4.y));
				backgroundBrush.lineTo(pointerPosition.x, pointerPosition.y);
				backgroundBrush.lineTo(p4.x, NumberUtils.maxMin(pointerPosition.y - pointerThickness, p4.y - pointerThickness, p1.y));
				backgroundBrush.lineTo(p1.x, p1.y);
				backgroundBrush.endBrush();
			}

			// set valueLabel position

			valueLabel.css({ left: p1.x + "px" });
		};

	});

});

define('splunk/time/SplunkTimeZone',['require','jg_global','jgatt','splunk/time/TimeZone'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var ArrayUtils = require("jgatt").utils.ArrayUtils;
	var TimeZone = require("splunk/time/TimeZone");

	return jg_extend(TimeZone, function(SplunkTimeZone, base)
	{

		// Private Properties

		this._standardOffset = 0;
		this._serializedTimeZone = null;

		this._isConstant = false;
		this._offsetList = null;
		this._timeList = null;
		this._indexList = null;

		// Constructor

		this.constructor = function(serializedTimeZone)
		{
			if (serializedTimeZone == null)
				throw new Error("Parameter serializedTimeZone must be non-null.");
			if (typeof serializedTimeZone !== "string")
				throw new Error("Parameter serializedTimeZone must be a string.");

			this._serializedTimeZone = serializedTimeZone;

			this._offsetList = [];
			this._timeList = [];
			this._indexList = [];

			this._parseSerializedTimeZone(serializedTimeZone);
		};

		// Public Methods

		this.getSerializedTimeZone = function()
		{
			return this._serializedTimeZone;
		};

		this.getStandardOffset = function()
		{
			return this._standardOffset;
		};

		this.getOffset = function(time)
		{
			if (this._isConstant)
				return this._standardOffset;

			var offsetList = this._offsetList;
			var numOffsets = offsetList.length;
			if (numOffsets == 0)
				return 0;

			if (numOffsets == 1)
				return offsetList[0];

			var timeList = this._timeList;
			var numTimes = timeList.length;
			if (numTimes == 0)
				return 0;

			var timeIndex;
			if (numTimes == 1)
			{
				timeIndex = 0;
			}
			else
			{
				timeIndex = ArrayUtils.binarySearch(timeList, time);
				if (timeIndex < -1)
					timeIndex = -timeIndex - 2;
				else if (timeIndex == -1)
					timeIndex = 0;
			}

			var offsetIndex = this._indexList[timeIndex];
			return offsetList[offsetIndex];
		};

		// Private Methods

		this._parseSerializedTimeZone = function(serializedTimeZone)
		{
			// ### SERIALIZED TIMEZONE FORMAT 1.0
			// Y-25200 YW 50 44 54
			// Y-28800 NW 50 53 54
			// Y-25200 YW 50 57 54
			// Y-25200 YG 50 50 54
			// @-1633269600 0
			// @-1615129200 1
			// @-1601820000 0
			// @-1583679600 1

			// ### SERIALIZED TIMEZONE FORMAT 1.0
			// C0
			// Y0 NW 47 4D 54

			if (!serializedTimeZone)
				return;

			var entries = serializedTimeZone.split(";");
			var entry;
			for (var i = 0, l = entries.length; i < l; i++)
			{
				entry = entries[i];
				if (entry)
				{
					switch (entry.charAt(0))
					{
						case "C":
							if (this._parseC(entry.substring(1, entry.length)))
								return;
							break;
						case "Y":
							this._parseY(entry.substring(1, entry.length));
							break;
						case "@":
							this._parseAt(entry.substring(1, entry.length));
							break;
					}
				}
			}

			this._standardOffset = this.getOffset(0);
		};

		this._parseC = function(entry)
		{
			// 0

			if (!entry)
				return false;

			var time = Number(entry);
			if (isNaN(time))
				return false;

			this._standardOffset = time;
			this._isConstant = true;

			return true;
		};

		this._parseY = function(entry)
		{
			// -25200 YW 50 44 54

			if (!entry)
				return;

			var elements = entry.split(" ");
			if (elements.length < 1)
				return;

			var element = elements[0];
			if (!element)
				return;

			var offset = Number(element);
			if (isNaN(offset))
				return;

			this._offsetList.push(offset);
		};

		this._parseAt = function(entry)
		{
			// -1633269600 0

			if (!entry)
				return;

			var elements = entry.split(" ");
			if (elements.length < 2)
				return;

			var element = elements[0];
			if (!element)
				return;

			var time = Number(element);
			if (isNaN(time))
				return;

			element = elements[1];
			if (!element)
				return;

			var index = Number(element);
			if (isNaN(index))
				return;

			index = Math.floor(index);
			if ((index < 0) || (index >= this._offsetList.length))
				return;

			this._timeList.push(time);
			this._indexList.push(index);
		};

	});

});

define('splunk/charting/Timeline',['require','jquery','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/ClickDragRangeMarker','splunk/charting/CursorMarker','splunk/charting/GridLines','splunk/charting/Histogram','splunk/charting/LogScale','splunk/charting/NumericAxisLabels','splunk/charting/TimeAxisLabels','splunk/charting/Tooltip','splunk/events/GenericEventData','splunk/time/DateTime','splunk/time/SimpleTimeZone','splunk/time/SplunkTimeZone','splunk/time/TimeUtils','splunk/time/TimeZones','splunk/viz/GraphicsVizBase'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var Event = require("jgatt").events.Event;
	var Matrix = require("jgatt").geom.Matrix;
	var Point = require("jgatt").geom.Point;
	var Rectangle = require("jgatt").geom.Rectangle;
	var ColorUtils = require("jgatt").graphics.ColorUtils;
	var GradientFillBrush = require("jgatt").graphics.brushes.GradientFillBrush;
	var SolidStrokeBrush = require("jgatt").graphics.brushes.SolidStrokeBrush;
	var GroupTween = require("jgatt").motion.GroupTween;
	var PropertyTween = require("jgatt").motion.PropertyTween;
	var TweenRunner = require("jgatt").motion.TweenRunner;
	var CubicEaser = require("jgatt").motion.easers.CubicEaser;
	var EaseDirection = require("jgatt").motion.easers.EaseDirection;
	var Property = require("jgatt").properties.Property;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var ClickDragRangeMarker = require("splunk/charting/ClickDragRangeMarker");
	var CursorMarker = require("splunk/charting/CursorMarker");
	var GridLines = require("splunk/charting/GridLines");
	var Histogram = require("splunk/charting/Histogram");
	var LogScale = require("splunk/charting/LogScale");
	var NumericAxisLabels = require("splunk/charting/NumericAxisLabels");
	var TimeAxisLabels = require("splunk/charting/TimeAxisLabels");
	var Tooltip = require("splunk/charting/Tooltip");
	var GenericEventData = require("splunk/events/GenericEventData");
	var DateTime = require("splunk/time/DateTime");
	var SimpleTimeZone = require("splunk/time/SimpleTimeZone");
	var SplunkTimeZone = require("splunk/time/SplunkTimeZone");
	var TimeUtils = require("splunk/time/TimeUtils");
	var TimeZones = require("splunk/time/TimeZones");
	var GraphicsVizBase = require("splunk/viz/GraphicsVizBase");

	return jg_extend(GraphicsVizBase, function(Timeline, base)
	{

		// Public Passes

		this.dispatchUpdatedPass = new ValidatePass("dispatchUpdated", 3);

		// Public Events

		this.updated = new Event("updated", GenericEventData);
		this.viewChanged = new ChainedEvent("viewChanged", this.changed);
		this.selectionChanged = new ChainedEvent("selectionChanged", this.changed);
		this.chartDoubleClicked = new Event("chartDoubleClicked", GenericEventData);

		// Public Properties

		this.timeZone = new Property("timeZone", String, null)
			.setter(function(value)
			{
				this._timeZone = value ? new SplunkTimeZone(value) : TimeZones.LOCAL;
				this._axisLabelsX.set("timeZone", this._timeZone);
				this._rangeMarker.invalidate("updateRangePass");
				this._cursorMarker.invalidate("renderGraphicsPass");
			});

		this.jobID = new Property("jobID", String)
			.getter(function()
			{
				return this._jobID;
			})
			.setter(function(value)
			{
				this._jobID = value;
			});

		this.bucketCount = new Property("bucketCount", Number)
			.getter(function()
			{
				return this._bucketCount;
			})
			.setter(function(value)
			{
				this._bucketCount = value;
			});

		this.viewMinimum = new Property("viewMinimum", Number, null, true)
			.getter(function()
			{
				return this._viewMinimum;
			});

		this.viewMaximum = new Property("viewMaximum", Number, null, true)
			.getter(function()
			{
				return this._viewMaximum;
			});

		this.selectionMinimum = new Property("selectionMinimum", Number)
			.getter(function()
			{
				return this._selectionMinimum;
			})
			.setter(function(value)
			{
				if (this._rangeMarker.isDragging())
					return;

				this._rangeMarker.set("minimum", value);
				this._updateSelectionRange(false);
			});

		this.selectionMaximum = new Property("selectionMaximum", Number)
			.getter(function()
			{
				return this._selectionMaximum;
			})
			.setter(function(value)
			{
				if (this._rangeMarker.isDragging())
					return;

				this._rangeMarker.set("maximum", value);
				this._updateSelectionRange(false);
			});

		this.actualSelectionMinimum = new Property("actualSelectionMinimum", Number, null, true)
			.getter(function()
			{
				return this._actualSelectionMinimum;
			});

		this.actualSelectionMaximum = new Property("actualSelectionMaximum", Number, null, true)
			.getter(function()
			{
				return this._actualSelectionMaximum;
			});

		this.timelineData = new Property("timelineData", Object, null, true)
			.getter(function()
			{
				return this._cloneTimelineData(this._timelineData);
			});

		this.timelineScale = new Property("timelineScale", Object, null, true)
			.getter(function()
			{
				var timelineData = this._timelineData;
				if (!timelineData)
					return null;

				var buckets = timelineData.buckets;
				if (buckets.length == 0)
					return null;

				var bucket = buckets[0];
				var duration = TimeUtils.subtractDates(bucket.latestTime, bucket.earliestTime);
				if (duration.years > 0)
					return { value:duration.years, unit:"year" };
				if (duration.months > 0)
					return { value:duration.months, unit:"month" };
				if (duration.days > 0)
					return { value:duration.days, unit:"day" };
				if (duration.hours > 0)
					return { value:duration.hours, unit:"hour" };
				if (duration.minutes > 0)
					return { value:duration.minutes, unit:"minute" };
				if (duration.seconds > 0)
					return { value:duration.seconds, unit:"second" };
				return null;
			});

		this.enableChartClick = new Property("enableChartClick", Boolean)
			.getter(function()
			{
				return this._enableChartClick;
			})
			.setter(function(value)
			{
				this._enableChartClick = value;
			});

		this.scaleY = new Property("scaleY", String)
			.getter(function()
			{
				return this._scaleY;
			})
			.setter(function(value)
			{
				value = (value == "log") ? "log" : "linear";
				if (this._scaleY === value)
					return;

				this._scaleY = value;
				this._histogram.set("scaleY", (value == "log") ? new LogScale() : null);
			});

		this.foregroundColor = new Property("foregroundColor", Number)
			.getter(function()
			{
				return this._foregroundColor;
			})
			.setter(function(value)
			{
				value = !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
				if (this._foregroundColor === value)
					return;

				this._foregroundColor = value;
				this._axisLabelsX.set("foregroundColor", value);
				this._axisLabelsY1.set("foregroundColor", value);
				this._axisLabelsY2.set("foregroundColor", value);
				this._gridLines.set("foregroundColor", value);
				this._cursorMarker.set("foregroundColor", value);
				this._rangeMarker.set("foregroundColor", value);

				this.invalidate("renderGraphicsPass");
			});

		this.seriesColor = new Property("seriesColor", Number)
			.getter(function()
			{
				return this._seriesColor;
			})
			.setter(function(value)
			{
				value = !isNaN(value) ? Math.min(Math.max(Math.floor(value), 0x000000), 0xFFFFFF) : 0x000000;
				if (this._seriesColor === value)
					return;

				this._seriesColor = value;
				var brush = this._histogram.get("brush");
				brush.set("colors", [ value, ColorUtils.brightness(value, -0.15) ]);
				this._histogram.set("brush", brush);
			});

		this.minimalMode = new Property("minimalMode", Boolean, false)
			.setter(function(value)
			{
				this.invalidate("renderGraphicsPass");
			});

		this.externalInterface = null;

		// Private Properties

		this._hostPath = null;
		this._basePath = null;

		this._timeZone = TimeZones.LOCAL;
		this._jobID = null;
		this._bucketCount = 1000;
		this._viewMinimum = NaN;
		this._viewMaximum = NaN;
		this._selectionMinimum = NaN;
		this._selectionMaximum = NaN;
		this._actualSelectionMinimum = NaN;
		this._actualSelectionMaximum = NaN;
		this._timelineData = null;
		this._enableChartClick = false;
		this._scaleY = "linear";
		this._foregroundColor = 0x000000;
		this._seriesColor = 0x73A550;

		this._updateCount = 0;
		this._updatingCount = 0;
		this._updatedCount = 0;
		this._dataLoading = false;
		this._loadJobID = null;

		this._lineBrush = null;
		this._histogram = null;
		this._axisLabelsX = null;
		this._axisLabelsY1 = null;
		this._axisLabelsY2 = null;
		this._gridLines = null;
		this._cursorMarker = null;
		this._rangeMarker = null;
		this._tooltip = null;

		this._prevDate = null;
		this._prevJobID = null;
		this._prevMouseGlobal = null;
		this._tooltipData = null;
		this._updateSizeInterval = 0;

		// Constructor

		this.constructor = function(hostPath, basePath)
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-charting-Timeline");

			this.setStyle({ position: "relative", width: "100%", height: "100%", overflow: "hidden" });

			hostPath = (typeof hostPath === "string") ? hostPath : null;
			if (!hostPath)
			{
				var url = location.href;
				var colonIndex = url.indexOf("://");
				var slashIndex = url.indexOf("/", colonIndex + 4);
				hostPath = url.substring(0, slashIndex);
			}
			this._hostPath = hostPath;

			basePath = (typeof basePath === "string") ? basePath : null;
			if (basePath == null)
				basePath = "/splunkd";
			this._basePath = basePath;

			this.updateSize = FunctionUtils.bind(this.updateSize, this);
			this._histogram_containedRangeXChanged = FunctionUtils.bind(this._histogram_containedRangeXChanged, this);
			this._histogram_containedRangeYChanged = FunctionUtils.bind(this._histogram_containedRangeYChanged, this);
			this._rangeMarker_dragComplete = FunctionUtils.bind(this._rangeMarker_dragComplete, this);
			this._rangeMarker_labelOpacity_changed = FunctionUtils.bind(this._rangeMarker_labelOpacity_changed, this);
			this._child_invalidated = FunctionUtils.bind(this._child_invalidated, this);
			this._self_mouseOver = FunctionUtils.bind(this._self_mouseOver, this);
			this._self_mouseOut = FunctionUtils.bind(this._self_mouseOut, this);
			this._self_mouseMove = FunctionUtils.bind(this._self_mouseMove, this);
			this._self_doubleClick = FunctionUtils.bind(this._self_doubleClick, this);
			this._data_success = FunctionUtils.bind(this._data_success, this);
			this._data_error = FunctionUtils.bind(this._data_error, this);

			this.externalInterface = {};

			var color = this._seriesColor;
			var colorDark = ColorUtils.brightness(color, -0.15);
			var brush = new GradientFillBrush("linear", [ color, colorDark ], [ 1, 1 ], [ 0, 1 ]);
			brush.set("tileTransform", new Matrix(0, 1, -1, 0));

			this._lineBrush = new SolidStrokeBrush(this._foregroundColor, 0.1, 1, "square");

			this._histogram = new Histogram();
			this._histogram.renderGraphicsPriority = 1;
			this._histogram.set("brush", brush);
			this._histogram.set("minimumX", this._histogram.get("actualMinimumX"));
			this._histogram.set("maximumX", this._histogram.get("actualMaximumX"));
			this._histogram.set("minimumY", this._histogram.get("actualMinimumY"));
			this._histogram.set("maximumY", this._histogram.get("actualMaximumY"));
			this._histogram.addEventListener("containedRangeXChanged", this._histogram_containedRangeXChanged);
			this._histogram.addEventListener("containedRangeYChanged", this._histogram_containedRangeYChanged);

			this._axisLabelsX = new TimeAxisLabels();
			this._axisLabelsX.renderGraphicsPriority = 1;
			this._axisLabelsX.set("histogram", this._histogram);
			this._axisLabelsX.set("labelFormat", FunctionUtils.bind(this._timeAxisFormat, this));
			this._axisLabelsX.addEventListener("invalidated", this._child_invalidated);

			this._axisLabelsY1 = new NumericAxisLabels();
			this._axisLabelsY1.renderGraphicsPriority = 1;
			this._axisLabelsY1.set("histogram", this._histogram);
			this._axisLabelsY1.set("labelFormat", FunctionUtils.bind(this._numericAxisFormat, this));
			this._axisLabelsY1.addEventListener("invalidated", this._child_invalidated);

			this._axisLabelsY2 = new NumericAxisLabels();
			this._axisLabelsY2.renderGraphicsPriority = 1;
			this._axisLabelsY2.set("histogram", this._histogram);
			this._axisLabelsY2.set("placement", "right");
			this._axisLabelsY2.set("labelFormat", FunctionUtils.bind(this._numericAxisFormat, this));
			this._axisLabelsY2.addEventListener("invalidated", this._child_invalidated);

			this._gridLines = new GridLines();
			this._gridLines.renderGraphicsPriority = 1;
			this._gridLines.set("axisLabels", this._axisLabelsY1);

			this._cursorMarker = new CursorMarker();
			this._cursorMarker.renderGraphicsPriority = 1;
			this._cursorMarker.set("histogram", this._histogram);
			this._cursorMarker.set("valueSnap", FunctionUtils.bind(this._cursorValueSnap, this));
			this._cursorMarker.set("valueFormat", FunctionUtils.bind(this._cursorValueFormat, this));

			this._rangeMarker = new ClickDragRangeMarker();
			this._rangeMarker.renderGraphicsPriority = 1;
			this._rangeMarker.set("histogram", this._histogram);
			this._rangeMarker.set("minimumSnap", FunctionUtils.bind(this._minimumSnap, this));
			this._rangeMarker.set("maximumSnap", FunctionUtils.bind(this._maximumSnap, this));
			this._rangeMarker.set("minimumFormat", FunctionUtils.bind(this._minimumFormat, this));
			this._rangeMarker.set("maximumFormat", FunctionUtils.bind(this._maximumFormat, this));
			this._rangeMarker.set("rangeFormat", FunctionUtils.bind(this._rangeFormat, this));
			this._rangeMarker.addEventListener("dragComplete", this._rangeMarker_dragComplete);
			this._rangeMarker.addEventListener("labelOpacity.changed", this._rangeMarker_labelOpacity_changed);

			this._tooltip = new Tooltip();
			this._tooltip.renderGraphicsPriority = 1;

			this.$element.bind("mouseover", this._self_mouseOver);
			this.$element.bind("mouseout", this._self_mouseOut);
			this.$element.bind("mousemove", this._self_mouseMove);
			this.$element.bind("dblclick", this._self_doubleClick);

			this._gridLines.appendTo(this);
			this._histogram.appendTo(this);
			this._axisLabelsX.appendTo(this);
			this._axisLabelsY1.appendTo(this);
			this._axisLabelsY2.appendTo(this);
			this._cursorMarker.appendTo(this);
			this._rangeMarker.appendTo(this);
			this._tooltip.appendTo(this);

			this._updateViewRange();
			this._updateCountRange();
		};

		// Public Methods

		this.dispatchUpdated = function()
		{
			this.validatePreceding("dispatchUpdatedPass");

			if (this.isValid("dispatchUpdatedPass"))
				return;

			this.setValid("dispatchUpdatedPass");

			this.dispatchEvent("updated", new GenericEventData({ updateCount: this._updatedCount }));
		};

		this.update = function()
		{
			this._updateCount++;
			this._update();
			return this._updateCount;
		};

		this.getSelectedBuckets = function()
		{
			if (!this._timelineData)
				return null;

			var buckets = this._timelineData.buckets;
			if (!buckets)
				return null;

			var selectedBuckets = new Array();

			var selectionMinimum = this._actualSelectionMinimum;
			var selectionMaximum = this._actualSelectionMaximum;
			var bucket;
			var bucketTime;

			for (var i = 0, l = buckets.length; i < l; i++)
			{
				bucket = buckets[i];

				bucketTime = bucket.earliestTime;
				if (!bucketTime || (bucketTime.getTime() < selectionMinimum))
					continue;

				bucketTime = bucket.latestTime;
				if (!bucketTime || (bucketTime.getTime() > selectionMaximum))
					continue;

				selectedBuckets.push(this._cloneTimelineData(bucket));
			}

			return selectedBuckets;
		};

		this.updateSize = function()
		{
			this.set("width", this.$element.width());
			this.set("height", this.$element.height());
		};

		this.dispose = function()
		{
			this._gridLines.dispose();
			this._histogram.dispose();
			this._axisLabelsX.dispose();
			this._axisLabelsY1.dispose();
			this._axisLabelsY2.dispose();
			this._cursorMarker.dispose();
			this._rangeMarker.dispose();
			this._tooltip.dispose();

			base.dispose.call(this);
		};

		// Protected Methods

		this.renderGraphicsOverride = function(graphics, width, height)
		{
			var minimalMode = this.getInternal("minimalMode");
			var minimalLineWidth = Math.round(width);

			var tl = this.localToGlobal(new Point(0, 0));
			var br = this.localToGlobal(new Point(width, height));

			this._axisLabelsX.setStyle({ visibility: (minimalMode ? "hidden" : "") });
			this._axisLabelsX.set("width", width);
			this._axisLabelsX.renderGraphics();
			height = minimalMode ? Math.max(height - 20, 0) : Math.max(height - this._axisLabelsX.get("height"), 0);

			this._axisLabelsY1.setStyle({ visibility: (minimalMode ? "hidden" : "") });
			this._axisLabelsY1.set("height", height);
			this._axisLabelsY1.renderGraphics();
			var x1 = minimalMode ? 20 : this._axisLabelsY1.get("width");

			this._axisLabelsY2.setStyle({ visibility: (minimalMode ? "hidden" : "") });
			this._axisLabelsY2.set("height", height);
			this._axisLabelsY2.renderGraphics();
			var x2 = minimalMode ? Math.max(x1, width - 20) : Math.max(x1, width - this._axisLabelsY2.get("width"));

			width = x2 - x1;

			this._axisLabelsX.set("x", x1);
			this._axisLabelsX.set("y", height);
			this._axisLabelsX.set("width", width);
			this._axisLabelsX.renderGraphics();

			this._axisLabelsY2.set("x", x2);

			this._histogram.set("x", x1);
			this._histogram.set("width", width);
			this._histogram.set("height", height);
			this._histogram.renderGraphics();

			this._gridLines.setStyle({ visibility: (minimalMode ? "hidden" : "") });
			this._gridLines.set("x", x1);
			this._gridLines.set("width", width);
			this._gridLines.set("height", height);
			this._gridLines.renderGraphics();

			this._cursorMarker.set("x", x1);
			this._cursorMarker.set("width", width);
			this._cursorMarker.set("height", height);
			this._cursorMarker.renderGraphics();

			this._rangeMarker.set("x", x1);
			this._rangeMarker.set("width", width);
			this._rangeMarker.set("height", height);
			this._rangeMarker.renderGraphics();

			this._tooltip.set("viewBounds", new Rectangle(tl.x, tl.y, br.x - tl.x, br.y - tl.y));

			graphics.clear();
			if (minimalMode)
			{
				x1 = Math.round(x1);
				x2 = Math.round(x2);
				height = Math.round(height);

				var lineBrush = this._lineBrush;
				var numLines = Math.round(height / 5);
				var y;

				lineBrush.set("color", this._foregroundColor);
				lineBrush.beginBrush(graphics);

				// vertical lines
				lineBrush.moveTo(x1, 0);
				lineBrush.lineTo(x1, height);
				lineBrush.moveTo(x2, 0);
				lineBrush.lineTo(x2, height);

				// horizontal lines
				for (var i = 0; i <= numLines; i++)
				{
					y = Math.round(height * (i / numLines));
					lineBrush.moveTo(0, y);
					lineBrush.lineTo(minimalLineWidth, y);
				}

				lineBrush.endBrush();
			}

			this._updateTooltip();
		};

		this.onAppend = function()
		{
			this._updateSizeInterval = setInterval(this.updateSize, 50);

			this.updateSize();
		};

		this.onRemove = function()
		{
			clearInterval(this._updateSizeInterval);
		};

		// Private Methods

		this._update = function()
		{
			if (this._dataLoading)
				return;

			this._updatingCount = this._updateCount;
			this._loadJobID = this._jobID;
			if (!this._loadJobID)
			{
				this._updateComplete(null);
				return;
			}

			this._dataLoading = true;
			$.ajax(
			{
				type: "GET",
				url: this._hostPath + this._basePath + "/search/jobs/" + this._loadJobID + "/timeline?offset=0&count=" + this._bucketCount,
				dataType: "xml",
				success: this._data_success,
				error: this._data_error
			});
		};

		this._updateComplete = function(data)
		{
			this._updateTimelineData(data);

			this._dataLoading = false;

			this._updatedCount = this._updatingCount;

			this.invalidate("dispatchUpdatedPass");

			if (this._updatingCount < this._updateCount)
				this._update();
		};

		this._updateTimelineData = function(timelineData)
		{
			this._timelineData = timelineData;

			var jobIDChanged = (this._loadJobID != this._prevJobID);
			this._prevJobID = this._loadJobID;

			if (jobIDChanged)
			{
				this._rangeMarker.set("minimum", NaN);
				this._rangeMarker.set("maximum", NaN);
			}

			this._rangeMarker.invalidate("updateRangePass");

			this._cursorMarker.set("value", (timelineData && (timelineData.buckets.length > 0) && timelineData.cursorTime) ? timelineData.cursorTime.getTime() : NaN);
			this._cursorMarker.invalidate("renderGraphicsPass");

			var buckets = timelineData ? timelineData.buckets.concat() : null;
			if (buckets)
			{
				var bucket;
				for (var i = 0, l = buckets.length; i < l; i++)
				{
					bucket = buckets[i];
					buckets[i] = { x1: bucket.earliestTime, x2: bucket.latestTime, y: bucket.eventCount };
				}
			}
			this._histogram.set("data", buckets);

			this.invalidate("renderGraphicsPass");
			this.validate("renderGraphicsPass");

			this._updateViewRange();
			this._updateSelectionRange();
		};

		this._updateViewRange = function()
		{
			if ((!this._timelineData || (this._timelineData.buckets.length == 0)) && !isNaN(this._viewMinimum))
				return;

			var minimum = this._histogram.get("containedMinimumX");
			var maximum = this._histogram.get("containedMaximumX");

			if ((minimum == this._viewMinimum) && (maximum == this._viewMaximum))
				return;

			this._viewMinimum = minimum;
			this._viewMaximum = maximum;

			this.dispatchEvent("viewChanged", new GenericEventData({ viewMinimum: this._viewMinimum, viewMaximum: this._viewMaximum }));

			var tweenMinimum = new PropertyTween(this._histogram, "minimumX", this._histogram.get("actualMinimumX"), this._histogram.get("containedMinimumX"));
			var tweenMaximum = new PropertyTween(this._histogram, "maximumX", this._histogram.get("actualMaximumX"), this._histogram.get("containedMaximumX"));
			var tween = new GroupTween([ tweenMinimum, tweenMaximum ], new CubicEaser(EaseDirection.OUT));
			TweenRunner.start(tween, 0.5);

			this._updateSelectionRange();
		};

		this._updateCountRange = function()
		{
			if (!this._timelineData || (this._timelineData.eventCount == 0))
				return;

			var tweenMinimum = new PropertyTween(this._histogram, "minimumY", this._histogram.get("actualMinimumY"), this._histogram.get("containedMinimumY"));
			var tweenMaximum = new PropertyTween(this._histogram, "maximumY", this._histogram.get("actualMaximumY"), this._histogram.get("containedMaximumY"));
			var tween = new GroupTween([ tweenMinimum, tweenMaximum ], new CubicEaser(EaseDirection.OUT));
			TweenRunner.start(tween, 0.5);
		};

		this._updateSelectionRange = function(dispatchEvent)
		{
			if (this._rangeMarker.isDragging())
				return;

			if (dispatchEvent === undefined)
				dispatchEvent = true;

			var minimum = this._rangeMarker.get("minimum");
			var maximum = this._rangeMarker.get("maximum");
			var actualMinimum = isNaN(minimum) ? this._viewMinimum : this._rangeMarker.get("actualMinimum");
			var actualMaximum = isNaN(maximum) ? this._viewMaximum : this._rangeMarker.get("actualMaximum");

			var minimumChanged = isNaN(minimum) ? !isNaN(this._selectionMinimum) : (isNaN(this._selectionMinimum) || (actualMinimum != this._actualSelectionMinimum));
			var maximumChanged = isNaN(maximum) ? !isNaN(this._selectionMaximum) : (isNaN(this._selectionMaximum) || (actualMaximum != this._actualSelectionMaximum));

			this._selectionMinimum = minimum;
			this._selectionMaximum = maximum;
			this._actualSelectionMinimum = actualMinimum;
			this._actualSelectionMaximum = actualMaximum;

			if (dispatchEvent && (minimumChanged || maximumChanged))
			{
				minimum = isNaN(minimum) ? NaN : actualMinimum;
				maximum = isNaN(maximum) ? NaN : actualMaximum;
				this.dispatchEvent("selectionChanged", new GenericEventData({ selectionMinimum: minimum, selectionMaximum: maximum }));
			}
		};

		this._updateTooltip = function(mouseGlobal)
		{
			if (mouseGlobal == null)
				mouseGlobal = this._prevMouseGlobal ? this._prevMouseGlobal : new Point();
			else
				this._prevMouseGlobal = mouseGlobal;

			var mouseLocal = this._histogram.globalToLocal(mouseGlobal);
			var bucketData = this._rangeMarker.isDragging() ? null : this._histogram.getDataUnderPoint(mouseLocal.x, mouseLocal.y);
			if (bucketData && bucketData.bounds)
			{
				var bounds = bucketData.bounds;
				var boundsTL = this._histogram.localToGlobal(new Point(bounds.x, bounds.y));
				var boundsBR = this._histogram.localToGlobal(new Point(bounds.x + bounds.width, bounds.y + bounds.height));

				this._tooltip.set("targetBounds", new Rectangle(boundsTL.x, boundsTL.y, boundsBR.x - boundsTL.x, boundsBR.y - boundsTL.y));

				if (this._tooltipData && (this._tooltipData.data === bucketData.data))
					return;

				this._tooltipData = bucketData;

				this._tooltip.set("value", this._tipFormat(bucketData.data));
				this._tooltip.show();

				if (this._enableChartClick)
					this.$element.css({ cursor: "pointer" });
			}
			else
			{
				if (!this._tooltipData)
					return;

				this._tooltipData = null;

				this._tooltip.set("value", null);
				this._tooltip.hide();

				this.$element.css({ cursor: "auto" });
			}
		};

		this._parseTimelineData = function(node)
		{
			if (!node)
				return null;

			var attributes = node.attributes;
			var attribute;
			var childNodes = node.childNodes;
			var childNode;
			var i;
			var l;

			var earliestTime = null;
			var latestTime = null;
			var cursorTime = null;
			var duration = NaN;
			var earliestOffset = NaN;
			var latestOffset = NaN;
			var eventCount = 0;
			var eventAvailableCount = 0;
			var isComplete = false;
			var buckets = [];

			for (i = 0, l = attributes.length; i < l; i++)
			{
				attribute = attributes[i];
				if (attribute.nodeType == 2)
				{
					switch (attribute.nodeName.toLowerCase())
					{
						case "t":
							earliestTime = new DateTime(Number(attribute.nodeValue));
							break;
						case "cursor":
							cursorTime = new DateTime(Number(attribute.nodeValue));
							break;
						case "d":
							duration = Number(attribute.nodeValue);
							break;
						case "etz":
							earliestOffset = Number(attribute.nodeValue);
							break;
						case "ltz":
							latestOffset = Number(attribute.nodeValue);
							break;
						case "c":
							eventCount = Number(attribute.nodeValue);
							break;
						case "a":
							eventAvailableCount = Number(attribute.nodeValue);
							break;
						case "f":
							isComplete = (attribute.nodeValue == "1");
							break;
					}
				}
			}

			var bucketEventCount = 0;
			var bucket;
			for (i = 0, l = childNodes.length; i < l; i++)
			{
				childNode = childNodes[i];
				if (childNode.nodeType == 1)
				{
					switch (childNode.nodeName.toLowerCase())
					{
						case "bucket":
							bucket = this._parseTimelineData(childNode);
							bucketEventCount += bucket.eventCount;
							buckets.push(bucket);
							break;
					}
				}
			}
			eventCount = Math.max(eventCount, bucketEventCount);

			if (isNaN(duration))
				duration = 0;
			if (isNaN(earliestOffset))
				earliestOffset = 0;
			if (isNaN(latestOffset))
				latestOffset = 0;

			if (earliestTime)
				latestTime = new DateTime(earliestTime.getTime() + duration);

			if (buckets.length > 0)
			{
				var earliestBucketTime = buckets[0].earliestTime;
				if (earliestBucketTime && (!earliestTime || (earliestBucketTime.getTime() < earliestTime.getTime())))
					earliestTime = earliestBucketTime.clone();

				var latestBucketTime = buckets[buckets.length - 1].latestTime;
				if (latestBucketTime && (!latestTime || (latestBucketTime.getTime() > latestTime.getTime())))
					latestTime = latestBucketTime.clone();

				if (earliestTime && latestTime)
					duration = latestTime.getTime() - earliestTime.getTime();
			}

			if (earliestTime)
				earliestTime = earliestTime.toTimeZone(new SimpleTimeZone(earliestOffset));
			if (latestTime)
				latestTime = latestTime.toTimeZone(new SimpleTimeZone(latestOffset));
			if (cursorTime)
				cursorTime = cursorTime.toTimeZone(new SimpleTimeZone(earliestOffset));

			var data = {};
			data.earliestTime = earliestTime;
			data.latestTime = latestTime;
			data.cursorTime = cursorTime;
			data.duration = duration;
			data.eventCount = eventCount;
			data.eventAvailableCount = eventAvailableCount;
			data.isComplete = isComplete;
			data.buckets = buckets;
			return data;
		};

		this._cloneTimelineData = function(timelineData)
		{
			if (!timelineData)
				return null;

			var clonedData = {};
			clonedData.earliestTime = timelineData.earliestTime ? timelineData.earliestTime.getTime() : null;
			clonedData.earliestOffset = timelineData.earliestTime ? timelineData.earliestTime.getTimeZoneOffset() : 0;
			clonedData.latestTime = timelineData.latestTime ? timelineData.latestTime.getTime() : null;
			clonedData.latestOffset = timelineData.latestTime ? timelineData.latestTime.getTimeZoneOffset() : 0;
			clonedData.cursorTime = timelineData.cursorTime ? timelineData.cursorTime.getTime() : null;
			clonedData.duration = timelineData.duration;
			clonedData.eventCount = timelineData.eventCount;
			clonedData.eventAvailableCount = timelineData.eventAvailableCount;
			clonedData.isComplete = timelineData.isComplete;

			var buckets = timelineData.buckets;
			var numBuckets = buckets.length;
			var parsedBuckets = clonedData.buckets = [];
			for (var i = 0; i < numBuckets; i++)
				parsedBuckets.push(this._cloneTimelineData(buckets[i]));

			return clonedData;
		};

		this._cursorValueSnap = function(value)
		{
			return this._ceilToBucket(value);
		};

		this._minimumSnap = function(value, floor)
		{
			return floor ? this._floorToBucket(value) : this._roundToBucket(value);
		};

		this._maximumSnap = function(value, ceil)
		{
			return ceil ? this._ceilToBucket(value) : this._roundToBucket(value);
		};

		this._floorToBucket = function(value)
		{
			var buckets = this._histogram.get("data");
			if (buckets)
			{
				var bucket;
				var bucketTime = null;
				for (var i = buckets.length - 1; i >= 0; i--)
				{
					bucket = buckets[i];
					bucketTime = bucket.x1;
					if (bucketTime && (bucketTime.getTime() <= value))
						break;
				}
				if (bucketTime && !isNaN(bucketTime.getTime()))
					value = bucketTime.getTime();
			}
			return value;
		};

		this._ceilToBucket = function(value)
		{
			var buckets = this._histogram.get("data");
			if (buckets)
			{
				var bucket;
				var bucketTime = null;
				for (var i = 0, l = buckets.length; i < l; i++)
				{
					bucket = buckets[i];
					bucketTime = bucket.x2;
					if (bucketTime && (bucketTime.getTime() >= value))
						break;
				}
				if (bucketTime && !isNaN(bucketTime.getTime()))
					value = bucketTime.getTime();
			}
			return value;
		};

		this._roundToBucket = function(value)
		{
			var buckets = this._histogram.get("data");
			if (buckets)
			{
				var bestTime = value;
				var bestDiff = Infinity;
				var bucket;
				var bucketTime = null;
				var diff;
				for (var i = 0, l = buckets.length; i < l; i++)
				{
					bucket = buckets[i];
					bucketTime = bucket.x1 ? bucket.x1.getTime() : NaN;
					if (!isNaN(bucketTime))
					{
						diff = Math.abs(bucketTime - value);
						if (diff < bestDiff)
						{
							bestTime = bucketTime;
							bestDiff = diff;
						}
					}
					bucketTime = bucket.x2 ? bucket.x2.getTime() : NaN;
					if (!isNaN(bucketTime))
					{
						diff = Math.abs(bucketTime - value);
						if (diff < bestDiff)
						{
							bestTime = bucketTime;
							bestDiff = diff;
						}
					}
				}
				value = bestTime;
			}
			return value;
		};

		this._timeAxisFormat = function(date)
		{
			if (!date)
				return "";

			var dateString = "";

			var majorUnit = this._axisLabelsX.get("actualUnit");

			var resYears = 0;
			var resMonths = 1;
			var resDays = 2;
			var resHours = 3;
			var resMinutes = 4;
			var resSeconds = 5;
			var resSubSeconds = 6;

			var resMin;
			var resMax;

			var prevDate = this._prevDate;

			if (!prevDate || (prevDate.getTime() > date.getTime()) || (prevDate.getYear() != date.getYear()))
				resMin = resYears;
			else if (prevDate.getMonth() != date.getMonth())
				resMin = resMonths;
			else if (prevDate.getDay() != date.getDay())
				resMin = resDays;
			else
				resMin = resHours;

			this._prevDate = date.clone();

			if ((majorUnit.seconds % 1) > 0)
				resMax = resSubSeconds;
			else if ((majorUnit.seconds > 0) || ((majorUnit.minutes % 1) > 0))
				resMax = resSeconds;
			else if ((majorUnit.minutes > 0) || ((majorUnit.hours % 1) > 0))
				resMax = resMinutes;
			else if ((majorUnit.hours > 0) || ((majorUnit.days % 1) > 0))
				resMax = resHours;
			else if ((majorUnit.days > 0) || ((majorUnit.months % 1) > 0))
				resMax = resDays;
			else if ((majorUnit.months > 0) || ((majorUnit.years % 1) > 0))
				resMax = resMonths;
			else
				resMax = resYears;

			if (resMin > resMax)
				resMin = resMax;

			if (resMax == resSubSeconds)
				dateString += this._formatTime(date, "full");
			else if (resMax == resSeconds)
				dateString += this._formatTime(date, "medium");
			else if (resMax >= resHours)
				dateString += this._formatTime(date, "short");

			if ((resMax >= resDays) && (resMin <= resDays))
				dateString += (dateString ? "\n" : "") + this._formatDate(date, "EEE MMM d");
			else if ((resMax >= resMonths) && (resMin <= resMonths))
				dateString += (dateString ? "\n" : "") + this._formatDate(date, "MMMM");

			if ((resMax >= resYears) && (resMin <= resYears))
				dateString += (dateString ? "\n" : "") + this._formatDate(date, "yyyy");

			return dateString;
		};

		this._numericAxisFormat = function(num)
		{
			return this._formatNumber(num);
		};

		this._cursorValueFormat = function(value)
		{
			return this._minMaxFormat(value);
		};

		this._minimumFormat = function(value)
		{
			return this._minMaxFormat(this._minimumSnap(value));
		};

		this._maximumFormat = function(value)
		{
			return this._minMaxFormat(this._maximumSnap(value));
		};

		this._minMaxFormat = function(value)
		{
			var dateTime = new DateTime(value);
			dateTime = dateTime.toTimeZone(this._timeZone);

			var dateFormat = "medium";
			var timeFormat;
			if ((dateTime.getSeconds() % 1) >= 0.001)
				timeFormat = "full";
			else if (dateTime.getSeconds() > 0)
				timeFormat = "medium";
			else if (dateTime.getMinutes() > 0)
				timeFormat = "short";
			else if (dateTime.getHours() > 0)
				timeFormat = "short";
			else
				timeFormat = "none";

			if (timeFormat == "none")
				return this._formatDate(dateTime, dateFormat);
			else
				return this._formatDateTime(dateTime, dateFormat, timeFormat);
		};

		this._rangeFormat = function(minimum, maximum)
		{
			var minimumTime = new DateTime(this._minimumSnap(minimum));
			minimumTime = minimumTime.toTimeZone(this._timeZone);

			var maximumTime = new DateTime(this._maximumSnap(maximum));
			maximumTime = maximumTime.toTimeZone(this._timeZone);

			var duration = TimeUtils.subtractDates(maximumTime, minimumTime);

			var str = "";
			if (duration.years > 0)
				str += this._formatNumericString("%s year ", "%s years ", duration.years);
			if (duration.months > 0)
				str += this._formatNumericString("%s month ", "%s months ", duration.months);
			if (duration.days > 0)
				str += this._formatNumericString("%s day ", "%s days ", duration.days);
			if (duration.hours > 0)
				str += this._formatNumericString("%s hour ", "%s hours ", duration.hours);
			if (duration.minutes > 0)
				str += this._formatNumericString("%s minute ", "%s minutes ", duration.minutes);
			if (duration.seconds > 0)
				str += this._formatNumericString("%s second ", "%s seconds ", Math.floor(duration.seconds * 1000) / 1000);

			return str;
		};

		this._tipFormat = function(data)
		{
			if (!data)
				return "";
			return this._formatTooltip(data.x1, data.x2, data.y);
		};

		this._formatNumber = function(num)
		{
			num = NumberUtils.toPrecision(num, 12);

			var format = this.externalInterface.formatNumber;
			if (typeof format === "function")
				return format(num);

			return String(num);
		};

		this._formatNumericString = function(strSingular, strPlural, num)
		{
			num = NumberUtils.toPrecision(num, 12);

			var format = this.externalInterface.formatNumericString;
			if (typeof format === "function")
				return format(strSingular, strPlural, num);

			var str = (Math.abs(num) == 1) ? strSingular : strPlural;
			str = str.split("%s").join(String(num));
			return str;
		};

		this._formatDate = function(dateTime, dateFormat)
		{
			if (dateFormat === undefined)
				dateFormat = "full";

			var format = this.externalInterface.formatDate;
			if (typeof format === "function")
				return format(dateTime.getTime(), dateTime.getTimeZoneOffset(), dateFormat);

			return this._pad(dateTime.getYear(), 4) + "-" + this._pad(dateTime.getMonth(), 2) + "-" + this._pad(dateTime.getDay(), 2);
		};

		this._formatTime = function(dateTime, timeFormat)
		{
			if (timeFormat === undefined)
				timeFormat = "full";

			var format = this.externalInterface.formatTime;
			if (typeof format === "function")
				return format(dateTime.getTime(), dateTime.getTimeZoneOffset(), timeFormat);

			return this._pad(dateTime.getHours(), 2) + ":" + this._pad(dateTime.getMinutes(), 2) + ":" + this._pad(dateTime.getSeconds(), 2, 3);
		};

		this._formatDateTime = function(dateTime, dateFormat, timeFormat)
		{
			if (dateFormat === undefined)
				dateFormat = "full";
			if (timeFormat === undefined)
				timeFormat = "full";

			var format = this.externalInterface.formatDateTime;
			if (typeof format === "function")
				return format(dateTime.getTime(), dateTime.getTimeZoneOffset(), dateFormat, timeFormat);

			return this._pad(dateTime.getYear(), 4) + "-" + this._pad(dateTime.getMonth(), 2) + "-" + this._pad(dateTime.getDay(), 2) + " " + this._pad(dateTime.getHours(), 2) + ":" + this._pad(dateTime.getMinutes(), 2) + ":" + this._pad(dateTime.getSeconds(), 2, 3);
		};

		this._formatTooltip = function(earliestTime, latestTime, eventCount)
		{
			var format = this.externalInterface.formatTooltip;
			if (typeof format === "function")
				return format(earliestTime.getTime(), latestTime.getTime(), earliestTime.getTimeZoneOffset(), latestTime.getTimeZoneOffset(), eventCount);

			return eventCount + " events from " + earliestTime.toString() + " to " + latestTime.toString();
		};

		this._pad = function(value, digits, fractionDigits)
		{
			if (isNaN(value))
				return "NaN";
			if (value === Infinity)
				return "Infinity";
			if (value === -Infinity)
				return "-Infinity";

			if (digits === undefined)
				digits = 0;
			if (fractionDigits === undefined)
				fractionDigits = 0;

			var str = value.toFixed(20);

			var decimalIndex = str.indexOf(".");
			if (decimalIndex < 0)
				decimalIndex = str.length;
			else if (fractionDigits < 1)
				str = str.substring(0, decimalIndex);
			else
				str = str.substring(0, decimalIndex) + "." + str.substring(decimalIndex + 1, decimalIndex + fractionDigits + 1);

			for (var i = decimalIndex; i < digits; i++)
				str = "0" + str;

			return str;
		};

		this._histogram_containedRangeXChanged = function(e)
		{
			this._updateViewRange();
		};

		this._histogram_containedRangeYChanged = function(e)
		{
			this._updateCountRange();
		};

		this._rangeMarker_dragComplete = function(e)
		{
			this._updateSelectionRange();
		};

		this._rangeMarker_labelOpacity_changed = function(e)
		{
			this._cursorMarker.set("labelOpacity", 1 - e.newValue);
		};

		this._child_invalidated = function(e)
		{
			if (e.pass === this.renderGraphicsPass)
				this.invalidate(e.pass);
		};

		this._self_mouseOver = function(e)
		{
			this._updateTooltip(new Point(e.pageX, e.pageY));
		};

		this._self_mouseOut = function(e)
		{
			this._updateTooltip(new Point(e.pageX, e.pageY));
		};

		this._self_mouseMove = function(e)
		{
			this._updateTooltip(new Point(e.pageX, e.pageY));
		};

		this._self_doubleClick = function(e)
		{
			if (!this._enableChartClick)
				return;

			this._updateTooltip(new Point(e.pageX, e.pageY));

			var bucketData = this._tooltipData;
			if (!bucketData)
				return;

			var data = {};
			data.earliestTime = {};  // flash timeline sends empty objects (due to JABridge conversion of DateTime), so we will emulate
			data.latestTime = {};
			data.eventCount = bucketData.data.y;

			var fields = [ "earliestTime", "latestTime", "eventCount" ];

			this.dispatchEvent("chartDoubleClicked", new GenericEventData({ data: data, fields: fields, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
		};

		this._data_success = function(xml, msg, xhr)
		{
			this._updateComplete(this._parseTimelineData(xml ? xml.documentElement : null));
		};

		this._data_error = function(xhr, msg, error)
		{
			this._updateComplete(null);
		};

	});

});

define('views/shared/CanvasTimeline',['require','exports','module','jquery','underscore','swfobject','jquery.ui.resizable','splunk','splunk.i18n','splunk.util','splunk.logger','splunk.messenger','splunk.timerange','splunk.window','splunk.jabridge','views/Base','views/shared/delegates/Popdown','splunk/charting/Timeline'],function(require, exports, module) {

    var $ = require('jquery');
    var underscore = require('underscore');
    var swfobject = require('swfobject');
    var resizable = require('jquery.ui.resizable');
    var Splunk = require('splunk');
    var SplunkI18N = require('splunk.i18n');
    var _ = SplunkI18N._;
    var ungettext = SplunkI18N.ungettext;
    var SplunkUtil = require('splunk.util');
    var sprintf = SplunkUtil.sprintf;
    var SplunkLogger = require('splunk.logger');
    var SplunkMessenger = require('splunk.messenger');
    var SplunkTimeRange = require('splunk.timerange');
    var SplunkWindow = require('splunk.window');
    var SplunkJABridge = require('splunk.jabridge');
    var Base = require('views/Base');
    var Popdown = require('views/shared/delegates/Popdown');
    var ChartingTimeline = require('splunk/charting/Timeline');

    var _DEFAULT_PROPERTY_VALUES = {
        swfFile: "timeline.swf",
        width: "100%",
        height: "120px",
        enableResize: "true",
        maxBucketCount: "1000",
        minimized: "false",
        renderer: "auto",
        minimalMode: "true",
        minimalHeight: "55px"
    };

    var _PROPERTY_PREFIX = "display.prefs.timeline.";

    var Timeline = Base.extend({
        _CUSTOM_DATE_FORMATS: {
            "EEE MMM d": {
                "day_before_month": "EEE d MMM",
                "ja_JP": "EEE MMM d\u65e5",
                "ko_KR": "EEE MMM d\uc77c",
                "zh_CN": "EEE MMM d\u65e5",
                "zh_TW": "EEE MMM d\u65e5"
            },
            "MMMM": {
            },
            "yyyy": {
                "ja_JP": "yyyy\u5e74",
                "ko_KR": "yyyy\ub144",
                "zh_CN": "yyyy\u5e74",
                "zh_TW": "yyyy\u5e74"
            }
        },

        _isInitialized: false,
        _selectedEarliestTime: NaN,
        _selectedLatestTime: NaN,
        _renderSID: null,
        _renderStatusBuckets: null,
        _renderScanCount: null,
        _renderIsDone: null,

        moduleId: module.id,

        initialize: function() {
            Base.prototype.initialize.apply(this, arguments);
            this.model.searchJob.on("destroy error", this.render, this);
            this.model.searchJob.entry.content.on("change", this.render, this);

            this.on("selectionChanged", function(data){
                this.model.report.entry.content.set({
                    'display.events.timelineEarliestTime': !underscore.isNaN(data.earliestTime) ? data.earliestTime : "",
                    'display.events.timelineLatestTime': !underscore.isNaN(data.latestTime) ? data.latestTime : ""
                });
            }.bind(this));

            this.container = this.$el;
            this.moduleType = "Timeline";

            this.logger = SplunkLogger.getLogger("Timeline.js");

            // this lets us know if the SID has changed
            this._prevSID = null;

            // we keep track now of each render, to match it to the corresponding onDataUpdated event.
            this.updateId = -1;

            // used to communicate with PageStatus singleton about rendering in progress.
            this.renderMonitor = null;

            this.isEntireRangeSelected = true;

            // strings that timeline may ask to be localized
            _("Open as image");
            _("year");
            _("years");
            _("month");
            _("months");
            _("day");
            _("days");
            _("hour");
            _("hours");
            _("minute");
            _("minutes");
            _("second");
            _("seconds");

            this.renderTemplate();
        },

        renderTemplate: function() {
            var isMinimized = SplunkUtil.normalizeBoolean(this.getParam("minimized"));

            var context = {
                width: this.getParam("width"),
                height: this.getParam("height"),
                wrapperStyle: isMinimized ? "display:none;" : "",
                formatLabel: _("Format Timeline"),
                hiddenLabel: _("Hidden"),
                compactLabel: _("Compact"),
                fullLabel: _("Full"),
                linearLabel: _("Linear scale"),
                logLabel: _("Log scale"),
                zoomOutLabel: _("Zoom Out"),
                zoomInLabel: _("Zoom to Selection"),
                deselectLabel: _("Deselect")
            };

            this.container.html(underscore(this.template).template(context));
        },

        initTemplate: function() {
            this.zoomInLink = $("a.zoomIn",this.container).click(this.zoomIn.bind(this));
            this.zoomOutLink = $("a.zoomOut",this.container).click(this.zoomOut.bind(this));
            this.selectAllLink = $("a.selectAll",this.container).click(this.selectAll.bind(this));
            this.controlLinks = $(".controlLinks",this.container).click(this.controlsBackgroundClick.bind(this));

            this.children.popdown = new Popdown({el: this.$(".format-timeline"), attachDialogTo: 'body'});
            this.formatLinkHidden = $(".format-timeline-hidden a", this.container).click(this.minimizeFull.bind(this));
            this.formatLinkCompact = $(".format-timeline-compact a", this.container).click(this.maximizeCompact.bind(this));
            this.formatLinkFull = $(".format-timeline-full a", this.container).click(this.maximizeFull.bind(this));
            this.formatLinkLinear = $(".format-timeline-linear a", this.container).click(this.linScale.bind(this));
            this.formatLinkLog = $(".format-timeline-log a", this.container).click(this.logScale.bind(this));

            this.iconCheckView = $('<i class="icon-check"></i>');
            this.iconCheckScale = $('<i class="icon-check"></i>');

            // create message container
            $(".timelineContainer", this.container).append("<div class=\"messageContainer\"></div>");

            switch (this.getParam("renderer")) {
                case "canvas":
                    this.renderer = "canvas";
                    break;
                case "flash":
                    this.renderer = "flash";
                    break;
                default:
                    this.renderer = this._hasCanvas() ? "canvas" : "flash";
                    break;
            }

            switch (this.renderer) {
                case "canvas":
                    this._timeline = new Timeline.CanvasTimeline(this);
                    break;
                case "flash":
                    this._timeline = new Timeline.FlashTimeline(this);
                    break;
            }

            if (SplunkUtil.normalizeBoolean(this.getParam("minimized")))
                this.minimizeFull(false);
            else if (SplunkUtil.normalizeBoolean(this.getParam("minimalMode")))
                this.maximizeCompact(false);
            else
                this.maximizeFull(false);

            this.linScale();

            this._isInitialized = true;

            this.render();
        },

        render: function() {
            if (!this._isInitialized) {
                // Hacky way to wait until we're added to the document, since views/Base has no facilities for DOM setup/teardown.
                // We must be added to the document in order for Flash to render correctly.
                if (!this._initTemplateTimeout)
                    this._initTemplateTimeout = setTimeout(this.initTemplate.bind(this), 0);
                return this;
            }

            var model = this.model.searchJob;
            if (!model)
                return this;

            var sid = model.id;
            var statusBuckets = model.entry.content.get("statusBuckets");
            var scanCount = model.entry.content.get("scanCount");
            var isDone = model.entry.content.get("isDone");

            var sidChanged = (sid !== this._renderSID);
            var statusBucketsChanged = (statusBuckets !== this._renderStatusBuckets);
            var scanCountChanged = (scanCount !== this._renderScanCount);
            var isDoneChanged = (isDone !== this._renderIsDone);

            this._renderSID = sid;
            this._renderStatusBuckets = statusBuckets;
            this._renderScanCount = scanCount;
            this._renderIsDone = isDone;

            if (sidChanged || statusBucketsChanged)
                this.onContextChange();
            else if (scanCountChanged || isDoneChanged)
                this.onJobProgress();

            return this;
        },

        remove: function() {
            if (this._initTemplateTimeout)
                clearTimeout(this._initTemplateTimeout);

            if (this._timeline) {
                this._timeline.dispose();
                this._timeline = null;
            }

            this.model.searchJob.off("destroy error", this.render, this);
            this.model.searchJob.entry.content.off("change", this.render, this);

            return Base.prototype.remove.apply(this, arguments);
        },

        // REMOVE THESE AFTER BASE CLASS METHODS UNCOMMENTED

        show: function(key) {
            // ensure key is a string
            key = (key != null) ? ("" + key) : "";

            // we're already showing if no hideKeys are stored
            var hideKeys = this._hideKeys;
            if (!hideKeys) {
                return this;
            }

            // delete the given key from hideKeys
            delete hideKeys[key];

            // don't actually show if there are more hideKeys
            for (key in hideKeys) {
                if (hideKeys.hasOwnProperty(key)) {
                    return this;
                }
            }

            // delete hideKeys store
            this._hideKeys = null;

            // show ourself before child views
            this.$el.show();

            // child views are recursively shown in the onShow method
            this.onShow();

            return this;
        },

        hide: function(key) {
            // ensure key is a string
            key = (key != null) ? ("" + key) : "";

            // we're already hidden if previous hideKeys are stored
            // store additional key in hideKeys
            var hideKeys = this._hideKeys;
            if (hideKeys) {
                hideKeys[key] = true;
                return this;
            }

            // create hideKeys store and store first key
            hideKeys = this._hideKeys = {};
            hideKeys[key] = true;

            // hide child views before ourself
            // child views are recursively hidden in the onHide method
            this.onHide();

            // hide ourself
            this.$el.hide();

            return this;
        },

        isShowing: function() {
            // we're showing if there is no hideKeys store
            return (this._hideKeys == null);
        },

        // END REMOVE

        onShow: function() {
            this.showTimeline("onHide");
            // UNCOMMENT AFTER BASE CLASS METHOD UNCOMMENTED
            //Base.prototype.onShow.call(this);
        },

        onHide: function() {
            // UNCOMMENT AFTER BASE CLASS METHOD UNCOMMENTED
            //Base.prototype.onHide.call(this);
            this.hideTimeline("onHide");
        },

        getParam: function(key) {
            var report = this.model.report;
            var value = report ? report.entry.content.get(_PROPERTY_PREFIX + key) : null;
            if (value == null)
                value = _DEFAULT_PROPERTY_VALUES[key];
            return (value != null) ? value : null;
        },

        setParam: function(key, value) {
            var report = this.model.report;
            if (report)
                report.entry.content.set(_PROPERTY_PREFIX + key, value);
        },

        update: function() {
            if (this._timeline)
                this.updateId = this._timeline.update();
        },

        minimizeFull: function(save) {
            this.minimize(save);

            this.iconCheckView.prependTo(this.formatLinkHidden);
        },

        maximizeCompact: function(save) {
            this.maximize(save);

            if (save != false)
                this.setParam("minimalMode", true);

            $(".timelineContainer", this.container).css("height", this.getParam("minimalHeight"));
            $(".ui-resizable-handle", this.container).css("visibility", "hidden");

            this.iconCheckView.prependTo(this.formatLinkCompact);

            if (this._timeline)
                this._timeline.setMinimalMode(true);
        },

        maximizeFull: function(save) {
            this.maximize(save);

            if (save != false)
                this.setParam("minimalMode", false);

            $(".timelineContainer", this.container).css("height", this.getParam("height"));
            $(".ui-resizable-handle", this.container).css("visibility", "");

            this.iconCheckView.prependTo(this.formatLinkFull);

            if (this._timeline)
                this._timeline.setMinimalMode(false);
        },

        minimize: function(save) {
            if (save != false) {
                this.setParam("minimized", true);
                if (save.preventDefault && (typeof(save.preventDefault) === "function")) {
                    save.preventDefault();
                }
            }

            this.hideTimeline("minimize");
            $(".timelineContainer", this.container).hide();
            $(".controlLinks", this.container).hide();
            $(this.container).addClass("minimized");
            $(".format-timeline-scale", this.container).hide();
        },

        maximize: function(save) {
            if (save != false) {
                this.setParam("minimized", false);
                if (save.preventDefault && (typeof(save.preventDefault) === "function")) {
                    save.preventDefault();
                }
            }

            $(".format-timeline-scale", this.container).show();
            $(this.container).removeClass("minimized");
            $(".controlLinks", this.container).show();
            $(".timelineContainer", this.container).show();
            this.showTimeline("minimize");
        },

        zoomIn: function(evt) {
            if (this.zoomInLink.hasClass('disabled')) return false;

            var range = this.getSelectionRange();

            // if no selection is recorded, or if the entire range is selected,
            // then we defer to the generic zoom methods on the TimeRange class.
            if (!range || (range && range.equalToRange(this.getTimelineRangeFromUTC()))) {
                // TODO - there is further logic that 3.X had, that we'll need to put
                // back someday,  where we check whether the resulting recent-half
                // of the range is unpopulated
                // If it is, we instead snap into the populated data.
                // unless the *entire* timeline is unpopulated, in which case we
                // scratch our heads but let the generic zoomIn method zoom into the
                // recent half even though it's empty.

                // first however, we make sure we arent about to zoom into a single millisecond
                if (range.getDuration() == 1) {
                    var messenger = SplunkMessenger.System.getInstance();
                    messenger.send("info", "splunk", _("The timeline can not zoom in to a single millisecond."));

                    // it can be useful to "commit" the single millisecond range
                    // to the TimeRangePicker, so im still doing that.
                    this._passTimeRangeToParent(range);
                    return;
                }

                this._passTimeRangeToParent(range.zoomIn());
                // otherwise the user has selected a range and the range is a subset.
                // In this case we zoom into exactly that subset range.
            } else {
                this._passTimeRangeToParent(range);
            }
            this.selectAll();
            if (evt.preventDefault) {
                evt.preventDefault();
            }
        },

        zoomOut: function(evt) {
            if (this.zoomOutLink.hasClass('disabled')) return false;

            var timelineRange = this.getTimelineRangeFromUTC();
            if (timelineRange) {
                this._passTimeRangeToParent(timelineRange.zoomOut());
            } else {
                this.logger.error(this.moduleType, " could not zoom out cause we had an undefined timelineRange");
            }
            evt.preventDefault();
        },

        selectAll: function(evt) {
            if (this.selectAllLink.hasClass('disabled'))
                return false;

            $(".controlLinks", this.container).addClass("noSelection");
            this.selectAllLink.addClass("disabled");
            this.zoomInLink.addClass("disabled");

            this.clearSelectionRange();

            if (evt) {
                evt.preventDefault();
            }
        },
        controlsBackgroundClick: function(evt) {
            if (evt.currentTarget === evt.target) {
                this.selectAll(evt);
            }
        },

        logScale: function(evt) {
            this.iconCheckScale.prependTo(this.formatLinkLog);

            if (this._timeline) {
                this._timeline.setScaleY("log");
            }

            if (evt) {
                evt.preventDefault();
            }
        },

        linScale: function(evt) {
            this.iconCheckScale.prependTo(this.formatLinkLinear);

            if (this._timeline) {
                this._timeline.setScaleY("linear");
            }

            if (evt) {
                evt.preventDefault();
            }
        },

        showDataControls: function(show) {
            if (show) {
                $(".controlLinks", this.container).removeClass("noData");
                this.zoomOutLink.removeClass("disabled");
            } else {
                $(".controlLinks", this.container).addClass("noData");
                this.zoomOutLink.addClass("disabled");
            }
        },

        /**
         * Current version of jQuery ui is buggy. Additional logic to make things work consistently.
         */
        enableResizable: function() {
            if (!($.browser.safari && $.browser.version < "526")) {  // disable resizing for safari 3 and below only
                $("div.timelineContainer", this.container).resizable({autoHide: true, handles: "s", stop: this.onResizeStop.bind(this)});
                $("div.timelineContainer").mouseup(  // workaround until jquery ui is updated
                    function(event) {
                        $(this).width("100%");
                    }
                );
                if (SplunkUtil.normalizeBoolean(this.getParam("minimalMode")))
                    $(".ui-resizable-handle", this.container).css("visibility", "hidden");
            }
        },

        /**
         * Retrieve the normalized computed style for a specified element.
         *
         * @param {Array} specificity An array of elements to try and find a related css property from. The first element to return a property exits the routine.
         * @param {String} cssProperty The css property following standard css property convention not camel case.
         *
         * @type String || null
         * @return Returns a hexadecimal value of a matching element css selector property or null.
         */
        getCSSColor: function(specificity, cssProperty) {
            var color;
            for (var i = 0; i < specificity.length; i++) {
                var computedColor = specificity[i].css(cssProperty);
                color = SplunkUtil.normalizeColor(computedColor);
                if (color) {
                    return color;
                }
            }
            return null;
        },

        /**
         * The fact that the upstream TimeRange may be a relative range complicates
         * various cases like zoom in and zoom out.  In these cases we need to work
         * with an absolute equivalent of that relative range.
         * To avoid this issue we always make these calculations from an absolute range
         * that we create from the timelineData itself.
         */
        getTimelineRangeFromUTC: function() {
            if (this._timeline) {
                try {
                    var earliestEpochTime = this._timeline.getViewMinimum();
                    var latestEpochTime   = this._timeline.getViewMaximum();

                    if (SplunkUtil.isInt(Math.floor(earliestEpochTime)) && SplunkUtil.isInt(Math.floor(latestEpochTime))) {
                        return new SplunkTimeRange(earliestEpochTime, latestEpochTime);
                    } else {
                        this.logger.error("undefined values " + earliestEpochTime + ", " + latestEpochTime);
                    }
                } catch (e) {
                    this.logger.error(this.moduleType, " exception getting earliest and latest selected times - " + e);
                }
            }
            return new SplunkTimeRange();
        },

        /**
         * returns the localized description of the current scale of the X-axis.
         * ie "1 bar = 1 minute"
         */
        getScaleDescription: function() {
            var timelineScale = this._timeline ? this._timeline.getTimelineScale() : null;
            if (!timelineScale)
                return "";
            var unit = timelineScale.unit;
            var value= timelineScale.value;
            if (parseFloat(value) < 1) {
                if (unit == "second") {
                    value = value * 1000;
                    unit = "millisecond";
                } else {
                    this.logger.error("error - timelineScale has a fractional unit but not in seconds.");
                }
            }
            if (unit == "millisecond") {
                return sprintf(ungettext("%s millisecond per column", "%s milliseconds per column", value), value);
            } else if (value == 1) {
                switch (unit) {
                    case "year":
                        return _("1 year per column");
                    case "month":
                        return _("1 month per column");
                    case "day":
                        return _("1 day per column");
                    case "hour":
                        return _("1 hour per column");
                    case "minute":
                        return _("1 minute per column");
                    case "second":
                        return _("1 second per column");
                    default:
                        this.logger.error("received uncaught unit of ", unit);
                        break;
                }
            } else {
                this.logger.error("received a timelineScale that has >1 unit per bucket. (" + value + "). This should not happen");
            }
            return "";
        },

        /**
         * returns the currently selected range.
         * NOTE: although it's ok to call this when the entire range is selected
         * the clients of this method make some effort to avoid doing so.
         * if the entire range is selected we just dont change the context at all.
         */
        getSelectionRange: function(selectedBuckets) {
            if (!selectedBuckets)
                selectedBuckets = this._timeline ? this._timeline.getSelectedBuckets() : null;
            var numberOfBuckets = selectedBuckets ? selectedBuckets.length : 0;
            if (numberOfBuckets == 0) {
                this.logger.error(this.moduleType, " getSelectionRange returned an empty selectedBuckets. Returning 'All Time'");
                return new SplunkTimeRange();
            }
            var earliestBucket = selectedBuckets[0];
            var latestBucket = selectedBuckets[numberOfBuckets - 1];
            var range = new SplunkTimeRange(earliestBucket["earliestTime"], latestBucket["latestTime"]);
            range.setAsSubRangeOfJob(!this.isEntireRangeSelected);

            return range;
        },

        setSelectionRange: function(minimum, maximum, dispatchEvent) {
            if (isNaN(minimum) || isNaN(maximum)) {
                this.clearSelectionRange(dispatchEvent);
                return;
            }

            this.isEntireRangeSelected = false;

            this.selectAllLink.removeClass("disabled");
            this.zoomInLink.removeClass("disabled");

            if (this._timeline) {
                this._timeline.setSelectionMinimum(minimum);
                this._timeline.setSelectionMaximum(maximum);
            }

            if ((this._selectedEarliestTime !== minimum) || (this._selectedLatestTime !== maximum)) {
                this._selectedEarliestTime = minimum;
                this._selectedLatestTime = maximum;
                if (dispatchEvent !== false)
                    this.trigger("selectionChanged", { earliestTime: minimum, latestTime: maximum });
            }
        },

        clearSelectionRange: function(dispatchEvent) {
            this.isEntireRangeSelected = true;

            this.selectAllLink.addClass("disabled");
            this.zoomInLink.addClass("disabled");

            if (this._timeline) {
                this._timeline.setSelectionMinimum(NaN);
                this._timeline.setSelectionMaximum(NaN);
            }

            if (!isNaN(this._selectedEarliestTime) || !isNaN(this._selectedLatestTime)) {
                this._selectedEarliestTime = NaN;
                this._selectedLatestTime = NaN;
                if (dispatchEvent !== false)
                    this.trigger("selectionChanged", { earliestTime: NaN, latestTime: NaN });
            }
        },

        resetUI: function() {
            if (this._timeline)
                this._timeline.setJobID("");
            this.update();
            this.showDataControls(false);
            this.hideStatusMessage();
        },

        hideTimeline: function(key) {
            key = (key != null) ? String(key) : "";

            if (this._timelineHideKeys) {
                this._timelineHideKeys[key] = true;
                return false;
            }

            this._timelineHideKeys = {};
            this._timelineHideKeys[key] = true;

            if (this._timeline)
                this._timeline.hide();

            return true;
        },

        showTimeline: function(key) {
            if (!this._timelineHideKeys)
                return false;

            key = (key != null) ? String(key) : "";

            delete this._timelineHideKeys[key];
            for (key in this._timelineHideKeys) {
                if (this._timelineHideKeys.hasOwnProperty(key))
                    return false;
            }

            this._timelineHideKeys = null;

            if (this._timeline)
                this._timeline.show();

            return true;
        },

        isTimelineShowing: function() {
            return !this._timelineHideKeys;
        },

        /**
         * display a search job status message
         */
        showStatusMessage: function(msg, sid) {
            var str = "";
            str += "<p class=\"resultStatusMessage empty_results\">";
            str += msg;
            if (sid) {
                str += " <span class=\"resultStatusHelp\">";
                str += "<a href=\"#\" onclick=\"Splunk.window.openJobInspector('" + sid.replace("'", "") + "');return false;\" class=\"resultStatusHelpLink\">";
                str += _("Inspect ...");
                str += "</a>";
                str += "</span>";
            }
            str += "</p>";

            this.hideTimeline("showStatusMessage");
            $(".messageContainer", this.container).html(str).show();
        },

        hideStatusMessage: function() {
            $(".messageContainer", this.container).hide().html("");
            this.showTimeline("showStatusMessage");
        },

        onJobProgress: function() {
            //var model = this.model.searchJob;
            //if (model && model.get("isDone")) {
            //  // Notifying PageStatus that a render is beginning.
            //  if (!this.renderMonitor) {
            //      this.renderMonitor = Splunk.Globals["PageStatus"].register(this.moduleType + " - rendering final data - " + this.container.attr("id"));
            //  }
            //}
            this.update();
        },

        /**
         * Like other modules, when any new context comes down from above, it
         * clears any selection state it may have had.
         * and notifies the timeline to display the data from the new sid.
         */
        onContextChange: function() {
            var model = this.model.searchJob;
            var sid = model ? model.id : null;

            // from this point, until the timelineDataAvailable event is fired, we must
            // disable or ignore all interaction.
            this.showDataControls(false);

            // when getting a new context, reset the selection range.
            this.clearSelectionRange();

            if (this._timeline) {
                // select all if SID has changed
                if (sid != this._prevSID) {
                    this._prevSID = sid;
                    this.selectAll();
                }

                // This handles the case where the sid has high byte chars in it.
                // It should probably be removed when Gatt has implemented encoding in his lib.
                if (sid != null) {
                    this._timeline.setJobID(encodeURIComponent(encodeURIComponent(sid)));
                } else {
                    this._timeline.setJobID(sid);
                }

                // set max bucket count to render
                this._timeline.setBucketCount(parseInt(this.getParam("maxBucketCount"), 10));
            }

            // show or hide module if insufficient status buckets
            if (sid && (model.entry.content.get("statusBuckets") < 1)) {
                this.hideTimeline("statusBuckets");
                this.hide("views-shared-CanvasTimeline-statusBuckets");
            } else {
                this.show("views-shared-CanvasTimeline-statusBuckets");
                this.showTimeline("statusBuckets");
            }

            this.update();
        },

        /**
         * Fired when the timeline tells us it has finished rendering a new copy of
         * the timelineData.  Note that this does not mean the job is done.
         */
        onDataUpdated: function(event) {
            var model = this.model.searchJob;
            if (!model)
                return;

            // screen out previews and (for the timeline) async updates onJobProgress
            if (!model.isNew() && model.entry.content.get("isDone")) {
                // each time you call "update" you get back an int that increments each time.
                // We keep this int as a local property - this.updateId
                // if the "updateCount" of this particular dataUpdated event, matches the last
                // update we asked for,  then we mark it complete.
                // it's possible however that we asked for another update RIGHT when the penultimate
                // update request returned.  That's what this check is doing.
                if (this.renderMonitor && (event.updateCount >= this.updateId)) {
                    this.renderMonitor.loadComplete();
                    this.renderMonitor = false;
                }
            }

            if (!model.isNew()) {
                // we have data so we can turn on all the data controls.
                this.showDataControls(true);

                // the reason why we need to update it so often is because in
                // unbounded ranges the scale changes during the life of the job.
                $(".bucketSize", this.container).html(this.getScaleDescription());
            }
        },

        /**
         * Fired when the timeline tells us the user has made any selection.
         */
        onSelectionChanged: function(event) {
            var earliestTime = event.selectionMinimum;
            var latestTime = event.selectionMaximum;
            if (isNaN(earliestTime) || isNaN(latestTime)) {
                this.selectAll();
                return;
            }

            this.isEntireRangeSelected = false;
            this.selectAllLink.removeClass("disabled");
            this.zoomInLink.removeClass("disabled");

            if ((earliestTime !== this._selectedEarliestTime) || (latestTime !== this._selectedLatestTime)) {
                this._selectedEarliestTime = earliestTime;
                this._selectedLatestTime = latestTime;
                this.trigger("selectionChanged", { earliestTime: earliestTime, latestTime: latestTime });
            }
        },

        /**
         * Handle a resize stop event from the Resizable jQuery extension. See http://docs.jquery.com/UI/Resizable
         * Saves the new height with a "px" suffix to viewstate.conf.
         *
         * @param {Object} event Original browser event.
         * @param {Object} ui Prepared ui object having the following attributes: http://docs.jquery.com/UI/Resizable#overview
         */
        onResizeStop: function(event, ui) {
            $(event.target).width("100%");
            this.setParam("height", ui.size.height + "px");
        },

        /**
         * internal method called when the user clicks "zoom in" or "zoom out"
         * in order to send the timeRange up (probably to a TimeRangePicker instance)
         */
        _passTimeRangeToParent: function(range) {
            if (!this.model)
                return;

            var properties = {
                "dispatch.earliest_time": range.getEarliestTimeTerms(),
                "dispatch.latest_time": range.getLatestTimeTerms(),
                "display.events.timelineEarliestTime": "",
                "display.events.timelineLatestTime": ""
            };

            this.model.report.entry.content.set(properties);
        },

        _hasCanvas: function() {
            var canvas = document.createElement("canvas");
            if (!canvas)
                return false;

            if (typeof canvas.getContext !== "function")
                return false;

            var context = canvas.getContext("2d");
            if (!context)
                return false;

            return true;
        },

        /**
         * called by the timeline itself, which needs to reach out here in order to localize
         * strings for timeranges. The timeline gives us the timerange info and we
         * provide a localized human language equivalent.
         */
        formatTooltip: function(earliestTime, latestTime, earliestOffset, latestOffset, eventCount) {
            // NOTE - we no longer have any use for the timezone offsets that the timeline gives us.
            var range = new SplunkTimeRange(earliestTime, latestTime);
            var tooltip = _(sprintf(
                ungettext(
                    _("%(eventCount)s event %(timeRangeString)s"),
                    _("%(eventCount)s events %(timeRangeString)s"),
                    eventCount
                ),
                { eventCount: SplunkI18N.format_decimal(eventCount), timeRangeString: range.toConciseString() }
            ));
            return tooltip;
        },

        formatSimpleString: function(str) {
            return _(str);
        },

        formatNumericString: function(strSingular, strPlural, num) {
            return sprintf(ungettext(strSingular, strPlural, num), this.formatNumber(num));
        },

        formatNumber: function(num) {
            var pos = Math.abs(num);
            if ((pos > 0) && ((pos < 1e-3) || (pos >= 1e9)))
                return SplunkI18N.format_scientific(num, "##0E0");
            return SplunkI18N.format_decimal(num);
        },

        formatDate: function(time, timeZoneOffset, dateFormat) {
            if (dateFormat) {
                var customFormat = this._CUSTOM_DATE_FORMATS[dateFormat];
                if (customFormat) {
                    var localeName = locale_name();
                    if (customFormat[localeName])
                        dateFormat = customFormat[localeName];
                    else if (locale_uses_day_before_month() && customFormat["day_before_month"])
                        dateFormat = customFormat["day_before_month"];
                }
            }
            return SplunkI18N.format_date(this.epochToDateTime(time, timeZoneOffset), dateFormat);
        },

        formatTime: function(time, timeZoneOffset, timeFormat) {
            if (timeFormat == "full")
                return SplunkI18N.format_time_microseconds(this.epochToDateTime(time, timeZoneOffset), timeFormat);
            return SplunkI18N.format_time(this.epochToDateTime(time, timeZoneOffset), timeFormat);
        },

        formatDateTime: function(time, timeZoneOffset, dateFormat, timeFormat) {
            if (timeFormat == "full")
                return SplunkI18N.format_datetime_microseconds(this.epochToDateTime(time, timeZoneOffset), dateFormat, timeFormat);
            return SplunkI18N.format_datetime(this.epochToDateTime(time, timeZoneOffset), dateFormat, timeFormat);
        },

        epochToDateTime: function(time, timeZoneOffset) {
            var date = new Date(Math.floor((time + timeZoneOffset) * 1000));
            var dateTime = new DateTime({
                date: date,
                year: date.getUTCFullYear(),
                month: date.getUTCMonth() + 1,
                day: date.getUTCDate(),
                hour: date.getUTCHours(),
                minute: date.getUTCMinutes(),
                second: date.getUTCSeconds(),
                microsecond: date.getUTCMilliseconds() * 1000
            });
            dateTime.weekday = function() {
                var d = this.date.getUTCDay() - 1;
                if (d < 0)
                    d = 6;
                return d;
            };
            return dateTime;
        },

        template: '\
            <div class="format-timeline btn-combo pull-left">\
                <a href="#" class="dropdown-toggle btn-pill"><%- formatLabel %><span class="caret"></span></a>\
                <div class="dropdown-menu dropdown-menu-selectable dropdown-menu-narrow" style="top: 26px; margin-left: -86px;">\
                    <div class="arrow" style="margin-left: -10px;"></div>\
                    <ul class="format-timeline-view">\
                        <li class="format-timeline-hidden"><a href="#"><%- hiddenLabel %></a></li>\
                        <li class="format-timeline-compact"><a href="#"><%- compactLabel %></a></li>\
                        <li class="format-timeline-full"><a href="#"><%- fullLabel %></a></li>\
                    </ul>\
                    <ul class="format-timeline-scale">\
                        <li class="format-timeline-linear"><a href="#"><%- linearLabel %></a></li>\
                        <li class="format-timeline-log"><a href="#"><%- logLabel %></a></li>\
                    </ul>\
                </div>\
            </div>\
            <div class="controlLinks noData noSelection">\
                <a href="#" class="zoomOut disabled btn-pill"><span class="icon-minus-circle"></span> <%- zoomOutLabel %></a>\
                <a href="#" class="zoomIn disabled btn-pill"><span class="icon-plus-circle"></span> <%- zoomInLabel %></a>\
                <a href="#" class="selectAll disabled btn-pill"><span class="icon-x-circle"></span> <%- deselectLabel %></a>\
                <span class="bucketSize pull-right"></span>\
            </div>\
            <div class="timelineContainer" style="width:<%- width %>; height:<%- height %>; <%- wrapperStyle %>"></div>\
        '

    }, {
        DEFAULT_PROPERTY_VALUES: _DEFAULT_PROPERTY_VALUES
    });

    /**
     * Timeline interface classes appear below.
     *
     * Each interface must include the following methods:
     *
     *   initialize(module:Module) : void
     *   dispose() : void
     *   update() : int
     *   setJobID(value:String) : void
     *   setBucketCount(value:Number) : void
     *   setMinimalMode(value:Boolean) : void
     *   setScaleY(value:String) : void  // value=log|linear
     *   setSelectionMinimum(value:Number) : void
     *   setSelectionMaximum(value:Number) : void
     *   getViewMinimum() : Number
     *   getViewMaximum() : Number
     *   getSelectedBuckets() : Array
     *   getTimelineScale() : Object
     *   hide() : void
     *   show() : void
     */

    Timeline.CanvasTimeline = (function() {
        var c = function(module) {
            this.initialize(module);
        };
        c.prototype = {

            initialize: function(module) {
                this.module = module;

                this.onPrintStart = this.onPrintStart.bind(this);
                module.onDataUpdated = module.onDataUpdated.bind(module);
                module.onSelectionChanged = module.onSelectionChanged.bind(module);
                module.zoomIn = module.zoomIn.bind(module);

                $(document).bind("PrintStart", this.onPrintStart);

                this._timeline = new ChartingTimeline(SplunkUtil.make_url("/splunkd"), "");
                this._timeline.externalInterface.formatTooltip = module.formatTooltip.bind(module);
                this._timeline.externalInterface.formatSimpleString = module.formatSimpleString.bind(module);
                this._timeline.externalInterface.formatNumericString = module.formatNumericString.bind(module);
                this._timeline.externalInterface.formatNumber = module.formatNumber.bind(module);
                this._timeline.externalInterface.formatDate = module.formatDate.bind(module);
                this._timeline.externalInterface.formatTime = module.formatTime.bind(module);
                this._timeline.externalInterface.formatDateTime = module.formatDateTime.bind(module);
                this._timeline.set("timeZone", SplunkUtil.getConfigValue("SERVER_ZONEINFO"));
                this._timeline.set("enableChartClick", true);
                this._timeline.addEventListener("updated", module.onDataUpdated);
                this._timeline.addEventListener("selectionChanged", module.onSelectionChanged);
                this._timeline.addEventListener("chartDoubleClicked", module.zoomIn);
                this._timeline.appendTo($(".timelineContainer", module.container)[0]);

                //var foregroundColor = module.getCSSColor([module.container], "border-left-color");
                //if (foregroundColor)
                //  this._timeline.set("foregroundColor", Number(foregroundColor.replace("#", "0x")));

                //var seriesColor = module.getCSSColor([module.container], "border-right-color");
                //if (seriesColor)
                //  this._timeline.set("seriesColor", Number(seriesColor.replace("#", "0x")));

                if (!module.isTimelineShowing())
                    $(this._timeline.element).css("display", "none");

                if (SplunkUtil.normalizeBoolean(module.getParam("minimalMode")))
                    this._timeline.set("minimalMode", true);

                if (SplunkUtil.normalizeBoolean(module.getParam("enableResize")))
                    module.enableResizable();

                module.onContextChange();
                module.update();
            },

            dispose: function() {
                if (this._timeline) {
                    this._timeline.removeEventListener("updated", this.module.onDataUpdated);
                    this._timeline.removeEventListener("selectionChanged", this.module.onSelectionChanged);
                    this._timeline.removeEventListener("chartDoubleClicked", this.module.zoomIn);
                    this._timeline.dispose();
                    this._timeline = null;
                }

                $(document).unbind("PrintStart", this.onPrintStart);
            },

            update: function() {
                if (!this._timeline)
                    return;
                return this._timeline.update();
            },

            setJobID: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("jobID", value);
            },

            setBucketCount: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("bucketCount", value);
            },

            setMinimalMode: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("minimalMode", value);
            },

            setScaleY: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("scaleY", value);
            },

            setSelectionMinimum: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("selectionMinimum", value);
            },

            setSelectionMaximum: function(value) {
                if (!this._timeline)
                    return;
                this._timeline.set("selectionMaximum", value);
            },

            getViewMinimum: function() {
                if (!this._timeline)
                    return;
                return this._timeline.get("viewMinimum");
            },

            getViewMaximum: function() {
                if (!this._timeline)
                    return;
                return this._timeline.get("viewMaximum");
            },

            getSelectedBuckets: function() {
                if (!this._timeline)
                    return;
                return this._timeline.getSelectedBuckets();
            },

            getTimelineScale: function() {
                if (!this._timeline)
                    return;
                return this._timeline.get("timelineScale");
            },

            hide: function() {
                if (!this._timeline)
                    return;
                $(this._timeline.element).css("display", "none");
            },

            show: function() {
                if (!this._timeline)
                    return;
                $(this._timeline.element).css("display", "");
                this._timeline.updateSize();
                this._timeline.validate();
            },

            onPrintStart: function() {
                if (!this._timeline)
                    return;
                this._timeline.updateSize();
                this._timeline.validate();
            }

        };

        return c;
    })();

    Timeline.FlashTimeline = (function() {
        var _swfCount = 0;
        var c = function(module) {
            this.initialize(module);
        };
        c.prototype = {

            initialize: function(module) {
                this.module = module;

                this.onPrintStart = this.onPrintStart.bind(this);
                this.onPrintEnd = this.onPrintEnd.bind(this);

                this.id = ++_swfCount;
                this.swfObjectId = "swfObject_" + this.id;
                this.bridge = new SplunkJABridge(this.swfObjectId);
                this.minVersion = SplunkUtil.getConfigValue("FLASH_MAJOR_VERSION") + "." + SplunkUtil.getConfigValue("FLASH_MINOR_VERSION") + "." + SplunkUtil.getConfigValue("FLASH_REVISION_VERSION");

                // used to communicate with PageStatus singleton about the async swf loading.
                //this.swfLoadMonitor = Splunk.Globals["PageStatus"].register(module.moduleType + " - loading swf file - " + module.container.attr("id"));

                this.initializeBridge();
                if (swfobject.hasFlashPlayerVersion(this.minVersion))
                    this.addObjectStructure();
                else
                    this.showFlashError();

                $(document).bind("PrintStart", this.onPrintStart);
                $(document).bind("PrintEnd", this.onPrintEnd);
            },

            dispose: function() {
                this._isDisposed = true;

                this.bridge.close();

                $(document).unbind("PrintStart", this.onPrintStart);
                $(document).unbind("PrintEnd", this.onPrintEnd);
            },

            update: function() {
                return this.callBridgeMethod("update");
            },

            setJobID: function(value) {
                this.setBridgeProperty("jobID", value);
            },

            setBucketCount: function(value) {
                this.callBridgeMethod("setValue", "data.count", value);
            },

            setMinimalMode: function(value) {
                this.callBridgeMethod("setValue", "minimalMode", value);
            },

            setScaleY: function(value) {
                this.callBridgeMethod("setValue", "axisY.scale", value);
            },

            setSelectionMinimum: function(value) {
                this.setBridgeProperty("selectionMinimum", value);
            },

            setSelectionMaximum: function(value) {
                this.setBridgeProperty("selectionMaximum", value);
            },

            getViewMinimum: function() {
                return this.getBridgeProperty("viewMinimum");
            },

            getViewMaximum: function() {
                return this.getBridgeProperty("viewMaximum");
            },

            getSelectedBuckets: function() {
                return this.callBridgeMethod("getSelectedBuckets");
            },

            getTimelineScale: function() {
                return this.getBridgeProperty("timelineScale");
            },

            hide: function() {
                var module = this.module;
                module.logger.warn("closing down JABridge connection");
                this.bridge.close();
                $(this.bridge.getFlashElement(this.swfObjectId)).css("display", "none");
            },

            show: function() {
                var module = this.module;
                $(this.bridge.getFlashElement(this.swfObjectId)).css("display", "");
                module.logger.warn("bringing back JABridge connection");
                this.connectBridge(true);
            },

            /**
             * Retrieve base64 encoded image snapshot of Flash movie for overlay and shutdown existing movie.
             */
            onPrintStart: function() {
                var module = this.module;
                if($.browser.msie)
                    return;

                var snapshot = this.callBridgeMethod("getSnapshot");
                if (snapshot) {
                    var img = document.createElement("img");
                    img.setAttribute("width", snapshot.width);
                    img.setAttribute("height", snapshot.height);
                    module.hideTimeline("onPrintStart");
                    $(".timelineContainer", module.container)[0].appendChild(img).src = snapshot.data;  // bypass jquery for performance (base64 encoded images are large)
                }
            },

            /**
             * Destroy base64 encoded image snapshot of Flash movie and bring back Flash movie to previous state.
             */
            onPrintEnd: function() {
                var module = this.module;
                if ($.browser.msie)
                    return;

                $(".timelineContainer img", module.container).remove();
                module.showTimeline("onPrintStart");
            },

            connectBridge: function(isReconnect) {
                if (this._isDisposed)
                    return;

                if (!isReconnect)
                    isReconnect = false;

                this.bridge.connect(function(){this.onConnect(isReconnect);}.bind(this), this.onClose.bind(this));
            },

            /**
             * Template method that subclasses can implement if they need to call
             * bridge.addMethod or bridge.addEvent,  which can only be called after the
             * bridge object has been constructed, but before the connect() method
             * has been called.
             */
            initializeBridge: function() {
                var module = this.module;
                this.bridge.addMethod("formatTooltip", module.formatTooltip.bind(module), [ "earliestTime", "latestTime", "earliestOffset", "latestOffset", "eventCount" ], "String");
                this.bridge.addMethod("formatSimpleString", module.formatSimpleString.bind(module), [ "str" ], "String");
                this.bridge.addMethod("formatNumericString", module.formatNumericString.bind(module), [ "strSingular", "strPlural", "num" ], "String");
                this.bridge.addMethod("formatNumber", module.formatNumber.bind(module), [ "num" ], "String");
                this.bridge.addMethod("formatDate", module.formatDate.bind(module), [ "time", "timeZoneOffset", "dateFormat" ], "String");
                this.bridge.addMethod("formatTime", module.formatTime.bind(module), [ "time", "timeZoneOffset", "timeFormat" ], "String");
                this.bridge.addMethod("formatDateTime", module.formatDateTime.bind(module), [ "time", "timeZoneOffset", "dateFormat", "timeFormat" ], "String");
            },

            /**
             * Handler for when SWFObject has embedded Flash content.
             * SWFObject adds movies asynchronously (absolutely unnecessary) so this is a workaround for all its stupidity.
             *
             * @param {Object) event SWFObject event object having success, id and ref attributes.
             */
            onSWFReady: function(event) {
                var module = this.module;
                if (event.success) {
                    if (module.isTimelineShowing())
                        this.connectBridge(false);
                    else
                        $(this.bridge.getFlashElement(this.swfObjectId)).css("display", "none");

                    if (SplunkUtil.normalizeBoolean(module.getParam("enableResize")))
                        module.enableResizable();
                } else {
                    module.logger.error("The embedding of the SWF was unsuccessful.");
                }
            },

            addObjectStructure: function() {
                var module = this.module;
                var targetId = "swfContainer_" + this.id;  // SWFObject requires an explicit id.

                var swfUrl = "";
                if (module.getParam("swfFile").substring(0,1) == "/")
                    swfUrl = SplunkUtil.make_url(module.getParam("swfFile"));
                else
                    swfUrl = SplunkUtil.make_url("/static/flash/" + module.getParam("swfFile"));

                var expressInstallUrl = false;
                var staticPath = SplunkUtil.make_url("/static");
                if (staticPath.charAt(staticPath.length - 1) == "/")
                    staticPath = staticPath.substring(0, staticPath.length - 1);

                var flashVars = {
                    "staticPath": staticPath,
                    "hostPath": SplunkUtil.make_url("/splunkd"),
                    "basePath": ""
                };

                var params = {
                    wmode: "opaque",
                    allowFullScreen: "true"
                };

                var bgcolor = module.getCSSColor([module.container], "background-color");
                if (bgcolor)
                    params["bgcolor"] = bgcolor;

                var attributes = {
                    id: this.swfObjectId,
                    name: this.swfObjectId
                };

                $(".timelineContainer", module.container).append("<div id="+targetId+"></div>");  // SWFObject does complete node replacement, not target child replacement.
                swfobject.embedSWF(swfUrl, targetId, "100%", "100%", this.minVersion, expressInstallUrl, flashVars, params, attributes, this.onSWFReady.bind(this));
            },

            showFlashError: function() {
                var module = this.module;
                var msg = _("Splunk requires a newer version of Flash.");
                module.logger.warn(msg);
                var target = $("div.timelineContainer", module.container)[0];
                target.innerHTML = sprintf(
                    '<p class="error">%s (Minimum version: %s.%s.%s) <a href="http://get.adobe.com/flashplayer/" target="_blank" class="spl-icon-external-link-xsm">Download Flash Player</a></p>',
                    msg,
                    SplunkUtil.getConfigValue("FLASH_MAJOR_VERSION"),
                    SplunkUtil.getConfigValue("FLASH_MINOR_VERSION"),
                    SplunkUtil.getConfigValue("FLASH_REVISION_VERSION")
                );
            },

            /**
             * Handle JABridge close event.
             */
            onClose: function() {
                var module = this.module;
                module.logger.warn("The JABridge connection was closed with an id of", this.bridge.id());
                this._isBridgeConnected = false;
            },

            /**
             * Handle JABridge connect event.
             *
             * @param {Boolean} isReconnect Controls if the flash movie should be brought back to life.
             */
            onConnect: function(isReconnect) {
                var module = this.module;

                this._isBridgeConnected = true;

                this.setBridgeProperty("enableChartClick", true);
                this.setBridgeProperty("enableOpenAsImage", !$.browser.msie);  // ie does not support uri data scheme.
                this.setBridgeProperty("timeZone", SplunkUtil.getConfigValue("SERVER_ZONEINFO"));

                // NOTE -- ASSUMPTION - the first click will always have triggered an 'selectionChanged' event.
                // and most importantly, a change in the swf's internal model, such that when we call getSelectionRange()
                // we'll get the clicked-upon bar.
                // This greatly simplifies the double click case cause we just bind directly to zoomIn()
                this.addBridgeEventListener("chartDoubleClicked", module.zoomIn.bind(module));

                this.addBridgeEventListener("selectionChanged", module.onSelectionChanged.bind(module));
                this.addBridgeEventListener("updated", module.onDataUpdated.bind(module));
                this.addBridgeEventListener("openAsImage", this.onOpenAsImage.bind(this));

                if (SplunkUtil.normalizeBoolean(module.getParam("minimalMode")))
                    this.callBridgeMethod("setValue", "minimalMode", "true");

                this.setPresentation();

                module.onContextChange();
                module.update();

                //this.swfLoadMonitor.loadComplete();
            },

            /**
             * Handle JABridge event that has the base64 encoded png image invoked via a flash context menu click. A popup a window with the image will be launched.
             * @param {Object} event An object literal having the following structure { snapshot: { data:, width:, height: } } where data is a base64 encoded image.
             */
            onOpenAsImage: function(event) {
                var snapshot = event.snapshot;
                SplunkWindow.open(snapshot.data, this.swfObjectId, {height: snapshot.height+16, width: snapshot.width+16});
            },

            /**
             * Set presentation control settings on Flash movies. Used for skinning.
             *
             * Example CSS:
             * .YOURCONTAINER {
             *  background-color:#CCC; -> backgroundColor
             *  border-left-color:#000; -> foregroundColor
             *  color:#FFF; -> fontColor
             *  border-right-color:#FFF; -> seriesColor
             * }
             */
            setPresentation: function() {
                var module = this.module;
                //var seriesColors = module.getCSSColor([module.container], "border-right-color");
                //if (seriesColors)
                //  this.callBridgeMethod("setValue", "seriesColors", "["+seriesColors.replace("#", "0x")+"]");

                var styleMap = [
                    //{ css: "border-left-color", flash: "foregroundColor" },
                    { css: "color", flash: "fontColor" },
                    { css: "background-color", flash: "backgroundColor" }
                ];

                for (var i = 0; i < styleMap.length; i++) {
                    var styleMapAttributes = styleMap[i];
                    var value = module.getCSSColor([module.container], styleMapAttributes.css);
                    if (value)
                        this.callBridgeMethod("setValue", styleMapAttributes.flash, value.replace("#", "0x"));
                }
            },

            getBridgeProperty: function(name) {
                if (!this._isBridgeConnected)
                    return undefined;

                try {
                    return this.bridge.getProperty(name);
                } catch(e) {
                    this.module.logger.error("externalInterface/jabridge exception on getProperty('", name, "')", e);
                    return undefined;
                }
            },

            setBridgeProperty: function(name, value) {
                if (!this._isBridgeConnected)
                    return;

                try {
                    this.bridge.setProperty(name, value);
                } catch(e) {
                    this.module.logger.error("externalInterface/jabridge exception on setProperty('", name, "', '", value, "')", e);
                }
            },

            callBridgeMethod: function(name) {
                if (!this._isBridgeConnected)
                    return undefined;

                try {
                    return this.bridge.callMethod.apply(this.bridge, arguments);
                } catch(e) {
                    this.module.logger.error("externalInterface/jabridge exception on callMethod('", name, "')", e);
                    return undefined;
                }
            },

            addBridgeEventListener: function(name, listener) {
                if (!this._isBridgeConnected)
                    return;

                try {
                    return this.bridge.addEventListener(name, listener);
                } catch(e) {
                    this.module.logger.error("externalInterface/jabridge exception on addEventListener('", name, "')", e);
                }
            }

        };

        return c;
    })();

    return Timeline;

});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/timeline.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
define('splunkjs/mvc/timelineview',['require','exports','module','underscore','backbone','./mvc','./basesplunkview','views/shared/CanvasTimeline','splunk/time/DateTime','splunk/time/SimpleTimeZone','css!../css/timeline'],function(require, exports, module) {
    var _ = require("underscore");
    var Backbone = require("backbone");
    var mvc = require('./mvc');
    var BaseSplunkView = require("./basesplunkview");
    var CanvasTimeline = require("views/shared/CanvasTimeline");
    var DateTime = require("splunk/time/DateTime");
    var SimpleTimeZone = require("splunk/time/SimpleTimeZone");

    require("css!../css/timeline");
    
    var TimelineView = BaseSplunkView.extend(
        // Instance
        {
            moduleId: module.id,
            
            className: "splunk-timeline",

            options: {
                managerid: null,
                data: "timeline",
                minimize: false,
                // Updated whenever the user selects a new time range
                // and presses "Zoom to selection" or "Zoom out".
                // External changes to this property are ignored.
                value: undefined
            },
            
            initialize: function() {
                var that = this;
                
                this.configure();
                this.settings.enablePush("value");
                
                var model = this._model = {
                    searchJob: new Backbone.Model(),
                    report: new Backbone.Model()
                };
                
                model.searchJob.entry = { content: new Backbone.Model() };
                model.report.entry = { content: new Backbone.Model() };
                this._state = model.report.entry.content;
                model.searchJob.isNew = function() { return false; };
                
                this.timeline = new CanvasTimeline({model: model});
                this.timeline.update = function() {};
                
                // NOTE: Changes to settings.value will NOT be propagated back
                //       to this control's value.
                
                // Update model if view changes
                this.on("change", function(value) {
                    that.settings.set("value", value);
                });
                
                this.bindToComponent(this.settings.get("managerid"), this.onManagerChange, this);
                
                this.settings.on("change:minimize", this._onMinimizeChange, this);
                
                this._state.on(
                    "change:dispatch.earliest_time change:dispatch.latest_time", 
                    _.debounce(this._onTimeRangeChange), 
                    this
                );
            },
            
            onManagerChange: function(managers, manager) {                
                if (this.manager) {
                    this.manager.off(null, null, this);
                    this.manager = null;
                }
                if (this.resultsModel) {
                    this.resultsModel.off(null, null, this);
                    this.resultsModel.destroy();
                    this.resultsModel = null;
                }

                if (!manager) {
                    return;
                }

                this.manager = manager;
                this.resultsModel = this.manager.data(this.settings.get("data"), {
                    condition: function(manager) {
                        var content = manager.get("data");
                        
                        if (!content) {
                            return false;
                        }
                        
                        var statusBuckets = content.statusBuckets;
                        var eventCount = content.eventCount;
                        
                        return (statusBuckets > 0) && (eventCount > 0);
                    }
                });
                manager.on("search:start", this._onSearchStart, this);
                manager.on("search:cancelled", this._onSearchCancelled, this);
                this.resultsModel.on("data", this._onDataChanged, this);
            },
            
            render: function() {
                this.$el.append(this.timeline.render().el);
                
                // We must defer updating the minimized state, as the DOM is not
                // ready immediately (there is an internal defer in CanvasTimeline)
                var that = this;
                _.defer(function() {
                    that._onMinimizeChange();
                });
                
                return this;
            },
            
            clearTimeline: function() {
                this.timeline.resetUI();
                
                var internalTimeline = this.timeline._timeline._timeline;
                internalTimeline._updateTimelineData({buckets:[], event_count: 0, cursor_time: 0});
            },
            
            _onMinimizeChange: function() {
                if (this.settings.get("minimize")) {
                    this.timeline.maximizeCompact(false);
                }
                else {
                    this.timeline.maximizeFull(false);
                }
            },
            
            _onDataChanged: function() {
                var timelineData = this.resultsModel.data();
                
                var data = {
                  buckets: [],
                  cursorTime: new DateTime(timelineData.cursor_time),
                  eventCount: timelineData.event_count,
                  earliestOffset: timelineData.earliestOffset || 0
                };
                
                if (data.cursorTime) {
                  data.cursorTime = data.cursorTime.toTimeZone(new SimpleTimeZone(data.earliestOffset));
                }
                
                for(var i = 0; i < timelineData.buckets.length; i++) {
                  var oldBucket = timelineData.buckets[i];
                  var newBucket = {
                    earliestTime: new DateTime(oldBucket.earliest_time),
                    duration: oldBucket.duration,
                    eventCount: oldBucket.total_count,
                    eventAvailableCount: oldBucket.available_count,
                    isComplete: oldBucket.is_finalized,
                    buckets: []
                  };

                  if (isNaN(newBucket.duration)) {
                    newBucket.duration = 0;
                  }
                  if (isNaN(newBucket.earliestOffset)) {
                    newBucket.earliestOffset = 0;
                  }
                  if (isNaN(newBucket.latestOffset)) {
                    newBucket.latestOffset = 0;
                  }

                  if (newBucket.earliestTime) {
                    newBucket.latestTime = new DateTime(newBucket.earliestTime.getTime() + newBucket.duration);
                  }
                  
                  if (newBucket.earliestTime) {
                    newBucket.earliestTime = newBucket.earliestTime.toTimeZone(new SimpleTimeZone(oldBucket.earliest_time_offset));
                  }
                  if (newBucket.latestTime) {
                    newBucket.latestTime = newBucket.latestTime.toTimeZone(new SimpleTimeZone(oldBucket.latest_time_offset));
                  }
                  
                  data.buckets.push(newBucket);
                }
                
                var internalTimeline = this.timeline._timeline._timeline;
                internalTimeline._updateTimelineData(data);
                this.timeline.onDataUpdated({
                    updateCount: Number.MAX_VALUE
                });
            },
            
            _onSearchStart: function() {
                this.clearTimeline();
            },
            
            _onSearchCancelled: function() {
                this.clearTimeline();
            },
            
            _onTimeRangeChange: function(model, value, options) {
                if (!options || (options && !options._self)) {
                    this.trigger("change", this._getTimeRange(), this);
                }
            },
            
            val: function(value) {
                if (value !== undefined) {
                    this._setTimeRange(value);
                }
                else {
                    return this._getTimeRange();
                }
            },
            
            _setTimeRange: function(value) {
                throw new Error("Unable to set time range on timeline.");
            },
            
            _getTimeRange: function() {
                return {
                    "earliest_time": this._state.get("dispatch.earliest_time"),
                    "latest_time": this._state.get("dispatch.latest_time")
                };
            }
        }
    );
    
    return TimelineView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*!\n * Splunk shoestrap\n * import and override bootstrap vars & mixins\n */\n.clearfix {\n  *zoom: 1;\n}\n.clearfix:before,\n.clearfix:after {\n  display: table;\n  content: \"\";\n  line-height: 0;\n}\n.clearfix:after {\n  clear: both;\n}\n.hide-text {\n  font: 0/0 a;\n  color: transparent;\n  text-shadow: none;\n  background-color: transparent;\n  border: 0;\n}\n.input-block-level {\n  display: block;\n  width: 100%;\n  min-height: 26px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ie7-force-layout {\n  *min-width: 0;\n}\n.splunk-charting-Timeline .splunk-charting-label {\n  cursor: default;\n}\n.splunk-charting-Timeline .splunk-charting-TimeAxisLabels .splunk-charting-label {\n  margin-left: 5px;\n  margin-right: 5px;\n  margin-top: 4px;\n  margin-bottom: 4px;\n}\n.splunk-charting-Timeline .splunk-charting-NumericAxisLabels .splunk-charting-label {\n  margin-left: 5px;\n  margin-right: 5px;\n  margin-top: 3px;\n  margin-bottom: 3px;\n}\n.splunk-charting-Timeline .splunk-charting-ClickDragRangeMarker .splunk-charting-label,\n.splunk-charting-Timeline .splunk-charting-CursorMarker .splunk-charting-label {\n  color: #000000;\n  margin-left: 7px;\n  margin-right: 7px;\n}\n.splunk-charting-Timeline .splunk-charting-Tooltip .splunk-charting-label {\n  color: #ffffff;\n  margin-left: 7px;\n  margin-right: 7px;\n  margin-top: 4px;\n  margin-bottom: 4px;\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 