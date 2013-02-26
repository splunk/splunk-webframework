// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var MockDataSource = require('testfx/mockdatasource');

    var DATA = {"preview":false,"init_offset":0,"messages":[{"type":"DEBUG","text":"Successfully read lookup file"},{"type":"DEBUG","text":"search context:"}],"fields":["count"],"rows":[["4"]]};

    var SingleMockDataSource = MockDataSource.extend({
        mockData: function() {            
            return DATA;
        },        
    });
    
    return SingleMockDataSource;
});
