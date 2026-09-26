import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTPUT_TYPES, runCount, splitItems } from "../web/rotater_core.js";

test("splitItems trims items and drops empty ones", () => {
  assert.deepEqual(splitItems("man; woman ;dog;", ";"), ["man", "woman", "dog"]);
});

test("splitItems handles a multi-character delimiter", () => {
  assert.deepEqual(splitItems("a cat||a dog", "||"), ["a cat", "a dog"]);
});

test("splitItems treats a typed \\n as a line break", () => {
  assert.deepEqual(splitItems("man\nwoman\n\ndog", "\\n"), ["man", "woman", "dog"]);
});

test("splitItems with an empty delimiter gives one item", () => {
  assert.deepEqual(splitItems("man;woman", ""), ["man;woman"]);
});

test("splitItems survives missing values", () => {
  assert.deepEqual(splitItems(undefined, undefined), []);
});

test("runCount is the longest list, and at least 1", () => {
  assert.equal(runCount([3]), 3);
  assert.equal(runCount([3, 2]), 3);
  assert.equal(runCount([0]), 1);
  assert.equal(runCount([]), 1);
});

test("OUTPUT_TYPES maps every dropdown choice to a socket type", () => {
  assert.deepEqual(OUTPUT_TYPES, { string: "STRING", int: "INT", float: "FLOAT", combo: "COMBO" });
});
