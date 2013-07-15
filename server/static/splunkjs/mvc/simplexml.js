
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
        var i, child, maxd = 5;

        //IE <9 does not have TEXT_NODE
        var TEXT_NODE = n.TEXT_NODE || 3;

        while(maxd--) {
            for(i = 0; i < n.childNodes.length; i++) {
                child = n.childNodes[i];
                if(child !== undefined) {
                    if(child.nodeType === TEXT_NODE) {
                        if(/^\s*$/.test(child.nodeValue)) {
                            n.removeChild(child);
                        } else {
                            child.nodeValue = $.trim(child.nodeValue);
                        }
                    } else if(child.nodeType === n.ELEMENT_NODE || child.nodeType === n.DOCUMENT_NODE) {
                        stripEmptyTextNodes(child);
                    }
                }
            }
        }
    }

    var INDENT = '\t';

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
            validation: {
                label: {
                    required: true,
                    msg: _('No Title specified').t()
                }
            },
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
                var meta = this.meta = new DashboardMetadata(this);
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
            _extractMetadata: function() {
                var isXML = this.isXML(), $xml = isXML ? this.get$XML() : null;
                return {
                    label: (isXML && $xml.find(':eq(0) > label').text()) || this.entry.get('name'),
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
                            'eai:data': "You must declare a dashbaord node."
                        };
                    }
                }
            }
        });
        
        return Dashboard;
    }
);

define('splunkjs/mvc/simplexml/controller',['require','splunk.config','models/Dashboard','models/Application','util/router_utils','models/classicurl','backbone','jquery','underscore','../../mvc','util/xml_utils','../utils','util/pdf_utils','util/console','uri/route','../sharedmodels','splunk.jquery.csrf','models/services/AppLocal','models/services/authentication/User','util/splunkd_utils'],function(require) {
    var splunkConfig = require('splunk.config');
    var BaseDashboardModel = require('models/Dashboard');
    var AppModel = require('models/Application');
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
    require('splunk.jquery.csrf');
    var AppLocalModel = require('models/services/AppLocal');
    var UserModel = require('models/services/authentication/User');
    var splunkd_utils = require('util/splunkd_utils');

    var DashboardModel = BaseDashboardModel.extend({
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
                    var settings = element.model.mapToXML(_.extend({ tokens: false }, options));
                    var newNode = xmlUtils.$node('<' + settings.type + '/>').attr('id', id);

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
            newNode.attr('id', id);

            console.log('children', cur.childNodes);
            while(cur.childNodes.length) {
                newNode.append(cur.childNodes[0]);
            }

            if(options && options.clearOptions) {
                newNode.find('option').remove();
            }

            this._applyTitle(newNode, settings);
            this._applySearch(newNode, settings);
            this._applyFields(newNode, settings);
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
            var $xml = this.get$XML();
            var cur = $xml.find('#' + id);
            if(!cur.length) {
                var itemIndex = _(this._itemOrder).chain().flatten().indexOf(id).value();
                console.error('Node with ID=%o not found. Search for item with index=%o', id, itemIndex);
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
            var that = this;
            _.each(this._itemOrder, function(row, rowIndex) {
                _.each(row, function(panel, panelIndex) {
                    var ind = _(panel).indexOf(id);
                    if(ind > -1) {
                        delete that._itemOrder[rowIndex][panelIndex];
                    }
                });
            });
            var parentRow = cur.parents('row');
            cur.remove();
            if(parentRow.children().length === 0) {
                parentRow.remove();
            }
            this.set$XML($xml);
            return this.save();
        },
        addElement: function(id, settings) {
            var row = xmlUtils.$node('<row/>'), newNode = xmlUtils.$node('<' + settings.type + '/>').attr('id', id);
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
                var timeInput = _.find(fieldset.find('input[type="time"]'), function(el){
                    var token = $(el).find('token');
                    return token.length === 0 || !$.trim(token.text);
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
        _applyFields: function(newNode, settings) {
            var fieldsNode = newNode.find('fields');
            if(settings.fields) {
                if(!fieldsNode.length) {
                    fieldsNode = xmlUtils.$node('<fields/>').prependTo(newNode);
                }
                fieldsNode.text(settings.fields);
            }
        },
        _applySearch: function(newNode, settings) {
            if(settings.search) {
                // Clear current search info
                newNode.find('searchString,searchTemplate,searchName,pivotSearch,earliestTime,latestTime').remove();
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
        captureItemOrder: function(itemOrder) {
            this._itemOrder = itemOrder;
            this._itemOrderMap = _.object(_.flatten(itemOrder), this.get$XML().find('row').children());

            this.validateItemOrder();

            if(console.DEBUG_ENABLED) {
                console.log('Captured dashboard item order: %o', JSON.stringify(this._itemOrder));
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
                        $(item).attr('id', el).find('script').remove();
                        row.append(item);
                    });
                    if(!row.children().length) {
                        if(console.DEBUG_ENABLED) {
                            console.log('Created empty row for items %o and map %o', r, itemMap);
                        }
                    }
                    $xml.find('dashboard,form').append(row);
                });
                this.set$XML(xmlUtils.formatXMLDocument($xml));
                console.log('Saving new item order', itemOrder, $xml[0]);
                this.save();
                this._itemOrder = itemOrder;
            } else {
                console.log('no changes');
            }
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
            ':locale/app/:app/:page/edit?*qs': 'edit',
            ':locale/app/:app/:page/edit': 'edit',
            '*root/:locale/app/:app/:page?*qs': 'rootedView',
            '*root/:locale/app/:app/:page': 'rootedView',
            '*root/:locale/app/:app/:page/edit?*qs': 'rootedEdit',
            '*root/:locale/app/:app/:page/edit': 'rootedEdit',
            ':locale/manager/:app/:page?*qs': 'view',
            ':locale/manager/:app/:page': 'view',
            '*root/:locale/manager/:app/:page?*qs': 'rootedView',
            '*root/:locale/manager/:app/:page': 'rootedView',
            'dj/:app/:page/': 'appfx',
            'dj/:app/:page/?*qs': 'appfx',
            '*root/dj/:app/:page/': 'rootedAppfx',
            '*root/dj/:app/:page/?*qs': 'rootedAppfx'
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
        appfx: function(app, page) {
            this.app.set('appfx', true);
            this.page('en-US', app, page);
        },
        rootedAppfx: function(root) {
            this.app.set('root', root);
            this.appfx.apply(this, _.rest(arguments));
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
        getClassicUrlModel: _.once(function() {
            // TODO: Remove usage of mvc.Global. (SPL-67733)
            utils.syncModels(classicurl, mvc.Global).auto('push');
            
            return classicurl;
        }),
        getPersistentStore: function(type) {
            switch(type) {
                case 'uri':
                    return this.getClassicUrlModel();
                default:
                    throw 'Unsupported persistent store ' + type;
            }
        },
        onReady: function(callback) {
            $.when(this.readyDfd, this._onViewModelLoadDfd).then(callback);
        },
        ready: function() {
            this.readyDfd.resolve();
        }
    });

    var instance = new DashboardController();
    if(console.DEBUG_ENABLED) {
        window.Dashboard = instance;
    }
    instance.getClassicUrlModel();
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
            initialize: function() {
                BaseCollection.prototype.initialize.apply(this, arguments);
            },
            url: 'authorization/roles',
            model: Model
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
                        <th><%- _("Read").t() %></th>\
                        <th><%- _("Write").t() %></th>\
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
        *       model: { document: <models.Report>, nameModel: <model> Model for name } OR <models.Report>
        *       collection: <collections.services.authorization.Roles>,
        *       nameLabel: <string> Label for name,
        *       nameKey: <string> Key for name found in nameModel,  
        * }
        */
        initialize: function(options) {
            Modal.prototype.initialize.apply(this, arguments);

            //If this.model is not a dictionary with keys 'document' and 'nameModel', then make it one  
            if(!this.model.document){
                this.model = {                   
                    document: this.model,
                    nameModel: this.model.entry
                };
            }

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
                                this.model.document.url + '/' + this.model.document.entry.get('name'),
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
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.acl.render().el);

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);

            this.setView();

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

            this.children.flashMessage = new FlashMessage({ model: this.model });

            this.children.titleField = new ControlGroup({
                controlType: 'Text',
                controlOptions: {
                    modelAttribute: 'label',
                    model: this.model
                },
                label: _("Title").t()
            });

            this.children.descriptionField = new ControlGroup({
                controlType: 'Textarea',
                controlOptions: {
                    modelAttribute: 'description',
                    model: this.model
                },
                label: _("Description").t()
            });

        },
        events: $.extend({}, Modal.prototype.events, {
            'click .btn-primary': function(e) {
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

define('splunkjs/mvc/simplexml/mapper',['require','underscore','../mvc','../savedsearchmanager','backbone','util/console'],function(require){
    var _ = require('underscore'), mvc = require('../mvc'),
            SavedSearch = require('../savedsearchmanager'),
            Backbone = require('backbone'),
            console = require('util/console');

    var Mapper = function() {};
    _.extend(Mapper.prototype, {
        tagName: '#abstract',
        map: function() {
            // tbd in concrete implementation
        },
        getSearch: function(id, options) {
            var manager = mvc.Components.get(id),
                result;
            if(manager instanceof SavedSearch) {
                result = {
                    type: 'saved',
                    name: manager.get('searchname', options)
                };
            } else {
                var searchString = options.tokens !== false ? manager.query.get('search', options) : manager.query.resolve();
                result = {
                    type: 'inline',
                    search: searchString,
                    earliest_time: manager.search.get('earliest_time'),
                    latest_time: manager.search.get('latest_time')
                };
            }
            return result;
        },
        toXML: function(report, options) {
            options = options || { tokens: true };
            var result = {
                type: this.tagName,
                title: report.get('display.general.title', options),
                search: this.getSearch(report.get('display.general.manager', options), options),
                options: {}
            };
            this.map(report, result, options);
            if (result.options.fields){
                result.fields = result.options.fields;
                delete result.options['fields'];
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
            return mapper.toXML(this.entry.content, options);
        },
        deleteXML: function() {
            var deleted = Dashboard.model.view.deleteElement(this.entry.content.get('display.general.id'));
            if (deleted){
                this.trigger("removedPanel");
            }
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
            'display.visualizations.charting.gaugeColors': '["84E900", "FFE800", "BF3030"]'
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
    });

    DashboardReport.Entry.Content = TokenAwareModel.extend({ applyTokensByDefault: true });

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
        initialize: function() {
            this.bindToComponent(this.options.manager, this.onManagerChange, this);
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

define('splunkjs/mvc/resultslinkview',['require','exports','module','jquery','underscore','splunk.util','splunk.window','models/Job','uri/route','views/shared/jobstatus/buttons/ExportResultsDialog','./basesplunkview','./mvc','./utils','./sharedmodels'],function(require, exports, module) {

    var $ = require("jquery");
    var _ = require("underscore");
    var SplunkUtil = require("splunk.util");
    var SplunkWindow = require("splunk.window");
    var SearchJobModel = require("models/Job");
    var Route = require("uri/route");
    var ExportResultsDialog = require("views/shared/jobstatus/buttons/ExportResultsDialog");
    var BaseSplunkView = require("./basesplunkview");
    var mvc = require("./mvc");
    var Utils = require("./utils");
    var sharedModels = require('./sharedmodels');

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
    return BaseSplunkView.extend({
        moduleId: module.id, 
        initialize: function() {
            this.bindToComponent(this.options.manager, this.onManagerChange, this);

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
            this.manager.on("search:start", this.onSearchStart, this);

            if (this.manager.job) {
                this.onSearchStart(this.manager.job);
            }
        },

        onSearchStart: function(jobInfo) {
            this.searchJobModel.set("id", jobInfo.sid);
            this.searchJobModel.fetch();

            if (this.$pivotButton) {
                this.$pivotButton.off("click").on("click", this.openPivot.bind(this)).show(); 
            }
            if (this.$searchButton) {
                this.$searchButton.off("click").on("click", this.openSearch.bind(this)).show();
            }
            if (this.$exportButton) {
                this.$exportButton.off("click").on("click", this.exportResults.bind(this)).show();
            }
            if (this.$inspectButton) {
                this.$inspectButton.off("click").on("click", this.inspectSearch.bind(this)).show();
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
                earliest = options["link.openSearch.searchEarliestTime"] || manager.search.get("earliest_time");
                if (earliest != null) {
                    params.earliest = earliest;
                }
                latest = options["link.openSearch.searchLatestTime"] || manager.search.get("latest_time");
                if (latest != null) {
                    params.latest = latest;
                }
            } else if (!options["link.openSearch.viewTarget"]) {
                params = {
                    sid: this.searchJobModel.get("id"),
                    q: manager.query.get("search")
                };
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
                    application: this.applicationModel
                }
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
            </a><a href="#export" class="export-button btn-pill" title="<%- _(\'Export\').t() %>">\
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
                        value: '1'
                    },
                    {
                        label: _("No").t(),
                        value: '0'
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
            initialize: function() {
                Base.prototype.initialize.apply(this, arguments);
                //child views
                this.children.drillDown = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-3",
                        items: [
                            {value:"row", label:_("Row").t()},
                            {value:"cell", label:_("Cell").t()},
                            {value:"off", label:_("Off").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.statistics.drilldown'
                    }
                });
                
                this.children.rowNumbers = new ControlGroup({
                    label: _("Row Numbers").t(),
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-2",
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
                    controlOptions: {
                        className: "btn-group btn-group-2",
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
            },
            render: function() {
                this.$el.html("");
                this.$el.append(this.children.wrapResults.render().el);
                this.$el.append(this.children.rowNumbers.render().el);
                this.$el.append(this.children.drillDown.render().el);
                this.$el.append(this.children.dataOverlay.render().el);
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
                        controlOptions: {
                            className: "btn-group btn-group-2",
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
                    controlOptions: {
                        className: "btn-group btn-group-2",
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
                    controlOptions: {
                        className: "btn-group btn-group-2",
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
                    controlOptions: {
                        className: "btn-group btn-group-2",
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
                        toggleClassName: "btn"
                    }
                });
                this.children.drilldownRaw = new ControlGroup({
                    label: _("Drilldown").t(),
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-3",
                        items: [
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
                    controlType:'SyntheticRadio',
                    controlOptions: {
                        className: "btn-group btn-group-3",
                        items: [
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
                    controlOptions: {
                        className: "btn-group btn-group-2",
                        items: [
                            {value:'1', label:_("On").t()},
                            {value:'0', label:_("Off").t()}
                        ],
                        model: this.model,
                        modelAttribute: 'display.events.table.drilldown'
                    }
                });
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
        Statistics, 
        Events
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form-horizontal',
            vizToGeneralComponents: {
                line: ['nullValue', 'drilldown'],
                area: ['stack', 'nullValue', 'drilldown'],
                column: ['stack', 'drilldown'],
                bar: ['stack', 'drilldown'],
                pie: ['drilldown'],
                scatter: ['drilldown'], 
                radialGauge: ['style'],
                fillerGauge: ['style'],
                markerGauge: ['style'],
                single: ['drilldown', 'before', 'after', 'under'],
                events: ['eventGroup'],
                statistics: ['statisticsGroup'] 
            },
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToGeneralComponents[this.model.get('viz_type')];
                if(_.indexOf(controls, 'stack')>-1)
                    this.children.stackMode = new StackModeControlGroup({ model: this.model });
                if(_.indexOf(controls, 'nullValue')>-1)
                    this.children.nullValueMode = new NullValueModeControlGroup({ model: this.model });
                if(_.indexOf(controls, 'drilldown')>-1)
                    this.children.drilldown = new DrilldownRadioGroup({ model: this.model });
                if(_.indexOf(controls, 'style')>-1)
                    this.children.gaugeStyle = new GaugeStyleControlGroup({ model: this.model });
                if(_.indexOf(controls, 'before')>-1)
                    this.children.beforeLabel = new SingleValueBeforeLabelControlGroup({ model: this.model });
                if(_.indexOf(controls, 'after')>-1)
                    this.children.afterLabel = new SingleValueAfterLabelControlGroup({ model: this.model });
                if(_.indexOf(controls, 'under')>-1)
                    this.children.underLabel = new  SingleValueUnderLabelControlGroup({ model: this.model });
                if(_.indexOf(controls, 'eventGroup')>-1)
                    this.children.events = new Events({ model: this.model });
                if(_.indexOf(controls, 'statisticsGroup')>-1)
                    this.children.statistics = new Statistics({ model: this.model });
            },
            render: function() {
                this.children.stackMode && this.$el.append(this.children.stackMode.render().el);
                this.children.nullValueMode && this.$el.append(this.children.nullValueMode.render().el);
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
            'views/shared/controls/ControlGroup',
            'views/shared/controls/Control'
        ],
        function(
            _,
            module,
            ControlGroup,
            Control
        ) {

    return ControlGroup.extend({

        moduleId: module.id,

        /**
         * @constructor
         * @param options {Object} {
         *     model {Model} the model to operate on
         *     report <models.pivot.PivotReport> the current pivot report
         *     xAxis {Boolean} whether to operate on the x-axis as opposed to the y-axis, defaults to false
         * }
         */

        initialize: function() {
            this.axisTitleVisibilityAttr = this.options.xAxis ? 'display.visualizations.charting.axisTitleX.visibility' :
                                                                'display.visualizations.charting.axisTitleY.visibility';
            this.axisTitleTextAttr = this.options.xAxis ? 'display.visualizations.charting.axisTitleX.text' :
                                                          'display.visualizations.charting.axisTitleY.text';
            this.options.label = _('Title').t();
            this.options.controls = [
                {
                    type: 'SyntheticSelect',
                    options: {
                        className: Control.prototype.className + ' input-prepend',
                        model: this.model,
                        modelAttribute: this.axisTitleVisibilityAttr,
                        toggleClassName: 'btn',
                        menuWidth: 'narrow',
                        items: [
                            { value: 'visible', label: _('show').t() },
                            { value: 'collapsed', label: _('hide').t() }
                        ]
                    }
                },
                {
                    type: 'Text',
                    options: {
                        className: Control.prototype.className + ' input-prepend',
                        model: this.model,
                        modelAttribute: this.axisTitleTextAttr,
                        placeholder: _('optional').t(),
                        inputClassName: this.options.inputClassName
                    }
                }
            ];
            ControlGroup.prototype.initialize.call(this, this.options);
            // set up references to each control
            this.showHideControl = this.childList[0];
            this.labelControl = this.childList[1];

            this.model.on('change:' + this.axisTitleVisibilityAttr, this.handleTitleVisibility, this);
        },

        render: function() {
            ControlGroup.prototype.render.apply(this, arguments);
            this.handleTitleVisibility();
            return this;
        },

        handleTitleVisibility: function() {
            if(this.model.get(this.axisTitleVisibilityAttr) === 'collapsed') {
                this.labelControl.detach();
                this.showHideControl.$el.removeClass('input-prepend');
            }
            else {
                this.labelControl.insertAfter(this.showHideControl.$el);
                this.showHideControl.$el.addClass('input-prepend');
            }
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
            this.options.label = _("Legend Position").t();
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
            this.options.label = _("Legend Truncation").t();
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.legend.labelStyle.overflowMode',
                model: this.model,
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
            this.options.controlType = 'SyntheticRadio';
            this.options.controlOptions = {
                modelAttribute: 'display.visualizations.charting.gaugeAutoRanges',
                model: this.model,
                items: [
                    {
                        label: _("Automatic").t(),
                        value: '1'
                    },
                    {
                        label: _("Manual").t(),
                        value: '0'
                    }
                ]
            };
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
                        className: 'form-horizontal',
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
            className: 'form-horizontal',
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
                        className: 'y-axis-title form-horizontal',
                        model: this.model,
                        xAxis: false
                    });
                }
                if(_.indexOf(controls, 'scale')>-1)
                    this.children.scale = new AxisScaleControlGroup({ model: this.model, className: 'scale' });
                if(_.indexOf(controls, 'interval')>-1)
                    this.children.interval = new  AxisIntervalControlGroup({ model: this.model });
                if(_.indexOf(controls, 'min')>-1)
                    this.children.min = new AxisMinValueControlGroup({ model: this.model });
                if(_.indexOf(controls, 'max')>-1)
                    this.children.max = new AxisMaxValueControlGroup({ model: this.model });

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
            className: 'form-horizontal',
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
                    this.children.placement = new LegendPlacementControlGroup({ model: this.model });
                if(_.indexOf(controls, 'truncation')>-1)
                    this.children.truncation = new LegendTruncationControlGroup({ model: this.model });
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
                    var $target = $(e.currentTarget);
                    this.clone.set({ 'color': $target.data().color });
                    this.$('.swatch-hex input').val(this.clone.get('color'));
                    this.$('.big-swatch').css('background-color', '#'+this.clone.get('color'));
                    e.preventDefault();
                },
                'click .color-picker-apply': function(e) {
                    this.model.set({
                        'color': this.clone.get('color'),
                        'shadedcolor': this.options.shadeColor('#'+this.clone.get('color'), -40)
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
                    this.clone.set('color', $(e.currentTarget).val());
                    this.$('.big-swatch').css('background-color', '#'+this.clone.get('color'));
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
                        <li class="swatch" data-color="7e9f44" style="background-color: #7e9f44"></li>\
                        <li class="swatch" data-color="ebe42d" style="background-color: #ebe42d"></li>\
                        <li class="swatch" data-color="d13b3b" style="background-color: #d13b3b"></li>\
                        <li class="swatch" data-color="6cb8ca" style="background-color: #6cb8ca"></li>\
                        <li class="swatch" data-color="f7912c" style="background-color: #f7912c"></li>\
                        <li class="swatch" data-color="956e96" style="background-color: #956e96"></li>\
                        <li class="swatch" data-color="c2da8a" style="background-color: #c2da8a"></li>\
                        <li class="swatch" data-color="fac61d" style="background-color: #fac61d"></li>\
                        <li class="swatch" data-color="ebb7d0" style="background-color: #ebb7d0"></li>\
                        <li class="swatch" data-color="324969" style="background-color: #324969"></li>\
                        <li class="swatch" data-color="d85e3d" style="background-color: #d85e3d"></li>\
                        <li class="swatch" data-color="a04558" style="background-color: #a04558"></li>\
                    </ul>\
                </div>\
                <div class="big-swatch" data-color="<%- model.get("color") %>" style="background-color: #<%- model.get("color")%>;"></div>\
                <div class="swatch-hex">\
                    <div class="input-prepend views-shared-controls-textcontrol">\
                        <span class="add-on">#</span>\
                        <input type="text" class="hex-input" value="<%-model.get("color")%>">\
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
                '7e9f44', 'ebe42d', 'd13b3b',
                '6cb8ca', 'f7912c', '956e96',
                'c2da8a', 'fac61d', 'ebb7d0',
                '324969', 'd85e3d', 'a04558'
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
                var ranges = this.model.rangesValuesToArray(),
                    colors = this.model.gaugeColorsToArray();
                _(ranges).each(function(range, i) {
                    this.collection.rows.push({
                        value: range,
                        nextValue: ranges[i+1],
                        color: !(i==0) ? colors[i-1]: void(0),
                        shadedcolor: !(i==0) ? this.shadeColor('#'+colors[i-1], -40): void(0)
                    });
                },this);
            },
            syncModel: function() {
                this.model.set({
                    'display.visualizations.charting.chart.rangeValues': JSON.stringify(this.collection.rows.pluck('value')),
                    'display.visualizations.charting.gaugeColors': JSON.stringify(_(this.collection.rows.pluck('color')).filter(function(color){ return !_.isUndefined(color); }))
                });
            },
            events: {
                'click .add-color-range': function(e) {
                    var color = this.palette[Math.floor(Math.random()*12)];
                    this.collection.rows.push({
                        value: this.options.prepopulateNewRanges ? parseInt(this.collection.rows.last().get('value'), 10) * 2 : '',
                        nextValue: '',
                        color: color,
                        shadedcolor: this.shadeColor('#'+color, -40)
                    });
                    e.stopPropagation();
                },
                'keyup .range-value': function(e) {
                    var $target = $(e.currentTarget),
                        index = $target.data().index;
                    this.collection.rows.at(index).set('value', $target.val());
                    e.preventDefault();
                },
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
                var colorInt = parseInt(color.substring(1),16);
                var R = (colorInt & 0xFF0000) >> 16;
                var G = (colorInt & 0x00FF00) >> 8;
                var B = (colorInt & 0x0000FF) >> 0;
                R = R + Math.floor((shade/255)*R);
                G = G + Math.floor((shade/255)*G);
                B = B + Math.floor((shade/255)*B);
                var newColorInt = (R<<16) + (G<<8) + (B);
                var newColorStr = newColorInt.toString(16);
                return newColorStr;
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
                <div class="color-rows">\
                    <form class="form-horizontal from-color-group">\
                        <div class="control-group">\
                            <label class="lower-range-label control-label"><%- _("from").t() %></label>\
                            <div class="controls">\
                                <input class="first-row-lower range-value" value="<%- collection.at(0).get("value") %>" data-index=0 type="text">\
                            </div>\
                        </div>\
                    </form>\
                    <form class="form-horizontal">\
                        <div class="control-group">\
                            <label class="control-label upper-range-label to-label"><%- _("to").t() %></label>\
                            <div class="controls right-input">\
                                <div class="input-append">\
                                    <input  class="first-row-upper range-value" value="<%- collection.at(1).get("value") %>" data-index=1 type="text">\
                                    <div class="add-on color-picker-add-on">\
                                        <div class="color-square" style="border-color: #<%- collection.at(1).get("shadedcolor")%>; background-color: #<%- collection.at(1).get("color") %>;"></div>\
                                    </div>\
                                </div>\
                            </div>\
                        </div>\
                    </form>\
                    <% collection.each(function(model, i) { %>\
                        <% if(!(i==0 || i==1)) {%>\
                            <form class="form-horizontal">\
                                <div class="control-group">\
                                    <label class="upper-range-label control-label"><%- _("to").t() %></label>\
                                    <div class="controls input-append">\
                                        <input  class="range-value" value="<%- model.get("value") %>" data-index=<%-i%> type="text">\
                                        <div class="add-on color-picker-add-on">\
                                            <div class="color-square" style="border-color: #<%- model.get("shadedcolor")%>; background-color: #<%- model.get("color") %>;"></div>\
                                        </div>\
                                        <a class="remove-range btn-link"><i class="icon-x-circle"></i></a>\
                                    </div>\
                                </div>\
                            </form>\
                        <% } %>\
                    <% }); %>\
                </div>\
                <a class="add-color-range btn pull-right"> + <%- _("Add Range").t() %></a>\
            '
    });
});

define('views/shared/vizcontrols/components/color/Master',
    [
        'underscore',
        'jquery',
        'module',
        'splunk.util',
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
        Base,
        ControlGroup,
        GaugeAutoRangesControlGroup,
        Ranges
    ){
        return Base.extend({
            moduleId: module.id,
            className: 'form-horizontal',
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
                Base.prototype.initialize.apply(this, arguments);
                var controls = this.vizToColorRangeComponents[this.model.get('viz_type')];
                if(_.indexOf(controls, 'range')>-1)
                    this.children.toggle = new GaugeAutoRangesControlGroup({ model: this.model });

                this.children.colorRanges = new Ranges({
                    model: this.model
                });

                this.model.on('change:display.visualizations.charting.gaugeAutoRanges', function() {
                    this.children.colorRanges.$el.toggle();
                },this);
            },
            render: function() {
                this.children.toggle && this.$el.append(this.children.toggle.render().el);
                this.$el.append(this.children.colorRanges.render().el);
                if(util.normalizeBoolean(this.model.get('display.visualizations.charting.gaugeAutoRanges')))
                    this.children.colorRanges.$el.hide();
                return this;
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
        'views/shared/vizcontrols/components/General',
        'views/shared/vizcontrols/components/XAxis',
        'views/shared/vizcontrols/components/YAxis',
        'views/shared/vizcontrols/components/Legend',
        'views/shared/vizcontrols/components/color/Master'
    ],
    function(_, $, module, Base, General, XAxis, YAxis, Legend, Ranges){
        return Base.extend({
            moduleId: module.id,
            className: 'tabbable tabs-left',
            initialize: function(options) {
                Base.prototype.initialize.apply(this, arguments);
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
        'views/shared/FlashMessages',
        'views/shared/PopTart',
        'views/shared/vizcontrols/components/Master'
    ],
    function(_, $, module, FlashMessages, PopTart, Component){
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
                this.children.flashMessages = new FlashMessages({
                    model: this.model.visualization
                });
                this.children.visualizationControls && this.children.visualizationControls.remove();
                this.children.visualizationControls = new Component({
                    model: this.model.visualization
                });
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
            render: function() {
                this.$el.html(PopTart.prototype.template);
                this.$el.append(this.template);
                this.$('.popdown-dialog-body').prepend(this.children.flashMessages.render().el);
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
        'models/Base'
    ],
    function($, _, BaseModel) {
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
                'display.visualizations.charting.gaugeColors': '["84E900", "FFE800", "BF3030"]'
            },
            validation: {
                'display.visualizations.charting.axisX.minimumNumber': [
                    {
                        pattern: 'number',
                        msg: _('X-Axis Min Value must be a number.').t(),
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
                        msg: _('X-Axis Max Value must be a number.').t(),
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
                        msg: _('Y-Axis Min Value must be a number.').t(),
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
                        msg: _('Y-Axis Max Value must be a number.').t(),
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
                    msg: _('X-Axis Interval must be a positive number.').t(),
                    required: false
                },
                'display.visualizations.charting.axisLabelsY.majorUnit': {
                    pattern: 'number',
                    min: Number.MIN_VALUE,
                    msg: _('Y-Axis Interval must be a positive number.').t(),
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
                'display.visualizations.charting.chart.sliceCollapsingThreshold': {
                    pattern: 'number',
                    min: 0,
                    msg: _('Minimum Size must be a non-negative number.').t()
                },
                'display.visualizations.charting.chart.rangeValues': {
                    fn: 'validateRangeValues',
                    required: false
                }
            },

            validateXAxisExtremes: function(value, attr, computedState) {
                var min = parseFloat(computedState['display.visualizations.charting.axisX.minimumNumber']),
                    max = parseFloat(computedState['display.visualizations.charting.axisX.maximumNumber']);

                if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                    return _('The X-Axis Min Value must be less than the Max Value.').t();
                }
            },

            validateYAxisExtremes: function(value, attr, computedState) {
                var min = parseFloat(computedState['display.visualizations.charting.axisY.minimumNumber']),
                    max = parseFloat(computedState['display.visualizations.charting.axisY.maximumNumber']);

                if(!_.isNaN(min) && !_.isNaN(max) && max <= min) {
                    return _('The Y-Axis Min Value must be less than the Max Value.').t();
                }
            },

            validateYScaleAndStacking: function(value, attr, computedState) {
                var yAxisScale = computedState['display.visualizations.charting.axisY.scale'],
                    stackMode = computedState['display.visualizations.charting.chart.stackMode'];

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
        'models/Visualization'
    ],
    function(_, Backbone, module, BaseView, SyntheticSelectControl, Format, VisualizationModel) {
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
                    'display.visualizations.type': 'singleValue', 
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
                        { value: 'events', label: _("Events").t(), icon: 'list' }
                    ]
                },
                 "statistics": { 
                    label: 'g2',
                    items: [
                        {value: 'statistics', label: _("Table").t(), icon: 'table' }
                    ]
                },
                "visualizations": {
                    label: 'g3',
                    items: [
                        { value: 'line', label: _("Line").t(), icon: 'chart-line' },
                        { value: 'area', label: _("Area").t(), icon: 'chart-area' },
                        { value: 'column', label: _("Column").t(), icon: 'chart-column' },
                        { value: 'bar', label: _("Bar").t(), icon: 'chart-bar' },
                        { value: 'pie', label: _("Pie").t(), icon: 'chart-pie' },
                        { value: 'scatter', label: _("Scatter").t(), icon: 'chart-scatter' },
                        { value: 'single', label: _("Single Value").t(), icon: 'single-value' },
                        { value: 'radialGauge', label: _("Radial").t(), icon: 'gauge-radial' },
                        { value: 'fillerGauge', label: _("Filler").t(), icon: 'gauge-filler' },
                        { value: 'markerGauge', label: _("Marker").t(), icon: 'gauge-marker' }
                    ]
                }
            },
            reportTree: {
                'match': { 
                    'display.general.type': {
                        'visualizations' : {
                            'match': {
                                'display.visualizations.type': {
                                    'singleValue': { 
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
            initialize: function() {
                BaseView.prototype.initialize.apply(this, arguments);

                this.model.visualization = new VisualizationModel();
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
                    this.model.report.entry.content.set(this.vizToAttrs[this.model.visualization.get('viz_type')]);
                    this.model.visualization.set(this.vizToAttrs[this.model.visualization.get('viz_type')]);
                    if(this.options.saveOnApply) {
                        this.model.report.save();
                    }
                },this);
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
                    this.children.format = new Format({
                        model: {
                            report: this.model.report,
                            visualization: this.model.visualization
                        },
                        onHiddenRemove: true,
                        saveOnApply: this.options.saveOnApply
                    });
                    $('body').append(this.children.format.render().el);
                    this.children.format.show($target);
                    e.preventDefault();
                }    
            },
            render: function() {
                this.$el.empty();
                this.children.visualizationType && this.$el.append(this.children.visualizationType.render().el);
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
        'bootstrap.modal'
    ],
    function(
        $,
        _,
        Backbone,
        ValidatingView,
        module
        // bootstrap modal
        )
    {
        var ENTER_KEY = 13,
            TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="password"], textarea';

        return ValidatingView.extend({
            moduleId: module.id,
            className: "modal",
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
            bodyClassName: "",
            // Subclasses must call super.initialize()
            initialize: function(options) {
                ValidatingView.prototype.initialize.call(this, options);

                options = options || {};
                // Initialize the modal
                // TODO [JCS] Look at other dialogs and add ability to not close on outside click
                this.$el.modal({show:false, keyboard:true});


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
        'module'
    ],
    function(
        $,
        _,
        DialogBase,
        module
    )
    {

        return DialogBase.extend({
            moduleId: module.id,
            className: "modal",
            _text: "",
            initialize: function(options) {
                DialogBase.prototype.initialize.call(this, options);
                // Set default values for the button labels
                this.settings.set("primaryButtonLabel",_("Ok").t());
                this.settings.set("cancelButtonLabel",_("Cancel").t());
            },
            primaryButtonClicked: function() {
                DialogBase.prototype.primaryButtonClicked.call(this);
                this.hide();
            },
            setText : function(value) {
                this._text = value;
                this.debouncedRender();
            },
            /**
             * Render the dialog body. Subclasses should override this function
             *
             * @param $el The jQuery DOM object of the body
             */
            renderBody : function($el) {
                $el.html(this.bodyTemplate);
                $el.find(".text-dialog-placeholder").html(this._text);
            },
            bodyTemplate: '\
                <span class="text-dialog-placeholder"></span>\
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

                var hourly = _.map(_.range(0, 46, 15), function(num) { return { label: num, value: num.toString()}; }),
                    daily = _.map(_.range(24), function(num) { return { label: num + ':00', value: num.toString()}; }),
                    montly = _.map(_.range(1,32), function(num) { return { label: num, value: num.toString()}; });

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
                this.children.scheduleOptions.$el.find('.schedule_weekly .btn').width('80px');

                this.children.scheduleOptions.$el.find('.schedule_monthly').before('<span class="monthly_pre_label">' + _("On day ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_monthly .btn').width('55px');

                this.children.scheduleOptions.$el.find('.schedule_daily').before('<span class="daily_pre_label">' + _(" at ").t() + '</span>');
                this.children.scheduleOptions.$el.find('.schedule_daily .btn').width('60px');

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
                    lineOneLabel: _('Schedule').t()
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
                this.$('div.timerange').append('<a href="#" class="btn timerange-control"><span class="time-label"></span><span class="icon-triangle-right-small"></span></a>');
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
            'views/shared/reportcontrols/dialogs/schedule_dialog/step1/Schedule',
            'views/shared/timerangepicker/dialog/Master',
            'views/shared/FlashMessages'
        ],
        function(
            _,
            module,
            Base,
            Modal,
            ScheduleView,
            TimeRangePickerDialog,
            FlashMessage
        ) {
        return Base.extend({

            SLIDE_ANIMATION_DISTANCE: 450,
            SLIDE_ANIMATION_DURATION: 500,

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
                    this.closeTimeRangePicker();
                }, this);

                this.model.inmem.on('togglePrimaryButton', this.togglePrimaryButton, this);
            },
            events: {
                'click .modal-btn-primary' : function(e) {
                    if(this.model.inmem.get('scheduled_and_enabled')) {
                        this.model.inmem.trigger('next');
                    } else {
                        this.model.inmem.save({}, {
                            success: function(model, response){
                                this.model.inmem.trigger('saveSuccessNotScheduled');
                            }.bind(this)
                        });
                    }
                    e.preventDefault();
                },
                'click a.btn.back' : function(e) {
                    this.closeTimeRangePicker();
                    e.preventDefault();
                },
                'click a.timerange-control': function(e) {
                    this.showTimeRangePicker();
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
            showTimeRangePicker: function () {

                var $from = this.$scheduleWrapper,
                    $to = this.$timeRangePickerWrapper;

                this.onBeforePaneAnimation($from, $to);

                this.$visArea.animate({
                    height: this.$timeRangePickerWrapper.height()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION,
                    complete: function() {
                        this.onAfterPaneAnimation($from, $to);
                    }.bind(this)
                }, this);

               this.$slideArea.animate({
                    marginLeft: -this.SLIDE_ANIMATION_DISTANCE
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

               this.$el.animate({
                    width: this.$timeRangePickerWrapper.width()
               }, {
                    duration: this.SLIDE_ANIMATION_DURATION
               });

                this.$modalParent.animate({
                    width: this.$timeRangePickerWrapper.width(),
                    marginLeft: -(2*this.SLIDE_ANIMATION_DISTANCE/3)
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select Time Range").t());
                this.$('.btn.back').show();
                this.$('.btn-primary').hide();
                this.$('.btn.cancel').hide();
            },
            closeTimeRangePicker: function () {
                var $from = this.$timeRangePickerWrapper,
                    $to = this.$scheduleWrapper;

                this.onBeforePaneAnimation($from, $to);

                this.$visArea.animate({
                    height: this.$scheduleWrapper.height()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION,
                    complete: function() {
                        this.onAfterPaneAnimation($from, $to);
                    }.bind(this)
                }, this);

               this.$slideArea.animate({
                    marginLeft: 0
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

               this.$el.animate({
                    width: this.$scheduleWrapper.width()
               }, {
                    duration: this.SLIDE_ANIMATION_DURATION
               });

               this.$modalParent.animate({
                    width: this.$scheduleWrapper.width(),
                    marginLeft: -(this.SLIDE_ANIMATION_DISTANCE/2)
               }, {
                    duration: this.SLIDE_ANIMATION_DURATION
               });

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());
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
                    this.children.timeRangePickerView.$el.show();
                }
                $to.css({ height: '', visibility: '' });
            },
            // undo the height manipulations that were applied to make a smooth animation
            // after the animation, the 'from' is hidden via display=none and the slide area has visible overflow
            // (this prevents vertical clipping of popup menus)
            onAfterPaneAnimation: function($from, $to) {
                if($from === this.$timeRangePickerWrapper) {
                    this.children.timeRangePickerView.$el.hide();
                }
                this.$visArea.css('overflow', '');
                this.$visArea.css({ height: ''});
                $from.css({ height: '2px', visibility : 'hidden'});
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());

                this.$(Modal.BODY_SELECTOR).remove();

                this.$(Modal.FOOTER_SELECTOR).before(
                    '<div class="vis-area">' +
                        '<div class="slide-area">' +
                            '<div class="schedule-wrapper">' +
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
                this.children.timeRangePickerView.$el.hide();

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
                        'learnmore.alert.email',
                        this.model.application.get("app"),
                        this.model.appLocal.entry.content.get('version'),
                        this.model.appLocal.appAllowsDisable()
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
                    help: splunkUtil.sprintf(_('To send emails you must configure the settings in System Settings > Alert Email Settings. %s').t(), ' <a href="' + configEmailHelpLink + '" target="_blank">' + _("Learn More").t() + '</a>')
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
                    help: _('Semi-colon separated list. Email alert settings must be configured in Manger.').t()
                });

                this.children.emailResultsFormat = new ControlGroup({
                    controlType: 'SyntheticRadio',
                    controlOptions: {
                        modelAttribute: 'ui_include_results',
                        model: this.model.inmem,
                        items: [
                            { label: _('None').t(), value: 'none' },
                            { label: _('Text').t(), value: 'html' },
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

                this.$(Modal.BODY_FORM_SELECTOR).prepend('<p class="control-heading">' + _('Enable Actions').t() + '</p>');
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
            }
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
                    this.model.report.entry.content.set('is_scheduled', false);
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
                    resultsFormat = this.model.inmem.entry.content.get('action.email.format');
                }
                this.model.inmem.set('ui_include_results', resultsFormat);
            },
            trasposeFromUI: function() {
                var resultsFormat = this.model.inmem.get('ui_include_results');
                if (resultsFormat === 'none') {
                    this.model.inmem.entry.content.set('action.email.sendresults', false);
                } else {
                    this.model.inmem.entry.content.set({
                        'action.email.sendresults': true,
                        'action.email.format': resultsFormat,
                        'action.email.sendpdf': (resultsFormat === 'pdf'),
                        'action.email.inline': (resultsFormat === 'html')
                    });
                }

                if (this.model.inmem.get('scheduled_and_enabled')) {
                    this.model.inmem.entry.content.set({
                        'is_scheduled': true,
                        'disabled': false
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
                inmem: this.model.report.clone()
            };

            if(!this.model.searchJob) {
                this.model.intentionsParser = new IntentionsParserModel();
                this.intentionsParserDeferred = this.model.intentionsParser.fetch({
                    data:{
                        q:this.model.report.entry.content.get('search'),
                        timeline: false
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
                label: _('Summary Range').t()
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
                if ((this.model.searchJob && this.model.searchJob.canSummarize()) || (this.model.intentionsParser && this.model.intentionsParser.get('canSummarize'))) {
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
                    this.$(Modal.BODY_FORM_SELECTOR).append('<div>' + _('This report can not be accelerated').t() + '</div>');
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
                            report: this.model.report
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
                        model: this.model,
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
                        searchJob: this.model.searchJob
                    }
                });
                this.children.permissionsView = new PermissionsView({model: this.model.report});
                this.children.editPermissionsView = new EditPermissionsView({model: this.model.report, collection: this.collection});

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
        'views/shared/Modal'
    ],
    function(_, $, backbone, module, ControlGroup, Modal){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);
                var titleProperty = 'display.general.title';
                this.model.workingReport = new backbone.Model(/*this.model.report.entry.content.toJSON()*/);
                this.model.workingReport.set(titleProperty, this.model.report.entry.content.get(titleProperty, { tokens: true }));
                this.children.panelTitleControlGroup = new ControlGroup({
                    label: _("Title").t(),
                    controlType:'Text',
                    controlClass: 'controls-block',
                    controlOptions: {
                        model: this.model.workingReport,
                        modelAttribute: titleProperty
                    }
                });
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                e.preventDefault();
                this.model.report.entry.content.set(this.model.workingReport.toJSON(), { tokens: true });
                this.model.report.save();
                this.hide();
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Title").t());

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.panelTitleControlGroup.render().el);

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
            }
        });
    }
);

define('views/dashboards/panelcontrols/querydialog/Modal',['underscore',
    'jquery',
    'backbone',
    'module',
    'views/shared/controls/ControlGroup',
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
    'splunkjs/mvc/tokenawaremodel',
    'splunkjs/mvc/tokenutils'],
    function(_,
             $,
             Backbone,
             module,
             ControlGroup,
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
             TokenAwareModel,
             token_utils){

        return Modal.extend({
            SLIDE_ANIMATION_DISTANCE: 450,
            SLIDE_ANIMATION_DURATION: 500,
            moduleId: module.id,
            className: 'modal edit-search-string',
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new Backbone.Model(
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
                this.model.timeRange = new TimeRangeModel({
                    'earliest': this.model.workingReport.get('dispatch.earliest_time'),
                    'latest':this.model.workingReport.get('dispatch.latest_time')
                });
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
                    this.closeTimeRangePicker();
                    this.model.workingReport.set({
                        'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                        'dispatch.latest_time':this.model.timeRange.get('latest')
                    });
                    this.setLabel();
                }, this);

            },
            events: {
                'click .modal-btn-primary': function(e){
                    e.preventDefault();
                    var attributes = this.model.workingReport.toJSON();
                    console.log('Applying attributes to report model: %o', attributes);
                    this.model.report.entry.content.set(attributes);
                    this.model.report.trigger('updateSearchString');
                    this.hide();
                },
                'click a.run-search': function(e) {
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
                },
                'click a.btn.back' : function(e) {
                    e.preventDefault();
                    this.closeTimeRangePicker();
                },
                'click a.timerange-control': function(e) {
                    e.preventDefault();
                    this.showTimeRangePicker();
                }
            },
            handleSubmitButtonState: function(model) {
                this.$(Modal.FOOTER_SELECTOR)
                    .find('.btn-primary')[model.get('elementCreateType') === 'pivot' ? 'addClass' : 'removeClass']('disabled');
            },
            setLabel: function() {
                var timeLabel = this.model.timeRange.generateLabel(this.collection);
                this.$el.find("span.time-label").text(timeLabel);
            },
            showTimeRangePicker: function () {

                var $from = this.$addpanelContent,
                    $to = this.$timeRangePickerWrapper;

                this.onBeforePaneAnimation($from, $to);

                this.$visArea.animate({
                    height: this.$timeRangePickerWrapper.height()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION,
                    complete: function() {
                        this.onAfterPaneAnimation($from, $to);
                    }.bind(this)
                }, this);

                this.$slideArea.animate({
                    marginLeft: -this.SLIDE_ANIMATION_DISTANCE
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$el.animate({
                    width: this.$timeRangePickerWrapper.width()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select Time Range").t());
                this.$('.btn.back').show();
                this.$('.btn-primary').hide();
                this.$('.btn.cancel').hide();
            },
            closeTimeRangePicker: function () {
                var $from = this.$timeRangePickerWrapper,
                    $to = this.$addpanelContent;

                this.onBeforePaneAnimation($from, $to);

                this.$visArea.animate({
                    height: this.$addpanelContent.height()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION,
                    complete: function() {
                        this.onAfterPaneAnimation($from, $to);
                    }.bind(this)
                }, this);

                this.$slideArea.animate({
                    marginLeft: 0
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$el.animate({
                    width: this.$addpanelContent.width()
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$modalParent.animate({
                    width: this.$addpanelContent.width(),
                    marginLeft: -(this.SLIDE_ANIMATION_DISTANCE/2)
                }, {
                    duration: this.SLIDE_ANIMATION_DURATION
                });

                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());
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
                    this.children.timeRangePickerView.$el.show();
                }
                $to.css({ height: '', visibility: '' });
            },
            // undo the height manipulations that were applied to make a smooth animation
            // after the animation, the 'from' is hidden via display=none and the slide area has visible overflow
            // (this prevents vertical clipping of popup menus)
            onAfterPaneAnimation: function($from, $to) {
                if($from === this.$timeRangePickerWrapper) {
                    this.children.timeRangePickerView.$el.hide();
                }
                this.$visArea.css('overflow', '');
                this.$visArea.css({ height: ''});
                $from.css({ height: '2px', visibility : 'hidden'});
            },
            setLabel: function() {
                var timeLabel = _("All Time").t();
                if (token_utils.hasToken(this.model.timeRange.get("earliest"))){
                    timeLabel = _("Inherit").t();
                }
                else {
                    timeLabel = this.model.timeRange.generateLabel(this.collection);
                }
                this.$el.find("span.time-label").text(timeLabel);
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Search").t());

                this.$(Modal.BODY_SELECTOR).remove();

                this.$(Modal.FOOTER_SELECTOR).before(
                    '<div class="vis-area">' +
                        '<div class="slide-area">' +
                            '<div class="schedule-wrapper">' +
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
                this.$addpanelContent = this.$('.schedule-wrapper').eq(0);
                this.$timeRangePickerWrapper = this.$('.timerange-picker-wrapper').eq(0);
                this.$modalParent = this.$el;
                this.children.timeRangePickerView.$el.hide();

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);
                this.children.title.render().appendTo(this.$(Modal.BODY_FORM_SELECTOR));
                this.children.searchStringInput.render().appendTo(this.$(Modal.BODY_FORM_SELECTOR));
                this.$(Modal.BODY_FORM_SELECTOR).append($('<div class="timerange" style="display: block;"><label class="control-label">' + _('Time Range').t() + '</label></div>'));
                this.$('div.timerange').append('<div class="controls"><a href="#" class="btn timerange-control"><span class="time-label"></span><span class="icon-triangle-right-small"></span></a></div>');
                this.setLabel();

                this.$timeRangePickerWrapper.append(this.children.timeRangePickerView.render().el);

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
                this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back modal-btn-back pull-left">' + _('Back').t() + '</a>');
                this.$('.btn.back').hide();

                return this;
            }
        });
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

define('views/dashboards/panelcontrols/ReportDialog',
    [
        'jquery',
        'underscore',
        'backbone',
        'module',
        'views/shared/controls/ControlGroup',
        'views/shared/Modal',
        'splunkjs/mvc/utils',
        'splunk.config',
        'collections/Reports'
    ],
    function($, _, backbone, module, ControlGroup, Modal, utils, splunkConfig, Reports){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new backbone.Model();
                this.model.workingReport.set({"title": ""});

                this.collection = new Reports();
                var pageInfo = utils.getPageInfo();
                this.dfd = this.collection.fetch({
                    data: {
                        owner: splunkConfig.USERNAME,
                        app: pageInfo.app
                    }
                });
                this.dfd.done(_.bind(function(){
                    this.ready = true;
                    var reportNames = this.collection.map(function(model) {
                        return {label:model.entry.get('name'), value:model.get('id')};
                    });
                    this.children.reportsControlGroup = new ControlGroup({
                        label: _("Select Report").t(),
                        controlType:'SyntheticSelect',
                        controlClass: 'controls-block',
                        controlOptions: {
                            model: this.model.workingReport,
                            modelAttribute: 'id',
                            items:reportNames,
                            toggleClassName: 'btn'
                        }
                    });

                    this.children.panelTitleControlGroup = new ControlGroup({
                        label: _("Panel Title").t(),
                        controlType:'Text',
                        controlClass: 'controls-block',
                        controlOptions: {
                            model: this.model.workingReport,
                            modelAttribute: 'title'
                        }
                    });
                }, this));
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                e.preventDefault();
                this.hide();
                this.model.report.trigger("updateReportID", this.model.workingReport.get('id'), this.model.workingReport.get('title'));
            },
            render: function() {
                this.dfd.done(_.bind(function(){
                    this.$el.html(Modal.TEMPLATE);

                    this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select a New Report").t());

                    this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportsControlGroup.render().el);
                    this.$(Modal.BODY_FORM_SELECTOR).append(this.children.panelTitleControlGroup.render().el);

                    this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                    this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
                }, this));
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
    function($, _, backbone, module, ControlGroup, Modal, FlashMessagesView){
        return Modal.extend({
            moduleId: module.id,
            initialize: function() {
                Modal.prototype.initialize.apply(this, arguments);

                this.model.workingReport = new backbone.Model({'name': this.model.report.entry.content.get('display.general.title') });

                this.children.flashMessages = new FlashMessagesView({model: this.model.report});

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
                        modelAttribute: 'description'
                    }
                });

                this.listenTo(this.model.report, 'successfulReportSave', this.closeDialog, this); 
            },
            events: $.extend({}, Modal.prototype.events, {
                'click .modal-btn-primary': 'onSave'
            }),
            onSave: function(e){
                e.preventDefault();
                this.model.report.trigger("saveAsReport", this.model.workingReport.get("name"), this.model.workingReport.get("description"));
            },
            closeDialog: function(){
                //if save succeeds
                this.hide(); 
            },
            render: function() {
                this.$el.html(Modal.TEMPLATE);
                this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Save panel as report.").t());
                this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);

                this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportNameControlGroup.render().el);
                this.$(Modal.BODY_FORM_SELECTOR).append(this.children.reportDescriptionControlGroup.render().el);

                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
                this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_SAVE);
            }
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
    'views/shared/dialogs/TextDialog',
    'views/shared/delegates/Popdown',
    'views/shared/reportcontrols/details/Master',
    'collections/services/authorization/Roles',
    'models/Application',
    'splunkjs/mvc/utils',
    'splunk.config',
    'views/dashboards/panelcontrols/titledialog/Modal',
    'views/dashboards/panelcontrols/querydialog/Modal',
    'views/dashboards/panelcontrols/ReportDialog',
    'views/dashboards/panelcontrols/CreateReportDialog',
    'uri/route',
    'util/console', 
    'splunk.util'
],
function(_,
         BaseView,
         BaseModel,
         $,
         module,
         SyntheticSelectControl,
         TextDialog,
         Popdown,
         ReportDetailsView,
         RolesCollection,
         ApplicationModel,
         utils,
         splunkConfig,
         TitleDialogModal,
         QueryDialogModal,
         ReportDialog,
         CreateReportDialog,
         route,
         console, 
         splunkUtils
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
                    report: this.model.working
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
                    user: this.model.user
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
            this.children.dialog = new TextDialog({id: "modal_delete"});
            this.children.dialog.settings.set("primaryButtonLabel",_("Delete").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this.dialogDeleteHandler, this);
            this.children.dialog.settings.set("titleLabel",_("Delete").t());
            this.children.dialog.setText(splunkUtils.sprintf(
                _("Are you sure you want to delete %s?").t(), this.model.report.entry.content.get('display.general.title')));
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
        },
        dialogDeleteHandler: function() {
            this.children.dialog.hide();
            this.children.dialog.remove();
            this.model.report.deleteXML();
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

            this.$('.reportDetails').prepend($("<li/>").append(this.children.reportDetails.render().el));
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
                <li><a href="#" class="useReportFormatting"><%- _("Use Report Formatting On Visualization").t() %></a></li>\
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
                <li><a class="useReportFormatting"><%- _("Use Report Formatting On Visualization").t() %></a></li>\
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
            this.children.dialog = new TextDialog({id: "modal_inline"});
            this.children.dialog.settings.set("primaryButtonLabel",_("Clone to Inline Search").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._convertToInlineSearch, this);
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
            this.children.dialog = new TextDialog({id: "modal_inline"});
            this.children.dialog.settings.set("primaryButtonLabel",_("Clone to Inline Pivot").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._convertToInlineSearch, this);
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
        _convertToInlineSearch: function(){
            this.children.dialog.hide();
            this.children.dialog.remove();
            this.model.report.trigger("makeInline");
        },
        useReportFormatting: function(e){
            e.preventDefault();
            this.children.dialog = new TextDialog({id: "modal_use_report_formatting"});

            this.children.dialog.settings.set("primaryButtonLabel",_("Use Report Formatting on Visualization").t());
            this.children.dialog.settings.set("cancelButtonLabel",_("Cancel").t());
            this.children.dialog.on('click:primaryButton', this._useReportFormatting, this);
            this.children.dialog.settings.set("titleLabel",_("Use Report Formatting").t());
            this.children.dialog.setText(_("Use only the report formatting?").t());
            $("body").append(this.children.dialog.render().el);
            this.children.dialog.show();
            this.children.popdown.hide();
        },
        _useReportFormatting: function(){
            this.children.dialog.hide();
            this.children.dialog.remove();
            this.model.report.trigger("useReportFormatting");
        },
        selectNewReport: function(e) {
            e.preventDefault();
            this.children.newReportDialog = new ReportDialog({
                model:  {
                    report: this.model.report
                },
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
                    report: this.model.report
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
            'click a.useReportFormatting': "useReportFormatting"
        }

    });
    return PanelControls;
});
define('splunkjs/mvc/simplexml/paneleditor',['require','exports','module','../mvc','../basesplunkview','models/Report','views/shared/vizcontrols/Master','views/dashboards/panelcontrols/Master','../savedsearchmanager','../searchmanager','splunkjs/mvc/utils','underscore','splunk.config','models/Base','util/console','./controller','../tokenawaremodel'],function(require, exports, module) {
    var mvc = require('../mvc');
    var BaseSplunkView = require('../basesplunkview');
    var Report = require('models/Report');
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

    /**
     * Working model for a DashboardReport model
     * Delegates to saveXML() when save() is called
     */
    var WorkingModel = BaseModel.extend({
        initialize: function(attrs, options) {
            this._report = options.report;
            this.entry = new BaseModel();
            this.entry.content = new TokenAwareModel({}, {
                applyTokensByDefault: true,
                retrieveTokensByDefault: true
            });
            this.entry.set(this._report.entry.toJSON({ tokens: true }));
            // Make sure the working model stays up-to-date while in edit mode
            this.contentSyncer = utils.syncModels({
                source: this._report.entry.content,
                dest: this.entry.content,
                auto: 'push'
            });
            BaseModel.prototype.initialize.call(this, attrs);
        },
        save: function(attrs, options) {
            if(attrs) {
                this.set(attrs, options);
            }
            this._report.entry.set(this.entry.toJSON());
            this._report.entry.content.set(this.entry.content.toJSON({ tokens: true }));
            this._report.saveXML();
        },
        syncOff: function() {
            this.contentSyncer.destroy();
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
            this.model.report = this.model.report || new Report();
            this.model.working = new WorkingModel({}, { report: this.model.report });
            this.manager = this.options.manager;
            this._instantiateChildren();
            this.bindToComponent(this.manager, this.onManagerChange, this);

            this.listenTo(this.model.report, 'makeInline', this._makePanelInline, this);
            this.listenTo(this.model.report, 'useReportFormatting', this._useReportFormatting, this);
            this.listenTo(this.model.report, 'updateReportID', this._updateReportID, this);
            this.listenTo(this.model.report, 'updateSearchString', this._updateSearchManager, this);
            this.listenTo(this.model.report, 'saveAsReport', this._saveAsReport, this);

            this.model.application = controller.model.app;
            this.model.user = controller.model.user;
            this.model.appLocal = controller.model.appLocal;
        },
        _instantiateChildren: function() {
            //create the child views
            this.children.vizControl = new FormatControls({
                model: { report: this.model.working },
                vizTypes: ['events', 'statistics', 'visualizations'],
                saveOnApply: true
            });

            this.children.panelControl = new PanelControls({
                model: {
                    report: this.model.report,
                    working: this.model.working,
                    application: this.model.application,
                    appLocal: this.model.appLocal,
                    user: this.model.user
                }
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
        _updateSearchManager: function() {
            var manager = mvc.Components.get(this.manager);
            if(manager.query) {
                manager.query.set('search', this.model.report.entry.content.get('search', { tokens: true }), { tokens: true });
            }
            if(manager.search) {
                manager.search.set({
                    'earliest_time': this.model.report.entry.content.get('dispatch.earliest_time', { tokens: true }),
                    'latest_time': this.model.report.entry.content.get('dispatch.latest_time', { tokens: true })
                });
            }

            this.model.report.saveXML();
        },

        onManagerChange: function(ctxs, manager) {
            if(this._seenManager) {
                this.model.report.saveXML();
            } else {
                this._seenManager = true;
            }
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
            //remove the old saved search manager
            mvc.Components.revokeInstance(this.manager, {silent: true});
            //set the search manager
            delete this.model.report.id;
            this.model.report.unset('id', {silent: true});
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
            });
        },
        _useReportFormatting: function() {
            //this.model.report.clear({silent: true});
            var dfd = this.model.report.fetch();
            dfd.done(_.bind(function() {
                this.model.report.saveXML({ clearOptions: true });
            }, this));
        },
        _updateReportID: function(id, title) {
            this.model.report.unset('id', {silent: true});
            this.model.report.id = id;
            this.model.report.set('id',id);
            var dfd = this.model.report.fetch();
            dfd.done(_.bind(function() {
                // tbd: overlay the defaults from the XML
                this.model.report.entry.content.set("display.general.manager", this.manager);
                this.model.report.entry.content.set({"display.general.title": title});
                mvc.Components.revokeInstance(this.manager, {silent: true});
                new SavedSearchManager({
                    "id": this.manager,
                    "searchname": this.model.report.entry.get("name"),
                    "app": utils.getCurrentApp(),
                    "auto_cancel": 90,
                    "status_buckets": 0,
                    "preview": true,
                    "timeFormat": "%s.%Q",
                    "wait": 0
                });
            }, this));
        },
        _saveAsReport: function(name, description) {
            console.log('Saving Panel as Report'); 
            //save the report
            this.model.report.entry.content.set({"name": name});
            this.model.report.entry.content.set({"description": description});
            var dfd = this.model.report.save({}, { data: { app: utils.getCurrentApp(), owner: splunkConfig.USERNAME }});
            // once dfd done: set a new savedSearchManager
            dfd.done(_.bind(function() {
                console.log("Report saved successfully"); 
                this.model.report.trigger("successfulReportSave");
                mvc.Components.revokeInstance(this.manager, {silent: true});
                new SavedSearchManager({
                    "id": this.manager,
                    "searchname": name,
                    "app": utils.getCurrentApp(),
                    "auto_cancel": 90,
                    "status_buckets": 0,
                    "preview": true,
                    "timeFormat": "%s.%Q",
                    "wait": 0
                });
            }, this));
        }
    });

    return EditPanel;
});

define('splunkjs/mvc/simplexml/element/base',['require','underscore','jquery','backbone','splunk.util','../../basesplunkview','../../../mvc','../../utils','../controller','models/DashboardReport','util/console','../../progressbarview','../../refreshtimeindicatorview','../../resultslinkview','../paneleditor','../../savedsearchmanager','../../messages','../../settings'],function(require){
    var _ = require('underscore'), $ = require('jquery'), Backbone = require('backbone');
    var SplunkUtil = require('splunk.util');
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
    var Messages = require("../../messages");
    var Settings = require("../../settings");

    var ELEMENT_TYPES = {};

    var REPORT_DEFAULTS_LOADED = new ReportModel().fetch();

    var DashboardElement = BaseSplunkView.extend({
        initialVisualization: '#abstract',
        configure: function() {
            this.options.settingsOptions = _.extend({
                retainUnmatchedTokens: true,
                tokens: true
            }, this.options.settingsOptions || {});
            
            // Augment the options with the extra information we need
            this.options = _.extend(this.options, {
                id: this.id,
                manager: this.options.managerid,
                title: this.$('h3').text()
            });
            
            BaseSplunkView.prototype.configure.apply(this, arguments);
        },
        initialize: function () {
            this.configure();
            this.visualization = null;
            this.model = new ReportModel();
            this.managerid = this.options.managerid;
            mvc.enableDynamicTokens(this.settings);

            this.settings._sync = utils.syncModels(this.settings, this.model.entry.content, {
                auto: true,
                prefix: 'display.general.'
            });

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
                var name = manager.get('searchname'), appModel = Dashboard.getStateModel().app;
                this.model.id = ['','servicesNS',appModel.get('owner'),appModel.get('app'),'saved','searches', name].join('/');
                this.model.fetch().done(function(){
                    if(that.initialVisualization !== '#abstract') {
                        that.model.entry.content.set(that._initialVisualizationToAttributes());
                    }
                    that.reportReady.resolve(that.model);
                }).fail(function(xhr){
                            console.error('Failed to load saved search', arguments);
                            if(xhr.status === 404) {
                                that.handleSavedSearchError(_("Warning: saved search not found: ").t() + JSON.stringify(name));
                            }
                        });
            } else if(manager) {
                REPORT_DEFAULTS_LOADED.done(function(response){
                    that.model.entry.content.set(response.entry[0].content);
                    if(that.initialVisualization !== '#abstract') {
                        that.model.entry.content.set(that._initialVisualizationToAttributes());
                    }
                    that.model.entry.content.set({
                        search: manager.get('search'),
                        "dispatch.earliest_time": manager.get('earliest_time'),
                        "dispatch.latest_time": manager.get('latest_time')
                    });
                    that.reportReady.resolve(that.model);
                });
            } else {
                REPORT_DEFAULTS_LOADED.done(function(response){
                    that.model.entry.content.set(response.entry[0].content);
                    if(that.initialVisualization !== '#abstract') {
                        that.model.entry.content.set(that._initialVisualizationToAttributes());
                    }
                    that.reportReady.resolve(that.model);
                });
            }
        },
        handleSavedSearchError: function(message) {
            var el = this.$('.panel-body>.msg');
            if(!el.length) {
                el = $('<div class="msg"></div>').appendTo(this.$('.panel-body'));
            }
            Messages.render({
                level: "warning",
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
        handleDrilldown: function(e) {
            this.trigger('drilldown', e);
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
                this.visualization.off();
                this.visualization.remove();
                mvc.Components.revokeInstance(this.visualization.id, {silent: true});
                this.visualization = null;
            }
            if (this.resultsLink) {
                this.resultsLink.remove();
                this.resultsLink = null;
            }
        },
        _createVisualization: function (applyOptions) {
            var initial = !this.visualization;
            this.$('.panel-body>.msg').remove();
            this._removeVisualization();
            var type = this.typeModel.get('type'),
                Element = ELEMENT_TYPES[type];
                
            if (!Element) {
                throw new Error('Unsupported visualization type "' + type + '"');
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
            this.visualization = new Element(options, {tokens: true}).render();
            
            // If we are switching this visualization to the events visualization,
            // then we need to set any search manager to have status_buckets > 0
            if (type === "events") {
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

            this.visualization.on('drilldown', this.handleDrilldown, this);
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
            if (!this.$('panel-footer').length) {
                $('<div class="panel-footer"></div>').appendTo(this.$el);
            }
            this.$('.panel-footer').addClass('clearfix');
        },
        updateTitle: function () {
            var title = this.settings.get('title') || '';
            if(Dashboard.getStateModel().get('edit') && !title) {
                this.$('.panel-head>h3').empty().append($('<span class="untitled">'+_("Untitled panel").t()+'</span>'));
            } else {
                this.$('.panel-head>h3').text(title);
            }
        },
        getExportParams: function(prefix) {
            var manager = mvc.Components.get(this.managerid), result = {};
            if(manager && manager.job && manager.job.sid) {
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

define('splunkjs/mvc/simplexml/dialog/addpanel/inline',['require','underscore','jquery','views/Base','views/shared/controls/ControlGroup','util/console','../../../utils','uri/route','util/time_utils','../../../tokenutils','bootstrap.tooltip'],function(require){
    var _ = require('underscore'),
        $ = require('jquery'),
        BaseView = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var console = require('util/console');
    var utils = require('../../../utils');
    var route = require('uri/route');
    var time_utils = require('util/time_utils');
    var token_utils = require('../../../tokenutils');
    require('bootstrap.tooltip');

    var ControlWrapper = BaseView.extend({
        render: function() {
            if(!this.el.innerHTML) {
                this.$el.html(_.template(this.template, {
                    label: this.options.label,
                    controlClass: this.options.controlClass || ''
                }));
            }
            var target = this.$('.controls');
            _.each(this.options.children, function(child){
                child.render().appendTo(target);
            });
            return this;
        },
        template: '<label class="control-label"><%- label %></label><div class="controls <%- controlClass %>"></div>'
    });

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
            this.model.timeRange.on('applied', function() {
                this.model.report.set({
                    'dispatch.earliest_time': this.model.timeRange.get('earliest'),
                    'dispatch.latest_time':this.model.timeRange.get('latest')
                });
                this.setLabel();
            }, this);
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
        setLabel: function() {
            var timeLabel = _("All Time").t();
            if (token_utils.hasToken(this.model.timeRange.get("earliest"))){
                timeLabel = _("Inherit").t();
            }
            else {
                timeLabel = this.model.timeRange.generateLabel(this.collection);
            }
            this.$el.find("span.time-label").text(timeLabel);
        },
        render: function() {
            this.children.searchField.render().appendTo(this.el);

            this.$el.append('<div class="timerange" style="display: block;"><label class="control-label">' + _('Time Range').t() + '</label></div>');
            this.$('div.timerange').append('<div class="controls"><a href="#" class="btn timerange-control"><span class="time-label"></span><span class="icon-triangle-right-small"></span></a></div>');
            this.setLabel();

            this.onModeChange();
            
            return this;
        }
    });

});
define('splunkjs/mvc/simplexml/dialog/addpanel/report',['require','underscore','jquery','views/Base','views/shared/controls/ControlGroup','collections/services/SavedSearches','splunkjs/mvc/simplexml/controller','../../../utils','util/time_utils','models/Cron','splunk.util','uri/route'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            Base = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var SavedSearches = require('collections/services/SavedSearches');
    var Dashboard = require('splunkjs/mvc/simplexml/controller');
    var utils = require('../../../utils');
    var timeUtils = require('util/time_utils');
    var Cron = require('models/Cron');
    var splunkUtil = require('splunk.util');
    var route = require('uri/route');
    return Base.extend({
        initialize: function() {
            Base.prototype.initialize.apply(this, arguments);

            this.children.reportPlaceholder = new Base();
            var reports = this.collection.reports;
            var appModel = Dashboard.model.app;
            var reportsLoaded = this.reportsLoaded = $.Deferred();

            reports.fetch({ data: { app: appModel.get('app'), owner: appModel.get('owner')  } }).done(_.bind(function() {
                var items = reports.map(function(report) {
                    return { label: report.entry.get('name'), value: report.id };
                });
                this.children.report = new ControlGroup({
                    label: "",
                    controlType: 'SyntheticSelect',
                    controlOptions: {
                        className: 'btn-group add-panel-report',
                        menuWidth: 'narrow',
                        toggleClassName: 'btn',
                        model: this.model,
                        modelAttribute: 'savedSearch',
                        items: items
                    }
                });
                reportsLoaded.resolve();
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
            var report = this.collection.reports.get(savedSearch);

            this.model.set('savedSearchName', report.entry.get('name'));
            this.model.set('savedSearchString', report.entry.content.get('search'));
            var et = report.entry.content.get('dispatch.earliest_time'),
                    lt = report.entry.content.get('dispatch.latest_time');

            var vizType = 'statistics', sub;
            if(report.entry.content.has('display.general.type')) {
                vizType = report.entry.content.get('display.general.type');
                if(vizType == 'events') {
                    vizType = 'statistics'; // Revert to a table for now - do not default to the events viewer
                } else {
                    sub = ['display', vizType, 'type'].join('.');
                    if(report.entry.content.has(sub)) {
                        vizType = [vizType, report.entry.content.get(sub)].join(':');
                    }
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
        },
        render: function() {
            this.children.reportPlaceholder.render().appendTo(this.el);

            $.when(this.reportsLoaded).then(_.bind(function() {
                this.children.report.render().appendTo(this.children.reportPlaceholder.el);
            }, this));

            this.children.searchField.render().appendTo(this.el);
            this.children.searchField.$('textarea').attr('readonly', 'readonly');

            this.children.timerangeField.render().appendTo(this.el);
            this.children.schedule.render().appendTo(this.el);
            this.children.permissions.render().appendTo(this.el);

            this.onModeChange();
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
                _("Create a pivot panel in").t()+' <a href="<%= pivotLink %>">'+_("Pivot").t()+'</a>' +
                '</div>'

    });

});
define('splunkjs/mvc/simplexml/dialog/addpanel/master',['require','exports','module','underscore','jquery','splunkjs/mvc','views/Base','views/shared/controls/ControlGroup','collections/services/SavedSearches','../../controller','./inline','./report','./pivot','util/console'],function(require, module, exports) {
    var _ = require('underscore'), $ = require('jquery'), mvc = require('splunkjs/mvc');
    var BaseView = require('views/Base');
    var ControlGroup = require('views/shared/controls/ControlGroup');
    var SavedSearches = require('collections/services/SavedSearches');
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
                    modelAttribute: 'title'
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

            var reportsCollection = new SavedSearches();

            this.children.inline = new InlineForm({
                model: this.model,
                collection: {
                    timeRanges: timesCollection
                }
            });
            this.children.report = new ReportForm({
                model: this.model.report,
                collection: {
                    timeRanges: timesCollection,
                    reports: reportsCollection
                }
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

define('splunkjs/mvc/searchtemplate',['require','exports','module','underscore','./mvc','./utils','util/console','./searchmanager','./tokenawaremodel','./tokensafestring','backbone','splunk.util','./simplexml/controller'],function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('./mvc');
    var utils = require('./utils');
    var console = require('util/console');
    var SearchManager = require('./searchmanager');
    var TokenAwareModel = require("./tokenawaremodel");
    var TokenSafeString = require("./tokensafestring");
    var Backbone = require('backbone');
    var splunkUtils = require('splunk.util');
    var Dashboard = require('./simplexml/controller');

    var TemplateQueryModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.tokenModel = (options && options.tokenModel) || mvc.Global;
            this.on('change:search', this.detectTokens, this);
            if(this.has('search')) {
                this.detectTokens();
            }
        },
        set: function(key, val, options) {
            var attrs;
            if (null === key) {
                return this;
            }
            if(typeof key === 'object') {
                attrs = key;
                options = val;
            } else {
                (attrs = {})[key] = val;
            }

            if(options && options.qualified && attrs.search) {
                if(attrs.search instanceof TokenSafeString) {
                    attrs.search = new TokenSafeString(splunkUtils.stripLeadingSearchCommand(attrs.search.value));
                } else {
                    attrs.search = splunkUtils.stripLeadingSearchCommand(attrs.search);
                }
            }
            return Backbone.Model.prototype.set.call(this, attrs, options);
        },
        get: function(attribute, options) {
            var result = Backbone.Model.prototype.get.apply(this, arguments);
            
            // We only want to add the leading search if:
            // 1. the get is for 'search'
            // 2. they explicitly asked for it to be qualified
            // 3. there is an actual search string (i.e. not an empty string)
            if(attribute === 'search' && options && options.qualified && result) {
                result = splunkUtils.addLeadingSearchCommand(result);
            }
            
            return result;
        },
        detectTokens: function() {
            var tokens = this.tokens = _(utils.discoverReplacementTokens(this.get('search'))).unique(),
                    model = this.tokenModel;
            model.off(null, null, this);
            if(tokens.length) {
                _(tokens).each(function(t){
                    model.on('change:'+t, this.triggerChange, this);
                }, this);
            }
        },
        triggerChange: function() {
            this.trigger('change');
        },
        resolve: function(options) {
            var result = utils.replaceTokens(this.get('search'), this.tokenModel.toJSON());
            if(options && options.qualified) {
                result = splunkUtils.addLeadingSearchCommand(result);
            }
            return result;
        },
        isSatisfied: function() {
            if(this.tokens.length) {
                var model = this.tokenModel;
                return _(this.tokens).all(function(t){ return model.has(t); });
            } else {
                return true;
            }
        }
    });
    
    /*
     * Extends SearchManager functionality with:
     *      - FormManager-style token binding for the 'search' property.
     *        Implicitly opts out of standard token binding.
     *          > Refuses to startSearch or createSearch if the 'search'
     *            property has any unbound tokens.
     *      - FormManager-style token binding for the search model.
     *        Implicitly opts out of standard token binding.
     *      - If neither the 'earliest_time' nor 'latest_time' properties
     *        are specified, binds them to '$earliest$' and '$latest$',
     *        which are bound to the default time picker automatically elsewhere.
     * 
     * Extends SearchManager API with:
     *      - runOnSubmit : boolean
     *          > Unclear whether this is intended to be public.
     */
    var SearchTemplate = SearchManager.extend({
        constructor: function(options) {
            options = options || {};
            
            var id = options.id;

            if (id === undefined && options.name) {
                // Advise users watching the console to not use .name
                id = options.name;
                console.log("Use of 'name' to specify the ID of a Splunk model is deprecated.");
            }
            if (id === undefined) {
                id = _.uniqueId('manager_');
            }
            
            // Store it on the instance/options
            this.id = this.name = options.name = options.id = id;
            
            if(!options.queryModel) {
                options.queryModel = new TemplateQueryModel({ search: options.search },{ tokenModel: options.tokenModel || mvc.Global });
            }
            if(!options.searchModel) {
                options.searchModel = new TokenAwareModel({ label: options.id });
                mvc.enableDynamicTokens(options.searchModel);
            }
            
            this.search = options.searchModel;
            this.runOnSubmit = options.runOnSubmit !== false;
            delete options.runOnSubmit;

            // make sure to create only a single search jobs for multiple changes on the search template
            this.createSearch = _.debounce(this.createSearch);

            var formManager = (options.formManager || 'fieldset');
            mvc.Components.bind('change:'+formManager, this.onFormManagerChange, this);

            var origAutoStart;
            if(mvc.Components.has(formManager)) {
                // Prevent the search from starting before we get hold of the form manager
                // to check if there's a default time range picker which overrides our time range
                origAutoStart = options.hasOwnProperty('autostart') ? options.autostart : true;
                options.autostart = false;
            }
            
            // Note that this will call our override of _start,
            // which purposefully does nothing.
            SearchManager.prototype.constructor.apply(this, arguments);
            mvc.enableDynamicTokens(this.search);
            
            // Put the real _start back there, and call it
            this._start = SearchManager.prototype._start;
            this._start();
            
            if(mvc.Components.has(formManager)) {
                this.onFormManagerChange(null, mvc.Components.get(formManager));
                this.set('autostart', origAutoStart);
                this._start();
            }
            
            // No form manager? Force bind to default timepicker properties immediately,
            // under the assumption that they will be picked up by MVC token binding.
            if(!options.formManager) {
                this._enableTimeRangePicker();
            }
        },
        _start: function() {
            // This purposefully does nothing, so that when the super class calls it, 
            // nothing will happen. We override at the end of the constructor.
        },
        onFormManagerChange: function(ctxs, formManager) {
            if(this.formManager) {
                if(this.formManager === formManager) {
                    return;
                }
                this.formManager.off(null, null, this);
            }
            this.formManager = formManager;
            // Check if there are timerange picker settings in the form manager
            if(Dashboard.getStateModel().has('default_timerange')) {
                this._enableTimeRangePicker();
            } else {
                // Switch to tokens for earliest/latest once a timerange picker has been added to the form manager
                formManager.once("change:earliest change:latest", this._enableTimeRangePicker, this);
            }
            if(this.runOnSubmit) {
                formManager.on('submit', this.startSearch, this);
            }
        },
        _enableTimeRangePicker: function() {
            var earliestIsToken = utils.isToken(this.search.get('earliest_time')),
                latestIsToken = utils.isToken(this.search.get('latest_time'));
            // Only use default timerange picker, if the current timerange isn't already expressed as a token
            if(!(earliestIsToken || latestIsToken)) {
                this.search.set({
                    'earliest_time': '$earliest$',
                    'latest_time': '$latest$'
                }, {tokens: true});
            }
        },
        startSearch: function() {
            if((!this.query.isSatisfied()) || (!this.search.isSatisfied())) {
                return;
            }
            SearchManager.prototype.startSearch.apply(this, arguments);
        },
        createSearch: function() {
            if((!this.query.isSatisfied()) || (!this.search.isSatisfied())) {
                return;
            }
            SearchManager.prototype.createSearch.apply(this, arguments);
        }
    });

    return SearchTemplate;
});

define('splunkjs/mvc/simplexml/dialog/addpanel',['require','exports','module','underscore','jquery','splunkjs/mvc','views/shared/Modal','models/Base','../../utils','../controller','../element/base','../mapper','./addpanel/master','../../savedsearchmanager','../../searchtemplate','util/console','views/shared/timerangepicker/dialog/Master','models/TimeRange'],function(require, module, exports) {
    var _ = require('underscore'), $ = require('jquery'), mvc = require('splunkjs/mvc');
    var Modal = require('views/shared/Modal');
    var BaseModel = require('models/Base');
    var utils = require('../../utils');
    var Dashboard = require('../controller');
    var DashboardElement = require('../element/base');
    var Mapper = require('../mapper');
    var AddPanelView = require('./addpanel/master');
    var SavedSearchManager = require('../../savedsearchmanager');
    var SearchTemplate = require('../../searchtemplate');
    var console = require('util/console');
    var TimeRangePickerView = require('views/shared/timerangepicker/dialog/Master');
    var TimeRangeModel = require('models/TimeRange');

    /**
     * Transient model representing the information for a new dashboard panel element
     */
    var NewPanelModel = BaseModel.extend({
        defaults: {
            elementCreateType: 'inline'
        },
        validation: {
            search: {
                fn: 'validateSearchQuery'
            }
        },
        validateSearchQuery: function(value, attr, computedState) {
            if(computedState['elementCreateType'] === 'inline' && !value) {
                return 'Search query is required';
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

            var vizType = searchType === 'saved' ? this.get('savedSearchVisualization') || 'statistics' : 'statistics',
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
                                new SearchTemplate({
                                    "id": newSearchId,
                                    "search": this.get('search'),
                                    "earliest_time": this.get('dispatch.earliest_time') || 0,
                                    "latest_time": this.get('dispatch.latest_time') || 'now',
                                    "app": utils.getCurrentApp(),
                                    "auto_cancel": 90,
                                    "status_buckets": 0,
                                    "preview": true,
                                    "timeFormat": "%s.%Q",
                                    "wait": 0,
                                    "runOnSubmit": true
                                });
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
                        });
                        component.render();
                        dfd.resolve();
                    }, this));

            return dfd.promise();
        }
    });

    return Modal.extend({
        SLIDE_ANIMATION_DISTANCE: 450,
        SLIDE_ANIMATION_DURATION: 500,
        moduleId: module.id,
        className: 'modal add-panel',
        initialize: function() {
            Modal.prototype.initialize.apply(this, arguments);
            this.model = new NewPanelModel();
            var timeRangeModel = new TimeRangeModel({
                'earliest': '$earliest$',
                'latest': '$latest$'
            });

            var appModel = Dashboard.model.app;
            var userModel = Dashboard.model.user;
            var appLocalModel = Dashboard.model.appLocal;
            var timesCollection = Dashboard.collection.times;
            //TODO how to use these so that things don't break but work when the models aren't prepoulated
            var userDfd = userModel.dfd;
            var appLocalDfd = appLocalModel.dfd;
            var timesDfd = timesCollection.dfd;

            this.children.addPanel = new AddPanelView({model: {'report': this.model, 'timeRange': timeRangeModel}, collection: timesCollection});
            this.children.timeRangePickerView = new TimeRangePickerView({
                model: {
                    timeRange: timeRangeModel,
                    user: userModel,
                    appLocal: appLocalModel,
                    application: appModel
                },
                collection: timesCollection
            });

            timeRangeModel.on('applied', function() {
                this.closeTimeRangePicker();
            }, this);

            this.listenTo(this.model, 'change:elementCreateType', this.handleSubmitButtonState, this);
        },
        events: {
            'click a.modal-btn-primary': function(e) {
                e.preventDefault();
                if(this.model.get('elementCreateType') === 'pivot') {
                    return;
                }
                Dashboard.getStateModel().set('edit', false);
                var modal = this;
                var dfd = this.model.save();

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
            'click a.btn.back' : function(e) {
                e.preventDefault();
                this.closeTimeRangePicker();
            },
            'click a.timerange-control': function(e) {
                e.preventDefault();
                this.showTimeRangePicker();
            }
        },
        handleSubmitButtonState: function(model) {
            this.$(Modal.FOOTER_SELECTOR)
                    .find('.btn-primary')[model.get('elementCreateType') === 'pivot' ? 'addClass' : 'removeClass']('disabled');
        },
        setLabel: function() {
            var timeLabel = this.model.timeRange.generateLabel(this.collection);
            this.$el.find("span.time-label").text(timeLabel);
        },
        showTimeRangePicker: function () {

            var $from = this.$addpanelContent,
                $to = this.$timeRangePickerWrapper;

            this.onBeforePaneAnimation($from, $to);

            this.$visArea.animate({
                height: this.$timeRangePickerWrapper.height()
            }, {
                duration: this.SLIDE_ANIMATION_DURATION,
                complete: function() {
                    this.onAfterPaneAnimation($from, $to);
                }.bind(this)
            }, this);

            this.$slideArea.animate({
                marginLeft: -this.SLIDE_ANIMATION_DISTANCE
            }, {
                duration: this.SLIDE_ANIMATION_DURATION
            });

            this.$el.animate({
                width: this.$timeRangePickerWrapper.width()
            }, {
                duration: this.SLIDE_ANIMATION_DURATION
            });

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Select Time Range").t());
            this.$('.btn.back').show();
            this.$('.btn-primary').hide();
            this.$('.btn.cancel').hide();
        },
        closeTimeRangePicker: function () {
            var $from = this.$timeRangePickerWrapper,
                $to = this.$addpanelContent;

            this.onBeforePaneAnimation($from, $to);

            this.$visArea.animate({
                height: this.$addpanelContent.height()
            }, {
                duration: this.SLIDE_ANIMATION_DURATION,
                complete: function() {
                    this.onAfterPaneAnimation($from, $to);
                }.bind(this)
            }, this);

            this.$slideArea.animate({
                marginLeft: 0
            }, {
                duration: this.SLIDE_ANIMATION_DURATION
            });

            this.$el.animate({
                width: this.$addpanelContent.width()
            }, {
                duration: this.SLIDE_ANIMATION_DURATION
            });

            this.$modalParent.animate({
                width: this.$addpanelContent.width(),
                marginLeft: -(this.SLIDE_ANIMATION_DISTANCE/2)
            }, {
                duration: this.SLIDE_ANIMATION_DURATION
            });

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Edit Schedule").t());
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
                this.children.timeRangePickerView.$el.show();
            }
            $to.css({ height: '', visibility: '' });
        },
        // undo the height manipulations that were applied to make a smooth animation
        // after the animation, the 'from' is hidden via display=none and the slide area has visible overflow
        // (this prevents vertical clipping of popup menus)
        onAfterPaneAnimation: function($from, $to) {
            if($from === this.$timeRangePickerWrapper) {
                this.children.timeRangePickerView.$el.hide();
            }
            this.$visArea.css('overflow', '');
            this.$visArea.css({ height: ''});
            $from.css({ height: '2px', visibility : 'hidden'});
        },
        render: function() {
            this.$el.html(Modal.TEMPLATE);

            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Add Panel").t());

            this.$(Modal.BODY_SELECTOR).remove();

            this.$(Modal.FOOTER_SELECTOR).before(
                '<div class="vis-area">' +
                    '<div class="slide-area">' +
                        '<div class="schedule-wrapper">' +
                            '<div class="' + Modal.BODY_CLASS + '" >' +
                            '</div>' +
                        '</div>' +
                        '<div class="timerange-picker-wrapper">' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );

            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            this.$visArea = this.$('.vis-area').eq(0);
            this.$slideArea = this.$('.slide-area').eq(0);
            this.$addpanelContent = this.$('.schedule-wrapper').eq(0);
            this.$timeRangePickerWrapper = this.$('.timerange-picker-wrapper').eq(0);

            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.addPanel.render().el);
            this.$timeRangePickerWrapper.append(this.children.timeRangePickerView.render().el);

            this.$modalParent = this.$el;
            this.children.timeRangePickerView.$el.hide();

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _('Save').t() + '</a>');
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn back modal-btn-back pull-left">' + _('Back').t() + '</a>');
            this.$('.btn.back').hide();

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
            'action.email.reportPaperSize': 'letter',
            'action.email.reportPaperOrientation': 'portrait',
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
        'views/shared/FlashMessages'
    ],
    function(module, $, _, Backbone, console, pdfUtils, ScheduledViewModel, Cron, BaseView, Modal, ControlGroup, ScheduleSentence, FlashMessagesView){

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
                        lineOneLabel: _("Schedule").t()
                    }),
                    this.children.emailAddresses = new ControlGroup({
                       controlType: 'Textarea',
                       controlOptions: {
                           modelAttribute: 'action.email.to',
                           model: this.model.inmem,
                           save: false
                       },
                       label: _("Email Addresses").t(),
                       help: _("Semi-colon separated list.").t()+'<br/>'+_("To send emails you must configure the settings in System Settings &gt; Alert Email Settings.").t()+
                               '<br/><a href="#">'+_("Learn More").t()+'</a>'
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
                            modelAttribute: 'action.email.reportPaperSize',
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
                            toggleClassName: 'btn'
                        },
                        label: _("Paper Size").t()
                    }),
                    this.children.paperLayout = new ControlGroup({
                        controlType: 'SyntheticRadio',
                        controlOptions: {
                            modelAttribute: 'action.email.reportPaperOrientation',
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
            events: {
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
                                    paperSize: this.model.inmem.get('action.email.reportPaperSize'),
                                    paperOrientation: this.model.inmem.get('action.email.reportPaperOrientation')
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
                        orientation = this.model.inmem.get('action.email.reportPaperOrientation'),
                        pageSize = this.model.inmem.get('action.email.reportPaperSize') || 'a2';
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
                        if(this.model.inmem.get('is_scheduled') === false && this.model.scheduledView.entry.content.get('is_scheduled') === false) {
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
            },
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
        events: {
            'click .edit-perms': function(e) {
                e.preventDefault();
                var model = this.model, roles = this.collection.roles;
                _.defer(function(){
                    var permissionsDialog = new PermissionsDialog({
                        model: model.dashboard,
                        collection: roles,
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
                        model: model,
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
        },
        render: function() {
            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Dashboard has been cloned.").t());
            this.$(Modal.BODY_SELECTOR).append(Modal.FORM_HORIZONTAL);

            var link = route.page(this.model.application.get("root"), this.model.application.get("locale"),
                    this.model.dashboard.entry.acl.get("app"), this.model.dashboard.entry.get('name'));

            this.$(Modal.BODY_FORM_SELECTOR).append(_.template(this.messageTemplate, {
                dashboardLink: link,
                _: _
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
                        '<p><%- _("Additional Settings").t() %>:' +
                            '<ul>' +
                                '<li><a href="#" class="edit-perms"><%- _("Permissions").t() %></a></li>' +
                                '<li><a href="#" class="schedule-pdf"><%- _("Schedule PDF Delivery").t() %></a></li>' +
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
                perms: 'private'
            });

            this.children.flashMessages = new FlashMessagesView({
                model: {
                    dashboard: this.model.dashboard,
                    dashboardMeta: this.model.dashboard.meta
                }
            });

             this.children.titleTextControl = new TextControl({
                modelAttribute: 'label',
                model: this.model.dashboard.meta,
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

        },
        events: {
            'click a.modal-btn-primary': function (e) {
                e.preventDefault();
                this.submit();
            },
            "keypress": function(e) {
                Modal.handleKeyboardEvent(e, { enter: this.submit }, this);
            }
        },
        submit: function() {
            var dashboard = this.model.dashboard;
            dashboard.meta.validate();
            if (dashboard.meta.isValid()) {
                dashboard.meta.apply();
                var modal = this, data;
                data = this.model.application.getPermissions(this.model.perms.get('perms'));
                dashboard.save({}, { data: data }).done(function () {
                    if(modal.collection && modal.collection.dashboards) {
                        modal.collection.dashboards.add(modal.model.dashboard);
                    }

                    _.defer(function(){
                        var successDialog = new CloneSuccessView({
                            model: {
                                dashboard: dashboard,
                                application: modal.model.application,
                                scheduledView: modal.model.scheduledView
                            },
                            collection: modal.collection
                        });
                        successDialog.render().show();
                    });

                    modal.hide();
                    modal.remove();
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
            this.$(Modal.BODY_FORM_SELECTOR).append(this.children.permissions.render().el);

            this.$(Modal.FOOTER_SELECTOR).append(Modal.BUTTON_CANCEL);
            this.$(Modal.FOOTER_SELECTOR).append('<a href="#" class="btn btn-primary modal-btn-primary">' + _("Clone Dashboard").t() + '</a>');
            return this;
        }
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
                        model: model.dashboard,
                        collection: roles,
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
            var editLink = "/manager/" + app + 
                    "/data/ui/views/" + name + 
                    "?action=edit&ns=" +  app + 
                    "&redirect_override=" + encodeURIComponent(window.location.pathname);

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

            this.children.titleTextControl = new TextControl({
                modelAttribute: 'label',
                model: this.model.dashboard.meta,
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
        events: {
            'click a.modal-btn-primary': function(e) {
                e.preventDefault();
                this.submit();
            },
            "keypress": function(e) {
                Modal.handleKeyboardEvent(e, { enter: this.submit }, this);
            }
        },
        submit: function() {
            var that = this;
            var dashboard = that.model.dashboard;
            var currentDashboard = that.model.currentDashboard;
            var app = that.model.application;
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
                            xmlString: dashboard.entry.content.get('eai:data')
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
                                        application: app
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
            this.$el.html(Modal.TEMPLATE);
            this.$(Modal.HEADER_TITLE_SELECTOR).html(_("Convert Dashboard to HTML").t());
            this.$(Modal.BODY_SELECTOR).prepend(this.children.flashMessages.render().el);
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

define('splunkjs/mvc/simpleform/formtokens',['require','underscore','backbone','models/classicurl','../mvc'],function(require) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var classicurl = require('models/classicurl');
    var mvc = require('../mvc');
    
    /**
     * Manages the special token namespaces that are available for
     * binding tokens within SimpleXML forms:
     * 
     *  + form_raw
     *      - Live: Updates immediately when a form token changes.
     *      - Raw: Contains the raw token value, without any prefix/suffix.
     *      - Contains:
     *          > foo = value
     *      - Read/write.
     *  
     *  + form_submitted_raw
     *      - Submitted: Updates when the submit button is pressed.
     *      - Raw: Contains the raw token value, without any prefix/suffix.
     *      - Contains:
     *          > foo = value
     *      - Read/write.
     *      - Persists to the URL automatically (with the 'form.' prefix).
     *  
     *  + form
     *      - Live: Updates immediately when a form token changes.
     *      - Transformed: Token values are transformed with a prefix/suffix.
     *      - Augmented: Contains all URL query parameters.
     *      - Contains:
     *          > foo = <prefix>value<suffix>
     *          > form.foo = value
     *          > ... (non-form URL query parameters)
     *      - Read only. (Writes will be ignored silently.)
     *  
     *  + form_submitted
     *      - Submitted: Updates when the submit button is pressed.
     *      - Transformed: Token values are transformed with a prefix/suffix.
     *      - Augmented: Contains all URL query parameters.
     *      - Contains:
     *          > foo = <prefix>value<suffix>
     *          > form.foo = value
     *          > ... (non-form URL query parameters)
     *      - Read only. (Writes will be ignored silently.)
     */
    var FormTokens = {
        _isInitialized: false,
        _tokenOptionsByName: {},
        
        /**
         * Initializes all form-specific token namespaces.
         * 
         * Repeated invocations will have no effect.
         */
        initialize: function() {
            var that = FormTokens;
            
            if (that._isInitialized) {
                return;
            }
            
            // Create form token namespaces
            that._formLiveRaw = that._createTokenModel('form_raw');
            that._formSubmittedRaw = that._createTokenModel('form_submitted_raw');
            that._formLive = that._createTokenModel('form');
            that._formSubmitted = that._createTokenModel('form_submitted');
            
            // Changes to submitted tokens update the live tokens automatically
            new Arrow(that._formSubmittedRaw, that._formLiveRaw);
            
            // Changes to raw tokens update the transformed tokens automatically
            // NOTE: Changes to transformed tokens do NOT update raw
            //       tokens automatically, since that would pollute the raw
            //       token namespaces with URL query parameters.
            that._transformingArrow1 = new Arrow(that._formLiveRaw, that._formLive,
                { valueTransform: FormTokens._RAW_VALUE_TO_TRANSFORMED });
            that._transformingArrow2 = new Arrow(that._formSubmittedRaw, that._formSubmitted,
                { valueTransform: FormTokens._RAW_VALUE_TO_TRANSFORMED });
            
            // Create URL token namespaces
            // NOTE: Deliberately not publishing as a public field, since the
            //       registration of this model is likely to be moved out of 
            //       this class in the future.
            var urlModel = that._createUrlModel();
            
            // Tokens in the URL query parameters are automatically synced
            // with the form.
            new Arrow(urlModel, that._formSubmittedRaw, {
                keyFilter: function(key) {
                    return (key.indexOf('form.') === 0);
                },
                keyTransform: function(key) {
                    return key.substring('form.'.length);
                }
            });
            new Arrow(that._formSubmittedRaw, urlModel, {
                keyTransform: function(key) {
                    return ('form.' + key);
                }
            });
            
            // Expose all URL query parameters in the transformed token namespaces
            // for backward compatibility with Splunk 5.x (Ace) forms.
            // 
            // In particular user code expects to be able to get the
            // untransformed verson of token 'foo' by reading 'form.foo'.
            new Arrow(urlModel, that._formSubmitted);
            new Arrow(urlModel, that._formLive);
            
            that._isInitialized = true;
        },
        
        /*
         * Creates the 'url' token namespace which mirrors the live current
         * URL query parameters.
         */
        // NOTE: This namespace may be extracted to the overall MVC framework in the
        //       future, so that it is available outside of SimpleXML contexts.
        _createUrlModel: function() {
            var that = FormTokens;
            var urlModel = that._createTokenModel('url');
            
            new Arrow(classicurl, urlModel);
            new Arrow(urlModel, classicurl, {
                didForward: function() {
                    classicurl.save();
                }
            });
            
            return urlModel;
        },
        
        _RAW_VALUE_TO_TRANSFORMED: function(value, key) {
            var tokenOptions = FormTokens._tokenOptionsByName[key] || {};
            if (typeof value === 'string') {
                if (tokenOptions['default'] && (value === '')) {
                    value = tokenOptions['default'];
                }
                if (tokenOptions.prefix) {
                    value = tokenOptions.prefix + value;
                }
                if (tokenOptions.suffix) {
                    value = value + tokenOptions.suffix;
                }
            }
            return value;
        },
        
        /**
         * Registers the specified token with the specified options.
         * 
         * @param tokenOptions.prefix
         *      Prepended to the transformed value of the token, as
         *      available in the 'form' and 'form_submitted' models.
         * @param tokenOptions.suffix
         *      Appended to the transformed value of the token, as
         *      available in the 'form' and 'form_submitted' models.
         * @param tokenOptions.default
         *      Used as the token value if the original value is ''.
         */
        register: function(tokenName, tokenOptions) {
            var that = FormTokens;
            
            // TODO: Warn if a token is reregistered with different options.
            //       Ask Marshall how to do this.
            that._tokenOptionsByName[tokenName] = tokenOptions;
            
            if (that._isInitialized) {
                // Retransform the token values, now that the token options
                // have potentially changed.
                that._transformingArrow1.forward(tokenName);
                that._transformingArrow2.forward(tokenName);
            }
        },
        
        /**
         * Triggers form submission.
         * 
         * This will update tokens in the 'form_submitted_raw' and
         * 'form_submitted' namespaces, along with anything synced
         * with them such as the 'url' token namespace.
         */
        submit: function() {
            var that = FormTokens;
            
            if (!that._isInitialized) {
                // Ignore submits before form namespaces have been created
                return;
            }
            
            // Forward the entire live model state to the submitted model
            var forwarder = new Arrow(that._formLiveRaw, that._formSubmittedRaw);
            forwarder.destroy();
        },
        
        _createTokenModel: function(name) {
            return mvc.Components.getInstance(name, {create: true});
        }
    };
    
    /**
     * Automatically forwards attributes from a source model
     * to a destination model, optionally transforming attribute
     * names and values in the process.
     * 
     * Upon creation the initial attributes from the source model are
     * automatically forwarded to the destionation model.
     * Therefore when using two arrows to create a bidirectional relationship,
     * the arrow instantiation order matters if the two models initially have
     * common keys with different values.
     * 
     * The options is an optional dictionary with keys:
     *      + keyFilter : function(key)->boolean (optional)
     *          > Returns whether the specified key should be forwarded.
     *      + keyTransform : function(key)->transformedKey (optional)
     *          > Returns a transformed version of the key that will be forwarded.
     *      + valueTransform : function(value, key)->transformedValue (optional)
     *          > Returns a transformed version of the value that will be forwarded.
     *      + didForward : function() (optional)
     *          > Called after a series of attributes have been forwarded.
     */
    // TODO: Improve name. Perhaps ModelBinding or ModelBinder?
    //       The rename can be deferred up until this class is made public.
    // TODO: Handle unsets properly.
    var Arrow = function(sourceModel, destModel, options) {
        var that = this;
        
        options = options || {};
        var keyFilter = options.keyFilter || function(key) { return true; };
        var keyTransform = options.keyTransform || function(key) { return key; };
        var valueTransform = options.valueTransform || function(value, key) { return value; };
        var didForward = options.didForward || function() { /* nothing */ };
        
        this.sourceModel = sourceModel;
        this.destModel = destModel;
        
        // Forward changes on the source to the destination
        sourceModel.on('change', this._sourceModelListener = function(model, options) {
            var changedAttributes = {};
            _.each(model.changed, function(value, key) {
                if (keyFilter(key)) {
                    var destKey = keyTransform(key);
                    var destValue = valueTransform(value, key);
                    changedAttributes[destKey] = destValue;
                }
            });
            
            destModel.set(changedAttributes);
            
            didForward();
        });
        
        // Forward initial state of the source to the destination
        this.forward();
    };
    _.extend(Arrow.prototype, {
        /**
         * Reforwards the specified attribute from the source model
         * to the destination model. If no attribute is specified,
         * the entire source model is forwarded.
         * 
         * This is useful if the value transformation rule for this
         * arrow now would yield a different transformed value.
         */
        forward: function(attrName) {
            var changedAttributes;
            if (attrName === undefined) {
                changedAttributes = this.sourceModel.attributes;
            } else {
                changedAttributes = {};
                if (this.sourceModel.has(attrName)) {
                    changedAttributes[attrName] = this.sourceModel.get(attrName);
                }
            }
            
            if (!_.isEmpty(changedAttributes)) {
                // Trigger forwarding via listener
                this.sourceModel.changed = changedAttributes;
                this._sourceModelListener(this.sourceModel);
            }
        },
        
        /**
         * Destroys this arrow.
         * No further automatic forwarding will be performed.
         */
        // TODO: Call this automatically if either sourceModel or destModel is deleted
        destroy: function() {
            this.sourceModel.off('change', this._sourceModelListener);
            this._sourceModelListener = null;
        }
    });
    
    return FormTokens;
});
define('splunkjs/mvc/simpleform/input/base',['require','underscore','jquery','../../basesplunkview','../formtokens','../../tokenutils'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseSplunkView = require('../../basesplunkview');
    var FormTokens = require('../formtokens');
    var TokenUtils = require('../../tokenutils');

    var BaseInput = BaseSplunkView.extend({
        options: {
            submitOnChange: false
        },
        initialize: function() {
            this.configure();
            this.settings.enablePush('value');
            
            // Register the output token, if specified
            var outputTokenRef = this.settings.get('value', { tokens: true });
            if (outputTokenRef !== undefined &&
                TokenUtils.isToken(outputTokenRef))
            {
                // NOTE: Deliberately stripping the token namespace,
                //       under the assumption that it is one of the 'form_*'
                //       namespaces, which indicates that it is a normal form
                //       token.
                var outputTokenName = TokenUtils.getTokens(outputTokenRef)[0].name;
                var outputTokenOptions = _.pick(
                    this.settings.toJSON(),
                    ['default', 'prefix', 'suffix']);
                FormTokens.register(outputTokenName, outputTokenOptions);
            }
            
            // Update self when settings change
            this.bindToComponent(this.options.formManager, this.onFormManagerChange, this);
            this.settings.on('change:token change:default change:prefix change:suffix', this.bindToFormManager, this);
            this.settings.on('change:label', this.renderLabel, this);
            
            this.inputId = _.uniqueId((this.id || 'input') + '_');
        },
        onFormManagerChange: function(ctx, model) {
            if(this.formModel) {
                this.formModel.off(null, null, this);
            }
            this.formModel = model;
            this.bindToFormManager();
        },
        bindToFormManager: function() {
            if(!this.formModel) {
                return;
            }
            var token = this.token = this.settings.get('token'), ctx = this.formModel, settings = this.settings;
            if(settings.hasChanged('token')) {
                ctx.unregister(settings.previous('token'));
            }
            ctx.register(token, _.pick(settings.toJSON(), ['default', 'prefix', 'suffix']), this.readyDfd());
            ctx.on('change:' + token, this.onModelChange, this);

            if(ctx.has(token)) {
                this.setValue(ctx.get(token));
            } else {
                var v = this.getValue();
                if(v) {
                    ctx.set(token, v);
                } else if(settings.has('seed')) {
                    ctx.set(token, settings.get('seed'));
                }
            }
        },
        readyDfd: function() {
            return null;
        },
        destroy: function() {
            if(this.formModel) {
                this.formModel.unregister(this.token);
                this.formModel.off(null, null, this);
            }
            BaseSplunkView.prototype.destroy.apply(this, arguments);
        },
        handleChange: function() {
            // Update form token
            // TODO: Remove this logic. (SPL-67733)
            if(this.formModel) {
                this.formModel.set(this.token, this.getValue());
                this.formModel.submit(this.settings.get('submitOnChange') ? 'soft' : 'change');
            }
            
            // Update MVC token
            this.settings.set('value', this.getValue());
            if (this.settings.get('submitOnChange')) {
                FormTokens.submit();
            }
        },
        sendSoftSubmit: function() {
            // Submit form tokens
            if(this.formModel) {
                this.formModel.submit('soft');
            }
            
            // Submit MVC tokens
            this.trigger('submit', this);
        },
        onModelChange: function() {
            this.setValue(this.formModel.get(this.token));
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

define('splunkjs/mvc/simpleform/input/timerange',['require','underscore','jquery','backbone','./base','views/shared/timerangepicker/Master','models/TimeRange','../../simplexml/controller','../../mvc','util/console'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            Backbone = require('backbone'),
            BaseInput = require('./base'),
            TimeRangePickerView = require('views/shared/timerangepicker/Master'),
            TimeRangeModel = require('models/TimeRange'),
            Dashboard = require('../../simplexml/controller'),
            mvc = require('../../mvc'),
            console = require('util/console');

    var TimeRangePicker = BaseInput.extend({
        initialize: function() {
            this.configure();
            this.settings.enablePush('earliest_time');
            this.settings.enablePush('latest_time');
            
            this.model = new Backbone.Model({});
            this._readyDfd = $.Deferred();
            
            var appModel = Dashboard.model.app;
            var userModel = Dashboard.model.user;
            var appLocalModel = Dashboard.model.appLocal;
            var timesCollection = this.timesCollection = Dashboard.collection.times;
            
            // Pick up any initial values (usually from the URL)
            if (this.settings.has('earliest') || this.settings.has('latest')) {
                var set = false;
                var earliest = this.settings.get('earliest');
                var latest = this.settings.get('latest');
                if (!_.isUndefined(earliest) && earliest !== '') {
                    set = true;
                    this.settings.set('earliest_time', this.settings.get('earliest'));
                }
                if (!_.isUndefined(latest) && latest !== '') {
                    set = true;
                    this.settings.set('latest_time', this.settings.get('latest'));
                }
                if (set) {
                    this.setValue();    
                }
            }
            
            var that = this;
            if(this.settings.has('default')) {
                
                // When the times collection finishes fetching, we will apply
                // the default value
                $.when(timesCollection.dfd).done(function() {
                    that.applyDefaultValue(false);
                });
                
                this.settings.on('change:default', this.applyDefaultValue, this);
                if(!_.isString(this.settings.get('default'))) {
                    this.applyDefaultValue(false);
                }
                
            }
            
            this._pickerDfd = $.when(timesCollection.dfd, userModel.dfd, appLocalModel.dfd).done(function() {
                that.picker = new TimeRangePickerView({
                    el: $('<div></div>').appendTo(that.el),
                    model: {
                        state: that.model,
                        timeRange: new TimeRangeModel(),
                        user: Dashboard.model.user,
                        appLocal: Dashboard.model.appLocal,
                        application: Dashboard.model.app
                    },
                    collection: timesCollection
                });
            });
            
            this.model.on('change', this.onChange, this);
            this.bindToComponent(this.options.formManager, this.onFormManagerChange, this);
            this.settings.on('change:token', function() {
                this.onFormManagerChange(null, this.formModel);
            }, this);
            if(!this.settings.has('token')) {
                Dashboard.getStateModel().on('change:edit', this.onEditStateChange, this);
            }
            
            this._bindRangeToDefaultTokens();
        },
        events: {
            'click .remove-timerange-picker a': function(e) {
                e.preventDefault();
                this.remove();
            }
        },
        _bindRangeToDefaultTokens: function() {
            var earliestTokenName;
            var latestTokenName;
            var tokenName = this.settings.has('token');
            if (tokenName) {
                earliestTokenName = tokenName + '.earliest';
                latestTokenName = tokenName + '.latest';
            } else {
                earliestTokenName = 'earliest';
                latestTokenName = 'latest';
            }
            
            // Bind range settings to default tokens, if not already bound
            var initialRangeTokens = {};
            if (!this.settings.has('earliest_time')) {
                initialRangeTokens['earliest_time'] = '$' + earliestTokenName + '$';
            }
            if (!this.settings.has('latest_time')) {
                initialRangeTokens['latest_time'] = '$' + latestTokenName + '$';
            }
            if (!_.isEmpty(initialRangeTokens)) {
                this.settings.set(initialRangeTokens, {tokens: true});
            }
            
            // Update view when settings change
            this.settings.on(
                'change:earliest_time change:latest_time',
                this.setValue, this);
            
            // Initialize range settings
            var initialRangeValues = {};
            initialRangeValues['earliest_time'] = 
                this.settings.get('earliest_time') ||
                this.model.get('dispatch.earliest_time');
            initialRangeValues['latest_time'] = 
                this.settings.get('latest_time') ||
                this.model.get('dispatch.latest_time');
            this.settings.set(initialRangeValues);
        },
        applyDefaultValue: function(force) {
            if(force === true || !this.model.has('dispatch.earliest_time')) {
                var def = this.settings.get('default');
                if(def) {
                    if(_.isString(def)) {
                        var m = this.timesCollection.find(function(m) {
                            return m.entry.content.get("label") === def;
                        });
                        if(m) {
                            this.model.set({
                                'dispatch.earliest_time': m.entry.content.get('earliest_time'),
                                'dispatch.latest_time': m.entry.content.get('latest_time')
                            });
                        } else {
                            console.warn('Could not find matching preset for time range picker default value=%o', def);
                            this.model.set({"dispatch.earliest_time": "0", "dispatch.latest_time": "now"});
                        }
                    } else {
                        this.model.set({
                            'dispatch.earliest_time': def.earliestTime,
                            'dispatch.latest_time': def.latestTime
                        });
                    }
                }
                this.updateGlobalDefaultTimeRange();
            }
            this._readyDfd.resolve();
        },
        onFormManagerChange: function(ctx, model) {
            if(this.formModel) {
                this.formModel.off(null, null, this);
            }
            this.formModel = model;
            
            // TODO: What is this?
            this.formModel.register(null, null, this.readyDfd());
        },
        readyDfd: function() {
            return this._readyDfd;
        },
        setValue: function() {
            this.model.set({
                'dispatch.earliest_time': this.settings.get('earliest_time'),
                'dispatch.latest_time': this.settings.get('latest_time')
            });
        },
        onChange: function() {
            this.settings.set({
                'earliest_time': this.model.get('dispatch.earliest_time'),
                'latest_time': this.model.get('dispatch.latest_time')
            });
            this.trigger('change');
            
            if (this.formModel) {
                this.formModel.submit(this.settings.get('submitOnChange') ? 'soft' : 'change');
            }
        },
        getValue: function() {
            var rawEarliestTime = this.model.get('dispatch.earliest_time');
            var rawLatestTime = this.model.get('dispatch.latest_time');
            
            return {
                earliest_time: rawEarliestTime,
                latest_time: rawLatestTime
            };
        },
        onEditStateChange: function(model) {
            if(model.get('edit') && !this.settings.has('token')) {
                $('<div class="remove-timerange-picker"><a href="#"><i class="icon-x-circle"></i></a></div>').appendTo(this.$el);
                $('<div class="timerange-edit-hint"></div>')
                        .html(_('Select default time range above. Time range only applies to <i class="icon-search-thin"></i> Inline Searches.').t())
                        .appendTo(this.$el);
                this.model.on('change', this.updateGlobalDefaultTimeRange, this);
                this.applyDefaultValue(true);
            } else {
                this.model.off('change', this.updateGlobalDefaultTimeRange, this);
                this.$('.remove-timerange-picker').remove();
                this.$('.timerange-edit-hint').remove();
            }
        },
        updateGlobalDefaultTimeRange: function() {
            if(!this.settings.get('token')) {
                var v = {
                    earliestTime: this.model.get('dispatch.earliest_time'),
                    latestTime: this.model.get('dispatch.latest_time')
                };
                Dashboard.getStateModel().set('default_timerange', v);
                this.settings.set('default', v, { silent: true });
            }
        },
        remove: function() {
            var that = this;
            
            // We can't remove the timepicker until it is created
            $.when(this._pickerDfd).done(function() {
                that.picker.remove();
            });
            
            Dashboard.getStateModel().off(null, null, this);
            this.timesCollection.off(null, null, this);
            this.model.off();
            mvc.Components.revokeInstance(this.id);
            BaseInput.prototype.remove.call(this);
            if(!this.settings.get('token')) {
                Dashboard.getStateModel().set('default_timerange', null);
            }
        },
        render: function() {
            this.renderLabel();
            this._pickerDfd.done(_.bind(this.renderTimePicker, this));
            this.onEditStateChange(Dashboard.getStateModel());
            return this;
        },
        renderTimePicker: function(){
            var cur = this.model.toJSON();
            
            // We can't render the timepicker until it is created
            var that = this;
            $.when(this._pickerDfd).done(function() {
                that.picker.render();
            });
            
            if(!_.isEmpty(cur)) {
                this.model.clear({ silent: true });
                this.model.set(cur);
            }
        }
    });
    
    return TimeRangePicker;
});

define('splunkjs/mvc/simpleform/formmanager',['require','underscore','jquery','../mvc','../basemanager','../utils','../simplexml/controller','backbone','util/console'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var mvc = require('../mvc');
    var BaseManager = require('../basemanager');
    var utils = require('../utils');
    var Dashboard = require('../simplexml/controller');
    var Backbone = require('backbone');
    var console = require('util/console');

    var FormManager = BaseManager.extend({
        defaultOptions: {
            submitOnChange: false,
            softSubmit: true,
            triggerSearchOnSoftSubmit: false
        },
        constructor: function(options) {
            BaseManager.prototype.constructor.call(this, {}, _.defaults(options || {}, this.defaultOptions));
        },
        initialize: function(attributes, options) {
            this.meta = new BaseManager(options.metadata || {});
            this._ready = [];
            this.globalModel = options.globalModel ||  mvc.Global;

            if(console.DEBUG_ENABLED) {
                this.on('change', function(m){
                    _.each(m.changed, function(v, k){
                        console.log('FORM MANAGER CHANGE key=%o value: %o -> %o', k , m.previous(k), v);
                    });
                });
            }

            // A model containing the attributes of the global model and the unsubmitted form attributes
            this.formModel = new Backbone.Model();
            this.globalSyncer = utils.syncModels(this.globalModel, this.formModel, { auto: 'push', exclude: _.keys(this.toJSON()) });
            this.on('change', function(m){
                this.globalSyncer.exclude(_.keys(m.toJSON()));
                this._applyMetadata(this.formModel);
            }, this);

            this.softSubmit = options.softSubmit;
            this.submitOnChange = options.submitOnChange;
            this.triggerSearchOnSoftSubmit = options.triggerSearchOnSoftSubmit;
            if(options.persist) {
                this.persistentStore = Dashboard.getPersistentStore(options.persist.storage);
                this.persister = utils.bindModel({
                    source: this,
                    dest: this.persistentStore,
                    prefix: options.persist.prefix,
                    alias: {
                        earliest: 'earliest',
                        latest: 'latest'
                    },
                    save: true
                }).auto('pull');
            }
        },
        submit: function(type) {
            console.log('FormManager.submit(%o)',type);
            if(type === 'change' && this.submitOnChange !== true) {
                return false;
            }
            if(type === 'soft' && this.softSubmit !== true) {
                return false;
            }
            this._submit(type);
            return true;
        },
        register: function(token, options, readyDfd) {
            if(token) {
                this.meta.set(token, options);
                if((!this.has(token)) && options && options.hasOwnProperty('default')) {
                    this.set(token, options['default']);
                }
            }
            if(readyDfd) {
                this._ready.push(readyDfd);
            }
        },
        unregister: function(token) {
            this.meta.unset(token);
            this.unset(token);
        },
        _applyMetadata: function(destModel) {
            var attributes = this.toJSON(), data = {}, meta = this.meta;
            _(attributes).each(function(v,k){
                if(meta.has(k)) {
                    var m = meta.get(k), result = [];
                    if((!v) && m['default']) {
                        v = m['default'];
                    }
                    if(m.prefix) {
                        result.push(m.prefix);
                    }
                    result.push(v);
                    if(m.suffix) {
                        result.push(m.suffix);
                    }
                    v = result.join('');
                }
                data[k] = v;
            });
            _(meta.toJSON()).each(function(v,k){
                if((!attributes.hasOwnProperty(k))) {
                    if(v['default']) {
                        data[k] = [v.prefix||'',v['default'], v.suffix||''].join('');
                    } else {
                        data[k] = undefined;
                    }
                }
            });
            destModel.set(data);
        },
        _submit: _.debounce(function(type){
            var attributes = this.toJSON();
            if((type == 'soft' && this.triggerSearchOnSoftSubmit) || type === undefined){
                this.trigger('submit', attributes, this);
            }
            if(this.persister) {
                this.persister.push();
            }
            if(this.globalModel) {
                this._applyMetadata(this.globalModel);
            }
        }),
        submitOnReady: function() {
            if(this._ready.length) {
                var that = this, dfds = this._ready;
                $.when.apply($, dfds).then(function(){
                    that.submit();
                });
            } else {
                this.submit();
            }
        },
        save: function() {
            this.set.apply(this, arguments);
            this.submit('soft');
        }
    });

    return FormManager;
});
define('splunkjs/mvc/simplexml/editdashboard',['require','exports','module','underscore','jquery','views/Base','views/shared/delegates/Popdown','collections/services/authorization/Roles','views/shared/documentcontrols/dialogs/permissions_dialog/Master','./dialog/dashboardtitle','./dialog/addpanel','views/dashboards/table/controls/SchedulePDF','models/services/ScheduledView','util/pdf_utils','views/dashboards/table/controls/CloneDashboard','views/dashboards/table/controls/ConvertDashboard','models/Dashboard','./controller','util/console','../../mvc','../utils','uri/route','views/shared/dialogs/TextDialog','../simpleform/input/timerange','../simpleform/formmanager','splunk.util','splunk.config','util/splunkd_utils'],function(require, exports, module) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseView = require('views/Base');
    var PopdownView = require('views/shared/delegates/Popdown');
    var Roles = require('collections/services/authorization/Roles');
    var PermissionsDialog = require('views/shared/documentcontrols/dialogs/permissions_dialog/Master');
    var TitleDialog = require('./dialog/dashboardtitle');
    var AddPanelDialog = require('./dialog/addpanel');
    var SchedulePDFDialog = require('views/dashboards/table/controls/SchedulePDF');
    var ScheduledViewModel = require('models/services/ScheduledView');
    var pdfUtils = require('util/pdf_utils');
    var CloneDialog = require('views/dashboards/table/controls/CloneDashboard');
    var ConvertDialog = require('views/dashboards/table/controls/ConvertDashboard');
    var DashboardModel = require('models/Dashboard');
    var Dashboard = require('./controller');
    var console = require('util/console');
    var mvc = require('../../mvc');
    var utils = require('../utils');
    var route = require('uri/route');
    var TextDialog = require('views/shared/dialogs/TextDialog');
    var TimeRangePickerInput = require('../simpleform/input/timerange');
    var FormManager = require("../simpleform/formmanager");
    var splunkUtils = require('splunk.util'); 
    var config = require('splunk.config');
    var splunkDUtils = require('util/splunkd_utils');

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
                'click a.edit-panels': function(e) {
                    e.preventDefault();
                    this.model.state.set('edit', true);
                },
                'click a.edit-done': function(e){
                    e.preventDefault();
                    this.model.state.set('edit', false);
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
                },
                'click a.schedule-pdf': function(e){
                    e.preventDefault();
                    var scheduledView = new ScheduledViewModel(),
                        dfd = scheduledView.findByName(this.model.dashboard.entry.get('name'),
                                                         this.model.application.get('app'),
                                                         this.model.application.get('owner')),
                        that = this;
                     dfd.done(function(){
                         var dialog = new SchedulePDFDialog({
                             model: {
                                 scheduledView: scheduledView,
                                 dashboard: that.model.dashboard,
                                 application: that.model.application
                             },
                             onHiddenRemove: true
                         });
                         dialog.render().appendTo($('body'));
                         dialog.show();
                     }).fail(function(){
                        alert(_("Error loading PDF Schedule information").t());
                     });
                },
                'click a.add-panel': function(e) {
                    e.preventDefault();
                    this.children.addPanelDialog = new AddPanelDialog({});
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

                    if(!mvc.Components.has('fieldset')) {
                        new FormManager({
                            id: 'fieldset',
                            persist: {
                                storage: 'uri',
                                prefix: 'form.'
                            },
                            submitOnChange: false
                        });
                    }

                    var trp = new TimeRangePickerInput({
                        id: "timerange",
                        submitOnChange: true,
                        formManager: 'fieldset',
                        el: $trpEl
                    }).render();
                    trp.on("change", function() {
                        var newValue = trp.val();

                        var urlTokenModel = mvc.Components.get('url');
                        var submittedTokenModel = mvc.Components.get('submitted');
                        var defaultTokenModel = mvc.Components.get('default');
                        urlTokenModel.set('earliest', newValue.earliest_time);
                        urlTokenModel.set('latest', newValue.latest_time);
                        submittedTokenModel.set('earliest', newValue.earliest_time);
                        submittedTokenModel.set('latest', newValue.latest_time);
                        defaultTokenModel.set('earliest', newValue.earliest_time);
                        defaultTokenModel.set('latest', newValue.latest_time);
                    });

                    Dashboard.trigger('formupdate');
                },
                'click a.delete': function(e){
                    e.preventDefault();
                    var dialog = new TextDialog({id: "modal-delete-dashboard"});
                    dialog.settings.set("primaryButtonLabel",_("Delete").t());
                    dialog.settings.set("cancelButtonLabel",_("Cancel").t());
                    dialog.settings.set("titleLabel",_("Delete").t());
                    dialog.setText(splunkUtils.sprintf(_("Are you sure you want to delete %s?").t(), 
                        this.model.dashboard.entry.content.get('label')));
                    dialog.render().appendTo(document.body);

                    dialog.once('click:primaryButton', function(){
                        this.model.dashboard.destroy().done(function(){
                            var cur = utils.getPageInfo();
                            utils.redirect(route.page(cur.root, cur.locale, cur.app, 'dashboards'));
                        });
                    }, this);

                    dialog.show();
                },
                'click a.edit-title-desc': function(e){
                    e.preventDefault();

                    this.children.titleDialog = new TitleDialog({
                        model: this.model.state,
                        onHiddenRemove: true
                    });
                    $("body").append(this.children.titleDialog.render().el);
                    this.children.titleDialog.show();
                },
                'click a.edit-perms': function(e) {
                    e.preventDefault();
                    this.children.permissionsDialog = new PermissionsDialog({
                        model: {
                            document: this.model.dashboard, 
                            nameModel: this.model.dashboard.entry.content 
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

                    var dashboard = new DashboardModel();
                    dashboard.meta.set(this.model.dashboard.meta.toJSON());

                    var convertDialog = this.children.convertDialog = new ConvertDialog({
                        model: {
                            dashboard: dashboard, 
                            currentDashboard: this.model.dashboard,
                            application: this.model.application
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

                    var clone = new DashboardModel();
                    clone.setXML(this.model.dashboard.entry.content.get('eai:data'));
                    clone.meta.set(this.model.dashboard.meta.toJSON());

                    var cloneDialog  = this.children.cloneDialog = new CloneDialog({
                        model: {
                            dashboard: clone,
                            application: this.model.application
                        },
                        collection: {
                            roles: this.collection
                        },
                        onHiddenRemove: true
                    });
                    $("body").append(cloneDialog.render().el);
                    cloneDialog.show();
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
                    this.model.dashboard.saveFormSettings(isForm, !!trp, defaultValue);
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
                    canEditHtml: _.contains(this.model.state.user.getCapabilities(), 'edit_view_html'), 
                    removable: this.model.dashboard.entry.acl.get('removable'),
                    isSimpleXML: this.model.dashboard.isSimpleXML(),
                    isHTML: this.model.dashboard.isHTML(),
                    isPdfServiceAvailable: this.model.state.get('pdf_available'),
                    showAddTRP: !this.model.state.get('default_timerange'),
                    _: _
                };

                this.$el.html(this.compiledTemplate(renderModel));
                if(renderModel.canWrite) {
                    this.children.popdown = new PopdownView({ el: this.$el.find('.dashboard-view-controls') });
                }
                this.$('.generate-pdf').tooltip({ animation:false, title: _("Export PDF").t() });
                this.$('.print-dashboard').tooltip({ animation:false, title: _("Print").t() });
                this.onEditModeChange();
                return this;
            },
            template: '\
                <span class="dashboard-view-controls">\
                    <% if(canWrite) { %>\
                    <a class="dropdown-toggle btn " href="#"><%- _("Edit").t() %> <span class="caret"></span></a><div class="dropdown-menu dropdown-menu-narrow">\
                        <div class="arrow"></div>\
                        <% if (editable || (!isHTML || canEditHtml) || (isSimpleXML && canEditHtml)) { %>\
                        <ul class="first-group">\
                            <% if(editable) { %>\
                            <li><a href="#" class="edit-panels"><%- _("Edit Panels").t() %></a></li>\
                            <% } %>\
                            <% if (!isHTML || canEditHtml) { %>\
                            <li><a href="<%- editLinkViewMode %>"><%- _("Edit Source").t() %> <span class="dashboard-source-type"><%= dashboardType %></span></a></li>\
                            <% } %>\
                            <% if (isSimpleXML && canEditHtml) { %>\
                            <li><a href="#" class="convert-to-html"><%- _("Convert to HTML").t() %></a></li>\
                            <% } %>\
                        </ul>\
                        <% } %>\
                        <% if(isSimpleXML || canWrite) { %>\
                        <ul class="second-group">\
                            <% if(isSimpleXML && editable) { %>\
                            <li><a href="#" class="edit-title-desc"><%- _("Edit Title or Description").t() %></a></li>\
                            <% } %>\
                            <li><a href="#" class="edit-perms"><%- _("Edit Permissions").t() %></a></li>\
                            <% if(isSimpleXML && isPdfServiceAvailable) { %>\
                            <li><a class="schedule-pdf" href="#"><%- _("Schedule PDF Delivery").t() %></a></li>\
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
                    </div><% } %><div class="btn-group">\
                    <% if(isSimpleXML && isPdfServiceAvailable) { %>\
                        <a class="btn generate-pdf" href="#"><i class="icon-export"></i></a>\
                    <% } %>\
                        <a class="btn print-dashboard" href="#"><i class="icon-print"></i></a>\
                    </div>\
                    \
                </span>\
                <span class="dashboard-edit-controls" style="display:none;">\
                    <div class="btn-group">\
                        <a class="btn add-panel" href="#"><i class="icon-plus"></i> <%- _("Add Panel").t() %></a> \
                        <% if(showAddTRP) { %>\
                        <a class="btn add-trp" href="#"><i class="icon-clock"></i> <%- _("Add Time Range Picker").t() %></a> \
                        <% } %>\
                        <a class="btn edit-source" href="<%- editLinkEditMode %>"><i class="icon-code"></i> <%- _("Edit Source").t() %></a> \
                    </div><a class="btn btn-primary edit-done" href="#"><%- _("Done").t() %></a>\
                </span>\
            '
        });

    return BaseView.extend({
        className: "splunk-dashboard-controls",

        initialize: function() {
            BaseView.prototype.initialize.apply(this, arguments);
            this.rolesCollection = new Roles();
            this.rolesCollection.fetch();

            this.children.editMenu = new MenuView({
                model: {
                    state: this.model.state,
                    dashboard: this.model.dashboard,
                    application: this.model.application
                },
                collection: this.rolesCollection
            });
        },
        render: function(){
            this.$el.append(this.children.editMenu.render().el);
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
            var txt = _(this.model.get('description') || '').t(),
                edit = this.model.get('edit');
            this.$el.text(txt)[ txt && !edit ? 'show' : 'hide' ]();
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
                var fn = _.debounce(this.alignItemHeights.bind(this), 100);
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
            cells.css({ width: String(100 / cells.length) + '%' });
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
define('splunkjs/mvc/simplexml/dashboard',['require','../basesplunkview','backbone','../mvc','underscore','jquery','./controller','./editdashboard','./dragndrop','util/console','../simpleform/fieldsetview','./dashboard/title','./dashboard/description','./dashboard/row','./dashboard/panel'],function(require) {
    var BaseSplunkView = require('../basesplunkview');
    var Backbone = require('backbone');
    var mvc = require('../mvc');
    var _ = require('underscore');
    var $ = require('jquery');
    var Dashboard = require('./controller');
    var EditControls = require('./editdashboard');
    var DragnDropView = require('./dragndrop');
    var console = require('util/console');
    var FieldsetView = require('../simpleform/fieldsetview');

    var DashboardTitleView = require('./dashboard/title');
    var DashboardDescriptionView = require('./dashboard/description');
    var DashboardRowView = require('./dashboard/row');
    var DashboardPanel = require('./dashboard/panel');

    var DashboardView = BaseSplunkView.extend({
        initialize: function() {
            this.model = Dashboard.getStateModel();
            this.editControls = new EditControls({
                model: {
                    state: this.model,
                    dashboard: this.model.view,
                    application: this.model.app
                }
            });

            this.model.on('change:edit', this.onEditStateChange, this);
        },
        render: function() {
            this.editControls.render().appendTo(this.$('.edit-dashboard-menu'));
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
            this.editControls.render().appendTo(editEl);

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
            return Dashboard;
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
                Dashboard.onViewModelLoad(this.enterEditMode, this);
            } else {
                this.leaveEditMode();
            }
        },
        removeElement: function(id) {
            var cell = this.$('#' + id).parents('.dashboard-cell'), parentRow = cell.parents('.dashboard-row');
            cell.remove();
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
                                <div class="dashboard-panel">\
                                    <div class="dashboard-element" id="<%= id %>">\
                                        <div class="panel-head"><h3><%- title %></h3></div>\
                                        <div class="panel-body"></div>\
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
    var ResultTableView = require('../../tableview');
    var console = require('util/console');
    var Mapper = require('../mapper');
    var SplunkUtil = require('splunk.util');

    var TableMapper = Mapper.extend({
        tagName: 'table',
        map: function(report, result, options) {
            result.options.wrap = String(SplunkUtil.normalizeBoolean(report.get('display.statistics.wrap', options)));
            result.options.displayRowNumbers = String(SplunkUtil.normalizeBoolean(report.get('display.statistics.rowNumbers', options)));
            result.options.dataOverlayMode = report.get('display.statistics.overlay', options);
            result.options.drilldown = report.get('display.statistics.drilldown', options);

            result.options.labelField = null;
            result.options.valueField = null;

            result.tags = { fields: report.get('display.statistics.fields', options)  };

            if(result.options.drilldown === false) {
                delete result.options.drilldown;
            } else if(result.options.drilldown === true) {
                result.options.drilldown = 'row';
            }
        }
    });
    Mapper.register('statistics', TableMapper);

    var TableVisualization = ResultTableView.extend({
        prefix: 'display.statistics.',
        reportDefaults: {
            'display.general.type': 'statistics',
            'display.statistics.count' : 10,
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
        reportDefaults: {
            "display.visualizations.show": true,
            "display.visualizations.type": "charting",
            "display.general.type": "visualizations"
        },
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
            _(report.toJSON(options)).each(function(v, key){
                if(key.substring(0, eventsPrefix.length) === eventsPrefix) {
                    var value = report.get(key, options);
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
            'display.events.count' : 10
        },
        getResultsLinkOptions: function() {
            return {};
        }
    });
    DashboardElement.registerVisualization('events', EventsVisualization);
    //DashboardElement.registerVisualization('events:raw', EventsVisualization);
    //DashboardElement.registerVisualization('events:list', EventsVisualization);
    //DashboardElement.registerVisualization('events:table', EventsVisualization);

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

    Mapper.register('visualizations:singleValue', Mapper.extend({
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
        reportDefaults: {
            "display.visualizations.show": true,
            "display.visualizations.type": "singleValue",
            "display.general.type": "visualizations"
        },
        getResultsLinkOptions: function(options) {
            return { "link.visible": false };
        }
    });
    DashboardElement.registerVisualization('visualizations:singleValue', SingleViz);

    var SingleElement = DashboardElement.extend({
        initialVisualization: 'visualizations:singleValue'
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
        options: _.extend({}, SplunkMapView.prototype.options, {
            drilldown: true
        }),
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
            mvc.enableDynamicTokens(this.settings, utils.escapeFn('html'));
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
                $('<div class="panel-head"><h3><span class="untitled">&lt;HTML&gt;</span></h3></div>').prependTo(this.$el);
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
define('splunkjs/mvc/simplexml/urltokenmodel',['require','exports','module','../basetokenmodel','models/classicurl'],function(require, exports, module) {
    var BaseTokenModel = require('../basetokenmodel');
    var classicurl = require('models/classicurl');

    /**
     * Automatically mirrors the current URL query parameters.
     */
    var UrlTokenModel = BaseTokenModel.extend({
        moduleId: module.id,
        
        initialize: function() {
            var that = this;
            
            classicurl.on('change', function(model, options) {
                that.set(model.changed);
            });
            this.on('change', function(model, options) {
                classicurl.set(model.changed);
                classicurl.save();
            });
            
            this.set(classicurl.attributes);
        }
    });
    
    return UrlTokenModel;
});

define('splunkjs/mvc/postprocess',['require','exports','module','underscore','./mvc','./utils','./searchmanager','./basemanager','./searchmodel','./splunkresultsmodel','./settings'],function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('./mvc');
    var utils = require('./utils');
    var SearchManager = require('./searchmanager');
    var BaseManager = require('./basemanager');
    var SearchModels = require('./searchmodel');
    var SplunkResultsModel = require('./splunkresultsmodel');
    var Settings = require('./settings');

    function mergeSearch(base, sub) {
        if(!sub) {
            return base;
        }
        return [ base.replace(/[\|\s]$/g,''), sub.replace(/^[\|\s]/g,'') ].join(' | ');
    }

    var PostProcessResultsModel = SplunkResultsModel.extend({
        _requestOptions: function(){
            var options = SplunkResultsModel.prototype._requestOptions.call(this);
            var manager = this.get('manager');
            
            var postProcessSearch = manager.query.postProcessResolve();
            if(postProcessSearch) {
                options.search = mergeSearch(postProcessSearch, options.search);
            }
            return options;
        }
    });
    
    var PostProcessSearchQueryModel = SearchModels.SearchQuery.extend({
        resolve: function() {
            var parentSearch = this._manager.parent.query.resolve();
            var thisSearch = SearchModels.SearchQuery.prototype.resolve.apply(this, arguments);
            return mergeSearch(parentSearch, thisSearch);
        },
        
        postProcessResolve: function() {
            return SearchModels.SearchQuery.prototype.resolve.apply(this, arguments);
        }
    });

    var PostProcessSearchManager = BaseManager.extend({
        moduleId: module.id,
        
        isPostProcess: true,
        initialize: function(attrs, options) {
            this.set(options||{});
            mvc.Components.bind('change:'+attrs.manager, this.onManagerChange, this);
            if(mvc.Components.has(attrs.manager)) {
                this.onManagerChange(mvc.Components, mvc.Components.get(attrs.manager));
            }

            // Drilldown calls manager.query.resolve to get the base search, so we artificially add this here
            this.query = new PostProcessSearchQueryModel({search: this.get('postProcess')}, options);
            this.query._manager = this;
            
            this.query.on('change', function(){
                this.trigger('change:data', this, this.job && this.job.properties());
            }, this);
        },
        onManagerChange: function(x, ctx) {
            if(this.parent) {
                this.parent.off(null, null, this);
                delete this.job;
            }
            this.parent = ctx;
            this.search = this.parent.search;
            ctx.on('search:start', this.onSearchStart, this);
            ctx.on('all', this.trigger, this);
        },
        get: function(k) {
            if(this.parent && this.parent.has(k)) {
                return this.parent.get(k);
            }
            return BaseManager.prototype.get.apply(this, arguments);
        },
        onSearchStart: function(job) {
            this.job = job;
        },
        data: function(source, args) {
            args = _.defaults({ manager: this, source: source }, args);
            return new PostProcessResultsModel(args);
        },
        replayLastSearchEvent: function() {
            if (this.parent) {
                this.parent.replayLastSearchEvent.apply(this.parent, arguments);
            }
        }
    });

    return PostProcessSearchManager;
});
define('splunkjs/mvc/simpleform/input/submit',['require','underscore','jquery','../../basesplunkview','../formtokens','../../mvc'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            BaseSplunkView = require('../../basesplunkview'),
            FormTokens = require('../formtokens'),
            mvc = require('../../mvc');

    var Submit = BaseSplunkView.extend({
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
            mvc.enableDynamicTokens(this.settings);
            this.settings.on('change', this.render, this);
            this.bindToComponent(this.options.formManager, this.onFormManagerChange, this);
        },
        onFormManagerChange: function(ctx, model) {
            if(this.formModel) {
                this.formModel.off(null, null, this);
            }
            this.formModel = model;
        },
        onButtonClick: function() {
            // Submit form tokens
            // TODO: Remove this logic. (SPL-67733)
            if(this.formModel) {
                this.formModel.submit(this.options.submitType);
            }
            
            // Submit MVC tokens
            FormTokens.submit();
            
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
    
    return Submit;
});
define('splunkjs/mvc/simpleform/input/text',['require','underscore','jquery','./base','../../textboxview'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInput = require('./base');
    var TextBoxView = require('../../textboxview');

    var TextInput = BaseInput.extend({
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.textbox = new TextBoxView(inputOptions);
            this.textbox.on('change', this.handleChange, this);
            BaseInput.prototype.initialize.call(this);
            
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
                this.sendSoftSubmit();
            }
        }
    });
    
    return TextInput;
});
define('splunkjs/mvc/simpleform/input/dropdown',['require','underscore','jquery','./base','../../selectview'],function(require) {
    var _ = require('underscore');
    var $ = require('jquery');
    var BaseInput = require('./base');
    var SelectView = require('../../selectview');

    var Dropdown = BaseInput.extend({
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.select = new SelectView(inputOptions);
            this.select.on('change', this.handleChange, this);
            BaseInput.prototype.initialize.call(this);
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
    
    return Dropdown;
});

define('splunkjs/mvc/simpleform/input/radio',['require','underscore','jquery','./base','../../radiogroupview'],function(require) {
    var _ = require('underscore'),
            $ = require('jquery'),
            BaseInput = require('./base'),
            RadioGroupView = require('../../radiogroupview');

    var Radio = BaseInput.extend({
        events: {
            'change input': 'handleChange'
        },
        initialize: function() {
            var inputOptions = _.defaults({
                el: $('<div class="splunk-view"></div>').appendTo(this.el),
                id: _.uniqueId(this.id + '-input')
            }, this.options);
            this.radiogroup = new RadioGroupView(inputOptions);
            BaseInput.prototype.initialize.call(this);
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
    
    return Radio;
});

define('splunkjs/mvc/simpleform/input',['require','./input/submit','./input/text','./input/dropdown','./input/radio','./input/timerange'],function(require) {

    return {
        Submit: require('./input/submit'),
        Text: require('./input/text'),
        Dropdown: require('./input/dropdown'),
        Radio: require('./input/radio'),
        TimeRangePicker: require('./input/timerange')
    };

});
define('splunkjs/mvc/simplexml',['require','./simplexml/controller','./simplexml/dashboard','./simplexml/element/table','./simplexml/element/chart','./simplexml/element/event','./simplexml/element/single','./simplexml/element/map','./simplexml/element/list','./simplexml/element/html','./simplexml/urltokenmodel','./searchmanager','./savedsearchmanager','./searchtemplate','./postprocess','./drilldown','./headerview','./footerview','./simpleform/formmanager','./simpleform/formtokens','./simpleform/input','./simpleform/input/submit','./simpleform/input/text','./simpleform/input/dropdown','./simpleform/input/radio','./simpleform/input/timerange','./utils'],function(require){

    require("./simplexml/controller");
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
    require("./searchtemplate");
    require("./postprocess");
    require("./drilldown");
    require("./headerview");
    require("./footerview");
    require("./simpleform/formmanager");
    require("./simpleform/formtokens");
    require("./simpleform/input");
    require('./simpleform/input/submit');
    require('./simpleform/input/text');
    require('./simpleform/input/dropdown');
    require('./simpleform/input/radio');
    require('./simpleform/input/timerange');
    require("./utils");

});