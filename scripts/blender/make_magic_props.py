"""Builds the Wizard's Keep props (castle walls, furniture, magic clutter, robed guests) and exports them as GLBs.

Run:  blender --background --factory-startup --python scripts/blender/make_magic_props.py -- [--only name,...] [--render DIR]

Every prop is modelled from bevelled primitives in code (see lib.py), in a cartoon style with real detail: stone walls
are laid block by block in running bond, books lean and stack, candles drip wax. Glowing parts (flames, stained glass,
potions, brews) carry emission above 1 so the game's bloom lights them up. `--render DIR` also saves a preview image
of each prop, for checking the look without starting the game.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import Prop, clear_scene, crescent_points, inside_pointed_arch, material, pointed_arch, rng, star_points  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "props")

# ---------------------------------------------------------------------------------------------------- palette


class M:
    """Shared materials. Cool blue-grey castle stone, warm dark oak, brass and iron, and the glowing bits."""

    stones = [
        material("stone_a", "#8d90a6", 0.9),
        material("stone_b", "#7b7f96", 0.9),
        material("stone_c", "#9a9cb2", 0.9),
        material("stone_d", "#857f8c", 0.9),
        material("stone_e", "#6f7389", 0.92),
    ]
    stone_light = material("stone_light", "#b3b5c6", 0.85)
    stone_dark = material("stone_dark", "#4d5066", 0.95)
    mortar = material("mortar", "#3e3f52", 1.0)
    recess = material("recess", "#2a2a3d", 1.0)
    oak = material("oak", "#6b4630", 0.7)
    oak_dark = material("oak_dark", "#4a2f22", 0.75)
    oak_light = material("oak_light", "#8f5f3c", 0.65)
    iron = material("iron", "#34343f", 0.45, 0.7)
    brass = material("brass", "#d9a441", 0.32, 0.85)
    gold = material("gold", "#f2c45a", 0.28, 0.9)
    wax = material("wax", "#f4ead2", 0.5)
    wick = material("wick", "#2a2220", 0.8)
    flame_outer = material("flame_outer", "#ff8a2a", 0.5, emit=2.4)
    flame_inner = material("flame_inner", "#ffe07a", 0.5, emit=3.6)
    lead = material("lead", "#23222c", 0.6, 0.4)
    glass = [
        material("glass_blue", "#3f8ff5", 0.2, emit=0.85),
        material("glass_gold", "#f5c542", 0.2, emit=0.85),
        material("glass_red", "#e2445c", 0.2, emit=0.8),
        material("glass_violet", "#8a5cf0", 0.2, emit=0.85),
        material("glass_teal", "#3fe0b0", 0.2, emit=1.6),
    ]
    book_covers = [
        material("book_red", "#8e2b2b", 0.7),
        material("book_navy", "#2b3f7a", 0.7),
        material("book_green", "#2f6b3f", 0.7),
        material("book_purple", "#5b3a8a", 0.7),
        material("book_brown", "#6b4426", 0.75),
        material("book_teal", "#1f6f73", 0.7),
        material("book_mustard", "#b0852e", 0.7),
    ]
    paper = material("paper", "#efe2c4", 0.85)
    potions = [
        material("potion_green", "#49f0a0", 0.15, emit=0.8),
        material("potion_pink", "#ff6fb5", 0.15, emit=0.8),
        material("potion_blue", "#5fb8ff", 0.15, emit=0.8),
        material("potion_amber", "#ffb13b", 0.15, emit=0.75),
        material("potion_violet", "#b07bff", 0.15, emit=0.8),
    ]
    cork = material("cork", "#a77b4f", 0.85)
    cloth = {
        "violet": material("cloth_violet", "#5e3496", 0.85),
        "teal": material("cloth_teal", "#1d7a7d", 0.85),
        "crimson": material("cloth_crimson", "#9c2f3d", 0.85),
        "navy": material("cloth_navy", "#26335f", 0.85),
        "emerald": material("cloth_emerald", "#256b46", 0.85),
    }
    skin = [material("skin_a", "#f2c7a5", 0.6), material("skin_b", "#c98f68", 0.6), material("skin_c", "#8a5a3c", 0.6)]
    beard = material("beard", "#eeeef2", 0.9)
    beard_grey = material("beard_grey", "#a9a9b3", 0.9)
    brew = material("brew", "#45f09a", 0.2, emit=0.8)
    soot = material("soot", "#25242c", 0.7, 0.3)
    crystal = material("crystal", "#b58cff", 0.05, emit=1.0)
    crystal_blue = material("crystal_blue", "#7fe7ff", 0.05, emit=0.8)
    leaf = material("leaf", "#3f8a4a", 0.7)
    leaf_light = material("leaf_light", "#5fae4f", 0.7)
    clay = material("clay", "#b0603e", 0.85)
    mushroom_glow = material("mushroom_glow", "#57d9ff", 0.4, emit=1.2)
    feather = material("feather", "#8a6a4a", 0.85)
    feather_light = material("feather_light", "#e8dcc4", 0.85)
    eye = material("eye", "#ffcf3f", 0.3, emit=1.2)
    pupil = material("pupil", "#141418", 0.4)
    fire_log = material("fire_log", "#5a3826", 0.9)
    ember = material("ember", "#ff5a1f", 0.6, emit=2.0)
    rug_gold = material("rug_gold", "#d8a548", 0.9)
    food_crust = material("food_crust", "#d18a3e", 0.7)
    food_red = material("food_red", "#c7362f", 0.6)
    food_green = material("food_green", "#6db04a", 0.7)
    pumpkin = material("pumpkin", "#ef8424", 0.6)
    plate_white = material("plate_white", "#f4f1ea", 0.4)
    butcher = [material("butcher_a", "#b07c4e", 0.6), material("butcher_b", "#a06d43", 0.6), material("butcher_c", "#bb8858", 0.6)]


def stone(r):
    return M.stones[r.randrange(len(M.stones))]


# ---------------------------------------------------------------------------------------------------- shared parts


def stone_wall(p, width, height, depth, seed, skip=None, course=0.21, chamfer=0.028, wide=False):
    """Lays a wall of separate stone blocks in running bond over a dark mortar backing, its face at y = 0.

    `skip(x, z)` leaves out blocks whose middle it returns True for (windows, niches, shelves).
    """
    r = rng(seed)
    p.box((width, depth * 0.7, height), (0, depth * 0.45, height / 2), M.mortar, bevel=0)
    z = 0.0
    row = 0
    while z < height - 1e-3:
        h = min(course * (0.82 + 0.36 * r.random()), height - z)
        if height - z - h < 0.08:
            h = height - z
        x = -width / 2 - (r.uniform(0.08, 0.2) if row % 2 else 0.0)
        while x < width / 2 - 1e-3:
            # High up, where the camera sees them small, the blocks are bigger and so fewer.
            w = r.uniform(0.42, 0.72) if wide else r.uniform(0.26, 0.5)
            left, right = max(x, -width / 2), min(x + w, width / 2)
            if width / 2 - right < 0.08:
                right = width / 2
                w = right - x
            if right - left > 0.06:
                cx, cz = (left + right) / 2, z + h / 2
                if not (skip and skip(cx, cz)):
                    out = r.uniform(0.0, 0.03)
                    p.box(
                        (right - left - 0.02, depth * 0.55, h - 0.02),
                        (cx, depth * 0.275 - out, cz),
                        stone(r),
                        rot=(0, r.uniform(-0.015, 0.015), 0),
                        bevel=chamfer,
                        segments=1,
                    )
            x += w
        z += h
        row += 1


def candle(p, x, y, z, height, radius=0.035, r=None, lit=True):
    """A wax candle with drips, a wick and a two-layer flame; `z` is the bottom of the candle."""
    r = r or rng(int((x + 7) * 100 + (y + 3) * 10 + z))
    p.cylinder(radius, height, (x, y, z + height / 2), M.wax, verts=12)
    # The top dips a little and wax runs down the sides.
    p.cylinder(radius * 1.04, 0.012, (x, y, z + height - 0.004), M.wax, verts=12)
    for i in range(r.randint(2, 4)):
        a = r.uniform(0, 2 * math.pi)
        length = r.uniform(0.25, 0.6) * height
        p.sphere(radius * 0.32, (x + math.cos(a) * radius * 0.92, y + math.sin(a) * radius * 0.92, z + height - length / 2), M.wax, scale=(1, 1, length / (radius * 0.6)), segments=6, rings=4)
    p.cylinder(0.004, 0.03, (x, y, z + height + 0.012), M.wick, verts=4)
    if lit:
        flame(p, x, y, z + height + 0.02, 0.06 + radius * 0.6)


def flame(p, x, y, z, height):
    """A teardrop flame: an orange outer glow round a bright yellow core."""
    w = height * 0.32
    outer = [(0.0, 0.0), (w * 0.7, height * 0.12), (w, height * 0.32), (w * 0.72, height * 0.62), (w * 0.28, height * 0.88), (0.0, height)]
    p.lathe(outer, (x, y, z), M.flame_outer, segments=10)
    inner = [(0.0, 0.0), (w * 0.45, height * 0.1), (w * 0.55, height * 0.28), (w * 0.35, height * 0.5), (0.0, height * 0.66)]
    p.lathe(inner, (x, y, z + height * 0.04), M.flame_inner, segments=8)


def potion(p, x, y, z, kind, liquid, scale=1.0):
    """A small glass bottle of glowing potion: 0 round flask, 1 tall bottle, 2 cone flask, 3 squat jar."""
    s = scale
    shapes = [
        [(0.0, 0.0), (0.05, 0.004), (0.075, 0.04), (0.07, 0.085), (0.04, 0.115), (0.018, 0.13), (0.018, 0.17)],
        [(0.0, 0.0), (0.04, 0.003), (0.042, 0.14), (0.03, 0.17), (0.016, 0.185), (0.016, 0.22)],
        [(0.0, 0.0), (0.065, 0.004), (0.06, 0.03), (0.022, 0.12), (0.018, 0.16)],
        [(0.0, 0.0), (0.06, 0.003), (0.064, 0.08), (0.05, 0.095), (0.05, 0.11)],
    ]
    profile = [(rad * s, h * s) for rad, h in shapes[kind % 4]]
    p.lathe(profile, (x, y, z), liquid, segments=14, close_top=True)
    top = profile[-1]
    p.cylinder(top[0] * 1.15, 0.035 * s, (x, y, z + top[1] + 0.012 * s), M.cork, verts=10)


def book(p, x, y, z, w, d, h, r, lean=0.0, lying=False):
    """One book: a cover box, pale page block showing at the front, and sometimes gilt bands on the spine.

    The spine faces -Y. With `lying` it lies flat (w is then its thickness)."""
    cover = M.book_covers[r.randrange(len(M.book_covers))]
    if lying:
        p.box((h, d, w), (x, y, z + w / 2), cover, bevel=0)
        p.box((h - 0.02, d - 0.01, w * 0.7), (x + 0.008, y + 0.004, z + w / 2), M.paper, bevel=0)
        return
    rot = (0, lean, 0)
    cx = x + w / 2 + math.sin(lean) * h / 2
    cz = z + math.cos(lean) * h / 2
    p.box((w, d, h), (cx, y, cz), cover, rot=rot, bevel=0)
    if r.random() < 0.55:
        for band in (0.18, 0.82):
            bz = z + math.cos(lean) * h * band
            bx = x + w / 2 + math.sin(lean) * h * band
            p.box((w * 1.02, 0.006, h * 0.035), (bx, y - d / 2 - 0.002, bz), M.gold, rot=rot, bevel=0)


def shelf_of_books(p, x0, x1, z, y, depth, max_h, seed):
    """Fills a shelf from x0 to x1 with standing books, the odd leaning one, a stack lying flat, and a potion now and then."""
    r = rng(seed)
    x = x0 + 0.01
    while x < x1 - 0.05:
        roll = r.random()
        if roll < 0.08 and x1 - x > 0.26:
            # A short stack of books lying down.
            hgt = 0.0
            for _ in range(r.randint(2, 4)):
                t = r.uniform(0.03, 0.05)
                book(p, x + 0.12, y, z + hgt, t, depth * r.uniform(0.75, 0.95), r.uniform(0.17, 0.22), r, lying=True)
                hgt += t
            x += 0.26
        elif roll < 0.16 and x1 - x > 0.12:
            potion(p, x + 0.055, y - 0.02, z, r.randrange(4), M.potions[r.randrange(len(M.potions))], 0.8)
            x += 0.12
        else:
            w = r.uniform(0.032, 0.07)
            h = r.uniform(0.62, 1.0) * max_h
            lean = r.uniform(0.12, 0.3) if r.random() < 0.1 else 0.0
            book(p, x, y + r.uniform(-0.01, 0.02), z, w, depth * r.uniform(0.78, 0.97), h, r, lean=lean)
            x += w + 0.003 + (math.sin(lean) * h if lean else 0)


def arch_frame(p, width, spring, base_z, thick, depth, y, mat, count=7, keystone=True):
    """Pale dressed stones round a pointed opening: a jamb up each side, then voussoirs along both arcs to a keystone.

    The left arc is centred on the right springing point (angles 180 down to 120 degrees) and the right arc mirrors
    it. A box's X axis is laid along the arc: rotating by phi about Y points X at (cos phi, -sin phi) in (x, z)."""
    for side in (-1, 1):
        p.box((thick, depth, spring), (side * (width / 2 + thick / 2), y, base_z + spring / 2), mat, bevel=0.018, segments=1)
    radius = width + thick / 2
    piece = radius * (math.pi / 3) / count
    for i in range(count):
        a = math.pi - (math.pi / 3) * (i + 0.5) / count
        x = width / 2 + math.cos(a) * radius
        z = base_z + spring + math.sin(a) * radius
        p.box((piece - 0.014, depth, thick), (x, y, z), mat, rot=(0, -(a + math.pi / 2), 0), bevel=0.014, segments=1)
        p.box((piece - 0.014, depth, thick), (-x, y, z), mat, rot=(0, a - math.pi / 2, 0), bevel=0.014, segments=1)
    if keystone:
        top = base_z + spring + width * math.sin(math.pi / 3) + thick * 0.3
        p.box((thick * 0.85, depth * 1.08, thick * 1.25), (0, y - 0.01, top), mat, bevel=0.016, segments=1)


def timber_frame(p, width, height, seed):
    """Dark oak posts at both ends, a beam across the top and diagonal braces, with iron bolts (like old castle halls)."""
    r = rng(seed)
    for side in (-1, 1):
        x = side * (width / 2 - 0.07)
        p.box((0.14, 0.12, height), (x, -0.04, height / 2), M.oak_dark, bevel=0.018, segments=2)
        # Bolts and an iron strap where the brace meets the post.
        for bz in (height - 0.62, 0.6):
            p.sphere(0.018, (x, -0.105, bz), M.iron, segments=6, rings=4)
    beam_z = height - 0.2
    p.box((width, 0.14, 0.16), (0, -0.05, beam_z), M.oak_dark, bevel=0.02, segments=2)
    # Braces run from each post up to the beam.
    length = 0.62
    for side in (-1, 1):
        x = side * (width / 2 - 0.07 - length * 0.35)
        p.box((0.09, 0.08, length), (x, -0.03, beam_z - 0.28), M.oak, rot=(0, side * -math.radians(45), 0), bevel=0.012, segments=1)
    for i in range(5):
        p.sphere(0.016, (-width / 2 + 0.3 + i * (width - 0.6) / 4, -0.125, beam_z + r.uniform(-0.02, 0.02)), M.iron, segments=6, rings=4)


# ---------------------------------------------------------------------------------------------------- walls

WALL_W = 2.0
WALL_H = 2.7
WALL_D = 0.36


def wall_arch():
    """A plain stretch of castle wall with a pointed niche holding potions and a candle."""
    p = Prop("magic_wall_arch")
    niche_w, niche_spring, niche_z = 0.62, 0.42, 0.95

    def in_niche(x, z):
        return inside_pointed_arch(x, z - niche_z, niche_w, niche_spring, margin=0.12)

    stone_wall(p, WALL_W, WALL_H, WALL_D, seed=11, skip=in_niche)
    # The niche: a dark recess (in front of the mortar, behind the stone face) framed by pale arch stones, and a sill.
    outline = pointed_arch(niche_w + 0.12, niche_spring)
    p.prism([(x, z + niche_z) for x, z in outline], 0.02, (0, 0.025, 0), M.recess)
    arch_frame(p, niche_w, niche_spring, niche_z, 0.1, 0.16, 0.04, M.stone_light, count=6)
    p.box((niche_w + 0.3, 0.26, 0.07), (0, -0.04, niche_z - 0.035), M.stone_light, bevel=0.015, segments=1)
    # Inside: two potions and a fat candle.
    r = rng(5)
    potion(p, -0.15, -0.02, niche_z, 0, M.potions[0])
    potion(p, 0.16, -0.02, niche_z, 1, M.potions[4])
    candle(p, 0.0, -0.03, niche_z, 0.16, radius=0.045, r=r)
    timber_frame(p, WALL_W, WALL_H, seed=3)
    p.export(os.path.join(OUT, "magic_wall_arch.glb"))


def wall_window():
    """A stretch of wall with a tall pointed stained-glass window: moonlight through coloured panes and lead."""
    p = Prop("magic_wall_window")
    win_w, spring, bottom = 0.74, 0.95, 0.85

    def in_window(x, z):
        return inside_pointed_arch(x, z - bottom, win_w, spring, margin=0.13)

    stone_wall(p, WALL_W, WALL_H, WALL_D, seed=23, skip=in_window)
    # Lead backing first; the panes sit just in front with small gaps, which read as the lead lines.
    outline = [(x, z + bottom) for x, z in pointed_arch(win_w, spring)]
    p.prism(outline, 0.012, (0, 0.03, 0), M.lead)
    # Diamond panes: a gold border run, a deep blue field with violet and teal diamonds, and a gold crescent moon
    # with a star in the head of the arch.
    r = rng(8)
    cell = 0.12
    half = cell / 2
    for j in range(int((spring + win_w) / half) + 2):
        for i in range(-int(win_w / cell) - 1, int(win_w / cell) + 2):
            x = i * cell + (half if j % 2 else 0.0)
            z = j * half
            if not inside_pointed_arch(x, z, win_w, spring, margin=-0.035):
                continue
            edge = not inside_pointed_arch(x, z, win_w, spring, margin=-0.11)
            ring = (abs(i) + j) % 5
            glass = M.glass[1] if edge else (M.glass[3] if ring == 0 else M.glass[4] if ring == 3 and r.random() < 0.6 else M.glass[0])
            p.quad(half * 1.36, half * 1.36, (x, 0.015, z + bottom), glass, rot=(0, math.pi / 4, 0))
    moon_z = bottom + spring + 0.12
    p.prism([(x * 0.13 - 0.02, z * 0.13 + moon_z) for x, z in crescent_points(1, 0.42)], 0.012, (0, 0.006, 0), M.glass[1])
    p.prism([(x + 0.1, z + moon_z + 0.1) for x, z in star_points(0.05, 0.02)], 0.012, (0, 0.006, 0), M.glass[1])
    # Iron saddle bars across the glass.
    for bz in (bottom + 0.32, bottom + 0.66):
        p.box((win_w + 0.06, 0.016, 0.016), (0, 0.008, bz), M.iron, bevel=0)
    # Stone frame: jambs, arch stones and a deep sill.
    arch_frame(p, win_w, spring, bottom, 0.12, 0.2, 0.0, M.stone_light, count=8)
    p.box((win_w + 0.36, 0.34, 0.08), (0, -0.02, bottom - 0.04), M.stone_light, bevel=0.02, segments=1)
    # A candle and a small potion on the sill.
    candle(p, -0.27, -0.06, bottom, 0.12, radius=0.03)
    potion(p, 0.26, -0.06, bottom, 2, M.potions[2], 0.8)
    timber_frame(p, WALL_W, WALL_H, seed=4)
    p.export(os.path.join(OUT, "magic_wall_window.glb"))


def wall_shelf():
    """A stretch of wall with a deep built-in bookcase: four shelves of books, scrolls and potions."""
    p = Prop("magic_wall_shelf")
    case_w, case_h, case_z = 1.5, 1.95, 0.1

    def in_case(x, z):
        return abs(x) < case_w / 2 + 0.05 and case_z - 0.05 < z < case_z + case_h + 0.05

    stone_wall(p, WALL_W, WALL_H, WALL_D, seed=37, skip=in_case)
    # Carcass: back, sides, top with a carved crown, and shelves.
    p.box((case_w, 0.04, case_h), (0, 0.2, case_z + case_h / 2), M.oak_dark, bevel=0)
    for side in (-1, 1):
        p.box((0.07, 0.36, case_h + 0.04), (side * (case_w / 2 - 0.035), 0.03, case_z + case_h / 2), M.oak, bevel=0.012, segments=2)
    p.box((case_w + 0.12, 0.4, 0.09), (0, 0.02, case_z + case_h + 0.04), M.oak, bevel=0.015, segments=2)
    p.box((case_w + 0.2, 0.42, 0.05), (0, 0.0, case_z + case_h + 0.1), M.oak_dark, bevel=0.012, segments=2)
    for i in range(5):
        p.sphere(0.03, (-case_w / 2 + 0.15 + i * (case_w - 0.3) / 4, -0.2, case_z + case_h + 0.08), M.brass, segments=10, rings=6)
    shelves = 4
    gap = case_h / shelves
    for s in range(shelves):
        z = case_z + s * gap
        p.box((case_w - 0.1, 0.34, 0.035), (0, 0.03, z + 0.0175), M.oak_light, bevel=0.008, segments=1)
        shelf_of_books(p, -case_w / 2 + 0.07, case_w / 2 - 0.07, z + 0.035, 0.05, 0.26, gap - 0.1, seed=100 + s)
    # A rolled scroll and a skull-free curio on top: a little brass globe.
    p.cylinder(0.035, 0.32, (-0.4, -0.05, case_z + case_h + 0.16), M.paper, rot=(0, math.pi / 2, 0.2), verts=12)
    p.sphere(0.07, (0.45, -0.02, case_z + case_h + 0.22), M.glass[0], segments=14, rings=10)
    p.torus(0.085, 0.008, (0.45, -0.02, case_z + case_h + 0.22), M.brass, rot=(math.pi / 2, 0.4, 0), segments=18, sides=5)
    p.cylinder(0.03, 0.06, (0.45, -0.02, case_z + case_h + 0.15), M.brass, verts=10)
    timber_frame(p, WALL_W, WALL_H, seed=5)
    p.export(os.path.join(OUT, "magic_wall_shelf.glb"))


# ---------------------------------------------------------------------------------------------------- furniture


def bookcase():
    """A tall freestanding bookcase with a carved crown, five shelves of books and a few curios."""
    p = Prop("magic_bookcase")
    w, d, h = 1.3, 0.42, 2.25
    p.box((w, d, 0.08), (0, 0, 0.04), M.oak_dark, bevel=0.015, segments=2)
    p.box((w - 0.04, 0.03, h), (0, d / 2 - 0.02, h / 2), M.oak_dark, bevel=0)
    for side in (-1, 1):
        p.box((0.07, d, h), (side * (w / 2 - 0.035), 0, h / 2), M.oak, bevel=0.015, segments=2)
        # Turned brass finials on the corners.
        p.lathe([(0.0, 0.0), (0.035, 0.0), (0.04, 0.03), (0.02, 0.06), (0.035, 0.09), (0.0, 0.13)], (side * (w / 2 - 0.035), -d / 2 + 0.04, h + 0.06), M.brass, segments=12)
    p.box((w + 0.1, d + 0.06, 0.07), (0, 0, h + 0.03), M.oak, bevel=0.015, segments=2)
    # A pointed pediment with a gold star.
    p.prism([(-w / 2 + 0.05, 0), (w / 2 - 0.05, 0), (0, 0.24)], 0.06, (0, -d / 2 + 0.03, h + 0.065), M.oak_dark, bevel=0.01)
    p.prism([(x, z + h + 0.15) for x, z in star_points(0.055, 0.024)], 0.02, (0, -d / 2 - 0.005, 0), M.gold)
    shelves = 5
    gap = (h - 0.12) / shelves
    for s_ in range(shelves):
        z = 0.08 + s_ * gap
        p.box((w - 0.1, d - 0.04, 0.035), (0, 0, z + 0.0175), M.oak_light, bevel=0.008, segments=1)
        shelf_of_books(p, -w / 2 + 0.08, w / 2 - 0.08, z + 0.035, -0.02, d - 0.12, gap - 0.08, seed=200 + s_)
    p.export(os.path.join(OUT, "magic_bookcase.glb"))


def cauldron():
    """A big black cauldron on three iron legs over a few glowing embers, full of bubbling green brew."""
    p = Prop("magic_cauldron")
    shell = [(0.0, 0.0), (0.22, 0.01), (0.4, 0.08), (0.48, 0.22), (0.47, 0.36), (0.4, 0.47), (0.37, 0.5), (0.4, 0.53)]
    p.lathe(shell, (0, 0, 0.18), M.soot, segments=28)
    p.torus(0.385, 0.035, (0, 0, 0.7), M.soot, segments=28, sides=8)
    # Brew surface with bubbles of different sizes.
    p.cylinder(0.36, 0.02, (0, 0, 0.66), M.brew, verts=28)
    r = rng(14)
    for _ in range(9):
        a = r.uniform(0, 2 * math.pi)
        rad = r.uniform(0, 0.27)
        size = r.uniform(0.025, 0.06)
        p.sphere(size, (math.cos(a) * rad, math.sin(a) * rad, 0.67 + size * 0.3), M.brew, scale=(1, 1, 0.75), segments=10, rings=6)
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.4
        p.cylinder(0.035, 0.24, (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.12), M.iron, rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), verts=8)
    # Handles, a big wooden ladle and embers below.
    for side in (-1, 1):
        p.torus(0.06, 0.012, (side * 0.47, 0, 0.62), M.iron, rot=(math.pi / 2, 0, math.pi / 2), segments=14, sides=6)
    p.cylinder(0.018, 0.75, (0.12, 0.05, 0.85), M.oak_light, rot=(0.25, 0.35, 0), verts=8)
    p.sphere(0.06, (0.0, -0.02, 0.62), M.oak_light, scale=(1, 1, 0.5), segments=10, rings=6)
    for i in range(7):
        a = r.uniform(0, 2 * math.pi)
        rad = r.uniform(0.05, 0.22)
        p.box((0.09, 0.07, 0.05), (math.cos(a) * rad, math.sin(a) * rad, 0.03), M.ember if i % 2 else M.fire_log, rot=(0, 0, a), bevel=0.015, segments=1)
    p.export(os.path.join(OUT, "magic_cauldron.glb"))


def candelabra():
    """A tall brass floor candelabra: a tripod foot, a knotted stem and five candles on curling arms."""
    p = Prop("magic_candelabra")
    for i in range(3):
        a = i * 2 * math.pi / 3
        p.box((0.32, 0.05, 0.04), (math.cos(a) * 0.13, math.sin(a) * 0.13, 0.03), M.brass, rot=(0, 0, a), bevel=0.012, segments=2)
        p.sphere(0.035, (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.035), M.brass, segments=10, rings=6)
    stem = [(0.05, 0.0), (0.03, 0.15), (0.05, 0.25), (0.022, 0.32), (0.022, 0.95), (0.05, 1.0), (0.022, 1.06), (0.022, 1.3), (0.045, 1.34), (0.0, 1.36)]
    p.lathe(stem, (0, 0, 0.03), M.brass, segments=14)
    arms = [(-0.3, 1.25), (-0.17, 1.33), (0.0, 1.4), (0.17, 1.33), (0.3, 1.25)]
    for x, z in arms:
        if abs(x) > 0.01:
            p.torus(abs(x) / 2, 0.014, (x / 2, 0, 1.22), M.brass, rot=(math.pi / 2, 0, 0), segments=14, sides=6, arc=math.pi)
        p.cylinder(0.045, 0.03, (x, 0, z), M.brass, verts=12)
        candle(p, x, 0, z + 0.015, 0.16 + (0.04 if x == 0 else 0), radius=0.028)
    p.export(os.path.join(OUT, "magic_candelabra.glb"))


def candle_float():
    """One floating candle with drips and a flame (the hall has dozens drifting under the vaults)."""
    p = Prop("magic_candle_float")
    candle(p, 0, 0, 0, 0.26, radius=0.04, r=rng(3))
    p.export(os.path.join(OUT, "magic_candle_float.glb"))


def torch():
    """A wall torch: an iron bracket, a wooden haft wrapped in cloth and a tall flame. Origin at the wall."""
    p = Prop("magic_torch")
    p.box((0.12, 0.03, 0.22), (0, -0.015, 0), M.iron, bevel=0.01, segments=1)
    p.box((0.03, 0.18, 0.03), (0, -0.1, 0.0), M.iron, bevel=0.006, segments=1)
    p.torus(0.045, 0.012, (0, -0.19, 0.0), M.iron, segments=14, sides=6)
    p.cylinder(0.03, 0.36, (0, -0.19, 0.08), M.oak_dark, rot=(0.15, 0, 0), verts=10)
    p.cylinder(0.05, 0.1, (0, -0.215, 0.24), M.fire_log, rot=(0.15, 0, 0), verts=10, radius_top=0.06)
    flame(p, 0, -0.225, 0.27, 0.28)
    p.export(os.path.join(OUT, "magic_torch.glb"))


def banner(colour):
    """A hanging banner on a brass pole with a gold crescent and star, gold fringe and a pointed tail."""

    def build():
        p = Prop(f"magic_banner_{colour}")
        cloth = M.cloth[colour]
        w, h = 0.62, 1.3
        p.cylinder(0.018, w + 0.22, (0, 0, 0), M.brass, rot=(0, math.pi / 2, 0), verts=10)
        for side in (-1, 1):
            p.sphere(0.035, (side * (w / 2 + 0.11), 0, 0), M.gold, segments=10, rings=6)
        p.cloth(w, h, (0, -0.02, -0.03), cloth, waves=1.5, depth=0.025)
        # Swallow-tail point at the bottom.
        p.prism([(-w / 2, 0), (w / 2, 0), (w / 2, -0.12), (0, -0.26), (-w / 2, -0.12)], 0.02, (0, -0.02, -h - 0.02), cloth)
        p.prism([(-w / 2 + 0.03, 0), (w / 2 - 0.03, 0), (w / 2 - 0.03, -0.1), (0, -0.22), (-w / 2 + 0.03, -0.1)], 0.01, (0, -0.035, -h - 0.04), M.gold)
        p.prism([(-w / 2 + 0.05, 0), (w / 2 - 0.05, 0), (w / 2 - 0.05, -0.085), (0, -0.19), (-w / 2 + 0.05, -0.085)], 0.01, (0, -0.042, -h - 0.05), cloth)
        # A gold band at the top and the emblem: crescent moon with a star in its arms.
        p.box((w, 0.03, 0.07), (0, -0.04, -0.09), M.gold, bevel=0.005, segments=1)
        p.prism([(x * 0.16, z * 0.16 - 0.62) for x, z in crescent_points(1, 0.45)], 0.02, (0, -0.05, 0), M.gold)
        p.prism([(x + 0.07, z - 0.6) for x, z in star_points(0.06, 0.025)], 0.02, (0, -0.05, 0), M.gold)
        for i in range(11):
            p.cylinder(0.008, 0.07, (-w / 2 + 0.04 + i * (w - 0.08) / 10, -0.02, -h + 0.02), M.gold, verts=5)
        p.export(os.path.join(OUT, f"magic_banner_{colour}.glb"))

    build.__name__ = f"banner_{colour}"
    return build


def feast_table():
    """A long feast table with a runner cloth, gold plates and goblets, candlesticks, a roast and a pumpkin pie,
    and a bench along each side. 3.2 long (X) by 0.9 deep."""
    p = Prop("magic_feast_table")
    length, depth, top = 3.2, 0.9, 0.62
    p.box((length, depth, 0.07), (0, 0, top - 0.035), M.oak, bevel=0.02, segments=2)
    for x in (-length / 2 + 0.2, length / 2 - 0.2):
        for y in (-depth / 2 + 0.12, depth / 2 - 0.12):
            p.lathe([(0.05, 0.0), (0.06, 0.04), (0.035, 0.12), (0.05, 0.3), (0.035, 0.48), (0.05, top - 0.07), (0.05, top - 0.06)], (x, y, 0), M.oak_dark, segments=10)
    p.box((length - 0.4, 0.05, 0.05), (0, 0, 0.14), M.oak_dark, bevel=0.01, segments=1)
    # Runner down the middle with a gold edge.
    p.box((length - 0.1, 0.36, 0.008), (0, 0, top + 0.004), M.cloth["violet"], bevel=0)
    for y in (-0.18, 0.18):
        p.box((length - 0.1, 0.025, 0.01), (0, y, top + 0.006), M.gold, bevel=0)
    for side in (-1, 1):
        # Benches.
        y = side * (depth / 2 + 0.32)
        p.box((length - 0.2, 0.3, 0.06), (0, y, 0.4), M.oak_light, bevel=0.015, segments=2)
        for x in (-length / 2 + 0.3, 0, length / 2 - 0.3):
            p.box((0.06, 0.24, 0.37), (x, y, 0.185), M.oak_dark, bevel=0.01, segments=1)
    # Place settings along both sides.
    r = rng(31)
    for i in range(4):
        x = -length / 2 + 0.45 + i * (length - 0.9) / 3
        for side in (-1, 1):
            y = side * 0.3
            p.cylinder(0.11, 0.015, (x, y, top + 0.008), M.gold, verts=18)
            p.cylinder(0.08, 0.012, (x, y, top + 0.018), M.plate_white, verts=18)
            p.lathe([(0.0, 0.0), (0.035, 0.0), (0.012, 0.015), (0.01, 0.07), (0.04, 0.1), (0.045, 0.16)], (x + 0.16 * side, y - 0.02 * side, top), M.gold, segments=12)
    # Centrepieces: two candlesticks, a roast on a platter, a pumpkin pie, a bread loaf and a fruit bowl.
    for x in (-0.75, 0.75):
        p.lathe([(0.06, 0.0), (0.02, 0.03), (0.016, 0.16), (0.04, 0.18)], (x, 0, top), M.brass, segments=12)
        candle(p, x, 0, top + 0.18, 0.2, radius=0.03)
    p.cylinder(0.2, 0.02, (0, 0, top + 0.01), M.gold, verts=20)
    p.sphere(0.13, (0, 0, top + 0.08), M.food_crust, scale=(1.3, 0.9, 0.7), segments=14, rings=8)
    for side in (-1, 1):
        p.cylinder(0.025, 0.12, (side * 0.17, 0, top + 0.09), M.food_crust, rot=(0, side * 1.1, 0), verts=8)
        p.sphere(0.03, (side * 0.23, 0, top + 0.12), M.plate_white, segments=8, rings=6)
    p.cylinder(0.14, 0.05, (-1.25, 0, top + 0.025), M.food_crust, verts=18)
    p.cylinder(0.12, 0.012, (-1.25, 0, top + 0.055), M.pumpkin, verts=18)
    p.sphere(0.1, (1.25, 0.02, top + 0.06), M.food_crust, scale=(1.5, 0.8, 0.6), segments=12, rings=8)
    p.lathe([(0.0, 0.0), (0.06, 0.0), (0.13, 0.06), (0.14, 0.07)], (0.45, 0.05, top), M.gold, segments=16)
    for i in range(5):
        a = i * 1.3
        p.sphere(0.045, (0.45 + math.cos(a) * 0.06, 0.05 + math.sin(a) * 0.06, top + 0.09 + (i % 2) * 0.03), M.food_red if i % 2 else M.food_green, segments=10, rings=6)
    p.export(os.path.join(OUT, "magic_feast_table.glb"))


def wizard(name, robe, hat_colour, skin, beard, seed, glasses=False):
    """A seated wizard: a robe with a cape collar, a round head, a long beard (or none), and a tall bent hat."""

    def build():
        p = Prop(name)
        r = rng(seed)
        robe_m = M.cloth[robe]
        hat_m = M.cloth[hat_colour]
        skin_m = M.skin[skin]
        # Seated: legs forward (front is -Y), body upright. Origin under the seat.
        p.lathe([(0.0, 0.0), (0.26, 0.0), (0.28, 0.12), (0.22, 0.45), (0.16, 0.62), (0.0, 0.66)], (0, 0, 0.0), robe_m, segments=20)
        p.box((0.36, 0.34, 0.14), (0, -0.2, 0.08), robe_m, bevel=0.06, segments=3)
        for side in (-1, 1):
            p.sphere(0.06, (side * 0.1, -0.38, 0.06), M.oak_dark, scale=(1, 1.4, 0.8), segments=10, rings=6)
        # Collar, belt with a gold buckle, sleeves with hands.
        p.torus(0.15, 0.04, (0, 0, 0.58), robe_m, segments=18, sides=8)
        p.torus(0.235, 0.022, (0, 0, 0.3), M.oak_dark, segments=20, sides=6)
        p.box((0.06, 0.02, 0.05), (0, -0.25, 0.3), M.gold, bevel=0.008, segments=1)
        for side in (-1, 1):
            p.cylinder(0.065, 0.3, (side * 0.2, -0.12, 0.38), robe_m, rot=(0.9, 0, side * 0.3), verts=10, radius_top=0.09)
            p.sphere(0.05, (side * 0.17, -0.27, 0.27), skin_m, segments=10, rings=6)
        # Head, nose, eyes.
        hz = 0.8
        p.sphere(0.16, (0, 0, hz), skin_m, segments=18, rings=12)
        p.sphere(0.035, (0, -0.16, hz - 0.01), skin_m, scale=(1, 1, 1.2), segments=10, rings=6)
        for side in (-1, 1):
            p.sphere(0.02, (side * 0.06, -0.145, hz + 0.03), M.pupil, segments=8, rings=6)
            p.sphere(0.04, (side * 0.13, -0.07, hz + 0.08), M.beard_grey if beard else M.oak_dark, scale=(1, 0.6, 0.7), segments=8, rings=6)
        if glasses:
            for side in (-1, 1):
                p.torus(0.035, 0.007, (side * 0.06, -0.155, hz + 0.03), M.brass, rot=(math.pi / 2, 0, 0), segments=14, sides=5)
            p.box((0.04, 0.008, 0.008), (0, -0.16, hz + 0.035), M.brass, bevel=0)
        if beard:
            beard_m = M.beard if beard == "white" else M.beard_grey
            # A long beard falling over the chest: a flattened cone with its tip curling forward, and a moustache.
            p.lathe([(0.0, 0.0), (0.04, 0.03), (0.09, 0.14), (0.12, 0.26), (0.11, 0.33), (0.0, 0.36)], (0, -0.15, hz - 0.42), beard_m, segments=16, rot=(-0.2, 0, 0), scale=(1, 0.55, 1), close_top=True)
            for side in (-1, 1):
                p.sphere(0.05, (side * 0.045, -0.165, hz - 0.045), beard_m, scale=(1.2, 0.6, 0.55), rot=(0, side * 0.4, 0), segments=10, rings=6)
        else:
            p.sphere(0.17, (0, 0.02, hz + 0.04), M.oak_dark, scale=(1, 1, 0.85), segments=14, rings=8)
        # The hat: a wide brim and a tall cone that bends back at the tip, a band and a star.
        p.cylinder(0.27, 0.025, (0, 0, hz + 0.12), hat_m, verts=24)
        bend = r.uniform(0.25, 0.45)
        segments = [(0.17, 0.0), (0.14, 0.12), (0.1, 0.22), (0.065, 0.3), (0.035, 0.36), (0.0, 0.42)]
        for i in range(len(segments) - 1):
            (r0, z0), (r1, z1) = segments[i], segments[i + 1]
            lean = bend * (i / (len(segments) - 1)) ** 1.6
            offset = sum(bend * (k / (len(segments) - 1)) ** 1.6 * 0.12 for k in range(i + 1))
            p.cylinder(r0, z1 - z0 + 0.005, (0, offset, hz + 0.13 + (z0 + z1) / 2), hat_m, rot=(-lean, 0, 0), verts=16, radius_top=r1)
        p.cylinder(0.172, 0.035, (0, 0, hz + 0.155), M.gold if hat_colour != "crimson" else M.oak_dark, verts=20)
        p.prism([(x, z + hz + 0.27) for x, z in star_points(0.04, 0.017)], 0.012, (0, -0.135, 0), M.gold, rot=(0.3, 0, 0))
        p.export(os.path.join(OUT, f"{name}.glb"))

    build.__name__ = name
    return build


def herbs():
    """A clay pot of glowing blue mushrooms and fern fronds, small enough to stand on a counter."""
    p = Prop("magic_herbs")
    p.lathe([(0.0, 0.0), (0.11, 0.0), (0.14, 0.13), (0.16, 0.16), (0.15, 0.18)], (0, 0, 0), M.clay, segments=16)
    p.cylinder(0.14, 0.02, (0, 0, 0.165), M.fire_log, verts=16)
    r = rng(9)
    # Slim fern fronds arching outwards, each a tapered blade.
    for i in range(7):
        a = i * 0.9 + r.uniform(-0.2, 0.2)
        length = r.uniform(0.2, 0.28)
        tilt = r.uniform(0.45, 0.75)
        p.cylinder(0.022, length, (math.cos(a) * (0.06 + length * 0.3), math.sin(a) * (0.06 + length * 0.3), 0.17 + length * 0.42), M.leaf if i % 2 else M.leaf_light, rot=(-math.sin(a) * tilt, math.cos(a) * tilt, 0), verts=6, radius_top=0.002)
    # A cluster of glowing toadstools in the middle, tallest at the back.
    for i, (x, y, height, cap) in enumerate(((0.0, 0.03, 0.17, 0.065), (-0.06, -0.03, 0.11, 0.05), (0.06, -0.04, 0.09, 0.045), (0.03, 0.07, 0.13, 0.05), (-0.05, 0.06, 0.07, 0.035))):
        p.cylinder(0.014, height, (x, y, 0.17 + height / 2), M.paper, verts=8)
        p.sphere(cap, (x, y, 0.17 + height), M.mushroom_glow, scale=(1, 1, 0.55), segments=14, rings=7)
        p.sphere(cap * 0.18, (x + cap * 0.4, y - cap * 0.3, 0.17 + height + cap * 0.38), M.paper, segments=6, rings=4)
    p.export(os.path.join(OUT, "magic_herbs.glb"))


def globe():
    """An armillary sphere: brass rings round a glowing blue orb, on a turned wooden stand."""
    p = Prop("magic_globe")
    p.lathe([(0.0, 0.0), (0.2, 0.0), (0.2, 0.05), (0.08, 0.1), (0.05, 0.5), (0.09, 0.55), (0.0, 0.56)], (0, 0, 0), M.oak_dark, segments=16)
    p.sphere(0.13, (0, 0, 0.82), M.crystal_blue, segments=18, rings=12)
    p.torus(0.25, 0.012, (0, 0, 0.82), M.brass, rot=(math.pi / 2, 0, 0.4), segments=28, sides=6)
    p.torus(0.22, 0.012, (0, 0, 0.82), M.brass, rot=(0.4, 0, 0), segments=28, sides=6)
    p.torus(0.2, 0.012, (0, 0, 0.82), M.brass, rot=(math.pi / 2, 0, -0.9), segments=28, sides=6)
    p.cylinder(0.012, 0.32, (0, 0, 0.66), M.brass, verts=8)
    p.export(os.path.join(OUT, "magic_globe.glb"))


def crystal_ball():
    """A crystal ball glowing violet on a three-clawed brass stand atop a small round table."""
    p = Prop("magic_crystal_ball")
    p.cylinder(0.32, 0.05, (0, 0, 0.7), M.cloth["navy"], verts=24)
    p.cylinder(0.3, 0.03, (0, 0, 0.66), M.oak_dark, verts=24)
    p.lathe([(0.2, 0.0), (0.05, 0.08), (0.04, 0.55), (0.1, 0.63), (0.0, 0.64)], (0, 0, 0), M.oak_dark, segments=14)
    for i in range(3):
        a = i * 2 * math.pi / 3
        p.box((0.03, 0.02, 0.12), (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.78), M.brass, rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0), bevel=0.006, segments=1)
    p.cylinder(0.09, 0.04, (0, 0, 0.745), M.brass, verts=16)
    p.sphere(0.13, (0, 0, 0.88), M.crystal, segments=22, rings=14)
    p.export(os.path.join(OUT, "magic_crystal_ball.glb"))


def potion_table():
    """A small alchemist's table crowded with potions, a mortar and pestle, an open book and a candle."""
    p = Prop("magic_potion_table")
    w, d, top = 1.0, 0.55, 0.62
    p.box((w, d, 0.05), (0, 0, top - 0.025), M.oak, bevel=0.012, segments=2)
    for x in (-w / 2 + 0.06, w / 2 - 0.06):
        for y in (-d / 2 + 0.06, d / 2 - 0.06):
            p.box((0.05, 0.05, top - 0.05), (x, y, (top - 0.05) / 2), M.oak_dark, bevel=0.01, segments=1)
    p.box((w - 0.1, d - 0.1, 0.03), (0, 0, 0.15), M.oak_dark, bevel=0.008, segments=1)
    r = rng(17)
    spots = [(-0.38, 0.1), (-0.27, 0.15), (-0.32, -0.05), (0.36, 0.14), (0.25, 0.12), (0.4, -0.04)]
    for i, (x, y) in enumerate(spots):
        potion(p, x, y, top, i % 4, M.potions[i % len(M.potions)], r.uniform(0.9, 1.25))
    # Bottles stored below.
    for i in range(4):
        potion(p, -0.3 + i * 0.2, 0.0, 0.165, (i + 1) % 4, M.potions[(i + 2) % len(M.potions)], 1.1)
    # Open spellbook.
    for side in (-1, 1):
        p.box((0.17, 0.24, 0.02), (side * 0.09, -0.06, top + 0.012), M.paper, rot=(0, side * 0.08, 0), bevel=0.004, segments=1)
    p.box((0.38, 0.27, 0.012), (0, -0.06, top + 0.004), M.book_covers[0], bevel=0.003, segments=1)
    # Mortar and pestle, and a candle.
    p.lathe([(0.0, 0.0), (0.05, 0.0), (0.07, 0.05), (0.065, 0.07), (0.0, 0.05)], (0.08, 0.15, top), M.stone_light, segments=14)
    p.cylinder(0.012, 0.13, (0.1, 0.15, top + 0.09), M.stone_light, rot=(0.4, 0.3, 0), verts=8)
    candle(p, -0.08, 0.17, top, 0.14, radius=0.03)
    p.export(os.path.join(OUT, "magic_potion_table.glb"))


def owl_perch():
    """A plump brown owl with big amber eyes on a wooden T-perch."""
    p = Prop("magic_owl_perch")
    p.cylinder(0.18, 0.05, (0, 0, 0.025), M.oak_dark, verts=16)
    p.cylinder(0.03, 1.2, (0, 0, 0.62), M.oak, verts=10)
    p.cylinder(0.025, 0.5, (0, 0, 1.24), M.oak, rot=(0, math.pi / 2, 0), verts=10)
    oz = 1.27
    p.sphere(0.15, (0, 0, oz + 0.15), M.feather, scale=(1, 0.9, 1.15), segments=18, rings=12)
    p.sphere(0.11, (0, -0.07, oz + 0.12), M.feather_light, scale=(1, 0.6, 1.1), segments=14, rings=8)
    p.sphere(0.12, (0, 0, oz + 0.36), M.feather, scale=(1.1, 0.95, 0.9), segments=16, rings=10)
    for side in (-1, 1):
        p.sphere(0.055, (side * 0.05, -0.09, oz + 0.37), M.feather_light, scale=(1, 0.5, 1), segments=12, rings=8)
        p.sphere(0.034, (side * 0.05, -0.115, oz + 0.37), M.eye, segments=10, rings=8)
        p.sphere(0.017, (side * 0.05, -0.143, oz + 0.37), M.pupil, segments=8, rings=6)
        p.prism([(-0.03, 0), (0.03, 0), (0, 0.07)], 0.03, (side * 0.08, -0.02, oz + 0.44), M.feather, rot=(0, side * 0.3, 0))
        p.sphere(0.07, (side * 0.13, 0.01, oz + 0.15), M.feather, scale=(0.4, 0.8, 1.3), segments=10, rings=8)
        for k in (-1, 0, 1):
            p.cylinder(0.008, 0.05, (side * 0.05 + k * 0.012, -0.03, oz + 0.005), M.gold, rot=(1.2, 0, 0), verts=5)
    p.prism([(-0.02, 0), (0.02, 0), (0, -0.05)], 0.025, (0, -0.13, oz + 0.35), M.gold)
    p.export(os.path.join(OUT, "magic_owl_perch.glb"))


def lectern():
    """A carved lectern with a huge open spellbook, a ribbon bookmark and a quill in an ink pot."""
    p = Prop("magic_lectern")
    p.box((0.5, 0.4, 0.06), (0, 0, 0.03), M.oak_dark, bevel=0.015, segments=2)
    p.lathe([(0.08, 0.0), (0.05, 0.06), (0.05, 0.9), (0.09, 0.95), (0.0, 0.96)], (0, 0, 0.06), M.oak, segments=12)
    p.box((0.6, 0.42, 0.04), (0, 0.02, 1.06), M.oak, rot=(-0.4, 0, 0), bevel=0.012, segments=2)
    p.box((0.6, 0.04, 0.05), (0, -0.18, 0.96), M.oak_dark, rot=(-0.4, 0, 0), bevel=0.01, segments=1)
    for side in (-1, 1):
        p.box((0.26, 0.36, 0.035), (side * 0.135, 0.01, 1.1), M.paper, rot=(-0.4, side * 0.1, 0), bevel=0.008, segments=1)
        for line in range(5):
            p.box((0.16, 0.005, 0.008), (side * 0.135, -0.06 + line * 0.055, 1.07 + line * 0.022 + 0.028), M.wick, rot=(-0.4, 0, 0), bevel=0)
    p.box((0.56, 0.38, 0.02), (0, 0.015, 1.08), M.book_covers[3], rot=(-0.4, 0, 0), bevel=0.004, segments=1)
    p.box((0.015, 0.005, 0.2), (0.02, -0.17, 0.98), M.cloth["crimson"], rot=(0.1, 0, 0), bevel=0)
    p.cylinder(0.035, 0.05, (0.24, 0.12, 1.2), M.lead, verts=12)
    p.box((0.012, 0.012, 0.22), (0.25, 0.12, 1.32), M.feather_light, rot=(0.3, 0.2, 0), bevel=0.004, segments=1)
    p.export(os.path.join(OUT, "magic_lectern.glb"))


def fireplace():
    """A great stone hearth: a pointed arch, a carved mantel with candles, a log fire and a hanging pot."""
    p = Prop("magic_fireplace")
    w, h, d = 2.0, 2.3, 0.6
    open_w, open_spring = 1.0, 0.5

    def in_opening(x, z):
        return inside_pointed_arch(x, z, open_w, open_spring, margin=0.12)

    stone_wall(p, w, h, d, seed=71, skip=in_opening, course=0.24)
    p.prism([(x, z) for x, z in pointed_arch(open_w + 0.1, open_spring)], 0.05, (0, 0.3, 0), M.soot)
    arch_frame(p, open_w, open_spring, 0.0, 0.14, d * 0.6, -0.02, M.stone_light, count=7)
    # Hearth slab, mantel shelf with corbels, and things on the mantel.
    p.box((w + 0.2, d + 0.4, 0.08), (0, 0.0, 0.04), M.stone_dark, bevel=0.02, segments=1)
    mantel_z = 1.55
    p.box((w + 0.16, 0.36, 0.1), (0, -0.12, mantel_z), M.stone_light, bevel=0.025, segments=2)
    for side in (-1, 1):
        p.box((0.14, 0.24, 0.2), (side * 0.8, -0.1, mantel_z - 0.15), M.stone_light, bevel=0.02, segments=1)
    for x in (-0.75, -0.6, 0.62, 0.78):
        candle(p, x, -0.15, mantel_z + 0.05, 0.12 + (abs(x) % 0.2), radius=0.03)
    potion(p, -0.3, -0.15, mantel_z + 0.05, 0, M.potions[1], 1.1)
    p.lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.08), (0.07, 0.18), (0.035, 0.22), (0.0, 0.22)], (0.3, -0.15, mantel_z + 0.05), M.brass, segments=16)
    p.prism([(x * 0.13, z * 0.13 + mantel_z + 0.45) for x, z in crescent_points(1, 0.45)], 0.04, (0, -0.02, 0), M.gold)
    # Fire: crossed logs, embers and a cluster of flames, with a small pot on a chain above.
    for i, a in enumerate((0.5, -0.5, 1.4)):
        p.cylinder(0.06, 0.6, (0, 0.1, 0.16 + i * 0.05), M.fire_log, rot=(0, math.pi / 2, a), verts=10)
    for i in range(6):
        p.sphere(0.05, (-0.22 + i * 0.09, 0.05, 0.12), M.ember, scale=(1, 1, 0.5), segments=8, rings=6)
    for x, height in ((-0.15, 0.4), (0.02, 0.55), (0.18, 0.38), (-0.05, 0.3), (0.1, 0.3)):
        flame(p, x, 0.1, 0.18, height)
    p.cylinder(0.008, 0.45, (0, 0.05, 1.05), M.iron, verts=5)
    p.lathe([(0.0, 0.0), (0.1, 0.01), (0.15, 0.08), (0.14, 0.15), (0.12, 0.17)], (0, 0.05, 0.68), M.soot, segments=18)
    p.cylinder(0.11, 0.01, (0, 0.05, 0.84), M.brew, verts=16)
    p.export(os.path.join(OUT, "magic_fireplace.glb"))


def chandelier():
    """An iron ring chandelier hanging on three chains, with eight candles. Origin at the top hook."""
    p = Prop("magic_chandelier")
    p.torus(0.55, 0.03, (0, 0, -1.1), M.iron, segments=36, sides=8)
    p.torus(0.5, 0.015, (0, 0, -1.05), M.iron, segments=36, sides=6)
    for i in range(8):
        a = i * math.pi / 4
        x, y = math.cos(a) * 0.55, math.sin(a) * 0.55
        p.cylinder(0.05, 0.03, (x, y, -1.07), M.iron, verts=10)
        candle(p, x, y, -1.055, 0.15, radius=0.028)
    for i in range(3):
        a = i * 2 * math.pi / 3
        length = math.hypot(0.55, 1.04)
        tilt = math.atan2(0.55, 1.04)
        p.cylinder(0.008, length, (math.cos(a) * 0.275, math.sin(a) * 0.275, -0.56), M.iron, rot=(0, tilt, a), verts=4)
    p.sphere(0.06, (0, 0, -0.02), M.iron, segments=10, rings=6)
    p.export(os.path.join(OUT, "magic_chandelier.glb"))


def pillar():
    """A clustered gothic stone pillar with a carved base and capital, 2.7 tall."""
    p = Prop("magic_pillar")
    h = 2.7
    p.box((0.62, 0.62, 0.18), (0, 0, 0.09), M.stone_light, bevel=0.03, segments=2)
    p.box((0.52, 0.52, 0.1), (0, 0, 0.23), M.stone_light, bevel=0.025, segments=2)
    p.cylinder(0.2, h - 0.62, (0, 0, 0.28 + (h - 0.62) / 2), M.stones[0], verts=16)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        p.cylinder(0.08, h - 0.62, (math.cos(a) * 0.19, math.sin(a) * 0.19, 0.28 + (h - 0.62) / 2), M.stones[2], verts=10)
    for z in (0.95, 1.8):
        p.torus(0.27, 0.025, (0, 0, z), M.stone_light, segments=24, sides=6)
    p.lathe([(0.28, 0.0), (0.3, 0.05), (0.42, 0.22), (0.42, 0.3)], (0, 0, h - 0.34), M.stone_light, segments=16, close_top=True)
    p.export(os.path.join(OUT, "magic_pillar.glb"))


def door():
    """A magic door for the teleport pads: a pointed stone archway on a step, with gold runes on the jambs. The
    swirling portal inside is drawn by the game. Origin at the middle of the tile; the arch stands on its back edge."""
    p = Prop("magic_door")
    open_w, spring = 0.62, 0.62
    back = 0.38
    p.box((0.92, 0.3, 0.06), (0, back - 0.05, 0.03), M.stone_light, bevel=0.015, segments=1)
    arch_frame(p, open_w, spring, 0.06, 0.13, 0.22, back, M.stones[2], count=7)
    p.prism([(x, z + 0.06) for x, z in pointed_arch(open_w + 0.1, spring)], 0.03, (0, back + 0.1, 0), M.recess)
    for side in (-1, 1):
        x = side * (open_w / 2 + 0.065)
        for k in range(3):
            p.prism([(px * 0.4 + x, pz * 0.4 + 0.26 + k * 0.2) for px, pz in star_points(0.08, 0.035, points=4)], 0.01, (0, back - 0.115, 0), M.glass[1])
        p.sphere(0.035, (x, back - 0.12, spring + 0.08), M.gold, segments=10, rings=6)
    p.prism([(x * 0.06, z * 0.06 + spring + open_w * 0.866 + 0.17) for x, z in crescent_points(1, 0.45)], 0.02, (0, back - 0.13, 0), M.gold)
    p.export(os.path.join(OUT, "magic_door.glb"))


def counter():
    """The castle kitchen's worktop cabinet, one tile: oak panels with iron straps under a pale stone slab."""
    p = Prop("magic_counter")
    p.box((0.98, 0.92, 0.06), (0, 0, 0.03), M.stone_dark, bevel=0.012, segments=1)
    p.box((0.94, 0.88, 0.37), (0, 0, 0.245), M.oak, bevel=0.02, segments=2)
    for x in (-0.22, 0.22):
        p.box((0.38, 0.02, 0.27), (x, -0.445, 0.245), M.oak_dark, bevel=0.008, segments=1)
        p.box((0.32, 0.02, 0.21), (x, -0.452, 0.245), M.oak_light, bevel=0.008, segments=1)
        p.sphere(0.018, (x + (0.12 if x < 0 else -0.12), -0.47, 0.245), M.brass, segments=8, rings=6)
    for z in (0.14, 0.36):
        p.box((0.96, 0.02, 0.03), (0, -0.455, z), M.iron, bevel=0.004, segments=1)
    # A butcher-block worktop of warm oak strips, so food on it stands out from the grey flagstones.
    for i in range(6):
        p.box((1.0 / 6 - 0.004, 1.0, 0.07), (-0.5 + (i + 0.5) / 6, 0, 0.47), M.butcher[i % 3], bevel=0.008, segments=1)
    p.box((1.0, 0.04, 0.03), (0, -0.48, 0.43), M.iron, bevel=0.004, segments=1)
    p.export(os.path.join(OUT, "magic_counter.glb"))




# ---------------------------------------------------------------------------------------------------- the tall hall

UPPER_H = 4.6
TOP_H = 5.0


def string_course(p, width, z, seed):
    """A moulded stone ledge running across the wall, carried on little carved corbels."""
    p.box((width, 0.22, 0.12), (0, -0.08, z + 0.06), M.stone_light, bevel=0.03, segments=2)
    p.box((width, 0.16, 0.06), (0, -0.05, z - 0.03), M.stone_light, bevel=0.015, segments=1)
    for i in range(4):
        x = -width / 2 + 0.25 + i * (width - 0.5) / 3
        p.box((0.12, 0.16, 0.14), (x, -0.06, z - 0.12), M.stone_light, bevel=0.02, segments=1)


def wall_upper():
    """The middle tier of the hall: a tall twin-lancet stained-glass window under one arch, with an oculus above."""
    p = Prop("magic_wall_upper")
    win_w, spring, bottom = 1.06, 1.9, 0.75

    def in_window(x, z):
        return inside_pointed_arch(x, z - bottom, win_w, spring, margin=0.14)

    stone_wall(p, WALL_W, UPPER_H, WALL_D, seed=51, skip=in_window, course=0.3, wide=True)
    string_course(p, WALL_W, 0.0, 1)
    outline = [(x, z + bottom) for x, z in pointed_arch(win_w, spring)]
    p.prism(outline, 0.012, (0, 0.03, 0), M.lead)
    # Two lancets of diamond panes divided by a slim stone mullion, a round oculus in the head.
    r = rng(12)
    cell = 0.12
    half = cell / 2
    lancet_w = (win_w - 0.08) / 2
    for side in (-1, 1):
        cx = side * (lancet_w / 2 + 0.04)
        for j in range(int((spring + 0.3) / half)):
            for i in range(-3, 4):
                x = cx + i * cell + (half if j % 2 else 0.0)
                z = j * half
                if not inside_pointed_arch(x - cx, z, lancet_w, spring - 0.25, margin=-0.03):
                    continue
                edge = not inside_pointed_arch(x - cx, z, lancet_w, spring - 0.25, margin=-0.09)
                ring = (abs(i) + j) % 4
                glass = M.glass[1] if edge else (M.glass[2] if ring == 0 and r.random() < 0.5 else M.glass[3] if ring == 2 else M.glass[0])
                p.quad(half * 1.36, half * 1.36, (x, 0.015, z + bottom), glass, rot=(0, math.pi / 4, 0))
    p.box((0.07, 0.16, spring + 0.15), (0, -0.02, bottom + (spring + 0.15) / 2), M.stone_light, bevel=0.015, segments=1)
    oculus_z = bottom + spring + 0.48
    p.torus(0.2, 0.045, (0, -0.02, oculus_z), M.stone_light, rot=(math.pi / 2, 0, 0), segments=24, sides=8)
    p.cylinder(0.17, 0.01, (0, 0.02, oculus_z), M.glass[4], rot=(math.pi / 2, 0, 0), verts=20)
    p.prism([(x + 0.0, z + oculus_z) for x, z in star_points(0.13, 0.055, points=6)], 0.012, (0, 0.006, 0), M.glass[1])
    for bz in (bottom + 0.5, bottom + 1.1, bottom + 1.6):
        p.box((win_w + 0.04, 0.016, 0.016), (0, 0.008, bz), M.iron, bevel=0)
    arch_frame(p, win_w, spring, bottom, 0.14, 0.22, -0.01, M.stone_light, count=9)
    p.box((win_w + 0.4, 0.3, 0.09), (0, -0.04, bottom - 0.045), M.stone_light, bevel=0.02, segments=1)
    timber_frame(p, WALL_W, UPPER_H, seed=9)
    p.export(os.path.join(OUT, "magic_wall_upper.glb"))


def wall_tapestry():
    """The middle tier, second kind: a great hanging tapestry with the keep's crest between two torches' sconces."""
    p = Prop("magic_wall_tapestry")
    stone_wall(p, WALL_W, UPPER_H, WALL_D, seed=63, course=0.3, wide=True)
    string_course(p, WALL_W, 0.0, 2)
    top = UPPER_H - 0.45
    p.cylinder(0.025, 1.45, (0, -0.1, top), M.brass, rot=(0, math.pi / 2, 0), verts=10)
    for side in (-1, 1):
        p.sphere(0.045, (side * 0.74, -0.1, top), M.gold, segments=10, rings=6)
        p.box((0.04, 0.12, 0.04), (side * 0.6, -0.04, top), M.iron, bevel=0.008, segments=1)
    p.cloth(1.3, 2.9, (0, -0.12, top - 0.03), M.cloth["navy"], waves=1.0, depth=0.03, cols=8, rows=8)
    p.cloth(1.16, 2.76, (0, -0.15, top - 0.1), M.cloth["violet"], waves=1.0, depth=0.03, cols=8, rows=8)
    # Crest: a gold shield outline with a crescent moon, a star and a cauldron below.
    cz = top - 1.2
    p.prism([(-0.32, 0.3), (0.32, 0.3), (0.32, -0.05), (0.0, -0.42), (-0.32, -0.05)], 0.02, (0, -0.18, cz), M.gold)
    p.prism([(-0.27, 0.25), (0.27, 0.25), (0.27, -0.03), (0.0, -0.35), (-0.27, -0.03)], 0.02, (0, -0.19, cz), M.cloth["crimson"])
    p.prism([(x * 0.14 - 0.03, z * 0.14 + cz + 0.08) for x, z in crescent_points(1, 0.45)], 0.02, (0, -0.205, 0), M.gold)
    p.prism([(x + 0.07, z + cz + 0.12) for x, z in star_points(0.06, 0.025)], 0.02, (0, -0.205, 0), M.gold)
    p.prism([(x * 0.6, z * 0.6 + cz - 0.18) for x, z in [(-0.15, 0.08), (0.15, 0.08), (0.12, -0.05), (0.06, -0.1), (-0.06, -0.1), (-0.12, -0.05)]], 0.02, (0, -0.205, 0), M.gold)
    # Gold borders and a fringe.
    for side in (-1, 1):
        p.box((0.04, 0.012, 2.6), (side * 0.52, -0.165, top - 1.4), M.gold, bevel=0)
    for i in range(14):
        p.cylinder(0.009, 0.1, (-0.6 + i * 1.2 / 13, -0.13, top - 2.97), M.gold, verts=5)
    timber_frame(p, WALL_W, UPPER_H, seed=10)
    p.export(os.path.join(OUT, "magic_wall_tapestry.glb"))


def wall_top():
    """The top tier, up into the rafters: rough stone, an arrow slit, and a great oak roof truss pinned to the wall."""
    p = Prop("magic_wall_top")
    stone_wall(p, WALL_W, TOP_H, WALL_D, seed=77, course=0.34, wide=True, skip=lambda x, z: abs(x) < 0.08 and 1.4 < z < 2.4)
    string_course(p, WALL_W, 0.0, 3)
    p.box((0.12, 0.05, 1.0), (0, 0.04, 1.9), M.recess, bevel=0)
    # The truss: a tie beam, two rafters meeting at the top, a king post and two struts, bolted with iron.
    tie_z = 1.0
    p.box((WALL_W + 0.02, 0.2, 0.22), (0, -0.12, tie_z), M.oak_dark, bevel=0.025, segments=2)
    rise = TOP_H - tie_z - 0.4
    run = WALL_W / 2
    length = math.hypot(run, rise)
    angle = math.atan2(rise, run)
    for side in (-1, 1):
        p.box((length, 0.18, 0.2), (side * run / 2, -0.11, tie_z + rise / 2), M.oak_dark, rot=(0, side * angle, 0), bevel=0.025, segments=2)
        p.box((0.1, 0.12, 1.3), (side * 0.32, -0.08, tie_z + 0.9), M.oak, rot=(0, side * -0.55, 0), bevel=0.015, segments=1)
    p.box((0.18, 0.16, rise), (0, -0.1, tie_z + rise / 2), M.oak, bevel=0.02, segments=2)
    for x, z in ((0, tie_z), (0, tie_z + rise * 0.98), (-0.85, tie_z + 0.1), (0.85, tie_z + 0.1)):
        p.box((0.16, 0.03, 0.16), (x, -0.22, z), M.iron, bevel=0.01, segments=1)
        p.sphere(0.022, (x, -0.24, z), M.iron, segments=6, rings=4)
    p.export(os.path.join(OUT, "magic_wall_top.glb"))


# ---------------------------------------------------------------------------------------------------- the stream

CHANNEL_DEPTH = 0.5


def channel_wall():
    """One tile of the stream's stone bank, running along Y. Its face is towards -X (the water) and its top is at
    floor level: dressed blocks going down to the bed, a coping stone overhanging the water, moss along the wet
    line and a fern or two. Origin at the top of the face."""
    p = Prop("magic_channel_wall")
    r = rng(91)
    p.box((0.2, 1.0, CHANNEL_DEPTH), (0.1, 0, -CHANNEL_DEPTH / 2), M.mortar, bevel=0)
    z = -CHANNEL_DEPTH
    row = 0
    while z < -0.08:
        h = min(0.13 + r.uniform(-0.02, 0.03), -0.08 - z)
        y = -0.5 - (r.uniform(0.05, 0.2) if row % 2 else 0)
        while y < 0.5:
            length = r.uniform(0.22, 0.4)
            y0, y1 = max(y, -0.5), min(y + length, 0.5)
            if y1 - y0 > 0.05:
                p.box((0.1, y1 - y0 - 0.015, h - 0.015), (r.uniform(-0.01, 0.015), (y0 + y1) / 2, z + h / 2), stone(r), bevel=0.02, segments=1)
            y += length
        z += h
        row += 1
    # Coping: big flat slabs with a rounded nose over the water.
    y = -0.5
    while y < 0.5 - 1e-3:
        length = min(r.uniform(0.3, 0.5), 0.5 - y)
        p.box((0.26, length - 0.012, 0.09), (0.06, y + length / 2, -0.045), M.stone_light, bevel=0.03, segments=2)
        y += length
    # Moss: soft green lumps along the waterline and creeping over the coping edge.
    for i in range(7):
        my = -0.45 + i * 0.15 + r.uniform(-0.04, 0.04)
        p.sphere(r.uniform(0.035, 0.06), (-0.04, my, -CHANNEL_DEPTH + 0.2 + r.uniform(-0.04, 0.04)), M.leaf, scale=(0.5, 1.6, 0.7), segments=8, rings=6)
    for i in range(4):
        my = -0.4 + i * 0.27 + r.uniform(-0.05, 0.05)
        p.sphere(r.uniform(0.04, 0.06), (-0.06, my, -0.06), M.leaf_light if i % 2 else M.leaf, scale=(0.8, 1.8, 0.45), segments=8, rings=6)
    # A small fern sprouting from a joint.
    fy = r.uniform(-0.2, 0.2)
    for k in range(5):
        a = -0.9 + k * 0.45
        p.cylinder(0.014, 0.16, (-0.05 + math.sin(a) * 0.03, fy + math.cos(a) * 0.06, -0.02), M.leaf_light, rot=(math.cos(a) * 0.9, -0.9, 0), verts=5, radius_top=0.002)
    p.export(os.path.join(OUT, "magic_channel_wall.glb"))


def riverbed():
    """One tile of stream bed: smooth river stones and pebbles of many sizes, a couple mossy, waterweed, and a few
    faintly glowing crystals that give the magic water its light. Origin at the bed's middle."""
    p = Prop("magic_riverbed")
    r = rng(47)
    p.box((1.0, 1.0, 0.04), (0, 0, -0.02), material("riverbed_silt", "#3a4a44", 0.95), bevel=0)
    pebble_cols = [material("pebble_a", "#7d8590", 0.6), material("pebble_b", "#9a8f80", 0.6), material("pebble_c", "#5f6670", 0.6), material("pebble_d", "#b5ae9e", 0.6)]
    for i in range(32):
        size = r.uniform(0.03, 0.065) if i > 8 else r.uniform(0.08, 0.13)
        x, y = r.uniform(-0.45, 0.45), r.uniform(-0.48, 0.48)
        p.sphere(size, (x, y, size * 0.25), pebble_cols[r.randrange(4)], scale=(1.0, r.uniform(0.7, 1.3), r.uniform(0.35, 0.55)), rot=(0, 0, r.uniform(0, 3)), segments=7, rings=4)
        if i < 4:
            p.sphere(size * 0.8, (x, y, size * 0.42), M.leaf, scale=(1.0, 1.0, 0.25), segments=8, rings=5)
    for i in range(4):
        x, y = r.uniform(-0.35, 0.35), r.uniform(-0.4, 0.4)
        for k in range(3):
            p.cylinder(0.012, r.uniform(0.18, 0.3), (x + k * 0.02, y, 0.1), M.leaf_light, rot=(r.uniform(-0.4, 0.4), r.uniform(-0.5, 0.1), 0), verts=5, radius_top=0.004)
    for i in range(2):
        x, y = r.uniform(-0.3, 0.3), r.uniform(-0.35, 0.35)
        for k in range(3):
            p.cylinder(0.02, r.uniform(0.07, 0.12), (x + (k - 1) * 0.025, y, 0.04), material("bed_crystal", "#5ff0c8", 0.1, emit=0.8), rot=(r.uniform(-0.4, 0.4), r.uniform(-0.4, 0.4), 0), verts=6, radius_top=0.003)
    p.export(os.path.join(OUT, "magic_riverbed.glb"))


def culvert():
    """Where the stream comes from: a low pointed arch at the foot of the back wall, its tunnel dark inside, an
    iron portcullis raised halfway, moss on the stones and a carved keystone. Origin at the floor, on the wall face."""
    p = Prop("magic_culvert")
    open_w, spring, base = 0.92, 0.35, -CHANNEL_DEPTH
    p.prism([(x, z + base) for x, z in pointed_arch(open_w + 0.04, spring)], 0.5, (0, 0.3, 0), M.recess)
    arch_frame(p, open_w, spring, base, 0.16, 0.34, 0.02, M.stone_light, count=8)
    # Portcullis: bars and cross rails, raised so its spiked foot hangs above the water.
    for i in range(6):
        x = -open_w / 2 + 0.1 + i * (open_w - 0.2) / 5
        p.box((0.025, 0.025, 0.7), (x, 0.05, 0.55), M.iron, bevel=0.004, segments=1)
        p.cylinder(0.018, 0.06, (x, 0.05, 0.17), M.iron, rot=(math.pi, 0, 0), verts=6, radius_top=0.0)
    for z in (0.3, 0.6, 0.85):
        p.box((open_w - 0.1, 0.03, 0.025), (0, 0.04, z), M.iron, bevel=0.004, segments=1)
    p.box((0.22, 0.1, 0.22), (0, -0.04, base + spring + open_w * 0.866 + 0.1), M.stone_light, bevel=0.02, segments=2)
    p.sphere(0.06, (0, -0.1, base + spring + open_w * 0.866 + 0.1), M.glass[4], segments=12, rings=8)
    r = rng(5)
    for i in range(8):
        a = math.pi - (math.pi / 3) * (i + 0.5) / 8
        side = -1 if i % 2 else 1
        x = side * r.uniform(0.3, 0.6)
        p.sphere(r.uniform(0.04, 0.07), (x, -0.13, base + r.uniform(0.0, 0.5)), M.leaf, scale=(1.4, 0.5, 0.8), segments=8, rings=6)
    p.export(os.path.join(OUT, "magic_culvert.glb"))


def bridge():
    """A little humpbacked stone bridge over the stream, for the hall in front of the kitchen. Spans X (2 long)."""
    p = Prop("magic_bridge")
    span, width, rise = 2.2, 0.9, 0.32
    steps = 9
    for i in range(steps):
        t = (i + 0.5) / steps
        x = -span / 2 + t * span
        z = math.sin(t * math.pi) * rise
        slope = math.cos(t * math.pi) * rise * math.pi / span
        p.box((span / steps + 0.01, width, 0.12), (x, 0, z + 0.06), M.stones[i % 5], rot=(0, -math.atan(slope), 0), bevel=0.02, segments=1)
        for side in (-1, 1):
            p.box((span / steps + 0.01, 0.12, 0.26), (x, side * (width / 2 - 0.06), z + 0.25), M.stone_light, rot=(0, -math.atan(slope), 0), bevel=0.02, segments=1)
    # The arch underneath, its voussoirs showing on both faces.
    for side in (-1, 1):
        for i in range(9):
            a = math.pi * (i + 0.5) / 9
            p.box((0.16, 0.06, 0.12), (math.cos(a) * 0.52, side * width / 2, -0.2 + math.sin(a) * 0.32), M.stone_light, rot=(0, -(a - math.pi / 2), 0), bevel=0.012, segments=1)
    for end in (-1, 1):
        p.box((0.4, width + 0.1, 0.7), (end * (span / 2 - 0.1), 0, -0.3), M.stones[2], bevel=0.03, segments=1)
        p.lathe([(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.05, 0.08), (0.06, 0.2), (0.0, 0.22)], (end * (span / 2 - 0.12), -width / 2 + 0.06, 0.32), M.stone_light, segments=10)
        p.lathe([(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.05, 0.08), (0.06, 0.2), (0.0, 0.22)], (end * (span / 2 - 0.12), width / 2 - 0.06, 0.32), M.stone_light, segments=10)
    p.export(os.path.join(OUT, "magic_bridge.glb"))


# ---------------------------------------------------------------------------------------------------- running

PROPS = {}


def register(*builders):
    for builder in builders:
        PROPS[builder.__name__] = builder


def render_preview(obj, path):
    """Renders the just-exported prop from the game's angle (front, above) on a dusky backdrop."""
    from mathutils import Vector

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = 560
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("preview") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.05, 0.09, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    centre = (lo + hi) / 2
    size = max(hi - lo)
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    direction = Vector((0.35, -1.0, 0.75)).normalized()
    cam.location = centre + direction * size * 2.1
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 50
    scene.camera = cam
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    fill_data = bpy.data.lights.new("fill", "SUN")
    fill_data.energy = 0.8
    fill_data.color = (0.6, 0.65, 1.0)
    fill = bpy.data.objects.new("fill", fill_data)
    fill.rotation_euler = (math.radians(60), 0, math.radians(150))
    scene.collection.objects.link(fill)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    only = None
    render_dir = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    if "--render" in args:
        render_dir = args[args.index("--render") + 1]
        os.makedirs(render_dir, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for name, builder in PROPS.items():
        if only and name not in only:
            continue
        clear_scene()
        builder()
        joined = bpy.context.view_layer.objects.active
        size = os.path.getsize(os.path.join(OUT, f"{joined.name}.glb"))
        print(f"built {joined.name}: {len(joined.data.vertices)} verts, {len(joined.data.materials)} materials, {size // 1024} KB")
        if render_dir:
            render_preview(joined, os.path.join(render_dir, f"{joined.name}.png"))
            for obj in [o for o in bpy.data.objects if o.name.startswith(("cam", "sun", "fill"))]:
                bpy.data.objects.remove(obj, do_unlink=True)


register(wall_arch, wall_window, wall_shelf)
register(
    bookcase,
    cauldron,
    candelabra,
    candle_float,
    torch,
    banner("violet"),
    banner("teal"),
    banner("crimson"),
    feast_table,
    wizard("magic_wizard_violet", "violet", "violet", 0, "white", 1),
    wizard("magic_wizard_teal", "teal", "navy", 1, "grey", 2),
    wizard("magic_wizard_crimson", "crimson", "crimson", 2, None, 3, glasses=True),
    wizard("magic_wizard_emerald", "emerald", "emerald", 0, None, 4),
    herbs,
    globe,
    crystal_ball,
    potion_table,
    owl_perch,
    lectern,
    fireplace,
    chandelier,
    pillar,
    door,
    counter,
)


def rail_post():
    """A railing post for the stream's banks: a stone footing, a turned oak post, an iron ring for the rope and a
    brass knob on top. Origin at its foot."""
    p = Prop("magic_rail_post")
    p.box((0.16, 0.16, 0.06), (0, 0, 0.03), M.stone_light, bevel=0.015, segments=1)
    p.lathe([(0.06, 0.0), (0.065, 0.04), (0.045, 0.08), (0.04, 0.42), (0.05, 0.45), (0.04, 0.48), (0.04, 0.56), (0.055, 0.6), (0.0, 0.61)], (0, 0, 0.06), M.oak, segments=12)
    p.torus(0.05, 0.012, (0, 0, 0.56), M.iron, segments=16, sides=6)
    p.sphere(0.055, (0, 0, 0.72), M.brass, segments=14, rings=10)
    p.cylinder(0.03, 0.03, (0, 0, 0.675), M.brass, verts=10)
    p.export(os.path.join(OUT, "magic_rail_post.glb"))


def rail_rope():
    """One tile of thick twisted rope sagging between two posts, along Y from -0.5 to 0.5 at post-ring height."""
    p = Prop("magic_rail_rope")
    rope = material("rope", "#c9a46a", 0.9)
    rope_dark = material("rope_dark", "#9c7a48", 0.9)
    top, sag, steps = 0.62, 0.1, 14
    points = []
    for i in range(steps + 1):
        t = i / steps
        points.append((-0.5 + t, top - sag * 4 * t * (1 - t)))
    for i in range(steps):
        (y0, z0), (y1, z1) = points[i], points[i + 1]
        length = math.hypot(y1 - y0, z1 - z0)
        tilt = math.atan2(z1 - z0, y1 - y0)
        p.cylinder(0.022, length + 0.004, (0, (y0 + y1) / 2, (z0 + z1) / 2), rope, rot=(math.pi / 2 + tilt, 0, 0), verts=8)
        # Twist marks: slim dark bands every segment, so it reads as rope rather than a pipe.
        p.torus(0.022, 0.006, (0, (y0 + y1) / 2, (z0 + z1) / 2), rope_dark, rot=(math.pi / 2 + tilt + 0.5, 0.35, 0), segments=10, sides=4)
    p.export(os.path.join(OUT, "magic_rail_rope.glb"))


register(wall_upper, wall_tapestry, wall_top, channel_wall, riverbed, culvert, bridge, rail_post, rail_rope)

if __name__ == "__main__":
    main()
