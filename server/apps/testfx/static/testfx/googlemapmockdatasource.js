// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var MockDataSource = require('testfx/mockdatasource');

    
    var GoogleMapMockDataSource = MockDataSource.extend({
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
         "text":"Successfully read lookup file '/Applications/splunk/etc/apps/search/lookups/testdata.csv'."
      },
      {
         "type":"DEBUG",
         "text":"search context: user=\"admin\", app=\"search\", bs-pathname=\"/Applications/splunk/etc\""
      }
   ],
   "fields":[
      "_time",
      "artist_id",
      "artist_name",
      "bc_uri",
      "bytes",
      "clientip",
      "closed_txn",
      "device_ip_city",
      "device_ip_country_code",
      "device_ip_country_name",
      "device_ip_postal_code",
      "device_ip_region_name",
      "duration",
      "eventcount",
      "eventtype",
      "field_match_sum",
      "geo_info",
      "lat",
      "linecount",
      "lng",
      "mdn",
      "sourcetype",
      "status",
      "timeTaken",
      "track_id",
      "track_name"
   ],
   "rows":[
      [
         "2013-01-23 15:59:19.445 PST",
         null,
         "Snoop Dogg",
         "/sync/addtolibrary/01011207201000005652000000000017",
         "2531",
         "108.106.227.179",
         "1",
         "Arcadia",
         "US",
         "United States",
         null,
         "CA",
         "0.094658",
         "3",
         "ua-mobile-android",
         "3",
         "Arcadia, United States",
         "34.139700000000005",
         "3",
         "-118.0353",
         "5558935490",
         "access_custom radius",
         "200",
         "239",
         "01011207201000005652000000000017",
         "Young Wild & Free"
      ],
      [
         "2013-01-23 15:59:01.357 PST",
         null,
         "Cobra Starship",
         "/sync/addtolibrary/01011207201000005652000000000026",
         "3678",
         "10.174.58.87",
         "1",
         "Arcadia",
         "US",
         "United States",
         null,
         "CA",
         "0.129028",
         "3",
         "ua-mobile-iphone",
         "3",
         "Arcadia, United States",
         "34.139700000000005",
         "3",
         "-118.0353",
         "5555022781",
         "access_custom radius",
         "200",
         "537",
         "01011207201000005652000000000026",
         "You Make Me Feel"
      ],
      [
         "2013-01-23 15:58:58.337 PST",
         null,
         "Flo Rida",
         "/sync/addtolibrary/01011207201000005652000000000018",
         "2523",
         "10.185.148.20",
         "1",
         "Austin",
         "US",
         "United States",
         null,
         "TX",
         "0.140092",
         "3",
         "ua-mobile-ipad ua-mobile-iphone",
         "3",
         "Austin, United States",
         "30.267200000000003",
         "3",
         "-97.7431",
         "5557065509",
         "access_custom radius",
         "200",
         "350",
         "01011207201000005652000000000018",
         "Good Feeling"
      ],
      [
         "2013-01-23 15:58:57.337 PST",
         null,
         "J.Cole",
         "/sync/addtolibrary/01011207201000005652000000000011",
         "2562",
         "10.148.17.16",
         "1",
         "Tilton",
         "US",
         "United States",
         "03276",
         "NH",
         "0.171962",
         "3",
         "ua-mobile-android",
         "3",
         "Tilton, United States",
         "43.43289999999999",
         "3",
         "-71.5682",
         "5554278541",
         "access_custom radius",
         "200",
         "622",
         "01011207201000005652000000000011",
         "Work Out"
      ]
   ]
}


    return GoogleMapMockDataSource;
});
