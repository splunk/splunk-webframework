define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var mvc = require("splunkjs/mvc");
    var testutil = require("../testutil");
    var Backbone = require('backbone');
    var SearchManager = require("splunkjs/mvc/searchmanager");
    var SearchTemplate = require("splunkjs/mvc/searchtemplate");
    var SearchQueryModel = require("splunkjs/mvc/searchmodel").SearchQuery;

    return {
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

        "SearchManager Tests": {
            "SearchManager": {
                "correctly adds the leading search command to a non-qualified search": function(done) {
                    var manager = new SearchManager({ search: 'index=foo | stats count', autostart: false });

                    assert.equal(manager.query.get('search'), 'index=foo | stats count');
                    assert.equal(manager.query.resolve(), 'index=foo | stats count');
                    assert.equal(manager.query.resolve({ qualified: true }), 'search index=foo | stats count');

                    done();
                },
                "correctly parses a qualified search": function(done){
                    var manager = new SearchManager({ search: 'search index=foo | stats count', autostart: false }, { qualified: true });

                    assert.equal(manager.query.get('search'), 'index=foo | stats count');
                    assert.equal(manager.query.resolve(), 'index=foo | stats count');
                    assert.equal(manager.query.resolve({ qualified: true }), 'search index=foo | stats count');

                    done();
                }
            },
            "SearchTemplate": {
                "correctly adds the leading search command to a non-qualified search": function(done) {
                    var manager = new SearchTemplate({ search: 'index=foo | stats count', autostart: false });

                    assert.equal(manager.query.get('search'), 'index=foo | stats count');
                    assert.equal(manager.query.resolve(), 'index=foo | stats count');
                    assert.equal(manager.query.resolve({ qualified: true }), 'search index=foo | stats count');

                    done();
                },
                "correctly parses a qualified search": function(done){
                    var manager = new SearchTemplate({ search: 'search index=foo | stats count', autostart: false }, { qualified: true });

                    assert.equal(manager.query.get('search'), 'index=foo | stats count');
                    assert.equal(manager.query.resolve(), 'index=foo | stats count');
                    assert.equal(manager.query.resolve({ qualified: true }), 'search index=foo | stats count');

                    done();
                }
            },
            "SearchQueryModel": {
                "has a symmetric search property when using qualified: true": function(done) {
                    var model = new SearchQueryModel();

                    model.set('search','search index=foo',{ qualified: true });
                    assert.equal(model.get('search', { qualified: true }), 'search index=foo');

                    model.set('search', 'index=bar');
                    assert.equal(model.get('search'), 'index=bar');

                    done();
                },
                
                "fails to resolve search when not all tokens are present": function(done) {
                    var model = new SearchQueryModel();
                    model.set('search', 'index=$token1$ nontoken$ $token2$')
                    assert.equal(model.resolve(), undefined);
                    
                    model.set('token1', 'foo');
                    assert.equal(model.resolve(), undefined);
                    
                    model.set('nontoken', 'bar');
                    assert.equal(model.resolve(), undefined);
                    
                    model.set('token2', 'baz');
                    assert.equal(model.resolve(), 'index=foo nontoken$ baz');
                    
                    done();
                }
            }
        }
    };
});
