import json

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from retodded import NODE_MODULES, pixaroma_clone
from retodded.pixaroma_clone import LoadImagePixClone


@pytest.fixture
def input_dir(tmp_path):
    old = folder_paths.get_input_directory()
    folder_paths.set_input_directory(str(tmp_path))
    yield tmp_path
    folder_paths.set_input_directory(old)


def rgba_png(folder, name="cat.png", size=(64, 32)):
    rgba = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    rgba[..., 0] = 200
    rgba[..., 3] = 255
    rgba[:, : size[0] // 2, 3] = 0  # left half transparent
    Image.fromarray(rgba, "RGBA").save(folder / name)
    return name


def run(image, state=None):
    state_json = "" if state is None else (state if isinstance(state, str) else json.dumps(state))
    return LoadImagePixClone.execute(image=image, LoadImagePixState=state_json).result


def test_registered():
    assert pixaroma_clone in NODE_MODULES
    schema = LoadImagePixClone.GET_SCHEMA()
    assert schema.node_id == "MyCustom_LoadImagePixClone"
    assert schema.display_name == "Load Image Pixaroma Clone"
    assert schema.category == "ReTodded/Pixaroma"


def test_lists_images_in_subfolders(input_dir):
    (input_dir / "sub").mkdir()
    rgba_png(input_dir / "sub")
    assert "sub/cat.png" in pixaroma_clone._input_images()


def test_loads_image_and_alpha_mask(input_dir):
    image, mask, w, h, filename, ow, oh = run(rgba_png(input_dir))
    assert image.shape == (1, 32, 64, 3)
    assert mask.shape == (1, 32, 64)
    assert (w, h, ow, oh) == (64, 32, 64, 32)
    assert filename == "cat"
    assert mask[0, :, :32].min() == 1 and mask[0, :, 32:].max() == 0
    assert torch.allclose(image[0, 0, 0, 0].float(), torch.tensor(200 / 255), atol=1e-2)


def test_resize_longest_side(input_dir):
    image, mask, w, h, _, ow, oh = run(rgba_png(input_dir), {"mode": "longest_side", "longest_side": 32})
    assert (w, h, ow, oh) == (32, 16, 64, 32)
    assert image.shape == (1, 16, 32, 3)
    assert mask.shape == (1, 16, 32)


def test_malformed_state_uses_defaults(input_dir):
    _, _, w, h, _, _, _ = run(rgba_png(input_dir), "{not json")
    assert (w, h) == (64, 32)


def test_clipspace_reports_original_name(input_dir):
    (input_dir / "clipspace").mkdir()
    name = "clipspace/" + rgba_png(input_dir / "clipspace", "clipspace-mask-123.png")
    filename = run(name, {"orig_name": "portraits/cat.png"})[4]
    assert filename == "cat"


def test_fingerprint_changes_with_state(input_dir):
    name = rgba_png(input_dir)
    assert LoadImagePixClone.fingerprint_inputs(name, "{}") != LoadImagePixClone.fingerprint_inputs(name, '{"mode":"max_mp"}')


def test_validate_rejects_missing_file(input_dir):
    assert LoadImagePixClone.validate_inputs("nope.png") != True  # noqa: E712
    assert LoadImagePixClone.validate_inputs(rgba_png(input_dir)) is True
