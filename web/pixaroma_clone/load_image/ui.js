import { app } from "/scripts/app.js";
import { pixApiUrl, pixAsset } from "../shared/api_url.js";
import { BRAND } from "../shared/index.js";

let _cssInjected = false;

export function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const css = `
    .rpc-li-root {
      width: 100%;
      box-sizing: border-box;
      position: relative;
      background: #2a2a2a;
      border-radius: 4px;
      color: #ddd;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 11px;
    }
    /* The flex column lives on an inner layer that fills the root (absolute
       inset:0). ComfyUI forces the widget ROOT to display:block on rebuild /
       collapse, which would kill a flex column ON the root (the 7px gaps
       collapse and the flex:1 image canvas drops to its min height, then
       visibly grows back when flex is restored - the flicker). The inner is
       never touched by ComfyUI, so the layout is ALWAYS flex: no transition,
       no flicker. Padding lives here so the absolute inner respects it. */
    .rpc-li-inner {
      position: absolute;
      inset: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 7px;
      /* Small top padding pulls the Upload button up tight under the output
         dots (the body can't sit higher than the slot area). */
      padding: 2px 8px 8px;
      box-sizing: border-box;
    }
    .rpc-li-upload-btn {
      width: 100%;
      background: var(--rpc-acc,#f66744);
      border: none;
      border-radius: 4px;
      padding: 7px 8px;
      font-size: 11px;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      font-family: inherit;
      transition: background 0.08s;
    }
    .rpc-li-upload-btn:hover { background: #ff7e5a; }
    .rpc-li-upload-btn .ico {
      width: 14px; height: 14px;
      background-color: currentColor;
      -webkit-mask: url("${pixAsset("icons/ui/upload.svg")}") center/14px 14px no-repeat;
              mask: url("${pixAsset("icons/ui/upload.svg")}") center/14px 14px no-repeat;
    }
    .rpc-li-hint {
      font-size: 9px;
      color: #777;
      text-align: center;
      letter-spacing: 0.3px;
      margin-top: -3px;
    }
    .rpc-li-hint kbd {
      color: #aaa;
      font-family: inherit;
      background: transparent;
      padding: 0;
    }
    /* File row: [◀] [ dropdown ] [▶] - arrow buttons let the user flip
       through images visually, matching native ComfyUI LoadImage. */
    .rpc-li-filerow {
      display: flex;
      gap: 6px;
      align-items: stretch;
    }
    .rpc-li-filerow .rpc-li-dropdown { flex: 1; min-width: 0; }
    /* File nav arrows match the resample picker exactly (orange, 30px, solid). */
    .rpc-li-nav {
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 4px;
      color: var(--rpc-acc,#f66744);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      width: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      transition: background 0.08s, border-color 0.08s, color 0.08s;
      flex-shrink: 0;
    }
    .rpc-li-nav:hover:not(.disabled) { border-color: var(--rpc-acc,#f66744); }
    .rpc-li-nav.disabled { opacity: 0.3; cursor: default; }
    .rpc-li-dropdown {
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 11px;
      color: #ccc;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }
    .rpc-li-dropdown:hover { border-color: var(--rpc-acc,#f66744); }
    .rpc-li-dropdown .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rpc-li-dropdown .arrow { color: var(--rpc-acc,#f66744); font-size: 13px; margin-left: 6px; line-height: 1; }
    .rpc-li-dropdown .counter {
      color: #777;
      font-size: 9px;
      margin-left: 6px;
      flex-shrink: 0;
    }
    .rpc-li-chips {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
    }
    .rpc-li-chip {
      box-sizing: border-box;
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 6px 3px;
      text-align: center;
      font-size: 9.5px;
      color: #ccc;
      cursor: pointer;
      user-select: none;
      transition: background 0.08s, border-color 0.08s;
    }
    .rpc-li-chip:hover { border-color: var(--rpc-acc,#f66744); color: #ddd; }
    .rpc-li-chip.active {
      background: var(--rpc-acc,#f66744);
      color: #fff;
      border-color: var(--rpc-acc,#f66744);
    }
    .rpc-li-panel {
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 8px 10px;
    }
    .rpc-li-panel-row { display: flex; align-items: center; gap: 8px; }
    .rpc-li-panel-label {
      font-size: 9px;
      color: var(--rpc-acc,#f66744);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .rpc-li-panel input[type="range"] {
      flex: 1;
      accent-color: var(--rpc-acc,#f66744);
    }
    .rpc-li-panel input[type="text"], .rpc-li-panel input[type="number"] {
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 3px;
      padding: 4px 6px;
      color: var(--rpc-acc,#f66744);
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      font-family: inherit;
      box-sizing: border-box;
    }
    .rpc-li-panel input[type="text"]:focus, .rpc-li-panel input[type="number"]:focus {
      outline: none;
      border-color: var(--rpc-acc,#f66744);
    }
    .rpc-li-panel-readout {
      font-size: 9px;
      color: #888;
      font-family: inherit;
      text-align: center;
      margin-top: 6px;
    }
    .rpc-li-quickpicks {
      display: grid;
      gap: 3px;
      margin-bottom: 8px;
    }
    .rpc-li-quickpick {
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 3px;
      color: #aaa;
      padding: 4px 0;
      text-align: center;
      font-size: 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .rpc-li-quickpick:hover { border-color: #666; color: #ddd; }
    .rpc-li-quickpick.active {
      background: var(--rpc-acc,#f66744);
      color: #fff;
      border-color: var(--rpc-acc,#f66744);
    }
    .rpc-li-value {
      font-family: inherit;
      font-size: 12px;
      color: var(--rpc-acc,#f66744);
      font-weight: 600;
      min-width: 50px;
      text-align: right;
    }
    .rpc-li-ratio-chips {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
      margin-bottom: 8px;
    }
    .rpc-li-ratio-chip {
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 3px;
      padding: 4px 0;
      text-align: center;
      font-size: 9px;
      color: #aaa;
      cursor: pointer;
      font-family: inherit;
    }
    .rpc-li-ratio-chip:hover { border-color: #666; color: #ddd; }
    .rpc-li-ratio-chip.active {
      background: var(--rpc-acc,#f66744);
      color: #fff;
      border-color: var(--rpc-acc,#f66744);
    }
    .rpc-li-cropped {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .rpc-li-cropped > div {
      text-align: center;
      font-size: 10px;
      padding: 5px 0;
      color: #aaa;
      cursor: pointer;
      user-select: none;
    }
    .rpc-li-cropped > div.active { background: var(--rpc-acc,#f66744); color: #fff; }
    .rpc-li-pad-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: #888;
    }
    .rpc-li-pad-swatch {
      width: 22px; height: 22px;
      border-radius: 3px;
      border: 1px solid #444;
      cursor: pointer;
    }
    .rpc-li-custom-ratio-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    /* Custom ratio inputs sit inside a .rpc-li-numinput wrapper — the
       wrapper supplies border/background; we just fix the width. */
    .rpc-li-custom-ratio-input-wrap { width: 64px; }
    .rpc-li-custom-ratio-swap {
      width: 24px;
      height: 22px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 3px;
      color: #aaa;
      cursor: pointer;
      position: relative;
      padding: 0;
      display: inline-block;
    }
    .rpc-li-custom-ratio-swap::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: currentColor;
      -webkit-mask: url("${pixAsset("icons/ui/swap.svg")}") center/14px 14px no-repeat;
              mask: url("${pixAsset("icons/ui/swap.svg")}") center/14px 14px no-repeat;
      pointer-events: none;
    }
    .rpc-li-custom-ratio-swap:hover { color: var(--rpc-acc,#f66744); border-color: var(--rpc-acc,#f66744); }
    /* Center single-input panel rows (Max MP / Longest side / Scale by ×). */
    .rpc-li-panel-row.rpc-li-centered { justify-content: center; }
    .rpc-li-input-wide {
      width: 70% !important;
      max-width: 200px;
    }
    /* makeNumericInput wrapper — flex row with input + stacked +/- spinners. */
    .rpc-li-numinput {
      display: inline-flex;
      align-items: stretch;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      overflow: hidden;
      box-sizing: border-box;
    }
    .rpc-li-numinput:focus-within { border-color: var(--rpc-acc,#f66744); }
    .rpc-li-numinput input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      padding: 2px 6px;
      color: var(--rpc-acc,#f66744);
      font-size: 11px;
      font-weight: 600;
      text-align: center;
      font-family: inherit;
      width: 100%;
      min-width: 0;
    }
    .rpc-li-spin {
      display: flex;
      flex-direction: column;
      width: 12px;
      border-left: 1px solid #444;
    }
    .rpc-li-spin > button {
      flex: 1;
      background: #232323;
      border: none;
      padding: 0;
      cursor: pointer;
      color: #aaa;
      font-size: 8px;
      line-height: 1;
      position: relative;
    }
    .rpc-li-spin > button:hover { background: #333; color: var(--rpc-acc,#f66744); }
    .rpc-li-spin-up { border-bottom: 1px solid #444; }
    /* CSS chevron arrows (no extra SVG needed). */
    .rpc-li-spin-up::before,
    .rpc-li-spin-down::before {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 6px;
      height: 6px;
      transform: translate(-50%, -50%) rotate(-45deg);
      border-top: 1px solid currentColor;
      border-right: 1px solid currentColor;
    }
    .rpc-li-spin-up::before {
      transform: translate(-50%, -25%) rotate(-45deg);
    }
    .rpc-li-spin-down::before {
      transform: translate(-50%, -75%) rotate(135deg);
    }
    /* Width × Height panels (Fit inside, Crop to fill) with swap between. */
    .rpc-li-wh-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 6px;
      align-items: end;
    }
    .rpc-li-wh-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .rpc-li-wh-label {
      font-size: 9px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: center;
    }
    /* W/H input is inside a .rpc-li-numinput wrap — wrap provides
       border/background. The default 11px input font is fine. */
    .rpc-li-wh-input-wrap { width: 100%; }
    /* Generic swap button used between W and H inputs. Height matches
       the trimmed .rpc-li-numinput control height (~22 px). */
    .rpc-li-swap {
      width: 26px;
      height: 22px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #aaa;
      cursor: pointer;
      padding: 0;
      position: relative;
      align-self: end;
    }
    .rpc-li-swap::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: currentColor;
      -webkit-mask: url("${pixAsset("icons/ui/swap.svg")}") center/12px 12px no-repeat;
              mask: url("${pixAsset("icons/ui/swap.svg")}") center/12px 12px no-repeat;
      pointer-events: none;
    }
    .rpc-li-swap:hover { color: var(--rpc-acc,#f66744); border-color: var(--rpc-acc,#f66744); }
    /* Aspect-ratio preview block under W / H fields. */
    .rpc-li-wh-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
    }
    .rpc-li-wh-rect {
      background: color-mix(in srgb, var(--rpc-acc,#f66744) 18%, transparent);
      border: 1px solid var(--rpc-acc,#f66744);
      border-radius: 2px;
      transition: width 0.12s ease, height 0.12s ease;
    }
    .rpc-li-wh-rect-label {
      font-size: 9px;
      color: #999;
      font-family: inherit;
    }
    /* Tiny aspect-ratio shape rendered INSIDE each Match-ratio chip,
       same idea Resolution Pixaroma uses to make every ratio recognisable
       at a glance without reading the label. */
    .rpc-li-ratio-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .rpc-li-shape {
      display: inline-block;
      background: rgba(180,180,180,0.25);
      border: 1px solid #888;
      border-radius: 1px;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .rpc-li-ratio-chip.active .rpc-li-shape {
      background: rgba(255,255,255,0.4);
      border-color: rgba(255,255,255,0.85);
    }
    /* Custom chip has no shape (no fixed aspect) — keep text-only. */
    .rpc-li-ratio-chip.rpc-li-ratio-custom-chip { display: block; }
    .rpc-li-global {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .rpc-li-rs-popup {
      position: fixed;
      z-index: 99999;
      background: #1d1d1d;
      border: 1px solid #444;
      border-radius: 4px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      font-size: 11px;
      color: #ccc;
      min-width: 200px;
      overflow: hidden;
    }
    .rpc-li-rs-item {
      padding: 6px 10px;
      cursor: pointer;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .rpc-li-rs-item:last-child { border-bottom: none; }
    .rpc-li-rs-item:hover { background: #2a2a2a; }
    .rpc-li-rs-item.active .rpc-li-rs-item-label { color: var(--rpc-acc,#f66744); font-weight: 600; }
    .rpc-li-rs-item-label { font-size: 11px; }
    .rpc-li-rs-item-hint { font-size: 9px; color: #777; }
    /* ── Image Resize design language, scoped to .rpc-li-root ── */
    /* Centered snap footer: magnet + "Snap" + chips. */
    .rpc-li-foot { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; }
    .rpc-li-snap2 { display:inline-flex; align-items:center; gap:5px; }
    .rpc-li-snap-icon { display:inline-block; width:12px; height:12px; background-color:#888; flex:none;
      -webkit-mask:url("${pixAsset("icons/ui/magnet.svg")}") center/12px 12px no-repeat;
              mask:url("${pixAsset("icons/ui/magnet.svg")}") center/12px 12px no-repeat; }
    .rpc-li-snap-lbl { font-size:9px; color:#7d7d7d; text-transform:uppercase; letter-spacing:.5px; }
    .rpc-li-schip { background:#1d1d1d; border:1px solid #444; border-radius:3px; color:#aaa;
      font-size:8.5px; padding:3px 5px; min-width:16px; text-align:center; cursor:pointer; user-select:none; }
    .rpc-li-schip:hover { border-color:var(--rpc-acc,#f66744); color:#ddd; }
    .rpc-li-schip.active { background:var(--rpc-acc,#f66744); color:#fff; border-color:var(--rpc-acc,#f66744); }
    /* Resample picker: [◀] [ Resample: Auto ▾ ] [▶] */
    .rpc-li-rs2-row { display:flex; align-items:stretch; gap:6px; }
    .rpc-li-rs2-nav { flex:0 0 30px; background:#1d1d1d; border:1px solid #444; border-radius:4px;
      color:var(--rpc-acc,#f66744); font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
    .rpc-li-rs2-nav:hover { border-color:var(--rpc-acc,#f66744); }
    .rpc-li-rs2-dd { flex:1; display:flex; align-items:center; justify-content:space-between;
      background:#1d1d1d; border:1px solid #444; border-radius:4px; padding:6px 10px; cursor:pointer; user-select:none; }
    .rpc-li-rs2-dd:hover { border-color:var(--rpc-acc,#f66744); }
    .rpc-li-rs2-value { color:#ddd; font-size:11px; }
    .rpc-li-rs2-arrow { color:var(--rpc-acc,#f66744); font-size:13px; margin-left:6px; line-height:1; }
    /* Upscaling toggle button. */
    .rpc-li-upbtn { align-self:center; background:#1d1d1d; border:1px solid #444; border-radius:5px;
      color:#aaa; font-size:11px; padding:7px 18px; cursor:pointer; user-select:none; transition:background .08s,border-color .08s; }
    .rpc-li-upbtn:hover { border-color:var(--rpc-acc,#f66744); color:#ddd; }
    .rpc-li-upbtn.is-on, .rpc-li-upbtn.is-on:hover { background:var(--rpc-acc,#f66744); border-color:var(--rpc-acc,#f66744); color:#fff; }
    /* Per-mode panel overrides (mirror image_resize .rpc-ir-root .rpc-li-* block). */
    .rpc-li-root .rpc-li-panel { background:rgba(255,255,255,.04); border:none; border-radius:6px; padding:9px 10px; }
    .rpc-li-root .rpc-li-panel-readout { display:none; }
    .rpc-li-root .rpc-li-ratio-chips { margin-bottom:0; }
    .rpc-li-root .rpc-li-custom-ratio-row { margin:8px 0 0; }
    .rpc-li-root .rpc-li-input-wide { width:100% !important; max-width:none; }
    .rpc-li-root .rpc-li-numinput { background:#1d1d1d !important; align-items:center; min-height:28px; }
    .rpc-li-root .rpc-li-numinput .rpc-li-spin { align-self:stretch; }
    .rpc-li-root .rpc-li-numinput input { line-height:1.2; background:transparent !important; border:none !important; border-radius:0 !important; }
    .rpc-li-root .rpc-li-inline-label { display:flex; align-items:center; color:var(--rpc-acc,#f66744); font-size:9px; font-weight:600;
      text-transform:uppercase; letter-spacing:.5px; padding:0 4px 0 9px; white-space:nowrap; flex:none; }
    .rpc-li-root .rpc-li-num-labeled input { text-align:right !important; padding-right:8px !important; }
    .rpc-li-root .rpc-li-swap { background:#1d1d1d !important; }
    .rpc-li-root .rpc-li-wh-header { text-align:center !important; color:#d6d6d6 !important; }
    .rpc-li-root .rpc-li-wh-rect { background:color-mix(in srgb, var(--rpc-acc,#f66744) 35%, transparent); border-width:2px; }
    .rpc-li-root .rpc-li-wh-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; align-items:center; }
    .rpc-li-root .rpc-li-wh-col { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .rpc-li-root .rpc-li-wh-col .rpc-li-swap { width:100%; height:24px; align-self:auto; }
    .rpc-li-root .rpc-li-wh-grid .rpc-li-wh-preview { margin-top:0; justify-content:center; }
    /* Filled triangle spinner glyphs (replace shared outline chevrons). NOTE:
       use the literal triangle characters - a backslash-escape inside a JS
       template literal throws (CLAUDE.md UI Pattern #12). */
    .rpc-li-root .rpc-li-spin { width:16px; border-left:none; }
    .rpc-li-root .rpc-li-spin > button { background:transparent; }
    .rpc-li-root .rpc-li-spin-up::before, .rpc-li-root .rpc-li-spin-down::before {
      border:none; width:auto; height:auto; font-size:8px; line-height:1; transform:translate(-50%,-50%); }
    .rpc-li-root .rpc-li-spin-up::before { content:"▲"; }
    .rpc-li-root .rpc-li-spin-down::before { content:"▼"; }
    /* Crop-to-fill extras: Fill/Crop toggle + 3x3 anchor grid. */
    .rpc-li-root .rpc-li-swaprow { display:flex; gap:6px; align-items:stretch; }
    .rpc-li-root .rpc-li-wh-col .rpc-li-swaprow .rpc-li-swap { flex:0 0 46px; width:auto; height:auto; align-self:stretch; }
    .rpc-li-root .rpc-li-fillcrop { flex:1; display:grid; grid-template-columns:1fr 1fr; background:#1d1d1d; border:1px solid #444; border-radius:4px; overflow:hidden; }
    .rpc-li-root .rpc-li-fillcrop > div { display:flex; align-items:center; justify-content:center; font-size:9.5px; padding:5px 0; color:#aaa; cursor:pointer; user-select:none; }
    .rpc-li-root .rpc-li-fillcrop > div:hover { color:#ddd; background:rgba(255,255,255,.08); }
    .rpc-li-root .rpc-li-fillcrop > div.active { background:var(--rpc-acc,#f66744); color:#fff; }
    .rpc-li-root .rpc-li-anchor { display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); gap:3px;
      width:100%; max-width:96px; aspect-ratio:1; margin:0 auto; background:#1d1d1d; border:1px solid #444; border-radius:5px; padding:5px; box-sizing:border-box; }
    .rpc-li-root .rpc-li-anchor-cell { background:rgba(255,255,255,.07); border-radius:2px; cursor:pointer; transition:background .08s; }
    .rpc-li-root .rpc-li-anchor-cell:hover { background:rgba(255,255,255,.18); }
    .rpc-li-root .rpc-li-anchor-cell.active { background:var(--rpc-acc,#f66744); }
    /* Bring shared quick-pick + ratio chips in line (orange hover). */
    .rpc-li-root .rpc-li-quickpick { box-sizing:border-box; }
    .rpc-li-root .rpc-li-quickpick:hover { border-color:var(--rpc-acc,#f66744); color:#ddd; }
    .rpc-li-root .rpc-li-ratio-chip { box-sizing:border-box; }
    .rpc-li-root .rpc-li-ratio-chip:hover { border-color:var(--rpc-acc,#f66744); color:#ddd; }
    /* ── B2 thumbnail dropdown popup ── */
    .rpc-li-popup {
      background:#1d1d1d; border:1px solid #444; border-radius:6px;
      box-shadow:0 4px 16px rgba(0,0,0,.4); font-size:11px;
      font-family:ui-sans-serif,system-ui,sans-serif; color:#ccc; overflow:hidden;
    }
    .rpc-li-pop-search { display:flex; align-items:center; gap:7px; padding:7px 9px;
      background:#161616; border-bottom:1px solid #333; }
    .rpc-li-pop-mag { width:12px; height:12px; flex:none; border:1.6px solid #777; border-radius:50%; position:relative; }
    .rpc-li-pop-mag::after { content:""; position:absolute; width:5px; height:1.6px; background:#777;
      transform:rotate(45deg); right:-3px; bottom:0; }
    .rpc-li-pop-search input { flex:1; min-width:0; background:transparent; border:none; outline:none;
      color:#ddd; font-size:11px; font-family:inherit; }
    .rpc-li-pop-search input::placeholder { color:#777; }
    .rpc-li-pop-sizetoggle { flex:none; display:flex; border:1px solid #444; border-radius:4px; overflow:hidden; }
    .rpc-li-pop-sizetoggle span { padding:2px 7px; font-size:10px; color:#aaa; cursor:pointer; user-select:none; line-height:1.4; }
    .rpc-li-pop-sizetoggle span.on { background:var(--rpc-acc,#f66744); color:#fff; }
    .rpc-li-pop-sizetoggle span:not(.on):hover { color:#ddd; }
    .rpc-li-bsplit { display:flex; max-height:320px; }
    .rpc-li-bfolders { width:104px; flex:none; border-right:1px solid #333; background:#141414; overflow:auto; }
    .rpc-li-bfolder { padding:8px 9px; font-size:10.5px; color:#aaa; cursor:pointer; display:flex;
      justify-content:space-between; gap:4px; align-items:center; }
    .rpc-li-bfolder:hover { background:#2a2a2a; }
    .rpc-li-bfolder.on { background:color-mix(in srgb, var(--rpc-acc,#f66744) 16%, transparent); color:var(--rpc-acc,#f66744); border-left:2px solid var(--rpc-acc,#f66744); padding-left:7px; }
    .rpc-li-bfolder.all { border-bottom:1px solid #333; color:#cfcfcf; }
    .rpc-li-bfolder.all.on { color:var(--rpc-acc,#f66744); }
    .rpc-li-bfolder-n { color:#888; font-size:9px; flex:none; }
    .rpc-li-bfolder > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .rpc-li-bpane { flex:1; min-width:0; overflow:auto; max-height:320px; }
    .rpc-li-pop-sec { padding:5px 10px 4px; font-size:9px; color:#777; text-transform:uppercase; letter-spacing:.5px;
      background:#141414; border-bottom:1px solid #333; display:flex; align-items:center; gap:6px; position:sticky; top:0; z-index:1; }
    .rpc-li-pop-sec-c { margin-left:auto; color:#888; }
    .rpc-li-imgrow { display:flex; align-items:center; gap:9px; padding:4px 10px; cursor:pointer; }
    .rpc-li-imgrow:hover { background:#2a2a2a; }
    .rpc-li-imgrow.cur { background:color-mix(in srgb, var(--rpc-acc,#f66744) 12%, transparent); }
    .rpc-li-imgrow.cur .rpc-li-imgrow-lbl { color:var(--rpc-acc,#f66744); font-weight:600; }
    .rpc-li-imgrow-lbl { flex:1; min-width:0; font-size:11px; color:#ccc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rpc-li-pop-thumb { position:relative; flex:none; border-radius:4px; overflow:hidden;
      background:linear-gradient(135deg,#3a3f4a,#222); }
    .rpc-li-pop-thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
    .rpc-li-pop-glyph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:10px; color:rgba(255,255,255,.3); }
    .rpc-li-bsplit.thumb-sm .rpc-li-pop-thumb { width:32px; height:32px; }
    .rpc-li-bsplit.thumb-lg .rpc-li-pop-thumb { width:48px; height:48px; }
    .rpc-li-pop-empty { padding:10px; color:#666; text-align:center; }
    .rpc-li-pop-foot { padding:6px 10px; font-size:9px; color:#777; background:#141414;
      border-top:1px solid #333; text-align:center; }
  `;
  const el = document.createElement("style");
  el.id = "rpc-load-image-css";
  el.textContent = css;
  document.head.appendChild(el);
}

export function buildRoot() {
  const root = document.createElement("div");
  root.className = "rpc-li-root";

  // Upload button (orange, prominent, primary action).
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rpc-li-upload-btn";
  const ico = document.createElement("span");
  ico.className = "ico";
  const lbl = document.createElement("span");
  lbl.textContent = "Upload Image";
  btn.append(ico, lbl);
  root.appendChild(btn);

  // Hint line for alternate upload methods (shown when no image yet).
  const hint = document.createElement("div");
  hint.className = "rpc-li-hint";
  hint.dataset.role = "hint";
  hint.innerHTML = `or drag here · paste with <kbd>Ctrl+V</kbd>`;
  root.appendChild(hint);

  // File row: [◀ prev] [ filename dropdown ] [▶ next]. Arrow buttons cycle
  // through input/ images so users can flip through them visually, matching
  // native ComfyUI LoadImage. Both the prev/next arrows and PageUp/PageDown
  // (wired in index.js) route through setSelectedImage so the bottom preview
  // updates immediately.
  const fileRow = document.createElement("div");
  fileRow.className = "rpc-li-filerow";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "rpc-li-nav";
  prev.dataset.role = "prev";
  prev.title = "Previous image (PageUp)";
  prev.textContent = "◀";

  const dd = document.createElement("div");
  dd.className = "rpc-li-dropdown";
  dd.dataset.role = "dropdown";
  dd.innerHTML = `<span class="name">— no image —</span><span class="counter" data-role="counter"></span><span class="arrow">▼</span>`;

  const next = document.createElement("button");
  next.type = "button";
  next.className = "rpc-li-nav";
  next.dataset.role = "next";
  next.title = "Next image (PageDown)";
  next.textContent = "▶";

  fileRow.append(prev, dd, next);
  root.appendChild(fileRow);

  // The input/output size readout is no longer a DOM bar here — it is painted
  // by onDrawForeground (INPUT → OUTPUT cards in the output-slot dead space).

  return root;
}

// Hides every auto-created widget so we can render our own UI in the DOM
// widget. `image_upload: True` creates TWO widgets in INPUT_TYPES on the
// Vue frontend: the `image` combo + a separate `upload` button widget — both
// need to be hidden, plus any other auto-created widget that isn't ours.
//
// Uses the same multi-technique pattern as shared/utils.mjs `hideJsonWidget`:
// setting `canvasOnly` alone is not enough for canvas drawing on the current
// Vue frontend — must also set `hidden=true`, zero `computeSize`, and hide
// any DOM element. Returns the `image` combo widget so callers can read /
// write its `.value` (that drives the actual file selection).
export function hideNativeImageCombo(node) {
  let imageWidget = null;
  for (const w of (node.widgets || [])) {
    if (!w) continue;
    if (w.name === "image") imageWidget = w;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    if (!w.options) w.options = {};
    w.options.canvasOnly = true;
    if (w.element) w.element.style.display = "none";
  }
  // Vue may DOM-render an upload widget AFTER nodeCreated — re-hide on the
  // next animation frame as a belt-and-braces. Mirrors hideJsonWidget.
  requestAnimationFrame(() => {
    for (const w of (node.widgets || [])) {
      if (!w || w.name === "rpc_load_image_ui") continue;
      const _el = w.element || w.inputEl; // prefer .element; .inputEl only on old builds (no deprecation warning)
      if (_el) _el.style.display = "none";
    }
  });
  return imageWidget;
}

import { updateNativePreview, setSelectedImage, splitFilenameSubfolder } from "./api.js";

// Group combo values by subfolder so the popup renders:
//   ─ root ─
//      file1.png
//      file2.png
//   ─ Studio1 ─
//      bunny.png
// Returns an array of { folder, files } in display order (root first, then
// folders alphabetised). Each `files` entry is { full, name } where `full`
// is the value to write back and `name` is the bare filename to display.
function groupValuesByFolder(values) {
  const map = new Map();
  for (const v of values) {
    const { subfolder, filename } = splitFilenameSubfolder(v);
    if (!map.has(subfolder)) map.set(subfolder, []);
    map.get(subfolder).push({ full: v, name: filename });
  }
  // Sort the file lists alphabetically. Folders: root first, then ABC.
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const folders = [...map.keys()].sort((a, b) => {
    if (a === "" && b !== "") return -1;
    if (a !== "" && b === "") return 1;
    return a.localeCompare(b);
  });
  return folders.map((folder) => ({ folder, files: map.get(folder) }));
}

// Build a same-origin /view URL for a combo value like "3d/cat.png".
// Relative path → works on whatever host/port ComfyUI runs on. No cache-buster
// so the browser caches thumbnails across re-opens.
function thumbURL(full) {
  const { subfolder, filename } = splitFilenameSubfolder(full);
  return pixApiUrl(`/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(subfolder)}`);
}

// Read/write the persisted thumbnail size ("Small" | "Large"). Falls back to
// "Large" if the setting isn't registered yet or settings aren't ready.
function getThumbSize() {
  try {
    const v = app.ui.settings.getSettingValue("MyCustom.PixClone.LoadImage.ThumbSize");
    return v === "Small" ? "Small" : "Large";
  } catch (_e) { return "Large"; }
}
function setThumbSize(v) {
  try {
    const s = app.ui.settings;
    // Prefer the async setter when present (newer ComfyUI persists reliably
    // through it; the sync form can no-op on disk on some builds) — same guard
    // node_colors/index.js uses.
    if (typeof s.setSettingValueAsync === "function") s.setSettingValueAsync("MyCustom.PixClone.LoadImage.ThumbSize", v);
    else s.setSettingValue("MyCustom.PixClone.LoadImage.ThumbSize", v);
  } catch (_e) { /* ignore */ }
}

// Open a thumbnail picker popup anchored below the file row.
//  - Search box filters across ALL folders while it has text.
//  - Left sidebar (only when subfolders exist) lists All + each folder.
//  - Right pane shows thumbnail rows; opens to "All" grouped by folder.
//  - Small/Large thumbnail size toggle, persisted via the ThumbSize setting.
// Reuses groupValuesByFolder, splitFilenameSubfolder, setSelectedImage.
export function openImageDropdown(node, anchorEl, onPick) {
  const imageWidget = node._rpcLiImageWidget;
  if (!imageWidget) return;
  const values = imageWidget.options?.values || [];

  // Close any existing popup. Call its stored cleanup (not a bare remove) so
  // the prior popup's document-level capture listeners are detached too.
  const _existingPopup = document.querySelector(".rpc-li-popup");
  if (_existingPopup) {
    if (typeof _existingPopup._rpcClose === "function") _existingPopup._rpcClose();
    else _existingPopup.remove();
  }

  const popup = document.createElement("div");
  popup.className = "rpc-li-popup";
  const rect = anchorEl.getBoundingClientRect();
  const width = Math.max(rect.width, 360); // widen so sidebar + thumbs fit
  Object.assign(popup.style, {
    position: "fixed",
    zIndex: 99999,
    left: `${rect.left}px`,
    top: `${rect.bottom + 2}px`,
    width: `${width}px`,
  });

  // ── close handling (defined early so row click handlers can call it) ──
  function closePopup() {
    popup.remove();
    document.removeEventListener("mousedown", onDocDown, true);
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("keydown", onKey, true);
  }
  const onDocDown = (e) => { if (!popup.contains(e.target)) closePopup(); };
  const onWheel = (e) => { if (!popup.contains(e.target)) closePopup(); };
  const onKey = (e) => { if (e.key === "Escape") closePopup(); };
  popup._rpcClose = closePopup; // so a later open can detach our listeners

  if (values.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rpc-li-pop-empty";
    empty.textContent = "(no images uploaded yet)";
    popup.appendChild(empty);
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener("mousedown", onDocDown, true);
      document.addEventListener("pointerdown", onDocDown, true);
      document.addEventListener("wheel", onWheel, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return;
  }

  const groups = groupValuesByFolder(values); // [{folder, files:[{full,name}]}], root first
  const curVal = imageWidget.value;
  const hasSubfolders = groups.some((g) => g.folder !== "");

  // ── state ──
  let activeFolder = "__all"; // "__all" | "" (root) | "<FolderName>"
  let query = "";
  let thumbSize = getThumbSize();
  let scrollTarget = null;

  // ── search row (filter + size toggle) ──
  const searchRow = document.createElement("div");
  searchRow.className = "rpc-li-pop-search";
  const mag = document.createElement("span");
  mag.className = "rpc-li-pop-mag";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Filter images…";
  const sizeToggle = document.createElement("div");
  sizeToggle.className = "rpc-li-pop-sizetoggle";
  const segS = document.createElement("span"); segS.textContent = "S"; segS.title = "Small thumbnails";
  const segL = document.createElement("span"); segL.textContent = "L"; segL.title = "Large thumbnails";
  sizeToggle.append(segS, segL);
  searchRow.append(mag, input, sizeToggle);
  popup.appendChild(searchRow);

  // ── body: sidebar (optional) + scrollable pane ──
  const body = document.createElement("div");
  body.className = "rpc-li-bsplit";
  const sidebar = document.createElement("div");
  sidebar.className = "rpc-li-bfolders";
  const pane = document.createElement("div");
  pane.className = "rpc-li-bpane";
  if (hasSubfolders) body.append(sidebar, pane);
  else body.append(pane);
  popup.appendChild(body);

  // ── footer ──
  const footer = document.createElement("div");
  footer.className = "rpc-li-pop-foot";
  popup.appendChild(footer);

  // ── element builders ──
  const makeRow = (entry) => {
    const row = document.createElement("div");
    row.className = "rpc-li-imgrow" + (entry.full === curVal ? " cur" : "");
    const th = document.createElement("span");
    th.className = "rpc-li-pop-thumb";
    const glyph = document.createElement("span");
    glyph.className = "rpc-li-pop-glyph";
    glyph.textContent = "▣";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.onerror = () => { img.style.display = "none"; };
    img.src = thumbURL(entry.full);
    th.append(glyph, img);
    const lbl = document.createElement("span");
    lbl.className = "rpc-li-imgrow-lbl";
    lbl.textContent = entry.name;
    lbl.title = entry.full;
    row.append(th, lbl);
    if (entry.full === curVal) scrollTarget = row;
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      setSelectedImage(node, entry.full);
      closePopup();
      if (onPick) onPick(entry.full);
    });
    return row;
  };
  const makeSec = (label, count) => {
    const s = document.createElement("div");
    s.className = "rpc-li-pop-sec";
    s.textContent = label;
    const c = document.createElement("span");
    c.className = "rpc-li-pop-sec-c";
    c.textContent = String(count);
    s.appendChild(c);
    return s;
  };
  const folderLabel = (key) => (key === "" ? "root" : key);
  // Scroll the current image's row into view (deferred so the pane is laid out).
  // Called on every non-search render so a folder switch / search-clear re-centers it.
  const scrollCurrentIntoView = () => {
    if (!scrollTarget) return;
    const t = scrollTarget;
    queueMicrotask(() => { try { t.scrollIntoView({ block: "nearest" }); } catch (_e) { /* ignore */ } });
  };

  // ── renderers ──
  const renderSidebar = () => {
    if (!hasSubfolders) return;
    sidebar.replaceChildren();
    const entries = [["__all", "All", values.length]];
    for (const g of groups) entries.push([g.folder, folderLabel(g.folder), g.files.length]);
    for (const [key, label, count] of entries) {
      const f = document.createElement("div");
      f.className = "rpc-li-bfolder"
        + (key === "__all" ? " all" : "")
        + (key === activeFolder && !query.trim() ? " on" : "");
      const t = document.createElement("span");
      t.textContent = label;
      const n = document.createElement("span");
      n.className = "rpc-li-bfolder-n";
      n.textContent = String(count);
      f.append(t, n);
      f.addEventListener("click", (e) => {
        e.stopPropagation();
        activeFolder = key;
        input.value = "";
        query = "";
        renderSidebar();
        renderPane();
      });
      sidebar.appendChild(f);
    }
  };

  const renderPane = () => {
    pane.replaceChildren();
    scrollTarget = null;
    const q = query.trim().toLowerCase();

    if (q) {
      // Search across ALL folders; show only matches, grouped by folder.
      let matches = 0;
      for (const g of groups) {
        const hit = g.files.filter((f) => f.name.toLowerCase().includes(q));
        if (hit.length === 0) continue;
        matches += hit.length;
        pane.appendChild(makeSec(folderLabel(g.folder), hit.length));
        for (const entry of hit) pane.appendChild(makeRow(entry));
      }
      if (matches === 0) {
        const none = document.createElement("div");
        none.className = "rpc-li-pop-empty";
        none.textContent = "(no matches)";
        pane.appendChild(none);
      }
      footer.textContent = `${matches} match${matches === 1 ? "" : "es"}`;
      return;
    }

    if (!hasSubfolders) {
      // Flat input/ — plain thumbnail list, no sidebar.
      for (const g of groups) for (const entry of g.files) pane.appendChild(makeRow(entry));
      footer.textContent = `${values.length} image${values.length === 1 ? "" : "s"}`;
      scrollCurrentIntoView();
      return;
    }

    if (activeFolder === "__all") {
      // All images, grouped by folder with sticky section headers.
      for (const g of groups) {
        pane.appendChild(makeSec(folderLabel(g.folder), g.files.length));
        for (const entry of g.files) pane.appendChild(makeRow(entry));
      }
      footer.textContent = `${values.length} image${values.length === 1 ? "" : "s"} · all`;
    } else {
      const g = groups.find((x) => x.folder === activeFolder);
      const files = g ? g.files : [];
      for (const entry of files) pane.appendChild(makeRow(entry));
      footer.textContent = `${files.length} image${files.length === 1 ? "" : "s"} · ${folderLabel(activeFolder)}`;
    }
    scrollCurrentIntoView();
  };

  const applyThumbSize = () => {
    body.classList.toggle("thumb-sm", thumbSize === "Small");
    body.classList.toggle("thumb-lg", thumbSize !== "Small");
    segS.classList.toggle("on", thumbSize === "Small");
    segL.classList.toggle("on", thumbSize !== "Small");
  };

  // ── events ──
  input.addEventListener("input", () => { query = input.value; renderSidebar(); renderPane(); });
  input.addEventListener("click", (e) => e.stopPropagation());
  // Keep LiteGraph's canvas shortcuts (Delete/Backspace = delete the selected
  // node, arrows = nudge, etc.) from firing while typing in the filter box —
  // the node is selected whenever this popup is open. Mirrors makeNumericInput
  // (Load Image Pattern #6). Enter picks the first listed match.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pane.querySelector(".rpc-li-imgrow")?.click();
    }
    e.stopImmediatePropagation();
  });
  segS.addEventListener("click", (e) => {
    e.stopPropagation();
    thumbSize = "Small"; setThumbSize(thumbSize); applyThumbSize();
  });
  segL.addEventListener("click", (e) => {
    e.stopPropagation();
    thumbSize = "Large"; setThumbSize(thumbSize); applyThumbSize();
  });

  // ── initial render ──
  applyThumbSize();
  renderSidebar();
  renderPane();

  document.body.appendChild(popup);

  // Keep the popup on-screen: clamp horizontally and flip above the row when it
  // would overflow the bottom of the viewport (now measurable post-append).
  const pr = popup.getBoundingClientRect();
  let left = rect.left;
  if (left + pr.width > window.innerWidth - 4) left = Math.max(4, window.innerWidth - pr.width - 4);
  popup.style.left = `${left}px`;
  if (pr.bottom > window.innerHeight - 4) {
    const above = rect.top - pr.height - 2;
    popup.style.top = `${above >= 4 ? above : Math.max(4, window.innerHeight - pr.height - 4)}px`;
  }

  // renderPane() already scrolls the current row into view. Focus the filter box.
  queueMicrotask(() => { try { input.focus(); } catch (_e) { /* ignore */ } });

  // Attach close listeners after the opening click settles (capture phase so we
  // preempt LiteGraph; each gated on !popup.contains so inside scroll/clicks
  // don't close — Load Image Pattern #14).
  setTimeout(() => {
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("wheel", onWheel, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

const MODE_CHIPS = [
  { id: "off",          label: "Off",          title: "No resize. (Snap still applies if set.)" },
  { id: "max_mp",       label: "Max MP",       title: "Scale so the total pixel count stays under a megapixel cap. Keeps aspect ratio." },
  { id: "longest_side", label: "Longest side", title: "Scale so the longest side equals this many pixels. Keeps aspect ratio." },
  { id: "scale_factor", label: "Scale by ×",   title: "Multiply both dimensions by a factor. Keeps aspect ratio." },
  { id: "fit_inside",   label: "Fit inside",   title: "Scale to fit entirely within W×H without cropping. Keeps aspect ratio." },
  { id: "cover",        label: "Crop to fill", title: "Resize to exactly W×H. Fill scales then crops the overflow; Crop cuts a 1:1-pixel piece. The anchor picks which part is kept." },
  { id: "match_ratio",  label: "Match ratio",  title: "Crop the image to a target aspect ratio (no scaling)." },
  { id: "pad",          label: "Pad",          title: "Add a pixel border on chosen sides. The new area becomes the white inpaint-mask region." },
];

export function renderChips(state) {
  const wrap = document.createElement("div");
  wrap.className = "rpc-li-chips";
  for (const c of MODE_CHIPS) {
    const el = document.createElement("div");
    el.className = "rpc-li-chip" + (state.mode === c.id ? " active" : "");
    el.dataset.modeId = c.id;
    el.textContent = c.label;
    el.title = c.title || "";
    wrap.appendChild(el);
  }
  return wrap;
}

const SNAP_OPTIONS = [0, 8, 16, 32, 64];
const RESAMPLE_OPTIONS = [
  { id: "auto",     label: "Auto",     hint: "Lanczos for shrink, Bilinear for grow" },
  { id: "nearest",  label: "Nearest",  hint: "Pixel-perfect, no smoothing" },
  { id: "bilinear", label: "Bilinear", hint: "Fast, smooth" },
  { id: "bicubic",  label: "Bicubic",  hint: "Slower, sharper" },
  { id: "lanczos",  label: "Lanczos",  hint: "Slowest, sharpest" },
];

// Custom resample dropdown popup. Same look as the file dropdown popup —
// fixed-position list anchored to the row, click an item to commit.
function openResamplePopup(anchorEl, currentValue, onPick) {
  document.querySelector(".rpc-li-rs-popup")?.remove();

  const popup = document.createElement("div");
  popup.className = "rpc-li-rs-popup";
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top  = `${rect.bottom + 2}px`;
  popup.style.width = `${rect.width}px`;

  for (const opt of RESAMPLE_OPTIONS) {
    const item = document.createElement("div");
    item.className = "rpc-li-rs-item" + (opt.id === currentValue ? " active" : "");
    const lbl = document.createElement("span");
    lbl.className = "rpc-li-rs-item-label";
    lbl.textContent = opt.label;
    const hint = document.createElement("span");
    hint.className = "rpc-li-rs-item-hint";
    hint.textContent = opt.hint;
    item.append(lbl, hint);
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      onPick(opt.id);
      close();
    });
    popup.appendChild(item);
  }

  document.body.appendChild(popup);

  function close() {
    popup.remove();
    document.removeEventListener("mousedown", onDocDown, true);
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("keydown", onKey, true);
  }
  const onDocDown = (e) => {
    if (!popup.contains(e.target)) close();
  };
  const onWheel = (e) => {
    if (!popup.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("wheel", onWheel, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

export function renderGlobalControls(node, state, writeState, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "rpc-li-global";

  // Centered snap footer: magnet + "Snap" + chips.
  const foot = document.createElement("div");
  foot.className = "rpc-li-foot";
  const snap = document.createElement("div");
  snap.className = "rpc-li-snap2";
  const icon = document.createElement("span");
  icon.className = "rpc-li-snap-icon";
  snap.appendChild(icon);
  const lbl = document.createElement("span");
  lbl.className = "rpc-li-snap-lbl";
  lbl.textContent = "Snap";
  snap.appendChild(lbl);
  for (const v of SNAP_OPTIONS) {
    const b = document.createElement("div");
    b.className = "rpc-li-schip" + (v === (state.snap || 0) ? " active" : "");
    b.dataset.v = String(v);
    b.textContent = v === 0 ? "Off" : String(v);
    b.title = v === 0 ? "No snapping."
      : `Round the output dimensions down to a multiple of ${v} px (keeps latents aligned).`;
    snap.appendChild(b);
  }
  foot.appendChild(snap);
  wrap.appendChild(foot);

  // Resample picker: [◀] [ Resample: Auto ▾ ] [▶]
  const rsRow = document.createElement("div");
  rsRow.className = "rpc-li-rs2-row";
  const prev = document.createElement("button");
  prev.type = "button"; prev.className = "rpc-li-rs2-nav"; prev.title = "Previous resample filter"; prev.textContent = "◀";
  const dd = document.createElement("div");
  dd.className = "rpc-li-rs2-dd";
  dd.title = "Resampling filter used when scaling. Click to pick, or use the arrows.";
  const rsValue = document.createElement("span");
  rsValue.className = "rpc-li-rs2-value";
  rsValue.textContent = "Resample: " + resampleLabel(state.resample || "auto");
  const rsArrow = document.createElement("span");
  rsArrow.className = "rpc-li-rs2-arrow"; rsArrow.textContent = "▼";
  dd.append(rsValue, rsArrow);
  const next = document.createElement("button");
  next.type = "button"; next.className = "rpc-li-rs2-nav"; next.title = "Next resample filter"; next.textContent = "▶";
  rsRow.append(prev, dd, next);
  wrap.appendChild(rsRow);

  // Upscaling toggle button.
  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.title = "Allow the image to grow larger than its original size. Off = never upscale.";
  const upOn = state.allow_upscale !== false;
  upBtn.className = "rpc-li-upbtn" + (upOn ? " is-on" : "");
  upBtn.textContent = upOn ? "Upscaling: On" : "Upscaling: Off";
  wrap.appendChild(upBtn);

  // ── events ──
  const RESAMPLE_IDS = RESAMPLE_OPTIONS.map((o) => o.id);
  const setResample = (id) => {
    const s = readStateLocal(node);
    writeState(node, { ...s, resample: id });
    rsValue.textContent = "Resample: " + resampleLabel(id);
    onChange?.();
  };
  const cycleResample = (delta) => {
    const cur = (readStateLocal(node).resample) || "auto";
    let i = RESAMPLE_IDS.indexOf(cur); if (i < 0) i = 0;
    i = (i + delta + RESAMPLE_IDS.length) % RESAMPLE_IDS.length;
    setResample(RESAMPLE_IDS[i]);
  };
  foot.addEventListener("click", (e) => {
    const b = e.target.closest(".rpc-li-schip");
    if (!b) return;
    e.stopPropagation();
    const v = parseInt(b.dataset.v, 10);
    for (const x of foot.querySelectorAll(".rpc-li-schip")) x.classList.toggle("active", x === b);
    writeState(node, { ...readStateLocal(node), snap: v });
    onChange?.();
  });
  dd.addEventListener("click", (e) => {
    e.stopPropagation();
    openResamplePopup(dd, (readStateLocal(node).resample) || "auto", setResample);
  });
  prev.addEventListener("click", (e) => { e.stopPropagation(); cycleResample(-1); });
  next.addEventListener("click", (e) => { e.stopPropagation(); cycleResample(1); });
  upBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = !(readStateLocal(node).allow_upscale !== false);
    writeState(node, { ...readStateLocal(node), allow_upscale: on });
    upBtn.classList.toggle("is-on", on);
    upBtn.textContent = on ? "Upscaling: On" : "Upscaling: Off";
    onChange?.();
  });

  return wrap;
}

// Local state read for event handlers (avoids depending on index.js import).
function readStateLocal(node) {
  try { return JSON.parse(node.properties?.loadImagePixState || "{}"); }
  catch { return {}; }
}

// Map a resample id to its display label.
function resampleLabel(id) {
  const o = RESAMPLE_OPTIONS.find((x) => x.id === id) || RESAMPLE_OPTIONS[0];
  return o.label;
}
