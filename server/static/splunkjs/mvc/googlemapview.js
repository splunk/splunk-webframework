
/** @license
 * RequireJS plugin for async dependency load like JSONP and Google Maps
 * Author: Miller Medeiros
 * Version: 0.1.1 (2011/11/17)
 * Released under the MIT license
 */
define('async',[],function(){

    var DEFAULT_PARAM_NAME = 'callback',
        _uid = 0;

    function injectScript(src){
        var s, t;
        s = document.createElement('script'); s.type = 'text/javascript'; s.async = true; s.src = src;
        t = document.getElementsByTagName('script')[0]; t.parentNode.insertBefore(s,t);
    }

    function formatUrl(name, id){
        var paramRegex = /!(.+)/,
            url = name.replace(paramRegex, ''),
            param = (paramRegex.test(name))? name.replace(/.+!/, '') : DEFAULT_PARAM_NAME;
        url += (url.indexOf('?') < 0)? '?' : '&';
        return url + param +'='+ id;
    }

    function uid() {
        _uid += 1;
        return '__async_req_'+ _uid +'__';
    }

    return{
        load : function(name, req, onLoad, config){
            if(config.isBuild){
                onLoad(null); //avoid errors on the optimizer
            }else{
                var id = uid();
                window[id] = onLoad; //create a global variable that stores onLoad so callback function can define new module after async load
                injectScript(formatUrl(name, id));
            }
        }
    };
});
requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.addBuffer('splunkjs/css/googlemap.css'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick;
// 

define('splunkjs/mvc/googlemapview',['require','exports','module','./mvc','./basesplunkview','./messages','async!http://maps.googleapis.com/maps/api/js?sensor=false','css!../css/googlemap.css'],function(require, exports, module) {
    var mvc = require('./mvc');
    var BaseSplunkView = require("./basesplunkview");
    var Messages = require("./messages");
    
    require("async!http://maps.googleapis.com/maps/api/js?sensor=false");
    require("css!../css/googlemap.css");

    var GoogleMapView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-googlemap",

        options: {
            managerid: null,
            data: "preview"
        },
        
        initialize: function() {
            this.configure();
            
            this.bindToComponent(this.settings.get("managerid"), this._onManagerChange, this);
            
            this.map = null;
            this.markers = [];
        },
        
        _onManagerChange: function(managers, manager) {
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
                this.message('no-search');
                return;
            }

            this.manager = manager;            
            this.resultsModel = manager.data(this.settings.get("data"), {
                output_mode: "json_rows"
            });
            manager.on("search:start", this._onSearchStart, this);
            manager.on("search:progress", this._onSearchProgress, this);
            manager.on("search:cancelled", this._onSearchCancelled, this);
            manager.on("search:error", this._onSearchError, this);
            this.resultsModel.on("data", this.render, this);
        },

        _onSearchCancelled: function() { 
            this.message('cancelled');
        },

        _onSearchError: function(message) {
            this.message({
                level: "warning",
                icon: "warning-sign",
                message: message
            });
        },

        _onSearchProgress: function(properties) {
            properties = properties || {};
            var content = properties.content || {};
            var previewCount = content.resultPreviewCount || 0;
            var isJobDone = content.isDone || false;
            
            if (previewCount === 0 && isJobDone) {
                this.message('no-results');
                return;
            }
            
            if (previewCount === 0) {
                this.message('waiting');
                return;
            }
        },

        _onSearchStart: function() { 
            this.message('waiting');
        },

        clearMarkers: function() {
            var count = this.markers.length;
            for (var i = 0; i < count; ++i)
                this.markers[i].setMap(null);
            this.markers.length = 0;
        },

        createMap: function() {
            this.map = new google.maps.Map(this.el, {
                center: new google.maps.LatLng(47.60, -122.32),
                zoom: 2,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            });
            this.map.setOptions(this.options);
        },

        message: function(info) {
            this.map = null;
            Messages.render(info, this.$el);
        },

        render: function() {
            if (!this.map)
                this.createMap();

            if (!this.resultsModel || !this.resultsModel.hasData()) {
                return this;
            }

            var that = this;
            this.clearMarkers();
            this.resultsModel.collection().each(function(row) {
                var lat = parseFloat(row.get("lat"));
                var lng = parseFloat(row.get("lng"));
                var latlng = new google.maps.LatLng(lat, lng);
                var marker = new google.maps.Marker({
                    position: latlng,
                    map: that.map
                });
                that.markers.push(marker);
            });

            return this;
        }
    });
    
    return GoogleMapView;
});

requirejs.s.contexts._.nextTick = function(f){f()}; require(['css'], function(css) { css.setBuffer('/*  */\n\n/* Bootstrap Css Map Fix*/\n.splunk-googlemap img { \n  max-width: none;\n}\n/* Bootstrap Css Map Fix*/\n.splunk-googlemap label { \n  width: auto; \n  display:inline; \n} \n/* Set a small height on the map so that it shows up*/\n.splunk-googlemap {\n    min-height: 100px;\n    height: 100%;\n}\n'); }); requirejs.s.contexts._.nextTick = requirejs.nextTick; 