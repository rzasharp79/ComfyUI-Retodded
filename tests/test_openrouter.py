import base64

import pytest
import torch

from retodded.openrouter import (build_request, check_model, cost_text, media_parts, per_million, read_answer,
                                 trim_models, used_kinds)

RAW = {
    "id": "a/vision", "name": "A: Vision", "created": 1790000000, "context_length": 128000,
    "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]},
    "pricing": {"prompt": "0.0000003", "completion": "0.0000015"},
}
MODELS = trim_models([RAW])


def test_per_million():
    assert per_million("0.0000003") == pytest.approx(0.3)
    assert per_million("0") == 0
    assert per_million("-1") is None
    assert per_million(None) is None


def test_trim_models_keeps_text_models_only():
    painter = {**RAW, "id": "b/paint", "architecture": {"input_modalities": ["text"], "output_modalities": ["image"]}}
    assert [m["id"] for m in trim_models([RAW, painter])] == ["a/vision"]
    assert MODELS[0] == {"id": "a/vision", "name": "A: Vision", "input_modalities": ["text", "image"],
                         "prompt_price": pytest.approx(0.3), "completion_price": pytest.approx(1.5),
                         "created": 1790000000, "context_length": 128000}


def test_trim_models_survives_missing_prices_and_context():
    odd = {**RAW, "pricing": {}, "context_length": None}
    model = trim_models([odd])[0]
    assert model["prompt_price"] is None and model["completion_price"] is None
    assert model["context_length"] is None


def test_media_parts_sends_first_picture_of_each_image_in_slot_order():
    red = torch.zeros(2, 8, 8, 3)
    red[..., 0] = 1
    parts = media_parts([red, None, torch.ones(1, 8, 8, 3)], None, None)
    assert [p["type"] for p in parts] == ["image_url", "image_url"]
    assert all(p["image_url"]["url"].startswith("data:image/png;base64,") for p in parts)


def test_media_parts_accepts_rgba_pictures():
    url = media_parts([torch.ones(1, 8, 8, 4)], None, None)[0]["image_url"]["url"]
    assert base64.b64decode(url.split(",", 1)[1]).startswith(b"\x89PNG")


def test_media_parts_sends_first_audio_clip_as_mp3():
    audio = {"waveform": torch.zeros(2, 1, 44100), "sample_rate": 44100}
    part = media_parts([], audio, None)[0]
    assert part["type"] == "input_audio"
    assert part["input_audio"]["format"] == "mp3"
    assert len(base64.b64decode(part["input_audio"]["data"])) > 0


def test_media_parts_sends_video_as_mp4_data_url(monkeypatch):
    from retodded import openrouter
    seen = {}

    def fake(video, container, codec):
        seen["args"] = (video, container, codec)
        return "QUJD"

    monkeypatch.setattr(openrouter, "video_to_base64_string", fake)
    part = media_parts([], None, "clip")[0]
    assert part == {"type": "video_url", "video_url": {"url": "data:video/mp4;base64,QUJD"}}
    assert seen["args"] == ("clip", openrouter.Types.VideoContainer.MP4, openrouter.Types.VideoCodec.H264)


def test_used_kinds():
    assert used_kinds([None, None, None], None, None) == []
    assert used_kinds([None, torch.zeros(1, 2, 2, 3), None], {"x": 1}, "v") == ["image", "audio", "video"]


def test_build_request_with_system_prompt():
    body = build_request("a/vision", "Be brief.", "Describe.", [{"type": "image_url", "image_url": {"url": "u"}}])
    assert body == {
        "model": "a/vision",
        "messages": [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": [{"type": "text", "text": "Describe."},
                                         {"type": "image_url", "image_url": {"url": "u"}}]},
        ],
        "usage": {"include": True},
    }


def test_build_request_leaves_out_blank_system_prompt():
    assert [m["role"] for m in build_request("m", "  \n", "hi", [])["messages"]] == ["user"]


def test_check_model_passes_supported_inputs():
    check_model("a/vision", ["image"], MODELS)


def test_check_model_rejects_unsupported_input():
    with pytest.raises(RuntimeError, match="A: Vision does not accept video"):
        check_model("a/vision", ["image", "video"], MODELS)


def test_check_model_rejects_unknown_model():
    with pytest.raises(RuntimeError, match="no longer offers gone/model"):
        check_model("gone/model", [], MODELS)


def test_read_answer():
    data = {"choices": [{"message": {"content": "  A red square.\n"}}], "usage": {"cost": 0.0004}}
    assert read_answer(data) == ("A red square.", 0.0004)


def test_read_answer_without_cost():
    assert read_answer({"choices": [{"message": {"content": "ok"}}]}) == ("ok", None)


@pytest.mark.parametrize("data", [{"choices": [{"message": {"content": "  "}}]},
                                  {"choices": [{"message": {"content": None}}]},
                                  {"choices": []}, {}])
def test_read_answer_rejects_empty(data):
    with pytest.raises(RuntimeError, match="no text"):
        read_answer(data)


def test_cost_text():
    assert cost_text(0.000412) == "Cost: $0.000412"
    assert cost_text(3.5046e-05) == "Cost: $0.000035"
    assert cost_text(0.0123456) == "Cost: $0.012346"
    assert cost_text(0) == "Cost: $0"
    assert cost_text(None) == "Done"


import asyncio

import aiohttp
from aiohttp import web

from retodded import openrouter


def serve(app):
    """Starts app on a free local port; returns (base_url, runner)."""
    async def start():
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        return f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}", runner
    return start()


def fake_openrouter(chat_status=200, chat_body=None):
    seen = {"list_calls": 0}

    async def models(request):
        seen["list_calls"] += 1
        return web.json_response({"data": [RAW]})

    async def completions(request):
        seen["body"] = await request.json()
        seen["auth"] = request.headers["Authorization"]
        return web.json_response(chat_body or {"choices": [{"message": {"content": "hi"}}]}, status=chat_status)

    app = web.Application()
    app.router.add_get("/models", models)
    app.router.add_post("/chat/completions", completions)
    return app, seen


def test_load_models_caches_until_refresh(monkeypatch):
    app, seen = fake_openrouter()

    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        monkeypatch.setattr(openrouter, "_models", None)
        try:
            first = await openrouter.load_models()
            await openrouter.load_models()
            await openrouter.load_models(refresh=True)
            return first
        finally:
            await runner.cleanup()

    assert [m["id"] for m in asyncio.run(go())] == ["a/vision"]
    assert seen["list_calls"] == 2


def test_chat_sends_key_and_body(monkeypatch):
    app, seen = fake_openrouter()

    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        try:
            async with aiohttp.ClientSession() as session:
                return await openrouter.chat(session, "k", {"model": "a/vision"})
        finally:
            await runner.cleanup()

    assert asyncio.run(go()) == {"choices": [{"message": {"content": "hi"}}]}
    assert seen["auth"] == "Bearer k"
    assert seen["body"] == {"model": "a/vision"}


@pytest.mark.parametrize("status,body,message", [
    (402, {"error": {"code": 402, "message": "Insufficient credits"}}, "OpenRouter error 402: Insufficient credits"),
    (200, {"error": {"code": 502, "message": "Provider down"}}, "OpenRouter error 502: Provider down"),
    (500, {"oops": 1}, "OpenRouter error 500"),
])
def test_chat_raises_openrouter_errors(monkeypatch, status, body, message):
    app, _ = fake_openrouter(status, body)

    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        try:
            async with aiohttp.ClientSession() as session:
                await openrouter.chat(session, "k", {})
        finally:
            await runner.cleanup()

    with pytest.raises(RuntimeError, match=message):
        asyncio.run(go())


def test_models_route_serves_list_and_reports_failure(monkeypatch):
    routes = web.RouteTableDef()
    openrouter.add_routes(routes)
    ours = web.Application()
    ours.add_routes(routes)

    async def go():
        upstream, seen = fake_openrouter()
        up_url, up_runner = await serve(upstream)
        our_url, our_runner = await serve(ours)
        monkeypatch.setattr(openrouter, "_models", None)
        try:
            async with aiohttp.ClientSession() as session:
                monkeypatch.setattr(openrouter, "API", up_url)
                async with session.get(f"{our_url}/retodded/openrouter/models") as r:
                    ok = (r.status, await r.json())
                monkeypatch.setattr(openrouter, "API", "http://127.0.0.1:9")
                async with session.get(f"{our_url}/retodded/openrouter/models?refresh=1") as r:
                    bad = (r.status, await r.json())
            return ok, bad
        finally:
            await our_runner.cleanup()
            await up_runner.cleanup()

    (ok_status, ok_body), (bad_status, bad_body) = asyncio.run(go())
    assert ok_status == 200 and ok_body[0]["id"] == "a/vision"
    assert bad_status == 502 and bad_body["error"]


from retodded.openrouter import OpenRouter


def run_node(**kwargs):
    args = {"system_prompt": "", "prompt": "Describe.", "model": "a/vision"} | kwargs
    return asyncio.run(OpenRouter.execute(**args))


def test_schema():
    schema = OpenRouter.define_schema()
    assert schema.node_id == "MyCustom_OpenRouter"
    assert schema.category == "ReTodded"
    assert [i.id for i in schema.inputs] == ["image1", "image2", "image3", "audio", "video",
                                             "system_prompt", "prompt", "model"]
    assert [i.optional for i in schema.inputs[:5]] == [True] * 5
    assert OpenRouter in openrouter.NODES


def test_execute_without_key_fails_first(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API", raising=False)
    with pytest.raises(RuntimeError, match="OPENROUTER_API"):
        run_node()


def test_execute_without_model_fails_before_any_request(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API", "k")
    with pytest.raises(RuntimeError, match="Pick a model"):
        run_node(model="")


def test_execute_checks_inputs_before_paying(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API", "k")
    monkeypatch.setattr(openrouter, "_models", MODELS)
    monkeypatch.setattr(openrouter, "API", "http://127.0.0.1:9")  # any chat call would fail differently
    with pytest.raises(RuntimeError, match="does not accept audio"):
        run_node(audio={"waveform": torch.zeros(1, 1, 100), "sample_rate": 100})


from io import BytesIO

from PIL import Image


def sent_size(image):
    url = media_parts([image], None, None)[0]["image_url"]["url"]
    return Image.open(BytesIO(base64.b64decode(url.split(",", 1)[1]))).size


def test_pictures_over_2_megapixels_are_reduced_to_2():
    width, height = sent_size(torch.rand(1, 1536, 2048, 3))  # about 3.1 MP
    assert width * height <= 2 * 1024 * 1024
    assert abs(width / height - 2048 / 1536) < 0.01


def test_pictures_under_2_megapixels_are_sent_unchanged():
    assert sent_size(torch.rand(1, 1000, 1000, 3)) == (1000, 1000)


import time
from types import SimpleNamespace

import comfy.model_management


class FakeServer:
    def __init__(self):
        self.texts = []

    def send_progress_text(self, text, node_id):
        self.texts.append(text)


@pytest.fixture
def node_env(monkeypatch):
    """Lets execute() reach the chat call: a key, a status channel and a node id."""
    monkeypatch.setenv("OPENROUTER_API", "k")
    server = FakeServer()
    monkeypatch.setattr(openrouter, "PromptServer", SimpleNamespace(instance=server))
    monkeypatch.setattr(OpenRouter, "hidden", SimpleNamespace(unique_id="7"), raising=False)
    monkeypatch.setattr(openrouter, "_models", MODELS)
    return server


def run_against_app(app, monkeypatch, **kwargs):
    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        try:
            return await OpenRouter.execute(**({"system_prompt": "", "prompt": "Describe.", "model": "a/vision"} | kwargs))
        finally:
            await runner.cleanup()
    return asyncio.run(go())


def test_execute_returns_answer_and_shows_cost(monkeypatch, node_env):
    app, seen = fake_openrouter(chat_body={"choices": [{"message": {"content": "A cat."}}], "usage": {"cost": 0.00002}})
    out = run_against_app(app, monkeypatch, image1=torch.zeros(1, 8, 8, 3))
    assert out.result == ("A cat.",)
    assert node_env.texts == ["OpenRouter: waiting for a/vision…", "Cost: $0.00002"]
    assert [p["type"] for p in seen["body"]["messages"][-1]["content"]] == ["text", "image_url"]


def test_execute_still_sends_when_model_list_cannot_load(monkeypatch, node_env):
    app, seen = fake_openrouter()
    monkeypatch.setattr(openrouter, "_models", None)

    async def broken(refresh=False):
        raise aiohttp.ClientConnectionError("offline")

    monkeypatch.setattr(openrouter, "load_models", broken)
    assert run_against_app(app, monkeypatch).result == ("hi",)
    assert seen["body"]["model"] == "a/vision"


def test_cancel_stops_a_running_request(monkeypatch, node_env):
    async def slow(request):
        await asyncio.sleep(5)
        return web.json_response({"choices": [{"message": {"content": "late"}}]})

    app = web.Application()
    app.router.add_post("/chat/completions", slow)

    async def press_cancel():
        await asyncio.sleep(0.5)
        comfy.model_management.interrupt_current_processing(True)

    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        cancel = asyncio.ensure_future(press_cancel())
        start = time.monotonic()
        try:
            await OpenRouter.execute(system_prompt="", prompt="x", model="a/vision")
        except comfy.model_management.InterruptProcessingException:
            return time.monotonic() - start  # timed before the fake server's shutdown, which waits for its handler
        finally:
            await cancel
            await runner.cleanup()

    try:
        waited = asyncio.run(go())
    finally:
        comfy.model_management.interrupt_current_processing(False)
    assert waited is not None and waited < 3


@pytest.mark.parametrize("status,text,message", [
    (502, "<html>Bad gateway</html>", "OpenRouter error 502: <html>Bad gateway</html>"),
    (200, "", "OpenRouter error 200: no details"),
    (400, '{"error": "boom"}', "OpenRouter error 400: boom"),
])
def test_chat_explains_answers_that_are_not_json(monkeypatch, status, text, message):
    async def answer(request):
        return web.Response(status=status, text=text)

    app = web.Application()
    app.router.add_post("/chat/completions", answer)

    async def go():
        url, runner = await serve(app)
        monkeypatch.setattr(openrouter, "API", url)
        try:
            async with aiohttp.ClientSession() as session:
                await openrouter.chat(session, "k", {})
        finally:
            await runner.cleanup()

    with pytest.raises(RuntimeError, match=f"^{message}$"):
        asyncio.run(go())


def test_trim_models_survives_null_pricing_and_missing_architecture():
    no_price = {**RAW, "pricing": None}
    no_arch = {"id": "x/odd", "name": "Odd"}
    models = trim_models([no_price, no_arch])
    assert [m["id"] for m in models] == ["a/vision"]
    assert models[0]["prompt_price"] is None


@pytest.mark.parametrize("rate,channels", [(96000, 2), (44100, 6)])
def test_audio_the_mp3_encoder_cannot_take_is_converted(rate, channels):
    audio = {"waveform": torch.rand(1, channels, rate // 2) * 0.2, "sample_rate": rate}
    part = media_parts([], audio, None)[0]
    assert len(base64.b64decode(part["input_audio"]["data"])) > 0
