// Pure logic for the Rotater node (web/rotater.js). No DOM and no ComfyUI
// imports, so `node --test tests/rotater_core.test.mjs` can run it.

// Dropdown choice -> type of the output socket.
export const OUTPUT_TYPES = Object.freeze({ string: "STRING", int: "INT", float: "FLOAT", combo: "COMBO" });

// Mirror of split_items in rotater.py: trimmed, non-empty items; a typed \n in
// the delimiter means a line break.
export function splitItems(values, delimiter) {
  const text = String(values ?? "");
  const d = String(delimiter ?? "").replaceAll("\\n", "\n");
  const parts = d ? text.split(d) : [text];
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Runs to queue for one press of Run: the longest list among the active
// Rotater nodes. Shorter lists wrap around (rotater.py takes index % length).
export function runCount(itemCounts) {
  return Math.max(1, ...itemCounts);
}
