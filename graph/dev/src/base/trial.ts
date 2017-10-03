import './shared.css';
import './trial.css';

import {
  BaseType as d3_BaseType,
  Selection as d3_Selection,
  select as d3_select,
  event as d3_event,
  mouse as d3_mouse,

} from 'd3-selection';

import {
  HierarchyPointNode as d3_HierarchyPointNode,
  TreeLayout as d3_TreeLayout,
  tree as d3_tree,
  hierarchy as d3_hierarchy,
} from 'd3-hierarchy';

import {
  zoom as d3_zoom,
  zoomIdentity as d3_zoomIdentity,
} from 'd3-zoom';

import {
  rgb as d3_rgb,
} from 'd3-color';

import * as fs from 'file-saver';

import {
  MultiGraphData, TrialNodeData, TrialGraphData, TrialEdgeData, TrialNodeInfoData
} from './structure';

import {
  CallerMap
} from './callermap';

import {
  diagonal, wrap
} from './helpers';


export
interface VisibleNode extends d3_HierarchyPointNode<TrialNodeData> {
  _children: d3_HierarchyPointNode<TrialNodeData>[];
  children: d3_HierarchyPointNode<TrialNodeData>[];
  dy?: number;
  x0?: number;
  y0?: number;
}

export
interface VisibleEdge {
  count: number;
  source: VisibleNode;
  target: VisibleNode;
  trial: number;
  type: string;
  id: string;
}

export
interface TrialConfig {
  customSize?: (g:TrialGraph) => number[];
  customMouseOver?: (g:TrialGraph, d: VisibleNode, name: string) => boolean;
  customMouseOut?: (g:TrialGraph, d: VisibleNode) => boolean;
  customForm?: (g: TrialGraph, form: d3_Selection<d3_BaseType, {}, HTMLElement, any>) => void;

  duration?: number;

  top?: number;
  right?: number;
  bottom?: number;
  left?: number;

  width?: number;
  height?: number;

  useTooltip?: boolean;
  fontSize?: number;
  labelFontSize?: number;

  nodeSizeX?: number;
  nodeSizeY?: number;

}

export
class TrialGraph {

  i: number;
  config: TrialConfig;
  transform: any;

  div: d3_Selection<d3_BaseType, {}, HTMLElement, any>;
  svg: d3_Selection<d3_BaseType, {}, HTMLElement, any>;
  g: d3_Selection<d3_BaseType, {}, HTMLElement, any>;
  zoom: any;
  tooltipDiv: d3_Selection<d3_BaseType, {}, HTMLElement, any>;

  tree: d3_TreeLayout<{}>;

  root: VisibleNode;

  graphId: string;
  nodes: d3_HierarchyPointNode<{}>[];
  allnodes: TrialNodeData[];
  alledges: TrialEdgeData[];

  t1: number;
  t2: number;
  minDuration: { [trial: string]: number };
  maxDuration: { [trial: string]: number };
  totalDuration: { [trial: string]: number };
  maxTotalDuration: number;

  constructor(graphId:string, div: any, config: TrialConfig={}) {
    let self = this;
    this.i = 0;

    let defaultConfig: TrialConfig = {
      customSize: function(g:TrialGraph) {
        return [
          g.config.width,
          g.config.height,
        ]
      },
      customMouseOver: (g:TrialGraph, d: VisibleNode, name: string) => null,
      customMouseOut: (g:TrialGraph, d: VisibleNode) => null,
      customForm: (g: TrialGraph, form: d3_Selection<d3_BaseType, {}, HTMLElement, any>) => null,

      duration: 750,

      top: 50,
      right: 30,
      bottom: 80,
      left: 30,

      width: 900,
      height: 500,

      useTooltip: false,
      fontSize: 10,
      labelFontSize: 10,

      nodeSizeX: 47,
      nodeSizeY: 100,
    };
    this.config = (Object as any).assign({}, defaultConfig, config);


    this.graphId = graphId;

    this.zoom = d3_zoom()
      .on("zoom", () => this.zoomFunction())
      .on("start", () => d3_select('body').style("cursor", "move"))
      .on("end", () => d3_select('body').style("cursor", "auto"))
      .wheelDelta(() => {
        return -d3_event.deltaY * (d3_event.deltaMode ? 120 : 1) / 2000;
      })

    this.div = d3_select(div)
    let form = d3_select(div)
      .append("form")
      .classed("trial-toolbar", true);

    this.svg = d3_select(div)
      .append("div")
      .append("svg")
      .attr("width", this.config.width)
      .attr("height", this.config.height)
      .call(this.zoom);

    this.createMarker('end', 'enormal', 'black');
    this.createMarker('endbefore', 'ebefore', 'red');
    this.createMarker('endafter', 'eafter', 'green');

    this.g = this.svg.append("g")
      .attr("id", this._graphId())
      .attr("transform", "translate(0,0)")
      .classed('TrialGraph', true);

    this.tree = d3_tree()
      .nodeSize([
        this.config.nodeSizeX,
        this.config.nodeSizeY
      ]);

    // **Toolbar**
    this.createToolbar(form);

    // Tooltip
    this.tooltipDiv = d3_select("body").append("div")
      .attr("class", "now-tooltip now-trial-tooltip")
      .style("opacity", 0)
      .on("mouseout", () => {
        this.closeTooltip();
      });

    // Zoom
    this.svg
      .call(this.zoom.transform, d3_zoomIdentity.translate(
        this.config.left + this.config.width / 2,
        this.config.top
      ))
  }

  init(nodes: TrialNodeData[], edges: TrialEdgeData[], minDuration: { [trial: string]: number }, maxDuration: { [trial: string]: number }, t1: number, t2: number) {
    this.t1 = t1;
    this.t2 = t2;

    this.minDuration = minDuration;
    this.maxDuration = maxDuration;
    this.totalDuration = {};
    this.totalDuration[t1] = maxDuration[t1] - minDuration[t1];
    this.totalDuration[t2] = maxDuration[t2] - minDuration[t2];
    this.maxTotalDuration = Math.max(
      this.totalDuration[t1], this.totalDuration[t2]
    );

    let callermap = new CallerMap(nodes, edges);

    let rootnode = callermap.buildTree(callermap.populate());
    if (!rootnode) {
      return;
    }

    this.root = d3_hierarchy(rootnode, function(d) { return d.children; }) as VisibleNode;
    this.root.x0 = 0;
    this.root.y0 = (this.config.width) / 2;

    this.alledges = edges;
    this.allnodes = nodes;
    this.update(this.root);
  }

  createToolbar(form: d3_Selection<d3_BaseType, {}, HTMLElement, any>) {
    let self = this;
    form = form.append("div")
      .classed("buttons", true);
    this.config.customForm(this, form);
    // Reset zoom
    form.append("a")
      .classed("toollink", true)
      .attr("id", "trial-" + this.graphId + "-restore-zoom")
      .attr("href", "#")
      .attr("title", "Restore zoom")
      .on("click", () => this.restorePosition())
    .append("i")
      .classed("fa fa-eye", true)

    // Toggle Tooltips
    let tooltipsToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-tooltips")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-tooltips")
      .attr("value", "show")
      .property("checked", this.config.useTooltip)
      .on("change", () => {
        this.closeTooltip();
        this.config.useTooltip = tooltipsToggle.property("checked");
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-tooltips")
      .attr("title", "Show tooltips on mouse hover")
    .append("i")
      .classed("fa fa-comment", true)

    // Download SVG
    form.append("a")
      .classed("toollink", true)
      .attr("id", "trial-" + this.graphId + "-download")
      .attr("href", "#")
      .attr("title", "Download graph SVG")
      .on("click", () => {
        this.download();
      })
    .append("i")
      .classed("fa fa-download", true)

    // Set Font Size
    let fontToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-fonts")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-fonts")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = fontToggle.property("checked")? "inline-block" : "none";
        fontSize.style("display", display);
        labelFontSize.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-fonts")
      .attr("title", "Set font size")
    .append("i")
      .classed("fa fa-font", true)
    let fontSize = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.fontSize)
      .style("width", "50px")
      .style("display", "none")
      .attr("title", "Node font size")
      .on("change", () => {
        this.config.fontSize = fontSize.property("value");
        this.svg.selectAll(".node text").attr("font-size", this.config.fontSize);
      })
    let labelFontSize = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.labelFontSize)
      .style("width", "50px")
      .style("display", "none")
      .attr("title", "Arrow font size")
      .on("change", () => {
        this.config.labelFontSize = labelFontSize.property("value");
        this.svg.selectAll("text.label_text").attr("font-size", this.config.labelFontSize);
      })

    // Set distances
    let setDistances = function() {
      self.config.nodeSizeX = distanceX.property("value");
      self.config.nodeSizeY = distanceY.property("value");
      self.svg.selectAll(".node text")
        .call(wrap, self.config.nodeSizeX);
      self.tree
        .nodeSize([
          self.config.nodeSizeX,
          self.config.nodeSizeY
        ]);
      self.update(self.root);
    }


    // Set Distance X
    let distanceXToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-distance-x")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-distance-x")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = distanceXToggle.property("checked")? "inline-block" : "none";
        distanceX.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-distance-x")
      .attr("title", "Set horizontal distance")
    .append("i")
      .classed("fa fa-arrows-h", true)
    let distanceX = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.nodeSizeX)
      .style("width", "65px")
      .style("display", "none")
      .attr("title", "Node horizontal distance")
      .on("change", setDistances)

    // Set Distance Y
    let distanceYToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-distance-y")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-distance-y")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = distanceYToggle.property("checked")? "inline-block" : "none";
        distanceY.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-distance-y")
      .attr("title", "Set vertical distance")
    .append("i")
      .classed("fa fa-arrows-v", true)
    let distanceY = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.nodeSizeY)
      .style("width", "65px")
      .style("display", "none")
      .attr("title", "Node vertical distance")
      .on("change", setDistances)

    // Submit
    form.append("input")
      .attr("type", "submit")
      .attr("name", "prevent-enter")
      .attr("onclick", "return false;")
      .style("display", "none");
  }

  load(data: TrialGraphData, t1: number, t2: number) {
    this.init(data.nodes, data.edges, data.min_duration, data.max_duration, t1, t2);
    this.updateWindow();
  }

  restorePosition(): void {
    this.svg
        .call(this.zoom.transform, d3_zoomIdentity.translate(
          this.config.left + this.config.width / 2,
          this.config.top
        ))
  }

  updateWindow(): void {
    let size = this.config.customSize(this);
    this.config.width = size[0];
    this.config.height = size[1];
    this.svg
      .attr("width", size[0])
      .attr("height", size[1]);
  }

  update(source: VisibleNode) {
    let treeData = this.tree(this.root);
    this.nodes = treeData.descendants();

    var node = this.g.selectAll('g.node')
      .data(this.nodes, (d: any) => {return d.id || (d.id = ++this.i); });

    let validNodes: { [key: string]: VisibleNode } = {};
    this.nodes.forEach((node: VisibleNode) => {
      validNodes[node.data.index] = node;
    });

    var edges: VisibleEdge[] = this.alledges.filter((edge: TrialEdgeData) => {
      let source: VisibleNode = validNodes[edge.source];
      let target: VisibleNode = validNodes[edge.target];

      if (source == undefined || target == undefined) {
        return false;
      }
      return true;
    }).map((edge) => {
      let source: VisibleNode = validNodes[edge.source];
      let target: VisibleNode = validNodes[edge.target];
      var copy: any = { ...edge };
      copy.id = edge.source + "-" + edge.target;
      copy.source = source;
      copy.target = target;
      return copy as VisibleEdge;
    });

    this.updateNodes(source, node);
    this.updateLinks(source, edges);
    this.updateLinkLabels(edges);

    // Store old positions for transition
    this.nodes.forEach(function(d: VisibleNode, i: number){
      d.x0 = d.x;
      d.y0 = d.y;
    });

    this.svg.selectAll(".node text")
      .call(wrap, this.config.nodeSizeX - 2);
  }

  download(name?: string) {
    try {
      var isFileSaverSupported = !!new Blob();
    } catch (e) {
      alert("blob not supported");
    }
    name = (name === undefined)? "trial.svg" : name;
    let gnode: any = this.g.node()
    var bbox = gnode.getBBox();
    var width = this.svg.attr("width"), height = this.svg.attr("height");
    this.g.attr("transform", "translate(" + (-bbox.x + 5) +", " +(-bbox.y + 5) +")");
    let svgNode: any = this.svg
      .attr("title", "Trial")
      .attr("version", 1.1)
      .attr("width", bbox.width + 10)
      .attr("height", bbox.height + 10)
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .node();
    var html = svgNode.parentNode.innerHTML;
    html = '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ' + html.slice(4);
    this.svg
      .attr("width", width)
      .attr("height", height);
    this.g.attr("transform", this.transform);
    var blob = new Blob([html], {type: "image/svg+xml"});
    fs.saveAs(blob, name);
  }

  private calculateColor(d: TrialNodeInfoData): any {
    var proportion = Math.round(255 * (1.0 - (d.duration / this.maxTotalDuration)));
    //Math.round(510 * (node.duration - self.min_duration[node.trial_id]) / self.total_duration[node.trial_id]);
    return d3_rgb(255, proportion, proportion, 255).toString();
  }

  private closeTooltip(): void {
    this.tooltipDiv.transition()
      .duration(500)
      .style("opacity", 0);
    this.tooltipDiv.classed("hidden", true);
  }

  private showTooltip(d: TrialNodeInfoData) {
    this.tooltipDiv.classed("hidden", false);
    this.tooltipDiv.transition()
      .duration(200)
      .style("opacity", 0.9);
    this.tooltipDiv.html(d.info)
      .style("left", (d3_event.pageX - 3) + "px")
      .style("top", (d3_event.pageY - 28) + "px");
  }

  private createMarker(name: string, cls: string, fill: string) {
    this.svg.append("svg:defs").selectAll("marker")
      .data([name])
      .enter().append("svg:marker")
        .attr("id", this.graphId + "-" + name)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
      .append("svg:path")
        .classed(cls, true)
        .attr("fill", fill)
        .attr("d", "M0,-5L10,0L0,5");
  }

  private defaultNodeStroke(d: VisibleNode) {
    if (this.t1 != this.t2 && d.data.node) {
      if (d.data.node.trial_id == this.t1) {
        return "red";
      } else if (d.data.node.trial_id == this.t2) {
        return "green";
      }
    }
    return "#000";
  }

  private nodeClick(d: VisibleNode) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else {
      d.children = d._children;
      d._children = null;
    }
    this.update(d);
  }

  private updateNodes(source: VisibleNode, node: any) {
    let self = this;
    var nodeEnter = node.enter().append('g')
      .attr("id", (d: VisibleNode) => {
        return "node-" + this.graphId + "-" + d.data.index;
      })
      .attr('class', 'node')
      .attr("cursor", "pointer")
      .attr('transform', (d: VisibleNode) => {
        return "translate(" + source.x + "," + source.y + ")";
      })
      .on('click', (d: VisibleNode) => this.nodeClick(d))
      .on('mouseover', function(d: VisibleNode) {
        if (self.config.useTooltip) {
          self.closeTooltip();
          if (d.data.node) {
            self.showTooltip(d.data.node);
          } else if (d3_mouse(this)[0] < 10) {
            self.showTooltip(d.data.node1);
          } else {
            self.showTooltip(d.data.node2);
          }
        }
        self.config.customMouseOver(self, d, name);
        return false;
      }).on('mouseout', function (d: VisibleNode) {
        self.config.customMouseOut(self, d);
      })

    // Circle for new nodes
    nodeEnter.append('rect')
      .attr('class', 'node')
      .attr('rx', 1e-6)
      .attr('ry', 1e-6)
      .attr('width', 1e-6)
      .attr('height', 1e-6)
      .attr("stroke", (d: VisibleNode) => this.defaultNodeStroke(d))
      .attr("stroke-width", "3px")
      .attr("fill", (d: VisibleNode) => {
        if (d.data.node) {
          return this.calculateColor(d.data.node);
        }
        var grad = this.svg.append("svg:defs")
          .append("linearGradient")
          .attr("id", "grad-" + this.graphId + "-" + d.data.index)
          .attr("x1", "100%")
          .attr("x2", "0%")
          .attr("y1", "0%")
          .attr("y2", "0%");
        grad.append("stop")
          .attr("offset", "50%")
          .attr("stop-color", this.calculateColor(d.data.node2));
        grad.append("stop")
          .attr("offset", "50%")
          .attr("stop-color", this.calculateColor(d.data.node1));

        return "url(#grad-" + this.graphId + "-" + d.data.index + ")";
      });

    // Text for new nodes
    nodeEnter.append('text')
      .attr("dy", ".35em")
      .attr("font-family", "sans-serif")
      .attr("font-size", this.config.fontSize + "px")
      .attr("pointer-events", "none")
      .attr("fill", "#000")
      .attr("y", 24)
      .attr("x", 10)
      .attr("text-anchor", "middle")
      .text((d: VisibleNode) => { return d.data.name; });

    nodeEnter.append("path")
      .attr("stroke", "#000")
      .attr("d", function (d: VisibleNode) {
        if (!d.data.node) {
          return "M10," + 0 +
               "L10," + 20;
        }
        return "M0,0L0,0";
      });

    // Update
    var nodeUpdate = nodeEnter.merge(node);

    // Transition to proper position
    nodeUpdate.transition()
      .duration(this.config.duration)
      .attr("transform", (d: VisibleNode) => {
        d.dy = 0;
        if (d.data.graph == 1) {
          d.dy = -40;
        } else if (d.data.graph == 2) {
          d.dy = 40;
        }
        return "translate(" + (d.x - 10) + "," + (d.y + d.dy - 10) + ")";
      });

    // Update the node attributes and style
    nodeUpdate.select('rect.node')
      .attr('width', 20)
      .attr('height', 20)
      .attr('rx', 20)
      .attr('ry', 20)
      .attr("rx", (d: VisibleNode) => {
        return d._children ? 0 : 20;
      })
      .attr("ry", (d: VisibleNode) => {
        return d._children ? 0 : 20;
      })
      .attr('cursor', 'pointer');

    // Remove exiting nodes
    var nodeExit = node.exit().transition()
      .duration(this.config.duration)
      .attr("transform", function(d: VisibleNode) {
        return "translate(" + source.x + "," + source.y + ")";
      })
      .remove();

    // Reduce node rects size to 0 on exit
    nodeExit.select('rect')
      .attr('rx', 1e-6)
      .attr('ry', 1e-6)
      .attr('width', 1e-6)
      .attr('height', 1e-6);

    // Reduce opacity of labels on exit
    nodeExit.select('text')
      .style('fill-opacity', 1e-6);
  }

  private updateLinks(source: VisibleNode, edges: VisibleEdge[]) {
    var link = this.g.selectAll('path.link')
      .data(edges, (d: VisibleEdge) => d.id);

    // Enter any new links at the parent's previous position.
    var linkEnter = link.enter().insert('path', "g")
      .attr("class", "link")
      .attr("id", (d: VisibleEdge, i: number) => {
        return "pathId-" + this.graphId + "-" + d.id;
      })
      .attr("fill", "none")
      .attr("stroke-width", "1.5px")
      .attr('d', (d: VisibleEdge) => {
        var o = {y: source.y0, x: source.x0}
        return diagonal(o, o)
      })
      .attr("marker-end", (d: VisibleEdge) => {
        if (!d.trial) {
          return "url(#" + this.graphId + "-end)";
        }
        if (d.trial === 1) {
          return "url(#" + this.graphId + "-endbefore)";
        }
        if (d.trial === 2) {
          return "url(#" + this.graphId + "-endafter)";
        }
        return "";
      })
      .attr('stroke', (d: VisibleEdge) => {
        if (d.type === 'sequence') {
          return '#07F';
        }
        return '#666';
      })
      .attr('stroke-dasharray', (d: VisibleEdge) => {
        if (d.type === 'return') {
          return '10,2';
        }
        return 'none';
      });

    // UPDATE
    var linkUpdate = linkEnter.merge(link)

    // Transition back to the parent element position
    linkUpdate.transition()
      .duration(this.config.duration)
      .attr('d', (d: VisibleEdge) => {
        if (d.source.dy == undefined) {
          d.source.dy = 0;
        }
        if (d.target.dy == undefined) {
          d.target.dy = 0;
        }

        let
          sd = d.source.data,
          td = d.target.data,
          x1 = d.source.x,
          y1 = d.source.y + d.source.dy,
          x2 = d.target.x,
          y2 = d.target.y + d.target.dy,
          dx = x2 - x1,
          dy = y2 - y1,
          theta = Math.atan(dx / dy),
          phi = Math.atan(dy / dx),
          r = 10 + 2,
          sin_theta = r * Math.sin(theta),
          cos_theta = r * Math.cos(theta),
          sin_phi = r * Math.sin(phi),
          cos_phi = r * Math.cos(phi),
          m1 = (y2 > y1) ? 1 : -1,
          m2 = (x2 > x1) ? -1 : 1;
        if (d.type === 'initial') {
          // Initial
          return `M ${(x2 - 20)},${(y2 - 20)}
            L ${(x2 - r / 2.0)},${(y2 - r / 2.0)}`;
        } else if (d.type === 'call' || d.type == 'return') {
          // Call/Return
          x1 += m1 * sin_theta;
          x2 += m2 * cos_phi;
          y1 += m1 * cos_theta;
          y2 += m2 * sin_phi;
          if (dx === 0) {
            if (y1 > y2) {
              //y1 -= 10
              y2 += 20
            } else {
              //y1 += 10
              y2 -= 20
            }
          }
          return `M ${x1}, ${y1}
            L ${x2}, ${y2}`;
        } else if (dx === 0 && dy === 0) {
          // Loop
          return `M ${x1}, ${y1}
            A 15,20
              -45,1,1
              ${x2 + 5},${y2 + 8}`;
        } else if (sd.parent_index == td.parent_index) {
          // Same caller
          if (dy === 0 && sd.children_index == td.children_index - 1) {
            // Immediate sequence
            return `M ${x1}, ${y1}
              L ${(x2 + m2 * cos_phi)}, ${y2}`;
          } else {
            let sign = -1;
            if (y1 < y2) {
              x1 += m1 * sin_theta;
              y1 += m1 * cos_theta;
              y2 -= r;
              sign = -1;
            } else if (y2 < y1) {
              x1 += m1 * sin_theta;
              y1 += m1 * cos_theta;
              y2 += r;
              sign = 1;
            } else if (x1 >= x2) {
              y1 += r;
              y2 += r;
              sign = 2;
            } else {
              y1 -= r;
              y2 -= r;
              sign = -1;
            }
            return `M ${x1}, ${y1}
                C ${(x1 + x2) / 2} ${y1 + r * sign},
              ${(x1 + x2) / 2} ${y2 + r * sign},
              ${x2} ${y2}`;
          }
        }
        // Other caller
        x1 += m1 * sin_theta;
        y1 += m1 * cos_theta;
        x2 += m2 * cos_phi;
        y2 += m2 * sin_phi;

        return `M ${x1} ${y1}
            C ${(x1 + x2) / 2} ${y1},
              ${(x1 + x2) / 2} ${y2},
              ${x2} ${y2}`
      });

    // Remove any exiting links
    var linkExit = link.exit()//.transition()
      .attr('d', function(d: VisibleEdge) {
        var o = {x: source.x, y: source.y}
          return diagonal(d.source, d.target)
      })
      .remove();
  }

  private updateLinkLabels(edges: VisibleEdge[]) {
    var labelPath = this.g.selectAll(".label_text")
      .data(edges, (d: VisibleEdge) => d.id);

    var labelEnter = labelPath.enter().append("text")
      .attr("class", "label_text")
      .attr("font-family", "sans-serif")
      .attr("font-size", this.config.labelFontSize + "px")
      .attr("pointer-events", "none")
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .attr("dx", (d: VisibleEdge) => {
        if (d.source.x == d.target.x) {
          return 29;
        }
        return (Math.abs(d.source.x - d.target.x) - 10) / 2;
      })
      .attr("dy", -3)
      .attr("id", (d: VisibleEdge, i: number) => {
        return "pathlabel-" + this.graphId + "-" + d.id;
      })
      .append("textPath")
      .attr("xlink:href", (d: VisibleEdge, i: number) => {
        return "#pathId-" + this.graphId + "-" + d.id;
      })
      .text((d: VisibleEdge) => {
        return (d.type === 'initial') ? '' : d.count;
      });

    labelEnter.merge(labelPath)

    labelPath.exit().remove();
  }

  private zoomFunction() {
    this.closeTooltip();
    this.transform = d3_event.transform;
    this.g.attr("transform", d3_event.transform);
  }

  private _graphId(): string {
    return "trial-graph-" + this.graphId;
  }
}
