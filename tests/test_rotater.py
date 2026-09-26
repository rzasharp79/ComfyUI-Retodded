import pytest

from retodded import rotater
from retodded.rotater import Rotater, split_items


def run(type, values, delimiter=";", index=0):
    return Rotater.execute(type=type, values=values, delimiter=delimiter, index=index).result[0]


def test_schema():
    schema = Rotater.define_schema()
    assert schema.node_id == "MyCustom_Rotater"
    assert [i.id for i in schema.inputs] == ["type", "values", "delimiter", "index"]
    assert len(schema.outputs) == 1
    assert Rotater in rotater.NODES


def test_split_trims_and_drops_empty_items():
    assert split_items("man; woman ;dog;", ";") == ["man", "woman", "dog"]


def test_split_multi_character_delimiter():
    assert split_items("a cat||a dog", "||") == ["a cat", "a dog"]


def test_split_backslash_n_means_line_break():
    assert split_items("man\nwoman\n\ndog", "\\n") == ["man", "woman", "dog"]


def test_split_empty_delimiter_gives_one_item():
    assert split_items("man;woman", "") == ["man;woman"]


def test_string_picks_item_by_index():
    assert [run("string", "man;woman;dog", index=i) for i in range(3)] == ["man", "woman", "dog"]


def test_index_wraps_around():
    assert run("string", "man;woman;dog", index=4) == "woman"


def test_int_and_float_are_converted():
    assert run("int", "1; 2; 3", index=1) == 2
    assert isinstance(run("int", "1;2;3", index=1), int)
    assert run("float", "0.5;1;1.5", index=1) == 1.0
    assert isinstance(run("float", "0.5;1;1.5", index=1), float)


def test_combo_passes_text_through():
    assert run("combo", "euler;dpmpp_2m", index=1) == "dpmpp_2m"


def test_validate_accepts_good_input():
    assert Rotater.validate_inputs(type="int", values="1;2;3", delimiter=";") is True


def test_validate_rejects_empty_text():
    assert "no items" in Rotater.validate_inputs(type="string", values=" ; ", delimiter=";")


@pytest.mark.parametrize("type,values,bad", [("int", "1;two;3", "two"), ("int", "1;2.5", "2.5"), ("float", "0.5;abc", "abc")])
def test_validate_names_the_bad_item(type, values, bad):
    message = Rotater.validate_inputs(type=type, values=values, delimiter=";")
    assert isinstance(message, str) and bad in message
