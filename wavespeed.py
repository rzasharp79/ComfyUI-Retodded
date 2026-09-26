"""WaveSpeed GPT Image 2.5 Sunburst edit: sends pictures plus a prompt to WaveSpeed's API
with the user's own WAVESPEED_API_TOKEN and returns the edited picture."""

import asyncio
import json
import os
import time
from io import BytesIO

import aiohttp
import torch

import comfy.model_management
from comfy_api.latest import io
from comfy_api_nodes.util.conversions import bytesio_to_image_tensor, tensor_to_bytesio
from server import PromptServer

API = "https://api.wavespeed.ai/api/v3"
MODEL_ID = "openai/gpt-image-2.5-sunburst/edit"
MAX_IMAGES = 16
POLL_SECONDS = 2.0
TIMEOUT_SECONDS = 15 * 60
ASPECT_RATIOS = ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "2:1", "1:2",
                 "3:1", "1:3", "9:21"]
# USD per run for one input picture, from WaveSpeed's /model/price on 2026-09-25. Only drives the
# estimate badge; the cost shown after a run comes from the live pricing API. The badge uses the "text"
# result type because the frontend shows "usd" results as Comfy credits, and WaveSpeed bills in dollars.
PRICES = {
    "low": {"1k": 0.025, "2k": 0.035, "4k": 0.045},
    "medium": {"1k": 0.039, "2k": 0.055, "4k": 0.085},
    "high": {"1k": 0.105, "2k": 0.165, "4k": 0.285},
    "xhigh": {"1k": 0.175, "2k": 0.285, "4k": 0.495},
    "max": {"1k": 0.375, "2k": 0.615, "4k": 1.015},
}
EXTRA_IMAGE_PRICE = 0.015


def collect_images(images: dict) -> list[torch.Tensor]:
    """Flattens Autogrow slots, in slot order, into single [H, W, C] pictures."""
    slots = sorted((key for key, value in images.items() if value is not None),
                   key=lambda key: int(key.rsplit("_", 1)[1]))
    flat = [picture for key in slots for picture in images[key]]
    if not flat:
        raise ValueError("Connect at least one picture.")
    if len(flat) > MAX_IMAGES:
        raise ValueError(f"WaveSpeed accepts at most {MAX_IMAGES} pictures, got {len(flat)}.")
    return flat


def build_request(prompt: str, image_uris: list[str], aspect_ratio: str, resolution: str, quality: str) -> dict:
    body = {"prompt": prompt, "images": image_uris, "resolution": resolution, "quality": quality,
            "output_format": "png"}
    if aspect_ratio != "auto":
        body["aspect_ratio"] = aspect_ratio
    return body


def cost_text(price: float, balance: float | None) -> str:
    left = "unavailable" if balance is None else f"${balance:.2f}"
    return f"Cost: ${price:g} · Balance left: {left}"


async def call(session: aiohttp.ClientSession, method: str, url: str, token: str, body: dict | None = None) -> dict:
    async with session.request(method, url, json=body, headers={"Authorization": f"Bearer {token}"}) as response:
        data = await response.json(content_type=None)
        if response.status != 200:
            raise RuntimeError(f"WaveSpeed error {response.status}: {data.get('message', data)}")
        return data["data"]


async def upload_image(session: aiohttp.ClientSession, api: str, token: str, picture: torch.Tensor) -> str:
    """Uploads one picture as PNG and returns its URL. The bytes go straight to storage through an upload
    ticket, because WaveSpeed's API gateway often stalls on request bodies of a few MB (WinError 121)."""
    png = tensor_to_bytesio(picture).getvalue()
    ticket = await call(session, "POST", f"{api}/media/uploads", token,
                        {"filename": "image.png", "size": len(png), "content_type": "image/png"})
    upload = ticket["upload"]
    async with session.request(upload["method"], upload["url"], data=png, headers=upload["headers"]) as response:
        response.raise_for_status()
    return ticket["download_url"]


async def run_prediction(session: aiohttp.ClientSession, api: str, token: str, body: dict, on_status) -> list[str]:
    """Submits one job, polls until it finishes, and returns the output picture URLs."""
    job = await call(session, "POST", f"{api}/{MODEL_ID}", token, body)
    started = time.monotonic()
    while True:
        comfy.model_management.throw_exception_if_processing_interrupted()
        result = await call(session, "GET", f"{api}/predictions/{job['id']}/result", token)
        if result["status"] == "completed":
            return result["outputs"]
        if result["status"] in ("failed", "cancelled", "timeout", "deleted"):
            raise RuntimeError(f"WaveSpeed job {result['status']}: {result.get('error') or 'no reason given'}")
        elapsed = time.monotonic() - started
        if elapsed > TIMEOUT_SECONDS:
            raise TimeoutError(f"WaveSpeed job {job['id']} not finished after {TIMEOUT_SECONDS} s.")
        on_status(f"WaveSpeed: {result['status']} ({elapsed:.0f} s)")
        await asyncio.sleep(POLL_SECONDS)


class WaveSpeedGPTImageEdit(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_WaveSpeedGPTImageEdit",
            display_name="WaveSpeed GPT Image 2.5 Edit",
            category="ReTodded",
            description="Edits up to 16 pictures with OpenAI GPT Image 2.5 Sunburst on WaveSpeed, "
                        "billed to the WAVESPEED_API_TOKEN account.",
            inputs=[
                io.String.Input("prompt", multiline=True, default="",
                                tooltip="What to change. Refer to pictures by their order, e.g. 'the jacket from image 2'."),
                io.Autogrow.Input("images", template=io.Autogrow.TemplateNames(
                    io.Image.Input("image"), names=[f"image_{i}" for i in range(1, MAX_IMAGES + 1)], min=1),
                    tooltip="Pictures to edit or use as references, up to 16 in total. Each is shrunk to at "
                            "most about 4 megapixels before upload."),
                io.Combo.Input("aspect_ratio", options=ASPECT_RATIOS, default="auto",
                               tooltip="auto matches the first picture."),
                io.Combo.Input("resolution", options=list(PRICES["low"]), default="1k"),
                io.Combo.Input("quality", options=list(PRICES), default="medium",
                               tooltip="Higher tiers add detail, take longer, and cost more."),
                io.Int.Input("seed", default=0, min=0, max=2**31 - 1, control_after_generate=True,
                             tooltip="Not sent to WaveSpeed. Changing it makes ComfyUI call the API again "
                                     "instead of reusing the last result."),
            ],
            outputs=[io.Image.Output()],
            hidden=[io.Hidden.unique_id],
            is_api_node=True,
            price_badge=io.PriceBadge(
                depends_on=io.PriceBadgeDepends(widgets=["quality", "resolution"], input_groups=["images"]),
                expr=f"""
                (
                  $prices := {json.dumps(PRICES)};
                  $count := $lookup(inputGroups, "images");
                  $extra := $count > 1 ? ($count - 1) * {EXTRA_IMAGE_PRICE} : 0;
                  $usd := $lookup($lookup($prices, widgets.quality), widgets.resolution) + $extra;
                  {{"type": "text", "text": "~$" & $formatNumber($usd, "0.000") & "/Run"}}
                )
                """,
            ),
        )

    @classmethod
    async def execute(cls, prompt: str, images: io.Autogrow.Type, aspect_ratio: str, resolution: str,
                      quality: str, seed: int) -> io.NodeOutput:
        token = os.environ.get("WAVESPEED_API_TOKEN")
        if not token:
            raise RuntimeError("Set the WAVESPEED_API_TOKEN environment variable, then restart ComfyUI.")
        pictures = collect_images(images)

        def show(text: str) -> None:
            PromptServer.instance.send_progress_text(text, cls.hidden.unique_id)

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as session:
            body = build_request(prompt, ["x"] * len(pictures), aspect_ratio, resolution, quality)
            price = await call(session, "POST", f"{API}/model/price", token, {"model_id": MODEL_ID, "inputs": body})
            show(f"WaveSpeed: uploading {len(pictures)} picture(s), about ${price['discounted_price']:g}")
            body["images"] = await asyncio.gather(*(upload_image(session, API, token, p) for p in pictures))
            outputs = await run_prediction(session, API, token, body, show)
            results = []
            for url in outputs:
                async with session.get(url) as response:
                    response.raise_for_status()
                    results.append(bytesio_to_image_tensor(BytesIO(await response.read()), mode="RGB"))
            async with session.get(f"{API}/balance", headers={"Authorization": f"Bearer {token}"}) as response:
                balance = (await response.json(content_type=None))["data"]["balance"] if response.ok else None
        show(cost_text(price["discounted_price"], balance))
        return io.NodeOutput(torch.cat(results))


NODES = [WaveSpeedGPTImageEdit]
