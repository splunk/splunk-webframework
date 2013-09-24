
define('util/xml_utils',['jquery', 'underscore'], function($, _) {

    function $node(str) {
        var document = $.parseXML(str);
        return $(document.childNodes[0]);
    }

    function cdata(str) {
        var document = $.parseXML('<x></x>');
        return document.createCDATASection(str);
    }

    function stripEmptyTextNodes(n) {
        //IE <9 does not have TEXT_NODE
        var TEXT_NODE = n.TEXT_NODE || 3,
            i, child, childNodes = n.childNodes;
        for(i = childNodes.length - 1; i >= 0 ; i--) {
            child = childNodes[i];
            if(child !== undefined) {
                if(child.nodeType === TEXT_NODE) {
                    if(/^\s*$/.test(child.nodeValue)) {
                        n.removeChild(child);
                    } else {
                        child.nodeValue = $.trim(child.nodeValue);
                    }
                }
            }
        }
        childNodes = n.childNodes;
        for(i = childNodes.length - 1; i >= 0 ; i--) {
            child = childNodes[i];
            if(child.nodeType === n.ELEMENT_NODE || child.nodeType === n.DOCUMENT_NODE) {
                stripEmptyTextNodes(child);
            }
        }
    }

    var INDENT = '  ';

    function indentTxt(level) {
        var txt = ['\n'], x = level;
        while(x--) {
            txt.push(INDENT);
        }
        return txt.join('');
    }

    function indent($xml, n, level) {
        if(!n || !n.childNodes) {
            return;
        }

        //IE <9 does not have TEXT_NODE
        var TEXT_NODE = n.TEXT_NODE || 3;

        for(var i = 0; i <= n.childNodes.length; i++) {
            var child1 = n.childNodes[i - 1], child2 = n.childNodes[i];
            if(child2 && child2.nodeType !== TEXT_NODE && ((!child1) || child1.nodeType !== TEXT_NODE)) {
                n.insertBefore($xml.createTextNode(indentTxt(level)), child2);
            }
            if(i === n.childNodes.length && child1 && child1.nodeType !== TEXT_NODE) {
                n.appendChild($xml.createTextNode(indentTxt(level - 1)));
            }
        }
        _.chain(n.childNodes).filter(function(c) {
            return c.nodeType === n.ELEMENT_NODE;
        }).each(function(c) {
                    indent($xml, c, level + 1);
                });
    }

    function formatXMLDocument($xml) {
        stripEmptyTextNodes($xml[0]);
        indent($xml[0], $xml[0].childNodes[0], 1);
        return $xml;
    }

    function serialize(xml) {
        if(xml instanceof $) {
            xml = xml[0];
        }
        return Object.prototype.hasOwnProperty.call(xml, 'xml') ? xml.xml : new XMLSerializer().serializeToString(xml);
    }

    return {
        $node: $node,
        cdata: cdata,
        stripEmptyTextNodes: stripEmptyTextNodes,
        formatXMLDocument: formatXMLDocument,
        serialize: serialize
    };
});
define('models/Dashboard',
    [
        'jquery',
        'underscore',
        'splunk.util',
        'models/services/data/ui/View',
        'util/xml_utils',
        'models/Base'
    ],
    function($, _, splunkutil, ViewModel, xmlUtils, BaseModel) {

        var HTML_PANEL_TYPE = 'html',
            CHART_PANEL_TYPE = 'chart',
            EVENT_PANEL_TYPE = 'event',
            SINGLE_PANEL_TYPE = 'single',
            TABLE_PANEL_TYPE = 'table',
            NON_HTML_PANEL_TYPES = [CHART_PANEL_TYPE, EVENT_PANEL_TYPE, SINGLE_PANEL_TYPE, TABLE_PANEL_TYPE];

        /**
         * Transient Dashboard Metadata Model
         *
         * Attributes:
         * - label
         * - description
         *
         */
        var DashboardMetadata = BaseModel.extend({
            constructor: function(dashboard) {
                this._dash = dashboard;
                BaseModel.prototype.constructor.call(this);
            },
            //validation: {},
            apply: function(){
                this._dash._applyMetadata(this.toJSON());
            },
            save: function() {
                if(arguments.length) {
                    this.set.apply(this, arguments);
                }
                this._dash._applyMetadata(this.toJSON());
                return this._dash.save.apply(this._dash, arguments);
            },
            fetch: function() {
                var m = this._dash._extractMetadata();
                this.set(m);
                var dfd = $.Deferred();
                dfd.resolve(this);
                return dfd;
            }
        });

        var Dashboard = ViewModel.extend({
            /**
             * model {Object} 
             * options {
             *     indent: <boolean> (default: true)
             * }
             */
            initialize: function(model, options) {
                ViewModel.prototype.initialize.apply(this, arguments);
                this.indent = (options || {}).indent !== false;
            },
            initializeAssociated: function() {
                ViewModel.prototype.initializeAssociated.apply(this, arguments);
                var meta = this.meta = this.meta || new DashboardMetadata(this);
                this.entry.content.on('change:eai:data', function(){
                    meta.fetch();
                }, this);
                meta.fetch();
            },
            associatedOff: function(e, cb, ctx) {
                ViewModel.prototype.associatedOff.apply(this, arguments);
                this.meta.off(e, cb, ctx);
            },
            get$XML: function() {
                var data = (this.isXML() && this.entry.content.get('eai:data')) || '<dashboard/>',
                    xmlDoc = $.parseXML(data);
                // SPL-68158 Prevent any kind of XSS when modifying XML using jQuery
                $(xmlDoc).find('script').remove();
                return $(xmlDoc);
            },
            set$XML: function($xml) {
                var raw = xmlUtils.serialize(this.indent ? xmlUtils.formatXMLDocument($xml) : $xml);
                this.setXML(raw);
            },
            setXML: function(raw) {
                this.entry.content.set('eai:data', raw);
                this.entry.content.set('eai:type', 'views');
            },
            setHTML: function(raw) {
                this.entry.content.set('eai:data', raw);
                this.entry.content.set('eai:type', 'html');
            },
            _extractMetadata: function() {
                var isXML = this.isXML(), $xml = isXML ? this.get$XML() : null;
                return {
                    label: this.entry.content.get('label') || this.entry.get('name'),
                    description: (isXML && $xml.find(':eq(0) > description').text()) || ''
                };
            },
            _applyMetadata: function(metadata) {
                var $xml = this.get$XML(),
                    $label = $xml.find(':eq(0) > label'),
                    $description = $xml.find(':eq(0) > description'),
                    label = metadata.label, description = metadata.description;

                if(label !== undefined && label !== null) {
                    if(!$label.length) {
                        $label = xmlUtils.$node('<label/>');
                        $xml.find(':eq(0)').prepend($label);
                    }
                    $label.text(label);
                }

                if(description !== undefined && description !== null) {
                    if((description === undefined || description === '') && $description.length) {
                        $description.remove();
                    } else {
                        if(!$description.length) {
                            $description = xmlUtils.$node('<description/>');
                            if($label.length) {
                                $description.insertAfter($label);
                            } else {
                                $xml.find(':eq(0)').prepend($description);
                            }
                        }
                    }
                    $description.text(description);
                }

                this.set$XML($xml);
            },
            getLabel: function() {
                var result = this.meta.get('label');
                return result === undefined ? "" : result;
            },
            setLabel: function(value) {
                this.setLabelAndDescription(value, undefined);
            },       
            getDescription: function() {
                return this.meta.get('description');
            },
            setDescription: function(value) {
                this.setLabelAndDescription(undefined, value);
            },
            setLabelAndDescription: function(label, description) {
                this._applyMetadata({ label: label, description: description });
            },
            get$Rows: function() {
                var $xml = this.get$XML();
                return $xml.find(':eq(0) > row');
            },
            appendNewPanel: function(panelType, properties) {
                var isNonHTML = (_.indexOf(NON_HTML_PANEL_TYPES, panelType) != -1),
                    isHTML = (panelType === HTML_PANEL_TYPE),
                    panel, $xml;

                if (isNonHTML || isHTML) {
                    if (isNonHTML) {
                        panel = _.template(this.nonHTMLPanelTemplate, {
                            panelType: panelType,
                            properties: properties
                        });
                    } else {
                        panel = _.template(this.HTMLPanelTemplate, {
                            properties: properties
                        });
                    }

                    $xml = this.get$XML();
                    var rowNode = xmlUtils.$node('<row/>');
                    $(rowNode).append(xmlUtils.$node(panel));
                    $xml.find(':eq(0)').append(rowNode);
                    this.set$XML($xml);
                }
            },
            nonHTMLPanelTemplate: '\
                <<%- panelType %>>\
                    <% if (properties.title) { %>\
                        <title><%- properties.title %></title>\
                    <% } %>\
                    <% if (properties.searchString) { %>\
                        <searchString><%- properties.searchString %></searchString>\
                        <% if (properties.earliestTime) { %>\
                            <earliestTime><%- properties.earliestTime %></earliestTime>\
                        <% } %>\
                        <% if (properties.latestTime) { %>\
                            <latestTime><%- properties.latestTime %></latestTime>\
                        <% } %>\
                    <% } else if (properties.pivotSearch) { %>\
                        <pivotSearch>\
                            <model><%= properties.pivotSearch.model %></model>\
                            <object><%= properties.pivotSearch.object %></object>\
                            <filters><%= properties.pivotSearch.filters %></filters>\
                            <cells><%= properties.pivotSearch.cells %></cells>\
                            <rows><%= properties.pivotSearch.rows %></rows>\
                            <columns><%= properties.pivotSearch.columns %></columns>\
                        </pivotSearch>\
                    <% } else if (properties.searchName) { %>\
                        <searchName><%- properties.searchName %></searchName>\
                    <% } %>\
                    <% if (properties.fields) { %>\
                        <fields><%- properties.fields %></fields>\
                    <% } %>\
                    <% _.each(properties.options, function(value, key) { %>\
                        <option name="<%- key %>"><%- value %></option>\
                    <% }) %>\
                </<%- panelType %>>\
            ',
            HTMLPanelTemplate: '<html><%= properties.html %></html>'
        },
        {
            panelXMLToPanelTypeAndProperties: function(xml){
                var properties = {},
                    $xml = $(xml), raw;

                if (xml.nodeName === HTML_PANEL_TYPE){
                    raw = xmlUtils.serialize(xml);
                    return {
                        panelType: xml.nodeName,
                        properties: {
                            html: $.trim(raw.replace(/^\s*<html>|<\/html>\s*$/g,''))
                        }
                    };
                }
                $xml.children().each(function(index, el){
                    var $el = $(el);
                    if (el.nodeName !== 'option') {
                        properties[el.nodeName] = $el.text();
                    } else {
                        properties.options = properties.options || {};
                        properties.options[$el.attr('name')] = $el.text();
                    }
                });
                return {
                    panelType: xml.nodeName,
                    properties: properties
                };
            },
            reportToPropertiesFromPanelType: function(panelType, reportModel, isInline){
                var isNonHTML = (_.indexOf(NON_HTML_PANEL_TYPES, panelType) != -1),
                properties = {},
                search, searchName, earliestTime, latestTime;

                if (isNonHTML){
                    if (!reportModel.isNew() && !isInline){
                        properties.searchName = reportModel.entry.get('name');
                    } else {
                        properties.searchString = reportModel.entry.content.get("search");

                        earliestTime = reportModel.entry.content.get("dispatch.earliest_time");
                        if (earliestTime) {
                            properties.earliestTime = earliestTime;
                        }

                        latestTime = reportModel.entry.content.get("dispatch.latest_time");
                        if (latestTime) {
                            properties.latestTime = latestTime;
                        }
                    }

                    if (panelType === CHART_PANEL_TYPE) {
                        properties.options = reportModel.entry.content.filterByWildcards(
                            ["^display\.visualizations\.charting\..*"],
                            {
                                strip:'display.visualizations.'
                            }
                        );
                    } else if (panelType === SINGLE_PANEL_TYPE) {
                        properties.options = reportModel.entry.content.filterByWildcards(
                            ["^display\.visualizations\.singlevalue\..*"],
                            {
                                strip:'display.visualizations.singlevalue.'
                            }
                        );
                    }
                } else {
                    throw("Unsupported panel type");
                }

                return properties;
            }
        });

        // break the shared reference to Entry
        Dashboard.Entry = Dashboard.Entry.extend({});
        // now we can safely extend Entry.Content
        var Content = Dashboard.Entry.Content;
        Dashboard.Entry.Content = Content.extend({
            initialize: function() {
                Content.prototype.initialize.apply(this, arguments);
            },
            validate: function(attributes) {
                var eaiData = attributes["eai:data"],
                    xml, dashboard;

                if (eaiData != void(0)){
                    xml = $.parseXML(eaiData);

                    dashboard = xml.firstChild;
                    if (dashboard.nodeName !== 'dashboard' && dashboard.nodeName !== 'form'){
                        return {
                            'eai:data': "You must declare a dashboard node."
                        };
                    }
                }
            }
        });
        
        return Dashboard;
    }
);

define('collections/Reports',
    [
        "models/Report",
        "collections/services/SavedSearches"
    ],
    function(ReportModel, SavedSearchCollection) {
        return SavedSearchCollection.extend({
            model: ReportModel,
            initialize: function() {
                SavedSearchCollection.prototype.initialize.apply(this, arguments);
            }
        },
        {
            ALERT_SEARCH_STRING: '(is_scheduled=1 AND (alert_type!=always OR alert.track=1 OR (dispatch.earliest_time="rt*" AND dispatch.latest_time="rt*" AND actions="*" )))'
        });
    }
);

define('splunkjs/mvc/simplexml/controller',['require','models/Dashboard','util/router_utils','models/classicurl','backbone','jquery','underscore','../../mvc','util/xml_utils','../utils','util/pdf_utils','util/console','uri/route','../sharedmodels','util/splunkd_utils','splunk.util','../protections','collections/Reports','util/ajax_no_cache'],function(require) {
    var BaseDashboardModel = require('models/Dashboard');
    var routerUtils = require('util/router_utils');
    var classicurl = require('models/classicurl');
    var Backbone = require('backbone');
    var $ = require('jquery');
    var _ = require('underscore');
    var mvc = require('../../mvc');
    var xmlUtils = require('util/xml_utils');
    var utils = require('../utils');
    var pdfUtils = require('util/pdf_utils');
    var console = require('util/console');
    var route = require('uri/route');
    var sharedModels = require('../sharedmodels');
    var splunkd_utils = require('util/splunkd_utils');
    var SplunkUtil = require('splunk.util');
    var protections = require('../protections');
    var Reports = require('collections/Reports'); 
    require('util/ajax_no_cache');

    protections.enableCSRFProtection($);
    protections.enableUnauthorizationRedirection($, SplunkUtil.make_url('account/login'), '/account/logout');

    var DashboardModel = BaseDashboardModel.extend({
        initialize: function(){
            BaseDashboardModel.prototype.initialize.apply(this, arguments);
            this.entry.content.on('change:eai:data', this.updateItemOrder, this);
        },
        /**
         *
         * @param options {
         *     tokens (boolean) -  whether the generated XML source should contain tokens or their values
         *     useLoadjob (boolean) - whether to use | loadjob <sid> instead of writing the actual search to the XML
         *     indent (boolean) - whether to generated pretty-printed XML or not
         * }
         * @returns {String} the serialized XML
         */
        getFlattenedXML: function(options) {
            if(!this._itemOrder) {
                throw new Error('Cannot create flattened XML without the item order being captured first');
            }
            var $n = xmlUtils.$node, that = this;
            options = options || {};

            var dashboard = $n('<dashboard/>');
            $n('<label/>').text(this.meta.get('label')).appendTo(dashboard);
            if(this.meta.has('description')) {
                $n('<description/>').text(this.meta.get('description')).appendTo(dashboard);
            }

            _(this._itemOrder).each(function(panels) {
                var row = $n('<row/>');

                if(_(panels).any(function(p) { return p.length > 1; })) { // Are there any grouped panels?
                    var groups = _(panels).map(function(p) { return p.length; }).join(',');
                    row.attr('grouping', groups);
                }

                _(panels).chain().flatten().each(function(id) {
                    var element = mvc.Components.get(id);
                    var settings = element.model.mapToXML(_.extend({ tokens: false, flatten: true }, options));
                    var newNode = xmlUtils.$node('<' + settings.type + '/>');

                    if(settings.attributes !== undefined) {
                        newNode.attr(settings.attributes);
                    }

                    if(settings.content) {
                        if(settings.cdata) {
                            newNode.append(xmlUtils.cdata(settings.content));
                        } else {
                            newNode.text(settings.content);
                        }
                    } else {
                        that._applyTitle(newNode, settings);
                        var manager = mvc.Components.get(element.model.entry.content.get('display.general.manager'));
                        if(options.useLoadjob !== false && manager && manager.job) {
                            that._applySearch(newNode, {
                                search: {
                                    type: 'inline',
                                    search: '| loadjob ' + manager.job.sid + ' ignore_running=t'
                                }
                            });
                        } else {
                            that._applySearch(newNode, settings);
                        }

                        that._applyOptions(newNode, settings);
                        that._applyTags(newNode, settings);
                    }

                    newNode.appendTo(row);
                });

                row.appendTo(dashboard);

            });

            if(options && options.indent) {
                xmlUtils.formatXMLDocument(dashboard);
            }

            return xmlUtils.serialize(dashboard);
        },
        /**
         * Update the dashboard element with the settings specified
         * @param id - the element id (string)
         * @param settings - a settings object containing the update information
         * @param options - persistence options
         *
         * settings contains: {
         *      type: (String) the element type (one of "table", "chart", "single", "map", "list", "html")
         *      search: (Object) {
         *          type: (String) one of 'inline', 'saved' or 'pivot'
         *          search: (String) the search string (for inline)
         *          earliest_time: (String) the earliest_time of the inline search
         *          latest_time: (String) the latest_time of the inline search
         *          name: (String) name of the saved search
         *          ... TODO pivot search params
         *      }
         *      options: (Object) options to added (or replaced) to the element (<option name="$name$">$value$</option>)
         *      removeOptions: (Array) options to be removed from the xml element
         *      tags: (Object) tags to be added (or replaced) to the element (<$tag$>$value$</$tag$>)
         * },
         * options: {
         *      clearOptions: (Boolean) true to remove all options nodes before updating the XML element
         * }
         */
        updateElement: function(id, settings, options) {
            console.log('About to update item=%o with settings=%o', id, settings);
            var $xml = this.get$XML();
            var cur = $xml.find('#' + id);
            if(!cur.length) {
                var itemIndex = _(this._itemOrder).chain().flatten().indexOf(id).value();
                console.log('Node with ID=%o not found. Search for item with index=%o', id, itemIndex);
                if(itemIndex === -1) {
                    throw new Error("Unable to find dashboard element with ID " + id);
                }
                cur = $xml.find('row').children()[ itemIndex ];
                if(!cur) {
                    throw new Error("Unable to find dashboard element with ID " + id);
                } else {
                    cur = $(cur);
                }
            }
            cur = cur[0];
            console.log("Updating XML node: ", cur);
            xmlUtils.stripEmptyTextNodes(cur);

            var newNode = xmlUtils.$node('<' + settings.type + '/>');

            if ($(cur).attr('id')) {
                newNode.attr('id', $(cur).attr('id'));
            }

            console.log('children', cur.childNodes);
            while(cur.childNodes.length) {
                newNode.append(cur.childNodes[0]);
            }

            if(options && options.clearOptions) {
                newNode.find('option').remove();
                delete settings.options; 
            }

            this._applyTitle(newNode, settings);
            this._applySearch(newNode, settings);
            this._applyOptions(newNode, settings);
            this._applyTags(newNode, settings);

            $(cur).replaceWith(newNode);
            if(console.DEBUG_ENABLED) {
                xmlUtils.formatXMLDocument($xml);
                console.log(xmlUtils.serialize($xml));
            }
            this.set$XML($xml);
            return this.save();
        },
        deleteElement: function(id) {
            // Create new item order without the element which is to be deleted
            var newOrder = _(this._itemOrder).map(function(row) {
                return _(row).map(function(panel) {
                    var idx = _(panel).indexOf(id);
                    return idx > -1 ? panel.slice(0, idx).concat(panel.slice(idx + 1)) : _.clone(panel);
                });
            });

            return this.setItemOrder(newOrder);
        },
        addElement: function(id, settings) {
            var row = xmlUtils.$node('<row/>'), newNode = xmlUtils.$node('<' + settings.type + '/>');
            this._itemOrder.push([
                [settings.id]
            ]);
            row.append(newNode);
            this._applyTitle(newNode, settings);
            this._applySearch(newNode, settings);
            var $xml = this.get$XML();
            $xml.find(':eq(0)').append(row);
            if(console.DEBUG_ENABLED) {
                xmlUtils.formatXMLDocument($xml);
                console.log(xmlUtils.serialize($xml));
            }
            this.set$XML($xml);
            return this.save();
        },
        saveFormSettings: function(isForm, haveTimeRangePicker, timeRangePickerDefault) {
            var xml = this.get$XML(), root, fieldset;
            if(isForm) {
                xml = this._migrateViewType(xml, 'form');
                root = xml.find(':eq(0)');
                fieldset = xml.find(':eq(0)>fieldset');
                if(!fieldset.length) {
                    fieldset = xmlUtils.$node('<fieldset autoRun="true" submitButton="false"></fieldset>');
                    var el = xml.find(':eq(0)>description');
                    if(el.length) {
                        fieldset.insertAfter(el);
                    } else {
                        el = xml.find(':eq(0)>label');
                        if(el.length) {
                            fieldset.insertAfter(el);
                        } else {
                            fieldset.prependTo(root);
                        }
                    }
                }
                var timeInput = _(fieldset.find('input[type="time"]')).find(function(el){
                    return !$(el).attr('token');
                });
                if(haveTimeRangePicker) {
                    var defNode;
                    if(timeInput) {
                        defNode = $(timeInput).find('default');
                        if(!defNode.length) {
                            defNode = xmlUtils.$node('<default></default>').appendTo(timeInput);
                        }
                    } else {
                        timeInput = xmlUtils.$node('<input type="time" searchWhenChanged="true" />');
                        defNode = xmlUtils.$node('<default></default>').appendTo(timeInput);
                        fieldset.append(timeInput);
                    }

                    if(timeRangePickerDefault){
                        if(_.isString(timeRangePickerDefault)) {
                            defNode.text(timeRangePickerDefault);
                        } else {
                            defNode.empty();
                            if(timeRangePickerDefault.earliestTime) {
                                xmlUtils.$node('<earliestTime></earliestTime>').text(timeRangePickerDefault.earliestTime).appendTo(defNode);
                            }
                            if(timeRangePickerDefault.latestTime) {
                                xmlUtils.$node('<latestTime></latestTime>').text(timeRangePickerDefault.latestTime).appendTo(defNode);
                            }
                        }
                    } else {
                        defNode.remove();
                    }
                } else {
                    $(timeInput).remove();
                }
            } else {
                xml = this._migrateViewType(xml, 'dashboard');
                xml.find(':eq(0)>fieldset').remove();
            }
            if(console.DEBUG_ENABLED) {
                xmlUtils.formatXMLDocument(xml);
                console.log(xmlUtils.serialize(xml));
            }
            this.set$XML(xml);
            this.save();
        },
        _migrateViewType: function($xml, tagName) {
            var curRoot = $xml.find(':eq(0)');
            if(curRoot.prop('tagName') !== tagName) {
                $xml = $($.parseXML('<' + tagName + '/>'));
                var newRoot = $xml.find(':eq(0)'), cur = curRoot[0];
                _(cur.attributes).each(function(attr){
                    newRoot.attr(attr.nodeName, attr.nodeValue);
                });
                while(cur.childNodes.length) {
                    newRoot.append(cur.childNodes[0]);
                }
            }
            return $xml;
        },
        _applyOptions: function(newNode, settings) {
            if(settings.options) {
                _.each(settings.options, function(value, name) {
                    var curOption = newNode.find('option[name="' + name + '"]');
                    if(value === "" || value === null || value === void(0)) {
                        curOption.remove();
                    } else {
                        if(curOption.length) {
                            curOption.text(value);
                        } else {
                            xmlUtils.$node('<option/>').attr('name', name).text(value).appendTo(newNode);
                        }
                    }
                });
            }
            if(settings.removeOptions) {
                _(settings.removeOptions).each(function(name) {
                    newNode.find('option[name="' + name + '"]').remove();
                });
            }
        },
        _applyTags: function(newNode, settings) {
            if(settings.tags) {
                _.each(settings.tags, function(value, tag) {
                    newNode.find(tag).remove();
                    if((_.isArray(value) && value.length) || value) {
                        xmlUtils.$node('<' + tag + '/>').text(value).appendTo(newNode);
                    }
                });
            }
        },
        _applyTitle: function(newNode, settings) {
            var titleNode = newNode.find('title');
            if(settings.title) {
                if(!titleNode.length) {
                    titleNode = xmlUtils.$node('<title/>').prependTo(newNode);
                }
                titleNode.text(settings.title);
            }
        },
        _applySearch: function(newNode, settings) {
            if(settings.search) {
                // Clear current search info
                newNode.find('searchString,searchTemplate,searchName,searchPostProcess,pivotSearch,earliestTime,latestTime').remove();
                var titleNode = newNode.find('title');
                switch(settings.search.type) {
                    case 'inline':
                        var searchNode = xmlUtils.$node('<searchString/>').text(settings.search.search);
                        if(titleNode.length) {
                            searchNode.insertAfter(titleNode);
                        } else {
                            searchNode.prependTo(newNode);
                        }
                        if(settings.search.latest_time) {
                            xmlUtils.$node('<latestTime/>').text(settings.search.latest_time).insertAfter(searchNode);
                        }
                        if(settings.search.earliest_time) {
                            xmlUtils.$node('<earliestTime/>').text(settings.search.earliest_time).insertAfter(searchNode);
                        }
                        break;
                    case 'postprocess':
                        var postSearchNode = xmlUtils.$node('<searchPostProcess/>').text(settings.search.search);
                        if(titleNode.length) {
                            postSearchNode.insertAfter(titleNode);
                        } else {
                            postSearchNode.prependTo(newNode);
                        }
                        break;
                    case 'saved':
                        var savedNode = xmlUtils.$node('<searchName/>').text(settings.search.name);
                        if(titleNode.length) {
                            savedNode.insertAfter(titleNode);
                        } else {
                            savedNode.prependTo(newNode);
                        }
                        break;
                    case 'pivot':
                        throw new Error("Pivot search not implemented!");
                    default:
                        throw new Error("Unknown search type: " + settings.search.type);
                }
            }
        },
        _clearEmptyItems: function(itemOrder){
            return _(itemOrder).chain().map(function(row){
                return _(row).filter(function(panel){ return panel.length > 0; });
            }).filter(function(row){ return row.length > 0; }).value();
        },
        captureItemOrder: function(itemOrder) {
            itemOrder = this._clearEmptyItems(itemOrder);

            this._itemOrder = itemOrder;
            this._itemOrderMap = _.object(_.flatten(itemOrder), this.get$XML().find('row').children());

            this.validateItemOrder();

            if(console.DEBUG_ENABLED) {
                console.log('Captured dashboard item order: %o', JSON.stringify(this._itemOrder));
            }
        },
        updateItemOrder: function(){
            if (this._itemOrder && this.isXML()) {
                this.captureItemOrder(this._itemOrder);
            }
        },
        validateItemOrder: function() {
            _(this._itemOrderMap).each(function(node, id) {
                var nid = $(node).attr(id);
                if(!(nid === undefined || nid === id)) {
                    throw new Error('Invalid Item order. Expected node with ID ' + id + '. Instead saw ' + nid);
                }
            });
        },
        setItemOrder: function(itemOrder) {
            itemOrder = this._clearEmptyItems(itemOrder);
            var dfd;
            if(!this._itemOrder) {
                this.captureItemOrder(itemOrder);
            } else if(!_.isEqual(itemOrder, this._itemOrder)) {
                var $xml = this.get$XML(), itemMap = this._itemOrderMap;
                $xml.find('row').remove();

                _(itemOrder).each(function(r) {
                    var row = xmlUtils.$node('<row/>');
                    if(_(r).any(function(panel) { return panel.length > 1; })) {
                        var groups = _(r).map(function(p) { return p.length; }).join(',');
                        row.attr('grouping', groups);
                    }
                    _.chain(r).flatten().each(function(el) {
                        var item = itemMap[el];
                        $(item).find('script').remove();
                        row.append(item);
                    });
                    if(!row.children().length) {
                        if(console.DEBUG_ENABLED) {
                            console.log('Created empty row for items %o and map %o', r, itemMap);
                        }
                    }
                    $xml.find('dashboard,form').append(row);
                });
                this._itemOrder = itemOrder;
                this.set$XML($xml);
                console.log('Saving new item order', itemOrder, $xml[0]);
                dfd = this.save();
            } else {
                console.log('no changes');
                dfd = $.Deferred();
                dfd.resolve();
            }
            return dfd;
        },
        isEditable: function() {
            return this.isDashboard() || this.isForm();
        }
    });

    var DashboardRouter = Backbone.Router.extend({
        initialize: function(options) {
            this.model = options.model;
            this.app = options.app;
        },
        routes: {
            ':locale/app/:app/:page?*qs': 'view',
            ':locale/app/:app/:page': 'view',
            ':locale/app/:app/:page/?*qs': 'view',
            ':locale/app/:app/:page/': 'view',
            ':locale/app/:app/:page/edit?*qs': 'edit',
            ':locale/app/:app/:page/edit': 'edit',
            '*root/:locale/app/:app/:page?*qs': 'rootedView',
            '*root/:locale/app/:app/:page': 'rootedView',
            '*root/:locale/app/:app/:page/?*qs': 'rootedView',
            '*root/:locale/app/:app/:page/': 'rootedView',
            '*root/:locale/app/:app/:page/edit?*qs': 'rootedEdit',
            '*root/:locale/app/:app/:page/edit': 'rootedEdit',
            ':locale/manager/:app/:page?*qs': 'view',
            ':locale/manager/:app/:page': 'view',
            ':locale/manager/:app/:page/?*qs': 'view',
            ':locale/manager/:app/:page/': 'view',
            '*root/:locale/manager/:app/:page?*qs': 'rootedView',
            '*root/:locale/manager/:app/:page': 'rootedView',
            '*root/:locale/manager/:app/:page/?*qs': 'rootedView',
            '*root/:locale/manager/:app/:page/': 'rootedView',
            'dj/:app/:page/': 'splunkdj',
            'dj/:app/:page/?*qs': 'splunkdj',
            '*root/dj/:app/:page/': 'rootedSplunkdj',
            '*root/dj/:app/:page/?*qs': 'rootedSplunkdj'
        },
        view: function() {
            console.log('ROUTE: view');
            this.model.set('edit', false);
            this.page.apply(this, arguments);
        },
        edit: function() {
            console.log('ROUTE: edit');
            this.model.set('edit', true);
            this.page.apply(this, arguments);
        },
        rootedView: function(root) {
            this.app.set('root', root);
            this.view.apply(this, _.rest(arguments));
        },
        rootedEdit: function(root) {
            this.app.set('root', root);
            this.edit.apply(this, _.rest(arguments));
        },
        page: function(locale, app, page) {
            console.log('ROUTE: page(locale=%o, app=%o, page=%o)', locale, app, page);
            this.app.set({
                locale: locale,
                app: app,
                page: page
            });
            classicurl.fetch();
        },
        splunkdj: function(app, page) {
            this.page('en-US', app, page);
        },
        rootedSplunkdj: function(root) {
            this.app.set('root', root);
            this.splunkdj.apply(this, _.rest(arguments));
        },
        updateUrl: function() {
            var parts = [ this.app.get('root') || '', this.app.get('locale'), 'app', this.app.get('app'), this.app.get('page') ];
            if(this.model.get('edit')) {
                parts.push('edit');
            }
            var url = [ parts.join('/') ], params = classicurl.toURLEncodedQueryString();
            if(params.length) {
                url.push(params);
            }
            this.navigate(url.join('?'), { replace: false });
        }
    });

    // Singleton dashboard controller that sets up the router and holds a model representing the state of the dashboard
    var DashboardController = function() {
        this.readyDfd = $.Deferred();
        var model = this.model = new Backbone.Model();
        var collection = this.collection = {};
        
        // Set up the shared models/collections
        var app = this.model.app = sharedModels.get("app");
        var appLocal = this.model.appLocal = sharedModels.get("appLocal");
        var user = this.model.user = sharedModels.get("user");
        var times = this.collection.times = sharedModels.get("times");
        
        this.router = new DashboardRouter({
            model: this.model,
            app: app
        });
        routerUtils.start_backbone_history();
        var view = this.model.view = new DashboardModel();
        this.model.view.fetch({
            url: route.splunkdNS(app.get('root'), app.get('locale'), app.get('owner'), app.get('app'), [view.url, app.get('page')].join('/'))
        }).done(this._onViewModelLoad.bind(this));
        pdfUtils.isPdfServiceAvailable().always(function(available) {
            model.set('pdf_available', available);
        });
        this._onViewModelLoadDfd = $.Deferred();
        this.model.on('change:edit', this.router.updateUrl, this.router);
    };
    _.extend(DashboardController.prototype, Backbone.Events, {
        _onViewModelLoad: function() {
            var model = this.model;
            model.set('editable', model.view.isEditable());
            if(model.view.isXML()) {
                model.set('label', this.model.view.getLabel());
                model.set('description', this.model.view.getDescription());
                model.on('change:label change:description', function() {
                    model.view.setLabelAndDescription(model.get('label'), model.get('description'));
                    model.view.save();
                });
            }
            this._onViewModelLoadDfd.resolve(this.model.view);
        },
        onViewModelLoad: function(cb, scope) {
            this._onViewModelLoadDfd.done(cb.bind(scope || null));
        },
        getStateModel: function() {
            return this.model;
        },
        isEditMode: function() {
            return this.model.get('edit') === true;
        },
        onReady: function(callback) {
            $.when(this.readyDfd, this._onViewModelLoadDfd).then(callback);
        },
        ready: function() {
            this.readyDfd.resolve();
        },
        isReady: function(){
            return this.readyDfd.state() === "resolved";
        },
        fetchCollection: function() {
            this.reportsCollection = new Reports();
            this.reportsCollection.REPORTS_LIMIT = 150; 
            var appModel = this.model.app;
            var fetchParams = {
                data: {
                    count: this.reportsCollection.REPORTS_LIMIT, 
                    app: appModel.get('app'), 
                    owner: appModel.get('owner'), 
                    search: 'is_visible="1"'
                }
            };
            this.reportsCollection.initialFetchDfd = this.reportsCollection.fetch(fetchParams);
        }
    });

    var instance = new DashboardController();
    if(console.DEBUG_ENABLED) {
        window.Dashboard = instance;
    }
    return instance;
});

define('models/services/authorization/Role',
    [
         'models/SplunkDBase'
    ],
    function(SplunkDBaseModel) {
        return SplunkDBaseModel.extend({
            url: "authorization/roles",
            initialize: function() {
                SplunkDBaseModel.prototype.initialize.apply(this, arguments);
            }
        });
    }
);

define('collections/services/authorization/Roles',
    [
        'models/services/authorization/Role',
        'collections/SplunkDsBase'
    ],
    function(Model, BaseCollection) {
        return BaseCollection.extend({
            FREE_PAYLOAD: {
                "links": {
                    "create": "/services/authorization/roles/_new"
                },
                "generator": {
                },
                "entry": [
                    {
                        "name": "admin",
                        "links": {
                            "alternate": "/services/authorization/roles/admin",
                            "list": "/services/authorization/roles/admin",
                            "edit": "/services/authorization/roles/admin",
                            "remove": "/services/authorization/roles/admin"
                        },
                        "author": "system",
                        "acl": {
                            "app": "",
                            "can_list": true,
                            "can_write": true,
                            "modifiable": false,
                            "owner": "system",
                            "perms": {
                                "read": [
                                    "*"
                                ],
                                "write": [
                                    "*"
                                ]
                            },
                            "removable": false,
                            "sharing": "system"
                        },
                        "content": {
                            "capabilities": [],
                            "cumulativeRTSrchJobsQuota": 400,
                            "cumulativeSrchJobsQuota": 200,
                            "defaultApp": "",
                            "eai:acl": null,
                            "imported_capabilities": [],
                            "imported_roles": [],
                            "imported_rtSrchJobsQuota": 20,
                            "imported_srchDiskQuota": 500,
                            "imported_srchFilter": "",
                            "imported_srchIndexesAllowed": [
                                "*"
                            ],
                            "imported_srchIndexesDefault": [
                                "main"
                            ],
                            "imported_srchJobsQuota": 10,
                            "imported_srchTimeWin": -1,
                            "rtSrchJobsQuota": 100,
                            "srchDiskQuota": 10000,
                            "srchFilter": "*",
                            "srchIndexesAllowed": [
                                "*",
                                "_*"
                            ],
                            "srchIndexesDefault": [
                                "main",
                                "os"
                            ],
                            "srchJobsQuota": 50,
                            "srchTimeWin": 0
                        }
                    }
                ],
                "paging": {
                    "total": 1,
                    "perPage": 30,
                    "offset": 0
                },
                "messages": []
            },
            initialize: function() {
                BaseCollection.prototype.initialize.apply(this, arguments);
            },
            url: 'authorization/roles',
            model: Model
        });
    }
);

define('splunkjs/mvc/simplexml/mapper',['require','underscore','../mvc','backbone','util/console'],function(require){
    var _ = require('underscore'), mvc = require('../mvc'),
            Backbone = require('backbone'),
            console = require('util/console');

    var Mapper = function() {};
    _.extend(Mapper.prototype, {
        tagName: '#abstract',
        map: function() {
            // tbd in concrete implementation
        },
        getSearch: function(report, options) {
            var result; 
            if(report.entry.get('name')){
                console.log('Mapping Saved Search'); 
                result = {
                    type: 'saved',
                    name: report.entry.get('name', options)
                };
            }else{
                console.log('Mapping Inline Search'); 
                result = {
                    type: report.entry.content.get('display.general.search.type') || 'inline',
                    search: report.entry.content.get('search', options), 
                    earliest_time: report.entry.content.get('dispatch.earliest_time', options), 
                    latest_time: report.entry.content.get('dispatch.latest_time', options)
                };

                // When sending flattened XML to pdfgen, swap out postProcess with a full inline search
                if (options.flatten && result.type === 'postprocess') {
                    result.type = 'inline';
                    result.search = report.entry.content.get('fullSearch', options);
                }
            }
            return result; 
        },
        toXML: function(report, options) {
            options = options || { tokens: true };
            var result = {
                type: this.tagName,
                title: report.entry.content.get('display.general.title', options),
                search: this.getSearch(report, options),
                options: {},
                tags: {}
            };
            this.map(report.entry.content, result, options);
            if (result.options.fields){
                if(!result.tags.fields) {
                    result.tags.fields = result.options.fields;
                }
                result.options['fields'] = null;
            }
            return result;
        }
    });

    var MAPPERS = {};

    Mapper.register = function(type, cls) {
        MAPPERS[type] = cls;
    };

    Mapper.get = function(type) {
        var MapperClass = MAPPERS[type];
        if(!MapperClass) {
            throw new Error('No mapper for type ' + type);
        }
        return new MapperClass();
    };

    // copy the Backbone extend method
    Mapper.extend = Backbone.Model.extend;

    return Mapper;
});
define('models/DashboardReport',['require','jquery','underscore','models/Report','splunkjs/mvc/simplexml/controller','splunkjs/mvc/simplexml/mapper','util/console','splunkjs/mvc/tokenawaremodel'],function(require){
    var $ = require('jquery'), _ = require('underscore'),
        Report = require('models/Report'),
        Dashboard = require('splunkjs/mvc/simplexml/controller'),
        Mapper = require('splunkjs/mvc/simplexml/mapper'),
        console = require('util/console'),
        TokenAwareModel = require('splunkjs/mvc/tokenawaremodel');

    var DashboardReport = Report.extend({
        initialize: function() {
            Report.prototype.initialize.apply(this, arguments);
        },
        saveXML: function(options) {
            var id = this.entry.content.get('display.general.id');
            console.log('[%o] Saving Panel Element XML...', id);
            return Dashboard.model.view.updateElement(id, this.mapToXML(), options); 
        },
        mapToXML: function(options) {
            var type = this.entry.content.get('display.general.type'), sub = ['display', type, 'type'].join('.');
            if(this.entry.content.has(sub)) {
                type = [type, this.entry.content.get(sub)].join(':');
            }
            console.log('Looking up mapper for type ', type);
            var mapper = Mapper.get(type);
            console.log('Found mapper', mapper);
            return mapper.toXML(this, options);
        },
        deleteXML: function() {
            return Dashboard.model.view.deleteElement(this.entry.content.get('display.general.id'));
        },
        defaults: {
            'display.visualizations.charting.axisY.scale': 'linear',
            'display.visualizations.charting.axisX.scale': 'linear',
            'display.visualizations.charting.axisX.minimumNumber': '',
            'display.visualizations.charting.axisX.maximumNumber': '',
            'display.visualizations.charting.axisY.minimumNumber': '',
            'display.visualizations.charting.axisY.maximumNumber': '',
            'display.visualizations.charting.axisTitleX.text': '',
            'display.visualizations.charting.axisTitleY.text': '',
            'display.visualizations.charting.axisLabelsX.majorUnit': '',
            'display.visualizations.charting.axisLabelsY.majorUnit': '',
            'display.visualizations.charting.legend.placement': 'right',
            'display.visualizations.charting.legend.labelStyle.overflowMode': 'ellipsisMiddle',
            'display.visualizations.charting.chart.stackMode':	'default',
            'display.visualizations.charting.chart.nullValueMode': 'zero',
            'display.visualizations.charting.chart.rangeValues': '["0","30","70","100"]',
            'display.visualizations.charting.chart.style': 'shiny',
            'display.visualizations.charting.gaugeColors': [0x84E900,0xFFE800,0xBF3030],
            'display.prefs.events.count': '10',
            'display.prefs.statistics.count': '10'
        },
        validation: {
            'display.visualizations.charting.axisX.minimumNumber': [
                {
                    pattern: 'number',
                    msg: 'Please enter a number',
                    required: false
                },
                {
                    fn: 'validateXAxisExtremes',
                    required: false
                }
            ],
            'display.visualizations.charting.axisX.maximumNumber': [
                {
                    pattern: 'number',
                    msg: 'Please enter a number',
                    required: false
                },
                {
                    fn: 'validateXAxisExtremes',
                    required: false
                }
            ],
            'display.visualizations.charting.axisY.minimumNumber': [
                {
                    pattern: 'number',
                    msg: 'Please enter a number',
                    required: false
                },
                {
                    fn: 'validateYAxisExtremes',
                    required: false
                }
            ],
            'display.visualizations.charting.axisY.maximumNumber': [
                {
                    pattern: 'number',
                    msg: 'Please enter a number',
                    required: false
                },
                {
                    fn: 'validateYAxisExtremes',
                    required: false
                }
            ],
            'display.visualizations.charting.axisLabelsX.majorUnit': {
                pattern: 'number',
                min: Number.MIN_VALUE,
                msg: 'Please enter a positive number',
                required: false
            },
            'display.visualizations.charting.axisLabelsY.majorUnit': {
                pattern: 'number',
                min: Number.MIN_VALUE,
                msg: 'Please enter a positive number',
                required: false
            },
            'display.visualizations.charting.axisY.scale': {
                fn: 'validateYScaleAndStacking',
                required: false
            },
            'display.visualizations.charting.chart.stackMode': {
                fn: 'validateYScaleAndStacking',
                required: false
            },
            'display.visualizations.charting.chart.rangeValues': {
                fn: 'validateRangeValues',
                required: false
            },
            'display.prefs.events.count': {
                pattern: 'number',
                min: 1,
                msg: _('Rows Per Page must be a positive number.').t(),
                required: false
            },
            'display.prefs.statistics.count': {
                pattern: 'number',
                min: 1,
                msg: _('Rows Per Page must be a positive number.').t(),
                required: false
            }
        },

        validateXAxisExtremes: function(value, attr, computedState) {
            var min = parseFloat(computedState['display.visualizations.charting.axisX.minimumNumber']),
                max = parseFloat(computedState['display.visualizations.charting.axisX.maximumNumber']);
            if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                return 'The minimum value must be less than maximum value';
            }
        },

        validateYAxisExtremes: function(value, attr, computedState) {
            var min = parseFloat(computedState['display.visualizations.charting.axisY.minimumNumber']),
                max = parseFloat(computedState['display.visualizations.charting.axisY.maximumNumber']);

            if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                return 'The minimum value must be less than maximum value';
            }
        },

        validateYScaleAndStacking: function(value, attr, computedState) {
            var yAxisScale = computedState['display.visualizations.charting.axisY.scale'],
                stackMode = computedState['display.visualizations.charting.chart.stackMode'];

            if(yAxisScale === 'log' && stackMode !== 'default') {
                return 'Log scale and stacking cannot be enabled at the same time';
            }
        },

        validateRangeValues: function(value) {
            var ranges = _(value ? JSON.parse(value) : []).map(parseFloat);
            if(_(ranges).any(_.isNaN) || !value) {
                return 'All color ranges must be valid numbers';
            }

            var dedupedRanges = _.uniq(ranges),
                sortedRanges = $.extend([], ranges).sort(function(a, b) { return a - b; });

            if(!_.isEqual(ranges, dedupedRanges) || !_.isEqual(ranges, sortedRanges)) {
                return 'Color ranges must be entered from lowest to highest';
            }
        },

        attrToArray: function(attr) {
            var value = this.get(attr);
            if(!value){
                return [];
            }
            return _.values(JSON.parse(value));
        },

        rangesValuesToArray: function() {
            return this.attrToArray('display.visualizations.charting.chart.rangeValues');
        },

        gaugeColorsToArray: function() {
            return this.attrToArray('display.visualizations.charting.gaugeColors');
        }
    },{
        Entry: Report.Entry.extend({},{
            Content: TokenAwareModel.extend({ applyTokensByDefault: true })
        })
    });


    return DashboardReport;

});

define('util/moment/compactFromNow',['util/moment'], function(moment) {
    var round = Math.round;
    function formatCompactRelativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
                minutes = round(seconds / 60),
                hours = round(minutes / 60),
                days = round(hours / 24),
                years = round(days / 365),
                args = (seconds < 45 && ['s', seconds]) ||
                        (minutes === 1 && ['m']) ||
                        (minutes < 45 && ['mm', minutes]) ||
                        (hours === 1 && ['h']) ||
                        (hours < 22 && ['hh', hours]) ||
                        (days === 1 && ['d']) ||
                        (days <= 25 && ['dd', days]) ||
                        (days <= 45 && ['M']) ||
                        (days < 345 && ['MM', round(days / 30)]) ||
                        (years === 1 && ['y']) || ['yy', years];

        var string = args[0], number = args[1] || 1, isFuture = milliseconds > 0,
                output = (lang._compactRelativeTime || {})[string];
        if(output === undefined) {
            return lang.relativeTime(number, !!withoutSuffix, string, isFuture);
        }
        return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
    }

    moment.duration.fn.humanizeCompact = function(withSuffix) {
        var diff = +this, out = formatCompactRelativeTime(diff, !withSuffix, this.lang());
        if(withSuffix) {
            out = this.lang().pastFuture(diff, out);
        }
        return this.lang().postformat(out);
    };

    moment.fn.compactFromNow = function(noSuffix) {
        return moment.duration(this.diff(moment())).lang(this.lang()._abbr).humanizeCompact(!noSuffix);
    };

    return moment;

});

define('splunkjs/mvc/refreshtimeindicatorview',['require','exports','module','./mvc','./basesplunkview','util/moment','util/moment/compactFromNow','underscore'],function(require, exports, module) {
    var mvc = require('./mvc');
    var BaseSplunkView = require('./basesplunkview');
    var moment = require('util/moment');
    require('util/moment/compactFromNow');
    var _ = require('underscore');

    var timerCallbacks = {}, globalRefreshTimer;

    function _runCallbacks() {
        _(timerCallbacks).each(function(cb){
            cb();
        });
    }

    function removeTimerCallback(name) {
        delete timerCallbacks[name];
        if(_.isEmpty(timerCallbacks)) {
            clearInterval(globalRefreshTimer);
            globalRefreshTimer = null;
        }
    }

    function registerTimerCallback(name, cb, scope) {
        if(timerCallbacks[name]) {
            removeTimerCallback(name);
        }
        timerCallbacks[name] = _.bind(cb, scope);
        if(!globalRefreshTimer) {
            globalRefreshTimer = setInterval(_runCallbacks, 1000);
        }
    }

    var RefreshTimeIndicatorView = BaseSplunkView.extend({
        moduleId: module.id,
        
        className: 'splunk-timeindicator',
        configure: function() {
            // Silently rewrite the deprecated 'manager' setting if present
            if (this.options.manager) {
                this.options.managerid = this.options.manager;
            }
            
            BaseSplunkView.prototype.configure.apply(this, arguments);
        },
        initialize: function() {
            this.configure();
            this.bindToComponentSetting('managerid', this.onManagerChange, this);
            this.timer = _.uniqueId('timer_');
        },
        onManagerChange: function(managers, manager) {
            if(this.manager) {
                this.manager.off(null, null, this);
            }
            this.manager = manager;
            if(!manager) {
                return;
            }
            this.manager.on("search:start", this.clear, this);
            this.manager.on("search:progress", this.onSearchProgress, this);
            this.manager.on("search:done", this.onSearchProgress, this);
            this.manager.on("search:fail", this.clear, this);
            this.manager.on("search:cancelled", this.clear, this);
            manager.replayLastSearchEvent(this);
        },
        clear: function() {
            removeTimerCallback(this.timer);
            this.$el.html('&nbsp;');
        },
        updateRefreshTime: function() {
            if(this.refreshTime) {
                if(moment().diff(this.refreshTime) < 10000) {
                    this.$el.hide();
                } else {
                    this.$el.text(this.refreshTime.compactFromNow()).show();
                    this.$el.attr('title', _("Last refresh: ").t() + this.refreshTime.format('LLL'));
                }
            }
        },
        onSearchProgress: function(properties) {
            var content = (properties || {}).content || {};
            if(content.dispatchState === 'FAILED') {
                this.clear();
            } else if(content.dispatchState === 'PARSING' || content.dispatchState === 'QUEUED') {
                this.clear();
            } else if(content.dispatchState === 'RUNNING') {
                if(content.isRealTimeSearch) {
                    removeTimerCallback(this.timer);
                    this.$el.text(_("Real-time").t());
                } else {
                    this.clear();
                }
            } else if(content.dispatchState === 'DONE') {
                this.refreshTime = moment(this.manager.job.published());
                if(!this.refreshTime) {
                    this.clear();
                    return;
                }
                this.clear();
                this.updateRefreshTime();
                registerTimerCallback(this.timer, this.updateRefreshTime, this);
            }
        },
        render: function() {
            this.$el.html('&nbsp;');
            return this;
        },
        remove: function() {
            removeTimerCallback(this.timer);
            this.onManagerChange(null, null);
            return BaseSplunkView.prototype.remove.call(this);
        }
    });

    return RefreshTimeIndicatorView;
});

define('splunkjs/mvc/resultslinkview',['require','exports','module','jquery','underscore','splunk.util','splunk.window','models/Job','uri/route','views/shared/jobstatus/buttons/ExportResultsDialog','./basesplunkview','./mvc','./savedsearchmanager','./utils','./sharedmodels','splunk.util','./postprocessmanager'],function(require, exports, module) {

    var $ = require("jquery");
    var _ = require("underscore");
    var SplunkUtil = require("splunk.util");
    var SplunkWindow = require("splunk.window");
    var SearchJobModel = require("models/Job");
    var Route = require("uri/route");
    var ExportResultsDialog = require("views/shared/jobstatus/buttons/ExportResultsDialog");
    var BaseSplunkView = require("./basesplunkview");
    var mvc = require("./mvc");
    var SavedSearchManager = require("./savedsearchmanager");
    var Utils = require("./utils");
    var sharedModels = require('./sharedmodels');
    var util = require('splunk.util');
    var PostProcessSearchManager = require('./postprocessmanager');

    /**
     * "View results" link for dashboard panels
     * Options:
     *  - link.visible: the default visibility of each button (defaults to true)
     *  - link.openSearch.visible: whether the openSearch button is visible (defaults to link.visible)
     *  - link.openSearch.text: the label for the Open in Search button (defaults to "Open in Search")
     *  - link.openSearch.viewTarget: the target view to open the search in (defaults to "search")
     *  - link.openSearch.search: instead of passing the SID over to the target view use this search string to start a new search
     *  - link.openSearch.searchEarliestTime: the earliest_time for the new search (defaults to earliest_time of the manager's search)
     *  - link.openSearch.searchLatestTime: the latest_time for the new search (defaults to latest_time of the manager's search)
     *  - link.exportResults.visible: whether the exportResults button is visible (defaults to link.visible)
     *  - link.inspectSearch.visible: whether the inspectSearch button is visible (defaults to link.visible)
     */
    var ResultsLinkView = BaseSplunkView.extend({
        moduleId: module.id,
        configure: function() {
            // Silently rewrite the deprecated 'manager' setting if present
            if (this.options.manager) {
                this.options.managerid = this.options.manager;
            }
            
            BaseSplunkView.prototype.configure.apply(this, arguments);
        },
        initialize: function() {
            this.configure();
            
            this.bindToComponentSetting('managerid', this.onManagerChange, this);

            this.searchJobModel = new SearchJobModel();
            this.applicationModel = sharedModels.get("app");
            
            //so search/pivot icons re-render whenever panel switches between search/pivot
            this.listenTo(this.model.entry.content, 'change:search', _.bind(this.render, this)); 
        },
        onManagerChange: function(managers, manager) {
            if (this.manager) {
                this.manager.off(null, null, this);
                this.manager = null;
            }

            if (!manager) {
                return;
            }

            this.manager = manager;
            this.listenTo(manager, "search:start", this.onSearchStart);
            this.listenTo(manager, "search:done", this.onSearchDone);

            if (this.manager.job) {
                this.onSearchStart(this.manager.job);
            }
            
            this.manager.replayLastSearchEvent(this);
        },

        onSearchStart: function(jobInfo) {
            this.searchJobModel.set("id", jobInfo.sid);

            if (this.$pivotButton) {
                this.$pivotButton.off("click").on("click", this.openPivot.bind(this)).show(); 
            }
            if (this.$searchButton) {
                this.$searchButton.off("click").on("click", this.openSearch.bind(this)).show();
            }
            if (this.$exportButton) {
                if (this.manager instanceof PostProcessSearchManager) {
                    // Disable Export for post process
                    this.$exportButton.tooltip("destroy");
                    this.$exportButton.attr("title", _("Export - You cannot export results for post-process jobs.").t());
                    this.$exportButton.tooltip({ animation: false, container: "body" });
                    this.$exportButton.addClass("disabled");
                    this.$exportButton.off("click").on("click", function(e) { e.preventDefault(); }).show();
                } else {
                    this.$exportButton.addClass("disabled");
                    this.$exportButton.off("click").on("click", function(e) { e.preventDefault(); }).show();
                }
            }
            if (this.$inspectButton) {
                this.$inspectButton.off("click").on("click", this.inspectSearch.bind(this)).show();
            }
        },

        onSearchDone: function(properties) {
            this.searchJobModel.setFromSplunkD({ entry: [this.manager.job.state()] }); 
            if (this.$exportButton) {
                    if (this.manager instanceof PostProcessSearchManager) {
                        // Disable Export for post process
                        this.$exportButton.tooltip("destroy");
                        this.$exportButton.attr("title", _("Export - You cannot export results for post-process jobs.").t());
                        this.$exportButton.tooltip({ animation: false, container: "body" });
                        this.$exportButton.addClass("disabled");
                        this.$exportButton.off("click").on("click", function(e) { e.preventDefault(); }).show();
                    } else {
                        this.$exportButton.tooltip("destroy");
                        this.$exportButton.attr("title", _("Export").t());
                        this.$exportButton.tooltip({ animation: false, container: "body" });
                        this.$exportButton.removeClass("disabled");
                        this.$exportButton.off("click").on("click", this.exportResults.bind(this)).show();
                    }
            }
        },

        openSearch: function(e) {
            if (e) {
                e.preventDefault();
            }

            var options = this.options;
            var manager = this.manager;

            var params;
            var earliest;
            var latest;
            if (options["link.openSearch.search"]) {
                params = {
                    q: options["link.openSearch.search"]
                };
                earliest = options["link.openSearch.searchEarliestTime"];
                if (!earliest && manager.job.properties().earliestTime){
                    earliest = util.getEpochTimeFromISO(manager.job.properties().earliestTime);
                }
                else {
                    earliest = manager.search.get("earliest_time");
                }
                if (earliest != null) {
                    params.earliest = earliest;
                }
                latest = options["link.openSearch.searchLatestTime"];
                if (!latest && manager.job.properties().latestTime){
                    latest = util.getEpochTimeFromISO(manager.job.properties().latestTime);
                }
                else {
                    latest = manager.search.get("latest_time");
                }
                if (latest != null) {
                    params.latest = latest;
                }
            } else if (!options["link.openSearch.viewTarget"]) {
                params = {
                    sid: this.searchJobModel.get("id"),
                    q: manager.query.resolve()
                };
                if (manager instanceof SavedSearchManager){
                    params['s'] = manager.get('searchname');
                }
                earliest = manager.search.get("earliest_time");
                if (earliest != null) {
                    params.earliest = earliest;
                }
                latest = manager.search.get("latest_time");
                if (latest != null) {
                    params.latest = latest;
                }
            } else {
                params = {
                    sid: this.searchJobModel.get("id")
                };
            }

            var pageInfo = Utils.getPageInfo();
            var url = Route.page(pageInfo.root, pageInfo.locale, pageInfo.app, options["link.openSearch.viewTarget"] || "search", { data: params });

            window.open(url, "_blank");
        },

        exportResults: function(e) {
            if (e) {
                e.preventDefault();
            }

            var exportDialog = new ExportResultsDialog({
                model: {
                    searchJob: this.searchJobModel,
                    application: this.applicationModel, 
                    report: this.model
                }, 
                usePanelType: true
            });

            exportDialog.render().appendTo($("body"));
            exportDialog.show();
        },

        inspectSearch: function(e) {
            if (e) {
                e.preventDefault();
            }

            var pageInfo = Utils.getPageInfo();
            var url = Route.jobInspector(pageInfo.root, pageInfo.locale, pageInfo.app, this.searchJobModel.get("id"));

            SplunkWindow.open(url, "splunk_job_inspector", { width: 870, height: 560, menubar: false });
        },

        openPivot: function(e){
            if (e) {
                e.preventDefault();
            }
            var pageInfo = Utils.getPageInfo(), params, url;
            if(this.model.has('id')){
                //saved pivot 
                //URI API: app/search/pivot?s=<reportId>
                //example id: "/servicesNS/admin/simplexml/saved/searches/Report%20Pivot2"
                var id = this.model.get('id');
                params = { s : id };
                if(this.model.entry.content.has('dispatch.earliest_time')) {
                    params.earliest = this.model.entry.content.get('dispatch.earliest_time');
                    params.latedst = this.model.entry.content.get('dispatch.latest_time');
                }
                url = Route.pivot(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
                Utils.redirect(url, true);
            }else{
                //inline pivot 
                //URI API: app/search/pivot?q=<search string with pivot command>
                //example search: "| pivot Debugger RootObject_1 count(RootObject_1) AS "Count of RootObject_1" | stats count"
                var search = this.model.entry.content.get('search');
                params = { q : search };
                if(this.model.entry.content.has('dispatch.earliest_time')) {
                    params.earliest = this.model.entry.content.get('dispatch.earliest_time');
                    params.latest = this.model.entry.content.get('dispatch.latest_time');
                }
                url = Route.pivot(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
                Utils.redirect(url, true);
            }
        },

        render: function() {
            var template; 
            if(this.model.isPivotReport()){
                template = _.template(this.pivotTemplate);
            }else{
                template = _.template(this.template);
            }

            this.$el.html(template({ options: this.options }));

            if (this.resolveBooleanOptions("link.openPivot.visible", "link.visible", true)) {
                this.$pivotButton = this.$(".pivot-button").hide();
            } else {
                this.$(".pivot-button").remove();
            }

            if (this.resolveBooleanOptions("link.openSearch.visible", "link.visible", true)) {
                this.$searchButton = this.$(".search-button").hide();
            } else {
                this.$(".search-button").remove();
            }

            if (this.resolveBooleanOptions("link.exportResults.visible", "link.visible", true)) {
                this.$exportButton = this.$(".export-button").hide();
            } else {
                this.$(".export-button").remove();
            }

            if (this.resolveBooleanOptions("link.inspectSearch.visible", "link.visible", true)) {
                this.$inspectButton = this.$(".inspect-button").hide();
            } else {
                this.$(".inspect-button").remove();
            }

            if (this.$searchButton || this.$exportButton || this.$inspectButton) {
                this.$el.show();
            } else {
                this.$el.hide();
            }

            this.$("> a").tooltip({ animation: false, container: "body" });

            return this;
        },

        resolveBooleanOptions: function(/*optionName1, optionName2, ..., defaultValue*/) {
            var options = this.options;
            var value;
            for (var i = 0, l = arguments.length - 1; i < l; i++) {
                value = options[arguments[i]];
                if (value != null) {
                    return SplunkUtil.normalizeBoolean(value);
                }
            }
            return SplunkUtil.normalizeBoolean(arguments[arguments.length - 1]);
        },

        template: '\
            <a href="#search" class="search-button btn-pill" title="<%- options[\'link.openSearch.text\'] || _(\'Open in Search\').t() %>">\
                <i class="icon-search"></i>\
                <span class="hide-text"><%- options[\'link.openSearch.text\'] || _("Open in Search").t() %></span>\
            </a><a href="#export" class="export-button btn-pill" title="<%- _(\'Export - You can only export results for completed jobs.\').t() %>">\
                <i class="icon-export"></i>\
                <span class="hide-text"><%- _("Export").t() %></span>\
            </a><a href="#inspect" class="inspect-button btn-pill" title="<%- _(\'Inspect\').t() %>">\
                <i class="icon-info"></i>\
                <span class="hide-text"><%- _("Inspect").t() %></span>\
            </a>\
        ', 

        pivotTemplate: '\
            <a href="#pivot" class="pivot-button btn-pill" title="<%- _(\'Open in Pivot\').t() %>">\
                <i class="icon-pivot"></i>\
                <span class="hide-text"><%- _("Open in Pivot").t() %></span>\
            </a><a href="#export" class="export-button btn-pill" title="<%- _(\'Export\').t() %>">\
                <i class="icon-export"></i>\
                <span class="hide-text"><%- _("Export").t() %></span>\
            </a><a href="#inspect" class="inspect-button btn-pill" title="<%- _(\'Inspect\').t() %>">\
                <i class="icon-info"></i>\
                <span class="hide-text"><%- _("Inspect").t() %></span>\
            </a>\
        '
    });
    
    return ResultsLinkView;
});

/**
 * @author sfishel
 *
 * A custom sub-class of SyntheticRadio for toggling drilldown for a chart
 *
 * Manages the fact that enabling/disabling drilldown actually affects two charting attributes
 */

 define('views/shared/vizcontrols/custom_controls/DrilldownRadio',[
            'underscore',
            'jquery',
            'module',
            'views/shared/controls/SyntheticRadioControl',
            'splunk.util'
        ],
        function(
            _,
            $,
            module,
            SyntheticRadioControl,
            splunkUtils
        ) {

    return SyntheticRadioControl.extend({

        moduleId: module.id,

        initialize: function() {
            $.extend(this.options, {
                modelAttribute: 'display.visualizations.charting.drilldown',
                items: [
                    {
                        label: _("Yes").t(),
                        value: 'all'
                    },
                    {
                        label: _("No").t(),
                        value: 'none'
                    }
                ],
                save: false,
                elastic: true
            });
            SyntheticRadioControl.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/DrilldownRadioGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup',
            './DrilldownRadio'
        ],
        function(
            _,
            module,
            ControlGroup,
            DrilldownRadio
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            var control = new DrilldownRadio({ model: this.model });
            this.options.label = _("Drilldown").t();
            this.options.controls = [control];
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/StackModeControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            var items = [
                {
                    value: 'default',
                    icon: 'bar-beside',
                    tooltip: _("not stacked").t()
                },
                {
                    value: 'stacked',
                    icon: 'bar-stacked',
                    tooltip: _("stacked").t()
                }
            ];
            if(this.options.allowStacked100 !== false) {
                items.push({
                    value: 'stacked100',
                    icon: 'bar-stacked-100',
                    tooltip: _("stacked 100%").t()
                });
            }
            this.options.label = _("Stack Mode").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.chart.stackMode',
                model: this.model,
                className: 'btn-group',
                items: items
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/NullValueModeControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {

            this.options.label = _("Null Values").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.chart.nullValueMode',
                model: this.model,
                className: 'btn-group',
                items: [
                    {
                        value: 'gaps',
                        icon: 'missing-value-skipped',
                        tooltip: _("Gaps").t()
                    },
                    {
                        value: 'zero',
                        icon: 'missing-value-zero',
                        tooltip: _("Zero").t()
                    },
                    {
                        value: 'connect',
                        icon: 'missing-value-join',
                        tooltip: _("Connect").t()
                    }
                ]
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/GaugeStyleControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Style").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.chart.style',
                model: this.model,
                items: [
                    {
                        label: _("Minimal").t(),
                        value: 'minimal'
                    },
                    {
                        label: _("Shiny").t(),
                        value: 'shiny'
                    }
                ]
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/SingleValueBeforeLabelControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Before Label").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.singlevalue.beforeLabel',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/SingleValueAfterLabelControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("After Label").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.singlevalue.afterLabel',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/SingleValueUnderLabelControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Under Label").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.singlevalue.underLabel',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

/**
 * @author sfishel
 *
 * A custom sub-class of SyntheticRadio for toggling drilldown for a chart
 *
 * Manages the fact that enabling/disabling drilldown actually affects two charting attributes
 */

 define('views/shared/vizcontrols/custom_controls/MultiSeriesRadio',[
            'underscore',
            'jquery',
            'module',
            'views/shared/controls/ControlGroup',
            'splunk.util'
        ],
        function(
            _,
            $,
            module,
            ControlGroup,
            splunkUtils
        ) {

    return ControlGroup.extend({
        moduleId: module.id,
        initialize: function() {
            this.options.label = _("Multi-series Mode").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlClass = 'controls-halfblock';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.layout.splitSeries',
                model: this.model,
                items: [
                    { label: _('Yes').t(), value: '1' },
                    { label: _('No').t(), value: '0' }
                ],
                save: false,
                elastic: true
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/components/Statistics',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/controls/SyntheticSelectControl'
    ],
    function(_, module, Base, ControlGroup, SyntheticSelectControl) {
        return Base.extend({
            moduleId: module.id,
            // className: 'form-justified',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                //child views
                this.children.drillDown = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-thirdblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:"row", label:_("Row").t()},
                            {value:"cell", label:_("Cell").t()},
                            {value:"none", label:_("None").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.statistics.drilldown'
                    }
                });

                this.children.rowNumbers = new ControlGroup({
                    label: _("Row Numbers").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:"1", label:_("Yes").t()},
                            {value:"0", label:_("No").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.statistics.rowNumbers'
                    }
                });

                this.children.wrapResults = new ControlGroup({
                    label: _("Wrap Results").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:"1", label:_("Yes").t()},
                            {value:"0", label:_("No").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.statistics.wrap'
                    }
                });

                this.children.dataOverlay = new ControlGroup({
                    label: _("Data Overlay").t(),
                    controlType:'SyntheticSelect',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model,
                        menuWidth: "narrow",
                        items: [
                            {value: 'none', label: _("None").t()},
                            {value: 'heatmap', label: _("Heat map").t()},
                            {value: 'highlow', label: _("High and low values").t()}
                        ],
                        modelAttribute: 'display.statistics.overlay',
                        toggleClassName: "btn"
                    }
                });
                if (this.model.get('dashboard')){
                    this.children.count = new ControlGroup({
                        label: _("Rows Per Page").t(),
                        controlType:'Text',
                        controlClass: 'controls-block',
                        controlOptions: {
                            model: this.model,
                            menuWidth: "narrow",
                            modelAttribute: 'display.prefs.statistics.count'
                        }
                    });
                }
            },
            render: function() {
                this.$el.html("");
                this.$el.append(this.children.wrapResults.render().el);
                this.$el.append(this.children.rowNumbers.render().el);
                this.$el.append(this.children.drillDown.render().el);
                this.$el.append(this.children.dataOverlay.render().el);
                if (this.children.count){
                    this.$el.append(this.children.count.render().el);
                }

                return this;
            }
        });
    }
);

define('views/shared/vizcontrols/components/Events',
    [
        'underscore',
        'module',
        'views/Base',
        'views/shared/controls/ControlGroup'
    ],
    function(_, module, Base, ControlGroup) {
        return Base.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: <models.services.SavedSearch.entry.content>
             * }
             */
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.showEventType = this.options.showEventType === false ? false : true;
                if (this.showEventType) {
                    this.children.eventType = new ControlGroup({
                        label: _("Display").t(),
                        controlType:'SyntheticRadio',
                        controlClass: 'controls-thirdblock',
                        controlOptions: {
                            className: "btn-group",
                            items: [
                                { label: _("Raw").t(),  value: 'raw'  },
                                { label: _("List").t(), value: 'list' },
                                { label: _("Table").t(),value: 'table'}
                            ],
                            model: this.model,
                            modelAttribute: 'display.events.type'
                        }
                    });
                }
                this.children.rowNumbers = new ControlGroup({
                    label: _("Row Numbers").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:'1', label:_("Yes").t()},
                            {value:'0', label:_("No").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.rowNumbers'
                    }
                });
                this.children.wrapResultsList = new ControlGroup({
                    label: _("Wrap Results").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:'1', label:_("Yes").t()},
                            {value:'0', label:_("No").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.list.wrap'
                    }
                });
                this.children.wrapResultsTable = new ControlGroup({
                    label: _("Wrap Results").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:'1', label:_("Yes").t()},
                            {value:'0', label:_("No").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.table.wrap'
                    }
                });

                this.children.maxlines = new ControlGroup({
                    label: _("Max Lines").t(),
                    controlType:'SyntheticSelect',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model,
                        menuWidth: "narrow",
                        items: [
                            {value: '5', label: _("5 lines").t()},
                            {value: '10', label: _("10 lines").t()},
                            {value: '20', label: _("20 lines").t()},
                            {value: '50', label: _("50 lines").t()},
                            {value: '100', label: _("100 lines").t()},
                            {value: '200', label: _("200 lines").t()},
                            {value: '0', label: _("All lines").t()}
                        ],
                        modelAttribute: 'display.events.maxLines',
                        toggleClassName: "btn",
                        nearestValue: true
                    }
                });
                this.children.drilldownRaw = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticSelect',
                    controlClass: 'controls-block',
                    controlOptions: {
                        menuWidth: 'narrow',
                        toggleClassName: 'btn',
                        items: [
                            {value:"none", label:_("None").t()},
                            {value:"inner", label:_("Inner").t()},
                            {value:"outer", label:_("Outer").t()},
                            {value:"full", label:_("Full").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.raw.drilldown'
                    }
                });
                this.children.drilldownList = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticSelect',
                    controlClass: 'controls-block',
                    controlOptions: {
                        menuWidth: 'narrow',
                        toggleClassName: 'btn',
                        items: [
                            {value:"none", label:_("None").t()},
                            {value:"inner", label:_("Inner").t()},
                            {value:"outer", label:_("Outer").t()},
                            {value:"full", label:_("Full").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.list.drilldown'
                    }
                });
                this.children.drilldownTable = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticRadio',
                    controlClass: 'controls-halfblock',
                    controlOptions: {
                        className: "btn-group",
                        items: [
                            {value:'1', label:_("On").t()},
                            {value:'0', label:_("Off").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.table.drilldown'
                    }
                });
                if (this.model.get('dashboard')){
                    this.children.count = new ControlGroup({
                        label: _("Rows Per Page").t(),
                        controlType:'Text',
                        controlClass: 'controls-block',
                        controlOptions: {
                            model: this.model,
                            menuWidth: "narrow",
                            modelAttribute: 'display.prefs.events.count'
                        }
                    });
                }
                this.model.on('change:display.events.type', this.visibility, this);
                this.model.on('change:display.events.list.drilldown change:display.events.raw.drilldown', this.mediateDrilldown, this);
                this.model.on('change:display.events.list.wrap change:display.events.table.wrap', this.mediateWrap, this);
            },
            mediateDrilldown: function() {
                (this.model.get('display.events.type') === 'list') ?
                    this.model.set('display.events.raw.drilldown', this.model.get('display.events.list.drilldown')):
                    this.model.set('display.events.list.drilldown', this.model.get('display.events.raw.drilldown'));
            },
            mediateWrap: function() {
                (this.model.get('display.events.type') === 'list') ?
                    this.model.set('display.events.table.wrap', this.model.get('display.events.list.wrap')):
                    this.model.set('display.events.list.wrap', this.model.get('display.events.table.wrap'));
            },
            visibility: function() {
                switch(this.model.get('display.events.type')){
                    case 'list':
                        this.children.wrapResultsList.$el.show();
                        this.children.wrapResultsTable.$el.hide();
                        this.children.rowNumbers.$el.show();
                        this.children.drilldownList.$el.show();
                        this.children.drilldownRaw.$el.hide();
                        this.children.drilldownTable.$el.hide();
                        break;
                    case 'raw':
                        this.children.wrapResultsList.$el.hide();
                        this.children.wrapResultsTable.$el.hide();
                        this.children.rowNumbers.$el.hide();
                        this.children.drilldownList.$el.hide();
                        this.children.drilldownRaw.$el.show();
                        this.children.drilldownTable.$el.hide();
                        break;
                    case 'table':
                        this.children.wrapResultsList.$el.hide();
                        this.children.wrapResultsTable.$el.show();
                        this.children.rowNumbers.$el.show();
                        this.children.drilldownList.$el.hide();
                        this.children.drilldownRaw.$el.hide();
                        this.children.drilldownTable.$el.show();
                        break;
                    default:
                        break;
                }
            },
            render: function() {
                if (this.showEventType) {
                    this.$el.append(this.children.eventType.render().el);
                }
                this.$el.append(this.children.rowNumbers.render().el);
                this.$el.append(this.children.wrapResultsList.render().el);
                this.$el.append(this.children.wrapResultsTable.render().el);
                this.$el.append(this.children.maxlines.render().el);
                this.$el.append(this.children.drilldownList.render().el);
                this.$el.append(this.children.drilldownRaw.render().el);
                this.$el.append(this.children.drilldownTable.render().el);
                if (this.children.count){
                    this.$el.append(this.children.count.render().el);
                }
                this.visibility();
                return this;
            }
        });
    }
);

define('views/shared/vizcontrols/components/General',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/vizcontrols/custom_controls/DrilldownRadioGroup',
        'views/shared/vizcontrols/custom_controls/StackModeControlGroup',
        'views/shared/vizcontrols/custom_controls/NullValueModeControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeStyleControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueBeforeLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueAfterLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueUnderLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/MultiSeriesRadio',
        'views/shared/vizcontrols/components/Statistics',
        'views/shared/vizcontrols/components/Events'

    ],
    function(
        _, 
        $,
        module, 
        Base, 
        ControlGroup,
        DrilldownRadioGroup,
        StackModeControlGroup,
        NullValueModeControlGroup,
        GaugeStyleControlGroup,
        SingleValueBeforeLabelControlGroup,
        SingleValueAfterLabelControlGroup,
        SingleValueUnderLabelControlGroup,
        MultiSeriesRadio,
        Statistics, 
        Events
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form form-horizontal',
            vizToGeneralComponents: {
                line: ['nullValue', 'multiseries', 'drilldown'],
                area: ['stack', 'nullValue', 'multiseries', 'drilldown'],
                column: ['stack', 'multiseries', 'drilldown'],
                bar: ['stack','multiseries', 'drilldown'],
                pie: ['drilldown'],
                scatter: ['drilldown'], 
                radialGauge: ['style'],
                fillerGauge: ['style'],
                markerGauge: ['style'],
                single: ['before', 'after', 'under'],
                events: ['eventGroup'],
                statistics: ['statisticsGroup'] 
            },
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToGeneralComponents[this.model.get('viz_type')];
                if(_.indexOf(controls, 'stack')>-1)
                    this.children.stackMode = new StackModeControlGroup({
                        model: this.model,
                        controlClass: 'controls-thirdblock'
                    });
                if(_.indexOf(controls, 'nullValue')>-1)
                    this.children.nullValueMode = new NullValueModeControlGroup({
                        model: this.model,
                        controlClass: 'controls-thirdblock'
                    });
                if(_.indexOf(controls, 'multiseries')>-1)
                    this.children.multiSeries = new MultiSeriesRadio({ model: this.model });
                if(_.indexOf(controls, 'drilldown')>-1)
                    this.children.drilldown = new DrilldownRadioGroup({
                        model: this.model,
                        controlClass: 'controls-halfblock'
                    });
                if(_.indexOf(controls, 'style')>-1)
                    this.children.gaugeStyle = new GaugeStyleControlGroup({
                        model: this.model,
                        controlClass: 'controls-halfblock'
                    });
                if(_.indexOf(controls, 'before')>-1)
                    this.children.beforeLabel = new SingleValueBeforeLabelControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'after')>-1)
                    this.children.afterLabel = new SingleValueAfterLabelControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'under')>-1)
                    this.children.underLabel = new  SingleValueUnderLabelControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'eventGroup')>-1)
                    this.children.events = new Events({ model: this.model });
                if(_.indexOf(controls, 'statisticsGroup')>-1)
                    this.children.statistics = new Statistics({ model: this.model });
            },
            render: function() {
                this.children.stackMode && this.$el.append(this.children.stackMode.render().el);
                this.children.nullValueMode && this.$el.append(this.children.nullValueMode.render().el);
                this.children.multiSeries && this.$el.append(this.children.multiSeries.render().el);
                this.children.drilldown && this.$el.append(this.children.drilldown.render().el);
                this.children.gaugeStyle && this.$el.append(this.children.gaugeStyle.render().el);
                this.children.beforeLabel && this.$el.append(this.children.beforeLabel.render().el);
                this.children.afterLabel && this.$el.append(this.children.afterLabel.render().el);
                this.children.underLabel && this.$el.append(this.children.underLabel.render().el);
                this.children.events && this.$el.append(this.children.events.render().el);
                this.children.statistics && this.$el.append(this.children.statistics.render().el);
                return this;
            }
        });
    }
);

/**
 * @author sfishel
 *
 * A custom sub-class of ControlGroup for pivot config forms label inputs.
 *
 * Renders a text input control for the label with the model's default label as placeholder text.
 */

define('views/shared/vizcontrols/custom_controls/AxisTitleControlGroup',[
            'underscore',
            'module',
            'models/Base',
            'views/shared/controls/ControlGroup',
            'views/shared/controls/Control'
        ],
        function(
            _,
            module,
            BaseModel,
            ControlGroup,
            Control
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        /**
         * @constructor
         * @param options {Object} {
         *     model {Model} the model to operate on
         *     xAxis {Boolean} whether to operate on the x-axis as opposed to the y-axis, defaults to false
         * }
         */

        initialize: function() {
            this.axisTitleVisibilityAttr = this.options.xAxis ? 'display.visualizations.charting.axisTitleX.visibility' :
                                                                'display.visualizations.charting.axisTitleY.visibility';
            this.axisTitleTextAttr = this.options.xAxis ? 'display.visualizations.charting.axisTitleX.text' :
                                                          'display.visualizations.charting.axisTitleY.text';

            // we are simulating the experience of being able to set three possible title states: default, custom, or none
            // these do not map directly to visualization attributes, so we use an in-memory model to mediate
            this.titleStateModel = new BaseModel();
            this.setInitialTitleState();

            // store an in-memory copy of the most recent axis title text, since we might have to clear it to get the 'default' behavior
            this.axisTitleText = this.model.get(this.axisTitleTextAttr);

            this.options.label = _('Title').t();
            this.options.controlClass = 'controls-block';
            this.options.controls = [
                {
                    type: 'SyntheticSelect',
                    options: {
                        className: Control.prototype.className + ' input-prepend',
                        model: this.titleStateModel,
                        modelAttribute: 'state',
                        toggleClassName: 'btn',
                        menuWidth: 'narrow',
                        items: [
                            { value: 'default', label: _('Default').t() },
                            { value: 'custom', label: _('Custom').t() },
                            { value: 'none', label: _('None').t() }
                        ]
                    }
                },
                {
                    type: 'Text',
                    options: {
                        className: Control.prototype.className + ' input-prepend',
                        model: this.model,
                        modelAttribute: this.axisTitleTextAttr,
                        inputClassName: this.options.inputClassName
                    }
                }
            ];
            ControlGroup.prototype.initialize.call(this, this.options);
            // set up references to each control
            this.showHideControl = this.childList[0];
            this.labelControl = this.childList[1];

            this.titleStateModel.on('change:state', this.handleTitleState, this);
            this.model.on('change:' + this.axisTitleTextAttr, function() {
                // ignore this change event if the title state is in default mode
                // since the title text will have been artificially set to ''
                if(this.titleStateModel.get('state') !== 'default') {
                    this.axisTitleText = this.model.get(this.axisTitleTextAttr);
                }
            }, this);
        },

        setInitialTitleState: function() {
            if(this.model.get(this.axisTitleVisibilityAttr) === 'collapsed') {
                this.titleStateModel.set({ state: 'none' });
            }
            else if(this.model.get(this.axisTitleTextAttr)) {
                this.titleStateModel.set({ state: 'custom' });
            }
            else {
                this.titleStateModel.set({ state: 'default' });
            }
        },

        render: function() {
            ControlGroup.prototype.render.apply(this, arguments);
            this.handleTitleState();
            return this;
        },

        handleTitleState: function() {
            var state = this.titleStateModel.get('state'),
                setObject = {};

            if(state === 'none') {
                setObject[this.axisTitleVisibilityAttr] = 'collapsed';
                this.hideTitleTextInput();
            }
            else if(state === 'custom') {
                setObject[this.axisTitleVisibilityAttr] = 'visible';
                setObject[this.axisTitleTextAttr] = this.axisTitleText;
                this.showTitleTextInput();
            }
            else {
                // state == 'default'
                setObject[this.axisTitleVisibilityAttr] = 'visible';
                setObject[this.axisTitleTextAttr] = '';
                this.hideTitleTextInput();
            }
            this.model.set(setObject);
        },

        showTitleTextInput: function() {
            this.labelControl.insertAfter(this.showHideControl.$el);
            this.showHideControl.$el.addClass('input-prepend');
        },

        hideTitleTextInput: function() {
            this.labelControl.detach();
            this.showHideControl.$el.removeClass('input-prepend');
        }

    });

});

define('views/shared/vizcontrols/custom_controls/AxisScaleControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Scale").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: this.options.xAxis ? 'display.visualizations.charting.axisX.scale'
                                                   : 'display.visualizations.charting.axisY.scale',
                model: this.model,
                className: 'btn-group',
                items: [
                    {
                        label: _("Linear").t(),
                        value: 'linear'
                    },
                    {
                        label: _("Log").t(),
                        value: 'log'
                    }
                ]
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/AxisIntervalControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Interval").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: this.options.xAxis ? 'display.visualizations.charting.axisLabelsX.majorUnit'
                                                   : 'display.visualizations.charting.axisLabelsY.majorUnit',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/AxisMinValueControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Min Value").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: this.options.xAxis ? 'display.visualizations.charting.axisX.minimumNumber'
                                                   : 'display.visualizations.charting.axisY.minimumNumber',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/AxisMaxValueControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Max Value").t();
            this.options.controlType = 'Text';
            this.options.controlOptions = {
                modelAttribute: this.options.xAxis ? 'display.visualizations.charting.axisX.maximumNumber'
                                                   : 'display.visualizations.charting.axisY.maximumNumber',
                model: this.model,
                placeholder: _("optional").t(),
                inputClassName: 'input-medium'
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/LegendPlacementControlGroup',[
            'jquery',
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            $,
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Position").t();
            this.options.controlType = 'SyntheticSelect';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.legend.placement',
                model: this.model,
                popdownOptions: this.options.popdownOptions,
                items: [
                    {
                        label: _("Right").t(),
                        value: 'right'
                    },
                    {
                        label: _("Bottom").t(),
                        value: 'bottom'
                    },
                    {
                        label: _("Left").t(),
                        value: 'left'
                    },
                    {
                        label: _("Top").t(),
                        value: 'top'
                    },
                    {
                        label: _("None").t(),
                        value: 'none'
                    }
                ],
                toggleClassName: 'btn'
            };

            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/LegendTruncationControlGroup',[
            'underscore',
            'module',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            ControlGroup
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            this.options.label = _("Truncation").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.legend.labelStyle.overflowMode',
                model: this.model,
                className: 'btn-group',
                items: [
                    {
                        label: _("A...").t(),
                        value: 'ellipsisEnd',
                        tooltip: _("Truncate End").t()
                    },
                    {
                        label: _("A...Z").t(),
                        value: 'ellipsisMiddle',
                        tooltip: _("Truncate Middle").t()
                    },
                    {
                        label: _("...Z").t(),
                        value: 'ellipsisStart',
                        tooltip: _("Truncate Start").t()
                    }
                ]
            };
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/custom_controls/GaugeAutoRangesControlGroup',[
            'underscore',
            'module',
            'models/Base',
            'views/shared/controls/ControlGroup',
            'views/shared/controls/SyntheticRadioControl'
        ],
        function(
            _,
            module,
            BaseModel,
            ControlGroup,
            SyntheticRadioControl
        ) {

    var AutoRangesControl = SyntheticRadioControl.extend({

        initialize: function() {
            this.vizModel = this.options.vizModel;
            this.model.set({ autoMode: this.vizModel.gaugeIsInAutoMode() ? '1' : '0' });
            this.options.modelAttribute = 'autoMode';
            this.options.items = [
                {
                    label: _("Automatic").t(),
                    value: '1',
                    tooltip: _("Uses base search to set color ranges.").t()
                },
                {
                    label: _("Manual").t(),
                    value: '0',
                    tooltip: _("Manually set color ranges. Overrides search settings.").t()
                }
            ];
            this._ranges = '["0", "30", "70", "100"]';
            this._colors = '[0x84E900, 0xFFE800, 0xBF3030]';
            this.model.on('change:autoMode', this.handleModeChange, this);
            SyntheticRadioControl.prototype.initialize.call(this, this.options);
        },

        handleModeChange: function() {
            var goingToAutoMode = this.model.get('autoMode') === '1';
            // if going to auto mode, store the original values of the ranges and colors, then unset them
            if(goingToAutoMode) {
                this._ranges = this.vizModel.get('display.visualizations.charting.chart.rangeValues');
                this._colors = this.vizModel.get('display.visualizations.charting.gaugeColors');
                this.vizModel.set({
                    'display.visualizations.charting.chart.rangeValues': '',
                    'display.visualizations.charting.gaugeColors': ''
                });
            }
            // otherwise resurrect the old values
            else {
                this.vizModel.set({
                    'display.visualizations.charting.chart.rangeValues': this._ranges,
                    'display.visualizations.charting.gaugeColors': this._colors
                });
            }
        }

    });

    return ControlGroup.extend({

        moduleId: module.id,

        initialize: function() {
            var rangesControl = new AutoRangesControl({ model: this.model, vizModel: this.options.vizModel });
            this.options.controlClass = 'controls-halfblock';
            // this.options.label = _("Colors").t();
            this.options.controls = [rangesControl];
            ControlGroup.prototype.initialize.call(this, this.options);
        }

    });

});

define('views/shared/vizcontrols/components/XAxis',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/vizcontrols/custom_controls/AxisTitleControlGroup',
        'views/shared/vizcontrols/custom_controls/DrilldownRadioGroup',
        'views/shared/vizcontrols/custom_controls/AxisScaleControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisIntervalControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMinValueControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMaxValueControlGroup',
        'views/shared/vizcontrols/custom_controls/LegendPlacementControlGroup',
        'views/shared/vizcontrols/custom_controls/LegendTruncationControlGroup',
        'views/shared/vizcontrols/custom_controls/StackModeControlGroup',
        'views/shared/vizcontrols/custom_controls/NullValueModeControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeStyleControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeAutoRangesControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueBeforeLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueAfterLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueUnderLabelControlGroup'
    ],
    function(
        _, 
        $,
        module, 
        Base, 
        AxisTitleControlGroup,
        DrilldownRadioGroup,
        AxisScaleControlGroup,
        AxisIntervalControlGroup,
        AxisMinValueControlGroup,
        AxisMaxValueControlGroup,
        LegendPlacementControlGroup,
        LegendTruncationControlGroup,
        StackModeControlGroup,
        NullValueModeControlGroup,
        GaugeStyleControlGroup,
        GaugeAutoRangesControlGroup,
        SingleValueBeforeLabelControlGroup,
        SingleValueAfterLabelControlGroup,
        SingleValueUnderLabelControlGroup
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form form-horizontal',
            vizToGeneralComponents: {
                line: ['title'],
                area: ['title'],
                column: ['title'],
                bar:['title'],
                pie: [],
                scatter: ['title', 'scale', 'interval', 'min', 'max'], 
                radialGauge: [],
                fillerGauge: [],
                markerGauge: [],
                single: [],
                events: [],
                statistics: [] 
            },
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToGeneralComponents[this.model.get('viz_type')];

                if(_.indexOf(controls, 'title')>-1){ 
                    this.children.title = new AxisTitleControlGroup({
                        model: this.model,
                        xAxis: true
                    });
                }
            },
            render: function() {
                this.children.title && this.$el.append(this.children.title.render().el);
                return this;
            }
        });
    }
);

define('views/shared/vizcontrols/components/YAxis',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/vizcontrols/custom_controls/AxisTitleControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisScaleControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisIntervalControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMinValueControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMaxValueControlGroup'
    ],
    function(
        _, 
        $,
        module, 
        Base, 
        AxisTitleControlGroup,
        AxisScaleControlGroup,
        AxisIntervalControlGroup,
        AxisMinValueControlGroup,
        AxisMaxValueControlGroup
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form form-horizontal',
            vizToYAxisComponents: {
                line: ['title', 'scale', 'interval', 'min', 'max'],
                bar: ['title', 'scale', 'interval', 'min', 'max'],
                area: ['title', 'scale', 'interval', 'min', 'max'],
                column: ['title', 'scale', 'interval', 'min', 'max'],
                scatter: ['title', 'scale', 'interval', 'min', 'max'],
                pie: [],
                radialGauge: [],
                fillerGauge: [],
                markerGauge: [],
                single: [],
                events: [],
                statistics: [] 
            },
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToYAxisComponents[this.model.get('viz_type')];
                if(_.indexOf(controls, 'title')>-1){
                    this.children.title = new AxisTitleControlGroup({
                        className: 'y-axis-title control-group',
                        model: this.model,
                        xAxis: false
                    });
                }
                if(_.indexOf(controls, 'scale')>-1)
                    this.children.scale = new AxisScaleControlGroup({
                        model: this.model,
                        className: 'scale control-group',
                        controlClass: 'controls-halfblock'
                    });
                if(_.indexOf(controls, 'interval')>-1)
                    this.children.interval = new  AxisIntervalControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'min')>-1)
                    this.children.min = new AxisMinValueControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'max')>-1)
                    this.children.max = new AxisMaxValueControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });

                if(this.model.get('display.visualizations.charting.axisY.scale')=='log') {
                    this.children.interval.$el.hide();
                }
            },
            events: {
                'click .scale button': function(e){
                    this.intervalVal = this.intervalVal || this.model.get('display.visualizations.charting.axisLabelsY.majorUnit');
                    if(($(e.currentTarget).data('value'))=='log'){
                        this.children.interval.$el.hide();
                        this.model.set('display.visualizations.charting.axisLabelsY.majorUnit', '');
                    } else {   
                        this.children.interval.$el.show();
                        this.model.set('display.visualizations.charting.axisLabelsY.majorUnit', this.intervalVal);
                    }
                } 
            },
            render: function() {
                this.children.title && this.$el.append(this.children.title.render().el);
                this.children.scale && this.$el.append(this.children.scale.render().el);
                this.children.interval && this.$el.append(this.children.interval.render().el);
                this.children.min && this.$el.append(this.children.min.render().el);
                this.children.max && this.$el.append(this.children.max.render().el);
                return this;
            }
        });
    }
);

define('views/shared/vizcontrols/components/Legend',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/vizcontrols/custom_controls/DrilldownRadioGroup',
        'views/shared/vizcontrols/custom_controls/AxisScaleControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisIntervalControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMinValueControlGroup',
        'views/shared/vizcontrols/custom_controls/AxisMaxValueControlGroup',
        'views/shared/vizcontrols/custom_controls/LegendPlacementControlGroup',
        'views/shared/vizcontrols/custom_controls/LegendTruncationControlGroup',
        'views/shared/vizcontrols/custom_controls/StackModeControlGroup',
        'views/shared/vizcontrols/custom_controls/NullValueModeControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeStyleControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeAutoRangesControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueBeforeLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueAfterLabelControlGroup',
        'views/shared/vizcontrols/custom_controls/SingleValueUnderLabelControlGroup'
    ],
    function(
        _, 
        $,
        module, 
        Base, 
        ControlGroup,
        DrilldownRadioGroup,
        AxisScaleControlGroup,
        AxisIntervalControlGroup,
        AxisMinValueControlGroup,
        AxisMaxValueControlGroup,
        LegendPlacementControlGroup,
        LegendTruncationControlGroup,
        StackModeControlGroup,
        NullValueModeControlGroup,
        GaugeStyleControlGroup,
        GaugeAutoRangesControlGroup,
        SingleValueBeforeLabelControlGroup,
        SingleValueAfterLabelControlGroup,
        SingleValueUnderLabelControlGroup
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form form-horizontal',
            vizToLegendComponents: {
                line:    ['placement', 'truncation'],
                bar:     ['placement', 'truncation'],
                area:    ['placement', 'truncation'],
                column:  ['placement', 'truncation'],
                scatter: ['placement', 'truncation'],
                pie: [],
                radialGauge: [],
                fillerGauge: [],
                markerGauge: [],
                single: [],
                events: [],
                statistics: [] 
            },
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToLegendComponents[this.model.get('viz_type')];
                
                if(_.indexOf(controls, 'placement')>-1)
                    this.children.placement = new LegendPlacementControlGroup({
                        model: this.model,
                        controlClass: 'controls-block'
                    });
                if(_.indexOf(controls, 'truncation')>-1)
                    this.children.truncation = new LegendTruncationControlGroup({
                        model: this.model,
                        controlClass: 'controls-thirdblock'
                    });
            },
            render: function() {
                this.children.placement && this.$el.append(this.children.placement.render().el);
                this.children.truncation && this.$el.append(this.children.truncation.render().el);
                return this;
            }
        });
    }
);

define('views/shared/vizcontrols/components/color/ColorPicker',
    [
        'underscore',
        'jquery',
        'module',
        'views/shared/PopTart'
    ],
    function(_, $, module, PopTart){
        return PopTart.extend({
            moduleId: module.id,
            className: 'popdown-dialog color-picker-container',
            initialize: function() {
                PopTart.prototype.initialize.apply(this, arguments);
                this.clone = this.model.clone();
            },
            events: {
                'click .swatch': function(e) {
                    var hashPrefixedColor = $(e.currentTarget).data().color,
                        hexColor = '0x'+hashPrefixedColor.substring(1);
                        
                    this.clone.set({ 'color': hexColor });
                    this.$('.swatch-hex input').val(hashPrefixedColor.substring(1));
                    this.$('.big-swatch').css('background-color', hashPrefixedColor);
                    e.preventDefault();
                },
                'click .color-picker-apply': function(e) {
                    this.model.set({
                        'color': this.clone.get('color'),
                        'shadedcolor': this.options.shadeColor(this.clone.get('color').substring(2), -40)
                    });
                    this.model.trigger('color-picker-apply', this.options.index);
                    this.hide();
                    e.stopPropagation();
                },
                'click .color-picker-cancel': function(e) {
                    this.hide();
                    e.stopPropagation();
                },
                'keyup .hex-input': function(e) {
                    var colorStr = $(e.currentTarget).val();
                    
                    this.clone.set('color', '0x'+colorStr);
                    this.$('.big-swatch').css('background-color', '#'+colorStr);
                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(PopTart.prototype.template);
                this.$el.append(this._buttonTemplate);
                this.$('.popdown-dialog-body').addClass('color-picker-content');
                var $rangePickerContent = $('<div class="clearfix"></div>').appendTo(this.$('.popdown-dialog-body'));
                $rangePickerContent.append(this.compiledTemplate({
                    model: this.clone
                }));
            },
            template: '\
                <div class="swatches">\
                    <ul class="swatch-holder unstyled">\
                        <li class="swatch" data-color="#7e9f44" style="background-color: #7e9f44"></li>\
                        <li class="swatch" data-color="#ebe42d" style="background-color: #ebe42d"></li>\
                        <li class="swatch" data-color="#d13b3b" style="background-color: #d13b3b"></li>\
                        <li class="swatch" data-color="#6cb8ca" style="background-color: #6cb8ca"></li>\
                        <li class="swatch" data-color="#f7912c" style="background-color: #f7912c"></li>\
                        <li class="swatch" data-color="#956e96" style="background-color: #956e96"></li>\
                        <li class="swatch" data-color="#c2da8a" style="background-color: #c2da8a"></li>\
                        <li class="swatch" data-color="#fac61d" style="background-color: #fac61d"></li>\
                        <li class="swatch" data-color="#ebb7d0" style="background-color: #ebb7d0"></li>\
                        <li class="swatch" data-color="#324969" style="background-color: #324969"></li>\
                        <li class="swatch" data-color="#d85e3d" style="background-color: #d85e3d"></li>\
                        <li class="swatch" data-color="#a04558" style="background-color: #a04558"></li>\
                    </ul>\
                </div>\
                <div class="big-swatch" data-color="<%- model.get("color").substring(2) %>" style="background-color: #<%- model.get("color").substring(2) %>;"></div>\
                <div class="swatch-hex">\
                    <div class="input-prepend views-shared-controls-textcontrol">\
                        <span class="add-on">#</span>\
                        <input type="text" class="hex-input" value="<%-model.get("color").substring(2) %>">\
                    </div>\
                </div>\
            ',
            _buttonTemplate: '\
                <div class="color-picker-buttons clearfix">\
                    <a class="color-picker-cancel btn pull-left">'+_("Cancel").t()+'</a>\
                    <a class="color-picker-apply btn btn-primary pull-right"> '+_("Apply").t()+'</a>\
                </div>\
            '
        });
    }
);

define('views/shared/vizcontrols/components/color/Ranges',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/vizcontrols/components/color/ColorPicker',
        'collections/Base'
     ],
    function(_, $, module, Base, ColorPicker, BaseCollection) {
        return Base.extend({
            className: 'tab-pane clearfix',
            moduleId: module.id,
            palette: [
                '0x7e9f44', '0xebe42d', '0xd13b3b',
                '0x6cb8ca', '0xf7912c', '0x956e96',
                '0xc2da8a', '0xfac61d', '0xebb7d0',
                '0x324969', '0xd85e3d', '0xa04558'
            ],
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.collection = {};
                this.collection.rows = new BaseCollection();
                this.initRowsFromModel();

                this.collection.rows.on('add remove', this.render, this);
                this.collection.rows.on('color-picker-apply', this.render, this);
                this.collection.rows.on('change', this.syncModel, this);
            },
            initRowsFromModel: function() {
                var modelRanges = this.model.rangesValuesToArray(),
                    ranges = modelRanges.length > 0 ? modelRanges : ['0', '30', '70', '100'],
                    modelColors = this.model.deserializeGaugeColorArray(),
                    colors = modelColors.length > 0 ? modelColors : ['0x84E900', '0xFFE800', '0xBF3030'];

                _(ranges).each(function(range, i) {
                    this.collection.rows.push({
                        value: range,
                        nextValue: ranges[i+1],
                        color: !(i==0) ? colors[i-1]: void(0),
                        shadedcolor: !(i==0) ? this.shadeColor(colors[i-1], -40): void(0)
                    });
                },this);
            },
            syncModel: function() {
                this.model.set({
                    'display.visualizations.charting.chart.rangeValues': JSON.stringify(this.collection.rows.pluck('value')),
                    'display.visualizations.charting.gaugeColors': '['+_(this.collection.rows.pluck('color')).filter(function(color){
                        return !_.isUndefined(color);
                    }).join(',') + ']'
                });
            },
            events: {
                'click .add-color-range': function(e) {
                    var color = this.palette[Math.floor(Math.random()*12)];
                    this.collection.rows.push({
                        value: this.options.prepopulateNewRanges ? parseInt(this.collection.rows.last().get('value'), 10) * 2 : '',
                        nextValue: '',
                        color: color,
                        shadedcolor: this.shadeColor(color, -40)
                    });
                    e.stopPropagation();
                },
                'keyup .range-value': _.debounce(function(e) {
                    var $target = $(e.currentTarget),
                        index = $target.data().index;
                    this.collection.rows.at(index).set('value', $target.val());
                    var $next = this.$el.find('[data-prev="'+index+'"]');
                    if($next)
                        $next.text($target.val() + ' to');
                    e.preventDefault();
                },300),
                'click .color-square': function(e) {
                    var $target = $(e.currentTarget),
                        color = $target.css('background-color');
                    this.children.colorPicker = new ColorPicker({
                        model: this.collection.rows.at($target.parent().siblings('input').data().index),
                        shadeColor: this.shadeColor,
                        onHiddenRemove: true
                    });
                    $('body').append(this.children.colorPicker.render().el);
                    this.children.colorPicker.show($target);
                    e.preventDefault();
                },
                'click .remove-range': function(e) {
                    var index = $(e.currentTarget).siblings('input').data().index;
                    this.collection.rows.remove(this.collection.rows.at(index));
                    e.stopPropagation();
                }
            },
            shadeColor: function(color, shade) {
                var colorInt = parseInt(color, 16);
                var R = (colorInt & 0xFF0000) >> 16;
                var G = (colorInt & 0x00FF00) >> 8;
                var B = (colorInt & 0x0000FF) >> 0;
                R += Math.floor((shade/255)*R);
                G += Math.floor((shade/255)*G);
                B += Math.floor((shade/255)*B);
                return ((R<<16)+(G<<8)+B).toString(16);
            },
            render: function() {
                this.syncModel();
                this.$el.html(this.compiledTemplate({
                    _: _,
                    collection: this.collection.rows
                }));
                return this;
            },

            template: '\
                <div class="color-rows form-horizontal">\
                    <div class="from-color-group">\
                        <div class="control-group">\
                            <label class="lower-range-label control-label"><%- _("from").t() %></label>\
                            <div class="controls">\
                                <input class="first-row-lower range-value" value="<%- collection.at(0).get("value") %>" data-index=0 type="text">\
                            </div>\
                        </div>\
                    </div>\
                    <div class="to-color-group">\
                        <div class="control-group">\
                            <label class="control-label upper-range-label to-label"><%- _("to").t() %></label>\
                            <div class="controls right-input">\
                                <div class="input-append">\
                                    <input  class="first-row-upper range-value" value="<%- collection.at(1).get("value") %>" data-index=1 type="text">\
                                    <div class="add-on color-picker-add-on">\
                                        <div class="color-square" style="border-color: #<%- collection.at(1).get("shadedcolor")%>; background-color: #<%- collection.at(1).get("color").substring(2) %>;"></div>\
                                    </div>\
                                </div>\
                            </div>\
                        </div>\
                    </div>\
                    <% collection.each(function(model, i) { %>\
                        <% if(!(i==0 || i==1)) {%>\
                            <div class="extra-color-group">\
                                <div class="control-group">\
                                    <label class="upper-range-label control-label" data-prev="<%- i-1 %>"><%- collection.at(i-1).get("value")%>&nbsp;<span class="label-to"><%- _("to").t() %></span></label>\
                                    <div class="controls input-append">\
                                        <input  class="range-value" value="<%- model.get("value") %>" data-index=<%-i%> type="text">\
                                        <div class="add-on color-picker-add-on">\
                                            <div class="color-square" style="border-color: #<%- model.get("shadedcolor")%>; background-color: #<%- model.get("color").substring(2) %>;"></div>\
                                        </div>\
                                        <a class="remove-range btn-link"><i class="icon-x-circle"></i></a>\
                                    </div>\
                                </div>\
                            </div>\
                        <% } %>\
                    <% }); %>\
                </div>\
                <a href="#" class="add-color-range btn pull-right"> + <%- _("Add Range").t() %></a>\
            '
    });
});

define('views/shared/vizcontrols/components/color/Master',
    [
        'underscore',
        'jquery',
        'module',
        'splunk.util',
        'models/Base',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/vizcontrols/custom_controls/GaugeAutoRangesControlGroup',
        'views/shared/vizcontrols/components/color/Ranges'
    ],
    function(
        _,
        $,
        module,
        util,
        BaseModel,
        BaseView,
        ControlGroup,
        GaugeAutoRangesControlGroup,
        Ranges
    ){
        return BaseView.extend({
            moduleId: module.id,
            className: ' form form-horizontal',
            controlClass: 'controls-halfblock',
            vizToColorRangeComponents: {
                line: [],
                area: [],
                column: [],
                bar: [],
                pie: [],
                scatter: [],
                radialGauge: ['range'],
                fillerGauge: ['range'],
                markerGauge: ['range'],
                single: [],
                events: [],
                statistics: []
            },
            initialize: function(options) {
                BaseView.prototype.initialize.apply(this, arguments);
                var controls = this.vizToColorRangeComponents[this.model.get('viz_type')];
                if(_.indexOf(controls, 'range')>-1) {
                    // use a in-memory model to mediate the boolean auto/manual mode for gauge behavior since it is not a real viz attribute
                    this.autoModeModel = new BaseModel();
                    this.children.toggle = new GaugeAutoRangesControlGroup({ model: this.autoModeModel, vizModel: this.model });
                    this.autoModeModel.on('change:autoMode', this.updateRangesVisibility, this);
                }

                this.children.colorRanges = new Ranges({
                    model: this.model
                });
            },
            render: function() {
                this.children.toggle && this.$el.append(this.children.toggle.render().el);
                this.$el.append(this.children.colorRanges.render().el);
                this.updateRangesVisibility();
                return this;
            },
            remove: function() {
                this.autoModeModel.off(null, null, this);
            },
            updateRangesVisibility: function() {
                if(this.autoModeModel.get('autoMode') === '1') {
                    this.children.colorRanges.$el.hide();
                }
                else {
                    this.children.colorRanges.$el.show();
                }
            }
        });
    }
);

define('views/shared/vizcontrols/components/Master',
    [
        'underscore',
        'jquery',
        'module',
        'views/Base',
        'views/shared/FlashMessages',
        'views/shared/vizcontrols/components/General',
        'views/shared/vizcontrols/components/XAxis',
        'views/shared/vizcontrols/components/YAxis',
        'views/shared/vizcontrols/components/Legend',
        'views/shared/vizcontrols/components/color/Master'
    ],
    function(_, $, module, Base, FlashMessages, General, XAxis, YAxis, Legend, Ranges){
        return Base.extend({
            moduleId: module.id,
            className: 'tabbable tabs-left',
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                this.children.flashMessages = new FlashMessages({ model: this.model });
                this.type = this.model.get('viz_type');
                if(_.indexOf(this.model.components[this.type], 'gen')>-1)
                    this.children.general = new General({ model: this.model });
                if(_.indexOf(this.model.components[this.type], 'x')>-1)
                    this.children.xaxis = new XAxis({ model: this.model });
                if(_.indexOf(this.model.components[this.type], 'y')>-1)
                    this.children.yaxis = new YAxis({ model: this.model });
                if(_.indexOf(this.model.components[this.type], 'leg')>-1)
                    this.children.legend = new Legend({ model: this.model });
                if(_.indexOf(this.model.components[this.type], 'ranges')>-1)
                    this.children.ranges = new Ranges({ model: this.model });
            },
            events: {
                'click a[data-toggle]': function(e) {
                    var $target = $(e.currentTarget),
                        type = $target.data().type;
                    
                    _(this.children).each(function(child) { 
                        child.$el.hide(); 
                    },this);
                    this.children[type].$el.show(); 
                    this.$el.find('.nav > li').removeClass('active');
                    $target.parent().addClass('active');
                    
                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(_(this.template).template({
                    _: _,
                    tabs: this.model.components[this.type]
                }));
                this.$('.tab-content').prepend(this.children.flashMessages.render().el);
                _(this.children).each(function(child) { 
                    this.$('.tab-content').append(child.render().el);
                    child.$el.hide();
                },this);
                this.children.general.$el.show();
                return this;
            },
            template: '\
                <ul class="nav nav-tabs">\
                    <% if (_.indexOf(tabs, "gen")>-1) { %>\
                        <li class="active">\
                            <a href="#" data-toggle="tab" data-type="general"><%- _("General").t() %></a>\
                        </li>\
                    <% } %>\
                    <% if (_.indexOf(tabs, "x")>-1) { %>\
                        <li>\
                            <a href="#" data-toggle="tab" data-type="xaxis"><%- _("X-Axis").t() %></a>\
                        </li>\
                    <% } %>\
                    <% if (_.indexOf(tabs, "y")>-1) { %>\
                        <li>\
                            <a href="#" data-toggle="tab" data-type="yaxis"><%- _("Y-Axis").t() %></a>\
                        </li>\
                    <% } %>\
                    <% if (_.indexOf(tabs, "leg")>-1) { %>\
                        <li>\
                            <a href="#" data-toggle="tab" data-type="legend"><%- _("Legend").t() %></a>\
                        </li>\
                    <% } %>\
                    <% if (_.indexOf(tabs, "ranges")>-1) { %>\
                        <li>\
                            <a href="#" data-toggle="tab" data-type="ranges"><%- _("Color Ranges").t() %></a>\
                        </li>\
                    <% } %>\
                </ul>\
                <div class="tab-content"></div>\
            '
        });
    }
);

define('views/shared/vizcontrols/Format',
    [
        'underscore',
        'jquery',
        'module',
        'views/shared/PopTart',
        'views/shared/vizcontrols/components/Master'
    ],
    function(_, $, module, PopTart, Component){
        return PopTart.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         report: <models.Report>,
             *         state: <models.SplunkDBaseV2>
             *     },
             *     saveOnApply: <Boolean>
             *   }
             */

            options: {
                saveOnApply: false
            },

            initialize: function(options) {
                PopTart.prototype.initialize.apply(this, arguments);
                this.children.visualizationControls && this.children.visualizationControls.remove();
                this.children.visualizationControls = new Component({
                    model: this.model.visualization
                });
                $(window).on('keydown.' + this.cid, this.windowKeydown.bind(this));
            },
            events: {
                'click .viz-editor-apply': function(e) {
                    this.model.visualization.validate();
                    if(this.model.visualization.isValid()) {
                        this.model.report.entry.content.set($.extend({}, this.model.visualization.toJSON()));
                        if(this.options.saveOnApply) {
                            this.model.report.save();
                        }
                        this.hide();
                    }
                    e.preventDefault();
                },
                'click .viz-editor-cancel': function(e) {
                    this.hide();
                    e.preventDefault();
                }
            },
            windowKeydown: function (e) {
                var escapeKeyCode = 27,
                    enterKeyCode = 13;
                
                if (e.keyCode == escapeKeyCode)  {
                    $('.viz-editor-cancel').click(); 
                }
                
                if (e.keyCode == enterKeyCode)  {
                    $('.viz-editor-apply').click(); 
                }
            },
            remove: function() {
                $(window).off('keydown.' + this.cid);
                PopTart.prototype.remove.apply(this, arguments);
                return this;
            },
            render: function() {
                this.$el.html(PopTart.prototype.template);
                this.$el.append(this.template);
                this.$('.popdown-dialog-body').append(this.children.visualizationControls.render().el);
                // ghetto hack to override default padding on poptart ;_;
                this.$('.popdown-dialog-body').removeClass('popdown-dialog-padded');
                return this;
            },
            template: '\
                    <a class="viz-editor-cancel btn pull-left">'+_("Cancel").t()+'</a>\
                    <a class="viz-editor-apply btn btn-primary pull-right"> '+_("Apply").t()+'</a>\
            '
        });
    }
);

define('models/Visualization',
    [
        'jquery',
        'underscore',
        'models/Base',
        'splunk.util'
    ],
    function($, _, BaseModel, splunk_util) {
        return BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            components: {
                'single': ['gen'],
                'line': ['gen', 'x', 'y', 'leg'],
                'area': ['gen', 'x', 'y', 'leg'],
                'column': ['gen', 'x', 'y', 'leg'],
                'bar': ['gen', 'x', 'y', 'leg'],
                'pie': ['gen'],
                'scatter':  ['gen', 'x', 'y', 'leg'],
                'radialGauge': ['gen', 'ranges'],
                'fillerGauge': ['gen', 'ranges'],
                'markerGauge': ['gen', 'ranges'],
                'statistics': ['gen'],
                'events': ['gen']
            },
            defaults: {
                'display.visualizations.charting.axisY.scale': 'linear',
                'display.visualizations.charting.axisX.scale': 'linear',
                'display.visualizations.charting.axisX.minimumNumber': '',
                'display.visualizations.charting.axisX.maximumNumber': '',
                'display.visualizations.charting.axisY.minimumNumber': '',
                'display.visualizations.charting.axisY.maximumNumber': '',
                'display.visualizations.charting.axisTitleX.text': '',
                'display.visualizations.charting.axisTitleY.text': '',
                'display.visualizations.charting.axisLabelsX.majorUnit': '',
                'display.visualizations.charting.axisLabelsY.majorUnit': '',
                'display.visualizations.charting.legend.placement': 'right',
                'display.visualizations.charting.legend.labelStyle.overflowMode': 'ellipsisMiddle',
                'display.visualizations.charting.chart.stackMode':	'default',
                'display.visualizations.charting.chart.nullValueMode': 'zero',
                'display.visualizations.charting.chart.sliceCollapsingThreshold': 0.01,
                'display.visualizations.charting.chart.rangeValues': '["0","30","70","100"]',
                'display.visualizations.charting.chart.style': 'shiny',
                'display.visualizations.charting.gaugeColors': [0x84E900,0xFFE800,0xBF3030],
                'display.prefs.events.count': '10',
                'display.prefs.statistics.count': '10'
            },
            validation: {
                'display.visualizations.charting.axisX.minimumNumber': [
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    },
                    {
                        fn: 'validateXAxisExtremes',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisX.maximumNumber': [
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    },
                    {
                        fn: 'validateXAxisExtremes',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisY.minimumNumber': [
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    },
                    {
                        fn: 'validateYAxisExtremes',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisY.maximumNumber': [
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    },
                    {
                        fn: 'validateYAxisExtremes',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisLabelsX.majorUnit': [
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisLabelsY.majorUnit': [ 
                    {
                        fn: 'validateNumberOrAuto',
                        required: false
                    }
                ],
                'display.visualizations.charting.axisY.scale': {
                    fn: 'validateYScaleAndStacking',
                    required: false
                },
                'display.visualizations.charting.chart.stackMode': {
                    fn: 'validateYScaleAndStacking',
                    required: false
                },
                'display.visualizations.charting.chart.sliceCollapsingThreshold': {
                    pattern: 'number',
                    min: 0,
                    msg: _('Minimum Size must be a non-negative number.').t(),
                    required: false
                },
                'display.visualizations.charting.chart.rangeValues': {
                    fn: 'validateRangeValues',
                    required: false
                },
                'display.prefs.events.count': {
                    pattern: 'digits',
                    min: 1,
                    msg: _('Rows Per Page must be a positive number.').t(),
                    required: true
                },
                'display.prefs.statistics.count': {
                    pattern: 'digits',
                    min: 1,
                    msg: _('Rows Per Page must be a positive number.').t(),
                    required: true
                }
            },

            validateXAxisExtremes: function(value, attr, computedState) {
                var min = attr === 'display.visualizations.charting.axisX.minimumNumber' ? parseFloat(value) :
                                        parseFloat(computedState['display.visualizations.charting.axisX.minimumNumber']),
                    max = attr === 'display.visualizations.charting.axisX.maximumNumber' ? parseFloat(value) :
                                        parseFloat(computedState['display.visualizations.charting.axisX.maximumNumber']);

                if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                    return _('The X-Axis Min Value must be less than the Max Value.').t();
                }
            },

            validateYAxisExtremes: function(value, attr, computedState) {
                var min = attr === 'display.visualizations.charting.axisY.minimumNumber' ? parseFloat(value) :
                                        parseFloat(computedState['display.visualizations.charting.axisY.minimumNumber']),
                    max = attr === 'display.visualizations.charting.axisY.maximumNumber' ? parseFloat(value) :
                                        parseFloat(computedState['display.visualizations.charting.axisY.maximumNumber']);

                if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                    return _('The Y-Axis Min Value must be less than the Max Value.').t();
                }
            },

            validateYScaleAndStacking: function(value, attr, computedState) {
                var yAxisScale = attr === 'display.visualizations.charting.axisY.scale' ? value :
                                                computedState['display.visualizations.charting.axisY.scale'],
                    stackMode = attr === 'display.visualizations.charting.chart.stackMode' ? value :
                                                computedState['display.visualizations.charting.chart.stackMode'];

                if(yAxisScale === 'log' && stackMode !== 'default') {
                    return _('Log scale and stacking cannot be enabled at the same time.').t();
                }
            },

            validateRangeValues: function(value) {
                var ranges = _(value ? JSON.parse(value) : []).map(parseFloat);
                if(_(ranges).any(_.isNaN)) {
                    return _('All color ranges must be valid numbers.').t();
                }

                var dedupedRanges = _.uniq(ranges),
                    sortedRanges = $.extend([], ranges).sort(function(a, b) { return a - b; });

                if(!_.isEqual(ranges, dedupedRanges) || !_.isEqual(ranges, sortedRanges)) {
                    return _('Color ranges must be entered from lowest to highest.').t();
                }
            },
            
            validateNumberOrAuto: function(value, attr, computedState) {
                var num = parseFloat(value),
                    title;
                switch(attr){
                case 'display.visualizations.charting.axisLabelsX.majorUnit':
                    title = 'X-Axis Interval';
                    break;
                case 'display.visualizations.charting.axisLabelsY.majorUnit':
                    title = 'Y-Axis Interval';
                    break;
                case 'display.visualizations.charting.axisX.minimumNumber':
                    title = 'X-Axis Min Value';
                    break;
                case 'display.visualizations.charting.axisY.minimumNumber':
                    title = 'Y-Axis Min Value';
                    break;
                case 'display.visualizations.charting.axisX.maximumNumber':
                    title = 'X-Axis Max Value';
                    break;
                case 'display.visualizations.charting.axisY.maximumNumber':
                    title = 'Y-Axis Max Value';
                    break;
                default:
                    title = attr;
                    break;
                }
                if(attr === 'display.visualizations.charting.axisLabelsX.majorUnit' || attr === 'display.visualizations.charting.axisLabelsY.majorUnit'){
                    if(value && (_.isNaN(num) || num <= 0) && !value.match(/^(auto)$/)){
                        return splunk_util.sprintf(
                            _('%s must be a positive number or "auto".').t(),
                            title
                        );
                    }
                } else {
                    if(value && _.isNaN(num) && !value.match(/^(auto)$/)){
                        return splunk_util.sprintf(
                            _('%s must be a number or "auto".').t(),
                            title
                        );
                    }
                }
            },

            attrToArray: function(attr) {
                var value = this.get(attr);
                if(!value){
                    return [];
                }
                return _.values(JSON.parse(value));
            },

            rangesValuesToArray: function() {
                return this.attrToArray('display.visualizations.charting.chart.rangeValues');
            },

            deserializeGaugeColorArray: function() {
                var arrayStr =  this.get('display.visualizations.charting.gaugeColors');
                if(arrayStr.charAt(0) !== '[' || arrayStr.charAt(arrayStr.length - 1) !== ']') {
                    return false; //need to find a different way to bail 
                }
                return splunk_util.stringToFieldList(arrayStr.substring(1, arrayStr.length - 1));
            },

            // use auto mode only if ranges and colors are both not defined
            gaugeIsInAutoMode: function() {
                return !this.get('display.visualizations.charting.chart.rangeValues') && !this.get('display.visualizations.charting.gaugeColors');
            }
        },
        {
            CHARTING_ATTRS_FILTER: ['^display.visualizations.charting...*'],
            SINGLE_VALUE_ATTRS_FILTER: ['^singlevalue\..*']
        });
    }
);

define('views/shared/vizcontrols/Master',
    [
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/controls/SyntheticSelectControl',
        'views/shared/vizcontrols/Format',
        'models/services/search/IntentionsParser',
        'models/Visualization'
    ],
    function(_, Backbone, module, BaseView, SyntheticSelectControl, Format, IntentionsParser, VisualizationModel) {
        return BaseView.extend({
            moduleId: module.id,
            /**
             * @param {Object} options {
             *     model: {
             *         report: <models.Report>
             *     },
             *     visualizationTypes: [events &| statistics &| visualization],
             *     saveOnApply: <Boolean>
             * }
             */
            options: {
                saveOnApply: false
            },
            vizToAttrs: {
                line: {
                    'display.visualizations.charting.chart': 'line',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                area: {
                    'display.visualizations.charting.chart': 'area',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                column: {
                    'display.visualizations.charting.chart': 'column',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                bar: {
                    'display.visualizations.charting.chart': 'bar',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                pie: {
                    'display.visualizations.charting.chart': 'pie',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                scatter: {
                    'display.visualizations.charting.chart': 'scatter',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                radialGauge: {
                    'display.visualizations.charting.chart': 'radialGauge',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                fillerGauge: {
                    'display.visualizations.charting.chart': 'fillerGauge',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                markerGauge: {
                    'display.visualizations.charting.chart': 'markerGauge',
                    'display.visualizations.type': 'charting',
                    'display.general.type': 'visualizations'
                },
                single: {
                    'display.visualizations.type': 'singlevalue',
                    'display.general.type': 'visualizations'
                },
                events: {
                    'display.general.type': 'events'
                },
                statistics: {
                    'display.general.type': 'statistics'
                }
            },
            visualizationGroupings: {
                "events": {
                    label: 'g1',
                    items: [
                        { value: 'events', label: _("Events").t(), icon: 'list', description: _(" ").t() }
                    ]
                },
                 "statistics": {
                    label: 'g2',
                    items: [
                        {value: 'statistics', label: _("Statistics Table").t(), icon: 'table', description: _(" ").t() }
                    ]
                },
                "visualizations": {
                    label: 'g3',
                    items: [
                        { value: 'line', label: _("Line").t(), icon: 'chart-line', description: _(" ").t() },
                        { value: 'area', label: _("Area").t(), icon: 'chart-area', description: _(" ").t() },
                        { value: 'column', label: _("Column").t(), icon: 'chart-column', description: _(" ").t() },
                        { value: 'bar', label: _("Bar").t(), icon: 'chart-bar', description: _(" ").t() },
                        { value: 'pie', label: _("Pie").t(), icon: 'chart-pie', description: _(" ").t() },
                        { value: 'scatter', label: _("Scatter").t(), icon: 'chart-scatter', description: _(" ").t() },
                        { value: 'single', label: _("Single Value").t(), icon: 'single-value', description: _(" ").t() },
                        { value: 'radialGauge', label: _("Radial Gauge").t(), icon: 'gauge-radial', description: _(" ").t() },
                        { value: 'fillerGauge', label: _("Filler Gauge").t(), icon: 'gauge-filler', description: _(" ").t() },
                        { value: 'markerGauge', label: _("Marker Gauge").t(), icon: 'gauge-marker', description: _(" ").t() }
                    ]
                }
            },
            reportTree: {
                'match': {
                    'display.general.type': {
                        'visualizations' : {
                            'match': {
                                'display.visualizations.type': {
                                    'singlevalue': {
                                        'view': 'single'
                                    },
                                    'charting': {
                                        'match': {'display.visualizations.charting.chart': {
                                                'line': {  'view': 'line' },
                                                'area': { 'view': 'area' },
                                                'column': { 'view': 'column' },
                                                'bar': { 'view': 'bar' },
                                                'pie': { 'view': 'pie' },
                                                'scatter': { 'view': 'scatter' },
                                                'radialGauge': { 'view': 'radialGauge' },
                                                'fillerGauge': { 'view': 'fillerGauge' },
                                                'markerGauge': { 'view': 'markerGauge' }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        'statistics': {
                            'view': 'statistics'
                        },
                        'events': {
                            'view': 'events'
                        }
                    }
                }
            },
            commandToChartType: { 
                "timechart" : ["line", "area", "column"],
                //"chart" : ["column", "line", "area", "bar", "pie", "scatter", "radialGauge", "fillerGauge", "markerGauge"],
                "top" : ["column", "bar", "pie"],
                "rare" : ["column", "bar", "pie"]
            },
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                
                var defaults = {
                        bindToChangeOfSearch: true
                };
                this.options = $.extend(true, defaults, this.options);
                
                this.model.intentionsParser = new IntentionsParser();
                this.model.intentionsParser.on('change', this.render, this); 
                
                this.model.visualization = new VisualizationModel();
                this.model.visualization.set({dashboard: this.options.dashboard});
                this.setVisualizationFromReport();
                this.setSyntheticSelectGroups();

                this.model.report.entry.content.on('change:display.general.type', function(model, value, options) {
                    if(_.indexOf(this.options.vizTypes, value)>-1){
                        this.setVisualizationFromReport();
                        this.setSyntheticSelectGroups();
                        this.render();
                    }
                },this);

                this.model.visualization.on('change:viz_type', function() {
                    var viz = this.model.visualization.get('viz_type');
                    this.model.report.entry.content.set('viz_type', viz);
                    this.model.report.entry.content.set(this.vizToAttrs[viz]);
                    this.model.visualization.set(this.vizToAttrs[viz]);
                    if(this.options.saveOnApply) {
                        this.model.report.save();
                    }
                },this);

                this.model.report.entry.content.on('change:search change:id', this.updateVizTypeVisability, this);
               
                if(this.options.bindToChangeOfSearch) { 
                    this.model.report.entry.content.on('change:search', this.intentionsFetch, this); //simplexml
                }
                
                this.intentionsFetch();
            },
            intentionsFetch: function() {
                this.model.intentionsParser.fetch({
                    data: {
                        q: this.model.report.entry.content.get('search'),
                        app: this.model.application.get('app'),
                        owner: this.model.application.get('owner'),
                        parse_only: true
                    }
                });
            },
            updateVizTypeVisability: function() {
                if (!this.children.visualizationType || !this.model.visualization.get('dashboard')){
                    return;
                }

                if (this.model.report.isPivotReport() && !this.model.report.isNew()){
                    this.children.visualizationType.disable();
                    this.children.visualizationType.tooltip({animation:false, title:_('Edit visualization with the pivot tool.').t(), container: 'body'});
                } else {
                    this.children.visualizationType.enable();
                    this.children.visualizationType.tooltip('disable');
                }
            },
            setRecommendations: function() {
                if(this.model.intentionsParser.has('reportsSearch')) {
                    var reportsSearch = this.model.intentionsParser.get('reportsSearch'),
                        recommended = false;

                    if(reportsSearch) {
                        var reportingCommand = reportsSearch.replace(/\s{2,}/g, ':::').split(':::')[0];
                        if(reportingCommand) {
                            this.recommenedTypes = this.commandToChartType[reportingCommand];
                            if(this.recommenedTypes && !!this.recommenedTypes.length) {
                                _.chain(this.visualizationGroupings.visualizations.items).filter(function(item) {
                                    return this.recommenedTypes.indexOf(item.value) > -1;
                                },this)
                                .each(function(item) {
                                   this.children.visualizationType.$el.find("li a[data-value='"+item.value+"'] > span.link-description").text(_("Recommended").t());
                                   recommended = true;
                                },this)
                                .value();
                            }
                        }
                        recommended && this.children.visualizationType.$el.find("li a[data-value='statistics'] > span.link-description").text(_("Recommended").t());
                    } else {
                        this.children.visualizationType.$el.find("li a[data-value='events'] > span.link-description").text(_("Recommended").t());
                    }
                }
            },
            setVisualizationFromReport: function() {
                this.model.report.entry.content.unset('viz_type');
                this.model.visualization.set($.extend({}, this.model.report.entry.content.toJSON()));
                var viewObj = this.setVizType(this.reportTree), view;
                view = (viewObj && viewObj.view) ? viewObj.view : 'column';
                this.model.visualization.set('viz_type', view);
            },
            setSyntheticSelectGroups: function() {
                var vizDropdown = [], content = this.model.report.entry.content;
                this.children.visualizationType && this.children.visualizationType.remove();

                if(this.options.vizTypes){
                    _(this.options.vizTypes).each(function(value, idx) {
                        vizDropdown.push(this.visualizationGroupings[value]);
                    },this);
                }

                if(vizDropdown.length){
                    this.children.visualizationType = new SyntheticSelectControl({
                        model: this.model.visualization,
                        groupedItems: vizDropdown,
                        className: "btn-combo pull-left",
                        toggleClassName: 'btn-pill',
                        modelAttribute: 'viz_type',
                        menuClassName: 'viz-dropdown',
                        popdownOptions: {
                            attachDialogTo: 'body'
                        }
                    });
                }
            },
            setVizType: function(reportTree) {
                if (reportTree && reportTree.view){
                    return reportTree;
                } else if (reportTree && reportTree.match){
                    var match;
                    _(reportTree.match).each(function(v, k){
                       match = v[this.model.report.entry.content.get(k)];
                    }, this);
                    if (match) return this.setVizType(match);
                }
            },
            events: {
                'click .format': function(e) {
                    var $target = $(e.currentTarget);
                    this.setVisualizationFromReport(); 
                    this.children.format = new Format({
                        model: {
                            report: this.model.report,
                            visualization: this.model.visualization
                        },
                        onHiddenRemove: true,
                        saveOnApply: this.options.saveOnApply,
                        ignoreClasses: ['color-picker-container']
                    });
                    $('body').append(this.children.format.render().el);
                    this.children.format.show($target);
                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.empty();
                this.setSyntheticSelectGroups();
                this.children.visualizationType && this.$el.append(this.children.visualizationType.render().el);
                this.setRecommendations();
                this.updateVizTypeVisability();
                this.$el.append(this.template);
                return this;
            },
            template: '\
                <div class="btn-group pull-left">\
                    <a class="btn-pill popdown-toggle format" href="#">\
                        <i class="icon-paintbrush"/><span class="link-label">'+_("Format").t()+'</span><span class="caret"></span>\
                    </a>\
                </div>\
            '
        });
    }
);

define('views/shared/reportcontrols/details/History',
    [
        'module',
        'views/Base'
    ],
    function(module, Base) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.model.entry.on('change:updated', this.render, this);

            },
            render: function() {
                this.$el.html(this.compiledTemplate({model: this.model}));
                return this;
            },
            template: '\
                Created June 18, 2010. Modified <%- model.entry.get("updated") %>.\
            '
        });
    }
);

define('views/shared/reportcontrols/details/Creator',
    [
        'underscore',
        'module',
        'views/Base',
        'uri/route',
        'splunk.util'
    ],
    function(_, module, Base, route, splunkUtil) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.model.report.entry.content.on('change:display.page.pivot.dataModel', this.render, this);
            },
            render: function() {
                var createdByRoute,
                    createdByAnchor,
                    root = this.model.application.get('root'),
                    locale = this.model.application.get('locale'),
                    app = this.model.application.get('app');
                if (this.model.report.openInView() === 'pivot') {
                    createdByRoute = route.pivot(root, locale, app, {data: {s: this.model.report.id}});
                    createdByAnchor = '<a href="' + createdByRoute +'" >' + _("Pivot").t() +'</a>';
                } else {
                    createdByRoute = route.search(root, locale, app, {data: {s: this.model.report.id}});
                    createdByAnchor = '<a href="' + createdByRoute +'" >' + _("Search").t() +'</a>';
                }
                this.$el.html(this.compiledTemplate({
                    _: _,
                    splunkUtil: splunkUtil,
                    createdByAnchor: createdByAnchor
                }));
                return this;
            },
            template: '\
                <%= splunkUtil.sprintf(_("Created by %s.").t(), createdByAnchor) %>\
            '
        });
    }
);

define('views/shared/documentcontrols/details/App',
    [
        'module',
        'views/Base'
    ],
    function(module, Base) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                this.model.entry.acl.on('change:app', this.render, this);
            },
            render: function() {
                this.$el.html(this.compiledTemplate({model: this.model}));
                return this;
            },
            template: '\
                <%- model.entry.acl.get("app") %>\
            '
        });
    }
);

define('models/Cron',
    [
        'jquery',
        'underscore',
        'models/Base',
        'splunk.util'
    ],
    function($, _, BaseModel, splunkUtil) {
        var Cron = BaseModel.extend({
            initialize: function() {
                BaseModel.prototype.initialize.apply(this, arguments);
            },
            defaults: {
                minute: '0',
                hour: '6',
                dayOfMonth: '*',
                month: '*',
                dayOfWeek: "1",
                cronType: 'weekly',
                cron_schedule: '0 6 * * 1'
            },
            validation: {
                'cron_schedule': function(value, attr, computedState) {
                    var type = computedState['ui.type'] || 'scheduled';
                    if (type === 'scheduled' && computedState['cronType'] === 'custom') {
                        if (_.isUndefined(value) || $.trim(value).length === 0) {
                            return _("Custom cron is required").t();
                        }
                        if (!splunkUtil.validateCronString(value)) {
                            return _("Invalid cron").t();
                        }
                    }
                }
            },
            setCronType: function(options) {
                var minute = this.get('minute'),
                    hour = this.get('hour'),
                    dayOfMonth = this.get('dayOfMonth'),
                    month = this.get('month'),
                    dayOfWeek = this.get('dayOfWeek');

                //outliers
                if (month !== "*") {
                    this.set('cronType', Cron.CRON_TYPES.CUSTOM, options);
                    return;
                }

                //if day of week is not * then we to test for weekly
                if (/^[0-6]$/.test(dayOfWeek)) {
                    if (
                        (minute === '0') &&
                        (/^([0-9]|1[0-9]|2[0-3])$/.test(hour)) &&
                        (dayOfMonth === '*')
                    ) {
                        this.set('cronType', Cron.CRON_TYPES.WEEKLY, options);
                        return;
                    }
                } else if (dayOfWeek === '*') {
                    //test for monthly
                    if (/^([0-9]|[1-2][0-9]|3[0-1])$/.test(dayOfMonth)) {
                        if (
                            (/^([0-9]|1[0-9]|2[0-3])$/.test(hour)) &&
                            (minute === '0')
                        ) {
                            this.set('cronType', Cron.CRON_TYPES.MONTHLY, options);
                            return;
                        }
                    } else if (dayOfMonth === '*') {
                        //test for daily by testing hour
                        if (
                            (/^([0-9]|1[0-9]|2[0-3])$/.test(hour)) &&
                            (minute === '0')
                        ) {
                            this.set('cronType', Cron.CRON_TYPES.DAILY, options);
                            return;
                        } else if (
                            hour === '*' &&
                            (/^(0|15|30|45)$/.test(minute))
                        ) {
                            this.set('cronType', Cron.CRON_TYPES.HOURLY, options);
                            return;
                        }
                    }
                }

                this.set('cronType', Cron.CRON_TYPES.CUSTOM, options);
            },
            setDefaults: function() {
                switch (this.get('cronType')) {
                    case Cron.CRON_TYPES.HOURLY:
                        this.set('minute', '0');
                        break;
                    case Cron.CRON_TYPES.DAILY:
                        this.set('hour', '0');
                        break;
                    case Cron.CRON_TYPES.WEEKLY:
                        this.set({
                            dayOfWeek: '1',
                            hour: '0'
                        });
                        break;
                    case Cron.CRON_TYPES.MONTHLY:
                        this.set({
                            dayOfMonth: '1',
                            hour: '0'
                        });
                        break;
                }
            },
            getCronString: function() {
                var minute = this.get('minute'),
                    hour = this.get('hour'),
                    dayOfMonth = this.get('dayOfMonth'),
                    month = this.get('month'),
                    dayOfWeek = this.get('dayOfWeek'),
                    cron_schedule = this.get('cron_schedule'),
                    cronType = this.get('cronType');

                switch(cronType) {
                    case Cron.CRON_TYPES.HOURLY:
                        return minute + ' * * * *';
                    case Cron.CRON_TYPES.DAILY:
                        return '0 ' + hour +  ' * * *';
                    case Cron.CRON_TYPES.WEEKLY:
                        return '0 ' + hour +  ' * * ' + dayOfWeek;
                    case Cron.CRON_TYPES.MONTHLY:
                        return '0 ' + hour + ' ' + dayOfMonth + ' * *';
                    case Cron.CRON_TYPES.CUSTOM:
                        return cron_schedule;
                }
            },
            getDayOfWeekName: function() {
                return Cron.getDayOfWeekNameFromNum(parseInt(this.get('dayOfWeek'), 10));
            },
            getScheduleString: function() {
                switch(this.get('cronType')) {
                    case 'hourly':
                        return splunkUtil.sprintf(_("Hourly, at %s minutes past the hour.").t(), this.get('minute'));
                    case 'daily':
                        return splunkUtil.sprintf(_("Daily, at %s:00.").t(), this.get('hour'));
                    case 'weekly':
                        return splunkUtil.sprintf(_("Weekly, %(dayOfWeek)s at %(hour)s:00.").t(), { dayOfWeek: this.getDayOfWeekName(), hour: this.get('hour')});
                    case 'monthly':
                        return splunkUtil.sprintf(_("Monthly, on day %(dayOfMonth)s at %(hour)s:00.").t(), { dayOfMonth: this.get('dayOfMonth'), hour: this.get('hour')});
                    case 'custom':
                        return _("Cron Schedule.").t();
                }
            }
        },
        // class-level properties
        {
            createFromCronString: function(cronString) {
                var pieces = cronString.split(/\s+/);
                if(!pieces || pieces.length !== 5) {
                    throw splunkUtil.sprintf(_("Invalid cron string: %s").t(), cronString);
                }
                // the above only verifies that the time string had the correct format,
                // next make sure it also represents a valid time
                var cronModel = new Cron({
                    minute: pieces[0],
                    hour: pieces[1],
                    dayOfMonth: pieces[2],
                    month: pieces[3],
                    dayOfWeek: pieces[4],
                    cron_schedule: pieces.join(' ')
                });

                cronModel.setCronType();
                return cronModel;
            },
            getDayOfWeekNameFromNum: function(dayOfWeekNum) {
                switch(dayOfWeekNum) {
                    case 0:
                        return _("Sunday").t();
                    case 1:
                        return _("Monday").t();
                    case 2:
                        return _("Tuesday").t();
                    case 3:
                        return _("Wednesday").t();
                    case 4:
                        return _("Thursday").t();
                    case 5:
                        return _("Friday").t();
                    case 6:
                        return _("Saturday").t();
                    case 7:
                        return _("Sunday").t();
                }
            },
            CRON_TYPES : {
                HOURLY: 'hourly',
                DAILY: 'daily',
                WEEKLY: 'weekly',
                MONTHLY: 'monthly',
                CUSTOM: 'custom'
            }
        });

        return Cron;
    }
);

define('views/shared/reportcontrols/details/Schedule',
    [
        'underscore',
        'module',
        'views/Base',
        'models/Cron',
        'util/time_utils',
        'splunk.util'
    ],
    function(_, module, Base, Cron, time_utils, splunkUtil) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                var render = _.debounce(this.render, 0);
                this.model.entry.content.on('change:is_scheduled change:cron_schedule change:action.email change:action.script', render, this);
            },
            render: function() {
                var text = _('Not Applicable for Real-time Reports.').t();

                // Check if real-time
                if (!this.model.isRealTime()) {
                    if (this.model.entry.content.get("is_scheduled")) {
                        this.cronModel = Cron.createFromCronString(this.model.entry.content.get('cron_schedule'));
                        text = this.cronModel.getScheduleString();
                        if (this.model.entry.content.get("action.email") || this.model.entry.content.get("action.script")) {
                            text += splunkUtil.sprintf(_(' Actions: %s.').t(), this.model.getStringOfActions());
                        } else {
                            text += _(" No actions.").t();
                        }
                    } else {
                        text = _("Not scheduled.").t();
                    }
                }

                this.$el.html(text);
            }
        });
    }
);

/**
 *   views/shared/delegates/ModalTimerangePicker
 *
 *   Desc:
 *     Work in progress, a delegate view to handle timerange pickers located in modals. 
 *       It provides the animation from the content view to the timerangepicker view and back. 
 *
 *   @param {Object} (Optional) options An optional object literal having one settings.
 *
 *    Usage:
 *       var p = new ModalTimerangePicker({options})
 *
 *    Options:
 *        el: The dialog and toggle container. Recommend that this is the offset container for the dialog.
 *        $visArea: jQuery object that is the visible area.
 *        $slideArea: jQuery object that slides left and right.
 *        $contentWrapper: jQuery object that holds the original content with the activator.
 *        $timeRangePickerWrapper: jQuery object that holds the timerange picker.
 *        $modalParent: jQuery object of the modal.
 *        $timeRangePicker: jQuery object of the timerange picker.
 *        activateSelector: jQuery selector that when clicked causes the animation to the timerangepicker.
 *        backButtonSelector: jQuery selector that when clicked causes the animation from the timerangepicker
 *                               back to the content view without changing the timerange.
 *        SLIDE_ANIMATION_DURATION: (Optional) time to perform animation. Default 500.
 *
 *    Methods:
 *        showTimeRangePicker: animates to the timerangepicker from content view.
 *        closeTimeRangePicker: animates from the timerangepicker to content view.
 *                               Should be called when applied is triggered on the timerange model.
 *        onBeforePaneAnimation: sets up for animation (directly calling show should be avoided and should not be necessary).
 *        onAfterPaneAnimation: clean up after animation (directly calling show should be avoided and should not be necessary).
 */


define('views/shared/delegates/ModalTimerangePicker',[
    'jquery',
    'underscore',
    'views/shared/delegates/Base',
    'views/shared/delegates/PopdownDialog',
    'views/shared/Modal'
],function(
    $,
    _,
    DelegateBase,
    PopdownDialog,
    Modal
){
    return DelegateBase.extend({
        initialize: function(){
            var defaults = {
               SLIDE_ANIMATION_DURATION: 500
            };

            _.defaults(this.options, defaults);

            this.$visArea = this.options.$visArea;
            this.$slideArea = this.options.$slideArea;
            this.$contentWrapper = this.options.$contentWrapper;
            this.$timeRangePickerWrapper = this.options.$timeRangePickerWrapper;
            this.$modalParent = this.options.$modalParent;
            this.$timeRangePicker = this.options.$timeRangePicker;

            this.title = this.$(Modal.HEADER_TITLE_SELECTOR).html();

            this.events = {};
            this.events["click " + this.options.backButtonSelector] = "closeTimeRangePicker";
            this.events["click " + this.options.activateSelector] = "showTimeRangePicker";
            this.delegateEvents(this.events);

            this.$timeRangePicker.hide();

        },
        showTimeRangePicker: function () {

            var $from = this.$contentWrapper,
                $to = this.$timeRangePickerWrapper,
                anamateDistance = $from.width();

            this.onBeforePaneAnimation($from, $to);

            var toWidth = $to.width(),
                toHeight = $to.height();

            this.$modalParent.animate({
                width: toWidth,
                marginLeft: -(2 * anamateDistance/3)
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });
            this.$visArea.animate({
                height: toHeight
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION,
                complete: function() {
                    this.onAfterPaneAnimation($from, $to);
                }.bind(this)
            }, this);

            this.$slideArea.animate({
                marginLeft: -anamateDistance
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });

            this.$el.animate({
                width: toWidth
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select Time Range").t());
            this.$('.btn.back').show();
            this.$('.btn-primary').hide();
            this.$('.btn.cancel').hide();
        },
        closeTimeRangePicker: function () {
            var $from = this.$timeRangePickerWrapper,
                $to = this.$contentWrapper,
                anamateDistance = $to.width();

            this.onBeforePaneAnimation($from, $to);

            this.$modalParent.animate({
                width: anamateDistance,
                marginLeft: -(anamateDistance/2)
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });

            this.$visArea.animate({
                height: $to.height()
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION,
                complete: function() {
                    this.onAfterPaneAnimation($from, $to);
                }.bind(this)
            }, this);

            this.$slideArea.animate({
                marginLeft: 0
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });

            this.$el.animate({
                width: anamateDistance
            }, {
                duration: this.options.SLIDE_ANIMATION_DURATION
            });

            this.$(Modal.HEADER_TITLE_SELECTOR).html(this.title);
            this.$('.btn.back').hide();
            this.$('.btn-primary').show();
            this.$('.btn.cancel').show();
        },

        // sets up heights of the 'from' and 'to' elements for a smooth animation
        // during the animation, the slide area uses overflow=hidden to control visibility of the 'from' pane
        onBeforePaneAnimation: function($from, $to) {
            this.$visArea.css('overflow', 'hidden');
            this.$visArea.css({ height: $from.height() + 'px'});
            if($to === this.$timeRangePickerWrapper) {
                this.$timeRangePicker.show();
            }
            $to.css({ height: '', visibility: '' });
        },
        // undo the height manipulations that were applied to make a smooth animation
        // after the animation, the 'from' is hidden via display=none and the slide area has visible overflow
        // (this prevents vertical clipping of popup menus)
        onAfterPaneAnimation: function($from, $to) {
            if($from === this.$timeRangePickerWrapper) {
                this.$timeRangePicker.hide();
            }
            this.$visArea.css('overflow', '');
            this.$visArea.css({ height: ''});
            $from.css({ height: '2px', visibility : 'hidden'});
        }
    });
});

define('views/shared/ScheduleSentence',
    [
        'jquery',
        'module',
        'underscore',
        'views/Base',
        'views/shared/controls/ControlGroup',
        'views/shared/controls/SyntheticSelectControl'
    ],
    function(
        $,
        module,
        _,
        BaseView,
        ControlGroup,
        SyntheticSelectControl
    ){
        return BaseView.extend({
            moduleId: module.id,
            /**
            * @param {Object} options {
            *   model: {
            *       cron: <models.Cron>
            *   }
            *   {String} lineOneLabel: (Optional) Label for the first line of the sentence. Defalult is none.
            *   {String} lineTwoLabel: (Optional) Label for the second line of the sentence. Defalult is none.
            * }
            */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);

                var defaults = {
                    lineOneLabel: '',
                    lineTwoLabel: ''
                };

                _.defaults(this.options, defaults);

                var makeItems = function(num) {
                        var stringNum = num.toString(); 
                        return { label: stringNum, value: stringNum};
                    },
                    hourly = _.map(_.range(0, 46, 15), makeItems),
                    daily = _.map(_.range(24), function(num) { return { label: num + ':00', value: num.toString()}; }),
                    montly = _.map(_.range(1,32), makeItems);

                this.children.timeRange = new ControlGroup({
                    className: 'control-group',
                    controlType: 'SyntheticSelect',
                    controlClass: 'controls-block',
                    controlOptions: {
                        modelAttribute: 'cronType',
                        model: this.model.cron,
                        items: [
                            { label: _('Run every hour').t(), value: 'hourly' },
                            { label: _('Run every day').t(), value: 'daily' },
                            { label: _('Run every week').t(), value: 'weekly' },
                            { label: _('Run every month').t(), value: 'monthly' },
                            { label: _('Run on Cron Schedule').t(), value: 'custom' }
                        ],
                        save: false,
                        toggleClassName: 'btn',
                        labelPosition: 'outside',
                        elastic: true,
                        popdownOptions: $.extend(true, {}, this.options.popdownOptions)
                    },
                    label: this.options.lineOneLabel
                });

                this.children.hourly = new SyntheticSelectControl({
                    additionalClassNames: 'schedule_hourly',
                    modelAttribute: 'minute',
                    model: this.model.cron,
                    items: hourly,
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    elastic: true,
                    popdownOptions: $.extend(true, {}, this.options.popdownOptions)
                });

                this.children.weekly = new SyntheticSelectControl({
                    additionalClassNames: 'schedule_weekly',
                    modelAttribute: 'dayOfWeek',
                    model: this.model.cron,
                    items: [
                        { label: _('Monday').t(),    value: '1'  },
                        { label: _('Tuesday').t(),   value: '2'  },
                        { label: _('Wednesday').t(), value: '3'  },
                        { label: _('Thursday').t(),  value: '4'  },
                        { label: _('Friday').t(),    value: '5'  },
                        { label: _('Saturday').t(),  value: '6'  },
                        { label: _('Sunday').t(),    value: '0'  }
                    ],
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    popdownOptions: $.extend(true, {}, this.options.popdownOptions)
                });

                this.children.monthly = new SyntheticSelectControl({
                    menuClassName: 'dropdown-menu-short',
                    additionalClassNames: 'schedule_monthly',
                    modelAttribute: 'dayOfMonth',
                    model: this.model.cron,
                    items: montly,
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    popdownOptions: $.extend(true, {}, this.options.popdownOptions)
                });

                this.children.daily = new SyntheticSelectControl({
                    menuClassName: 'dropdown-menu-short',
                    additionalClassNames: 'schedule_daily',
                    modelAttribute: 'hour',
                    model: this.model.cron,
                    items: daily,
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    popdownOptions: $.extend(true, {}, this.options.popdownOptions)
                });

                this.children.scheduleOptions = new ControlGroup({
                    controls: [
                        this.children.hourly,
                        this.children.weekly,
                        this.children.monthly,
                        this.children.daily
                    ],
                    label: this.options.lineTwoLabel
                });

                this.children.cronSchedule = new ControlGroup({
                    controlType: 'Text',
                    controlClass: 'controls-block',
                    controlOptions: {
                        modelAttribute: 'cron_schedule',
                        model: this.model.cron
                    },
                    label: _('Cron Expression').t(),
                    help: _('e.g. 00 18 *** (every day at 6PM).').t()
                });

                this.model.cron.on('change:cronType', this.timeRangeToggle, this);
                this.model.cron.on('change:cronType', function() {
                    this.model.cron.setDefaults();
                }, this);
            },
            timeRangeToggle: function() {
                var $preLabel = this.children.scheduleOptions.$el.find('.pre_label'),
                    $hourPostLabel = this.children.scheduleOptions.$el.find('.hour_post_label'),
                    $weeklyPreLabel = this.children.scheduleOptions.$el.find('.weekly_pre_label'),
                    $monthlyPreLabel = this.children.scheduleOptions.$el.find('.monthly_pre_label'),
                    $dailyPreLabel = this.children.scheduleOptions.$el.find('.daily_pre_label'),
                    $customControls = this.$el.find('.custom_time');

                this.children.hourly.$el.hide();
                this.children.daily.$el.hide();
                this.children.weekly.$el.hide();
                this.children.monthly.$el.hide();

                $preLabel.hide();
                $hourPostLabel.hide();
                $weeklyPreLabel.hide();
                $monthlyPreLabel.hide();
                $dailyPreLabel.hide();

                $customControls.css('display', 'none');

                switch(this.model.cron.get('cronType')){
                    case 'hourly':
                        this.children.scheduleOptions.$el.show();
                        this.children.hourly.$el.css('display', '');
                        $preLabel.css('display', '');
                        $hourPostLabel.css('display', '');
                        break;
                    case 'daily':
                        this.children.scheduleOptions.$el.show();
                        this.children.daily.$el.css('display', '');
                        $preLabel.css('display', '');
                        break;
                    case 'weekly':
                        this.children.scheduleOptions.$el.show();
                        this.children.weekly.$el.css('display', '');
                        this.children.daily.$el.css('display', '');
                        $weeklyPreLabel.css('display', '');
                        $dailyPreLabel.css('display', '');
                        break;
                    case 'monthly':
                        this.children.scheduleOptions.$el.show();
                        this.children.monthly.$el.css('display', '');
                        this.children.daily.$el.css('display', '');
                        $monthlyPreLabel.css('display', '');
                        $dailyPreLabel.css('display', '');
                        break;
                    case 'custom':
                        $customControls.css('display', '');
                        this.children.scheduleOptions.$el.hide();
                        break;
                }
            },
            render: function()  {
                this.$el.append(this.children.timeRange.render().el);
                this.$el.append(this.children.scheduleOptions.render().el);

                this.children.scheduleOptions.$el.find('.schedule_hourly').before('<span class="pre_label">' + _("At ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_hourly').after('<span class="hour_post_label">' + _(" minutes past the hour").t() + '</span>');

                this.children.scheduleOptions.$el.find('.schedule_weekly').before('<span class="weekly_pre_label">' + _("On ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_weekly .btn').width('75px');

                this.children.scheduleOptions.$el.find('.schedule_monthly').before('<span class="monthly_pre_label">' + _("On day ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_monthly .btn').width('55px');

                this.children.scheduleOptions.$el.find('.schedule_daily').before('<span class="daily_pre_label">' + _(" at ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_daily .btn').width('50px');

                this.$el.append('<div class="custom_time"></div>');
                this.$el.find('.custom_time').append(this.children.cronSchedule.render().el);

                // inject help text?
                // this.$el.find('.earliest-timepicker .controls').append('<span class="help-block help-outside">help text scheduledSentence.js</span>');

                this.timeRangeToggle();

                return this;
            }
        });
     }
 );

define('views/shared/reportcontrols/dialogs/schedule_dialog/step1/Schedule',
        [
            'underscore',
            'module',
            'views/Base',
            'views/shared/Modal',
            'views/shared/ScheduleSentence',
            'views/shared/controls/ControlGroup'
        ],
        function(
            _,
            module,
            Base,
            Modal,
            ScheduleSentence,
            ControlGroup
        ) {
        return Base.extend({
            moduleId: module.id,
            className: 'form form-horizontal',
            /**
            * @param {Object} options {
            *        model: {
            *            application: <models.Application>
            *            inmem: <models.Report>,
            *            cron: <models.Cron>,
            *            timeRange: <models.TimeRange>,
            *            user: <models.services.admin.User>,
            *            appLocal: <models.services.AppLocal>
            *        },
            *        collection: <collections.services.data.ui.Times>
            * }
            **/
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);

                //views
                var checkBoxLabel = this.model.inmem.entry.content.get('disabled') ? _("Enable and Schedule Report").t() : _('Schedule Report').t();

                this.children.name = new ControlGroup({
                    controlType: 'Label',
                    controlOptions: {
                        modelAttribute: 'name',
                        model: this.model.inmem.entry
                    },
                    label: _('Report').t()
                });

                this.children.scheduleCheck = new ControlGroup({
                    controlType: 'SyntheticCheckbox',
                    controlOptions: {
                        modelAttribute: 'scheduled_and_enabled',
                        model: this.model.inmem
                    },
                    label: checkBoxLabel
                });

                this.children.scheduleSentence = new ScheduleSentence({
                    model: {
                        cron: this.model.cron
                    },
                    lineOneLabel: _('Schedule').t(),
                    popdownOptions: {
                        attachDialogTo: '.modal:visible',
                        scrollContainer: '.modal:visible .modal-body:visible'
                    }
                });

                //event listeners
                this.model.inmem.on('change:scheduled_and_enabled', this.isScheduledToggle, this);
                this.model.timeRange.on('applied', function() {
                    this.model.inmem.entry.content.set({
                        'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                        'dispatch.latest_time':this.model.timeRange.get('latest')
                    });
                    this.setLabel();
                }, this);
                this.model.timeRange.on('change:earliest_epoch change:latest_epoch change:earliest change:latest', _.debounce(this.setLabel, 0), this);

            },
            isScheduledToggle: function() {
                if(this.model.inmem.get('scheduled_and_enabled')) {
                    this.$('.modal-btn-primary').html(_("Next").t());
                    this.children.scheduleSentence.$el.show();
                    this.$('div.timerange').show();
                } else {
                    this.children.scheduleSentence.$el.hide();
                    this.$('div.timerange').hide();
                    this.$('.modal-btn-primary').html(_("Save").t());
                }
                this.model.inmem.trigger('togglePrimaryButton');
            },
            setLabel: function() {
                var timeLabel = this.model.timeRange.generateLabel(this.collection);
                this.$el.find("span.time-label").text(timeLabel);
            },
            render: function() {
                this.$el.append(this.children.name.render().el);
                if (this.model.inmem.entry.content.get('disabled')) {
                    this.$el.append('<div>' + _('This report is currently disabled.').t() + '</div>');
                }
                this.$el.append(this.children.scheduleCheck.render().el);
                this.$el.append(this.children.scheduleSentence.render().el);

                this.$el.append('<div class="timerange" style="display: block;"><label class="control-label">' + _('Time Range').t() + '</label></div>');
                this.$('div.timerange').append('<div class="controls"><a href="#" class="btn timerange-control"><span class="time-label"></span><span class="icon-triangle-right-small"></span></a></div>');
                this.setLabel();
                this.isScheduledToggle();
                return this;
            }
        });
    }
);

define('views/shared/reportcontrols/dialogs/schedule_dialog/step1/Master',
        [
            'underscore',
            'module',
            'views/Base',
            'views/shared/Modal',
            'views/shared/delegates/ModalTimerangePicker',
            'views/shared/reportcontrols/dialogs/schedule_dialog/step1/Schedule',
            'views/shared/timerangepicker/dialog/Master',
            'views/shared/FlashMessages'
        ],
        function(
            _,
            module,
            Base,
            Modal,
            TimeRangeDelegate,
            ScheduleView,
            TimeRangePickerDialog,
            FlashMessage
        ) {
        return Base.extend({
            moduleId: module.id,
            /**
            * @param {Object} options {
            *        model: {
            *            application: <models.Application>
            *            inmem: <models.Report>,
            *            cron: <models.Cron>,
            *            timeRange: <models.TimeRange>,
            *            user: <models.services.admin.User>,
            *            appLocal: <models.services.AppLocal>
            *        },
            *        collection: <collections.services.data.ui.Times>
            * }
            **/
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);

                //views
                this.children.flashMessage = new FlashMessage({ model: this.model.cron });

                this.children.scheduleView = new ScheduleView({
                    model: {
                        application: this.model.application,
                        inmem: this.model.inmem,
                        cron: this.model.cron,
                        timeRange: this.model.timeRange,
                        user: this.model.user,
                        appLocal: this.model.appLocal
                    },
                    collection: this.collection
                });


                this.children.timeRangePickerView = new TimeRangePickerDialog({
                    model: {
                        timeRange: this.model.timeRange,
                        user: this.model.user,
                        appLocal: this.model.appLocal,
                        application: this.model.application
                    },
                    collection: this.collection,
                    showPresetsRealTime:false,
                    showCustomRealTime:false,
                    showCustomDate:false,
                    showCustomDateTime:false,
                    showPresetsAllTime:true,
                    enableCustomAdvancedRealTime:false
                });

                this.model.timeRange.on('applied', function() {
                    this.timeRangeDelegate.closeTimeRangePicker();
                }, this);

                this.model.inmem.on('togglePrimaryButton', this.togglePrimaryButton, this);
            },
            events: {
                'click .modal-btn-primary' : function(e) {
                    if(this.model.inmem.get('scheduled_and_enabled')) {
                        this.model.inmem.trigger('next');
                    } else {
                        this.model.inmem.entry.content.set('is_scheduled', 0);
                        this.model.inmem.save({}, {
                            success: function(model, response){
                                this.model.inmem.trigger('saveSuccessNotScheduled');
                            }.bind(this)
                        });
                    }
                    e.preventDefault();
                }
            },
            togglePrimaryButton: function() {
                if(this.model.inmem.get('scheduled_and_enabled')) {
                    this.$('.modal-btn-primary').html(_("Next").t());
                } else {
                    this.$('.modal-btn-primary').html(_("Save").t());
                }
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());

                this.$(Modal.BODY_SELECTOR).remove();

                this.$(Modal.FOOTER_SELECTOR).before(
                    '<div class="vis-area">' +
                        '<div class="slide-area">' +
                            '<div class="content-wrapper schedule-wrapper">' +
                                '<div class="' + Modal.BODY_CLASS + '" >' +
                                '</div>' +
                            '</div>' +
                            '<div class="timerange-picker-wrapper">' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );

                this.$visArea = this.$('.vis-area').eq(0);
                this.$slideArea = this.$('.slide-area').eq(0);
                this.$scheduleWrapper = this.$('.schedule-wrapper').eq(0);
                this.$timeRangePickerWrapper = this.$('.timerange-picker-wrapper').eq(0);
                this.$modalParent = $('.schedule-modal').eq(0);

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);
                this.$(Modal.BODY_SELECTOR).append(this.children.scheduleView.render().el);

                this.$timeRangePickerWrapper.append(this.children.timeRangePickerView.render().el);

                this.timeRangeDelegate = new TimeRangeDelegate({
                    el: this.el,
                    $visArea: this.$visArea,
                    $slideArea: this.$slideArea,
                    $contentWrapper: this.$scheduleWrapper,
                    $timeRangePickerWrapper: this.$timeRangePickerWrapper,
                    $modalParent: this.$modalParent,
                    $timeRangePicker: this.children.timeRangePickerView.$el,
                    activateSelector: 'a.timerange-control',
                    backButtonSelector: 'a.btn.back'
                });

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _('Save').t() + '</a>');
                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back modal-btn-back pull-left">' + _('Back').t() + '</a>');
                this.$('.btn.back').hide();

                this.togglePrimaryButton();

                return this;
            }
        });
    }
);

define('views/shared/reportcontrols/dialogs/schedule_dialog/Step2',
        [
            'underscore',
            'module',
            'views/Base',
            'views/shared/Modal',
            'views/shared/controls/ControlGroup',
            'views/shared/FlashMessages',
            'splunk.util',
            'uri/route',
            'util/console'
        ],
        function(
            _,
            module,
            Base,
            Modal,
            ControlGroup,
            FlashMessage,
            splunkUtil,
            route,
            console
        )
        {
        return Base.extend({
            moduleId: module.id,
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);

                //views
                this.children.flashMessage = new FlashMessage({ model: this.model.inmem });

                // TODO: 'Remove if statement after all consumers pass the appLocal and application model'
                var configEmailHelpLink = "http://docs.splunk.com/";
                if (this.model.appLocal && this.model.application) {
                    configEmailHelpLink = route.docHelp(
                        this.model.application.get("root"),
                        this.model.application.get("locale"),
                        'learnmore.alert.email'
                    );
                } else {
                    console.warn("The schedule dialog step 2 view needs the AppLocal and Application model passed to it");
                }

                this.children.sendEmailBox = new ControlGroup({
                    controlType: 'SyntheticCheckbox',
                    controlOptions: {
                        modelAttribute: 'action.email',
                        model: this.model.inmem.entry.content
                    },
                    label: _('Send Email').t(),
                    help: splunkUtil.sprintf(_('Email must be configured in System&nbsp;Settings > Alert&nbsp;Email&nbsp;Settings. %s').t(), ' <a href="' + configEmailHelpLink + '" target="_blank">' + _("Learn More").t() + ' <i class="icon-external"></i></a>')
                });

                this.children.emailSubject = new ControlGroup({
                    controlType: 'Text',
                    controlOptions: {
                        modelAttribute: 'action.email.subject',
                        model: this.model.inmem.entry.content,
                        placeholder: _('Splunk Alert: $name$').t()
                    },
                    label: _('Subject').t()
                });

                this.children.emailAddresses = new ControlGroup({
                    controlType: 'Textarea',
                    controlOptions: {
                        modelAttribute: 'action.email.to',
                        model: this.model.inmem.entry.content
                    },
                    label: _('Email Addresses').t(),
                    help: _('Comma separated list.').t()
                });

                this.children.emailResultsFormat = new ControlGroup({
                    controlType: 'SyntheticRadio',
                    controlOptions: {
                        modelAttribute: 'ui_include_results',
                        model: this.model.inmem,
                        items: [
                            { label: _('None').t(), value: 'none' },
                            { label: _('Inline').t(), value: 'inline' },
                            { label: _('CSV').t(), value: 'csv' },
                            { label: _('PDF').t(), value: 'pdf' }
                        ],
                        elastic: true
                    },
                    label: _('Include results').t()
                });

                this.children.runScriptBox = new ControlGroup({
                    controlType: 'SyntheticCheckbox',
                    controlOptions: {
                        modelAttribute: 'action.script',
                        model: this.model.inmem.entry.content
                    },
                    label: _('Run a Script').t()
                });

                this.children.scriptFilename = new ControlGroup({
                    controlType: 'Text',
                    controlOptions: {
                        modelAttribute: 'action.script.filename',
                        model: this.model.inmem.entry.content
                    },
                    label: _('Filename').t(),
                    help: _('Located in $SPLUNK_HOME/bin/scripts').t()
                });

                //event listeners
                this.model.inmem.entry.content.on('change:action.email', this.toggleEmail, this);
                this.model.inmem.entry.content.on('change:action.script', this.toggleScript, this);
            },
            events: {
                "click .btn-primary" : function(e) {
                    var actions = [];

                    if (this.model.inmem.entry.content.get('action.email')) {
                        actions.push('email');
                    }

                    if (this.model.inmem.entry.content.get('action.script')) {
                        actions.push('script');
                    }

                    this.model.inmem.entry.content.set('actions', actions.join(', '));
                    this.model.inmem.trigger('saveSchedule');
                    e.preventDefault();
                },
                "click .back" : function(e) {
                    this.model.inmem.entry.content.trigger('back');
                    e.preventDefault();
                }
            },
            toggleEmail: function() {
                if (this.model.inmem.entry.content.get('action.email')) {
                    this.children.emailSubject.$el.show();
                    this.children.emailAddresses.$el.show();
                    this.children.emailResultsFormat.$el.show();
                } else {
                    this.children.emailSubject.$el.hide();
                    this.children.emailAddresses.$el.hide();
                    this.children.emailResultsFormat.$el.hide();
                }
            },
            toggleScript: function() {
                if (this.model.inmem.entry.content.get('action.script')) {
                    this.children.scriptFilename.$el.show();
                } else {
                    this.children.scriptFilename.$el.hide();
                }
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL_JUSTIFIED);

                if (this.model.user.isFree()) {
                    var freeHelpLink = route.docHelp(
                        this.model.application.get('root'),
                        this.model.application.get('locale'),
                        'learnmore.license.features');
                    this.children.sendEmailBox.disable();
                    this.children.runScriptBox.disable();
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.compiledTemplate({
                        _: _,
                        splunkUtil: splunkUtil,
                        link: ' <a href="' + freeHelpLink + '" target="_blank">' + _("Learn More").t() + ' <i class="icon-external"></i></a>'
                    }));
                }

                this.$(Modal.BODY_FORM_SELECTOR).append('<p class="control-heading">' + _('Enable Actions').t() + '</p>');

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.sendEmailBox.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.emailSubject.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.emailAddresses.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.emailResultsFormat.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.runScriptBox.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.scriptFilename.render().el);

                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back pull-left">' + _('Back').t() + '</a>');
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

                this.toggleEmail();
                this.toggleScript();
            },
            template: '\
                <div class="alert alert-info">\
                    <i class="icon-alert"></i>\
                    <%= splunkUtil.sprintf(_("Scheduling Actions is an Enterprise-level feature. It is not available with Splunk Free. %s").t(), link) %>\
                </div>\
            '
        });
    }
);

define('views/shared/reportcontrols/dialogs/schedule_dialog/Master',[
    'underscore',
    'backbone',
    'models/Cron',
    'models/TimeRange',
    'collections/services/data/ui/Times',
    'views/shared/Modal',
    'module',
    'views/shared/reportcontrols/dialogs/schedule_dialog/step1/Master',
    'views/shared/reportcontrols/dialogs/schedule_dialog/Step2'
    ],
    function(
        _,
        Backbone,
        Cron,
        TimeRangeModel,
        TimesCollection,
        Modal,
        module,
        Step1,
        Step2
    ) {
    return Modal.extend({
            moduleId: module.id,
            /**
            * @param {Object} options {
            *       model: {
            *           application: <models.Application>
            *           report: <models.Report>,
             *          appLocal: <models.services.AppLocal>,
             *          user: <models.services.admin.User>
            *       }
            * }
            */
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                //model
                this.model = {
                    application: this.model.application,
                    report: this.model.report,
                    user: this.model.user,
                    appLocal: this.model.appLocal,
                    timeRange: new TimeRangeModel(),
                    inmem: this.model.report.clone(),
                    cron: Cron.createFromCronString(this.model.report.entry.content.get('cron_schedule') || '0 6 * * 1')
                };
                //collections
                this.collection = new TimesCollection();

                this.collectionDeferred = this.collection.fetch({
                    data: {
                        app: this.model.application.get("app"),
                        owner: this.model.application.get("owner")
                    }
                });

                this.model.inmem.set({
                    ui_include_results: 'none',
                    scheduled_and_enabled: !this.model.inmem.entry.content.get('disabled') && this.model.inmem.entry.content.get('is_scheduled')
                });

                this.transposeToUI();

                //views
                this.children.step1 = new Step1({
                    model: {
                        state: this.model.inmem.entry.content,
                        application: this.model.application,
                        inmem: this.model.inmem,
                        cron: this.model.cron,
                        timeRange: this.model.timeRange,
                        user: this.model.user,
                        appLocal: this.model.appLocal
                    },
                    collection: this.collection
                });

                this.children.step2 = new Step2({
                    model: {
                        inmem: this.model.inmem,
                        application: this.model.application,
                        user: this.model.user,
                        appLocal: this.model.appLocal
                    }
                });

                //event listeners for workflow navigation
                this.model.inmem.on('next', function() {
                    this.model.cron.validate();
                },this);

                this.model.inmem.entry.content.on('back', function() {
                    this.children.step2.$el.hide();
                    this.children.step1.$el.show();
                },this);

                //event listeners for saving
                this.model.cron.on('validated', function(isValid, model, payload) {
                    if (isValid) {
                        this.children.step1.$el.hide();
                        this.children.step2.$el.show();
                    }
                }, this);

                this.model.inmem.on('saveSuccessNotScheduled', function() {
                    this.model.report.entry.content.set('is_scheduled', 0);
                    this.hide();
                }, this);

                this.model.inmem.on('saveSchedule', function() {
                    this.trasposeFromUI();

                    this.model.inmem.entry.content.set('cron_schedule', this.model.cron.getCronString());

                    this.model.inmem.save({}, {
                        success: function(model, response){
                            this.model.report.fetch();
                            this.hide();
                        }.bind(this)
                    });
                }, this);
            },
            transposeToUI: function() {
                //send email results format
                var resultsFormat = 'none';
                if (this.model.inmem.entry.content.get('action.email.sendresults')) {
                    if (this.model.inmem.entry.content.get('action.email.inline')) {
                        resultsFormat = 'inline';
                    } else {
                        resultsFormat = this.model.inmem.entry.content.get('action.email.format');
                    }
                }
                this.model.inmem.set('ui_include_results', resultsFormat);
            },
            trasposeFromUI: function() {
                var resultsFormat = this.model.inmem.get('ui_include_results');
                if (resultsFormat === 'none') {
                    this.model.inmem.entry.content.set('action.email.sendresults', 0);
                } else {
                    this.model.inmem.entry.content.set({
                        'action.email.sendresults': 1,
                        'action.email.format': resultsFormat === 'inline' ? '' : resultsFormat,
                        'action.email.sendpdf': (resultsFormat === 'pdf') ? 1 : 0,
                        'action.email.inline': (resultsFormat === 'inline') ? 1 : 0
                    });
                }

                if (this.model.inmem.get('scheduled_and_enabled')) {
                    this.model.inmem.entry.content.set({
                        'is_scheduled': 1,
                        'disabled': 0
                    });
                }
            },
            render: function() {
                this.$el.addClass('schedule-modal');
                var timeRangeDeferred = this.model.timeRange.save({
                    'earliest': this.model.inmem.entry.content.get('dispatch.earliest_time'),
                    'latest': this.model.inmem.entry.content.get('dispatch.latest_time')
                });

                $.when(timeRangeDeferred, this.collectionDeferred).then(function() {
                    this.$el.append(this.children.step1.render().el);
                    this.$el.append(this.children.step2.render().el);
                    this.children.step2.$el.hide();
                }.bind(this));
            }
        }
    );
});

define('views/shared/reportcontrols/details/EditSchedule',
    [
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/reportcontrols/dialogs/schedule_dialog/Master'
    ],
    function(_, Backbone, module, Base, ScheduleDialog) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click a.edit-schedule': function(e) {
                    this.children.scheduleDialog = new ScheduleDialog({
                        model: {
                            report: this.model.report,
                            application: this.model.application,
                            user: this.model.user,
                            appLocal: this.model.appLocal
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.scheduleDialog.render().el);
                    this.children.scheduleDialog.show();

                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                return this;
            },
            template: '\
                <a class="edit-schedule" href="#"><%- _("Edit").t() %></a>\
            '
        });
    }
);

define('views/shared/reportcontrols/details/Acceleration',
    [
        'underscore',
        'module',
        'views/Base',
        'splunk.util'
    ],
    function(_, module, Base, splunkUtil) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                var render = _.debounce(this.render, 0);
                this.model.entry.content.on('change:auto_summarize change:auto_summarize.dispatch.earliest_time', render, this);
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    model: this.model,
                    _: _,
                    splunkUtil: splunkUtil
                }));
                return this;
            },
            convertSummarizeTime: function(relTime) {
                switch(relTime)
                {
                    case '-1d@h':
                        return _('1 Day').t();
                    case '-7d@d':
                        return _('1 Week').t();
                    case '-1mon@d':
                        return _('1 Month').t();
                    case '-3mon@d':
                        return _('3 Months').t();
                    case '-1y@d':
                        return _('1 Year').t();
                    case '0':
                        return _('All Time').t();
                    default:
                        return _('Custom').t();
                }
            },
            template: '\
                <% if (model.entry.content.get("auto_summarize")) { %>\
                    <%- splunkUtil.sprintf(_("Enabled. Summary Range: %s.").t(), this.convertSummarizeTime(model.entry.content.get("auto_summarize.dispatch.earliest_time"))) %>\
                <% } else { %>\
                    <%- _("Disabled.").t() %>\
                <% } %>\
            '
        });
    }
);

define('views/shared/reportcontrols/dialogs/AccelerationDialog',[
    'underscore',
    'backbone',
    'module',
    'models/services/search/IntentionsParser',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'views/shared/FlashMessages',
    'splunk.util'
    ],
    function(
        _,
        Backbone,
        module,
        IntentionsParserModel,
        Modal,
        ControlGroup,
        FlashMessage,
        splunkUtil
    ) {
    return Modal.extend({
        moduleId: module.id,
        /**
        * @param {Object} options {
        *       model: {
        *           report: <models.Report>,
        *           searchJob: <models.services.search.Job> (optional),
        *       }
        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            this.model = {
                searchJob: this.model.searchJob,
                report: this.model.report,
                inmem: this.model.report.clone(),
                application: this.model.application
            };

            if(!this.model.searchJob) {
                this.model.intentionsParser = new IntentionsParserModel();
                this.intentionsParserDeferred = this.model.intentionsParser.fetch({
                    data:{
                        q:this.model.report.entry.content.get('search'),
                        timeline: false,
                        app: this.model.application.get('app'),
                        owner: this.model.application.get('owner')
                    }
                });
            }

            this.children.flashMessage = new FlashMessage({ model: this.model.inmem });

            this.children.name = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'name',
                    model: this.model.inmem.entry
                },
                label: _('Report').t()
            });

            this.children.acceleration = new ControlGroup({
                controlType: 'SyntheticCheckbox',
                controlOptions: {
                    modelAttribute: 'auto_summarize',
                    model: this.model.inmem.entry.content
                },
                label: splunkUtil.sprintf(_('Accelerate %s').t(), this.model.report.isAlert() ? _('Alert').t() : _('Report').t()),
                help: _('Acceleration may increase storage and processing costs.').t()
            });

            this.children.summary_range = new ControlGroup({
                controlType: 'SyntheticSelect',
                controlOptions: {
                    modelAttribute: 'auto_summarize.dispatch.earliest_time',
                    model: this.model.inmem.entry.content,
                    items: [
                        {
                            label: _('1 Day').t(),
                            value: '-1d@h'
                        },
                        {
                            label: _('7 Days').t(),
                            value: '-7d@d'
                        },
                        {
                            label: _('1 Month').t(),
                            value: '-1mon@d'
                        },
                        {
                            label: _('3 Months').t(),
                            value: '-3mon@d'
                        },
                        {
                            label: _('1 Year').t(),
                            value: '-1y@d'
                        },
                        {
                            label: _('All Time').t(),
                            value: '0'
                        }
                    ],
                    save: false,
                    toggleClassName: 'btn',
                    labelPosition: 'outside',
                    elastic: true,
                    popdownOptions: {
                        attachDialogTo: '.modal:visible',
                        scrollContainer: '.modal:visible .modal-body:visible'
                    }
                },
                label: _('Summary Range').t(),
                tooltip: _("Sets the range of time (relative to now) for which data is accelerated. " +
                    "Example: 1 Month accelerates the last 30 days of data in your reports.").t()
            });

            this.model.inmem.entry.content.on('change:auto_summarize', function() {
                if (this.model.inmem.entry.content.get("auto_summarize")) {
                    this.children.summary_range.$el.show();
                    if(this.model.inmem.entry.content.get("auto_summarize.dispatch.earliest_time") === '') {
                        this.model.inmem.entry.content.set("auto_summarize.dispatch.earliest_time",'-1d@h');
                    }
                } else {
                    this.children.summary_range.$el.hide();
                }
            }, this);

            this.on('hidden', function() {
                if (this.model.inmem.get("updated") > this.model.report.get("updated")) {
                    //now we know have updated the clone
                    this.model.report.entry.content.set({
                        auto_summarize: this.model.inmem.entry.content.get('auto_summarize'),
                        'auto_summarize.dispatch.earliest_time': this.model.inmem.entry.content.get('auto_summarize.dispatch.earliest_time')
                    });
                }
            }, this);
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .save.modal-btn-primary': function(e) {
                this.model.inmem.save({}, {
                    success: function(model, response) {
                        this.model.report.fetch();
                        this.remove();
                    }.bind(this)
                });
                e.preventDefault();
            }
        }),
        render: function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Acceleration").t());

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            $.when(this.intentionsParserDeferred).then(function(){
                var canSummarize = (this.model.searchJob && this.model.searchJob.canSummarize()) || (this.model.intentionsParser && this.model.intentionsParser.get('canSummarize'));
                if (canSummarize) {
                    this.model.inmem.setAccelerationWarning(canSummarize);
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.name.render().el);
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.acceleration.render().el);
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.summary_range.render().el);

                    if (this.model.inmem.entry.content.get("auto_summarize")) {
                        this.children.summary_range.$el.show();
                    } else {
                        this.children.summary_range.$el.hide();
                    }

                    this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                    this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="save btn btn-primary modal-btn-primary pull-right">' + _('Save').t() + '</a>');
                } else {
                    this.$(Modal.BODY_FORM_SELECTOR).append('<div>' + _('This report cannot be accelerated.').t() + '</div>');
                    this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_DONE);
                }
            }.bind(this));

            return this;
        }
    });
});

define('views/shared/reportcontrols/details/EditAcceleration',
    [
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/reportcontrols/dialogs/AccelerationDialog'
    ],
    function(_, Backbone, module, Base, AccelerationDialog) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click a.edit-acceleration': function(e) {
                    this.children.accelerationDialog = new AccelerationDialog({
                        model: {
                            report: this.model.report,
                            searchJob: this.model.searchJob,
                            application: this.model.application
                        },
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.accelerationDialog.render().el);
                    this.children.accelerationDialog.show();

                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                return this;
            },
            template: '\
                <a class="edit-acceleration" href="#"><%- _("Edit").t() %></a>\
            '
        });
    }
);

define('views/shared/documentcontrols/details/Permissions',
    [
        'underscore',
        'module',
        'views/Base',
        'util/splunkd_utils',
        'splunk.util'
    ],
    function(_, module, Base, splunkDUtils, splunkUtil) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                var render = _.debounce(this.render, 0);
                this.model.entry.acl.on('change:sharing change:owner', render, this);
            },
            render: function() {
                var sharing = this.model.entry.acl.get("sharing"),
                    owner = this.model.entry.acl.get("owner"),
                    permissionString = splunkDUtils.getPermissionLabel(sharing,owner);
                    
                this.$el.html(this.compiledTemplate({
                    permissionString:permissionString
                }));
                return this;
            },
            template: '\
               <%- permissionString %>\
            '
        });
    }
);

define('views/shared/documentcontrols/dialogs/permissions_dialog/ACL',[
    'underscore',
    'jquery',
    'backbone',
    'module',
    'views/Base',
    'views/shared/controls/SyntheticCheckboxControl'
    ],
    function(
        _,
        $,
        Backbone,
        module,
        BaseView,
        SyntheticCheckboxControl
    ) {
    return BaseView.extend({
        moduleId: module.id,
        className: 'push-margins',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);

            this.children.read = new BaseView();
            this.children.write = new BaseView();

            //listeners
            this.model.perms.on('change:Everyone.read', function() {
                this.toggleEveryone('read');
            }, this);
            this.model.perms.on('change:Everyone.write', function() {
                this.toggleEveryone('write');
            }, this);
        },
        appendRow: function(roleName, className) {
            this.$('tbody').append(
                '<tr class="'+ roleName + '">\
                    <td class="role-name">' + roleName + '</td>\
                    <td class="perms-read ' + roleName + '-checkbox"></td>\
                    <td class="perms-write ' + roleName + '-checkbox"></td>\
                </tr>'
            );
            this.children.readCheckbox = new SyntheticCheckboxControl({
                modelAttribute: roleName +'.read',
                model: this.model.perms,
                checkboxClassName: className + " " + roleName + " read btn"
            });
            this.children.writeCheckbox = new SyntheticCheckboxControl({
                modelAttribute: roleName + '.write',
                model: this.model.perms,
                checkboxClassName: className + " " + roleName + " write btn"
            });

            this.$('td.perms-read.'+ roleName + '-checkbox').append(this.children.readCheckbox.render().el);
            this.$('td.perms-write.'+ roleName + '-checkbox').append(this.children.writeCheckbox.render().el);

            this.children.read.children[roleName ] = this.children.readCheckbox;
            this.children.write.children[roleName] = this.children.writeCheckbox;
        },
        toggleEveryone: function(col) {
            var everyoneChecked = this.model.perms.get('Everyone.' + col),
                view = this.children[col];
            _.each(view.children, function(checkbox, role) {
                if (role !== 'Everyone') {
                    if (everyoneChecked) {
                        checkbox.disable();
                    } else {
                        checkbox.enable();
                    }
                }
            });
        },
        render: function() {
            this.$el.html(this.compiledTemplate({
                _: _
            }));

            this.appendRow(_("Everyone").t());

            this.collection.each(function(roleModel) {
                this.appendRow(roleModel.entry.get("name"), 'role');
            }.bind(this));

            this.toggleEveryone('read');
            this.toggleEveryone('write');

            return this;
        },
        template: '\
            <table class="table table-striped table-condensed table-scroll table-border-row">\
                <thead>\
                    <tr>\
                        <td></td>\
                        <th class="perms-read"><%- _("Read").t() %></th>\
                        <th class="perms-write"><%- _("Write").t() %></th>\
                    </tr>\
                </thead>\
                <tbody>\
                </tbody>\
            </table>\
        '
    });
});

define('views/shared/documentcontrols/dialogs/permissions_dialog/Master',[
    'jquery',
    'underscore',
    'backbone',
    'module',
    'models/ACLReadOnly',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'views/shared/documentcontrols/dialogs/permissions_dialog/ACL',
    'views/shared/FlashMessages',
    'util/splunkd_utils'
    ],
    function(
        $,
        _,
        Backbone,
        module,
        ACLReadOnlyModel,
        Modal,
        ControlGroup,
        ACL,
        FlashMessage,
        splunkd_utils
    ) {
    return Modal.extend({
        moduleId: module.id,
        /**
        * @param {Object} options {
        *       model: { 
        *           document: <models.Report>,
        *           nameModel: <model> Model for name,
        *           user: <models.service.admin.user>
        *       }
        *       collection: <collections.services.authorization.Roles>,
        *       nameLabel: <string> Label for name,
        *       nameKey: <string> Key for name found in nameModel,  
        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            this.model.perms = new Backbone.Model();
            this.model.inmem = new ACLReadOnlyModel($.extend(true, {}, this.model.document.entry.acl.toJSON()));

            var defaults = {
                nameLabel: _('Name').t(),
                nameKey: 'name'
            };

            _.defaults(this.options, defaults);

            this.translateToPermsModel();
            this.children.flashMessage = new FlashMessage({
                model: {
                    inmem: this.model.inmem,
                    report: this.model.document,
                    reportAcl: this.model.document.acl
                }
            });

            this.children.name = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: this.options.nameKey,
                    model: this.model.nameModel
                },
                label: this.options.nameLabel
            });

            this.children.owner = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'owner',
                    model: this.model.inmem
                },
                label: _('Owner').t()
            });

            this.children.app = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'app',
                    model: this.model.inmem
                },
                label: _('App').t()
            });

            this.children.display_for = new ControlGroup({
                controlType: 'SyntheticRadio',
                controlClass: 'controls-thirdblock',
                controlOptions: {
                    modelAttribute: 'sharing',
                    model: this.model.inmem,
                    items: [
                        {
                            label: _('Owner').t(),
                            value: splunkd_utils.USER,
                            className: 'user'
                        },
                        {
                            label: _('App').t(),
                            value: splunkd_utils.APP,
                            className: 'app'
                        },
                        {
                            label: _('All Apps').t(),
                            value: splunkd_utils.GLOBAL,
                            className: 'global'
                        }
                    ],
                    save: false
                },
                label: _('Display For').t()
            });

            this.children.acl = new ACL({
                model : {
                    perms: this.model.perms
                },
                collection: this.collection
            });

            this.model.inmem.on('change:sharing', function() {
                if (this.model.inmem.get("sharing") === splunkd_utils.USER) {
                    this.children.acl.$el.hide();
                } else {
                    this.children.acl.$el.show();
                }
            }, this);
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
                this.translateFromPermsModel();
                var data = this.model.inmem.toDataPayload();
                this.model.document.acl.save({}, {
                    data: data,
                    success: function(model, response){
                        this.hide();
                        this.model.document.fetch({
                            url: splunkd_utils.fullpath(
                                this.model.document.url + '/' + encodeURIComponent(this.model.document.entry.get('name')),
                                {
                                    sharing: data.sharing,
                                    app: this.model.inmem.get('app'),
                                    owner: data.owner
                                }
                            ),
                            success: function() {
                                this.model.document.trigger('updateCollection');
                            }.bind(this)
                        });
                    }.bind(this)
                });

                e.preventDefault();
            }
        }),
        translateToPermsModel: function() {
            var perms = this.model.inmem.get('perms') || {};

            this.model.perms.set('Everyone.read', _.indexOf(perms.read, '*')!=-1);
            this.model.perms.set('Everyone.write', _.indexOf(perms.write, '*')!=-1);
            this.collection.each(function(roleModel){
                var roleName = roleModel.entry.get("name");
                this.model.perms.set(roleName + '.read', _.indexOf(perms.read, roleName)!=-1);
                this.model.perms.set(roleName + '.write', _.indexOf(perms.write, roleName)!=-1);
            }.bind(this));
        },
        translateFromPermsModel: function() {
            var perms = {
                read: [],
                write: []
            };

            if (this.model.perms.get('Everyone.read')) {
                perms.read.push('*');
            }
            if (this.model.perms.get('Everyone.write')) {
                perms.write.push('*');
            }

            this.collection.each(function(roleModel){
                var role = roleModel.entry.get("name");
                if (this.model.perms.get(role +'.read')) {
                    perms.read.push(role);
                }
                if (this.model.perms.get(role +'.write')) {
                    perms.write.push(role);
                }
            }.bind(this));

            this.model.inmem.set('perms', perms);

        },
        setView: function() {
            if (!this.model.inmem.get("can_share_user")) {
                this.children.display_for.$('.user').attr('disabled', true);
            }
            if (!this.model.inmem.get("can_share_app")) {
                this.children.display_for.$('.app').attr('disabled', true);
            }
            if (!this.model.inmem.get("can_share_global")) {
                this.children.display_for.$('.global').attr('disabled', true);
            }
            if(!this.model.inmem.get("modifiable")) {
                this.children.display_for.$('.btn').attr('disabled', true);
            }
            if (this.model.inmem.get("sharing") ==='user'){
                this.children.acl.$el.hide();
            } else {
                this.children.acl.$el.show();
            }
        },
        render: function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Permissions").t());
            this.$(Modal.BODY_SELECTOR).addClass('modal-body-scrolling');

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.name.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.owner.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.app.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.display_for.render().el);

            if (!this.model.user.isFree()) {
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.acl.render().el);
            }

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

            this.setView();

            return this;
        }
    });
});

define('views/shared/reportcontrols/details/EditPermissions',
    [
        'underscore',
        'backbone',
        'module',
        'views/Base',
        'views/shared/documentcontrols/dialogs/permissions_dialog/Master'
    ],
    function(_, Backbone, module, Base, PermissionsDialog) {
        return Base.extend({
            moduleId: module.id,
            tagName: 'span',
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
            },
            events: {
                'click a.edit-permissions': function(e) {
                    this.children.permissionsDialog = new PermissionsDialog({
                        model: {
                            document: this.model.report,
                            nameModel: this.model.report.entry,
                            user: this.model.user
                        },
                        collection: this.collection,
                        onHiddenRemove: true,
                        nameLabel: _('Report').t()
                    });

                    $("body").append(this.children.permissionsDialog.render().el);
                    this.children.permissionsDialog.show();

                    e.preventDefault();
                }
            },
            render: function() {
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                return this;
            },
            template: '\
                <a class="edit-permissions" href="#"><%- _("Edit").t() %></a>\
            '
        });
    }
);

define('views/shared/reportcontrols/details/Master',[
    'underscore',
    'jquery',
    'views/Base',
    'module',
    'views/shared/reportcontrols/details/History',
    'views/shared/reportcontrols/details/Creator',
    'views/shared/documentcontrols/details/App',
    'views/shared/reportcontrols/details/Schedule',
    'views/shared/reportcontrols/details/EditSchedule',
    'views/shared/reportcontrols/details/Acceleration',
    'views/shared/reportcontrols/details/EditAcceleration',
    'views/shared/documentcontrols/details/Permissions',
    'views/shared/reportcontrols/details/EditPermissions',
    'bootstrap.modal'
    ],
    function(
        _,
        $,
        BaseView,
        module,
        HistoryView,
        CreatorView,
        AppView,
        ScheduleView,
        EditScheduleView,
        AccelerationView,
        EditAccelerationView,
        PermissionsView,
        EditPermissionsView,
        undefined
    ) {
        return BaseView.extend({
            moduleId: module.id,
            /**
            * @param {Object} options {
            *       model: {
            *           report: <models.Report>,
            *           application: <models.Application>,
            *           intentionsParser: (Optional) <models.IntentionsParser>,
            *           appLocal: <models.services.AppLocal>,
            *           user: <models.service.admin.user>
            *       },
            *       collection: <collections.services.authorization.Roles>
            * }
            */
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);
                //this.children.historyView = new HistoryView({model: this.model.report});
                this.children.creatorView = new CreatorView({
                    model: {
                        report: this.model.report,
                        application: this.model.application
                    }
                });
                this.children.appView = new AppView({model: this.model.report});
                this.children.scheduleView = new ScheduleView({model: this.model.report});
                this.children.editScheduleView = new EditScheduleView({
                    model: {
                        report: this.model.report,
                        application: this.model.application,
                        user: this.model.user,
                        appLocal: this.model.appLocal
                    }
                });
                this.children.accelerationView = new AccelerationView({model: this.model.report});
                this.children.editAccelerationView = new EditAccelerationView({
                    model: {
                        report: this.model.report,
                        searchJob: this.model.searchJob,
                        application: this.model.application
                    }
                });
                this.children.permissionsView = new PermissionsView({model: this.model.report});
                this.children.editPermissionsView = new EditPermissionsView({
                    model: {
                        report: this.model.report,
                        user: this.model.user
                    },
                    collection: this.collection
                });

                if (this.model.searchJob){
                    this.model.searchJob.on("prepared", function() {
                        this.$('a.edit-acceleration').css('display', '');
                    }, this);
                }
            },
            render: function() {
                var canWrite = this.model.report.entry.acl.get('can_write') && !(this.model.report.entry.content.get('is_scheduled') && !this.model.user.canScheduleSearch());
                this.$el.html(this.compiledTemplate({
                    _: _
                }));
                //TODO when these attributes exist
                //this.$('dd.history').append(this.children.historyView.render().el);
                this.$('dd.creator').append(this.children.creatorView.render().el);
                this.$('dd.app').append(this.children.appView.render().el);
                this.$('dd.schedule').append(this.children.scheduleView.render().el);
                this.$('dd.acceleration').append(this.children.accelerationView.render().el);
                this.$('dd.permissions').append(this.children.permissionsView.render().el);

                if (canWrite) {

                    if (this.model.user.canScheduleSearch()) {
                        // Check if real-time. User can not schedule a real-time search
                        if (!this.model.report.isRealTime()) {
                            this.$('dd.schedule').append(this.children.editScheduleView.render().el);
                        }

                        this.$('dd.acceleration').append(this.children.editAccelerationView.render().el);
                    }
                    // Only show if user has perm to change perms
                    if (this.model.report.entry.acl.get('can_change_perms')) {
                        this.$('dd.permissions').append(this.children.editPermissionsView.render().el);
                    }
                }

                if (this.model.searchJob && this.model.searchJob.isPreparing()) {
                    this.$('a.edit-acceleration').css('display', 'none');
                }

                if(this.model.report.isPivotReport()) {
                    this.$('dt.acceleration').remove();
                    this.$('dd.acceleration').remove();
                }

                return this;
            },
            template: '\
            <dl class="list-dotted">\
                <!--TODO when these attributes exist-->\
                <!--<dt class="history"><%- _("History").t() %></dt>\
                    <dd class="history"></dd>-->\
                <dt class="creator"><%- _("Creator").t() %></dt>\
                    <dd class="creator"></dd>\
                <dt class="app"><%- _("App").t() %></dt>\
                    <dd class="app"></dd>\
                <dt class="schedule"><%- _("Schedule").t() %></dt>\
                    <dd class="schedule"></dd>\
                <dt class="acceleration"><%- _("Acceleration").t() %></dt>\
                    <dd class="acceleration"></dd>\
                <dt class="permissions"><%- _("Permissions").t() %></dt>\
                    <dd class="permissions"></dd>\
            </dl>\
        '
        });
    }
);

define('views/dashboards/panelcontrols/titledialog/Modal',
    [
        'underscore',
        'jquery',
        'backbone',
        'module',
        'views/shared/controls/ControlGroup',
        'views/shared/Modal', 
        'views/shared/FlashMessages'
    ],
    function(_, $, backbone, module, ControlGroup, Modal, FlashMessagesView){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                var titleProperty = 'display.general.title';
                this.model.workingReport = new backbone.Model(/*this.model.report.entry.content.toJSON()*/);
                this.model.workingReport.set(titleProperty, this.model.report.entry.content.get(titleProperty, { tokens: true }));
                this.children.flashMessages = new FlashMessagesView({model: this.model.dashboard});
                //reset flashmessages to clear pre-existing flash messages on 'cancel' or 'close' of dialog
                this.on('hide', this.model.dashboard.error.clear, this.model.dashboard.error); 

                this.children.panelTitleControlGroup = new ControlGroup({
                    label: _("Title").t(),
                    controlType:'Text',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: titleProperty,
                        placeholder: "optional"
                    }
                });

                this.listenTo(this.model.report, 'successfulSave', this.hide, this); 
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                var newTitle = this.model.workingReport.get('display.general.title'); 
                e.preventDefault();
                this.model.report.trigger("saveTitle", newTitle); //this.model.report is actually this.model.working due to titledialog using tokens 
           },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Title").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);                
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.panelTitleControlGroup.render().el);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
            }
        });
    }
);

define('views/dashboards/PanelTimeRangePicker',['require','exports','module','underscore','views/Base','views/shared/controls/ControlGroup','util/console','uri/route','util/time_utils','splunkjs/mvc/tokenutils','bootstrap.tooltip'],function(require, module, exports) {
    var _ = require('underscore'),
        BaseView = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var console = require('util/console');
    var route = require('uri/route');
    var time_utils = require('util/time_utils');
    var token_utils = require('splunkjs/mvc/tokenutils');
    require('bootstrap.tooltip');

    return BaseView.extend({
        moduleId: module.id,
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);

            this.model.timeRange.on('applied', function() {
                this.updateReportTime();
                this.updateTime();
            }, this);

            var hasTokens = token_utils.hasToken(this.model.report.get("dispatch.earliest_time"));
            var useTimeFrom = hasTokens ? 'dashboard' : 'search';
            this.model.timeRange.set({useTimeFrom: useTimeFrom});

            if (this.model.state.get('default_timerange')){
                this.children.timeScope = new ControlGroup({
                    label: _("Time Range Scope").t(),
                    controlType: 'SyntheticRadio',
                    controlOptions: {
                        className: 'btn-group btn-group-2 time-range-scope-select',
                        items: [
                            {value: 'dashboard', label: _('Dashboard').t(),tooltip: _('Use the time range set by the dashboard time range picker.').t()},
                            {value: 'search', label: _('Search').t(),tooltip: _('Override the dashboard time range picker by setting a time range for this Search.').t()}
                        ],
                        model: this.model.timeRange,
                        modelAttribute: 'useTimeFrom',
                        elastic: true
                    }
                });
            }
            else {
                this.model.timeRange.set('useTimeFrom', 'search');
            }

            this.listenTo(this.model.timeRange, 'change:useTimeFrom', this.updateTokens, this);
        },
        updateReportTime: function(){
            this.model.report.set({
                'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                'dispatch.latest_time':this.model.timeRange.get('latest')
            }, {tokens: true});
        },
        updateTokens: function(){
            this.toggleTimeRangePicker();
            this.updateTime();
        },
        toggleTimeRangePicker: function() {
            if (this.model.timeRange.get('useTimeFrom') == "dashboard"){
                this.$('.timerange').hide();
            }
            else{
                this.$('.timerange').show();
            }
        },
        updateTime: function() {
            var timeLabel = this.model.timeRange.generateLabel(this.collection);
            this.$el.find("span.time-label").text(timeLabel);
        },
        render: function() {
            if (this.children.timeScope){
                this.children.timeScope.render().appendTo(this.el);
            }

            this.$el.append('<div class="timerange" style="display: block;"><label class="control-label">' + _('Time Range').t() + '</label></div>');
            this.$('div.timerange').append('<div class="controls"><a href="#" class="btn timerange-control"><span class="time-label"></span><span class="icon-triangle-right-small"></span></a></div>');
            this.toggleTimeRangePicker();
            this.updateTime();


            return this;
        }
    });

});
define('views/dashboards/panelcontrols/querydialog/Modal',[
    'underscore',
    'jquery',
    'backbone',
    'module',
    'views/shared/controls/ControlGroup',
    'views/shared/delegates/ModalTimerangePicker',
    'views/shared/timerangepicker/dialog/Master',
    'views/shared/Modal',
    'models/TimeRange',
    'collections/services/data/ui/Times',
    'splunk.util',
    'splunkjs/mvc/utils',
    'views/Base',
    'uri/route',
    'splunkjs/mvc/simplexml/controller',
    'util/time_utils',
    'bootstrap.tooltip',
    'util/console',
    'splunkjs/mvc',
    'views/shared/FlashMessages',
    'views/dashboards/PanelTimeRangePicker',
    'splunkjs/mvc/tokenawaremodel'],
    function(_,
             $,
             Backbone,
             module,
             ControlGroup,
             TimeRangeDelegate,
             TimeRangePickerView,
             Modal,
             TimeRangeModel,
             TimeRangeCollection,
             splunkUtils,
             utils,
             BaseView,
             route,
             Dashboard,
             time_utils,
             _bootstrapTooltip,
             console,
             mvc,
             FlashMessagesView,
             PanelTimeRangePicker,
             TokenAwareModel
    ){

        function mergeSearch(base, sub) {
            if (!sub) {
                return base;
            }
            return [ base.replace(/[\|\s]$/g,''), sub.replace(/^[\|\s]/g,'') ].join(' | ');
        }

        return Modal.extend({
            moduleId: module.id,
            className: 'modal edit-search-string',
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new TokenAwareModel(
                    _.pick(
                            this.model.report.entry.content.toJSON({ tokens: true }),
                            ['search','dispatch.earliest_time','dispatch.latest_time']
                    ),
                    {
                        applyTokensByDefault: true,
                        retrieveTokensByDefault: true
                    }
                );
                this.children.title = new ControlGroup({
                    label: _("Title").t(), 
                    controlType: 'Label', 
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.report.entry.content, 
                        modelAttribute: 'display.general.title'
                    }
                });
                this.children.searchStringInput = new ControlGroup({
                    label: _("Search String").t(),
                    controlType:'Textarea',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: 'search'
                    }
                });
                if(this.model.report.isPivotReport()){
                    this.children.searchStringInput.options.help =
                        '<a href="#" class="run-pivot">'+_("Run Pivot").t()+
                        ' <i class="icon-external"></i></a>';
                }else{
                    this.children.searchStringInput.options.help =
                        '<a href="#" class="run-search">'+_("Run Search").t()+
                        ' <i class="icon-external"></i></a>';
                }
                this.collection = this.collection || {};
                this.collection.times = new TimeRangeCollection();
                this.collection.times.fetch({
                    data: {
                        app: this.model.application.get("app"),
                        owner: this.model.application.get("owner")
                    }
                });
                this.model.timeRange = new TimeRangeModel();

                this.children.timeRangePickerView =  new TimeRangePickerView({
                    model: {
                        state: this.model.workingReport,
                        timeRange: this.model.timeRange,
                        application: this.model.application,
                        user: this.model.user,
                        appLocal: this.model.appLocal
                    },
                    collection: this.collection.times
                });

                this.model.timeRange.on('applied', function() {
                    this.timeRangeDelegate.closeTimeRangePicker();
                }, this);

                this.children.panelTimeRangePicker = new PanelTimeRangePicker({
                    model: {
                        timeRange: this.model.timeRange,
                        report: this.model.workingReport,
                        state: this.model.state
                    },
                    collection: this.collection.times
                });
                this.children.flashMessages = new FlashMessagesView({ model: this.model.dashboard });
                //reset flashmessages to clear pre-existing flash messages on 'cancel' or 'close' of dialog
                this.on('hide', this.model.dashboard.error.clear, this.model.dashboard.error); 
                this.listenTo(this.model.report, 'successfulSave', this.hide, this); 

            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': function(e){
                    e.preventDefault();
                    if (this.model.timeRange.get('useTimeFrom') == "dashboard"){
                        this.model.workingReport.set({
                            'dispatch.earliest_time': '$earliest$',
                            'dispatch.latest_time': '$latest$'
                        }, {tokens: true});
                    } else {
                        this.model.workingReport.set({
                            'dispatch.earliest_time': this.model.timeRange.get('earliest') || "0",
                            'dispatch.latest_time': this.model.timeRange.get('latest') || "now"
                        });
                    }
                    var newAttributes = this.model.workingReport.toJSON();
                    console.log('Applying attributes to report model: %o', newAttributes);
                    this.model.report.trigger('updateSearchString', newAttributes);
                },
                'click a.run-search': function(e) {
                    e.preventDefault();
                    var search = this.model.workingReport.get('search', { tokens: false });
                    var reportContent = this.model.report.entry.content;
                    if (reportContent.get('display.general.search.type') === 'postprocess') {
                        var baseSearch = mvc.Components.get(reportContent.get('display.general.managerid')).parent.query.resolve();
                        search = mergeSearch(baseSearch, search);
                    }
                    if(!search) {
                        return;
                    }
                    var params = { q: search };
                    if(this.model.workingReport.has('dispatch.earliest_time')) {
                        params.earliest = this.model.workingReport.get('dispatch.earliest_time', { tokens: false } || '0');
                        params.latest = this.model.workingReport.get('dispatch.latest_time', { tokens: false }) || 'now';
                    }
                    var pageInfo = utils.getPageInfo();
                    var url = route.search(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
                    utils.redirect(url, true);
                }, 
                'click a.run-pivot': function(e) {
                    e.preventDefault();
                    var search = this.model.workingReport.get('search', { tokens: false }), params = { q: search };
                    if(!search) {
                        return;
                    }
                    if(this.model.workingReport.has('dispatch.earliest_time')) {
                        params.earliest = this.model.workingReport.get('dispatch.earliest_time', { tokens: false });
                        params.latest = this.model.workingReport.get('dispatch.latest_time', { tokens: false });
                    }
                    var pageInfo = utils.getPageInfo();
                    var url = route.pivot(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params });
                    utils.redirect(url, true);
                }
            }),
            handleSubmitButtonState: function(model) {
                this.$(Modal.FOOTER_SELECTOR)
                    .find('.btn-primary')[model.get('elementCreateType') === 'pivot' ? 'addClass' : 'removeClass']('disabled');
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Search").t());

                this.$(Modal.BODY_SELECTOR).remove();

                this.$(Modal.FOOTER_SELECTOR).before(
                    '<div class="vis-area">' +
                        '<div class="slide-area">' +
                            '<div class="content-wrapper query-dialog-wrapper">' +
                                '<div class="' + Modal.BODY_CLASS + '" >' +
                                '</div>' +
                            '</div>' +
                            '<div class="timerange-picker-wrapper">' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );

                this.$visArea = this.$('.vis-area').eq(0);
                this.$slideArea = this.$('.slide-area').eq(0);
                this.$editSearchContent = this.$('.query-dialog-wrapper').eq(0);
                this.$timeRangePickerWrapper = this.$('.timerange-picker-wrapper').eq(0);
                this.$modalParent = this.$el;

                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);                
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL_JUSTIFIED);
                this.children.title.render().appendTo(this.$(Modal.BODY_FORM_SELECTOR));
                this.children.searchStringInput.render().appendTo(this.$(Modal.BODY_FORM_SELECTOR));
                
                var dfd = this.model.timeRange.save({
                    'earliest': this.model.workingReport.get('dispatch.earliest_time', {tokens: false} || "0"),
                    'latest': this.model.workingReport.get('dispatch.latest_time', {tokens: false} || "now")
                }); 

                dfd.done(_.bind(function(){
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.panelTimeRangePicker.render().el);
                }, this)); 

                this.$timeRangePickerWrapper.append(this.children.timeRangePickerView.render().el);

                this.timeRangeDelegate = new TimeRangeDelegate({
                    el: this.el,
                    $visArea: this.$visArea,
                    $slideArea: this.$slideArea,
                    $contentWrapper: this.$editSearchContent,
                    $timeRangePickerWrapper: this.$timeRangePickerWrapper,
                    $modalParent: this.$modalParent,
                    $timeRangePicker: this.children.timeRangePickerView.$el,
                    activateSelector: 'a.timerange-control',
                    backButtonSelector: 'a.btn.back'
                });

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back modal-btn-back pull-left">' + _('Back').t() + '</a>');
                this.$('.btn.back').hide();

                return this;
            }
        });
    }
);

define('views/dashboards/panelcontrols/ReportDialog',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/shared/controls/ControlGroup',
        'views/shared/Modal',
        'views/shared/FlashMessages', 
        'splunk.util', 
        'uri/route', 
        'collections/Reports', 
        'splunkjs/mvc/utils', 
        'splunk.config'
    ],
    function($, 
        _, 
        backbone, 
        module, 
        ControlGroup, 
        Modal, 
        FlashMessage, 
        splunkUtil, 
        route, 
        Reports, 
        utils, 
        splunkConfig
    ){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new backbone.Model();
                this.model.workingReport.set({"title": ""});
                this.model.workingReport.set("id", this.model.report.get('id')); 
                this.children.flashMessage = new FlashMessage({ model: this.model.dashboard });
                //reset flashmessages to clear pre-existing flash messages on 'cancel' or 'close' of dialog
                this.on('hide', this.model.dashboard.error.clear, this.model.dashboard.error); 
                this.listenTo(this.model.report, 'successfulManagerChange', this.hide, this); 
                this.controller = this.options.controller;

                if(!this.controller.reportsCollection){
                    this.controller.fetchCollection(); 
                }

                this.controller.reportsCollection.initialFetchDfd.done(_.bind(function() {  
                    this.ready = true;
                    var items = this.controller.reportsCollection.map(function(report) {
                        return { label: report.entry.get('name'), value: report.id };
                    });
                     var reportsLink = route.reports(
                        this.model.application.get("root"),
                        this.model.application.get("locale"),
                        this.model.application.get("app")
                    ); 

                    if(this.controller.reportsCollection.length === this.controller.reportsCollection.REPORTS_LIMIT){
                        this.children.reportsControlGroup = new ControlGroup({
                            label: _("Select Report").t(),
                            controlType:'SyntheticSelect',
                            controlClass: 'controls-block',
                            controlOptions: {
                                model: this.model.workingReport,
                                modelAttribute: 'id',
                                items: items,
                                toggleClassName: 'btn',
                                popdownOptions: {
                                    attachDialogTo: '.modal:visible',
                                    scrollContainer: '.modal:visible .modal-body:visible'
                                }
                            }, 
                            help: _("This does not contain all reports. Add a report that is not listed from ").t() + splunkUtil.sprintf('<a href=%s>%s</a>.', reportsLink, _('Reports').t())
                        });
                    }else{
                        this.children.reportsControlGroup = new ControlGroup({
                            label: _("Select Report").t(),
                            controlType:'SyntheticSelect',
                            controlClass: 'controls-block',
                            controlOptions: {
                                model: this.model.workingReport,
                                modelAttribute: 'id',
                                items: items,
                                toggleClassName: 'btn',
                                popdownOptions: {
                                    attachDialogTo: '.modal:visible',
                                    scrollContainer: '.modal:visible .modal-body:visible'
                                }
                            }
                        });
                    }
                }, this));

                this.children.panelTitleControlGroup = new ControlGroup({
                    label: _("Panel Title").t(),
                    controlType:'Text',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: 'title',
                        placeholder: "optional"
                    }
                });
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                e.preventDefault();
                this.model.report.trigger("updateReportID", this.model.workingReport.get('id'), this.model.workingReport.get('title'));
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select a New Report").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                
                this.$(Modal.BODY_FORM_SELECTOR).append(Modal.LOADING_HORIZONTAL);
                this.$(Modal.LOADING_SELECTOR).html(_('Loading...').t()); 

                this.controller.reportsCollection.initialFetchDfd.done(_.bind(function(){
                    this.$(Modal.LOADING_SELECTOR).remove(); 
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportsControlGroup.render().el);
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.panelTitleControlGroup.render().el);
                }, this));

                
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
            }
        });
    }
);

define('views/dashboards/panelcontrols/CreateReportDialog',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/shared/controls/ControlGroup',
        'views/shared/Modal', 
        'views/shared/FlashMessages'
    ],
    function($, 
        _, 
        backbone, 
        module, 
        ControlGroup, 
        Modal, 
        FlashMessagesView
    ){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new backbone.Model({'name': this.model.report.entry.content.get('display.general.title') });
                this.children.flashMessagesReport = new FlashMessagesView({model: this.model.report});
                this.children.flashMessagesDashboard = new FlashMessagesView({model: this.model.dashboard});
                //reset flashmessages to clear pre-existing flash messages on 'cancel' or 'close' of dialog
                this.on('hide', this.model.report.error.clear, this.model.report.error); 
                this.on('hide', this.model.dashboard.error.clear, this.model.dashboard.error); 

                this.children.reportNameControlGroup = new ControlGroup({
                    label: _("Report Title").t(),
                    controlType:'Text',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: 'name'
                    }
                });

                this.children.reportDescriptionControlGroup = new ControlGroup({
                    label: _("Description").t(),
                    controlType:'Textarea',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: 'description',
                        placeholder: "optional"
                    }
                });

                this.listenTo(this.model.report, 'successfulReportSave', this.hide, this); 
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                e.preventDefault();
                this.model.report.trigger("saveAsReport", this.model.workingReport.get("name"), this.model.workingReport.get("description"));
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Convert to Report").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessagesDashboard.render().el);
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessagesReport.render().el);
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportNameControlGroup.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportDescriptionControlGroup.render().el);

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
            }
        });
    }
);

/**
 * @author jszeto
 * @date 12/17/12
 */
define('views/ValidatingView',[
    'jquery',
    'backbone',
    'underscore',
    'views/Base',
    'util/general_utils'
],
    function(
        $,
        Backbone,
        _,
        BaseView,
        general_utils
        ){
        return BaseView.extend(
        {

            /**
             * A dictionary mapping the model attributes to the name of ControlGroup children views. The key is the
             * model attribute name. The value is the name of the ControlGroup in the view's children dictionary.
             * ex. {
             *         firstName: "FirstNameView",
             *         lastName: "LastNameView",
             *         zipCode: "ZipCodeView"
             *     }
             */
            modelToControlGroupMap: {},

            /**
             *  Override parent class dispose to also call tearDownValidation()
             */
            dispose: function() {
                var returnValue = BaseView.prototype.dispose.call(this, arguments);
                this.tearDownValidation();
                return returnValue;
            },

            /**
             * Call this function if your View has data input controls that need to perform validation. Instantiate the
             * view's model prior to calling this function.
             *
             * @param model - a model or collection The view listens for their "validated" event
             * @param flashMessagesHelper - {FlashMessagesHelper} - reference to the FlashMessagesHelper which listens to
             * "validated" events from a set of Views and applies those errors to a FlashMessages collection
             */
            setupValidation: function(modelOrCollection, flashMessagesHelper) {
                if (_.isUndefined(modelOrCollection))
                    throw "The model or collection you passed into views/Base.setupValidation is undefined";
                // Handle case of collection by iterating over it
                if (modelOrCollection instanceof Backbone.Model)
                    this._setupModelValidationListener(modelOrCollection);
                else if (modelOrCollection instanceof Backbone.Collection) {
                    modelOrCollection.each(function(model){
                        this._setupModelValidationListener(model);
                    });
                    modelOrCollection.on('add', function(model) {this._setupModelValidationListener(model);}, this);
                    modelOrCollection.on('remove', function(model) {model.off("validated", this._modelValidatedHandler, this);}, this);
                }
                // Register with the FlashMessagesHelper
                this.__flashMessagesHelper__ = flashMessagesHelper;
                this.__flashMessagesHelper__.register(this);
            },

            /**
             * Call this when destroying the View
             */
            tearDownValidation: function() {
                if (this.__flashMessagesHelper__)
                    this.__flashMessagesHelper__.unregister(this);
            },

            // Helper function to setup the validated listener on a given model. For internal use only.
            _setupModelValidationListener: function(model) {
                model.on("validated",this._modelValidatedHandler, this);
            },

            /**
             * Handle when a model has performed validation. This function decorates the error messages with labels from
             * the view's ControlGroups if the modelToControlGroupMap property is defined. It then sets the error states
             * of the ControlGroups based on the errors. The function also notifies the FlashMessagesHelper of the latest
             * validation result.
             *
             * @param isValid - true if the entire model passed validation
             * @param model - the model that was validated
             * @param invalidAttrs - an object of invalid model attributes and their error messages. The key is the attribute
             * name while the value is the error message.
             */
            _modelValidatedHandler: function(isValid, model, invalidAttrs) {

                var flashMessages = [];

                if (this.modelToControlGroupMap) {
                    // Get a dictionary where the keys are the controlGroups and the values are undefined.
                    var controlGroupToErrorMap = general_utils.invert(this.modelToControlGroupMap);
                    controlGroupToErrorMap =  _.reduce(_.keys(controlGroupToErrorMap || {}), function(memo, key) {
                        memo[key] = void 0;
                        return memo;
                    }, {});

                    _(invalidAttrs).each(function (error, invalidAttr) {
                        invalidAttrs[invalidAttr] = {message:error, label:""};
                    });

                    // Iterate over the invalidAttrs and map their error message to the controlGroupToErrorMap
                    _(invalidAttrs).each(function(error, invalidAttr) {
                        // Get the controlGroup associated with this model attribute
                        var controlGroupName = this.modelToControlGroupMap[invalidAttr];
                        var message = error.message;
                        var decoratedMessage;
                        var controlGroupLabel = "";

                        if (!_.isUndefined(controlGroupName)) {

                            // Replace the {label} placeholder with the control group's label.
                            if (this.children[controlGroupName].options.label)
                                controlGroupLabel = this.children[controlGroupName].options.label;
                            decoratedMessage = message.replace(/\{(label)\}/g, controlGroupLabel || invalidAttr);

                            controlGroupToErrorMap[controlGroupName] = decoratedMessage;
                        } else {
                            // If we can't find the attribute in the map, then just use the model attribute for the label
                            decoratedMessage = message.replace(/\{(label)\}/g, invalidAttr);
                        }

                        error.message = decoratedMessage;
                        error.label = controlGroupLabel;

                    }, this);

                    // Iterate over the View's controlGroups and set the error state
                    _(controlGroupToErrorMap).each(function(error, controlGroup) {
                        if (!_.isUndefined(error)) {
                            this.children[controlGroup].error(true, error);
                        }
                        else {
                            this.children[controlGroup].error(false, "");
                        }
                    }, this);
                }
                else {
                    _(invalidAttrs).each(function(error, invalidAttr) {
                        error.message = error.message.replace(/\{(label)\}/g, invalidAttr);
                    });
                }

                this.trigger("validated", isValid, model, invalidAttrs, this);
            }

    });
});

/**
 * @author jszeto
 * @date 10/18/12
 *
 * The DialogBase class serves as the base class for all dialog classes. It provides a template that is divided into
 * three sections, the header, body and footer. It currently uses the Bootstrap modal class for appearance and
 * functionality.
 *
 * The default behaviors are as follows:
 *
 * The header displays a title and a close button. Set the title using the settings.titleLabel attribute.
 * The body doesn't have any content. Subclasses should populate the body by overriding renderBody().
 * The footer shows a primary button and a cancel button. Set the labels of these buttons using the
 * settings.primaryButtonLabel and settings.cancelButtonLabel attributes.
 *
 * If you don't want the built-in appearance for the header, body or footer, then subclasses can override the
 * renderXHtml() functions.
 */

define('views/shared/dialogs/DialogBase',
    [
        'jquery',
        'underscore',
        'backbone',
        'views/ValidatingView',
        'module',
        'bootstrap.transition',
        'bootstrap.modal'
    ],
    function(
        $,
        _,
        Backbone,
        ValidatingView,
        module
        // bootstrap transition
        // bootstrap modal
        )
    {
        var ENTER_KEY = 13,
            TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="password"], textarea';

        return ValidatingView.extend({
            moduleId: module.id,
            className: "modal fade",
            attributes: {tabIndex: -1},
            /**
             * A model holding the settings for the Dialog.
             *
             * {String} primaryButtonLabel - label for the primary button. If not defined, primary button isn't shown
             * {String} cancelButtonLabel - label for the cancel button. If not defined, cancel button isn't shown
             * {String} titleLabel - label for the dialog title
             */
            settings: undefined,
            /**
             * CSS class to apply to the modal-body
             */
            bodyClassName: "modal-body-scrolling",

            // Subclasses must call super.initialize()
            initialize: function(options) {
                ValidatingView.prototype.initialize.call(this, options);

                options = options || {};
                // Initialize the modal
                // TODO [JCS] Look at other dialogs and add ability to not close on outside click
                this.$el.modal({show:false, keyboard:true});

                if (!_.isUndefined(options.bodyClassName))
                    this.bodyClassName = options.bodyClassName;
                // TODO [JCS] Override remove to remove event listeners on settings
                // Setup the settings
                this.settings = new Backbone.Model();
                this.settings.set("footerTemplate",this._footerTemplate);
                this.settings.set("headerTemplate",this._headerTemplate);

                // Re-render if any of the labels have changed

                this.settings.on('change:primaryButtonLabel change:cancelButtonLabel change:titleLabel',
                                  this.debouncedRender, this);

                // Hook up click event listeners. We avoid using the events array since subclasses might clobber it
                this.$el.on("click.dialog",".btn-dialog-primary", _.bind(function(event) {
                    event.preventDefault();
                    this.primaryButtonClicked();
                }, this));
                this.$el.on("click.dialog",".btn-dialog-cancel", _.bind(function(event) {
                    event.preventDefault();
                    this.cancelButtonClicked();
                }, this));
                this.$el.on("click.dialog",".btn-dialog-close", _.bind(function(event) {
                    event.preventDefault();
                    this.closeButtonClicked();
                }, this));
                this.$el.on("keypress", _.bind(function(event) {
                    if(event.which === ENTER_KEY) {
                        this.submitKeyPressed(event);
                    }
                }, this));
                this.$el.on("shown", _.bind(function(e) {
                    if (e.target !== e.currentTarget) return;
                    this.dialogShown();
                }, this));
                this.$el.on("hide", _.bind(function(e) {
                    if (e.target !== e.currentTarget) return;
                    this.cleanup();
                }, this));
                this.$el.on("hidden", _.bind(function(e) {
                    if (e.target !== e.currentTarget) return;
                    this.trigger("hidden");
                }, this));
            },
            render: function() {
                this.$(".modal-header").detach();
                this.$(".modal-body").detach();
                this.$(".modal-footer").detach();

                var html = this.compiledTemplate({
                    bodyClassName:this.bodyClassName});

                this.$el.html(html);

                this.renderHeader(this.$(".modal-header"));
                this.renderBody(this.$(".modal-body"));
                this.renderFooter(this.$(".modal-footer"));

                return this;
            },
            hide: function() {
                this.$el.modal('hide');
            },
            show: function() {
                this.$el.modal('show');
            },
            /**
             * Called when the primary button has been clicked.
             */
            primaryButtonClicked: function() {
                this.trigger("click:primaryButton", this);
            },
            /**
             * Called when the cancel button has been clicked.
             */
            cancelButtonClicked: function() {
                this.trigger("click:cancelButton", this);
            },
            /**
             * Called when the close button has been clicked.
             */
            closeButtonClicked: function() {
                this.trigger("click:closeButton", this);
            },
            /**
             * Called when the "submit key" is pressed.  Currently the submit key is hard-coded to the enter key,
             * but this may become configurable in the future.
             *
             * @param event
             */
            submitKeyPressed: function(event) {
                var $target = $(event.target);
                // if the currently focused element is any kind of text input,
                // make sure to blur it so that any change listeners are notified
                if($target.is(TEXT_INPUT_SELECTOR)) {
                    $target.blur();
                }
                // manually trigger the primary button click handler
                this.primaryButtonClicked();
            },
            /**
             * Called when the dialog has been shown. Subclasses can override with their own handlers
             */
            dialogShown: function() {
                this.trigger("show");
                // Apply focus to the first text input in the dialog. [JCS] Doesn't work without doing a debounce. Not sure why.
                _.debounce(function() {
                    this.$('input:text:enabled:visible:first').focus();
                }.bind(this), 0)();
                return;
            },
            /**
             * Called when the dialog has been closed. Subclasses can override with their own cleanup logic
             */
            cleanup: function() {
                this.trigger("hide");
                return;
            },
            /**
             * Render the dialog body. Subclasses should override this function
             *
             * @param $el The jQuery DOM object of the body
             */
            renderBody : function($el) {
                // No op
            },
            /**
             * Render the header.
             *
             * @param $el The jQuery DOM object of the header
             */
            renderHeader : function($el) {
                // To perform jQuery manipulation, wrap the header template in a div.
                // Insert the titleLabel into the title placeholder
                $el.html(this.settings.get("headerTemplate"));
                $el.find(".text-dialog-title").html(this.settings.get("titleLabel"));
            },
            /**
             * Renders the dialog footer. The default implementation takes the settings.footerTemplate
             * and searches for primary and cancel buttons. If a label is defined for it, then it will show the button
             * and set its label. Otherwise, it will hide the button.
             *
             * Subclasses can override this to customize the footer html.
             *
             * @param $el The jQuery DOM object of the footer
             */
            renderFooter : function($el) {
                // To perform jQuery manipulation, wrap the header template in a div.
                $el.html(this.settings.get("footerTemplate"));

                // If the primary button label is undefined, then don't show the button
                var primaryButton = $el.find(".btn-dialog-primary.label_from_data");
                if (this.settings.has("primaryButtonLabel"))
                {
                    primaryButton.html(this.settings.get("primaryButtonLabel"));
                    primaryButton.show();
                }
                else
                {
                    primaryButton.html('');
                    primaryButton.hide();
                }

                // If the cancel button label is undefined, then don't show the button
                var cancelButton = $el.find(".btn-dialog-cancel.label_from_data");
                if (this.settings.has("cancelButtonLabel"))
                {
                    cancelButton.html(this.settings.get("cancelButtonLabel"));
                    cancelButton.show();
                }
                else
                {
                    cancelButton.html('');
                    cancelButton.hide();
                }
            },
            template: '\
                <div class="modal-header"></div>\
                <div class="modal-body <%- bodyClassName %>"></div>\
                <div class="modal-footer"></div>\
            ',
            _footerTemplate: '\
                <a href="#" class="btn btn-dialog-cancel label_from_data pull-left" data-dismiss="modal"></a>\
                <a href="#" class="btn btn-primary btn-dialog-primary label_from_data pull-right"></a>\
            ',
            _headerTemplate: '\
                <button type="button" class="close btn-dialog-close" data-dismiss="modal">x</button>\
                <h3 class="text-dialog-title"></h3>\
            '
        });
    }
);

/**
 * @author jszeto
 * @date 10/22/12
 */

define('views/shared/dialogs/TextDialog',
    [
        'jquery',
        'underscore',
        'views/shared/dialogs/DialogBase',
        'module', 
        'views/shared/FlashMessages'
    ],
    function(
        $,
        _,
        DialogBase,
        module, 
        FlashMessagesView
    )
    {

        return DialogBase.extend({ 
            moduleId: module.id,
            _text: "",
            initialize: function(options) {
                DialogBase.prototype.initialize.call(this, options);
                // Set default values for the button labels
                this.settings.set("primaryButtonLabel",_("Ok").t());
                this.settings.set("cancelButtonLabel",_("Cancel").t());
                if(this.options.flashModel){
                    this.children.flashMessages = new FlashMessagesView({model: this.options.flashModel});
                    //reset flashmessages to clear pre-existing flash messages on 'cancel' or 'close' of dialog
                    this.on('hide', this.options.flashModel.error.clear, this.options.flashModel.error); 
                }
                this.on('hidden', this.remove, this); //clean up dialog after it is closed
                this.doDefault = true; 
            },
            primaryButtonClicked: function() {
                DialogBase.prototype.primaryButtonClicked.call(this);
                if (this.doDefault){
                    this.hide();
                }
            },
            setText : function(value) {
                this._text = value;
                this.debouncedRender();
            },
            closeDialog: function(){
            //if delete succeeds
                this.hide(); 
                this.remove(); 
            },
            preventDefault: function(){
                this.doDefault = false; 
            },
            /**
             * Render the dialog body. Subclasses should override this function
             *
             * @param $el The jQuery DOM object of the body
             */
            renderBody : function($el) {
                $el.html(this.bodyTemplate);
                $el.find(".text-dialog-placeholder").html(this._text);
                if(this.children.flashMessages){
                    $el.find(".text-dialog-placeholder").prepend(this.children.flashMessages.render().el);
                }
            },
            bodyTemplate: '\
                <span class="text-dialog-placeholder"></span>\
            '
        });
    }
);


define('views/dashboards/panelcontrols/Master',[
    'underscore',
    'views/Base',
    'models/Base',
    'jquery',
    'module',
    'views/shared/controls/SyntheticSelectControl',
    'views/shared/delegates/Popdown',
    'views/shared/reportcontrols/details/Master',
    'collections/services/authorization/Roles',
    'models/Application',
    'views/dashboards/panelcontrols/titledialog/Modal',
    'views/dashboards/panelcontrols/querydialog/Modal',
    'views/dashboards/panelcontrols/ReportDialog',
    'views/dashboards/panelcontrols/CreateReportDialog',
    'uri/route',
    'util/console', 
    'splunk.util',
    'views/shared/dialogs/TextDialog'
],
function(_,
         BaseView,
         BaseModel,
         $,
         module,
         SyntheticSelectControl,
         Popdown,
         ReportDetailsView,
         RolesCollection,
         ApplicationModel,
         TitleDialogModal,
         QueryDialogModal,
         ReportDialog,
         CreateReportDialog,
         route,
         console, 
         splunkUtils, 
         TextDialog
    ){

    var PanelControls = BaseView.extend({
        moduleId: module.id,
        initialize: function(options){
            BaseView.prototype.initialize.apply(this, arguments);

            this.model.report.on('change:id', this.updateReportView, this);
            this.model.report.entry.content.on('change', this.updateReportView, this);

            this.collection = this.collection || {};
            this.collection.roles = new RolesCollection({});
            this.collection.roles.fetch();
        },
        onChangeElementTitle: function(e) {
            e.preventDefault();
            this.children.titleDialogModal = new TitleDialogModal({
                model:  {
                    report: this.model.working, 
                    dashboard: this.model.dashboard
                },
                onHiddenRemove: true
            });

            $("body").append(this.children.titleDialogModal.render().el);
            this.children.titleDialogModal.show();
            this.children.popdown.hide();
        },
        onChangeSearchString: function(e) {
            e.preventDefault();
            this.children.queryDialogModal = new QueryDialogModal({
                model:  {
                    report: this.model.report,
                    appLocal: this.model.appLocal,
                    application: this.model.application,
                    user: this.model.user,
                    dashboard: this.model.dashboard,
                    state: this.model.state
                },
                onHiddenRemove: true
            });

            $("body").append(this.children.queryDialogModal.render().el);
            this.children.queryDialogModal.show();
            this.children.popdown.hide();
        },
        updateReportView: function(){
            this.debouncedRender();
        },
        render: function(){
            var panelClass,
                templateArgs = {};

            if (this.model.report.get('id')){
                panelClass = this.model.report.isPivotReport() ? "icon-report-pivot" : "icon-report-search";
            }
            else {
                panelClass = this.model.report.isPivotReport() ? "icon-pivot" : "icon-search-thin";
            }
            templateArgs['panelClass'] = panelClass;

            this.$el.html(this.compiledTemplate(templateArgs));
            this.children.popdown = new Popdown({ el: this.el, mode: 'dialog' });

            this._renderPanelControls();

            return this;
        },
        _renderPanelControls: function(){
            this.$('.dropdown-menu').html(_.template(this._panelControlsTemplate, { _:_ }));
            var panelType;
            if (this.model.report.get('id')){
                panelType = this.model.report.isPivotReport() ? _("PIVOT REPORT").t() : _("SEARCH REPORT").t();
            }
            else {
                panelType = this.model.report.isPivotReport() ? _("INLINE PIVOT").t() : _("INLINE SEARCH").t();
            }

            var panelTypeLI = _.template('<li class="panelType"><%- panelType %></li>', {panelType: panelType});
            if (this.model.report.get('id')){
                var reportList = _.template('<ul class="report_actions"><%= panelTypeLI %>' +
                        '<li><a class="viewPanelReport" href="#"><%- reportName %>' +
                        '<span class="icon-triangle-right-small"></span></a></li></ul>',
                        {panelTypeLI: panelTypeLI, reportName: this.model.report.entry.get('name')});

                this.$('.panel_actions').before(reportList);
                this.$('.panel_actions').prepend('<li><a href="#" class="changeElementTitle">'+_("Edit Title").t()+'</a></li>');
            }
            else {
                this.$('.panel_actions').prepend($('<li><a class="convertToReport" href="#">'+_("Convert to Report").t()+'</a></li>'));
                this.$('.panel_actions').prepend('<li><a href="#" class="changeSearchString">'+_("Edit Search String").t()+'</a></li>');
                this.$('.panel_actions').prepend('<li><a href="#" class="changeElementTitle">'+_("Edit Title").t()+'</a></li>');
                this.$('.panel_actions').prepend(panelTypeLI);
            }
        },
        _panelControlsTemplate: '\
                <div class="arrow"></div>\
                <ul class="panel_actions">\
                    <li><a class="deletePanel" href="#"><%- _("Delete").t() %></a></li>\
                </ul>\
        ',
        template: '\
            <a class="dropdown-toggle btn-pill" href="#">\
                    <span class="<%- panelClass %>"></span><span class="caret"></span>\
            </a>\
            <div class="dropdown-menu">\
            </div>\
        ',
        onDelete: function(e){
            e.preventDefault();

            this.children.dialog = new TextDialog({
                id: "modal_delete", 
                "flashModel": this.model.dashboard
            });

            this.model.report.on('successfulDelete', this.children.dialog.closeDialog, this.children.dialog);  
            this.children.dialog.settings.set("primaryButtonLabel",_("Delete").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._dialogDeleteHandler, this);
            this.children.dialog.settings.set("titleLabel",_("Delete").t());
            this.children.dialog.setText(splunkUtils.sprintf(
                _("Are you sure you want to delete %s?").t(), '<em>' + _.escape(this.model.report.entry.content.get('display.general.title')) + '</em>'));
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
        },
        
        _dialogDeleteHandler: function(e) {
            e.preventDefault(); 
            this.model.report.trigger('deleteReport'); 
            console.log('deleteReport event triggered');
        },
        onViewPanelReport: function(e){
            e.preventDefault();
            e.stopPropagation();
            var template = '', viewReportLink, editReportLink,
                root = this.model.application.get('root'),
                locale = this.model.application.get('locale'),
                app = this.model.application.get('app');
            viewReportLink = route.report(root, locale, app, {data: {s: this.model.report.get('id')}});
            if (this.model.report.isPivotReport()){
                template = this.pivotReportDetailsTemplate;
                editReportLink = route.pivot(root, locale, app, {data: {s: this.model.report.get('id')}});
            } else {
                template = this.searchReportDetailsTemplate;
                editReportLink = route.search(root, locale, app, {data: {s: this.model.report.get('id')}});
            }
            this.$('.dropdown-menu').html(_.template(template, { viewReportLink: viewReportLink, editReportLink: editReportLink, _:_ }));

            if(this.children.reportDetails) {
                this.children.reportDetails.remove();
            }

            this.children.reportDetails = new ReportDetailsView({
                model: {
                    report: this.model.report,
                    application: this.model.application,
                    appLocal: this.model.appLocal,
                    user: this.model.user
                },
                collection: this.collection.roles
            });

            this.$('.reportDetails').prepend($("<li/>").addClass('reportDetailsView').append(this.children.reportDetails.render().el));
            var desc = this.model.report.entry.content.get('description');
            if(desc) {
                this.$('.reportDetails').prepend($("<li/>").addClass('report-description').text(desc));
            }
            this.$('.reportDetails').prepend($("<li/>").addClass('report-name').text(this.model.report.entry.get('name')));
            this.$('.dropdown-menu').addClass('show-details');
            $(window).trigger('resize');
        },
        searchReportDetailsTemplate: '\
            <div class="arrow"></div>\
            <a class="dialogBack btn" href="#"><span class="icon-triangle-left-small"/> <%- _("Back").t() %></a>\
            <ul class="reportDetails">\
                <li><a href="<%- viewReportLink %>" class="viewSearchReport"><%- _("View").t() %></a></li>\
                <li><a href="<%- editReportLink %>" class="openSearchReport"><%- _("Open in Search").t() %></a></li>\
                <li><a href="#" class="cloneSearchReport"><%- _("Clone to an Inline Search").t() %></a></li>\
            </ul>\
            <ul class="reportActions">\
                <li><a href="#" class="selectNewReport"><%- _("Select New Report").t() %></a></li>\
                <li><a href="#" class="useReportFormatting"><%- _("Use Report\'s Formatting for this Content").t() %></a></li>\
            </ul>\
        ',
        pivotReportDetailsTemplate: '\
            <div class="arrow"></div>\
            <a class="dialogBack btn" href="#"><span class="icon-triangle-left-small"/> <%- _("Back").t() %></a>\
            <ul class="reportDetails">\
                <li><a href="<%- viewReportLink %>" class="viewPivotReport"><%- _("View").t() %></a></li>\
                <li><a href="<%- editReportLink %>" class="openPivotReport"><%- _("Open in Pivot").t() %></a></li>\
                <li><a href="#" class="clonePivotReport"><%- _("Clone to an Inline Pivot").t() %></a></li>\
            </ul>\
            <ul class="reportActions">\
                <li><a class="selectNewReport"><%- _("Select New Report").t() %></a></li>\
                <li><a class="useReportFormatting"><%- _("Use Report\'s Formatting for this Content").t() %></a></li>\
            </ul>\
        ',
        onDialogBack: function(e){
            e.preventDefault();
            e.stopPropagation();
            this._renderPanelControls();
            this.$('.dropdown-menu').removeClass('show-details');
            $(window).trigger('resize');
        },
        tbd: function(e){
            e.preventDefault();
            alert("Coming soon to a Splunk near you!");
        },
        convertToInlineSearch: function(e){
            e.preventDefault();
            this.children.dialog = new TextDialog({
                id: "modal_inline",
                "flashModel": this.model.dashboard
            });
            this.children.dialog.settings.set("primaryButtonLabel",_("Clone to Inline Search").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._convertToInlineSearch, this);
            this.model.report.on('successfulManagerChange', this.children.dialog.closeDialog, this.children.dialog);  
            this.children.dialog.settings.set("titleLabel", _("Clone to Inline Search").t());
            this.children.dialog.setText('<div>\
                <p>'+_("The report will be cloned to an inline search.").t()+'</p>\
                <p>'+_("The inline search:").t()+'\
                </p><ul>\
                <li>'+_("Cannot be scheduled.").t()+'</li>\
                <li>'+_("Will run every time the dashboard is loaded.").t()+'</li>\
                <li>'+_("Will use the permissions of the dashboard.").t()+'</li>\
                </ul>\
                </div>');
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
        },
        convertToInlinePivot: function(e){
            e.preventDefault();
            this.children.dialog = new TextDialog ({
                id: "modal_inline",
                "flashModel": this.model.dashboard
            });
            this.children.dialog.settings.set("primaryButtonLabel",_("Clone to Inline Pivot").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._convertToInlineSearch, this);
            this.model.report.on('successfulManagerChange', this.children.dialog.closeDialog, this.children.dialog);
            this.children.dialog.settings.set("titleLabel", _("Clone to Inline Pivot").t());
            this.children.dialog.setText('<div>\
                <p>'+_("The report will be cloned to an inline pivot.").t()+'</p>\
                <p>'+_("The inline pivot:").t()+'\
                </p><ul>\
                <li>'+_("Cannot be scheduled.").t()+'</li>\
                <li>'+_("Will run every time the dashboard is loaded.").t()+'</li>\
                <li>'+_("Will use the permissions of the dashboard.").t()+'</li>\
                </ul>\
                </div>');
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
            
        },
        _convertToInlineSearch: function(e){
            e.preventDefault();
            this.model.report.trigger("makeInline");
            console.log("makeInline event triggered"); 
        },
        useReportFormatting: function(e){
            e.preventDefault();

            this.children.dialog = new TextDialog({
                id: "modal_use_report_formatting", 
                "flashModel": this.model.dashboard
            });

            this.children.dialog.settings.set("primaryButtonLabel",_("Use Report's Formatting").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._useReportFormatting, this);
            this.model.report.on('successfulReportFormatting', this.children.dialog.closeDialog, this.children.dialog);  
            this.children.dialog.settings.set("titleLabel",_("Use Report's Formatting").t());
            this.children.dialog.setText(_("This will change the content's formatting to the report's formatting. Are you sure you want use the report's formatting?").t());
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
        },
        _useReportFormatting: function(e){
            e.preventDefault(); 
            this.model.report.trigger("useReportFormatting");
            console.log('useReportFormatting event triggered');
        },
        selectNewReport: function(e) {
            e.preventDefault();
            this.children.newReportDialog = new ReportDialog({
                model:  {
                    report: this.model.report, 
                    dashboard: this.model.dashboard, 
                    application: this.model.application
                },
                controller: this.options.controller, 
                onHiddenRemove: true
            });

            $("body").append(this.children.newReportDialog.render().el);
            this.children.newReportDialog.show();
            this.children.popdown.hide();
        },
        convertToReport: function(e){
            e.preventDefault();
            this.children.createReportDialog = new CreateReportDialog({
                model:  {
                    report: this.model.report, 
                    dashboard: this.model.dashboard
                },
                onHiddenRemove: true
            });

            $("body").append(this.children.createReportDialog.render().el);
            this.children.createReportDialog.show();
            this.children.popdown.hide();
        },
        events: {
            'click a.deletePanel': 'onDelete',
            'click a.viewPanelReport': 'onViewPanelReport',
            'click a.changeElementTitle': "onChangeElementTitle",
            'click a.changeSearchString': "onChangeSearchString",
            'click a.dialogBack': "onDialogBack",
            'click a.cloneSearchReport': "convertToInlineSearch",
            'click a.clonePivotReport': "convertToInlinePivot",
            'click a.selectNewReport': "selectNewReport",
            'click a.convertToReport': "convertToReport",
            'click a.useReportFormatting': "useReportFormatting",
            'click a': function(e){
                // SPL-66074 - Catch all: open regular links in a new window
                var link = $(e.currentTarget).attr('href');
                if(link && link[link.length-1] !== '#') {
                    e.preventDefault();
                    window.open(link);
                }
            }, 
            'click li.reportDetailsView a': function(e){
                this.children.popdown.hide(); 
            }
        }

    });
    return PanelControls;
});

define('splunkjs/mvc/simplexml/paneleditor',['require','exports','module','../mvc','../basesplunkview','views/shared/vizcontrols/Master','views/dashboards/panelcontrols/Master','../savedsearchmanager','../searchmanager','splunkjs/mvc/utils','underscore','splunk.config','models/Base','util/console','./controller','../tokenawaremodel','models/DashboardReport'],function(require, exports, module) {
    var mvc = require('../mvc');
    var BaseSplunkView = require('../basesplunkview');
    var FormatControls = require('views/shared/vizcontrols/Master');
    var PanelControls = require('views/dashboards/panelcontrols/Master');
    var SavedSearchManager = require('../savedsearchmanager');
    var SearchManager = require('../searchmanager');
    var utils = require('splunkjs/mvc/utils');
    var _ = require('underscore');
    var splunkConfig = require('splunk.config');
    var BaseModel = require('models/Base');
    var console = require('util/console');
    var controller = require('./controller');
    var TokenAwareModel = require('../tokenawaremodel');
    var DashboardReport = require('models/DashboardReport'); 

    /**
     * Working model for a DashboardReport model
     * Delegates to saveXML() when save() is called
     */
    var WorkingModel = DashboardReport.extend({
        initialize: function(attrs, options) {
            DashboardReport.prototype.initialize.apply(this, arguments);
            this._report = options.report;

            this.entry.content = new TokenAwareModel({}, {
                applyTokensByDefault: true,
                retrieveTokensByDefault: true
            });

            this.setFromSplunkD(this._report.toSplunkD());

            // Make sure the working model stays up-to-date while in edit mode
            this.contentSyncer = utils.syncModels({
                source: this._report.entry.content,
                dest: this.entry.content,
                auto: 'push'
            });
            this.entrySyncer = utils.syncModels({
                source: this._report.entry,
                dest: this.entry,
                auto: 'push'
            });
        },
        save: function(attrs, options) {
            if(attrs) {
                this.set(attrs, options);
            }
            this._report.entry.set(this.entry.toJSON());
            this._report.entry.content.set(this.entry.content.toJSON({ tokens: true }));

            //return deferred that is returned by .save()
            return this._report.saveXML(options); 
        },
        syncOff: function() {
            this.contentSyncer.destroy();
            this.entrySyncer.destroy();
            this.off();
        }
    });

    var EditPanel = BaseSplunkView.extend({
        className: 'panel-editor',
        initialize: function() {
            this.children = this.children || {};
            BaseSplunkView.prototype.initialize.call(this);
            //create the report and state models
            this.model = this.model || {};
            this.model.report = this.model.report || new DashboardReport();
            this.model.working = new WorkingModel({}, { report: this.model.report });
            this.model.application = controller.model.app;
            this.manager = this.options.manager;
            this._instantiateChildren();
            this.bindToComponent(this.manager, this.onManagerChange, this);

            this.listenTo(this.model.report, 'makeInline', this._makePanelInline, this);
            this.listenTo(this.model.report, 'useReportFormatting', this._useReportFormatting, this);
            this.listenTo(this.model.report, 'updateReportID', this._updateReportID, this);
            this.listenTo(this.model.report, 'saveAsReport', this._saveAsReport, this);
            this.listenTo(this.model.report, 'updateSearchString', this._updateSearchManager, this);
            this.listenTo(this.model.report, 'deleteReport', this._deleteReport, this);
            //use this.model.working instead of this.model.report for dialogs that use tokens
            this.listenTo(this.model.working, 'saveTitle', this._saveTitle, this);

            this.model.user = controller.model.user;
            this.model.appLocal = controller.model.appLocal;
        },
        _instantiateChildren: function() {
            //create the child views
            this.children.vizControl = new FormatControls({
                model: { report: this.model.working, application: this.model.application },
                vizTypes: ['events', 'statistics', 'visualizations'],
                saveOnApply: true,
                dashboard: true
            });
            
            this.children.panelControl = new PanelControls({
                model: {
                    report: this.model.report,
                    working: this.model.working,
                    application: this.model.application,
                    appLocal: this.model.appLocal,
                    user: this.model.user, 
                    dashboard: controller.model.view,
                    state: controller.getStateModel()
                }, 
                controller: controller
            });
        },
        remove: function() {
            this.model.working.syncOff();
            this._removeChildren();
            BaseSplunkView.prototype.remove.apply(this, arguments);
        },
        _removeChildren: function() {
            this.children.vizControl.remove();
            this.children.panelControl.remove();
        },
        _updateSearchManager: function(newAttributes) {
            //preserve old state before search info is updated
            var oldState = this.model.report.toSplunkD(); 

            //update search info (note: we are passing newAttributes instead of newState as model.workingReport does not have toSplunkD() method)
            this.model.report.entry.content.set(newAttributes);

            var dfd = this.model.report.saveXML();
            dfd.done(_.bind(function(){
                //notify modal dialog of save success, so that the dialog knows to hide itself
                this.model.report.trigger("successfulSave"); 
                //update search manager with new search info 
                var manager = mvc.Components.get(this.manager);
                if(manager.query) {
                    manager.query.set('search', this.model.report.entry.content.get('search', { tokens: true }), { tokens: true, silent: false });
                }
                if(manager.search) {
                    manager.search.set({
                        'earliest_time': this.model.report.entry.content.get('dispatch.earliest_time', { tokens: true }),
                        'latest_time': this.model.report.entry.content.get('dispatch.latest_time', { tokens: true })
                    }, {tokens: true});
                }
            }, this)); 
            dfd.fail(_.bind(function(){
                //restore state and notify listeners to re-render views
                this.model.report.setFromSplunkD(oldState, {silent: false}); 
            }, this));             
        },

        onManagerChange: function() {
            this._removeChildren();
            this._instantiateChildren();
            this.render();

        },
        render: function() {
            this.$el.append(this.children.panelControl.render().el);
            this.$el.append(this.children.vizControl.render().el);
            return this;
        },
        _makePanelInline: function() {
            var oldState = this.model.report.toSplunkD(); 
            var oldName = this.model.report.entry.get('name'); 
            var oldId = this.model.report.get('id'); 

            delete this.model.report.id;
            this.model.report.unset('id', {silent: true});
            this.model.report.entry.unset('name', {silent: true}); //making inline, so remove name for getSearch() in mapper.js

            var dfd = this.model.report.saveXML();
            dfd.fail(_.bind(function(){
                //restore state and notify listeners to re-render views
                this.model.report.setFromSplunkD(oldState, {silent: false}); 
            }, this)); 
            dfd.done(_.bind(function(){
                this.model.report.trigger('successfulManagerChange'); 
                new SearchManager({
                    "id": this.manager,
                    "latest_time": this.model.report.entry.content.get('dispatch.latest_time'),
                    "earliest_time": this.model.report.entry.content.get('dispatch.earliest_time'),
                    "search": this.model.report.entry.content.get('search'),
                    "app": utils.getCurrentApp(),
                    "auto_cancel": 90,
                    "status_buckets": 0,
                    "preview": true,
                    "timeFormat": "%s.%Q",
                    "wait": 0
                }, { replace: true });

                //trigger change events on 'id' and 'name' 
                this.model.report.set({'id': oldId}, {silent: true}); 
                this.model.report.unset('id', {silent: false});

                this.model.report.entry.set({'name': oldName}, {silent: true}); 
                this.model.report.entry.unset('name', {silent: false}); 
            }, this)); 

        },
        _useReportFormatting: function() {
            //this.model.report.clear({silent: true});

            //preserve copy of report's attributes before fetch on model 
            var oldState = this.model.report.toSplunkD(); 
            var dfd = this.model.report.fetch({}, {silent: true});
            dfd.done(_.bind(function(){
                //get copy of report's attributes after fetch on model
                var newState = this.model.report.toSplunkD();
                var dfd = this.model.report.saveXML({clearOptions: true});                 
                dfd.fail(_.bind(function(){
                    //restore state and notify listeners to re-render views
                    this.model.report.setFromSplunkD(oldState, {silent: false}); 
                }, this)); 
                dfd.done(_.bind(function(){
                    this.model.report.setFromSplunkD(oldState, {silent: true}); //reset to enable listener notification in next line
                    this.model.report.setFromSplunkD(newState, {silent: false}); //notify listeners 
                    this.model.report.trigger("successfulReportFormatting"); 
                }, this)); 

            }, this)); 

        },
        _updateReportID: function(id, title) {
            //preserve copy of report's attributes before ID reset and fetch
            var oldState = this.model.report.toSplunkD(); 
            if(id){
                //set new attributes
                this.model.report.set({'id': id}, {silent: true});
                this.model.report.entry.set({'id': id}, {silent: true});
                this.model.report.id = id;
            }
            if(title){
                this.model.report.entry.content.set({"display.general.title": title});
            }

            var dfd = this.model.report.fetch({}, {silent: true});
            dfd.done(_.bind(function() {
                var dfd = this.model.report.saveXML();
                dfd.fail(_.bind(function(){
                    //restore old state and views 
                    this.model.report.setFromSplunkD(oldState, {silent: false}); 
                }, this)); 
                dfd.done(_.bind(function(){
                    //tell dialog to close itself
                    this.model.report.trigger('successfulManagerChange'); 
                    // tbd: overlay the defaults from the XML
                    
                    //update view to reflect new, successfully-saved attributes 
                    new SavedSearchManager({
                        "id": this.manager, 
                        "searchname": this.model.report.entry.get("name"),
                        "app": utils.getCurrentApp(),
                        "auto_cancel": 90,
                        "status_buckets": 0,
                        "preview": true,
                        "timeFormat": "%s.%Q",
                        "wait": 0
                    }, { replace: true });

                }, this));               
            }, this));
        },
        _saveAsReport: function(name, description) {
            var oldState = this.model.report.toSplunkD();

            //would like to add option {silent: true} to avoid notifying listeners (which updates the view) but adding it causes network 'bad request' response
            this.model.report.entry.content.set({"name": name, "description": description, "display.general.title": name}); 
            this.model.report.entry.set({'name': name}, {silent: true});

            if(this.model.report.entry.content.get('display.general.search.type') === 'postprocess') {
                // Apply base-search + post process as search for new report
                this.model.report.entry.content.set('search', mvc.Components.get(this.manager).query.resolve());
            }

            var dfd = this.model.report.save({}, { data: { app: utils.getCurrentApp(), owner: splunkConfig.USERNAME }});
            dfd.done(_.bind(function() {
                var dfd = this.model.report.saveXML(); 
                dfd.fail(_.bind(function(){
                    this.model.report.destroy(); 
                    this.model.report.unset('id', {silent: true});
                    this.model.report.setFromSplunkD(oldState, {silent: false}); //notify listeners to restore old view 
                }, this)); 
                dfd.done(_.bind(function(){
                    this.model.report.trigger("successfulReportSave");
                    new SavedSearchManager({
                        "id": this.manager,
                        "searchname": name,
                        "app": utils.getCurrentApp(),
                        "auto_cancel": 90,
                        "status_buckets": 0,
                        "preview": true,
                        "timeFormat": "%s.%Q",
                        "wait": 0
                    }, { replace: true });
                }, this));       
            }, this));
        },
        _saveTitle: function(newTitle){
            var oldState = this.model.report.toSplunkD(); 
            this.model.working.entry.content.set({'display.general.title': newTitle});
            //use this.model.working instead of this.model.report for dialogs that use tokens
            var dfd = this.model.working.save();
            dfd.fail(_.bind(function(){
                //restore old title as new title could not be saved, and notify listners to restore old views 
                this.model.report.setFromSplunkD(oldState, {silent: false}); 
            }, this)); 
            dfd.done(_.bind(function(){
                //notify modal dialog of save success, so that the dialog knows to hide itself
                this.model.working.trigger("successfulSave"); 
                //notify listeners so they update their views on displayed report model 
                this.model.report.entry.content.set({'display.general.title': ""}, {silent: false});   
                this.model.report.entry.content.set({'display.general.title': newTitle}, {silent: false});   
            }, this)); 
        }, 
        _deleteReport: function(){
            var dfd = this.model.report.deleteXML(); //returns deferred - removes panel from dashboard view
            dfd.done(_.bind(function(){
                this.model.report.trigger("successfulDelete");  
                this.model.report.trigger("removedPanel"); //removes report's XML
            }, this)); 
        }
    });

    return EditPanel;
});

define('splunkjs/mvc/simplexml/element/base',['require','underscore','jquery','backbone','../../basesplunkview','../../../mvc','../../utils','../controller','models/DashboardReport','util/console','../../progressbarview','../../refreshtimeindicatorview','../../resultslinkview','../paneleditor','../../savedsearchmanager','../../postprocessmanager','../../messages'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var BaseSplunkView = require('../../basesplunkview');
    var mvc = require('../../../mvc');
    var utils = require('../../utils');
    var Dashboard = require('../controller');
    var ReportModel = require('models/DashboardReport');
    var console = require('util/console');
    var ProgressBarView = require('../../progressbarview');
    var RefreshTimeView = require("../../refreshtimeindicatorview");
    var ResultsLinkView = require("../../resultslinkview");
    var PanelElementEditor = require('../paneleditor');
    var SavedSearchManager = require('../../savedsearchmanager');
    var PostProcessSearchManager = require('../../postprocessmanager');
    var Messages = require("../../messages");
    
    // Enable to warn whenever a SimpleXML element or visualization
    // is created without the tokens=true option.
    // 
    // All product code should be using the option.
    // Only custom JS code from the user may omit it.
    var WARN_ON_MISSING_TOKENS_TRUE = false;

    var ELEMENT_TYPES = {};

    var REPORT_DEFAULTS_LOADED = new ReportModel().fetch();

    var DashboardElement = BaseSplunkView.extend({
        initialVisualization: '#abstract',
        configure: function() {
            this.options.settingsOptions = _.extend({
                retainUnmatchedTokens: true
            }, this.options.settingsOptions || {});

            // Augment the options with the extra information we need
            this.options = _.extend(this.options, {
                id: this.id,
                // NOTE: Aliasing 'managerid' to the deprecated 'manager'
                //       setting since old code may still be depending on it.
                //       However any such code will behave oddly if the manager
                //       is changed after initialization.
                manager: this.options.managerid,
                title: this.$('h3').text()
            });
            
            if (WARN_ON_MISSING_TOKENS_TRUE && 
                this.options.settingsOptions.tokens !== true)
            {
                console.warn('element created without tokens=true: ' + this.id);
            }

            BaseSplunkView.prototype.configure.apply(this, arguments);
        },
        initialize: function () {
            this.configure();
            this.visualization = null;
            this.model = new ReportModel();
            this.managerid = this.options.managerid;

            this.settings._sync = utils.syncModels(this.settings, this.model.entry.content, {
                auto: true,
                prefix: 'display.general.',
                include: ['id', 'title', 'manager', 'managerid']
            });

            // TODO: Not using bindToComponentSetting('managerid', ...) here
            //       because this view inconsistently uses *both* the 'manager'
            //       and 'managerid' options. Thus it is not presently possible
            //       to dynamically change the 'managerid' option for SimpleXML
            //       elements, although you can for MVC components.
            //
            //       If usage of the 'manager' property can be eliminated and
            //       any assumptions about a constant manager at initialization
            //       time can be eliminated, this code can be safely
            //       transitioned. (SPL-72466)
            this.bindToComponent(this.managerid, this.onManagerChange, this);

            var typeModel = this.typeModel = new Backbone.Model({
                type: this.initialVisualization
            });

            // Deferred object is resolved once the report model is fully loaded
            this.reportReady = $.Deferred();

            this.listenTo(this.typeModel, 'change', this.createVisualization, this);
            this.listenTo(Dashboard.getStateModel(), 'change:edit', this.onEditModeChange, this);
            this.reportReady.done(_.bind(function(){
                this.listenTo(this.model.entry.content, 'change:display.general.type change:display.visualizations.type change:display.events.type', function (m) {
                    var general = m.get('display.general.type'), subName = ['display', general, 'type'].join('.'), sub = m.get(subName),
                        qualifiedType = sub ? [general, sub].join(':') : general;
                    typeModel.set('type', ELEMENT_TYPES.hasOwnProperty(qualifiedType) ? qualifiedType : general);
                }, this);
                this.listenTo(this.settings, 'change:title', this.updateTitle, this);
                this.listenTo(this.model, 'removedPanel', this.remove, this);
            },this));
        },
        remove: function(){
            this._removeVisualization();
            _([this.refreshTime, this.panelEditor]).chain().filter(_.identity).invoke('remove');
            if(this.settings) {
                if(this.settings._sync) {
                    this.settings._sync.destroy();
                }
            }
            mvc.Components.get('dashboard').removeElement(this.id);
            BaseSplunkView.prototype.remove.call(this);
        },
        onManagerChange: function(managers, manager) {
            var that = this;
            if(manager instanceof SavedSearchManager) {
                var name = manager.get('searchname'),
                        appModel = Dashboard.getStateModel().app,
                        initial = !this.model.entry.content.has('display.general.type');
                this.model.id = ['','servicesNS',appModel.get('owner'),appModel.get('app'),'saved','searches', encodeURIComponent(name)].join('/');
                this.model.fetch().done(function(){
                    if (initial) {
                        that.model.entry.content.set(that._initialVisualizationToAttributes());
                    }
                    that.reportReady.resolve(that.model);
                }).fail(function(xhr){
                            console.error('Failed to load saved search', arguments);
                            if(xhr.status === 404) {
                                that.showErrorMessage(_("Warning: saved search not found: ").t() + JSON.stringify(name));
                            }
                        });
            } else if(manager) {
                REPORT_DEFAULTS_LOADED.done(function(response){
                    // Apply the report defaults (from the _new entity) to our report model before applying specific settings
                    if (!that.model.entry.content.has('display.general.type')) {
                        // Apply defaults and initial visualization attributes if they aren't set yet
                        that.model.entry.content.set(response.entry[0].content);
                        if(that.initialVisualization !== '#abstract') {
                            that.model.entry.content.set(that._initialVisualizationToAttributes());
                        }
                    }
                    var searchType = 'inline';
                    if (manager instanceof PostProcessSearchManager) {
                        searchType = 'postprocess';
                        that.model.entry.content.set('fullSearch', manager.query.resolve());
                    }
                    that.model.entry.content.set('display.general.search.type', searchType);
                    that.model.entry.content.set({
                        search: manager.get('search', {tokens: true}),
                        "dispatch.earliest_time": manager.get('earliest_time', {tokens: true}),
                        "dispatch.latest_time": manager.get('latest_time', {tokens: true})
                    }, {tokens: true});
                    that.reportReady.resolve(that.model);
                });
            } else {
                REPORT_DEFAULTS_LOADED.done(function(response){
                    // Apply the report defaults (from the _new entity) to our report model
                    if (!that.model.entry.content.has('display.general.type')) {
                        // Apply defaults and initial visualization attributes if they aren't set yet
                        that.model.entry.content.set(response.entry[0].content);
                        if(that.initialVisualization !== '#abstract') {
                            that.model.entry.content.set(that._initialVisualizationToAttributes());
                        }
                    }
                    that.reportReady.resolve(that.model);
                });
            }
        },
        showErrorMessage: function(message) {
            this._removeInitialPlaceholder();
            var el = this.$('.panel-body>.msg');
            if(!el.length) {
                el = $('<div class="msg"></div>').appendTo(this.$('.panel-body'));
            }
            Messages.render({
                level: "error",
                icon: "warning-sign",
                message: message
            }, el);
        },
        _initialVisualizationToAttributes: function() {
            var type = this.initialVisualization.split(':'),
                attr = {
                    'display.general.type': type[0]
                };
            if (type.length > 1) {
                attr[['display', type[0], 'type'].join('.')] = type[1];
            }
            return attr;
        },
        onEditModeChange: function (model) {
            var handler = this._debouncedOnEditModeChange;
            if(!handler) {
                handler = this._debouncedOnEditModeChange = _.debounce(_.bind(this._onEditModeChange, this), 0);
            }
            this.reportReady.done(function(){
                handler(model);
            });
        },
        _onEditModeChange: function (model) {
            if (model.get('edit')) {
                if (this.refreshTime) {
                    this.refreshTime.remove();
                    this.refreshTime = null;
                }
                this.updateTitle();
                this.createPanelElementEditor();

            } else {
                if (this.panelEditor) {
                    this.panelEditor.remove();
                    this.panelEditor = null;
                }
                this.createRefreshTimeIndicator();
                this.updateTitle();
            }
        },
        createPanelElementEditor: function() {
            if (this.panelEditor) {
                this.panelEditor.remove();
                this.panelEditor = null;
            }
            this.panelEditor = new PanelElementEditor({ manager: this.managerid, model: { report: this.model } });
            this.$el.prepend(this.panelEditor.render().el);
        },
        createRefreshTimeIndicator: function () {
            if (!this.refreshTime) {
                this.refreshTime = new RefreshTimeView({
                    id: _.uniqueId(this.id + '-refreshtime'),
                    el: $('<div class="refresh-time-indicator pull-right"></div>').prependTo(this.$('.panel-head')),
                    manager: this.managerid
                }).render();
            }
        },
        createVisualization: function (applyOptions) {
            var createFn = this._debouncedCreateViz;
            if(!createFn) {
                createFn = this._debouncedCreateViz = _.debounce(_.bind(this._createVisualization, this), 0);
            }
            $.when(this.reportReady).then(function(){
                createFn(applyOptions === true);
            });
        },
        _removeVisualization: function() {
            if (this.visualization) {
                if (this.visualization.panelClassName) {
                    this.$el.removeClass(this.visualization.panelClassName);
                }
                this.visualization.off();
                // Remove will revoke it from the registry
                this.visualization.remove();
                this.visualization = null;
            }
            if (this.resultsLink) {
                this.resultsLink.off();
                // Remove will revoke it from the registry
                this.resultsLink.remove();
                this.resultsLink = null;
            }
        },
        _removeInitialPlaceholder: function(){
            this.$('.panel-body > .msg, .panel-body > .initial-placeholder').remove();
        },
        _createVisualization: function (applyOptions) {
            var initial = !this.visualization;
            this._removeInitialPlaceholder();
            this._removeVisualization();
            var type = this.typeModel.get('type'),
                Element = ELEMENT_TYPES[type];

            if (!Element) {
                this.showErrorMessage(_("Unsupported visualization type: ").t() + JSON.stringify(type));
                return;
            }
            var options = {
                el: $('<div></div>').appendTo(this.$('.panel-body')),
                reportModel: this.model.entry.content,
                managerid: this.settings.get('manager'),
                id: _.uniqueId(this.id + '-viz-')
            };
            if (initial || applyOptions) {
                // Only pass the component options down when the initial visualization is created
                options = _.extend({}, this.options, options);
            }
            if (options.settingsOptions) {
                // Do not pass through retainUnmatchedTokens=true to visualization
                options.settingsOptions.retainUnmatchedTokens = false;
            }
            if (WARN_ON_MISSING_TOKENS_TRUE &&
                (options.settingsOptions || {}).tokens !== true)
            {
                console.warn('viz created without tokens=true: ' + options.id);
            }
            this.visualization = new Element(options).render();

            if (this.visualization.panelClassName) {
                this.$el.addClass(this.visualization.panelClassName);
            }

            // If we are switching this visualization to the events visualization,
            // then we need to set any search manager to have status_buckets > 0
            if (type.indexOf("events") === 0) {
                var manager = mvc.Components.getInstance(this.settings.get('manager'));
                manager.search.set('status_buckets', 300);
            }

            this.trigger('create:visualization', this.visualization);

            if (initial) {
                this.model.entry.content.set(_.defaults(this.model.entry.content.toJSON({ tokens: true }), this.visualization.reportDefaults));
            }
            if (typeof this.visualization.getResultsLinkOptions === 'function') {
                var resultsLinkOptions = this.visualization.getResultsLinkOptions(this.options) || {};
                this.resultsLink = new ResultsLinkView(_.extend({}, resultsLinkOptions, this.options, {
                    id: _.uniqueId(this.id + '-resultslink'),
                    el: $('<div class="view-results pull-left"></div>').appendTo(this.$('.panel-footer')),
                    manager: this.managerid,
                    model: this.model
                })).render();
            }

            this.visualization.on('all', this.trigger, this);
        },
        getVisualization: function(callback) {
            var dfd = $.Deferred();
            if(callback) {
                dfd.done(callback);
            }
            if(this.visualization) {
                dfd.resolve(this.visualization);
            } else {
                this.once('create:visualization', dfd.resolve, dfd);
            }
            return dfd.promise();
        },
        render: function () {
            this.createPanelStructure();

            if (!this.progressBar) {
                this.progressBar = new ProgressBarView({
                    id: _.uniqueId(this.id + "-progressbar"),
                    manager: this.managerid,
                    el: $('<div class="progress-container pull-right"></div>').prependTo(this.$('.panel-footer'))
                }).render();
            }

            this.createRefreshTimeIndicator();
            this.createVisualization();
            this.onEditModeChange(Dashboard.getStateModel());
            return this;
        },
        createPanelStructure: function () {
            if (!this.$('.panel-head').length) {
                $('<div class="panel-head"></div>').prependTo(this.$el);
            }
            var $title = this.$('.panel-head>h3');
            if (!$title.length) {
                $('<h3></h3>').prependTo(this.$('.panel-head'));
            }
            this.updateTitle();

            if (!this.$('.panel-body').length) {
                $('<div class="panel-body"></div>').appendTo(this.$el);
            }
            var el = $('<div class="initial-placeholder"></div>').addClass('placeholder-' + this.initialVisualization.replace(/\W+/,'-'));
            el.appendTo(this.$('.panel-body'));
            if (!this.$('panel-footer').length) {
                $('<div class="panel-footer"></div>').appendTo(this.$el);
            }
            // this.$('.panel-footer').addClass('clearfix');
        },
        updateTitle: function () {
            var title = this.settings.get('title') || '';
            if(Dashboard.getStateModel().get('edit') && !title) {
                this.$('.panel-head>h3').empty().append($('<span class="untitled">'+_("Untitled Panel").t()+'</span>'));
            } else {
                this.$('.panel-head>h3').text(title);
            }
        },
        getExportParams: function(prefix) {
            var manager = mvc.Components.get(this.managerid), result = {};
            if(manager && (!(manager instanceof PostProcessSearchManager)) && manager.job && manager.job.sid) {
                result[prefix] = manager.job.sid;
            }
            return result;
        }
    }, {
        registerVisualization: function (name, clazz) {
            ELEMENT_TYPES[name] = clazz;
        },
        getVisualization: function(name) {
            var viz = ELEMENT_TYPES[name];
            if(!viz) {
                viz = ELEMENT_TYPES[name.split(':')[0]];
            }
            return viz;
        }
    });

    return DashboardElement;
});

define('splunkjs/mvc/simplexml/dialog/addpanel/inline',['require','underscore','jquery','views/Base','views/shared/controls/ControlGroup','util/console','../../../utils','uri/route','util/time_utils','views/dashboards/PanelTimeRangePicker','bootstrap.tooltip'],function(require){
    var _ = require('underscore'),
        $ = require('jquery'),
        BaseView = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var console = require('util/console');
    var utils = require('../../../utils');
    var route = require('uri/route');
    var time_utils = require('util/time_utils');
    var PanelTimeRangePicker = require('views/dashboards/PanelTimeRangePicker');
    require('bootstrap.tooltip');

    return BaseView.extend({
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);

            this.children.searchField = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'search',
                    model: this.model.report
                },
                label: _("Search String").t(),
                help: '<a href="#" class="run-search">'+_("Run Search").t()+' <i class="icon-external"></i></a>'
            });

            this.listenTo(this.model.report, 'change:elementCreateType', this.onModeChange, this);

            this.children.panelTimeRangePicker = new PanelTimeRangePicker({
                model: {
                    timeRange: this.model.timeRange,
                    report: this.model.report,
                    state: this.model.state
                },
                collection: this.collection
            });

            this.model.report.set({
                'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                'dispatch.latest_time':this.model.timeRange.get('latest')
            }, {tokens: true});
        },
        events: {
            'click a.run-search': function(e) {
                e.preventDefault();
                var search = this.model.report.get('search'), params = { q: search }, pageInfo = utils.getPageInfo();
                if(!search) {
                    return;
                }
                if(this.model.report.has('dispatch.earliest_time')) {
                    params.earliest = this.model.report.get('dispatch.earliest_time');
                    params.latest = this.model.report.get('dispatch.latest_time');
                }
                utils.redirect(route.search(pageInfo.root, pageInfo.locale, pageInfo.app, { data: params }), true);
            }
        },
        onModeChange: function() {
            var fn = this.model.report.get('elementCreateType') === 'inline' ? 'show' : 'hide';
            this.$el[fn]();
        },
        render: function() {
            this.children.searchField.render().appendTo(this.el);

            this.children.panelTimeRangePicker.render().appendTo(this.el);

            this.onModeChange();
            
            return this;
        }
    });

});
define('splunkjs/mvc/simplexml/dialog/addpanel/report',['require','underscore','jquery','views/Base','views/shared/controls/ControlGroup','../../../utils','util/time_utils','models/Cron','splunk.util','uri/route','collections/services/SavedSearches','views/shared/Modal'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            Base = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var utils = require('../../../utils');
    var timeUtils = require('util/time_utils');
    var Cron = require('models/Cron');
    var splunkUtil = require('splunk.util');
    var route = require('uri/route');
    var SavedSearches = require('collections/services/SavedSearches');
    var Modal = require('views/shared/Modal');

    return Base.extend({
        initialize: function() {
            Base.prototype.initialize.apply(this, arguments);
            this.children.reportPlaceholder = new Base();
            this.controller = this.options.controller;

            if(!this.controller.reportsCollection){
                this.controller.fetchCollection();
            }

            this.controller.reportsCollection.initialFetchDfd.done(_.bind(function() {
                var items = this.controller.reportsCollection.map(function(report){
                    return { label: report.entry.get('name'), value: report.id };
                });
                var pageInfo = utils.getPageInfo();
                var reportsLink = route.reports(
                    pageInfo.root,
                    pageInfo.locale,
                    pageInfo.app
                );

                if(this.controller.reportsCollection.length === this.controller.reportsCollection.REPORTS_LIMIT){
                    this.children.report = new ControlGroup({
                        label: "",
                        controlType: 'SyntheticSelect',
                        controlOptions: {
                            className: 'btn-group add-panel-report',
                            toggleClassName: 'btn',
                            model: this.model,
                            modelAttribute: 'savedSearch',
                            items: items,
                            popdownOptions: {
                                attachDialogTo: '.modal:visible',
                                scrollContainer: '.modal:visible .modal-body:visible'
                            }
                        },
                        help: _("This does not contain all reports. Add a report that is not listed from ").t() + splunkUtil.sprintf('<a href=%s>%s</a>.', reportsLink, _('Reports').t())
                    });
                }else{
                    this.children.report = new ControlGroup({
                        label: "",
                        controlType: 'SyntheticSelect',
                        controlOptions: {
                            className: 'btn-group add-panel-report',
                            toggleClassName: 'btn',
                            model: this.model,
                            modelAttribute: 'savedSearch',
                            items: items,
                            popdownOptions: {
                                attachDialogTo: '.modal:visible',
                                scrollContainer: '.modal:visible .modal-body:visible'
                            }
                        }
                    });
                }
                this.model.set('savedSearch', items[0].value);
            }, this));

            this.children.searchField = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'savedSearchString',
                    model: this.model
                },
                label: _("Search String").t(),
                help: '<a href="#" class="run-search">'+_("Run Search").t()+' <i class="icon-external"></i></a>'
            });

            this.children.timerangeField = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'savedSearchTimerange',
                    model: this.model
                },
                label: _("Time Range").t()
            });

            this.children.schedule = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'savedSearchSchedule',
                    model: this.model
                },
                label: _("Schedule").t()
            });

            this.children.permissions = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'savedSearchPermissions',
                    model: this.model
                },
                label: _("Permissions").t()
            });

            this.model.set('savedSearchString', '...');
            this.listenTo(this.model, 'change:elementCreateType', this.onModeChange, this);
            this.listenTo(this.model, 'change:savedSearch', this.searchSelected, this);
        },
        events: {
            'click a.run-search': function(e) {
                e.preventDefault();
                var savedSearch = this.model.get('savedSearch');
                if(!savedSearch) {
                    return;
                }

                var pageInfo = utils.getPageInfo(), url = route.search(pageInfo.root, pageInfo.locale, pageInfo.app, {
                    data: { s: savedSearch }
                });
                utils.redirect(url, true);
            }
        },
        searchSelected: function() {
            var savedSearch = this.model.get('savedSearch');
            var report = this.controller.reportsCollection.get(savedSearch);

            this.model.set('savedSearchName', report.entry.get('name'));
            this.model.set('savedSearchString', report.entry.content.get('search'));
            var et = report.entry.content.get('dispatch.earliest_time'),
                    lt = report.entry.content.get('dispatch.latest_time');

            var vizType = 'statistics', sub;
            if(report.entry.content.has('display.general.type')) {
                vizType = report.entry.content.get('display.general.type');
                sub = ['display', vizType, 'type'].join('.');
                if(report.entry.content.has(sub)) {
                    vizType = [vizType, report.entry.content.get(sub)].join(':');
                }
            }
            this.model.set('savedSearchVisualization', vizType);
            this.model.set('savedSearchTimerange', timeUtils.generateLabel(this.collection.timeRanges, et, null, lt, null));
            var schedule = _("Never").t();
            if(report.entry.content.get('is_scheduled')) {
                var cronModel = Cron.createFromCronString(report.entry.content.get('cron_schedule'));
                schedule = cronModel.getScheduleString();
            }
            this.model.set('savedSearchSchedule', schedule);
            this.model.set('savedSearchPermissions', splunkUtil.sprintf(_("%s. Owned by %s.").t(),
                    (report.entry.acl.get("perms")) ? _("Shared").t() : _("Not Shared").t(),
                    report.entry.acl.get("owner")));
        },
        onModeChange: function() {
            this.$el[ this.model.get('elementCreateType') === 'saved' ? 'show' : 'hide' ]();
            //if reports have not been fetched and there is no loading message yet, then create a loading message
            if(this.model.get('elementCreateType') === 'saved' && this.controller.reportsCollection.initialFetchDfd.readyState !== 4 && this.$(Modal.LOADING_SELECTOR).length === 0){
                this.$el.append(Modal.LOADING_HORIZONTAL);
                this.$(Modal.LOADING_SELECTOR).html(_('Loading...').t());
            }
        },
        render: function() {
            this.children.reportPlaceholder.render().appendTo(this.el);
            this.controller.reportsCollection.initialFetchDfd.done(_.bind(function() {
                //reports fetch is done so remove any loading message and render other elements
                if(this.$(Modal.LOADING_SELECTOR).length > 0){
                   this.$(Modal.LOADING_SELECTOR).remove();
                }
                this.children.report.render().appendTo(this.children.reportPlaceholder.el);
                this.searchSelected();
                this.children.searchField.render().appendTo(this.el);
                this.children.searchField.$('textarea').attr('readonly', 'readonly');

                this.children.timerangeField.render().appendTo(this.el);
                this.children.schedule.render().appendTo(this.el);
                this.children.permissions.render().appendTo(this.el);

                this.onModeChange();
            }, this));

            return this;
        }
    });

});

define('splunkjs/mvc/simplexml/dialog/addpanel/pivot',['require','underscore','views/Base','../../../utils','uri/route'],function(require){
    var _ = require('underscore'),
        Base = require('views/Base'),
        utils = require('../../../utils'),
        route = require('uri/route');

    return Base.extend({
        initialize: function() {
            Base.prototype.initialize.apply(this, arguments);
            this.listenTo(this.model, 'change:elementCreateType', this.onModeChange, this);
        },
        render: function() {
            if(!this.el.innerHTML) {
                var pageInfo = utils.getPageInfo();
                this.$el.html(_.template(this.template, {
                    pivotLink: route.data_models(pageInfo.root, pageInfo.locale, pageInfo.app)
                }));
            }
            this.onModeChange();
            return this;
        },
        onModeChange: function() {
            var fn = this.model.get('elementCreateType') === 'pivot' ? 'show' : 'hide';
            this.$el[fn]();
        },
        template: '<label class="control-label"></label><div class="controls">' +
                _("Use the Pivot tool to summarize Data Model information and add it as a dashboard panel. You'll need to know the name of this dashboard when you save from the Pivot tool.").t()+
                '</div>'
    });

});
define('splunkjs/mvc/simplexml/dialog/addpanel/master',['require','exports','module','underscore','jquery','splunkjs/mvc','views/Base','views/shared/controls/ControlGroup','../../controller','./inline','./report','./pivot','util/console'],function(require, module, exports) {
    var _ = require('underscore'), $ = require('jquery'), mvc = require('splunkjs/mvc');
    var BaseView = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var Dashboard = require('../../controller');
    var InlineForm = require('./inline');
    var ReportForm = require('./report');
    var PivotForm = require('./pivot');
    var console = require('util/console');

    return BaseView.extend({
        moduleId: module.id,
        className: 'add-panel',
        initialize: function() {
            BaseView.prototype.initialize.call(this, arguments);
            this.children.panelTitleControlGroup = new ControlGroup({
                label: _("Content Title").t(),
                controlType: 'Text',
                controlClass: 'controls-block',
                controlOptions: {
                    model: this.model.report,
                    modelAttribute: 'title',
                    placeholder: "optional"
                }
            });

            this.children.elementCreateType = new ControlGroup({
                label: _("Content Type").t(),
                controlType: 'SyntheticRadio',
                controlClass: 'controls-thirdblock',
                controlOptions: {
                    className: 'btn-group btn-group-3 add-panel-select',
                    items: [
                        {value: 'inline', label: '<i class="icon-search-thin"></i>', tooltip: _("Inline Search").t()},
                        {value: 'pivot', label: '<i class="icon-pivot"></i>', tooltip: _("Inline Pivot").t()},
                        {value: 'saved', label: '<i class="icon-report"></i>', tooltip: _("Report").t()}
                    ],
                    model: this.model.report,
                    modelAttribute: 'elementCreateType'
                }
            });

            var timesCollection = Dashboard.collection.times;

            this.children.inline = new InlineForm({
                model: this.model,
                collection: {
                    timeRanges: timesCollection
                }
            });
            this.children.report = new ReportForm({
                model: this.model.report,
                collection: {
                    timeRanges: timesCollection
                }, 
                controller: this.options.controller
            });

            this.children.pivot = new PivotForm({
                model: this.model.report
            });

        },
        render: function() {

            this.$el.append(this.children.panelTitleControlGroup.render().el);
            this.$el.append(this.children.elementCreateType.render().el);
            this.$el.append(this.children.inline.render().el);
            this.$el.append(this.children.pivot.render().el);
            this.$el.append(this.children.report.render().el);

            return this;
        }
    });

});

define('splunkjs/mvc/simplexml/dialog/addpanel',['require','exports','module','underscore','jquery','splunkjs/mvc','views/shared/Modal','models/Base','../../utils','../controller','../element/base','../mapper','./addpanel/master','../../searchmanager','../../savedsearchmanager','util/console','views/shared/timerangepicker/dialog/Master','models/TimeRange','views/shared/delegates/ModalTimerangePicker','../controller','uri/route','views/shared/FlashMessages'],function(require, module, exports) {
    var _ = require('underscore'), $ = require('jquery'), mvc = require('splunkjs/mvc');
    var Modal = require('views/shared/Modal');
    var BaseModel = require('models/Base');
    var utils = require('../../utils');
    var Dashboard = require('../controller');
    var DashboardElement = require('../element/base');
    var Mapper = require('../mapper');
    var AddPanelView = require('./addpanel/master');
    var SearchManager = require('../../searchmanager');
    var SavedSearchManager = require('../../savedsearchmanager');
    var console = require('util/console');
    var TimeRangePickerView = require('views/shared/timerangepicker/dialog/Master');
    var TimeRangeModel = require('models/TimeRange');
    var TimeRangeDelegate = require('views/shared/delegates/ModalTimerangePicker');
    var controller = require('../controller');
    var route = require('uri/route');
    var FlashMessages = require('views/shared/FlashMessages'); 
    
    /**
     * Transient model representing the information for a new dashboard panel element
     */
    var NewPanelModel = BaseModel.extend({
        defaults: {
            elementCreateType: 'inline',
            'dispatch.earliest_time': '0',
            'dispatch.latest_time': 'now'
        },
        validation: {
            search: {
                fn: 'validateSearchQuery'
            }
        },
        validateSearchQuery: function(value, attr, computedState) {
            if(computedState['elementCreateType'] === 'inline' && !value) {
                return 'Search string is required.';
            }
        },
        sync: function(method, model, options) {
            console.log('NewPanelModel.sync(%o, %o, %o)', method, model, options);
            if(method !== 'create') {
                throw new Error('Unsupported sync method: ' + method);
            }
            if(!model.isValid()) {
                return false;
            }
            var dfd = $.Deferred();
            var searchType = this.get('elementCreateType');

            var elementId, i = 1;
            do {
                elementId = 'element' + (i++);
            } while(mvc.Components.has(elementId));

            var vizType = searchType === 'saved' ? this.get('savedSearchVisualization') || 'visualizations:charting' : 'visualizations:charting',
                    mapper = Mapper.get(vizType);

            Dashboard.getStateModel().view.addElement(elementId, {
                type: mapper.tagName,
                title: this.get('title'),
                search: {
                    type: searchType,
                    search: this.get('search'),
                    earliest_time: this.get('dispatch.earliest_time'),
                    latest_time: this.get('dispatch.latest_time'),
                    name: this.get('savedSearchName')
                }
            }).done(_.bind(function() {
                        var newItemElement = mvc.Components.get('dashboard').createNewElement({
                            title: this.get('title'),
                            id: elementId
                        });
                        var newSearchId = _.uniqueId('new-search');
                        switch(searchType) {
                            case 'inline':
                                new SearchManager({
                                    "id": newSearchId,
                                    "search": this.get('search'),
                                    "earliest_time": this.get('dispatch.earliest_time') || "0",
                                    "latest_time": this.get('dispatch.latest_time') || 'now',
                                    "app": utils.getCurrentApp(),
                                    "auto_cancel": 90,
                                    "status_buckets": 0,
                                    "preview": true,
                                    "timeFormat": "%s.%Q",
                                    "wait": 0,
                                    "runOnSubmit": true
                                }, {tokens: true});
                                break;
                            case 'saved':
                                new SavedSearchManager({
                                    "id": newSearchId,
                                    "searchname": this.get('savedSearchName'),
                                    "app": utils.getCurrentApp(),
                                    "auto_cancel": 90,
                                    "status_buckets": 0,
                                    "preview": true,
                                    "timeFormat": "%s.%Q",
                                    "wait": 0
                                });
                                break;
                        }

                        var ElementType = DashboardElement.extend({
                            initialVisualization: vizType
                        });

                        var component = new ElementType({
                            id: elementId,
                            managerid: newSearchId,
                            el: newItemElement
                        }, {tokens: true});
                        component.render();
                        dfd.resolve();
                    }, this));

            return dfd.promise();
        }
    });

    return Modal.extend({
        moduleId: module.id,
        className: 'modal add-panel',
        initialize: function() {
            Modal.prototype.initialize.apply(this, arguments);
            this.model=  this.model || {};
            this.model.report = new NewPanelModel();
            var timeRangeModel = this.model.timeRange = new TimeRangeModel({
                'earliest': "0",
                'latest': "now"
            });

            var appModel = Dashboard.model.app;
            var userModel = Dashboard.model.user;
            var appLocalModel = Dashboard.model.appLocal;
            var timesCollection = Dashboard.collection.times;

            this.children.addPanel = new AddPanelView({ 
                model: {
                    report: this.model.report,
                    timeRange: timeRangeModel,
                    state: controller.getStateModel()
                }, 
                collection: {
                    times: timesCollection
                }, 
                controller: this.options.controller  
            });

            this.children.timeRangePickerView = new TimeRangePickerView({
                model: {
                    timeRange: timeRangeModel,
                    user: userModel,
                    appLocal: appLocalModel,
                    application: appModel
                },
                collection: timesCollection
            });

            this.children.flashMessages = new FlashMessages({model: this.model.report});

            timeRangeModel.on('applied', function() {
                this.timeRangeDelegate.closeTimeRangePicker();
            }, this);

            this.listenTo(this.model.report, 'change:elementCreateType', this.handleSubmitButtonState, this);

        },
        events: {
            'click a.modal-btn-primary': function(e) {
                if(this.model.report.get('elementCreateType') === 'pivot') {
                    return;
                }
                e.preventDefault();               
                Dashboard.getStateModel().set('edit', false);
                var modal = this;
                if (this.model.timeRange.get('useTimeFrom') == "dashboard"){
                    this.model.report.set({
                        'dispatch.earliest_time': '$earliest$',
                        'dispatch.latest_time': '$latest$'
                    }, {tokens: true});
                }
                var dfd = this.model.report.save();

                if(dfd) {
                    dfd.done(function() {
                        setTimeout(function() {
                            Dashboard.getStateModel().set('edit', true);
                        }, 250);
                        modal.hide();
                    });
                } else {
                    Dashboard.getStateModel().set('edit', true);
                }
            }, 
            'hide': function(e){
                //if 'hide' event is triggered on this modal and not bubbled up from its child elements
                if( e.target === this.el ){ 
                    this.remove(); 
                }      
            }
        },
        handleSubmitButtonState: function(model) {
   
            if(this.model.report.get('elementCreateType') === 'pivot') {
                var pageInfo = utils.getPageInfo();
                this.$(Modal.FOOTER_SELECTOR)
                    .find('.btn-primary').replaceWith('<a href="'+route.data_models(pageInfo.root, pageInfo.locale, pageInfo.app)+'" class="btn btn-primary modal-btn-primary">' + _('Go to Pivot').t() + '</a>');
            }
            else{
                this.$(Modal.FOOTER_SELECTOR)
                    .find('.btn-primary').replaceWith('<a href="#" class="btn btn-primary modal-btn-primary">' + _('Add Panel').t() + '</a>');             
            }

        },
        setLabel: function() {
            var timeLabel = this.model.timeRange.generateLabel(this.collection);
            this.$el.find("span.time-label").text(timeLabel);
        },
        render: function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Add Panel").t());

            this.$(Modal.BODY_SELECTOR).remove();

            this.$(Modal.FOOTER_SELECTOR).before(
                '<div class="vis-area">' +
                    '<div class="slide-area">' +
                        '<div class="content-wrapper add-panel-wrapper">' +
                            '<div class="' + Modal.BODY_CLASS + '" >' +
                            '</div>' +
                        '</div>' +
                        '<div class="timerange-picker-wrapper">' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);      
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL_JUSTIFIED);

            this.$visArea = this.$('.vis-area').eq(0);
            this.$slideArea = this.$('.slide-area').eq(0);
            this.$addpanelContent = this.$('.add-panel-wrapper').eq(0);
            this.$timeRangePickerWrapper = this.$('.timerange-picker-wrapper').eq(0);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.addPanel.render().el);
            this.$timeRangePickerWrapper.append(this.children.timeRangePickerView.render().el);

            this.$modalParent = this.$el;

            this.timeRangeDelegate = new TimeRangeDelegate({
                el: this.el,
                $visArea: this.$visArea,
                $slideArea: this.$slideArea,
                $contentWrapper: this.$addpanelContent,
                $timeRangePickerWrapper: this.$timeRangePickerWrapper,
                $modalParent: this.$modalParent,
                $timeRangePicker: this.children.timeRangePickerView.$el,
                activateSelector: 'a.timerange-control',
                backButtonSelector: 'a.btn.back'
            });

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _('Add Panel').t() + '</a>');

            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back modal-btn-back pull-left">' + _('Back').t() + '</a>');
            this.$('.btn.back').hide();

            return this;
        }
    });

});

define('splunkjs/mvc/simpleform/input/base',['require','underscore','jquery','../../basesplunkview','../../tokenutils'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseSplunkView = require('../../basesplunkview');
    var TokenUtils = require('../../tokenutils');

    var BaseInput = BaseSplunkView.extend({
        options: {
            submitOnChange: false
        },
        initialize: function(options) {
            this.configure();
            this.settings.enablePush('value');
            
            // Update self when settings change
            this.settings.on('change:label', this.renderLabel, this);
            
            options = options || {};
            this.inputId = options.inputId || _.uniqueId((this.id || 'input') + '_');
        },
        handleChange: function() {
            // Update MVC token
            this.settings.set('value', this.getValue());
        },
        submit: function() {
            // Notify listeners
            this.trigger('change', this);
        },
        hasValue: function() {
            var value = this.settings.get("value");
            var defaultValue = this.settings.get("default");
            // We have a value if one of these conditions is true:
            // 1. Value is truth-y
            // 2. We have no default value
            // 3. Our value and default value are the same
            return value || defaultValue === undefined || value === defaultValue;
        },
        setValue: function(v) {
            throw 'setValue not implemented';
        },
        getValue: function() {
            throw 'getValue not implemented';
        },
        renderLabel: function() {
            var label = this.$('label');
            if(!label.length) {
                label = $('<label></label>').appendTo(this.el);
            }
            label.attr('for', this.inputId);
            if(this.settings.has('label')) {
                label.text(this.settings.get('label'));
            } else {
                var v = label.text();
                if(v) {
                    this.settings.set('label', v);
                }
            }
        },
        // For API compatibility with MVC controls.
        val: function(newValue) {
            // NOTE: Ignore parameters beyond the first one.
            if (arguments.length >= 1) {
                this.setValue(newValue);
            }
            return this.getValue();
        },
        on: function() {
            return this._applyToWrappedView('on', arguments);
        },
        off: function() {
            return this._applyToWrappedView('off', arguments);
        },
        trigger: function() {
            return this._applyToWrappedView('trigger', arguments);
        },
        _applyToWrappedView: function(funcName, args) {
            var wrappedView = this._getWrappedView();
            if (wrappedView === this) {
                return BaseSplunkView.prototype[funcName].apply(this, args);
            } else {
                return wrappedView[funcName].apply(wrappedView, args);
            }
        },
        /*
         * Subclasses should override if they delegate functionality
         * to an underlying view.
         */
        _getWrappedView: function() {
            return this;
        }
    });
    
    return BaseInput;
});

define('splunkjs/mvc/simpleform/input/timerange',['require','underscore','jquery','./base','../../simplexml/controller','../../mvc','../../timerangeview'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInput = require('./base');
    var Dashboard = require('../../simplexml/controller');
    var mvc = require('../../mvc');
    var TimeRangeView = require('../../timerangeview');
    
    var FACTORY_DEFAULT = {earliest_time: undefined, latest_time: undefined};
    
    var TimeRangeInput = BaseInput.extend({
        events: {
            // Destroy self when dashboard editor's remove button clicked
            'click .remove-timerange-picker a': function(e) {
                e.preventDefault();
                this.remove();
            }
        },
        
        /*
         * Private API:
         * 
         * @param options.isGlobal  Whether this time picker is considered
         *                          a global time picker by the dashboard
         *                          editor. If unspecified is determined
         *                          automatically based on what the
         *                          {earliest_time, latest_time} settings
         *                          are bound to.
         */
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.picker = new TimeRangeView(inputOptions);
            this.picker.on('change', this.handleChange, this);
            
            // Always use the inner view's settings, so we don't have two of them
            this.options.settings = this.picker.settings;
            BaseInput.prototype.initialize.call(this);
            
            // Attach to dashboard
            if (this._isGlobalTimeRangeInput()) {
                Dashboard.getStateModel().on('change:edit', this._onEditStateChange, this);
            }
        },
        
        hasValue: function() {
            var value = this.settings.get("value") || FACTORY_DEFAULT;
            var defaultValue = this.settings.get("default");
            var presetValue = this.settings.get("preset");
            
            // We have a value if one of these conditions is true:
            // 1. Value is not the factory default
            // 2. We have no default value
            return !_.isEqual(value, FACTORY_DEFAULT) || (!defaultValue && !presetValue);
        },
        
        /**
         * Update the time range input's value to be the default,
         * taking into account both the default value and the preset value.
         * 
         * @return The time range input object.
         */
        updateValueWithDefault: function() {   
            var defaultValue = this.settings.get("default");
            var presetValue = this.settings.get("preset");
            if (defaultValue) {
                this.val(defaultValue);
            }
            else if (presetValue) {
                // Synchronize the displayed preset and the actual set value.
                this.picker._onTimePresetUpdate();
            }
            
            return this;
        },
        
        handleChange: function(value, input) {
            value = value || FACTORY_DEFAULT;
                        
            // Update dashboard with new value
            if (this._isGlobalTimeRangeInput()) {
                // TODO: Try to convert dashboard to use the same time format
                //       as every other control.
                value = this.val();
                Dashboard.getStateModel().set('default_timerange', {
                    earliestTime: value.earliest_time,
                    latestTime: value.latest_time
                });
            }
            
            BaseInput.prototype.handleChange.apply(this, arguments);
        },
        
        _onEditStateChange: function(model) {
            if (this._isGlobalTimeRangeInput()) {
                if (model.get('edit')) {
                    // Render editing UI
                    $('<div class="remove-timerange-picker"><a href="#"><i class="icon-x-circle"></i></a></div>')
                        .appendTo(this.picker.$el);
                    $('<div class="timerange-edit-hint"></div>')
                        .html(_('Select default time range above. Time range only applies to <i class="icon-search-thin"></i> Inline Searches.').t())
                        .appendTo(this.picker.$el);
                    
                    // NOTE: The dashboard editor will directly update the
                    //       internal timerange picker
                    //       ('views/shared/timerangepicker/Master') and the
                    //       inner TimeRangeView will pick up the changes
                    //       automatically.
                } else {
                    // Unrender editing UI
                    this.$('.remove-timerange-picker').remove();
                    this.$('.timerange-edit-hint').remove();
                }
            }
        },
        
        _isGlobalTimeRangeInput: function() {
            if (this.settings.has('isGlobal')) {
                return (this.settings.get('isGlobal') === true);
            }
            
            return (
                (this.settings.get('earliest_time', {tokens: true}) === '$earliest$') &&
                (this.settings.get('latest_time', {tokens: true}) === '$latest$'));
        },
        
        remove: function() {
            // Dispose inner view
            this.picker.remove();

            // Dispose self
            mvc.Components.revokeInstance(this.id);
            BaseInput.prototype.remove.apply(this, arguments);

            // Detach from dashboard
            if (this._isGlobalTimeRangeInput()) {
                Dashboard.getStateModel().off(null, null, this);
                Dashboard.getStateModel().set('default_timerange', null);
            }
        },
        
        getValue: function() {
            return this.picker.val();
        },
        
        setValue: function(v) {
            return this.picker.val(v);
        },
        
        render: function() {
            this.renderLabel();
            this.picker.render();
            
            // Ensure dashboard editor chrome is displayed upon initial render
            this._onEditStateChange(Dashboard.getStateModel());
            this.handleChange(this.val(), this.picker);
            
            return this;
        },
        
        _getWrappedView: function() {
            return this.picker;
        }
    });
    
    return TimeRangeInput;
});

define('views/shared/documentcontrols/dialogs/TitleDescriptionDialog',[
    'underscore',
    'backbone',
    'module',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'views/shared/FlashMessages'
    ],
    function(
        _,
        Backbone,
        module,
        Modal,
        ControlGroup,
        FlashMessage
    ) {
    return Modal.extend({
        moduleId: module.id,
        /**
        * @param {Object} options {
        *       model: <models.Report>
        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            this.model = {
                inmem: this.model.clone(),
                report: this.model
            };

            this.children.flashMessage = new FlashMessage({ model: this.model.inmem });

            this.children.titleField = new ControlGroup({
                controlType: 'Label',
                controlOptions: {
                    modelAttribute: 'name',
                    model: this.model.inmem.entry
                },
                label: _('Title').t()
            });

            this.children.descriptionField = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'description',
                    model: this.model.inmem.entry.content,
                    placeholder: _('optional').t()
                },
                label: _('Description').t()
            });

            this.on('hidden', function() {
                if (this.model.inmem.get("updated") > this.model.report.get("updated")) {
                    //now we know have updated the clone
                    this.model.report.entry.content.set('description', this.model.inmem.entry.content.get("description"));
                }
            }, this);
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
                this.model.inmem.save({}, {
                    success: function(model, response) {
                        this.hide();
                    }.bind(this)
                });

                e.preventDefault();
            }
        }),
        render : function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Description").t());

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.titleField.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.descriptionField.render().el);

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

            return this;
        }
    });
});

define('views/shared/documentcontrols/dialogs/DeleteDialog',[
    'underscore',
    'backbone',
    'module',
    'models/Report',
    'views/shared/Modal',
    'views/shared/FlashMessages',
    'uri/route',
    'splunk.util'
    ],
    function(
        _,
        Backbone,
        module,
        ReportModel,
        Modal,
        FlashMessage,
        route,
        splunkUtil
    ) {
    return Modal.extend({
        moduleId: module.id,
        /**
        * @param {Object} options {
        *       model: {
        *           report <models.Report>,
        *           application: <models.Application>
        *       },
        *       {Boolean} deleteRedirect: (Optional) Whether or not to redirect to reports page after delete. Default is false.        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            this.children.flashMessage = new FlashMessage({ model: this.model.report });
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
                var deleteDeferred = this.model.report.destroy({wait: true});

                $.when(deleteDeferred).then(function() {
                    this.hide();
                    if (this.options.deleteRedirect) {
                        if (this.model.report.isAlert()) {
                            window.location = route.alerts(this.model.application.get("root"), this.model.application.get("locale"), this.model.application.get("app"));
                        } else {
                            window.location = route.reports(this.model.application.get("root"), this.model.application.get("locale"), this.model.application.get("app"));
                        }
                    }
                }.bind(this));

                e.preventDefault();
            }
        }),
        render : function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

            if (this.model.report.isAlert()) {
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Delete Alert").t());
            } else {
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Delete Report").t());
            }
            this.$(Modal.BODY_SELECTOR).append('<span>' + splunkUtil.sprintf(_('Are you sure you want to delete %s?').t(), '<em>' + _.escape(this.model.report.entry.get('name')) + '</em>') + '</span>');
            
            

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);

            this.$(Modal.FOOTER_SELECTOR).append(this.compiledTemplate({
                _: _
            }));

            return this;
        },
        template: '\
            <a href="#" class="btn btn-primary"><%- _("Delete").t() %></a>\
        '
    });
});

define('views/dashboards/table/controls/ConvertSuccess',[
    'jquery',
    'underscore', 
    'module', 
    'views/shared/Modal',
    'uri/route',
    'views/shared/documentcontrols/dialogs/permissions_dialog/Master'
    ],
    function(
        $,
        _, 
        module, 
        Modal, 
        route, 
        PermissionsDialog
    )
{

    return Modal.extend({
        moduleId: module.id,
        options: {
            refreshOnDismiss: false
        },
        initialize: function() {
            Modal.prototype.initialize.apply(this, arguments);

            if (this.options.refreshOnDismiss) {
                this.on('hide hidden', function() {
                    window.location.reload();
                });
            }
        },
        events: $.extend({}, Modal.prototype.events, {
            'click .edit-perms': function(e) {
                e.preventDefault();
                var that = this;
                var model = that.model, roles = that.collection.roles;
                _.defer(function(){
                    var permissionsDialog = new PermissionsDialog({
                        model: {
                            document: model.dashboard,
                            nameModel: model.dashboard.entry.content,
                            user: model.user
                        },
                        collection: roles,
                        nameLabel:  "Dashboard",
                        nameKey: 'label',
                        onHiddenRemove: true
                    });

                    if (that.options.refreshOnDismiss) {
                        permissionsDialog.on('hide hidden', function() {
                            window.location.reload();
                        });
                    }

                    $("body").append(permissionsDialog.render().el);
                    permissionsDialog.show();
                });

                if (that.options.refreshOnDismiss) {
                    that.off('hide hidden');
                }

                that.hide();
                that.remove();
            }
        }),
        render: function() {
            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Dashboard has been converted.").t());
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            var app = this.model.dashboard.entry.acl.get("app");
            var name = this.model.dashboard.entry.get('name');


            var link = route.page(this.model.application.get("root"), this.model.application.get("locale"),
                    app, name);

            // TODO some refactoring could be done here with editdashboard.js "Edit source" button
            var newDashboardLink = route.page(this.model.application.get('root'), this.model.application.get('locale'), this.model.application.get('app'), this.model.dashboard.entry.get('name')); 
            var editLink = "/manager/" + app + 
                    "/data/ui/views/" + name + 
                    "?action=edit&ns=" +  app + 
                    "&redirect_override=" + encodeURIComponent(newDashboardLink);

            this.$(Modal.BODY_FORM_SELECTOR).append(_.template(this.messageTemplate, {
                dashboardLink: link,
                _: _
            }));

            this.$(Modal.FOOTER_SELECTOR).append(_.template(this.buttonTemplate, {
                dashboardLink: link,
                editLink: editLink,
                _: _
            }));

            this.$(Modal.FOOTER_SELECTOR).append('');
            return this;
        },
        buttonTemplate: '<a href="<%= editLink %>" class="btn edit-panels"><%- _("Edit HTML").t() %></a>' +
                        '<a href="<%= dashboardLink %>" class="btn btn-primary modal-btn-primary"><%- _("View").t() %></a>',
        messageTemplate: '<p><%- _("You may now view your dashboard, change additional settings, or edit the HTML.").t() %></p>' +
                        '<p><%- _("Additional Settings").t() %>:' +
                            '<ul>' +
                                '<li><a href="#" class="edit-perms"><%- _("Permissions").t() %></a></li>' +
                            '</ul>' +
                        '</p>'
    });

});

/**
 * @author jszeto
 * @date 6/14/13
 *
 * Given two TextControls, copies the value of the source TextControl over to the destination TextControl. If the user
 * types into the destination TextControl, the pairing ends. Call the enablePairing or disablePairing functions to
 * customize the behavior. The text that is copied over can be modified by the transformFunction.
 *
 * Inputs:
 *    sourceDelegate {views/shared/controls/TextControl} - Text Control from which to copy text
 *    destDelegate {views/shared/controls/TextControl} - Text Control that receives the copied text
 *    transformFunction {Function} - Takes a string as an input and returns a transformed string
 */
define('views/shared/delegates/PairedTextControls',['jquery',
        'underscore',
        'backbone',
        'views/shared/controls/TextControl',
        'views/shared/delegates/Base'
       ],
    function(
        $,
        _,
        Backbone,
        TextControl,
        DelegateBase) {

        return DelegateBase.extend({

            transformFunction: undefined,

            /**
             * @constructor
             * @param options {Object} {
             * }
             */

            initialize: function(options) {
                options = options || {};

                this.sourceDelegate = options.sourceDelegate;
                this.destDelegate = options.destDelegate;
                this.transformFunction = options.transformFunction;

                if (!(this.sourceDelegate instanceof TextControl) ||
                    !(this.destDelegate instanceof TextControl)) {
                    throw new Error("SourceDelegate and destDelegate must be TextControls");
                }

                this.enablePairing();
            },

            enablePairing: function() {
                this.sourceDelegate.on("keyup", this.sourceChangeHandler, this);
                this.destDelegate.on("keyup", this.destChangeHandler, this);
            },

            disablePairing: function() {
                this.sourceDelegate.off("keyup", this.sourceChangeHandler, this);
            },

            sourceChangeHandler: function(e, value) {
                var destValue = value;
                if (this.transformFunction)
                    destValue = this.transformFunction(value);
                this.destDelegate.setValue(destValue);
            },

            destChangeHandler: function(e, value) {
                // If we get a non-tab or non-shift key, then disable the pairing
                if (e.keyCode != 9 && e.keyCode != 16) {
                    this.disablePairing();
                    this.destDelegate.off("keyup", this.destChangeHandler);
                }
            }


        });
    });
define('views/dashboards/table/controls/ConvertDashboard',[
    'underscore',
    'jquery',
    'module', 
    'views/shared/Modal',
    'views/shared/controls/ControlGroup', 
    'models/Base', 
    'models/Dashboard', 
    'views/shared/FlashMessages', 
    'views/dashboards/table/controls/ConvertSuccess', 
    'views/shared/delegates/PairedTextControls',
    'views/shared/controls/TextControl',
    'util/splunkd_utils',
    'uri/route', 
    'util/xml_utils'],
    
    function(
        _,
        $,
        module, 
        Modal, 
        ControlGroup, 
        BaseModel, 
        DashboardModel, 
        FlashMessagesView, 
        ConvertSuccessView, 
        PairedTextControls,
        TextControl,
        splunkDUtils, 
        route, 
        xmlUtils
    ) 
{

    var ConvertMode = {
        NEW: 0,
        REPLACE: 1
    };

    return Modal.extend({
        moduleId: module.id,
        
        initialize: function () {
            var that = this;

            Modal.prototype.initialize.apply(this, arguments);

            this.model.perms = new BaseModel({
                perms: 'private'
            });

            this.model.convertMode = new BaseModel({
                mode: ConvertMode.NEW
            });

            this.children.flashMessages = new FlashMessagesView({
                model: {
                    dashboard: this.model.dashboard,
                    dashboardMeta: this.model.dashboard.meta
                }
            });

            this.model.dashboard.meta.set({
                label: this.model.dashboard.meta.get('label') + _(' HTML').t()
            });

            this.children.titleTextControl = new TextControl({
                modelAttribute: 'label',
                model: this.model.dashboard.meta,
                placeholder: 'optional', 
                save: false
            });

            this.children.filenameTextControl = new TextControl({
                modelAttribute: 'name',
                model: this.model.dashboard.entry.content,
                save: false
            });

            this.children.filenameTextControl.setValue(
                splunkDUtils.nameFromString(this.model.dashboard.meta.get('label'))
            );

            this.pairedTextControls = new PairedTextControls({
                sourceDelegate: this.children.titleTextControl,
                destDelegate: this.children.filenameTextControl,
                transformFunction: splunkDUtils.nameFromString
            });

            this.children.mode = new ControlGroup({
                controlType: 'SyntheticRadio',
                controlClass: 'controls-halfblock',
                controlOptions: {
                    className: "btn-group btn-group-2",
                    modelAttribute: 'mode',
                    model: this.model.convertMode,
                    items: [
                        { label: _("Create New").t(), value: ConvertMode.NEW },
                        { label: _("Replace Current").t(), value: ConvertMode.REPLACE }
                    ],
                    save: false
                },
                label: _("Dashboard").t(),
                help: _("Recommended").t()

            });

            this.children.title = new ControlGroup({
                controls: this.children.titleTextControl,
                label: _("Title").t()
            });

            this.children.filename = new ControlGroup({
                controls: this.children.filenameTextControl,
                label: _("ID").t(),
                help: _("Can only contain letters, numbers and underscores.").t(),
                tooltip: _("The ID is used as the filename on disk. Cannot be changed later.").t()
            });

            this.children.description = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'description',
                    model: this.model.dashboard.meta,
                    placeholder: _("optional").t(),
                    save: false
                },
                label: _("Description").t()
            });


            this.children.permissions = new ControlGroup({
                controlType: 'SyntheticRadio',
                controlClass: 'controls-halfblock',
                controlOptions: {
                    className: "btn-group btn-group-2",
                    modelAttribute: 'perms',
                    model: this.model.perms,
                    items: [
                        { label: _("Private").t(), value: 'private' },
                        { label: _("Shared").t(), value: 'shared' }
                    ],
                    save: false
                },
                label: _("Permissions").t()
            });

            this.model.convertMode.on('change:mode', function() {
                that.children.flashMessages.flashMsgCollection.reset();

                if (that.model.convertMode.get('mode') === ConvertMode.NEW) {
                    that.children.title.show();
                    that.children.filename.show();
                    that.children.description.show();
                    that.children.permissions.show();
                } else { // === ConvertMode.REPLACE
                     that.children.flashMessages.flashMsgCollection.add({
                        type: 'warning',
                        html: _("This change cannot be undone.").t()
                    });
                    that.children.title.hide();
                    that.children.filename.hide();
                    that.children.description.hide();
                    that.children.permissions.hide();
                }
            });

        },
        events: $.extend({}, Modal.prototype.events, {
            'click a.modal-btn-primary': function(e) {
                e.preventDefault();
                this.submit();
            }
        }),
        submit: function() {
            var that = this;
            var dashboard = that.model.dashboard;
            var currentDashboard = that.model.currentDashboard;
            var app = that.model.application;
            var user = that.model.user;
            var sourceLink = route.page(app.get("root"), app.get("locale"), currentDashboard.entry.acl.get("app"), currentDashboard.entry.get('name')) + '/converttohtml';
            var updateCollection = that.collection && that.collection.dashboards;


            if (this.model.convertMode.get('mode') === ConvertMode.NEW) {
                dashboard.meta.validate();
                if (dashboard.meta.isValid()) { 
                    var meta = dashboard.meta.toJSON();
                    dashboard.entry.content.set('eai:data', currentDashboard.entry.content.get('eai:data'));
                    dashboard.entry.content.set('eai:type', 'views'); // necessary to make dashboard.meta.apply work
                    dashboard.meta.set(meta);
                    dashboard.meta.apply();

                    $.post(
                        sourceLink,
                        {
                            xmlString: dashboard.entry.content.get('eai:data'), 
                            newViewID: dashboard.entry.content.get('name')
                        }
                    ).done(function(htmlSource) {
                        dashboard.entry.content.set('eai:type', 'html');
                        dashboard.entry.content.set('eai:data', htmlSource);

                        dashboard.save({}, {
                            data: app.getPermissions(that.model.perms.get('perms'))
                        }).done(function() { 
                            if (updateCollection) { 
                                that.collection.dashboards.add(that.model.dashboard); 
                            }

                            _.defer(function() {
                                var successDialog = new ConvertSuccessView({
                                    model: {
                                        dashboard: dashboard,
                                        application: app,
                                        user: user
                                    },
                                    collection: that.collection 
                                });
                                successDialog.render().show();

                            });

                            that.hide();
                            that.remove();
                        });
                    });
                }
            } else { // === ConvertMode.REPLACE

                $.post(
                    sourceLink,
                    {
                        xmlString: currentDashboard.entry.content.get('eai:data')
                    }
                ).done(function(htmlSource) {
                    currentDashboard.entry.content.set('eai:type', 'html');
                    currentDashboard.entry.content.set('eai:data', htmlSource);

                    currentDashboard.save().done(function() {

                        if (updateCollection) {
                            currentDashboard.trigger('updateCollection');
                        }

                        _.defer(function() {
                            var successDialog = new ConvertSuccessView({
                                model: {
                                    dashboard: currentDashboard,
                                    application: app
                                },
                                collection: that.collection,
                                refreshOnDismiss: !updateCollection
                            });
                            successDialog.render().show();

                        });

                        that.hide();
                        that.remove();
                    });
                });
            }
        },
        render: function () {
            var helpLink = route.docHelp(
                this.model.application.get("root"),
                this.model.application.get("locale"),
                'learnmore.html.dashboard'
            ); 

            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Convert Dashboard to HTML").t());
            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);
            this.$(Modal.BODY_SELECTOR).append('<p>' + _("HTML dashboards cannot be edited using Splunk's visual editors.").t() +
                 '<br />' + _('Integrated PDF generation is not available for HTML dashboards.').t() + '<br />' + 
                 '<a href=' + helpLink + '>' +_("Learn More").t() + ' <i class="icon-external"></i></a></p>'); 
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.mode.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.title.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.filename.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.description.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.permissions.render().el);

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _("Convert Dashboard").t() + '</a>');
            return this;
        }
    });

});

define('models/services/ScheduledView',['jquery','underscore','backbone','models/SplunkDBase','models/Base','backbone_validation'],
function($, _, Backbone, SplunkDBase, BaseModel, Val){

    var ScheduledView =  SplunkDBase.extend({
        defaults: {
            'is_scheduled': false,
            'action.email.subject': 'Splunk Alert: $name$',
            'action.email.papersize': 'letter',
            'action.email.paperorientation': 'portrait',
            'cron_schedule': '0 6 * * 1'
        },
        initialize: function() {
            SplunkDBase.prototype.initialize.apply(this, arguments);
        },
        url: function() {
            return 'scheduled/views/' + this.viewName;
        },
        findByName: function(viewName, app, owner) {
            this.viewName = viewName;
            this.id = 'scheduled/views/'+viewName;
            var dfd = this.fetch({ data: { app: app, owner: owner }});
            dfd.done(_.bind(this.applyDefaultsIfNotScheduled, this));
            return dfd;
        },
        applyDefaultsIfNotScheduled: function() {
            if(!this.entry.content.get('is_scheduled')) {
                this.entry.content.set(this.defaults);
            }
        }
    });

    ScheduledView.Entry = ScheduledView.Entry.extend({});
    ScheduledView.Entry.Content = ScheduledView.Entry.Content.extend({
        validation: {
            'action.email.to': [{
                fn: 'validateEmailList'
            }],
            'action.email.subject': {
                required: true,
                msg: _('Subject is empty').t()
            }
        },
        validateEmailList: function(value, attr, model) {
            if(model.is_scheduled) {
                if(!value) {
                    return _("Email Address list is empty").t();
                }
                if(_(value.split(/\s*,\s*/)).any(function(v){ return !Val.patterns.email.test(v); })) {
                    return _("Email Address list is invalid").t();
                }
            }
        }
    });

    return ScheduledView;
});

define('views/dashboards/table/controls/SchedulePDF',
    [
        'module',
        'jquery',
        'underscore',
        'backbone',
        'util/console',
        'util/pdf_utils',
        'models/services/ScheduledView',
        'models/Cron',
        'views/Base',
        'views/shared/Modal',
        'views/shared/controls/ControlGroup',
        'views/shared/ScheduleSentence',
        'views/shared/FlashMessages', 
        'uri/route'
    ],
    function(
        module, 
        $, 
        _, 
        Backbone, 
        console, 
        pdfUtils, 
        ScheduledViewModel, 
        Cron, 
        BaseView, 
        Modal, 
        ControlGroup, 
        ScheduleSentence, 
        FlashMessagesView, 
        route
    ){

        var ControlWrapper = BaseView.extend({
            render: function() {
                if(!this.el.innerHTML) {
                    this.$el.html(_.template(this.template, {
                        label: this.options.label || '',
                        controlClass: this.options.controlClass || '',
                        body: _.template(this.options.body||'')(this.model ? (this.model.toJSON ? this.model.toJSON() : this.model) : {})
                    }));
                }
                var target = this.$('.controls');
                _.each(this.options.children, function(child){
                    child.render().appendTo(target);
                });
                return this;
            },
            template: '<label class="control-label"><%- label %></label><div class="controls <%- controlClass %>"><%= body %></div>'
        });


        return Modal.extend({
            moduleId: module.id,
            className: 'modal schedule-pdf',
             /**
             * @param {Object} options {
             *     model: {
             *         scheduledView: <models.services.ScheduledView>,
             *         dashboard: <models.services.data.ui.Views>
             *     }
             * }
             */
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.inmem = new ScheduledViewModel.Entry.Content(this.model.scheduledView.entry.content.toJSON());
                 var cronModel = this.model.cron = Cron.createFromCronString(this.model.inmem.get('cron_schedule') || '0 6 * * 1');
                 this.listenTo(cronModel, 'change', function(){
                     this.model.inmem.set('cron_schedule', cronModel.getCronString());
                 }, this);

                 var helpLink = route.docHelp(
                    this.model.application.get("root"),
                    this.model.application.get("locale"),
                    'learnmore.alert.email'
                ); 

                this.children.flashMessages = new FlashMessagesView({
                    model: {
                        scheduledView: this.model.scheduledView,
                        content: this.model.inmem
                    }
                });

                this.children.name = new ControlGroup({
                    controlType: 'Label',
                    controlOptions: {
                        modelAttribute: 'label',
                        model: this.model.dashboard.entry.content
                    },
                    label: _('Dashboard').t()
                });

                this.children.schedule = new ControlGroup({
                    controlType: 'SyntheticCheckbox',
                    controlOptions: {
                        modelAttribute: 'is_scheduled',
                        model: this.model.inmem,
                        save: false
                    },
                    label: _("Schedule PDF").t()
                });


                this.conditionalControls = [
                    this.children.scheduleSentence = new ScheduleSentence({
                        model: {
                            cron: this.model.cron
                        },
                        lineOneLabel: _("Schedule").t(),
                        popdownOptions: {
                            attachDialogTo: '.modal:visible',
                            scrollContainer: '.modal:visible .modal-body:visible'
                        }
                    }),
                    this.children.emailAddresses = new ControlGroup({
                       controlType: 'Textarea',
                       controlOptions: {
                           modelAttribute: 'action.email.to',
                           model: this.model.inmem,
                           save: false
                       },
                       label: _("Email Addresses").t(),
                       help: _("Comma separated list.").t()+'<br/>'+_("Email must be configured in System&nbsp;Settings > Alert&nbsp;Email&nbsp;Settings.").t()+
                               " <a href=" + helpLink + ">" +_("Learn More").t()+' <i class="icon-external"></i></a>'
                    }),
                    this.children.emailSubject = new ControlGroup({
                        controlType: 'Text',
                        controlOptions: {
                            modelAttribute: 'action.email.subject',
                            model: this.model.inmem,
                            save: false
                        },
                        label: _("Email Subject Line").t()
                    }),
                    this.children.paperSize = new ControlGroup({
                        className: 'control-group',
                        controlType: 'SyntheticSelect',
                        controlOptions: {
                            modelAttribute: 'action.email.papersize',
                            model: this.model.inmem,
                            items: [
                                { label: _("A2").t(), value: 'a2' },
                                { label: _("A3").t(), value: 'a3' },
                                { label: _("A4").t(), value: 'a4' },
                                { label: _("A5").t(), value: 'a5' },
                                { label: _("Letter").t(), value: 'letter' },
                                { label: _("Legal").t(), value: 'legal' }
                            ],
                            save: false,
                            toggleClassName: 'btn',
                            popdownOptions: {
                                attachDialogTo: '.modal:visible',
                                scrollContainer: '.modal:visible .modal-body:visible'
                            }
                        },
                        label: _("Paper Size").t()
                    }),
                    this.children.paperLayout = new ControlGroup({
                        controlType: 'SyntheticRadio',
                        controlOptions: {
                            modelAttribute: 'action.email.paperorientation',
                            model: this.model.inmem,
                            items: [
                                { label: _("Portrait").t(), value: 'portrait' },
                                { label: _("Landscape").t(), value: 'landscape' }
                            ],
                            save: false
                        },
                        label: _("Paper Layout").t()
                    }),
                    this.children.previewLinks = new ControlWrapper({
                        body: '<div class="preview-actions">' +
                            '<div class="test-email"><a href="#" class="action-send-test">'+_("Send Test Email").t()+'</a></div> ' +
                            '<a href="#" class="action-preview">'+_("Preview PDF").t()+'</a>' +
                            '</div>'
                    })
                ];
                 this.model.inmem.on('change:is_scheduled', this._toggle, this);
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .action-send-test': function(e) {
                    e.preventDefault();
                    this.model.inmem.validate();
                    if(this.model.inmem.isValid()) {
                        var $status = this.$('.test-email'), flashMessages = this.children.flashMessages.flashMsgCollection;
                        $status.html(_("Sending...").t());
                        pdfUtils.sendTestEmail(
                                this.model.dashboard.entry.get('name'),
                                this.model.dashboard.entry.acl.get('app'),
                                this.model.inmem.get('action.email.to'),
                                {
                                    paperSize: this.model.inmem.get('action.email.papersize'),
                                    paperOrientation: this.model.inmem.get('action.email.paperorientation')
                                }
                        ).done(function(){
                                    $status.html('<i class="icon-check"></i> '+_("Email sent.").t());
                        }).fail(function(error){
                                    $status.html('<span class="error"><i class="icon-warning-sign"></i> '+_("Failed!").t()+'</span>');
                                    if(error) {
                                        flashMessages.add({
                                            type: 'warning',
                                            html: _("Sending the test email failed: ").t() + _.escape(error)
                                        });
                                    }
                                }).always(function(){
                                    setTimeout(function(){
                                        $status.html('<a href="#" class="action-send-test">'+_("Send Test Email").t()+'</a>');
                                    }, 5000);
                                });
                    }
                },
                'click .action-preview': function(e) {
                    e.preventDefault();
                    var orientationSuffix = '',
                        orientation = this.model.inmem.get('action.email.paperorientation'),
                        pageSize = this.model.inmem.get('action.email.papersize') || 'a2';
                    if(orientation === 'landscape') {
                        orientationSuffix = '-landscape';
                    }
                    pdfUtils.getRenderURL(
                            this.model.dashboard.entry.get('name'), this.model.dashboard.entry.acl.get('app'),{
                                'paper-size': pageSize + orientationSuffix
                            }
                    ).done(function(url){
                        window.open(url);
                    });
                },
                'click .modal-btn-primary': function(e){
                    e.preventDefault();
                    this.model.inmem.validate();
                    if(this.model.inmem.isValid()) {
                        //use == instead of === in first part of conditional to cover false and 0
                        if(this.model.inmem.get('is_scheduled') == false && this.model.scheduledView.entry.content.get('is_scheduled') === false) {
                            this.hide();
                        } else {
                            this.model.scheduledView.entry.content.set(this.model.inmem.toJSON());
                            var modal = this;
                            this.model.scheduledView.save({},{success: function(){
                                modal.hide();
                            }});
                        }
                    }
                }
            }),
            _toggle: function() {
                _.chain(this.conditionalControls).pluck('$el').invoke(
                        this.model.inmem.get('is_scheduled') ? 'show' : 'hide'
                );
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit PDF Schedule").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);
                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.name.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.schedule.render().el); 
                _.each(this.conditionalControls, function(c) { 
                    this.$(Modal.BODY_FORM_SELECTOR).append(c.render().el); 
                }, this);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
                this._toggle();
                return this;
            }
        });
    }
);

define('views/dashboards/table/controls/CloneSuccess',['underscore', 'module', 'views/shared/Modal','uri/route','views/shared/documentcontrols/dialogs/permissions_dialog/Master','views/dashboards/table/controls/SchedulePDF','models/services/ScheduledView'],
        function(_, module, Modal, route, PermissionsDialog, SchedulePDF, ScheduledViewModel){

    return Modal.extend({
        moduleId: module.id,
        events: $.extend({}, Modal.prototype.events, {
            'click .edit-perms': function(e) {
                e.preventDefault();
                var model = this.model, roles = this.collection.roles;
                _.defer(function(){
                    var permissionsDialog = new PermissionsDialog({
                        model: {
                            document: model.dashboard,
                            nameModel: model.dashboard.entry.content,
                            user: model.user
                        },
                        collection: roles,
                        nameLabel:  "Dashboard",
                        nameKey: 'label',
                        onHiddenRemove: true
                    });

                    $("body").append(permissionsDialog.render().el);
                    permissionsDialog.show();
                });

                this.hide();
                this.remove();
            },
            'click .schedule-pdf': function(e) {
                e.preventDefault();
                var model = this.model;
                var createDialog = function() {
                    var schedulePDF = new SchedulePDF({
                        model: {
                            scheduledView: model.scheduledView,
                            dashboard: model.dashboard,
                            application: model.application,
                            appLocal: model.appLocal
                        },
                        onHiddenRemove: true
                    });
                    $("body").append(schedulePDF.render().el);
                    schedulePDF.show();
                };
                if(!this.model.scheduledView) {
                    var scheduledView = model.scheduledView = new ScheduledViewModel(),
                        dfd = scheduledView.findByName(this.model.dashboard.entry.get('name'), this.model.application.get('app'), this.model.application.get('owner'));
                    dfd.done(createDialog);
                } else {
                    _.defer(createDialog);
                }
                this.hide();
                this.remove();
            }
        }),
        render: function() {
            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Dashboard has been cloned.").t());
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            var link = route.page(this.model.application.get("root"), this.model.application.get("locale"),
                    this.model.dashboard.entry.acl.get("app"), this.model.dashboard.entry.get('name'));
            var canChangePerms = this.model.dashboard.entry.acl.get('can_change_perms');
            var canSchedule = this.model.user.canScheduleSearch() && !this.model.user.isFree() && (this.model.dashboard.isSimpleXML() ||
                        (this.model.dashboard.isAdvanced() && this.model.state.get('pdfgen_type') === 'deprecated'));
            this.$(Modal.BODY_FORM_SELECTOR).append(_.template(this.messageTemplate, {
                dashboardLink: link,
                canChangePerms: canChangePerms,
                canSchedule: canSchedule
            }));

            this.$(Modal.FOOTER_SELECTOR).append(_.template(this.buttonTemplate, {
                dashboardLink: link,
                _: _
            }));

            this.$(Modal.FOOTER_SELECTOR).append('');
            return this;
        },
        buttonTemplate: '<a href="<%= dashboardLink %>/edit" class="btn edit-panels"><%- _("Edit Panels").t() %></a>' +
                        '<a href="<%= dashboardLink %>" class="btn btn-primary modal-btn-primary"><%- _("View").t() %></a>',
        messageTemplate: '<p><%- _("You may now view your dashboard, change additional settings, or edit the panels.").t() %></p>' +
                        '<p><% if(canChangePerms || canSchedule){ %>' +
                                '<%- _("Additional Settings").t() %>:' +
                                '<ul>' +
                                    '<% if(canChangePerms) { %><li><a href="#" class="edit-perms"><%- _("Permissions").t() %><% } %></a></li>' +
                                    '<% if(canSchedule) { %><li><a href="#" class="schedule-pdf"><%- _("Schedule PDF Delivery").t() %><% } %></a></li>' +
                                '</ul>' +
                            '<% } %>' +
                        '</p>'
    });

});

define('views/dashboards/table/controls/CloneDashboard',[
    'underscore',
    'module',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'models/Base',
    'models/Dashboard',
    'views/shared/FlashMessages',
    'util/splunkd_utils',
    'views/dashboards/table/controls/CloneSuccess',
    'views/shared/delegates/PairedTextControls',
    'views/shared/controls/TextControl'
],

    function (
        _,
        module,
        Modal,
        ControlGroup,
        BaseModel,
        DashboardModel,
        FlashMessagesView,
        splunkDUtils,
        CloneSuccessView,
        PairedTextControls,
        TextControl
    )
{

    return Modal.extend({
        moduleId: module.id,
        initialize: function () {
            Modal.prototype.initialize.apply(this, arguments);

            this.model.perms = new BaseModel({
                'clonePermissions': false
            });

            this.children.flashMessages = new FlashMessagesView({
                model: {
                    dashboard: this.model.dashboard,
                    dashboardMeta: this.model.dashboard.meta
                }
            });

            this.model.dashboard.meta.set({
                label: this.model.dashboard.meta.get('label') + _(' Clone').t()
            });

             this.children.titleTextControl = new TextControl({
                modelAttribute: 'label',
                model: this.model.dashboard.meta,
                placeholder: 'optional', 
                save: false
            });

            this.children.filenameTextControl = new TextControl({
                modelAttribute: 'name',
                model: this.model.dashboard.entry.content,
                save: false
            });
            this.children.filenameTextControl.setValue(
                splunkDUtils.nameFromString(this.model.dashboard.meta.get('label'))
            );

            this.pairedTextControls = new PairedTextControls({
                sourceDelegate: this.children.titleTextControl,
                destDelegate: this.children.filenameTextControl,
                transformFunction: splunkDUtils.nameFromString
            });

            this.children.title = new ControlGroup({
                controls: this.children.titleTextControl,
                label: _("Title").t()
            });

            this.children.filename = new ControlGroup({
                controls: this.children.filenameTextControl,
                label: _("ID").t(),
                help: _("Can only contain letters, numbers and underscores.").t(),
                tooltip: _("The ID is used as the filename on disk. Cannot be changed later.").t()
            });

            this.children.description = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'description',
                    model: this.model.dashboard.meta,
                    placeholder: _("optional").t(),
                    save: false
                },
                label: _("New Description").t()
            });

            this.children.permissions = new ControlGroup({
                controlType: 'SyntheticRadio',
                controlClass: 'controls-halfblock',
                controlOptions: {
                    className: "btn-group btn-group-2",
                    modelAttribute: 'clonePermissions',
                    model: this.model.perms,
                    items: [
                        { label: _("Private").t(), value: false },
                        { label: _("Clone").t(), value: true }
                    ],
                    save: false
                },
                label: _("Permissions").t()
            });

        },
        events: $.extend({}, Modal.prototype.events, {
            'click a.modal-btn-primary': function (e) {
                e.preventDefault();
                this.submit();
            }
        }),
        createSuccess: function() {
            if(this.collection && this.collection.dashboards) {
                this.collection.dashboards.add(this.model.dashboard);
            }

            _.defer(function(){
                var successDialog = new CloneSuccessView({
                    model: {
                        dashboard: this.model.dashboard,
                        application: this.model.application,
                        scheduledView: this.model.scheduledView, 
                        appLocal: this.model.appLocal, 
                        state: this.model.state, 
                        user: this.model.user
                    },
                    collection: this.collection
                });
                successDialog.render().show();
            }.bind(this));

            this.hide();
            this.remove();
        },
        submit: function() {
            var dashboard = this.model.dashboard;
            dashboard.meta.validate();
            if (dashboard.meta.isValid()) {
                if(dashboard.entry.content.get('eai:type') === 'views'){
                    dashboard.meta.apply();
                }
                var clonePermissions = this.model.perms.get('clonePermissions'),
                    data = {app: this.model.application.get('app')};
                data.owner = (clonePermissions && this.model.acl.get('sharing') !== splunkDUtils.USER) ?
                    splunkDUtils.NOBODY : this.model.application.get("owner");
                dashboard.save({}, {
                    data: data,
                    success: function(model, response) {
                        if (clonePermissions) {
                            var data = this.model.acl.toDataPayload();
                            data.owner = this.model.application.get('owner');
                            dashboard.acl.save({}, {
                                data: data,
                                success: function(model, response){
                                    this.createSuccess();
                                }.bind(this)
                            });
                        } else {
                            this.createSuccess();
                        }
                    }.bind(this)
                });
            }
        },
        render: function () {
            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Clone").t());
            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.title.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.filename.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.description.render().el);

            var sharing = this.model.acl.get('sharing');
            if ((sharing===splunkDUtils.APP && this.model.dashboard.entry.acl.get("can_share_app")) ||
                (sharing===splunkDUtils.GLOBAL && this.model.dashboard.entry.acl.get("can_share_global"))) {
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.permissions.render().el);
            }

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _("Clone Dashboard").t() + '</a>');
            return this;
        }
    });

});

define('splunkjs/mvc/simplexml/dialog/dashboardtitle',[
    'underscore',
    'backbone',
    'module',
    'views/shared/Modal',
    'views/shared/controls/ControlGroup',
    'views/shared/FlashMessages'
    ],
    function(
        _,
        Backbone,
        module,
        Modal,
        ControlGroup,
        FlashMessage
    ) {
    return Modal.extend({
        moduleId: module.id,
        /**
        * @param {Object} options {
        *       model: <models.Report>
        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            this.workingModel = this.model.clone(); 

            this.children.flashMessage = new FlashMessage({ model: this.model });

            this.children.titleField = new ControlGroup({
                controlType: 'Text',
                controlOptions: {
                    modelAttribute: 'label',
                    model: this.workingModel,
                    placeholder: "optional"
                },
                label: _("Title").t()
            });

            this.children.descriptionField = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'description',
                    model: this.workingModel,
                    placeholder: "optional"
                },
                label: _("Description").t()
            });

        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
                this.model.set('label', this.workingModel.get('label')); 
                this.model.set('description', this.workingModel.get('description')); 
                this.hide();
                e.preventDefault();
            }
        }),
        render : function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Title or Description").t());

            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessage.render().el);

            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.titleField.render().el);
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.descriptionField.render().el);

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

            return this;
        }
    });
});

define('splunkjs/mvc/simplexml/editdashboard/editmenu',
    [
        'module',
        'jquery',
        'underscore',
        'models/classicurl',
        'views/shared/PopTart',
        'views/shared/documentcontrols/dialogs/TitleDescriptionDialog',
        'views/shared/documentcontrols/dialogs/permissions_dialog/Master',
        'views/shared/documentcontrols/dialogs/DeleteDialog',
        'uri/route',
        'bootstrap.modal', 
        'models/Dashboard', 
        'views/dashboards/table/controls/ConvertDashboard', 
        'views/dashboards/table/controls/CloneDashboard', 
        'views/dashboards/table/controls/SchedulePDF', 
        'views/shared/dialogs/TextDialog', 
        'splunk.util',  
        '../dialog/dashboardtitle', 
        'models/services/ScheduledView', 
        '../../utils',
        'models/ACLReadOnly'

    ],
    function(
        module,
        $,
        _,
        classicUrlModel,
        PopTartView,
        TitleDescriptionDialog,
        PermissionsDialog,
        DeleteDialog,
        route,
        undefined, 
        DashboardModel, 
        ConvertDialog, 
        CloneDialog, 
        SchedulePDFDialog, 
        TextDialog, 
        splunkUtils, 
        TitleDialog, 
        ScheduledViewModel, 
        utils,
        ACLReadOnlyModel
    )
    {
        return PopTartView.extend({
            moduleId: module.id,
            className: 'dropdown-menu',
            initialize: function() {
                PopTartView.prototype.initialize.apply(this, arguments);
                var defaults = {
                        button: true,
                        showOpenActions: true,
                        deleteRedirect: false
                    };

                _.defaults(this.options, defaults);
            },
            events: {
                'click a.edit-panels': function(e) {
                    e.preventDefault();
                    this.hide(); 
                    this.remove(); 
                    this.model.state.set('edit', true);
                },
                'click a.schedule-pdf': function(e){
                    e.preventDefault();
                    if ($(e.currentTarget).is('.disabled')) {
                        return;
                    }
                    this.hide(); 
                    this.remove(); 

                     var dialog = new SchedulePDFDialog({
                         model: {
                             scheduledView: this.model.scheduledView,
                             dashboard: this.model.dashboard,
                             application: this.model.application, 
                             appLocal: this.model.state.appLocal
                         },
                         onHiddenRemove: true
                     });
                     dialog.render().appendTo($('body'));
                     dialog.show();

                },
                'click a.delete': function(e){
                    e.preventDefault();
                    this.hide(); 
                    this.remove(); 
                    var dialog = new TextDialog({id: "modal-delete-dashboard"});
                    //override DialogBase dialogShown to put focus on the Delete button
                    dialog.dialogShown =  function() {
                        this.trigger("show");
                        // Apply focus to the first text input in the dialog. [JCS] Doesn't work without doing a debounce. Not sure why.
                        _.debounce(function() {
                            this.$('.btn-primary:first').focus();
                        }.bind(this), 0)();
                        return;
                    };
                    dialog.settings.set("primaryButtonLabel",_("Delete").t());
                    dialog.settings.set("cancelButtonLabel",_("Cancel").t());
                    dialog.settings.set("titleLabel",_("Delete").t());
                    dialog.setText(splunkUtils.sprintf(_("Are you sure you want to delete %s?").t(), 
                        '<em>' + (this.model.state.get('label') !== "" ? this.model.state.get('label') : this.model.dashboard.entry.get('name')) + '</em>'));
                    dialog.render().appendTo(document.body);

                    dialog.once('click:primaryButton', function(){
                        this.model.dashboard.destroy().done(function(){
                            var cur = utils.getPageInfo();
                            utils.redirect(route.page(cur.root, cur.locale, cur.app, 'dashboards'));
                        });
                    }, this);

                    dialog.on("hidden", function(){
                        dialog.remove();
                    }, this);

                    dialog.show();
                },
                'click a.edit-title-desc': function(e){
                    e.preventDefault();
                    this.hide(); 
                    this.remove(); 
                    this.children.titleDialog = new TitleDialog({
                        model: this.model.state,
                        onHiddenRemove: true
                    });
                    $("body").append(this.children.titleDialog.render().el);
                    this.children.titleDialog.show();
                },
                'click a.edit-perms': function(e) {
                    e.preventDefault();
                    this.hide(); 
                    this.remove(); 
                    this.children.permissionsDialog = new PermissionsDialog({
                        model: {
                            document: this.model.dashboard,
                            nameModel: this.model.dashboard.entry.content,
                            user: this.model.state.user
                        },
                        collection: this.collection,
                        nameLabel:  "Dashboard",
                        nameKey: 'label',
                        onHiddenRemove: true
                    });
                    $("body").append(this.children.permissionsDialog.render().el);
                    this.children.permissionsDialog.show();
                },
                'click a.convert-to-html': function(e) {
                    e.preventDefault();
                    this.hide(); 
                    this.remove(); 
                    var dashboard = new DashboardModel();
                    dashboard.meta.set(this.model.dashboard.meta.toJSON());

                    var convertDialog = this.children.convertDialog = new ConvertDialog({
                        model: {
                            dashboard: dashboard, 
                            currentDashboard: this.model.dashboard,
                            application: this.model.application,
                            user: this.model.state.user
                        },
                        collection: {
                            roles: this.collection 
                        },
                        onHiddenRemove: true

                    });

                    $("body").append(convertDialog.render().el);
                    convertDialog.show();

                },
                'click a.clone': function(e) {
                    e.preventDefault();
                    this.hide();
                    this.remove();
                    var clone = new DashboardModel();
                    clone.fetch({
                        success: function() {
                            if(this.model.dashboard.entry.content.get('eai:type') === 'html'){
                                clone.setHTML(this.model.dashboard.entry.content.get('eai:data'));
                            }else{
                                clone.setXML(this.model.dashboard.entry.content.get('eai:data'));
                            }
                            clone.meta.set(this.model.dashboard.meta.toJSON());

                            var cloneDialog  = this.children.cloneDialog = new CloneDialog({
                                model: {
                                    dashboard: clone,
                                    acl: new ACLReadOnlyModel($.extend(true, {}, this.model.dashboard.entry.acl.toJSON())),
                                    application: this.model.application,
                                    appLocal: this.model.state.appLocal,
                                    state: this.model.state,
                                    user: this.model.state.user
                                },
                                collection: {
                                    roles: this.collection
                                },
                                onHiddenRemove: true
                            });
                            $("body").append(cloneDialog.render().el);
                            cloneDialog.show();
                        }.bind(this)
                    });
                }
            },
            render: function() {
                var app = this.model.application.toJSON();
                var renderModel = {
                    dashboard: this.model.dashboard.isDashboard(),
                    editLinkViewMode: route.manager(app.root, app.locale, app.app, ['data','ui','views', app.page], {
                        data: {
                            action: 'edit',
                            ns: app.app,
                            redirect_override: route.page(app.root, app.locale, app.app, app.page)
                        }
                    }),
                    editLinkEditMode: route.manager(app.root, app.locale, app.app, ['data','ui','views', app.page], {
                        data: {
                            action: 'edit',
                            ns: app.app,
                            redirect_override: route.page(app.root, app.locale, app.app, app.page) + '/edit'
                        }
                    }),
                    dashboardType: this.model.dashboard.getViewType(),
                    editable: this.model.state.get('editable'),
                    canWrite: this.model.dashboard.entry.acl.canWrite(),
                    canCangePerms: this.model.dashboard.entry.acl.get('can_change_perms'),
                    canEditHtml: this.model.state.user.canEditViewHtml(),
                    removable: this.model.dashboard.entry.acl.get('removable'),
                    isXML: this.model.dashboard.isXML(),
                    isForm: this.model.dashboard.isForm(),
                    isSimpleXML: this.model.dashboard.isSimpleXML(),
                    isHTML: this.model.dashboard.isHTML(),
                    canSchedulePDF: this.model.state.user.canScheduleSearch() && !this.model.state.user.isFree() && (this.model.dashboard.isSimpleXML() ||
                        (this.model.dashboard.isAdvanced() && this.model.state.get('pdfgen_type') === 'deprecated')),
                    isPdfServiceAvailable: this.model.state.get('pdf_available'),
                    showAddTRP: !this.model.state.get('default_timerange'),
                    _: _
                };

                var html = this.compiledTemplate(renderModel);
                this.$el.html(PopTartView.prototype.template_menu);
                this.$el.append(html);

                return this;
            },
            template: '\
                <% if (canWrite && (editable || (!isHTML || canEditHtml) || (isSimpleXML && canEditHtml))) { %>\
                    <ul class="first-group">\
                        <% if(editable) { %>\
                        <li><a href="#" class="edit-panels"><%- _("Edit Panels").t() %></a></li>\
                        <% } %>\
                        <% if (!isHTML || canEditHtml) { %>\
                        <li><a href="<%- editLinkViewMode %>" class="edit-source"><%- _("Edit Source").t() %> <span class="dashboard-source-type"><%= dashboardType %></span></a></li>\
                        <% } %>\
                        <% if (isSimpleXML && canEditHtml) { %>\
                        <li><a href="#" class="convert-to-html"><%- _("Convert to HTML").t() %></a></li>\
                        <% } %>\
                    </ul>\
                    <% } %>\
                    <% if(canCangePerms || (canWrite && isXML) || canSchedulePDF) { %>\
                    <ul class="second-group">\
                        <% if(isXML && canWrite) { %>\
                        <li><a href="#" class="edit-title-desc"><%- _("Edit Title or Description").t() %></a></li>\
                        <% } %>\
                        <% if(canCangePerms) { %>\
                            <li><a href="#" class="edit-perms"><%- _("Edit Permissions").t() %></a></li>\
                        <% } %>\
                        <% if(canSchedulePDF) { %>\
                        <li>\
                        <% if(isForm) {%>\
                            <a class="schedule-pdf disabled" href="#" title="<%- _("You cannot schedule PDF delivery for a dashboard with form elements.").t() %>">\
                        <% } else { %>\
                            <a class="schedule-pdf" href="#">\
                        <% } %>\
                                <%- _("Schedule PDF Delivery").t() %>\
                            </a>\
                        </li>\
                        <% } %>\
                    </ul>\
                    <% } %>\
                    <% if ((!isHTML || canEditHtml) || (canWrite && removable)) { %>\
                    <ul class="third-group">\
                        <% if (!isHTML || canEditHtml) { %>\
                        <li><a href="#" class="clone"><%- _("Clone").t() %></a></li>\
                        <% } %>\
                        <% if(canWrite && removable) { %>\
                        <li><a href="#" class="delete"><%- _("Delete").t() %></a></li>\
                        <% } %>\
                    </ul>\
                <% } %>\
            '
        });
    }
);






define('splunkjs/mvc/simplexml/editdashboard/moreinfomenu',
    [
        'module',
        'jquery',
        'underscore',
        'models/classicurl',
        'views/shared/PopTart',
        'views/shared/documentcontrols/dialogs/TitleDescriptionDialog',
        'views/shared/documentcontrols/dialogs/permissions_dialog/Master',
        'views/shared/documentcontrols/dialogs/DeleteDialog',
        'uri/route',
        'bootstrap.modal',
        'util/splunkd_utils',
        'views/dashboards/table/controls/SchedulePDF',
        'models/services/ScheduledView',
        'models/Cron'
    ],
    function(
        module,
        $,
        _,
        classicUrlModel,
        PopTartView,
        TitleDescriptionDialog,
        PermissionsDialog,
        DeleteDialog,
        route,
        undefined,
        splunkDUtils,
        SchedulePDF,
        ScheduledViewModel,
        Cron
    )
    {
        return PopTartView.extend({
            moduleId: module.id,
            className: 'dropdown-menu more-info popdown-dialog',
            initialize: function() {
                PopTartView.prototype.initialize.apply(this, arguments);
                var defaults = {
                        button: true,
                        showOpenActions: true,
                        deleteRedirect: false
                    };

                _.defaults(this.options, defaults);
            },
            events: {
                'click .edit-schedule': function (e) {
                        e.preventDefault();
                        this.hide();
                        this.remove();
                        this.children.schedulePDF = new SchedulePDF({
                            model: {
                                scheduledView: this.model.scheduledView,
                                dashboard: this.model.dashboard,
                                application: this.model.application,
                                appLocal: this.model.state.appLocal
                            },
                            onHiddenRemove: true
                        });
                        $("body").append(this.children.schedulePDF.render().el);
                        this.children.schedulePDF.show();

                },
                'click a.edit-permissions': function(e) {
                    e.preventDefault();
                    this.hide();
                    this.remove();
                    this.children.permissionsDialog = new PermissionsDialog({
                        model: {
                            document: this.model.dashboard,
                            nameModel: this.model.dashboard.entry.content,
                            user: this.model.state.user
                        },
                        collection: this.collection,
                        nameLabel:  "Dashboard",
                        nameKey: 'label',
                        onHiddenRemove: true
                    });

                    $("body").append(this.children.permissionsDialog.render().el);
                    this.children.permissionsDialog.show();
                }
            },
            render: function() {
                var isScheduled = this.model.scheduledView.entry.content.get('is_scheduled'), schedule = '-', recipients = [],
                    sharing = this.model.dashboard.entry.acl.get("sharing"),
                    owner = this.model.dashboard.entry.acl.get("owner"),
                    permissionString = splunkDUtils.getPermissionLabel(sharing, owner),
                    appString = this.model.dashboard.entry.acl.get('app');
                    if (isScheduled) {
                        var expr = this.model.scheduledView.entry.content.get('cron_schedule'), cron = expr ? Cron.createFromCronString(expr) : null;
                        if(cron) {
                            switch (cron.get('cronType')) {
                                case 'hourly':
                                    schedule = _("Sent Hourly").t();
                                    break;
                                case 'daily':
                                    schedule = _("Sent Daily").t();
                                    break;
                                case 'weekly':
                                    schedule = _("Sent Weekly").t();
                                    break;
                                case 'monthly':
                                    schedule = _("Sent Monthly").t();
                                    break;
                                case 'custom':
                                    schedule = _("Sent on a custom schedule").t();
                                    break;
                            }
                        }
                        recipients = (this.model.scheduledView.entry.content.get('action.email.to')||'').split(/\s*,\s*/);
                    }
                var renderModel = {
                    _:_,
                    isScheduled: isScheduled,
                    schedule: schedule,
                    recipients: _(recipients).chain().filter(_.identity).map(function(recipient){
                        return ['<a href="mailto:',encodeURIComponent(recipient),'">',_.escape(recipient),'</a>'].join('');
                    }).value(),
                    shared: this.model.dashboard.entry.acl.get("perms"),
                    owner: owner,
                    permissionString: permissionString,
                    canChangePerms: this.model.dashboard.entry.acl.get('can_change_perms'),
                    canSchedulePDF: this.model.state.user.canScheduleSearch() && !this.model.state.user.isFree() && ((this.model.dashboard.isSimpleXML() && !this.model.dashboard.isForm()) ||
                        (this.model.dashboard.isAdvanced() && this.model.state.get('pdfgen_type') === 'deprecated')),
                    isPdfServiceAvailable: this.model.state.get('pdf_available'),
                    appString: appString
                };

                var html = this.compiledTemplate(renderModel);
                this.$el.html(PopTartView.prototype.template_menu);
                this.$el.append(html);

                return this;
            },
            template: '\
                <div class="popdown-dialog-body">\
                    <div>\
                        <dl class="list-dotted">\
                            <dt class="app"><%- _("App").t() %></dt>\
                            <dd>\
                                <%= appString %>\
                            </dd>\
                            <dt class="schedule"><%- _("Schedule").t() %></dt>\
                            <dd>\
                                <% if(isScheduled) { %>\
                                    <%= schedule %> <%- _("to").t() %> \
                                    <%= recipients.join(", ") %>.\
                                <% } else { %>\
                                    <%- _("Not scheduled").t() %>.\
                                <% } %> \
                                <% if(canSchedulePDF && isPdfServiceAvailable) { %>\
                                    <a href="#" class="edit-schedule"><%- _("Edit").t() %></a>\
                                <% } %> \
                            </dd>\
                            <dt class="permissions"><%- _("Permissions").t() %></dt>\
                            <dd class="edit-permissions">\
                                <%- _(permissionString).t() %>\
                                <% if(canChangePerms) { %>\
                                    <a href="#" class="edit-permissions"><%- _("Edit").t() %></a>\
                                <% } %> \
                        </dl>\
                    </div>\
                </div>\
            '
        });
    }
);

define('splunkjs/mvc/simplexml/editdashboard/menuview',['require','exports','module','underscore','jquery','views/Base','../dialog/addpanel','util/pdf_utils','models/Dashboard','../controller','util/console','../../../mvc','../../utils','uri/route','../../simpleform/input/timerange','splunk.config','util/splunkd_utils','./editmenu','./moreinfomenu'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseView = require('views/Base');
    var AddPanelDialog = require('../dialog/addpanel');
    var pdfUtils = require('util/pdf_utils');
    var DashboardModel = require('models/Dashboard');
    var Dashboard = require('../controller');
    var console = require('util/console');
    var mvc = require('../../../mvc');
    var utils = require('../../utils');
    var route = require('uri/route');
    var TimeRangePickerInput = require('../../simpleform/input/timerange');
    var config = require('splunk.config');
    var splunkDUtils = require('util/splunkd_utils');
    var EditMenu = require('./editmenu');
    var MoreInfoMenu = require('./moreinfomenu');

    var MenuView = BaseView.extend({
        moduleId: module.id,
        className: 'edit-menu',
        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.model.state.on('change:edit', this.onEditModeChange, this);
            this.model.state.on('change:editable change:pdf_available', this.render, this);
            this.model.state.on('change:default_timerange', this.handleDefaultTimeRangeChange, this);
            this.model.state.user.on("change", this.render, this);
            this._ready = false;
            var that = this;
            _.defer(function(){
                that._ready = true;
            });
        },
        events: {
            'click a.edit-btn': function(e) {
                e.preventDefault();
                var $target = $(e.currentTarget);
                if (this.children.editMenu && this.children.editMenu.shown) {
                    this.children.editMenu.hide();
                    return;
                }
                if (this.children.moreInfoMenu && this.children.moreInfoMenu.shown) {
                    this.children.moreInfoMenu.hide();
                }
                $target.addClass('active');

                this.children.editMenu = new EditMenu({
                    model: {
                        application: this.model.application,
                        dashboard: this.model.dashboard,
                        state: this.model.state, 
                        scheduledView: this.model.scheduledView
                    },
                    collection: this.collection,
                    showOpenActions: this.options.showOpenActions,
                    deleteRedirect: this.options.deleteRedirect,
                    onHiddenRemove: true
                });
                $('body').append(this.children.editMenu.render().el);
                this.children.editMenu.show($target);
                this.children.editMenu.on('hide', function() {
                    $target.removeClass('active');
                }, this);
            },
            'click a.more-info-btn': function(e) {
                e.preventDefault();
                var $target = $(e.currentTarget);
                if (this.children.moreInfoMenu && this.children.moreInfoMenu.shown) {
                    this.children.moreInfoMenu.hide();
                    return;
                }
                if (this.children.editMenu && this.children.editMenu.shown) {
                    this.children.editMenu.hide();
                }
                $target.addClass('active');
                this.children.moreInfoMenu= new MoreInfoMenu({
                    model: {
                        application: this.model.application,
                        dashboard: this.model.dashboard,
                        state: this.model.state,
                        scheduledView: this.model.scheduledView
                    },
                    collection: this.collection,
                    onHiddenRemove: true
                });
                
                $('body').append(this.children.moreInfoMenu.render().el);
                this.children.moreInfoMenu.show($target);
                this.children.moreInfoMenu.on('hide', function() {
                    $target.removeClass('active');
                }, this);
            },
            'click a.edit-done': function(e){
                e.preventDefault();
                this.model.state.set('edit', false);
            },
            'click a.add-panel': function(e) {
                e.preventDefault();
                this.children.addPanelDialog = new AddPanelDialog({
                    controller: this.options.controller
                });
                this.children.addPanelDialog.render().appendTo($("body")).show();
            },
            'click a.add-trp': function(e) {
                e.preventDefault();

                var $trpEl = $('<div class="input input-timerangepicker" id="field3"><label>&nbsp;</label></div>');
                var fieldset = $('body>.dashboard-body>.fieldset');

                var submitButton = fieldset.find('.form-submit');
                if(submitButton.length) {
                    $trpEl.insertBefore(submitButton);
                } else {
                    $trpEl.appendTo(fieldset);
                }

                var id = "timerange", seq = 1;
                while(mvc.Components.has(id)) {
                    id = "timerange" + (seq++);
                }

                var trp = new TimeRangePickerInput({
                    id: "timerange",
                    isGlobal: true,
                    earliest_time: "$earliest$",
                    latest_time: "$latest$",
                    el: $trpEl
                }, {tokens: true}).render();
                
                // Simulate submitOnChange=true
                trp.on('change', function() {
                    var defaultTokenModel = mvc.Components.getInstance('default');
                    var submittedTokenModel = mvc.Components.getInstance('submitted');
                    
                    // Simulate submitTokens()
                    submittedTokenModel.set(defaultTokenModel.toJSON());
                });

                Dashboard.trigger('formupdate');
            },
            'click a.print-dashboard': function(e){
                e.preventDefault();
                window.print();
            },
            'click a.generate-pdf': function(e){
                e.preventDefault();
                var view = this.model.dashboard.entry.get('name'),
                    app = this.model.dashboard.entry.acl.get('app'),
                    params = {}, idx = 0;

                // Collect SIDs for search jobs on the dashboard
                _.map(mvc.Components.get('dashboard').getElementIds(), function(id){
                    var element = mvc.Components.get(id);
                    if(element && element.getExportParams) {
                        _.extend(params, element.getExportParams('sid_'+idx));
                    }
                    idx++;
                });

                pdfUtils.isPdfServiceAvailable().done(function(available, type){
                    if(type === 'pdfgen') {
                        var xml = Dashboard.model.view.getFlattenedXML({ useLoadjob: false, indent: false });
                        if(console.DEBUG_ENABLED) {
                            console.log(xml);
                        }
                        pdfUtils.downloadReportFromXML(xml, app, params);
                    } else if(type === 'deprecated') {
                        pdfUtils.getRenderURL(view, app, params).done(function(url){
                            window.open(url);
                        });
                    }
                });
            }
        },
        onEditModeChange: function() {
            var edit = this.model.state.get('edit');
            this.$('.dashboard-view-controls')[edit ? 'hide' : 'show']();
            this.$('.dashboard-edit-controls')[edit ? 'show' : 'hide']();
        },
        handleDefaultTimeRangeChange: function(m) {
            if(this._ready && this.model.state.get('edit')) {
                var isForm = $('body>.dashboard-body>.fieldset').children().length > 0,
                    trp = m.get('default_timerange'), defaultValue;
                if(trp) {
                    defaultValue = trp;
                }
                this.model.dashboard.saveFormSettings(isForm, trp, defaultValue);
            }
            this.render();
        },
        render: function() {
            var app = this.model.application.toJSON();
            var renderModel = {
                dashboard: this.model.dashboard.isDashboard(),
                editLinkViewMode: route.manager(app.root, app.locale, app.app, ['data','ui','views', app.page], {
                            data: {
                                action: 'edit',
                                ns: app.app,
                                redirect_override: route.page(app.root, app.locale, app.app, app.page)
                            }
                        }),
                editLinkEditMode: route.manager(app.root, app.locale, app.app, ['data','ui','views', app.page], {
                            data: {
                                action: 'edit',
                                ns: app.app,
                                redirect_override: route.page(app.root, app.locale, app.app, app.page) + '/edit'
                            }
                        }),
                dashboardType: this.model.dashboard.getViewType(),
                editable: this.model.state.get('editable'),
                canWrite: this.model.dashboard.entry.acl.canWrite(),
                removable: this.model.dashboard.entry.links.get('remove') ? true : false,
                isSimpleXML: this.model.dashboard.isSimpleXML(),
                isHTML: this.model.dashboard.isHTML(),
                isPdfServiceAvailable: this.model.state.get('pdf_available'),
                showAddTRP: !this.model.state.get('default_timerange'),
                _: _
            };

            this.$el.html(this.compiledTemplate(renderModel));

            this.$('.generate-pdf').tooltip({ animation:false, title: _("Export PDF").t() });
            this.$('.print-dashboard').tooltip({ animation:false, title: _("Print").t() });
            this.onEditModeChange();
            return this;
        },
        template: '\
            <span class="dashboard-view-controls">\
                <% if(canWrite) { %>\
                    <div class="btn-group">\
                        <a class="btn edit-btn" href="#"><%- _("Edit").t() %> <span class="caret"></span></a>\
                        <a class="btn more-info-btn" href="#"><%- _("More Info").t() %> <span class="caret"></span></a>\
                    </div>\
                <% }else{ %>\
                    <div class="btn-group">\
                        <a class="btn edit-btn" href="#"><%- _("Edit").t() %> <span class="caret"></span></a>\
                    </div>\
                <% } %>\
                <div class="btn-group">\
                    <% if(isSimpleXML && isPdfServiceAvailable) { %>\
                        <a class="btn generate-pdf" href="#"><i class="icon-export icon-large"></i></a>\
                    <% } %>\
                        <a class="btn print-dashboard" href="#"><i class="icon-print icon-large"></i></a>\
                </div>\
            </span>\
            <span class="dashboard-edit-controls" style="display:none;">\
                <div class="btn-group">\
                    <a class="btn add-panel" href="#"><i class="icon-plus"></i> <%- _("Add Panel").t() %></a> \
                    <% if(showAddTRP) { %>\
                        <a class="btn add-trp" href="#"><i class="icon-clock"></i> <%- _("Add Time Range Picker").t() %></a> \
                    <% } %>\
                    <a class="btn edit-source" href="<%- editLinkEditMode %>"><i class="icon-code"></i> <%- _("Edit Source").t() %></a> \
                </div>\
                <a class="btn btn-primary edit-done" href="#"><%- _("Done").t() %></a>\
            </span>\
        '
    });
    
    return MenuView;
}); 

define('splunkjs/mvc/simplexml/editdashboard/master',['require','exports','module','underscore','jquery','views/Base','collections/services/authorization/Roles','./menuview'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseView = require('views/Base');
    var Roles = require('collections/services/authorization/Roles');
    var MenuView = require('./menuview'); 

    return BaseView.extend({
        className: "splunk-dashboard-controls",

        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.rolesCollection = new Roles();
            this.rolesCollection.fetch();

            this.children.menuView = new MenuView({
                model: {
                    state: this.model.state,
                    dashboard: this.model.dashboard,
                    application: this.model.application,
                    scheduledView: this.model.scheduledView
                },
                collection: this.rolesCollection, 
                controller: this.options.controller 
            });
        },
        render: function(){
            this.$el.append(this.children.menuView.render().el);
            return this;
        }
    });
});

define('splunkjs/mvc/simplexml/dragndrop',['require','backbone','underscore','jquery','util/console'],function(require){
    var Backbone = require('backbone');
    var _ = require('underscore');
    var $ = require('jquery');
    var console = require('util/console');

    var libraryLoaded = $.Deferred(), div = document.createElement('div'),
        supportsHTML5 = (('draggable' in div) || ('ondragstart' in div && 'ondrop' in div)),
        useHTML5 = false, //supportsHTML5 && !/jqueryDD/g.test(window.location),
        SORTABLE = useHTML5 ? 'sortable5' : 'sortable';
    if(useHTML5) {
        console.log('loading html5 sortable');
        require(['splunkjs/contrib/jquery.sortable.html5'], libraryLoaded.resolve);
    } else {
        console.log('loading jquery ui sortable');
        require(['jquery.ui.sortable'], libraryLoaded.resolve);
    }

    return Backbone.View.extend({
        render: function() {
//            Drag&Drop library indicator (for test purposes)
//            this.$('.dashboard-header').append($('<a class="badge badge-info dd-lib-debug" title="Click to switch drag and drop library" href="#"></a>')
//                    .attr('href',(useHTML5 ? '?jqueryDD=1':'?')).text('Drag&Drop: ' + (useHTML5 ? 'HTML5':'jQueryDD')));
            libraryLoaded.done(this.startDragAndDrop.bind(this));
            return this;
        },
        events: {
            'mouseover .drag-handle': function(e){
                $(e.target).parents('.dashboard-panel').addClass('drag-hover');
            },
            'mouseout .drag-handle': function(e){
                $(e.target).parents('.dashboard-panel').removeClass('drag-hover');
            }
        },
        startDragAndDrop: function() {
            this.$el.addClass('dragndrop-enabled');
            _.defer(this.enableDragAndDrop.bind(this));
        },
        enableDragAndDrop: function() {
            var that = this;
            var sortable, updateDims = _.debounce(that.updateDimensions.bind(this), 0),
                enableDragAndDrop = this.enableDragAndDrop.bind(this),
                onEnd = _.once(function(){
                    console.log('sort STOP');
                    if(sortable) {
                        try {
                            sortable[SORTABLE]('destroy');
                        } catch(e){}
                        _.defer(enableDragAndDrop);
                        that.trigger('sortupdate');
                        sortable = null;
                        $(window).trigger('resize');
                    }
                });
            this.createNewDropRow();
            sortable = this.$('.dashboard-row')[ SORTABLE ]({
                    handle: '.drag-handle',
                    connectWith: this.$('.dashboard-row'),
                    placeholder: {
                        element: function(){
                            return $('<div class="sortable-placeholder"><div class="dashboard-panel"></div></div>');
                        },
                        update: function(ct, p) {
                            that.updateRow(p.parents('.dashboard-row'));
                        }
                    },
                    tolerance: "pointer"
                }).on('sort', function(e){
                    updateDims();
                }).on('sortupdate', function(e){
                    onEnd();
                }).on('stop', function(e){
                    onEnd();
                });
            updateDims();
            $(window).trigger('resize');
        },
        destroy: function() {
            this.$el.removeClass('dragndrop-enabled');
            this.cleanupEmptyRows();
            try {
                this.$('.dashboard-row')[SORTABLE]('destroy');
            } catch(e){}
            this.updateDimensions();
        },
        updateRow: function(r) {
            var els = $(r).children().not('.ui-sortable-helper'), w = String(Math.floor(10000/(els.not('.sortable-dragging').length))/100)+'%';
            els.css({ width: w });
            var items = $(r).find('.dashboard-panel');
            items.css({ 'min-height': 100 }).css({ 'min-height': _.max(_.map(items, function(i){ return $(i).height(); })) });
        },
        updateDimensions: function() {
            _(this.$('.dashboard-row')).each(this.updateRow);
        },
        createNewDropRow: function() {
            this.cleanupEmptyRows();
            this.$('.dashboard-row').after($('<div class="dashboard-row empty"></div>'));
            this.$('.dashboard-row').first().before($('<div class="dashboard-row empty"></div>'));
        },
        cleanupEmptyRows: function() {
            // console.log('removing empty rows');
            this.$('.dashboard-row').each(function(){
                var r = $(this);
                if(r.is(':empty') || r.html().match(/^\s+$/)) {
                    r.remove();
                }
            });
            this.$('.dashboard-row.empty').removeClass('empty');
        },
        getItemOrder: function() {
            return _(this.$('.dashboard-row')).map(function(row){
                return _($(row).find('.dashboard-panel')).map(function(panel){
                    return _($(panel).find('.dashboard-element')).map(function(element){
                        return $(element).attr('id');
                    });
                });
            });
        }
    });

});
define('splunkjs/mvc/simpleform/fieldsetview',['require','exports','module','underscore','jquery','views/Base','../simplexml/controller'],function(require, module){
    var _ = require('underscore'),
        $ = require('jquery'),
        BaseView = require('views/Base'),
        Dashboard = require('../simplexml/controller');

    return BaseView.extend({
        moduleId: module.id,
        className: 'fieldset',
        initialize: function() {
            Dashboard.on('formupdate', this.render, this);
            BaseView.prototype.initialize.apply(this, arguments);
        },
        render: function() {
            if(_.any(this.$el.find('label'), function(label) {
                var txt = $(label).text();
                return !!$.trim(txt);
            })) {
                this.$el.removeClass('hide-label');
            } else {
                this.$el.addClass('hide-label');
            }
            return this;
        }
    });
});
define('splunkjs/mvc/simplexml/dashboard/title',['require','underscore','jquery','backbone'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            Backbone = require('backbone');

    var DashboardTitle = Backbone.View.extend({
        initialize: function() {
            this.model.on('change:edit change:label', this.render, this);
        },
        render: function() {
            if(!this.model.has('label')) {
                this.model.set({ label: this.$el.text() }, { silent: true });
            }
            this.$('.edit-label').remove();
            this.$el.text(_(this.model.get('label')).t());
            if(this.model.get('edit')) {
                $('<span class="edit-label">' + _("Edit").t() + ': </span>').prependTo(this.$el);
            }
            return this;
        }
    });

    return DashboardTitle;

});
define('splunkjs/mvc/simplexml/dashboard/description',['require','underscore','backbone'],function(require) {
    var _ = require('underscore'),
        Backbone = require('backbone');

    return Backbone.View.extend({
        initialize: function() {
            this.listenTo(this.model, 'change:description', this.render, this);
            this.listenTo(this.model, 'change:edit', this.render, this);
        },
        render: function() {
            if(this.model.has('description')) {
                var txt = _(this.model.get('description') || '').t(),
                    edit = this.model.get('edit');
                this.$el.text(txt)[ txt && !edit ? 'show' : 'hide' ]();
            }
            return this;
        }
    });

});
define('splunkjs/mvc/simplexml/dashboard/row',['require','underscore','jquery','backbone'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            Backbone = require('backbone');

    return Backbone.View.extend({
        events: {
            'cellRemoved': 'onContentChange'
        },
        initialize: function() {
            this.listenTo(this.model, 'change:edit', this.onEditStateChange, this);
        },
        onEditStateChange: function() {
            this.$el.off('DOMSubtreeModified');
            if((!this.model.get('edit')) && this.$('.dashboard-panel').length > 1) {
                var fn = _.debounce(this.alignItemHeights.bind(this), 1000);
                this.$el.bind('DOMSubtreeModified', fn);
                fn();
            }
        },
        onContentChange: function() {
            this.$el.off('DOMSubtreeModified');
            var cells = this.$('.dashboard-cell');
            if(cells.length === 0) {
                return this.remove();
            }
            cells.css({ width: String(100 / cells.length) + '%' }).find('.panel-element-row').each(function(){
                var elements = $(this).find('.dashboard-element');
                elements.css({ width: String(100 / elements.length) + '%' });
            });
            if(cells.length > 1) {
                this.alignItemHeights();
            }
            this.onEditStateChange();
        },
        alignItemHeights: function() {
            var row = this.$el, items = row.find('.dashboard-panel');
            items.css({ 'min-height': 0 }).css({
                'min-height': _.max(_.map(items, function(i) { return $(i).height(); }))
            });
        },
        render: function() {
            this.onEditStateChange();
            return this;
        }
    });

});

define('splunkjs/mvc/simplexml/dashboard/panel',['require','jquery','backbone'],function(require) {
    var $ = require('jquery'),
        Backbone = require('backbone');

    /**
     * Delegate view for dashboard panels that deals with hiding/showing the drag-handle for edit mode
     */
    return Backbone.View.extend({
        initialize: function() {
            this.listenTo(this.model, 'change:edit', this.onEditStateChange, this);
        },
        onEditStateChange: function(model) {

            if(model.get('edit')) {
                if(!this._dragHandle) {
                    this._dragHandle = $('<div class="drag-handle"><div class="handle-inner"></div></div>');
                }
                this._dragHandle.prependTo(this.el);
            } else {
                if(this._dragHandle) {
                    this._dragHandle.detach();
                }
            }
        },
        render: function() {
            this.onEditStateChange(this.model);
            return this;
        }
    });

});
define('splunkjs/mvc/simplexml/dashboard',['require','../basesplunkview','../mvc','underscore','jquery','./controller','./editdashboard/master','./dragndrop','util/console','../simpleform/fieldsetview','./dashboard/title','./dashboard/description','./dashboard/row','./dashboard/panel','models/services/ScheduledView'],function(require) {
    var BaseSplunkView = require('../basesplunkview');
    var mvc = require('../mvc');
    var _ = require('underscore');
    var $ = require('jquery');
    var controller = require('./controller');
    var EditControls = require('./editdashboard/master');
    var DragnDropView = require('./dragndrop');
    var console = require('util/console');
    var FieldsetView = require('../simpleform/fieldsetview');

    var DashboardTitleView = require('./dashboard/title');
    var DashboardDescriptionView = require('./dashboard/description');
    var DashboardRowView = require('./dashboard/row');
    var DashboardPanel = require('./dashboard/panel');
    var ScheduledView = require('models/services/ScheduledView');

    var DashboardView = BaseSplunkView.extend({
        initialize: function() {
            this.model = controller.getStateModel();
            this.model.scheduledView = new ScheduledView(); 
                    
            this.scheduledViewDfd = $.Deferred();
            controller.onViewModelLoad(function(){
                var dfd = this.model.scheduledView.findByName(this.model.view.entry.get('name'),
                    this.model.app.get('app'),
                    this.model.app.get('owner'));
                dfd.done(_.bind(this.scheduledViewDfd.resolve, this.scheduledViewDfd));
                dfd.fail(_.bind(this.scheduledViewDfd.reject, this.scheduledViewDfd));
            }, this);

            this.editControls = new EditControls({
                model: {
                    state: this.model,
                    dashboard: this.model.view,
                    application: this.model.app,
                    scheduledView: this.model.scheduledView
                }, 
                controller: controller 
            });
            this.model.on('change:edit', this.onEditStateChange, this);
        },
        render: function() {
            var model = this.model;
            this.rows = _.map(this.$('.dashboard-row'), function(row) {
                return new DashboardRowView({
                    el: row,
                    model: model
                }).render();
            });
            this.titleView = new DashboardTitleView({
                model: this.model,
                el: this.$('.dashboard-header h2')
            }).render();

            var descEl = this.$('p.description');
            if(!descEl.length) {
                descEl = $('<p class="description"></p>').appendTo(this.$('.dashboard-header')).hide();
            }

            this.descriptionView = new DashboardDescriptionView({
                el: descEl,
                model: model
            }).render();

            var fieldsetEl = this.$el.children('.fieldset');
            if(!fieldsetEl.length) {
                fieldsetEl = $('<div class="fieldset"></div>').insertAfter(this.$('.dashboard-header'));
            }
            this.fieldsetView = new FieldsetView({
                el: fieldsetEl
            }).render();

            var editEl = $('<div class="edit-dashboard-menu pull-right"></div>').prependTo(this.$('.dashboard-header'));            
            $.when(this.scheduledViewDfd).then(function() {
                this.editControls.render().appendTo(editEl);
            }.bind(this));            

            this.panels = _(this.$('.dashboard-panel')).map(function(el){
                return new DashboardPanel({ el: el, model: model }).render();
            });

            this.onEditStateChange();

            _.defer(function() {
                $('body').removeClass('preload');
            });

            this.model.view.captureItemOrder(this.getItemOrder());

            return this;
        },
        getController: function() {
            return controller;
        },
        getStateModel: function() {
            return this.model;
        },
        getItemOrder: function() {
            return _(this.$('.dashboard-row')).map(function(row) {
                return _($(row).find('.dashboard-panel')).map(function(panel) {
                    return _($(panel).find('.dashboard-element')).map(function(element) {
                        return $(element).attr('id');
                    });
                });
            });
        },
        getElementIds: function() {
            return _.flatten(this.getItemOrder());
        },
        enterEditMode: function() {
            this.leaveEditMode();

            if(this.model.get('editable')) {
                console.log('Entering edit mode');
                this.dragnDrop = new DragnDropView({
                    el: this.el
                });
                this.model.view.captureItemOrder((this.getItemOrder()));
                this.dragnDrop.on('sortupdate', _.debounce(this.updatePanelOrder, 0), this);
                this.dragnDrop.render();
            } else {
                console.log('Aborting edit mode: Dashboard is not editable');
                this.model.set('edit', false);
            }
        },
        updatePanelOrder: function() {
            this.model.view.setItemOrder(this.getItemOrder());
        },
        leaveEditMode: function() {
            if(this.dragnDrop) {
                this.dragnDrop.off();
                this.dragnDrop.destroy();
                this.updatePanelOrder();
                this.dragnDrop = null;
            }
        },
        onEditStateChange: function() {
            if(this.model.get('edit')) {
                controller.onViewModelLoad(this.enterEditMode, this);
            } else {
                this.leaveEditMode();
            }
        },
        removeElement: function(id) {
            var cur = this.$('#' + id), parentRow = cur.parents('.dashboard-row');
            if(cur.siblings('.dashboard-element').length) {
                cur.remove();
            } else {
                var elRow = cur.parents('.panel-element-row');
                if(elRow.siblings('.panel-element-row').length) {
                    elRow.remove();
                } else {
                    cur.parents('.dashboard-cell').remove();
                }
            }
            parentRow.trigger('cellRemoved');
        },
        createNewElement: function(options) {
            var row = $(_.template(this.rowTemplate, options));
            row.appendTo(this.$el);
            this.rows.push(new DashboardRowView({
                el: row,
                model: this.model
            }).render());

            this.panels.push(new DashboardPanel({
                el: row.find('.dashboard-panel'),
                model: this.model
            }).render());

            return row.find('.dashboard-element');
        },
        rowTemplate: '  <div class="dashboard-row">\
                            <div class="dashboard-cell" style="width: 100%;">\
                                <div class="dashboard-panel clearfix">\
                                    <div class="panel-element-row">\
                                        <div class="dashboard-element" id="<%= id %>" style="width: 100%">\
                                            <div class="panel-head"><h3><%- title %></h3></div>\
                                            <div class="panel-body"></div>\
                                        </div>\
                                    </div>\
                                </div>\
                            </div>\
                        </div>'
    });

    return DashboardView;
});

define('splunkjs/mvc/simplexml/element/table',['require','underscore','jquery','backbone','../../../mvc','./base','../../tableview','util/console','../mapper','splunk.util'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var TableView = require('../../tableview');
    var console = require('util/console');
    var Mapper = require('../mapper');
    var SplunkUtil = require('splunk.util');

    var TableMapper = Mapper.extend({
        tagName: 'table',
        map: function(report, result, options) {
            result.options.wrap = String(SplunkUtil.normalizeBoolean(report.get('display.statistics.wrap', options)));
            result.options.rowNumbers = String(SplunkUtil.normalizeBoolean(report.get('display.statistics.rowNumbers', options)));
            result.options.dataOverlayMode = report.get('display.statistics.overlay', options);
            result.options.drilldown = report.get('display.statistics.drilldown', options);
            result.options.count = report.get('display.prefs.statistics.count', options);

            result.options.labelField = null;
            result.options.valueField = null;

            var fields = report.get('display.statistics.fields', options);
            result.tags.fields = _.isArray(fields) ?
                    (_.isEmpty(fields) ? null : JSON.stringify(fields)) :
                    (fields === '[]' ? null : fields);

            if(result.options.drilldown === false) {
                delete result.options.drilldown;
            } else if(result.options.drilldown === true) {
                result.options.drilldown = 'row';
            }
        }
    });
    Mapper.register('statistics', TableMapper);

    var TableVisualization = TableView.extend({
        panelClassName: 'table',
        prefix: 'display.statistics.',
        reportDefaults: {
            'display.general.type': 'statistics',
            'display.prefs.statistics.count' : 10,
            'display.statistics.drilldown': 'cell'
        },
        getResultsLinkOptions: function(options) {
            return {};
        }
    });
    DashboardElement.registerVisualization('statistics', TableVisualization);

    var TableElement = DashboardElement.extend({
        initialVisualization: 'statistics'
    });
    
    return TableElement;
});
define('splunkjs/mvc/simplexml/element/chart',['require','underscore','jquery','backbone','../../../mvc','./base','../../chartview','../mapper','util/console'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var ChartView = require('../../chartview');
    var Mapper = require('../mapper');
    var console = require('util/console');

    var chartingPrefix = 'display.visualizations.charting.', vizPrefix = 'display.visualizations.';
    Mapper.register('visualizations:charting', Mapper.extend({
        tagName: 'chart',
        map: function(report, result, options) {
            _(report.toJSON(options)).each(function(value, key){
                if(key.substring(0, chartingPrefix.length) === chartingPrefix) {
                    result.options[key.substring(vizPrefix.length)] = report.get(key, options);
                }
            });
            if(options['charting.drilldown']) {
                result.removeOptions = ['drilldown'];
            }
        }
    }));

    var ChartViz = ChartView.extend({
        panelClassName: 'chart',
        reportDefaults: {
            "display.visualizations.show": true,
            "display.visualizations.type": "charting",
            "display.general.type": "visualizations"
        },
        options: _.defaults({
            resizable: true
        }, ChartView.prototype.options),
        getResultsLinkOptions: function() {
            return {};
        }
    });
    DashboardElement.registerVisualization('visualizations:charting', ChartViz);
    DashboardElement.registerVisualization('visualizations', ChartViz);

    var ChartElement = DashboardElement.extend({
        initialVisualization: 'visualizations:charting'
    });

    return ChartElement;
});
define('splunkjs/mvc/simplexml/element/event',['require','underscore','jquery','backbone','../../../mvc','./base','../../eventsviewerview','../mapper','util/console'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var EventsViewer = require('../../eventsviewerview');
    var Mapper = require('../mapper');
    var console = require('util/console');

    var eventsPrefix = 'display.events.';

    var EventMapper = Mapper.extend({
        tagName: 'event',
        map: function(report, result, options) {
            result.options.count = report.get('display.prefs.events.count', options);
            _(report.toJSON(options)).each(function(v, key){
                if(key.indexOf(eventsPrefix) === 0) {
                    var value = report.get(key, options);
                    if(_.isArray(value)) {
                        value = JSON.stringify(value);
                    }
                    result.options[key.substring(eventsPrefix.length)] = (value != null) ? String(value) : null;
                }
            });
        }
    });
    Mapper.register('events:raw', EventMapper);
    Mapper.register('events:list', EventMapper);
    Mapper.register('events:table', EventMapper);

    var EventsVisualization = EventsViewer.extend({
        reportDefaults: {
            'display.general.type': 'events',
            'display.prefs.events.count' : 10
        },
        getResultsLinkOptions: function() {
            return {};
        }
    });
    DashboardElement.registerVisualization('events', EventsVisualization);
    DashboardElement.registerVisualization('events:raw', EventsVisualization);
    DashboardElement.registerVisualization('events:list', EventsVisualization);
    DashboardElement.registerVisualization('events:table', EventsVisualization);

    var EventElement = DashboardElement.extend({
        initialVisualization: 'events'
    });
    
    return EventElement;
});
define('splunkjs/mvc/simplexml/element/single',['require','underscore','../../../mvc','./base','../../singleview','../mapper','util/console'],function(require) {
    var _ = require('underscore');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var SingleView = require('../../singleview');
    var Mapper = require('../mapper');
    var console = require('util/console');

    Mapper.register('visualizations:singlevalue', Mapper.extend({
        tagName: 'single',
        map: function(report, result, options) {
            var prefix = 'display.visualizations.singlevalue.';
            console.log(report.toJSON(options));
            _(report.toJSON(options)).each(function(v, k) {
                if(k.substring(0, prefix.length) === prefix) {
                    result.options[k.substring(prefix.length)] = v;
                }
            });
            console.log('single export options: ', result.options);
        }
    }));

    var SingleViz = SingleView.extend({
        panelClassName: 'single',
        reportDefaults: {
            "display.visualizations.show": true,
            "display.visualizations.type": "singlevalue",
            "display.general.type": "visualizations"
        },
        getResultsLinkOptions: function(options) {
            return { "link.visible": false };
        }
    });
    DashboardElement.registerVisualization('visualizations:singlevalue', SingleViz);

    var SingleElement = DashboardElement.extend({
        initialVisualization: 'visualizations:singlevalue'
    });
    
    return SingleElement;
});
define('splunkjs/mvc/simplexml/element/map',['require','underscore','jquery','backbone','../../../mvc','./base','../../splunkmapview','../mapper','util/console'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var SplunkMapView = require('../../splunkmapview');
    var Mapper = require('../mapper');
    var console = require('util/console');

    var mappingPrefix = 'display.visualizations.mapping.', vizPrefix = 'display.visualizations.';
    Mapper.register('visualizations:mapping', Mapper.extend({
        tagName: 'map',
        map: function(report, result, options) {
            _(report.toJSON()).each(function(value, key){
                if(key.substring(0, mappingPrefix.length) === mappingPrefix) {
                    result.options[key.substring(vizPrefix.length)] = report.get(key, options);
                }
            });
        }
    }));

    var MapViz = SplunkMapView.extend({
        panelClassName: 'map',
        options: _.defaults({
            drilldown: true,
            resizable: true
        }, SplunkMapView.prototype.options),
        reportDefaults: {
            "display.visualizations.show": true,
            "display.visualizations.type": "mapping",
            "display.general.type": "visualizations"
        },
        getResultsLinkOptions: function() {
            return {};
        }
    });
    DashboardElement.registerVisualization('visualizations:mapping', MapViz);

    var MapElement = DashboardElement.extend({
        initialVisualization: 'visualizations:mapping',
        createPanelElementEditor: function() {
            // currently no edit controls for a map viz
        }
    });
    
    return MapElement;
});
define('splunkjs/mvc/simplexml/element/list',['require','underscore','jquery','backbone','../../../mvc','./base','util/console'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var DashboardElement = require('./base');
    var console = require('util/console');

    var ListElement = DashboardElement.extend({
        initialVisualization: 'statistics',
        constructor: function(options) {
            _.extend(options, {
                displayRowNumbers: false,
                fields: [ options.labelField || '', options.valueField || '' ],
                sortKey: options.initialSort || options.labelField,
                sortDirection: options.initialSortDir || 'asc'
            });

            console.log('[%o] Creating table with options: %o', options.id, options);
            return DashboardElement.prototype.constructor.call(this, options);
        }
    });
    
    return ListElement;
});

define('splunkjs/mvc/simplexml/element/html',['require','underscore','jquery','backbone','../../../mvc','../../utils','./base','../controller','../../tokenutils','splunk.util'],function(require) {
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var mvc = require('../../../mvc');
    var utils = require('../../utils');
    var DashboardElement = require('./base');
    var Dashboard = require('../controller');
    var TokenUtils = require('../../tokenutils');
    var SplunkUtil = require('splunk.util');

    var HtmlElement = DashboardElement.extend({
        configure: function() {
            this.options.settingsOptions = _.extend({
                tokenEscaper: TokenUtils.getEscaper('html')
            }, this.options.settingsOptions || {});
            
            DashboardElement.prototype.configure.apply(this, arguments);
        },
        initialize: function() {
            this.configure();
            this.model = new Backbone.Model();
            this.reportReady = $.Deferred();
            this.reportReady.resolve(this.model);
            this.model.mapToXML = _.bind(this.mapToXML, this);
            this.settings.on("change", this.render, this);
            this.listenTo(Dashboard.getStateModel(), 'change:edit', this.onEditModeChange, this);
        },
        mapToXML: function(report, result, options) {
            return {
                type: 'html',
                content: this.settings.get('html', options),
                cdata: true,
                attributes: {
                    encoded: "1"
                }
            };
        },
        updateTitle: function() {
            this.$('.panel-head').remove();
            if(Dashboard.isEditMode()) {
                $('<div class="panel-head"><h3><span class="untitled">HTML Panel</span></h3></div>').prependTo(this.$el);
            }
        },
        createPanelElementEditor: function() {

        },
        createRefreshTimeIndicator: function() {

        },
        render: function() {
            this.$('script').remove();
            
            // If no 'html' setting was specified, initialize it with
            // the contents of this view's div upon first render.
            if(!this.settings.has('html')) {
                this.settings.set('html',
                    $.trim(this.$('.panel-body').html()),
                    {tokens: true});
            }
            
            this.$('.panel-body').html(this.settings.get('html'));

            // SPL-70655 root-endpoint/locale prefix for server-relative URLs
            this.$('a').each(function(){
                var el = $(this), href = el.attr('href');
                if(href && href[0] === '/' && href[1] !== '/') {
                    el.attr('href', SplunkUtil.make_url(href));
                }
            });

            this.onEditModeChange(Dashboard.getStateModel());
            return this;
        },
        getExportParams: function() {
            // Nothing to export
            return {};
        }
    });
    
    return HtmlElement;
});
define('splunkjs/mvc/simplexml/urltokenmodel',['require','exports','module','../basetokenmodel','models/classicurl','./controller','underscore','util/general_utils'],function(require, exports, module) {
    var BaseTokenModel = require('../basetokenmodel');
    var classicurl = require('models/classicurl');
    var DashboardController = require("./controller");
    var _ = require('underscore');
    var general_utils = require('util/general_utils');

    /**
     * Automatically mirrors the current URL query parameters.
     */
    var UrlTokenModel = BaseTokenModel.extend({
        moduleId: module.id,
        
        initialize: function() {
            classicurl.on('change', function(model, options) {
                this.set(model.toJSON());
            }, this);

            this.set(classicurl.toJSON());

            DashboardController.router.on('route', function() {
                this.trigger("url:navigate");
            }, this);
        },
        /** Saves this model's current attributes to the URL. */
        save: function(attributes, options) {
            var simpleAttributes = {};
            this.set(attributes);
            _.each(this.toJSON(), function(value, key) {
                // Don't try to persist complex values to the URL
                if (!_.isObject(value)) {
                    simpleAttributes[key] = value;
                }
            });

            classicurl.save(simpleAttributes, options);
        },
        saveOnlyWithPrefix: function(prefix, attributes, options){
            var filter =["^"+prefix+".*", "^earliest$", "^latest$"];
            this.save(general_utils.filterObjectByRegexes(attributes, filter,  { allowEmpty: true } ), options);
        }
    });
    
    return UrlTokenModel;
});
define('splunkjs/mvc/simpleform/input/submit',['require','underscore','jquery','../../basesplunkview','../../mvc'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            BaseSplunkView = require('../../basesplunkview'),
            mvc = require('../../mvc');

    var SubmitButton = BaseSplunkView.extend({
        className: 'splunk-submit-button',
        options: {
            text: _('Search').t(),
            useIcon: false,
            submitType: undefined
        },
        events: {
            'click button': 'onButtonClick'
        },
        initialize: function() {
            this.configure();
            this.settings.on('change', this.render, this);
        },
        onButtonClick: function() {            
            // Notify listeners
            this.trigger("submit", this);
        },
        render: function() {
            var button = this.$('button');
            if(!button.length) {
                button = $('<button class="btn btn-primary"></button>').appendTo(this.el);
            }
            if(this.settings.get('useIcon')) {
                button.html('<i class="icon-search"></i>');
            } else if(this.settings.has('text')) {
                button.text(this.settings.get('text'));
            } else {
                this.settings.set('text', button.text());
            }
            return this;
        }
    });
    
    return SubmitButton;
});
define('splunkjs/mvc/simpleform/input/text',['require','underscore','jquery','./base','../../textinputview'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInput = require('./base');
    var TextInputView = require('../../textinputview');

    var TextInput = BaseInput.extend({
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.textbox = new TextInputView(inputOptions);
            this.textbox.on('change', this.handleChange, this);
            
            // Always use the inner view's settings, so we don't have two of them
            this.options.settings = this.textbox.settings;
            BaseInput.prototype.initialize.call(this, {inputId: this.textbox.getInputId()});
            
            // Special events for text box
            this.delegateEvents({
                'change input': 'handleChange',
                'keyup input': 'checkEnterKey'
            });
        },
        getValue: function() {
            return this.textbox.val();
        },
        setValue: function(v) {
            this.textbox.val(v);
        },
        render: function() {
            this.renderLabel();
            this.textbox.render();
            return this;
        },
        _getWrappedView: function() {
            return this.textbox;
        },
        
        checkEnterKey: function(e) {
            if (e.keyCode === 13) {
                this.submit();
            }
        }
    });
    
    return TextInput;
});
define('splunkjs/mvc/simpleform/input/dropdown',['require','underscore','jquery','./base','../../dropdownview'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInput = require('./base');
    var SelectView = require('../../dropdownview');

    var DropdownInput = BaseInput.extend({
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.select = new SelectView(inputOptions);
            this.select.on('change', this.handleChange, this);
            
            // Always use the inner view's settings, so we don't have two of them
            this.options.settings = this.select.settings;
            BaseInput.prototype.initialize.call(this, {inputId: inputOptions.id});
        },
        getValue: function() {
            return this.select.val();
        },
        setValue: function(v) {
            this.select.val(v);
        },
        render: function() {
            this.renderLabel();
            this.select.render();
            return this;
        },
        _getWrappedView: function() {
            return this.select;
        }
    });
    
    return DropdownInput;
});

define('splunkjs/mvc/simpleform/input/radiogroup',['require','underscore','jquery','./base','../../radiogroupview'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            BaseInput = require('./base'),
            RadioGroupView = require('../../radiogroupview');

    var RadioGroupInput = BaseInput.extend({
        events: {
            'change input': 'handleChange'
        },
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.radiogroup = new RadioGroupView(inputOptions);
            
            // Always use the inner view's settings, so we don't have two of them
            this.options.settings = this.radiogroup.settings;
            BaseInput.prototype.initialize.call(this, {inputId: inputOptions.id});
        },
        getValue: function() {
            return this.radiogroup.val();
        },
        setValue: function(v) {
            this.radiogroup.settings.set('default', v);
            this.radiogroup.val(v);
        },
        render: function() {
            this.renderLabel();
            this.radiogroup.render();
            return this;
        },
        _getWrappedView: function() {
            return this.radiogroup;
        }
    });
    
    return RadioGroupInput;
});

define('splunkjs/mvc/simpleform/input',['require','./input/submit','./input/text','./input/dropdown','./input/radiogroup','./input/timerange','./input/submit','./input/text','./input/dropdown','./input/radiogroup','./input/timerange'],function(require) {
    return {
        SubmitButton: require('./input/submit'),
        TextInput: require('./input/text'),
        DropdownInput: require('./input/dropdown'),
        RadioGroupInput: require('./input/radiogroup'),
        TimeRangeInput: require('./input/timerange'),
        
        /* Deprecated */
        Submit: require('./input/submit'),
        Text: require('./input/text'),
        Dropdown: require('./input/dropdown'),
        Radio: require('./input/radiogroup'),
        TimeRangePicker: require('./input/timerange')
    };
});
define('splunkjs/mvc/simplexml',['require','./simplexml/controller','./simplexml/dashboard','./simplexml/element/table','./simplexml/element/chart','./simplexml/element/event','./simplexml/element/single','./simplexml/element/map','./simplexml/element/list','./simplexml/element/html','./simplexml/urltokenmodel','./searchmanager','./savedsearchmanager','./postprocessmanager','./drilldown','./headerview','./footerview','./simpleform/input','./simpleform/input/submit','./simpleform/input/text','./simpleform/input/dropdown','./simpleform/input/radiogroup','./simpleform/input/timerange','./utils'],function(require){

    var Controller = require("./simplexml/controller");
    
    require("./simplexml/dashboard");
    require("./simplexml/element/table");
    require("./simplexml/element/chart");
    require("./simplexml/element/event");
    require("./simplexml/element/single");
    require("./simplexml/element/map");
    require("./simplexml/element/list");
    require("./simplexml/element/html");
    require("./simplexml/urltokenmodel");
    require("./searchmanager");
    require("./savedsearchmanager");
    require("./postprocessmanager");
    require("./drilldown");
    require("./headerview");
    require("./footerview");
    require("./simpleform/input");
    require('./simpleform/input/submit');
    require('./simpleform/input/text');
    require('./simpleform/input/dropdown');
    require('./simpleform/input/radiogroup');
    require('./simpleform/input/timerange');
    require("./utils");

    return Controller;
});