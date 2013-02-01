// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var BaseModel = require('appfx/splunkui/basemodel')
    
    var SearchQueryModel = BaseModel.extend({
        resolve: function(args) {
            args = args || {};
            
            var args = _.extend(this.toJSON(), args);
            var search = this.get("search");
            
            _.each(args, function(value, key) {
                if (key === "search") return;
                
                var finalValue = value;
                if (_.isFunction(value)) {
                    finalValue = value();
                }
                
                var regex = new RegExp("\\$" + key + "\\$", "g");
                search = search.replace(regex, finalValue);
            });
            
            return search;
        }
    });

    var SearchJobModel = BaseModel.extend({});

    SearchQueryModel.ALLOWED_ATTRIBUTES = ["search"]
    SearchJobModel.ALLOWED_ATTRIBUTES = [
        "auto_cancel",
        "auto_finalize_ec",
        "auto_pause",
        "earliest_time",
        "enable_lookups",
        "exec_mode",
        "force_bundle_replication",
        "id",
        "latest_time",
        "max_count",
        "max_time",
        "namespace",
        "now",
        "reduce_freq",
        "reload_macros",
        "remote_server_list",
        "required_field_list",
        "rf",
        "rt_blocking",
        "rt_indexfilter",
        "rt_maxblocksecs",
        "rt_queue_size",
        "search_listener",
        "search_mode",
        "spawn_process",
        "status_buckets",
        "sync_bundle_replication",
        "time_format",
        "timeout",
        "adhoc_search_level",
        "label",
        "preview"
    ];
    
    return {
        SearchJob: SearchJobModel,
        SearchQuery: SearchQueryModel   
    };
});
