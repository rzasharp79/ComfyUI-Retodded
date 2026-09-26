// Frontend half of MyCustom_CanvasInfo (canvas_info.py).
// Shows the node's own graph-space position (top-left of the body, below the
// title bar) and its width/height, refreshed every animation frame so it
// tracks drags and resizes. Uses the legacy app.registerExtension API on
// purpose: the v2 @comfyorg/extension-api does not expose node position or
// size yet, and a DOM widget renders in both canvas and Vue-node modes.
import { app } from "../../scripts/app.js";

const NODE_ID = "MyCustom_CanvasInfo";
const MIN_HEIGHT = 80;

app.registerExtension({
  name: "mycustom.CanvasInfo",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_ID) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      const el = document.createElement("pre");
      el.style.cssText =
        "margin:0;padding:4px 8px;font:12px/1.5 monospace;background:transparent;pointer-events:none;";
      const widget = this.addDOMWidget("canvas_info", "CANVAS_INFO", el, {
        hideOnZoom: false,
        getMinHeight: () => MIN_HEIGHT,
      });
      // Keep the display out of widgets_values. The `serialize: false` option
      // is ignored by frontend 1.52; the widget property is what serialize() checks.
      widget.serialize = false;

      let last = "";
      const tick = () => {
        const [x, y] = this.pos;
        const [w, h] = this.size;
        const text = `x: ${Math.round(x)}\ny: ${Math.round(y)}\nw: ${Math.round(w)}\nh: ${Math.round(h)}`;
        if (text !== last) {
          last = text;
          el.textContent = text;
        }
        this._canvasInfoRaf = requestAnimationFrame(tick);
      };
      tick();
      this.setSize([Math.max(this.size[0], 160), Math.max(this.size[1], MIN_HEIGHT + 20)]);
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      cancelAnimationFrame(this._canvasInfoRaf);
      onRemoved?.apply(this, arguments);
    };
  },
});
