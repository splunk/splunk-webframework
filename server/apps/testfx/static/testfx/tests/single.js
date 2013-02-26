define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

   
    var BEFORE = 'before'
    var AFTER = 'after'
    
    var tests = {
        before: function(done) {
            $('#hook').append("<div id='container1'></div>");
            var single = AppFx.Components.create("appfx-single", "test-single", {
              contextid: "test-search",
              beforeLabel: BEFORE,
              afterLabel: AFTER,
              el: $("#container1") 
            }).render();
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                type : "single",
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
        
        "Single tests": {
            "result is valid": function(done) {
                assert($('#container1 .appfx-single-result')[0], 'result does not exist');
                done();
            },
            "result is not empty": function(done) {
                var result = $('.appfx-single-result');                
                assert.notEqual(result.text(), '...');
                done();
            },
            "labels render consistent with settings": function(done) {
                var bl = $('#container1 .appfx-single-label-before');
                var al = $('#container1 .appfx-single-label-after');

                var single = testutil.appfxLookup("test-single");

                //check that labels are what we set them to
                assert.equal(bl.text(), BEFORE);  
                assert.equal(al.text(), AFTER);  

                //check that labels are consistent with settings
                assert.equal(bl.text(), single.settings.get('beforeLabel'), 'before label same as settings'); 
                assert.equal(al.text(), single.settings.get('afterLabel'), 'after label same as settings'); 

                done();
            },
            "labels change with settings change": function(done) {
                var bl = $('#container1 .appfx-single-label-before');
                var al = $('#container1 .appfx-single-label-after');

                var single = testutil.appfxLookup("test-single");

                var preChangeBefore = bl.text();
                var postChangeBefore = 'new label';
                var preChangeAfter = al.text();
                var postChangeAfter = 'new after label';

                //check the values are unequal
                assert.notEqual(preChangeBefore, postChangeBefore, 'values equal before change');
                assert.notEqual(preChangeAfter, postChangeAfter, 'values equal before change');

                //make the change
                single.settings.set('beforeLabel', postChangeBefore);
                single.settings.set('afterLabel', postChangeAfter);

                //check values after a wait
                _.delay(function(){
                    bl = $('#container1 .appfx-single-label-before');
                    assert.equal(postChangeBefore, bl.text(), 'before lable changed successfully');

                    al = $('#container1 .appfx-single-label-after');
                    assert.equal(postChangeAfter, al.text(), 'after lable changed successfully');
                    done();
                }, 20);
            },

            "model result matches display": function(done) {
                var divName = testutil.createUniqueDiv($('#hook'));
                var single = AppFx.Components.create("appfx-single", "test-single3", {
                  contextid: "test-search",
                  beforeLabel: "single",
                  el: $("#"+divName) 
                }).render();

                _.delay(function(){
                    var htmlResult = $('#'+divName+' .appfx-single-result').text();
                    var modelResult =single.datasource.data().rows[0][0];
                    assert.equal(htmlResult, modelResult);
                    done();
                }, 20);
            },

            
        },
        "Not yet implemented":{
            
            "setting field works": function(done) {
                
                done();
            },
            "setting classfield works for a supported search": function(done) {
                
                done();
            },
            "result updates on search change": function(done) {
                done();        
            },
        }
    };
    
    return tests;
});
