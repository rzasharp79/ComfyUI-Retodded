from typing_extensions import override

from comfy_api.latest import io


class NodeHotkeys(io.ComfyNode):
    """Frontend-only node. Lists the graph's nodes and binds digit hotkeys to them; see web/node_hotkeys.js."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_NodeHotkeys",
            display_name="Node Hotkeys",
            category="ReTodded",
            description="Lists every node in this graph sorted by x then y. Give a node a digit hotkey (0-9) and a zoom (0.5-2.0); pressing the digit pans the canvas to that node. Click Refresh after adding or removing nodes. Has no inputs or outputs and never executes.",
        )

    @classmethod
    @override
    def execute(cls) -> io.NodeOutput:
        return io.NodeOutput()


NODES = [NodeHotkeys]
