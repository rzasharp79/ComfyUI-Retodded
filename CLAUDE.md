# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this folder is

`ComfyUI-Retodded/` is a home-grown ComfyUI custom node pack: a collection of unrelated nodes (image, mask, text, utility, whatever comes up) that live in one place instead of one repo per node. It sits inside the live ComfyUI install at `D:\ComfyUI` (see that folder's `CLAUDE.md` for the venv, launcher, logs, and `AGENTS.md`), but `custom_nodes/` is gitignored there, so the ComfyUI repo does not track it. This folder is its own git repo: https://github.com/rzasharp79/ComfyUI-Retodded (branch `main`). **Every new node goes in this pack.**

## Layout

```
ComfyUI-Retodded/
├── __init__.py       # the ONLY file ComfyUI imports; lists NODE_MODULES, sets WEB_DIRECTORY
├── <topic>.py        # one module per node group; each exports NODES = [IoComfyNodeSubclass, ...]
├── web/<topic>.js    # optional frontend half of a node, same basename as its .py
└── tests/            # pytest, run from D:/ComfyUI (see Commands)
```

Adding a node: create or extend a `<topic>.py`, append the class to that module's `NODES`, and if the module is new add it to `NODE_MODULES` in `__init__.py`. Node ids are prefixed `MyCustom_`; set `category="ReTodded"` so the node shows under ReTodded in the node library. The `MyCustom_` prefix comes from the pack's old folder (`custom_nodes/mycustom`, then `comfyui-retodded`, then `comfyui-jezebel`, moved here 2026-09-26) and stays as it is, because saved workflows store the node id; the same goes for the frontend extension names (`mycustom.*`) and keybinding command ids (`MyCustom.NodeHotkeys.Go*`).

## The one architectural fact that matters

ComfyUI's loader (`init_external_custom_nodes` in `D:\ComfyUI\nodes.py`) does a flat `os.listdir` of `custom_nodes/` and imports each entry once: a `.py` file as a module, a directory via its `__init__.py`. **It never recurses.** So `ComfyUI-Retodded/` is exactly one pack no matter how many subfolders it has. Every node file in here must be aggregated by `ComfyUI-Retodded/__init__.py`, or it does not exist as far as ComfyUI is concerned. A subfolder with its own `__init__.py` and mappings is still invisible unless the top-level `__init__.py` imports it. If something truly needs to be its own pack (own dependencies, published separately), it goes in a sibling folder under `custom_nodes/`, not in here.

Other loader behavior worth knowing:

- Registration is one of two shapes, checked in this order: a module-level `NODE_CLASS_MAPPINGS` dict (V1 style, with optional `NODE_DISPLAY_NAME_MAPPINGS`), or an `async def comfy_entrypoint()` returning a `ComfyExtension` whose `get_node_list()` returns V3 `io.ComfyNode` classes. If `__init__.py` has both, only `NODE_CLASS_MAPPINGS` is used. Mixing V1 and V3 nodes in one pack is fine, but V3 nodes then have to be exported via `NODE_CLASS_MAPPINGS` too (their key is `schema.node_id`).
- The mapping key (or `node_id`) is the `class_type` written into every saved workflow JSON. Renaming it breaks users' workflows. Keys are global across all ~70 installed packs; prefix them (for example `MyCustom_`) to avoid collisions, because a duplicate key silently overwrites whichever pack loaded first (alphabetical).
- `WEB_DIRECTORY = "./web"` in `__init__.py` makes every `.js` in that folder a frontend extension, served at `/extensions/ComfyUI-Retodded/`. Alternatively `[tool.comfy] web = "web"` in `pyproject.toml` does the same.
- Every file in `web/` must end in `.js`, shared helpers included (`web/<topic>_core.js`). ComfyUI's `middleware/cache_middleware.py` sends `Cache-Control: no-store` for `.js` only; a `.mjs` helper gets no cache header, so the browser keeps it for hours. After an update the fresh `<topic>.js` then imports a stale helper, fails with `does not provide an export named ...`, the extension never registers and the node renders empty. `tests/web_files.test.mjs` guards this. The frontend also auto-imports each helper as an extension, which is harmless because they only export.
- An import error anywhere in the pack kills the whole pack, not one node. The server keeps running and prints `(IMPORT FAILED)` next to `ComfyUI-Retodded` in the "Import times for custom nodes" table in `D:\ComfyUI\user\comfyui.log`. Check that table after every restart.
- The frontend runs with `Comfy.VueNodes.Enabled = true` on this machine (check `curl -s http://127.0.0.1:8188/settings`). In that mode nodes are DOM, not canvas-drawn, so `onDrawForeground` and other canvas-draw hooks never run. Node-level UI that must work here uses a DOM widget (`node.addDOMWidget(...)` in `onNodeCreated`; set `widget.serialize = false` on the returned widget, because the `serialize: false` option is ignored by frontend 1.52 and the widget would otherwise write an empty string into `widgets_values`) and, for anything that has to track position or size, a `requestAnimationFrame` loop reading `node.pos` / `node.size`. The v2 `@comfyorg/extension-api` cannot read position or size yet, so `web/*.js` files use the legacy `import { app } from "../../scripts/app.js"` + `app.registerExtension({ beforeRegisterNodeDef })` API, same as every other installed pack.
- Renaming the folder to `ComfyUI-Retodded.disabled` skips it. Nothing is hot-reloaded: any Python change needs a server restart. Frontend `.js` changes only need a browser refresh.

## Node styles

Prefer the V3 API for new nodes; it is what upstream's own template (`D:\ComfyUI\custom_nodes\example_node.py.example`) and most of `D:\ComfyUI\comfy_extras\nodes_*.py` use now. A V3 node is a subclass of `io.ComfyNode` from `comfy_api.latest` with:

- `define_schema()` classmethod returning `io.Schema(node_id=, display_name=, category=, inputs=[...], outputs=[...], hidden=[...], description=, is_output_node=, is_input_list=, is_experimental=, ...)`.
- `execute()` classmethod returning `io.NodeOutput(*values, ui=...)`; the positional values must match `outputs` in order.
- Optional `validate_inputs`, `fingerprint_inputs` (V1 `IS_CHANGED`), `check_lazy_status`.
- Inputs are `io.<Type>.Input("name", ...)` and outputs `io.<Type>.Output()`. Common types: `Image`, `Mask`, `Latent`, `Model`, `Clip`, `Vae`, `Conditioning`, `Int`, `Float`, `String`, `Boolean`, `Combo`, `Audio`, `Video`, `AnyType`. `io.Autogrow` is the upstream-preferred way to take a variable number of inputs. Hidden inputs come from `io.Hidden.unique_id`, `.prompt`, `.extra_pnginfo`.
- UI previews for output nodes: `ui.PreviewImage`, `ui.PreviewMask`, `ui.PreviewText`, `ui.ImageSaveHelper`, etc. from `comfy_api.latest.ui`.

V1 nodes (`INPUT_TYPES` classmethod, `RETURN_TYPES` tuple, `FUNCTION`, `CATEGORY`, method returns a tuple) still load and are fine when copying from an existing pack. The two gotchas: `RETURN_TYPES = ("IMAGE",)` needs the trailing comma, and the function must `return (x,)` even for one output.

Data conventions are ComfyUI-wide: `IMAGE` is a `torch.Tensor` of shape `[B, H, W, C]` float 0..1 on whatever device ComfyUI chose, `MASK` is `[B, H, W]`, `LATENT` is a dict with a `samples` tensor. Any combo or string value that becomes a path must go through `folder_paths` (`get_annotated_filepath`, `get_full_path_or_raise`, `get_output_directory`), never joined by hand. AGENTS.md's "Nodes and User-Facing Behavior" section applies here too: nodes expose only inputs they read and output only values they own; no pass-through outputs; do not patch model internals from a node.

Custom HTTP routes are registered at import time with `@PromptServer.instance.routes.get("/mycustom/...")` (from `server import PromptServer`). That decorator only works while the server is up, so any file that registers routes will fail the standalone loader check below; keep routes in their own module and import it defensively, or accept that the standalone check needs the server.

## Commands

All Python runs through the venv: `D:/ComfyUI/venv/Scripts/python.exe`. The `python` on PATH has no torch.

```bash
# Load ONLY this pack through the real loader (no server, ~8 s). Prints "(IMPORT FAILED)"-equivalent
# tracebacks immediately instead of after a 50 s server boot. Run from D:/ComfyUI.
cd /d/ComfyUI && D:/ComfyUI/venv/Scripts/python.exe -c "
import asyncio, logging, nodes
logging.basicConfig(level=logging.INFO)
ok = asyncio.run(nodes.load_custom_node('D:/ComfyUI/custom_nodes/ComfyUI-Retodded'))
print('LOADED:', ok, sorted(k for k, v in nodes.NODE_CLASS_MAPPINGS.items() if getattr(v, 'RELATIVE_PYTHON_MODULE', '').endswith('ComfyUI-Retodded')))"

# Start the server with ONLY this pack (skips the 50 s import of the other packs)
cmd //c 'D:\ComfyUI\run_comfy.bat' --disable-auto-launch --disable-all-custom-nodes --whitelist-custom-nodes ComfyUI-Retodded

# Normal full start / stop
cmd //c 'D:\ComfyUI\run_comfy.bat' --disable-auto-launch
D:/ComfyUI/kill_comfy.bat /nopause

# Did it load? (table is printed once at startup)
grep -A80 "Import times for custom nodes" D:/ComfyUI/user/comfyui.log | grep -i "retodded\|IMPORT FAILED"

# Confirm a node is registered on the running server
curl -s http://127.0.0.1:8188/object_info/MyCustom_SomeNode

# Lint with the same ruleset ComfyUI uses
cd /d/ComfyUI && ruff check custom_nodes/ComfyUI-Retodded

# Tests: put them in ComfyUI-Retodded/tests/. The folder name has a hyphen, so it cannot be imported by name:
# tests/pytest.ini makes tests/ the pytest rootdir (so pytest never imports the pack folder as a package) and
# puts D:/ComfyUI on sys.path; tests/conftest.py loads the pack as `retodded`. Tests do `from retodded import rotater`.
# JS tests: cd into the pack and run `node --test tests/*.test.mjs`.
cd /d/ComfyUI && D:/ComfyUI/venv/Scripts/python.exe -m pytest custom_nodes/ComfyUI-Retodded/tests -q
cd /d/ComfyUI && D:/ComfyUI/venv/Scripts/python.exe -m pytest custom_nodes/ComfyUI-Retodded/tests/test_x.py::test_name -q
```

`pytest-aiohttp` and `websocket-client` are not in the venv; install `D:\ComfyUI\tests-unit\requirements.txt` first if a test needs them. `ruff` is on PATH but not in the venv. For end-to-end checks, the `comfyui-dev-commands` project skill has the full ComfyUI test commands and the `plugin:comfy:comfyui` MCP tools can build, validate, and enqueue a workflow against the running server.

## Publishing (only if a node graduates out of here)

Publishing to the Comfy Registry needs a `pyproject.toml` with `[project] name` (immutable, no "ComfyUI" prefix), `version` (semver, each value publishable once), `[project.urls] Repository`, and `[tool.comfy] PublisherId`, then `comfy node publish`. The `comfy:comfyui-node-registry` skill has the full field spec. Because publishing is per-pack and this folder is one pack, a node meant for publication should be moved to its own sibling folder first.
