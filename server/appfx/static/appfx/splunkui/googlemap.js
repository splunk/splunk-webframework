// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var AppFx = require('./appfx');
    var BaseControl = require("./basecontrol");
    var Messages = require("./messages");
    
    require("async!http://maps.googleapis.com/maps/api/js?sensor=false");
    require("css!./googlemap.css");

    var GoogleMap = BaseControl.extend({
        className: "appfx-googlemap",

        options: {
            contextid: null,
            datasource: "preview"
        },
        
        initialize: function() {
            this.configure();
            
            this.bindToComponent(this.settings.get("contextid"), this._onContextChange, this);
            
            this.map = null;
            this.markers = [];
        },
        
        _onContextChange: function(contexts, context) {
            if (this.context) {
                this.context.off(null, null, this);
                this.context = null;
            }
            if (this.datasource) {
                this.datasource.off(null, null, this);
                this.datasource.destroy();
                this.datasource = null;
            }

            if (!context) {
                this.message('no-search');
                return;
            }

            this.context = context;            
            this.datasource = context.data(this.settings.get("datasource"), {
                output_mode: "json_rows"
            });
            context.on("search:start", this._onSearchStart, this);
            context.on("search:progress", this._onSearchProgress, this);
            context.on("search:cancelled", this._onSearchCancelled, this);
            context.on("search:error", this._onSearchError, this);
            this.datasource.on("data", this.render, this);
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

            if (!this.datasource || !this.datasource.hasData()) {
                return this;
            }

            var that = this;
            this.clearMarkers();
            this.datasource.collection().each(function(row) {
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
    
    AppFx.Components.registerType('appfx-googlemap', GoogleMap);
    
    return GoogleMap;
});
