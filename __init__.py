"""ComfyUI-Retodded: one ComfyUI node pack holding assorted home-grown nodes.

ComfyUI loads this folder as a single pack. Every node module must be listed
in NODE_MODULES below (or merged in like reactor) or its nodes will not exist.

ComfyUI reads NODE_CLASS_MAPPINGS before comfy_entrypoint and ignores the
entrypoint when both exist, so the V3 nodes are exported here by node_id,
next to the V1 nodes of the ReActor copy in reactor/.
"""

from server import PromptServer

from . import canvas_info, node_hotkeys, openrouter, pixaroma_clone, reactor, restart, rotater, wavespeed

NODE_MODULES = [canvas_info, node_hotkeys, openrouter, pixaroma_clone, rotater, wavespeed]

WEB_DIRECTORY = "./web"

_SCHEMAS = {node: node.GET_SCHEMA() for module in NODE_MODULES for node in module.NODES}

NODE_CLASS_MAPPINGS = {schema.node_id: node for node, schema in _SCHEMAS.items()} | reactor.NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = {schema.node_id: schema.display_name for schema in _SCHEMAS.values() if schema.display_name is not None} | reactor.NODE_DISPLAY_NAME_MAPPINGS

# The standalone loader check runs without a server, so there is nothing to add routes to.
_server = getattr(PromptServer, "instance", None)
if _server is not None:
    openrouter.add_routes(_server.routes)
    restart.add_routes(_server.routes)
