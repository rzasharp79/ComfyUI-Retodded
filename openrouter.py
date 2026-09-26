"""OpenRouter: sends pictures, audio or video plus a prompt to any OpenRouter model with the user's
own OPENROUTER_API key and returns the model's text answer. web/openrouter.js draws the model picker;
this module also serves the model list it shows.
Spec: docs/superpowers/specs/2026-09-26-openrouter-node-design.md (in the ComfyUI folder)."""

import asyncio
import base64
import json
import logging
import os

import aiohttp
import torchaudio
from aiohttp import web

import comfy.model_management
from comfy_api.latest import Types, io
from comfy_api_nodes.util.conversions import audio_input_to_mp3, tensor_to_data_uri, video_to_base64_string
from server import PromptServer

API = "https://openrouter.ai/api/v1"
LIST_TIMEOUT_SECONDS = 20
TIMEOUT_SECONDS = 5 * 60
# Larger pictures are shrunk to this many pixels (ComfyUI counts a megapixel as 1024 x 1024); smaller ones go as they are.
MAX_PIXELS = 2 * 1024 * 1024
# The MP3 encoder takes at most 48 kHz and two channels.
MP3_MAX_RATE = 48000

# Trimmed model list, fetched once per server run (or on refresh).
_models: list[dict] | None = None


def per_million(price) -> float | None:
    """OpenRouter prices are dollars per token as strings; a negative price means "varies by route"."""
    if price is None or float(price) < 0:
        return None
    return float(price) * 1_000_000


def trim_models(raw: list[dict]) -> list[dict]:
    """Keeps models that answer in text, with only the fields the picker shows."""
    models = []
    for m in raw:
        arch = m.get("architecture") or {}
        pricing = m.get("pricing") or {}
        if "text" not in (arch.get("output_modalities") or []):
            continue
        models.append({
            "id": m["id"],
            "name": m["name"],
            "input_modalities": arch.get("input_modalities") or [],
            "prompt_price": per_million(pricing.get("prompt")),
            "completion_price": per_million(pricing.get("completion")),
            "created": m.get("created"),
            "context_length": m.get("context_length"),
        })
    return models


def media_parts(images: list, audio: dict | None, video) -> list[dict]:
    """Message parts for the connected inputs: the first picture of each image, the first audio clip, the video."""
    parts = [{"type": "image_url", "image_url": {"url": tensor_to_data_uri(image[0:1], total_pixels=MAX_PIXELS)}}
             for image in images if image is not None]
    if audio is not None:
        mp3 = audio_input_to_mp3(mp3_ready(audio))
        parts.append({"type": "input_audio",
                      "input_audio": {"data": base64.b64encode(mp3.getvalue()).decode(), "format": "mp3"}})
    if video is not None:
        data = video_to_base64_string(video, Types.VideoContainer.MP4, Types.VideoCodec.H264)
        parts.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{data}"}})
    return parts


def mp3_ready(audio: dict) -> dict:
    """First clip of the batch, mixed to mono above two channels and resampled above 48 kHz."""
    waveform, rate = audio["waveform"][0:1], int(audio["sample_rate"])
    if waveform.shape[1] > 2:
        waveform = waveform.mean(dim=1, keepdim=True)
    if rate > MP3_MAX_RATE:
        waveform, rate = torchaudio.functional.resample(waveform, rate, MP3_MAX_RATE), MP3_MAX_RATE
    return {"waveform": waveform, "sample_rate": rate}


def used_kinds(images: list, audio, video) -> list[str]:
    kinds = ["image"] if any(image is not None for image in images) else []
    return kinds + ["audio"] * (audio is not None) + ["video"] * (video is not None)


def build_request(model: str, system_prompt: str, prompt: str, parts: list[dict]) -> dict:
    messages = [{"role": "system", "content": system_prompt}] if system_prompt.strip() else []
    messages.append({"role": "user", "content": [{"type": "text", "text": prompt}, *parts]})
    return {"model": model, "messages": messages, "usage": {"include": True}}


def check_model(model: str, kinds: list[str], models: list[dict]) -> None:
    """Fails before any paid call when the model is gone or cannot take a connected input."""
    found = next((m for m in models if m["id"] == model), None)
    if found is None:
        raise RuntimeError(f"OpenRouter no longer offers {model}. Pick another model in the node's list.")
    missing = [kind for kind in kinds if kind not in found["input_modalities"]]
    if missing:
        raise RuntimeError(f"{found['name']} does not accept {' or '.join(missing)}. Disconnect it, "
                           f"or pick a model from the {missing[0].upper()}2TEXT tab.")


def read_answer(data: dict) -> tuple[str, float | None]:
    choices = data.get("choices") or [{}]
    text = (choices[0].get("message", {}).get("content") or "").strip()
    if not text:
        raise RuntimeError("The model returned no text. Try again or pick another model.")
    return text, data.get("usage", {}).get("cost")


def cost_text(cost: float | None) -> str:
    # Plain decimals: OpenRouter costs are often under $0.0001, which :g would print as 3.5e-05.
    return "Done" if cost is None else f"Cost: ${cost:.6f}".rstrip("0").rstrip(".")


async def load_models(refresh: bool = False) -> list[dict]:
    global _models
    if _models is None or refresh:
        timeout = aiohttp.ClientTimeout(total=LIST_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{API}/models") as response:
                response.raise_for_status()
                _models = trim_models((await response.json())["data"])
    return _models


async def chat(session: aiohttp.ClientSession, key: str, body: dict) -> dict:
    """One chat call. OpenRouter can also report a failure inside a 200 answer."""
    async with session.post(f"{API}/chat/completions", json=body,
                            headers={"Authorization": f"Bearer {key}"}) as response:
        text = await response.text()
    # Gateways in front of OpenRouter answer with HTML error pages, so the body may not be JSON.
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    if response.ok and isinstance(data, dict) and "error" not in data:
        return data
    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        raise RuntimeError(f"OpenRouter error {error.get('code', response.status)}: {error.get('message', error)}")
    raise RuntimeError(f"OpenRouter error {response.status}: {error or text[:200] or 'no details'}")


async def until_done_or_cancelled(task: asyncio.Task):
    """Waits for task, but gives up as soon as the user presses Cancel in ComfyUI."""
    while not (await asyncio.wait({task}, timeout=0.5))[0]:
        if comfy.model_management.processing_interrupted():
            task.cancel()
            comfy.model_management.throw_exception_if_processing_interrupted()
    return task.result()


async def models_route(request: web.Request) -> web.Response:
    try:
        return web.json_response(await load_models(refresh="refresh" in request.query))
    except (aiohttp.ClientError, TimeoutError) as error:
        return web.json_response({"error": str(error) or type(error).__name__}, status=502)


def add_routes(routes: web.RouteTableDef) -> None:
    routes.get("/retodded/openrouter/models")(models_route)


class OpenRouter(io.ComfyNode):
    """Picks a model with the picker in web/openrouter.js, which writes its id into the hidden `model` widget."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_OpenRouter",
            display_name="OpenRouter",
            category="ReTodded/API",
            description="Sends pictures, audio or video plus a prompt to an OpenRouter model and outputs its text "
                        "answer. Only the first picture of each image batch is sent. Needs your own key in the "
                        "OPENROUTER_API environment variable; runs are billed to that account.",
            inputs=[
                io.Image.Input("image1", optional=True),
                io.Image.Input("image2", optional=True),
                io.Image.Input("image3", optional=True),
                io.Audio.Input("audio", optional=True),
                io.Video.Input("video", optional=True),
                io.String.Input("system_prompt", display_name="system prompt", multiline=True, default=""),
                io.String.Input("prompt", multiline=True, default=""),
                io.String.Input("model", default="", socketless=True, extra_dict={"hidden": True},
                                tooltip="OpenRouter model id, set by the model list on the node."),
            ],
            outputs=[io.String.Output()],
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    async def execute(cls, system_prompt: str, prompt: str, model: str, image1=None, image2=None, image3=None,
                      audio=None, video=None) -> io.NodeOutput:
        key = os.environ.get("OPENROUTER_API")
        if not key:
            raise RuntimeError("Set the OPENROUTER_API environment variable to your OpenRouter key, then restart ComfyUI.")
        if not model:
            raise RuntimeError("Pick a model in the node's list first.")
        images = [image1, image2, image3]
        # The input check is a courtesy that saves a paid call; without the list OpenRouter still decides.
        try:
            models = await load_models()
        except (aiohttp.ClientError, TimeoutError) as error:
            logging.warning("OpenRouter: model list unavailable, skipping the input check: %s", error)
        else:
            check_model(model, used_kinds(images, audio, video), models)
        body = build_request(model, system_prompt, prompt, media_parts(images, audio, video))

        def show(text: str) -> None:
            PromptServer.instance.send_progress_text(text, cls.hidden.unique_id)

        show(f"OpenRouter: waiting for {model}…")
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)) as session:
            text, cost = read_answer(await until_done_or_cancelled(asyncio.ensure_future(chat(session, key, body))))
        show(cost_text(cost))
        return io.NodeOutput(text)


NODES = [OpenRouter]
