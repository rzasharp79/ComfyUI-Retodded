"""Load Image Pixaroma Clone: a frozen copy of Pixaroma's "Load Image Pixaroma" (MIT, see
web/pixaroma_clone/LICENSE-Pixaroma) that Pixaroma updates never touch. Same outputs and inline
resize; the frontend is web/pixaroma_clone/, with every shared name renamed so the two never mix.

The resize settings live in node.properties; the frontend writes them into the LoadImagePixState
input when the prompt is queued. The original declares that input as a V1 hidden input; V3 has no
custom hidden inputs, so here it is an optional socketless text box that the frontend hides.
"""

import hashlib
import json
import logging
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import comfy.model_management
import folder_paths
import node_helpers
from comfy_api.latest import io

from .pixaroma_clone_resize import _I16_MODES, _resize_frame

STATE_INPUT = "LoadImagePixState"

DEFAULT_STATE = {
    "version": 1,
    "mode": "off",
    "max_mp": 1.0,
    "longest_side": 1024,
    "scale_factor": 1.0,
    "fit_w": 1024, "fit_h": 1024,
    "cover_w": 1024, "cover_h": 1024,
    "ratio_preset": "1:1",
    "ratio_w": 1, "ratio_h": 1,
    "ratio_action": "crop",
    "pad_color": "#808080",
    "pad_top": 0, "pad_bottom": 0, "pad_left": 0, "pad_right": 0,
    "crop_anchor": "center", "crop_scale": True,
    "snap": 0,
    "resample": "auto",
    "allow_upscale": True,
}


def _load_state_json(state_json: str) -> dict:
    """The state JSON as a dict; {} when missing or malformed (subgraph and partial-prompt cases)."""
    if not state_json:
        return {}
    try:
        parsed = json.loads(state_json)
    except json.JSONDecodeError:
        logging.warning("[LoadImagePixClone] Malformed state JSON, using defaults")
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _parse_state(state_json: str) -> dict:
    parsed = _load_state_json(state_json)
    return DEFAULT_STATE | {k: v for k, v in parsed.items() if k in DEFAULT_STATE}


def _parse_orig_name(state_json: str) -> str:
    """The original (non-clipspace) filename the frontend adds when the Mask Editor swapped in a
    clipspace copy, so the filename output stays stable across masking. "" when absent."""
    v = _load_state_json(state_json).get("orig_name")
    return v if isinstance(v, str) else ""


def _input_images() -> list[str]:
    """Every image under input/, subfolders included (native LoadImage lists the root only)."""
    input_dir = folder_paths.get_input_directory()
    files = []
    for root, _dirs, fnames in os.walk(input_dir):
        rel_root = os.path.relpath(root, input_dir)
        for fname in fnames:
            rel = fname if rel_root == "." else os.path.join(rel_root, fname)
            files.append(rel.replace("\\", "/"))
    return sorted(folder_paths.filter_files_content_types(files, ["image"]))


def _alpha_mask(frame: Image.Image, size: tuple[int, int]) -> Image.Image:
    """1 - alpha as an L image, or all zeros when the frame has no transparency."""
    if "A" in frame.getbands():
        alpha = frame.getchannel("A")
    elif frame.mode == "P" and "transparency" in frame.info:
        alpha = frame.convert("RGBA").getchannel("A")
    else:
        return Image.new("L", size, 0)
    alpha = np.array(alpha).astype(np.float32) / 255.0
    return Image.fromarray(((1.0 - alpha) * 255).astype(np.uint8), mode="L")


class LoadImagePixClone(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MyCustom_LoadImagePixClone",
            display_name="Load Image Pixaroma Clone",
            category="ReTodded/Pixaroma",
            description=(
                "A frozen copy of Load Image Pixaroma that Pixaroma updates never change. Loads an image "
                "(upload, drag-drop, paste, multi-frame, alpha to mask) with an inline resize: max "
                "megapixels, longest side, scale by, fit inside, crop to fill, match aspect ratio."
            ),
            inputs=[
                io.Combo.Input(
                    "image",
                    options=_input_images(),
                    upload=io.UploadType.image,
                    tooltip="The image to load from ComfyUI's input folder. Use the Upload Image button, "
                    "drag a file onto the node, paste from the clipboard, or pick one from the dropdown.",
                ),
                io.String.Input(
                    STATE_INPUT,
                    default=json.dumps(DEFAULT_STATE),
                    optional=True,
                    socketless=True,
                    tooltip="Resize settings, written by the node's panel. Hidden on the node.",
                ),
            ],
            outputs=[
                io.Image.Output(display_name="image", tooltip="The loaded image, after any resize."),
                io.Mask.Output(display_name="mask", tooltip="The image's mask, from its alpha channel (blank if it has none)."),
                io.Int.Output(display_name="width", tooltip="Output width in pixels, after any resize."),
                io.Int.Output(display_name="height", tooltip="Output height in pixels, after any resize."),
                io.String.Output(display_name="filename", tooltip="The image's filename."),
                io.Int.Output(display_name="original_width", tooltip="Width of the original image, before any resize."),
                io.Int.Output(display_name="original_height", tooltip="Height of the original image, before any resize."),
            ],
        )

    @classmethod
    def execute(cls, image: str, LoadImagePixState: str = "") -> io.NodeOutput:
        image_path = folder_paths.get_annotated_filepath(image)
        img = node_helpers.pillow(Image.open, image_path)
        dtype = comfy.model_management.intermediate_dtype()
        state = _parse_state(LoadImagePixState)

        orig_name = _parse_orig_name(LoadImagePixState)
        if "clipspace" in image.replace("\\", "/").lower() and orig_name:
            basename = os.path.splitext(os.path.basename(orig_name.replace("\\", "/")))[0]
        else:
            basename = os.path.splitext(os.path.basename(image_path))[0]

        images, masks = [], []
        orig_w = orig_h = final_w = final_h = None
        for frame in ImageSequence.Iterator(img):
            frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
            if frame.mode == "I":
                frame = frame.point(lambda px: px * (1 / 255))
            elif frame.mode in _I16_MODES:
                frame = frame.convert("I").point(lambda px: px * (1 / 257))
            rgb = frame.convert("RGB")

            if orig_w is None:
                orig_w, orig_h = rgb.size
            if rgb.size != (orig_w, orig_h):
                continue

            rgb, mask, final_w, final_h = _resize_frame(rgb, _alpha_mask(frame, rgb.size), state, orig_w, orig_h)
            images.append(torch.from_numpy(np.array(rgb).astype(np.float32) / 255.0)[None,].to(dtype=dtype))
            masks.append(torch.from_numpy(np.array(mask).astype(np.float32) / 255.0)[None,].to(dtype=dtype))

            if img.format == "MPO":
                break  # same as native LoadImage: first frame only

        return io.NodeOutput(torch.cat(images), torch.cat(masks), final_w, final_h, basename, orig_w, orig_h)

    @classmethod
    def fingerprint_inputs(cls, image: str, LoadImagePixState: str = ""):
        m = hashlib.sha256()
        with open(folder_paths.get_annotated_filepath(image), "rb") as f:
            m.update(f.read())
        m.update((LoadImagePixState or "").encode("utf-8"))
        return m.hexdigest()

    @classmethod
    def validate_inputs(cls, image: str, LoadImagePixState: str = ""):
        if not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True


NODES = [LoadImagePixClone]
