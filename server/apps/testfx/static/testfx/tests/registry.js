define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var BaseManager = require("splunkjs/mvc/basemanager");
    var BaseSplunkView = require("splunkjs/mvc/basesplunkview");
    var testutil = require("../testutil");
    
    var R = splunkjs.mvc.Components;
    
    var MockControl = BaseSplunkView.extend({
        salt: testutil.getUniqueName()
    });
    
    var MockContext = BaseManager.extend({
        salt: testutil.getUniqueName()
    });
    
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
        
        "Registry Tests": {
            /*
             * Registry API
             * 
             * Non-Private Methods:
             *  + create(htmlClassName, htmlIdAndComponentName, options) : Component
             *      > Instantiates a component.
             *  + getInstance(htmlIdAndComponentName) : Component
             *      > Locates a component instance.
             *  ~ revokeInstance(htmlIdAndComponentName)
             *      > Unregisters a component instance.
             *  ~ bind, has, off
             *      > (Backbone model methods)
             */
            "Registry": {
                // Tests: [create, getInstance, revokeInstance]
                "should advertise component instance after instantiation": function(done) {
                    _.each([MockControl, MockContext], function(MockComponent) {
                        var mock1 = new MockComponent({
                            id: 'mock1',
                            // Typical options for a control. But not required.
                            /*
                            managerid: 'foocontext',
                            el: $('<div id="mock1"></div>')
                            */
                        });
                        assert.ok(mock1);
                        assert.ok(R.getInstance('mock1'));
                        
                        R.revokeInstance('mock1');
                        assert.isFalse(R.has('mock1'));
                    });
                    
                    done();
                },
                
                // Tests: [bind, has, off]
                "looks like a Backbone.Model": function(done) {
                    assert.ok(R.bind);
                    assert.ok(R.has);
                    assert.ok(R.off);
                    
                    done();
                },
                
                // Tests: [bind, has]
                "should fire events when component registered and unregistered": function(done) {
                    _.each([MockControl, MockContext], function(MockComponent) {                    
                        var changeSetEventFired = false;
                        var changeClearEventFired = false;
                        R.bind("change:mock", function(sourceRegistry, sourceComponent) {
                            assert.strictEqual(sourceRegistry, R);
                            if (sourceComponent) {
                                changeSetEventFired = true;
                            } else {
                                changeClearEventFired = true;
                            }
                        });
                    
                        assert.isFalse(R.has('mock'));
                        assert.isFalse(changeSetEventFired);
                        var mock1 = new MockComponent({id: 'mock'});
                        assert.isTrue(R.has('mock'));
                        assert.isTrue(changeSetEventFired);
                        
                        // Ensure attempt to rebind the name fails
                        assert.throws(function() {
                            new MockComponent({id: 'mock'});
                        }, 'Already have instance with id');
                        
                        assert.isFalse(changeClearEventFired);
                        R.revokeInstance('mock');
                        assert.isTrue(changeClearEventFired);
                    });
                    
                    done();
                },
                
                "should allow component ID replace if options.replace is set": function(done) {
                    _.each([MockControl, MockContext], function(MockComponent) {
                        var changeEventsFired = 0;
                        
                        R.bind('change:mock2', function(registry, component) {
                            assert.strictEqual(registry, R);
                            changeEventsFired++;
                        });
                        
                        assert.isFalse(R.has('mock2'));
                        assert.strictEqual(changeEventsFired, 0);
                        
                        var mockA = new MockComponent({id: 'mock2'});
                        assert.isTrue(R.has('mock2'));
                        assert.strictEqual(changeEventsFired, 1);
                        
                        // Ensure attempt to rebind the ID fails
                        assert.throws(function() {
                           new MockComponent({id: 'mock2'});
                        }, 'Already have instance with ID');
                        
                        var mockB = new MockComponent({id: 'mock2'}, {replace: true});
                        assert.isTrue(R.has('mock2'));
                        assert.strictEqual(changeEventsFired, 2);
                        assert.strictEqual(mockB, R.get('mock2'));
                        
                        changeEventsFired = 0;
                        var currentComponent = null;
                        R.bind('change:mock3', function(registry, component) {
                            assert.strictEqual(registry, R);
                            assert.strictEqual(component, currentComponent);
                            changeEventsFired++;
                        });
                        
                        currentComponent = mockB;
                        R.registerInstance('mock3', mockB);
                        assert.isTrue(R.has('mock3'));
                        assert.strictEqual(changeEventsFired, 1);
                        assert.strictEqual(mockB, R.get('mock3'));
                        
                        currentComponent = mockA;
                        R.registerInstance('mock3', mockA, {replace: true});
                        assert.isTrue(R.has('mock3'));
                        assert.strictEqual(changeEventsFired, 2);
                        assert.strictEqual(mockA, R.get('mock3'));
                        
                        // We are now going to unregister the component
                        currentComponent = undefined;
                        
                        // Revoke it and check it is gone
                        R.revokeInstance('mock2');
                        assert.isFalse(R.has('mock2'));
                        assert.strictEqual(changeEventsFired, 3);
                        
                        // Revoke it and check it is gone
                        R.revokeInstance('mock3');
                        assert.isFalse(R.has('mock3'));
                        assert.strictEqual(changeEventsFired, 4);
                        
                        // Unregister our listeners
                        R.off('change:mock2');
                        R.off('change:mock3');
                    });
                        
                    done();
                }
            }
        }
    };
    
    return tests;
});
