from typing_extensions import override

from comfy_api.latest import io


class CanvasInfo(io.ComfyNode):
    """Frontend-only node. Shows its own canvas position and size; see web/canvas_info.js."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_CanvasInfo",
            display_name="Canvas Info",
            category="ReTodded",
            description="Shows this node's x/y position and width/height on the canvas. Updates live when moved or resized. Has no inputs or outputs and never executes.",
        )

    @classmethod
    @override
    def execute(cls) -> io.NodeOutput:
        return io.NodeOutput()


NODES = [CanvasInfo]
