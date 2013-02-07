// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var ns = require('splunk.mvc');
    var Backbone = require('backbone');
    
    var BaseContext = Backbone.Model.extend({
        start: function() {}
    });

    ns.Components.registerType('appfx-basecontext', BaseContext);
    
    return BaseContext;
});
