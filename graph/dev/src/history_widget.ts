import './style/history.css';

import {
  select as d3_select,
  Selection as d3_Selection,
  BaseType as d3_BaseType,
} from 'd3-selection';

import {Widget} from '@phosphor/widgets';

import {HistoryGraph, HistoryConfig, VisibleNode} from './base/history';
import {HistoryGraphData} from './base/structure';
import {json, makeid} from './base/helpers';

import {TrialGraphWidget} from './trial_widget';
import {DiffGraphWidget} from './trial_widget';
import {NowVisPanel} from './nowpanel';
import {TrialInfoWidget} from './trial_info/trial_info_widget';
import {DiffInfoWidget} from './trial_info/diff_info_widget';
import {ConfigWidget} from './config_widget';


export
class HistoryWidget extends Widget {

  name: string;
  cls: string;
  graph: HistoryGraph;
  d3node: d3_Selection<d3_BaseType, {}, HTMLElement, any>;
  config: ConfigWidget;

  static url(script = "*", execution = "*", summarize=true) {
    return ("http://127.0.0.1:5000/trials.json"
      + "?script=" + encodeURIComponent(script)
      + "&execution=" + encodeURIComponent(execution)
      + "&summarize=" + (summarize? "1" : "0")
    )
  }

  static createNode(): HTMLElement {
    let node = document.createElement('div');
    let d3node = d3_select(node);

    let content = d3node.append('div')
      .classed('history-content', true)

    let filterDiv = content.append("div")
    //let filterDiv = form.insert("div", ":first-child")
      .classed("filter", true)
      .classed("hide-toolbar", true);

    let filterInternal = filterDiv.append("div")
      .classed("internal", true);
    let scriptOptions = filterInternal.append("select")
      .attr("name", "script")
      .classed("select-style script-options", true);

    scriptOptions.append("option")
      .attr("value", "*")
      .text("All Scripts");

    let executionOptions = filterInternal.append("select")
      .attr("name", "execution")
      .classed("select-style exec-selection", true)

    executionOptions.append("option")
      .attr("value", "*")
      .text("All Statuses");
    executionOptions.append("option")
      .attr("value", "finished")
      .text("Finished Trials");
    executionOptions.append("option")
      .attr("value", "unfinished")
      .text("Unfinished Trials");
    executionOptions.append("option")
      .attr("value", "backup")
      .text("Backup Trials");

    let summarize = filterInternal.append("div")
      .classed("graph-attr", true);

    summarize.append("input")
      .attr("type", "checkbox")
      .attr("name", "summarize")
      .attr("value", "on")
      .attr("checked", true)
      .classed("summarize", true)
      .attr("id", "history-summarize")

    summarize.append("label")
      .attr("for", "history-summarize")
      .attr("title", "Summarize History")
      .text("Summarize")

    let filterReload = filterInternal.append("a")
      .attr("href", "#")
      .classed("link-button reload-button", true)

    filterReload.append('i')
      .classed("fa fa-refresh", true);

    filterReload.append('span')
      .text('Reload');

    let sub = content.append('div')
      .classed('sub-content', true);

    return node;
  }

  constructor(config: ConfigWidget, name: string, cls: string) {
    super({ node: HistoryWidget.createNode() });
    this.config = config;
    this.d3node = d3_select(this.node);
    this.d3node.select('.reload-button')
      .on("click", () => {
          console.log(this.d3node.select(".summarize").property("checked"));
        this.load(
          this.d3node.select(".script-options").property("value"),
          this.d3node.select(".exec-selection").property("value"),
          this.d3node.select(".summarize").property("checked"),
        )
      })
    //this.setFlag(Widget.Flag.DisallowLayout);
    this.addClass('content');
    this.addClass('trial-widget');
    this.title.label = name;
    this.title.closable = true;
    this.title.caption = `${name} Graph`;
    this.name = name;
    this.cls = cls;
  }

  setGraph(data: HistoryGraphData, config: HistoryConfig={}) {
    let sub = this.node.getElementsByClassName("sub-content")[0];
    sub.innerHTML = "";
    this.graph = new HistoryGraph(this.cls, sub, config);
    this.graph.load(data);
  }

  load(script = "*", execution = "*", summarize=true) {
    let sub = this.node.getElementsByClassName("sub-content")[0];

    json("History", sub, HistoryWidget.url(script, execution, summarize), (data: HistoryGraphData) => {
      this.setGraph(data, {
        width: this.node.getBoundingClientRect().width - 24,
        height: this.node.getBoundingClientRect().height - 24,
        customCtrlClick: (g: HistoryGraph, d: VisibleNode) => {
          var redTrial = g.state.selectedNode;
          var greenTrial = d;

          let diffGraphWidget = new DiffGraphWidget(
            "Diff " + redTrial.display + "-" + greenTrial.display,
            "diff-" + redTrial.title + "-" + greenTrial.title + makeid(),
            +redTrial.title, +greenTrial.title
          );
          let parentDock: NowVisPanel = this.parent as NowVisPanel;

          if (this.config.showInfo()) {
            let diffInfoWidget = new DiffInfoWidget(redTrial.display, greenTrial.display, redTrial.title, greenTrial.title);
            parentDock.addInfoWidget(diffInfoWidget);
            parentDock.activateWidget(diffInfoWidget);
          }

          if (this.config.showTrial()) {
            parentDock.addGraphWidget(diffGraphWidget);
            parentDock.activateWidget(diffGraphWidget);
            diffGraphWidget.load(
              this.config.graphType(),
              this.config.diffLevel(),
              this.config.timeLimit(),
              this.config.useCache()
            );
          }
          return true;
        },
        customSelectNode: (g: HistoryGraph, d: VisibleNode) => {
          let trialGraphWidget = new TrialGraphWidget("Trial " + d.display, "trial-" + d.title + makeid(), +d.title, +d.title);
          let parentDock: NowVisPanel = this.parent as NowVisPanel;

          if (this.config.showInfo()) {
            let trialInfoWidget = new TrialInfoWidget(d);
            parentDock.addInfoWidget(trialInfoWidget);
            parentDock.activateWidget(trialInfoWidget);
          }
          if (this.config.showTrial()) {
            parentDock.addGraphWidget(trialGraphWidget);
            parentDock.activateWidget(trialGraphWidget);
            trialGraphWidget.load(
              this.config.graphType(),
              this.config.useCache()
            );
          }
          return true;
        },
        customForm: (graph, form) => {
          // Toggle Tooltips
          let filterDiv = this.d3node.select(".history-content .filter");

          let scriptOptions = filterDiv.select(".script-options");

          let currentScript = scriptOptions.property("value");

          scriptOptions.html("");

          scriptOptions.append("option")
            .attr("value", "*")
            .text("All Scripts");

          for (let script of data.scripts) {
            scriptOptions.append("option")
              .attr("value", script)
              .text(script);
          }

          scriptOptions.property("value", currentScript);

          let filterToggle = form.append("input")
            .attr("id", "history-" + graph.graphId + "-toolbar-filter-check")
            .attr("type", "checkbox")
            .attr("name", "history-toolbar-filter-check")
            .attr("value", "show")
            .property("checked", filterDiv.classed('visible'))
            .on("change", () => {
              let visible = filterToggle.property("checked");
              filterToggleI
                .classed('fa-circle-o', visible)
                .classed('fa-circle', !visible);
              filterDiv
                .classed('visible', visible)
                .classed('show-toolbar', visible)
                  .classed('hide-toolbar', !visible)
            });
          let filterLabel = form.append("label")
            .attr("for", "history-" + graph.graphId + "-toolbar-filter-check")
          let filterToggleI = filterLabel.append("i")
            .classed('fa', true)
            .classed("fa-circle", !filterDiv.classed('visible'))
            .classed("fa-circle-o", filterDiv.classed('visible'))
        }
      });

    });
  }

  protected onResize(msg: Widget.ResizeMessage): void {
    if (!this.graph) {
      return;
    }
    this.graph.config.width = this.node.getBoundingClientRect().width - 24;
    this.graph.config.height = this.node.getBoundingClientRect().height - 24;
    this.graph.updateWindow();
  }

}
