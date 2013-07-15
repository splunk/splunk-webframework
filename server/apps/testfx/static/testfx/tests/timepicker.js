define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var TimePickerView = require('splunkjs/mvc/timepickerview');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 150;
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
                type: "timepicker",
                preview: "True",
                status_buckets: 300
            });
            done();
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Timepicker tests": {
            "control elements in DOM": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var timepicker = new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: context.get('name'),
                    el: container,
                }).render();
                context.start();

                $.when(timepicker._pickerDfd).done(function() {
                    assert.lengthOf(container.find(' .shared-timerangepicker'), 1);
                    assert.lengthOf(container.find(' .accordion'), 1); 
                    
                    done();                
                });
            },
            "proper default text": function(done) {
               var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: context.get('name'),
                    el: container,
                }).render();
                context.start();
                
                assert.include(container.find('.time-label').text(), "All time");
                done();                
            },
            "setting earliest/latest sets text properly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new TimePickerView({
                    id: containerName + "-test-timepicker",
                    earliest_time: "@w0",
                    latest_time: "now",
                    el: container,
                }).render();
                
                _.delay(
                    function() {
                        assert.include(container.find('.time-label').text(), "Week to date");
                        done();                
                    },
                    WAIT_TIME
                );
            }, 
            "setting preset triggers change event when bound to new search": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var contextName = testutil.getUniqueName();

                var tp = new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: contextName,
                    el: container,
                    earliest_time: "@w0",
                    latest_time: "now",
                }).render();
                
                //here we create a new context to bind to which should trigger 
                var context = new MockSearchManager({
                    id: contextName,
                    type: "timepicker",
                    earliest_time: "rt-30s",
                    latest_time: "rt"
                }).start();    
                
                var newTimeRange = tp.val();
                assert.equal("rt-30s", newTimeRange.earliest_time);
                assert.equal("rt", newTimeRange.latest_time);
                done();
            },
            "changing selection triggers change": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var tp = new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: context.get('name'),
                    el: container,
                }).render();
                context.start();

                tp.on("change", function(){
                    var selectedValue = tp.val();
                    assert.equal(selectedValue.earliest_time, "-15m");
                    assert.include(container.find('.time-label').text(), "Last 15 minutes", "button text correct");
                    done();
                });

                _.delay(
                    function() {                        
                        container.find('a[data-earliest=-15m]').click();
                    },
                    WAIT_TIME
                );
            },
            "setting a preset works": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var tp = new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: context.get('name'),
                    preset: 'Today',
                    el: container,
                }).render();
                context.start();
                
                $.when(tp._pickerDfd).done(function() {
                    _.delay(function() { 
                        assert.include(container.find('.time-label').text(), "Today", "button text correct");
                        done();
                    }, WAIT_TIME);
                    
                });
            },
            "dropdown renders properly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var tp = new TimePickerView({
                    id: containerName + "-test-timepicker",
                    managerid: context.get('name'),
                    el: container,
                }).render();
                context.start();
                
                context.on("search:done", function(e){
                    $(container.find('a.btn')[0]).mousedown();
                    _.delay(function() {
                        // The popdown dialog is rendered as a separate div,
                        // so we follow the dialog ID link.
                        var dialogId = container.find('a.btn').data("dialog-id");
                        assert($("#"+dialogId).css('display') === 'block', "dropdown renders");
                        done();  
                    }, WAIT_TIME);
                });
            }
        },
        "Failing" : {
             // add some test with searchbar
        }
    };
    
    return tests;
});
