"""OpenRouter: sends pictures, audio or video plus a prompt to any OpenRouter model with the user's
own OPENROUTER_API key and returns the model's text answer. web/openrouter.js draws the model picker;
this module also serves the model list it shows.
Spec: docs/superpowers/specs/2026-09-26-openrouter-node-design.md (in the ComfyUI folder)."""

import base64

import aiohttp
from aiohttp import web

from comfy_api.latest import Types
from comfy_api_nodes.util.conversions import audio_input_to_mp3, tensor_to_data_uri, video_to_base64_string

API = "https://openrouter.ai/api/v1"
LIST_TIMEOUT_SECONDS = 20

# Trimmed model list, fetched once per server run (or on refresh).
_models: list[dict] | None = None


def per_million(price) -> float | None:
    """OpenRouter prices are dollars per token as strings; a negative price means "varies by route"."""
    if price is None or float(price) < 0:
        return None
    return float(price) * 1_000_000


def trim_models(raw: list[dict]) -> list[dict]:
    """Keeps models that answer in text, with only the fields the picker shows."""
    return [{
        "id": m["id"],
        "name": m["name"],
        "input_modalities": m["architecture"]["input_modalities"],
        "prompt_price": per_million(m.get("pricing", {}).get("prompt")),
        "completion_price": per_million(m.get("pricing", {}).get("completion")),
        "created": m.get("created"),
        "context_length": m.get("context_length"),
    } for m in raw if "text" in m["architecture"]["output_modalities"]]


def media_parts(images: list, audio: dict | None, video) -> list[dict]:
    """Message parts for the connected inputs: the first picture of each image, the first audio clip, the video."""
    parts = [{"type": "image_url", "image_url": {"url": tensor_to_data_uri(image[0:1])}}
             for image in images if image is not None]
    if audio is not None:
        mp3 = audio_input_to_mp3({"waveform": audio["waveform"][0:1], "sample_rate": audio["sample_rate"]})
        parts.append({"type": "input_audio",
                      "input_audio": {"data": base64.b64encode(mp3.getvalue()).decode(), "format": "mp3"}})
    if video is not None:
        data = video_to_base64_string(video, Types.VideoContainer.MP4, Types.VideoCodec.H264)
        parts.append({"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{data}"}})
    return parts


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
    return "Done" if cost is None else f"Cost: ${cost:g}"


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
        data = await response.json(content_type=None)
    if not response.ok or "error" in data:
        error = data.get("error") or {}
        raise RuntimeError(f"OpenRouter error {error.get('code', response.status)}: {error.get('message', data)}")
    return data


async def models_route(request: web.Request) -> web.Response:
    try:
        return web.json_response(await load_models(refresh="refresh" in request.query))
    except (aiohttp.ClientError, TimeoutError) as error:
        return web.json_response({"error": str(error) or type(error).__name__}, status=502)


def add_routes(routes: web.RouteTableDef) -> None:
    routes.get("/retodded/openrouter/models")(models_route)


NODES = []
