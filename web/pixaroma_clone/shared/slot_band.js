/**
 * A short readout floated onto the level of a node's input/output dots, in the
 * dead space beside their labels, so it costs the node NO extra height.
 *
 * Extracted from Save Mp4 when Load Video became the second consumer, which is
 * the pack's own rule (CLAUDE.md convention #12: promote to a shared helper on
 * the second node rather than copying). The full recipe and every measurement
 * behind it are in `.claude/patterns/save-mp4.md` #25 + #27 and CLAUDE.md
 * convention #39 - read those before changing anything here.
 *
 * THE FOUR THINGS THAT COST REAL TIME, all measured, none guessable:
 *
 * 1. The host widget's root usually carries `overflow:hidden` (for its rounded
 *    corners). The band is floated ABOVE that root, so an un-moved
 *    overflow:hidden CLIPS IT AWAY ENTIRELY. Move the clipping to an inner
 *    `position:absolute; inset:0` layer, which covers the same box.
 * 2. The vertical offset DIFFERS between renderers (measured -189 vs -209 on
 *    one node). In Nodes 2.0 we align to the real slot ELEMENT, so no constant
 *    can go stale; only Classic uses the documented row maths.
 * 3. The horizontal edge is NOT the widget root's edge in either renderer. In
 *    Classic LiteGraph insets the pills 15px while the root is inset less; in
 *    Nodes 2.0 a widget row spans the FULL node width with padding inside it.
 *    Match the row's CONTENT edge, or the band sits a few px out and it shows.
 * 4. A ResizeObserver is NOT enough: the root MOVES without RESIZING while the
 *    rows above it lay out, so the observer never fires and the band keeps an
 *    offset computed too early (measured 19px off on a fresh Nodes 2.0 load).
 *    `settleSlotBand` re-places on a short burst instead.
 *
 * Everything here writes ONLY the band's own inline style, so it can never
 * touch serialized state and is safe to call on the load path (Vue Compat #18).
 */
import { app } from "/scripts/app.js";

// Keep in step with the stylesheet below: the centring maths cannot measure it,
// because the band is :empty -> display:none for most of its life and a hidden
// element measures 0.
export const BAND_H = 24;

// LiteGraph's own widget inset when it paints the pills (drawNodeWidgets'
// `margin`). Classic only.
const CLASSIC_WIDGET_MARGIN = 15;
// Classic slot rows: TOP_PAD 4 + i*NODE_SLOT_HEIGHT + NODE_SLOT_HEIGHT/2
// (Vue Compat #16).
const CLASSIC_TOP_PAD = 4;
const CLASSIC_SLOT_H = 20;

let _cssInjected = false;

function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.id = "rpc-slot-band-css";
  style.textContent = `
.rpc-slot-band { position:absolute; height:${BAND_H}px; display:flex; align-items:center; pointer-events:none; font:22px Consolas,ui-monospace,monospace; color:#cdcdcd; white-space:nowrap; text-shadow:0 1px 2px rgba(0,0,0,0.6); }
.rpc-slot-band.is-right { justify-content:flex-end; }
.rpc-slot-band.is-left { justify-content:flex-start; }
.rpc-slot-band:empty { display:none; }
`;
  document.head.appendChild(style);
}

/**
 * Make the band and put it in `root`.
 *
 * FIRST child on purpose: if the float is ever removed it then degrades to a
 * strip ABOVE the content rather than sitting on top of it (convention #39).
 * Starts EMPTY, and `:empty` hides it, so a node with nothing to report shows
 * nothing at all.
 */
export function createSlotBand(root, side = "right") {
  injectCSS();
  const band = document.createElement("div");
  band.className = "rpc-slot-band " + (side === "left" ? "is-left" : "is-right");
  root.insertBefore(band, root.firstChild);
  return band;
}

/** The widget row to measure the content edge against: any row but ours. */
function otherWidgetRow(nodeEl, band) {
  return [...nodeEl.querySelectorAll(".lg-node-widget")].find((r) => !r.contains(band));
}

/**
 * Sit the band on the level of one slot dot, flush with the widget column.
 *
 * `opts.side`  "right" (beside the INPUT labels) or "left" (beside the OUTPUT
 *              labels, where the dead space is on the other side).
 * `opts.slot`  "input" or "output" - which run of dots to align to.
 * `opts.index` which dot in that run, 0-based.
 */
export function placeSlotBand(node, band, opts = {}) {
  if (!band || !band.isConnected) return;
  const side = opts.side === "left" ? "left" : "right";
  const slotKind = opts.slot === "output" ? "output" : "input";
  const index = opts.index || 0;
  try {
    const root = band.parentElement;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const ds = app?.canvas?.ds;
    const scale = ds?.scale || 1;

    const nodeEl = band.closest(".lg-node");
    if (nodeEl) {
      // ── Nodes 2.0: align to the REAL elements, so nothing can go stale ──
      const slots = nodeEl.querySelectorAll(`[class*="lg-slot--${slotKind}"]`);
      const slotEl = slots[index];
      if (slotEl) {
        const sr = slotEl.getBoundingClientRect();
        band.style.top =
          Math.round((sr.top + sr.height / 2 - rootRect.top) / scale - BAND_H / 2) + "px";
      }
      const row = otherWidgetRow(nodeEl, band);
      if (row) {
        // Measure the row's LAST element child, which is the grid holding the
        // label and the control - that IS what the eye reads as the column.
        //
        // NOT the row's own padding box, which was the first attempt and is
        // wrong on the left: MEASURED, `padding-left` is 0 and the row's FIRST
        // child is a 12px dot column, so "row left + padding-left" lands on the
        // node's edge while every label starts 12px further in. It looked
        // correct in a check that compared the band against the same padding
        // box it had been aligned to - the two agreed while the thing on screen
        // was visibly out. On the right the two happen to coincide (padding
        // 12px, dot column on the other side), which is why only the left
        // showed it.
        const content = row.lastElementChild || row;
        const cr = content.getBoundingClientRect();
        if (side === "left") {
          band.style.left = Math.round((cr.left - rootRect.left) / scale) + "px";
          band.style.right = "auto";
        } else {
          band.style.right = Math.round((rootRect.right - cr.right) / scale) + "px";
          band.style.left = "auto";
        }
      }
      return;
    }

    // ── Classic: the canvas paints the dots, so compute from the node box ──
    const cvs = app?.canvas?.canvas;
    if (!cvs || !ds) return;
    const cvsRect = cvs.getBoundingClientRect();
    const rootTopLocal =
      (rootRect.top - cvsRect.top) / scale - ds.offset[1] - node.pos[1];
    const slotY = CLASSIC_TOP_PAD + index * CLASSIC_SLOT_H + CLASSIC_SLOT_H / 2;
    band.style.top = Math.round(slotY - rootTopLocal - BAND_H / 2) + "px";

    const rootLeftLocal =
      (rootRect.left - cvsRect.left) / scale - ds.offset[0] - node.pos[0];
    const rootRightLocal = rootLeftLocal + rootRect.width / scale;
    if (side === "left") {
      band.style.left =
        Math.round(Math.max(0, CLASSIC_WIDGET_MARGIN - rootLeftLocal)) + "px";
      band.style.right = "auto";
    } else {
      const wantRight = node.size[0] - CLASSIC_WIDGET_MARGIN;
      band.style.right = Math.round(Math.max(0, rootRightLocal - wantRight)) + "px";
      band.style.left = "auto";
    }
  } catch (_e) {
    /* leave the band where it is rather than throwing during a paint */
  }
}

/**
 * Re-place while the layout settles.
 *
 * A burst, not a permanent poll: four timeouts per call, each writing only the
 * band's own inline style. See note 4 in the header for why a ResizeObserver
 * alone leaves the band 19px off on a fresh Nodes 2.0 load.
 */
export function settleSlotBand(node, band, opts = {}) {
  requestAnimationFrame(() => placeSlotBand(node, band, opts));
  for (const ms of [150, 500, 1500]) {
    setTimeout(() => placeSlotBand(node, band, opts), ms);
  }
}

/**
 * Watch the host element so the band follows a node being resized.
 *
 * Returns an uninstall function. Keep this AS WELL AS settleSlotBand: the
 * observer is what catches a drag-resize (which moves the Classic horizontal
 * offset, derived from node.size[0]), and the burst is what catches the
 * move-without-resize the observer cannot see.
 */
export function watchSlotBand(node, band, hostEl, opts = {}) {
  try {
    const ro = new ResizeObserver(() => placeSlotBand(node, band, opts));
    ro.observe(hostEl);
    return () => ro.disconnect();
  } catch (_e) {
    return () => {};
  }
}
