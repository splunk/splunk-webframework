// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var mvc = require('splunkjs.mvc');
    var BaseControl = require("./basecontrol");
    var _ = require("underscore");

    var DEFAULT_PAGE = 0;
    var DEFAULT_PAGE_SIZE = 10;
    
    require("css!./paginator.css");

    var Paginator = BaseControl.extend({
        className: "appfx-paginator",

        events: {
            "click a[data-page]": "onPageClick"
        },

        options: {
            itemCount: -1,
            page: DEFAULT_PAGE,
            pageSize: DEFAULT_PAGE_SIZE
        },

        initialize: function() {
            this.configure();
            this.settings.on(
                "change:page change:pageSize change:itemCount", 
                _.debounce(this.render), this);
        },

        hide: function() {
            this.$el.css("display", "none");
        },
        
        render: function(content) {
            this.$el.empty();

            var pageSize = this.settings.get("pageSize");
            var itemCount = this.settings.get("itemCount");

            if (itemCount <= pageSize)  {
                return;
            }

            var page = this.settings.get("page");

            var pageCount = Math.ceil(itemCount / pageSize);
            var windowSize = Math.min(10, pageCount);

            var page0, pageN;

            // First guess at start page based on assumption current page 
            // is centered in window, then calculate end page and clip if
            // needed, then adjust start page if needed so we show a full
            // window.

            page0 = Math.max(0, page - windowSize/2);
            pageN = Math.min(pageCount, page0 + windowSize) - 1;
            page0 = Math.max(0, pageN - windowSize + 1);

            // assert (pageN-page0) <= windowSize
            // assert page0 <= page <= pageN

            var link = function(num) {
                return "<a href='#' data-page='" + num + "'/>";
            };
            var disabled = "<span class='disabled'/>";
            var selected = "<span class='selected'/>";

            var list = this.$el;
            var item = $(page == 0 ? disabled : link("prev"), list);
            item.html("&laquo; prev").appendTo(list);
            for (var i = page0; i <= pageN; ++i) {
                item = $(i == page ? selected : link(i));
                item.text(i + 1).appendTo(list);
            }
            item = $(page == pageN ? disabled : link("next"), list);
            item.html("next &raquo;").appendTo(list);

            return this;
        },

        show: function() {
            this.$el.css("display", "");
        },
        
        onPageClick: function(e) {
            e.stopPropagation();
            e.preventDefault();

            var dataPage = $(e.currentTarget).attr("data-page");

            var page = this.settings.get("page");
            switch (dataPage) {
            case "prev":
                page -= 1;
                break;
            case "next":
                page += 1;
                break;
            default:
                page = parseInt(dataPage);
                break;
            }

            this.settings.set({page: page});
        },
    });
    
    splunkjs.mvc.Components.registerType('appfx-paginator', Paginator);
    
    return Paginator;
});
