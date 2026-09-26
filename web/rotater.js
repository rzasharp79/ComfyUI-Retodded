// Frontend half of MyCustom_Rotater (rotater.py).
// 1. Makes the output socket match the type dropdown (the server side is "*").
// 2. Turns one press of Run into one queued run per item: app.queuePrompt is
//    wrapped to multiply the batch count, and the hidden index widget counts
//    0, 1, 2... in beforeQueued, which the frontend calls before it builds each
//    run. There is no extension hook for queueing, so wrapping app.queuePrompt
//    is what every installed pack does (rgthree, Pixaroma, use-everywhere).
import { app } from "../../scripts/app.js";
import { OUTPUT_TYPES, runCount, splitItems } from "./rotater_core.js";

const NODE_ID = "MyCustom_Rotater";
const MODE_NEVER = 2;
const MODE_BYPASS = 4;

// Runs queued by the current press of Run, before the batch count multiplies it.
let runs = 1;

function widget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

// Rotater nodes that will take part in a run: not muted, not bypassed, output connected.
function activeRotaters(graph, found = []) {
  for (const node of graph.nodes ?? []) {
    if (node.subgraph) activeRotaters(node.subgraph, found);
    const live = node.mode !== MODE_NEVER && node.mode !== MODE_BYPASS;
    if (node.comfyClass === NODE_ID && live && node.outputs?.[0]?.links?.length) found.push(node);
  }
  return found;
}

function applyType(node, pruneLinks) {
  const type = OUTPUT_TYPES[widget(node, "type")?.value] ?? "STRING";
  const output = node.outputs?.[0];
  if (!output || output.type === type) return;
  // Change the socket in place. A copy loses its links, because slot.links is
  // computed from internal state, and Vue nodes redraw an in-place change fine.
  output.type = type;
  output.label = type;

  if (pruneLinks && node.graph) {
    for (const id of [...(output.links ?? [])]) {
      const link = node.graph.getLink(id);
      const input = node.graph.getNodeById(link?.target_id)?.inputs?.[link.target_slot];
      if (input && !LiteGraph.isValidConnection(type, input.type)) node.graph.removeLink(id);
    }
  }
  app.canvas?.setDirty(true, true);
}

app.registerExtension({
  name: "mycustom.Rotater",

  setup() {
    // Presses of Run are handled one after the other, so a second press cannot
    // reset the counters while the first is still being queued.
    let pending = Promise.resolve();
    const queuePrompt = app.queuePrompt;
    app.queuePrompt = function (number, batchCount = 1, ...rest) {
      const result = pending.then(() => {
        const nodes = activeRotaters(app.rootGraph ?? app.graph);
        runs = runCount(nodes.map((n) => splitItems(widget(n, "values")?.value, widget(n, "delimiter")?.value).length));
        for (const node of nodes) node.rotaterRun = 0;
        return queuePrompt.call(app, number, batchCount * runs, ...rest);
      });
      pending = result.catch(() => {});
      return result;
    };
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_ID) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      const node = this;

      const type = widget(node, "type");
      const callback = type.callback;
      type.callback = function () {
        callback?.apply(this, arguments);
        applyType(node, true);
      };

      const index = widget(node, "index");
      index.beforeQueued = () => {
        index.value = (node.rotaterRun ?? 0) % runs;
        node.rotaterRun = (node.rotaterRun ?? 0) + 1;
      };

      applyType(node, false);
    };

    // A loaded workflow restores the dropdown after onNodeCreated; links are
    // left alone here because they were valid when the workflow was saved.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      applyType(this, false);
    };
  },
});
