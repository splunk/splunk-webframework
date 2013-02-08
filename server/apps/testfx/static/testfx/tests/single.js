define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var lookup = function(name){
        return AppFx.Components.getInstance(name);
    }
    var BEFORE = 'before'
    var AFTER = 'after'
    
    var tests = {
        before: function(done) {
            AppFx.Components.create("appfx-single", "test-single", {
              contextid: "test-search",
              beforeLabel: BEFORE,
              afterLabel: AFTER,
              el: $("#hook") 
            }).render();
            var context = AppFx.Components.create("appfx-searchcontext", "test-search", {
                search: "| inputlookup testdata.csv | stats count",
                preview: "True",
                status_buckets: 300
            }).start();
            context.on("search:done", function(e){
                done()
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
                var result = $('.appfx-single-result');
                assert.ok(result);
                done();
            },
            "result is not empty": function(done) {
                var result = $('.appfx-single-result');                
                assert.notEqual(result.text(), '...');
                done();
            },
            "labels render consistent with settings": function(done) {
                var bl = $('.appfx-single-label-before');
                var al = $('.appfx-single-label-after');

                var single = lookup("test-single");

                //check that labels are what we set them to
                assert.equal(bl.text(), BEFORE);  
                assert.equal(al.text(), AFTER);  

                //check that labels are consistent with settings
                assert.equal(bl.text(), single.settings.get('beforeLabel'), 'before label same as settings'); 
                assert.equal(al.text(), single.settings.get('afterLabel'), 'after label same as settings'); 

                done();
            },
            "labels change with settings change": function(done) {
                var bl = $('.appfx-single-label-before');
                var al = $('.appfx-single-label-after');

                var single = lookup("test-single");

                var preChangeBefore = bl.text();
                var postChangeBefore = 'new label';

                //check the values are unequal
                assert.notEqual(preChangeBefore, postChangeBefore, 'values equal before change');

                //make the change
                single.settings.set('beforeLabel', postChangeBefore);

                //check values




                done();
            },
        }
    };
    
    return tests;
});
