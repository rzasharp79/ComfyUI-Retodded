import re

import pytest

from retodded import NODE_MODULES, age_recipe
from retodded.age_recipe import AgeRecipe, parse_ages, recipe

DEFAULTS = {"sun_damage": "average", "smoker": False, "strength": "natural", "gray_hair": True}


def run(ages, **overrides):
    return AgeRecipe.execute(ages=ages, **(DEFAULTS | overrides)).result


def texture(age, sun="average", smoker=False, strength="natural"):
    return recipe(age, sun, smoker, strength, True)[1]


def test_registered():
    assert age_recipe in NODE_MODULES
    assert AgeRecipe in age_recipe.NODES


def test_three_ages():
    prompts, labels, amounts, columns, summary = run("40, 50,60")
    assert len(prompts) == 3
    assert labels == ["Age 40", "Age 50", "Age 60"]
    assert len(amounts) == 3
    assert columns == 4
    assert "Age 40:" in summary and "Age 60:" in summary


def test_single_age():
    prompts, labels, amounts, columns, _ = run("65")
    assert labels == ["Age 65"] and len(prompts) == 1 and len(amounts) == 1
    assert columns == 2


def test_duplicates_dropped_order_kept():
    assert parse_ages("60, 40, 60") == [60, 40]


@pytest.mark.parametrize("text", ["40 50 60", "40,50,60,", "40; 50;60", " 40 ,50 , 60 "])
def test_separators(text):
    assert parse_ages(text) == [40, 50, 60]


@pytest.mark.parametrize("text", ["", "   ", "abc", "19", "101", "45.5", "40, fifty",
                                  ", ".join(str(a) for a in range(30, 85, 5))])
def test_bad_ages_raise(text):
    with pytest.raises(ValueError):
        parse_ages(text)


def test_texture_rises_with_age():
    values = [texture(a) for a in (30, 40, 50, 60, 70, 80)]
    assert values == sorted(values) and len(set(values)) == len(values)


def test_sun_and_strength_change_texture():
    assert texture(50, sun="heavy") > texture(50) > texture(50, sun="low")
    assert texture(50, strength="strong") > texture(50) > texture(50, strength="subtle")


def test_prompt_has_age_and_keep_clause():
    for prompt in run("40, 55, 80")[0]:
        assert re.match(r"Age this person to look \d+ years old\.", prompt)
        assert "skin tone and ethnicity" in prompt
        assert "Do not add anything that is not in the photo." in prompt
        assert "glasses, jewelry" in prompt


def test_word_scale():
    young, old = run("40, 80")[0]
    assert "faint crow's feet" in young and "deep crow's feet" not in young
    assert "very deep crow's feet" in old
    assert "crepey" not in young + old and "wrinkled skin texture" not in young + old


def test_gray_hair_off():
    for prompt in run("40, 60, 80, 95", gray_hair=False)[0]:
        assert "gray" not in prompt.lower() and "white hair" not in prompt.lower()
        assert "natural hair color" in prompt


def test_gray_hair_on_75():
    (prompt,) = run("75")[0]
    assert "White hair along its full length, graying eyebrows." in prompt


def test_smoker_adds_upper_lip_lines():
    assert "upper lip" not in recipe(42, "average", False, "natural", True)[0]
    assert "upper lip" in recipe(42, "average", True, "natural", True)[0]


def test_youngest_age_is_clean():
    (prompt,) = run("20")[0]
    assert ".." not in prompt and ". ." not in prompt and ",." not in prompt
    assert prompt.startswith("Age this person to look 20 years old. Keep the same person")


def test_no_body_parts_outside_face_and_neck():
    body = re.compile(r"\b(hands?|arms?|chest|shoulders?|legs?|body)\b", re.IGNORECASE)
    for sun in ("low", "average", "heavy"):
        for smoker in (False, True):
            for strength in ("subtle", "natural", "strong"):
                for age in range(20, 101, 5):
                    assert not body.search(recipe(age, sun, smoker, strength, True)[0])
