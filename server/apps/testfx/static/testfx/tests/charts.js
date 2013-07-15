define(function(require, exports, module) {
    var _ = require("underscore");
    var mvc = require("splunkjs/mvc");
    var assert = require("../chai").assert;
    var testutil = require("../testutil");
    var ChartView = require('splunkjs/mvc/chartview');
    var MockSearchManager = require('../mocksearchmanager');

   
    var WAIT_TIME = 300;
    var hookDiv = $("#hook");
    var context = null;

    var tests = {
        before: function(done) {
            done();
        },
        
        beforeEach: function(done) {
            var contextName = testutil.getUniqueName();
            context = new MockSearchManager({
                id: contextName,
                type: "chart",
                preview: true,
                status_buckets: 300
            }).start();
            done();            
        },
        
        after: function(done) {
            done();
        },
        
        afterEach: function(done) {
            context = null;
            done();
        },
        
        "Charts tests": {
            "control elements in DOM": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                container.addClass('chart-wrapper');
                new ChartView({
                    id: containerName+"-test-chart",
                    managerid: context.get('id'),
                    el: container 
                }).render();
                
                _.delay(function(){
                    assert.lengthOf(container.find('.highcharts-container'), 1);
                    done(); 
                }, WAIT_TIME);
            },
            "setting type changes chart type": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                container.addClass('chart-wrapper');

                var chart = new ChartView({
                    id: containerName+"-test-chart",
                    managerid: context.get('id'),
                    type: "bar",
                    el: container 
                }).render();
                
                _.delay(function(){
                    assert.equal(chart.chart.hcConfig.chart.type, 'bar');
                    done(); 
                }, WAIT_TIME);                   
            },   
            "clicked:chart events fired properly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                container.addClass('chart-wrapper');

                var chart = new ChartView({
                    id: containerName+"-test-chart",
                    managerid: context.get('id'),
                    el: container 
                }).render();
                
                chart.on("clicked:chart", function(){
                    done();
                });

                _.delay(function(){
                    //This is the best hackish way of getting the inner chart clicked that we could come up with
                    chart.chart.hcChart.series[0].data[0].firePointEvent('click');
                }, WAIT_TIME);                   
            }, 
            "clicked:legend events fired properly": function(done) {
                var container = testutil.createUniqueDiv(hookDiv, this.test.title);
                var containerName = container.attr("id");
                container.addClass('chart-wrapper');

                var chart = new ChartView({
                    id: containerName+"-test-chart",
                    managerid: context.get('id'),
                    el: container 
                }).render();
                
                chart.on("clicked:legend", function(){
                    done();
                });

                _.delay(function(){
                    //This is the best hackish way of getting the inner chart clicked that we could come up with
                    $(chart.chart.hcChart.series[0].legendItem.element).trigger('click');
                }, WAIT_TIME);              
            }
        },
        "Failing": {  
        },
        "Not yet implemented" : {

            
        }
    };
    
    return tests;
});
