define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var mvc = require("splunkjs/mvc");
    var SelectView = require("splunkjs/mvc/selectview");
    
    var tests = {
        before: function(done) {
            done();
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
        
        /*
         * Definitions:
         * - allChoices() := staticChoices() + dynamicChoices()
         * 
         * Assumptions:
         * - null,undefined not in allChoices()
         *      > Undefined behavior if the user does this.
         *        Ken thinks it might be a good idea to raise an exception in this case.
         * 
         * Invariants:
         * - (val() == null) iff (allChoices() == [])
         * - (val() != null) implies (val() in allChoices())
         * 
         * Transitions:
         * - if (val() not in new:allChoices()):
         *       if (default() in allChoices()):
         *           new:val() := default()
         *       elif (allChoices() != []):
         *           new:val() := allChoices()[0]
         *       else:
         *           new:val() := null
         */
        "SelectView": {
            "has undefined value and empty choices upon initialization": function(done) {
                var v = createSelectView();
                
                assert.strictEqual(v.val(), undefined);
                assert.strictEqual(v.settings.get('value'), undefined);
                assert.deepEqual(v.settings.get('choices'), []);
                
                done();
            },
            
            "has unchanged value after empty set('choices', ...)": function(done) {
                var v = createSelectView();
                
                v.settings.set('choices', []);
                assert.strictEqual(v.val(), undefined);
                
                done();
            },
            
            "has undefined value after non-empty set('choices', ...) if no default defined": function(done) {
                var v = createSelectView();
                
                v.settings.set('choices', [{value: 'opt1', label: 'Option 1'}]);
                assert.strictEqual(v.val(), undefined);
                
                done();
            },
            
            "has default value after non-empty set('choices', ...) if default defined but not in static choices": function(done) {
                var v = createSelectView({'default': 'missingOpt'});
                
                v.settings.set('choices', [{value: 'opt1', label: 'Option 1'}]);
                assert.strictEqual(v.val(), 'missingOpt');
                
                done();
            },
            
            "has default value after non-empty set('choices', ...) if default defined and in static choices": function(done) {
                var v = createSelectView({'default': 'opt2'});
                
                v.settings.set('choices', [
                    {value: 'opt1', label: 'Option 1'},
                    {value: 'opt2', label: 'Option 2'}
                ]);
                assert.strictEqual(v.val(), 'opt2');
                
                done();
            },
            
            "accepts set() of valid choice": function(done) {
                var v = createSelectView();
                
                v.settings.set('choices', [
                    {value: 'opt1', label: 'Option 1'},
                    {value: 'opt2', label: 'Option 2'}
                ]);
                v.val('opt2');
                assert.strictEqual(v.val(), 'opt2');
                
                done();
            },
            
            "accepts set() of invalid choice": function(done) {
                var v = createSelectView();
                
                v.settings.set('choices', [
                    {value: 'opt1', label: 'Option 1'},
                    {value: 'opt2', label: 'Option 2'}
                ]);
                assert.strictEqual(v.val(), undefined);
                
                v.val('notHere');
                assert.strictEqual(v.val(), 'notHere');
                
                done();
            },
            
            "preserves value after choices are reloaded if value is in the new (static) choices": function(done) {
                var v = createSelectView();
                
                v.settings.set('choices', [
                    {value: 'opt1', label: 'Option 1'},
                    {value: 'opt2', label: 'Option 2'}
                ]);
                v.val('opt2');
                assert.strictEqual(v.val(), 'opt2');
                
                v.settings.set('choices', [
                    {value: 'opt2', label: 'Option 2'},
                    {value: 'opt3', label: 'Option 3'}
                ]);
                assert.strictEqual(v.val(), 'opt2');
                
                done();
            }
        }
    };
    
    var createSelectView = function(options) {
        return new SelectView(options).render();
    };
    
    return tests;
});
