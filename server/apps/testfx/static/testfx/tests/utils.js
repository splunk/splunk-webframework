define(function(require, exports, module) {
    var _ = require("underscore");
    var assert = require("../chai").assert;
    var mvc = require("splunkjs/mvc");
    var testutil = require("../testutil");
    var Backbone = require('backbone');
    var utils = require("splunkjs/mvc/utils");

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

        "Utils Tests": {
            "ModelSyncer": {
                "manually syncs 2 models with a prefix": function(done) {
                    var sourceModel = new Backbone.Model();
                    var destModel = new Backbone.Model();

                    var sync = utils.syncModels(sourceModel, destModel, {
                        prefix: 'pre.fix.'
                    });

                    assert.deepEqual(sourceModel.toJSON(), {});
                    assert.deepEqual(destModel.toJSON(), {});

                    sourceModel.set('foo', 'bar');

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar' });
                    assert.deepEqual(destModel.toJSON(), {});

                    sync.push();

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'bar' });

                    destModel.set('pre.fix.foo', 'BAR');

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'BAR' });

                    sync.pull();

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'BAR' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'BAR' });

                    done();
                },
                "bidirectionally syncs 2 models with a prefix": function(done) {
                    var sourceModel = new Backbone.Model();
                    var destModel = new Backbone.Model();

                    utils.syncModels(sourceModel, destModel, {
                        prefix: 'pre.fix.',
                        auto: true
                    });

                    assert.deepEqual(sourceModel.toJSON(), {});
                    assert.deepEqual(destModel.toJSON(), {});

                    sourceModel.set('foo', 'bar');

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'bar' });

                    destModel.set('other.namespace.foo', 'bar');

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'bar', 'other.namespace.foo': 'bar' });

                    destModel.set('pre.fix.bar', 'lorem ipsum');

                    assert.deepEqual(sourceModel.toJSON(), { foo: 'bar', 'bar': 'lorem ipsum' });
                    assert.deepEqual(destModel.toJSON(), { 'pre.fix.foo': 'bar', 'other.namespace.foo': 'bar', 'pre.fix.bar': 'lorem ipsum' });

                    sourceModel.unset('foo');

                    assert.deepEqual(sourceModel.toJSON(), { 'bar': 'lorem ipsum' });
                    assert.deepEqual(destModel.toJSON(), { 'other.namespace.foo': 'bar', 'pre.fix.bar': 'lorem ipsum' });

                    destModel.unset('pre.fix.bar');

                    done();
                },
                "translates alias when syncing 2 models": function(done) {
                    var sourceModel = new Backbone.Model();
                    var destModel = new Backbone.Model();

                    utils.syncModels(sourceModel, destModel, {
                        prefix: 'pre.fix.',
                        alias: {
                            'foobar': 'lorem.ipsum'
                        }
                    }).auto('push').auto('pull');

                    sourceModel.set('foobar','123');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123' });
                    assert.deepEqual(destModel.toJSON(), { 'lorem.ipsum': '123' });

                    destModel.set('lorem.ipsum', '456');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '456' });
                    assert.deepEqual(destModel.toJSON(), { 'lorem.ipsum': '456' });

                    done();
                },
                "allows to explicitly include some options to the sync": function(done) {
                    var sourceModel = new Backbone.Model();
                    var destModel = new Backbone.Model();

                    utils.syncModels(sourceModel, destModel, {
                        prefix: 'prefix.',
                        include: ['foo','bar'],
                        auto: true
                    });

                    sourceModel.set('foobar','123');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123' });
                    assert.deepEqual(destModel.toJSON(), { });

                    destModel.set('prefix.test', '000');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.test': '000' });

                    sourceModel.set('foo', '456');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123', foo: '456' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.test': '000', 'prefix.foo': '456' });

                    destModel.set('prefix.bar', '789');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123', foo: '456', bar: '789' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.test': '000', 'prefix.foo': '456', 'prefix.bar': '789' });

                    done();
                },
                "allows to explicitly exclude some options from the sync": function(done) {
                    var sourceModel = new Backbone.Model();
                    var destModel = new Backbone.Model();

                    utils.syncModels(sourceModel, destModel, {
                        prefix: 'prefix.',
                        exclude: ['foo','bar']
                    }).auto('push').auto('pull');

                    sourceModel.set('foobar','123');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.foobar': '123' });

                    sourceModel.set('foo', '456');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123', foo: '456' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.foobar': '123' });

                    destModel.set('prefix.bar', '789');

                    assert.deepEqual(sourceModel.toJSON(), { foobar: '123', foo: '456' });
                    assert.deepEqual(destModel.toJSON(), { 'prefix.foobar': '123', 'prefix.bar': '789' });

                    done();
                }
            },
            "PageInfo": {
                "correctly handles framework URLs": function(done) {
                    assert.deepEqual(
                            { root: undefined, locale: 'en-us', app: 'testfx', page: 'contexts' },
                            utils.getURLInfo('/dj/en-us/testfx/contexts/')
                    );
                    assert.deepEqual(
                            { root: undefined, locale: 'it-it', app: 'testfx', page: 'contexts' },
                            utils.getURLInfo('/dj/it-it/testfx/contexts/')
                    );
                    done();
                },
                "correctly handles splunkweb URLs without root_endpoint": function(done) {

                    assert.deepEqual(
                            utils.getURLInfo('/en-US/app/bubbles/my_dashboard'),
                            { root: undefined, locale: 'en-US', app: 'bubbles', page: 'my_dashboard' }
                    );

                    assert.deepEqual(
                            utils.getURLInfo('/en-US/app/bubbles/my_dashboard/edit'),
                            { root: undefined, locale: 'en-US', app: 'bubbles', page: 'my_dashboard' }
                    );

                    assert.deepEqual(
                            utils.getURLInfo('/zh_TW/app/bubbles/my_dashboard'),
                            { root: undefined, locale: 'zh_TW', app: 'bubbles', page: 'my_dashboard' }
                    );

                    done();
                },
                "correctly handles splunkweb URLs with root_endpoint": function(done) {
                    assert.deepEqual(
                            utils.getURLInfo('/rooty/en-US/app/bubbles/my_dashboard'),
                            { root: 'rooty', locale: 'en-US', app: 'bubbles', page: 'my_dashboard' }
                    );

                    assert.deepEqual(
                            utils.getURLInfo('/deep/deeep/root_endpoint/en-US/app/bubbles/my_dashboard'),
                            { root: 'deep/deeep/root_endpoint', locale: 'en-US', app: 'bubbles', page: 'my_dashboard' }
                    );

                    done();
                }
            }
        }
    };
});
