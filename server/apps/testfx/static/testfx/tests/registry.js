define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var BaseContext = require("appfx/splunkui/basecontext");
    var BaseControl = require("appfx/splunkui/basecontrol");
    var testutil = require("testfx/testutil");
    
    var R = AppFx.Components;
    
    var MockControl = BaseControl.extend({
        salt: testutil.getUniqueName()
    });
    
    var MockContext = BaseContext.extend({
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
             *  + registerType(htmlClassName, Component)
             *      > Register a new type of component.
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
                // Tests: [registerType]
                "should advertise component type after registration": function(done) {
                    _.each([MockControl, MockContext], function(MockComponent) {
                        R.registerType('appfx-mock', MockComponent);
                        assert.isTrue(R.hasType('appfx-mock'));
                        assert.strictEqual(MockComponent, R.getType('appfx-mock'));
                        assert.isTrue(_.indexOf(R.getTypes(), MockComponent) != -1,
                            "getTypes() lacks control after registerType()");
                        assert.isTrue(_.indexOf(R.getTypeNames(), 'appfx-mock') != -1,
                            "getTypeNames() lacks control after registerType()");
                    
                        R.revokeType('appfx-mock');
                        assert.isFalse(R.hasType('appfx-mock'));
                        assert.isTrue(_.indexOf(R.getTypes(), MockComponent) == -1,
                            "getTypes() has control after revokeType()");
                        assert.isTrue(_.indexOf(R.getTypeNames(), 'appfx-mock') == -1,
                            "getTypeNames() has control after revokeType()");
                    });
                    
                    done();
                },
                
                // Tests: [create, getInstance, revokeInstance]
                "should advertise component instance after registration": function(done) {
                    _.each([MockControl, MockContext], function(MockComponent) {
                        R.registerType('appfx-mock', MockComponent);
                        
                        assert.isFalse(R.has('mock1'));
                        var mock1 = R.create('appfx-mock', 'mock1', {
                            // Typical options for a control. But not required.
                            /*
                            contextid: 'foocontext',
                            el: $('<div id="mock1"></div>')
                            */
                        });
                        assert.ok(mock1);
                        assert.ok(R.getInstance('mock1'));
                        
                        R.revokeInstance('mock1');
                        assert.isFalse(R.has('mock1'));
                        
                        R.revokeType('appfx-mock');
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
                        R.registerType('appfx-mock', MockComponent);
                    
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
                        var mock1 = R.create('appfx-mock', 'mock', {});
                        assert.isTrue(R.has('mock'));
                        assert.isTrue(changeSetEventFired);
                        
                        // Ensure attempt to rebind the name fails
                        assert.throws(function() {
                            R.create('appfx-mock', 'mock', {});
                        }, /Already have instance with name/);
                        
                        assert.isFalse(changeClearEventFired);
                        R.revokeInstance('mock');
                        assert.isTrue(changeClearEventFired);
                        
                        R.revokeType('appfx-mock');
                    });
                    
                    done();
                }
            }
        }
    };
    
    return tests;
});
