// "A Pixaroma router just switched to a different branch."
//
// WHY THIS EXISTS. A node that shows a picture of whatever is wired into it
// (today only Inpaint Crop) has to walk back up the graph to find the source,
// and that walk ASKS our routers which branch is live - Switch Pixaroma's
// `activeIndex`, Switch Source's A/B. Flipping one of those changes the answer,
// but nothing in LiteGraph tells the downstream node: no wire moved, no node
// was added, so no hook fires. The picture then sits there showing the OTHER
// branch until something unrelated refreshes it.
//
// Reported 2026-09-17 by Márcio, whose agent solved it with an 800ms poll on
// every node. A poll is the wrong shape here - it burns work forever to catch
// an event that happens when somebody clicks - and the pack has just been bitten
// by exactly that (Group Switch was walking every group twice per painted frame,
// Discord 2026-09-18). So the routers say when they change instead, and the cost
// while nobody is clicking is nil.
//
// DELIBERATELY NOT a DOM CustomEvent: Switch paints its rows on the canvas in
// the Classic renderer, so there is no element to dispatch from, and a document
// -level event would be caught by the pack-wide change net (convention #31).
//
// RULES for anything that subscribes:
//   - Treat it as a HINT, not a fact. Re-read the graph; never trust a payload.
//   - Gate any SERIALIZED write on `isGraphLoading()`. This only ever fires from
//     a click today, but a subscriber must not be the thing that makes an
//     untouched workflow dirty (Vue Compat #18).
//   - Keep the handler cheap. Every Inpaint Crop on the canvas gets called.
const _subs = new Set();

/** Subscribe. Returns an unsubscribe function - call it in `onRemoved`. */
export function onRouterChanged(fn) {
  if (typeof fn !== "function") return () => {};
  _subs.add(fn);
  return () => _subs.delete(fn);
}

/**
 * Announce that `node` (a router) now points somewhere else.
 * Call it ONLY on a real, user-driven change - never on the load/restore path,
 * and never when the value did not actually move.
 */
export function notifyRouterChanged(node) {
  if (!_subs.size) return;
  // copy: a handler may unsubscribe itself while we iterate
  for (const fn of [..._subs]) {
    try { fn(node); } catch (_e) { /* one bad subscriber must not stop the rest */ }
  }
}
