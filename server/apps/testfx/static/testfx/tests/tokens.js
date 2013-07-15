define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var mvc = require("splunkjs/mvc");
    var Registry = require("splunkjs/mvc/registry");
    var TokenUtils = require("splunkjs/mvc/tokenutils");
    var utils = require("splunkjs/mvc/utils");
    
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
        
        "Token Tests": {
            // NOTE: This suite tests the deprecated API, which delegates to
            //       similarly-named functions in TokenUtils.
            //       
            //       By continuing to use the deprecated API,
            //       code coverage on the deprecated API is preserved
            //       and I don't have to rewrite the tests, which would incur
            //       some risk of porting error.
            "Utils": {
                "understands simple token strings": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$token$", {token: "value"}),
                        "value");
                    assert.deepEqual(
                        utils.discoverReplacementTokens("$token$"),
                        ["token"]);
                    assert.strictEqual(
                        utils.hasToken("$literal$"),
                        true);
                    assert.strictEqual(
                        utils.isToken("$literal$"),
                        true);
                    assert.strictEqual(
                        utils.getTokenName("$literal$"),
                        "literal");
                    
                    done();
                },
                
                "understands escaped dollars in token strings": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("\\$literal\\$", {literal: "boom"}),
                        "$literal$");
                    assert.deepEqual(
                        utils.discoverReplacementTokens("\\$literal\\$"),
                        []);
                    assert.strictEqual(
                        utils.hasToken("\\$literal\\$"),
                        false);
                    assert.strictEqual(
                        utils.isToken("\\$literal\\$"),
                        false);
                    assert.isFalse(
                        utils.getTokenName("\\$literal\\$"));
                    
                    done();
                },
                
                "unquotes escaped slashes": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("C:\\\\Windows\\\\", {}),
                        "C:\\Windows\\");
                    
                    done();
                },
                
                "quotes slashes and dollars": function(done) {
                    assert.strictEqual(
                        utils.quoteAsTokenString("C:\\$TopLevelDirectory$\\"),
                        "C:\\\\\\$TopLevelDirectory\\$\\\\");
                    
                    done();
                },
                
                "understands token strings with multiple tokens": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$first$ $last$", {first: "John", last: "Smith"}),
                        "John Smith");
                    assert.deepEqual(
                        utils.discoverReplacementTokens("$first$ $last$"),
                        ["first", "last"]);
                    assert.strictEqual(
                        utils.hasToken("$first$ $last$"),
                        true);
                    assert.strictEqual(
                        utils.isToken("$first$ $last$"),
                        false);
                    assert.isFalse(
                        utils.getTokenName("$first$ $last$"));
                    
                    done();
                },
                
                "replaces URI escapes": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$token|u$", {token: "Some File.txt"}),
                        "Some%20File.txt");
                    
                    done();
                },
                
                "replaces HTML escapes": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$token|h$", {token: "<script>"}),
                        "&lt;script&gt;");
                    
                    done();
                },
                
                "leaves unrecognized tokens untouched": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$unknown$ $token$", {token: "value"}),
                        "$unknown$ value");
                    
                    done();
                },
                
                "leaves unrecognized dollar signs untouched": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$1.00 $token$", {token: "value"}),
                        "$1.00 value");
                    
                    done();
                },
                
                // NOTE: Recognition of "$default:token$" is a change in
                //       behavior for this API resulting from the introduction
                //       of token namespacing support in the underlying
                //       implementation.
                "(sometimes) recognizes namespaced tokens in the default namespace only": function(done) {
                    assert.strictEqual(
                        utils.replaceTokens("$default:token$", {token: "value"}),
                        "value");
                    assert.deepEqual(
                        utils.discoverReplacementTokens("$default:token$"),
                        ["token"]);
                    assert.strictEqual(
                        utils.hasToken("$default:literal$"),
                        // NOTE: Exception: Does not recognize in this case.
                        false);
                    assert.strictEqual(
                        utils.isToken("$default:literal$"),
                        // NOTE: Exception: Does not recognize in this case.
                        false);
                    assert.strictEqual(
                        utils.getTokenName("$default:literal$"),
                        // NOTE: Exception: Does not recognize in this case.
                        false);
                    
                    assert.strictEqual(
                        utils.replaceTokens("$ns:token$", {token: "value"}),
                        "$ns:token$");
                    assert.deepEqual(
                        utils.discoverReplacementTokens("$ns:token$"),
                        []);
                    assert.strictEqual(
                        utils.hasToken("$ns:literal$"),
                        false);
                    assert.strictEqual(
                        utils.isToken("$ns:literal$"),
                        false);
                    assert.strictEqual(
                        utils.getTokenName("$ns:literal$"),
                        false);
                    
                    done();
                }
            },
            
            // Covers functionality in TokenUtils that is not exercised by
            // the deprecated API above.
            "TokenUtils": {
                "recognizes namespaced tokens": function(done) {
                    assert.deepEqual(
                        TokenUtils.getTokens("$token$ $ns:token$"),
                        [
                            { namespace: 'default', name: 'token' },
                            { namespace: 'ns',      name: 'token' }
                        ]);
                    assert.isTrue(TokenUtils.isToken("$ns:token$"));
                    assert.isTrue(TokenUtils.hasToken("$ns:token$"));
                    
                    done();
                },
                
                "replaces namespaced tokens": function(done) {
                    var tokenRegistry = new Registry();
                    tokenRegistry.getInstance('default', { create: true }).set(
                        'token', 'value1');
                    tokenRegistry.getInstance('ns', { create: true }).set(
                        'token', 'value2');
                    
                    assert.strictEqual(
                        TokenUtils.replaceTokens("$token$ $ns:token$", tokenRegistry),
                        "value1 value2");
                    
                    done();
                },
                
                "does not recognize namespaced tokens in deprecated interface": function(done) {
                    assert.deepEqual(
                        TokenUtils.getTokenNames("$ns:token$"),
                        []);
                    assert.strictEqual(
                        TokenUtils.replaceTokenNames(
                            "$ns:token$",
                            { token: 'value' }),
                        "$ns:token$");
                    assert.strictEqual(
                        TokenUtils.hasTokenName("$ns:token$"),
                        false);
                    assert.strictEqual(
                        TokenUtils.isTokenName("$ns:token$"),
                        false);
                    assert.isFalse(
                        TokenUtils.getTokenName("$ns:token$"),
                        undefined);
                    
                    done();
                },
                
                "can recognize unqualified tokens using a non-default namespace": function(done) {
                    assert.deepEqual(
                        TokenUtils.getTokens("$token1$ $ns2:token2$", {
                            tokenNamespace: 'ns1'
                        }),
                        [
                            { namespace: 'ns1', name: 'token1' },
                            { namespace: 'ns2', name: 'token2' }
                        ]);
                    
                    done();
                },
                
                "can replace unqualified tokens using a non-default namespace": function(done) {
                    var tokenRegistry = new Registry();
                    tokenRegistry.getInstance('ns1', { create: true }).set(
                        'token1', 'value1');
                    tokenRegistry.getInstance('ns2', { create: true }).set(
                        'token2', 'value2');
                    
                    assert.strictEqual(
                        TokenUtils.replaceTokens("$token1$ $ns2:token2$", tokenRegistry, {
                            tokenNamespace: 'ns1'
                        }),
                        "value1 value2");
                    
                    done();
                }
            }
        }
    };
    
    return tests;
});
