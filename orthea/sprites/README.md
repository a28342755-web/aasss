# Orthea job art

- `art/<job>.png` — 512×512 illustration per job (185), in the style of the reference image.
- `art/<job>_idle.png` — idle loop: 8 frames of 256×256 side by side, 120 ms each.
- `art/prompts.json` — prompt and seed used for every job.

How it was made, all free and local (CPU):
1. `gen_ai.py` — SD-Turbo img2img from the reference image (staff erased, cloth recoloured to the job colour),
   with a prompt built from `jobs.mjs` (headgear, weapon, outfit, colours). Broken results were re-rolled with a seed offset.
2. `anim_idle.py` — idle loop from each finished illustration (breathing, glow pulse, sparkles), so frames never change the drawing.

`gen.mjs` + `out/` are the earlier code-drawn Pixelbolt sprites (11 motions each), kept as a draft.
