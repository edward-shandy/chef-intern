import * as THREE from "three";
import { animateSteam, ball, box, createSteam, cylinder, mat, mesh, shadowed } from "./models";

// A red extinguisher with its origin at the base: banded tank, label, valve, gauge, squeeze handle and hose.
export function createExtinguisher(): THREE.Group {
  const group = new THREE.Group();
  const red = mat(0xe23b2e, 0.35, 0.15);
  const dark = mat(0x25252c, 0.6);
  const steel = mat(0xcfd4dc, 0.3, 0.7);
  const quarter = Math.PI / 2;
  const turn = (object: THREE.Mesh, x: number, y: number, z: number) => {
    object.rotation.set(x, y, z);
    return object;
  };
  group.add(
    mesh(cylinder(0.126, 0.126, 0.035), dark, 0, 0.018, 0),
    mesh(cylinder(0.12, 0.12, 0.34), red, 0, 0.2, 0),
    mesh(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, quarter), red, 0, 0.37, 0),
    mesh(cylinder(0.1225, 0.1225, 0.13), mat(0xfff3d6, 0.6), 0, 0.21, 0),
    mesh(box(0.06, 0.08, 0.01), mat(0xff8a1f, 0.5), 0, 0.215, 0.1225),
    mesh(box(0.03, 0.04, 0.012), mat(0xffd166, 0.5), 0, 0.2, 0.1235),
    mesh(cylinder(0.1235, 0.1235, 0.022), steel, 0, 0.075, 0),
    mesh(cylinder(0.1235, 0.1235, 0.022), steel, 0, 0.345, 0),
    mesh(cylinder(0.04, 0.055, 0.07), steel, 0, 0.5, 0),
    mesh(box(0.075, 0.05, 0.075), steel, 0, 0.545, 0),
    mesh(box(0.05, 0.022, 0.22), dark, 0, 0.575, -0.07),
    turn(mesh(box(0.05, 0.022, 0.24), dark, 0, 0.63, -0.075), 0.3, 0, 0),
    turn(mesh(cylinder(0.042, 0.042, 0.02), dark, 0.045, 0.545, 0), 0, 0, quarter),
    turn(mesh(cylinder(0.034, 0.034, 0.024), mat(0xffffff, 0.4), 0.048, 0.545, 0), 0, 0, quarter),
    turn(mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 14, Math.PI * 0.9), dark, 0, 0.44, 0.12), 0, -quarter, 0),
    mesh(cylinder(0.02, 0.036, 0.13, 10), dark, 0, 0.375, 0.22),
    turn(mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12), mat(0xf2c230, 0.4, 0.5), -0.05, 0.6, 0), 0, quarter, 0),
  );
  return shadowed(group);
}

const TONGUE = new THREE.LatheGeometry(
  [
    [0, 0],
    [0.44, 0.12],
    [0.58, 0.45],
    [0.46, 0.95],
    [0.22, 1.5],
    [0, 2.0],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  7,
);
const flameLayer = (colour: number) => new THREE.MeshBasicMaterial({ color: colour, fog: false, toneMapped: false });
const LAYERS = [flameLayer(0xff4d1a), flameLayer(0xff9a1f), flameLayer(0xffe066)];
const EMBER = flameLayer(0xffd166);
const SCORCH = new THREE.MeshBasicMaterial({ color: 0x1a1414, transparent: true, opacity: 0.55, depthWrite: false });

// One tongue of flame: three nested teardrops, each brighter one pushed just proud of the last on the camera's side.
function createTongue(size: number): THREE.Group {
  const tongue = new THREE.Group();
  [1, 0.64, 0.34].forEach((scale, i) => {
    const layer = mesh(TONGUE, LAYERS[i], 0, 0, 0.58 * size * (1 - scale) + 0.04 * i);
    layer.scale.setScalar(size * scale);
    tongue.add(layer);
  });
  return tongue;
}

export interface FireView {
  group: THREE.Group;
  tongues: THREE.Group[];
  embers: THREE.Mesh[];
  smoke: THREE.Group;
}

// A fire covering one worktop: a scorch mark, five licking tongues, rising embers and dark smoke.
export function createFire(): FireView {
  const group = new THREE.Group();
  const scorch = mesh(new THREE.CircleGeometry(0.48, 20), SCORCH, 0, 0.012, 0);
  scorch.rotation.x = -Math.PI / 2;
  const tongues = [
    [0, 0, 0.56],
    [-0.27, -0.16, 0.36],
    [0.26, -0.12, 0.4],
    [-0.2, 0.22, 0.32],
    [0.24, 0.24, 0.3],
  ].map(([x, z, size]) => {
    const tongue = createTongue(size);
    tongue.position.set(x, 0, z);
    return tongue;
  });
  const embers = Array.from({ length: 7 }, () => mesh(box(0.04, 0.04, 0.04), EMBER));
  const smoke = createSteam();
  smoke.position.y = 0.45;
  group.add(scorch, ...tongues, ...embers, smoke);
  return { group, tongues, embers, smoke };
}

// Flickers a fire and shrinks it as it is put out; heat runs from 1 (fresh) down to 0.
export function animateFire(fire: FireView, time: number, heat: number, seed: number): void {
  const size = 0.45 + 0.55 * heat;
  fire.tongues.forEach((tongue, i) => {
    const flicker = Math.abs(Math.sin(time * 9 + i * 2.1 + seed));
    tongue.scale.set(size * (1 + Math.sin(time * 13 + i + seed) * 0.08), size * (0.82 + flicker * 0.4), size);
    tongue.rotation.z = Math.sin(time * 7 + i * 1.7 + seed) * 0.1;
  });
  fire.embers.forEach((ember, i) => {
    const phase = (time * 0.9 + i / fire.embers.length + seed * 0.13) % 1;
    ember.position.set(Math.sin(i * 2.3 + time * 2) * 0.3, 0.3 + phase * 1.3, Math.cos(i * 1.9 + time) * 0.25);
    ember.scale.setScalar((1 - phase) * size);
    ember.rotation.set(time * 3 + i, time * 2, 0);
  });
  animateSteam(fire.smoke, time, true);
}

const SPRAY_PUFFS = 16;

// The extinguisher's cloud: a cone of white puffs leaving the nozzle along +z.
export function createSpray(): THREE.Group {
  const spray = new THREE.Group();
  for (let i = 0; i < SPRAY_PUFFS; i++) {
    spray.add(new THREE.Mesh(ball(0.16, 10), new THREE.MeshBasicMaterial({ color: 0xe6f4ff, transparent: true, depthWrite: false, fog: false })));
  }
  spray.visible = false;
  return spray;
}

export function animateSpray(spray: THREE.Group, time: number, reach: number): void {
  spray.children.forEach((child, i) => {
    const puff = child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    const phase = (time * 2.4 + i / SPRAY_PUFFS) % 1;
    puff.position.set(Math.sin(i * 2.4) * phase * 0.5, 0.62 + Math.cos(i * 1.7) * phase * 0.22, 0.55 + phase * (reach - 0.55));
    puff.scale.setScalar(0.35 + phase * 1.9);
    puff.material.opacity = Math.min(1, (1 - phase) * 1.4);
  });
}
