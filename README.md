# ComfyUI-Retodded

A collection of home-grown ComfyUI nodes. Every node shows up under **ReTodded** in the node library, except the ReActor face swap copy, which is under **😣 ReTodded > Reactor**.

## Install

Clone this repo into `ComfyUI/custom_nodes` and restart ComfyUI:

```
cd ComfyUI/custom_nodes
git clone https://github.com/rzasharp79/ComfyUI-Retodded.git
```

The ReActor nodes need extra packages: `insightface`, `onnxruntime` (or `onnxruntime-gpu`) and the ones in `reactor/requirements.txt`. Install them with ComfyUI's own Python. Every other node uses only what ships with ComfyUI.

## Nodes

In the node library every node is under **ReTodded**, in one folder per section below (ReActor is under **😣 ReTodded > Reactor**).

### Canvas tools (ReTodded > Canvas)

These nodes help you work on the canvas. They have no inputs or outputs and never run as part of a workflow.

| Node | What it does |
|------|--------------|
| **Node Hotkeys** | Lists every node in the graph in a table (id, x, y, hotkey, zoom). Give a node a digit hotkey (0-9) and a zoom (0.5-2.0); pressing that digit pans the canvas to the node. Columns can be resized and sorted, and the offset from the top-left corner where the node lands is adjustable (default 90, 90). Click **Refresh** after adding or removing nodes. |
| **Canvas Info** | Shows the node's own x/y position and width/height on the canvas, updated live as you move or resize it. |

### Image loading (ReTodded > Pixaroma)

| Node | What it does |
|------|--------------|
| **Load Image Pixaroma Clone** | A frozen copy of [ComfyUI-Pixaroma](https://github.com/pixaroma/ComfyUI-Pixaroma)'s Load Image Pixaroma (MIT, licence in `web/pixaroma_clone/LICENSE-Pixaroma`), so Pixaroma updates never change it. Same panel and outputs: upload, drag-drop or paste an image (subfolders of `input/` included), alpha to mask, and an inline resize (max megapixels, longest side, scale by, fit inside, crop to fill, match ratio, pad, snap, resample, upscale guard). Outputs image, mask, width, height, filename, original width and original height. Works with or without the Pixaroma pack installed; the two never share styles, settings or code. |

### Workflow helpers (ReTodded > Workflow)

| Node | What it does |
|------|--------------|
| **Rotater** | Type a list of values separated by a delimiter, for example `man;woman;dog`. Pressing Run queues one run per item: the first run outputs `man`, the next `woman`, the last `dog`. The **type** setting picks what the output carries: string, int, float, or combo (plugs into a dropdown; items must match the dropdown's option names exactly). Type `\n` as the delimiter for one item per line. |

### API (ReTodded > API)

| Node | What it does |
|------|--------------|
| **WaveSpeed GPT Image 2.5 Edit** | Edits up to 16 pictures with OpenAI GPT Image 2.5 Sunburst through [WaveSpeed](https://wavespeed.ai). Refer to pictures by order in the prompt, e.g. "the jacket from image 2". Choose aspect ratio, resolution and quality; the node shows the cost of each run. Needs your own WaveSpeed key in the `WAVESPEED_API_TOKEN` environment variable, and runs are billed to that account. |
| **OpenRouter** | Sends up to three pictures, one audio clip and one video plus a system prompt and prompt to any [OpenRouter](https://openrouter.ai) model and outputs its text answer, for example to caption pictures, transcribe audio or summarize videos. Pick the model on the node: tabs for TEXT2TEXT, IMAGE2TEXT, AUDIO2TEXT and VIDEO2TEXT, search, sort by name, cost, release date or context, and ★ favorites that stay on top. Only the first picture of each image batch is sent, shrunk to 2 megapixels if it is bigger. The node shows the cost of each run. Needs your own OpenRouter key in the `OPENROUTER_API` environment variable, and runs are billed to that account. |

### Face swap (😣 ReTodded > Reactor)

A frozen local copy of [ComfyUI-ReActor](https://github.com/Gourieff/ComfyUI-ReActor) v0.7.0-a2 in `reactor/` (GPL-3.0, licence in `reactor/LICENSE`), so ReActor updates never change it. It behaves exactly like the original: same inputs, same models (`models/insightface`, `models/facerestore_models`, `models/reactor`), same SFW filter, and the same output pixels. Only the node ids (`MyCustom_` prefix) and the category are different, so it cannot clash with the original pack if that is ever installed again.

| Node | What it does |
|------|--------------|
| **ReActor 🌌 Fast Face Swap** | Swaps the face from a source picture or a saved face model onto the faces in the input picture, with optional face restore. |
| **ReActor 🌌 Fast Face Swap [OPTIONS]** | The same swap, with face indexes, gender detection and logging set by an Options node. |
| **ReActor 🌌 Options** | Settings for the [OPTIONS] swap. |
| **ReActor 🌌 Face Booster** | Restores the swapped face at a higher resolution before it is pasted back. |
| **ReActor 🌌 Masking Helper** | Limits the swap to a detected face area (SAM and bbox models) for cleaner edges. |
| **ReActor 🌌 Set Face Swap Weight** | Blends a face model with the original face by a weight. |
| **Save / Load Face Model 🌌 ReActor** | Save a face model to `models/reactor/faces` and load it back. |
| **Build Blended Face Model / Make Face Model Batch 🌌 ReActor** | Blend several pictures or face models into one face model. |
| **Restore Face / Restore Face Advanced 🌌 ReActor** | Face restore (GFPGAN, CodeFormer, GPEN) on its own, without a swap. |
| **Face Similarity 🌌 ReActor** | Scores how alike the faces in two pictures are. |
| **Image Dublicator (List) 🌌 ReActor** | Repeats a picture into a list. |
| **Convert RGBA to RGB 🌌 ReActor** | Drops the alpha channel. |
| **Unload ReActor Models 🌌 ReActor** | Frees the ReActor models from memory. |

## Restart button

The left sidebar gets a **Restart** button (circular arrow) just above Help. It asks first, and warns when jobs are running or queued, because a restart stops the running job and clears the queue. The open page reconnects on its own once the server is back; no new browser tab opens.

By default the server restarts itself in place, the way ComfyUI-Manager's restart does. On Windows that makes a `.bat` launcher think ComfyUI has stopped while the new server keeps running in its window. To avoid that, have the launcher set `RETODDED_RESTART_IN_LAUNCHER=1` and start ComfyUI again when it exits with code 42:

```bat
set RETODDED_RESTART_IN_LAUNCHER=1
set "RESTART_ARGS="
:run
python main.py %* %RESTART_ARGS%
if %errorlevel%==42 (
    set "RESTART_ARGS=--disable-auto-launch"
    goto run
)
```

## Note on node ids

Node ids start with `MyCustom_` (for example `MyCustom_Rotater`). That prefix comes from an earlier name of this pack and stays so that saved workflows keep working.

## Tests

From the ComfyUI folder, using ComfyUI's own Python:

```
python -m pytest custom_nodes/ComfyUI-Retodded/tests -q
```

From inside this folder, for the frontend code:

```
node --test tests/*.test.mjs
```
