"""Render a 30-angle turntable for the combo page.

Run (from the repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b build/hoodie_combos_scene.blend -P build/render_turntable.py -- assets/spin

Per angle it writes two 800x600 images:
  shade_NN.png  grey-fabric hoodie in studio light, Kicks patch in color, transparent background
  id_NN.png     flat region ids, one gray level per piece, no antialiasing (the page reads the red channel)
Region ids (red channel): 0 background, 10 body, 20 hood, 30 band, 40 sleeves, 50 cuffs, 60 pocket, 80 patch.
"""
import bpy, sys, math, os

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'assets/spin'
NOPATCH = '--nopatch' in sys.argv   # leave the Kicks patch out of every render
os.makedirs(out, exist_ok=True)
STEPS = 30
sc = bpy.data.scenes['Combos']
bpy.context.window.scene = sc
H, P, SPIN = bpy.data.objects['Combo_H'], bpy.data.objects['Combo_Patch'], bpy.data.objects['ComboSpin']
IDS = [10, 20, 30, 40, 50, 60]
PATCH_ID = 80

def s2l(b):
    c = b / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def flat(name, byte):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    v = s2l(byte)
    e.inputs['Color'].default_value = (v, v, v, 1)
    e.inputs['Strength'].default_value = 1.0
    nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    return m

def cutout(name, byte, src_mat):
    """Flat id that follows the patch artwork's edge with a hard 0/1 cut (no random alpha at 1 sample)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    img = next(n.image for n in src_mat.node_tree.nodes if n.type == 'TEX_IMAGE')
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    e = nt.nodes.new('ShaderNodeEmission'); v = s2l(byte); e.inputs['Color'].default_value = (v, v, v, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(t.outputs['Alpha'], gt.inputs[0])
    nt.links.new(gt.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[1])
    nt.links.new(e.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], o.inputs['Surface'])
    return m

def make_shade():
    m = bpy.data.materials.get('Shade_Fabric')
    if m:
        return m
    m = bpy.data.materials['Hoodie_Blue'].copy()
    m.name = 'Shade_Fabric'
    nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for l in list(bs.inputs['Base Color'].links):
        nt.links.remove(l)
    bs.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    bs.inputs['Roughness'].default_value = 0.8
    return m

SHADE = make_shade()
PATCH_MAT = P.data.materials[0]
ID_MATS = [flat(f'ID_{i}', b) for i, b in enumerate(IDS)]
PATCH_ID_MAT = cutout('ID_patch', PATCH_ID, PATCH_MAT)

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.render.dither_intensity = 0.0  # keep id values exact (the page also snaps them, in case this is left on)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 800, 600, 100

def set_slots(mats):
    for i, m in enumerate(mats):
        H.data.materials[i] = m

def render(path, samples, denoise, filt):
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.cycles.filter_width = filt
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene='Combos')

if NOPATCH:
    P.hide_render = True
    P.hide_viewport = True
for i in range(STEPS):
    SPIN.rotation_euler[2] = math.radians(i * 360.0 / STEPS)
    set_slots([SHADE] * 6); P.data.materials[0] = PATCH_MAT
    render(os.path.join(out, f'shade_{i:02d}.png'), 96, True, 1.5)
    set_slots(ID_MATS); P.data.materials[0] = PATCH_ID_MAT
    render(os.path.join(out, f'id_{i:02d}.png'), 1, False, 0.01)
print('TURNTABLE DONE')
