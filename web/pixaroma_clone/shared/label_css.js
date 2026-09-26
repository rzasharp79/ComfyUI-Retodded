// ╔═══════════════════════════════════════════════════════════════╗
// ║  Pixaroma Shared — Label Editor CSS Injection                ║
// ╚═══════════════════════════════════════════════════════════════╝

let _labelCssInjected = false;
export function injectLabelCSS() {
  if (_labelCssInjected) return;
  _labelCssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.rpc-lbl-body {
    max-height: 400px; overflow-y: auto; padding-right: 8px;
}
.rpc-lbl-body::-webkit-scrollbar { width: 6px; }
.rpc-lbl-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
.rpc-lbl-body::-webkit-scrollbar-thumb { background: #555; border-radius: 10px; }
.rpc-lbl-body::-webkit-scrollbar-thumb:hover { background: #888; }
.rpc-lbl-body { scrollbar-width: thin; scrollbar-color: #555 rgba(0,0,0,0.1); }
.rpc-lbl-overlay {
    position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', system-ui, sans-serif;
}
.rpc-lbl-panel {
    background: #171718; border: 1px solid #333; border-radius: 10px;
    width: 660px; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6); position: relative;
}
.rpc-lbl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid #2a2a2a;
}
.rpc-lbl-header span { color: #fff; font-size: 15px; font-weight: 600; }
.rpc-lbl-close {
    background: none; border: none; color: #666; font-size: 20px;
    cursor: pointer; padding: 0 4px; line-height: 1;
}
.rpc-lbl-close:hover { color: #fff; }
.rpc-lbl-body { padding: 16px 18px; }
.rpc-lbl-field { margin-bottom: 14px; }
.rpc-lbl-field > .rpc-lbl-lbl {
    display: block; color: #777; font-size: 10px; margin-bottom: 5px;
    text-transform: uppercase; letter-spacing: 0.6px;
}
.rpc-lbl-field textarea {
    width: 100%; box-sizing: border-box; background: #222; border: 1px solid #333;
    border-radius: 5px; color: #ddd; padding: 8px 10px; font-size: 13px;
    font-family: inherit; outline: none; resize: vertical; min-height: 56px;
}
.rpc-lbl-field textarea:focus { border-color: #f66744; }
.rpc-lbl-preview {
    margin-bottom: 14px; background: #111; border-radius: 6px; padding: 12px;
    min-height: 36px; display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.rpc-lbl-preview canvas { max-width: 100%; height: auto; }
.rpc-lbl-btns { display: flex; gap: 4px; flex-wrap: wrap; }
.rpc-lbl-btn {
    padding: 5px 12px; border: 1px solid #444; border-radius: 4px;
    background: #2a2c2e; color: #999; font-size: 12px; cursor: pointer; transition: all 0.15s;
}
.rpc-lbl-btn:hover { border-color: #666; color: #ccc; }
.rpc-lbl-btn.active { background: #f66744; border-color: #f66744; color: #fff; }
.rpc-lbl-bold { font-weight: bold; min-width: 32px; text-align: center; }
.rpc-lbl-range-wrap { display: flex; align-items: center; gap: 8px; }
.rpc-lbl-range-wrap input[type="range"] { flex: 1; accent-color: #f66744; }
.rpc-lbl-range-wrap .rpc-lbl-val { color: #999; font-size: 12px; min-width: 32px; text-align: right; }
.rpc-lbl-row { display: flex; gap: 12px; align-items: flex-end; }
.rpc-lbl-row > .rpc-lbl-field { flex: 1; margin-bottom: 0; }
.rpc-lbl-swatches { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.rpc-lbl-swatch {
    width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
    border: 2px solid transparent; transition: border-color 0.15s; box-sizing: border-box;
}
.rpc-lbl-swatch:hover { border-color: #888; }
.rpc-lbl-swatch.active { border-color: #fff; }
.rpc-lbl-swatch-transp {
    width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
    border: 2px solid transparent; box-sizing: border-box;
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50%/10px 10px;
}
.rpc-lbl-swatch-transp:hover { border-color: #888; }
.rpc-lbl-swatch-transp.active { border-color: #fff; }
.rpc-lbl-color-row { display: flex; align-items: center; gap: 6px; }
.rpc-lbl-color-row input[type="color"] {
    width: 30px; height: 26px; padding: 0; border: 1px solid #444;
    border-radius: 4px; background: #222; cursor: pointer;
}
.rpc-lbl-color-row .rpc-lbl-hex {
    width: 76px; background: #222; border: 1px solid #333; border-radius: 4px;
    color: #ddd; padding: 4px 6px; font-size: 11px; font-family: monospace; outline: none;
}
.rpc-lbl-color-row .rpc-lbl-hex:focus { border-color: #f66744; }
.rpc-lbl-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 18px; border-top: 1px solid #2a2a2a;
}
.rpc-lbl-footer button {
    padding: 8px 20px; border: none; border-radius: 5px;
    font-size: 13px; cursor: pointer; font-weight: 500;
}
.rpc-lbl-btn-cancel { background: #2a2a2a; color: #ccc; }
.rpc-lbl-btn-cancel:hover { background: #363636; }
.rpc-lbl-btn-save { background: #f66744; color: #fff; }
.rpc-lbl-btn-save:hover { opacity: 0.9; }
.rpc-lbl-align-icon { display: flex; flex-direction: column; gap: 2px; width: 14px; align-items: flex-start; }
.rpc-lbl-align-icon span { display: block; height: 2px; background: currentColor; border-radius: 1px; }
.rpc-lbl-align-left .rpc-lbl-align-icon span:nth-child(1) { width: 14px; }
.rpc-lbl-align-left .rpc-lbl-align-icon span:nth-child(2) { width: 10px; }
.rpc-lbl-align-left .rpc-lbl-align-icon span:nth-child(3) { width: 12px; }
.rpc-lbl-align-center .rpc-lbl-align-icon { align-items: center; }
.rpc-lbl-align-center .rpc-lbl-align-icon span:nth-child(1) { width: 14px; }
.rpc-lbl-align-center .rpc-lbl-align-icon span:nth-child(2) { width: 10px; }
.rpc-lbl-align-center .rpc-lbl-align-icon span:nth-child(3) { width: 12px; }
.rpc-lbl-align-right .rpc-lbl-align-icon { align-items: flex-end; }
.rpc-lbl-align-right .rpc-lbl-align-icon span:nth-child(1) { width: 14px; }
.rpc-lbl-align-right .rpc-lbl-align-icon span:nth-child(2) { width: 10px; }
.rpc-lbl-align-right .rpc-lbl-align-icon span:nth-child(3) { width: 12px; }
.rpc-lbl-help-overlay {
    position: absolute; inset: 0; background: #171718; border-radius: 10px;
    padding: 28px; overflow-y: auto; color: #ccc; font-size: 13px; line-height: 1.7; z-index: 10;
}
.rpc-lbl-help-overlay h3 { color: #f66744; margin: 0 0 12px 0; font-size: 16px; }
.rpc-lbl-help-overlay p { margin: 0 0 8px 0; }
.rpc-lbl-help-overlay kbd {
    background: #333; border: 1px solid #555; border-radius: 3px;
    padding: 1px 5px; font-size: 11px; font-family: monospace; color: #ddd;
}
.rpc-lbl-help-close {
    position: absolute; top: 12px; right: 16px;
    background: none; border: none; color: #666; font-size: 20px; cursor: pointer;
}
.rpc-lbl-help-close:hover { color: #fff; }
.rpc-lbl-btn-help { background: #2a2a2a; color: #999; font-size: 12px; padding: 8px 14px; }
.rpc-lbl-btn-help:hover { background: #363636; color: #ccc; }
`;
  document.head.appendChild(style);
}
