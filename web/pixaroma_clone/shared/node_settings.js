// ╔═══════════════════════════════════════════════════════════════╗
// ║  Pixaroma Shared - Node settings registry + accent colour     ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// ONE place that gives every Pixaroma node two things it used to have to build
// by hand:
//
//   1. A settings panel reachable from BOTH surfaces, with no per-node wiring:
//        - the right-click menu entry ("⚙ <Title> settings")
//        - the orange gear button in ComfyUI's node selection toolbar,
//          sitting next to the Pixaroma ? Help button
//      Both are driven by ONE central extension (js/help_toolbar/index.js) that
//      reads this registry, exactly like registerNodeHelp drives the ? button.
//
//   2. A per-node ACCENT COLOUR, so nobody is stuck with the Pixaroma orange.
//      The colour a node paints with resolves down this chain:
//
//        node.properties[prop]                 this one node's pick
//        -> Pixaroma.<Class>.AccentColor       default for new nodes of this type
//        -> Pixaroma.Accent.Default            master default for ALL Pixaroma nodes
//        -> #f66744                            the Pixaroma orange
//
// ── Adding the colour option to a node (the whole recipe) ────────────────────
//
//   import { registerNodeAccent, accentOf, applyAccent } from "../shared/index.js";
//
//   // 1. register (usually right after the node's help registration)
//   registerNodeAccent("PixaromaMyNode", {
//     title: "My Node",                 // used in the menu + panel header
//     onChange: (node) => repaint(node),// repaint the node face after a pick
//   });
//
//   // 2a. DOM-widget node: set the CSS var on the widget root once, and write
//   //     the node's scoped CSS against it:
//   applyAccent(root, node);            // sets --rpc-acc on that element
//   //     ...and in the node's CSS string use ACC (exported below) instead of
//   //     a hardcoded #f66744:            ".rpc-mn-btn:hover{border-color:" + ACC + ";}"
//   //     The var lives on the node's own root, so two nodes of the same type
//   //     can carry different colours off ONE injected stylesheet.
//
//   // 2b. canvas-painted node: read accentOf(node) inside draw() instead of BRAND.
//
// That is it - the right-click entry, the toolbar gear, the picker, the two
// "save as default" buttons and the persistence all come for free.
//
// A node that already owns a richer settings panel registers it directly with
// registerNodeSettings(class, { title, open(node), ownMenuItem: true }) - the
// ownMenuItem flag tells the central menu hook to stay out of the way because
// that node already adds its own "⚙ ..." line among its other menu entries.
//
// State rules (these are load-bearing, do not "tidy" them away):
//   - The accent is written to node.properties ONLY when the user actually picks
//     a colour. Never on the load path. A clean saved workflow must never open
//     "modified" just because a property key appeared (Vue Compat #18).
//   - Clearing the pick DELETES the key rather than writing the brand colour, so
//     the node goes back to following the defaults instead of freezing today's.
//   - The per-class and master defaults are UNREGISTERED settings (except the
//     master, which also gets a visible row in the Settings panel). ComfyUI
//     persists unregistered setting ids fine (Vue Compat #20).

import { app } from "/scripts/app.js";
import { isVueNodes } from "./nodes2.js";
import { openPixaromaColorPickerPopup, BUTTON_PALETTE } from "./color_picker.js";

export const BRAND = "#f66744";

// The CSS custom property a node's DOM root carries, and the ready-made
// var() string to paste into a node's scoped CSS in place of the hex.
export const ACCENT_VAR = "--rpc-acc";
export const ACC = `var(${ACCENT_VAR},${BRAND})`;

// Master default: every Pixaroma node follows this unless it (or its node type)
// has been given its own colour. Registered as a visible row by the toolbar
// extension so it also shows up in ComfyUI's Settings panel.
export const GLOBAL_ACCENT_SETTING = "MyCustom.PixClone.Accent.Default";

// The node.properties key. Shared across nodes on purpose: one key means the
// accent survives a node being copied between graphs, and it reads the same in
// every workflow JSON. Nodes that already shipped their own key pass `prop`.
export const DEFAULT_ACCENT_PROP = "pixAccent";

// ── registry ─────────────────────────────────────────────────────────────────

const _defs = new Map(); // comfyClass -> def

// "PixaromaOutpaintStitch" -> "MyCustom.PixClone.OutpaintStitch.AccentColor".
// Matches the ids the nodes that predate this module already use, so their
// saved defaults keep working after they move onto the shared chain.
export function classAccentSetting(comfyClass) {
  const tail = String(comfyClass || "").replace(/^Pixaroma/, "") || "Node";
  return `MyCustom.PixClone.${tail}.AccentColor`;
}

// Tolerant read: ComfyUI's own "color" setting widget can hand back a bare
// "f66744" with no hash, so normalise before anything paints with it.
function readSetting(id) {
  try {
    const v = app.ui?.settings?.getSettingValue?.(id);
    if (typeof v === "string" && v.trim()) {
      const s = v.trim();
      return /^[0-9a-fA-F]{3,8}$/.test(s) ? "#" + s : s;
    }
  } catch {}
  return null;
}

async function writeSetting(id, value) {
  try {
    await app.ui.settings.setSettingValueAsync(id, value);
    return true;
  } catch {
    return false;
  }
}

// The master default (or null when the user has never set one).
export function globalAccent() {
  return readSetting(GLOBAL_ACCENT_SETTING);
}

/**
 * Read a setting that is NOT registered in ComfyUI's Settings panel, with an
 * explicit fallback.
 *
 * Node-specific options live on the node's own panel, not in the global Settings
 * panel, so their ids are unregistered. An unregistered id returns `undefined`
 * until something actually writes it - so EVERY read site must supply the
 * default itself. (Registering it instead is what caused the accent bug: a
 * registered default always reads back, so "never chosen" became
 * indistinguishable from "deliberately chosen".)
 */
export function nodeSetting(id, fallback) {
  try {
    const v = app.ui?.settings?.getSettingValue?.(id);
    if (v !== undefined && v !== null) return v;
  } catch {}
  return fallback;
}

/** Write an unregistered node setting. Returns true on success. */
export function setNodeSetting(id, value) {
  return writeSetting(id, value);
}

/**
 * Register a node's own settings panel.
 *   def = {
 *     title:       "Outpaint",            // shown in the menu + toolbar tooltip
 *     open(node),                          // opens the panel
 *     closeFor?(node),                     // teardown when the node is removed
 *     ownMenuItem?: true,                  // node adds its own "⚙" menu line
 *     menuLabel?: "Outpaint settings",     // override the menu text
 *   }
 */
export function registerNodeSettings(comfyClass, def) {
  if (!comfyClass || !def || typeof def.open !== "function") return;
  _defs.set(comfyClass, { ...def, kind: def.kind || "custom" });
}

/**
 * Register a node for the generic accent-only panel. Everything is optional
 * except the class.
 *   opts = {
 *     title:        "Show Text",           // defaults to a de-camelled class name
 *     prop:         "pixAccent",           // node.properties key
 *     setting:      "MyCustom.PixClone.X.AccentColor",
 *     swatchLabel:  "Button colour",       // the row label in the panel
 *     swatchHint:   "This node only. ...", // the small grey line under it
 *     onChange(node),                      // repaint the node face after a pick
 *     ownMenuItem?: true,
 *   }
 */
export function registerNodeAccent(comfyClass, opts = {}) {
  if (!comfyClass) return;
  const def = {
    kind: "accent",
    // Options that used to sit in ComfyUI's Settings panel live here instead, so
    // a node's own settings are all in one place. See the `rows` doc above.
    rows: Array.isArray(opts.rows) ? opts.rows : [],
    onRowChange: typeof opts.onRowChange === "function" ? opts.onRowChange : null,
    // A node with NO orange on its face (3D Builder, Inpaint Crop, Set/Get) can
    // host rows without offering a colour that would change nothing.
    accent: opts.accent !== false,
    title: opts.title || defaultTitle(comfyClass),
    prop: opts.prop || DEFAULT_ACCENT_PROP,
    setting: opts.setting || classAccentSetting(comfyClass),
    swatchLabel: opts.swatchLabel || "Button colour",
    swatchHint: opts.swatchHint || "This node only. Save it as a default below.",
    onChange: typeof opts.onChange === "function" ? opts.onChange : null,
    ownMenuItem: !!opts.ownMenuItem,
    menuLabel: opts.menuLabel || null,
    open: (node) => openAccentPanel(node),
    closeFor: (node) => closeNodeSettingsFor(node),
  };
  _defs.set(comfyClass, def);
}

export function getNodeSettings(comfyClass) {
  return comfyClass ? _defs.get(comfyClass) || null : null;
}

// "PixaromaLoadImageMini" -> "Load Image Mini"
function defaultTitle(comfyClass) {
  return String(comfyClass || "")
    .replace(/^Pixaroma/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim() || "Node";
}

export function openNodeSettings(node) {
  const def = getNodeSettings(node?.comfyClass);
  if (def) def.open(node);
}

// ── accent read / write ──────────────────────────────────────────────────────

function accentPropOf(comfyClass) {
  return getNodeSettings(comfyClass)?.prop || DEFAULT_ACCENT_PROP;
}

/**
 * The colour this node should paint with. Safe to call for a node that never
 * registered anything - it just falls through to the master default / brand.
 */
export function accentOf(node) {
  if (!node) return BRAND;
  const def = getNodeSettings(node.comfyClass);
  const own = node.properties?.[def?.prop || DEFAULT_ACCENT_PROP];
  if (typeof own === "string" && own.trim()) return own.trim();
  const perClass = readSetting(def?.setting || classAccentSetting(node.comfyClass));
  if (perClass) return perClass;
  return globalAccent() || BRAND;
}

/**
 * Store this node's own pick. A falsy hex DELETES the key so the node goes back
 * to following the defaults. Only ever call this from a real user action.
 */
export function setNodeAccent(node, hex) {
  if (!node) return;
  if (!node.properties) node.properties = {};
  const prop = accentPropOf(node.comfyClass);
  if (hex) node.properties[prop] = hex;
  else delete node.properties[prop];
}

/**
 * The node's accent as an rgba() string at the given alpha - for the translucent
 * washes a canvas paints behind a selected card. CSS can use
 * `color-mix(in srgb, var(--rpc-acc,#f66744) 20%, transparent)` instead; a canvas
 * has no such option, hence this.
 * Falls back to the brand orange for any colour it cannot parse.
 */
export function accentRgba(node, alpha = 1) {
  const hex = String(accentOf(node) || BRAND).trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  let r = 246, g = 103, b = 68;
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A LIGHTER accent, for the hover (or active) state of a control that is ALREADY
 * filled with the accent - Preview Image's four buttons, the Pause nodes' primary
 * button, Seed's spinner. Those all used to hard-code `#ff8a5e`, a lighter
 * orange, so a node whose buttons had been recoloured flashed back to orange the
 * moment the pointer touched one. Reported 2026-09-08 ("the buttons take the
 * colour but the hover highlight stays default orange").
 *
 * 82% is the ratio that lands closest to that `#ff8a5e` for the brand orange, so
 * a user who never picks a colour sees what they always saw.
 *
 * Idle stays `ACC`; only the hover/active rule uses this.
 */
export const ACC_HOVER = `color-mix(in srgb, ${ACC} 82%, #fff)`;

/**
 * The same lighter accent as a hex, for a CANVAS that cannot read a CSS variable
 * (Preview Image paints its buttons in the legacy renderer). Mixes towards white
 * with the same ratio ACC_HOVER uses, so the two renderers match.
 */
export function accentHover(node, t = 0.82) {
  const hex = String(accentOf(node) || BRAND).trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;                    // a named / rgb() colour: leave it alone
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const mix = (c) => Math.round(parseInt(c, 16) * t + 255 * (1 - t));
  const to2 = (v) => v.toString(16).padStart(2, "0");
  return `#${to2(mix(h.slice(0, 2)))}${to2(mix(h.slice(2, 4)))}${to2(mix(h.slice(4, 6)))}`;
}

/** Put the node's accent on a DOM element as the --rpc-acc custom property. */
export function applyAccent(el, node) {
  if (el?.style) el.style.setProperty(ACCENT_VAR, accentOf(node));
}

/**
 * Wire a node's DOM roots to its accent. Call ONCE per root, right after
 * addDOMWidget - it paints the var now and remembers the element so a later
 * colour pick can repaint without the node having to hand us a callback.
 * A node with several widget rows may call it once per row.
 */
export function installNodeAccent(node, ...els) {
  if (!node) return;
  // Prune detached entries FIRST. A node that adds and removes rows (Switch,
  // Mute Switch) calls this once per new row, and the removed row's element was
  // never dropped - so the list grew forever and kept dead DOM alive.
  let keep = (node._rpcAccentEls ||= []).filter((e) => e?.isConnected);
  for (const e of els) {
    if (e?.style && !keep.includes(e)) keep.push(e);
    applyAccent(e, node);
  }
  node._rpcAccentEls = keep;
  settleNodeAccent(node);
}

/**
 * Re-apply the accent once configure() has restored node.properties.
 *
 * `installNodeAccent` runs from the node's creation path, and configure() - which
 * restores the saved pick - runs AFTER it (Vue Compat #8). So the colour written
 * above is whatever the DEFAULTS said before the workflow was read, and a node
 * carrying its own saved colour opened in the brand orange while its settings
 * panel correctly showed the colour the user had picked.
 *
 * MEASURED 2026-09-11, reopening a workflow: 42 of the 48 DOM node types came
 * back orange. The six that did not (Prompt Stack / Multi / Pack / Each, XY Plot,
 * Find and Replace) only escaped because they re-render their rows on configure
 * and happen to call installNodeAccent again.
 *
 * The order, measured on frontend 1.51.10, is:
 *   onNodeCreated -> configure ENTER -> configure EXIT -> microtask
 * so a microtask is the FIRST point where the restored value is readable, and
 * being in the same tick it repaints before anything is shown.
 *
 * Deliberately narrow, so this cannot misfire on the load path:
 *   - it only acts when the settled colour DIFFERS from the one just applied, so
 *     a fresh node, or any node following the defaults, does no work at all;
 *   - when it does act it goes through repaintAccent, which writes DOM style,
 *     flags a canvas redraw and calls the node's own onChange. None of those
 *     touch serialized state, so an untouched workflow cannot open "modified"
 *     (Vue Compat #18).
 * The onChange call is what reaches the nodes that paint from their OWN --acc
 * variable on inner elements (Prompt, Sliders, LoRA Loader, Sizes, Outpaint,
 * Outpaint Stitch, Load Image Mini) - writing --rpc-acc on the root cannot.
 *
 * Those seven never call installNodeAccent, so they are covered by the CENTRAL
 * `nodeCreated` hook in js/help_toolbar/index.js, which calls this for every
 * node that registered settings. Calling it twice is free: the queue flag
 * dedupes, and a second pass sees no change and returns.
 */
export function settleNodeAccent(node) {
  if (!node) return;
  if (node._rpcAccentSettleQueued) return;
  node._rpcAccentSettleQueued = true;
  let applied;
  try { applied = accentOf(node); } catch { applied = null; }
  queueMicrotask(() => {
    node._rpcAccentSettleQueued = false;
    try {
      if (accentOf(node) === applied) return;
      repaintAccent(node);
    } catch {}
  });
}

// Every element that should carry the var for this node: the roots it handed us,
// plus any DOM widget element (covers nodes that never called installNodeAccent),
// plus the Nodes 2.0 node element so descendants inherit it.
function accentTargets(node) {
  const out = [];
  // NOT filtered on isConnected. An element that is registered but not yet in
  // the document still needs the var: Longest Side hands us its floated slot
  // band, which is appended a beat later, so the settle pass skipped it and the
  // band alone stayed orange while the node body recoloured (measured
  // 2026-09-11). Writing an inline style on a detached element is harmless and
  // applies the moment it is attached. Pruning dead entries stays where it
  // belongs, in installNodeAccent.
  for (const e of node._rpcAccentEls || []) if (e?.style) out.push(e);
  for (const w of node.widgets || []) {
    const e = w.element || w.inputEl;
    if (e?.style && !out.includes(e)) out.push(e);
  }
  if (node.id != null) {
    const ne = document.querySelector(`[data-node-id="${node.id}"]`);
    if (ne && !out.includes(ne)) out.push(ne);
  }
  return out;
}

/**
 * Repaint one node after its colour changed: refresh the CSS var everywhere it
 * matters and ask for a canvas redraw (which is what a canvas-painted node needs,
 * since its draw() reads accentOf(node) live).
 */
export function repaintAccent(node) {
  if (!node) return;
  const a = accentOf(node);
  for (const e of accentTargets(node)) e.style.setProperty(ACCENT_VAR, a);
  try { node.setDirtyCanvas?.(true, true); } catch {}
  // MUST also run the node's own refresh. The CSS var + a canvas redraw is not
  // enough for two whole families:
  //   - the seven nodes that predate this module paint from their OWN --acc var,
  //     set on INNER elements, so writing --rpc-acc on the root cannot win;
  //   - a node whose Nodes 2.0 body is a self-owned <canvas> (Compare, Preview)
  //     only redraws through its own render call, never through setDirtyCanvas.
  // Without this, changing a DEFAULT left every such node showing the old colour
  // until some unrelated redraw happened to fire.
  try { getNodeSettings(node.comfyClass)?.onChange?.(node); } catch {}
}

/**
 * Repaint every node on the canvas. Used when a DEFAULT changes (the master
 * colour in the Settings panel, or a "save as default" press), because that can
 * move nodes which have no colour of their own.
 */
export function repaintAllAccents() {
  const nodes = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of nodes) {
    if (n && getNodeSettings(n.comfyClass)) repaintAccent(n);
  }
  try { app.graph?.setDirtyCanvas(true, true); } catch {}
}

// ── the generic accent panel ─────────────────────────────────────────────────
//
// Same shape as the hand-built panels that came before it (Outpaint Stitch /
// Run Timer / Save Image): a themed card beside the node, draggable by its
// header, closing on outside click or Esc.

let _panel = null;
let _panelNode = null;
let _cpHandle = null;
let _loadWrapped = false;
// The open option-row dropdown's closer. It lives on <body>, NOT inside the
// panel, so a PROGRAMMATIC close (a workflow load, or the node being deleted)
// would otherwise leave it floating over the canvas with its global listeners
// still attached. The user-driven closes happen to work via its own handlers.
// Debounced text-row writes still owed to the store; flushed on panel close.
const _pendingTextWrites = new Set();
function flushPendingTextWrites() {
  const fns = [..._pendingTextWrites];
  _pendingTextWrites.clear();
  for (const f of fns) { try { f(); } catch {} }
}
let _optionPopupClose = null;
function closeOptionPopup() {
  const fn = _optionPopupClose;
  _optionPopupClose = null;
  try { fn?.(); } catch {}
  // belt-and-braces: drop any stray node even if its closer was lost
  try { document.querySelectorAll('.rpc-nset-pop').forEach((e) => e.remove()); } catch {}
}

const CSS_ID = "rpc-nodeset-css";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
    /* max-height + a scrolling body: a node with several rows PLUS the colour
       block can be taller than the screen, and placeBeside only clamps the TOP -
       without this the footer sits below the viewport with no way to reach it. */
    .rpc-nset { position:fixed; z-index:10010; width:340px; max-width:94vw; background:#1a1a1a;
      border:1px solid #3a3a3a; border-radius:10px; box-shadow:0 18px 50px rgba(0,0,0,0.6);
      color:#d8d8d8; font:12px 'Segoe UI',-apple-system,sans-serif; overflow:hidden;
      max-height:88vh; display:flex; flex-direction:column; }
    .rpc-nset-t { flex:0 0 auto; display:flex; align-items:center; gap:8px; padding:10px 12px; background:#232323;
      border-bottom:1px solid #333; cursor:grab; user-select:none; }
    .rpc-nset-t .g { color:${ACC}; }
    .rpc-nset-t .n { color:${ACC}; font-weight:600; }
    .rpc-nset-t .x { margin-left:auto; color:#8a8a8a; cursor:pointer; padding:0 4px; }
    .rpc-nset-t .x:hover { color:#fff; }
    .rpc-nset-b { padding:14px 12px; display:flex; flex-direction:column; gap:12px;
      overflow-y:auto; min-height:0; }
    .rpc-nset-sec { display:flex; flex-direction:column; gap:10px; }
    /* ── option rows (the ones that used to sit in ComfyUI's Settings panel) ── */
    .rpc-nset-optrow { display:flex; align-items:center; gap:10px; }
    .rpc-nset-optrow.stack { flex-direction:column; align-items:stretch; gap:5px; }
    .rpc-nset-opttxt { flex:1 1 auto; min-width:0; }
    .rpc-nset-opttxt .lab { font-size:12px; color:#cfcfcf; }
    .rpc-nset-opttxt .sub { font-size:11px; color:#8a8a8a; margin-top:2px; }
    .rpc-nset-ctl { flex:0 0 auto; display:flex; align-items:center; gap:7px; min-width:96px;
      justify-content:space-between; background:#1d1d1d; border:1px solid #444; border-radius:4px;
      padding:5px 8px; cursor:pointer; user-select:none; }
    .rpc-nset-ctl:hover { border-color:${ACC}; }
    .rpc-nset-val { color:#ddd; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rpc-nset-caret { color:${ACC}; font-size:9px; line-height:1; flex:0 0 auto; }
    .rpc-nset-pop { position:fixed; z-index:10040; background:#1a1a1a; border:1px solid #444;
      border-radius:5px; box-shadow:0 10px 30px rgba(0,0,0,0.6); padding:3px; max-height:50vh; overflow:auto; }
    .rpc-nset-popitem { padding:6px 12px; font-size:12px; color:#ccc; cursor:pointer; border-radius:3px; white-space:nowrap; }
    .rpc-nset-popitem:hover { background:#2a2a2a; color:#fff; }
    .rpc-nset-popitem.on { color:${ACC}; }
    .rpc-nset-tog { flex:0 0 auto; width:34px; height:18px; border-radius:9px; cursor:pointer;
      background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.18); position:relative;
      transition:background .1s, border-color .1s; }
    .rpc-nset-tog .knob { position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%;
      background:#bbb; transition:left .1s, background .1s; }
    .rpc-nset-tog.on { background:${ACC}; border-color:${ACC}; }
    .rpc-nset-tog.on .knob { left:18px; background:#fff; }
    .rpc-nset-text { width:100%; box-sizing:border-box; background:#1d1d1d; border:1px solid #444;
      border-radius:4px; padding:6px 8px; color:#e0e0e0; font:12px monospace; outline:none; }
    .rpc-nset-text:focus { border-color:${ACC}; }
    .rpc-nset-acc { display:flex; align-items:center; gap:10px; }
    .rpc-nset-acc .lab { font-size:12px; color:#cfcfcf; }
    .rpc-nset-acc .sub { font-size:11px; color:#8a8a8a; margin-top:2px; }
    .rpc-nset-sw { width:34px; height:24px; border-radius:5px; border:1px solid #555; cursor:pointer; flex:none; }
    .rpc-nset-sw:hover { border-color:#fff; }
    .rpc-nset-dt { font-size:11px; color:#8a8a8a; }
    .rpc-nset-rule { height:1px; background:#333; margin:2px 0; }
    .rpc-nset-row { display:flex; gap:8px; flex-wrap:wrap; }
    .rpc-nset-btn { border:1px solid #444; background:rgba(255,255,255,0.04); color:#d8d8d8; border-radius:5px;
      padding:5px 12px; font:12px 'Segoe UI',sans-serif; cursor:pointer; box-sizing:border-box; }
    .rpc-nset-btn:hover { border-color:${ACC}; color:#fff; }
    .rpc-nset-f { flex:0 0 auto; display:flex; gap:8px; padding:10px 12px; border-top:1px solid #333; background:#1f1f1f; }
    .rpc-nset-push { margin-left:auto; }
  `;
  document.head.appendChild(s);
}

// Where the node sits on screen, so the panel can open beside it. Nodes 2.0
// gives us a real element; Classic needs the canvas transform by hand.
function getNodeScreenRect(node) {
  if (isVueNodes() && node && node.id != null) {
    const e = document.querySelector(`[data-node-id="${node.id}"]`);
    if (e) return e.getBoundingClientRect();
  }
  const c = app.canvas;
  const ds = c && c.ds;
  const cv = c && c.canvas;
  if (!ds || !cv || !node?.pos || !node?.size) return null;
  const cr = cv.getBoundingClientRect();
  const titleH = window.LiteGraph?.NODE_TITLE_HEIGHT || 30;
  const sc = ds.scale || 1;
  const off = ds.offset || [0, 0];
  const left = cr.left + (node.pos[0] + off[0]) * sc;
  const top = cr.top + (node.pos[1] - titleH + off[1]) * sc;
  const width = node.size[0] * sc;
  const height = (node.size[1] + titleH) * sc;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function placeBeside(panel, rect) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = panel.offsetWidth, mh = panel.offsetHeight;
  const gap = 12, pad = 8;
  if (!rect) {
    panel.style.left = Math.max(pad, (vw - mw) / 2) + "px";
    panel.style.top = Math.max(pad, (vh - mh) / 2) + "px";
    return;
  }
  let left = rect.right + gap;
  if (left + mw > vw - pad) left = rect.left - gap - mw;
  if (left < pad) left = Math.max(pad, vw - mw - pad);
  let top = rect.top;
  if (top + mh > vh - pad) top = vh - mh - pad;
  if (top < pad) top = pad;
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function makeDraggable(panel, handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".x")) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev) => {
      if (!panel.isConnected) return up();
      panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ev.clientX - ox)) + "px";
      panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ev.clientY - oy)) + "px";
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  });
}

function outsideClose(e) {
  if (!_panel) return;
  if (_panel.contains(e.target)) return;
  // Clicks inside the colour picker OR an option-row dropdown must not dismiss
  // the panel behind them. Both live on <body>, not inside the panel, and this
  // capture-phase handler runs BEFORE their own - so without the exemption,
  // picking a value closed the panel out from under the user.
  //
  // The Pixaroma Help window (.pixhb-win) and the Workflows panel (.pixwb-win)
  // are exempt for a different reason: they are PERSISTENT panels you use WHILE
  // working, not popups, so looking something up or switching workflow should
  // not shut the settings you were about to change. Their own pointerdown guard
  // cannot save them - that is a BUBBLE listener on the window, and this one is
  // CAPTURE on the document, so this always runs first.
  if (e.target.closest?.(".pixhb-win, .pixwb-win, .rpc-cp-popup, .rpc-cp-modal-backdrop, .rpc-nset-pop")) return;
  closeNodeSettingsPanel();
}

function escClose(e) {
  if (e.key === "Escape" && _panel) {
    // an open picker / dropdown owns Escape first - it closes, the panel stays
    if (document.querySelector(".rpc-cp-popup, .rpc-cp-modal-backdrop, .rpc-nset-pop")) return;
    // Escape pressed while reading the Help window belongs to that window, or
    // Esc would close the settings panel behind it and, because of the
    // stopPropagation below, leave the help window open - the opposite of what
    // the key was pressed for.
    if (e.target?.closest?.(".pixhb-win, .pixwb-win")) return;
    e.stopPropagation();
    closeNodeSettingsPanel();
  }
}

export function closeNodeSettingsPanel() {
  flushPendingTextWrites();
  closeOptionPopup();
  try { _cpHandle?.close(); } catch {}
  _cpHandle = null;
  if (_panel) { try { _panel.remove(); } catch {} }
  _panel = null;
  _panelNode = null;
  document.removeEventListener("pointerdown", outsideClose, true);
  document.removeEventListener("keydown", escClose, true);
}

/** Close the panel if it belongs to this node (call from the node's onRemoved). */
export function closeNodeSettingsFor(node) {
  if (_panelNode === node) closeNodeSettingsPanel();
}

// Safety net: any workflow load / tab switch / undo closes a stray panel. Wrapped
// once, lazily, the same way the Help popup protects itself.
function wrapLoadGraphData() {
  if (_loadWrapped || !app?.loadGraphData) return;
  _loadWrapped = true;
  const _orig_fn = app.loadGraphData;
  const orig = (...a) => _orig_fn.apply(app, a);
  app.loadGraphData = function (...args) {
    closeNodeSettingsPanel();
    return orig(...args);
  };
}

// ── option rows (what used to live in ComfyUI's Settings panel) ──────────────
//
// A row is { kind, setting, label, hint?, defaultValue?, options?, placeholder? }
// with kind one of "combo" | "toggle" | "text" | "color". The value is read with
// nodeSetting(setting, defaultValue) and written straight back, so a node's code
// keeps reading the SAME id it always did - only the surface moved.

function buildComboRow(row, onChange) {
  const wrap = el("div", "rpc-nset-ctl");
  const val = el("div", "rpc-nset-val");
  const opts = Array.isArray(row.options) ? row.options : [];
  const cur = () => nodeSetting(row.setting, row.defaultValue);
  const paint = () => { val.textContent = String(cur() ?? ""); };
  paint();
  const caret = el("span", "rpc-nset-caret", "▼");
  wrap.append(val, caret);

  wrap.addEventListener("click", (e) => {
    e.stopPropagation();
    // The Pixaroma custom dark dropdown - NEVER a native <select>, whose OS
    // chrome (a blue highlight) clashes with the theme (node UI convention #14).
    closeOptionPopup();
    const pop = el("div", "rpc-nset-pop");
    const r = wrap.getBoundingClientRect();
    pop.style.left = r.left + "px";
    pop.style.top = (r.bottom + 3) + "px";
    pop.style.minWidth = r.width + "px";
    for (const o of opts) {
      const it = el("div", "rpc-nset-popitem" + (String(o) === String(cur()) ? " on" : ""), String(o));
      it.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await setNodeSetting(row.setting, o);
        paint(); pop.remove(); onChange?.(row.setting, o);
      });
      pop.appendChild(it);
    }
    document.body.appendChild(pop);
    // keep it on screen, then close on any outside press / wheel / Escape
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - pr.height - 3) + "px";
    // horizontal clamp too: a long option makes the popup wider than its anchor,
    // and the panel itself can sit flush against the right edge of the screen
    if (pr.right > window.innerWidth - 8)
      pop.style.left = Math.max(8, window.innerWidth - pr.width - 8) + "px";
    const away = (ev) => { if (!pop.contains(ev.target)) close(); };
    const esc = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
    const close = () => {
      pop.remove();
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("wheel", away, true);
      document.removeEventListener("keydown", esc, true);
      if (_optionPopupClose === close) _optionPopupClose = null;
    };
    _optionPopupClose = close;   // so a programmatic panel close can reach it
    setTimeout(() => {
      document.addEventListener("pointerdown", away, true);
      document.addEventListener("wheel", away, true);
      document.addEventListener("keydown", esc, true);
    }, 0);
  });
  return { wrap, refresh: paint };
}

function buildToggleRow(row, onChange) {
  const cur = () => !!nodeSetting(row.setting, row.defaultValue);
  const tog = el("div", "rpc-nset-tog" + (cur() ? " on" : ""));
  tog.appendChild(el("span", "knob"));
  tog.addEventListener("click", async (e) => {
    e.stopPropagation();
    const next = !cur();
    await setNodeSetting(row.setting, next);
    tog.classList.toggle("on", next);
    onChange?.(row.setting, next);
  });
  return { wrap: tog, refresh: () => tog.classList.toggle("on", cur()) };
}

function buildTextRow(row, onChange) {
  const inp = el("input", "rpc-nset-text");
  inp.type = "text";
  inp.value = String(nodeSetting(row.setting, row.defaultValue) ?? "");
  if (row.placeholder) inp.placeholder = row.placeholder;
  let t = null;
  inp.addEventListener("input", () => {
    clearTimeout(t);                       // debounced: one write per pause, not per keystroke
    t = setTimeout(async () => {
      _pendingTextWrites.delete(flush);
      await setNodeSetting(row.setting, inp.value);
      onChange?.(row.setting, inp.value);
    }, 250);
    _pendingTextWrites.add(flush);
  });
  // Closing the panel FLUSHES the pending keystroke immediately rather than
  // letting a stray timer fire against a torn-down panel a quarter second later.
  const flush = () => {
    if (t == null) return;
    clearTimeout(t); t = null;
    setNodeSetting(row.setting, inp.value);
    onChange?.(row.setting, inp.value);
  };
  inp.addEventListener("pointerdown", (e) => e.stopPropagation());
  return { wrap: inp, refresh: () => { inp.value = String(nodeSetting(row.setting, row.defaultValue) ?? ""); } };
}

function buildColorRow(row, onChange, onPickerOpen) {
  const sw = el("div", "rpc-nset-sw");
  const cur = () => nodeSetting(row.setting, row.defaultValue) || BRAND;
  sw.style.background = cur();
  sw.title = "Pick a colour";
  sw.addEventListener("click", (e) => {
    e.stopPropagation();
    const h = openPixaromaColorPickerPopup(sw, {
      initialColor: cur(),
      swatches: BUTTON_PALETTE,
      wide: true,
      resetColor: row.defaultValue || BRAND,
      onPick: async (c) => {
        const v = c || row.defaultValue || BRAND;
        await setNodeSetting(row.setting, v);
        sw.style.background = v;
        onChange?.(row.setting, v);
      },
    });
    onPickerOpen?.(h);
  });
  return { wrap: sw, refresh: () => { sw.style.background = cur(); } };
}

/**
 * Render a node's option rows as a drop-in element. Same drop-in contract as
 * createAccentSection, so a node with its own richer panel can host these too.
 */
export function createOptionRows(node, rows, opts = {}) {
  injectCSS();
  const host = el("div", "rpc-nset-sec");
  const fire = (setting, value) => opts.onChange?.(node, setting, value);
  for (const row of rows || []) {
    if (!row || !row.setting) continue;
    const line = el("div", "rpc-nset-optrow");
    const txt = el("div", "rpc-nset-opttxt");
    txt.appendChild(el("div", "lab", row.label || row.setting));
    if (row.hint) txt.appendChild(el("div", "sub", row.hint));
    let ctl;
    if (row.kind === "toggle") ctl = buildToggleRow(row, fire);
    else if (row.kind === "text") ctl = buildTextRow(row, fire);
    else if (row.kind === "color") ctl = buildColorRow(row, fire, opts.onPickerOpen);
    else ctl = buildComboRow(row, fire);
    // a text field wants the full width, so it goes under its label
    if (row.kind === "text") { line.classList.add("stack"); line.append(txt, ctl.wrap); }
    else line.append(txt, ctl.wrap);
    host.appendChild(line);
  }
  return host;
}

/**
 * The colour block as a drop-in element, so a node that already owns a richer
 * settings panel can offer the same colour option without rebuilding it:
 *
 *   body.appendChild(createAccentSection(node, { onChange: () => repaint(node) }));
 *
 * The host panel MUST let clicks inside the picker through its outside-close
 * guard, or picking a colour dismisses the panel underneath:
 *   if (e.target.closest?.(".rpc-cp-popup, .rpc-cp-modal-backdrop")) return;
 *
 * opts = { title, label, hint, onChange(node), onPickerOpen(handle) }
 */
export function createAccentSection(node, opts = {}) {
  injectCSS();
  const def = getNodeSettings(node?.comfyClass);
  const title = opts.title || def?.title || defaultTitle(node?.comfyClass);
  const setting = def?.setting || classAccentSetting(node?.comfyClass);

  const wrap = el("div", "rpc-nset-sec");
  wrap.style.setProperty(ACCENT_VAR, accentOf(node));

  const sw = el("div", "rpc-nset-sw");
  sw.title = "Pick the colour this node paints with";
  sw.style.background = accentOf(node);

  const repaint = () => {
    const a = accentOf(node);
    wrap.style.setProperty(ACCENT_VAR, a);
    sw.style.background = a;
    repaintAccent(node);
    opts.onChange?.(node);
  };

  sw.addEventListener("click", () => {
    const handle = openPixaromaColorPickerPopup(sw, {
      initialColor: accentOf(node),
      swatches: BUTTON_PALETTE,
      wide: true,
      resetColor: BRAND,
      onPick: (c) => { setNodeAccent(node, c || BRAND); repaint(); },
    });
    opts.onPickerOpen?.(handle);   // so the host can close it on teardown
  });

  const row = el("div", "rpc-nset-acc");
  const txt = el("div");
  txt.appendChild(el("div", "lab", opts.label || "Button colour"));
  txt.appendChild(el("div", "sub", opts.hint || "This node only. Save it as a default below."));
  row.append(sw, txt);

  // PIN THE WIDTH for the duration. Measured: the label going to "Saved"
  // shrank this button from 149px to 57px, which on the narrow panels
  // (Save Image 300px, Save Video 320px) collapsed the two-button row from two
  // lines to one and took 35px off the panel height. Panels re-place
  // themselves when their height changes, so the whole panel slid out from
  // under the cursor and back again 1.2s later. Node UI convention #2 asks for
  // this on every flash-label button, for exactly this reason.
  //
  // The original is cached ONCE and any pending restore cancelled. Capturing
  // it fresh each call means a second click inside the window captures "Saved"
  // as the original, and the button reads "Saved" for the rest of the session
  // - the same bug this pack has now had to fix twice elsewhere, so this is
  // the proven shape rather than a fresh one.
  const flash = (btn, text) => {
    clearTimeout(btn._rpcFlashT);
    if (btn._rpcFlashOrig == null) {
      btn._rpcFlashOrig = btn.textContent;
      btn.style.minWidth = Math.ceil(btn.getBoundingClientRect().width) + "px";
    }
    btn.textContent = text;
    btn._rpcFlashT = setTimeout(() => {
      if (btn._rpcFlashOrig != null) btn.textContent = btn._rpcFlashOrig;
    }, 1200);
  };

  const btns = el("div", "rpc-nset-row");
  const bType = el("button", "rpc-nset-btn", "New " + title + " nodes");
  bType.title = "Every new " + title + " node starts with this colour";
  bType.addEventListener("click", async () => {
    if (await writeSetting(setting, accentOf(node))) { flash(bType, "Saved"); repaintAllAccents(); }
  });
  const bAll = el("button", "rpc-nset-btn", "Every Load Image Pixaroma Clone node");
  bAll.title = "Every Load Image Pixaroma Clone node follows this colour, unless it has been given one of its own";
  bAll.addEventListener("click", async () => {
    if (await writeSetting(GLOBAL_ACCENT_SETTING, accentOf(node))) { flash(bAll, "Saved"); repaintAllAccents(); }
  });
  btns.append(bType, bAll);

  wrap.append(row, el("div", "rpc-nset-dt", "Use this colour as the default for"), btns);
  return wrap;
}

export function openAccentPanel(node) {
  const def = getNodeSettings(node?.comfyClass);
  if (!node) return;
  closeNodeSettingsPanel();
  injectCSS();
  wrapLoadGraphData();
  _panelNode = node;

  const title = def?.title || defaultTitle(node.comfyClass);

  const panel = el("div", "rpc-nset");
  panel.style.setProperty(ACCENT_VAR, accentOf(node));

  const head = el("div", "rpc-nset-t");
  head.append(el("span", "g", "⚙"), el("span", "n", title + " settings"));
  const x = el("span", "x", "✕");
  x.addEventListener("click", closeNodeSettingsPanel);
  head.appendChild(x);

  const body = el("div", "rpc-nset-b");

  // This node's own options first (what used to sit in ComfyUI's Settings
  // panel), then the colour block - so the settings a user came here to change
  // are at the top and the colour is the tail.
  if (def?.rows?.length) {
    body.appendChild(createOptionRows(node, def.rows, {
      onChange: (n, setting, value) => def.onRowChange?.(n, setting, value),
      onPickerOpen: (h) => { _cpHandle = h; },
    }));
  }

  // A node with no orange on its face opts out of the colour block entirely
  // rather than offering a colour that would change nothing.
  if (def?.accent !== false) {
    if (def?.rows?.length) body.appendChild(el("div", "rpc-nset-rule"));
    body.appendChild(createAccentSection(node, {
      title,
      label: def?.swatchLabel,
      hint: def?.swatchHint,
      // Only the panel's own chrome here: repaintAccent already runs the node's
      // onChange, and calling it again would double every rebuild per pick.
      onChange: () => { panel.style.setProperty(ACCENT_VAR, accentOf(node)); },
      onPickerOpen: (h) => { _cpHandle = h; },                // so close() reaches it
    }));
  }

  const foot = el("div", "rpc-nset-f");
  const done = el("button", "rpc-nset-btn rpc-nset-push", "Done");
  done.addEventListener("click", closeNodeSettingsPanel);
  foot.appendChild(done);

  panel.append(head, body, foot);
  document.body.appendChild(panel);

  placeBeside(panel, getNodeScreenRect(node));
  makeDraggable(panel, head);

  // deferred so the click that opened the panel does not immediately close it
  setTimeout(() => {
    if (!_panel) return;
    document.addEventListener("pointerdown", outsideClose, true);
    document.addEventListener("keydown", escClose, true);
  }, 0);
  _panel = panel;
}
