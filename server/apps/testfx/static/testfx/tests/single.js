define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var SingleView = require('splunkjs/mvc/singleview');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 20;
    var BEFORE = 'before';
    var AFTER = 'after';
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
                type : "single",
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
        
        "Single tests": {

            "result is valid with valid search": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();

                _.delay(function() {
                    assert(container.find('.single-result')[0], 'result does not exist');
                    done();
                }, WAIT_TIME);
            },
            "result is not empty with valid search": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();

                context.on("search:done", function(){
                    _.defer(function() {
                        var result = container.find('.single-result');                
                        assert.notEqual((result.text() || "").trim(), 'N/A');
                        done();
                    });
                });
            },
            "labels render consistent with settings": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();
                
                _.delay(function() {
                    var bl = container.find(' .before-label');
                    var al = container.find(' .after-label');
                    var blText = (bl.text() || "").trim();
                    var alText = (al.text() || "").trim();

                    //check that labels are what we set them to
                    assert.equal(blText, BEFORE);  
                    assert.equal(alText, AFTER);  

                    //check that labels are consistent with settings
                    assert.equal(blText, single.settings.get('beforeLabel'), 'before label same as settings'); 
                    assert.equal(alText, single.settings.get('afterLabel'), 'after label same as settings'); 

                    done();
                }, WAIT_TIME);
            },
            "labels change with settings change": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();

                var bl = container.find(' .before-label');
                var al = container.find(' .after-label');
                var blText = (bl.text() || "").trim();
                var alText = (al.text() || "").trim();

                var preChangeBefore = blText;
                var postChangeBefore = 'new label';
                var preChangeAfter = alText;
                var postChangeAfter = 'new after label';

                //check the values are unequal
                assert.notEqual(preChangeBefore, postChangeBefore, 'values equal before change');
                assert.notEqual(preChangeAfter, postChangeAfter, 'values equal before change');

                //make the change
                single.settings.set('beforeLabel', postChangeBefore);
                single.settings.set('afterLabel', postChangeAfter);

                //check values after a wait
                _.delay(function(){
                    bl = container.find(' .before-label');
                    blText = (bl.text() || "").trim();
                    assert.equal(postChangeBefore, blText, 'before lable changed successfully');

                    al = container.find(' .after-label');
                    alText = (al.text() || "").trim();
                    assert.equal(postChangeAfter, alText, 'after lable changed successfully');
                    done();
                }, WAIT_TIME);
            },

            "model result matches display": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();

                _.delay(function(){
                    //get html value
                    var htmlResult = (container.find('.single-result').text() || "").trim();

                    //get the datasource value
                    var modelResult =single.resultsModel.data().columns[0][0];

                    //compare
                    assert.equal(htmlResult, modelResult);
                    done();
                }, WAIT_TIME);
            },

            "setting field works": function(done) {
                    var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: context.get('id'),
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    field: "other",
                    el: container, 
                }).render();
                context.start();

                context.on("search:done", function(e){
                    _.delay(function(){
                        //get result and data from model
                        var htmlResult = (container.find('.single-result').text() || "").trim(); 
                        var modelResult = single.resultsModel.data().columns[1][0];

                        //compare
                        assert.equal(htmlResult, modelResult);

                        done();
                    }, WAIT_TIME);
                });
            },
            "control renders empty with invalid search": function(done){                
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var single = new SingleView({
                    id: containerName + "-test-single",
                    managerid: "fake",
                    beforeLabel: BEFORE,
                    afterLabel: AFTER,
                    el: container, 
                }).render();
                context.start();

                var result = container.find('.single-result');   
                var resultText = (result.text() || "").trim();

                var bl = container.find(' .before-label');
                var al = container.find(' .after-label');
                var blText = (bl.text() || "").trim();
                var alText = (al.text() || "").trim();

                //check that labels are blank
                assert.equal(blText, '');  
                assert.equal(alText, '');  

                assert.equal(resultText, '');

                done();
            }
        },
        "Not yet implemented":{
            // what should it display before it is done?

            "setting classfield works for a supported search": function(done) {
                done();
            },
            
        },
        
    };
    
    return tests;
});
