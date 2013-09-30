# Splunk Application Framework Changelog

## Version 1.0

### Bugs

- Various cross-browser bugs where fixed with tokens, as regex implementations
differ.

- Charts will no longer momentarily render old data when the search it is bound
to changes.

- `TokenAwareModel` now fully supports setting values with `{silent: true}`.

- Improved messaging behavior (e.g. "waiting...") across all the views.

- DropdownView now supports having a choice with a value of `""` (i.e. the empty string).

### Breaking

- All views which have a `change` event now have a consistent signature:    

    ```
    myView.on("change", function(value, input, options) { ... });
    ```

- A token can now include essentially any character, including spaces. For example,
`$abc # def$` is a valid token. To escape the literal `$`, you can use `$$`.

- The semantics of what happens when the default value changes after initialization
has changed:
    1. If the current value is undefined, it will be changed to the new default value.
    2. If the current value is equal to the old default value, it will be changed to the new default value.
    3. In all other cases, the value will not be changed.
    
- Drilldown behavior is now normalized across TableView, EventsViewerView, ChartView and SplunkMapView:
    1. These views will redirect to the search page by default.
    2. The drilldown event is now `click` rather than `drilldown` (some views, like TableView and ChartView, 
    have specific events like `click:row` and `click:legend` as well).
    3. The function signature for the `click` event is:
    
        ```
            myTable.on('click', function(e) {
                // e.preventDefault();
                // e.drilldown();
            });
        ```
        
        - `e.preventDefault()` will stop the view from redirecting.
        - `e.drilldown()` will do the default drilldown action at any point.
        
    4. These views have a `drilldownRedirect=true|false` property, which will
    keep drilldown enabled (i.e. events will still be triggered), but will not 
    cause redirects.

- The various Form Input Views were renamed. The old names are there to avoid
breaking existing code. The new names are (view name/filename):
    * `SelectView`/`splunkjs/mvc/selectview` -> `DropdownView`/`splunkjs/mvc/dropdownview`
    * `MultiSelectView`/`splunkjs/mvc/multiselectview` -> `MultiDropdownView`/`splunkjs/mvc/multidropdownview`
    * `TextBoxView`/`splunkjs/mvc/textboxview` -> `TextInputView`/`splunkjs/mvc/textinputview`
    * `TimePickerView`/`splunkjs/mvc/timepickerview` -> `TimeRangeView`/`splunkjs/mvc/timerangeview`
    
- In addition to the above rename, the SearchBarView now takes time range related
values using `timerange_` rather than `timepicker_`:

    ```
    new SearchBarView({timerange_earliest_time: "-1d", ...});
    ```
    
- Previously, if you set a token to a simple object:

    ```
    var myView = new MyView({id: "foo", value: mvc.tokenSafe("$bar$")});
    myView.settings.set('value', {a:1, b:2});
    ```

    Then you would be able to access tokens `bar.a` and `bar.b`. This functionality
    has been removed as it had too many limitations.
    
- `splunkjs/mvc/postprocess` has been renamed to `splunkjs/mvc/postprocessmanager`.

### Changes
    
- The styling for DropdownView has been improved to match Splunk's styling.

- PostProcessManager has been completely revamped, and now behaves more like
a regular search manager. All changes are backwards compatible though.

- Performance improvement with many searches running on a page: all search
tracking is now coalesced into a single request, which significantly reduces
the XHR chatter. This has no user-visible impact, except performance.

- SearchManager.get/.set calls are now symmetric. For example, `myManager.get('search') 
and `myManager.set('search') will now do the same thing.

- The TimelineView now supports getting and setting values using the `myTimeline.val(...)` pattern:

    ```
    var currentSelection = myTimeline.val(); // get
    myTimeline.val({earliest_time: 1380565955, latest_time: 1380561955});
    ```
    
- The SavedSearchManager will now respect dispatchable properties:

    ```
    myManager.search.set('status_buckets', 300);
    ```
    
- The TableView now supports different kinds of values for the `fields` property:
    1. An actual array: `myTable.settings.set("fields", ["field1", "field2", "fields with spaces"]);`
    2. A comma/space separated string: `myTable.settings.set("fields", 'field1, field2, "fields with spaces"');`
    3. A JSON-encoded array: `myTable.settings.set("fields", '["field1", "field2", "fields with spaces"]');`

- SearchManagers will now cancel running searches on page unload. This can be 
disabled by passing `cancelOnUnload=False`. Complete searches and search managers
with `cache!=False` will not be cancelled.

- SearchManagers will now coalesce search changes into a single call to the server,
which will happen once per event loop. So, for example, a SearchManager with `autostart=True`
will only call once to the server for the following sequence of calls:

    ```
    myManager.set('search', ...);
    myManager.search.set('status_buckets', 300);
    myManager.search.set('rf', '*');
    ```

- TableView has a BaseCellRenderer property, which you can use to create
custom cell renderers:
        
        var ICONS = {
            severe: "alert-circle",
            elevated: 'alert',
            low: 'check-circle'
        };

        var CustomIconCellRenderer = TableView.BaseCellRenderer.extend({
            canRender: function(cell) {
                return cell.field === 'range';
            },
            
            render: function($td, cell) {
                var icon = 'question';
                if(ICONS.hasOwnProperty(cell.value)) {
                    icon = ICONS[cell.value];
                }
                $td.addClass('icon').html(_.template('<i class="icon-<%-icon%> <%- range %>" title="<%- range %>"></i>', {
                    icon: icon,
                    range: cell.value
                }));
            }
        });
        
    
- Components which inherit from `BaseSplunkView` or `SimpleSplunkView` have the
option to use `bindToComponentSetting`. This function allows you to easily bind
to the setting itself, rather than a specific value. The most common usage is the
following:

    ```
    this.bindToComponentSetting('managerid', this._onManagerChange, this);
    ```

- SavedSearchManager's `cache` property can now take a value of `scheduled`. This
value will only use previously run searches which were scheduled by Splunk.

- TimeRangeView has two special derivative tokens, `earliest_time` and `latest_time`:

    ```
    new TimeRangeView({"value": mvc.tokenSafe("$mytoken$")});
    ```
    
    While `$mytoken$` will have store an object, `$mytoken.earliest_time$` and `$mytoken.latest_time$`
    will store the individual values.

- You can now escape strings for token-like reference using `mvc.tokenEscape`:

    ```
    mvc.tokenEscape("I got $20 in my pocket, you have no $ in yours");
    ```
    
- When you `.remove()` a view, it is now removed from the registry as well.

- SavedSearchManager now properly respects app/user scope when finding saved
searches.

- The `SimpleSplunkView` base class has been made more consistent:
    1. The `onDataChanged` method is now `formatResults`.
    2. The `return_count` property is now `returnCount`.
    3. The `output_mode` property is now `outputMode`.
    4. The 'render' method can now be called multiple times, so it is appropriate
    to use it for event bindings:
        
        ```
        this.settings.on("change:someProperty", this.render, this);
        ```
        
    5. You can now set custom attributes to your SimpleSplunkView subclass, such
    that when your class fetches data from the server, it will use those properties.
    For example, to set the `output_time_format` property such that we get
    data in milliseconds, we would do:
    
            SimpleSplunkView.extend({
                ...
            
                resultOptions: { output_time_format: "%s.%Q" },
                
                ...
                
            }

## Version 0.8 Beta

### Breaking changes

* In JavaScript, the `name` property is now called `id`.

* The **PasswordBox** view has been removed. Instead, use the **TextBox** view 
with the `type=password` property.

* The **EventTable** view has been replaced with the **EventsViewer** view:

    * Use the `{% eventsviewer %}` template tag.
  
    * Use `"splunkjs/mvc/eventsviewer"` in JavaScript. 
 
* The **Radio** view is now called **RadioGroup** view:

    * Use the `{% radiogroup %}` template tag.
  
    * Use `"splunkjs/mvc/radiogroupview"` in JavaScript.

* Using minified/unminified files is now specified in the config file. 

* The undocumented support for `dashboard/simplexml` has been removed. 



### New features and APIs

* Apps are now created in **/$SPLUNK_HOME/etc/apps/** by default. 

* The structure for new apps has changed to match standard Splunk apps.

* Inputs are now handled properly:

    * Proper default value semantics.

    * Proper semantics for value sets and gets.  

* Tokens are now namespaced. 

* Changes have been made to the **Select** view: 

    * An unchosen state is allowed. 

    * Selections can be cleared. 

* The **MultiSelect** view has been added: 

    * Use the `{% multiselect %}` template tag.

    * Use `"splunkjs/mvc/multiselectview"` in JavaScript.

* All views now have a `disabled` property, allowing the view to be enabled or 
disabled.

* Debugging information is now available for template pages.

* The `splunkdj` command-line interface (CLI) has been improved: 

    * The `package` and `install` commands have been added. 

    * The `createapp`, `removeapp`, `package`, and `install` commands do not 
    require you to run `setup` first .

* You can now replace a component in the registry rather than having to use 
`revoke` and `register` commands.

* Two variables have been added to all Django templates:

    * `SPLUNKWEB_URL`
        
    * `SPLUNKWEB_STATIC_URL`

* The following default routes have been added to apps:

    * **/dj/*app_name*/flashtimeline**: Redirects to 
    **/*locale*/app/*app_name*/flashtimeline** in Splunk Web. 
    
    * **/dj/*app_name*/search**: Redirects to 
    **/*locale*/app/*app_name*/search** in Splunk Web.

    * **/dj/*app_name*/*page_name***: Renders the template with the name 
    *page_name*.html.
    
  These routes can be overridden and are only used when no other match is found. 

* Django will now retain the locale in its URL. However, it will not automatically
cause locale-awareness of JavaScript code.

## Version 0.1 Preview

Initial release of the preview of the new Splunk Application Framework.
