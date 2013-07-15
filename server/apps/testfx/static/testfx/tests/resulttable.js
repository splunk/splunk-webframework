define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var ResultTableView = require('splunkjs/mvc/tableview');
    var SearchManager = require('splunkjs/mvc/searchmanager');
    var MockSearchManager = require('../mocksearchmanager');

    var WAIT_TIME = 100;
    var hookDiv = $("#hook");
    var context = null;

    var tests = {
        before: function(done) {
            done();
        },
        
        beforeEach: function(done) {
            // NOTE: contexts are created here but not controls
            // this is so that we can put the controls in divs
            // from the tests so that the divs get titles
            var contextName = testutil.getUniqueName();
            context = new MockSearchManager({
                id: contextName,
                type: "resulttable",
                preview: "True",
                status_buckets: 300
            });
            done();
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Result table tests": {          
            "control elements in DOM when no context present": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new ResultTableView({
                    id: containerName + "-test-resulttable",
                    managerid: "fake-search",
                    el: container, 
                }).render();
                context.start();

                //check for head and body
                assert.lengthOf(container.find('.table thead'), 1);
                assert.lengthOf(container.find('.table tbody'), 1);

                _.delay(function(){
                    //check there are no columns or rows
                    assert.lengthOf(container.find('.table thead th'), 0, 'not expecting table columns' );
                    assert.lengthOf(container.find('.table tbody tr'), 0, 'not expecting table rows' );
                    done();
                }, WAIT_TIME);                 
            }, 
            "column and row elements in DOM when valid search is bound": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                new ResultTableView({
                    id: containerName + "-test-resulttable",
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();

                _.delay(function(){
                    //check that there are valid rows
                    assert.equal(container.find('.table thead th').length, 3, 'expected 3 columns in table' );
                    assert.equal(container.find('.table tbody tr').length, 9, 'expected 9 rows in table' );

                    // TODO: Check some header cell
                    // TODO: Check some row cell

                    done();
                }, WAIT_TIME);                 
            },
            "setting fields works": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var fields = ["artist_name", "_time"]; 
                var table = new ResultTableView({
                    id: containerName + "-test-resulttable",
                    managerid: context.get('id'),
                    fields: fields,
                    el: container, 
                }).render();
                context.start();
                
                //check number of fields is as expected in model
                assert.equal(table.settings.get('fields').length, fields.length);
                assert.equal(table.settings.get('fields')[0], fields[0]);

                _.delay(function(){
                    //check number of fields is as expected in DOM
                    assert.equal(container.find(' .table thead tr').children().length, fields.length, 'html not right');

                    //check a header value
                    assert.equal($.trim($(container.find(' .table thead tr').children()[0]).text()), fields[0], "wrong header value");
                    // TODO: Check some row cell
                    done();
                }, WAIT_TIME); 
            },

            "row click event fires right": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var table = new ResultTableView({
                    id: containerName + "-test-resulttable",
                    pageSize : 3,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();

                table.on("clicked:row", function(e){
                    // TODO: check arguments of e
                    done(); 
                });

                context.on("search:done", function(e){
                    _.delay(function() {
                        $(container.find('table tbody tr td')[0]).click();
                    }, WAIT_TIME);
                });          
            },
            
            "cell click event fires right": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var table = new ResultTableView({
                    id: containerName + "-test-resulttable",
                    pageSize : 3,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();

                table.on("clicked:cell", function(e){
                    // Check values of e
                    done();
                });

                context.on("search:done", function(e){
                    _.delay(function() {
                        $(container.find('table tbody tr td')[0]).click();
                    }, WAIT_TIME);
                });                   
            },

            "setting pageSize works": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");

                var pageSize = 2;

                var table = new ResultTableView({
                    id: containerName + "-test-resulttable",
                    pageSize: pageSize,
                    managerid: context.get('id'),
                    el: container, 
                }).render();
                context.start();
                
                context.on("search:done", function(e){
                    _.delay(function() {
                        // The mock results model does not handle the notion of 
                        // pagination (which would be too complicated to implement
                        // just for a mock). As such, we check to see that it 
                        // got the right value in the request.
                        assert.equal(table.resultsModel.get('count'), pageSize);

                        done();
                    }, WAIT_TIME);
                });
            },
        },
        "Failing": {
        },
        "Not yet implemented":{
            "check setting page": function(done) {
                done();                
            },
            // paginator
            // custom row renderer
            // custom cell formatters
            // custom header renderer
            // custom datasource name
            // change context instance
        }
    };
    
    return tests;
});
