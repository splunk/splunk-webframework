# Splunk Application Framework Changelog

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
