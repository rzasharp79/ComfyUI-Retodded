import asyncio

import aiohttp
import pytest
import torch
from aiohttp import web

from retodded import wavespeed
from retodded.wavespeed import (WaveSpeedGPTImageEdit, build_request, collect_images, cost_text, run_prediction,
                                upload_image)


def test_schema():
    schema = WaveSpeedGPTImageEdit.define_schema()
    assert schema.node_id == "MyCustom_WaveSpeedGPTImageEdit"
    assert [i.id for i in schema.inputs] == ["prompt", "images", "aspect_ratio", "resolution", "quality", "seed"]
    assert schema.is_api_node
    assert schema.price_badge.depends_on.input_groups == ["images"]
    assert WaveSpeedGPTImageEdit in wavespeed.NODES


def test_price_table_covers_every_quality_and_resolution():
    schema = WaveSpeedGPTImageEdit.define_schema()
    options = {i.id: i.options for i in schema.inputs if i.id in ("quality", "resolution")}
    assert sorted(wavespeed.PRICES) == sorted(options["quality"])
    assert all(sorted(row) == sorted(options["resolution"]) for row in wavespeed.PRICES.values())


def test_collect_images_keeps_slot_order_and_splits_batches():
    one = torch.full((1, 8, 8, 3), 0.1)
    two = torch.stack([torch.full((8, 8, 3), 0.2), torch.full((8, 8, 3), 0.3)])
    images = collect_images({"image_2": two, "image_1": one})
    assert [round(float(i.mean()), 1) for i in images] == [0.1, 0.2, 0.3]
    assert images[0].shape == (8, 8, 3)


def test_collect_images_skips_empty_slots():
    assert len(collect_images({"image_1": torch.zeros(1, 8, 8, 3), "image_2": None})) == 1


def test_collect_images_rejects_more_than_16():
    with pytest.raises(ValueError, match="16"):
        collect_images({"image_1": torch.zeros(17, 8, 8, 3)})


def test_collect_images_rejects_none():
    with pytest.raises(ValueError, match="at least one"):
        collect_images({})


def test_build_request_auto_aspect_ratio_is_left_out():
    body = build_request("make it blue", ["data:a"], "auto", "2k", "high")
    assert body == {"prompt": "make it blue", "images": ["data:a"], "resolution": "2k", "quality": "high",
                    "output_format": "png"}


def test_build_request_sends_chosen_aspect_ratio():
    assert build_request("x", ["data:a"], "16:9", "1k", "low")["aspect_ratio"] == "16:9"


def test_cost_text():
    assert cost_text(0.054, 12.3) == "Cost: $0.054 · Balance left: $12.30"


def test_cost_text_without_balance():
    assert cost_text(0.039, None) == "Cost: $0.039 · Balance left: unavailable"


def test_execute_without_token_fails_before_any_request(monkeypatch):
    monkeypatch.delenv("WAVESPEED_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="WAVESPEED_API_TOKEN"):
        asyncio.run(WaveSpeedGPTImageEdit.execute(
            prompt="x", images={"image_1": torch.zeros(1, 8, 8, 3)},
            aspect_ratio="auto", resolution="1k", quality="low", seed=0))


def fake_wavespeed(result_bodies, submit_status=200):
    """Local stand-in for the WaveSpeed API. Each poll returns the next body in result_bodies."""
    seen = {"submitted": None, "auth": None, "polls": 0}

    async def submit(request):
        seen["submitted"] = await request.json()
        seen["auth"] = request.headers["Authorization"]
        if submit_status != 200:
            return web.json_response({"code": submit_status, "message": "Unauthorized"}, status=submit_status)
        return web.json_response({"code": 200, "data": {"id": "abc", "status": "created"}})

    async def result(request):
        assert request.match_info["id"] == "abc"
        body = result_bodies[min(seen["polls"], len(result_bodies) - 1)]
        seen["polls"] += 1
        return web.json_response({"code": 200, "data": body})

    app = web.Application()
    app.router.add_post("/" + wavespeed.MODEL_ID, submit)
    app.router.add_get("/predictions/{id}/result", result)
    return app, seen


async def run_against(app, **kwargs):
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    statuses = []
    try:
        async with aiohttp.ClientSession() as session:
            return await run_prediction(session, f"http://127.0.0.1:{port}", "tok", {"prompt": "x"},
                                        statuses.append, **kwargs), statuses
    finally:
        await runner.cleanup()


def test_upload_image_puts_png_straight_to_storage():
    """Pictures go through WaveSpeed's upload ticket, because its API gateway stalls on big request bodies."""
    seen = {}

    async def ticket(request):
        seen["ticket"] = await request.json()
        seen["ticket_auth"] = request.headers["Authorization"]
        storage = f"http://{request.host}/storage/abc.png"
        return web.json_response({"code": 200, "data": {
            "download_url": "https://cdn/abc.png",
            "upload": {"method": "PUT", "url": storage, "headers": {"Content-Type": "image/png"}}}})

    async def storage(request):
        seen["stored"] = await request.read()
        seen["storage_headers"] = dict(request.headers)
        return web.Response()

    app = web.Application()
    app.router.add_post("/media/uploads", ticket)
    app.router.add_put("/storage/abc.png", storage)

    async def go():
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            async with aiohttp.ClientSession() as session:
                return await upload_image(session, f"http://127.0.0.1:{port}", "tok", torch.full((8, 8, 3), 0.5))
        finally:
            await runner.cleanup()

    assert asyncio.run(go()) == "https://cdn/abc.png"
    assert seen["stored"].startswith(b"\x89PNG")
    assert seen["ticket"]["size"] == len(seen["stored"])
    assert seen["ticket"]["content_type"] == "image/png"
    assert seen["ticket_auth"] == "Bearer tok"
    assert "Authorization" not in seen["storage_headers"]
    assert seen["storage_headers"]["Content-Type"] == "image/png"


@pytest.fixture(autouse=True)
def fast_polling(monkeypatch):
    monkeypatch.setattr(wavespeed, "POLL_SECONDS", 0.01)


def test_run_prediction_polls_until_completed():
    app, seen = fake_wavespeed([{"status": "processing"}, {"status": "completed", "outputs": ["https://cdn/x.png"]}])
    outputs, statuses = asyncio.run(run_against(app))
    assert outputs == ["https://cdn/x.png"]
    assert seen["submitted"] == {"prompt": "x"}
    assert seen["auth"] == "Bearer tok"
    assert seen["polls"] == 2
    assert statuses and statuses[0].startswith("WaveSpeed: processing")


def test_run_prediction_failed_status_raises_wavespeed_message():
    app, _ = fake_wavespeed([{"status": "failed", "error": "content policy violation"}])
    with pytest.raises(RuntimeError, match="content policy violation"):
        asyncio.run(run_against(app))


def test_run_prediction_http_error_raises_wavespeed_message():
    app, _ = fake_wavespeed([], submit_status=401)
    with pytest.raises(RuntimeError, match="401.*Unauthorized"):
        asyncio.run(run_against(app))


def test_run_prediction_gives_up_after_timeout(monkeypatch):
    monkeypatch.setattr(wavespeed, "TIMEOUT_SECONDS", 0.05)
    app, _ = fake_wavespeed([{"status": "processing"}])
    with pytest.raises(TimeoutError):
        asyncio.run(run_against(app))
