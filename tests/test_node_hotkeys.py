from retodded import NODE_MODULES, node_hotkeys


def test_schema_identity():
    schema = node_hotkeys.NodeHotkeys.define_schema()
    assert schema.node_id == "MyCustom_NodeHotkeys"
    assert schema.display_name == "Node Hotkeys"
    assert schema.category == "ReTodded"


def test_schema_has_no_inputs_or_outputs():
    schema = node_hotkeys.NodeHotkeys.define_schema()
    assert schema.inputs == []
    assert schema.outputs == []


def test_module_is_registered():
    assert node_hotkeys in NODE_MODULES
    assert node_hotkeys.NodeHotkeys in node_hotkeys.NODES
