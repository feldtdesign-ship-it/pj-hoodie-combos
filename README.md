# Hoodie Combos

A small exploration tool for the New York Kicks hoodie. Orange and blue, three choices (body, sleeves, pocket), eight hoodies, and a hoodie you can drag around in 3D. Style follows the PJ O'Rourke demo shop: white, paper, ink, one yellow dotted strip, Bodoni, IBM Plex Mono.

## Run it

The page reads images with canvas, so it has to be opened through a web server, not by double-clicking `index.html`.

```bash
python3 -m http.server 8123
```

Then open http://127.0.0.1:8123

## How it works

One hoodie is rendered once in Blender from 30 angles around it. Each angle gets two images in `assets/spin/`:

- `shade_NN.png` the hoodie in grey fabric under studio light, with the Kicks patch in color
- `id_NN.png` a flat map of which piece each pixel belongs to

The page multiplies the chosen color by the grey shading, piece by piece, so the folds and lighting stay real and any color change is instant.

| id (red channel) | piece | follows the choice for |
|---|---|---|
| 10 | body | Body |
| 20 | hood | Body |
| 30 | waist band | Body |
| 40 | sleeves | Sleeves |
| 50 | cuffs | Sleeves |
| 60 | pocket | Pocket |
| 80 | Kicks patch | drawn as rendered |

## Rebuild the images

Needs Blender 5.0 and the scene file `build/hoodie_combos_scene.blend`. That file is large (about 180 MB, it carries the whole working scene) so it is not in git.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b build/hoodie_combos_scene.blend -P build/render_turntable.py -- assets/spin
```

About five minutes. `build/render_passes.py` is the earlier four-view version with one mask per piece, kept in case you want more than two colors or a full palette later (the 37 Los Angeles Apparel colors and the Independent Trading Co. colors are in `data/palettes.json`, with the chart in the `Hoodie Blanks` folder next to this one).

## Known limits

- The hoodie model is a scan with ragged cuffs and waist band, and the original fabric textures are missing, so a stand-in knit texture is used.
- Region edges come from a face-position split of the model, so seams are close but not stitched exactly.
- Spin is 30 stills (12 degrees apart), not a live 3D model.
- Folders named `assets_v1_*`, `assets/spin_v1_*` and the loose files in `assets/` are earlier renders kept for reference.
