define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var CheckboxView = require("splunkjs/mvc/checkboxview");
    var CheckboxGroupView = require("splunkjs/mvc/checkboxgroupview");
    var mvc = require("splunkjs/mvc");
    var Registry = require("splunkjs/mvc/registry");
    var BaseChoiceView = require("splunkjs/mvc/basechoiceview");
    var MultiSelectView = require("splunkjs/mvc/multiselectview");
    var RadioGroupView = require("splunkjs/mvc/radiogroupview");
    var SearchBarView = require("splunkjs/mvc/searchbarview");
    var SelectView = require("splunkjs/mvc/selectview");
    var TextBoxView = require("splunkjs/mvc/textboxview");
    var TimelineView = require("splunkjs/mvc/timelineview");
    var TimePickerView = require("splunkjs/mvc/timepickerview");
    
    var testSuite = {
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
        
        "View Value Tests": {
            // will be populated dynamically by appendTestMethodsFor()
        }
    };
    
    var isChoiceView = function(v) { 
        return v instanceof BaseChoiceView;
    };

    var appendTestMethodsFor = function(
        View, viewName, factoryDefaultValue, otherValue, otherOtherValue, extraSettings, bogusValue, ignoreValueChangeEvents)
    {        
        otherOtherValue = otherOtherValue || factoryDefaultValue;
        extraSettings = extraSettings || {};
        bogusValue = bogusValue || "bogus";
        
        var testMethods = {
            // Although not required for strict correctness, it is a matter of
            // style that all properties be declared in the options dictionary,
            // even ones that start with an undefined value.
            // 
            // The undefined value as the default IS required for correctness
            // in the presence of multiple view values being bound to the same
            // token, when one of the views declares a "default" initial value
            // (particularly if it is not the first such view).
            "declares 'value' property with default of undefined": function(done) {
                assert.notStrictEqual(View.prototype.options, undefined,
                    viewName + ' does not have any properties defined.');
                
                assert.isTrue('value' in View.prototype.options,
                    viewName + ' does not define the "value" property.');
                assert.strictEqual(View.prototype.options.value, undefined,
                    viewName + '.value must have undefined as its default value.');
                
                done();
            },
            
            "declares 'default' property with default of undefined": function(done) {
                assert.notStrictEqual(View.prototype.options, undefined,
                    viewName + ' does not have any properties defined.');
                
                assert.isTrue('default' in View.prototype.options,
                    viewName + ' does not define the "default" property.');
                assert.strictEqual(View.prototype.options.default, undefined,
                    viewName + '.default must have undefined as its default value.');
                
                done();
            },
            
            "has expected factory default value": function(done) {
                var v = createView();
                
                assert.deepEqual(v.val(), factoryDefaultValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "can be initialized to a literal value with the 'value' property": function(done) {
                var v = createView({ value: otherValue });

                assert.deepEqual(v.val(), otherValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "can be initialized to a template value with the 'value' property": function(done) {
                var r = new Registry();
                r.getInstance('default').set('tokenRef', otherValue);
                
                var v = createView({
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });

                assert.deepEqual(v.val(), otherValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "can be initialized to a literal value with the 'default' property": function(done) {
                var v = createView({ 'default': otherValue });
                
                assert.deepEqual(v.val(), otherValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "can be initialized to a template value with the 'default' property": function(done) {
                var r = new Registry();
                r.getInstance('default').set('tokenRef', otherValue);
                
                var v = createView({
                    'default': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });

                assert.deepEqual(v.val(), otherValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "prefers external value over default if both available": function(done) {
                var r = new Registry();
                r.getInstance('default').set('tokenRef', otherValue);
                
                var v = createView({
                    'default': otherOtherValue,
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });
                
                assert.deepEqual(v.val(), otherValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                done();
            },
            
            "updates val() after val(...)": function(done) {
                var v = createView();
                
                assert.deepEqual(v.val(), factoryDefaultValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                
                v.val(otherValue);
                assert.deepEqual(v.val(), otherValue, "Changed value");
                assert.strictEqual(v.numViewValueChangeEvents, 1, "Expected a view change");
                
                v.val(otherValue);
                assert.deepEqual(v.val(), otherValue, "Did not set value");
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 1,
                        'Expected no view change events when changing the value to the same value.');
                }
                
                v.val(otherOtherValue);
                assert.deepEqual(v.val(), otherOtherValue, "Changed value again");
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 2, "Expected a second view change.");
                }
                
                done();
            },
            
            "updates val() after settings.set('value', ...)": function(done) {
                var v = createView();

                assert.deepEqual(v.val(), factoryDefaultValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                v.settings.set('value', otherValue);
                assert.deepEqual(v.val(), otherValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 1);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1, "Expected exactly one view change.");
                }
                
                v.settings.set('value', otherValue);
                assert.deepEqual(v.val(), otherValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 1,
                        'Expected no view change events when changing the value to the same value.');
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1,
                        'Expected no setting change events when changing the value to the same value.');
                }
                
                v.settings.set('value', factoryDefaultValue);
                assert.deepEqual(v.val(), factoryDefaultValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 2, "Expected a second view change.");
                    assert.strictEqual(v.numSettingsValueChangeEvents, 2);
                }
                
                done();
            },
            
            "updates settings.get('value') after val(...)": function(done) {
                var v = createView();
                
                assert.deepEqual(v.val(), factoryDefaultValue);
                assert.strictEqual(v.numViewValueChangeEvents, 0);
                assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                
                v.val(otherValue);
                assert.deepEqual(v.settings.get('value'), otherValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 1);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1);
                }
                
                v.val(otherValue);
                assert.deepEqual(v.settings.get('value'), otherValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 1,
                        'Expected no view change events when changing the value to the same value.');
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1,
                        'Expected no setting change events when changing the value to the same value.');
                }
                
                v.val(otherOtherValue);
                assert.deepEqual(v.settings.get('value'), otherOtherValue);
                if (!ignoreValueChangeEvents) {
                    assert.strictEqual(v.numViewValueChangeEvents, 2);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 2);
                }
                
                done();
            },

            "leaves value unchanged after attempting to set value not found in choices": function(done) {
                if (isChoiceView(v)) {
                    var v = createView();
                    
                    assert.deepEqual(v.val(), factoryDefaultValue);
                    assert.strictEqual(v.numViewValueChangeEvents, 0);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 0);

                    v.val(bogusValue);
                    assert.deepEqual(v.val(), bogusValue);
                    assert.strictEqual(v.numViewValueChangeEvents, 1);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1);
                }

                done();
            },

            "displayed value and returned value are the same value after initialization with factoryDefault": function(done) {
                var v = createView();
                if (isChoiceView(v)) {
                    assert.deepEqual(v.val(), factoryDefaultValue);
                    assert.deepEqual(v._domVal(), factoryDefaultValue, "DOM value did not match");
                }

                done();
            },

            "displayed value and returned value are the same value after initialization with value": function(done) {
                var v = createView({ value: otherValue });
                if (isChoiceView(v)) {
                    assert.deepEqual(v.val(), otherValue);
                    assert.deepEqual(v._domVal(), otherValue, "DOM value did not match");
                }

                done();
            },

            "displayed value and returned value are the same value after initialization with default value": function(done) {
                var v = createView({ "default": otherValue });
                if (isChoiceView(v)) {
                    assert.deepEqual(v.val(), otherValue);
                    assert.deepEqual(v._domVal(), otherValue, "DOM value did not match");
                }

                done();
            },

            "leaves value when choices change and value not among them": function(done) {
                if (isChoiceView(v)) {
                    var v = createView();
                    
                    assert.deepEqual(v.val(), factoryDefaultValue);
                    assert.strictEqual(v.numViewValueChangeEvents, 0);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 0);
                    
                    v.settings.set('value', otherValue);
                    assert.deepEqual(v.val(), otherValue);
                    if (!ignoreValueChangeEvents) {
                        assert.strictEqual(v.numViewValueChangeEvents, 1);
                        assert.strictEqual(v.numSettingsValueChangeEvents, 1, "Expected exactly one view change.");
                    }

                    v.settings.set('choices', [
                        { value: 'opt4', label: 'Option 4' },
                        { value: 'opt5', label: 'Option 5' },
                        { value: 'opt6', label: 'Option 6' }
                    ]);
                    
                    assert.deepEqual(v.val(), otherValue);
                    assert.strictEqual(v.numViewValueChangeEvents, 1);
                    assert.strictEqual(v.numSettingsValueChangeEvents, 1);
                }
                
                done();
            },
            
            "takes the 'default' value even if not defined in the first view in a bound view set": function(done) {
                var r = new Registry();
                
                var v1 = createView({
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });
                
                var v2 = createView({
                    // This default value should propagate to both view values
                    'default': otherValue,
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });

                assert.deepEqual(v2.settings.get('value'), otherValue,
                    "Default value did not propagate to 'value' property.");
                assert.deepEqual(v2.val(), otherValue,
                    "Default value did not propagate to displayed value.");
                assert.deepEqual(r.getInstance('default').get('tokenRef'), otherValue,
                    "Default value did not propagate to bound token.");
                
                assert.deepEqual(v1.settings.get('value'), otherValue,
                    "Default value did not propagate to first view's 'value' property.");
                assert.deepEqual(v1.val(), otherValue,
                    "Default value did not propagate to first view's displayed value.");
                
                done();
            },
            
            "takes the first-defined 'default' value in the presence of multiple values": function(done) {
                var r = new Registry();
                
                var v1 = createView({
                    // This default value should win, since it is the first one defined.
                    'default': otherValue,
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });
                
                var v2 = createView({
                    // This default value should lose.
                    'default': otherOtherValue,
                    'value': mvc.tokenSafe('$tokenRef$'),
                    settingsOptions: { tokenRegistry: r }
                });
                
                assert.deepEqual(v2.settings.get('value'), otherValue);
                assert.deepEqual(v2.val(), otherValue);
                
                assert.deepEqual(r.getInstance('default').get('tokenRef'), otherValue);
                
                assert.deepEqual(v1.settings.get('value'), otherValue);
                assert.deepEqual(v1.val(), otherValue);
                
                done();
            }
        };
        
        var createView = function(options) {
            options = options || {};
            
            // (Need to clone extraSettings, since extend() modifies it.)
            var allOptions = _.extend(_.clone(extraSettings), options);
            
            // NOTE: The value-related behavior of views is undefined
            //       prior to them being rendered.
            var v = new View(allOptions).render();
            
            // Track the number of 'change' events on the view automatically
            v.numViewValueChangeEvents = 0;
            // Used for manual debugging.
            v._testViewName = viewName;
            v.on('change', function() {
                v.numViewValueChangeEvents++;
            });
            
            // Track the number of 'change:value' events on the settings model automatically
            v.numSettingsValueChangeEvents = 0;
            v.settings.on('change:value', function() {
                v.numSettingsValueChangeEvents++;
            });
            
            return v;
        };
        
        testSuite["View Value Tests"][viewName] = testMethods;
    };
    
    var standardChoices = [
        { value: 'opt1', label: 'Option 1' },
        { value: 'opt2', label: 'Option 2' },
        { value: 'opt3', label: 'Option 3' }
    ];
    
    // Generate tests for all view classes
    {
        // Standard value handling
        appendTestMethodsFor(
            TextBoxView, 'TextBoxView', '', 'text1', 'text2');
        appendTestMethodsFor(
            CheckboxView, 'CheckboxView', false, true, undefined);
        appendTestMethodsFor(
            SearchBarView, 'SearchBarView (with qualified search)',
            '',
            'search index=_internal | head 10',
            'search index=_internal | head 20',
            undefined,
            undefined,
            true);
        appendTestMethodsFor(
            SearchBarView, 'SearchBarView (with unqualified search)',
            '',
            'index=_internal | head 10',
            'index=_internal | head 20',
            undefined,
            undefined,
            true);
        appendTestMethodsFor(
            TimePickerView, 'TimePickerView',
            {earliest_time: '', latest_time: ''},
            {earliest_time: '-1m', latest_time: ''},
            {earliest_time: '-2m', latest_time: ''});
        
        // Write-only value handling
        /* TODO: Enable after TimelineView is conformant to value semantics (DVPL-2418)
        appendTestMethodsFor(
            TimelineView, 'TimelineView',
            null,
            {earliest_time: '-1m', latest_time: ''},
            {earliest_time: '-2m', latest_time: ''});
        */
        
        // Choice-based value handling
        appendTestMethodsFor(
            SelectView, 'SelectView', undefined, 'opt2', 'opt3', { choices: standardChoices });
        appendTestMethodsFor(
            MultiSelectView, 'MultiSelectView', [], ['opt2'], ['opt3'], { choices: standardChoices }, ['bogus']);
        appendTestMethodsFor(
            RadioGroupView, 'RadioGroupView', undefined, 'opt2', 'opt3', { choices: standardChoices });
        appendTestMethodsFor(
            CheckboxGroupView, 'CheckboxGroupView', [], ['opt2'], ['opt3'], { choices: standardChoices }, ['bogus']);
    }
    
    return testSuite;
});
