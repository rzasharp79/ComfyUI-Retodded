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
