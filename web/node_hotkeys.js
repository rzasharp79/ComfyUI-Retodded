// Frontend half of MyCustom_NodeHotkeys (node_hotkeys.py).
// Lists the nodes of the graph this node lives in with a digit hotkey and a
// zoom per row. Pressing the digit pans the canvas so that node's title bar
// sits at the top-left of the viewport at that zoom, shifted by the offset
// from the gear panel. Header clicks sort by ID, Name, X or Y; header grips
// resize the columns.
// Legacy app.registerExtension API on purpose: the v2 extension API cannot read
// node positions, and a DOM widget renders in both the classic renderer and
// Vue nodes mode. Pure logic lives in node_hotkeys_core.js.
// Spec: docs/superpowers/specs/2026-09-17-node-hotkeys-design.md
import { app } from "../../scripts/app.js";
import {
  HOTKEY_MIN,
  ZOOM_STEP,
  clampOffset,
  clampWidth,
  compareIds,
  findTarget,
  nextSort,
  panOffsetFor,
  pruneRows,
  readSettings,
  readState,
  rowFor,
  setRow,
  sortNodes,
} from "./node_hotkeys_core.js";

const NODE_ID = "MyCustom_NodeHotkeys";
const STATE_PROP = "nodeHotkeys";
const SETTINGS_PROP = "nodeHotkeysSettings";
const DEFAULT_SIZE = [420, 260];
const MIN_HEIGHT = 120;
const NAME_MIN = 40;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Header cells: column class, label, sortable, and which edge carries the
// resize grip. Columns right of Name grow leftwards into it, so their grip is
// on the left edge.
const HEAD = [
  { col: "id", label: "ID", sortable: true, grip: 1 },
  { col: "name", label: "Name", sortable: true, grip: 0 },
  { col: "x", label: "X", sortable: true, grip: -1 },
  { col: "y", label: "Y", sortable: true, grip: -1 },
  { col: "key", label: "Key", sortable: false, grip: -1 },
  { col: "zoom", label: "Zoom", sortable: false, grip: -1 },
];

const CSS = `
.mc-nh-root{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:2px 0;font-family:'Segoe UI',system-ui,sans-serif;color:#ddd;}
.mc-nh-top{display:flex;align-items:center;gap:6px;height:32px;padding:4px 8px 6px;box-sizing:border-box;}
.mc-nh-count{font-size:11px;padding:2px 8px;border-radius:5px;background:rgba(246,103,68,.18);color:#f99877;}
.mc-nh-btn{margin-left:auto;height:22px;padding:0 7px;font:11px 'Segoe UI',system-ui,sans-serif;border-radius:5px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;}
.mc-nh-btn:hover{border-color:#f66744;background:#f66744;color:#fff;}
.mc-nh-btn+.mc-nh-btn{margin-left:0;}
.mc-nh-settings{display:flex;align-items:center;gap:8px;margin:0 5px 6px;padding:5px 9px;border-radius:6px;background:rgba(255,255,255,.05);font-size:11px;color:#aaa;}
.mc-nh-settings[hidden]{display:none;}
.mc-nh-settings label{display:flex;align-items:center;gap:4px;}
.mc-nh-off{width:56px;height:20px;border:1px solid rgba(255,255,255,.14);border-radius:4px;background:#1c1c1e;color:#e6e6e6;font:12px 'Segoe UI',system-ui,sans-serif;text-align:center;padding:0;box-sizing:border-box;}
.mc-nh-off:focus{outline:1px solid #f66744;}
.mc-nh-head,.mc-nh-row{display:flex;align-items:center;gap:9px;padding:6px 7px;box-sizing:border-box;border-left:2px solid transparent;}
.mc-nh-head{margin:0 5px;padding-top:0;padding-bottom:2px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#777;}
.mc-nh-head>span{position:relative;white-space:nowrap;}
.mc-nh-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:0 5px 4px;scrollbar-width:thin;scrollbar-color:#555 rgba(0,0,0,.1);}
.mc-nh-row{height:30px;flex:none;border-radius:6px;}
.mc-nh-row:hover{background:rgba(255,255,255,.04);}
.mc-nh-row.on{border-left-color:#f66744;}
.mc-nh-id{flex:none;width:var(--mc-nh-id);box-sizing:border-box;text-align:center;font-size:10.5px;color:rgba(255,255,255,.5);background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;}
.mc-nh-head .mc-nh-id{background:transparent;color:#777;font-size:10px;padding:0;}
.mc-nh-name{flex:1;min-width:0;font-size:13px;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mc-nh-row.on .mc-nh-name{color:#fff;}
.mc-nh-head .mc-nh-name{color:#777;font-size:10px;}
.mc-nh-x,.mc-nh-y{flex:none;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:#bbb;}
.mc-nh-x{width:var(--mc-nh-x);}
.mc-nh-y{width:var(--mc-nh-y);}
.mc-nh-head .mc-nh-x,.mc-nh-head .mc-nh-y{color:#777;font-size:10px;}
.mc-nh-row .mc-nh-id,.mc-nh-row .mc-nh-x,.mc-nh-row .mc-nh-y{overflow:hidden;}
.mc-nh-key{flex:none;width:var(--mc-nh-key);}
.mc-nh-zoom{flex:none;width:var(--mc-nh-zoom);}
.mc-nh-head .mc-nh-key,.mc-nh-head .mc-nh-zoom{text-align:center;}
.mc-nh-head .mc-nh-sort{cursor:pointer;}
.mc-nh-head .mc-nh-sort:hover,.mc-nh-head .mc-nh-sort.on{color:#ddd;}
.mc-nh-grip{position:absolute;top:-3px;bottom:-1px;width:9px;cursor:col-resize;}
.mc-nh-grip.r{right:-9px;}
.mc-nh-grip.l{left:-9px;}
.mc-nh-grip::after{content:"";position:absolute;top:2px;bottom:2px;left:4px;width:1px;background:rgba(255,255,255,.14);}
.mc-nh-grip:hover::after{background:#f66744;}
.mc-nh-step{display:inline-flex;align-items:center;height:20px;border-radius:10px;background:rgba(255,255,255,.08);overflow:hidden;box-sizing:border-box;}
.mc-nh-arr{flex:none;width:18px;height:20px;border:0;padding:0;background:transparent;color:rgba(255,255,255,.5);font-size:11px;line-height:20px;cursor:pointer;}
.mc-nh-arr:hover{color:#fff;background:rgba(255,255,255,.1);}
.mc-nh-val{flex:1;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;color:#e6e6e6;cursor:text;}
.mc-nh-input{flex:1;min-width:0;height:20px;border:0;outline:1px solid #f66744;background:#1c1c1e;color:#e6e6e6;font:12px 'Segoe UI',system-ui,sans-serif;text-align:center;padding:0;box-sizing:border-box;}
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── state ──────────────────────────────────────────────────────────────────
function getState(node) {
  return readState(node.properties?.[STATE_PROP]);
}

function putState(node, state) {
  node.properties[STATE_PROP] = state;
}

function getSettings(node) {
  return readSettings(node.properties?.[SETTINGS_PROP]);
}

function putSettings(node, settings) {
  node.properties[SETTINGS_PROP] = settings;
}

// ── rows ───────────────────────────────────────────────────────────────────
// One `◂ value ▸` pill. Arrows step; clicking the value swaps in an <input>
// (Enter or blur commits, Escape cancels). Clamping happens in setRow, so
// out-of-range steps simply stick at the edge.
function buildStepper({ value, step, cls, format, onChange }) {
  const wrap = el("span", "mc-nh-step " + cls);
  const dec = el("button", "mc-nh-arr", "◂");
  const inc = el("button", "mc-nh-arr", "▸");
  const val = el("span", "mc-nh-val", format(value));
  dec.type = "button";
  inc.type = "button";
  dec.addEventListener("click", () => onChange(value - step));
  inc.addEventListener("click", () => onChange(value + step));
  val.addEventListener("click", () => {
    const input = el("input", "mc-nh-input");
    input.value = format(value);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && input.value !== format(value)) onChange(input.value);
      else input.replaceWith(val);
    };
    // Digits typed here must edit the field, never fire a hotkey command.
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    val.replaceWith(input);
    input.focus();
    input.select();
  });
  wrap.append(dec, val, inc);
  return wrap;
}

function commit(node, root, id, patch) {
  putState(node, setRow(getState(node), id, patch));
  render(node, root);
}

function buildRow(node, root, target) {
  const row = rowFor(getState(node), target.id);
  const tr = el("div", "mc-nh-row" + (row.hotkey !== HOTKEY_MIN ? " on" : ""));
  const name = el("span", "mc-nh-name", target.name);
  name.title = target.type;
  tr.append(
    el("span", "mc-nh-id", String(target.id)),
    name,
    el("span", "mc-nh-x", String(target.x)),
    el("span", "mc-nh-y", String(target.y)),
    buildStepper({
      value: row.hotkey,
      step: 1,
      cls: "mc-nh-key",
      format: (v) => (v === HOTKEY_MIN ? "–" : String(v)),
      onChange: (v) => commit(node, root, target.id, { hotkey: v }),
    }),
    buildStepper({
      value: row.zoom,
      step: ZOOM_STEP,
      cls: "mc-nh-zoom",
      format: (v) => v.toFixed(2),
      onChange: (v) => commit(node, root, target.id, { zoom: v }),
    }),
  );
  return tr;
}

// ── header ─────────────────────────────────────────────────────────────────
function applyWidths(root, widths) {
  for (const [col, px] of Object.entries(widths)) {
    root.style.setProperty(`--mc-nh-${col}`, `${px}px`);
  }
}

// Drag handle on one edge of a header cell. `sign` is 1 when dragging right
// widens the column and -1 when dragging left does. The widget is drawn at the
// canvas zoom, so screen px are divided by the scale to get widget px.
function buildGrip(node, root, col, sign) {
  const grip = el("span", "mc-nh-grip " + (sign === 1 ? "r" : "l"));
  // A drag that ends over the header must not count as a sort click.
  grip.addEventListener("click", (e) => e.stopPropagation());
  grip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = getSettings(node).widths[col];
    // Every px a column gains comes out of Name; stop before Name vanishes.
    const nameWidth = root.querySelector(".mc-nh-head .mc-nh-name").offsetWidth;
    const room = Math.max(0, nameWidth - NAME_MIN);
    const move = (ev) => {
      const settings = getSettings(node);
      const dx = (sign * (ev.clientX - startX)) / app.canvas.ds.scale;
      settings.widths[col] = clampWidth(col, startWidth + Math.min(dx, room));
      putSettings(node, settings);
      applyWidths(root, settings.widths);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener(
      "lostpointercapture",
      () => grip.removeEventListener("pointermove", move),
      { once: true },
    );
  });
  return grip;
}

function buildHeadCell(node, root, { col, label, sortable, grip }, sort) {
  const active = sortable && sort.key === col;
  const text = active ? `${label} ${sort.dir === 1 ? "▲" : "▼"}` : label;
  const cell = el("span", `mc-nh-${col}`, text);
  if (sortable) {
    cell.classList.add("mc-nh-sort");
    if (active) cell.classList.add("on");
    cell.addEventListener("click", () => {
      const settings = getSettings(node);
      settings.sort = nextSort(settings.sort, col);
      putSettings(node, settings);
      render(node, root);
    });
  }
  if (grip) cell.append(buildGrip(node, root, col, grip));
  return cell;
}

// Rebuild the header and the list from the node snapshot taken at the last
// refresh. Positions deliberately do NOT track live drags; that is what
// Refresh is for. Sorting reorders that same snapshot.
function render(node, root) {
  const settings = getSettings(node);
  const nodes = sortNodes(root._nodes ?? [], settings.sort);
  applyWidths(root, settings.widths);
  root.querySelector(".mc-nh-count").textContent =
    `${nodes.length} node${nodes.length === 1 ? "" : "s"}`;
  root.querySelectorAll(".mc-nh-off").forEach((input, axis) => {
    input.value = settings.offset[axis];
  });
  root
    .querySelector(".mc-nh-head")
    .replaceChildren(...HEAD.map((h) => buildHeadCell(node, root, h, settings.sort)));
  root.querySelector(".mc-nh-list").replaceChildren(...nodes.map((n) => buildRow(node, root, n)));
}

function refresh(node, root) {
  if (!root || !node.graph) return;
  root._nodes = node.graph._nodes.map((n) => ({
    id: n.id,
    name: n.title || n.type,
    type: n.type,
    x: Math.round(n.pos[0]),
    y: Math.round(n.pos[1]),
  }));
  putState(node, pruneRows(getState(node), root._nodes.map((n) => n.id)));
  render(node, root);
}

// Gear panel: how far from the viewport's top-left a hotkey press puts the
// node, in screen px. One pair per Node Hotkeys node, used by all its keys.
function buildSettings(node) {
  const panel = el("div", "mc-nh-settings");
  panel.hidden = true;
  panel.title = "Where a node lands when you press its key, in pixels from the top-left of the view";
  panel.append(el("span", "", "Default offset"));
  ["X", "Y"].forEach((label, axis) => {
    const wrap = el("label", "", label);
    const input = el("input", "mc-nh-off");
    input.type = "number";
    // Digits typed here must edit the field, never fire a hotkey command.
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("change", () => {
      const settings = getSettings(node);
      settings.offset[axis] = clampOffset(input.value);
      putSettings(node, settings);
      input.value = settings.offset[axis];
    });
    wrap.append(input);
    panel.append(wrap);
  });
  return panel;
}

function buildRoot(node) {
  const root = el("div", "mc-nh-root");
  const top = el("div", "mc-nh-top");
  const btn = el("button", "mc-nh-btn", "Refresh");
  btn.type = "button";
  btn.addEventListener("click", () => refresh(node, root));
  const panel = buildSettings(node);
  const gear = el("button", "mc-nh-btn", "⚙︎");
  gear.type = "button";
  gear.title = "Settings";
  gear.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });
  top.append(el("span", "mc-nh-count", "0 nodes"), btn, gear);

  root.append(top, panel, el("div", "mc-nh-head"), el("div", "mc-nh-list"));
  return root;
}

// ── hotkeys ────────────────────────────────────────────────────────────────
function hotkeyNodesOf(graph) {
  return graph._nodes
    .filter((n) => n.type === NODE_ID)
    .sort((a, b) => compareIds(a.id, b.id));
}

// Runs for the graph currently on screen (app.canvas.graph), so a Node Hotkeys
// node placed inside a subgraph works while that subgraph is open. Silent
// no-op when nothing is assigned or the target is gone.
function goTo(hotkey) {
  const canvas = app.canvas;
  const graph = canvas?.graph;
  if (!graph || !canvas.ds) return;
  const owners = hotkeyNodesOf(graph);
  const hit = findTarget(owners.map(getState), hotkey);
  if (!hit) return;
  const target = graph.getNodeById(hit.id);
  if (!target) return;
  const titleH = window.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  const { offset } = getSettings(owners[hit.index]);
  const [ox, oy] = panOffsetFor(target.pos, hit.zoom, titleH, offset);
  canvas.ds.scale = hit.zoom;
  canvas.ds.offset[0] = ox;
  canvas.ds.offset[1] = oy;
  canvas.setDirty(true, true);
}

// ── extension ──────────────────────────────────────────────────────────────
app.registerExtension({
  name: "mycustom.NodeHotkeys",
  // Core's keybinding system: skips text inputs, reports conflicts, and lets
  // the user rebind in Settings > Keybinding. Frontend 1.52 binds no bare digit.
  commands: DIGITS.map((n) => ({
    id: `MyCustom.NodeHotkeys.Go${n}`,
    label: `Node Hotkeys: go to node ${n}`,
    function: () => goTo(n),
  })),
  keybindings: DIGITS.map((n) => ({
    combo: { key: String(n) },
    commandId: `MyCustom.NodeHotkeys.Go${n}`,
  })),
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_ID) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      injectCss();
      const root = buildRoot(this);
      const widget = this.addDOMWidget("node_hotkeys", "NODE_HOTKEYS", root, {
        hideOnZoom: false,
        getMinHeight: () => MIN_HEIGHT,
      });
      // Keep the widget out of widgets_values. The `serialize: false` option
      // is ignored by frontend 1.52; the widget property is what serialize() checks.
      widget.serialize = false;
      this._nodeHotkeysRoot = root;
      this.setSize([
        Math.max(this.size[0], DEFAULT_SIZE[0]),
        Math.max(this.size[1], DEFAULT_SIZE[1]),
      ]);
    };

    // onNodeCreated runs before the node joins a graph, so the first useful
    // snapshot is taken here.
    const onAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function () {
      onAdded?.apply(this, arguments);
      refresh(this, this._nodeHotkeysRoot);
    };

    // On workflow load LGraph.configure() adds every node, then configures
    // them one by one; sibling nodes configured after this one still have
    // stale positions. A microtask runs after that synchronous loop ends.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      queueMicrotask(() => refresh(this, this._nodeHotkeysRoot));
    };
  },
});
