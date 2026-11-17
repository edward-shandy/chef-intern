// Builds the Orbit Diner decoration props as GLB files in public/props.
//
// Modelled from three.js primitives, sized like the town props they stand in for: wall panels are two tiles wide and
// 2.4 tall, a table set is about two tiles across with its seats at x = ±0.82, and a seated guest is about 1.4 tall.
// Everything faces +Z with its origin at the middle of its base.
//
// Usage: node scripts/make_space_props.mjs

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
const mat = (color, roughness = 0.5, metalness = 0) => {
  const key = `${color}:${roughness}:${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materials.get(key);
};
// Lights, screens and porthole glass glow on their own in the dim station.
// Emissive strength is compressed so only the brightest accents (strip lights, bulbs) reach just past the bloom
// threshold; large glowing surfaces such as the planet lamp's globe stay under it and never glare.
const glow = (color, strength = 1.5) => {
  const key = `glow:${color}:${strength}`;
  const intensity = Math.min(1.15, 0.35 + strength * 0.45);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
  return materials.get(key);
};
const geometries = new Map();
const shared = (key, make) => {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
};
const box = (w, h, d) => shared(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (top, bottom, h, s = 24) => shared(`c${top},${bottom},${h},${s}`, () => new THREE.CylinderGeometry(top, bottom, h, s));
const ball = (r, s = 18) => shared(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(10, s - 6)));
const cone = (r, h, s = 20) => shared(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t, s = 32) => shared(`t${r},${t},${s}`, () => new THREE.TorusGeometry(r, t, 8, s));

function add(parent, geometry, material, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

const HULL = 0xd9e2ee;
const HULL_DARK = 0x8a93a6;
const TRIM = 0x2f3a5c;
const CYAN = 0x3fd6e8;
const VIOLET = 0x9b7bff;
const INK = 0x1d1922;

// A station wall panel: pale hull plates, a dark kick strip, a glowing trim line and a few rivets.
function wallPanel(porthole) {
  const wall = new THREE.Group();
  add(wall, box(2, 2.4, 0.22), mat(HULL, 0.45, 0.2), [0, 1.2, 0.04]);
  add(wall, box(2, 0.32, 0.26), mat(TRIM, 0.5, 0.3), [0, 0.16, 0.05]);
  add(wall, box(2, 0.05, 0.25), glow(CYAN, 1.8), [0, 0.36, 0.06]);
  add(wall, box(0.05, 2.4, 0.25), mat(HULL_DARK, 0.4, 0.4), [-0.975, 1.2, 0.05]);
  for (const y of [0.7, 1.7]) add(wall, box(1.9, 0.03, 0.24), mat(HULL_DARK, 0.4, 0.4), [0, y + 0.3, 0.05]);
  for (const [x, y] of [[-0.8, 2.25], [0.8, 2.25], [-0.8, 0.55], [0.8, 0.55]]) add(wall, ball(0.035, 8), mat(HULL_DARK, 0.3, 0.6), [x, y, 0.17]);
  if (porthole) {
    // A round window onto the stars: steel frame, dark glass with a few stars and a sliver of planet.
    add(wall, cyl(0.62, 0.62, 0.1, 40), mat(TRIM, 0.35, 0.6), [0, 1.35, 0.15], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(wall, cyl(0.5, 0.5, 0.11, 40), glow(0x101a3a, 0.6), [0, 1.35, 0.16], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(wall, cyl(0.5, 0.5, 0.115, 40, 1), glow(0x3d8fe4, 0.9), [0.05, 0.98, 0.165], [0.55, 1, 0.25], [Math.PI / 2, 0, 0]);
    for (const [x, y] of [[-0.25, 1.6], [0.2, 1.55], [0.3, 1.25], [-0.1, 1.35], [-0.3, 1.2], [0.05, 1.7]]) {
      add(wall, ball(0.018, 6), glow(0xffffff, 2), [x, y, 0.23]);
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      add(wall, ball(0.03, 8), mat(HULL_DARK, 0.3, 0.6), [Math.sin(angle) * 0.56, 1.35 + Math.cos(angle) * 0.56, 0.21]);
    }
  } else {
    // A little control screen with blinking lights.
    add(wall, box(0.7, 0.42, 0.04), mat(TRIM, 0.4, 0.4), [0.35, 1.45, 0.16]);
    add(wall, box(0.62, 0.34, 0.02), glow(0x1f6f7a, 1.1), [0.35, 1.45, 0.185]);
    for (const [i, c] of [CYAN, VIOLET, 0xffb03a].entries()) add(wall, ball(0.04, 8), glow(c, 2), [-0.55 + i * 0.16, 1.45, 0.17]);
  }
  return wall;
}

// A round table on a single glowing stem, with a hovering stool at each end.
function table() {
  const set = new THREE.Group();
  add(set, cyl(0.28, 0.36, 0.06, 24), mat(TRIM, 0.4, 0.5), [0, 0.03, 0]);
  add(set, cyl(0.07, 0.07, 0.7, 12), mat(HULL_DARK, 0.3, 0.7), [0, 0.4, 0]);
  add(set, cyl(0.62, 0.62, 0.08, 36), mat(HULL, 0.35, 0.2), [0, 0.78, 0]);
  add(set, torus(0.62, 0.025, 40), glow(CYAN, 1.6), [0, 0.78, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  // A little centrepiece: a glowing bud vase with a star-shaped flower.
  add(set, cyl(0.06, 0.08, 0.16, 12), glow(VIOLET, 0.8), [0, 0.9, 0]);
  add(set, ball(0.07, 10), glow(0xffd166, 1.4), [0, 1.02, 0]);
  for (const x of [-0.82, 0.82]) {
    add(set, cyl(0.26, 0.22, 0.1, 24), mat(VIOLET, 0.45), [x, 0.42, 0]);
    add(set, torus(0.2, 0.02, 24), glow(CYAN, 1.4), [x, 0.2, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(set, cyl(0.12, 0.12, 0.02, 20), glow(CYAN, 0.8), [x, 0.03, 0]);
  }
  return set;
}

// A friendly seated alien: a round body, one big eye, two antennae with glowing tips and little arms.
function alien(skin, belly, eyeCount) {
  const guest = new THREE.Group();
  add(guest, ball(0.36, 22), mat(skin, 0.55), [0, 0.42, 0], [1, 1.05, 0.95]);
  add(guest, ball(0.26, 20), mat(belly, 0.6), [0, 0.36, 0.14], [1, 1.05, 0.75]);
  add(guest, ball(0.33, 22), mat(skin, 0.55), [0, 0.95, 0]);
  const eyes = eyeCount === 1 ? [[0, 0.16]] : [[-0.12, 0.11], [0.12, 0.11]];
  for (const [x, r] of eyes) {
    add(guest, ball(r, 16), mat(0xffffff, 0.3), [x, 1.0, 0.25]);
    add(guest, ball(r * 0.5, 12), mat(INK, 0.2), [x, 1.0, 0.25 + r * 0.7]);
    add(guest, ball(r * 0.18, 8), mat(0xffffff, 0.2), [x - r * 0.18, 1.05, 0.25 + r * 0.95]);
  }
  add(guest, new THREE.TorusGeometry(0.09, 0.018, 6, 16, Math.PI), mat(INK), [0, 0.82, 0.3], [1, 1, 1], [0, 0, Math.PI]);
  for (const side of [-1, 1]) {
    add(guest, cyl(0.016, 0.016, 0.3, 6), mat(skin), [side * 0.14, 1.36, 0], [1, 1, 1], [0, 0, side * -0.35]);
    add(guest, ball(0.055, 10), glow(0xffd166, 1.8), [side * 0.2, 1.5, 0]);
    add(guest, ball(0.08, 12), mat(skin), [side * 0.33, 0.5, 0.18], [1, 1.4, 1]);
  }
  return guest;
}

// A hydroponic pod: a glass dome over a tray of glowing seedlings, on a short pedestal.
function hydro() {
  const pod = new THREE.Group();
  add(pod, cyl(0.24, 0.3, 0.3, 24), mat(HULL, 0.4, 0.3), [0, 0.15, 0]);
  add(pod, torus(0.26, 0.025, 32), glow(CYAN, 1.5), [0, 0.3, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(pod, cyl(0.26, 0.26, 0.06, 24), mat(0x5a3a2a, 0.9), [0, 0.33, 0]);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const reach = (i % 3) * 0.08;
    const x = Math.sin(angle) * reach;
    const z = Math.cos(angle) * reach;
    add(pod, cyl(0.012, 0.012, 0.3 + (i % 2) * 0.12, 6), mat(0x3f9d57, 0.6), [x, 0.5, z]);
    add(pod, ball(0.06, 10), glow(i % 2 ? 0x7ccf4f : 0xb5f2a0, 0.6), [x, 0.66 + (i % 2) * 0.12, z], [1, 0.6, 1]);
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xcfe6ef, roughness: 0.05, transparent: true, opacity: 0.3 }),
  );
  dome.position.y = 0.33;
  dome.scale.y = 1.9;
  pod.add(dome);
  return pod;
}

// A little parked rocket on fins, with a porthole and a red nose.
function rocket() {
  const ship = new THREE.Group();
  const body = new THREE.LatheGeometry(
    [[0, 0.3], [0.32, 0.35], [0.4, 0.8], [0.38, 1.5], [0.25, 2.1], [0, 2.45]].map(([x, y]) => new THREE.Vector2(x, y)),
    28,
  );
  add(ship, body, mat(0xf4f1ea, 0.4, 0.1));
  add(ship, cone(0.24, 0.4, 24), mat(0xd2411f, 0.4), [0, 2.32, 0]);
  add(ship, cyl(0.15, 0.15, 0.06, 24), mat(TRIM, 0.3, 0.6), [0, 1.35, 0.37], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(ship, cyl(0.11, 0.11, 0.07, 24), glow(0x3fd6e8, 1), [0, 1.35, 0.375], [1, 1, 1], [Math.PI / 2, 0, 0]);
  add(ship, cyl(0.39, 0.39, 0.1, 28), mat(0xd2411f, 0.4), [0, 0.95, 0]);
  for (let i = 0; i < 3; i++) {
    const fin = add(ship, box(0.06, 0.6, 0.42), mat(0xd2411f, 0.4), [0, 0.42, 0]);
    fin.rotation.y = (i / 3) * Math.PI * 2;
    fin.translateZ(0.38);
  }
  add(ship, cone(0.22, 0.32, 20), mat(TRIM, 0.4, 0.5), [0, 0.2, 0], [1, 1, 1], [Math.PI, 0, 0]);
  add(ship, cone(0.16, 0.3, 16), glow(0xffb03a, 2), [0, 0.0, 0], [1, 1, 1], [Math.PI, 0, 0]);
  return ship;
}

// A landing beacon: a slim mast with a blinking light, the station's version of a lantern post.
function beacon() {
  const post = new THREE.Group();
  add(post, cyl(0.16, 0.2, 0.1, 20), mat(TRIM, 0.4, 0.5), [0, 0.05, 0]);
  add(post, cyl(0.035, 0.045, 2.2, 10), mat(HULL_DARK, 0.3, 0.7), [0, 1.15, 0]);
  add(post, ball(0.13, 16), glow(VIOLET, 2.2), [0, 2.3, 0]);
  add(post, torus(0.18, 0.02, 24), glow(CYAN, 1.6), [0, 2.3, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return post;
}

const RED = 0xd2411f;
const ORANGE = 0xff8a2a;
const CREAM = 0xf4f1ea;
const CHROME = 0xcfd6e0;
const arc = (r, t, angle, s = 24) => shared(`a${r},${t},${angle},${s}`, () => new THREE.TorusGeometry(r, t, 8, s, angle));
const X90 = [Math.PI / 2, 0, 0];

// A curved-back diner booth: a bench at each end of a small table, vinyl seats and chrome rails. Guests sit on it.
function booth() {
  const set = new THREE.Group();
  add(set, cyl(0.07, 0.07, 0.7, 10), mat(CHROME, 0.25, 0.8), [0, 0.4, 0]);
  add(set, cyl(0.26, 0.3, 0.05, 20), mat(TRIM, 0.4, 0.5), [0, 0.03, 0]);
  add(set, cyl(0.5, 0.5, 0.07, 32), mat(CREAM, 0.35, 0.2), [0, 0.78, 0], [1, 1, 1.1]);
  add(set, torus(0.5, 0.022, 36), mat(CHROME, 0.25, 0.8), [0, 0.78, 0], [1, 1.1, 1], X90);
  add(set, cyl(0.07, 0.09, 0.2, 10), glow(CYAN, 0.9), [0.0, 0.92, 0.0]);
  add(set, ball(0.06, 10), glow(ORANGE, 1.6), [0, 1.04, 0]);
  for (const side of [-1, 1]) {
    add(set, box(0.62, 0.34, 1.2), mat(side < 0 ? RED : ORANGE, 0.55), [side * 0.82, 0.2, 0]);
    add(set, box(0.7, 0.06, 1.26), mat(CHROME, 0.25, 0.8), [side * 0.82, 0.04, 0]);
    add(set, box(0.18, 0.95, 1.24), mat(side < 0 ? RED : ORANGE, 0.55), [side * 1.2, 0.62, 0]);
    add(set, box(0.22, 0.06, 1.28), mat(CHROME, 0.25, 0.8), [side * 1.2, 1.12, 0]);
    add(set, box(0.04, 0.05, 1.1), glow(CYAN, 1.6), [side * 1.1, 0.82, 0]);
    for (const z of [-0.45, 0, 0.45]) add(set, ball(0.04, 8), mat(CHROME, 0.2, 0.8), [side * 1.105, 0.6, z]);
    for (const z of [-1, 1]) add(set, box(0.7, 0.5, 0.1), mat(CHROME, 0.3, 0.6), [side * 0.9, 0.3, z * 0.66], [1, 0.8, 1]);
  }
  return set;
}

// A jukebox: red body, a glowing arched window and a chrome grille, with a starburst on the front.
function jukebox() {
  const j = new THREE.Group();
  add(j, box(0.9, 0.18, 0.55), mat(CHROME, 0.25, 0.8), [0, 0.09, 0]);
  add(j, box(0.8, 1.05, 0.46), mat(RED, 0.4, 0.1), [0, 0.7, 0]);
  add(j, cyl(0.4, 0.4, 0.46, 24), mat(RED, 0.4, 0.1), [0, 1.22, 0], [1, 1, 1], X90);
  add(j, cyl(0.31, 0.31, 0.04, 24), glow(0xffb03a, 1.4), [0, 1.2, 0.24], [1, 1, 1], X90);
  add(j, arc(0.34, 0.035, Math.PI), mat(CHROME, 0.2, 0.8), [0, 1.2, 0.25]);
  add(j, arc(0.42, 0.03, Math.PI), glow(CYAN, 2), [0, 1.22, 0.24]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    add(j, box(0.012, 0.28, 0.01), glow(0xfff1c0, 1.2), [Math.cos(a) * 0.14, 1.2 + Math.sin(a) * 0.14, 0.27], [1, 1, 1], [0, 0, a - Math.PI / 2]);
  }
  add(j, box(0.56, 0.3, 0.03), mat(0x2a2030, 0.4, 0.4), [0, 0.64, 0.24]);
  for (let i = 0; i < 5; i++) add(j, box(0.03, 0.26, 0.02), mat(CHROME, 0.25, 0.8), [-0.2 + i * 0.1, 0.64, 0.26]);
  add(j, box(0.7, 0.05, 0.03), glow(ORANGE, 1.8), [0, 0.95, 0.24]);
  add(j, box(0.7, 0.05, 0.03), glow(VIOLET, 1.8), [0, 0.38, 0.24]);
  for (const x of [-0.4, 0.4]) add(j, box(0.04, 1.05, 0.04), glow(CYAN, 1.6), [x, 0.7, 0.23]);
  return j;
}

// A snack machine: a pale cabinet with a lit window of coloured packs, a coin slot and a chute.
function vending() {
  const v = new THREE.Group();
  add(v, box(0.95, 1.8, 0.62), mat(CREAM, 0.4, 0.2), [0, 0.9, 0]);
  add(v, box(0.95, 0.12, 0.64), mat(TRIM, 0.4, 0.4), [0, 0.06, 0]);
  add(v, box(0.95, 0.22, 0.64), mat(RED, 0.4, 0.1), [0, 1.7, 0.0]);
  add(v, box(0.7, 0.05, 0.03), glow(0xffd166, 2.2), [0, 1.7, 0.33]);
  add(v, box(0.62, 1.05, 0.04), glow(0xbfeaff, 0.55), [-0.08, 1.05, 0.31]);
  const cols = [RED, ORANGE, CYAN, VIOLET, 0x7ccf4f];
  for (let r = 0; r < 4; r++) {
    add(v, box(0.62, 0.025, 0.07), mat(CHROME, 0.3, 0.7), [-0.08, 0.62 + r * 0.25, 0.32]);
    for (let c = 0; c < 4; c++) add(v, box(0.1, 0.14, 0.05), mat(cols[(r + c) % 5], 0.5), [-0.26 + c * 0.16, 0.7 + r * 0.25, 0.3]);
  }
  add(v, box(0.14, 0.9, 0.04), mat(TRIM, 0.4, 0.4), [0.37, 1.05, 0.31]);
  for (let i = 0; i < 3; i++) add(v, ball(0.025, 6), glow(i ? CYAN : ORANGE, 2), [0.37, 1.3 - i * 0.12, 0.34]);
  add(v, box(0.5, 0.18, 0.03), mat(0x1d1922, 0.5), [-0.08, 0.26, 0.31]);
  return v;
}

// A planet lamp: a slim chrome stand carrying a glowing banded planet with a tilted ring.
function planetLamp() {
  const l = new THREE.Group();
  add(l, cyl(0.2, 0.26, 0.08, 20), mat(TRIM, 0.4, 0.5), [0, 0.04, 0]);
  add(l, cyl(0.03, 0.035, 1.1, 8), mat(CHROME, 0.25, 0.8), [0, 0.6, 0]);
  add(l, ball(0.3, 20), glow(0xffa05a, 1.5), [0, 1.45, 0]);
  add(l, cyl(0.3, 0.3, 0.06, 20), glow(0xff6a3a, 1.6), [0, 1.5, 0], [1.02, 1, 1.02]);
  add(l, cyl(0.3, 0.3, 0.05, 20), glow(0xffe0a0, 1.3), [0, 1.35, 0], [0.96, 1, 0.96]);
  add(l, torus(0.46, 0.025, 40), glow(CYAN, 2.2), [0, 1.45, 0], [1, 1, 1], [Math.PI / 2 - 0.3, 0, 0.3]);
  add(l, ball(0.05, 8), glow(0xffffff, 2), [0.4, 1.62, 0.1]);
  return l;
}

// An atomic wall clock: a starburst of spikes around a white face, hung at head height.
function clock() {
  const c = new THREE.Group();
  const y = 1.75;
  add(c, cyl(0.26, 0.26, 0.05, 28), mat(CREAM, 0.3), [0, y, 0.18], [1, 1, 1], X90);
  add(c, torus(0.26, 0.02, 28), mat(CHROME, 0.2, 0.8), [0, y, 0.2]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 2 === 0;
    add(c, box(0.035, long ? 0.4 : 0.26, 0.03), long ? mat(ORANGE, 0.4) : mat(CHROME, 0.2, 0.8), [Math.sin(a) * (long ? 0.43 : 0.36), y + Math.cos(a) * (long ? 0.43 : 0.36), 0.18], [1, 1, 1], [0, 0, -a]);
    add(c, ball(long ? 0.045 : 0.03, 8), glow(long ? 0xffd166 : CYAN, 2), [Math.sin(a) * (long ? 0.65 : 0.52), y + Math.cos(a) * (long ? 0.65 : 0.52), 0.18]);
  }
  add(c, box(0.025, 0.17, 0.02), mat(INK), [0, y + 0.07, 0.22]);
  add(c, box(0.025, 0.12, 0.02), mat(INK), [0.05, y - 0.02, 0.22], [1, 1, 1], [0, 0, 1.2]);
  add(c, ball(0.03, 8), mat(RED), [0, y, 0.23]);
  return c;
}

// A neon sign on a stand: a ringed planet and a little rocket, drawn in glowing tubes.
function neonSign() {
  const s = new THREE.Group();
  add(s, box(0.9, 0.08, 0.4), mat(TRIM, 0.4, 0.5), [0, 0.04, 0]);
  for (const x of [-0.3, 0.3]) add(s, cyl(0.025, 0.025, 1.0, 8), mat(CHROME, 0.25, 0.8), [x, 0.55, 0]);
  add(s, box(1.0, 0.7, 0.06), mat(0x151a35, 0.5, 0.2), [0, 1.35, 0]);
  add(s, torus(0.2, 0.025, 28), glow(0xff5ea8, 2.4), [-0.22, 1.35, 0.05]);
  add(s, torus(0.34, 0.02, 32), glow(CYAN, 2.4), [-0.22, 1.35, 0.05], [1, 0.3, 1], [0.35, 0, 0.4]);
  add(s, cyl(0.07, 0.07, 0.34, 12), glow(ORANGE, 2.4), [0.3, 1.33, 0.05], [1, 1, 1], [0, 0, -0.6]);
  add(s, cone(0.07, 0.14, 12), glow(0xffd166, 2.4), [0.4, 1.47, 0.05], [1, 1, 1], [0, 0, -0.6]);
  for (const [x, y] of [[0.05, 1.6], [0.35, 1.1], [0.05, 1.1], [0.42, 1.58]]) add(s, ball(0.025, 6), glow(0xffffff, 2.4), [x, y, 0.06]);
  return s;
}

// A rolling robot waiter: a domed head with a visor, a round body, a tray and a single wheel ball.
function robot() {
  const r = new THREE.Group();
  add(r, ball(0.12, 12), mat(CHROME, 0.25, 0.8), [0, 0.12, 0]);
  add(r, cyl(0.26, 0.2, 0.45, 20), mat(CREAM, 0.35, 0.2), [0, 0.42, 0]);
  add(r, torus(0.23, 0.025, 24), glow(ORANGE, 1.8), [0, 0.5, 0], [1, 1, 1], X90);
  add(r, ball(0.2, 18), mat(CREAM, 0.35, 0.2), [0, 0.78, 0]);
  add(r, box(0.3, 0.1, 0.1), mat(0x151a35, 0.2, 0.4), [0, 0.8, 0.17]);
  for (const x of [-0.07, 0.07]) add(r, ball(0.025, 8), glow(CYAN, 3), [x, 0.8, 0.225]);
  add(r, cyl(0.012, 0.012, 0.18, 6), mat(CHROME, 0.2, 0.8), [0, 1.0, 0]);
  add(r, ball(0.045, 8), glow(RED, 2.2), [0, 1.1, 0]);
  add(r, cyl(0.025, 0.025, 0.22, 6), mat(CHROME, 0.3, 0.7), [0.3, 0.52, 0.12], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]);
  add(r, cyl(0.2, 0.2, 0.03, 20), mat(CHROME, 0.2, 0.8), [0.3, 0.58, 0.32]);
  add(r, cyl(0.07, 0.06, 0.1, 10), glow(0xffd166, 0.9), [0.3, 0.65, 0.32]);
  return r;
}

// Stacked cargo crates with hazard stripes and glowing latches.
function crates() {
  const g = new THREE.Group();
  const crate = (x, y, z, size, turn, color) => {
    const c = new THREE.Group();
    add(c, box(size, size, size), mat(color, 0.6, 0.15), [0, size / 2, 0]);
    for (const side of [-1, 1]) {
      add(c, box(size * 1.04, size * 0.1, size * 1.04), mat(HULL_DARK, 0.4, 0.5), [0, size / 2 + side * size * 0.36, 0]);
    }
    for (let i = 0; i < 4; i++) add(c, box(size * 0.14, size * 0.4, 0.02), mat(0xffc72a, 0.5), [(i - 1.5) * size * 0.24, size / 2, size / 2 + 0.005], [1, 1, 1], [0, 0, 0.7]);
    add(c, box(size * 0.18, size * 0.1, 0.03), glow(CYAN, 1.8), [0, size * 0.82, size / 2 + 0.02]);
    c.position.set(x, y, z);
    c.rotation.y = turn;
    g.add(c);
  };
  crate(-0.25, 0, 0, 0.62, 0.1, 0x6b7388);
  crate(0.38, 0, 0.1, 0.5, -0.2, 0x8a93a6);
  crate(-0.2, 0.62, 0.02, 0.45, -0.1, 0xb85b2e);
  return g;
}

// A holo-menu stand: a column with a floating pale-blue projected menu card and little glowing dishes.
function holoMenu() {
  const h = new THREE.Group();
  add(h, cyl(0.22, 0.28, 0.1, 20), mat(TRIM, 0.4, 0.5), [0, 0.05, 0]);
  add(h, cyl(0.1, 0.13, 0.6, 14), mat(CHROME, 0.25, 0.8), [0, 0.4, 0]);
  add(h, cyl(0.14, 0.1, 0.1, 14), mat(HULL, 0.3, 0.3), [0, 0.74, 0]);
  add(h, cyl(0.1, 0.04, 0.03, 14), glow(CYAN, 2.4), [0, 0.8, 0]);
  const card = add(h, box(0.7, 0.55, 0.02), new THREE.MeshStandardMaterial({ color: 0x7fe6ff, emissive: 0x3fd6e8, emissiveIntensity: 0.9, transparent: true, opacity: 0.5, roughness: 0.2 }), [0, 1.2, 0], [1, 1, 1], [-0.25, 0, 0]);
  card.name = "card";
  for (let i = 0; i < 4; i++) add(h, box(i % 2 ? 0.3 : 0.4, 0.035, 0.02), glow(i === 0 ? 0xffd166 : 0xffffff, 2), [i % 2 ? -0.1 : -0.05, 1.33 - i * 0.12, 0.04 + i * 0.03], [1, 1, 1], [-0.25, 0, 0]);
  add(h, ball(0.05, 8), glow(ORANGE, 2.4), [0.22, 1.37, 0.0]);
  return h;
}

// A telescope on a tripod, pointing up and out at the stars.
function telescope() {
  const t = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    add(t, cyl(0.02, 0.025, 0.95, 6), mat(CHROME, 0.3, 0.7), [Math.sin(a) * 0.15, 0.47, Math.cos(a) * 0.15], [1, 1, 1], [Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28]);
  }
  add(t, cyl(0.1, 0.1, 0.06, 14), mat(TRIM, 0.4, 0.5), [0, 0.93, 0]);
  const tube = new THREE.Group();
  add(tube, cyl(0.11, 0.09, 0.8, 18), mat(CREAM, 0.3, 0.3), [0, 0.1, 0]);
  add(tube, torus(0.115, 0.02, 20), glow(ORANGE, 1.6), [0, 0.5, 0], [1, 1, 1], X90);
  add(tube, torus(0.1, 0.02, 20), mat(RED, 0.4), [0, -0.15, 0], [1, 1, 1], X90);
  add(tube, cyl(0.025, 0.025, 0.18, 8), mat(CHROME, 0.3, 0.7), [0, -0.35, 0]);
  tube.position.set(0, 1.18, 0.1);
  tube.rotation.x = 1.0;
  t.add(tube);
  return t;
}

// A round floor rug with a starburst, so a table seems to sit in its own little pool of colour.
function rug() {
  const g = new THREE.Group();
  add(g, cyl(1.05, 1.05, 0.02, 40), mat(0x2f3a5c, 0.9), [0, 0.012, 0]);
  add(g, cyl(0.92, 0.92, 0.02, 40), mat(0x3b4a7a, 0.9), [0, 0.02, 0]);
  add(g, torus(0.8, 0.02, 40), glow(CYAN, 0.9), [0, 0.035, 0], [1, 1, 1], X90);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = i % 2 === 0;
    add(g, box(0.07, 0.012, long ? 0.62 : 0.4), mat(long ? ORANGE : 0xffd166, 0.8), [Math.sin(a) * (long ? 0.32 : 0.22), 0.035, Math.cos(a) * (long ? 0.32 : 0.22)], [1, 1, 1], [0, a, 0]);
  }
  add(g, cyl(0.1, 0.1, 0.012, 16), mat(RED, 0.8), [0, 0.04, 0]);
  return g;
}

// A dessert display case: a chrome counter with a glass dome over glowing cupcakes and cakes.
function dessertCase() {
  const d = new THREE.Group();
  add(d, box(1.0, 0.6, 0.5), mat(RED, 0.45, 0.1), [0, 0.3, 0]);
  add(d, box(1.04, 0.06, 0.54), mat(CHROME, 0.25, 0.8), [0, 0.63, 0]);
  add(d, box(0.9, 0.04, 0.03), glow(CYAN, 1.8), [0, 0.12, 0.26]);
  for (const [i, c] of [0xff6aa8, 0xffd166, 0x9b7bff, 0x7ccf4f].entries()) {
    const x = -0.33 + i * 0.22;
    add(d, cyl(0.07, 0.05, 0.09, 10), mat(CREAM, 0.5), [x, 0.71, 0.05]);
    add(d, ball(0.075, 10), glow(c, 0.7), [x, 0.8, 0.05], [1, 0.8, 1]);
  }
  add(d, cyl(0.14, 0.14, 0.05, 16), mat(CHROME, 0.2, 0.8), [0.1, 0.9, -0.05]);
  add(d, cyl(0.1, 0.1, 0.1, 16), glow(0xffe0a0, 0.8), [0.1, 0.97, -0.05]);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ef, roughness: 0.05, transparent: true, opacity: 0.28 });
  add(d, box(0.9, 0.42, 0.44), glass, [0, 0.87, 0]);
  add(d, box(0.94, 0.03, 0.48), mat(CHROME, 0.25, 0.8), [0, 1.09, 0]);
  return d;
}

const PROPS = {
  space_wall_panel: () => wallPanel(false),
  space_wall_porthole: () => wallPanel(true),
  space_table: table,
  guest_alien_green: () => alien(0x7ccf4f, 0xd8f0a8, 1),
  guest_alien_violet: () => alien(0x9b7bff, 0xe4ddff, 2),
  space_hydro: hydro,
  space_rocket: rocket,
  space_beacon: beacon,
  space_booth: booth,
  space_jukebox: jukebox,
  space_vending: vending,
  space_planet_lamp: planetLamp,
  space_clock: clock,
  space_neon_sign: neonSign,
  space_robot: robot,
  space_crates: crates,
  space_holo_menu: holoMenu,
  space_telescope: telescope,
  space_rug: rug,
  space_dessert_case: dessertCase,
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
