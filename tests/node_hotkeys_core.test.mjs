import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ROW,
  clampHotkey,
  clampOffset,
  clampWidth,
  clampZoom,
  defaultState,
  findTarget,
  isDefaultRow,
  nextSort,
  panOffsetFor,
  pruneRows,
  readSettings,
  readState,
  rowFor,
  setRow,
  sortNodes,
} from "../web/node_hotkeys_core.js";

const DEFAULT_SETTINGS = {
  offset: [90, 90],
  sort: { key: "x", dir: 1 },
  widths: { id: 32, x: 48, y: 48, key: 64, zoom: 84 },
};

test("clampHotkey clamps to [-1, 9] and truncates", () => {
  assert.equal(clampHotkey(-5), -1);
  assert.equal(clampHotkey(-1), -1);
  assert.equal(clampHotkey(0), 0);
  assert.equal(clampHotkey(9), 9);
  assert.equal(clampHotkey(10), 9);
  assert.equal(clampHotkey(3.7), 3);
  assert.equal(clampHotkey("4"), 4);
});

test("clampHotkey returns -1 on garbage", () => {
  assert.equal(clampHotkey(undefined), -1);
  assert.equal(clampHotkey(null), -1);
  assert.equal(clampHotkey(""), -1);
  assert.equal(clampHotkey("   "), -1);
  assert.equal(clampHotkey("abc"), -1);
  assert.equal(clampHotkey(NaN), -1);
  assert.equal(clampHotkey({}), -1);
});

test("clampZoom clamps to [0.5, 2] and rounds to one decimal", () => {
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(0.5), 0.5);
  assert.equal(clampZoom(2), 2);
  assert.equal(clampZoom(3), 2);
  assert.equal(clampZoom(1.2 + 0.1), 1.3);
  assert.equal(clampZoom(1.25), 1.3);
  assert.equal(clampZoom("1.5"), 1.5);
});

test("clampZoom returns 1 on garbage", () => {
  assert.equal(clampZoom(undefined), 1);
  assert.equal(clampZoom(null), 1);
  assert.equal(clampZoom(""), 1);
  assert.equal(clampZoom("x"), 1);
  assert.equal(clampZoom([]), 1);
});

test("isDefaultRow", () => {
  assert.equal(isDefaultRow({ hotkey: -1, zoom: 1 }), true);
  assert.equal(isDefaultRow({ hotkey: 0, zoom: 1 }), false);
  assert.equal(isDefaultRow({ hotkey: -1, zoom: 1.1 }), false);
});

test("defaultState is fresh each call", () => {
  const a = defaultState();
  const b = defaultState();
  assert.deepEqual(a, { version: 1, rows: {} });
  assert.notEqual(a, b);
  assert.notEqual(a.rows, b.rows);
});

test("readState returns a default for malformed input", () => {
  assert.deepEqual(readState(undefined), { version: 1, rows: {} });
  assert.deepEqual(readState(null), { version: 1, rows: {} });
  assert.deepEqual(readState("nope"), { version: 1, rows: {} });
  assert.deepEqual(readState([]), { version: 1, rows: {} });
  assert.deepEqual(readState({ version: 2, rows: {} }), { version: 1, rows: {} });
  assert.deepEqual(readState({ version: 1, rows: null }), { version: 1, rows: {} });
  assert.deepEqual(readState({ version: 1, rows: [] }), { version: 1, rows: {} });
});

test("readState coerces row values and drops default rows", () => {
  const raw = {
    version: 1,
    rows: {
      "3": { hotkey: "7", zoom: "1.55" },
      "4": { hotkey: 42, zoom: 0 },
      "5": { hotkey: -1, zoom: 1 },
      "6": "garbage",
      "7": { zoom: 1.2 },
    },
  };
  assert.deepEqual(readState(raw), {
    version: 1,
    rows: {
      "3": { hotkey: 7, zoom: 1.6 },
      "4": { hotkey: 9, zoom: 0.5 },
      "7": { hotkey: -1, zoom: 1.2 },
    },
  });
});

test("readState does not share objects with its input", () => {
  const raw = { version: 1, rows: { "1": { hotkey: 2, zoom: 1 } } };
  const state = readState(raw);
  state.rows["1"].hotkey = 5;
  assert.equal(raw.rows["1"].hotkey, 2);
  assert.deepEqual(DEFAULT_ROW, { hotkey: -1, zoom: 1 });
});

test("readState clears a later duplicate digit, keeping the earlier row", () => {
  const raw = {
    version: 1,
    rows: { "1": { hotkey: 3, zoom: 1 }, "2": { hotkey: 3, zoom: 1.5 }, "3": { hotkey: 3, zoom: 1 } },
  };
  assert.deepEqual(readState(raw), {
    version: 1,
    rows: { "1": { hotkey: 3, zoom: 1 }, "2": { hotkey: -1, zoom: 1.5 } },
  });
});

test("rowFor merges defaults and accepts number or string ids", () => {
  const state = { version: 1, rows: { "7": { hotkey: 2, zoom: 1.5 } } };
  assert.deepEqual(rowFor(state, 7), { hotkey: 2, zoom: 1.5 });
  assert.deepEqual(rowFor(state, "7"), { hotkey: 2, zoom: 1.5 });
  assert.deepEqual(rowFor(state, 8), { hotkey: -1, zoom: 1 });
});

test("setRow writes a clamped patch and returns a new state", () => {
  const before = { version: 1, rows: {} };
  const after = setRow(before, 5, { hotkey: "3" });
  assert.deepEqual(after, { version: 1, rows: { "5": { hotkey: 3, zoom: 1 } } });
  assert.deepEqual(before, { version: 1, rows: {} });
  assert.notEqual(after, before);
});

test("setRow keeps the untouched field", () => {
  const s1 = setRow({ version: 1, rows: {} }, 5, { zoom: 1.7 });
  const s2 = setRow(s1, 5, { hotkey: 1 });
  assert.deepEqual(s2.rows["5"], { hotkey: 1, zoom: 1.7 });
});

test("setRow enforces one digit per node", () => {
  const s1 = setRow({ version: 1, rows: {} }, "A", { hotkey: 3 });
  const s2 = setRow(s1, "B", { hotkey: 3 });
  assert.deepEqual(s2.rows, { B: { hotkey: 3, zoom: 1 } });
});

test("setRow clearing a digit keeps the other row's zoom", () => {
  const s1 = setRow({ version: 1, rows: {} }, "A", { hotkey: 3, zoom: 1.5 });
  const s2 = setRow(s1, "B", { hotkey: 3 });
  assert.deepEqual(s2.rows, { A: { hotkey: -1, zoom: 1.5 }, B: { hotkey: 3, zoom: 1 } });
});

test("setRow to -1 does not clear anything else", () => {
  const s1 = setRow({ version: 1, rows: {} }, "A", { hotkey: 2 });
  const s2 = setRow(s1, "B", { hotkey: -1 });
  assert.deepEqual(s2.rows, { A: { hotkey: 2, zoom: 1 } });
});

test("setRow drops a row that returns to defaults", () => {
  const s1 = setRow({ version: 1, rows: {} }, 9, { hotkey: 4 });
  const s2 = setRow(s1, 9, { hotkey: -1 });
  assert.deepEqual(s2, { version: 1, rows: {} });
});

test("setRow treats blank text as clear", () => {
  const s1 = setRow({ version: 1, rows: {} }, 9, { hotkey: 4, zoom: 1.5 });
  const s2 = setRow(s1, 9, { hotkey: "" });
  assert.deepEqual(s2.rows["9"], { hotkey: -1, zoom: 1.5 });
  const s3 = setRow(s2, 9, { zoom: "" });
  assert.deepEqual(s3, { version: 1, rows: {} });
});

test("pruneRows keeps only live ids, comparing as strings", () => {
  const state = {
    version: 1,
    rows: { "1": { hotkey: 1, zoom: 1 }, "2": { hotkey: 2, zoom: 1 }, "3": { hotkey: 3, zoom: 1 } },
  };
  const pruned = pruneRows(state, [1, "3", 99]);
  assert.deepEqual(pruned.rows, { "1": { hotkey: 1, zoom: 1 }, "3": { hotkey: 3, zoom: 1 } });
  assert.deepEqual(Object.keys(state.rows), ["1", "2", "3"]);
});

test("sortNodes defaults to x, then y, then id, without mutating input", () => {
  const a = { id: 1, name: "a", x: 300, y: 50 };
  const b = { id: 2, name: "b", x: 100, y: 400 };
  const c = { id: 3, name: "c", x: 100, y: 200 };
  const d = { id: 4, name: "d", x: 100, y: 200 };
  const input = [a, b, c, d];
  const sorted = sortNodes(input);
  assert.deepEqual(sorted.map((n) => n.id), [3, 4, 2, 1]);
  assert.deepEqual(input.map((n) => n.id), [1, 2, 3, 4]);
  assert.equal(sorted[0], c);
});

test("sortNodes id tiebreak is numeric-aware for string ids", () => {
  const sorted = sortNodes([
    { id: "10", name: "a", x: 0, y: 0 },
    { id: "9", name: "a", x: 0, y: 0 },
  ]);
  assert.deepEqual(sorted.map((n) => n.id), ["9", "10"]);
});

test("sortNodes sorts by the chosen column in both directions", () => {
  const nodes = [
    { id: 10, name: "VAE Decode", x: 300, y: 50 },
    { id: 9, name: "ksampler", x: 100, y: 400 },
    { id: 2, name: "Load Checkpoint", x: 200, y: 200 },
  ];
  const ids = (key, dir) => sortNodes(nodes, { key, dir }).map((n) => n.id);
  assert.deepEqual(ids("id", 1), [2, 9, 10]);
  assert.deepEqual(ids("id", -1), [10, 9, 2]);
  assert.deepEqual(ids("name", 1), [9, 2, 10]);
  assert.deepEqual(ids("name", -1), [10, 2, 9]);
  assert.deepEqual(ids("x", -1), [10, 2, 9]);
  assert.deepEqual(ids("y", 1), [10, 2, 9]);
  assert.deepEqual(ids("y", -1), [9, 2, 10]);
});

test("sortNodes by y breaks ties on x, by name breaks ties on id", () => {
  const nodes = [
    { id: 3, name: "Note", x: 500, y: 10 },
    { id: 1, name: "Note", x: 100, y: 10 },
  ];
  assert.deepEqual(sortNodes(nodes, { key: "y", dir: 1 }).map((n) => n.id), [1, 3]);
  assert.deepEqual(sortNodes(nodes, { key: "name", dir: 1 }).map((n) => n.id), [1, 3]);
  assert.deepEqual(sortNodes(nodes, { key: "name", dir: -1 }).map((n) => n.id), [3, 1]);
});

test("nextSort starts a new column ascending and flips the current one", () => {
  assert.deepEqual(nextSort({ key: "x", dir: 1 }, "id"), { key: "id", dir: 1 });
  assert.deepEqual(nextSort({ key: "id", dir: 1 }, "id"), { key: "id", dir: -1 });
  assert.deepEqual(nextSort({ key: "id", dir: -1 }, "id"), { key: "id", dir: 1 });
  assert.deepEqual(nextSort({ key: "id", dir: -1 }, "name"), { key: "name", dir: 1 });
});

test("clampOffset rounds to whole pixels and falls back to 90 on garbage", () => {
  assert.equal(clampOffset(80), 80);
  assert.equal(clampOffset("120.6"), 121);
  assert.equal(clampOffset(0), 0);
  assert.equal(clampOffset(-40), -40);
  assert.equal(clampOffset(""), 90);
  assert.equal(clampOffset("abc"), 90);
  assert.equal(clampOffset(undefined), 90);
  assert.equal(clampOffset(Infinity), 90);
});

test("clampWidth keeps a column between its minimum and 400", () => {
  assert.equal(clampWidth("x", 60.4), 60);
  assert.equal(clampWidth("x", 1), 24);
  assert.equal(clampWidth("zoom", 1), 64);
  assert.equal(clampWidth("key", 9999), 400);
  assert.equal(clampWidth("id", "nope"), 32);
  assert.equal(clampWidth("zoom", undefined), 84);
});

test("readSettings returns the defaults for missing or malformed input", () => {
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings("nope"), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings([]), DEFAULT_SETTINGS);
  assert.deepEqual(
    readSettings({ offset: "x", sort: { key: "zoom", dir: 5 }, widths: [] }),
    DEFAULT_SETTINGS,
  );
});

test("readSettings keeps valid values and coerces the rest", () => {
  const raw = {
    offset: ["80", 60.2],
    sort: { key: "name", dir: -1 },
    widths: { id: 50, x: 2, zoom: "120", bogus: 10 },
  };
  assert.deepEqual(readSettings(raw), {
    offset: [80, 60],
    sort: { key: "name", dir: -1 },
    widths: { id: 50, x: 24, y: 48, key: 64, zoom: 120 },
  });
});

test("readSettings does not share objects with its input", () => {
  const raw = { offset: [1, 2], sort: { key: "id", dir: 1 }, widths: { id: 40 } };
  const settings = readSettings(raw);
  settings.offset[0] = 99;
  settings.sort.dir = -1;
  settings.widths.id = 99;
  assert.deepEqual(raw, { offset: [1, 2], sort: { key: "id", dir: 1 }, widths: { id: 40 } });
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
});

test("findTarget returns the first match across states in order", () => {
  const s1 = { version: 1, rows: { "5": { hotkey: 2, zoom: 1.5 } } };
  const s2 = { version: 1, rows: { "8": { hotkey: 2, zoom: 0.5 }, "9": { hotkey: 7, zoom: 2 } } };
  assert.deepEqual(findTarget([s1, s2], 2), { id: "5", zoom: 1.5, index: 0 });
  assert.deepEqual(findTarget([s1, s2], 7), { id: "9", zoom: 2, index: 1 });
  assert.equal(findTarget([s1, s2], 4), null);
  assert.equal(findTarget([], 2), null);
});

test("findTarget never matches -1", () => {
  const s = { version: 1, rows: { "5": { hotkey: -1, zoom: 1.5 } } };
  assert.equal(findTarget([s], -1), null);
});

test("panOffsetFor puts the node title bar at the offset", () => {
  assert.deepEqual(panOffsetFor([100, 200], 1, 30, [24, 24]), [-76, -146]);
  assert.deepEqual(panOffsetFor([100, 200], 2, 30, [24, 24]), [-88, -158]);
  assert.deepEqual(panOffsetFor([0, 30], 0.5, 30, [24, 24]), [48, 48]);
});

test("panOffsetFor takes a separate x and y offset", () => {
  assert.deepEqual(panOffsetFor([100, 200], 1, 30, [80, 10]), [-20, -160]);
  assert.deepEqual(panOffsetFor([100, 200], 2, 30, [80, 10]), [-60, -165]);
});
