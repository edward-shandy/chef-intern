// Builds the animal chefs' heads and tails as GLB files in public/props.
//
// The animal chefs reuse the KayKit character rig and its animations: the client hides the rig's own head mesh,
// hangs one of these heads on the `head` bone and the tail on the `hips` bone, and paints the body as a chef's jacket.
// Everything is modelled from three.js primitives in the rig's units (one head is about one unit tall), facing +Z,
// with the origin at the bone. The chef's toque still sits on top at y = 0.95, so ears stay out to the sides.
//
// Usage: node scripts/make_chef_heads.mjs

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
};

const materials = new Map();
const mat = (color, roughness = 0.65) => {
  const key = `${color}:${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key);
};
const geometries = new Map();
const shared = (key, make) => {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
};
const ball = (r, segments = 20) => shared(`s${r},${segments}`, () => new THREE.SphereGeometry(r, segments, Math.max(10, segments - 6)));
const cone = (r, h, segments = 16) => shared(`k${r},${h},${segments}`, () => new THREE.ConeGeometry(r, h, segments));
const cyl = (top, bottom, h, segments = 16) => shared(`c${top},${bottom},${h},${segments}`, () => new THREE.CylinderGeometry(top, bottom, h, segments));
const box = (w, h, d) => shared(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));

function add(parent, geometry, material, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
// Adds a part and its mirror image on the other side of the face.
function pair(parent, geometry, material, [x, y, z], scale, [rx, ry, rz] = [0, 0, 0]) {
  add(parent, geometry, material, [x, y, z], scale, [rx, ry, rz]);
  add(parent, geometry, material, [-x, y, z], scale, [rx, -ry, -rz]);
}

const INK = 0x1d1922;
const WHITE = 0xfffaf2;
const PINK = 0xf29bb0;
const BLUSH = 0xf27a8a;

// The parts every animal face shares: two shiny eyes and rosy cheeks.
function face(head, { eyeY = 0.52, eyeX = 0.17, eyeZ = 0.43, blush = true, cheekZ = 0.4 } = {}) {
  pair(head, ball(0.065, 14), mat(INK, 0.25), [eyeX, eyeY, eyeZ], [1, 1.15, 0.7]);
  pair(head, ball(0.022, 8), mat(0xffffff, 0.2), [eyeX - 0.02, eyeY + 0.03, eyeZ + 0.045], [1, 1, 1]);
  if (blush) pair(head, ball(0.065, 12), mat(BLUSH, 0.8), [0.3, 0.38, cheekZ], [1, 0.55, 0.35], [0, 0.6, 0]);
}

// Whiskers fanning out from the muzzle on both sides.
function whiskers(head, y, z, colour = 0x3a3440) {
  for (const [dy, tilt] of [[0.03, 0.12], [-0.02, 0], [-0.07, -0.12]]) {
    pair(head, cyl(0.007, 0.007, 0.34, 5), mat(colour, 0.6), [0.27, y + dy, z], [1, 1, 1], [0, 0, Math.PI / 2 + tilt]);
  }
}

// A tail as a chain of balls along a curve, thinning (or not) towards the tip.
function tail(points, radius, colour, tipColour = colour, taper = 0.5) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  // Enough balls that neighbours overlap even at the thin tip, so the tail reads as one piece.
  const steps = Math.ceil(curve.getLength() / (radius * taper * 0.9));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = curve.getPoint(t);
    const r = radius * (1 - t * (1 - taper));
    // One unit ball scaled per segment, so the whole tail shares a single geometry.
    add(group, ball(1, 12), mat(t > 0.8 ? tipColour : colour), [point.x, point.y, point.z], [r, r, r]);
  }
  return group;
}

// ---------------------------------------------------------------- the animals

function mouse() {
  const fur = 0xa7abb8;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(fur), [0, 0.46, 0], [1.02, 0.94, 1]);
  // Big round ears out to the sides, pink inside.
  pair(head, cyl(0.3, 0.3, 0.07, 28), mat(fur), [0.5, 0.82, -0.04], [1, 1, 1], [Math.PI / 2, 0, -0.5]);
  pair(head, cyl(0.21, 0.21, 0.02, 24), mat(PINK), [0.515, 0.82, 0.005], [1, 1, 1], [Math.PI / 2, 0, -0.5]);
  add(head, ball(0.22, 20), mat(0xd9dce4), [0, 0.33, 0.38], [1.05, 0.78, 1]);
  add(head, ball(0.075, 12), mat(PINK, 0.4), [0, 0.38, 0.6]);
  add(head, box(0.1, 0.07, 0.03), mat(WHITE, 0.4), [0, 0.19, 0.53]);
  add(head, box(0.004, 0.07, 0.035), mat(0xb9bcc6), [0, 0.19, 0.54]);
  face(head);
  whiskers(head, 0.37, 0.52);
  return { head, tail: tail([[0, 0.05, -0.2], [0, 0, -0.6], [0.1, 0.25, -0.95], [0.25, 0.6, -0.95], [0.18, 0.75, -0.75]], 0.055, PINK, PINK, 0.7) };
}

function cat() {
  const fur = 0xf0953a;
  const stripe = 0xc8661c;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(fur), [0, 0.46, 0], [1.06, 0.92, 1]);
  // Pointed ears tilted outwards, clear of the toque.
  pair(head, cone(0.17, 0.34, 4), mat(fur), [0.36, 0.92, 0], [1, 1, 0.55], [0, Math.PI / 4, -0.5]);
  pair(head, cone(0.1, 0.22, 4), mat(PINK), [0.37, 0.9, 0.04], [1, 1, 0.4], [0, Math.PI / 4, -0.5]);
  for (const x of [-0.12, 0, 0.12]) add(head, box(0.05, 0.16, 0.04), mat(stripe), [x, 0.82, 0.32], [1, 1, 1], [0.6, 0, 0]);
  pair(head, box(0.18, 0.04, 0.04), mat(stripe), [0.44, 0.5, 0.2], [1, 1, 1], [0, 0.9, 0]);
  add(head, ball(0.2, 20), mat(WHITE), [0, 0.32, 0.36], [1.25, 0.72, 0.9]);
  add(head, cone(0.06, 0.06, 3), mat(PINK, 0.4), [0, 0.4, 0.55], [1, 1, 0.6], [Math.PI, 0, 0]);
  face(head, { eyeY: 0.53 });
  whiskers(head, 0.35, 0.48);
  return { head, tail: tail([[0, 0.05, -0.2], [0, 0.1, -0.55], [0.05, 0.5, -0.75], [0.15, 0.85, -0.6]], 0.08, fur, stripe, 0.85) };
}

function bear() {
  const fur = 0x8a5a3c;
  const tan = 0xd9a878;
  const head = new THREE.Group();
  add(head, ball(0.52, 28), mat(fur), [0, 0.46, 0], [1.05, 0.95, 1]);
  pair(head, ball(0.16, 18), mat(fur), [0.42, 0.86, -0.02], [1, 1, 0.6]);
  pair(head, ball(0.1, 14), mat(tan), [0.43, 0.86, 0.05], [1, 1, 0.4]);
  add(head, ball(0.24, 22), mat(tan), [0, 0.32, 0.38], [1.1, 0.8, 0.9]);
  add(head, ball(0.08, 14), mat(INK, 0.3), [0, 0.39, 0.6], [1.3, 0.85, 0.8]);
  add(head, box(0.012, 0.08, 0.02), mat(INK), [0, 0.28, 0.6]);
  face(head, { eyeY: 0.54, eyeX: 0.19 });
  return { head, tail: tail([[0, 0.1, -0.3], [0, 0.12, -0.38]], 0.13, fur, fur, 1) };
}

function frog() {
  const skin = 0x6cc04a;
  const belly = 0xd8f0a8;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(skin), [0, 0.42, 0], [1.16, 0.82, 1]);
  // Eyes bulge up at the front corners of the head, in front of the toque.
  pair(head, ball(0.17, 20), mat(skin), [0.29, 0.74, 0.25]);
  pair(head, ball(0.12, 18), mat(WHITE, 0.3), [0.3, 0.76, 0.35]);
  pair(head, ball(0.065, 12), mat(INK, 0.2), [0.31, 0.77, 0.45], [1, 1.2, 0.7]);
  pair(head, ball(0.022, 8), mat(0xffffff, 0.2), [0.29, 0.8, 0.5]);
  add(head, ball(0.36, 22), mat(belly), [0, 0.27, 0.22], [1.25, 0.55, 0.85]);
  // A wide grin.
  const smile = add(head, new THREE.TorusGeometry(0.22, 0.016, 6, 24, Math.PI), mat(INK), [0, 0.39, 0.47], [1.2, 0.6, 1], [0, 0, Math.PI]);
  smile.rotation.x = -0.25;
  pair(head, ball(0.06, 12), mat(BLUSH, 0.8), [0.36, 0.38, 0.38], [1, 0.55, 0.35], [0, 0.6, 0]);
  pair(head, ball(0.02, 6), mat(0x3f8f2f), [0.05, 0.48, 0.5]);
  return { head, tail: null };
}

function penguin() {
  const black = 0x2a2d38;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(black), [0, 0.46, 0], [1, 0.95, 1]);
  // White face mask, heart-shaped from two overlapping lobes.
  pair(head, ball(0.25, 20), mat(WHITE), [0.12, 0.47, 0.28], [1, 1.1, 0.8]);
  add(head, ball(0.26, 20), mat(WHITE), [0, 0.33, 0.3], [1.2, 0.8, 0.8]);
  add(head, cone(0.09, 0.22, 12), mat(0xf2a33a, 0.4), [0, 0.4, 0.62], [1.3, 1, 0.7], [Math.PI / 2, 0, 0]);
  face(head, { eyeY: 0.53, eyeX: 0.16, eyeZ: 0.5, cheekZ: 0.45 });
  return { head, tail: tail([[0, 0.05, -0.25], [0, 0, -0.42]], 0.1, black, black, 0.6) };
}

function fox() {
  const fur = 0xe8692a;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(fur), [0, 0.47, 0], [1.08, 0.9, 1]);
  pair(head, cone(0.18, 0.4, 4), mat(fur), [0.36, 0.94, -0.02], [1, 1, 0.55], [0, Math.PI / 4, -0.45]);
  pair(head, cone(0.09, 0.14, 4), mat(INK), [0.43, 1.08, -0.02], [1, 1, 0.55], [0, Math.PI / 4, -0.45]);
  pair(head, cone(0.1, 0.24, 4), mat(WHITE), [0.37, 0.92, 0.03], [1, 1, 0.4], [0, Math.PI / 4, -0.45]);
  // White cheeks sweeping into a pointed snout with a black nose.
  pair(head, ball(0.22, 18), mat(WHITE), [0.2, 0.3, 0.27], [1.1, 0.75, 0.8]);
  add(head, cone(0.18, 0.36, 18), mat(WHITE), [0, 0.32, 0.5], [1.15, 0.8, 1], [Math.PI / 2, 0, 0]);
  add(head, ball(0.06, 12), mat(INK, 0.3), [0, 0.34, 0.68]);
  face(head, { eyeY: 0.55, eyeX: 0.19, eyeZ: 0.42 });
  return { head, tail: tail([[0, 0.08, -0.2], [0, 0.15, -0.55], [0.1, 0.45, -0.85], [0.2, 0.7, -0.75]], 0.16, fur, WHITE, 0.75) };
}

function pig() {
  const skin = 0xf4a7b5;
  const snout = 0xf7c2cc;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(skin), [0, 0.45, 0], [1.08, 0.92, 1]);
  // Floppy ears folding forwards from the sides of the head.
  pair(head, cone(0.17, 0.3, 4), mat(skin), [0.38, 0.86, 0.08], [1, 1, 0.45], [0.7, Math.PI / 4, -0.6]);
  pair(head, cone(0.1, 0.18, 4), mat(0xe58a9c), [0.385, 0.85, 0.11], [1, 1, 0.3], [0.7, Math.PI / 4, -0.6]);
  // A round flat snout with two nostrils.
  add(head, cyl(0.17, 0.18, 0.14, 24), mat(snout), [0, 0.35, 0.47], [1.15, 1, 1], [Math.PI / 2, 0, 0]);
  pair(head, ball(0.035, 10), mat(0x9a4a5a, 0.4), [0.065, 0.35, 0.545], [0.8, 1.3, 0.5]);
  face(head, { eyeY: 0.56, eyeX: 0.19 });
  // A short curly tail, wound in a spiral.
  const curl = Array.from({ length: 9 }, (_, i) => {
    const angle = i * 0.85;
    const reach = 0.13 - i * 0.008;
    return [Math.sin(angle) * reach, 0.18 + Math.cos(angle) * reach, -0.32 - i * 0.025];
  });
  return { head, tail: tail(curl, 0.045, skin, skin, 0.8) };
}

function elephant() {
  const skin = 0x9aa7c4;
  const inner = 0xe9b4c2;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(skin), [0, 0.46, 0], [1.02, 0.95, 1]);
  // Big flapping ears, pink inside, swept back from the sides.
  pair(head, cyl(0.36, 0.36, 0.05, 28), mat(skin), [0.52, 0.52, -0.06], [1, 1, 1.25], [Math.PI / 2, 0.35, -1.25]);
  pair(head, cyl(0.26, 0.26, 0.02, 24), mat(inner), [0.55, 0.52, -0.02], [1, 1, 1.25], [Math.PI / 2, 0.35, -1.25]);
  // A trunk that hangs down and curls up at the tip.
  head.add(tail([[0, 0.36, 0.42], [0, 0.22, 0.6], [0, 0.04, 0.66], [0, -0.04, 0.78], [0, 0.04, 0.88]], 0.11, skin, skin, 0.55));
  pair(head, cone(0.04, 0.16, 10), mat(WHITE, 0.4), [0.14, 0.24, 0.47], [1, 1, 1], [1.9, 0, 0.25]);
  face(head, { eyeY: 0.55, eyeX: 0.2, eyeZ: 0.42 });
  const tailGroup = tail([[0, 0.1, -0.28], [0, -0.05, -0.42], [0, -0.2, -0.46]], 0.035, skin, skin, 1);
  add(tailGroup, ball(0.06, 10), mat(0x4a4f63), [0, -0.25, -0.46], [1, 1.5, 1]);
  return { head, tail: tailGroup };
}

// Icy, the princess chef: long wavy hair, a jewelled tiara in front of the toque, and a bell gown in place of a tail.
function icy() {
  const skin = 0xf6d2bd;
  const hair = 0x6b3a26;
  const gold = 0xe8b84a;
  const gown = 0xf7a8c8;
  const head = new THREE.Group();
  add(head, ball(0.5, 28), mat(hair), [0, 0.5, -0.07], [1.04, 1, 1]);
  add(head, ball(0.45, 28), mat(skin), [0, 0.44, 0.05], [1, 1, 0.95]);
  // Side-swept fringe across the forehead.
  for (const [x, y, s] of [[-0.22, 0.79, 0.15], [-0.06, 0.83, 0.16], [0.12, 0.81, 0.15], [0.27, 0.74, 0.13]]) {
    add(head, ball(s, 16), mat(hair), [x, y, 0.27], [1.3, 0.75, 0.8], [0, 0, -0.35]);
  }
  // Long waves down the back and a curled lock beside each cheek.
  add(head, ball(0.42, 22), mat(hair), [0, 0.12, -0.3], [1.05, 1.45, 0.62]);
  for (const side of [-1, 1]) {
    add(head, ball(0.14, 14), mat(hair), [side * 0.4, 0.3, 0.02], [0.9, 1.5, 0.8]);
    add(head, ball(0.11, 14), mat(hair), [side * 0.43, 0.08, 0.06]);
    add(head, ball(0.12, 14), mat(hair), [side * 0.28, -0.12, -0.22]);
  }
  // Big eyes with a lash flick at the outer corner, rosy cheeks and a small smile.
  pair(head, ball(0.07, 14), mat(INK, 0.25), [0.16, 0.48, 0.45], [0.9, 1.25, 0.7]);
  pair(head, ball(0.025, 8), mat(0xffffff, 0.2), [0.14, 0.52, 0.5]);
  pair(head, box(0.07, 0.018, 0.02), mat(INK), [0.23, 0.56, 0.42], [1, 1, 1], [0, 0.5, 0.55]);
  pair(head, ball(0.07, 12), mat(BLUSH, 0.8), [0.27, 0.36, 0.38], [1, 0.55, 0.35], [0, 0.6, 0]);
  add(head, ball(0.025, 8), mat(0xe8a890), [0, 0.4, 0.5]);
  add(head, new THREE.TorusGeometry(0.07, 0.014, 6, 16, Math.PI), mat(0xc2405a), [0, 0.32, 0.48], [1, 0.8, 1], [0, 0, Math.PI]);
  pair(head, ball(0.03, 8), mat(gold, 0.3), [0.44, 0.34, 0.06]);
  // A gold tiara sitting on the fringe, just in front of the toque's band, with a pink jewel on each point.
  // It wraps the front of the head below the toque, and its points stand up in front of the toque's band.
  const TIARA_Y = 0.76;
  const TIARA_R = 0.47;
  const band = add(head, new THREE.TorusGeometry(TIARA_R, 0.03, 8, 32, Math.PI), mat(gold, 0.3), [0, TIARA_Y, 0.04], [1, 1, 1.05], [Math.PI / 2, 0, 0]);
  band.rotation.z = Math.PI;
  for (const [angle, height, gem] of [[0, 0.24, 0.05], [-0.42, 0.17, 0.036], [0.42, 0.17, 0.036], [-0.85, 0.11, 0.028], [0.85, 0.11, 0.028]]) {
    const x = Math.sin(angle) * (TIARA_R + 0.02);
    const z = Math.cos(angle) * (TIARA_R + 0.02) * 1.05 + 0.04;
    add(head, cone(0.05, height, 4), mat(gold, 0.3), [x, TIARA_Y + height / 2, z], [1, 1, 0.45], [0, angle, 0]);
    add(head, ball(gem, 10), mat(0xff5c9a, 0.15), [x, TIARA_Y + 0.05, z + 0.035]);
  }
  // The gown: a bell skirt from the waist, gold at the waist and a white ruffle at the hem.
  const skirt = new THREE.Group();
  add(skirt, cyl(0.4, 0.78, 0.74, 28), mat(gown), [0, -0.26, 0]);
  add(skirt, new THREE.TorusGeometry(0.4, 0.04, 8, 28), mat(gold, 0.3), [0, 0.1, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(skirt, new THREE.TorusGeometry(0.78, 0.06, 8, 36), mat(WHITE), [0, -0.62, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    add(skirt, ball(0.05, 10), mat(0xff5c9a, 0.3), [Math.sin(angle) * 0.63, -0.42, Math.cos(angle) * 0.63]);
  }
  return { head, tail: skirt, tailName: "skirt_icy" };
}

const ANIMALS = { mouse, cat, bear, frog, penguin, fox, pig, elephant, icy };

const exporter = new GLTFExporter();
const write = async (name, object) => {
  const scene = new THREE.Scene();
  scene.name = name;
  scene.add(object);
  const glb = await exporter.parseAsync(scene, { binary: true });
  writeFileSync(new URL(`../public/props/${name}.glb`, import.meta.url), Buffer.from(glb));
  console.log(`wrote public/props/${name}.glb (${(glb.byteLength / 1024).toFixed(1)} KB)`);
};
for (const [name, build] of Object.entries(ANIMALS)) {
  const { head, tail: tailGroup, tailName } = build();
  await write(`head_${name}`, head);
  if (tailGroup) await write(tailName ?? `tail_${name}`, tailGroup);
}
