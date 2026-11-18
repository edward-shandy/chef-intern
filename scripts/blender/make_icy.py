"""Builds Icy, the princess chef: her head (face, long wavy blonde hair, a gold crown) and her gown, as two GLBs.

Run:  blender --background --factory-startup --python scripts/blender/make_icy.py -- [--render DIR]

The head hangs on the KayKit rig's `head` bone and the gown on its `hips` bone, in the rig's own units: the head
sphere sits 0.44 above the bone like the other chefs' heads. Front is -Y (the game's +Z). Icy wears her crown
instead of the toque (the game leaves the toque off for her), so it can be seen clearly from the camera above.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import Prop, clear_scene, material, rng, star_points  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "props")

SKIN = material("icy_skin", "#f8d9c4", 0.6)
HAIR = material("icy_hair", "#f2c95f", 0.55)
HAIR_DARK = material("icy_hair_dark", "#d9a43c", 0.6)
HAIR_LIGHT = material("icy_hair_light", "#ffe9a8", 0.45)
GOLD = material("icy_gold", "#f2c14e", 0.28, 0.85)
VELVET = material("icy_velvet", "#b8234a", 0.8)
PEARL = material("icy_pearl", "#fff6ee", 0.22)
GEM_BLUE = material("icy_gem_blue", "#5fc8ff", 0.08, emit=0.35)
GEM_PINK = material("icy_gem_pink", "#ff5c9a", 0.08, emit=0.25)
EYE = material("icy_eye", "#3d2b63", 0.25)
EYE_LIGHT = material("icy_eye_light", "#8fd4ff", 0.25)
WHITE = material("icy_white", "#ffffff", 0.3)
LASH = material("icy_lash", "#2a1f2e", 0.5)
BROW = material("icy_brow", "#b98535", 0.6)
LIPS = material("icy_lips", "#e0577a", 0.4)
BLUSH = material("icy_blush", "#ff9fb4", 0.8)
GOWN = material("icy_gown", "#f48fbf", 0.6, double=True)
UNDER = material("icy_underskirt", "#f7bcd8", 0.7)
LACE = material("icy_lace", "#fff8fb", 0.6, double=True)
APRON = material("icy_apron", "#fffdf8", 0.7, double=True)
CRYSTAL = material("icy_crystal", "#bfefff", 0.05, emit=0.4)

FACE_C = (0.0, -0.05, 0.44)
FACE_R = 0.45


def face_point(x, z, out=0.0):
    """Where the face sphere's front surface is at (x, z), pushed `out` along -Y."""
    dx, dz = x - FACE_C[0], z - FACE_C[2]
    depth = math.sqrt(max(0.0, FACE_R * FACE_R - dx * dx - dz * dz)) * 0.95
    return (x, FACE_C[1] - depth - out, z)


def wavy_lock(p, start, length, sway, phase, radius, mat, curl=1.0, steps=12, outward=0.0):
    """A long lock of hair falling from `start`, waving side to side and curling forwards at the tip."""
    x0, y0, z0 = start
    path, radii = [], []
    for i in range(steps + 1):
        t = i / steps
        x = x0 + math.sin(t * 5.0 + phase) * sway * t + x0 * outward * t
        y = y0 + t * 0.06
        z = z0 - t * length
        # The last stretch curls up and forward into a ringlet.
        if t > 0.72 and curl:
            c = (t - 0.72) / 0.28
            y -= math.sin(c * math.pi * 0.9) * 0.12 * curl
            z += (1 - math.cos(c * math.pi * 0.9)) * 0.06 * curl
        path.append((x, y, z))
        radii.append(radius * (1.0 - 0.55 * t) + 0.012)
    p.tube(path, radii, mat, sides=9, flat=0.6)


def head():
    p = Prop("head_icy")
    r = rng(21)
    # Face and the hair's cap over the top and back.
    p.sphere(FACE_R, FACE_C, SKIN, scale=(1, 0.95, 1), segments=28, rings=20)
    p.sphere(0.5, (0, 0.07, 0.5), HAIR, scale=(1.04, 1, 1), segments=28, rings=20)
    # A glossy band of light round the crown of the hair (the classic cartoon shine).
    p.torus(0.43, 0.02, (0, 0.06, 0.8), HAIR_LIGHT, rot=(0.25, 0, 0), segments=30, sides=6, arc=math.pi * 0.9)

    # Side-swept fringe: soft overlapping locks across the forehead, the longest falling past the right brow.
    for i, (x, z, sx, tilt) in enumerate(((-0.27, 0.78, 0.15, -0.6), (-0.12, 0.83, 0.17, -0.45), (0.04, 0.84, 0.17, -0.3), (0.19, 0.8, 0.16, -0.15), (0.32, 0.7, 0.13, 0.1))):
        cx, cy, cz = face_point(x, z, 0.02)
        p.sphere(sx, (cx, cy + 0.04, cz), HAIR if i % 2 else HAIR_DARK if i == 4 else HAIR, scale=(1.35, 0.55, 0.75), rot=(0, tilt, 0), segments=16, rings=10)
    # A few fine strands over the fringe for detail.
    for x0 in (-0.2, 0.0, 0.18):
        start = face_point(x0, 0.86, 0.05)
        path = [start, face_point(x0 + 0.07, 0.76, 0.06), face_point(x0 + 0.14, 0.66, 0.045)]
        p.tube(path, [0.03, 0.025, 0.008], HAIR_LIGHT, sides=6, flat=0.5)

    # Long waves down the back, past the shoulder blades, each ending in a curl.
    for k in range(9):
        a = math.radians(-80 + k * 20)
        start = (math.sin(a) * 0.44, 0.1 + math.cos(a) * 0.4, 0.6)
        wavy_lock(p, start, 1.25 + r.uniform(-0.1, 0.12), 0.06, k * 0.9, 0.12, HAIR if k % 3 else HAIR_DARK, curl=1.0, outward=0.25)
    # Highlights running down some of the back locks.
    for k in (1, 4, 7):
        a = math.radians(-80 + k * 20)
        start = (math.sin(a) * 0.47, 0.12 + math.cos(a) * 0.43, 0.6)
        wavy_lock(p, start, 0.9, 0.06, k * 0.9, 0.035, HAIR_LIGHT, curl=0.0, outward=0.25)
    # Locks framing the face, falling over the front of the shoulders into ringlets.
    for side in (-1, 1):
        for j, (dx, length) in enumerate(((0.0, 0.95), (0.06, 0.8))):
            start = (side * (0.4 + dx), -0.12 + j * 0.06, 0.55)
            wavy_lock(p, start, length, 0.04 * side, j * 1.7, 0.09, HAIR if j == 0 else HAIR_DARK, curl=1.2, outward=0.15)

    # Big eyes: a dark iris with a lighter lower half, two catchlights, an upper lash line with flicks, and brows.
    for side in (-1, 1):
        ex, ez = side * 0.165, 0.47
        cx, cy, cz = face_point(ex, ez, -0.02)
        p.sphere(0.075, (cx, cy, cz), EYE, scale=(0.85, 0.45, 1.2), segments=16, rings=10)
        p.sphere(0.05, (cx, cy - 0.015, cz - 0.03), EYE_LIGHT, scale=(0.8, 0.4, 0.7), segments=12, rings=8)
        p.sphere(0.024, (cx - side * 0.02, cy - 0.035, cz + 0.035), WHITE, segments=8, rings=6)
        p.sphere(0.012, (cx + side * 0.025, cy - 0.035, cz - 0.04), WHITE, segments=6, rings=4)
        lash = [face_point(ex - side * 0.07, ez + 0.06, 0.005), face_point(ex, ez + 0.1, 0.008), face_point(ex + side * 0.08, ez + 0.07, 0.008)]
        p.tube(lash, [0.012, 0.016, 0.01], LASH, sides=6)
        for f in range(2):
            base = face_point(ex + side * (0.07 + f * 0.015), ez + 0.07 - f * 0.025, 0.01)
            tip = (base[0] + side * 0.05, base[1] - 0.01, base[2] + 0.03 - f * 0.01)
            p.tube([base, tip], [0.009, 0.003], LASH, sides=5)
        brow = [face_point(ex - side * 0.06, ez + 0.16, 0.012), face_point(ex, ez + 0.19, 0.015), face_point(ex + side * 0.07, ez + 0.17, 0.012)]
        p.tube(brow, [0.008, 0.012, 0.006], BROW, sides=5)
        # Rosy cheek.
        bx, by, bz = face_point(side * 0.27, 0.36, -0.005)
        p.sphere(0.075, (bx, by, bz), BLUSH, scale=(1, 0.3, 0.55), segments=12, rings=6)
        # Pearl drop earring below the hair.
        p.sphere(0.022, (side * 0.43, -0.05, 0.3), GOLD, segments=8, rings=6)
        p.sphere(0.04, (side * 0.43, -0.05, 0.24), PEARL, scale=(1, 1, 1.25), segments=12, rings=8)
    # A small nose and a smile.
    nx, ny, nz = face_point(0, 0.4, -0.01)
    p.sphere(0.03, (nx, ny, nz), SKIN, scale=(1, 0.7, 1.1), segments=10, rings=6)
    p.tube([face_point(-0.07, 0.31, 0.004), face_point(0, 0.285, 0.006), face_point(0.07, 0.31, 0.004)], [0.012, 0.016, 0.012], LIPS, sides=6)

    # The crown: a gold band with a scalloped rim, five tall spires each tipped with a pearl, five small ones between,
    # jewels round the band and red velvet showing inside.
    # Sized and splayed to read from the game's camera above: wide spires leaning out, the velvet kept low.
    base_z, band_r = 0.88, 0.33
    p.lathe([(band_r - 0.02, 0.0), (band_r, 0.005), (band_r + 0.018, 0.03), (band_r + 0.018, 0.13), (band_r, 0.16), (band_r - 0.02, 0.16)], (0, 0.04, base_z), GOLD, segments=36, close_bottom=False)
    p.sphere(band_r - 0.03, (0, 0.04, base_z + 0.07), VELVET, scale=(1, 1, 0.3), segments=20, rings=10)
    for i in range(10):
        theta = i * math.pi / 5
        big = i % 2 == 0
        h = 0.32 if big else 0.17
        w = 0.095 if big else 0.06
        x, y = math.sin(theta) * (band_r + 0.006), 0.04 - math.cos(theta) * (band_r + 0.006)
        outline = [(-w, 0.0), (w, 0.0), (w * 0.45, h * 0.55), (0.0, h), (-w * 0.45, h * 0.55)]
        lean = 0.3
        p.prism([(px, pz) for px, pz in outline], 0.04, (x, y, base_z + 0.14), GOLD, rot=(lean, 0, theta), bevel=0.008)
        if big:
            out = math.sin(lean) * h
            tip = (x + math.sin(theta) * out, y - math.cos(theta) * out, base_z + 0.14 + math.cos(lean) * h + 0.03)
            p.sphere(0.042, tip, PEARL, segments=12, rings=8)
            # A jewel on the band under each big spire: blue at the front, pink round the sides.
            gem = GEM_BLUE if i == 0 else GEM_PINK
            gx, gy = math.sin(theta) * (band_r + 0.02), 0.04 - math.cos(theta) * (band_r + 0.02)
            p.sphere(0.05 if i == 0 else 0.034, (gx, gy, base_z + 0.08), gem, scale=(1, 0.6, 1.25), rot=(0, 0, theta), segments=12, rings=8)
        else:
            gx, gy = math.sin(theta) * (band_r + 0.016), 0.04 - math.cos(theta) * (band_r + 0.016)
            p.sphere(0.02, (gx, gy, base_z + 0.08), PEARL, segments=8, rings=6)
    # A little gold star on the front spire's face.
    p.prism([(px, pz + base_z + 0.26) for px, pz in star_points(0.04, 0.017)], 0.012, (0, 0.04 - band_r - 0.075, 0), GOLD, rot=(0.3, 0, 0))
    p.export(os.path.join(OUT, "head_icy.glb"))


def gown():
    """A princess gown from the waist: a ruffled underskirt, an overskirt open at the front with a gold hem, a chef's
    white apron down the front, a sash with a big bow at the back, and ice crystals on the skirt."""
    p = Prop("skirt_icy")
    r = rng(8)
    under = [(0.37, 0.12), (0.42, 0.04), (0.55, -0.2), (0.71, -0.45), (0.8, -0.6), (0.82, -0.64)]
    p.lathe(under, (0, 0, 0), UNDER, segments=40, wave=(12, 0.025), close_bottom=True)
    # Two tiers of lace ruffle round the hem.
    p.lathe([(0.8, -0.56), (0.9, -0.66), (0.92, -0.68)], (0, 0, 0), LACE, segments=48, arc=(0.0, 2 * math.pi - 1e-3), wave=(24, 0.03))
    p.lathe([(0.74, -0.44), (0.8, -0.52)], (0, 0, 0), LACE, segments=44, arc=(0.0, 2 * math.pi - 1e-3), wave=(22, 0.02))
    # Overskirt, open at the front (front is -Y, i.e. 270 degrees), with deep folds and a gold hem.
    front = math.radians(270)
    gap = math.radians(38)
    arc = (front + gap, front - gap + 2 * math.pi)
    over = [(0.39, 0.12), (0.45, 0.04), (0.6, -0.2), (0.78, -0.43), (0.88, -0.57)]
    p.lathe(over, (0, 0, 0), GOWN, segments=40, arc=arc, wave=(10, 0.04))
    p.lathe([(0.875, -0.56), (0.895, -0.6)], (0, 0, 0), GOLD, segments=40, arc=arc, wave=(10, 0.04))
    # The chef's apron down the front, with a lace edge and a pocket holding a little wooden spoon.
    apron_arc = (front - math.radians(30), front + math.radians(30))
    p.lathe([(0.4, 0.08), (0.49, -0.12), (0.62, -0.36), (0.68, -0.46)], (0, -0.012, 0), APRON, segments=14, arc=apron_arc)
    for i in range(9):
        a = apron_arc[0] + (apron_arc[1] - apron_arc[0]) * i / 8
        p.sphere(0.025, (math.cos(a) * 0.69, math.sin(a) * 0.69 - 0.012, -0.47), LACE, segments=8, rings=6)
    p.box((0.16, 0.02, 0.1), (0.08, -0.6, -0.27), APRON, rot=(0.5, 0, 0), bevel=0.01, segments=1)
    p.cylinder(0.012, 0.18, (0.12, -0.6, -0.2), material("icy_spoon", "#b9844f", 0.7), rot=(0.4, 0.2, 0), verts=6)
    # Sash with a gold edge, and a big bow at the back with two long tails.
    p.torus(0.41, 0.045, (0, 0, 0.1), GOWN, segments=36, sides=8)
    p.torus(0.415, 0.012, (0, 0, 0.14), GOLD, segments=36, sides=5)
    p.torus(0.415, 0.012, (0, 0, 0.06), GOLD, segments=36, sides=5)
    for side in (-1, 1):
        p.torus(0.1, 0.035, (side * 0.11, 0.45, 0.12), GOWN, rot=(math.pi / 2, 0, 0), segments=16, sides=8)
        tail = [(side * 0.03, 0.44, 0.08), (side * 0.08, 0.5, -0.1), (side * 0.12, 0.56, -0.32)]
        p.tube(tail, [0.045, 0.04, 0.03], GOWN, sides=8, flat=0.35)
    p.sphere(0.05, (0, 0.46, 0.11), GOLD, segments=10, rings=8)
    # Ice crystals scattered over the overskirt.
    for i in range(14):
        a = arc[0] + (arc[1] - arc[0]) * r.random()
        z = r.uniform(-0.5, -0.05)
        t = (0.12 - z) / 0.69
        radius = 0.39 + (0.88 - 0.39) * t + 0.015
        p.cylinder(0.02, 0.05, (math.cos(a) * radius, math.sin(a) * radius, z), CRYSTAL, rot=(r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5), a), verts=6, radius_top=0.0)
    p.export(os.path.join(OUT, "skirt_icy.glb"))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    render_dir = args[args.index("--render") + 1] if "--render" in args else None
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from make_magic_props import render_preview  # noqa: E402

    for build in (head, gown):
        clear_scene()
        build()
        joined = bpy.context.view_layer.objects.active
        print(f"built {joined.name}: {len(joined.data.vertices)} verts")
        if render_dir:
            os.makedirs(render_dir, exist_ok=True)
            render_preview(joined, os.path.join(render_dir, f"{joined.name}.png"))
            for obj in [o for o in bpy.data.objects if o.name.startswith(("cam", "sun", "fill"))]:
                bpy.data.objects.remove(obj, do_unlink=True)


if __name__ == "__main__":
    main()
