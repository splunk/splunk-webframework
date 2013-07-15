
define('splunk/charting/Legend',['require','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var Event = require("jgatt").events.Event;
	var EventData = require("jgatt").events.EventData;
	var MObservable = require("jgatt").events.MObservable;
	var MPropertyTarget = require("jgatt").properties.MPropertyTarget;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var ArrayUtils = require("jgatt").utils.ArrayUtils;
	var Dictionary = require("jgatt").utils.Dictionary;

	return jg_extend(Object, function(Legend, base)
	{

		base = jg_mixin(this, MObservable, base);
		base = jg_mixin(this, MPropertyTarget, base);

		// Public Events

		this.settingLabels = new Event("settingLabels", EventData);
		this.labelIndexMapChanged = new ChainedEvent("labelIndexMapChanged", this.changed);

		// Public Properties

		this.labels = new ObservableProperty("labels", Array, [])
			.readFilter(function(value)
			{
				return value.concat();
			})
			.writeFilter(function(value)
			{
				return value ? value.concat() : [];
			})
			.onChanged(function(e)
			{
				this._updateLabelMap();
			});

		// Private Properties

		this._targetMap = null;
		this._targetList = null;
		this._labelMap = null;
		this._labelList = null;
		this._isSettingLabels = false;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this._targetMap = new Dictionary();
			this._targetList = [];
			this._labelMap = {};
			this._labelList = [];
		};

		// Public Methods

		this.register = function(target)
		{
			if (target == null)
				throw new Error("Parameter target must be non-null.");

			var targetData = this._targetMap.get(target);
			if (targetData)
				return;

			targetData = { labels: null };
			this._targetMap.set(target, targetData);
			this._targetList.push(targetData);
		};

		this.unregister = function(target)
		{
			if (target == null)
				throw new Error("Parameter target must be non-null.");

			var targetData = this._targetMap.get(target);
			if (!targetData)
				return;

			var targetIndex = ArrayUtils.indexOf(this._targetList, targetData);
			if (targetIndex >= 0)
				this._targetList.splice(targetIndex, 1);
			this._targetMap.del(target);

			this._updateLabelMap();
		};

		this.setLabels = function(target, labels)
		{
			if (target == null)
				throw new Error("Parameter target must be non-null.");
			if ((labels != null) && !(labels instanceof Array))
				throw new Error("Parameter labels must be an array.");

			var targetData = this._targetMap.get(target);
			if (!targetData)
				return;

			targetData.labels = labels ? labels.concat() : null;

			this.notifySettingLabels();
		};

		this.getLabelIndex = function(label)
		{
			if (label == null)
				throw new Error("Parameter label must be non-null.");
			if (typeof label !== "string")
				throw new Error("Parameter label must be a string.");

			var index = this.getLabelIndexOverride(label);
			if (index < 0)
			{
				var labelIndex = this._labelMap[label];
				index = (labelIndex != null) ? labelIndex : -1;
			}
			return index;
		};

		this.getNumLabels = function()
		{
			var value = this.getNumLabelsOverride();
			if (value < 0)
				value = this._labelList.length;
			return value;
		};

		this.notifySettingLabels = function()
		{
			if (this._isSettingLabels)
				return;

			try
			{
				this._isSettingLabels = true;
				this.dispatchEvent(this.settingLabels, new EventData());
				this._updateLabelMap();
			}
			finally
			{
				this._isSettingLabels = false;
			}
		};

		this.notifyLabelIndexMapChanged = function()
		{
			this.dispatchEvent(this.labelIndexMapChanged, new EventData());
		};

		// Protected Methods

		this.getNumLabelsOverride = function()
		{
			return -1;
		};

		this.getLabelIndexOverride = function(label)
		{
			return -1;
		};

		this.updateLabelsOverride = function(labels)
		{
			return false;
		};

		// Private Methods

		this._updateLabelMap = function()
		{
			var currentLabelList = this._labelList;
			var changed = false;

			var labelMap = {};
			var labelList = [];

			var targetList = this._targetList;
			var targetData;
			var targetLabels;
			var targetLabel;

			var i;
			var j;
			var l;
			var m;

			targetLabels = this.getInternal(this.labels);
			for (i = 0, l = targetLabels.length; i < l; i++)
			{
				targetLabel = String(targetLabels[i]);
				if (labelMap[targetLabel] == null)
				{
					labelMap[targetLabel] = labelList.length;
					labelList.push(targetLabel);
				}
			}

			for (i = 0, l = targetList.length; i < l; i++)
			{
				targetData = targetList[i];
				targetLabels = targetData.labels;
				if (targetLabels)
				{
					for (j = 0, m = targetLabels.length; j < m; j++)
					{
						targetLabel = String(targetLabels[j]);
						if (labelMap[targetLabel] == null)
						{
							labelMap[targetLabel] = labelList.length;
							labelList.push(targetLabel);
						}
					}
				}
			}

			if (labelList.length != currentLabelList.length)
			{
				changed = true;
			}
			else
			{
				for (i = 0, l = labelList.length; i < l; i++)
				{
					if (labelList[i] !== currentLabelList[i])
					{
						changed = true;
						break;
					}
				}
			}

			if (changed)
			{
				this._labelMap = labelMap;
				this._labelList = labelList;

				if (!this.updateLabelsOverride(labelList.concat()))
					this.notifyLabelIndexMapChanged();
			}
		};

	});

});

define('splunk/charting/ExternalLegend',['require','splunk.legend','jg_global','jgatt','splunk/charting/Legend'],function(require)
{

	var SplunkLegend = require("splunk.legend");
	var jg_extend = require("jg_global").jg_extend;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var Legend = require("splunk/charting/Legend");

	return jg_extend(Legend, function(ExternalLegend, base)
	{

		// Private Static Properties

		var _instanceCount = 0;

		// Private Properties

		this._id = null;
		this._isConnected = false;
		this._cachedExternalNumLabels = -1;
		this._cachedExternalLabelMap = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this._external_setLabels = FunctionUtils.bind(this._external_setLabels, this);
			this._external_labelIndexMapChanged = FunctionUtils.bind(this._external_labelIndexMapChanged, this);

			this._id = "splunk-charting-ExternalLegend-" + (++_instanceCount);
		};

		// Public Methods

		this.connect = function()
		{
			this.close();

			SplunkLegend.register(this._id);
			SplunkLegend.addEventListener("setLabels", this._external_setLabels);
			SplunkLegend.addEventListener("labelIndexMapChanged", this._external_labelIndexMapChanged);

			this._isConnected = true;
		};

		this.close = function()
		{
			if (!this._isConnected)
				return;

			this._isConnected = false;

			SplunkLegend.removeEventListener("labelIndexMapChanged", this._external_labelIndexMapChanged);
			SplunkLegend.removeEventListener("setLabels", this._external_setLabels);
			SplunkLegend.unregister(this._id);
		};

		this.isConnected = function()
		{
			return this._isConnected;
		};

		// Protected Methods

		this.getNumLabelsOverride = function()
		{
			if (this._isConnected)
			{
				var value = this._cachedExternalNumLabels;
				if (value < 0)
					value = this._cachedExternalNumLabels = SplunkLegend.numLabels();
				return value;
			}

			return -1;
		};

		this.getLabelIndexOverride = function(label)
		{
			if (this._isConnected)
			{
				var labelMap = this._cachedExternalLabelMap;
				if (!labelMap)
					labelMap = this._cachedExternalLabelMap = {};
				var index = labelMap[label];
				if (index == null)
					index = labelMap[label] = SplunkLegend.getLabelIndex(label);
				return index;
			}

			return -1;
		};

		this.updateLabelsOverride = function(labels)
		{
			if (this._isConnected)
			{
				this._cachedExternalNumLabels = -1;
				this._cachedExternalLabelMap = null;
				SplunkLegend.setLabels(this._id, labels);
				return true;
			}

			return false;
		};

		// Private Methods

		this._external_setLabels = function()
		{
			this.notifySettingLabels();
		};

		this._external_labelIndexMapChanged = function()
		{
			this._cachedExternalNumLabels = -1;
			this._cachedExternalLabelMap = null;

			this.notifyLabelIndexMapChanged();
		};

	});

});

define('contrib/text!contrib/leaflet/leaflet.css',[],function () { return '/* required styles */\n\n.leaflet-map-pane,\n.leaflet-tile,\n.leaflet-marker-icon,\n.leaflet-marker-shadow,\n.leaflet-tile-pane,\n.leaflet-overlay-pane,\n.leaflet-shadow-pane,\n.leaflet-marker-pane,\n.leaflet-popup-pane,\n.leaflet-overlay-pane svg,\n.leaflet-zoom-box,\n.leaflet-image-layer,\n.leaflet-layer { /* TODO optimize classes */\n\tposition: absolute;\n\t}\n.leaflet-container {\n\toverflow: hidden;\n\toutline: 0;\n\t}\n.leaflet-tile,\n.leaflet-marker-icon,\n.leaflet-marker-shadow {\n\t-moz-user-select: none;\n\t-webkit-user-select: none;\n\tuser-select: none;\n\t}\n.leaflet-marker-icon,\n.leaflet-marker-shadow {\n\tdisplay: block;\n\t}\n.leaflet-clickable {\n\tcursor: pointer;\n\t}\n.leaflet-dragging, .leaflet-dragging .leaflet-clickable {\n\tcursor: move;\n\t}\n.leaflet-container img {\n    /* map is broken in FF if you have max-width: 100% on tiles */\n\tmax-width: none !important;\n\t}\n.leaflet-container img.leaflet-image-layer {\n    /* stupid Android 2 doesn\'t understand "max-width: none" properly */\n    max-width: 15000px !important;\n    }\n\n.leaflet-tile-pane { z-index: 2; }\n.leaflet-objects-pane { z-index: 3; }\n.leaflet-overlay-pane { z-index: 4; }\n.leaflet-shadow-pane { z-index: 5; }\n.leaflet-marker-pane { z-index: 6; }\n.leaflet-popup-pane { z-index: 7; }\n\n.leaflet-tile {\n    filter: inherit;\n    visibility: hidden;\n\t}\n.leaflet-tile-loaded {\n\tvisibility: inherit;\n\t}\n\n.leaflet-zoom-box {\n    width: 0;\n    height: 0;\n    }\n\n/* Leaflet controls */\n\n.leaflet-control {\n\tposition: relative;\n\tz-index: 7;\n\tpointer-events: auto;\n\t}\n.leaflet-top,\n.leaflet-bottom {\n\tposition: absolute;\n\tz-index: 1000;\n\tpointer-events: none;\n\t}\n.leaflet-top {\n\ttop: 0;\n\t}\n.leaflet-right {\n\tright: 0;\n\t}\n.leaflet-bottom {\n\tbottom: 0;\n\t}\n.leaflet-left {\n\tleft: 0;\n\t}\n.leaflet-control {\n\tfloat: left;\n\tclear: both;\n\t}\n.leaflet-right .leaflet-control {\n\tfloat: right;\n\t}\n.leaflet-top .leaflet-control {\n\tmargin-top: 10px;\n\t}\n.leaflet-bottom .leaflet-control {\n\tmargin-bottom: 10px;\n\t}\n.leaflet-left .leaflet-control {\n\tmargin-left: 10px;\n\t}\n.leaflet-right .leaflet-control {\n\tmargin-right: 10px;\n\t}\n\n.leaflet-control-zoom {\n\t-moz-border-radius: 7px;\n\t-webkit-border-radius: 7px;\n\tborder-radius: 7px;\n\t}\n.leaflet-control-zoom {\n\tpadding: 5px;\n\tbackground: rgba(0, 0, 0, 0.25);\n\t}\n.leaflet-control-zoom a {\n\tbackground-color: rgba(255, 255, 255, 0.75);\n\t}\n.leaflet-control-zoom a, .leaflet-control-layers a {\n\tbackground-position: 50% 50%;\n\tbackground-repeat: no-repeat;\n\tdisplay: block;\n\t}\n.leaflet-control-zoom a {\n\t-moz-border-radius: 4px;\n\t-webkit-border-radius: 4px;\n\tborder-radius: 4px;\n\twidth: 19px;\n\theight: 19px;\n\t}\n.leaflet-control-zoom a:hover {\n\tbackground-color: #fff;\n\t}\n.leaflet-touch .leaflet-control-zoom a {\n\twidth: 27px;\n\theight: 27px;\n\t}\n.leaflet-control-zoom-in {\n\tbackground-image: url(images/zoom-in.png);\n\tmargin-bottom: 5px;\n\t}\n.leaflet-control-zoom-out {\n\tbackground-image: url(images/zoom-out.png);\n\t}\n\n.leaflet-control-layers {\n\tbox-shadow: 0 1px 7px #999;\n\tbackground: #f8f8f9;\n\t-moz-border-radius: 8px;\n\t-webkit-border-radius: 8px;\n\tborder-radius: 8px;\n\t}\n.leaflet-control-layers a {\n\tbackground-image: url(images/layers.png);\n\twidth: 36px;\n\theight: 36px;\n\t}\n.leaflet-touch .leaflet-control-layers a {\n\twidth: 44px;\n\theight: 44px;\n\t}\n.leaflet-control-layers .leaflet-control-layers-list,\n.leaflet-control-layers-expanded .leaflet-control-layers-toggle {\n\tdisplay: none;\n\t}\n.leaflet-control-layers-expanded .leaflet-control-layers-list {\n\tdisplay: block;\n\tposition: relative;\n\t}\n.leaflet-control-layers-expanded {\n\tpadding: 6px 10px 6px 6px;\n\tfont: 12px/1.5 "Helvetica Neue", Arial, Helvetica, sans-serif;\n\tcolor: #333;\n\tbackground: #fff;\n\t}\n.leaflet-control-layers input {\n\tmargin-top: 2px;\n\tposition: relative;\n\ttop: 1px;\n\t}\n.leaflet-control-layers label {\n\tdisplay: block;\n\t}\n.leaflet-control-layers-separator {\n\theight: 0;\n\tborder-top: 1px solid #ddd;\n\tmargin: 5px -10px 5px -6px;\n\t}\n\n.leaflet-container .leaflet-control-attribution {\n\tbackground-color: rgba(255, 255, 255, 0.7);\n\tbox-shadow: 0 0 5px #bbb;\n\tmargin: 0;\n    }\n\n.leaflet-control-attribution,\n.leaflet-control-scale-line {\n\tpadding: 0 5px;\n\tcolor: #333;\n\t}\n\n.leaflet-container .leaflet-control-attribution,\n.leaflet-container .leaflet-control-scale {\n\tfont: 11px/1.5 "Helvetica Neue", Arial, Helvetica, sans-serif;\n\t}\n\n.leaflet-left .leaflet-control-scale {\n\tmargin-left: 5px;\n\t}\n.leaflet-bottom .leaflet-control-scale {\n\tmargin-bottom: 5px;\n\t}\n\n.leaflet-control-scale-line {\n\tborder: 2px solid #777;\n\tborder-top: none;\n\tcolor: black;\n\tline-height: 1;\n\tfont-size: 10px;\n\tpadding-bottom: 2px;\n\ttext-shadow: 1px 1px 1px #fff;\n\tbackground-color: rgba(255, 255, 255, 0.5);\n\t}\n.leaflet-control-scale-line:not(:first-child) {\n\tborder-top: 2px solid #777;\n\tpadding-top: 1px;\n\tborder-bottom: none;\n\tmargin-top: -2px;\n\t}\n.leaflet-control-scale-line:not(:first-child):not(:last-child) {\n\tborder-bottom: 2px solid #777;\n\t}\n\n.leaflet-touch .leaflet-control-attribution, .leaflet-touch .leaflet-control-layers {\n\tbox-shadow: none;\n\t}\n.leaflet-touch .leaflet-control-layers {\n\tborder: 5px solid #bbb;\n\t}\n\n\n/* Zoom and fade animations */\n\n.leaflet-fade-anim .leaflet-tile, .leaflet-fade-anim .leaflet-popup {\n\topacity: 0;\n\n\t-webkit-transition: opacity 0.2s linear;\n\t-moz-transition: opacity 0.2s linear;\n\t-o-transition: opacity 0.2s linear;\n\ttransition: opacity 0.2s linear;\n\t}\n.leaflet-fade-anim .leaflet-tile-loaded, .leaflet-fade-anim .leaflet-map-pane .leaflet-popup {\n\topacity: 1;\n\t}\n\n.leaflet-zoom-anim .leaflet-zoom-animated {\n\t-webkit-transition: -webkit-transform 0.25s cubic-bezier(0.25,0.1,0.25,0.75);\n\t-moz-transition: -moz-transform 0.25s cubic-bezier(0.25,0.1,0.25,0.75);\n\t-o-transition: -o-transform 0.25s cubic-bezier(0.25,0.1,0.25,0.75);\n\ttransition: transform 0.25s cubic-bezier(0.25,0.1,0.25,0.75);\n\t}\n\n.leaflet-zoom-anim .leaflet-tile,\n.leaflet-pan-anim .leaflet-tile,\n.leaflet-touching .leaflet-zoom-animated {\n    -webkit-transition: none;\n    -moz-transition: none;\n    -o-transition: none;\n    transition: none;\n    }\n\n.leaflet-zoom-anim .leaflet-zoom-hide {\n\tvisibility: hidden;\n\t}\n\n\n/* Popup layout */\n\n.leaflet-popup {\n\tposition: absolute;\n\ttext-align: center;\n\t}\n.leaflet-popup-content-wrapper {\n\tpadding: 1px;\n\ttext-align: left;\n\t}\n.leaflet-popup-content {\n\tmargin: 14px 20px;\n\t}\n.leaflet-popup-tip-container {\n\tmargin: 0 auto;\n\twidth: 40px;\n\theight: 20px;\n\tposition: relative;\n\toverflow: hidden;\n\t}\n.leaflet-popup-tip {\n\twidth: 15px;\n\theight: 15px;\n\tpadding: 1px;\n\n\tmargin: -8px auto 0;\n\n\t-moz-transform: rotate(45deg);\n\t-webkit-transform: rotate(45deg);\n\t-ms-transform: rotate(45deg);\n\t-o-transform: rotate(45deg);\n\ttransform: rotate(45deg);\n\t}\n.leaflet-container a.leaflet-popup-close-button {\n\tposition: absolute;\n\ttop: 0;\n\tright: 0;\n\tpadding: 4px 5px 0 0;\n\ttext-align: center;\n\twidth: 18px;\n\theight: 14px;\n\tfont: 16px/14px Tahoma, Verdana, sans-serif;\n\tcolor: #c3c3c3;\n\ttext-decoration: none;\n\tfont-weight: bold;\n\t}\n.leaflet-container a.leaflet-popup-close-button:hover {\n\tcolor: #999;\n\t}\n.leaflet-popup-content p {\n\tmargin: 18px 0;\n\t}\n.leaflet-popup-scrolled {\n\toverflow: auto;\n\tborder-bottom: 1px solid #ddd;\n\tborder-top: 1px solid #ddd;\n\t}\n\n\n/* Visual appearance */\n\n.leaflet-container {\n\tbackground: #ddd;\n\t}\n.leaflet-container a {\n\tcolor: #0078A8;\n\t}\n.leaflet-container a.leaflet-active {\n    outline: 2px solid orange;\n    }\n.leaflet-zoom-box {\n\tborder: 2px dotted #05f;\n\tbackground: white;\n\topacity: 0.5;\n\t}\n.leaflet-div-icon {\n    background: #fff;\n    border: 1px solid #666;\n    }\n.leaflet-editing-icon {\n    border-radius: 2px;\n    }\n.leaflet-popup-content-wrapper, .leaflet-popup-tip {\n\tbackground: white;\n\n\tbox-shadow: 0 3px 10px #888;\n\t-moz-box-shadow: 0 3px 10px #888;\n\t-webkit-box-shadow: 0 3px 14px #999;\n\t}\n.leaflet-popup-content-wrapper {\n\t-moz-border-radius: 20px;\n\t-webkit-border-radius: 20px;\n\tborder-radius: 20px;\n\t}\n.leaflet-popup-content {\n\tfont: 12px/1.4 "Helvetica Neue", Arial, Helvetica, sans-serif;\n\t}\n';});

define('contrib/text!contrib/leaflet/leaflet.ie.css',[],function () { return '.leaflet-vml-shape {\n\twidth: 1px;\n\theight: 1px;\n\t}\n.lvml {\n\tbehavior: url(#default#VML); \n\tdisplay: inline-block; \n\tposition: absolute;\n\t}\n\t\n.leaflet-control {\n\tdisplay: inline;\n\t}\n\n.leaflet-popup-tip {\n\twidth: 21px;\n\t_width: 27px;\n\tmargin: 0 auto;\n\t_margin-top: -3px;\n\t\n\tfilter: progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678);\n\t-ms-filter: "progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678)";\n\t}\n.leaflet-popup-tip-container {\n\tmargin-top: -1px;\n\t}\n.leaflet-popup-content-wrapper, .leaflet-popup-tip {\n\tborder: 1px solid #bbb;\n\t}\n.leaflet-popup-content-wrapper {\n\tzoom: 1;\n\t}\n\n.leaflet-control-zoom {\n\tfilter: progid:DXImageTransform.Microsoft.gradient(startColorStr=\'#3F000000\',EndColorStr=\'#3F000000\');\n\t}\n.leaflet-control-zoom a {\n\tbackground-color: #eee;\n\t}\n.leaflet-control-zoom a:hover {\n\tbackground-color: #fff;\n\t}\n.leaflet-control-layers-toggle {\n\t}\n.leaflet-control-attribution, .leaflet-control-layers {\n\tbackground: white;\n\t}';});

/*
 Copyright (c) 2010-2012, CloudMade, Vladimir Agafonkin
 Leaflet is an open-source JavaScript library for mobile-friendly interactive maps.
 http://leaflet.cloudmade.com
*/
(function(e,t){var n,r;typeof exports!=t+""?n=exports:(r=e.L,n={},n.noConflict=function(){return e.L=r,this},e.L=n),n.version="0.4.5",n.Util={extend:function(e){var t=Array.prototype.slice.call(arguments,1);for(var n=0,r=t.length,i;n<r;n++){i=t[n]||{};for(var s in i)i.hasOwnProperty(s)&&(e[s]=i[s])}return e},bind:function(e,t){var n=arguments.length>2?Array.prototype.slice.call(arguments,2):null;return function(){return e.apply(t,n||arguments)}},stamp:function(){var e=0,t="_leaflet_id";return function(n){return n[t]=n[t]||++e,n[t]}}(),limitExecByInterval:function(e,t,n){var r,i;return function s(){var o=arguments;if(r){i=!0;return}r=!0,setTimeout(function(){r=!1,i&&(s.apply(n,o),i=!1)},t),e.apply(n,o)}},falseFn:function(){return!1},formatNum:function(e,t){var n=Math.pow(10,t||5);return Math.round(e*n)/n},splitWords:function(e){return e.replace(/^\s+|\s+$/g,"").split(/\s+/)},setOptions:function(e,t){return e.options=n.Util.extend({},e.options,t),e.options},getParamString:function(e){var t=[];for(var n in e)e.hasOwnProperty(n)&&t.push(n+"="+e[n]);return"?"+t.join("&")},template:function(e,t){return e.replace(/\{ *([\w_]+) *\}/g,function(e,n){var r=t[n];if(!t.hasOwnProperty(n))throw Error("No value provided for variable "+e);return r})},emptyImageUrl:"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="},function(){function t(t){var n,r,i=["webkit","moz","o","ms"];for(n=0;n<i.length&&!r;n++)r=e[i[n]+t];return r}function r(t){return e.setTimeout(t,1e3/60)}var i=e.requestAnimationFrame||t("RequestAnimationFrame")||r,s=e.cancelAnimationFrame||t("CancelAnimationFrame")||t("CancelRequestAnimationFrame")||function(t){e.clearTimeout(t)};n.Util.requestAnimFrame=function(t,s,o,u){t=n.Util.bind(t,s);if(!o||i!==r)return i.call(e,t,u);t()},n.Util.cancelAnimFrame=function(t){t&&s.call(e,t)}}(),n.Class=function(){},n.Class.extend=function(e){var t=function(){this.initialize&&this.initialize.apply(this,arguments)},r=function(){};r.prototype=this.prototype;var i=new r;i.constructor=t,t.prototype=i;for(var s in this)this.hasOwnProperty(s)&&s!=="prototype"&&(t[s]=this[s]);return e.statics&&(n.Util.extend(t,e.statics),delete e.statics),e.includes&&(n.Util.extend.apply(null,[i].concat(e.includes)),delete e.includes),e.options&&i.options&&(e.options=n.Util.extend({},i.options,e.options)),n.Util.extend(i,e),t},n.Class.include=function(e){n.Util.extend(this.prototype,e)},n.Class.mergeOptions=function(e){n.Util.extend(this.prototype.options,e)};var i="_leaflet_events";n.Mixin={},n.Mixin.Events={addEventListener:function(e,t,r){var s=this[i]=this[i]||{},o,u,a;if(typeof e=="object"){for(o in e)e.hasOwnProperty(o)&&this.addEventListener(o,e[o],t);return this}e=n.Util.splitWords(e);for(u=0,a=e.length;u<a;u++)s[e[u]]=s[e[u]]||[],s[e[u]].push({action:t,context:r||this});return this},hasEventListeners:function(e){return i in this&&e in this[i]&&this[i][e].length>0},removeEventListener:function(e,t,r){var s=this[i],o,u,a,f,l;if(typeof e=="object"){for(o in e)e.hasOwnProperty(o)&&this.removeEventListener(o,e[o],t);return this}e=n.Util.splitWords(e);for(u=0,a=e.length;u<a;u++)if(this.hasEventListeners(e[u])){f=s[e[u]];for(l=f.length-1;l>=0;l--)(!t||f[l].action===t)&&(!r||f[l].context===r)&&f.splice(l,1)}return this},fireEvent:function(e,t){if(!this.hasEventListeners(e))return this;var r=n.Util.extend({type:e,target:this},t),s=this[i][e].slice();for(var o=0,u=s.length;o<u;o++)s[o].action.call(s[o].context||this,r);return this}},n.Mixin.Events.on=n.Mixin.Events.addEventListener,n.Mixin.Events.off=n.Mixin.Events.removeEventListener,n.Mixin.Events.fire=n.Mixin.Events.fireEvent,function(){var r=navigator.userAgent.toLowerCase(),i=!!e.ActiveXObject,s=i&&!e.XMLHttpRequest,o=r.indexOf("webkit")!==-1,u=r.indexOf("gecko")!==-1,a=r.indexOf("chrome")!==-1,f=e.opera,l=r.indexOf("android")!==-1,c=r.search("android [23]")!==-1,h=typeof orientation!=t+""?!0:!1,p=document.documentElement,d=i&&"transition"in p.style,v=o&&"WebKitCSSMatrix"in e&&"m11"in new e.WebKitCSSMatrix,m=u&&"MozPerspective"in p.style,g=f&&"OTransition"in p.style,y=!e.L_NO_TOUCH&&function(){var e="ontouchstart";if(e in p)return!0;var t=document.createElement("div"),n=!1;return t.setAttribute?(t.setAttribute(e,"return;"),typeof t[e]=="function"&&(n=!0),t.removeAttribute(e),t=null,n):!1}(),b="devicePixelRatio"in e&&e.devicePixelRatio>1||"matchMedia"in e&&e.matchMedia("(min-resolution:144dpi)").matches;n.Browser={ua:r,ie:i,ie6:s,webkit:o,gecko:u,opera:f,android:l,android23:c,chrome:a,ie3d:d,webkit3d:v,gecko3d:m,opera3d:g,any3d:!e.L_DISABLE_3D&&(d||v||m||g),mobile:h,mobileWebkit:h&&o,mobileWebkit3d:h&&v,mobileOpera:h&&f,touch:y,retina:b}}(),n.Point=function(e,t,n){this.x=n?Math.round(e):e,this.y=n?Math.round(t):t},n.Point.prototype={add:function(e){return this.clone()._add(n.point(e))},_add:function(e){return this.x+=e.x,this.y+=e.y,this},subtract:function(e){return this.clone()._subtract(n.point(e))},_subtract:function(e){return this.x-=e.x,this.y-=e.y,this},divideBy:function(e,t){return new n.Point(this.x/e,this.y/e,t)},multiplyBy:function(e,t){return new n.Point(this.x*e,this.y*e,t)},distanceTo:function(e){e=n.point(e);var t=e.x-this.x,r=e.y-this.y;return Math.sqrt(t*t+r*r)},round:function(){return this.clone()._round()},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},floor:function(){return this.clone()._floor()},_floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},clone:function(){return new n.Point(this.x,this.y)},toString:function(){return"Point("+n.Util.formatNum(this.x)+", "+n.Util.formatNum(this.y)+")"}},n.point=function(e,t,r){return e instanceof n.Point?e:e instanceof Array?new n.Point(e[0],e[1]):isNaN(e)?e:new n.Point(e,t,r)},n.Bounds=n.Class.extend({initialize:function(e,t){if(!e)return;var n=t?[e,t]:e;for(var r=0,i=n.length;r<i;r++)this.extend(n[r])},extend:function(e){return e=n.point(e),!this.min&&!this.max?(this.min=e.clone(),this.max=e.clone()):(this.min.x=Math.min(e.x,this.min.x),this.max.x=Math.max(e.x,this.max.x),this.min.y=Math.min(e.y,this.min.y),this.max.y=Math.max(e.y,this.max.y)),this},getCenter:function(e){return new n.Point((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,e)},getBottomLeft:function(){return new n.Point(this.min.x,this.max.y)},getTopRight:function(){return new n.Point(this.max.x,this.min.y)},contains:function(e){var t,r;return typeof e[0]=="number"||e instanceof n.Point?e=n.point(e):e=n.bounds(e),e instanceof n.Bounds?(t=e.min,r=e.max):t=r=e,t.x>=this.min.x&&r.x<=this.max.x&&t.y>=this.min.y&&r.y<=this.max.y},intersects:function(e){e=n.bounds(e);var t=this.min,r=this.max,i=e.min,s=e.max,o=s.x>=t.x&&i.x<=r.x,u=s.y>=t.y&&i.y<=r.y;return o&&u}}),n.bounds=function(e,t){return!e||e instanceof n.Bounds?e:new n.Bounds(e,t)},n.Transformation=n.Class.extend({initialize:function(e,t,n,r){this._a=e,this._b=t,this._c=n,this._d=r},transform:function(e,t){return this._transform(e.clone(),t)},_transform:function(e,t){return t=t||1,e.x=t*(this._a*e.x+this._b),e.y=t*(this._c*e.y+this._d),e},untransform:function(e,t){return t=t||1,new n.Point((e.x/t-this._b)/this._a,(e.y/t-this._d)/this._c)}}),n.DomUtil={get:function(e){return typeof e=="string"?document.getElementById(e):e},getStyle:function(e,t){var n=e.style[t];!n&&e.currentStyle&&(n=e.currentStyle[t]);if(!n||n==="auto"){var r=document.defaultView.getComputedStyle(e,null);n=r?r[t]:null}return n==="auto"?null:n},getViewportOffset:function(e){var t=0,r=0,i=e,s=document.body;do{t+=i.offsetTop||0,r+=i.offsetLeft||0;if(i.offsetParent===s&&n.DomUtil.getStyle(i,"position")==="absolute")break;if(n.DomUtil.getStyle(i,"position")==="fixed"){t+=s.scrollTop||0,r+=s.scrollLeft||0;break}i=i.offsetParent}while(i);i=e;do{if(i===s)break;t-=i.scrollTop||0,r-=i.scrollLeft||0,i=i.parentNode}while(i);return new n.Point(r,t)},create:function(e,t,n){var r=document.createElement(e);return r.className=t,n&&n.appendChild(r),r},disableTextSelection:function(){document.selection&&document.selection.empty&&document.selection.empty(),this._onselectstart||(this._onselectstart=document.onselectstart,document.onselectstart=n.Util.falseFn)},enableTextSelection:function(){document.onselectstart=this._onselectstart,this._onselectstart=null},hasClass:function(e,t){return e.className.length>0&&RegExp("(^|\\s)"+t+"(\\s|$)").test(e.className)},addClass:function(e,t){n.DomUtil.hasClass(e,t)||(e.className+=(e.className?" ":"")+t)},removeClass:function(e,t){function n(e,n){return n===t?"":e}e.className=e.className.replace(/(\S+)\s*/g,n).replace(/(^\s+|\s+$)/,"")},setOpacity:function(e,t){if("opacity"in e.style)e.style.opacity=t;else if(n.Browser.ie){var r=!1,i="DXImageTransform.Microsoft.Alpha";try{r=e.filters.item(i)}catch(s){}t=Math.round(t*100),r?(r.Enabled=t!==100,r.Opacity=t):e.style.filter+=" progid:"+i+"(opacity="+t+")"}},testProp:function(e){var t=document.documentElement.style;for(var n=0;n<e.length;n++)if(e[n]in t)return e[n];return!1},getTranslateString:function(e){var t=n.Browser.webkit3d,r="translate"+(t?"3d":"")+"(",i=(t?",0":"")+")";return r+e.x+"px,"+e.y+"px"+i},getScaleString:function(e,t){var r=n.DomUtil.getTranslateString(t.add(t.multiplyBy(-1*e))),i=" scale("+e+") ";return r+i},setPosition:function(e,t,r){e._leaflet_pos=t,!r&&n.Browser.any3d?(e.style[n.DomUtil.TRANSFORM]=n.DomUtil.getTranslateString(t),n.Browser.mobileWebkit3d&&(e.style.WebkitBackfaceVisibility="hidden")):(e.style.left=t.x+"px",e.style.top=t.y+"px")},getPosition:function(e){return e._leaflet_pos}},n.Util.extend(n.DomUtil,{TRANSITION:n.DomUtil.testProp(["transition","webkitTransition","OTransition","MozTransition","msTransition"]),TRANSFORM:n.DomUtil.testProp(["transform","WebkitTransform","OTransform","MozTransform","msTransform"])}),n.LatLng=function(e,t,n){var r=parseFloat(e),i=parseFloat(t);if(isNaN(r)||isNaN(i))throw Error("Invalid LatLng object: ("+e+", "+t+")");n!==!0&&(r=Math.max(Math.min(r,90),-90),i=(i+180)%360+(i<-180||i===180?180:-180)),this.lat=r,this.lng=i},n.Util.extend(n.LatLng,{DEG_TO_RAD:Math.PI/180,RAD_TO_DEG:180/Math.PI,MAX_MARGIN:1e-9}),n.LatLng.prototype={equals:function(e){if(!e)return!1;e=n.latLng(e);var t=Math.max(Math.abs(this.lat-e.lat),Math.abs(this.lng-e.lng));return t<=n.LatLng.MAX_MARGIN},toString:function(){return"LatLng("+n.Util.formatNum(this.lat)+", "+n.Util.formatNum(this.lng)+")"},distanceTo:function(e){e=n.latLng(e);var t=6378137,r=n.LatLng.DEG_TO_RAD,i=(e.lat-this.lat)*r,s=(e.lng-this.lng)*r,o=this.lat*r,u=e.lat*r,a=Math.sin(i/2),f=Math.sin(s/2),l=a*a+f*f*Math.cos(o)*Math.cos(u);return t*2*Math.atan2(Math.sqrt(l),Math.sqrt(1-l))}},n.latLng=function(e,t,r){return e instanceof n.LatLng?e:e instanceof Array?new n.LatLng(e[0],e[1]):isNaN(e)?e:new n.LatLng(e,t,r)},n.LatLngBounds=n.Class.extend({initialize:function(e,t){if(!e)return;var n=t?[e,t]:e;for(var r=0,i=n.length;r<i;r++)this.extend(n[r])},extend:function(e){return typeof e[0]=="number"||e instanceof n.LatLng?e=n.latLng(e):e=n.latLngBounds(e),e instanceof n.LatLng?!this._southWest&&!this._northEast?(this._southWest=new n.LatLng(e.lat,e.lng,!0),this._northEast=new n.LatLng(e.lat,e.lng,!0)):(this._southWest.lat=Math.min(e.lat,this._southWest.lat),this._southWest.lng=Math.min(e.lng,this._southWest.lng),this._northEast.lat=Math.max(e.lat,this._northEast.lat),this._northEast.lng=Math.max(e.lng,this._northEast.lng)):e instanceof n.LatLngBounds&&(this.extend(e._southWest),this.extend(e._northEast)),this},pad:function(e){var t=this._southWest,r=this._northEast,i=Math.abs(t.lat-r.lat)*e,s=Math.abs(t.lng-r.lng)*e;return new n.LatLngBounds(new n.LatLng(t.lat-i,t.lng-s),new n.LatLng(r.lat+i,r.lng+s))},getCenter:function(){return new n.LatLng((this._southWest.lat+this._northEast.lat)/2,(this._southWest.lng+this._northEast.lng)/2)},getSouthWest:function(){return this._southWest},getNorthEast:function(){return this._northEast},getNorthWest:function(){return new n.LatLng(this._northEast.lat,this._southWest.lng,!0)},getSouthEast:function(){return new n.LatLng(this._southWest.lat,this._northEast.lng,!0)},contains:function(e){typeof e[0]=="number"||e instanceof n.LatLng?e=n.latLng(e):e=n.latLngBounds(e);var t=this._southWest,r=this._northEast,i,s;return e instanceof n.LatLngBounds?(i=e.getSouthWest(),s=e.getNorthEast()):i=s=e,i.lat>=t.lat&&s.lat<=r.lat&&i.lng>=t.lng&&s.lng<=r.lng},intersects:function(e){e=n.latLngBounds(e);var t=this._southWest,r=this._northEast,i=e.getSouthWest(),s=e.getNorthEast(),o=s.lat>=t.lat&&i.lat<=r.lat,u=s.lng>=t.lng&&i.lng<=r.lng;return o&&u},toBBoxString:function(){var e=this._southWest,t=this._northEast;return[e.lng,e.lat,t.lng,t.lat].join(",")},equals:function(e){return e?(e=n.latLngBounds(e),this._southWest.equals(e.getSouthWest())&&this._northEast.equals(e.getNorthEast())):!1}}),n.latLngBounds=function(e,t){return!e||e instanceof n.LatLngBounds?e:new n.LatLngBounds(e,t)},n.Projection={},n.Projection.SphericalMercator={MAX_LATITUDE:85.0511287798,project:function(e){var t=n.LatLng.DEG_TO_RAD,r=this.MAX_LATITUDE,i=Math.max(Math.min(r,e.lat),-r),s=e.lng*t,o=i*t;return o=Math.log(Math.tan(Math.PI/4+o/2)),new n.Point(s,o)},unproject:function(e){var t=n.LatLng.RAD_TO_DEG,r=e.x*t,i=(2*Math.atan(Math.exp(e.y))-Math.PI/2)*t;return new n.LatLng(i,r,!0)}},n.Projection.LonLat={project:function(e){return new n.Point(e.lng,e.lat)},unproject:function(e){return new n.LatLng(e.y,e.x,!0)}},n.CRS={latLngToPoint:function(e,t){var n=this.projection.project(e),r=this.scale(t);return this.transformation._transform(n,r)},pointToLatLng:function(e,t){var n=this.scale(t),r=this.transformation.untransform(e,n);return this.projection.unproject(r)},project:function(e){return this.projection.project(e)},scale:function(e){return 256*Math.pow(2,e)}},n.CRS.EPSG3857=n.Util.extend({},n.CRS,{code:"EPSG:3857",projection:n.Projection.SphericalMercator,transformation:new n.Transformation(.5/Math.PI,.5,-0.5/Math.PI,.5),project:function(e){var t=this.projection.project(e),n=6378137;return t.multiplyBy(n)}}),n.CRS.EPSG900913=n.Util.extend({},n.CRS.EPSG3857,{code:"EPSG:900913"}),n.CRS.EPSG4326=n.Util.extend({},n.CRS,{code:"EPSG:4326",projection:n.Projection.LonLat,transformation:new n.Transformation(1/360,.5,-1/360,.5)}),n.Map=n.Class.extend({includes:n.Mixin.Events,options:{crs:n.CRS.EPSG3857,fadeAnimation:n.DomUtil.TRANSITION&&!n.Browser.android23,trackResize:!0,markerZoomAnimation:n.DomUtil.TRANSITION&&n.Browser.any3d},initialize:function(e,r){r=n.Util.setOptions(this,r),this._initContainer(e),this._initLayout(),this._initHooks(),this._initEvents(),r.maxBounds&&this.setMaxBounds(r.maxBounds),r.center&&r.zoom!==t&&this.setView(n.latLng(r.center),r.zoom,!0),this._initLayers(r.layers)},setView:function(e,t){return this._resetView(n.latLng(e),this._limitZoom(t)),this},setZoom:function(e){return this.setView(this.getCenter(),e)},zoomIn:function(){return this.setZoom(this._zoom+1)},zoomOut:function(){return this.setZoom(this._zoom-1)},fitBounds:function(e){var t=this.getBoundsZoom(e);return this.setView(n.latLngBounds(e).getCenter(),t)},fitWorld:function(){var e=new n.LatLng(-60,-170),t=new n.LatLng(85,179);return this.fitBounds(new n.LatLngBounds(e,t))},panTo:function(e){return this.setView(e,this._zoom)},panBy:function(e){return this.fire("movestart"),this._rawPanBy(n.point(e)),this.fire("move"),this.fire("moveend")},setMaxBounds:function(e){e=n.latLngBounds(e),this.options.maxBounds=e;if(!e)return this._boundsMinZoom=null,this;var t=this.getBoundsZoom(e,!0);return this._boundsMinZoom=t,this._loaded&&(this._zoom<t?this.setView(e.getCenter(),t):this.panInsideBounds(e)),this},panInsideBounds:function(e){e=n.latLngBounds(e);var t=this.getBounds(),r=this.project(t.getSouthWest()),i=this.project(t.getNorthEast()),s=this.project(e.getSouthWest()),o=this.project(e.getNorthEast()),u=0,a=0;return i.y<o.y&&(a=o.y-i.y),i.x>o.x&&(u=o.x-i.x),r.y>s.y&&(a=s.y-r.y),r.x<s.x&&(u=s.x-r.x),this.panBy(new n.Point(u,a,!0))},addLayer:function(e){var t=n.Util.stamp(e);if(this._layers[t])return this;this._layers[t]=e,e.options&&!isNaN(e.options.maxZoom)&&(this._layersMaxZoom=Math.max(this._layersMaxZoom||0,e.options.maxZoom)),e.options&&!isNaN(e.options.minZoom)&&(this._layersMinZoom=Math.min(this._layersMinZoom||Infinity,e.options.minZoom)),this.options.zoomAnimation&&n.TileLayer&&e instanceof n.TileLayer&&(this._tileLayersNum++,this._tileLayersToLoad++,e.on("load",this._onTileLayerLoad,this));var r=function(){e.onAdd(this),this.fire("layeradd",{layer:e})};return this._loaded?r.call(this):this.on("load",r,this),this},removeLayer:function(e){var t=n.Util.stamp(e);if(!this._layers[t])return;return e.onRemove(this),delete this._layers[t],this.options.zoomAnimation&&n.TileLayer&&e instanceof n.TileLayer&&(this._tileLayersNum--,this._tileLayersToLoad--,e.off("load",this._onTileLayerLoad,this)),this.fire("layerremove",{layer:e})},hasLayer:function(e){var t=n.Util.stamp(e);return this._layers.hasOwnProperty(t)},invalidateSize:function(e){var t=this.getSize();this._sizeChanged=!0,this.options.maxBounds&&this.setMaxBounds(this.options.maxBounds);if(!this._loaded)return this;var r=t.subtract(this.getSize()).divideBy(2,!0);return e===!0?this.panBy(r):(this._rawPanBy(r),this.fire("move"),clearTimeout(this._sizeTimer),this._sizeTimer=setTimeout(n.Util.bind(this.fire,this,"moveend"),200)),this},addHandler:function(e,t){if(!t)return;return this[e]=new t(this),this.options[e]&&this[e].enable(),this},getCenter:function(){return this.layerPointToLatLng(this._getCenterLayerPoint())},getZoom:function(){return this._zoom},getBounds:function(){var e=this.getPixelBounds(),t=this.unproject(e.getBottomLeft()),r=this.unproject(e.getTopRight());return new n.LatLngBounds(t,r)},getMinZoom:function(){var e=this.options.minZoom||0,t=this._layersMinZoom||0,n=this._boundsMinZoom||0;return Math.max(e,t,n)},getMaxZoom:function(){var e=this.options.maxZoom===t?Infinity:this.options.maxZoom,n=this._layersMaxZoom===t?Infinity:this._layersMaxZoom;return Math.min(e,n)},getBoundsZoom:function(e,t){e=n.latLngBounds(e);var r=this.getSize(),i=this.options.minZoom||0,s=this.getMaxZoom(),o=e.getNorthEast(),u=e.getSouthWest(),a,f,l,c=!0;t&&i--;do i++,f=this.project(o,i),l=this.project(u,i),a=new n.Point(Math.abs(f.x-l.x),Math.abs(l.y-f.y)),t?c=a.x<r.x||a.y<r.y:c=a.x<=r.x&&a.y<=r.y;while(c&&i<=s);return c&&t?null:t?i:i-1},getSize:function(){if(!this._size||this._sizeChanged)this._size=new n.Point(this._container.clientWidth,this._container.clientHeight),this._sizeChanged=!1;return this._size},getPixelBounds:function(){var e=this._getTopLeftPoint();return new n.Bounds(e,e.add(this.getSize()))},getPixelOrigin:function(){return this._initialTopLeftPoint},getPanes:function(){return this._panes},getContainer:function(){return this._container},getZoomScale:function(e){var t=this.options.crs;return t.scale(e)/t.scale(this._zoom)},getScaleZoom:function(e){return this._zoom+Math.log(e)/Math.LN2},project:function(e,r){return r=r===t?this._zoom:r,this.options.crs.latLngToPoint(n.latLng(e),r)},unproject:function(e,r){return r=r===t?this._zoom:r,this.options.crs.pointToLatLng(n.point(e),r)},layerPointToLatLng:function(e){var t=n.point(e).add(this._initialTopLeftPoint);return this.unproject(t)},latLngToLayerPoint:function(e){var t=this.project(n.latLng(e))._round();return t._subtract(this._initialTopLeftPoint)},containerPointToLayerPoint:function(e){return n.point(e).subtract(this._getMapPanePos())},layerPointToContainerPoint:function(e){return n.point(e).add(this._getMapPanePos())},containerPointToLatLng:function(e){var t=this.containerPointToLayerPoint(n.point(e));return this.layerPointToLatLng(t)},latLngToContainerPoint:function(e){return this.layerPointToContainerPoint(this.latLngToLayerPoint(n.latLng(e)))},mouseEventToContainerPoint:function(e){return n.DomEvent.getMousePosition(e,this._container)},mouseEventToLayerPoint:function(e){return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e))},mouseEventToLatLng:function(e){return this.layerPointToLatLng(this.mouseEventToLayerPoint(e))},_initContainer:function(e){var t=this._container=n.DomUtil.get(e);if(t._leaflet)throw Error("Map container is already initialized.");t._leaflet=!0},_initLayout:function(){var e=this._container;e.innerHTML="",n.DomUtil.addClass(e,"leaflet-container"),n.Browser.touch&&n.DomUtil.addClass(e,"leaflet-touch"),this.options.fadeAnimation&&n.DomUtil.addClass(e,"leaflet-fade-anim");var t=n.DomUtil.getStyle(e,"position");t!=="absolute"&&t!=="relative"&&t!=="fixed"&&(e.style.position="relative"),this._initPanes(),this._initControlPos&&this._initControlPos()},_initPanes:function(){var e=this._panes={};this._mapPane=e.mapPane=this._createPane("leaflet-map-pane",this._container),this._tilePane=e.tilePane=this._createPane("leaflet-tile-pane",this._mapPane),this._objectsPane=e.objectsPane=this._createPane("leaflet-objects-pane",this._mapPane),e.shadowPane=this._createPane("leaflet-shadow-pane"),e.overlayPane=this._createPane("leaflet-overlay-pane"),e.markerPane=this._createPane("leaflet-marker-pane"),e.popupPane=this._createPane("leaflet-popup-pane");var t=" leaflet-zoom-hide";this.options.markerZoomAnimation||(n.DomUtil.addClass(e.markerPane,t),n.DomUtil.addClass(e.shadowPane,t),n.DomUtil.addClass(e.popupPane,t))},_createPane:function(e,t){return n.DomUtil.create("div",e,t||this._objectsPane)},_initializers:[],_initHooks:function(){var e,t;for(e=0,t=this._initializers.length;e<t;e++)this._initializers[e].call(this)},_initLayers:function(e){e=e?e instanceof Array?e:[e]:[],this._layers={},this._tileLayersNum=0;var t,n;for(t=0,n=e.length;t<n;t++)this.addLayer(e[t])},_resetView:function(e,t,r,i){var s=this._zoom!==t;i||(this.fire("movestart"),s&&this.fire("zoomstart")),this._zoom=t,this._initialTopLeftPoint=this._getNewTopLeftPoint(e),r?this._initialTopLeftPoint._add(this._getMapPanePos()):n.DomUtil.setPosition(this._mapPane,new n.Point(0,0)),this._tileLayersToLoad=this._tileLayersNum,this.fire("viewreset",{hard:!r}),this.fire("move"),(s||i)&&this.fire("zoomend"),this.fire("moveend",{hard:!r}),this._loaded||(this._loaded=!0,this.fire("load"))},_rawPanBy:function(e){n.DomUtil.setPosition(this._mapPane,this._getMapPanePos().subtract(e))},_initEvents:function(){if(!n.DomEvent)return;n.DomEvent.on(this._container,"click",this._onMouseClick,this);var t=["dblclick","mousedown","mouseup","mouseenter","mouseleave","mousemove","contextmenu"],r,i;for(r=0,i=t.length;r<i;r++)n.DomEvent.on(this._container,t[r],this._fireMouseEvent,this);this.options.trackResize&&n.DomEvent.on(e,"resize",this._onResize,this)},_onResize:function(){n.Util.cancelAnimFrame(this._resizeRequest),this._resizeRequest=n.Util.requestAnimFrame(this.invalidateSize,this,!1,this._container)},_onMouseClick:function(e){if(!this._loaded||this.dragging&&this.dragging.moved())return;this.fire("preclick"),this._fireMouseEvent(e)},_fireMouseEvent:function(e){if(!this._loaded)return;var t=e.type;t=t==="mouseenter"?"mouseover":t==="mouseleave"?"mouseout":t;if(!this.hasEventListeners(t))return;t==="contextmenu"&&n.DomEvent.preventDefault(e);var r=this.mouseEventToContainerPoint(e),i=this.containerPointToLayerPoint(r),s=this.layerPointToLatLng(i);this.fire(t,{latlng:s,layerPoint:i,containerPoint:r,originalEvent:e})},_onTileLayerLoad:function(){this._tileLayersToLoad--,this._tileLayersNum&&!this._tileLayersToLoad&&this._tileBg&&(clearTimeout(this._clearTileBgTimer),this._clearTileBgTimer=setTimeout(n.Util.bind(this._clearTileBg,this),500))},_getMapPanePos:function(){return n.DomUtil.getPosition(this._mapPane)},_getTopLeftPoint:function(){if(!this._loaded)throw Error("Set map center and zoom first.");return this._initialTopLeftPoint.subtract(this._getMapPanePos())},_getNewTopLeftPoint:function(e,t){var n=this.getSize().divideBy(2);return this.project(e,t)._subtract(n)._round()},_latLngToNewLayerPoint:function(e,t,n){var r=this._getNewTopLeftPoint(n,t).add(this._getMapPanePos());return this.project(e,t)._subtract(r)},_getCenterLayerPoint:function(){return this.containerPointToLayerPoint(this.getSize().divideBy(2))},_getCenterOffset:function(e){return this.latLngToLayerPoint(e).subtract(this._getCenterLayerPoint())},_limitZoom:function(e){var t=this.getMinZoom(),n=this.getMaxZoom();return Math.max(t,Math.min(n,e))}}),n.Map.addInitHook=function(e){var t=Array.prototype.slice.call(arguments,1),n=typeof e=="function"?e:function(){this[e].apply(this,t)};this.prototype._initializers.push(n)},n.map=function(e,t){return new n.Map(e,t)},n.Projection.Mercator={MAX_LATITUDE:85.0840591556,R_MINOR:6356752.3142,R_MAJOR:6378137,project:function(e){var t=n.LatLng.DEG_TO_RAD,r=this.MAX_LATITUDE,i=Math.max(Math.min(r,e.lat),-r),s=this.R_MAJOR,o=this.R_MINOR,u=e.lng*t*s,a=i*t,f=o/s,l=Math.sqrt(1-f*f),c=l*Math.sin(a);c=Math.pow((1-c)/(1+c),l*.5);var h=Math.tan(.5*(Math.PI*.5-a))/c;return a=-o*Math.log(h),new n.Point(u,a)},unproject:function(e){var t=n.LatLng.RAD_TO_DEG,r=this.R_MAJOR,i=this.R_MINOR,s=e.x*t/r,o=i/r,u=Math.sqrt(1-o*o),a=Math.exp(-e.y/i),f=Math.PI/2-2*Math.atan(a),l=15,c=1e-7,h=l,p=.1,d;while(Math.abs(p)>c&&--h>0)d=u*Math.sin(f),p=Math.PI/2-2*Math.atan(a*Math.pow((1-d)/(1+d),.5*u))-f,f+=p;return new n.LatLng(f*t,s,!0)}},n.CRS.EPSG3395=n.Util.extend({},n.CRS,{code:"EPSG:3395",projection:n.Projection.Mercator,transformation:function(){var e=n.Projection.Mercator,t=e.R_MAJOR,r=e.R_MINOR;return new n.Transformation(.5/(Math.PI*t),.5,-0.5/(Math.PI*r),.5)}()}),n.TileLayer=n.Class.extend({includes:n.Mixin.Events,options:{minZoom:0,maxZoom:18,tileSize:256,subdomains:"abc",errorTileUrl:"",attribution:"",zoomOffset:0,opacity:1,unloadInvisibleTiles:n.Browser.mobile,updateWhenIdle:n.Browser.mobile},initialize:function(e,t){t=n.Util.setOptions(this,t),t.detectRetina&&n.Browser.retina&&t.maxZoom>0&&(t.tileSize=Math.floor(t.tileSize/2),t.zoomOffset++,t.minZoom>0&&t.minZoom--,this.options.maxZoom--),this._url=e;var r=this.options.subdomains;typeof r=="string"&&(this.options.subdomains=r.split(""))},onAdd:function(e){this._map=e,this._initContainer(),this._createTileProto(),e.on({viewreset:this._resetCallback,moveend:this._update},this),this.options.updateWhenIdle||(this._limitedUpdate=n.Util.limitExecByInterval(this._update,150,this),e.on("move",this._limitedUpdate,this)),this._reset(),this._update()},addTo:function(e){return e.addLayer(this),this},onRemove:function(e){e._panes.tilePane.removeChild(this._container),e.off({viewreset:this._resetCallback,moveend:this._update},this),this.options.updateWhenIdle||e.off("move",this._limitedUpdate,this),this._container=null,this._map=null},bringToFront:function(){var e=this._map._panes.tilePane;return this._container&&(e.appendChild(this._container),this._setAutoZIndex(e,Math.max)),this},bringToBack:function(){var e=this._map._panes.tilePane;return this._container&&(e.insertBefore(this._container,e.firstChild),this._setAutoZIndex(e,Math.min)),this},getAttribution:function(){return this.options.attribution},setOpacity:function(e){return this.options.opacity=e,this._map&&this._updateOpacity(),this},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},setUrl:function(e,t){return this._url=e,t||this.redraw(),this},redraw:function(){return this._map&&(this._map._panes.tilePane.empty=!1,this._reset(!0),this._update()),this},_updateZIndex:function(){this._container&&this.options.zIndex!==t&&(this._container.style.zIndex=this.options.zIndex)},_setAutoZIndex:function(e,t){var n=e.getElementsByClassName("leaflet-layer"),r=-t(Infinity,-Infinity),i;for(var s=0,o=n.length;s<o;s++)n[s]!==this._container&&(i=parseInt(n[s].style.zIndex,10),isNaN(i)||(r=t(r,i)));this._container.style.zIndex=isFinite(r)?r+t(1,-1):""},_updateOpacity:function(){n.DomUtil.setOpacity(this._container,this.options.opacity);var e,t=this._tiles;if(n.Browser.webkit)for(e in t)t.hasOwnProperty(e)&&(t[e].style.webkitTransform+=" translate(0,0)")},_initContainer:function(){var e=this._map._panes.tilePane;if(!this._container||e.empty)this._container=n.DomUtil.create("div","leaflet-layer"),this._updateZIndex(),e.appendChild(this._container),this.options.opacity<1&&this._updateOpacity()},_resetCallback:function(e){this._reset(e.hard)},_reset:function(e){var t,n=this._tiles;for(t in n)n.hasOwnProperty(t)&&this.fire("tileunload",{tile:n[t]});this._tiles={},this._tilesToLoad=0,this.options.reuseTiles&&(this._unusedTiles=[]),e&&this._container&&(this._container.innerHTML=""),this._initContainer()},_update:function(e){if(this._map._panTransition&&this._map._panTransition._inProgress)return;var t=this._map.getPixelBounds(),r=this._map.getZoom(),i=this.options.tileSize;if(r>this.options.maxZoom||r<this.options.minZoom)return;var s=new n.Point(Math.floor(t.min.x/i),Math.floor(t.min.y/i)),o=new n.Point(Math.floor(t.max.x/i),Math.floor(t.max.y/i)),u=new n.Bounds(s,o);this._addTilesFromCenterOut(u),(this.options.unloadInvisibleTiles||this.options.reuseTiles)&&this._removeOtherTiles(u)},_addTilesFromCenterOut:function(e){var t=[],r=e.getCenter(),i,s,o;for(i=e.min.y;i<=e.max.y;i++)for(s=e.min.x;s<=e.max.x;s++)o=new n.Point(s,i),this._tileShouldBeLoaded(o)&&t.push(o);var u=t.length;if(u===0)return;t.sort(function(e,t){return e.distanceTo(r)-t.distanceTo(r)});var a=document.createDocumentFragment();this._tilesToLoad||this.fire("loading"),this._tilesToLoad+=u;for(s=0;s<u;s++)this._addTile(t[s],a);this._container.appendChild(a)},_tileShouldBeLoaded:function(e){if(e.x+":"+e.y in this._tiles)return!1;if(!this.options.continuousWorld){var t=this._getWrapTileNum();if(this.options.noWrap&&(e.x<0||e.x>=t)||e.y<0||e.y>=t)return!1}return!0},_removeOtherTiles:function(e){var t,n,r,i;for(i in this._tiles)this._tiles.hasOwnProperty(i)&&(t=i.split(":"),n=parseInt(t[0],10),r=parseInt(t[1],10),(n<e.min.x||n>e.max.x||r<e.min.y||r>e.max.y)&&this._removeTile(i))},_removeTile:function(e){var t=this._tiles[e];this.fire("tileunload",{tile:t,url:t.src}),this.options.reuseTiles?(n.DomUtil.removeClass(t,"leaflet-tile-loaded"),this._unusedTiles.push(t)):t.parentNode===this._container&&this._container.removeChild(t),n.Browser.android||(t.src=n.Util.emptyImageUrl),delete this._tiles[e]},_addTile:function(e,t){var r=this._getTilePos(e),i=this._getTile();n.DomUtil.setPosition(i,r,n.Browser.chrome||n.Browser.android23),this._tiles[e.x+":"+e.y]=i,this._loadTile(i,e),i.parentNode!==this._container&&t.appendChild(i)},_getZoomForUrl:function(){var e=this.options,t=this._map.getZoom();return e.zoomReverse&&(t=e.maxZoom-t),t+e.zoomOffset},_getTilePos:function(e){var t=this._map.getPixelOrigin(),n=this.options.tileSize;return e.multiplyBy(n).subtract(t)},getTileUrl:function(e){return this._adjustTilePoint(e),n.Util.template(this._url,n.Util.extend({s:this._getSubdomain(e),z:this._getZoomForUrl(),x:e.x,y:e.y},this.options))},_getWrapTileNum:function(){return Math.pow(2,this._getZoomForUrl())},_adjustTilePoint:function(e){var t=this._getWrapTileNum();!this.options.continuousWorld&&!this.options.noWrap&&(e.x=(e.x%t+t)%t),this.options.tms&&(e.y=t-e.y-1)},_getSubdomain:function(e){var t=(e.x+e.y)%this.options.subdomains.length;return this.options.subdomains[t]},_createTileProto:function(){var e=this._tileImg=n.DomUtil.create("img","leaflet-tile");e.galleryimg="no";var t=this.options.tileSize;e.style.width=t+"px",e.style.height=t+"px"},_getTile:function(){if(this.options.reuseTiles&&this._unusedTiles.length>0){var e=this._unusedTiles.pop();return this._resetTile(e),e}return this._createTile()},_resetTile:function(e){},_createTile:function(){var e=this._tileImg.cloneNode(!1);return e.onselectstart=e.onmousemove=n.Util.falseFn,e},_loadTile:function(e,t){e._layer=this,e.onload=this._tileOnLoad,e.onerror=this._tileOnError,e.src=this.getTileUrl(t)},_tileLoaded:function(){this._tilesToLoad--,this._tilesToLoad||this.fire("load")},_tileOnLoad:function(e){var t=this._layer;this.src!==n.Util.emptyImageUrl&&(n.DomUtil.addClass(this,"leaflet-tile-loaded"),t.fire("tileload",{tile:this,url:this.src})),t._tileLoaded()},_tileOnError:function(e){var t=this._layer;t.fire("tileerror",{tile:this,url:this.src});var n=t.options.errorTileUrl;n&&(this.src=n),t._tileLoaded()}}),n.tileLayer=function(e,t){return new n.TileLayer(e,t)},n.TileLayer.WMS=n.TileLayer.extend({defaultWmsParams:{service:"WMS",request:"GetMap",version:"1.1.1",layers:"",styles:"",format:"image/jpeg",transparent:!1},initialize:function(e,t){this._url=e;var r=n.Util.extend({},this.defaultWmsParams);t.detectRetina&&n.Browser.retina?r.width=r.height=this.options.tileSize*2:r.width=r.height=this.options.tileSize;for(var i in t)this.options.hasOwnProperty(i)||(r[i]=t[i]);this.wmsParams=r,n.Util.setOptions(this,t)},onAdd:function(e){var t=parseFloat(this.wmsParams.version)>=1.3?"crs":"srs";this.wmsParams[t]=e.options.crs.code,n.TileLayer.prototype.onAdd.call(this,e)},getTileUrl:function(e,t){var r=this._map,i=r.options.crs,s=this.options.tileSize,o=e.multiplyBy(s),u=o.add(new n.Point(s,s)),a=i.project(r.unproject(o,t)),f=i.project(r.unproject(u,t)),l=[a.x,f.y,f.x,a.y].join(","),c=n.Util.template(this._url,{s:this._getSubdomain(e)});return c+n.Util.getParamString(this.wmsParams)+"&bbox="+l},setParams:function(e,t){return n.Util.extend(this.wmsParams,e),t||this.redraw(),this}}),n.tileLayer.wms=function(e,t){return new n.TileLayer.WMS(e,t)},n.TileLayer.Canvas=n.TileLayer.extend({options:{async:!1},initialize:function(e){n.Util.setOptions(this,e)},redraw:function(){var e,t=this._tiles;for(e in t)t.hasOwnProperty(e)&&this._redrawTile(t[e])},_redrawTile:function(e){this.drawTile(e,e._tilePoint,e._zoom)},_createTileProto:function(){var e=this._canvasProto=n.DomUtil.create("canvas","leaflet-tile"),t=this.options.tileSize;e.width=t,e.height=t},_createTile:function(){var e=this._canvasProto.cloneNode(!1);return e.onselectstart=e.onmousemove=n.Util.falseFn,e},_loadTile:function(e,t,n){e._layer=this,e._tilePoint=t,e._zoom=n,this.drawTile(e,t,n),this.options.async||this.tileDrawn(e)},drawTile:function(e,t,n){},tileDrawn:function(e){this._tileOnLoad.call(e)}}),n.tileLayer.canvas=function(e){return new n.TileLayer.Canvas(e)},n.ImageOverlay=n.Class.extend({includes:n.Mixin.Events,options:{opacity:1},initialize:function(e,t,r){this._url=e,this._bounds=n.latLngBounds(t),n.Util.setOptions(this,r)},onAdd:function(e){this._map=e,this._image||this._initImage(),e._panes.overlayPane.appendChild(this._image),e.on("viewreset",this._reset,this),e.options.zoomAnimation&&n.Browser.any3d&&e.on("zoomanim",this._animateZoom,this),this._reset()},onRemove:function(e){e.getPanes().overlayPane.removeChild(this._image),e.off("viewreset",this._reset,this),e.options.zoomAnimation&&e.off("zoomanim",this._animateZoom,this)},addTo:function(e){return e.addLayer(this),this},setOpacity:function(e){return this.options.opacity=e,this._updateOpacity(),this},bringToFront:function(){return this._image&&this._map._panes.overlayPane.appendChild(this._image),this},bringToBack:function(){var e=this._map._panes.overlayPane;return this._image&&e.insertBefore(this._image,e.firstChild),this},_initImage:function(){this._image=n.DomUtil.create("img","leaflet-image-layer"),this._map.options.zoomAnimation&&n.Browser.any3d?n.DomUtil.addClass(this._image,"leaflet-zoom-animated"):n.DomUtil.addClass(this._image,"leaflet-zoom-hide"),this._updateOpacity(),n.Util.extend(this._image,{galleryimg:"no",onselectstart:n.Util.falseFn,onmousemove:n.Util.falseFn,onload:n.Util.bind(this._onImageLoad,this),src:this._url})},_animateZoom:function(e){var t=this._map,r=this._image,i=t.getZoomScale(e.zoom),s=this._bounds.getNorthWest(),o=this._bounds.getSouthEast(),u=t._latLngToNewLayerPoint(s,e.zoom,e.center),a=t._latLngToNewLayerPoint(o,e.zoom,e.center).subtract(u),f=t.latLngToLayerPoint(o).subtract(t.latLngToLayerPoint(s)),l=u.add(a.subtract(f).divideBy(2));r.style[n.DomUtil.TRANSFORM]=n.DomUtil.getTranslateString(l)+" scale("+i+") "},_reset:function(){var e=this._image,t=this._map.latLngToLayerPoint(this._bounds.getNorthWest()),r=this._map.latLngToLayerPoint(this._bounds.getSouthEast()).subtract(t);n.DomUtil.setPosition(e,t),e.style.width=r.x+"px",e.style.height=r.y+"px"},_onImageLoad:function(){this.fire("load")},_updateOpacity:function(){n.DomUtil.setOpacity(this._image,this.options.opacity)}}),n.imageOverlay=function(e,t,r){return new n.ImageOverlay(e,t,r)},n.Icon=n.Class.extend({options:{className:""},initialize:function(e){n.Util.setOptions(this,e)},createIcon:function(){return this._createIcon("icon")},createShadow:function(){return this._createIcon("shadow")},_createIcon:function(e){var t=this._getIconUrl(e);if(!t){if(e==="icon")throw Error("iconUrl not set in Icon options (see the docs).");return null}var n=this._createImg(t);return this._setIconStyles(n,e),n},_setIconStyles:function(e,t){var r=this.options,i=n.point(r[t+"Size"]),s;t==="shadow"?s=n.point(r.shadowAnchor||r.iconAnchor):s=n.point(r.iconAnchor),!s&&i&&(s=i.divideBy(2,!0)),e.className="leaflet-marker-"+t+" "+r.className,s&&(e.style.marginLeft=-s.x+"px",e.style.marginTop=-s.y+"px"),i&&(e.style.width=i.x+"px",e.style.height=i.y+"px")},_createImg:function(e){var t;return n.Browser.ie6?(t=document.createElement("div"),t.style.filter='progid:DXImageTransform.Microsoft.AlphaImageLoader(src="'+e+'")'):(t=document.createElement("img"),t.src=e),t},_getIconUrl:function(e){return this.options[e+"Url"]}}),n.icon=function(e){return new n.Icon(e)},n.Icon.Default=n.Icon.extend({options:{iconSize:new n.Point(25,41),iconAnchor:new n.Point(13,41),popupAnchor:new n.Point(1,-34),shadowSize:new n.Point(41,41)},_getIconUrl:function(e){var t=e+"Url";if(this.options[t])return this.options[t];var r=n.Icon.Default.imagePath;if(!r)throw Error("Couldn't autodetect L.Icon.Default.imagePath, set it manually.");return r+"/marker-"+e+".png"}}),n.Icon.Default.imagePath=function(){var e=document.getElementsByTagName("script"),t=/\/?leaflet[\-\._]?([\w\-\._]*)\.js\??/,n,r,i,s;for(n=0,r=e.length;n<r;n++){i=e[n].src,s=i.match(t);if(s)return i.split(t)[0]+"/images"}}(),n.Marker=n.Class.extend({includes:n.Mixin.Events,options:{icon:new n.Icon.Default,title:"",clickable:!0,draggable:!1,zIndexOffset:0,opacity:1},initialize:function(e,t){n.Util.setOptions(this,t),this._latlng=n.latLng(e)},onAdd:function(e){this._map=e,e.on("viewreset",this.update,this),this._initIcon(),this.update(),e.options.zoomAnimation&&e.options.markerZoomAnimation&&e.on("zoomanim",this._animateZoom,this)},addTo:function(e){return e.addLayer(this),this},onRemove:function(e){this._removeIcon(),this.closePopup&&this.closePopup(),e.off({viewreset:this.update,zoomanim:this._animateZoom},this),this._map=null},getLatLng:function(){return this._latlng},setLatLng:function(e){this._latlng=n.latLng(e),this.update(),this._popup&&this._popup.setLatLng(e)},setZIndexOffset:function(e){this.options.zIndexOffset=e,this.update()},setIcon:function(e){this._map&&this._removeIcon(),this.options.icon=e,this._map&&(this._initIcon(),this.update())},update:function(){if(!this._icon)return;var e=this._map.latLngToLayerPoint(this._latlng).round();this._setPos(e)},_initIcon:function(){var e=this.options,t=this._map,r=t.options.zoomAnimation&&t.options.markerZoomAnimation,i=r?"leaflet-zoom-animated":"leaflet-zoom-hide",s=!1;this._icon||(this._icon=e.icon.createIcon(),e.title&&(this._icon.title=e.title),this._initInteraction(),s=this.options.opacity<1,n.DomUtil.addClass(this._icon,i)),this._shadow||(this._shadow=e.icon.createShadow(),this._shadow&&(n.DomUtil.addClass(this._shadow,i),s=this.options.opacity<1)),s&&this._updateOpacity();var o=this._map._panes;o.markerPane.appendChild(this._icon),this._shadow&&o.shadowPane.appendChild(this._shadow)},_removeIcon:function(){var e=this._map._panes;e.markerPane.removeChild(this._icon),this._shadow&&e.shadowPane.removeChild(this._shadow),this._icon=this._shadow=null},_setPos:function(e){n.DomUtil.setPosition(this._icon,e),this._shadow&&n.DomUtil.setPosition(this._shadow,e),this._icon.style.zIndex=e.y+this.options.zIndexOffset},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center);this._setPos(t)},_initInteraction:function(){if(!this.options.clickable)return;var e=this._icon,t=["dblclick","mousedown","mouseover","mouseout"];n.DomUtil.addClass(e,"leaflet-clickable"),n.DomEvent.on(e,"click",this._onMouseClick,this);for(var r=0;r<t.length;r++)n.DomEvent.on(e,t[r],this._fireMouseEvent,this);n.Handler.MarkerDrag&&(this.dragging=new n.Handler.MarkerDrag(this),this.options.draggable&&this.dragging.enable())},_onMouseClick:function(e){n.DomEvent.stopPropagation(e);if(this.dragging&&this.dragging.moved())return;if(this._map.dragging&&this._map.dragging.moved())return;this.fire(e.type,{originalEvent:e})},_fireMouseEvent:function(e){this.fire(e.type,{originalEvent:e}),e.type!=="mousedown"&&n.DomEvent.stopPropagation(e)},setOpacity:function(e){this.options.opacity=e,this._map&&this._updateOpacity()},_updateOpacity:function(){n.DomUtil.setOpacity(this._icon,this.options.opacity),this._shadow&&n.DomUtil.setOpacity(this._shadow,this.options.opacity)}}),n.marker=function(e,t){return new n.Marker(e,t)},n.DivIcon=n.Icon.extend({options:{iconSize:new n.Point(12,12),className:"leaflet-div-icon"},createIcon:function(){var e=document.createElement("div"),t=this.options;return t.html&&(e.innerHTML=t.html),t.bgPos&&(e.style.backgroundPosition=-t.bgPos.x+"px "+ -t.bgPos.y+"px"),this._setIconStyles(e,"icon"),e},createShadow:function(){return null}}),n.divIcon=function(e){return new n.DivIcon(e)},n.Map.mergeOptions({closePopupOnClick:!0}),n.Popup=n.Class.extend({includes:n.Mixin.Events,options:{minWidth:50,maxWidth:300,maxHeight:null,autoPan:!0,closeButton:!0,offset:new n.Point(0,6),autoPanPadding:new n.Point(5,5),className:""},initialize:function(e,t){n.Util.setOptions(this,e),this._source=t},onAdd:function(e){this._map=e,this._container||this._initLayout(),this._updateContent();var t=e.options.fadeAnimation;t&&n.DomUtil.setOpacity(this._container,0),e._panes.popupPane.appendChild(this._container),e.on("viewreset",this._updatePosition,this),n.Browser.any3d&&e.on("zoomanim",this._zoomAnimation,this),e.options.closePopupOnClick&&e.on("preclick",this._close,this),this._update(),t&&n.DomUtil.setOpacity(this._container,1)},addTo:function(e){return e.addLayer(this),this},openOn:function(e){return e.openPopup(this),this},onRemove:function(e){e._panes.popupPane.removeChild(this._container),n.Util.falseFn(this._container.offsetWidth),e.off({viewreset:this._updatePosition,preclick:this._close,zoomanim:this._zoomAnimation},this),e.options.fadeAnimation&&n.DomUtil.setOpacity(this._container,0),this._map=null},setLatLng:function(e){return this._latlng=n.latLng(e),this._update(),this},setContent:function(e){return this._content=e,this._update(),this},_close:function(){var e=this._map;e&&(e._popup=null,e.removeLayer(this).fire("popupclose",{popup:this}))},_initLayout:function(){var e="leaflet-popup",t=this._container=n.DomUtil.create("div",e+" "+this.options.className+" leaflet-zoom-animated"),r;this.options.closeButton&&(r=this._closeButton=n.DomUtil.create("a",e+"-close-button",t),r.href="#close",r.innerHTML="&#215;",n.DomEvent.on(r,"click",this._onCloseButtonClick,this));var i=this._wrapper=n.DomUtil.create("div",e+"-content-wrapper",t);n.DomEvent.disableClickPropagation(i),this._contentNode=n.DomUtil.create("div",e+"-content",i),n.DomEvent.on(this._contentNode,"mousewheel",n.DomEvent.stopPropagation),this._tipContainer=n.DomUtil.create("div",e+"-tip-container",t),this._tip=n.DomUtil.create("div",e+"-tip",this._tipContainer)},_update:function(){if(!this._map)return;this._container.style.visibility="hidden",this._updateContent(),this._updateLayout(),this._updatePosition(),this._container.style.visibility="",this._adjustPan()},_updateContent:function(){if(!this._content)return;if(typeof this._content=="string")this._contentNode.innerHTML=this._content;else{while(this._contentNode.hasChildNodes())this._contentNode.removeChild(this._contentNode.firstChild);this._contentNode.appendChild(this._content)}this.fire("contentupdate")},_updateLayout:function(){var e=this._contentNode,t=e.style;t.width="",t.whiteSpace="nowrap";var r=e.offsetWidth;r=Math.min(r,this.options.maxWidth),r=Math.max(r,this.options.minWidth),t.width=r+1+"px",t.whiteSpace="",t.height="";var i=e.offsetHeight,s=this.options.maxHeight,o="leaflet-popup-scrolled";s&&i>s?(t.height=s+"px",n.DomUtil.addClass(e,o)):n.DomUtil.removeClass(e,o),this._containerWidth=this._container.offsetWidth},_updatePosition:function(){var e=this._map.latLngToLayerPoint(this._latlng),t=n.Browser.any3d,r=this.options.offset;t&&n.DomUtil.setPosition(this._container,e),this._containerBottom=-r.y-(t?0:e.y),this._containerLeft=-Math.round(this._containerWidth/2)+r.x+(t?0:e.x),this._container.style.bottom=this._containerBottom+"px",this._container.style.left=this._containerLeft+"px"},_zoomAnimation:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center);n.DomUtil.setPosition(this._container,t)},_adjustPan:function(){if(!this.options.autoPan)return;var e=this._map,t=this._container.offsetHeight,r=this._containerWidth,i=new n.Point(this._containerLeft,-t-this._containerBottom);n.Browser.any3d&&i._add(n.DomUtil.getPosition(this._container));var s=e.layerPointToContainerPoint(i),o=this.options.autoPanPadding,u=e.getSize(),a=0,f=0;s.x<0&&(a=s.x-o.x),s.x+r>u.x&&(a=s.x+r-u.x+o.x),s.y<0&&(f=s.y-o.y),s.y+t>u.y&&(f=s.y+t-u.y+o.y),(a||f)&&e.panBy(new n.Point(a,f))},_onCloseButtonClick:function(e){this._close(),n.DomEvent.stop(e)}}),n.popup=function(e,t){return new n.Popup(e,t)},n.Marker.include({openPopup:function(){return this._popup&&this._map&&(this._popup.setLatLng(this._latlng),this._map.openPopup(this._popup)),this},closePopup:function(){return this._popup&&this._popup._close(),this},bindPopup:function(e,t){var r=n.point(this.options.icon.options.popupAnchor)||new n.Point(0,0);return r=r.add(n.Popup.prototype.options.offset),t&&t.offset&&(r=r.add(t.offset)),t=n.Util.extend({offset:r},t),this._popup||this.on("click",this.openPopup,this),this._popup=(new n.Popup(t,this)).setContent(e),this},unbindPopup:function(){return this._popup&&(this._popup=null,this.off("click",this.openPopup)),this}}),n.Map.include({openPopup:function(e){return this.closePopup(),this._popup=e,this.addLayer(e).fire("popupopen",{popup:this._popup})},closePopup:function(){return this._popup&&this._popup._close(),this}}),n.LayerGroup=n.Class.extend({initialize:function(e){this._layers={};var t,n;if(e)for(t=0,n=e.length;t<n;t++)this.addLayer(e[t])},addLayer:function(e){var t=n.Util.stamp(e);return this._layers[t]=e,this._map&&this._map.addLayer(e),this},removeLayer:function(e){var t=n.Util.stamp(e);return delete this._layers[t],this._map&&this._map.removeLayer(e),this},clearLayers:function(){return this.eachLayer(this.removeLayer,this),this},invoke:function(e){var t=Array.prototype.slice.call(arguments,1),n,r;for(n in this._layers)this._layers.hasOwnProperty(n)&&(r=this._layers[n],r[e]&&r[e].apply(r,t));return this},onAdd:function(e){this._map=e,this.eachLayer(e.addLayer,e)},onRemove:function(e){this.eachLayer(e.removeLayer,e),this._map=null},addTo:function(e){return e.addLayer(this),this},eachLayer:function(e,t){for(var n in this._layers)this._layers.hasOwnProperty(n)&&e.call(t,this._layers[n])}}),n.layerGroup=function(e){return new n.LayerGroup(e)},n.FeatureGroup=n.LayerGroup.extend({includes:n.Mixin.Events,addLayer:function(e){return this._layers[n.Util.stamp(e)]?this:(e.on("click dblclick mouseover mouseout mousemove contextmenu",this._propagateEvent,this),n.LayerGroup.prototype.addLayer.call(this,e),this._popupContent&&e.bindPopup&&e.bindPopup(this._popupContent),this)},removeLayer:function(e){return e.off("click dblclick mouseover mouseout mousemove contextmenu",this._propagateEvent,this),n.LayerGroup.prototype.removeLayer.call(this,e),this._popupContent?this.invoke("unbindPopup"):this},bindPopup:function(e){return this._popupContent=e,this.invoke("bindPopup",e)},setStyle:function(e){return this.invoke("setStyle",e)},bringToFront:function(){return this.invoke("bringToFront")},bringToBack:function(){return this.invoke("bringToBack")},getBounds:function(){var e=new n.LatLngBounds;return this.eachLayer(function(t){e.extend(t instanceof n.Marker?t.getLatLng():t.getBounds())},this),e},_propagateEvent:function(e){e.layer=e.target,e.target=this,this.fire(e.type,e)}}),n.featureGroup=function(e){return new n.FeatureGroup(e)},n.Path=n.Class.extend({includes:[n.Mixin.Events],statics:{CLIP_PADDING:n.Browser.mobile?Math.max(0,Math.min(.5,(1280/Math.max(e.innerWidth,e.innerHeight)-1)/2)):.5},options:{stroke:!0,color:"#0033ff",dashArray:null,weight:5,opacity:.5,fill:!1,fillColor:null,fillOpacity:.2,clickable:!0},initialize:function(e){n.Util.setOptions(this,e)},onAdd:function(e){this._map=e,this._container||(this._initElements(),this._initEvents()),this.projectLatlngs(),this._updatePath(),this._container&&this._map._pathRoot.appendChild(this._container),e.on({viewreset:this.projectLatlngs,moveend:this._updatePath},this)},addTo:function(e){return e.addLayer(this),this},onRemove:function(e){e._pathRoot.removeChild(this._container),this._map=null,n.Browser.vml&&(this._container=null,this._stroke=null,this._fill=null),e.off({viewreset:this.projectLatlngs,moveend:this._updatePath},this)},projectLatlngs:function(){},setStyle:function(e){return n.Util.setOptions(this,e),this._container&&this._updateStyle(),this},redraw:function(){return this._map&&(this.projectLatlngs(),this._updatePath()),this}}),n.Map.include({_updatePathViewport:function(){var e=n.Path.CLIP_PADDING,t=this.getSize(),r=n.DomUtil.getPosition(this._mapPane),i=r.multiplyBy(-1)._subtract(t.multiplyBy(e)),s=i.add(t.multiplyBy(1+e*2));this._pathViewport=new n.Bounds(i,s)}}),n.Path.SVG_NS="http://www.w3.org/2000/svg",n.Browser.svg=!!document.createElementNS&&!!document.createElementNS(n.Path.SVG_NS,"svg").createSVGRect,n.Path=n.Path.extend({statics:{SVG:n.Browser.svg},bringToFront:function(){return this._container&&this._map._pathRoot.appendChild(this._container),this},bringToBack:function(){if(this._container){var e=this._map._pathRoot;e.insertBefore(this._container,e.firstChild)}return this},getPathString:function(){},_createElement:function(e){return document.createElementNS(n.Path.SVG_NS,e)},_initElements:function(){this._map._initPathRoot(),this._initPath(),this._initStyle()},_initPath:function(){this._container=this._createElement("g"),this._path=this._createElement("path"),this._container.appendChild(this._path)},_initStyle:function(){this.options.stroke&&(this._path.setAttribute("stroke-linejoin","round"),this._path.setAttribute("stroke-linecap","round")),this.options.fill&&this._path.setAttribute("fill-rule","evenodd"),this._updateStyle()},_updateStyle:function(){this.options.stroke?(this._path.setAttribute("stroke",this.options.color),this._path.setAttribute("stroke-opacity",this.options.opacity),this._path.setAttribute("stroke-width",this.options.weight),this.options.dashArray?this._path.setAttribute("stroke-dasharray",this.options.dashArray):this._path.removeAttribute("stroke-dasharray")):this._path.setAttribute("stroke","none"),this.options.fill?(this._path.setAttribute("fill",this.options.fillColor||this.options.color),this._path.setAttribute("fill-opacity",this.options.fillOpacity)):this._path.setAttribute("fill","none")},_updatePath:function(){var e=this.getPathString();e||(e="M0 0"),this._path.setAttribute("d",e)},_initEvents:function(){if(this.options.clickable){(n.Browser.svg||!n.Browser.vml)&&this._path.setAttribute("class","leaflet-clickable"),n.DomEvent.on(this._container,"click",this._onMouseClick,this);var e=["dblclick","mousedown","mouseover","mouseout","mousemove","contextmenu"];for(var t=0;t<e.length;t++)n.DomEvent.on(this._container,e[t],this._fireMouseEvent,this)}},_onMouseClick:function(e){if(this._map.dragging&&this._map.dragging.moved())return;this._fireMouseEvent(e),n.DomEvent.stopPropagation(e)},_fireMouseEvent:function(e){if(!this.hasEventListeners(e.type))return;e.type==="contextmenu"&&n.DomEvent.preventDefault(e);var t=this._map,r=t.mouseEventToContainerPoint(e),i=t.containerPointToLayerPoint(r),s=t.layerPointToLatLng(i);this.fire(e.type,{latlng:s,layerPoint:i,containerPoint:r,originalEvent:e})}}),n.Map.include({_initPathRoot:function(){this._pathRoot||(this._pathRoot=n.Path.prototype._createElement("svg"),this._panes.overlayPane.appendChild(this._pathRoot),this.options.zoomAnimation&&n.Browser.any3d?(this._pathRoot.setAttribute("class"," leaflet-zoom-animated"),this.on({zoomanim:this._animatePathZoom,zoomend:this._endPathZoom})):this._pathRoot.setAttribute("class"," leaflet-zoom-hide"),this.on("moveend",this._updateSvgViewport),this._updateSvgViewport())},_animatePathZoom:function(e){var t=this.getZoomScale(e.zoom),r=this._getCenterOffset(e.center).divideBy(1-1/t),i=this.containerPointToLayerPoint(this.getSize().multiplyBy(-n.Path.CLIP_PADDING)),s=i.add(r).round();this._pathRoot.style[n.DomUtil.TRANSFORM]=n.DomUtil.getTranslateString(s.multiplyBy(-1).add(n.DomUtil.getPosition(this._pathRoot)).multiplyBy(t).add(s))+" scale("+t+") ",this._pathZooming=!0},_endPathZoom:function(){this._pathZooming=!1},_updateSvgViewport:function(){if(this._pathZooming)return;this._updatePathViewport();var e=this._pathViewport,t=e.min,r=e.max,i=r.x-t.x,s=r.y-t.y,o=this._pathRoot,u=this._panes.overlayPane;n.Browser.mobileWebkit&&u.removeChild(o),n.DomUtil.setPosition(o,t),o.setAttribute("width",i),o.setAttribute("height",s),o.setAttribute("viewBox",[t.x,t.y,i,s].join(" ")),n.Browser.mobileWebkit&&u.appendChild(o)}}),n.Path.include({bindPopup:function(e,t){if(!this._popup||this._popup.options!==t)this._popup=new n.Popup(t,this);return this._popup.setContent(e),this._openPopupAdded||(this.on("click",this._openPopup,this),this._openPopupAdded=!0),this},openPopup:function(e){return this._popup&&(e=e||this._latlng||this._latlngs[Math.floor(this._latlngs.length/2)],this._openPopup({latlng:e})),this},_openPopup:function(e){this._popup.setLatLng(e.latlng),this._map.openPopup(this._popup)}}),n.Browser.vml=function(){try{var e=document.createElement("div");e.innerHTML='<v:shape adj="1"/>';var t=e.firstChild;return t.style.behavior="url(#default#VML)",t&&typeof t.adj=="object"}catch(n){return!1}}(),n.Path=n.Browser.svg||!n.Browser.vml?n.Path:n.Path.extend({statics:{VML:!0,CLIP_PADDING:.02},_createElement:function(){try{return document.namespaces.add("lvml","urn:schemas-microsoft-com:vml"),function(e){return document.createElement("<lvml:"+e+' class="lvml">')}}catch(e){return function(e){return document.createElement("<"+e+' xmlns="urn:schemas-microsoft.com:vml" class="lvml">')}}}(),_initPath:function(){var e=this._container=this._createElement("shape");n.DomUtil.addClass(e,"leaflet-vml-shape"),this.options.clickable&&n.DomUtil.addClass(e,"leaflet-clickable"),e.coordsize="1 1",this._path=this._createElement("path"),e.appendChild(this._path),this._map._pathRoot.appendChild(e)},_initStyle:function(){this._updateStyle()},_updateStyle:function(){var e=this._stroke,t=this._fill,n=this.options,r=this._container;r.stroked=n.stroke,r.filled=n.fill,n.stroke?(e||(e=this._stroke=this._createElement("stroke"),e.endcap="round",r.appendChild(e)),e.weight=n.weight+"px",e.color=n.color,e.opacity=n.opacity,n.dashArray?e.dashStyle=n.dashArray.replace(/ *, */g," "):e.dashStyle=""):e&&(r.removeChild(e),this._stroke=null),n.fill?(t||(t=this._fill=this._createElement("fill"),r.appendChild(t)),t.color=n.fillColor||n.color,t.opacity=n.fillOpacity):t&&(r.removeChild(t),this._fill=null)},_updatePath:function(){var e=this._container.style;e.display="none",this._path.v=this.getPathString()+" ",e.display=""}}),n.Map.include(n.Browser.svg||!n.Browser.vml?{}:{_initPathRoot:function(){if(this._pathRoot)return;var e=this._pathRoot=document.createElement("div");e.className="leaflet-vml-container",this._panes.overlayPane.appendChild(e),this.on("moveend",this._updatePathViewport),this._updatePathViewport()}}),n.Browser.canvas=function(){return!!document.createElement("canvas").getContext}(),n.Path=n.Path.SVG&&!e.L_PREFER_CANVAS||!n.Browser.canvas?n.Path:n.Path.extend({statics:{CANVAS:!0,SVG:!1},redraw:function(){return this._map&&(this.projectLatlngs(),this._requestUpdate()),this},setStyle:function(e){return n.Util.setOptions(this,e),this._map&&(this._updateStyle(),this._requestUpdate()),this},onRemove:function(e){e.off("viewreset",this.projectLatlngs,this).off("moveend",this._updatePath,this),this._requestUpdate(),this._map=null},_requestUpdate:function(){this._map&&(n.Util.cancelAnimFrame(this._fireMapMoveEnd),this._updateRequest=n.Util.requestAnimFrame(this._fireMapMoveEnd,this._map))},_fireMapMoveEnd:function(){this.fire("moveend")},_initElements:function(){this._map._initPathRoot(),this._ctx=this._map._canvasCtx},_updateStyle:function(){var e=this.options;e.stroke&&(this._ctx.lineWidth=e.weight,this._ctx.strokeStyle=e.color),e.fill&&(this._ctx.fillStyle=e.fillColor||e.color)},_drawPath:function(){var e,t,r,i,s,o;this._ctx.beginPath();for(e=0,r=this._parts.length;e<r;e++){for(t=0,i=this._parts[e].length;t<i;t++)s=this._parts[e][t],o=(t===0?"move":"line")+"To",this._ctx[o](s.x,s.y);this instanceof n.Polygon&&this._ctx.closePath()}},_checkIfEmpty:function(){return!this._parts.length},_updatePath:function(){if(this._checkIfEmpty())return;var e=this._ctx,t=this.options;this._drawPath(),e.save(),this._updateStyle(),t.fill&&(t.fillOpacity<1&&(e.globalAlpha=t.fillOpacity),e.fill()),t.stroke&&(t.opacity<1&&(e.globalAlpha=t.opacity),e.stroke()),e.restore()},_initEvents:function(){this.options.clickable&&this._map.on("click",this._onClick,this)},_onClick:function(e){this._containsPoint(e.layerPoint)&&this.fire("click",e)}}),n.Map.include(n.Path.SVG&&!e.L_PREFER_CANVAS||!n.Browser.canvas?{}:{_initPathRoot:function(){var e=this._pathRoot,t;e||(e=this._pathRoot=document.createElement("canvas"),e.style.position="absolute",t=this._canvasCtx=e.getContext("2d"),t.lineCap="round",t.lineJoin="round",this._panes.overlayPane.appendChild(e),this.options.zoomAnimation&&(this._pathRoot.className="leaflet-zoom-animated",this.on("zoomanim",this._animatePathZoom),this.on("zoomend",this._endPathZoom)),this.on("moveend",this._updateCanvasViewport),this._updateCanvasViewport())},_updateCanvasViewport:function(){if(this._pathZooming)return;this._updatePathViewport();var e=this._pathViewport,t=e.min,r=e.max.subtract(t),i=this._pathRoot;n.DomUtil.setPosition(i,t),i.width=r.x,i.height=r.y,i.getContext("2d").translate(-t.x,-t.y)}}),n.LineUtil={simplify:function(e,t){if(!t||!e.length)return e.slice();var n=t*t;return e=this._reducePoints(e,n),e=this._simplifyDP(e,n),e},pointToSegmentDistance:function(e,t,n){return Math.sqrt(this._sqClosestPointOnSegment(e,t,n,!0))},closestPointOnSegment:function(e,t,n){return this._sqClosestPointOnSegment(e,t,n)},_simplifyDP:function(e,n){var r=e.length,i=typeof Uint8Array!=t+""?Uint8Array:Array,s=new i(r);s[0]=s[r-1]=1,this._simplifyDPStep(e,s,n,0,r-1);var o,u=[];for(o=0;o<r;o++)s[o]&&u.push(e[o]);return u},_simplifyDPStep:function(e,t,n,r,i){var s=0,o,u,a;for(u=r+1;u<=i-1;u++)a=this._sqClosestPointOnSegment(e[u],e[r],e[i],!0),a>s&&(o=u,s=a);s>n&&(t[o]=1,this._simplifyDPStep(e,t,n,r,o),this._simplifyDPStep(e,t,n,o,i))},_reducePoints:function(e,t){var n=[e[0]];for(var r=1,i=0,s=e.length;r<s;r++)this._sqDist(e[r],e[i])>t&&(n.push(e[r]),i=r);return i<s-1&&n.push(e[s-1]),n},clipSegment:function(e,t,n,r){var i=n.min,s=n.max,o=r?this._lastCode:this._getBitCode(e,n),u=this._getBitCode(t,n);this._lastCode=u;for(;;){if(!(o|u))return[e,t];if(o&u)return!1;var a=o||u,f=this._getEdgeIntersection(e,t,a,n),l=this._getBitCode(f,n);a===o?(e=f,o=l):(t=f,u=l)}},_getEdgeIntersection:function(e,t,r,i){var s=t.x-e.x,o=t.y-e.y,u=i.min,a=i.max;if(r&8)return new n.Point(e.x+s*(a.y-e.y)/o,a.y);if(r&4)return new n.Point(e.x+s*(u.y-e.y)/o,u.y);if(r&2)return new n.Point(a.x,e.y+o*(a.x-e.x)/s);if(r&1)return new n.Point(u.x,e.y+o*(u.x-e.x)/s)},_getBitCode:function(e,t){var n=0;return e.x<t.min.x?n|=1:e.x>t.max.x&&(n|=2),e.y<t.min.y?n|=4:e.y>t.max.y&&(n|=8),n},_sqDist:function(e,t){var n=t.x-e.x,r=t.y-e.y;return n*n+r*r},_sqClosestPointOnSegment:function(e,t,r,i){var s=t.x,o=t.y,u=r.x-s,a=r.y-o,f=u*u+a*a,l;return f>0&&(l=((e.x-s)*u+(e.y-o)*a)/f,l>1?(s=r.x,o=r.y):l>0&&(s+=u*l,o+=a*l)),u=e.x-s,a=e.y-o,i?u*u+a*a:new n.Point(s,o)}},n.Polyline=n.Path.extend({initialize:function(e,t){n.Path.prototype.initialize.call(this,t),this._latlngs=this._convertLatLngs(e),n.Handler.PolyEdit&&(this.editing=new n.Handler.PolyEdit(this),this.options.editable&&this.editing.enable())},options:{smoothFactor:1,noClip:!1},projectLatlngs:function(){this._originalPoints=[];for(var e=0,t=this._latlngs.length;e<t;e++)this._originalPoints[e]=this._map.latLngToLayerPoint(this._latlngs[e])},getPathString:function(){for(var e=0,t=this._parts.length,n="";e<t;e++)n+=this._getPathPartStr(this._parts[e]);return n},getLatLngs:function(){return this._latlngs},setLatLngs:function(e){return this._latlngs=this._convertLatLngs(e),this.redraw()},addLatLng:function(e){return this._latlngs.push(n.latLng(e)),this.redraw()},spliceLatLngs:function(e,t){var n=[].splice.apply(this._latlngs,arguments);return this._convertLatLngs(this._latlngs),this.redraw(),n},closestLayerPoint:function(e){var t=Infinity,r=this._parts,i,s,o=null;for(var u=0,a=r.length;u<a;u++){var f=r[u];for(var l=1,c=f.length;l<c;l++){i=f[l-1],s=f[l];var h=n.LineUtil._sqClosestPointOnSegment(e,i,s,!0);h<t&&(t=h,o=n.LineUtil._sqClosestPointOnSegment(e,i,s))}}return o&&(o.distance=Math.sqrt(t)),o},getBounds:function(){var e=new n.LatLngBounds,t=this.getLatLngs();for(var r=0,i=t.length;r<i;r++)e.extend(t[r]);return e},onAdd:function(e){n.Path.prototype.onAdd.call(this,e),this.editing&&this.editing.enabled()&&this.editing.addHooks()},onRemove:function(e){this.editing&&this.editing.enabled()&&this.editing.removeHooks(),n.Path.prototype.onRemove.call(this,e)},_convertLatLngs:function(e){var t,r;for(t=0,r=e.length;t<r;t++){if(e[t]instanceof Array&&typeof e[t][0]!="number")return;e[t]=n.latLng(e[t])}return e},_initEvents:function(){n.Path.prototype._initEvents.call(this)},_getPathPartStr:function(e){var t=n.Path.VML;for(var r=0,i=e.length,s="",o;r<i;r++)o=e[r],t&&o._round(),s+=(r?"L":"M")+o.x+" "+o.y;return s},_clipPoints:function(){var e=this._originalPoints,t=e.length,r,i,s;if(this.options.noClip){this._parts=[e];return}this._parts=[];var o=this._parts,u=this._map._pathViewport,a=n.LineUtil;for(r=0,i=0;r<t-1;r++){s=a.clipSegment(e[r],e[r+1],u,r);if(!s)continue;o[i]=o[i]||[],o[i].push(s[0]);if(s[1]!==e[r+1]||r===t-2)o[i].push(s[1]),i++}},_simplifyPoints:function(){var e=this._parts,t=n.LineUtil;for(var r=0,i=e.length;r<i;r++)e[r]=t.simplify(e[r],this.options.smoothFactor)},_updatePath:function(){if(!this._map)return;this._clipPoints(),this._simplifyPoints(),n.Path.prototype._updatePath.call(this)}}),n.polyline=function(e,t){return new n.Polyline(e,t)},n.PolyUtil={},n.PolyUtil.clipPolygon=function(e,t){var r=t.min,i=t.max,s,o=[1,4,2,8],u,a,f,l,c,h,p,d,v=n.LineUtil;for(u=0,h=e.length;u<h;u++)e[u]._code=v._getBitCode(e[u],t);for(f=0;f<4;f++){p=o[f],s=[];for(u=0,h=e.length,a=h-1;u<h;a=u++)l=e[u],c=e[a],l._code&p?c._code&p||(d=v._getEdgeIntersection(c,l,p,t),d._code=v._getBitCode(d,t),s.push(d)):(c._code&p&&(d=v._getEdgeIntersection(c,l,p,t),d._code=v._getBitCode(d,t),s.push(d)),s.push(l));e=s}return e},n.Polygon=n.Polyline.extend({options:{fill:!0},initialize:function(e,t){n.Polyline.prototype.initialize.call(this,e,t),e&&e[0]instanceof Array&&typeof e[0][0]!="number"&&(this._latlngs=this._convertLatLngs(e[0]),this._holes=e.slice(1))},projectLatlngs:function(){n.Polyline.prototype.projectLatlngs.call(this),this._holePoints=[];if(!this._holes)return;for(var e=0,t=this._holes.length,r;e<t;e++){this._holePoints[e]=[];for(var i=0,s=this._holes[e].length;i<s;i++)this._holePoints[e][i]=this._map.latLngToLayerPoint(this._holes[e][i])}},_clipPoints:function(){var e=this._originalPoints,t=[];this._parts=[e].concat(this._holePoints);if(this.options.noClip)return;for(var r=0,i=this._parts.length;r<i;r++){var s=n.PolyUtil.clipPolygon(this._parts[r],this._map._pathViewport);if(!s.length)continue;t.push(s)}this._parts=t},_getPathPartStr:function(e){var t=n.Polyline.prototype._getPathPartStr.call(this,e);return t+(n.Browser.svg?"z":"x")}}),n.polygon=function(e,t){return new n.Polygon(e,t)},function(){function e(e){return n.FeatureGroup.extend({initialize:function(e,t){this._layers={},this._options=t,this.setLatLngs(e)},setLatLngs:function(t){var n=0,r=t.length;this.eachLayer(function(e){n<r?e.setLatLngs(t[n++]):this.removeLayer(e)},this);while(n<r)this.addLayer(new e(t[n++],this._options));return this}})}n.MultiPolyline=e(n.Polyline),n.MultiPolygon=e(n.Polygon),n.multiPolyline=function(e,t){return new n.MultiPolyline(e,t)},n.multiPolygon=function(e,t){return new n.MultiPolygon(e,t)}}(),n.Rectangle=n.Polygon.extend({initialize:function(e,t){n.Polygon.prototype.initialize.call(this,this._boundsToLatLngs(e),t)},setBounds:function(e){this.setLatLngs(this._boundsToLatLngs(e))},_boundsToLatLngs:function(e){return e=n.latLngBounds(e),[e.getSouthWest(),e.getNorthWest(),e.getNorthEast(),e.getSouthEast(),e.getSouthWest()]}}),n.rectangle=function(e,t){return new n.Rectangle(e,t)},n.Circle=n.Path.extend({initialize:function(e,t,r){n.Path.prototype.initialize.call(this,r),this._latlng=n.latLng(e),this._mRadius=t},options:{fill:!0},setLatLng:function(e){return this._latlng=n.latLng(e),this.redraw()},setRadius:function(e){return this._mRadius=e,this.redraw()},projectLatlngs:function(){var e=this._getLngRadius(),t=new n.LatLng(this._latlng.lat,this._latlng.lng-e,!0),r=this._map.latLngToLayerPoint(t);this._point=this._map.latLngToLayerPoint(this._latlng),this._radius=Math.max(Math.round(this._point.x-r.x),1)},getBounds:function(){var e=this._map,t=this._radius*Math.cos(Math.PI/4),r=e.project(this._latlng),i=new n.Point(r.x-t,r.y+t),s=new n.Point(r.x+t,r.y-t),o=e.unproject(i),u=e.unproject(s);return new n.LatLngBounds(o,u)},getLatLng:function(){return this._latlng},getPathString:function(){var e=this._point,t=this._radius;return this._checkIfEmpty()?"":n.Browser.svg?"M"+e.x+","+(e.y-t)+"A"+t+","+t+",0,1,1,"+(e.x-.1)+","+(e.y-t)+" z":(e._round(),t=Math.round(t),"AL "+e.x+","+e.y+" "+t+","+t+" 0,"+23592600)},getRadius:function(){return this._mRadius},_getLngRadius:function(){var e=40075017,t=e*Math.cos(n.LatLng.DEG_TO_RAD*this._latlng.lat);return this._mRadius/t*360},_checkIfEmpty:function(){if(!this._map)return!1;var e=this._map._pathViewport,t=this._radius,n=this._point;return n.x-t>e.max.x||n.y-t>e.max.y||n.x+t<e.min.x||n.y+t<e.min.y}}),n.circle=function(e,t,r){return new n.Circle(e,t,r)},n.CircleMarker=n.Circle.extend({options:{radius:10,weight:2},initialize:function(e,t){n.Circle.prototype.initialize.call(this,e,null,t),this._radius=this.options.radius},projectLatlngs:function(){this._point=this._map.latLngToLayerPoint(this._latlng)},setRadius:function(e){return this._radius=e,this.redraw()}}),n.circleMarker=function(e,t){return new n.CircleMarker(e,t)},n.Polyline.include(n.Path.CANVAS?{_containsPoint:function(e,t){var r,i,s,o,u,a,f,l=this.options.weight/2;n.Browser.touch&&(l+=10);for(r=0,o=this._parts.length;r<o;r++){f=this._parts[r];for(i=0,u=f.length,s=u-1;i<u;s=i++){if(!t&&i===0)continue;a=n.LineUtil.pointToSegmentDistance(e,f[s],f[i]);if(a<=l)return!0}}return!1}}:{}),n.Polygon.include(n.Path.CANVAS?{_containsPoint:function(e){var t=!1,r,i,s,o,u,a,f,l;if(n.Polyline.prototype._containsPoint.call(this,e,!0))return!0;for(o=0,f=this._parts.length;o<f;o++){r=this._parts[o];for(u=0,l=r.length,a=l-1;u<l;a=u++)i=r[u],s=r[a],i.y>e.y!=s.y>e.y&&e.x<(s.x-i.x)*(e.y-i.y)/(s.y-i.y)+i.x&&(t=!t)}return t}}:{}),n.Circle.include(n.Path.CANVAS?{_drawPath:function(){var e=this._point;this._ctx.beginPath(),this._ctx.arc(e.x,e.y,this._radius,0,Math.PI*2,!1)},_containsPoint:function(e){var t=this._point,n=this.options.stroke?this.options.weight/2:0;return e.distanceTo(t)<=this._radius+n}}:{}),n.GeoJSON=n.FeatureGroup.extend({initialize:function(e,t){n.Util.setOptions(this,t),this._layers={},e&&this.addData(e)},addData:function(e){var t=e instanceof Array?e:e.features,r,i;if(t){for(r=0,i=t.length;r<i;r++)this.addData(t[r]);return this}var s=this.options;if(s.filter&&!s.filter(e))return;var o=n.GeoJSON.geometryToLayer(e,s.pointToLayer);return o.feature=e,this.resetStyle(o),s.onEachFeature&&s.onEachFeature(e,o),this.addLayer(o)},resetStyle:function(e){var t=this.options.style;t&&this._setLayerStyle(e,t)},setStyle:function(e){this.eachLayer(function(t){this._setLayerStyle(t,e)},this)},_setLayerStyle:function(e,t){typeof t=="function"&&(t=t(e.feature)),e.setStyle&&e.setStyle(t)}}),n.Util.extend(n.GeoJSON,{geometryToLayer:function(e,t){var r=e.type==="Feature"?e.geometry:e,i=r.coordinates,s=[],o,u,a,f,l;switch(r.type){case"Point":return o=this.coordsToLatLng(i),t?t(e,o):new n.Marker(o);case"MultiPoint":for(a=0,f=i.length;a<f;a++)o=this.coordsToLatLng(i[a]),l=t?t(e,o):new n.Marker(o),s.push(l);return new n.FeatureGroup(s);case"LineString":return u=this.coordsToLatLngs(i),new n.Polyline(u);case"Polygon":return u=this.coordsToLatLngs(i,1),new n.Polygon(u);case"MultiLineString":return u=this.coordsToLatLngs(i,1),new n.MultiPolyline(u);case"MultiPolygon":return u=this.coordsToLatLngs(i,2),new n.MultiPolygon(u);case"GeometryCollection":for(a=0,f=r.geometries.length;a<f;a++)l=this.geometryToLayer(r.geometries[a],t),s.push(l);return new n.FeatureGroup(s);default:throw Error("Invalid GeoJSON object.")}},coordsToLatLng:function(e,t){var r=parseFloat(e[t?0:1]),i=parseFloat(e[t?1:0]);return new n.LatLng(r,i,!0)},coordsToLatLngs:function(e,t,n){var r,i=[],s,o;for(s=0,o=e.length;s<o;s++)r=t?this.coordsToLatLngs(e[s],t-1,n):this.coordsToLatLng(e[s],n),i.push(r);return i}}),n.geoJson=function(e,t){return new n.GeoJSON(e,t)},n.DomEvent={addListener:function(e,t,r,i){var s=n.Util.stamp(r),o="_leaflet_"+t+s,u,a,f;return e[o]?this:(u=function(t){return r.call(i||e,t||n.DomEvent._getEvent())},n.Browser.touch&&t==="dblclick"&&this.addDoubleTapListener?this.addDoubleTapListener(e,u,s):("addEventListener"in e?t==="mousewheel"?(e.addEventListener("DOMMouseScroll",u,!1),e.addEventListener(t,u,!1)):t==="mouseenter"||t==="mouseleave"?(a=u,f=t==="mouseenter"?"mouseover":"mouseout",u=function(t){if(!n.DomEvent._checkMouse(e,t))return;return a(t)},e.addEventListener(f,u,!1)):e.addEventListener(t,u,!1):"attachEvent"in e&&e.attachEvent("on"+t,u),e[o]=u,this))},removeListener:function(e,t,r){var i=n.Util.stamp(r),s="_leaflet_"+t+i,o=e[s];if(!o)return;return n.Browser.touch&&t==="dblclick"&&this.removeDoubleTapListener?this.removeDoubleTapListener(e,i):"removeEventListener"in e?t==="mousewheel"?(e.removeEventListener("DOMMouseScroll",o,!1),e.removeEventListener(t,o,!1)):t==="mouseenter"||t==="mouseleave"?e.removeEventListener(t==="mouseenter"?"mouseover":"mouseout",o,!1):e.removeEventListener(t,o,!1):"detachEvent"in e&&e.detachEvent("on"+t,o),e[s]=null,this},stopPropagation:function(e){return e.stopPropagation?e.stopPropagation():e.cancelBubble=!0,this},disableClickPropagation:function(e){var t=n.DomEvent.stopPropagation;return n.DomEvent.addListener(e,n.Draggable.START,t).addListener(e,"click",t).addListener(e,"dblclick",t)},preventDefault:function(e){return e.preventDefault?e.preventDefault():e.returnValue=!1,this},stop:function(e){return n.DomEvent.preventDefault(e).stopPropagation(e)},getMousePosition:function(e,t){var r=document.body,i=document.documentElement,s=e.pageX?e.pageX:e.clientX+r.scrollLeft+i.scrollLeft,o=e.pageY?e.pageY:e.clientY+r.scrollTop+i.scrollTop,u=new n.Point(s,o);return t?u._subtract(n.DomUtil.getViewportOffset(t)):u},getWheelDelta:function(e){var t=0;return e.wheelDelta&&(t=e.wheelDelta/120),e.detail&&(t=-e.detail/3),t},_checkMouse:function(e,t){var n=t.relatedTarget;if(!n)return!0;try{while(n&&n!==e)n=n.parentNode}catch(r){return!1}return n!==e},_getEvent:function(){var t=e.event;if(!t){var n=arguments.callee.caller;while(n){t=n.arguments[0];if(t&&e.Event===t.constructor)break;n=n.caller}}return t}},n.DomEvent.on=n.DomEvent.addListener,n.DomEvent.off=n.DomEvent.removeListener,n.Draggable=n.Class.extend({includes:n.Mixin.Events,statics:{START:n.Browser.touch?"touchstart":"mousedown",END:n.Browser.touch?"touchend":"mouseup",MOVE:n.Browser.touch?"touchmove":"mousemove",TAP_TOLERANCE:15},initialize:function(e,t){this._element=e,this._dragStartTarget=t||e},enable:function(){if(this._enabled)return;n.DomEvent.on(this._dragStartTarget,n.Draggable.START,this._onDown,this),this._enabled=!0},disable:function(){if(!this._enabled)return;n.DomEvent.off(this._dragStartTarget,n.Draggable.START,this._onDown),this._enabled=!1,this._moved=!1},_onDown:function(e){if(!n.Browser.touch&&e.shiftKey||e.which!==1&&e.button!==1&&!e.touches)return;this._simulateClick=!0;if(e.touches&&e.touches.length>1){this._simulateClick=!1;return}var t=e.touches&&e.touches.length===1?e.touches[0]:e,r=t.target;n.DomEvent.preventDefault(e),n.Browser.touch&&r.tagName.toLowerCase()==="a"&&n.DomUtil.addClass(r,"leaflet-active"),this._moved=!1;if(this._moving)return;this._startPos=this._newPos=n.DomUtil.getPosition(this._element),this._startPoint=new n.Point(t.clientX,t.clientY),n.DomEvent.on(document,n.Draggable.MOVE,this._onMove,this),n.DomEvent.on(document,n.Draggable.END,this._onUp,this)},_onMove:function(e){if(e.touches&&e.touches.length>1)return;var t=e.touches&&e.touches.length===1?e.touches[0]:e,r=new n.Point(t.clientX,t.clientY),i=r.subtract(this._startPoint);if(!i.x&&!i.y)return;n.DomEvent.preventDefault(e),this._moved||(this.fire("dragstart"),this._moved=!0,n.Browser.touch||(n.DomUtil.disableTextSelection(),this._setMovingCursor())),this._newPos=this._startPos.add(i),this._moving=!0,n.Util.cancelAnimFrame(this._animRequest),this._animRequest=n.Util.requestAnimFrame(this._updatePosition,this,!0,this._dragStartTarget)},_updatePosition:function(){this.fire("predrag"),n.DomUtil.setPosition(this._element,this._newPos),this.fire("drag")},_onUp:function(e){if(this._simulateClick&&e.changedTouches){var t=e.changedTouches[0],r=t.target,i=this._newPos&&this._newPos.distanceTo(this._startPos)||0;r.tagName.toLowerCase()==="a"&&n.DomUtil.removeClass(r,"leaflet-active"),i<n.Draggable.TAP_TOLERANCE&&this._simulateEvent("click",t)}n.Browser.touch||(n.DomUtil.enableTextSelection(),this._restoreCursor()),n.DomEvent.off(document,n.Draggable.MOVE,this._onMove),n.DomEvent.off(document,n.Draggable.END,this._onUp),this._moved&&(n.Util.cancelAnimFrame(this._animRequest),this.fire("dragend")),this._moving=!1},_setMovingCursor:function(){n.DomUtil.addClass(document.body,"leaflet-dragging")},_restoreCursor:function(){n.DomUtil.removeClass(document.body,"leaflet-dragging")},_simulateEvent:function(t,n){var r=document.createEvent("MouseEvents");r.initMouseEvent(t,!0,!0,e,1,n.screenX,n.screenY,n.clientX,n.clientY,!1,!1,!1,!1,0,null),n.target.dispatchEvent(r)}}),n.Handler=n.Class.extend({initialize:function(e){this._map=e},enable:function(){if(this._enabled)return;this._enabled=!0,this.addHooks()},disable:function(){if(!this._enabled)return;this._enabled=!1,this.removeHooks()},enabled:function(){return!!this._enabled}}),n.Map.mergeOptions({dragging:!0,inertia:!n.Browser.android23,inertiaDeceleration:3e3,inertiaMaxSpeed:1500,inertiaThreshold:n.Browser.touch?32:14,worldCopyJump:!0}),n.Map.Drag=n.Handler.extend({addHooks:function(){if(!this._draggable){this._draggable=new n.Draggable(this._map._mapPane,this._map._container),this._draggable.on({dragstart:this._onDragStart,drag:this._onDrag,dragend:this._onDragEnd},this);var e=this._map.options;e.worldCopyJump&&(this._draggable.on("predrag",this._onPreDrag,this),this._map.on("viewreset",this._onViewReset,this))}this._draggable.enable()},removeHooks:function(){this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},_onDragStart:function(){var e=this._map;e.fire("movestart").fire("dragstart"),e._panTransition&&e._panTransition._onTransitionEnd(!0),e.options.inertia&&(this._positions=[],this._times=[])},_onDrag:function(){if(this._map.options.inertia){var e=this._lastTime=+(new Date),t=this._lastPos=this._draggable._newPos;this._positions.push(t),this._times.push(e),e-this._times[0]>200&&(this._positions.shift(),this._times.shift())}this._map.fire("move").fire("drag")},_onViewReset:function(){var e=this._map.getSize().divideBy(2),t=this._map.latLngToLayerPoint(new n.LatLng(0,0));this._initialWorldOffset=t.subtract(e).x,this._worldWidth=this._map.project(new n.LatLng(0,180)).x},_onPreDrag:function(){var e=this._map,t=this._worldWidth,n=Math.round(t/2),r=this._initialWorldOffset,i=this._draggable._newPos.x,s=(i-n+r)%t+n-r,o=(i+n+r)%t-n-r,u=Math.abs(s+r)<Math.abs(o+r)?s:o;this._draggable._newPos.x=u},_onDragEnd:function(){var e=this._map,r=e.options,i=+(new Date)-this._lastTime,s=!r.inertia||i>r.inertiaThreshold||this._positions[0]===t;if(s)e.fire("moveend");else{var o=this._lastPos.subtract(this._positions[0]),u=(this._lastTime+i-this._times[0])/1e3,a=o.multiplyBy(.58/u),f=a.distanceTo(new n.Point(0,0)),l=Math.min(r.inertiaMaxSpeed,f),c=a.multiplyBy(l/f),h=l/r.inertiaDeceleration,p=c.multiplyBy(-h/2).round(),d={duration:h,easing:"ease-out"};n.Util.requestAnimFrame(n.Util.bind(function(){this._map.panBy(p,d)},this))}e.fire("dragend"),r.maxBounds&&n.Util.requestAnimFrame(this._panInsideMaxBounds,e,!0,e._container)},_panInsideMaxBounds:function(){this.panInsideBounds(this.options.maxBounds)}}),n.Map.addInitHook("addHandler","dragging",n.Map.Drag),n.Map.mergeOptions({doubleClickZoom:!0}),n.Map.DoubleClickZoom=n.Handler.extend({addHooks:function(){this._map.on("dblclick",this._onDoubleClick)},removeHooks:function(){this._map.off("dblclick",this._onDoubleClick)},_onDoubleClick:function(e){this.setView(e.latlng,this._zoom+1)}}),n.Map.addInitHook("addHandler","doubleClickZoom",n.Map.DoubleClickZoom),n.Map.mergeOptions({scrollWheelZoom:!n.Browser.touch}),n.Map.ScrollWheelZoom=n.Handler.extend({addHooks:function(){n.DomEvent.on(this._map._container,"mousewheel",this._onWheelScroll,this),this._delta=0},removeHooks:function(){n.DomEvent.off(this._map._container,"mousewheel",this._onWheelScroll)},_onWheelScroll:function(e){var t=n.DomEvent.getWheelDelta(e);this._delta+=t,this._lastMousePos=this._map.mouseEventToContainerPoint(e),clearTimeout(this._timer),this._timer=setTimeout(n.Util.bind(this._performZoom,this),40),n.DomEvent.preventDefault(e)},_performZoom:function(){var e=this._map,t=Math.round(this._delta),n=e.getZoom();t=Math.max(Math.min(t,4),-4),t=e._limitZoom(n+t)-n,this._delta=0;if(!t)return;var r=n+t,i=this._getCenterForScrollWheelZoom(this._lastMousePos,r);e.setView(i,r)},_getCenterForScrollWheelZoom:function(e,t){var n=this._map,r=n.getZoomScale(t),i=n.getSize().divideBy(2),s=e.subtract(i).multiplyBy(1-1/r),o=n._getTopLeftPoint().add(i).add(s);return n.unproject(o)}}),n.Map.addInitHook("addHandler","scrollWheelZoom",n.Map.ScrollWheelZoom),n.Util.extend(n.DomEvent,{addDoubleTapListener:function(e,t,n){function l(e){if(e.touches.length!==1)return;var t=Date.now(),n=t-(r||t);o=e.touches[0],i=n>0&&n<=s,r=t}function c(e){i&&(o.type="dblclick",t(o),r=null)}var r,i=!1,s=250,o,u="_leaflet_",a="touchstart",f="touchend";return e[u+a+n]=l,e[u+f+n]=c,e.addEventListener(a,l,!1),e.addEventListener(f,c,!1),this},removeDoubleTapListener:function(e,t){var n="_leaflet_";return e.removeEventListener(e,e[n+"touchstart"+t],!1),e.removeEventListener(e,e[n+"touchend"+t],!1),this}}),n.Map.mergeOptions({touchZoom:n.Browser.touch&&!n.Browser.android23}),n.Map.TouchZoom=n.Handler.extend({addHooks:function(){n.DomEvent.on(this._map._container,"touchstart",this._onTouchStart,this)},removeHooks:function(){n.DomEvent.off(this._map._container,"touchstart",this._onTouchStart,this)},_onTouchStart:function(e){var t=this._map;if(!e.touches||e.touches.length!==2||t._animatingZoom||this._zooming)return;var r=t.mouseEventToLayerPoint(e.touches[0]),i=t.mouseEventToLayerPoint(e.touches[1]),s=t._getCenterLayerPoint();this._startCenter=r.add(i).divideBy(2,!0),this._startDist=r.distanceTo(i),this._moved=!1,this._zooming=!0,this._centerOffset=s.subtract(this._startCenter),n.DomEvent.on(document,"touchmove",this._onTouchMove,this).on(document,"touchend",this._onTouchEnd,this),n.DomEvent.preventDefault(e)},_onTouchMove:function(e){if(!e.touches||e.touches.length!==2)return;var t=this._map,r=t.mouseEventToLayerPoint(e.touches[0]),i=t.mouseEventToLayerPoint(e.touches[1]);this._scale=r.distanceTo(i)/this._startDist,this._delta=r.add(i).divideBy(2,!0).subtract(this._startCenter);if(this._scale===1)return;this._moved||(n.DomUtil.addClass(t._mapPane,"leaflet-zoom-anim leaflet-touching"),t.fire("movestart").fire("zoomstart")._prepareTileBg(),this._moved=!0),n.Util.cancelAnimFrame(this._animRequest),this._animRequest=n.Util.requestAnimFrame(this._updateOnMove,this,!0,this._map._container),n.DomEvent.preventDefault(e)},_updateOnMove:function(){var e=this._map,t=this._getScaleOrigin(),r=e.layerPointToLatLng(t);e.fire("zoomanim",{center:r,zoom:e.getScaleZoom(this._scale)}),e._tileBg.style[n.DomUtil.TRANSFORM]=n.DomUtil.getTranslateString(this._delta)+" "+n.DomUtil.getScaleString(this._scale,this._startCenter)},_onTouchEnd:function(e){if(!this._moved||!this._zooming)return;var t=this._map;this._zooming=!1,n.DomUtil.removeClass(t._mapPane,"leaflet-touching"),n.DomEvent.off(document,"touchmove",this._onTouchMove).off(document,"touchend",this._onTouchEnd);var r=this._getScaleOrigin(),i=t.layerPointToLatLng(r),s=t.getZoom(),o=t.getScaleZoom(this._scale)-s,u=o>0?Math.ceil(o):Math.floor(o),a=t._limitZoom(s+u);t.fire("zoomanim",{center:i,zoom:a}),t._runAnimation(i,a,t.getZoomScale(a)/this._scale,r,!0)},_getScaleOrigin:function(){var e=this._centerOffset.subtract(this._delta).divideBy(this._scale);return this._startCenter.add(e)}}),n.Map.addInitHook("addHandler","touchZoom",n.Map.TouchZoom),n.Map.mergeOptions({boxZoom:!0}),n.Map.BoxZoom=n.Handler.extend({initialize:function(e){this._map=e,this._container=e._container,this._pane=e._panes.overlayPane},addHooks:function(){n.DomEvent.on(this._container,"mousedown",this._onMouseDown,this)},removeHooks:function(){n.DomEvent.off(this._container,"mousedown",this._onMouseDown)},_onMouseDown:function(e){if(!e.shiftKey||e.which!==1&&e.button!==1)return!1;n.DomUtil.disableTextSelection(),this._startLayerPoint=this._map.mouseEventToLayerPoint(e),this._box=n.DomUtil.create("div","leaflet-zoom-box",this._pane),n.DomUtil.setPosition(this._box,this._startLayerPoint),this._container.style.cursor="crosshair",n.DomEvent.on(document,"mousemove",this._onMouseMove,this).on(document,"mouseup",this._onMouseUp,this).preventDefault(e),this._map.fire("boxzoomstart")},_onMouseMove:function(e){var t=this._startLayerPoint,r=this._box,i=this._map.mouseEventToLayerPoint(e),s=i.subtract(t),o=new n.Point(Math.min(i.x,t.x),Math.min(i.y,t.y));n.DomUtil.setPosition(r,o),r.style.width=Math.abs(s.x)-4+"px",r.style.height=Math.abs(s.y)-4+"px"},_onMouseUp:function(e){this._pane.removeChild(this._box),this._container.style.cursor="",n.DomUtil.enableTextSelection(),n.DomEvent.off(document,"mousemove",this._onMouseMove).off(document,"mouseup",this._onMouseUp);var t=this._map,r=t.mouseEventToLayerPoint(e),i=new n.LatLngBounds(t.layerPointToLatLng(this._startLayerPoint),t.layerPointToLatLng(r));t.fitBounds(i),t.fire("boxzoomend",{boxZoomBounds:i})}}),n.Map.addInitHook("addHandler","boxZoom",n.Map.BoxZoom),n.Map.mergeOptions({keyboard:!0,keyboardPanOffset:80,keyboardZoomOffset:1}),n.Map.Keyboard=n.Handler.extend({keyCodes:{left:[37],right:[39],down:[40],up:[38],zoomIn:[187,107,61],zoomOut:[189,109]},initialize:function(e){this._map=e,this._setPanOffset(e.options.keyboardPanOffset),this._setZoomOffset(e.options.keyboardZoomOffset)},addHooks:function(){var e=this._map._container;e.tabIndex===-1&&(e.tabIndex="0"),n.DomEvent.addListener(e,"focus",this._onFocus,this).addListener(e,"blur",this._onBlur,this).addListener(e,"mousedown",this._onMouseDown,this),this._map.on("focus",this._addHooks,this).on("blur",this._removeHooks,this)},removeHooks:function(){this._removeHooks();var e=this._map._container;n.DomEvent.removeListener(e,"focus",this._onFocus,this).removeListener(e,"blur",this._onBlur,this).removeListener(e,"mousedown",this._onMouseDown,this),this._map.off("focus",this._addHooks,this).off("blur",this._removeHooks,this)},_onMouseDown:function(){this._focused||this._map._container.focus()},_onFocus:function(){this._focused=!0,this._map.fire("focus")},_onBlur:function(){this._focused=!1,this._map.fire("blur")},_setPanOffset:function(e){var t=this._panKeys={},n=this.keyCodes,r,i;for(r=0,i=n.left.length;r<i;r++)t[n.left[r]]=[-1*e,0];for(r=0,i=n.right.length;r<i;r++)t[n.right[r]]=[e,0];for(r=0,i=n.down.length;r<i;r++)t[n.down[r]]=[0,e];for(r=0,i=n.up.length;r<i;r++)t[n.up[r]]=[0,-1*e]},_setZoomOffset:function(e){var t=this._zoomKeys={},n=this.keyCodes,r,i;for(r=0,i=n.zoomIn.length;r<i;r++)t[n.zoomIn[r]]=e;for(r=0,i=n.zoomOut.length;r<i;r++)t[n.zoomOut[r]]=-e},_addHooks:function(){n.DomEvent.addListener(document,"keydown",this._onKeyDown,this)},_removeHooks:function(){n.DomEvent.removeListener(document,"keydown",this._onKeyDown,this)},_onKeyDown:function(e){var t=e.keyCode;if(this._panKeys.hasOwnProperty(t))this._map.panBy(this._panKeys[t]);else{if(!this._zoomKeys.hasOwnProperty(t))return;this._map.setZoom(this._map.getZoom()+this._zoomKeys[t])}n.DomEvent.stop(e)}}),n.Map.addInitHook("addHandler","keyboard",n.Map.Keyboard),n.Handler.MarkerDrag=n.Handler.extend({initialize:function(e){this._marker=e},addHooks:function(){var e=this._marker._icon;this._draggable||(this._draggable=(new n.Draggable(e,e)).on("dragstart",this._onDragStart,this).on("drag",this._onDrag,this).on("dragend",this._onDragEnd,this)),this._draggable.enable()},removeHooks:function(){this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},_onDragStart:function(e){this._marker.closePopup().fire("movestart").fire("dragstart")},_onDrag:function(e){var t=n.DomUtil.getPosition(this._marker._icon);this._marker._shadow&&n.DomUtil.setPosition(this._marker._shadow,t),this._marker._latlng=this._marker._map.layerPointToLatLng(t),this._marker.fire("move").fire("drag")},_onDragEnd:function(){this._marker.fire("moveend").fire("dragend")}}),n.Handler.PolyEdit=n.Handler.extend({options:{icon:new n.DivIcon({iconSize:new n.Point(8,8),className:"leaflet-div-icon leaflet-editing-icon"})},initialize:function(e,t){this._poly=e,n.Util.setOptions(this,t)},addHooks:function(){this._poly._map&&(this._markerGroup||this._initMarkers(),this._poly._map.addLayer(this._markerGroup))},removeHooks:function(){this._poly._map&&(this._poly._map.removeLayer(this._markerGroup),delete this._markerGroup,delete this._markers)},updateMarkers:function(){this._markerGroup.clearLayers(),this._initMarkers()},_initMarkers:function(){this._markerGroup||(this._markerGroup=new n.LayerGroup),this._markers=[];var e=this._poly._latlngs,t,r,i,s;for(t=0,i=e.length;t<i;t++)s=this._createMarker(e[t],t),s.on("click",this._onMarkerClick,this),this._markers.push(s);var o,u;for(t=0,r=i-1;t<i;r=t++){if(t===0&&!(n.Polygon&&this._poly instanceof n.Polygon))continue;o=this._markers[r],u=this._markers[t],this._createMiddleMarker(o,u),this._updatePrevNext(o,u)}},_createMarker:function(e,t){var r=new n.Marker(e,{draggable:!0,icon:this.options.icon});return r._origLatLng=e,r._index=t,r.on("drag",this._onMarkerDrag,this),r.on("dragend",this._fireEdit,this),this._markerGroup.addLayer(r),r},_fireEdit:function(){this._poly.fire("edit")},_onMarkerDrag:function(e){var t=e.target;n.Util.extend(t._origLatLng,t._latlng),t._middleLeft&&t._middleLeft.setLatLng(this._getMiddleLatLng(t._prev,t)),t._middleRight&&t._middleRight.setLatLng(this._getMiddleLatLng(t,t._next)),this._poly.redraw()},_onMarkerClick:function(e){if(this._poly._latlngs.length<3)return;var t=e.target,n=t._index;t._prev&&t._next&&(this._createMiddleMarker(t._prev,t._next),this._updatePrevNext(t._prev,t._next)),this._markerGroup.removeLayer(t),t._middleLeft&&this._markerGroup.removeLayer(t._middleLeft),t._middleRight&&this._markerGroup.removeLayer(t._middleRight),this._markers.splice(n,1),this._poly.spliceLatLngs(n,1),this._updateIndexes(n,-1),this._poly.fire("edit")},_updateIndexes:function(e,t){this._markerGroup.eachLayer(function(n){n._index>e&&(n._index+=t)})},_createMiddleMarker:function(e,t){var n=this._getMiddleLatLng(e,t),r=this._createMarker(n),i,s,o;r.setOpacity(.6),e._middleRight=t._middleLeft=r,s=function(){var s=t._index;r._index=s,r.off("click",i).on("click",this._onMarkerClick,this),n.lat=r.getLatLng().lat,n.lng=r.getLatLng().lng,this._poly.spliceLatLngs(s,0,n),this._markers.splice(s,0,r),r.setOpacity(1),this._updateIndexes(s,1),t._index++,this._updatePrevNext(e,r),this._updatePrevNext(r,t)},o=function(){r.off("dragstart",s,this),r.off("dragend",o,this),this._createMiddleMarker(e,r),this._createMiddleMarker(r,t)},i=function(){s.call(this),o.call(this),this._poly.fire("edit")},r.on("click",i,this).on("dragstart",s,this).on("dragend",o,this),this._markerGroup.addLayer(r)},_updatePrevNext:function(e,t){e._next=t,t._prev=e},_getMiddleLatLng:function(e,t){var n=this._poly._map,r=n.latLngToLayerPoint(e.getLatLng()),i=n.latLngToLayerPoint(t.getLatLng());return n.layerPointToLatLng(r._add(i).divideBy(2))}}),n.Control=n.Class.extend({options:{position:"topright"},initialize:function(e){n.Util.setOptions(this,e)},getPosition:function(){return this.options.position},setPosition:function(e){var t=this._map;return t&&t.removeControl(this),this.options.position=e,t&&t.addControl(this),this},addTo:function(e){this._map=e;var t=this._container=this.onAdd(e),r=this.getPosition(),i=e._controlCorners[r];return n.DomUtil.addClass(t,"leaflet-control"),r.indexOf("bottom")!==-1?i.insertBefore(t,i.firstChild):i.appendChild(t),this},removeFrom:function(e){var t=this.getPosition(),n=e._controlCorners[t];return n.removeChild(this._container),this._map=null,this.onRemove&&this.onRemove(e),this}}),n.control=function(e){return new n.Control(e)},n.Map.include({addControl:function(e){return e.addTo(this),this},removeControl:function(e){return e.removeFrom(this),this},_initControlPos:function(){function i(i,s){var o=t+i+" "+t+s;e[i+s]=n.DomUtil.create("div",o,r)}var e=this._controlCorners={},t="leaflet-",r=this._controlContainer=n.DomUtil.create("div",t+"control-container",this._container);i("top","left"),i("top","right"),i("bottom","left"),i("bottom","right")}}),n.Control.Zoom=n.Control.extend({options:{position:"topleft"},onAdd:function(e){var t="leaflet-control-zoom",r=n.DomUtil.create("div",t);return this._createButton("Zoom in",t+"-in",r,e.zoomIn,e),this._createButton("Zoom out",t+"-out",r,e.zoomOut,e),r},_createButton:function(e,t,r,i,s){var o=n.DomUtil.create("a",t,r);return o.href="#",o.title=e,n.DomEvent.on(o,"click",n.DomEvent.stopPropagation).on(o,"click",n.DomEvent.preventDefault).on(o,"click",i,s).on(o,"dblclick",n.DomEvent.stopPropagation),o}}),n.Map.mergeOptions({zoomControl:!0}),n.Map.addInitHook(function(){this.options.zoomControl&&(this.zoomControl=new n.Control.Zoom,this.addControl(this.zoomControl))}),n.control.zoom=function(e){return new n.Control.Zoom(e)},n.Control.Attribution=n.Control.extend({options:{position:"bottomright",prefix:'Powered by <a href="http://leaflet.cloudmade.com">Leaflet</a>'},initialize:function(e){n.Util.setOptions(this,e),this._attributions={}},onAdd:function(e){return this._container=n.DomUtil.create("div","leaflet-control-attribution"),n.DomEvent.disableClickPropagation(this._container),e.on("layeradd",this._onLayerAdd,this).on("layerremove",this._onLayerRemove,this),this._update(),this._container},onRemove:function(e){e.off("layeradd",this._onLayerAdd).off("layerremove",this._onLayerRemove)},setPrefix:function(e){return this.options.prefix=e,this._update(),this},addAttribution:function(e){if(!e)return;return this._attributions[e]||(this._attributions[e]=0),this._attributions[e]++,this._update(),this},removeAttribution:function(e){if(!e)return;return this._attributions[e]--,this._update(),this},_update:function(){if(!this._map)return;var e=[];for(var t in this._attributions)this._attributions.hasOwnProperty(t)&&this._attributions[t]&&e.push(t);var n=[];this.options.prefix&&n.push(this.options.prefix),e.length&&n.push(e.join(", ")),this._container.innerHTML=n.join(" &#8212; ")},_onLayerAdd:function(e){e.layer.getAttribution&&this.addAttribution(e.layer.getAttribution())},_onLayerRemove:function(e){e.layer.getAttribution&&this.removeAttribution(e.layer.getAttribution())}}),n.Map.mergeOptions({attributionControl:!0}),n.Map.addInitHook(function(){this.options.attributionControl&&(this.attributionControl=(new n.Control.Attribution).addTo(this))}),n.control.attribution=function(e){return new n.Control.Attribution(e)},n.Control.Scale=n.Control.extend({options:{position:"bottomleft",maxWidth:100,metric:!0,imperial:!0,updateWhenIdle:!1},onAdd:function(e){this._map=e;var t="leaflet-control-scale",r=n.DomUtil.create("div",t),i=this.options;return this._addScales(i,t,r),e.on(i.updateWhenIdle?"moveend":"move",this._update,this),this._update(),r},onRemove:function(e){e.off(this.options.updateWhenIdle?"moveend":"move",this._update,this)},_addScales:function(e,t,r){e.metric&&(this._mScale=n.DomUtil.create("div",t+"-line",r)),e.imperial&&(this._iScale=n.DomUtil.create("div",t+"-line",r))},_update:function(){var e=this._map.getBounds(),t=e.getCenter().lat,n=6378137*Math.PI*Math.cos(t*Math.PI/180),r=n*(e.getNorthEast().lng-e.getSouthWest().lng)/180,i=this._map.getSize(),s=this.options,o=0;i.x>0&&(o=r*(s.maxWidth/i.x)),this._updateScales(s,o)},_updateScales:function(e,t){e.metric&&t&&this._updateMetric(t),e.imperial&&t&&this._updateImperial(t)},_updateMetric:function(e){var t=this._getRoundNum(e);this._mScale.style.width=this._getScaleWidth(t/e)+"px",this._mScale.innerHTML=t<1e3?t+" m":t/1e3+" km"},_updateImperial:function(e){var t=e*3.2808399,n=this._iScale,r,i,s;t>5280?(r=t/5280,i=this._getRoundNum(r),n.style.width=this._getScaleWidth(i/r)+"px",n.innerHTML=i+" mi"):(s=this._getRoundNum(t),n.style.width=this._getScaleWidth(s/t)+"px",n.innerHTML=s+" ft")},_getScaleWidth:function(e){return Math.round(this.options.maxWidth*e)-10},_getRoundNum:function(e){var t=Math.pow(10,(Math.floor(e)+"").length-1),n=e/t;return n=n>=10?10:n>=5?5:n>=3?3:n>=2?2:1,t*n}}),n.control.scale=function(e){return new n.Control.Scale(e)},n.Control.Layers=n.Control.extend({options:{collapsed:!0,position:"topright",autoZIndex:!0},initialize:function(e,t,r){n.Util.setOptions(this,r),this._layers={},this._lastZIndex=0;for(var i in e)e.hasOwnProperty(i)&&this._addLayer(e[i],i);for(i in t)t.hasOwnProperty(i)&&this._addLayer(t[i],i,!0)},onAdd:function(e){return this._initLayout(),this._update(),this._container},addBaseLayer:function(e,t){return this._addLayer(e,t),this._update(),this},addOverlay:function(e,t){return this._addLayer(e,t,!0),this._update(),this},removeLayer:function(e){var t=n.Util.stamp(e);return delete this._layers[t],this._update(),this},_initLayout:function(){var e="leaflet-control-layers",t=this._container=n.DomUtil.create("div",e);n.Browser.touch?n.DomEvent.on(t,"click",n.DomEvent.stopPropagation):n.DomEvent.disableClickPropagation(t);var r=this._form=n.DomUtil.create("form",e+"-list");if(this.options.collapsed){n.DomEvent.on(t,"mouseover",this._expand,this).on(t,"mouseout",this._collapse,this);var i=this._layersLink=n.DomUtil.create("a",e+"-toggle",t);i.href="#",i.title="Layers",n.Browser.touch?n.DomEvent.on(i,"click",n.DomEvent.stopPropagation).on(i,"click",n.DomEvent.preventDefault).on(i,"click",this._expand,this):n.DomEvent.on(i,"focus",this._expand,this),this._map.on("movestart",this._collapse,this)}else this._expand();this._baseLayersList=n.DomUtil.create("div",e+"-base",r),this._separator=n.DomUtil.create("div",e+"-separator",r),this._overlaysList=n.DomUtil.create("div",e+"-overlays",r),t.appendChild(r)},_addLayer:function(e,t,r){var i=n.Util.stamp(e);this._layers[i]={layer:e,name:t,overlay:r},this.options.autoZIndex&&e.setZIndex&&(this._lastZIndex++,e.setZIndex(this._lastZIndex))},_update:function(){if(!this._container)return;this._baseLayersList.innerHTML="",this._overlaysList.innerHTML="";var e=!1,t=!1;for(var n in this._layers)if(this._layers.hasOwnProperty(n)){var r=this._layers[n];this._addItem(r),t=t||r.overlay,e=e||!r.overlay}this._separator.style.display=t&&e?"":"none"},_createRadioElement:function(e,t){var n='<input type="radio" name="'+e+'"';t&&(n+=' checked="checked"'),n+="/>";var r=document.createElement("div");return r.innerHTML=n,r.firstChild},_addItem:function(e){var t=document.createElement("label"),r,i=this._map.hasLayer(e.layer);e.overlay?(r=document.createElement("input"),r.type="checkbox",r.defaultChecked=i):r=this._createRadioElement("leaflet-base-layers",i),r.layerId=n.Util.stamp(e.layer),n.DomEvent.on(r,"click",this._onInputClick,this);var s=document.createTextNode(" "+e.name);t.appendChild(r),t.appendChild(s);var o=e.overlay?this._overlaysList:this._baseLayersList;o.appendChild(t)},_onInputClick:function(){var e,t,n,r=this._form.getElementsByTagName("input"),i=r.length;for(e=0;e<i;e++)t=r[e],n=this._layers[t.layerId],t.checked?this._map.addLayer(n.layer,!n.overlay):this._map.removeLayer(n.layer)},_expand:function(){n.DomUtil.addClass(this._container,"leaflet-control-layers-expanded")},_collapse:function(){this._container.className=this._container.className.replace(" leaflet-control-layers-expanded","")}}),n.control.layers=function(e,t,r){return new n.Control.Layers(e,t,r)},n.Transition=n.Class.extend({includes:n.Mixin.Events,statics:{CUSTOM_PROPS_SETTERS:{position:n.DomUtil.setPosition},implemented:function(){return n.Transition.NATIVE||n.Transition.TIMER}},options:{easing:"ease",duration:.5},_setProperty:function(e,t){var r=n.Transition.CUSTOM_PROPS_SETTERS;e in r?r[e](this._el,t):this._el.style[e]=t}}),n.Transition=n.Transition.extend({statics:function(){var e=n.DomUtil.TRANSITION,t=e==="webkitTransition"||e==="OTransition"?e+"End":"transitionend";return{NATIVE:!!e,TRANSITION:e,PROPERTY:e+"Property",DURATION:e+"Duration",EASING:e+"TimingFunction",END:t,CUSTOM_PROPS_PROPERTIES:{position:n.Browser.any3d?n.DomUtil.TRANSFORM:"top, left"}}}(),options:{fakeStepInterval:100},initialize:function(e,t){this._el=e,n.Util.setOptions(this,t),n.DomEvent.on(e,n.Transition.END,this._onTransitionEnd,this),this._onFakeStep=n.Util.bind(this._onFakeStep,this)},run:function(e){var t,r=[],i=n.Transition.CUSTOM_PROPS_PROPERTIES;for(t in e)e.hasOwnProperty(t)&&(t=i[t]?i[t]:t,t=this._dasherize(t),r.push(t));this._el.style[n.Transition.DURATION]=this.options.duration+"s",this._el.style[n.Transition.EASING]=this.options.easing,this._el.style[n.Transition.PROPERTY]="all";for(t in e)e.hasOwnProperty(t)&&this._setProperty(t,e[t]);n.Util.falseFn(this._el.offsetWidth),this._inProgress=!0,n.Browser.mobileWebkit&&(this.backupEventFire=setTimeout(n.Util.bind(this._onBackupFireEnd,this),this.options.duration*1.2*1e3)),n.Transition.NATIVE?(clearInterval(this._timer),this._timer=setInterval(this._onFakeStep,this.options.fakeStepInterval)):this._onTransitionEnd()},_dasherize:function(){function t(e){return"-"+e.toLowerCase()}var e=/([A-Z])/g;return function(n){return n.replace(e,t)}}(),_onFakeStep:function(){this.fire("step")},_onTransitionEnd:function(e){this._inProgress&&(this._inProgress=!1,clearInterval(this._timer),this._el.style[n.Transition.TRANSITION]="",clearTimeout(this.backupEventFire),delete this.backupEventFire,this.fire("step"),e&&e.type&&this.fire("end"))},_onBackupFireEnd:function(){var e=document.createEvent("Event");e.initEvent(n.Transition.END,!0,!1),this._el.dispatchEvent(e)}}),n.Transition=n.Transition.NATIVE?n.Transition:n.Transition.extend({statics:{getTime:Date.now||function(){return+(new Date)},TIMER:!0,EASINGS:{linear:function(e){return e},"ease-out":function(e){return e*(2-e)}},CUSTOM_PROPS_GETTERS:{position:n.DomUtil.getPosition},UNIT_RE:/^[\d\.]+(\D*)$/},options:{fps:50},initialize:function(e,t){this._el=e,n.Util.extend(this.options,t),this._easing=n.Transition.EASINGS[this.options.easing]||n.Transition.EASINGS["ease-out"],this._step=n.Util.bind(this._step,this),this._interval=Math.round(1e3/this.options.fps)},run:function(e){this._props={};var t=n.Transition.CUSTOM_PROPS_GETTERS,r=n.Transition.UNIT_RE;this.fire("start");for(var i in e)if(e.hasOwnProperty(i)){var s={};if(i in t)s.from=t[i](this._el);else{var o=this._el.style[i].match(r);s.from=parseFloat(o[0]),s.unit=o[1]}s.to=e[i],this._props[i]=s}clearInterval(this._timer),this._timer=setInterval(this._step,this._interval),this._startTime=n.Transition.getTime()},_step:function(){var e=n.Transition.getTime(),t=e-this._startTime,r=this.options.duration*1e3;t<r?this._runFrame(this._easing(t/r)):(this._runFrame(1),this._complete())},_runFrame:function(e){var t=n.Transition.CUSTOM_PROPS_SETTERS,r,i,s;for(r in this._props)this._props.hasOwnProperty(r)&&(i=this._props[r],r in t?(s=i.to.subtract(i.from).multiplyBy(e).add(i.from),t[r](this._el,s)):this._el.style[r]=(i.to-i.from)*e+i.from+i.unit);this.fire("step")},_complete:function(){clearInterval(this._timer),this.fire("end")}}),n.Map.include(!n.Transition||!n.Transition.implemented()?{}:{setView:function(e,t,n){t=this._limitZoom(t);var r=this._zoom!==t;if(this._loaded&&!n&&this._layers){var i=r?this._zoomToIfClose&&this._zoomToIfClose(e,t):this._panByIfClose(e);if(i)return clearTimeout(this._sizeTimer),this}return this._resetView(e,t),this},panBy:function(e,t){return e=n.point(e),!e.x&&!e.y?this:(this._panTransition||(this._panTransition=new n.Transition(this._mapPane),this._panTransition.on({step:this._onPanTransitionStep,end:this._onPanTransitionEnd},this)),n.Util.setOptions(this._panTransition,n.Util.extend({duration:.25},t)),this.fire("movestart"),n.DomUtil.addClass(this._mapPane,"leaflet-pan-anim"),this._panTransition.run({position:n.DomUtil.getPosition(this._mapPane).subtract(e)}),this)},_onPanTransitionStep:function(){this.fire("move")},_onPanTransitionEnd:function(){n.DomUtil.removeClass(this._mapPane,"leaflet-pan-anim"),this.fire("moveend")},_panByIfClose:function(e){var t=this._getCenterOffset(e)._floor();return this._offsetIsWithinView(t)?(this.panBy(t),!0):!1},_offsetIsWithinView:function(e,t){var n=t||1,r=this.getSize();return Math.abs(e.x)<=r.x*n&&Math.abs(e.y)<=r.y*n}}),n.Map.mergeOptions({zoomAnimation:n.DomUtil.TRANSITION&&!n.Browser.android23&&!n.Browser.mobileOpera}),n.DomUtil.TRANSITION&&n.Map.addInitHook(function(){n.DomEvent.on(this._mapPane,n.Transition.END,this._catchTransitionEnd,this)}),n.Map.include(n.DomUtil.TRANSITION?{_zoomToIfClose:function(e,t){if(this._animatingZoom)return!0;if(!this.options.zoomAnimation)return!1;var r=this.getZoomScale(t),i=this._getCenterOffset(e).divideBy(1-1/r);if(!this._offsetIsWithinView(i,1))return!1;n.DomUtil.addClass(this._mapPane,"leaflet-zoom-anim"),this.fire("movestart").fire("zoomstart"),this.fire("zoomanim",{center:e,zoom:t});var s=this._getCenterLayerPoint().add(i);return this._prepareTileBg(),this._runAnimation(e,t,r,s),!0},_catchTransitionEnd:function(e){this._animatingZoom&&this._onZoomTransitionEnd()},_runAnimation:function(e,t,r,i,s){this._animateToCenter=e,this._animateToZoom=t,this._animatingZoom=!0;var o=n.DomUtil.TRANSFORM,u=this._tileBg;clearTimeout(this._clearTileBgTimer),n.Util.falseFn(u.offsetWidth);var a=n.DomUtil.getScaleString(r,i),f=u.style[o];u.style[o]=s?f+" "+a:a+" "+f},_prepareTileBg:function(){var e=this._tilePane,t=this._tileBg;if(t&&this._getLoadedTilesPercentage(t)>.5&&this._getLoadedTilesPercentage(e)<.5){e.style.visibility="hidden",e.empty=!0,this._stopLoadingImages(e);return}t||(t=this._tileBg=this._createPane("leaflet-tile-pane",this._mapPane),t.style.zIndex=1),t.style[n.DomUtil.TRANSFORM]="",t.style.visibility="hidden",t.empty=!0,e.empty=!1,this._tilePane=this._panes.tilePane=t;var r=this._tileBg=e;n.DomUtil.addClass(r,"leaflet-zoom-animated"),this._stopLoadingImages(r)},_getLoadedTilesPercentage:function(e){var t=e.getElementsByTagName("img"),n,r,i=0;for(n=0,r=t.length;n<r;n++)t[n].complete&&i++;return i/r},_stopLoadingImages:function(e){var t=Array.prototype.slice.call(e.getElementsByTagName("img")),r,i,s;for(r=0,i=t.length;r<i;r++)s=t[r],s.complete||(s.onload=n.Util.falseFn,s.onerror=n.Util.falseFn,s.src=n.Util.emptyImageUrl,s.parentNode.removeChild(s))},_onZoomTransitionEnd:function(){this._restoreTileFront(),n.Util.falseFn(this._tileBg.offsetWidth),this._resetView(this._animateToCenter,this._animateToZoom,!0,!0),n.DomUtil.removeClass(this._mapPane,"leaflet-zoom-anim"),this._animatingZoom=!1},_restoreTileFront:function(){this._tilePane.innerHTML="",this._tilePane.style.visibility="",this._tilePane.style.zIndex=2,this._tileBg.style.zIndex=1},_clearTileBg:function(){!this._animatingZoom&&!this.touchZoom._zooming&&(this._tileBg.innerHTML="")}}:{}),n.Map.include({_defaultLocateOptions:{watch:!1,setView:!1,maxZoom:Infinity,timeout:1e4,maximumAge:0,enableHighAccuracy:!1},locate:function(e){e=this._locationOptions=n.Util.extend(this._defaultLocateOptions,e);if(!navigator.geolocation)return this._handleGeolocationError({code:0,message:"Geolocation not supported."}),this;var t=n.Util.bind(this._handleGeolocationResponse,this),r=n.Util.bind(this._handleGeolocationError,this);return e.watch?this._locationWatchId=navigator.geolocation.watchPosition(t,r,e):navigator.geolocation.getCurrentPosition(t,r,e),this},stopLocate:function(){return navigator.geolocation&&navigator.geolocation.clearWatch(this._locationWatchId),this},_handleGeolocationError:function(e){var t=e.code,n=e.message||(t===1?"permission denied":t===2?"position unavailable":"timeout");this._locationOptions.setView&&!this._loaded&&this.fitWorld(),this.fire("locationerror",{code:t,message:"Geolocation error: "+n+"."})},_handleGeolocationResponse:function(e){var t=180*e.coords.accuracy/4e7,r=t*2,i=e.coords.latitude,s=e.coords.longitude,o=new n.LatLng(i,s),u=new n.LatLng(i-t,s-r),a=new n.LatLng(i+t,s+r),f=new n.LatLngBounds(u,a),l=this._locationOptions;if(l.setView){var c=Math.min(this.getBoundsZoom(f),l.maxZoom);this.setView(o,c)}this.fire("locationfound",{latlng:o,bounds:f,accuracy:e.coords.accuracy})}})})(this);
define("leaflet", ["jquery","splunk.util","contrib/text!contrib/leaflet/leaflet.css","contrib/text!contrib/leaflet/leaflet.ie.css"], (function (global) {
    return function () {
        var ret, fn;
       fn = function ($, SplunkUtil, css, iecss) {
                // resolve image urls
                css = css.replace(/url\(images/g, "url(" + SplunkUtil.make_url("/static/js/contrib/leaflet/images"));

                // inject css into head
                $("head").append("<style type=\"text/css\">" + css + "</style>");

                // if IE <= 8, inject iecss into head
                if ($.browser.msie && (Number($.browser.version) <= 8))
                    $("head").append("<style type=\"text/css\">" + iecss + "</style>");
            };
        ret = fn.apply(global, arguments);
        return ret || global.L;
    };
}(this)));

define('splunk/events/GenericEventData',['require','jg_global','jgatt'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var EventData = require("jgatt").events.EventData;

	return jg_extend(EventData, function(GenericEventData, base)
	{

		// Constructor

		this.constructor = function(attributes)
		{
			if (attributes != null)
			{
				for (var a in attributes)
				{
					if (attributes.hasOwnProperty(a) && !(a in this))
						this[a] = attributes[a];
				}
			}
		};

	});

});

define('splunk/mapping/LatLon',['require','jg_global'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;

	return jg_extend(Object, function(LatLon, base)
	{

		// Public Properties

		this.lat = 0;
		this.lon = 0;

		// Constructor

		this.constructor = function(lat, lon)
		{
			this.lat = (lat !== undefined) ? lat : 0;
			this.lon = (lon !== undefined) ? lon : 0;
		};

		// Public Methods

		this.normalize = function(center)
		{
			var lat = this.lat;
			if (lat < -90)
				lat = -90;
			else if (lat > 90)
				lat = 90;

			var centerLon = center ? center.lon : 0;
			var lon = (this.lon - centerLon) % 360;
			if (lon < -180)
				lon += 360;
			else if (lon > 180)
				lon -= 360;
			lon += centerLon;

			return new LatLon(lat, lon);
		};

		this.isFinite = function()
		{
			return (((this.lat - this.lat) === 0) &&
			        ((this.lon - this.lon) === 0));
		};

		this.equals = function(latLon)
		{
			return ((this.lat == latLon.lat) &&
			        (this.lon == latLon.lon));
		};

		this.clone = function()
		{
			return new LatLon(this.lat, this.lon);
		};

		this.toString = function()
		{
			return "(" + this.lat + ", " + this.lon + ")";
		};

	});

});

define('splunk/mapping/LatLonBounds',['require','jg_global','splunk/mapping/LatLon'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var LatLon = require("splunk/mapping/LatLon");

	return jg_extend(Object, function(LatLonBounds, base)
	{

		// Public Properties

		this.s = 0;
		this.w = 0;
		this.n = 0;
		this.e = 0;

		// Constructor

		this.constructor = function(s, w, n, e)
		{
			this.s = (s !== undefined) ? s : 0;
			this.w = (w !== undefined) ? w : 0;
			this.n = (n !== undefined) ? n : 0;
			this.e = (e !== undefined) ? e : 0;
		};

		// Public Methods

		this.getSW = function()
		{
			return new LatLon(this.s, this.w);
		};

		this.getSE = function()
		{
			return new LatLon(this.s, this.e);
		};

		this.getNW = function()
		{
			return new LatLon(this.n, this.w);
		};

		this.getNE = function()
		{
			return new LatLon(this.n, this.e);
		};

		this.getCenter = function()
		{
			return new LatLon((this.s + this.n) / 2, (this.w + this.e) / 2);
		};

		this.expand = function(latLon)
		{
			if (latLon.lat < this.s)
				this.s = latLon.lat;
			if (latLon.lat > this.n)
				this.n = latLon.lat;
			if (latLon.lon < this.w)
				this.w = latLon.lon;
			if (latLon.lon > this.e)
				this.e = latLon.lon;
		};

		this.contains = function(latLon)
		{
			return ((latLon.lat >= this.s) &&
			        (latLon.lat <= this.n) &&
			        (latLon.lon >= this.w) &&
			        (latLon.lon <= this.e));
		};

		this.normalize = function(center)
		{
			var s = this.s;
			if (s < -90)
				s = -90;
			else if (s > 90)
				s = 90;

			var n = this.n;
			if (n < s)
				n = s;
			else if (n > 90)
				n = 90;

			var centerLon = center ? center.lon : 0;
			var w = (this.w - centerLon);
			var e = (this.e - centerLon);
			if ((e - w) >= 360)
			{
				w = -180;
				e = 180;
			}
			else
			{
				w %= 360;
				if (w < -180)
					w += 360;
				else if (w > 180)
					w -= 360;

				e %= 360;
				if (e < -180)
					e += 360;
				else if (e > 180)
					e -= 360;

				if (e < w)
				{
					if (e > -w)
						w -= 360;
					else
						e += 360;
				}
			}
			w += centerLon;
			e += centerLon;

			return new LatLonBounds(s, w, n, e);
		};

		this.isFinite = function()
		{
			return (((this.s - this.s) === 0) &&
			        ((this.w - this.w) === 0) &&
			        ((this.n - this.n) === 0) &&
			        ((this.e - this.e) === 0));
		};

		this.equals = function(bounds)
		{
			return ((this.s == bounds.s) &&
			        (this.w == bounds.w) &&
			        (this.n == bounds.n) &&
			        (this.e == bounds.e));
		};

		this.clone = function()
		{
			return new LatLonBounds(this.s, this.w, this.n, this.e);
		};

		this.toString = function()
		{
			return "(" + this.s + ", " + this.w + ", " + this.n + ", " + this.e + ")";
		};

	});

});

define('splunk/viz/MRenderTarget',['require','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt'],function(require)
{

	var jg_static = require("jg_global").jg_static;
	var jg_mixin = require("jg_global").jg_mixin;
	var MObservable = require("jgatt").events.MObservable;
	var MPropertyTarget = require("jgatt").properties.MPropertyTarget;
	var PropertyComparator = require("jgatt").utils.PropertyComparator;
	var MValidateTarget = require("jgatt").validation.MValidateTarget;
	var ValidatePass = require("jgatt").validation.ValidatePass;

	return jg_static(function(MRenderTarget)
	{

		// Mixin

		this.mixin = function(base)
		{
			base = jg_mixin(this, MObservable, base);
			base = jg_mixin(this, MPropertyTarget, base);
			base = jg_mixin(this, MValidateTarget, base);
		};

		// Public Passes

		this.renderPass = new ValidatePass("render", 3, new PropertyComparator("renderPriority"));

		// Public Properties

		this.renderPriority = 0;

		// Public Methods

		this.render = function()
		{
		};

	});

});

define('splunk/mapping/layers/LayerBase',['require','jg_global','jg_global','jgatt','jgatt','splunk/viz/MRenderTarget'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var Property = require("jgatt").properties.Property;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var MRenderTarget = require("splunk/viz/MRenderTarget");

	return jg_extend(Object, function(LayerBase, base)
	{

		base = jg_mixin(this, MRenderTarget, base);

		// Public Static Constants

		LayerBase.METADATA_KEY = "__splunk_mapping_layers_LayerBase_metadata";

		// Public Properties

		this.map = new Property("map", Object, null, true);

		this.leafletLayer = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this._map_boundsChanged = FunctionUtils.bind(this._map_boundsChanged, this);

			this.leafletLayer = this.createLeafletLayer();
			if (!this.leafletLayer)
				throw new Error("Value returned from createLeafletLayer() must be non-null.");
		};

		// Public Methods

		this.render = function()
		{
			this.validatePreceding("renderPass");

			if (this.isValid("renderPass"))
				return;

			var map = this.getInternal("map");
			if (map)
				this.renderOverride(map);

			this.setValid("renderPass");
		};

		// Protected Methods

		this.createLeafletLayer = function()
		{
			throw new Error("Must implement method createLeafletLayer.");
		};

		this.renderOverride = function(map)
		{
		};

		this.onAddedToMap = function(map)
		{
			this.setInternal("map", map);

			map.addEventListener("boundsChanged", this._map_boundsChanged);

			this.invalidate("renderPass");
		};

		this.onRemovedFromMap = function(map)
		{
			map.removeEventListener("boundsChanged", this._map_boundsChanged);

			this.setInternal("map", null);
		};

		// Private Methods

		this._map_boundsChanged = function(e)
		{
			this.invalidate("renderPass");
		};

	});

});

define('splunk/viz/VizBase',['require','jquery','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt'],function(require)
{

	var $ = require("jquery");
	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var MObservable = require("jgatt").events.MObservable;
	var MPropertyTarget = require("jgatt").properties.MPropertyTarget;
	var Property = require("jgatt").properties.Property;
	var MValidateTarget = require("jgatt").validation.MValidateTarget;

	return jg_extend(Object, function(VizBase, base)
	{

		base = jg_mixin(this, MObservable, base);
		base = jg_mixin(this, MPropertyTarget, base);
		base = jg_mixin(this, MValidateTarget, base);

		// Private Static Constants

		var _INSTANCE_KEY = "__splunk_viz_VizBase_instance";

		// Private Static Properties

		var _instanceCount = 0;

		// Public Static Methods

		VizBase.getInstance = function(element)
		{
			if (element == null)
				return null;

			element = $(element);
			if (element.length == 0)
				return null;

			element = element[0];

			var instance = element[_INSTANCE_KEY];
			return (instance instanceof VizBase) ? instance : null;
		};

		// Public Properties

		this.id = new Property("id", String, null, true);

		this.element = null;
		this.$element = null;

		// Constructor

		this.constructor = function(html)
		{
			if ((html != null) && (typeof html !== "string"))
				throw new Error("Parameter html must be a string.");

			var query = $(html ? html : "<div></div>");
			if (query.length == 0)
				throw new Error("Parameter html must be valid markup.");

			base.constructor.call(this);

			var id = "splunk-viz-VizBase-" + (++_instanceCount);

			this.element = query[0];
			//this.element[_INSTANCE_KEY] = this;
			//this.element.id = id;

			this.$element = $(this.element);

			this.setInternal("id", id);

			this.addStyleClass("splunk-viz-VizBase");
		};

		// Public Methods

		this.addStyleClass = function(styleClass)
		{
			this.$element.addClass(styleClass);
		};

		this.removeStyleClass = function(styleClass)
		{
			this.$element.removeClass(styleClass);
		};

		this.setStyle = function(style)
		{
			this.$element.css(style);
		};

		this.appendTo = function(parentElement)
		{
			if (parentElement == null)
				throw new Error("Parameter parentElement must be non-null.");

			if (parentElement instanceof VizBase)
				parentElement = parentElement.element;

			parentElement = $(parentElement);
			if (parentElement.length == 0)
				return;

			parentElement = parentElement[0];

			var oldParent = this.element.parentNode;
			if (oldParent && (oldParent !== parentElement))
				this.onRemove();

			parentElement.appendChild(this.element);

			if (oldParent !== parentElement)
				this.onAppend();
		};

		this.replace = function(element)
		{
			if (element == null)
				throw new Error("Parameter element must be non-null.");

			if (element instanceof VizBase)
				element = element.element;

			element = $(element);
			if (element.length == 0)
				return;

			element = element[0];

			var parentElement = element.parentNode;
			if (parentElement == null)
				return;

			var oldParent = this.element.parentNode;
			if (oldParent && (oldParent !== parentElement))
				this.onRemove();

			parentElement.replaceChild(this.element, element);

			if (oldParent !== parentElement)
				this.onAppend();
		};

		this.remove = function()
		{
			var element = this.element;
			var parentElement = element.parentNode;
			if (!parentElement)
				return;

			this.onRemove();

			parentElement.removeChild(element);
		};

		this.dispose = function()
		{
			this.remove();

			// ensure all jquery data and events are removed
			this.$element.remove();
		};

		// Protected Methods

		this.onAppend = function()
		{
		};

		this.onRemove = function()
		{
		};

	});

});

define('splunk/mapping/Map',['require','leaflet','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/events/GenericEventData','splunk/mapping/LatLon','splunk/mapping/LatLonBounds','splunk/mapping/layers/LayerBase','splunk/viz/VizBase'],function(require)
{

	var Leaflet = require("leaflet");
	var jg_extend = require("jg_global").jg_extend;
	var ChainedEvent = require("jgatt").events.ChainedEvent;
	var Event = require("jgatt").events.Event;
	var EventData = require("jgatt").events.EventData;
	var ObservableArrayProperty = require("jgatt").properties.ObservableArrayProperty;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var Property = require("jgatt").properties.Property;
	var ArrayUtils = require("jgatt").utils.ArrayUtils;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var StringUtils = require("jgatt").utils.StringUtils;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var GenericEventData = require("splunk/events/GenericEventData");
	var LatLon = require("splunk/mapping/LatLon");
	var LatLonBounds = require("splunk/mapping/LatLonBounds");
	var LayerBase = require("splunk/mapping/layers/LayerBase");
	var VizBase = require("splunk/viz/VizBase");

	var Map = jg_extend(VizBase, function(Map, base)
	{

		// Private Static Constants

		var _MIN_LAT = -85.051128779806;
		var _MAX_LAT =  85.051128779806;

		// Public Passes

		this.updateLeafletMapSizePass = new ValidatePass("updateLeafletMapSize", -1);
		this.updateTilesPass = new ValidatePass("updateTiles", 0);

		// Public Events

		this.boundsChanged = new ChainedEvent("boundsChanged", this.changed, EventData);
		this.mapClicked = new Event("mapClicked", GenericEventData);

		// Public Properties

		this.center = new Property("center", LatLon, null)
			.getter(function()
			{
				var center = this.leafletMap.getCenter();
				return new LatLon(center.lat, center.lng);
			})
			.setter(function(value)
			{
				value = (value && value.isFinite()) ? value : new LatLon();

				this.validate();
				this.leafletMap.setView(new Leaflet.LatLng(value.lat, value.lon), this.leafletMap.getZoom(), true);

				this._checkBoundsChanged();

				// set a second time on a delay since Leaflet is a POS and doesn't set the
				// center properly if zoom, minZoom, or maxZoom are also set at the same time
				clearTimeout(this._setCenterTimeout);
				this._setCenterTimeout = setTimeout(FunctionUtils.bind(function()
				{
					this.leafletMap.setView(new Leaflet.LatLng(value.lat, value.lon), this.leafletMap.getZoom(), true);
					this._checkBoundsChanged();
				}, this), 250);
			});

		this.zoom = new Property("zoom", Number, 0)
			.getter(function()
			{
				return this.leafletMap.getZoom();
			})
			.setter(function(value)
			{
				value = ((value >= 0) && (value < Infinity)) ? value : 0;

				this.validate();
				this.leafletMap.setView(this.leafletMap.getCenter(), value, true);

				this._checkBoundsChanged();
			});

		this.tileURL = new ObservableProperty("tileURL", String, null)
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.tileSubdomains = new ObservableArrayProperty("tileSubdomains", String, [ "a", "b", "c" ])
			.readFilter(function(value)
			{
				return value.concat();
			})
			.writeFilter(function(value)
			{
				return value ? value.concat() : [];
			})
			.changedComparator(function(oldValue, newValue)
			{
				if (oldValue.length !== newValue.length)
					return true;

				for (var i = 0, l = oldValue.length; i < l; i++)
				{
					if (oldValue[i] !== newValue[i])
						return true;
				}

				return false;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.tileMinZoom = new ObservableProperty("tileMinZoom", Number, 0)
			.writeFilter(function(value)
			{
				return ((value >= 0) && (value < Infinity)) ? Math.floor(value) : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.tileMaxZoom = new ObservableProperty("tileMaxZoom", Number, Infinity)
			.writeFilter(function(value)
			{
				return ((value >= 0) && (value < Infinity)) ? Math.floor(value) : Infinity;
			})
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.tileInvertY = new ObservableProperty("tileInvertY", Boolean, false)
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.tileAttribution = new ObservableProperty("tileAttribution", String, null)
			.onChanged(function(e)
			{
				this.invalidate("updateTilesPass");
			});

		this.leafletMap = null;

		this.formatNumber = null;
		this.formatDegrees = null;

		// Private Properties

		this._tooltip = null;
		this._tooltipMetadata = null;
		this._layers = null;
		this._tileLayer = null;
		this._width = 0;
		this._height = 0;
		this._bounds = null;
		this._updateSizeInterval = 0;
		this._setCenterTimeout = 0;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addStyleClass("splunk-mapping-Map");

			this.setStyle({ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "none" });

			this.updateSize = FunctionUtils.bind(this.updateSize, this);
			this._leafletMap_moveend = FunctionUtils.bind(this._leafletMap_moveend, this);
			this._leafletMap_zoomend = FunctionUtils.bind(this._leafletMap_zoomend, this);
			this._self_mouseOver = FunctionUtils.bind(this._self_mouseOver, this);
			this._self_mouseOut = FunctionUtils.bind(this._self_mouseOut, this);
			this._self_mouseMove = FunctionUtils.bind(this._self_mouseMove, this);
			this._self_click = FunctionUtils.bind(this._self_click, this);

			this.leafletMap = new Leaflet.Map(this.element, { center: new Leaflet.LatLng(0, 0), zoom: 0, trackResize: false, worldCopyJump: false });
			this.leafletMap.attributionControl.setPrefix("");
			this.leafletMap.on("moveend", this._leafletMap_moveend);
			this.leafletMap.on("zoomend", this._leafletMap_zoomend);

			this._tooltip = new LeafletTooltip();

			this._layers = [];

			this.$element.bind("mouseover", this._self_mouseOver);
			this.$element.bind("mouseout", this._self_mouseOut);
			this.$element.bind("mousemove", this._self_mouseMove);
			this.$element.bind("click", this._self_click);
		};

		// Public Methods

		this.updateLeafletMapSize = function()
		{
			this.validatePreceding("updateLeafletMapSizePass");

			if (this.isValid("updateLeafletMapSizePass"))
				return;

			this.leafletMap.invalidateSize();
			// hack to force immediate redraw
			clearTimeout(this.leafletMap._sizeTimer);
			this.leafletMap.fire("moveend");

			this.setValid("updateLeafletMapSizePass");
		};

		this.updateTiles = function()
		{
			this.validatePreceding("updateTilesPass");

			if (this.isValid("updateTilesPass"))
				return;

			var leafletMap = this.leafletMap;

			var tileLayer = this._tileLayer;
			if (tileLayer)
			{
				leafletMap.removeLayer(tileLayer);
				this._tileLayer = null;
			}

			var tileOptions = {};
			tileOptions.subdomains = this.getInternal("tileSubdomains");
			tileOptions.minZoom = this.getInternal("tileMinZoom");
			tileOptions.maxZoom = this.getInternal("tileMaxZoom");
			tileOptions.tms = this.getInternal("tileInvertY");
			tileOptions.attribution = this.getInternal("tileAttribution");

			var tileURL = this.getInternal("tileURL");
			if (tileURL)
			{
				tileLayer = this._tileLayer = new Leaflet.TileLayer(tileURL, tileOptions);
				leafletMap.addLayer(tileLayer, true);
			}

			// hack to adjust maxZoom on leafletMap
			leafletMap.options.minZoom = tileOptions.minZoom;
			leafletMap.options.maxZoom = tileOptions.maxZoom;
			leafletMap.setZoom(leafletMap.getZoom());

			this.setValid("updateTilesPass");

			this._checkBoundsChanged();
		};

		this.addLayer = function(layer)
		{
			if (layer == null)
				throw new Error("Parameter layer must be non-null.");
			if (!(layer instanceof LayerBase))
				throw new Error("Parameter layer must be an instance of splunk.mapping.layers.LayerBase");

			var layers = this._layers;
			if (ArrayUtils.indexOf(layers, layer) >= 0)
				return;

			layers.push(layer);
			this.leafletMap.addLayer(layer.leafletLayer);
			layer.onAddedToMap(this);
		};

		this.removeLayer = function(layer)
		{
			if (layer == null)
				throw new Error("Parameter layer must be non-null.");
			if (!(layer instanceof LayerBase))
				throw new Error("Parameter layer must be an instance of splunk.mapping.layers.LayerBase");

			var layers = this._layers;
			var index = ArrayUtils.indexOf(layers, layer);
			if (index < 0)
				return;

			layer.onRemovedFromMap(this);
			this.leafletMap.removeLayer(layer.leafletLayer);
			layers.splice(index, 1);
		};

		this.fitWorld = function(viewportInside)
		{
			if ((viewportInside != null) && (typeof viewportInside !== "boolean"))
				throw new Error("Parameter viewportInside must be a boolean.");

			this.fitBounds(new LatLonBounds(-60, -180, 85, 180), viewportInside);
		};

		this.fitBounds = function(latLonBounds, viewportInside)
		{
			if (latLonBounds == null)
				throw new Error("Parameter latLonBounds must be non-null.");
			if (!(latLonBounds instanceof LatLonBounds))
				throw new Error("Parameter latLonBounds must be an instance of splunk.mapping.LatLonBounds.");
			if ((viewportInside != null) && (typeof viewportInside !== "boolean"))
				throw new Error("Parameter viewportInside must be a boolean.");

			latLonBounds = latLonBounds.isFinite() ? latLonBounds : new LatLonBounds(-60, -180, 85, 180);
			viewportInside = (viewportInside === true);

			var bounds = new Leaflet.LatLngBounds(new Leaflet.LatLng(latLonBounds.s, latLonBounds.w), new Leaflet.LatLng(latLonBounds.n, latLonBounds.e));

			// Leaflet's bounds.getCenter() doesn't handle non-normalized bounds
			// so have to use ours and convert to Leaflet's
			var center = latLonBounds.getCenter();
			center = new Leaflet.LatLng(center.lat, center.lon);

			var zoom = this.leafletMap.getBoundsZoom(bounds, viewportInside);

			this.leafletMap.setView(center, zoom, true);

			this._checkBoundsChanged();
		};

		this.getLatLonBounds = function()
		{
			var bounds = this.leafletMap.getBounds();
			var sw = bounds.getSouthWest();
			var ne = bounds.getNorthEast();
			return new LatLonBounds(sw.lat, sw.lng, ne.lat, ne.lng);
		};

		this.updateSize = function()
		{
			var width = this.$element.width();
			var height = this.$element.height();
			if ((width === this._width) && (height === this._height))
				return;

			this._width = width;
			this._height = height;

			this.leafletMap.invalidateSize();
			this.invalidate("updateLeafletMapSizePass");

			this._checkBoundsChanged();
		};

		this.dispose = function()
		{
			clearTimeout(this._setCenterTimeout);

			var layers = this._layers.concat();
			for (var i = layers.length - 1; i >= 0; i--)
				this.removeLayer(layers[i]);

			base.dispose.call(this);
		};

		// Protected Methods

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

		this._checkBoundsChanged = function()
		{
			var oldBounds = this._bounds;
			var newBounds = this.getLatLonBounds();
			if (oldBounds && oldBounds.equals(newBounds))
				return;

			this._bounds = newBounds;

			this.dispatchEvent("boundsChanged", new EventData());
		};

		this._updateTooltip = function(element)
		{
			var tooltip = this._tooltip;
			var metadata = this._getMetadataFromElement(element);

			if (metadata && (metadata !== this._tooltipMetadata))
			{
				this._tooltipMetadata = metadata;

				var data = metadata.data;
				var fields = metadata.fields;
				var sliceList = metadata.sliceList;
				var tooltipLatLng = metadata.tooltipLatLng;
				var tooltipOffsetRadius = metadata.tooltipOffsetRadius;

				if (data && fields && tooltipLatLng)
				{
					var content = "";
					var field;
					var slice;
					var i, l;

					content += "<table style=\"border: 0 none; border-spacing: 0; border-collapse: collapse;\">";
					for (i = 0, l = Math.min(fields.length, 2); i < l; i++)
					{
						field = fields[i];
						content += "<tr>";
						content += "<td style=\"padding: 0; text-align: left; white-space: nowrap; color: #333333;\">" + StringUtils.escapeHTML(field) + ":&nbsp;&nbsp;</td><td style=\"padding: 0; text-align: right; white-space: nowrap;\">" + StringUtils.escapeHTML(this._formatDegrees(data[field], (i === 0) ? "ns" : "ew")) + "</td>";
						content += "</tr>";
					}
					for (i = 0, l = sliceList.length; i < l; i++)
					{
						slice = sliceList[i];
						content += "<tr>";
						content += "<td style=\"padding: 0; text-align: left; white-space: nowrap; color: " + ("#" + (slice.series.color | 0x1000000).toString(16).substring(1)) + ";\">" + StringUtils.escapeHTML(slice.series.name) + ":&nbsp;&nbsp;</td><td style=\"padding: 0; text-align: right; white-space: nowrap;\">" + StringUtils.escapeHTML(this._formatNumber(slice.value)) + "</td>";
						content += "</tr>";
					}
					content += "</table>";

					tooltip.setLatLng(tooltipLatLng);
					tooltip.setOffsetRadius(tooltipOffsetRadius);
					tooltip.setContent(content);

					this.leafletMap.openPopup(tooltip);
				}
				else
				{
					this.leafletMap.closePopup();
				}
			}
			else if (!metadata && this._tooltipMetadata)
			{
				this._tooltipMetadata = null;

				this.leafletMap.closePopup();
			}
		};

		this._getMetadataFromElement = function(element)
		{
			while (element)
			{
				if (element[LayerBase.METADATA_KEY])
					return element[LayerBase.METADATA_KEY];
				element = element.parentNode;
			}
			return null;
		};

		this._formatNumber = function(num)
		{
			var format = this.formatNumber;
			if (typeof format === "function")
				return format(Number(num));

			return String(num);
		};

		this._formatDegrees = function(degrees, orientation)
		{
			var format = this.formatDegrees;
			if (typeof format === "function")
				return format(Number(degrees), orientation);

			return String(degrees);
		};

		this._leafletMap_moveend = function(e)
		{
			this._checkBoundsChanged();
		};

		this._leafletMap_zoomend = function(e)
		{
			this._checkBoundsChanged();
		};

		this._self_mouseOver = function(e)
		{
			this._updateTooltip(e.target);
		};

		this._self_mouseOut = function(e)
		{
			this._updateTooltip(e.target);
		};

		this._self_mouseMove = function(e)
		{
			this._updateTooltip(e.target);
		};

		this._self_click = function(e)
		{
			if (this.leafletMap.dragging && this.leafletMap.dragging.moved())
				return;

			var metadata = this._getMetadataFromElement(e.target);
			if (!metadata || !metadata.data || !metadata.fields)
				return;

			e.preventDefault();

			var data = {};
			for (var p in metadata.data)
				data[p] = metadata.data[p];
			var fields = metadata.fields.concat();

			this.dispatchEvent("mapClicked", new GenericEventData({ data: data, fields: fields, altKey: e.altKey, ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey, jQueryEvent: e, originalEvent: e.originalEvent }));
		};

	});

	var LeafletTooltip = Leaflet.Popup.extend({

		options: {
			paddingX: 5,
			paddingY: 5
		},

		_offsetRadius: 0,

		initialize: function(options) {
			options = Leaflet.Util.extend(options || {}, { maxWidth: Infinity, maxHeight: Infinity, autoPan: false, closeButton: false });
			Leaflet.Popup.prototype.initialize.call(this, options);
		},

		setOffsetRadius: function(offsetRadius) {
			this._offsetRadius = offsetRadius;
			this._update();
			return this;
		},

		_initLayout: function() {
			Leaflet.Popup.prototype._initLayout.call(this);

			// hide tip
			this._tipContainer.style.display = "none";
		},

		_updatePosition: function() {
			var map = this._map;
			var mapTL = map.containerPointToLayerPoint(new Leaflet.Point(0, 0));
			var mapBR = map.containerPointToLayerPoint(map.getSize());
			var mapLeft = mapTL.x;
			var mapTop = mapTL.y;
			var mapRight = mapBR.x;
			var mapBottom = mapBR.y;

			var container = this._container;
			var containerWidth = container.offsetWidth;
			var containerHeight = container.offsetHeight;

			var is3d = L.Browser.any3d;
			var offsetRadius = this._offsetRadius;
			var paddingX = this.options.paddingX;
			var paddingY = this.options.paddingY;

			var centerPoint = map.latLngToLayerPoint(this._latlng);
			var offsetX = (centerPoint.x > ((mapLeft + mapRight) / 2)) ? (-containerWidth - offsetRadius - paddingX) : offsetRadius + paddingX;
			var offsetY = NumberUtils.maxMin(centerPoint.y - containerHeight / 2, mapBottom - containerHeight - paddingY, mapTop + paddingY) - centerPoint.y;

			if (is3d)
				L.DomUtil.setPosition(container, centerPoint);

			var x = offsetX + (is3d ? 0 : centerPoint.x);
			var y = offsetY + (is3d ? 0 : centerPoint.y);

			container.style.left = Math.round(x) + "px";
			container.style.top = Math.round(y) + "px";
		}

	});

	// override Leaflet.Control.Attribution so that the attribution container is hidden when there is no text
	Leaflet.Control.Attribution.include({

		_update: function () {
			if (!this._map) { return; }

			var attribs = [];

			for (var i in this._attributions) {
				if (this._attributions.hasOwnProperty(i) && this._attributions[i]) {
					attribs.push(i);
				}
			}

			var prefixAndAttribs = [];

			if (this.options.prefix) {
				prefixAndAttribs.push(this.options.prefix);
			}
			if (attribs.length) {
				prefixAndAttribs.push(attribs.join(', '));
			}

			var text = prefixAndAttribs.join(' &#8212; ');

			this._container.innerHTML = text;
			this._container.style.display = text ? "" : "none";
		}

	});

	return Map;

});

define('splunk/vectors/VectorElement',['require','jg_global','jg_global','jg_global'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var jg_static = require("jg_global").jg_static;

	return jg_extend(Object, function(VectorElement, base)
	{

		// Private Static Constants

		var _HAS_SVG = (typeof document.createElementNS === "function");
		var _HAS_VML = (!_HAS_SVG && (function()
		{
			try
			{
				document.namespaces.add("splvml", "urn:schemas-microsoft-com:vml");

				var styleText = ".splvml { behavior: url(#default#VML); display: inline-block; position: absolute; }";

				var styleNode = document.createElement("style");
				styleNode.setAttribute("type", "text/css");

				var headNode = document.getElementsByTagName("head")[0];
				headNode.appendChild(styleNode);

				if (styleNode.styleSheet)
					styleNode.styleSheet.cssText = styleText;
				else
					styleNode.appendChild(document.createTextNode(styleText));

				return true;
			}
			catch (e)
			{
				return false;
			}
		})());

		// Public Static Methods

		VectorElement.mixin = function(target, sourceSVG, sourceVML)
		{
			if (_HAS_SVG)
			{
				jg_mixin(target, sourceSVG);
				// jg_mixin doesn't copy constructor, so do it manually
				if ((sourceSVG.constructor !== Object) && (typeof sourceSVG.constructor === "function"))
					target.constructor = sourceSVG.constructor;
			}
			else if (_HAS_VML)
			{
				jg_mixin(target, sourceVML);
				// jg_mixin doesn't copy constructor, so do it manually
				if ((sourceVML.constructor !== Object) && (typeof sourceVML.constructor === "function"))
					target.constructor = sourceVML.constructor;
			}
		};

		// Public Properties

		this.hasSVG = _HAS_SVG;
		this.hasVML = _HAS_VML;
		this.element = null;

		// Constructor

		this.constructor = function(tagName)
		{
			if ((tagName != null) && (typeof tagName !== "string"))
				throw new Error("Parameter tagName must be a string.");

			this.element = this.createElement(tagName || null);
		};

		// Public Methods

		this.appendTo = function(parentElement)
		{
			if (parentElement == null)
				throw new Error("Parameter parentElement must be non-null.");
			if (!(parentElement instanceof VectorElement))
				throw new Error("Parameter parentElement must be an instance of splunk.vectors.VectorElement.");

			parentElement.element.appendChild(this.element);

			return this;
		};

		this.remove = function()
		{
			if (this.element.parentNode)
				this.element.parentNode.removeChild(this.element);

			return this;
		};

		this.dispose = function()
		{
			this.remove();

			this.element = null;
		};

		this.display = function(value)
		{
			this.element.style.display = value ? value : "";

			return this;
		};

		this.visibility = function(value)
		{
			this.element.style.visibility = value ? value : "";

			return this;
		};

		this.translate = function(x, y)
		{
			x = ((x != null) && (x > -Infinity) && (x < Infinity)) ? x : 0;
			y = ((y != null) && (y > -Infinity) && (y < Infinity)) ? y : 0;

			this.element.style.left = (x != 0) ? x + "px" : "";
			this.element.style.top = (y != 0) ? y + "px" : "";

			return this;
		};

		// Protected Methods

		this.createElement = function(tagName)
		{
			var dummy = document.createElement("div");
			dummy.style.position = "absolute";
			return dummy;
		};

		// Inner Mixin Classes

		var SVGVectorElement = jg_static(function(SVGVectorElement)
		{

			// Private Static Constants

			var _NS_SVG = "http://www.w3.org/2000/svg";

			// Public Methods

			this.display = function(value)
			{
				if (value)
					this.element.setAttribute("display", value);
				else
					this.element.removeAttribute("display");

				return this;
			};

			this.visibility = function(value)
			{
				if (value)
					this.element.setAttribute("visibility", value);
				else
					this.element.removeAttribute("visibility");

				return this;
			};

			this.translate = function(x, y)
			{
				x = ((x != null) && (x > -Infinity) && (x < Infinity)) ? x : 0;
				y = ((y != null) && (y > -Infinity) && (y < Infinity)) ? y : 0;

				if ((x != 0) || (y != 0))
					this.element.setAttribute("transform", "translate(" + x + "," + y + ")");
				else
					this.element.removeAttribute("transform");

				return this;
			};

			// Protected Methods

			this.createElement = function(tagName)
			{
				return document.createElementNS(_NS_SVG, tagName || "g");
			};

		});

		var VMLVectorElement = jg_static(function(VMLVectorElement)
		{

			// Protected Methods

			this.createElement = function(tagName)
			{
				return document.createElement("<splvml:" + (tagName || "group") + " class=\"splvml\">");
			};

		});

		VectorElement.mixin(this, SVGVectorElement, VMLVectorElement);

	});

});

define('splunk/vectors/Group',['require','jg_global','jg_global','splunk/vectors/VectorElement'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_static = require("jg_global").jg_static;
	var VectorElement = require("splunk/vectors/VectorElement");

	return jg_extend(VectorElement, function(Group, base)
	{

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);
		};

		// Inner Mixin Classes

		var SVGGroup = jg_static(function(SVGGroup)
		{

			// Constructor

			this.constructor = function()
			{
				base.constructor.call(this, "g");
			};

		});

		var VMLGroup = jg_static(function(VMLGroup)
		{

			// Constructor

			this.constructor = function()
			{
				base.constructor.call(this, "group");

				this.element.style.width = "1px";
				this.element.style.height = "1px";
				this.element.coordsize = "1,1";
			};

		});

		VectorElement.mixin(this, SVGGroup, VMLGroup);

	});

});

define('splunk/vectors/VectorUtils',['require','jg_global'],function(require)
{

	var jg_static = require("jg_global").jg_static;

	return jg_static(function(VectorUtils)
	{

		// Public Static Methods

		VectorUtils.toSVGString = function(element)
		{
			// svg elements don't have innerHTML attribute...
			// clone svg element and place in container div so we can use innerHTML of the container
			var clonedElement = element.cloneNode(true);
			var containerElement = document.createElement("div");
			containerElement.appendChild(clonedElement);

			// get svg string using innerHTML
			var svgString = containerElement.innerHTML;

			// fix or add xlink namespace on href attributes
			svgString = svgString.replace(/xlink:href=|href=/g, "x:href=");

			// properly close image tags
			svgString = svgString.replace(/<image([\S\s]*?)\s*\/?>\s*(<\/image>)?/g, "<image$1></image>");

			// add xmlns attributes to root svg tag
			svgString = svgString.replace(/^<svg/, "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:x=\"http://www.w3.org/1999/xlink\"");

			// clear element references
			clonedElement = null;
			containerElement = null;

			return svgString;
		};

		VectorUtils.concatSVGStrings = function(/*...*/)
		{
			var concatString = "";
			var svgString;
			var viewBoxMatch;
			var viewBox;
			var width = 0;
			var height = 0;

			for (var i = 0, l = arguments.length; i < l; i++)
			{
				svgString = arguments[i];

				// read and parse viewBox attribute from root svg tag
				viewBoxMatch = svgString.match(/^<svg[^>]*viewBox=\"([^ ]+) ([^ ]+) ([^ ]+) ([^\"]+)\"[^>]*>/);
				if (viewBoxMatch && (viewBoxMatch.length == 5))
				{
					viewBox = {
						x: Number(viewBoxMatch[1]),
						y: Number(viewBoxMatch[2]),
						width: Number(viewBoxMatch[3]),
						height: Number(viewBoxMatch[4])
					};

					// expand width and height to include viewBox
					width = Math.max(width, viewBox.width);
					height = Math.max(height, viewBox.height);
				}
				else
				{
					viewBox = null;
				}

				// replace root svg tag with g tag, including translate transform if needed
				if (viewBox && ((viewBox.x != 0) || (viewBox.y != 0)))
					svgString = svgString.replace(/^<svg[^>]*>/, "<g transform=\"translate(" + (-viewBox.x) + ", " + (-viewBox.y) + ")\">");
				else
					svgString = svgString.replace(/^<svg[^>]*>/, "<g>");
				svgString = svgString.replace(/<\/svg>$/, "</g>");

				concatString += svgString;
			}

			// generate new root svg tag around concatString
			svgString = "<svg";
			svgString += " xmlns=\"http://www.w3.org/2000/svg\"";
			svgString += " xmlns:x=\"http://www.w3.org/1999/xlink\"";
			svgString += " width=\"" + width + "\"";
			svgString += " height=\"" + height + "\"";
			svgString += " viewBox=\"0 0 " + width + " " + height + "\"";
			svgString += ">";
			svgString += concatString;
			svgString += "</svg>";

			return svgString;
		};

	});

});

define('splunk/vectors/Viewport',['require','jg_global','jg_global','jgatt','splunk/vectors/VectorElement','splunk/vectors/VectorUtils'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_static = require("jg_global").jg_static;
	var Rectangle = require("jgatt").geom.Rectangle;
	var VectorElement = require("splunk/vectors/VectorElement");
	var VectorUtils = require("splunk/vectors/VectorUtils");

	return jg_extend(VectorElement, function(Viewport, base)
	{

		// Constructor

		this.constructor = function(width, height, viewBox, preserveAspectRatio)
		{
			base.constructor.call(this);
		};

		// Public Methods

		this.width = function(value)
		{
			return this;
		};

		this.height = function(value)
		{
			return this;
		};

		this.viewBox = function(value)
		{
			return this;
		};

		this.preserveAspectRatio = function(value)
		{
			return this;
		};

		this.toSVGString = function()
		{
			return "";
		};

		// Inner Mixin Classes

		var SVGViewport = jg_static(function(SVGViewport)
		{

			// Constructor

			this.constructor = function(width, height, viewBox, preserveAspectRatio)
			{
				base.constructor.call(this, "svg");

				this.width((width != null) ? width : 0);
				this.height((height != null) ? height : 0);
				if (viewBox != null)
					this.viewBox(viewBox);
				if (preserveAspectRatio != null)
					this.preserveAspectRatio(preserveAspectRatio);
			};

			// Public Methods

			this.appendTo = function(parentElement)
			{
				if (parentElement == null)
					throw new Error("Parameter parentElement must be non-null.");
				if (parentElement.appendChild == null)
					throw new Error("Parameter parentElement must be a DOM node.");

				parentElement.appendChild(this.element);

				return this;
			};

			this.width = function(value)
			{
				if ((value != null) && (value < Infinity))
					this.element.setAttribute("width", Math.max(value, 0));
				else
					this.element.setAttribute("width", 0);

				return this;
			};

			this.height = function(value)
			{
				if ((value != null) && (value < Infinity))
					this.element.setAttribute("height", Math.max(value, 0));
				else
					this.element.setAttribute("height", 0);

				return this;
			};

			this.viewBox = function(value)
			{
				if (value && (value instanceof Rectangle) && value.isFinite())
					this.element.setAttribute("viewBox", value.x + " " + value.y + " " + value.width + " " + value.height);
				else
					this.element.removeAttribute("viewBox");

				return this;
			};

			this.preserveAspectRatio = function(value)
			{
				if (value)
					this.element.setAttribute("preserveAspectRatio", value);
				else
					this.element.removeAttribute("preserveAspectRatio");

				return this;
			};

			this.toSVGString = function()
			{
				return VectorUtils.toSVGString(this.element);
			};

		});

		var VMLViewport = jg_static(function(VMLViewport)
		{

			// Private Properties

			this._containerElement = null;
			this._width = 0;
			this._height = 0;
			this._viewBox = null;

			// Constructor

			this.constructor = function(width, height, viewBox, preserveAspectRatio)
			{
				base.constructor.call(this, "group");

				this._containerElement = document.createElement("div");
				this._containerElement.style.position = "relative";
				this._containerElement.style.overflow = "hidden";
				this._containerElement.appendChild(this.element);

				this.width((width != null) ? width : 0);
				this.height((height != null) ? height : 0);
				if (viewBox != null)
					this.viewBox(viewBox);
				if (preserveAspectRatio != null)
					this.preserveAspectRatio(preserveAspectRatio);
			};

			// Public Methods

			this.appendTo = function(parentElement)
			{
				if (parentElement == null)
					throw new Error("Parameter parentElement must be non-null.");
				if (parentElement.appendChild == null)
					throw new Error("Parameter parentElement must be a DOM node.");

				parentElement.appendChild(this._containerElement);

				return this;
			};

			this.remove = function()
			{
				if (this._containerElement.parentNode)
					this._containerElement.parentNode.removeChild(this._containerElement);

				return this;
			};

			this.dispose = function()
			{
				base.dispose.call(this);

				this._containerElement = null;
			};

			this.display = function(value)
			{
				this._containerElement.style.display = value ? value : "";

				return this;
			};

			this.visibility = function(value)
			{
				this._containerElement.style.visibility = value ? value : "";

				return this;
			};

			this.translate = function(x, y)
			{
				x = ((x != null) && (x > -Infinity) && (x < Infinity)) ? x : 0;
				y = ((y != null) && (y > -Infinity) && (y < Infinity)) ? y : 0;

				this._containerElement.style.left = (x != 0) ? x + "px" : "";
				this._containerElement.style.top = (y != 0) ? y + "px" : "";

				return this;
			};

			this.width = function(value)
			{
				this._width = ((value != null) && (value < Infinity)) ? Math.max(value, 0) : 0;
				this._updateView();

				return this;
			};

			this.height = function(value)
			{
				this._height = ((value != null) && (value < Infinity)) ? Math.max(value, 0) : 0;
				this._updateView();

				return this;
			};

			this.viewBox = function(value)
			{
				this._viewBox = (value && (value instanceof Rectangle) && value.isFinite()) ? value.clone() : null;
				this._updateView();

				return this;
			};

			this.preserveAspectRatio = function(value)
			{
				return this;
			};

			// Private Methods

			this._updateView = function()
			{
				var width = Math.round(this._width);
				var height = Math.round(this._height);
				var viewBox = this._viewBox;
				var viewX = viewBox ? Math.round(viewBox.x) : 0;
				var viewY = viewBox ? Math.round(viewBox.y) : 0;
				var viewWidth = viewBox ? Math.round(Math.max(viewBox.width, 1)) : width;
				var viewHeight = viewBox ? Math.round(Math.max(viewBox.height, 1)) : height;

				var element = this.element;
				var style = element.style;
				var containerStyle = this._containerElement.style;

				style.display = "none";  // prevent premature rendering

				element.coordorigin = viewX + "," + viewY;
				element.coordsize = viewWidth + "," + viewHeight;

				style.width = width + "px";
				style.height = height + "px";

				containerStyle.width = width + "px";
				containerStyle.height = height + "px";

				style.display = "";  // enable rendering
			};

		});

		VectorElement.mixin(this, SVGViewport, VMLViewport);

	});

});

define('splunk/mapping/layers/VectorLayerBase',['require','leaflet','jg_global','jgatt','jgatt','splunk/mapping/layers/LayerBase','splunk/vectors/Group','splunk/vectors/Viewport'],function(require)
{

	var Leaflet = require("leaflet");
	var jg_extend = require("jg_global").jg_extend;
	var Rectangle = require("jgatt").geom.Rectangle;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var LayerBase = require("splunk/mapping/layers/LayerBase");
	var Group = require("splunk/vectors/Group");
	var Viewport = require("splunk/vectors/Viewport");

	var VectorLayerBase = jg_extend(LayerBase, function(VectorLayerBase, base)
	{

		// Public Properties

		this.vectorContainer = null;
		this.vectorBounds = null;

		// Private Properties

		this._isZooming = false;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this._leafletMap_move = FunctionUtils.bind(this._leafletMap_move, this);
			this._leafletMap_zoomstart = FunctionUtils.bind(this._leafletMap_zoomstart, this);
			this._leafletMap_zoomend = FunctionUtils.bind(this._leafletMap_zoomend, this);

			this.vectorContainer = this.leafletLayer.vectorContainer;
			this.vectorBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
		};

		// Protected Methods

		this.createLeafletLayer = function()
		{
			return new LeafletVectorLayer();
		};

		this.renderOverride = function(map)
		{
			if (!this._isZooming)
				this.vectorContainer.display(null);
		};

		this.onAddedToMap = function(map)
		{
			base.onAddedToMap.call(this, map);

			var leafletMap = map.leafletMap;
			if (this.vectorContainer.hasSVG)
				leafletMap.on("move", this._leafletMap_move);
			else
				leafletMap.on("moveend", this._leafletMap_move);
			leafletMap.on("viewreset", this._leafletMap_move);
			leafletMap.on("zoomstart", this._leafletMap_zoomstart);
			leafletMap.on("zoomend", this._leafletMap_zoomend);

			this.vectorBounds = leafletMap._vectorLayerBounds;

			this.vectorContainer.display("none");
		};

		this.onRemovedFromMap = function(map)
		{
			var leafletMap = map.leafletMap;
			if (this.vectorContainer.hasSVG)
				leafletMap.off("move", this._leafletMap_move);
			else
				leafletMap.off("moveend", this._leafletMap_move);
			leafletMap.off("viewreset", this._leafletMap_move);
			leafletMap.off("zoomstart", this._leafletMap_zoomstart);
			leafletMap.off("zoomend", this._leafletMap_zoomend);

			this.vectorBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

			base.onRemovedFromMap.call(this, map);
		};

		// Private Methods

		this._leafletMap_move = function(e)
		{
			this.invalidate("renderPass");
		};

		this._leafletMap_zoomstart = function(e)
		{
			this._isZooming = true;

			this.vectorContainer.display("none");
		};

		this._leafletMap_zoomend = function(e)
		{
			this._isZooming = false;

			this.invalidate("renderPass");
		};

	});

	var LeafletVectorLayer = Leaflet.Class.extend({

		includes: [Leaflet.Mixin.Events],

		options: {
			clickable: true
		},

		vectorContainer: null,

		initialize: function (options) {
			Leaflet.Util.setOptions(this, options);

			this.vectorContainer = new Group();
		},

		onAdd: function (map) {
			this._map = map;

			map._initVectorLayerViewport();

			this.vectorContainer.appendTo(map._vectorLayerViewport);
		},

		onRemove: function (map) {
			this._map = null;

			this.vectorContainer.remove();
		}

	});

	Leaflet.Map.include({

		_initVectorLayerViewport: function () {
			if (this._vectorLayerRoot)
				return;

			var root = this._vectorLayerRoot = document.createElement("div");
			root.style.position = "absolute";
			this._panes.overlayPane.appendChild(root);

			var viewport = this._vectorLayerViewport = new Viewport();
			viewport.appendTo(root);

			this._vectorLayerBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

			if (viewport.hasSVG)
				this.on("move", this._updateVectorLayerBounds);
			else
				this.on("moveend", this._updateVectorLayerBounds);
			this._updateVectorLayerBounds();
		},

		_updateVectorLayerBounds: function () {
			var root = this._vectorLayerRoot,
			    viewport = this._vectorLayerViewport,
			    bounds = this._vectorLayerBounds,
			    padding = viewport.hasSVG ? 0 : 0.5,
			    size = this.getSize(),
			    panePos = Leaflet.DomUtil.getPosition(this._mapPane),
			    min = panePos.multiplyBy(-1)._subtract(size.multiplyBy(padding)),
			    max = min.add(size.multiplyBy(1 + padding * 2)),
			    width = max.x - min.x,
			    height = max.y - min.y;

			bounds.minX = min.x;
			bounds.minY = min.y;
			bounds.maxX = max.x;
			bounds.maxY = max.y;

			Leaflet.DomUtil.setPosition(root, min);
			viewport.width(width);
			viewport.height(height);
			viewport.viewBox(new Rectangle(min.x, min.y, width, height));
		}

	});

	return VectorLayerBase;

});

define('splunk/palettes/ColorPalette',['require','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var MObservable = require("jgatt").events.MObservable;
	var MPropertyTarget = require("jgatt").properties.MPropertyTarget;
	var Property = require("jgatt").properties.Property;
	var PropertyEventData = require("jgatt").properties.PropertyEventData;

	return jg_extend(Object, function(ColorPalette, base)
	{

		base = jg_mixin(this, MObservable, base);
		base = jg_mixin(this, MPropertyTarget, base);

		// Private Properties

		this._properties = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.addEventListener(this.changed, this._self_changed, Infinity);
		};

		// Public Methods

		this.getColor = function(field, index, count)
		{
			if ((field != null) && (typeof field !== "string"))
				throw new Error("Parameter field must be a string.");
			if (index == null)
				throw new Error("Parameter index must be non-null.");
			if (typeof index !== "number")
				throw new Error("Parameter index must be a number.");
			if (count == null)
				throw new Error("Parameter count must be non-null.");
			if (typeof count !== "number")
				throw new Error("Parameter count must be a number.");

			if (!this._properties)
				this._properties = this._getProperties();

			return this.getColorOverride(this._properties, field, Math.floor(index), Math.floor(count));
		};

		// Protected Methods

		this.getColorOverride = function(properties, field, index, count)
		{
			return 0x000000;
		};

		// Private Methods

		this._getProperties = function()
		{
			var properties = {};
			var property;
			for (var p in this)
			{
				property = this[p];
				if (property instanceof Property)
					properties[p] = this.getInternal(property);
			}
			return properties;
		};

		this._self_changed = function(e)
		{
			if ((e.target === this) && (e instanceof PropertyEventData))
				this._properties = null;
		};

	});

});

define('splunk/palettes/ListColorPalette',['require','jg_global','jgatt','jgatt','jgatt','splunk/palettes/ColorPalette'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var ColorUtils = require("jgatt").graphics.ColorUtils;
	var ObservableArrayProperty = require("jgatt").properties.ObservableArrayProperty;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var ColorPalette = require("splunk/palettes/ColorPalette");

	return jg_extend(ColorPalette, function(ListColorPalette, base)
	{

		// Public Properties

		this.colors = new ObservableArrayProperty("colors", Number, [])
			.readFilter(function(value)
			{
				return value.concat();
			})
			.writeFilter(function(value)
			{
				return value ? value.concat() : [];
			});

		this.interpolate = new ObservableProperty("interpolate", Boolean, false);

		// Constructor

		this.constructor = function(colors, interpolate)
		{
			base.constructor.call(this);

			if (colors != null)
				this.set(this.colors, colors);
			if (interpolate != null)
				this.set(this.interpolate, interpolate);
		};

		// Protected Methods

		this.getColorOverride = function(properties, field, index, count)
		{
			var colors = properties.colors;
			var numColors = colors.length;

			if (numColors == 0)
				return 0x000000;

			if (index < 0)
				index = 0;

			if (properties.interpolate)
			{
				if (count < 1)
					count = 1;
				if (index > count)
					index = count;

				var p = (count == 1) ? 0 : (numColors - 1) * (index / (count - 1));
				var index1 = Math.floor(p);
				var index2 = Math.min(index1 + 1, numColors - 1);
				p -= index1;

				return ColorUtils.interpolate(colors[index1], colors[index2], p);
			}

			return colors[index % numColors];
		};

	});

});

define('splunk/vectors/Shape',['require','jg_global','jg_global','jgatt','splunk/vectors/VectorElement'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_static = require("jg_global").jg_static;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var VectorElement = require("splunk/vectors/VectorElement");

	return jg_extend(VectorElement, function(Shape, base)
	{

		// Constructor

		this.constructor = function(tagName)
		{
			base.constructor.call(this, tagName);
		};

		// Public Methods

		this.fillColor = function(value)
		{
			return this;
		};

		this.fillOpacity = function(value)
		{
			return this;
		};

		this.strokeColor = function(value)
		{
			return this;
		};

		this.strokeOpacity = function(value)
		{
			return this;
		};

		this.strokeWidth = function(value)
		{
			return this;
		};

		this.strokeLineCap = function(value)
		{
			return this;
		};

		this.strokeLineJoin = function(value)
		{
			return this;
		};

		this.strokeMiterLimit = function(value)
		{
			return this;
		};

		// Inner Mixin Classes

		var SVGShape = jg_static(function(SVGShape)
		{

			// Constructor

			this.constructor = function(tagName)
			{
				base.constructor.call(this, tagName);

				this.fillColor(NaN);
				this.strokeColor(NaN);
				this.strokeLineCap("none");
				this.strokeLineJoin("miter");
			};

			// Public Methods

			this.fillColor = function(value)
			{
				if ((value != null) && !isNaN(value))
				{
					value = NumberUtils.minMax(Math.floor(value), 0x000000, 0xFFFFFF);
					this.element.setAttribute("fill", "#" + (value | 0x1000000).toString(16).substring(1));
				}
				else
				{
					this.element.setAttribute("fill", "none");
				}

				return this;
			};

			this.fillOpacity = function(value)
			{
				if ((value != null) && !isNaN(value))
					this.element.setAttribute("fill-opacity", NumberUtils.minMax(value, 0, 1));
				else
					this.element.removeAttribute("fill-opacity");

				return this;
			};

			this.strokeColor = function(value)
			{
				if ((value != null) && !isNaN(value))
				{
					value = NumberUtils.minMax(Math.floor(value), 0x000000, 0xFFFFFF);
					this.element.setAttribute("stroke", "#" + (value | 0x1000000).toString(16).substring(1));
				}
				else
				{
					this.element.removeAttribute("stroke");
				}

				return this;
			};

			this.strokeOpacity = function(value)
			{
				if ((value != null) && !isNaN(value))
					this.element.setAttribute("stroke-opacity", NumberUtils.minMax(value, 0, 1));
				else
					this.element.removeAttribute("stroke-opacity");

				return this;
			};

			this.strokeWidth = function(value)
			{
				if ((value != null) && (value < Infinity))
					this.element.setAttribute("stroke-width", Math.max(value, 1));
				else
					this.element.removeAttribute("stroke-width");

				return this;
			};

			this.strokeLineCap = function(value)
			{
				if (value === "round")
					this.element.setAttribute("stroke-linecap", "round");
				else if (value === "square")
					this.element.setAttribute("stroke-linecap", "square");
				else  // none
					this.element.removeAttribute("stroke-linecap");

				return this;
			};

			this.strokeLineJoin = function(value)
			{
				if (value === "round")
					this.element.setAttribute("stroke-linejoin", "round");
				else if (value === "bevel")
					this.element.setAttribute("stroke-linejoin", "bevel");
				else  // miter
					this.element.removeAttribute("stroke-linejoin");

				return this;
			};

			this.strokeMiterLimit = function(value)
			{
				if ((value != null) && (value < Infinity))
					this.element.setAttribute("stroke-miterlimit", Math.max(value, 1));
				else
					this.element.removeAttribute("stroke-miterlimit");

				return this;
			};

		});

		var VMLShape = jg_static(function(VMLShape)
		{

			// Private Properties

			this._fillElement = null;
			this._strokeElement = null;

			// Constructor

			this.constructor = function(tagName)
			{
				base.constructor.call(this, tagName);

				this._fillElement = this.createElement("fill");
				this._strokeElement = this.createElement("stroke");

				this.element.appendChild(this._fillElement);
				this.element.appendChild(this._strokeElement);

				this.fillColor(NaN);
				this.strokeColor(NaN);
				this.strokeLineCap("none");
				this.strokeLineJoin("miter");
			};

			// Public Methods

			this.dispose = function()
			{
				base.dispose.call(this);

				this._fillElement = null;
				this._strokeElement = null;
			};

			this.fillColor = function(value)
			{
				if ((value != null) && !isNaN(value))
				{
					value = NumberUtils.minMax(Math.floor(value), 0x000000, 0xFFFFFF);
					this._fillElement.on = true;
					this._fillElement.color = "#" + (value | 0x1000000).toString(16).substring(1);
				}
				else
				{
					this._fillElement.on = false;
					this._fillElement.color = "#000000";
				}

				return this;
			};

			this.fillOpacity = function(value)
			{
				if ((value != null) && !isNaN(value))
					this._fillElement.opacity = NumberUtils.minMax(value, 0, 1);
				else
					this._fillElement.opacity = 1;

				return this;
			};

			this.strokeColor = function(value)
			{
				if ((value != null) && !isNaN(value))
				{
					value = NumberUtils.minMax(Math.floor(value), 0x000000, 0xFFFFFF);
					this._strokeElement.on = true;
					this._strokeElement.color = "#" + (value | 0x1000000).toString(16).substring(1);
				}
				else
				{
					this._strokeElement.on = false;
					this._strokeElement.color = "#000000";
				}

				return this;
			};

			this.strokeOpacity = function(value)
			{
				if ((value != null) && !isNaN(value))
					this._strokeElement.opacity = NumberUtils.minMax(value, 0, 1);
				else
					this._strokeElement.opacity = 1;

				return this;
			};

			this.strokeWidth = function(value)
			{
				if ((value != null) && (value < Infinity))
					this._strokeElement.weight = Math.max(value, 1) + "px";
				else
					this._strokeElement.weight = "1px";

				return this;
			};

			this.strokeLineCap = function(value)
			{
				if (value === "round")
					this._strokeElement.endcap = "round";
				else if (value === "square")
					this._strokeElement.endcap = "square";
				else // none
					this._strokeElement.endcap = "flat";

				return this;
			};

			this.strokeLineJoin = function(value)
			{
				if (value === "round")
					this._strokeElement.joinstyle = "round";
				else if (value === "bevel")
					this._strokeElement.joinstyle = "bevel";
				else // miter
					this._strokeElement.joinstyle = "miter";

				return this;
			};

			this.strokeMiterLimit = function(value)
			{
				if ((value != null) && (value < Infinity))
					this._strokeElement.miterlimit = Math.max(value, 1);
				else
					this._strokeElement.miterlimit = 4;

				return this;
			};

		});

		VectorElement.mixin(this, SVGShape, VMLShape);

	});

});

define('splunk/vectors/Wedge',['require','jg_global','jg_global','jgatt','splunk/vectors/Shape','splunk/vectors/VectorElement'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var jg_static = require("jg_global").jg_static;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var Shape = require("splunk/vectors/Shape");
	var VectorElement = require("splunk/vectors/VectorElement");

	return jg_extend(Shape, function(Wedge, base)
	{

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);
		};

		// Public Methods

		this.draw = function(x, y, radiusX, radiusY, startAngle, arcAngle)
		{
			return this;
		};

		// Inner Mixin Classes

		var SVGWedge = jg_static(function(SVGWedge)
		{

			// Constructor

			this.constructor = function()
			{
				base.constructor.call(this, "path");
			};

			// Public Methods

			this.draw = function(x, y, radiusX, radiusY, startAngle, arcAngle)
			{
				x = ((x != null) && (x > -Infinity) && (x < Infinity)) ? x : 0;
				y = ((y != null) && (y > -Infinity) && (y < Infinity)) ? y : 0;
				radiusX = ((radiusX != null) && (radiusX < Infinity)) ? Math.max(radiusX, 0) : 0;
				radiusY = ((radiusY != null) && (radiusY < Infinity)) ? Math.max(radiusY, 0) : 0;
				startAngle = ((startAngle != null) && (startAngle > -Infinity) && (startAngle < Infinity)) ? startAngle : 0;
				arcAngle = ((arcAngle != null) && (arcAngle != null) && !isNaN(arcAngle)) ? NumberUtils.minMax(arcAngle, -360, 360) : 0;

				if ((radiusX == 0) || (radiusY == 0) || (arcAngle == 0))
				{
					this.element.removeAttribute("d");
					return this;
				}

				var a1 = (startAngle / 180) * Math.PI;
				var x1 = x + Math.cos(a1) * radiusX;
				var y1 = y + Math.sin(a1) * radiusY;
				var a2 = ((startAngle + arcAngle / 2) / 180) * Math.PI;
				var x2 = x + Math.cos(a2) * radiusX;
				var y2 = y + Math.sin(a2) * radiusY;
				var a3 = ((startAngle + arcAngle) / 180) * Math.PI;
				var x3 = x + Math.cos(a3) * radiusX;
				var y3 = y + Math.sin(a3) * radiusY;

				var sweepFlag = (arcAngle < 0) ? 0 : 1;

				var pathData = "";
				if ((arcAngle > -360) && (arcAngle < 360))
				{
					pathData += "M" + x + "," + y;
					pathData += " L" + x1 + "," + y1;
				}
				else
				{
					pathData += "M" + x1 + "," + y1;
				}
				pathData += " A" + radiusX + "," + radiusY + " 0 0 " + sweepFlag + " " + x2 + "," + y2;
				pathData += " " + radiusX + "," + radiusY + " 0 0 " + sweepFlag + " " + x3 + "," + y3;
				pathData += " Z";

				this.element.setAttribute("d", pathData);

				return this;
			};

		});

		var VMLWedge = jg_static(function(VMLWedge)
		{

			// Private Static Constants

			var _RES = 64;

			// Private Properties

			this._pathElement = null;

			// Constructor

			this.constructor = function()
			{
				base.constructor.call(this, "shape");

				this._pathElement = this.createElement("path");

				this.element.style.width = "1px";
				this.element.style.height = "1px";
				this.element.coordsize = _RES + "," + _RES;
				this.element.appendChild(this._pathElement);
			};

			// Public Methods

			this.dispose = function()
			{
				base.dispose.call(this);

				this._pathElement = null;
			};

			this.draw = function(x, y, radiusX, radiusY, startAngle, arcAngle)
			{
				x = ((x != null) && (x > -Infinity) && (x < Infinity)) ? x : 0;
				y = ((y != null) && (y > -Infinity) && (y < Infinity)) ? y : 0;
				radiusX = ((radiusX != null) && (radiusX < Infinity)) ? Math.max(radiusX, 0) : 0;
				radiusY = ((radiusY != null) && (radiusY < Infinity)) ? Math.max(radiusY, 0) : 0;
				startAngle = ((startAngle != null) && (startAngle > -Infinity) && (startAngle < Infinity)) ? startAngle : 0;
				arcAngle = ((arcAngle != null) && (arcAngle != null) && !isNaN(arcAngle)) ? NumberUtils.minMax(arcAngle, -360, 360) : 0;

				if ((radiusX == 0) || (radiusY == 0) || (arcAngle == 0))
				{
					this._pathElement.v = " ";
					return this;
				}

				var a1 = (startAngle / 180) * Math.PI;
				var x1 = x + Math.cos(a1) * radiusX;
				var y1 = y + Math.sin(a1) * radiusY;
				var a2 = ((startAngle + arcAngle / 2) / 180) * Math.PI;
				var x2 = x + Math.cos(a2) * radiusX;
				var y2 = y + Math.sin(a2) * radiusY;
				var a3 = ((startAngle + arcAngle) / 180) * Math.PI;
				var x3 = x + Math.cos(a3) * radiusX;
				var y3 = y + Math.sin(a3) * radiusY;

				var left = Math.round((x - radiusX) * _RES);
				var top = Math.round((y - radiusY) * _RES);
				var right = Math.round((x + radiusX) * _RES);
				var bottom = Math.round((y + radiusY) * _RES);

				x = Math.round(x * _RES);
				y = Math.round(y * _RES);
				x1 = Math.round(x1 * _RES);
				y1 = Math.round(y1 * _RES);
				x2 = Math.round(x2 * _RES);
				y2 = Math.round(y2 * _RES);
				x3 = Math.round(x3 * _RES);
				y3 = Math.round(y3 * _RES);

				var pathData = "";
				if ((arcAngle > -360) && (arcAngle < 360))
				{
					pathData += "m " + x + "," + y;
					pathData += " l " + x1 + "," + y1;
				}
				else
				{
					pathData += "m " + x1 + "," + y1;
				}
				pathData += (arcAngle < 0) ? " at" : " wa";
				pathData += " " + left + "," + top + "," + right + "," + bottom + ", " + x1 + "," + y1 + ", " + x2 + "," + y2;
				pathData += ", " + left + "," + top + "," + right + "," + bottom + ", " + x2 + "," + y2 + ", " + x3 + "," + y3;
				pathData += " x";

				this._pathElement.v = pathData;

				return this;
			};

		});

		VectorElement.mixin(this, SVGWedge, VMLWedge);

	});

});

define('splunk/viz/MDataTarget',['require','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','jgatt','splunk/charting/Legend'],function(require)
{

	var jg_static = require("jg_global").jg_static;
	var jg_mixin = require("jg_global").jg_mixin;
	var MObservable = require("jgatt").events.MObservable;
	var MPropertyTarget = require("jgatt").properties.MPropertyTarget;
	var ObservableArrayProperty = require("jgatt").properties.ObservableArrayProperty;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var FunctionUtils = require("jgatt").utils.FunctionUtils;
	var MValidateTarget = require("jgatt").validation.MValidateTarget;
	var ValidatePass = require("jgatt").validation.ValidatePass;
	var Legend = require("splunk/charting/Legend");

	return jg_static(function(MDataTarget)
	{

		// Mixin

		this.mixin = function(base)
		{
			base = jg_mixin(this, MObservable, base);
			base = jg_mixin(this, MPropertyTarget, base);
			base = jg_mixin(this, MValidateTarget, base);
		};

		// Public Passes

		this.processDataPass = new ValidatePass("processData", 0.1);
		this.updateLegendLabelsPass = new ValidatePass("updateLegendLabels", 0.2);
		this.renderDataPass = new ValidatePass("renderData", 0.3);

		// Public Properties

		this.data = new ObservableProperty("data", Array, null)
			.onChanged(function(e)
			{
				this.invalidate("processDataPass");
			});

		this.fields = new ObservableArrayProperty("fields", String, null)
			.onChanged(function(e)
			{
				this.invalidate("processDataPass");
			});

		this.legend = new ObservableProperty("legend", Legend, null)
			.onChanged(function(e)
			{
				if (e.target === this)
				{
					var oldLegend = e.oldValue;
					var newLegend = e.newValue;

					if (oldLegend)
					{
						oldLegend.removeEventListener("settingLabels", this._legend_settingLabels);
						oldLegend.unregister(this);
					}

					if (newLegend)
					{
						newLegend.register(this);
						newLegend.addEventListener("settingLabels", this._legend_settingLabels);
					}

					this.invalidate("updateLegendLabelsPass");
					return;
				}

				if (e.event === e.target.labelIndexMapChanged)
				{
					this.invalidate("renderDataPass");
					return;
				}
			});

		// Private Properties

		this._cachedData = null;
		this._cachedFields = null;
		this._cachedLegend = null;

		// Constructor

		this.constructor = function()
		{
			this._legend_settingLabels = FunctionUtils.bind(this._legend_settingLabels, this);
		};

		// Public Methods

		this.processData = function()
		{
			this.validatePreceding("processDataPass");

			if (this.isValid("processDataPass"))
				return;

			this.invalidate("updateLegendLabelsPass");

			var data = this._cachedData = this.getInternal("data") || [];
			var fields = this._cachedFields = this.getInternal("fields") || [];

			this.processDataOverride(data, fields);

			this.setValid("processDataPass");
		};

		this.updateLegendLabels = function()
		{
			this.validatePreceding("updateLegendLabelsPass");

			if (this.isValid("updateLegendLabelsPass"))
				return;

			this.invalidate("renderDataPass");

			var legend = this._cachedLegend = this.getInternal("legend");
			var labels = null;

			if (legend)
				labels = this.updateLegendLabelsOverride(this._cachedData, this._cachedFields);

			this.setValid("updateLegendLabelsPass");

			// this must run last to avoid recursion
			if (legend)
				legend.setLabels(this, labels);
		};

		this.renderData = function()
		{
			this.validatePreceding("renderDataPass");

			if (this.isValid("renderDataPass"))
				return;

			this.renderDataOverride(this._cachedData, this._cachedFields, this._cachedLegend);

			this.setValid("renderDataPass");
		};

		// Protected Methods

		this.processDataOverride = function(data, fields)
		{
		};

		this.updateLegendLabelsOverride = function(data, fields)
		{
			return null;
		};

		this.renderDataOverride = function(data, fields, legend)
		{
		};

		// Private Methods

		this._legend_settingLabels = function(e)
		{
			this.validate("updateLegendLabelsPass");
		};

	});

});

define('splunk/mapping/layers/PieMarkerLayer',['require','leaflet','jg_global','jg_global','jgatt','jgatt','jgatt','jgatt','splunk/mapping/LatLon','splunk/mapping/LatLonBounds','splunk/mapping/layers/LayerBase','splunk/mapping/layers/VectorLayerBase','splunk/palettes/ColorPalette','splunk/palettes/ListColorPalette','splunk/vectors/Group','splunk/vectors/Wedge','splunk/viz/MDataTarget'],function(require)
{

	var Leaflet = require("leaflet");
	var jg_extend = require("jg_global").jg_extend;
	var jg_mixin = require("jg_global").jg_mixin;
	var Point = require("jgatt").geom.Point;
	var Rectangle = require("jgatt").geom.Rectangle;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var NumberUtils = require("jgatt").utils.NumberUtils;
	var LatLon = require("splunk/mapping/LatLon");
	var LatLonBounds = require("splunk/mapping/LatLonBounds");
	var LayerBase = require("splunk/mapping/layers/LayerBase");
	var VectorLayerBase = require("splunk/mapping/layers/VectorLayerBase");
	var ColorPalette = require("splunk/palettes/ColorPalette");
	var ListColorPalette = require("splunk/palettes/ListColorPalette");
	var Group = require("splunk/vectors/Group");
	var Wedge = require("splunk/vectors/Wedge");
	var MDataTarget = require("splunk/viz/MDataTarget");

	var PieMarkerLayer = jg_extend(VectorLayerBase, function(PieMarkerLayer, base)
	{

		base = jg_mixin(this, MDataTarget, base);

		// Public Properties

		this.markerColorPalette = new ObservableProperty("markerColorPalette", ColorPalette, new ListColorPalette([ 0x00CC00, 0xCCCC00, 0xCC0000 ], true))
			.onChanged(function(e)
			{
				this.invalidate("renderDataPass");
			});

		this.markerOpacity = new ObservableProperty("markerOpacity", Number, 1)
			.writeFilter(function(value)
			{
				return ((value >= 0) && (value <= Infinity)) ? Math.min(value, 1) : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderDataPass");
			});

		this.markerMinSize = new ObservableProperty("markerMinSize", Number, 10)
			.writeFilter(function(value)
			{
				return ((value >= 0) && (value < Infinity)) ? value : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderDataPass");
			});

		this.markerMaxSize = new ObservableProperty("markerMaxSize", Number, 50)
			.writeFilter(function(value)
			{
				return ((value >= 0) && (value < Infinity)) ? value : 0;
			})
			.onChanged(function(e)
			{
				this.invalidate("renderDataPass");
			});

		this.wrapX = new ObservableProperty("wrapX", Boolean, true)
			.onChanged(function(e)
			{
				this.invalidate("renderPass");
			});

		this.wrapY = new ObservableProperty("wrapY", Boolean, false)
			.onChanged(function(e)
			{
				this.invalidate("renderPass");
			});

		// Private Properties

		this._seriesList = null;
		this._markerList = null;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this._seriesList = [];
			this._markerList = [];
		};

		// Public Methods

		this.getLatLonBounds = function(center)
		{
			if ((center != null) && !(center instanceof LatLon))
				throw new Error("Parameter center must be an instance of splunk.mapping.LatLon.");

			this.validate();

			var bounds = new LatLonBounds(Infinity, Infinity, -Infinity, -Infinity);

			var markerList = this._markerList;
			for (var i = 0, l = markerList.length; i < l; i++)
				bounds.expand(markerList[i].latLon.normalize(center));

			return bounds.isFinite() ? bounds : null;
		};

		// Protected Methods

		this.processDataOverride = function(data, fields)
		{
			var seriesList = this._seriesList;
			var numSeries = 0;
			var series;

			var markerList = this._markerList;
			var numMarkers = 0;
			var marker;

			var sliceList;
			var numSlices;
			var slice;

			var i;
			var j;

			var numRows = data.length;
			var numFields = fields.length;
			if ((numRows > 0) && (numFields > 2))
			{
				var vectorContainer = this.vectorContainer;

				var fieldLat = fields[0];
				var fieldLon = fields[1];
				var fieldSeries;

				var valueLat;
				var valueLon;
				var valueSeries;

				var magMin = Infinity;
				var magMax = -Infinity;
				var magSpan = 0;
				var mag;

				var sum;
				var angle1;
				var angle2;

				// create or reuse series
				for (i = 2; i < numFields; i++)
				{
					fieldSeries = fields[i];
					if (numSeries < seriesList.length)
					{
						series = seriesList[numSeries];
					}
					else
					{
						series = new Series();
						seriesList.push(series);
					}

					series.name = fieldSeries;

					numSeries++;
				}

				// create or reuse markers
				for (i = 0; i < numRows; i++)
				{
					obj = data[i];
					if (obj == null)
						continue;

					valueLat = NumberUtils.parseNumber(obj[fieldLat]);
					valueLon = NumberUtils.parseNumber(obj[fieldLon]);
					if (isNaN(valueLat) || isNaN(valueLon))
						continue;

					if (numMarkers < markerList.length)
					{
						marker = markerList[numMarkers];
					}
					else
					{
						marker = new PieMarker();
						marker.appendTo(vectorContainer);
						markerList.push(marker);
					}

					// create or reuse slices and compute marker magnitude
					sliceList = marker.sliceList;
					numSlices = 0;
					mag = 0;
					for (j = 0; j < numSeries; j++)
					{
						series = seriesList[j];

						valueSeries = NumberUtils.parseNumber(obj[series.name]);
						if (isNaN(valueSeries) || (valueSeries <= 0))
							continue;

						if (numSlices < sliceList.length)
						{
							slice = sliceList[numSlices];
						}
						else
						{
							slice = new PieSlice();
							slice.appendTo(marker);
							sliceList.push(slice);
						}

						slice.series = series;
						slice.value = valueSeries;

						mag += valueSeries;

						numSlices++;
					}

					if (numSlices === 0)
						continue;

					// record marker attributes
					marker.latLon = new LatLon(valueLat, valueLon);
					marker.data = obj;
					marker.fields = fields;
					marker.magnitude = mag;

					// update magnitude min and max
					if (mag < magMin)
						magMin = mag;
					if (mag > magMax)
						magMax = mag;

					// compute slice angles
					sum = 0;
					angle1 = 0;
					angle2 = 0;
					for (j = 0; j < numSlices; j++)
					{
						slice = sliceList[j];

						sum += slice.value;
						angle1 = angle2;
						angle2 = 360 * (sum / mag);

						slice.startAngle = angle1 - 90;
						slice.arcAngle = angle2 - angle1;
					}

					// dispose unused slices
					for (j = sliceList.length - 1; j >= numSlices; j--)
					{
						slice = sliceList.pop();
						slice.dispose();
					}

					numMarkers++;
				}

				// compute marker scales
				magSpan = magMax - magMin;
				for (i = 0; i < numMarkers; i++)
				{
					marker = markerList[i];
					marker.scale = (magSpan > 0) ? NumberUtils.minMax((marker.magnitude - magMin) / magSpan, 0, 1) : (1 / numMarkers);
				}
			}

			// dispose unused markers
			for (i = markerList.length - 1; i >= numMarkers; i--)
			{
				marker = markerList.pop();
				marker.dispose();
			}

			// dispose unused series
			for (i = seriesList.length - 1; i >= numSeries; i--)
				seriesList.pop();
		};

		this.updateLegendLabelsOverride = function(data, fields)
		{
			var seriesList = this._seriesList;
			var numSeries = seriesList.length;
			var labels = (numSeries > 0) ? new Array(numSeries) : null;
			for (var i = 0; i < numSeries; i++)
				labels[i] = seriesList[i].name;
			return labels;
		};

		this.renderDataOverride = function(data, fields, legend)
		{
			this.invalidate("renderPass");

			var seriesList = this._seriesList;
			var numSeries = seriesList.length;
			var series;
			var seriesIndex;
			var seriesCount;

			var markerColorPalette = this.getInternal("markerColorPalette");
			var markerOpacity = this.getInternal("markerOpacity");
			var markerMinSize = this.getInternal("markerMinSize");
			var markerMaxSize = this.getInternal("markerMaxSize");
			var markerList = this._markerList;
			var numMarkers = markerList.length;
			var marker;

			var sliceList;
			var numSlices;
			var slice;

			var i;
			var j;

			// assign series colors
			seriesCount = legend ? legend.getNumLabels() : numSeries;
			for (i = 0; i < numSeries; i++)
			{
				series = seriesList[i];
				seriesIndex = legend ? legend.getLabelIndex(series.name) : i;
				series.color = markerColorPalette ? markerColorPalette.getColor(series.name, seriesIndex, seriesCount) : 0x000000;
			}

			// render pie slices
			for (i = 0; i < numMarkers; i++)
			{
				marker = markerList[i];
				sliceList = marker.sliceList;
				numSlices = sliceList.length;

				marker.radius = Math.round(NumberUtils.interpolate(markerMinSize, markerMaxSize, marker.scale)) / 2;
				marker.tooltipOffsetRadius = marker.radius;
				marker.display("none");  // fixes vml flicker

				for (j = 0; j < numSlices; j++)
				{
					slice = sliceList[j];
					slice.fillColor(slice.series.color);
					slice.fillOpacity(markerOpacity);
					slice.draw(0, 0, marker.radius, marker.radius, slice.startAngle, slice.arcAngle);
				}
			}
		};

		this.renderOverride = function(map)
		{
			base.renderOverride.call(this, map);

			var leafletMap = map.leafletMap;
			var centerLatLng = leafletMap.getCenter();

			var wrapX = this.getInternal("wrapX");
			var wrapY = this.getInternal("wrapY");

			var vectorBounds = this.vectorBounds;
			var minX = vectorBounds.minX;
			var minY = vectorBounds.minY;
			var maxX = vectorBounds.maxX;
			var maxY = vectorBounds.maxY;

			var markerList = this._markerList;
			var marker;
			var markerLatLng;
			var markerPoint;

			for (var i = 0, l = markerList.length; i < l; i++)
			{
				marker = markerList[i];
				markerLatLng = new Leaflet.LatLng(marker.latLon.lat, marker.latLon.lon);

				if (wrapX)
				{
					markerLatLng.lng -= centerLatLng.lng;
					markerLatLng.lng %= 360;
					if (markerLatLng.lng > 180)
						markerLatLng.lng -= 360;
					else if (markerLatLng.lng < -180)
						markerLatLng.lng += 360;
					markerLatLng.lng += centerLatLng.lng;
				}

				if (wrapY)
				{
					markerLatLng.lat -= centerLatLng.lat;
					markerLatLng.lat %= 180;
					if (markerLatLng.lat > 90)
						markerLatLng.lat -= 180;
					else if (markerLatLng.lat < -90)
						markerLatLng.lat += 180;
					markerLatLng.lat += centerLatLng.lat;
				}

				marker.tooltipLatLng = markerLatLng;

				markerPoint = leafletMap.latLngToLayerPoint(markerLatLng);

				marker.translate(markerPoint.x, markerPoint.y);
				if (((markerPoint.x + marker.radius) < minX) || ((markerPoint.x - marker.radius) > maxX) ||
				    ((markerPoint.y + marker.radius) < minY) || ((markerPoint.y - marker.radius) > maxY))
					marker.display("none");
				else
					marker.display(null);
			}
		};

	});

	var Series = jg_extend(Object, function(Series, base)
	{

		// Public Properties

		this.name = null;
		this.color = 0x000000;

		// Constructor

		this.constructor = function()
		{
		};

	});

	var PieMarker = jg_extend(Group, function(PieMarker, base)
	{

		// Public Properties

		this.sliceList = null;
		this.latLon = null;
		this.data = null;
		this.fields = null;
		this.magnitude = 0;
		this.scale = 0;
		this.radius = 0;
		this.tooltipLatLng = null;
		this.tooltipOffsetRadius = 0;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);

			this.element[LayerBase.METADATA_KEY] = this;

			this.sliceList = [];
		};

		// Public Methods

		this.dispose = function()
		{
			var sliceList = this.sliceList;
			for (var i = sliceList.length - 1; i >= 0; i--)
				sliceList[i].dispose();

			this.element[LayerBase.METADATA_KEY] = null;

			base.dispose.call(this);
		};

	});

	var PieSlice = jg_extend(Wedge, function(PieSlice, base)
	{

		// Public Properties

		this.series = null;
		this.value = 0;
		this.startAngle = 0;
		this.arcAngle = 0;

		// Constructor

		this.constructor = function()
		{
			base.constructor.call(this);
		};

	});

	return PieMarkerLayer;

});

define('splunk/parsers/Parser',['require','jg_global'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;

	return jg_extend(Object, function(Parser, base)
	{

		// Public Methods

		this.stringToValue = function(str)
		{
			return null;
		};

		this.valueToString = function(value)
		{
			return null;
		};

	});

});

define('splunk/parsers/ParseUtils',['require','jg_global'],function(require)
{

	var jg_static = require("jg_global").jg_static;

	return jg_static(function(ParseUtils)
	{

		// Private Static Constants

		var _UNESCAPE_PATTERN = /\\([.\n\r]?)/g;
		var _ESCAPE_SLASH_PATTERN = /\\/g;
		var _ESCAPE_QUOTE_PATTERN = /"/g;

		// Public Static Methods

		ParseUtils.prepareArray = function(str)
		{
			if (!str || (typeof str !== "string"))
				return null;

			str = ParseUtils.trimWhiteSpace(str);
			if (!str)
				return null;

			var length = str.length;
			if (length < 2)
				return null;

			if (str.charAt(0) != "[")
				return null;

			if (str.charAt(length - 1) != "]")
				return null;

			str = str.substring(1, length - 1);
			length = str.length;

			var arr = [];
			var index = -1;
			var value;

			while (index < length)
			{
				index++;
				value = _readUntil(str, index, ",");
				index += value.length;

				value = ParseUtils.trimWhiteSpace(value);
				if (value || (index < length) || (arr.length > 0))
					arr.push(ParseUtils.unescapeString(value));
			}

			return arr;
		};

		ParseUtils.prepareObject = function(str)
		{
			if (!str || (typeof str !== "string"))
				return null;

			str = ParseUtils.trimWhiteSpace(str);
			if (!str)
				return null;

			var length = str.length;
			if (length < 2)
				return null;

			if (str.charAt(0) != "{")
				return null;

			if (str.charAt(length - 1) != "}")
				return null;

			str = str.substring(1, length - 1);
			length = str.length;

			var obj = {};
			var index = 0;
			var key;
			var value;

			while (index < length)
			{
				key = _readUntil(str, index, ":");
				index += key.length + 1;

				if (index > length)
					break;

				value = _readUntil(str, index, ",");
				index += value.length + 1;

				key = ParseUtils.unescapeString(key);
				if (key)
					obj[key] = ParseUtils.unescapeString(value);
			}

			return obj;
		};

		ParseUtils.prepareTuple = function(str)
		{
			if (!str || (typeof str !== "string"))
				return null;

			str = ParseUtils.trimWhiteSpace(str);
			if (!str)
				return null;

			var length = str.length;
			if (length < 2)
				return null;

			if (str.charAt(0) != "(")
				return null;

			if (str.charAt(length - 1) != ")")
				return null;

			str = str.substring(1, length - 1);
			length = str.length;

			var arr = [];
			var index = -1;
			var value;

			while (index < length)
			{
				index++;
				value = _readUntil(str, index, ",");
				index += value.length;

				value = ParseUtils.trimWhiteSpace(value);
				if (value || (index < length) || (arr.length > 0))
					arr.push(ParseUtils.unescapeString(value));
			}

			return arr;
		};

		ParseUtils.unescapeString = function(str)
		{
			if ((str == null) || (typeof str !== "string"))
				return null;

			if (!str)
				return str;

			str = ParseUtils.trimWhiteSpace(str);
			if (!str)
				return str;

			var length = str.length;
			if (length < 2)
				return str;

			if (str.charAt(0) != "\"")
				return str;

			if (str.charAt(length - 1) != "\"")
				return str;

			str = str.substring(1, length - 1);
			if (!str)
				return str;

			str = str.replace(_UNESCAPE_PATTERN, "$1");

			return str;
		};

		ParseUtils.escapeString = function(str)
		{
			if ((str == null) || (typeof str !== "string"))
				return null;

			// two simple replace calls are faster than str.replace(/([\\"])/g, "\\$1")
			str = str.replace(_ESCAPE_SLASH_PATTERN, "\\\\");
			str = str.replace(_ESCAPE_QUOTE_PATTERN, "\\\"");

			return "\"" + str + "\"";
		};

		ParseUtils.trimWhiteSpace = function(str)
		{
			if ((str == null) || (typeof str !== "string"))
				return null;

			if (!str)
				return str;

			var startIndex = 0;
			var endIndex = str.length - 1;

			for (startIndex; startIndex <= endIndex; startIndex++)
			{
				if (!ParseUtils.isWhiteSpace(str.charAt(startIndex)))
					break;
			}

			for (endIndex; endIndex >= startIndex; endIndex--)
			{
				if (!ParseUtils.isWhiteSpace(str.charAt(endIndex)))
					break;
			}

			return str.substring(startIndex, endIndex + 1);
		};

		ParseUtils.isWhiteSpace = function(ch)
		{
			return ((ch === " ") || (ch === "\t") || (ch === "\n") || (ch === "\r"));
		};

		// Private Static Methods

		var _readUntil = function(str, startIndex, endChar)
		{
			var substr = "";

			var index = startIndex;
			var length = str.length;
			var ch;
			var isQuote = false;
			var nestLevel = 0;
			var nestBeginChar;
			var nestEndChar;

			while (index < length)
			{
				ch = str.charAt(index);
				if (isQuote)
				{
					if (ch == "\"")
					{
						isQuote = false;
					}
					else if (ch == "\\")
					{
						substr += ch;
						index++;
						ch = str.charAt(index);
					}
				}
				else if (nestLevel > 0)
				{
					if (ch == nestEndChar)
						nestLevel--;
					else if (ch == nestBeginChar)
						nestLevel++;
					else if (ch == "\"")
						isQuote = true;
				}
				else if (ch != endChar)
				{
					if (ch == "[")
					{
						nestLevel = 1;
						nestBeginChar = "[";
						nestEndChar = "]";
					}
					else if (ch == "{")
					{
						nestLevel = 1;
						nestBeginChar = "{";
						nestEndChar = "}";
					}
					else if (ch == "(")
					{
						nestLevel = 1;
						nestBeginChar = "(";
						nestEndChar = ")";
					}
					else if (ch == "\"")
					{
						isQuote = true;
					}
				}
				else
				{
					break;
				}

				substr += ch;
				index++;
			}

			return substr;
		};

	});

});

define('splunk/parsers/NumberParser',['require','jg_global','splunk/parsers/Parser','splunk/parsers/ParseUtils'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");

	return jg_extend(Parser, function(NumberParser, base)
	{

		// Private Static Properties

		var _instance = null;

		// Public Static Methods

		NumberParser.getInstance = function()
		{
			if (!_instance)
				_instance = new NumberParser();
			return _instance;
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			str = ParseUtils.trimWhiteSpace(str);
			return str ? Number(str) : NaN;
		};

		this.valueToString = function(value)
		{
			return (typeof value === "number") ? String(value) : String(NaN);
		};

	});

});

define('splunk/mapping/parsers/LatLonBoundsParser',['require','jg_global','splunk/mapping/LatLonBounds','splunk/parsers/NumberParser','splunk/parsers/Parser','splunk/parsers/ParseUtils'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var LatLonBounds = require("splunk/mapping/LatLonBounds");
	var NumberParser = require("splunk/parsers/NumberParser");
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");

	return jg_extend(Parser, function(LatLonBoundsParser, base)
	{

		// Private Static Properties

		var _instance = null;

		// Public Static Methods

		LatLonBoundsParser.getInstance = function()
		{
			if (!_instance)
				_instance = new LatLonBoundsParser();
			return _instance;
		};

		// Protected Properties

		this.numberParser = null;

		// Constructor

		this.constructor = function()
		{
			this.numberParser = NumberParser.getInstance();
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			var values = ParseUtils.prepareTuple(str);
			if (!values)
				return null;

			var latLonBounds = new LatLonBounds();

			var numValues = values.length;
			if (numValues > 0)
				latLonBounds.s = this.numberParser.stringToValue(values[0]);
			if (numValues > 1)
				latLonBounds.w = this.numberParser.stringToValue(values[1]);
			if (numValues > 2)
				latLonBounds.n = this.numberParser.stringToValue(values[2]);
			if (numValues > 3)
				latLonBounds.e = this.numberParser.stringToValue(values[3]);

			return latLonBounds;
		};

		this.valueToString = function(value)
		{
			var latLonBounds = (value instanceof LatLonBounds) ? value : null;
			if (!latLonBounds)
				return null;

			var str = "";

			str += this.numberParser.valueToString(latLonBounds.s) + ",";
			str += this.numberParser.valueToString(latLonBounds.w) + ",";
			str += this.numberParser.valueToString(latLonBounds.n) + ",";
			str += this.numberParser.valueToString(latLonBounds.e);

			return "(" + str + ")";
		};

	});

});

define('splunk/mapping/parsers/LatLonParser',['require','jg_global','splunk/mapping/LatLon','splunk/parsers/NumberParser','splunk/parsers/Parser','splunk/parsers/ParseUtils'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var LatLon = require("splunk/mapping/LatLon");
	var NumberParser = require("splunk/parsers/NumberParser");
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");

	return jg_extend(Parser, function(LatLonParser, base)
	{

		// Private Static Properties

		var _instance = null;

		// Public Static Methods

		LatLonParser.getInstance = function()
		{
			if (!_instance)
				_instance = new LatLonParser();
			return _instance;
		};

		// Protected Properties

		this.numberParser = null;

		// Constructor

		this.constructor = function()
		{
			this.numberParser = NumberParser.getInstance();
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			var values = ParseUtils.prepareTuple(str);
			if (!values)
				return null;

			var latLon = new LatLon();

			var numValues = values.length;
			if (numValues > 0)
				latLon.lat = this.numberParser.stringToValue(values[0]);
			if (numValues > 1)
				latLon.lon = this.numberParser.stringToValue(values[1]);

			return latLon;
		};

		this.valueToString = function(value)
		{
			var latLon = (value instanceof LatLon) ? value : null;
			if (!latLon)
				return null;

			var str = "";

			str += this.numberParser.valueToString(latLon.lat) + ",";
			str += this.numberParser.valueToString(latLon.lon);

			return "(" + str + ")";
		};

	});

});

define('splunk/palettes/FieldColorPalette',['require','jg_global','jgatt','splunk/palettes/ColorPalette'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var ObservableProperty = require("jgatt").properties.ObservableProperty;
	var ColorPalette = require("splunk/palettes/ColorPalette");

	return jg_extend(ColorPalette, function(FieldColorPalette, base)
	{

		// Private Static Methods

		var _cloneFieldColors = function(fieldColors)
		{
			var fieldColors2 = {};
			for (var field in fieldColors)
			{
				if (fieldColors[field] != null)
					fieldColors2[field] = Number(fieldColors[field]);
			}
			return fieldColors2;
		};

		// Public Properties

		this.fieldColors = new ObservableProperty("fieldColors", Object, {})
			.readFilter(function(value)
			{
				return _cloneFieldColors(value);
			})
			.writeFilter(function(value)
			{
				return _cloneFieldColors(value);
			});

		this.defaultColorPalette = new ObservableProperty("defaultColorPalette", ColorPalette, null);

		// Constructor

		this.constructor = function(fieldColors, defaultColorPalette)
		{
			base.constructor.call(this);

			if (fieldColors != null)
				this.set(this.fieldColors, fieldColors);
			if (defaultColorPalette != null)
				this.set(this.defaultColorPalette, defaultColorPalette);
		};

		// Protected Methods

		this.getColorOverride = function(properties, field, index, count)
		{
			if (field)
			{
				var color = properties.fieldColors[field];
				if ((color != null) && !isNaN(color))
					return color;
			}

			if (properties.defaultColorPalette)
				return properties.defaultColorPalette.getColor(field, index, count);

			return 0x000000;
		};

	});

});

define('splunk/parsers/StringParser',['require','jg_global','splunk/parsers/Parser'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Parser = require("splunk/parsers/Parser");

	return jg_extend(Parser, function(StringParser, base)
	{

		// Private Static Properties

		var _instance = null;

		// Public Static Methods

		StringParser.getInstance = function()
		{
			if (!_instance)
				_instance = new StringParser();
			return _instance;
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			return ((str == null) || (typeof str !== "string")) ? null : str;
		};

		this.valueToString = function(value)
		{
			return (value == null) ? null : String(value);
		};

	});

});

define('splunk/parsers/ArrayParser',['require','jg_global','jgatt','splunk/parsers/Parser','splunk/parsers/ParseUtils','splunk/parsers/StringParser'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Dictionary = require("jgatt").utils.Dictionary;
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");
	var StringParser = require("splunk/parsers/StringParser");

	return jg_extend(Parser, function(ArrayParser, base)
	{

		// Private Static Properties

		var _instances = new Dictionary();

		// Public Static Methods

		ArrayParser.getInstance = function(elementParser)
		{
			var instance = _instances.get(elementParser);
			if (!instance)
				instance = _instances.set(elementParser, new ArrayParser(elementParser));
			return instance;
		};

		// Protected Properties

		this.elementParser = null;

		// Constructor

		this.constructor = function(elementParser)
		{
			if (elementParser == null)
				throw new Error("Parameter elementParser must be non-null.");
			if (!(elementParser instanceof Parser))
				throw new Error("Parameter elementParser must be an instance of splunk.parsers.Parser.");

			this.elementParser = elementParser;
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			var array = ParseUtils.prepareArray(str);
			if (!array)
				return null;

			var elementParser = this.elementParser;
			for (var i = 0, l = array.length; i < l; i++)
				array[i] = elementParser.stringToValue(array[i]);

			return array;
		};

		this.valueToString = function(value)
		{
			var array = (value instanceof Array) ? value : null;
			if (!array)
				return null;

			var str = "";

			var elementParser = this.elementParser;
			var elementValue;
			for (var i = 0, l = array.length; i < l; i++)
			{
				elementValue = array[i];
				if (str)
					str += ",";
				if (elementParser instanceof StringParser)
					str += ParseUtils.escapeString(elementParser.valueToString(elementValue));
				else
					str += elementParser.valueToString(elementValue);
			}

			return "[" + str + "]";
		};

	});

});

define('splunk/parsers/BooleanParser',['require','jg_global','splunk/parsers/Parser','splunk/parsers/ParseUtils'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");

	return jg_extend(Parser, function(BooleanParser, base)
	{

		// Private Static Properties

		var _instance = null;

		// Public Static Methods

		BooleanParser.getInstance = function()
		{
			if (!_instance)
				_instance = new BooleanParser();
			return _instance;
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			str = ParseUtils.trimWhiteSpace(str);
			if (str)
				str = str.toLowerCase();
			return ((str === "true") || (str === "t") || (str === "1"));
		};

		this.valueToString = function(value)
		{
			return value ? "true" : "false";
		};

	});

});

define('splunk/parsers/ObjectParser',['require','jg_global','jgatt','splunk/parsers/Parser','splunk/parsers/ParseUtils','splunk/parsers/StringParser'],function(require)
{

	var jg_extend = require("jg_global").jg_extend;
	var Dictionary = require("jgatt").utils.Dictionary;
	var Parser = require("splunk/parsers/Parser");
	var ParseUtils = require("splunk/parsers/ParseUtils");
	var StringParser = require("splunk/parsers/StringParser");

	return jg_extend(Parser, function(ObjectParser, base)
	{

		// Private Static Properties

		var _instances = new Dictionary();

		// Public Static Methods

		ObjectParser.getInstance = function(elementParser)
		{
			var instance = _instances.get(elementParser);
			if (!instance)
				instance = _instances.set(elementParser, new ObjectParser(elementParser));
			return instance;
		};

		// Protected Properties

		this.elementParser = null;

		// Constructor

		this.constructor = function(elementParser)
		{
			if (elementParser == null)
				throw new Error("Parameter elementParser must be non-null.");
			if (!(elementParser instanceof Parser))
				throw new Error("Parameter elementParser must be an instance of splunk.parsers.Parser.");

			this.elementParser = elementParser;
		};

		// Public Methods

		this.stringToValue = function(str)
		{
			var map = ParseUtils.prepareObject(str);
			if (!map)
				return null;

			var elementParser = this.elementParser;
			for (var key in map)
			{
				if (map.hasOwnProperty(key))
					map[key] = elementParser.stringToValue(map[key]);
			}

			return map;
		};

		this.valueToString = function(value)
		{
			var map = (value instanceof Object) ? value : null;
			if (!map)
				return null;

			var str = "";

			var elementParser = this.elementParser;
			for (var key in map)
			{
				if (map.hasOwnProperty(key))
				{
					if (str)
						str += ",";
					str += ParseUtils.escapeString(key) + ":";
					if (elementParser instanceof StringParser)
						str += ParseUtils.escapeString(elementParser.valueToString(map[key]));
					else
						str += elementParser.valueToString(map[key]);
				}
			}

			return "{" + str + "}";
		};

	});

});

define('views/shared/Map',['require','exports','module','jquery','splunk.i18n','splunk.util','jgatt','jgatt','splunk/charting/ExternalLegend','splunk/mapping/Map','splunk/mapping/layers/PieMarkerLayer','splunk/mapping/parsers/LatLonBoundsParser','splunk/mapping/parsers/LatLonParser','splunk/palettes/FieldColorPalette','splunk/palettes/ListColorPalette','splunk/parsers/ArrayParser','splunk/parsers/BooleanParser','splunk/parsers/NumberParser','splunk/parsers/ObjectParser','splunk/parsers/StringParser','views/Base'],function(require, exports, module) {

	var $ = require('jquery');
	var SplunkI18N = require('splunk.i18n');
	var _ = SplunkI18N._;
	var SplunkUtil = require('splunk.util');
	var sprintf = SplunkUtil.sprintf;
	var FunctionUtils = require('jgatt').utils.FunctionUtils;
	var ValidateQueue = require('jgatt').validation.ValidateQueue;
	var ExternalLegend = require('splunk/charting/ExternalLegend');
	var Map = require('splunk/mapping/Map');
	var PieMarkerLayer = require('splunk/mapping/layers/PieMarkerLayer');
	var LatLonBoundsParser = require('splunk/mapping/parsers/LatLonBoundsParser');
	var LatLonParser = require('splunk/mapping/parsers/LatLonParser');
	var FieldColorPalette = require('splunk/palettes/FieldColorPalette');
	var ListColorPalette = require('splunk/palettes/ListColorPalette');
	var ArrayParser = require('splunk/parsers/ArrayParser');
	var BooleanParser = require('splunk/parsers/BooleanParser');
	var NumberParser = require('splunk/parsers/NumberParser');
	var ObjectParser = require('splunk/parsers/ObjectParser');
	var StringParser = require('splunk/parsers/StringParser');
	var Base = require('views/Base');

	var _DEFAULT_PROPERTY_VALUES = {
		"fieldColors": "",
		"seriesColors": "[" +
			"0x6CB8CA,0xFAC61D,0xD85E3D,0x956E96,0xF7912C,0x9AC23C,0x5479AF,0x999755,0xDD87B0,0x65AA82," +
			"0xA7D4DF,0xFCDD77,0xE89E8B,0xBFA8C0,0xFABD80,0xC2DA8A,0x98AFCF,0xC2C199,0xEBB7D0,0xA3CCB4," +
			"0x416E79,0x967711,0x823825,0x59425A,0x94571A,0x5C7424,0x324969,0x5C5B33,0x85516A,0x3D664E" +
		"]",
		"data.maxClusters": "100",
		"tileLayer.url": "/splunkd/__raw/services/mbtiles/splunk-tiles/{z}/{x}/{y}",
		"tileLayer.subdomains": "[a,b,c]",
		"tileLayer.minZoom": "0",
		"tileLayer.maxZoom": "7",
		"tileLayer.invertY": "false",
		"tileLayer.attribution": "",
		"markerLayer.markerOpacity": "1",
		"markerLayer.markerMinSize": "10",
		"markerLayer.markerMaxSize": "50"
	};

	var _R_PROPERTY_PREFIX = /^display\.visualizations\.mapping\./;

	return Base.extend({

		// Public Properties

		moduleId: module.id,

		// Private Properties

		_map: null,
		_markerLayer: null,
		_externalLegend: null,
		_fieldColorPalette: null,
		_seriesColorPalette: null,
		_propertyValues: null,
		_booleanParser: null,
		_numberParser: null,
		_stringParser: null,
		_numberArrayParser: null,
		_stringArrayParser: null,
		_numberObjectParser: null,
		_latLonParser: null,
		_latLonBoundsParser: null,
		_maxClusters: 100,
		_isPrinting: false,
		_prePrintCenter: null,
		_prePrintZoom: 0,

		// Constructor

		initialize: function(options) {
			Base.prototype.initialize.apply(this, arguments);

			this.options = options || {};
			this.$el.width(this.options.width || "100%");
			this.$el.height(this.options.height || "400px");

			if (this.model.searchResultsRow)
				this.model.searchResultsRow.on("change destroy error", this.updateData, this);
			else if (this.model.searchResultsColumn)
				this.model.searchResultsColumn.on("change destroy error", this.updateData, this);

			if (this.model.state)
				this.model.state.on("change", this._state_change, this);

			this._map_boundsChanged = FunctionUtils.bind(this._map_boundsChanged, this);
			this._map_mapClicked = FunctionUtils.bind(this._map_mapClicked, this);
			this._document_PrintStart = FunctionUtils.bind(this._document_PrintStart, this);
			this._document_PrintEnd = FunctionUtils.bind(this._document_PrintEnd, this);

			this._propertyValues = {};

			this._booleanParser = BooleanParser.getInstance();
			this._numberParser = NumberParser.getInstance();
			this._stringParser = StringParser.getInstance();
			this._numberArrayParser = ArrayParser.getInstance(this._numberParser);
			this._stringArrayParser = ArrayParser.getInstance(this._stringParser);
			this._numberObjectParser = ObjectParser.getInstance(this._numberParser);
			this._latLonParser = LatLonParser.getInstance();
			this._latLonBoundsParser = LatLonBoundsParser.getInstance();

			this._seriesColorPalette = new ListColorPalette();
			this._fieldColorPalette = new FieldColorPalette(null, this._seriesColorPalette);

			this._externalLegend = new ExternalLegend();
			this._externalLegend.connect();

			this._markerLayer = new PieMarkerLayer();
			this._markerLayer.set("legend", this._externalLegend);
			this._markerLayer.set("markerColorPalette", this._fieldColorPalette);

			this._map = new Map();
			this._map.formatNumber = this._formatNumber;
			this._map.formatDegrees = this._formatDegrees;
			this._map.addLayer(this._markerLayer);
			this._map.addEventListener("boundsChanged", this._map_boundsChanged);
			this._map.addEventListener("mapClicked", this._map_mapClicked);
			this._map.appendTo(this.$el);
			this._map.fitWorld(true);

			$(document).bind("PrintStart", this._document_PrintStart);
			$(document).bind("PrintEnd", this._document_PrintEnd);

			this.updateData();
			this.updateProperties();
			this._updateDataBounds();
		},

		// Public Methods

		getLatLonBounds: function() {
			return this._map.getLatLonBounds().normalize();
		},

		getPostProcessSearch: function() {
			var bounds = this._map.getLatLonBounds().normalize();
			return "geofilter south=" + bounds.s + " west=" + bounds.w + " north=" + bounds.n + " east=" + bounds.e + " maxclusters=" + this._maxClusters;
		},

		getMaxClusters: function() {
			return this._maxClusters;
		},

		updateData: function() {
			var extractedData = null;
			if (this.model.searchResultsRow)
				extractedData = this._extractRowData(this.model.searchResultsRow);
			else if (this.model.searchResultsColumn)
				extractedData = this._extractColumnData(this.model.searchResultsColumn);

			this._markerLayer.set("data", extractedData ? extractedData.data : null);
			this._markerLayer.set("fields", extractedData ? this._filterFields(extractedData.fields) : null);
		},

		updateProperties: function() {
			var curValues = this._propertyValues;
			var newValues = {};
			var p;

			// set null values for all existing properties
			// if they are not overridden by either the default or state properties, they will be cleared
			for (p in curValues) {
				if (curValues.hasOwnProperty(p))
					newValues[p] = null;
			}

			// copy default property values
			var defaultValues = _DEFAULT_PROPERTY_VALUES;
			for (p in defaultValues) {
				if (defaultValues.hasOwnProperty(p))
					newValues[p] = defaultValues[p];
			}

			// copy state property values
			var stateValues = this.model.state ? this.model.state.toJSON() : {};
			var rPrefix = _R_PROPERTY_PREFIX;
			for (p in stateValues) {
				if (stateValues.hasOwnProperty(p) && rPrefix.test(p))
					newValues[p.replace(rPrefix, "")] = stateValues[p];
			}

			// apply map viewport properties in order
			// zoom must be first for Leaflet to do the right thing
			if (newValues.hasOwnProperty("map.zoom"))
				this._setMapProperty("map.zoom", newValues["map.zoom"]);
			if (newValues.hasOwnProperty("map.center"))
				this._setMapProperty("map.center", newValues["map.center"]);
			if (newValues.hasOwnProperty("map.fitBounds"))
				this._setMapProperty("map.fitBounds", newValues["map.fitBounds"]);

			// apply remaining properties
			// the viewport properties haven't changed, so they will be ignored by _setMapProperty
			for (p in newValues) {
				if (newValues.hasOwnProperty(p))
					this._setMapProperty(p, newValues[p]);
			}
		},

		render: function() {
			return this;
		},

		remove: function() {
			$(document).unbind("PrintStart", this._document_PrintStart);
			$(document).unbind("PrintEnd", this._document_PrintEnd);

			this._map.removeEventListener("boundsChanged", this._map_boundsChanged);
			this._map.removeEventListener("mapClicked", this._map_mapClicked);
			this._map.dispose();

			this._externalLegend.close();

			if (this.model.searchResultsRow)
				this.model.searchResultsRow.off("change destroy error", this.updateData, this);
			else if (this.model.searchResultsColumn)
				this.model.searchResultsColumn.off("change destroy error", this.updateData, this);

			if (this.model.state)
				this.model.state.off("change", this._state_change, this);

			return Base.prototype.remove.apply(this, arguments);
		},

		onShow: function() {
			this._map.updateSize();
			this._map.validate();
			Base.prototype.onShow.call(this);
		},

		// Private Methods

		_updateDataBounds: function() {
			var model = this.model.state;
			if (!model)
				return;

			var bounds = this._map.getLatLonBounds().normalize();
			model.set({ "display.visualizations.mapping.data.bounds": this._latLonBoundsParser.valueToString(bounds) });
		},

		_needsPropertyUpdate: function(changedProperties) {
			if (!changedProperties)
				return false;

			for (var p in changedProperties) {
				if (changedProperties.hasOwnProperty(p) && (p !== "display.visualizations.mapping.data.bounds"))
					return true;
			}

			return false;
		},

		_extractRowData: function(model) {
			var extractedData = {};

			var fields = model.get("fields");
			var rows = model.get("rows");
			if (fields && rows) {
				var numFields = fields.length;
				var numRows = rows.length;
				var numEntries;
				var row;
				var obj;
				var i;
				var j;

				extractedData.fields = fields.concat();
				extractedData.data = [];
				for (i = 0; i < numRows; i++) {
					row = rows[i];
					numEntries = Math.min(row.length, numFields);
					obj = {};
					for (j = 0; j < numEntries; j++)
						obj[fields[j]] = row[j];
					extractedData.data.push(obj);
				}
			}

			return extractedData;
		},

		_extractColumnData: function(model) {
			var extractedData = {};

			var fields = model.get("fields");
			var columns = model.get("columns");
			if (fields && columns) {
				var numColumns = Math.min(fields.length, columns.length);
				var numRows = (numColumns > 0) ? columns[0].length : 0;
				var obj;
				var i;
				var j;

				for (i = 1; i < numColumns; i++)
					numRows = Math.min(numRows, columns[i].length);

				extractedData.fields = fields.slice(0, numColumns);
				extractedData.data = [];
				for (i = 0; i < numRows; i++) {
					obj = {};
					for (j = 0; j < numColumns; j++)
						obj[fields[j]] = columns[j][i];
					extractedData.data.push(obj);
				}
			}

			return extractedData;
		},

		_filterFields: function(fields) {
			if (!fields)
				return null;

			var filteredFields = [];
			var field;
			for (var i = 0, l = fields.length; i < l; i++) {
				field = fields[i];
				if (field && (field.charAt(0) !== "_"))
					filteredFields.push(field);
			}
			return filteredFields;
		},

		_setMapProperty: function(propertyName, propertyValue) {
			propertyValue = (propertyValue != null) ? String(propertyValue) : null;
			if (this._propertyValues[propertyName] == propertyValue)
				return;

			if (propertyValue != null)
				this._propertyValues[propertyName] = propertyValue;
			else
				delete this._propertyValues[propertyName];

			switch (propertyName) {
				// global properties
				case "fieldColors":
					this._fieldColorPalette.set("fieldColors", this._numberObjectParser.stringToValue(propertyValue));
					break;
				case "seriesColors":
					this._seriesColorPalette.set("colors", this._numberArrayParser.stringToValue(propertyValue));
					break;

				// data properties
				case "data.maxClusters":
					var maxClusters = this._numberParser.stringToValue(propertyValue);
					this._maxClusters = (maxClusters < Infinity) ? Math.max(Math.floor(maxClusters), 1) : 100;
					break;

				// map properties
				case "map.center":
					var center = this._latLonParser.stringToValue(propertyValue);
					if (center)
						this._map.set("center", center);
					break;
				case "map.zoom":
					var zoom = this._numberParser.stringToValue(propertyValue);
					if (!isNaN(zoom))
						this._map.set("zoom", zoom);
					break;
				case "map.fitBounds":
					var fitBounds = this._latLonBoundsParser.stringToValue(propertyValue);
					if (fitBounds)
						this._map.fitBounds(fitBounds);
					break;

				// tileLayer properties
				case "tileLayer.url":
					this._map.set("tileURL", this._resolveURL(propertyValue));
					break;
				case "tileLayer.subdomains":
					this._map.set("tileSubdomains", this._stringArrayParser.stringToValue(propertyValue));
					break;
				case "tileLayer.minZoom":
					this._map.set("tileMinZoom", this._numberParser.stringToValue(propertyValue));
					break;
				case "tileLayer.maxZoom":
					this._map.set("tileMaxZoom", this._numberParser.stringToValue(propertyValue));
					break;
				case "tileLayer.invertY":
					this._map.set("tileInvertY", this._booleanParser.stringToValue(propertyValue));
					break;
				case "tileLayer.attribution":
					this._map.set("tileAttribution", this._stringParser.stringToValue(propertyValue));
					break;

				// markerLayer properties
				case "markerLayer.markerOpacity":
					this._markerLayer.set("markerOpacity", this._numberParser.stringToValue(propertyValue));
					break;
				case "markerLayer.markerMinSize":
					this._markerLayer.set("markerMinSize", this._numberParser.stringToValue(propertyValue));
					break;
				case "markerLayer.markerMaxSize":
					this._markerLayer.set("markerMaxSize", this._numberParser.stringToValue(propertyValue));
					break;
			}
		},

		_resolveURL: function(propertyValue) {
			var propertyValue2 = propertyValue ? SplunkUtil.trim(propertyValue) : propertyValue;
			if (propertyValue2 && (propertyValue2.charAt(0) === "/")) {
				var hadTrailingSlash = (propertyValue2.charAt(propertyValue2.length - 1) === "/");
				propertyValue2 = SplunkUtil.make_url(propertyValue2);
				var hasTrailingSlash = (propertyValue2.charAt(propertyValue2.length - 1) === "/");
				if (hasTrailingSlash != hadTrailingSlash)
					propertyValue2 = hadTrailingSlash ? propertyValue2 + "/" : propertyValue2.substring(0, propertyValue2.length - 1);
				propertyValue = propertyValue2;
			}
			return propertyValue;
		},

		_formatNumber: function(num) {
			var pos = Math.abs(num);
			if ((pos > 0) && ((pos < 1e-3) || (pos >= 1e9)))
				return SplunkI18N.format_scientific(num, "##0E0");
			return SplunkI18N.format_decimal(num);
		},

		_formatDegrees: function(degrees, orientation) {
			var deg = Math.abs(degrees);
			var degInt = Math.floor(deg);
			var degStr = ("" + degInt);
			var min = (deg - degInt) * 60;
			var minInt = Math.floor(min);
			var minStr = (minInt < 10) ? ("0" + minInt) : ("" + minInt);
			var sec = (min - minInt) * 60;
			var secInt = Math.floor(sec);
			var secStr = (secInt < 10) ? ("0" + secInt) : ("" + secInt);

			var dirStr = "";
			if (degrees > 0)
				dirStr = (orientation === "ns") ? _("N") : _("E");
			else if (degrees < 0)
				dirStr = (orientation === "ns") ? _("S") : _("W");

			if (secInt > 0)
				return sprintf("%(degrees)s\u00B0%(minutes)s'%(seconds)s\"%(direction)s", { degrees: degStr, minutes: minStr, seconds: secStr, direction: dirStr });
			if (minInt > 0)
				return sprintf("%(degrees)s\u00B0%(minutes)s'%(direction)s", { degrees: degStr, minutes: minStr, direction: dirStr });
			return sprintf("%(degrees)s\u00B0%(direction)s", { degrees: degStr, direction: dirStr });
		},

		_state_change: function() {
			if (this.model.state.get("display.visualizations.type") === "mapping") {
				var changedProperties = this.model.state.filterChangedByWildcards(_R_PROPERTY_PREFIX, { allowEmpty: true });
				if (this._needsPropertyUpdate(changedProperties))
					this.updateProperties();
			}
		},

		_map_boundsChanged: function(e) {
			if (this._isPrinting)
				return;

			this._updateDataBounds();
			this.trigger("boundsChanged", {});
		},

		_map_mapClicked: function(e) {
			if (this._isPrinting)
				return;

			this.trigger("mapClicked", { data: e.data, fields: e.fields, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
		},

		_document_PrintStart: function(e) {
			if (this._isPrinting)
				return;

			this._isPrinting = true;

			this._prePrintCenter = this._map.get("center");
			this._prePrintZoom = this._map.get("zoom");

			this._map.updateSize();

			var dataBounds = this._markerLayer.getLatLonBounds(this._prePrintCenter);
			if (dataBounds)
				this._map.fitBounds(dataBounds);

			ValidateQueue.validateAll();
		},

		_document_PrintEnd: function(e) {
			if (!this._isPrinting)
				return;

			this._map.set("center", this._prePrintCenter);
			this._map.set("zoom", this._prePrintZoom);

			this._prePrintCenter = null;
			this._prePrintZoom = 0;
			this._isPrinting = false;
		}

	}, {
		DEFAULT_PROPERTY_VALUES: _DEFAULT_PROPERTY_VALUES
	});

});

define('splunkjs/mvc/splunkmapview',['require','exports','module','jquery','underscore','./mvc','models/Base','./basesplunkview','./settings','splunk.util','views/shared/Map','backbone','./utils','uri/route','JS_CACHE/config','util/console','jquery.ui.resizable'],function(require, exports, module) {
    var $ = require("jquery");
    var _ = require("underscore");
    var mvc = require("./mvc");
    var BaseModel = require("models/Base");
    var BaseSplunkView = require("./basesplunkview");
    var Settings = require("./settings");
    var SplunkUtil = require("splunk.util");
    var Map = require("views/shared/Map");
    var Backbone = require('backbone');
    var utils = require('./utils');
    var route = require("uri/route");
    var config = require('JS_CACHE/config');
    var console = require('util/console');
    var resizable = require('jquery.ui.resizable');

    var TileSources = {
        openStreetMap: {
            url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            maxZoom: 18
        }
        // TODO: dynamically add Splunk tile source info
    };

    var SplunkMapView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: "splunk-map",

        options: {
            data: "preview",
            height: '400px',
            tileSource: undefined,
            tileUrl: undefined,
            maxZoom: undefined,
            drilldown: false
        },
        
        omitFromSettings: ['el', 'reportModel'],

        initialize: function() {
            this.configure();
            mvc.enableDynamicTokens(this.settings);
            this.model = this.options.reportModel || new BaseModel();

            this.settings._sync = utils.syncModels(this.settings, this.model, {
                auto: true,
                prefix: 'display.visualizations.',
                alias: {
                    tileUrl: 'display.visualizations.mapping.tileLayer.url',
                    maxZoom: 'display.visualizations.mapping.tileLayer.maxZoom'
                },
                exclude: ['managerid','data','tileSource','drilldown','type']
            });

            this.results = new Backbone.Model({
                columns: [],
                fields: []
            });

            this.createMap = _.debounce(_.bind(this.createMap, this), 0);
            this.createMap();
            this.settings.on('change:tileSource', this._updateTileSource, this);
            this._updateTileSource();
            this.bindToComponent(this.options.managerid, this._onManagerChange, this);
        },

        _updateTileSource: function() {
            if(this.settings.has('tileSource')) {
                var tileSource = TileSources[this.settings.get('tileSource')];
                if(tileSource) {
                    this.settings.set({
                        tileUrl: tileSource.url,
                        maxZoom: tileSource.maxZoom
                    });
                } else {
                    console.warn('Invalid tileSource parameter value=%o', tileSource);
                }
            }
        },

        destroyMap: function() {
            if(this.map) {
                this.map.off();
                this.map.remove();
                this.map = null;
            }
        },

        createMap: function() {
            this.destroyMap();
            this.map = new Map({
                el: $('<div></div>').appendTo(this.el),
                model: {
                    searchResultsColumn: this.results,
                    state: this.model
                },
                height: this.settings.get('height')
            });
            this.map.on('boundsChanged', this._onBoundsChanged, this);
            this.map.on('mapClicked', this._onMapClicked, this);

            // force data to update according to new map bounds
            this._onBoundsChanged();

            this.enableResize();
        },

        enableResize: function() {
            if (!($.browser.safari && $.browser.version < "526")) {  // disable resizing for safari 3 and below only
                this.map.$el.resizable({autoHide: true, handles: "s", stop: this.onResizeStop.bind(this)});
                this.map.$el.mouseup(  // workaround until jquery ui is updated
                    function(event) {
                        $(this).width("100%");
                    }
                );
            }
        },

        onResizeStop: function(event, ui) {
            $(event.target).width("100%");
        },

        _onManagerChange: function(managers, manager) {
            if (this.manager) {
                this.manager.off(null, null, this);
                this.manager = null;
            }
            if (this.resultsModel) {
                this.resultsModel.off(null, null, this);
                this.resultsModel = null;
            }

            this._clearResults();

            if (!manager) {
                return;
            }

            this.manager = manager;
            this.manager.on("search:start", this._onSearchStart, this);
            this.resultsModel = this.manager.data(this.settings.get("data"), {
                serialfetch: true,
                output_mode: "json_cols",
                offset: 0,
                count: this.map ? this.map.getMaxClusters() : 100,
                show_empty_fields: "True",
                search: this.map ? this.map.getPostProcessSearch() : ''
            });
            this.resultsModel.on("data", this._onDataUpdate, this);
        },

        _clearResults: function() {
            this.results.set({
                columns: [],
                fields: []
            });
        },

        _onSearchStart: function() {
            this._clearResults();
        },

        _onDataUpdate: function() {
            if (this.resultsModel.hasData()) {
                this.results.set(this.resultsModel.data());
            } else {
                this._clearResults();
            }
            this.render();
        },

        _onBoundsChanged: function(){
            if (this.resultsModel) {
                this.resultsModel.set('search', this.map.getPostProcessSearch());
            }
        },

        _onMapClicked: function(e) {
            this.trigger('clicked:marker', e);
            if(this.settings.get('drilldown')) {
                this._doDrilldown(e, this.manager);
            }
        },

        _doDrilldown: function(event, manager) {
            if (!event || !manager)
                return;

            var data = event.data;
            if (!data || !data._geo_lat_field || !data._geo_long_field ||
                !data._geo_bounds_south || !data._geo_bounds_west || !data._geo_bounds_north || !data._geo_bounds_east)
                return;

            var options = {
                _geo_lat_field: data._geo_lat_field,
                _geo_lon_field: data._geo_long_field,
                _geo_bounds_south: data._geo_bounds_south,
                _geo_bounds_west: data._geo_bounds_west,
                _geo_bounds_north: data._geo_bounds_north,
                _geo_bounds_east: data._geo_bounds_east
            };

            if (event.altKey)
                options.negate = "true";

            var earliest = manager.job.properties().searchEarliestTime;
            var latest = manager.job.properties().searchLatestTime;

            this._parseIntentions(manager.query.resolve(), "geoviz", options).done(function(searchString) {
                var params = { q: searchString };
                if (earliest !== undefined)
                    params.earliest = earliest;
                if (latest !== undefined)
                    params.latest = latest;

                var pageInfo = utils.getPageInfo();
                var url = route.search(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
                utils.redirect(url, event.ctrlKey);
            });
        },

        _parseIntentions: function(searchString, action, options) {
            var dfd = $.Deferred();

            var params = {};
            for (var o in options) {
                if (options.hasOwnProperty(o))
                    params[o] = options[o];
            }
            params.q = SplunkUtil.addLeadingSearchCommand(searchString);
            params.action = action;
            params.output_mode = "json";

            $.ajax({
                url: SplunkUtil.make_url("/splunkd/__raw/services/search/intentionsparser"),
                data: params,
                type: "get",
                dataType: "json",
                async: true,
                success: function(data) {
                    dfd.resolve(SplunkUtil.stripLeadingSearchCommand(data.eventsSearch));
                },
                error: function(xhr, status, error) {
                    dfd.reject(error);
                }
            });

            return dfd.promise();
        },

        render: function() {
            this.$el.css('overflow-y', 'hidden');
            return this;
        },

        remove: function() {
            this.destroyMap();
            if(this.settings) {
                this.settings.off();
                if(this.settings._sync) {
                    this.settings._sync.destroy();
                }
            }
            BaseSplunkView.prototype.remove.call(this);
        }
    });
        
    return SplunkMapView;
});
