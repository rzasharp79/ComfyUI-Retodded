import math

import kornia
import torch
from typing_extensions import override

import comfy.model_management
from comfy_api.latest import io

# Fine-detail contrast is the local RMS of (luminance - blurred luminance) divided by the local
# brightness, both averaged over skin pixels only so outlines and shadows do not count. At
# sensitivity s, contrast at or below LO_FRACTION * HI_PER_SENSITIVITY * s is fully waxy and
# contrast at or above HI_PER_SENSITIVITY * s is not waxy. Calibrated on FLUX.1 dev renders
# against textured skin (docs/superpowers/specs/2026-09-23-plastic-skin-remover-design.md).
HI_PER_SENSITIVITY = 0.035
LO_FRACTION = 0.4
ENERGY_SIGMA = 8.0
MIN_BRIGHTNESS = 0.05
MAP_FLOOR = 0.05
PREVIEW_ALPHA = 0.6


def blur(x: torch.Tensor, sigma: float) -> torch.Tensor:
    size = 2 * math.ceil(3 * sigma) + 1
    return kornia.filters.gaussian_blur2d(x, (size, size), (sigma, sigma), border_type="replicate")


def fit_mask(mask: torch.Tensor, rgb: torch.Tensor) -> torch.Tensor:
    """Returns mask as [B, 1, H, W] matching the batch and size of an [B, H, W, C] image."""
    batch, height, width, _ = rgb.shape
    fitted = mask.reshape((-1, 1) + mask.shape[-2:]).to(rgb.device, rgb.dtype)
    if fitted.shape[-2:] != (height, width):
        fitted = torch.nn.functional.interpolate(fitted, size=(height, width), mode="bilinear")
    return fitted.expand(batch, -1, -1, -1)


class WaxySkinMap(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_WaxySkinMap",
            display_name="Waxy Skin Map",
            category="ReTodded",
            description="Finds skin with too little fine detail, the waxy look of FLUX renders, and returns a soft 0-1 map of it.",
            inputs=[
                io.Image.Input("image", tooltip="The photo to check."),
                io.Mask.Input("skin_mask", tooltip="Where the skin is, for example from Human Segmentation."),
                io.Float.Input("pore_size", default=2.0, min=0.5, max=8.0, step=0.1,
                               tooltip="Size in pixels of the fine detail that gets measured."),
                io.Float.Input("sensitivity", default=0.5, min=0.0, max=1.0, step=0.01,
                               tooltip="How smooth skin must be to count as waxy. Higher flags more skin."),
                io.Int.Input("softness", default=16, min=0, max=128,
                             tooltip="Blur in pixels for the map edges, so the fix has no seams."),
            ],
            outputs=[
                io.Mask.Output(display_name="wax_map"),
                io.Image.Output(display_name="preview"),
                io.Float.Output(display_name="waxy_percent"),
            ],
        )

    @classmethod
    @override
    def execute(cls, image: torch.Tensor, skin_mask: torch.Tensor, pore_size: float, sensitivity: float,
                softness: int) -> io.NodeOutput:
        device = comfy.model_management.get_torch_device()
        rgb = image[..., :3].to(device)
        skin = fit_mask(skin_mask, rgb)

        luma = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).unsqueeze(1)
        detail = (luma - blur(luma * skin, pore_size) / blur(skin, pore_size).clamp(min=1e-3)) * skin
        window = blur(skin, ENERGY_SIGMA).clamp(min=1e-3)
        energy = (blur(detail.square(), ENERGY_SIGMA) / window).sqrt()
        contrast = energy / (blur(luma * skin, ENERGY_SIGMA) / window).clamp(min=MIN_BRIGHTNESS)
        hi = HI_PER_SENSITIVITY * sensitivity
        lo = LO_FRACTION * hi
        t = ((contrast - lo) / max(hi - lo, 1e-6)).clamp(0, 1)
        wax = (1 - t * t * (3 - 2 * t)) * skin
        if softness > 0:
            wax = blur(wax, softness / 2)
        wax = torch.where(wax < MAP_FLOOR, 0, wax) * skin

        preview = torch.lerp(rgb, rgb.new_tensor((1.0, 0.0, 0.0)), PREVIEW_ALPHA * wax.movedim(1, -1))
        percent = round((wax.sum() / skin.sum().clamp(min=1)).item() * 100, 1)

        out = comfy.model_management.intermediate_device()
        return io.NodeOutput(wax.squeeze(1).to(out), preview.to(out), percent)


class SkinGrain(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_SkinGrain",
            display_name="Skin Grain",
            category="ReTodded",
            description="Adds fine monochrome grain inside a mask, stronger in bright skin and weaker in shadow. "
                        "A low-denoise re-render turns it into skin texture.",
            inputs=[
                io.Image.Input("image"),
                io.Mask.Input("mask", tooltip="Where to add grain, for example a Waxy Skin Map."),
                io.Float.Input("strength", default=0.03, min=0.0, max=0.5, step=0.005,
                               tooltip="Grain size relative to the local brightness."),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff, control_after_generate=True),
            ],
            outputs=[io.Image.Output(display_name="image")],
        )

    @classmethod
    @override
    def execute(cls, image: torch.Tensor, mask: torch.Tensor, strength: float, seed: int) -> io.NodeOutput:
        rgb = image[..., :3]
        weight = fit_mask(mask, rgb).movedim(1, -1)
        noise = torch.randn(weight.shape, generator=torch.Generator().manual_seed(seed)).to(rgb)
        return io.NodeOutput((rgb * (1 + strength * noise * weight)).clamp(0, 1))


NODES = [WaxySkinMap, SkinGrain]
