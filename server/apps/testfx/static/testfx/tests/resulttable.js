define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require("appfx.main");
    var assert = require("testfx/chai").assert;
    var testutil = require("testfx/testutil");

    var lookup = function(name){
        return AppFx.Components.getInstance(name);
    }

    var tests = {
        before: function(done) {
            var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search", {
                    type: "resulttable",
                    preview: "True",
                    status_buckets: 300
            }).start();
            context.on("search:done", function(e){
                done();
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
        
        "Result table tests": {          
            "control elements in DOM": function(done) {
               $('#hook').append("<div id='container1'></div>");

                AppFx.Components.create("appfx-resulttable", "test-resulttable", {
                    contextid: "test-search",
                    el: $("#container1") 
                }).render();

                assert.lengthOf($('#container1 .table thead'), 1);
                assert.lengthOf($('#container1 .table tbody'), 1);

                _.delay(function(){
                    assert($('#container1 .table thead th').length > 1, 'expected more than 1 column in table' );
                }, 40);
                done();                
            },            
            "setting fields works": function(done) {
                var fields = ["artist_name", "_time"];

                $('#hook').append("<div id='container5'></div>");
                var table = AppFx.Components.create("appfx-resulttable", "test-resulttable5", {
                    contextid: "test-search",
                    fields: fields,
                    el: $("#container5") 
                }).render();
                
                assert.equal(table.settings.get('fields').length, fields.length);
                assert.equal(table.settings.get('fields')[0], fields[0]);

                _.delay(function(){
                 
                    assert.equal($('#container5 .table thead tr').children().length, fields.length+1, 'html not right');

                    done();
                }, 20); 
            },
            "row click event fires right": function(done) {
                $('#hook').append("<div id='container6'></div>");
                var table = AppFx.Components.create("appfx-resulttable", "test-resulttable6", {
                    pageSize : 3,
                    contextid: "test-search6",
                    el: $("#container6") 
                }).render();
                var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search6", {
                    type: "resulttable",
                    search: "| inputlookup testdata.csv | head 100",
                }).start();

                var rowClicked = false;

                table.on("clicked:row", function(e){
                    rowClicked = true;
                });

                context.on("search:done", function(e){
                    $('#container6 table tbody tr')[0].click();
                    assert(rowClicked, 'row click missing');
                    done();    
                });          
            },
            "cell click event fires right": function(done) {
                 $('#hook').append("<div id='container7'></div>");
                var table = AppFx.Components.create("appfx-resulttable", "test-resulttable7", {
                    pageSize : 3,
                    contextid: "test-search7",
                    el: $("#container7") 
                }).render();
                var context = AppFx.Components.create("appfx-mocksearchcontext", "test-search7", {
                    type: "resulttable",
                    search: "| inputlookup testdata.csv | head 100",
                }).start();

                var cellClicked = false;

                table.on("clicked:cell", function(e){
                    cellClicked = true;
                });

                context.on("search:done", function(e){
                    //click cell [1] to get events on actual data cell
                    $('#container7 table tbody tr td')[1].click();
                    assert(cellClicked, 'cell click missing');
                    done();    
                });                   
            },
            // "set pageSize, change pageSize": function(done) {
            //     var pageSize = 2;
            //     var newPageSize = 3;

            //     $('#hook').append("<div id='container3'></div>");
            //     var table = AppFx.Components.create("appfx-resulttable", "test-resulttable3", {
            //         pageSize : pageSize,
            //         contextid: "test-search3",
            //         el: $("#container3") 
            //     }).render();
            //     var context = AppFx.Components.create("appfx-searchcontext", "test-search3", {
            //         search: "| inputlookup testdata.csv | head 100",
            //     }).start();

            //     context.on("search:done", function(e){
            //         _.delay(function(){
            //             //check pagesize is right
            //             assert.equal(table.datasource.data().rows.length, pageSize);

            //             //change it
            //             table.settings.set("pageSize", newPageSize);

            //             _.delay(function(){
            //                 //check again
            //                 assert.equal(table.datasource.data().rows.length, newPageSize, "page size didn't update");
            //                 done();
            //             }, 20);
            //         }, 20);
            //     });    
            // },
            // "check number of rows in view": function(done) {
            //     var resultCount = 2;

            //     $('#hook').append("<div id='container2'></div>");
            //     var table = AppFx.Components.create("appfx-resulttable", "test-resulttable2", {
            //         contextid: "test-search2",
            //         el: $("#container2") 
            //     }).render();

            //     var context = AppFx.Components.create("appfx-searchcontext", "test-search2", {
            //         search: "| inputlookup testdata.csv | head "+resultCount,
            //     }).start();
            //     context.on("search:done", function(e){
            //         _.delay(function(){
            //             assert.equal(table.datasource.data().rows.length, resultCount);
            //         }, 40);
            //     });
            //     done();                
            // },
            
            // "check itemCount equals search resutls": function(done) {
            //     var count = 2;

            //     $('#hook').append("<div id='container4'></div>");
            //     var table = AppFx.Components.create("appfx-resulttable", "test-resulttable4", {
            //         contextid: "test-search4",
            //         el: $("#container4") 
            //     }).render();
            //     var context = AppFx.Components.create("appfx-searchcontext", "test-search4", {
            //         search: "| inputlookup testdata.csv | head "+count,
            //     }).start();
            //     context.on("search:done", function(e){
            //         assert.equal(table.settings.get('itemCount'), count);
            //         done();
            //     });                           
            // },
        },
        "Not yet implemented":{
            "data changes when search changes": function(done) {
                done();                
            },
            "check setting page": function(done) {
                done();                
            },
            "paginator shows up": function(done) {
                
                done();                
            }, 
        }
    };
    
    return tests;
});
