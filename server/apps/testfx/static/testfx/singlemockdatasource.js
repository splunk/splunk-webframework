// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var MockDataSource = require('testfx/mockdatasource');

    var DATA = {"preview":false,"init_offset":0,"messages":[{"type":"DEBUG","text":"base lispy: [ AND index::_internal ]"},{"type":"DEBUG","text":"search context: user=\"admin\", app=\"search\", bs-pathname=\"/Users/ineeman/opt/splunk/dgseattle/etc\""}],"fields":["count", "other"],"columns":[["3243"], ["4"]]}

    var SingleMockDataSource = MockDataSource.extend({
        mockData: function() {            
            return DATA;
        },        
    });
    
    return SingleMockDataSource;
});
