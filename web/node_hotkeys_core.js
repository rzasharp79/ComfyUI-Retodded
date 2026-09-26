// Pure logic for the Node Hotkeys widget (web/node_hotkeys.js): state
// validation, hotkey uniqueness, sorting and pan math. No DOM and no ComfyUI
// imports, so `node --test tests/node_hotkeys_core.test.mjs` can run it.
// Spec: docs/superpowers/specs/2026-09-17-node-hotkeys-design.md

export const STATE_VERSION = 1;
export const HOTKEY_MIN = -1;
export const HOTKEY_MAX = 9;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const DEFAULT_ROW = Object.freeze({ hotkey: HOTKEY_MIN, zoom: 1 });
export const DEFAULT_OFFSET = 90;
export const DEFAULT_SORT = Object.freeze({ key: "x", dir: 1 });
// Resizable columns, CSS px. Name has no entry: it takes the space left over.
export const COLUMNS = Object.freeze({
  id: { width: 32, min: 24 },
  x: { width: 48, min: 24 },
  y: { width: 48, min: 24 },
  key: { width: 64, min: 52 },
  zoom: { width: 84, min: 64 },
});
export const COLUMN_MAX = 400;
// Sortable columns, each with its tiebreak order.
const SORT_FIELDS = {
  id: ["id"],
  name: ["name", "id"],
  x: ["x", "y", "id"],
  y: ["y", "x", "id"],
};

// Number(""), Number(null) and Number([]) are 0, which would turn "cleared"
// into hotkey 0. Only real numbers and non-blank numeric strings count.
function toNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function clampHotkey(v) {
  const n = Math.trunc(toNumber(v));
  if (!Number.isFinite(n)) return HOTKEY_MIN;
  return Math.min(HOTKEY_MAX, Math.max(HOTKEY_MIN, n));
}

export function clampZoom(v) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return DEFAULT_ROW.zoom;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  return Math.round(clamped * 10) / 10;
}

// Screen px from the viewport's top-left. Any whole number goes, negatives too.
export function clampOffset(v) {
  const n = Math.round(toNumber(v));
  return Number.isFinite(n) ? n : DEFAULT_OFFSET;
}

export function clampWidth(col, v) {
  const n = Math.round(toNumber(v));
  if (!Number.isFinite(n)) return COLUMNS[col].width;
  return Math.min(COLUMN_MAX, Math.max(COLUMNS[col].min, n));
}

export function isDefaultRow(row) {
  return row.hotkey === DEFAULT_ROW.hotkey && row.zoom === DEFAULT_ROW.zoom;
}

export function defaultState() {
  return { version: STATE_VERSION, rows: {} };
}

// Validated copy of node.properties.nodeHotkeys. Anything malformed becomes a
// default, so a hand-edited or stale workflow never breaks the widget.
export function readState(raw) {
  if (!isPlainObject(raw) || raw.version !== STATE_VERSION || !isPlainObject(raw.rows)) {
    return defaultState();
  }
  const rows = {};
  const seenHotkeys = new Set();
  for (const [id, row] of Object.entries(raw.rows)) {
    if (!isPlainObject(row)) continue;
    const clean = { hotkey: clampHotkey(row.hotkey), zoom: clampZoom(row.zoom) };
    if (clean.hotkey !== HOTKEY_MIN && seenHotkeys.has(clean.hotkey)) {
      clean.hotkey = HOTKEY_MIN;
    } else if (clean.hotkey !== HOTKEY_MIN) {
      seenHotkeys.add(clean.hotkey);
    }
    if (!isDefaultRow(clean)) rows[id] = clean;
  }
  return { version: STATE_VERSION, rows };
}

// Validated copy of node.properties.nodeHotkeysSettings. Every field falls
// back to its default on its own, so workflows saved before settings existed
// load unchanged.
export function readSettings(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const offset = Array.isArray(src.offset) ? src.offset : [];
  const sort = isPlainObject(src.sort) ? src.sort : {};
  const widths = isPlainObject(src.widths) ? src.widths : {};
  return {
    offset: [clampOffset(offset[0]), clampOffset(offset[1])],
    sort: {
      key: Object.hasOwn(SORT_FIELDS, sort.key) ? sort.key : DEFAULT_SORT.key,
      dir: sort.dir === -1 ? -1 : 1,
    },
    widths: Object.fromEntries(
      Object.keys(COLUMNS).map((col) => [col, clampWidth(col, widths[col])]),
    ),
  };
}

export function rowFor(state, id) {
  return { ...DEFAULT_ROW, ...(state.rows[String(id)] ?? {}) };
}

// New state with `patch` applied to `id`. One digit per node: when the
// patched row ends up with a real hotkey, every other row holding that digit
// loses it (zoom untouched). Rows equal to the defaults are not stored.
export function setRow(state, id, patch) {
  const key = String(id);
  const next = { ...rowFor(state, key) };
  if ("hotkey" in patch) next.hotkey = clampHotkey(patch.hotkey);
  if ("zoom" in patch) next.zoom = clampZoom(patch.zoom);
  const rows = {};
  for (const [otherId, row] of Object.entries(state.rows)) {
    if (otherId === key) continue;
    const stealsDigit = next.hotkey !== HOTKEY_MIN && row.hotkey === next.hotkey;
    const kept = stealsDigit ? { ...row, hotkey: HOTKEY_MIN } : { ...row };
    if (!isDefaultRow(kept)) rows[otherId] = kept;
  }
  if (!isDefaultRow(next)) rows[key] = next;
  return { version: STATE_VERSION, rows };
}

export function pruneRows(state, liveIds) {
  const live = new Set(Array.from(liveIds, (id) => String(id)));
  const rows = {};
  for (const [id, row] of Object.entries(state.rows)) {
    if (live.has(id)) rows[id] = { ...row };
  }
  return { version: STATE_VERSION, rows };
}

export function compareIds(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function compareField(a, b, field) {
  if (field === "id") return compareIds(a.id, b.id);
  if (field === "name") {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }
  return a[field] - b[field];
}

// Sorts `{ id, name, x, y }` snapshots by `sort.key`; `sort.dir` -1 reverses
// the whole order, tiebreaks included. Returns a new array.
export function sortNodes(nodes, sort = DEFAULT_SORT) {
  return [...nodes].sort((a, b) => {
    for (const field of SORT_FIELDS[sort.key]) {
      const c = compareField(a, b, field);
      if (c) return c * sort.dir;
    }
    return 0;
  });
}

// Clicking the sorted column flips its direction; any other column starts
// ascending.
export function nextSort(sort, key) {
  return { key, dir: key === sort.key ? -sort.dir : 1 };
}

// First { id, zoom, index } across `states` (already ordered by the caller)
// whose row holds `hotkey`; `index` is the state's position in `states`.
// Hotkey -1 never matches because rows never store it.
export function findTarget(states, hotkey) {
  if (hotkey === HOTKEY_MIN) return null;
  for (const [index, state] of states.entries()) {
    for (const [id, row] of Object.entries(state.rows)) {
      if (row.hotkey === hotkey) return { id, zoom: row.zoom, index };
    }
  }
  return null;
}

// Canvas offset that puts the node's title bar `offset` ([x, y] CSS px) from
// the viewport's top-left at `zoom`. LiteGraph maps screen = (graph + offset) *
// scale, so offset = screen / scale - graph. `pos` is the body's top-left and
// the title bar sits `titleHeight` above it.
export function panOffsetFor(pos, zoom, titleHeight, offset) {
  return [offset[0] / zoom - pos[0], offset[1] / zoom - (pos[1] - titleHeight)];
}
