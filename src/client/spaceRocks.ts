import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TAU, fbm3, rng, toonMaterial } from "./spaceArt";

// The asteroid field: hand-made looking rocks (a subdivided icosahedron pushed about by seeded noise, flat shaded, with
// ambient occlusion baked into the vertex colours: dark in the crevices, light on the ridges), a few carrying small
// pastel crystals. Each shape is one InstancedMesh; the palette is baked into the shape so crystals keep their colour.

interface Palette {
  base: number;
  crystals?: number[];
}

const PALETTES: Palette[] = [
  { base: 0x9a8aa8 }, // dusty mauve
  { base: 0xc08c6c }, // sandstone
  { base: 0x7894ac }, // slate blue
  { base: 0x9a8aa8, crystals: [0xf0a0c8, 0xb8a0f0, 0x9ce0d4] },
  { base: 0xb4846e, crystals: [0x9cd8f4, 0xf4b8d8, 0xa8ecd0] },
];

function rockGeometry(seed: number, palette: Palette): THREE.BufferGeometry {
  const rand = rng(seed);
  const stretch = new THREE.Vector3(0.85 + rand() * 0.45, 0.7 + rand() * 0.4, 0.85 + rand() * 0.4);
  const dents: Array<{ dir: THREE.Vector3; size: number; depth: number }> = [];
  for (let i = 0; i < 3; i++) dents.push({ dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), size: 0.5 + rand() * 0.4, depth: 0.12 + rand() * 0.16 });
  const radius = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    let r = 1 + (fbm3(x * 1.5 + seed, y * 1.5, z * 1.5, seed, 3) - 0.5) * 0.7 + (fbm3(x * 4.2, y * 4.2 + seed, z * 4.2, seed + 5, 2) - 0.5) * 0.22;
    for (const d of dents) {
      const k = Math.max(0, 1 - Math.hypot(x - d.dir.x, y - d.dir.y, z - d.dir.z) / d.size);
      r -= d.depth * k * k;
    }
    return r;
  };
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(palette.base);
  const v = new THREE.Vector3();
  const e = 0.2;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = radius(v.x, v.y, v.z);
    // Curvature from four neighbours: lower than they are means a crevice, higher means an edge.
    const around = (radius(v.x + e, v.y, v.z) + radius(v.x - e, v.y, v.z) + radius(v.x, v.y + e, v.z) + radius(v.x, v.y - e, v.z) + radius(v.x, v.y, v.z + e) + radius(v.x, v.y, v.z - e)) / 6;
    const ao = Math.min(1.08, Math.max(0.5, 0.64 + (r - 0.8) * 0.8 + (r - around) * 2.4));
    pos.setXYZ(i, v.x * r * stretch.x, v.y * r * stretch.y, v.z * r * stretch.z);
    colors[i * 3] = base.r * ao;
    colors[i * 3 + 1] = base.g * ao;
    colors[i * 3 + 2] = base.b * ao;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals(); // non-indexed, so every face keeps its own normal: flat shading
  if (!palette.crystals) return g;

  // Small crystals growing out of the surface: a hexagonal shaft with a pointed tip.
  const parts: THREE.BufferGeometry[] = [g];
  const up = new THREE.Vector3(0, 1, 0);
  const count = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() * 0.8 - 0.1, rand() - 0.5).normalize();
    const r = radius(dir.x, dir.y, dir.z);
    const size = 0.1 + rand() * 0.1;
    const length = 0.35 + rand() * 0.4;
    const shaft = new THREE.CylinderGeometry(size, size * 1.15, length, 6, 1);
    const tip = new THREE.ConeGeometry(size, length * 0.5, 6, 1);
    tip.translate(0, length * 0.75, 0);
    const crystal = mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()], false)!;
    crystal.translate(0, length * 0.4, 0);
    const colour = new THREE.Color(palette.crystals[i % palette.crystals.length]);
    const cc = new Float32Array(crystal.attributes.position.count * 3);
    for (let k = 0; k < crystal.attributes.position.count; k++) {
      const shade = 0.7 + 0.3 * Math.min(1, Math.max(0, crystal.attributes.position.getY(k) / (length * 1.1)));
      cc[k * 3] = colour.r * shade;
      cc[k * 3 + 1] = colour.g * shade;
      cc[k * 3 + 2] = colour.b * shade;
    }
    crystal.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    crystal.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(dir.x * r * stretch.x * 0.92, dir.y * r * stretch.y * 0.92, dir.z * r * stretch.z * 0.92), q, new THREE.Vector3(1, 1, 1)));
    crystal.deleteAttribute("uv");
    parts.push(crystal);
  }
  g.deleteAttribute("uv");
  for (const part of parts) if (part.attributes.uv) part.deleteAttribute("uv");
  return mergeGeometries(parts, false)!;
}

export interface RockField {
  tick: (time: number) => void;
}

export function createRocks(parent: THREE.Object3D, spots: Array<{ x: number; y: number; z: number; size: number }>): RockField {
  const material = toonMaterial({ vertexColors: true, rim: 0x8a9cf0, rimStrength: 0.38, shadow: [0.44, 0.4, 0.64], mid: [0.72, 0.68, 0.86] });
  const shapes = PALETTES.map((p, i) => rockGeometry(11 + i * 23, p));
  const shapeCount = shapes.length;
  const rand = rng(2024);
  type Entry = { mesh: THREE.InstancedMesh; ids: number[] };
  const entries: Entry[] = shapes.map((g) => ({ mesh: new THREE.InstancedMesh(g, material, spots.length), ids: [] }));
  const data = spots.map((_spot, i) => {
    const shape = i % shapeCount;
    return {
      shape,
      slot: entries[shape].ids.push(i) - 1,
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      speed: (0.05 + rand() * 0.16) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * TAU,
      bob: 0.15 + rand() * 0.3,
      tilt: rand() * TAU,
      tint: new THREE.Color().setScalar(0.88 + rand() * 0.2),
    };
  });
  for (const entry of entries) {
    entry.mesh.count = entry.ids.length;
    entry.mesh.frustumCulled = false;
    // An instance colour must exist before the first draw so the shader gets its instanceColor attribute.
    entry.ids.forEach((id, slot) => entry.mesh.setColorAt(slot, data[id].tint));
    parent.add(entry.mesh);
  }
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const tick = (time: number): void => {
    for (let i = 0; i < spots.length; i++) {
      const d = data[i];
      const spot = spots[i];
      q.setFromAxisAngle(d.axis, d.phase + time * d.speed);
      p.set(spot.x, spot.y + Math.sin(time * 0.3 + d.phase) * d.bob, spot.z);
      s.setScalar(spot.size);
      m.compose(p, q, s);
      entries[d.shape].mesh.setMatrixAt(d.slot, m);
    }
    for (const entry of entries) entry.mesh.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { tick };
}
