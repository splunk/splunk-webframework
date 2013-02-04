# The Splunk Application Framework

#### Version 0.1 Preview

The Splunk Application Framework Preview lets developers quickly create custom Splunk apps by using prebuilt components, styles, templates, and reusable samples, and by adding custom logic, interactions, and UI.  Applications developed with the Framework Preview will work seamlessly side-by-side with the current simple and advanced XML applications and users will be able to switch between apps without issue.

The Splunk Application Framework Preview uses the Django web framework, the [Splunk SDK for Python](https://github.com/splunk/splunk-sdk-python), and the [Splunk SDK for JavaScript](https://github.com/splunk/splunk-sdk-javascript). The framework also depends on a few JavaScript libraries for the client-side of code, such as Backbone.js for eventing, and jQuery for working with the document object model (DOM).

If you have any questions please contact *devinfo@splunk.com*.


### Getting started

This section provides information about installing the framework, running it, and starting an app. 

* For full documentation, see [the Splunk Developer Portal](http://dev.splunk.com/view/app-framework/SP-CAAAEMA). 

* For information about the framework controls and contexts, see [Splunk App Framework Reference](http://docs.splunk.com/Documentation/AppFramework).
 
* For interactive examples and demos, see the apps that are included with the Splunk App Framework (be sure to look at <b>ComponentFx</b> and <b>ExamplesFx</b>).


#### Requirements
Here are the framework requirements for this release:

* **Operating system**: Windows, Linux or Mac OS X.

* **Web browser**: Latest versions of Chrome, Safari, and Firefox, and IE9+.

* **The new Splunk App Framework**: The framework is available as a ZIP file from GitHub and as a Git repository.

* **Splunk**: Splunk 5.0 or later. If you haven't already installed Splunk, download it 
[here](http://www.splunk.com/download). For more about installing and running 
Splunk and system requirements, see 
[Installing & Running Splunk](http://dev.splunk.com/view/SP-CAAADRV). 

* **Programming language**: Python 2.7.

#### Installation
The framework installation package includes most of what you need to start building complete applications for Splunk, including:

* **The Django web framework**. Django 1.4.1 is included, even if you already have another installation of Django.

* **Programming tools**. The Splunk SDK for Python is included so that you can programmatically interact with the Splunk engine.

* **JavaScript tools**. The framework include several JavaScript client frameworks such as jQuery, Backbone.js, and Bootstrap, along with our own Splunk SDK for JavaScript.

**To install the framework**

1. Download and unzip the framework ZIP file.
2. Open a command prompt, navigate to the directory where you unzipped the framework, and enter appfx setup. For example, on Mac OS X, enter:
       
         ./appfx setup
       
   On Windows, just enter: 
   
         appfx setup

    **Note** Windows users must run the `appfx` command-line tool with Administrator privileges. Otherwise, commands fail without any errors.

    The setup process asks you to specify where Splunk is installed, then displays the Splunk configuration variables that will be used, such as host names and port numbers. These values are taken from your current Splunk configuration settings, but you can use different values if you need to. After you accept these values (or opt to change them), setup installs the framework and additional tools.

#### Sample data
The framework includes a geo-tagged sample data set so you can experiment with the framework, even if you don't have any data in Splunk yet (or use the sample data set if you don't have any geo-tagged data). The framework Quick Start and other sample apps use this data set to demonstrate how to use contexts and controls.

The sample data is in a CSV file at **$HOMEDIR/server/apps/quickstartfx/splunkd/lookups/appfx.demo.dataset.csv**. You can include this data file in any framework app by creating a /lookups directory under **$HOMEDIR/server/apps/<*your_app_name*>/splunkd/** and copying the CSV file there.

To search the sample data set, use the `inputlookup` command in your search query. For example, this search query lists every event in the data set:

    search = " | inputlookup appfx.demo.dataset.csv"

This example returns the count of events:

    search = " | inputlookup appfx.demo.dataset.csv | stats count"
    
#### Run the framework 
To use the framework, you'll be using the `appfx` tool at the command line. The `appfx` commands you can use are: `setup`, `run`, `test`, `clean`, `createapp`, `removeapp`, and `deploy`. To get help with the syntax, enter `appfx -h`.

**Note** Windows users must run the `appfx` command-line tool with Administrator privileges. Otherwise, commands fail without any errors.

**To run the framework**

1. Start Splunk, if it's not running already.
2. At a command prompt, navigate to **$HOMEDIR**, then enter `appfx run`. 
3. Open *http://localhost:3000/appfx* in a web browser to verify the framework is working.

You'll be prompted to log in if you haven't already. The default *http://localhost:3000/appfx/homefx* page lists all of the sample and user framework apps on your system.

#### Create an app 
When you create an app, the framework generates the new app's directory and its files.

**To generate the app directory and files**

1. If the framework is running, stop the framework by pressing Ctrl+C at the command prompt.
2. At the command prompt, enter `appfx createapp app_name`, where you provide an app name. For example, on Mac OS X, enter:

        ./appfx createapp mynewapp

    An **/*app_name*** directory is created in **$HOMEDIR/server/apps/** with auto-generated project files.
4.  Start the framework. At the command prompt, go to **$HOMEDIR** and enter `appfx run`. For example, on Mac OS X, enter:

        ./appfx run



## Repository

<table>
<tr>
<td><em>cli</em><td>
<td>This directory contains the AppFx utility script</td>
</tr>

<tr>
<td><em>contrib</em><td>
<td>This directory contains third-party tools and libraries</td>
</tr>

<tr>
<td><em>proxy</em><td>
<td>This directory contains the development web server</td>
</tr>

<tr>
<td><em>server</em><td>
<td>This directory contains the source for the framework and apps</td>
</tr>
</table>


### Branches

The **master** branch always represents a stable and released version of the framework.
 

## Documentation and resources

When you need to know more: 

* For all things developer with Splunk, your main resource is the [Splunk Developer Portal](http://dev.splunk.com).

* For conceptual and how-to documentation, see the [Overview of the Splunk App Framework](http://dev.splunk.com/view/app-framework/SP-CAAAEMA).

* For component reference documentation, see the [Splunk App Framework Reference](http://docs.splunk.com/Documentation/AppFramework).

* For information about the Splunk REST API, see the [REST API Reference](http://docs.splunk.com/Documentation/Splunk/latest/RESTAPI).

* For more about about Splunk in general, see [Splunk>Docs](http://docs.splunk.com/Documentation/Splunk).


## Community

Stay connected with other developers building on Splunk.

<table>

<tr>
<td><b>Email</b></td>
<td>devinfo@splunk.com</td>
</tr>

<tr>
<td><b>Issues</b>
<td><span>https://github.com/splunk/splunk-appframework/issues/</span></td>
</tr>

<tr>
<td><b>Answers</b>
<td><span>http://splunk-base.splunk.com/tags/appfx/</span></td>
</tr>

<tr>
<td><b>Blog</b>
<td><span>http://blogs.splunk.com/dev/</span></td>
</tr>

<tr>
<td><b>Twitter</b>
<td>@splunkdev</td>
</tr>

</table>


### How to contribute

If you would like to contribute to the SDK, go here for more information:

* [Splunk and open source](http://dev.splunk.com/view/opensource/SP-CAAAEDM)

* [Individual contributions](http://dev.splunk.com/goto/individualcontributions)

* [Company contributions](http://dev.splunk.com/view/companycontributions/SP-CAAAEDR)

### Support

SDKs in Preview will not be Splunk supported. Once the new Splunk App Framework
moves to an  Open Beta we will provide more detail on support.  


### Contact Us

You can reach the Developer Platform team at _devinfo@splunk.com_.

## License

The Splunk Java Software Development Kit is licensed under the Apache
License 2.0. Details can be found in the LICENSE file.