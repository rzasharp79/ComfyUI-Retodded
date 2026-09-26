"""Load the pack under the importable name `retodded`.

The folder name has a hyphen, so `import custom_nodes.ComfyUI-Retodded` is not valid Python.
This mirrors how ComfyUI's own loader imports a pack folder.
"""

import importlib.util
import sys
from pathlib import Path

PACK = Path(__file__).resolve().parents[1]

spec = importlib.util.spec_from_file_location("retodded", PACK / "__init__.py", submodule_search_locations=[str(PACK)])
module = importlib.util.module_from_spec(spec)
sys.modules["retodded"] = module
spec.loader.exec_module(module)
