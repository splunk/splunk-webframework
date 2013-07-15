// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var MockDataSource = require('testfx/mockdatasource');

    
    var ResultTableMockDataSource = MockDataSource.extend({
        mockData: function() {            
            return DATA;
        },        
    });

    var DATA = {
   "preview":false,
   "init_offset":0,
   "messages":[
      {
         "type":"DEBUG",
         "text":"Disabling timeline and fields picker for reporting search due to adhoc_search_level=smart"
      },
      {
         "type":"DEBUG",
         "text":"base lispy: [ AND addtolibrary* index::oidemo sourcetype::access_custom sync ]"
      },
      {
         "type":"DEBUG",
         "text":"search context: user=\"admin\", app=\"keynote\", bs-pathname=\"/splmnt/apps/splunk-5.0.1-143156/etc\""
      }
   ],
   "fields":[
      "_time",
      "artist_name",
      "track_name"
   ],
   "rows":[
      [
         "2013-04-07T23:25:19.616+00:00",
         "Toby Keith",
         "Red Solo Cup"
      ],
      [
         "2013-04-07T23:25:11.629+00:00",
         "Luke Bryan",
         "I Don't Want This Night To End"
      ],
      [
         "2013-04-07T23:25:05.524+00:00",
         "Kelly Clarkson",
         "Mr. Know It All"
      ],
      [
         "2013-04-07T23:24:52.549+00:00",
         "Flo Rida",
         "Good Feeling"
      ],
      [
         "2013-04-07T23:24:50.574+00:00",
         "Cobra Starship",
         "You Make Me Feel"
      ],
      [
         "2013-04-07T23:24:44.532+00:00",
         "Toby Keith",
         "Red Solo Cup"
      ],
      [
         "2013-04-07T23:24:44.519+00:00",
         "Bruno Mars",
         "It Will Rain"
      ],
      [
         "2013-04-07T23:24:44.516+00:00",
         "Bruno Mars",
         "It Will Rain"
      ],
      [
         "2013-04-07T23:24:44.500+00:00",
         "Kelly Clarkson",
         "Mr. Know It All"
      ]
   ]
};

    return ResultTableMockDataSource;
});
