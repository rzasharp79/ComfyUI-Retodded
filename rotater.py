from typing_extensions import override

from comfy_api.latest import io

TYPES = ["string", "int", "float", "combo"]
CONVERTERS = {"int": int, "float": float}


def split_items(values: str, delimiter: str) -> list[str]:
    """Trimmed, non-empty items of the text box. A typed \\n in the delimiter means a line break. Mirrored by splitItems in web/rotater_core.js."""
    delimiter = delimiter.replace("\\n", "\n")
    parts = values.split(delimiter) if delimiter else [values]
    return [part.strip() for part in parts if part.strip()]


class Rotater(io.ComfyNode):
    """Outputs one item of a delimited list per run. web/rotater.js queues one run per item and sets index for each."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_Rotater",
            display_name="Rotater",
            category="ReTodded/Workflow",
            description="Type a list of values separated by the delimiter, for example man;woman;dog. Pressing Run queues one run per item: the first run outputs man, the next woman, the last dog. The type dropdown sets what the output socket carries: string, int, float, or combo (plugs into a dropdown input; items must match the dropdown's option names exactly).",
            inputs=[
                io.Combo.Input("type", options=TYPES, socketless=True, tooltip="What the output socket carries."),
                io.String.Input("values", multiline=True, socketless=True, tooltip="The items to rotate through. Spaces around an item and empty items are ignored."),
                io.String.Input("delimiter", default=";", socketless=True, tooltip="The text that separates the items. Type \\n to put one item per line."),
                io.Int.Input("index", default=0, min=0, socketless=True, extra_dict={"hidden": True}, tooltip="Which item this run outputs, counting from 0 and wrapping around. Set automatically for each queued run."),
            ],
            outputs=[io.AnyType.Output(display_name="value")],
        )

    @classmethod
    def validate_inputs(cls, type: str, values: str, delimiter: str) -> bool | str:
        # Naming an input here turns off ComfyUI's own check for it, so type is checked by hand.
        if type not in TYPES:
            return f"Rotater: type must be one of {TYPES}, got {type!r}."
        items = split_items(values, delimiter)
        if not items:
            return "Rotater: the text box has no items."
        convert = CONVERTERS.get(type)
        if convert is not None:
            for item in items:
                try:
                    convert(item)
                except ValueError:
                    return f"Rotater: {item!r} is not a valid {type}."
        return True

    @classmethod
    @override
    def execute(cls, type: str, values: str, delimiter: str, index: int) -> io.NodeOutput:
        items = split_items(values, delimiter)
        item = items[index % len(items)]
        return io.NodeOutput(CONVERTERS.get(type, str)(item))


NODES = [Rotater]
