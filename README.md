# ComfyUI-Retodded

A collection of home-grown ComfyUI nodes. Every node shows up under **ReTodded** in the node library.

## Install

Clone this repo into `ComfyUI/custom_nodes` and restart ComfyUI:

```
cd ComfyUI/custom_nodes
git clone https://github.com/rzasharp79/ComfyUI-Retodded.git
```

No extra packages are needed; everything the nodes use ships with ComfyUI.

## Nodes

### Canvas tools

These nodes help you work on the canvas. They have no inputs or outputs and never run as part of a workflow.

| Node | What it does |
|------|--------------|
| **Node Hotkeys** | Lists every node in the graph in a table (id, x, y, hotkey, zoom). Give a node a digit hotkey (0-9) and a zoom (0.5-2.0); pressing that digit pans the canvas to the node. Columns can be resized and sorted, and the offset from the top-left corner where the node lands is adjustable (default 90, 90). Click **Refresh** after adding or removing nodes. |
| **Canvas Info** | Shows the node's own x/y position and width/height on the canvas, updated live as you move or resize it. |

### Workflow helpers

| Node | What it does |
|------|--------------|
| **Rotater** | Type a list of values separated by a delimiter, for example `man;woman;dog`. Pressing Run queues one run per item: the first run outputs `man`, the next `woman`, the last `dog`. The **type** setting picks what the output carries: string, int, float, or combo (plugs into a dropdown; items must match the dropdown's option names exactly). Type `\n` as the delimiter for one item per line. |
| **Age Recipe** | Turns a list of target ages (20-100, for example `40, 50, 60, 70`) into one aging instruction per age for an image-edit model, naming the wrinkles, spots, sagging and gray hair that belong to each age. Options for sun damage, smoker, strength and gray hair. Outputs a prompt, a label and a texture amount per age, plus a column count for an image strip and a summary. |

### Skin texture

Built to fix the smooth, waxy skin that FLUX renders often have.

| Node | What it does |
|------|--------------|
| **Waxy Skin Map** | Takes an image and a skin mask (for example from a human segmentation node) and finds skin with too little fine detail. Outputs a soft 0-1 mask of the waxy areas, a preview image, and the waxy percentage. Adjustable pore size, sensitivity and softness. |
| **Skin Grain** | Adds fine monochrome grain inside a mask, stronger in bright skin and weaker in shadow. Feed the result into a low-denoise re-render and the grain turns into real-looking skin texture. |

### API

| Node | What it does |
|------|--------------|
| **WaveSpeed GPT Image 2.5 Edit** | Edits up to 16 pictures with OpenAI GPT Image 2.5 Sunburst through [WaveSpeed](https://wavespeed.ai). Refer to pictures by order in the prompt, e.g. "the jacket from image 2". Choose aspect ratio, resolution and quality; the node shows the cost of each run. Needs your own WaveSpeed key in the `WAVESPEED_API_TOKEN` environment variable, and runs are billed to that account. |
| **OpenRouter** | Sends up to three pictures, one audio clip and one video plus a system prompt and prompt to any [OpenRouter](https://openrouter.ai) model and outputs its text answer, for example to caption pictures, transcribe audio or summarize videos. Pick the model on the node: tabs for TEXT2TEXT, IMAGE2TEXT, AUDIO2TEXT and VIDEO2TEXT, search, sort by name, cost, release date or context, and ★ favorites that stay on top. Only the first picture of each image batch is sent, shrunk to 2 megapixels if it is bigger. The node shows the cost of each run. Needs your own OpenRouter key in the `OPENROUTER_API` environment variable, and runs are billed to that account. |

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
