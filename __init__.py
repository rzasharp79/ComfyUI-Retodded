"""ComfyUI-Retodded: one ComfyUI node pack holding assorted home-grown nodes.

ComfyUI loads this folder as a single pack. Every node module must be listed
in NODE_MODULES below or its nodes will not exist.
"""

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io
from server import PromptServer

from . import age_recipe, canvas_info, node_hotkeys, openrouter, rotater, skin_texture, wavespeed

NODE_MODULES = [age_recipe, canvas_info, node_hotkeys, openrouter, rotater, skin_texture, wavespeed]

WEB_DIRECTORY = "./web"


class RetoddedExtension(ComfyExtension):
    @override
    async def on_load(self) -> None:
        # The standalone loader check runs without a server, so there is nothing to add routes to.
        server = getattr(PromptServer, "instance", None)
        if server is not None:
            openrouter.add_routes(server.routes)

    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [node for module in NODE_MODULES for node in module.NODES]


async def comfy_entrypoint() -> RetoddedExtension:
    return RetoddedExtension()
