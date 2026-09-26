import torch

from retodded import NODE_MODULES, skin_texture
from retodded.skin_texture import SkinGrain, WaxySkinMap


def run(image, mask, **overrides):
    values = {"pore_size": 2.0, "sensitivity": 0.5, "softness": 16} | overrides
    return WaxySkinMap.execute(image=image, skin_mask=mask, **values).result


def test_registered():
    assert skin_texture in NODE_MODULES
    assert WaxySkinMap in skin_texture.NODES
    assert SkinGrain in skin_texture.NODES


def test_flat_skin_is_waxy():
    image = torch.full((1, 64, 64, 3), 0.6)
    wax, _, percent = run(image, torch.ones(1, 64, 64))
    assert wax.mean() > 0.9
    assert percent > 90


def test_textured_skin_is_not_waxy():
    noise = torch.randn(1, 64, 64, 3, generator=torch.Generator().manual_seed(0))
    image = (0.6 + 0.08 * noise).clamp(0, 1)
    wax, _, percent = run(image, torch.ones(1, 64, 64))
    assert wax.mean() < 0.1
    assert percent < 10


def test_no_skin_gives_empty_map():
    image = torch.full((1, 64, 64, 3), 0.6)
    wax, preview, percent = run(image, torch.zeros(1, 64, 64))
    assert wax.abs().max() == 0
    assert percent == 0
    assert torch.equal(preview, image)


def test_skin_outline_does_not_count_as_texture():
    image = torch.full((1, 64, 64, 3), 0.1)
    image[:, :, :32] = 0.6
    mask = torch.zeros(1, 64, 64)
    mask[:, :, :32] = 1
    wax, _, _ = run(image, mask, softness=0)
    assert wax[:, :, :32].min() > 0.9


def test_texture_in_shadow_counts_like_texture_in_light():
    noise = torch.randn(1, 64, 64, 1, generator=torch.Generator().manual_seed(0)).expand(-1, -1, -1, 3)
    for base in (0.6, 0.1):
        image = (base * (1 + 0.06 * noise)).clamp(0, 1)
        wax, _, _ = run(image, torch.ones(1, 64, 64))
        assert wax.mean() < 0.1, base


def test_map_stays_inside_skin_and_drops_faint_values():
    image = torch.full((1, 64, 64, 3), 0.6)
    mask = torch.zeros(1, 64, 64)
    mask[:, :, :32] = 1
    wax, _, _ = run(image, mask)
    assert wax[:, :, 32:].abs().max() == 0
    assert wax[wax > 0].min() >= skin_texture.MAP_FLOOR


def test_shapes_follow_the_image_batch():
    image = torch.rand(2, 48, 64, 3)
    wax, preview, _ = run(image, torch.ones(1, 48, 64))
    assert wax.shape == (2, 48, 64)
    assert preview.shape == (2, 48, 64, 3)
    assert wax.device.type == "cpu"


def test_mask_is_resized_to_the_image():
    image = torch.full((1, 48, 64, 3), 0.6)
    wax, _, _ = run(image, torch.ones(1, 24, 32))
    assert wax.shape == (1, 48, 64)
    assert wax.mean() > 0.9


def test_rgba_image_gives_rgb_preview():
    image = torch.full((1, 32, 32, 4), 0.6)
    _, preview, _ = run(image, torch.ones(1, 32, 32))
    assert preview.shape == (1, 32, 32, 3)


def test_tiny_image_at_max_blur():
    image = torch.full((1, 8, 8, 3), 0.6)
    wax, _, _ = run(image, torch.ones(1, 8, 8), pore_size=8.0, softness=128)
    assert wax.shape == (1, 8, 8)


def grain(image, mask, strength=0.05, seed=42):
    return SkinGrain.execute(image=image, mask=mask, strength=strength, seed=seed).result[0]


def test_grain_leaves_unmasked_pixels_untouched():
    image = torch.rand(1, 32, 32, 3)
    mask = torch.zeros(1, 32, 32)
    mask[:, :, :16] = 1
    out = grain(image, mask)
    assert torch.equal(out[:, :, 16:], image[:, :, 16:])
    assert not torch.equal(out[:, :, :16], image[:, :, :16])


def test_grain_is_monochrome_and_scales_with_brightness():
    image = torch.full((1, 64, 64, 3), 0.6)
    image[:, :32] = 0.15
    image[..., 1] *= 0.8
    out = grain(image, torch.ones(1, 64, 64))
    ratio = out / image
    assert torch.allclose(ratio[..., 0], ratio[..., 1]) and torch.allclose(ratio[..., 0], ratio[..., 2])
    dark, bright = (out - image)[:, :32].std(), (out - image)[:, 32:].std()
    assert 3.5 < bright / dark < 4.5


def test_grain_follows_seed_and_strength():
    image = torch.full((1, 16, 16, 3), 0.5)
    mask = torch.ones(1, 16, 16)
    assert torch.equal(grain(image, mask, seed=1), grain(image, mask, seed=1))
    assert not torch.equal(grain(image, mask, seed=1), grain(image, mask, seed=2))
    assert torch.equal(grain(image, mask, strength=0.0), image)


def test_grain_resizes_mask_and_returns_rgb():
    image = torch.full((2, 32, 48, 4), 0.5)
    out = grain(image, torch.ones(1, 16, 24))
    assert out.shape == (2, 32, 48, 3)
