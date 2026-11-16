// Builds the Night Market decoration props as GLB files in public/props.
//
// Every prop is modelled from three.js primitives, so there are no third-party meshes or textures.
// Sizes are in game tiles with the origin at the middle of the base, facing +Z (towards the camera).
//
// Usage: node scripts/make_market_props.mjs

import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// GLTFExporter reads its binary through FileReader, which Node does not have.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

const materials = new Map();
const mat = (color, roughness = 0.6, metalness = 0) => {
  const key = `${color}:${roughness}:${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materials.get(key);
};
// Lantern paper and bulbs glow on their own, so they still read at night.
const glow = (color, strength = 1.6) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, roughness: 0.5 });

const add = (parent, geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
};
// Geometries are shared by shape, so repeated parts are written to the file only once.
const geometries = new Map();
const shared = (key, make) => {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
};
const box = (w, h, d) => shared(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (top, bottom, h, segments = 12) =>
  shared(`c${top},${bottom},${h},${segments}`, () => new THREE.CylinderGeometry(top, bottom, h, segments));
const ball = (r, segments = 14) => shared(`s${r},${segments}`, () => new THREE.SphereGeometry(r, segments, Math.max(8, segments - 4)));
const torus = (r, tube, radial, tubular) =>
  shared(`t${r},${tube},${radial},${tubular}`, () => new THREE.TorusGeometry(r, tube, radial, tubular));

const WOOD = 0x9a6235;
const WOOD_DARK = 0x6a3f22;
const IRON = 0x2f2c34;
const LANTERN_COLOURS = [0xe8402c, 0xffc23a, 0xff7a2a, 0xf27aa0];

// A paper lantern: a squashed glowing ball with dark caps and a tassel.
function lantern(colour, size = 1) {
  const group = new THREE.Group();
  const body = add(group, ball(0.13 * size, 14), glow(colour, 1.4));
  body.scale.y = 0.82;
  for (let i = 0; i < 4; i++) {
    const rib = add(group, torus(0.128 * size, 0.006 * size, 4, 16), mat(0x5a1a12, 0.7));
    rib.rotation.y = (i / 4) * Math.PI;
    rib.scale.y = 0.82;
  }
  add(group, cyl(0.06 * size, 0.07 * size, 0.04 * size), mat(0x2a1a14, 0.5), 0, 0.11 * size, 0);
  add(group, cyl(0.07 * size, 0.06 * size, 0.04 * size), mat(0x2a1a14, 0.5), 0, -0.11 * size, 0);
  add(group, cyl(0.008, 0.02 * size, 0.1 * size, 6), mat(0xffc23a, 0.6), 0, -0.18 * size, 0);
  return group;
}

// A sagging wire with a lantern every so often, running along X and hanging from y = top at both ends.
function lanternString(length, top = 2.55, sag = 0.32) {
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    points.push(new THREE.Vector3((t - 0.5) * length, top - sag * 4 * t * (1 - t), 0));
  }
  add(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.012, 5), mat(0x1a1820, 0.6));
  const count = Math.round(length / 0.85);
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const y = top - sag * 4 * t * (1 - t);
    const hung = lantern(LANTERN_COLOURS[i % LANTERN_COLOURS.length], 0.9);
    hung.position.set((t - 0.5) * length, y - 0.2, 0);
    add(group, cyl(0.004, 0.004, 0.08, 4), mat(0x1a1820, 0.6), (t - 0.5) * length, y - 0.05, 0);
    group.add(hung);
  }
  return group;
}

// A post with a crook at the top and a lantern hanging from it, where strings of lights are tied off.
function lanternPost() {
  const group = new THREE.Group();
  add(group, cyl(0.16, 0.2, 0.12, 16), mat(IRON, 0.5, 0.4), 0, 0.06, 0);
  add(group, cyl(0.04, 0.05, 2.6, 10), mat(IRON, 0.45, 0.5), 0, 1.3, 0);
  add(group, cyl(0.06, 0.06, 0.06, 10), mat(0xd9a441, 0.3, 0.8), 0, 2.62, 0);
  add(group, box(0.5, 0.035, 0.035), mat(IRON, 0.45, 0.5), 0.22, 2.48, 0);
  add(group, cyl(0.004, 0.004, 0.14, 4), mat(0x1a1820, 0.6), 0.42, 2.4, 0);
  const hung = lantern(0xe8402c, 1.25);
  hung.position.set(0.42, 2.14, 0);
  group.add(hung);
  return group;
}

// A street food stall: wooden counter, four posts and a striped awning, with skewers grilling over coals.
function marketStall() {
  const group = new THREE.Group();
  const width = 2.3;
  const depth = 1.2;
  // Counter with a cloth skirt along the front.
  add(group, box(width, 0.08, depth * 0.62), mat(WOOD, 0.7), 0, 0.86, 0.12);
  add(group, box(width - 0.1, 0.8, depth * 0.56), mat(WOOD_DARK, 0.8), 0, 0.42, 0.1);
  for (let i = 0; i < 9; i++) {
    add(group, box(width / 9 - 0.01, 0.62, 0.02), mat(i % 2 ? 0xfff3d6 : 0x2f7f86, 0.9), (i - 4) * (width / 9), 0.47, 0.4);
  }
  // Posts and a back shelf.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(group, cyl(0.035, 0.035, 2.25, 8), mat(WOOD_DARK, 0.7), x * (width / 2 - 0.05), 1.12, z * (depth / 2 - 0.05));
  }
  add(group, box(width - 0.1, 0.05, 0.3), mat(WOOD, 0.7), 0, 1.35, -depth / 2 + 0.2);
  // Striped awning sloping down towards the front.
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const x = (i - (stripes - 1) / 2) * (width + 0.2) / stripes;
    add(group, box((width + 0.2) / stripes, 0.03, depth + 0.3), mat(i % 2 ? 0xfff3d6 : 0xd2411f, 0.85), x, 2.25, 0.05, -0.18);
    // Scalloped valance hanging off the front edge.
    add(group, box((width + 0.2) / stripes, 0.16, 0.02), mat(i % 2 ? 0xfff3d6 : 0xd2411f, 0.85), x, 2.07, depth / 2 + 0.2);
  }
  // A blank sign board over the awning, lit by a bulb.
  add(group, box(1.2, 0.34, 0.05), mat(0x2b7b83, 0.6), 0, 2.55, 0.35);
  add(group, box(1.08, 0.24, 0.02), mat(0xfff3d6, 0.7), 0, 2.55, 0.38);
  for (let i = 0; i < 4; i++) add(group, ball(0.035, 8), glow(LANTERN_COLOURS[i], 1.2), -0.39 + i * 0.26, 2.55, 0.4);
  add(group, ball(0.06, 10), glow(0xfff1cf, 2.2), 0, 1.95, 0.1);
  // Charcoal grill tray with skewers on the counter.
  add(group, box(0.9, 0.1, 0.3), mat(IRON, 0.5, 0.5), -0.5, 0.95, 0.25);
  for (let i = 0; i < 8; i++) add(group, ball(0.03, 6), glow(0xff5a1a, 0.9), -0.85 + i * 0.1, 1.0, 0.25);
  for (let i = 0; i < 6; i++) {
    const x = -0.82 + i * 0.13;
    add(group, cyl(0.006, 0.006, 0.42, 4), mat(0xe8d2a6, 0.7), x, 1.04, 0.25, Math.PI / 2);
    for (let j = 0; j < 4; j++) add(group, box(0.045, 0.04, 0.045), mat(0x8a3f1a, 0.5), x, 1.05, 0.15 + j * 0.06);
  }
  // Bowls and a stack of plates on the other side.
  for (let i = 0; i < 3; i++) {
    add(group, cyl(0.1, 0.06, 0.07, 14), mat([0xfdfdfd, 0x3d8fe4, 0xf2c230][i], 0.4), 0.25 + i * 0.25, 0.94, 0.2);
  }
  for (let i = 0; i < 4; i++) add(group, cyl(0.12, 0.1, 0.02, 16), mat(0xfdfdfd, 0.4), 0.85, 0.92 + i * 0.025, 0.05);
  // Jars of crackers on the shelf.
  for (let i = 0; i < 4; i++) {
    add(group, cyl(0.09, 0.09, 0.22, 12), mat(0xcfe6ef, 0.1), -0.75 + i * 0.5, 1.49, -depth / 2 + 0.2);
    add(group, cyl(0.07, 0.07, 0.12, 10), mat([0xf2c230, 0xe8402c, 0xffd8a6, 0x7ccf4f][i], 0.6), -0.75 + i * 0.5, 1.45, -depth / 2 + 0.2);
  }
  return group;
}

// A wheeled food cart (gerobak): painted cabinet, a glass display case, bicycle wheels and a pull handle.
function foodCart() {
  const group = new THREE.Group();
  const body = 0x2b7b83;
  add(group, box(1.3, 0.62, 0.62), mat(body, 0.55), 0, 0.62, 0);
  add(group, box(1.34, 0.05, 0.66), mat(0xfff3d6, 0.6), 0, 0.95, 0);
  add(group, box(1.3, 0.12, 0.02), mat(0xf2c230, 0.6), 0, 0.72, 0.32);
  for (const x of [-0.42, 0, 0.42]) add(group, box(0.32, 0.36, 0.02), mat(0x379aa2, 0.55), x, 0.55, 0.32);
  // Glass case with noodles and toppings inside.
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ef, roughness: 0.05, transparent: true, opacity: 0.35 });
  add(group, box(0.9, 0.42, 0.5), glass, -0.15, 1.19, 0);
  add(group, box(0.94, 0.03, 0.54), mat(0xd9a441, 0.3, 0.7), -0.15, 1.41, 0);
  for (let i = 0; i < 3; i++) {
    add(group, cyl(0.1, 0.1, 0.12, 12), mat([0xf2d27a, 0x7ccf4f, 0xe8402c][i], 0.6), -0.45 + i * 0.3, 1.04, 0);
  }
  // Stove and pot at the open end.
  add(group, cyl(0.16, 0.16, 0.06, 14), mat(IRON, 0.5, 0.5), 0.45, 1.0, 0);
  add(group, cyl(0.15, 0.13, 0.22, 14), mat(0xb9c3d6, 0.3, 0.8), 0.45, 1.14, 0);
  add(group, cyl(0.13, 0.13, 0.01, 14), mat(0xd2411f, 0.4), 0.45, 1.25, 0);
  // Wheels, a resting leg and the handles.
  for (const z of [-0.36, 0.36]) {
    add(group, torus(0.3, 0.035, 8, 24), mat(0x1a1820, 0.8), -0.25, 0.3, z);
    add(group, cyl(0.03, 0.03, 0.06, 8), mat(0xb9c3d6, 0.3, 0.8), -0.25, 0.3, z, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      add(group, box(0.012, 0.56, 0.012), mat(0xb9c3d6, 0.3, 0.8), -0.25, 0.3, z, 0, 0, (i / 6) * Math.PI);
    }
  }
  add(group, cyl(0.02, 0.02, 0.32, 6), mat(IRON, 0.5), 0.55, 0.16, 0);
  for (const z of [-0.26, 0.26]) add(group, box(0.5, 0.035, 0.035), mat(WOOD, 0.6), 0.88, 0.85, z);
  // Umbrella pole with a striped canopy and a lantern under it.
  add(group, cyl(0.02, 0.02, 1.2, 6), mat(IRON, 0.5), 0.6, 1.55, -0.25);
  const canopy = add(group, new THREE.ConeGeometry(0.75, 0.3, 8, 1, true), mat(0xf2c230, 0.8), 0.6, 2.2, -0.25);
  canopy.material = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.8, side: THREE.DoubleSide });
  const hung = lantern(0xe8402c, 0.9);
  hung.position.set(0.6, 1.88, -0.25);
  group.add(hung);
  return group;
}

const PROPS = {
  market_stall: marketStall,
  food_cart: foodCart,
  lantern_post: lanternPost,
  lantern_string_long: () => lanternString(14.4),
  lantern_string_side: () => lanternString(10, 2.5, 0.25),
};

const exporter = new GLTFExporter();
for (const [name, build] of Object.entries(PROPS)) {
  const scene = new THREE.Scene();
  scene.name = name;
  scene.add(build());
  const glb = await exporter.parseAsync(scene, { binary: true });
  writeFileSync(new URL(`../public/props/${name}.glb`, import.meta.url), Buffer.from(glb));
  console.log(`wrote public/props/${name}.glb (${(glb.byteLength / 1024).toFixed(1)} KB)`);
}
