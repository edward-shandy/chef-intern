"""Small modelling kit for building game props in Blender from code.

Every prop is built from bevelled primitives made with bmesh (fast, no operators), each with one material, then
joined into a single object and exported as a GLB. Conventions, so props drop straight into the game:

  * 1 Blender unit = 1 kitchen tile. Z is up. The prop's front faces -Y, which glTF turns into +Z (towards the
    game camera). The origin is the middle of the prop's footprint, on the floor, unless a prop says otherwise.
  * Colours are given as sRGB hex and converted to linear. Glowing parts (flames, glass, potions) get an emission
    strength above 1 so the game's bloom picks them up.
"""

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_colour(value):
    value = value.lstrip("#")
    r, g, b = (int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


_materials = {}


def material(name, colour, rough=0.65, metal=0.0, emit=0.0, alpha=1.0):
    """A Principled material, shared by name. `emit` > 0 makes it glow in its own colour."""
    key = (name, colour, rough, metal, emit, alpha)
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    rgba = hex_colour(colour)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
    mat.diffuse_color = rgba
    _materials[key] = mat
    return mat


class Prop:
    """Collects parts (one bmesh each) and turns them into one joined object with a material slot per material."""

    def __init__(self, name):
        self.name = name
        self.objects = []

    # ------------------------------------------------------------------ placing parts

    def _add(self, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=False, sharp=40):
        matrix = Matrix.Translation(Vector(loc)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        bm.transform(matrix)
        mesh = bpy.data.meshes.new(f"{self.name}_part")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        if smooth:
            mesh.shade_smooth()
            mesh.set_sharp_from_angle(angle=math.radians(sharp))
        self.objects.append(obj)
        return obj

    def box(self, size, loc, mat, rot=(0, 0, 0), bevel=0.02, segments=2):
        """A box of `size` (x, y, z) centred on `loc`, its edges rounded by `bevel`."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.transform(Matrix.Diagonal((*size, 1)))
        if bevel > 0:
            limit = min(size) / 2 - 1e-4
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, limit), segments=segments, profile=0.5, affect="EDGES")
        return self._add(bm, mat, loc, rot, smooth=bevel > 0 and segments > 1, sharp=50)

    def quad(self, width, height, loc, mat, rot=(0, 0, 0)):
        """A flat rectangle in the XZ plane facing -Y: two triangles, for glass panes and other thin flat things."""
        bm = bmesh.new()
        w, h = width / 2, height / 2
        verts = [bm.verts.new(v) for v in ((-w, 0, -h), (w, 0, -h), (w, 0, h), (-w, 0, h))]
        bm.faces.new(verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for face in bm.faces:
            if face.normal.y > 0:
                face.normal_flip()
        return self._add(bm, mat, loc, rot)

    def cylinder(self, radius, depth, loc, mat, rot=(0, 0, 0), verts=16, radius_top=None, bevel=0.0, cap=True):
        """A cylinder (or a cone frustum when `radius_top` is given) standing on Z, centred on `loc`."""
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=cap,
            cap_tris=False,
            segments=verts,
            radius1=radius,
            radius2=radius if radius_top is None else radius_top,
            depth=depth,
        )
        if bevel > 0:
            rims = [edge for edge in bm.edges if len(edge.link_faces) == 2 and abs(edge.calc_face_angle(0)) > 0.6]
            bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES")
        return self._add(bm, mat, loc, rot, smooth=True, sharp=50)

    def sphere(self, radius, loc, mat, scale=(1, 1, 1), rot=(0, 0, 0), segments=12, rings=8):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
        return self._add(bm, mat, loc, rot, scale, smooth=True, sharp=180)

    def torus(self, major, minor, loc, mat, rot=(0, 0, 0), segments=24, sides=8, arc=2 * math.pi):
        """A ring lying in the XY plane (rotate it to stand it up); `arc` < 2pi leaves an open ring."""
        bm = bmesh.new()
        rings = []
        closed = arc >= 2 * math.pi - 1e-6
        count = segments if closed else segments + 1
        for i in range(count):
            a = arc * i / segments
            centre = Vector((math.cos(a) * major, math.sin(a) * major, 0))
            out = Vector((math.cos(a), math.sin(a), 0))
            ring = []
            for j in range(sides):
                b = 2 * math.pi * j / sides
                ring.append(bm.verts.new(centre + out * math.cos(b) * minor + Vector((0, 0, math.sin(b) * minor))))
            rings.append(ring)
        for i in range(count if closed else count - 1):
            a, b = rings[i], rings[(i + 1) % count]
            for j in range(sides):
                bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
        return self._add(bm, mat, loc, rot, smooth=True, sharp=180)

    def lathe(self, profile, loc, mat, segments=20, rot=(0, 0, 0), scale=(1, 1, 1), close_top=False, close_bottom=True):
        """Spins a profile of (radius, height) points round Z: bottles, goblets, pots, finials."""
        bm = bmesh.new()
        rings = []
        for radius, height in profile:
            ring = []
            for i in range(segments):
                a = 2 * math.pi * i / segments
                ring.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, height)))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(segments):
                bm.faces.new((a[i], a[(i + 1) % segments], b[(i + 1) % segments], b[i]))
        if close_bottom and profile[0][0] > 1e-4:
            bm.faces.new(list(reversed(rings[0])))
        if close_top and profile[-1][0] > 1e-4:
            bm.faces.new(rings[-1])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._add(bm, mat, loc, rot, scale, smooth=True, sharp=60)

    def prism(self, points, depth, loc, mat, rot=(0, 0, 0), bevel=0.0):
        """Extrudes a flat outline of (x, z) points along Y by `depth`: stars, crescents, plaques, arches."""
        bm = bmesh.new()
        front = [bm.verts.new((x, -depth / 2, z)) for x, z in points]
        back = [bm.verts.new((x, depth / 2, z)) for x, z in points]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        n = len(points)
        for i in range(n):
            bm.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
        return self._add(bm, mat, loc, rot)

    def cloth(self, width, height, loc, mat, waves=2.0, depth=0.04, cols=12, rows=16, rot=(0, 0, 0), sag=0.0):
        """A hanging sheet (banner, tapestry, curtain) in the XZ plane, rippled along X, hanging down from `loc`."""
        bm = bmesh.new()
        grid = []
        for r in range(rows + 1):
            row = []
            for c in range(cols + 1):
                u, v = c / cols, r / rows
                x = (u - 0.5) * width
                y = math.sin(u * math.pi * 2 * waves) * depth * (0.4 + 0.6 * v)
                z = -v * height - math.sin(u * math.pi) * sag
                row.append(bm.verts.new((x, y, z)))
            grid.append(row)
        for r in range(rows):
            for c in range(cols):
                bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
        # A little thickness so it reads from behind too.
        bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.012)
        return self._add(bm, mat, loc, rot, smooth=True, sharp=70)

    # ------------------------------------------------------------------ finishing

    def export(self, path, origin=(0, 0, 0)):
        """Joins every part into one object and writes it as a GLB."""
        bpy.ops.object.select_all(action="DESELECT")
        for obj in self.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.objects[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = self.name
        joined.data.name = self.name
        # Merge identical material slots so each material is one draw call in the game.
        bpy.ops.object.material_slot_remove_unused()
        joined.location = Vector(origin) * -1
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_texcoords=False,
            export_normals=True,
            export_materials="EXPORT",
            export_extras=False,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            # Draco shrinks these code-built meshes to a fraction; the game decodes them with three's DRACOLoader.
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
        )
        return joined


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def star_points(outer, inner, points=5, rotation=math.pi / 2):
    """Outline of a star in the XZ plane."""
    out = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = rotation + math.pi * i / points
        out.append((math.cos(a) * r, math.sin(a) * r))
    return out


def crescent_points(radius, thickness, steps=20):
    """Outline of a crescent moon opening to the right, in the XZ plane: the outer circle minus a circle shifted right.

    `thickness` (0..1) is how far the inner circle is shifted; both arcs start and end where the circles cross."""
    d = thickness
    inner = 0.84
    cross_x = (1 + d * d - inner * inner) / (2 * d)
    cross_y = math.sqrt(max(0.0, 1 - cross_x * cross_x))
    outer_from = math.atan2(cross_y, cross_x)
    inner_from = math.atan2(cross_y, cross_x - d)
    out = []
    for i in range(steps + 1):
        a = outer_from + (2 * math.pi - 2 * outer_from) * i / steps
        out.append((math.cos(a) * radius, math.sin(a) * radius))
    for i in range(1, steps):
        a = (2 * math.pi - inner_from) - (2 * math.pi - 2 * inner_from) * i / steps
        out.append(((d + math.cos(a) * inner) * radius, math.sin(a) * inner * radius))
    return out


def pointed_arch(width, spring, steps=12):
    """Outline (x, z) of a pointed (equilateral) arch opening: straight sides up to `spring`, then two arcs."""
    r = width
    left = [(-width / 2, 0.0), (-width / 2, spring)]
    for i in range(1, steps + 1):
        a = math.pi - (math.pi / 3) * i / steps
        left.append((width / 2 + math.cos(a) * r, spring + math.sin(a) * r))
    right = [(-x, z) for x, z in reversed(left[:-1])]
    return left + right


def inside_pointed_arch(x, z, width, spring, margin=0.0):
    half = width / 2 + margin
    if abs(x) > half or z < -margin:
        return False
    if z <= spring:
        return True
    r = width + margin
    return math.hypot(x - width / 2, z - spring) <= r and math.hypot(x + width / 2, z - spring) <= r


def rng(seed):
    return random.Random(seed)
