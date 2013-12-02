# Splunk Web Framework Changelog

## Version 1.0
This is the first GA release of the Splunk Web Framework (formerly called "The
new Splunk Application Framework").

### Breaking changes

* Several APIs have been renamed. 

    - These components (name and path) have been renamed as follows:

        * **DropdownView**, `'splunkjs, mvc, dropdownview'` 

          Used to be: SelectView, `'splunkjs, mvc, selectview'`

        * **MultiDropdownView**, `'splunkjs, mvc, multidropdownview'` 

          Used to be: MultiSelectView , `'splunkjs, mvc, multiselectview'`

        * **TextInputView**, `'splunkjs, mvc, textinputview'` 

          Used to be: TextBoxView, `'splunkjs, mvc, textboxview'`

        * **TimeRangeView**, `'splunkjs, mvc, timerangeview'` 

          Used to be: TimePickerView, `'splunkjs, mvc, timepickerview'`

        * **PostProcessManager**, `'splunkjs, mvc, postprocessmanager'` 

          Used to be: PostProcess, `'splunkjs, mvc, postprocess'`


        Note that these names have been deprecated but are supported
        for backwards compatibility. 

    - The timerange-related properties of SearchBarView have been renamed
       to reflect the scheme above: `timepicker_*` has been changed
       to `timerange_*`. For example:

        ```
        new SearchBarView({timerange_earliest_time: "-1d", ...});
        ```
   
* The ability to set tokens to simple objects has been removed due to the number 
    of limitations. 

* All views that have a `change` event now have the following signature:    

    ```
    myView.on("change", function(value, input, options) { ... });
    ```

* The semantics have changed for what happens when the default value of an 
  input view (TextInputView, DropdownView, CheckboxView, RadioGroupView, 
  SearchBarView, or TimeRangeView) changes after initialization, as follows: 

    - If the current value is undefined, it will be changed to the new default 
         value.

    - If the current value is equal to the old default value, it will be changed
        to the new default value.

    - In all other cases, the value will not be changed.


### Bug fixes

* Various cross-browser bugs have been fixed when using tokens. 

* ChartView no longer momentarily renders old data when the search it is bound
    to changes.


### New features and changes

* New apps you create using `splunkdj createapp` are now created under 
    **/$SPLUNK_HOME/etc/apps/**, and use a different directory structure.

* CheckboxGroupView has been added to allow groups of checkboxes. 

* The SimpleSplunkView base class (`'splunkjs/mvc/simplesplunkview'`) has been
    added, allowing you to create custom
    views by inheriting from it and overriding methods as needed.

* A token can now include almost any character, including spaces. For example,
  `$abc # def$` is a valid token. To escape the literal dollar sign character 
  `$`, use `$$`.

* Drilldown behavior has been normalized across TableView, 
    EventsViewerView, ChartView, and SplunkMapView:
    - The default drilldown action for these views is to redirect to the search 
        page.
    - The drilldown event is now `click` rather than `drilldown`. (Some views 
        such as TableView and ChartView also have specific events like 
        `click:row` and `click:legend`.)
    - The function signature for the `click` event is:
    
        ```
            myTable.on('click', function(e) {
                // e.preventDefault();
                // e.drilldown();
            });
        ```
        
        - `e.preventDefault()` stops the view from redirecting.
        - `e.drilldown()` performs the default drilldown action at any point.
        
    - These views have a `drilldownRedirect` property that enables 
        drilldown (events are still triggered), but does not redirect to the 
        search page.

* The `TokenAwareModel` now fully supports setting values with `{silent: true}`.

* Messaging behavior (e.g. "waiting...") has been improved across all views.

* Choice-based views (e.g. DropdownView) now supports having a choice with 
    a value of `""` (an empty string).
    
* The styling for DropdownView has been improved to match Splunk's styling.

* PostProcessManager has been completely revamped and now behaves more like
    a regular search manager. (These changes are backwards compatible.)

* Performance has been improved for many searches running on a page: all search
    tracking is now consolidated into a single request, significantly reducing
    XHR chatter. The only change that is visible to the end user is the 
    improvement in performance. 

* The `get` and `set` methods of SearchManager are now symmetric.

* TimelineView now supports getting and setting values using the 
    `myTimeline.val(...)` pattern:

    ```
    var currentSelection = myTimeline.val(); // get
    myTimeline.val({earliest_time: 1380565955, latest_time: 1380561955}); // set
    ```
    
* SavedSearchManager now respects dispatchable properties, for example:

    ```
    myManager.search.set('status_buckets', 300);
    ```
   
* TableView now supports different types of values for the `fields` property:
    - An array: `myTable.settings.set("fields", ["field1", "field2", "fields with spaces"]);`
    - A comma- or space-separated string: `myTable.settings.set("fields", 'field1, field2, "fields with spaces"');`
    - A JSON-encoded array: `myTable.settings.set("fields", '["field1", "field2", "fields with spaces"]');`

* SearchManager now cancels running searches on page unload. This feature can be 
    disabled by using the `cancelOnUnload` property set to `false`. Complete 
    searches and search managers with `cache` not equal to `false` will not be 
    cancelled.

* SearchManager now consolidates search changes into a single call to the server,
    which happens once per event loop. So, for example, a SearchManager with 
    `autostart` set to `true` only calls once to the server for the following 
    sequence of calls:

    ```
    myManager.set('search', ...);
    myManager.search.set('status_buckets', 300);
    myManager.search.set('rf', '*');
    ```

* TableView has a `BaseCellRenderer` property that you can use to create
    custom cell renderers, as follows:
        
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
        
    
* Components that inherit from `BaseSplunkView` or `SimpleSplunkView` can use 
    the `bindToComponentSetting` function, which allows you to easily bind to 
    the setting itself rather than to a specific value. The most common usage is
    the following:

    ```
    this.bindToComponentSetting('managerid', this._onManagerChange, this);
    ```

* The `cache` property of SavedSearchManager can now take a value of `scheduled`,
    which causes the search manager to only use previously-run searches that 
    were scheduled by Splunk.

* TimeRangeView has two special derivative tokens, `earliest_time` and `latest_time`:

    ```
    new TimeRangeView({"value": mvc.tokenSafe("$mytoken$")});
    ```
    
    While `$mytoken$` stores an object, `$mytoken.earliest_time$` and `$mytoken.latest_time$`
    store the individual values.

* You can now escape strings for token-like references using `mvc.tokenEscape`
    as follows:

    ```
    mvc.tokenEscape("I got $20 in my pocket, you have no $ in yours");
    ```
    
* When you use the `remove` method to remove a view, the view is now also removed 
    from the registry.

* SavedSearchManager now properly respects the app/user scope when finding saved
    reports. 

* The `SimpleSplunkView` base class has been made more consistent:
    - The `onDataChanged` method is now `formatResults`.
    - The `return_count` property is now `returnCount`.
    - The `output_mode` property is now `outputMode`.
    - The `render` method can now be called multiple times, so it is appropriate
    to use it for event bindings as follows:
        
        ```
        this.settings.on("change:someProperty", this.render, this);
        ```
        
    - You can now set custom attributes to your `SimpleSplunkView` subclass, 
        such that when your class fetches data from the server, the class will 
        use those properties.

        For example, to set the `output_time_format` property to get data in 
        milliseconds:
    
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
 
* The **ResultTable** view has been replaced with the **Table** view:

    * Use the `{% table %}` template tag.
  
    * Use `"splunkjs/mvc/tableview"` in JavaScript. 
 
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