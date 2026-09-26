// Frontend half of MyCustom_OpenRouter (openrouter.py): the model picker.
// A DOM widget (Vue nodes mode draws nodes as DOM, so canvas hooks never run)
// with modality tabs, search, sort, favorites and a scrolling model table.
// Clicking a row writes the model id into the hidden `model` widget, which is
// what the workflow saves. Favorites are one list for all nodes, kept in the
// hidden ComfyUI setting ReTodded.OpenRouter.Favorites.
// Spec: docs/superpowers/specs/2026-09-26-openrouter-node-design.md
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  SORTS, TABS, formatContext, formatDate, formatPrice, readState, toggleFavorite, visibleModels,
} from "./openrouter_core.js";

const NODE_ID = "MyCustom_OpenRouter";
const FAVORITES = "ReTodded.OpenRouter.Favorites";
const STATE_PROP = "openRouterPicker";
const DEFAULT_SIZE = [400, 640];
const MIN_HEIGHT = 300;

// One model list for every node on the page; each picker re-renders when it changes.
let list = { models: [], error: null, loading: false };
const pickers = new Set();

async function loadModels(refresh) {
  list = { ...list, loading: true, error: null };
  renderAll();
  // Any failure (server down, non-JSON answer) must end in an error line, never an endless "Loading".
  try {
    const response = await api.fetchApi(`/retodded/openrouter/models${refresh ? "?refresh=1" : ""}`);
    const body = await response.json();
    list = response.ok ? { models: body, error: null, loading: false }
      : { models: list.models, error: body.error ?? `HTTP ${response.status}`, loading: false };
  } catch (error) {
    list = { models: list.models, error: error.message || String(error), loading: false };
  }
  renderAll();
}

function renderAll() {
  for (const render of pickers) render();
}

function favorites() {
  return app.extensionManager.setting.get(FAVORITES) ?? [];
}

const CSS = `
/* contain:size keeps the 300-row table from growing the node: Vue nodes size to their content. */
.mc-or{display:flex;flex-direction:column;gap:4px;height:100%;min-height:300px;contain:size;font-size:12px;color:#ccc;}
.mc-or-tabs{display:flex;gap:3px;}
.mc-or-tabs button{flex:1;padding:2px 0;border:0;border-radius:4px;background:#222;color:#aaa;font-size:10px;cursor:pointer;}
.mc-or-tabs button.on{background:#4a78c8;color:#fff;}
.mc-or-bar{display:flex;gap:4px;}
.mc-or-bar input{flex:1;min-width:0;background:#222;border:1px solid #444;border-radius:4px;color:#ddd;padding:2px 6px;}
.mc-or-bar select,.mc-or-bar button{background:#222;border:1px solid #444;border-radius:4px;color:#ddd;cursor:pointer;}
.mc-or-sel{color:#9ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mc-or-list{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;}
.mc-or-list table{width:100%;border-collapse:collapse;}
.mc-or-list th{position:sticky;top:0;background:#2a2a2a;text-align:left;font-weight:normal;color:#888;padding:2px 3px;}
.mc-or-list td{padding:2px 3px;border-bottom:1px solid #3a3a3a;white-space:nowrap;cursor:pointer;}
.mc-or-list td.name{max-width:140px;overflow:hidden;text-overflow:ellipsis;}
.mc-or-list td.num{text-align:right;}
.mc-or-list tr:hover td{background:#333;}
.mc-or-list tr.sel td{background:#3d5a8a;color:#fff;}
.mc-or-star{color:#666;}.mc-or-star.on{color:#f5c542;}
.mc-or-msg{color:#888;padding:6px;}`;

function injectCss() {
  if (document.getElementById("mc-or-css")) return;
  const style = document.createElement("style");
  style.id = "mc-or-css";
  style.textContent = CSS;
  document.head.append(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildPicker(node) {
  const modelWidget = node.widgets.find((w) => w.name === "model");
  const state = () => readState(node.properties[STATE_PROP]);
  const setState = (change) => {
    node.properties[STATE_PROP] = { ...state(), ...change };
    render();
  };

  const root = el("div", "mc-or");
  const tabs = el("div", "mc-or-tabs");
  const bar = el("div", "mc-or-bar");
  const search = el("input");
  search.placeholder = "search…";
  search.addEventListener("input", () => render());
  search.addEventListener("keydown", (e) => e.stopPropagation());
  const sort = el("select");
  for (const s of SORTS) sort.append(new Option(`sort: ${s.label}`, s.value));
  sort.addEventListener("change", () => setState({ sort: sort.value, reverse: false }));
  const direction = el("button");
  direction.title = "Reverse the sort order";
  direction.addEventListener("click", () => setState({ reverse: !state().reverse }));
  const refresh = el("button", null, "↻");
  refresh.title = "Download a fresh model list from OpenRouter";
  refresh.addEventListener("click", () => loadModels(true));
  bar.append(search, sort, direction, refresh);
  const selected = el("div", "mc-or-sel");
  const scroller = el("div", "mc-or-list");
  root.append(tabs, bar, selected, scroller);

  function choose(id) {
    modelWidget.value = id;
    modelWidget.callback?.(id);
    node.setDirtyCanvas?.(true, true);
    render();
  }

  async function star(id) {
    await app.extensionManager.setting.set(FAVORITES, toggleFavorite(favorites(), id));
    renderAll();
  }

  function row(model, favs) {
    const tr = el("tr", model.id === modelWidget.value ? "sel" : "");
    tr.title = model.id;
    const fav = favs.includes(model.id);
    const starCell = el("td", `mc-or-star${fav ? " on" : ""}`, fav ? "★" : "☆");
    starCell.title = fav ? "Remove from favorites" : "Add to favorites";
    starCell.addEventListener("click", (e) => {
      e.stopPropagation();
      star(model.id);
    });
    tr.append(starCell, el("td", "name", model.name), el("td", "num", formatPrice(model.prompt_price)),
      el("td", "num", formatPrice(model.completion_price)), el("td", null, formatDate(model.created)),
      el("td", "num", formatContext(model.context_length)));
    tr.addEventListener("click", () => choose(model.id));
    return tr;
  }

  function render() {
    const s = state();
    tabs.replaceChildren(...TABS.map((t) => {
      const b = el("button", t === s.tab ? "on" : "", t);
      b.addEventListener("click", () => setState({ tab: t }));
      return b;
    }));
    sort.value = s.sort;
    direction.textContent = s.reverse ? "↑" : "↓";
    const current = list.models.find((m) => m.id === modelWidget.value);
    selected.textContent = modelWidget.value ? `Selected: ${current?.name ?? modelWidget.value}` : "No model selected";
    if (list.error) return scroller.replaceChildren(el("div", "mc-or-msg", `Could not load models: ${list.error}. Press ↻ to try again.`));
    if (list.loading && !list.models.length) return scroller.replaceChildren(el("div", "mc-or-msg", "Loading models…"));
    const favs = favorites();
    const rows = visibleModels(list.models, { ...s, search: search.value }, favs);
    const head = el("tr");
    head.append(...["", "name", "in $", "out $", "released", "ctx"].map((h) => el("th", null, h)));
    const table = el("table");
    table.append(head, ...rows.map((m) => row(m, favs)));
    scroller.replaceChildren(rows.length ? table : el("div", "mc-or-msg", "No models match."));
  }

  return { root, render };
}

app.registerExtension({
  name: "mycustom.OpenRouter",
  settings: [{ id: FAVORITES, name: "OpenRouter favorite models", type: "hidden", defaultValue: [] }],
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_ID) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      injectCss();
      const { root, render } = buildPicker(this);
      const widget = this.addDOMWidget("model_picker", "OPENROUTER_PICKER", root, {
        hideOnZoom: false,
        getMinHeight: () => MIN_HEIGHT,
      });
      // Keep the widget out of widgets_values (frontend 1.52 ignores the serialize option).
      widget.serialize = false;
      // Show the picker above the prompt boxes, as in the approved layout.
      this.widgets.splice(this.widgets.indexOf(widget), 1);
      this.widgets.splice(this.widgets.findIndex((w) => w.name === "system_prompt"), 0, widget);
      this._openRouterRender = render;
      pickers.add(render);
      this.setSize([Math.max(this.size[0], DEFAULT_SIZE[0]), Math.max(this.size[1], DEFAULT_SIZE[1])]);
      if (!list.models.length && !list.loading) loadModels(false);
      render();
    };

    // A loaded workflow restores the model id and picker state after onNodeCreated.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      this._openRouterRender?.();
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      onRemoved?.apply(this, arguments);
      pickers.delete(this._openRouterRender);
    };
  },
});
