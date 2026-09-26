// Repair a wire that BYPASSING an upstream node drops, or silently re-points,
// when the consumer's input is a wildcard ("*").
//
// WHY THIS EXISTS (mechanism read in core, frontend 1.51.10, not inferred):
// `ExecutableNodeDTO._getBypassSlotIndex(slot, type)` opens with
//
//     if (type === '*' || type === '') {
//       return inputs.length > slot ? slot : 0
//     }
//
// so when the DOWNSTREAM consumer's input type is `*`, core does no type matching
// at all - it takes the bypassed node's input at the SAME INDEX as the output slot
// being asked for, falling back to index 0. Every branch below it does proper
// `isValidConnection` matching; only the wildcard path skips it. `outputType` is
// computed one line above and never used on that path.
//
// Measured consequence, AI Prompt (`text` STRING out at slot 0, `clip` CLIP in at
// index 0) bypassed between a Text node and Show Text:
//   - CLIP branch also bypassed -> the link VANISHES, and validation fails with
//     "is missing a required input: source" while the wire is plainly on canvas.
//   - CLIP branch still enabled -> `source` silently becomes the CLIPLoader's CLIP
//     output. No error at all. This is the worse half.
// A node is therefore only correct BY LUCK: one whose pass-through input happens to
// sit at the output's index works, one whose first input is a model does not. Group
// Switch's Bypass mode is our own feature, so we walk people into it.
//
// WHAT THIS DOES: after `graphToPrompt` has built the prompt, re-resolve our own
// nodes' wildcard inputs through the bypassed ancestors using the type matching
// core skipped, and write the answer back.
//
// SCOPE, deliberately narrow (see CLAUDE.md "Code review protocol" and
// [[feedback_no_global_patches_cloud_platforms]]):
//   - Only inputs on nodes whose comfyClass starts with "Pixaroma". Another pack's
//     node is never touched, and core's resolver is never patched.
//   - Only slots whose LIVE type is "*" and which actually carry a link.
//   - An EXISTING value is replaced only when it is type-INCOMPATIBLE with the wire
//     the user actually drew. A compatible answer from core is always left alone.
//   - A resolution is written only if the node it names really is in the prompt, so
//     virtual nodes (Set/Get), subgraph ids and anything else we cannot reason
//     about degrade to "leave it as core had it" rather than to a broken ref.
//   - MUTED (mode 2) upstream still resolves to nothing, because a muted node
//     genuinely produces no output. That is correct behaviour, not a bug to fix.
//
// Harness: `D:\Claude Tests\_bypass_repair_harness.js` (records values, mutation-
// validated). Baseline before this module: 3 DROPPED, 1 MISROUTED, 3 OK.

import { app } from "/scripts/app.js";
import { slotAccepts, isWildcardType } from "./slot_types.js";

const MODE_MUTED = 2;
const MODE_BYPASS = 4;
const MAX_HOPS = 64; // a chain longer than this is pathological; bail rather than spin

// Wildcard + type-compatibility both come from `js/shared/slot_types.mjs`, which is
// the pack's ONE slot-type reader (Vue Compat #22). ⚠️ Do NOT hand-roll either of
// these back: a V3 `io.MultiType` input reaches the browser as the COMMA-JOINED
// string "FLOAT,INT,BOOLEAN" (core's own Math Expression node is built that way),
// so any `===` comparison judges a perfectly valid slot incompatible. The first
// version of this file did exactly that in a fallback, and a reviewer showed it
// could then walk PAST the correct input and overwrite a good value with a
// different one - the single way this module could ever corrupt a working prompt.
const isWildcard = isWildcardType;
const typesCompatible = slotAccepts;

// Is this one of OUR nodes? ⚠️ `comfyClass.startsWith("Pixaroma")` is WRONG and was
// the first version of this test: two of our 82 classes are named the other way
// round - `NotifyPixaroma` and `KreaLoraConvertPixaroma` - and Notify Pixaroma has
// a wildcard `any` input, so a startsWith gate silently left the node that most
// needs this fix uncovered. Match the CATEGORY the way `js/brand/index.js` does
// (that is the pack's own ownership test), with a substring on the class as the
// belt for anything reached before its def is attached.
function isOurNode(node) {
  const cls = node.comfyClass || node.type || "";
  if (cls.includes("Pixaroma")) return true;
  const cat = node.constructor?.nodeData?.category;
  return typeof cat === "string" && cat.startsWith("👑 Pixaroma");
}

function getLink(graph, linkId) {
  if (linkId == null) return null;
  // graph.links may be a Map on newer frontends (Vue Compat #3).
  let link = graph.links?.[linkId];
  if (!link && typeof graph.links?.get === "function") link = graph.links.get(linkId);
  if (!link && typeof graph._links?.get === "function") link = graph._links.get(linkId);
  return link || null;
}

/**
 * Pick which INPUT of a bypassed node carries `wantType` through to `outSlot`.
 * This is core's own non-wildcard preference order, which the "*" branch skips:
 * the same index first (when it is actually compatible), then an exact type match,
 * then the first compatible input.
 * @returns {number} input index, or -1 when nothing can carry the type.
 */
function bypassInputIndex(node, outSlot, wantType) {
  const inputs = node.inputs || [];
  if (!inputs.length) return -1;

  // 1. The same index, when it can actually carry the type. This tier is what
  //    makes the module safe: it is also core's blind wildcard pick, so whenever
  //    the same-index slot IS compatible we agree with core and change nothing.
  const same = inputs[outSlot];
  if (same && typesCompatible(same.type, wantType)) return outSlot;

  // 2. A concretely-typed input that accepts it, preferred over a wildcard one so
  //    a real STRING beats a pass-through `*`. ⚠️ Membership, NOT `===` - a
  //    multi-type slot is the comma-joined "FLOAT,INT,BOOLEAN" and an equality
  //    test walks straight past it (Vue Compat #22).
  const typed = inputs.findIndex((s) => !isWildcard(s.type) && typesCompatible(s.type, wantType));
  if (typed !== -1) return typed;

  // 3. Anything that accepts it, wildcards included.
  return inputs.findIndex((s) => typesCompatible(s.type, wantType));
}

/**
 * Walk from a link's origin through any bypassed ancestors to the first ENABLED
 * node, matching on type at every hop.
 * @returns {{id: string, slot: number} | null} null when the chain genuinely ends
 *   (muted node, unwired input, nothing type-compatible).
 */
function resolveThroughBypass(graph, originId, originSlot, wantType) {
  const visited = new Set();
  let id = originId;
  let slot = originSlot;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const key = `${id}:${slot}`;
    if (visited.has(key)) return null; // cycle guard
    visited.add(key);

    const node = graph.getNodeById(Number(id)) ?? graph.getNodeById(id);
    if (!node) return null;

    // A muted node produces nothing. Correct to resolve to null.
    if (node.mode === MODE_MUTED) return null;

    if (node.mode !== MODE_BYPASS) return { id: String(id), slot };

    // Bypassed: hop across it, preferring an input that can carry this type.
    const outType = node.outputs?.[slot]?.type;
    const carry = isWildcard(outType) ? wantType : outType;
    const inIdx = bypassInputIndex(node, slot, carry);
    if (inIdx === -1) return null;

    const link = getLink(graph, node.inputs[inIdx]?.link);
    if (!link) return null; // that input is not wired - the chain ends here

    id = link.origin_id;
    slot = link.origin_slot;
  }
  return null;
}

/** Repair one built prompt in place. Returns the list of edits, for the harness. */
export function repairBypassedWildcardInputs(prompt, graph = app.graph) {
  const edits = [];
  const output = prompt?.output;
  if (!output || !graph?._nodes) return edits;

  for (const node of graph._nodes) {
    if (!isOurNode(node)) continue; // our own nodes only
    if (node.mode === MODE_MUTED || node.mode === MODE_BYPASS) continue;

    const entry = output[String(node.id)];
    if (!entry || !entry.inputs) continue;

    for (const slot of node.inputs || []) {
      if (!isWildcard(slot.type)) continue; // only the wildcard short circuit misfires
      const link = getLink(graph, slot.link);
      if (!link) continue;

      // The type the user actually drew: the declared output type at the far end.
      const originNode = graph.getNodeById(Number(link.origin_id)) ?? graph.getNodeById(link.origin_id);
      if (!originNode) continue;
      const wireType = originNode.outputs?.[link.origin_slot]?.type;

      const current = entry.inputs[slot.name];
      const had = current !== undefined && current !== null;

      // Leave a present, type-compatible answer alone. We only act on core's
      // wildcard short circuit, never on a resolution that already makes sense.
      if (had) {
        if (isWildcard(wireType)) continue; // cannot judge - do not touch
        const curNode = graph.getNodeById(Number(current[0])) ?? graph.getNodeById(current[0]);
        const curType = curNode?.outputs?.[current[1]]?.type;
        if (curType === undefined || typesCompatible(curType, wireType)) continue;
      }

      const fixed = resolveThroughBypass(graph, link.origin_id, link.origin_slot, wireType);
      if (!fixed) continue; // genuinely nothing upstream - leave core's answer

      // Never write a reference to a node that is not in the prompt (virtual nodes,
      // subgraph ids, anything we cannot reason about).
      if (!output[fixed.id]) continue;

      const next = [fixed.id, fixed.slot];
      if (JSON.stringify(current) === JSON.stringify(next)) continue;

      entry.inputs[slot.name] = next;
      edits.push({
        node: String(node.id),
        cls: node.comfyClass || node.type || "",
        input: slot.name,
        from: current ?? null,
        to: next,
        reason: had ? "misrouted" : "dropped",
      });
    }
  }
  return edits;
}

/** Wrap `app.graphToPrompt` once so every submission is repaired. */
export function installBypassRepair() {
  if (app.__rpcBypassRepairInstalled) return;
  app.__rpcBypassRepairInstalled = true;

  const orig = app.graphToPrompt;
  app.graphToPrompt = async function (...args) {
    const result = await orig.apply(this, args);
    try {
      const edits = repairBypassedWildcardInputs(result, this.graph || app.graph);
      // Kept for support: "what did the repair touch on that run?" is otherwise
      // invisible, and the answer on a healthy workflow must be an empty array.
      app.__rpcBypassLastEdits = edits;
      if (edits.length) {
        console.debug("[Pixaroma] repaired bypassed wildcard input(s):", edits);
      }
    } catch (err) {
      // Degrade, never brick: a failed repair must not stop the user queueing.
      console.warn("[Pixaroma] bypass repair skipped:", err);
    }
    return result;
  };
}
