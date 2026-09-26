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
    assert cost_text(None) == "Done"
