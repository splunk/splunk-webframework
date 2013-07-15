define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var SelectView = require('splunkjs/mvc/selectview');
    var RadioGroupView = require('splunkjs/mvc/radiogroupview');
    var TextBoxView = require('splunkjs/mvc/textboxview');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 20;
    var hookDiv = $("#hook");
    var context = null;

    var tests = {
        before: function(done) {
            done();
        },
        
        beforeEach: function(done) {
            var contextName = testutil.getUniqueName();
            context = new MockSearchManager({
                id: contextName,
                type: "forms",
                preview: "True",
                status_buckets: 300
            }).start();
            done();            
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Forms tests": {
            "static select element with no search renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var select = new SelectView({
                    id: containerName + "-test-select1", 
                    managerid: "fake-search",
                    choices : choices,
                    el: container, 
                }).render();

                
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(select.settings.get("choices").length, choices.length);

                    //check html
                    assert.lengthOf(container.find(' select'), 1, 'select select element error');
                    
                    // Note that we check for length + 1 to ensure we account for the empty
                    // choice
                    assert.lengthOf(container.find(' select').children(), choices.length + 1, 'select choices error');
                    done(); 
                }, 20);
                      
            },
            
            "static radio element with no search renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var radiogroup = new RadioGroupView({
                    id: containerName + "-test-radio3",
                    managerid: "fake-search",
                    choices : choices,
                    el: container, 
                }).render();
                
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(radiogroup.settings.get("choices").length, choices.length, 'view length error');

                    //check html
                    assert.lengthOf(container.find(' input'), choices.length, 'html choices length error')

                    done(); 
                }, 20);
                      
            },  
              
               
            "textbox element renders properly": function(done) {
                var defaultText = "default text";

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new TextBoxView({
                    id: containerName + "-test-textbox5",
                    managerid: context.get('name'),
                    default : defaultText,
                    el: container, 
                }).render();
                
                //check html
                assert.lengthOf(container.find(' input'), 1)
                
                done();                
            },
            

            
            "select change events fired properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];
                var defaultChoice = "Three";

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                
                var select = new SelectView({
                    id: containerName + "-test-select10",
                    managerid: "fake-search",
                    default : defaultChoice,
                    choices : choices,
                    el: container, 
                }).render();

                select.on("change", function(){
                    done();
                })
  
                _.delay(function(){
                    select.val("Two");
                }, 20);               
            },
            "radio change events fired properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];
                var defaultChoice = "Three";

               var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var radiogroup = new RadioGroupView({
                    id: containerName + "-test-radio11",
                    managerid: "fake-search",
                    default : defaultChoice,
                    choices : choices,
                    el: container, 
                }).render();
                
                radiogroup.on("change", _.debounce(function(){
                    assert.equal(radiogroup.val(), "Two", "Did not set the value correctly.");
                    done();
                }));
  
                _.delay(function(){
                    radiogroup.val("Two");
                }, 20);              
            },
            "static select element with valid search renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var select = new SelectView({
                    id: containerName + "-test-select2",
                    managerid: context.get('name'),
                    choices : choices,
                    el: container, 
                }).render();
    
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(select.settings.get("choices").length, choices.length);

                    //check html
                    assert.lengthOf(container.find(' select'), 1, 'select select element error');
                    assert.lengthOf(container.find(' select').children(), choices.length + 1, 'select choices error');
                    done(); 
                }, 20);
                      
            },
            "static radio element with valid search renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var radiogroup = new RadioGroupView({
                    id: containerName + "-test-radio4",
                    managerid: context.get('name'),
                    choices : choices,
                    el: container, 
                }).render();
                
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(radiogroup.settings.get("choices").length, choices.length, 'view length error');

                    //check html
                    assert.lengthOf(container.find(' input'), choices.length, 'html choices length error')

                    done(); 
                }, 20);
                      
            },
            "setting defaults works": function(done) {
                var defaultText = "default text";
                var choices = [{label: " One", value: "One"},
                               {label:" Two", value: "Two"}, 
                               {label:" Three", value: "Three"}];
                var defaultChoice = "Three";
                
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                container.append("<div id='container6'></div>");
                container.append("<div id='container7'></div>");
                container.append("<div id='container8'></div>");

                var textbox = new TextBoxView({
                    id: containerName + "-test-textbox6",
                    managerid: context.get('name'),
                    "default" : defaultText,
                    el: $('#container6'), 
                }).render();

                var select = new SelectView({
                    id: containerName + "-test-select7",
                    managerid: context.get('name'),
                    "default" : defaultChoice,
                    choices : choices,
                    el: $('#container7'), 
                }).render();

                var radiogroup = new RadioGroupView({
                    id: containerName + "-test-radio8",
                    managerid: context.get('name'),
                    "default" : defaultChoice,
                    choices : choices,
                    el: $('#container8'), 
                }).render();
                
                assert.equal(textbox.val(), defaultText, 'textbox default error');
                assert.equal(select.val(), defaultChoice, 'select default error');
                assert.equal(radiogroup.val(), defaultChoice, 'radiogroup default error');

                done(); 
            },
            
            "textbox change events fired properly": function(done) {
                var defaultText = "default text";

                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                
                var textbox = new TextBoxView({
                    id: containerName + "-test-textbox9",
                    managerid: "fake-search",
                    default : defaultText,
                    el: container, 
                }).render();

                textbox.on("change", function(){
                    assert.equal(textbox.val(), "changed", "textbox not set correctly."); 
                    done();
                });

                textbox.val("changed");
            }
        },
        "Failing":{

            
             
        },
        "Not yet implemented" : {

            "controls populated by search correctly": function(done) {
                done();                
            },

            "setting label field and value fields works": function(done) {
                done();                
            },
            "select populated by search correctly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                
                var select = new SelectView({
                    id: containerName + "-test-select12",
                    managerid: "test-search12",
                    el: container, 
                }).render();
                var context = new MockSearchManager({
                    id: containerName + "-test-search12",
                    type: "forms",
                    preview: "True",
                    status_buckets: 300
                }).start();
                context.on("search:done", function(e){
                    // Delay to fulfill HTML, then provide test here!
                    done();
                });         
            },
        }
    };
    
    return tests;
});
