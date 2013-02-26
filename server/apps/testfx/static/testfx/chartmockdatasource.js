// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require('underscore');
    var Backbone = require('backbone');
    var MockDataSource = require('testfx/mockdatasource');

    
    var ChartMockDataSource = MockDataSource.extend({
        mockData: function() {            
            return DATA;
        },        
    });

    var DATA = {"preview":false,"init_offset":0,"messages":[{"type":"DEBUG","text":"Successfully read lookup file '/Applications/splunk/etc/apps/search/lookups/testdata.csv'."},{"type":"DEBUG","text":"search context: user=\"admin\", app=\"search\", bs-pathname=\"/Applications/splunk/etc\""}],"fields":["_time","artist_id","artist_name","bc_uri","bytes","clientip","closed_txn","device_ip_city","device_ip_country_code","device_ip_country_name","device_ip_latitude","device_ip_longitude","device_ip_postal_code","device_ip_region_name","duration","eventcount","eventtype","field_match_sum","geo_info","linecount","mdn","sourcetype","status","timeTaken","track_id","track_name"],"columns":[["2013-01-23 15:59:19.445 PST","2013-01-23 15:59:01.357 PST","2013-01-23 15:58:58.337 PST","2013-01-23 15:58:57.337 PST"],[null,null,null,null],["Snoop Dogg","Cobra Starship","Flo Rida","J.Cole"],["/sync/addtolibrary/01011207201000005652000000000017","/sync/addtolibrary/01011207201000005652000000000026","/sync/addtolibrary/01011207201000005652000000000018","/sync/addtolibrary/01011207201000005652000000000011"],["2531","3678","2523","2562"],["108.106.227.179","10.174.58.87","10.185.148.20","10.148.17.16"],["1","1","1","1"],["Arcadia","Arcadia","Austin","Tilton"],["US","US","US","US"],["United States","United States","United States","United States"],["34.139700000000005","34.139700000000005","30.267200000000003","43.43289999999999"],["-118.0353","-118.0353","-97.7431","-71.5682"],[null,null,null,"03276"],["CA","CA","TX","NH"],["0.094658","0.129028","0.140092","0.171962"],["3","3","3","3"],["ua-mobile-android","ua-mobile-iphone","ua-mobile-ipad ua-mobile-iphone","ua-mobile-android"],["3","3","3","3"],["Arcadia, United States","Arcadia, United States","Austin, United States","Tilton, United States"],["3","3","3","3"],["5558935490","5555022781","5557065509","5554278541"],["access_custom radius","access_custom radius","access_custom radius","access_custom radius"],["200","200","200","200"],["239","537","350","622"],["01011207201000005652000000000017","01011207201000005652000000000026","01011207201000005652000000000018","01011207201000005652000000000011"],["Young Wild & Free","You Make Me Feel","Good Feeling","Work Out"]]};


    return ChartMockDataSource;
});
