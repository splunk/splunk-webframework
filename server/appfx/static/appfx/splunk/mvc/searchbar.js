define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require('splunkjs.mvc');
    var BaseControl = require("./basecontrol");
    var Timepicker = require('./timepicker');
    
    KEYCODES = {
        ENTER : 13,
        UP_ARROW: 38,
        DOWN_ARROW: 40,
        LEFT_ARROW: 37,
        RIGHT_ARROW: 39,
        PAGE_DOWN: 34,
        PAGE_UP: 33,
        SPACE_BAR: 32,
        TAB: 9,
        ESCAPE: 27
    };
    
    var SearchBar = BaseControl.extend(
        // Instance
        {
            className: "appfx-searchbar",

            events: {
                "submit": "onSearchSubmit",
                "keydown .search-input textarea": "keyDown"
            },
            
            options: {
                contextid: null,
                timepicker: false
            },
            
            initialize: function() {
                this.configure();
                this.settings.on("change:timepicker", this.render, this);
                
                this.bindToComponent(this.settings.get("contextid"), this.onContextChange, this);
            },
            
            onContextChange: function(contexts, context) {
                this.context = context;
                this._updateQuery();
            },
            
            _updateQuery: function() {
                // If we have a previous search query set, display it
                if (this.context) {
                    var currentSearch = (this.$(".search-input textarea").val() || "").trim();
                    var newSearch = (this.context.query.resolve() || "").trim();
                    
                    if (!currentSearch && newSearch) {
                        newSearch = newSearch.replace(/^search\s/, '');
                        this.$(".search-input textarea").val(newSearch);
                    }
                }
            },
            
            render: function() {
                var includeTimePicker = this.settings.get("timepicker");

                this.$el.html(_.template(SearchBar.template, {
                    includeTimePicker: true
                }));
                
                if (includeTimePicker) {
                    var timepicker = new Timepicker({
                        el: this.$("td.search-timerange"),
                        contextid: this.settings.get("contextid")
                    });
                    timepicker.render();
                }
                
                this._updateQuery();
                
                return this;
            },
            
            keyDown: function(e) {
                // If there is a shift press, just return true
                if (e.shiftKey) { 
                    return true;
                }
                
                if (e.keyCode === KEYCODES.ENTER) {
                    this.submitSearch();
                    return false;
                }
            },
            
            onSearchSubmit: function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                this.submitSearch();
            },
            
            submitSearch: function() {
                // TODO: We need a browser-safe way to do trim
                var searchText = this.$("td.search-input textarea").val().trim();
                
                if (!searchText) {
                    return;
                }
                
                if (searchText[0] !== '|') {
                    searchText = "search " + searchText;
                }
                
                // We first unset, then set, to ensure that a changed
                // event will be fired regardless of whether the search
                // string is the same
                this.context.query.unset("search", {silent: true});
                this.context.query.set("search", searchText);
            }
        },
        // Class
        {
            template:' \
<div class="search-bar-wrapper"> \
    <form method="" action="" class="search-form do-nothing"> \
        <table class="search-bar"> \
            <tbody> \
                <tr> \
                    <td class="search-input"> \
                        <div class="inner"> \
                            <textarea name="q" spellcheck="false"></textarea> \
                        </div> \
                    </td> \
                    <% if (includeTimePicker) { %> \
                    <td class="search-timerange"></td> \
                    <% } %> \
                    <td class="search-button"> \
                        <button type="submit" value="search" class="btn btn-primary">Search</button> \
                    </td> \
                </tr> \
            </tbody> \
        </table> \
    </form> \
</div>'
        }
    );

    splunkjs.mvc.Components.registerType('appfx-searchbar', SearchBar);
    
    return SearchBar;
});
