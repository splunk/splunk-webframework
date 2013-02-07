// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var Backbone = require('backbone');

    var Settings = Backbone.Model.extend({
        sync: function() { return false; }
    });
    
    return Settings;
});
