define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "forms",
                    preview: "True",
                    status_buckets: 300
            }).start();
            context.on("search:done", function(e){
                done();
            });
        },
        
        beforeEach: function(done) {
            done();
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            done();
        },
        
        "Forms tests": {
            "static select element renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                $('#hook').append("<div id='container1'></div>");

                var select = AppFx.Components.create("appfx-select", "test-select", {
                    contextid: "test-search",
                    choices : choices,
                    el: $("#container1") 
                }).render();

                
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(select.settings.get("choices").length, choices.length);

                    //check html
                    assert.lengthOf($('#container1 .select2-container'), 1, 'select container error');
                    assert.lengthOf($('#container1 select'), 1, 'select select element error');
                    assert.lengthOf($('#container1 select').children(), choices.length, 'select choices error');
                    done(); 
                }, 40);
                      
            },
               
            "textbox element renders properly": function(done) {
                var defaultText = "default text";

                $('#hook').append("<div id='container3'></div>");

                AppFx.Components.create("appfx-textbox", "test-textbox", {
                    contextid: "test-search",
                    default : defaultText,
                    el: $("#container3") 
                }).render();
                
                //check html
                assert.lengthOf($('#container3 input'), 1)
                
                done();                
            },
            "setting defaults works": function(done) {
                var defaultText = "default text";
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];
                var defaultChoice = "Three";

                $('#hook').append("<div id='container4'></div>");
                $('#hook').append("<div id='container5'></div>");
                $('#hook').append("<div id='container6'></div>");

                var textbox = AppFx.Components.create("appfx-textbox", "test-textbox2", {
                    contextid: "test-search",
                    default : defaultText,
                    el: $("#container4") 
                }).render();
                var select = AppFx.Components.create("appfx-select", "test-select2", {
                    contextid: "test-search",
                    default : defaultChoice,
                    choices : choices,
                    el: $("#container5") 
                }).render();
                var radio = AppFx.Components.create("appfx-radio", "test-radio2", {
                    contextid: "test-search",
                    default : defaultChoice,
                    choices : choices,
                    el: $("#container6") 
                }).render();
                
                _.delay(function(){
                    assert.equal(textbox.val(), defaultText, 'textbox default error');
                    assert.equal(select.val(), defaultChoice, 'select default error');
                    assert.equal(radio.val(), defaultChoice, 'radio default error');
                    done(); 
                }, 40);

                done();                
            },
            "static radio element renders properly": function(done) {
                var choices = [{label: " One", value: "One"},
                                {label:" Two", value: "Two"}, 
                                {label:" Three", value: "Three"}];

                $('#hook').append("<div id='container2'></div>");

                var radio = AppFx.Components.create("appfx-radio", "test-radio", {
                    contextid: "test-search",
                    choices : choices,
                    el: $("#container2") 
                }).render();
                
                _.delay(function(){
                    //check view for proper number of choices
                    assert.equal(radio.settings.get("choices").length, choices.length, 'view length error');

                    //check html
                    assert.lengthOf($('#container2 input'), choices.length, 'html choices length error')

                    done(); 
                }, 40);
                      
            },   
        },
        "Not yet implemented" : {

            "click events fired properly": function(done) {
                //need to know how to do this programatically
                done();                
            },
            "controls populated by search correctly": function(done) {
                done();                
            },

            "change events fired properly": function(done) {
                //need to know how to do this programatically
                done();                
            },
            "setting label field and value fields works": function(done) {
                done();                
            },
        }
    };
    
    return tests;
});
