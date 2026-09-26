import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATE, formatContext, formatDate, formatPrice, readState, toggleFavorite, visibleModels,
} from "../web/openrouter_core.js";

const M = (id, name, inputs, prompt, completion, created, context) => ({
  id, name, input_modalities: ["text", ...inputs], prompt_price: prompt, completion_price: completion,
  created, context_length: context,
});
const MODELS = [
  M("b/text", "Beta Text", [], 1, 2, 300, 8000),
  M("a/vision", "Alpha Vision", ["image"], 0.5, 4, 200, 128000),
  M("c/all", "Gamma All", ["image", "audio", "video"], null, null, 100, 1000000),
  M("d/free", "Delta Free", ["image"], 0, 0, 400, null),
];
const ids = (rows) => rows.map((m) => m.id);
const view = (state, favorites = []) => ids(visibleModels(MODELS, { ...DEFAULT_STATE, search: "", ...state }, favorites));

test("tabs filter by accepted input", () => {
  assert.deepEqual(view({ tab: "TEXT2TEXT" }), ["a/vision", "b/text", "d/free", "c/all"]);
  assert.deepEqual(view({ tab: "IMAGE2TEXT" }), ["a/vision", "d/free", "c/all"]);
  assert.deepEqual(view({ tab: "AUDIO2TEXT" }), ["c/all"]);
  assert.deepEqual(view({ tab: "VIDEO2TEXT" }), ["c/all"]);
});

test("search matches name or id, ignoring case and spaces", () => {
  assert.deepEqual(view({ tab: "TEXT2TEXT", search: "  VISION " }), ["a/vision"]);
  assert.deepEqual(view({ tab: "TEXT2TEXT", search: "d/" }), ["d/free"]);
});

test("each sort column has its natural direction, reverse flips it", () => {
  const t = { tab: "TEXT2TEXT" };
  assert.deepEqual(view({ ...t, sort: "name", reverse: true }), ["c/all", "d/free", "b/text", "a/vision"]);
  assert.deepEqual(view({ ...t, sort: "input" }), ["d/free", "a/vision", "b/text", "c/all"]);
  assert.deepEqual(view({ ...t, sort: "output" }), ["d/free", "b/text", "a/vision", "c/all"]);
  assert.deepEqual(view({ ...t, sort: "released" }), ["d/free", "b/text", "a/vision", "c/all"]);
  assert.deepEqual(view({ ...t, sort: "context" }), ["c/all", "a/vision", "b/text", "d/free"]);
});

test("missing values sort last in both directions", () => {
  const t = { tab: "TEXT2TEXT" };
  assert.equal(view({ ...t, sort: "input", reverse: true }).at(-1), "c/all");
  assert.equal(view({ ...t, sort: "context", reverse: true }).at(-1), "d/free");
});

test("favorites come first, sorted the same way", () => {
  assert.deepEqual(view({ tab: "TEXT2TEXT", sort: "name" }, ["c/all", "b/text"]),
    ["b/text", "c/all", "a/vision", "d/free"]);
});

test("favorites OpenRouter no longer lists are ignored", () => {
  assert.deepEqual(view({ tab: "AUDIO2TEXT" }, ["gone/model"]), ["c/all"]);
});

test("toggleFavorite adds and removes without mutating", () => {
  const favs = ["a"];
  assert.deepEqual(toggleFavorite(favs, "b"), ["a", "b"]);
  assert.deepEqual(toggleFavorite(favs, "a"), []);
  assert.deepEqual(favs, ["a"]);
});

test("readState fills defaults and drops unknown values", () => {
  assert.deepEqual(readState(undefined), DEFAULT_STATE);
  assert.deepEqual(readState({ tab: "VIDEO2TEXT", sort: "bogus", reverse: true }),
    { tab: "VIDEO2TEXT", sort: "name", reverse: true });
});

test("formatting", () => {
  assert.equal(formatPrice(null), "varies");
  assert.equal(formatPrice(0), "free");
  assert.equal(formatPrice(0.075), "0.075");
  assert.equal(formatPrice(0.15), "0.15");
  assert.equal(formatPrice(15), "15.00");
  assert.equal(formatContext(1050000), "1.05M");
  assert.equal(formatContext(1000000), "1M");
  assert.equal(formatContext(36864), "37K");
  assert.equal(formatContext(512), "512");
  assert.equal(formatContext(null), "—");
  assert.equal(formatDate(1790380800), "2026-09-26");
  assert.equal(formatDate(null), "—");
});
