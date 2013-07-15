// AppFramework Sankey Plug-In
// ---------------------------
// 
// Provide an easy-to-use plug-in that takes data that relates a
// many-to-many relationship with scores into a Sankey display, a form
// of flow display.  Any relationship between two fields can be
// illustrated, although the most common is 
// "stats count by field1, field2"

require.config({
    shim: {
        "splunkjs/mvc/d3chart/d3/d3.v2": {
            deps: [],
            exports: "d3"
        },
        "examplesfx/contrib/sankey": {
            deps: ["splunkjs/mvc/d3chart/d3/d3.v2"],
            exports: "sankey"
        }
    }
});

define(function(require, exports, module) {

    var _ = require('underscore');
    var d3 = require("splunkjs/mvc/d3chart/d3/d3.v2");
    var sankey = require("examplesfx/contrib/sankey");
    var SimpleSplunkView = require("splunkjs/mvc/simplesplunkview");

    // Import CSS for the sankey chart.
    require("css!examplesfx/sankey.css");

    var SankeyChart = SimpleSplunkView.extend({
        className: "custom-sankey",
        
        // This is how we extend the SimpleSplunkView's options value for
        // this object, so that these values are available when
        // SimpleSplunkView initializes.
        
        initialize: function() {
            _.extend(this.options, {
                formatName: _.identity,
                formatTitle: function(d) {
                    return (d.source.name + ' -> ' + d.target.name +
                            ': ' + d.value); 
                }
            });
            SimpleSplunkView.prototype.initialize.apply(this, arguments);
        },

        // The object this method returns will be passed to the
        // updateView() method as the first argument, to be
        // manipulated according to the data and the visualization's
        // needs.

        createView: function() {
            var margin = {top: 1, right: 1, bottom: 6, left: 1};
            var availableWidth = parseInt(this.$el.width() || 960, 10);
            var availableHeight = parseInt(this.$el.height() || 400, 10);

            this.$el.html("");

            var svg = d3.select(this.el)
                .append("svg")
                .attr("width", availableWidth)
                .attr("height", availableHeight)
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            var sankey = d3.sankey()
                .nodeWidth(15)
                .nodePadding(10)
                .size([availableWidth, availableHeight]);

            var path = sankey.link();
            return { svg: svg, sankey: sankey, path: path, width: availableWidth, height: availableHeight };
        },

        // Where the data and the visualization meet.  Both 'viz' and
        // 'data' are the data structures returned from their
        // respective construction methods, createView() above and
        // onData(), below.

        updateView: function(viz, data) {
            var formatName = this.settings.get('formatName');
            var formatTitle = this.settings.get('formatTitle');
            var that = this;

            viz.sankey
                .nodes(data.nodes)
                .links(data.links)
                .layout(1); 

            var link = viz.svg.append("g").selectAll(".link")
                  .data(data.links)
                  .enter().append("path")
                  .attr("class", "link")
                  .attr("d", viz.path)
                  .style("stroke-width", function(d) { return Math.max(1, d.dy); })
                  .sort(function(a, b) { return b.dy - a.dy; });

            link.append("title")
                  .text(function(d) { 
                      return formatTitle(d); });

            var node = viz.svg.append("g").selectAll(".node")
                  .data(data.nodes)
                  .enter()
                      .append("g")
                      .attr("class", "node")
                      .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });

            var color = d3.scale.category20();

            // Draw the rectangles at each end of the link that
            // correspond to a given node, and then decorate the chart
            // with the names for each node.

            node.append("rect")
                  .attr("height", function(d) { return d.dy; })
                  .attr("width", viz.sankey.nodeWidth())
                  .style("fill", function(d) { d.color = color(d.name.replace(/ .*/, "")); return d.color; })
                  .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
                  .append("title")
                  .text(function(d) { return formatName(d.name) + "\n" + d.value; });

            node.append("text")
                  .attr("x", -6)
                  .attr("y", function(d) { return d.dy / 2; })
                  .attr("dy", ".35em")
                  .attr("text-anchor", "end")
                  .attr("transform", null)
                  .text(function(d) { return formatName(d.name); })
                  .filter(function(d) { return d.x < viz.width / 2; })
                  .attr("x", 6 + viz.sankey.nodeWidth())
                  .attr("text-anchor", "start");

            // This view publishes the 'click:link' event that
            // other Splunk views can then use to drill down
            // further into the data.  We return the source and target
            // names as values to be used in further Splunk searches.
            // This allows us to accept events from the visualization
            // library and provide them consistently to other Splunk
            // views.

            var format_event_data = function(e) {
                return { 
                    source: e.source.name, 
                    target: e.target.name 
                };
            };
            
            link.on('click', function(e) { 
                that.trigger('click:link', format_event_data(e)); 
            });
        },

        // This function turns the three expected data items into data
        // structures Sankey understands, and then calls
        // updateView().  This is the function that is called when
        // new data is available, and triggers the actual rendering of
        // the visualization above.  The data passed here corresponds
        // to the basic format requested by the view.

        formatData: function(data) {
            var nodeList = _.uniq(_.pluck(data, 0).concat(_.pluck(data, 1)));

            var links = _.map(data, function(item) {
                return {
                    source: nodeList.indexOf(item[0]),
                    target: nodeList.indexOf(item[1]),
                    value: parseInt(item[2], 10)
                };
            });

            var nodes = _.map(nodeList, function(node) { return {name: node}; });

            return { nodes: nodes, links: links };
        }
    });

    return SankeyChart;
});
