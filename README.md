# The Splunk Application Framework

#### Version 0.8 Beta

The Splunk Application Framework lets developers quickly create custom Splunk apps by using prebuilt components, styles, templates, and reusable samples, and by adding custom logic, interactions, and UI. Applications developed with the framework will work seamlessly side by side with current Splunk applications.

The Splunk Application Framework uses the Django web framework, the [Splunk SDK for Python](https://github.com/splunk/splunk-sdk-python), and the [Splunk SDK for JavaScript](https://github.com/splunk/splunk-sdk-javascript). The framework also depends on a few JavaScript libraries for the client-side of code, such as Backbone.js for eventing, and jQuery for working with the document object model (DOM).

**Note** Significant changes have been made since the Preview release, such as names of components and APIs and the way components are instantiated in JavaScript. Any code you created for the Preview of the Splunk Application Framework will not work with the Beta release. Overall concepts of the framework remain the same, so see the code examples on the [Splunk Developer Portal](http://dev.splunk.com/view/app-framework/SP-CAAAEMA) and in the **/$APPFRAMEWORK_HOME/server/apps/** directory.

If you have any questions, contact *devinfo@splunk.com*.


## Getting started

This section provides information about installing the framework, running it, and starting an app. 

* For full documentation, see the [Splunk Developer Portal](http://dev.splunk.com/view/app-framework/SP-CAAAEMA). 

* For information about the framework components, see the [Splunk App Framework Reference](http://docs.splunk.com/Documentation/AppFramework).
 
* For interactive examples and demos, see the <b>Components</b> and <b>Examples</b> apps that are included with the Splunk App Framework (see the framework home page in Splunk at *http://localhost:3000/dj*).


### Requirements
Here are the framework requirements for this release:

* **Operating system**: Windows, Linux or Mac OS X.

* **Web browser**: Latest versions of Chrome, Safari, or Firefox; Internet Explorer 9 or later.

* **The new Splunk App Framework**: The framework is available as a ZIP file from GitHub and as a Git repository.

* **Splunk**: Splunk 5.0 or later. If you haven't already installed Splunk, download it 
[here](http://www.splunk.com/download). For more about installing and running 
Splunk and system requirements, see 
[Installing & Running Splunk](http://dev.splunk.com/view/SP-CAAADRV). 

* **Programming language**: Python 2.7.

### Install the framework
The framework installation package includes most of what you need to start building complete applications for Splunk, including:

* **The Django web framework**. Django 1.5.1 is included, even if you already have another installation of Django.

* **Programming tools**. The Splunk SDK for Python is included so that you can programmatically interact with the Splunk engine.

* **JavaScript tools**. The framework include several JavaScript client frameworks such as jQuery, Backbone.js, and Bootstrap, along with our own Splunk SDK for JavaScript.

**To install the framework**

You'll be using the **splunkdj** tool at the command line to work with the Splunk Application Framework. The **splunkdj** commands you can use are: `deploy`, `package`, `install`, `removeapp`, `createapp`, `test`, `run`, `start`, `stop`, `restart`, `clean`, and `setup`. To get help with the syntax, enter `splunkdj -h`.

**Note**  Windows users must run the **splunkdj** command-line tool with Administrator privileges. Otherwise, the process fails silently, without any errors.

1. Download and unzip the framework ZIP file.
2. Open a command prompt, navigate to the directory where you unzipped the framework (the **$APPFRAMEWORK_HOME**).

   On Mac OS X and Unix, enter:

         ./splunkdj setup

   On Windows, enter:

         splunkdj setup

    The setup process asks you to specify where Splunk is installed, then displays the Splunk configuration variables that will be used, such as host names and port numbers. These values are taken from your current Splunk configuration settings, but you can use different values if you need to. After you accept these values (or opt to change them), setup installs the framework and additional tools.

### Run the framework 

1. Start Splunk, if it's not running already. 
2. At a command prompt, navigate to **$APPFRAMEWORK_HOME**.

    On Mac OS X and Unix, enter:

        ./splunkdj run

    On Windows, enter:

        splunkdj run

3. Open *http://localhost:3000/dj* in a web browser to verify the framework is working.

The first time you run the Splunk Application Framework, you'll see the option to run the Quick Start, or log in using your Splunk credentials. The Quick Start is a great way to get a feel for what you can do with the Framework. Once you complete the Quick Start or log in, you'll see the framework home page, which lists all of the framework apps on your system.


### Sample data
The framework includes a geo-tagged sample data set so you can experiment with the framework, even if you don't have any data in Splunk yet (or use the sample data set if you don't have any geo-tagged data). The framework Quick Start and other sample apps use this data set to demonstrate how to use contexts and controls.

The sample data is in a CSV file at **$APPFRAMEWORK_HOME/server/apps/quickstartfx/splunkd/lookups/splunkdj.demo.dataset.csv**. You can include this data file in any framework app by creating a /lookups directory under **$APPFRAMEWORK_HOME/server/apps/<*your_app_name*>/splunkd/** and copying the CSV file there.

To search the sample data set, use the `inputlookup` command in your search query. For example, this search query lists every event in the data set:

    search = " | inputlookup splunkdj.demo.dataset.csv"

This example returns the count of events:

    search = " | inputlookup splunkdj.demo.dataset.csv | stats count"
    

### Create an app 
When you create an app, the framework generates the new app's directory and its files.

1. If the framework is running, stop it by pressing Ctrl+C at the command prompt.
2. At the command prompt, navigate to **$APPFRAMEWORK_HOME**.

   On Mac OS X and Unix, enter the following, where app_name is the case-sensitive name of your app:

        ./splunkdj createapp app_name

   On Windows, enter:

        splunkdj createapp app_name

   You'll need to provide your Splunk credentials to create the app.

   An *app_name* directory is created in **$SPLUNK_HOME/etc/apps/** with auto-generated project files, including:
   
    * **/default/app.conf**: Contains the meta data (author, description, version) for your app. Edit this file in a text editor to fill in the details. Note that you'll need to restart Splunk to see changes to this file.
    
    * **/django/app_name/templates/home.html**: The default home page, which opens when you go to *http://localhost:3000/dj/app_name/*.

3. Start the framework. At the command prompt, navigate to **$APPFRAMEWORK_HOME**.

   On Mac OS X and Unix, enter:

        ./splunkdj run

   On Windows, enter:

        splunkdj run

When you go to the framework home page at *http://localhost:3000/dj*, you'll see your new app listed with the others apps.


## Repository

<table>

<tr>
<td><em>cli</em></td>
<td>This directory contains the Splunk App Framework utility script</td>
</tr>

<tr>
<td><em>contrib</em></td>
<td>This directory contains third-party tools and libraries</td>
</tr>

<tr>
<td><em>proxy</em></td>
<td>This directory contains the development web server</td>
</tr>

<tr>
<td><em>server</em></td>
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

* For more about Splunk in general, see [Splunk>Docs](http://docs.splunk.com/Documentation/Splunk).


## Community

Stay connected with other developers building on Splunk.

<table>

<tr>
<td><b>Email</b></td>
<td>devinfo@splunk.com</td>
</tr>

<tr>
<td><b>Issues</b>
<td>https://github.com/splunk/splunk-appframework/issues/</td>
</tr>

<tr>
<td><b>Answers</b>
<td>http://splunk-base.splunk.com/tags/appfx/</td>
</tr>

<tr>
<td><b>Blog</b>
<td>http://blogs.splunk.com/dev/</td>
</tr>

<tr>
<td><b>Twitter</b>
<td>@splunkdev</td>
</tr>

</table>


### How to contribute

If you would like to contribute to the framework, go here for more information:

* [Splunk and open source](http://dev.splunk.com/view/opensource/SP-CAAAEDM)

* [Individual contributions](http://dev.splunk.com/goto/individualcontributions)

* [Company contributions](http://dev.splunk.com/view/companycontributions/SP-CAAAEDR)

## Support

This 0.8 Beta version of the Splunk App Framework is not officially supported by the Splunk support team. The final version 1.0 release will be officially supported. 

Please open issues and provide feedback either through GitHub Issues or by contacting the team directly. 

## Contact Us

You can reach the Developer Platform team at _devinfo@splunk.com_.

## License
The Splunk Application Framework is licensed under the Apache License 2.0. Details can be found in the LICENSE file.
