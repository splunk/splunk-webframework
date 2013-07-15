define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var mvc = require("splunkjs/mvc");
    var Registry = require("splunkjs/mvc/registry");
    var TokenAwareModel = require("splunkjs/mvc/tokenawaremodel");
    var TokenUtils = require("splunkjs/mvc/tokenutils");
    
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
        
        "TokenAwareModel": {
            "can be instantiated with zero parameters": function(done) {
                var m = new TokenAwareModel();  // zero-argument constructor
                
                // Ensure empty
                assert.deepEqual(m.attributes, {});
                
                done();
            },
            
            "set()": {
                "can set string as value if tokens=false": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', 'literalValue');
                    assert.strictEqual(m.get('key', {tokens: true}), 'literalValue');
                    assert.strictEqual(m.get('key'), 'literalValue');
                    
                    done();
                },
                
                "can set non-string as value if tokens=false": function(done) {
                    var m = createTokenAwareModel();
                    
                    var complexValue = {'a': 1, 'b': 2};
                    m.set('key', complexValue);
                    assert.strictEqual(m.get('key', {tokens: true}), complexValue);
                    assert.strictEqual(m.get('key'), complexValue);
                    
                    done();
                },
                
                "can set non-string as value if tokens=true": function(done) {
                    var m = createTokenAwareModel();
                    
                    var complexValue = {'a': 1, 'b': 2};
                    m.set('key', complexValue, {tokens: true});
                    assert.strictEqual(m.get('key', {tokens: true}), complexValue);
                    assert.strictEqual(m.get('key'), complexValue);
                    
                    done();
                },
                
                "can set string as template if tokens=true": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key', {tokens: true}), '$tokenRef$');
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    done();
                },
                
                "can set TokenSafeString as template if tokens=false": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', mvc.tokenSafe('$tokenRef$'));
                    assert.strictEqual(m.get('key', {tokens: true}), '$tokenRef$');
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    done();
                },
                
                "can set TokenSafeString as template if tokens=true": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', mvc.tokenSafe('$tokenRef$'), {tokens: true});
                    assert.strictEqual(m.get('key', {tokens: true}), '$tokenRef$');
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    done();
                },
                
                "overrides template when setting a literal value": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    
                    m.set('key', 'literalValue');
                    assert.strictEqual(m.get('key', {tokens: true}), 'literalValue');
                    assert.strictEqual(m.get('key'), 'literalValue');
                    
                    done();
                },
                
                "does not interpret token-like strings in literal values": function(done) {
                    var m = createTokenAwareModel();
                    
                    m.set('key', '$tokenRef$');
                    assert.strictEqual(m.get('key', {tokens: true}), '$tokenRef$');
                    assert.strictEqual(m.get('key'), '$tokenRef$');
                    
                    done();
                },
                
                // NOTE: The number of change events fired is undefined if 
                //       there are any templated strings involved.
                "fires exactly one change event when multiple literal values are updated (and no templates are present)": function(done) {
                    var m = createTokenAwareModel();
                    
                    var numChangeEvents = 0;
                    m.on('change', function() {
                        numChangeEvents++;
                    });
                    
                    m.set({
                        key1: 'value1',
                        key2: 'value2'
                    });
                    assert.strictEqual(m.get('key1'), 'value1');
                    assert.strictEqual(m.get('key2'), 'value2');
                    assert.strictEqual(numChangeEvents, 1); // not 2
                    
                    done();
                }
            },
            
            "Pull properties": {
                "update string value if any token in template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    r.getInstance('default').set('tokenRef2', 'tokenValue2');
                    assert.strictEqual(r.getInstance('default').get('tokenRef2'), 'tokenValue2');
                    
                    m.set('key', '$tokenRef$-$tokenRef2$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue-tokenValue2');
                    
                    r.getInstance('default').set('tokenRef', 'newTokenValue');
                    assert.strictEqual(m.get('key'), 'newTokenValue-tokenValue2');
                    
                    r.getInstance('default').set('tokenRef2', 'newTokenValue2');
                    assert.strictEqual(m.get('key'), 'newTokenValue-newTokenValue2');
                    
                    done();
                },
                
                "update non-string value if solitary token in template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    var complexValue = {'a': 1, 'b': 2};
                    r.getInstance('default').set('tokenRef', complexValue);
                    assert.strictEqual(m.get('key'), complexValue);
                    
                    done();
                },
                
                "pull value from new template when template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    r.getInstance('default').set('newTokenRef', 'newTokenValue');
                    m.set('key', '$newTokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    
                    done();
                },
                
                "update using new (but not old) template after template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    r.getInstance('default').set('newTokenRef', 'newTokenValue');
                    m.set('key', '$newTokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    
                    // Should respond to changes in the new token value
                    r.getInstance('default').set('newTokenRef', 'newerTokenValue');
                    assert.strictEqual(m.get('key'), 'newerTokenValue');
                    
                    // Should not respond to changes in the old token value
                    r.getInstance('default').set('tokenRef', 'cannotSeeMe');
                    assert.strictEqual(m.get('key'), 'newerTokenValue');
                    
                    done();
                },
                
                "have an undefined value if any referenced token in template is undefined": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    m.set('key', '$tokenRef$-$unknown$', {tokens: true});
                    // In particular, we should NOT get 'tokenValue-$unknown$',
                    // despite that being the default behavior of TokenUtils.replaceTokens().
                    assert.strictEqual(m.get('key'), undefined);
                    
                    done();
                },
                
                "retains unmatched tokens in value when retainUnmatchedTokens=true": function(done) {
                    var m = createTokenAwareModel({
                        retainUnmatchedTokens: true
                    });
                    var r = m._tokenRegistry;
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    m.set('key', '$tokenRef$-$unknown$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue-$unknown$');
                    
                    done();
                },
                
                "are further escaped when tokenEscaper specified": function(done) {
                    var m = createTokenAwareModel({
                        tokenEscaper: TokenUtils.getEscaper('html')
                    });
                    var r = m._tokenRegistry;
                    
                    r.getInstance('default').set('title', '<i>ATL</i>');
                    m.set('html', '<b>$title$</b>', {tokens: true});
                    // NOTE: Only the token value is escaped, not the
                    //       surrounding literal elements.
                    assert.strictEqual(m.get('html'), '<b>&lt;i&gt;ATL&lt;&#x2F;i&gt;</b>');
                    
                    done();
                },
                
                "understand namespaced tokens": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    r.getInstance('ns', {create: true}).set('tokenRef', 'nsTokenValue');
                    assert.strictEqual(r.getInstance('ns').get('tokenRef'), 'nsTokenValue');
                    
                    m.set('key', '$ns:tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'nsTokenValue');
                    
                    done();
                }
            },
            
            "Push properties": {
                "update solitary token if value changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'tokenValue');
                    
                    m.set('key', 'newTokenValue');
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    assert.strictEqual(r.getInstance('default').get('tokenRef'), 'newTokenValue');
                    
                    done();
                },
                
                "can be set to a value without having a template defined": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    assert.strictEqual(m.get('key', {tokens: true}), undefined);
                    
                    m.set('key', 'literalValue');
                    assert.strictEqual(m.get('key'), 'literalValue');
                    assert.strictEqual(m.get('key', {tokens: true}), 'literalValue');
                    
                    done();
                },
                
                "push value to new token if prior value defined when template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    // Setup prior value
                    m.set('key', 'newTokenValue');
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    
                    // New token already has value
                    r.getInstance('default').set('newTokenRef', 'clobberMe');
                    assert.strictEqual(r.getInstance('default').get('newTokenRef'), 'clobberMe');
                    
                    // Should push value to new token, even if the new token already has a value
                    m.set('key', '$newTokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    assert.strictEqual(r.getInstance('default').get('newTokenRef'), 'newTokenValue');
                    
                    done();
                },
                
                "pull value from new token if no prior value defined when template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    // No prior value
                    assert.strictEqual(m.get('key'), undefined);
                    
                    // New token already has value
                    r.getInstance('default').set('newTokenRef', 'newTokenValue');
                    assert.strictEqual(r.getInstance('default').get('newTokenRef'), 'newTokenValue');
                    
                    // Should pull value from new token, since no prior value
                    m.set('key', '$newTokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    
                    done();
                },
                
                "update using new (but not old) token after template changes": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    m.set('key', '$tokenRef$', {tokens: true});
                    m.set('key', 'tokenValue');
                    
                    m.set('key', '$newTokenRef$', {tokens: true});
                    m.set('key', 'newTokenValue');
                    
                    // Should respond to changes in the new token value
                    r.getInstance('default').set('newTokenRef', 'newerTokenValue');
                    assert.strictEqual(m.get('key'), 'newerTokenValue');
                    
                    // Should not respond to changes in the old token value
                    r.getInstance('default').set('tokenRef', 'cannotSeeMe');
                    assert.strictEqual(m.get('key'), 'newerTokenValue');
                    
                    done();
                },
                
                "understand namespaced tokens": function(done) {
                    var m = createTokenAwareModel();
                    var r = m._tokenRegistry;
                    
                    m.enablePush('key');
                    
                    m.set('key', '$ns:tokenRef$', {tokens: true});
                    assert.strictEqual(m.get('key'), undefined);
                    
                    m.set('key', 'newTokenValue');
                    assert.strictEqual(m.get('key'), 'newTokenValue');
                    assert.strictEqual(r.getInstance('ns').get('tokenRef'), 'newTokenValue');
                    
                    done();
                }
            }
        }
    };
    
    var createTokenAwareModel = function(modelOptions) {
        var tokenRegistry = new Registry();
        tokenRegistry.getInstance('default').set('tokenRef', 'tokenValue');
        
        modelOptions = _.extend({
            tokenRegistry: tokenRegistry
        }, modelOptions || {});
        
        return new TokenAwareModel({}, modelOptions);
    };
    
    return tests;
});
