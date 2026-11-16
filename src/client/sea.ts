import * as THREE from "three";
import type { Level } from "../shared/level";
import { decoration } from "./assets";
import { ball, box, canvasTexture, cylinder, mat, mesh, noise, rounded } from "./models";
import { bake } from "./street";

// The sea floor is painted on one canvas covering this rectangle, in tiles.
const X0 = -16;
const X1 = 29;
const Z0 = -13;
const Z1 = 19;
const PX = 36;

export const SEA_WATER = 0x0e5672;
export const SEA_SAND = 0xe6d3a0;

interface Swimmer {
  group: THREE.Object3D;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  y: number;
  speed: number;
  phase: number;
}

interface SeaView {
  swimmers: Swimmer[];
  jellies: THREE.Object3D[];
  kelp: THREE.Object3D[];
  bubbles: THREE.InstancedMesh;
  vents: Array<[number, number]>;
}

const blob = (radius: number) => new THREE.IcosahedronGeometry(radius, 1);
const dome = (radius: number) => new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const flat = (colour: number) => mat(colour, 0.85, 0, true);

function put<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, turn = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = turn;
  return object;
}

function tilt(object: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  object.rotation.set(x, y, z);
  return object;
}

// ---------------------------------------------------------------- sea life

// A chubby fish facing +z: body, tail, two fins, a stripe and big eyes.
function createFish(colour: number, stripe: number): THREE.Group {
  const fish = new THREE.Group();
  const body = mesh(ball(0.2, 12), mat(colour, 0.5));
  body.scale.set(0.62, 0.85, 1.25);
  const band = mesh(ball(0.202, 12), mat(stripe, 0.5));
  band.scale.set(0.63, 0.86, 0.3);
  const tail = tilt(mesh(new THREE.ConeGeometry(0.14, 0.22, 4), mat(stripe, 0.5), 0, 0, -0.32), Math.PI / 2, 0, 0);
  tail.scale.set(0.3, 1, 1.2);
  const fin = tilt(mesh(new THREE.ConeGeometry(0.08, 0.16, 4), mat(stripe, 0.5), 0, 0.19, -0.02), -0.5, 0, 0);
  fin.scale.set(0.3, 1, 1);
  fish.add(body, band, tail, fin);
  for (const side of [-1, 1]) {
    fish.add(
      mesh(ball(0.045, 8), mat(0xffffff, 0.3), side * 0.1, 0.05, 0.16),
      mesh(ball(0.024, 8), mat(0x1c1c28, 0.3), side * 0.125, 0.05, 0.18),
    );
  }
  return bake(fish);
}

// A sea turtle facing +z, seen mostly from above: patterned shell, head and four flippers.
function createTurtle(): THREE.Group {
  const turtle = new THREE.Group();
  const shell = mesh(dome(0.42), flat(0x4f9d6a), 0, 0, 0);
  shell.scale.set(1, 0.55, 1.2);
  const skin = mat(0x9bd38a, 0.7);
  turtle.add(shell, mesh(cylinder(0.44, 0.44, 0.05, 12), mat(0x3a7a52, 0.8), 0, 0, 0));
  turtle.children[1].scale.set(1, 1, 1.2);
  turtle.add(mesh(ball(0.14, 10), skin, 0, 0.02, 0.6));
  for (const [x, z, turn] of [[-0.45, 0.3, 0.9], [0.45, 0.3, -0.9], [-0.38, -0.4, 2.2], [0.38, -0.4, -2.2]]) {
    const flipper = mesh(rounded(0.16, 0.04, 0.42, 0.02), skin, x, 0, z);
    flipper.rotation.y = turn;
    turtle.add(flipper);
  }
  for (const [x, z] of [[0, 0.2], [-0.18, -0.05], [0.18, -0.05], [0, -0.28]]) {
    turtle.add(mesh(cylinder(0.11, 0.11, 0.02, 6), mat(0x7cc28a, 0.8), x, 0.2 - Math.abs(x) * 0.3 - Math.abs(z) * 0.12, z));
  }
  return bake(turtle);
}

// A translucent jellyfish: bell, frilled rim and trailing tentacles.
function createJelly(colour: number): THREE.Group {
  const jelly = new THREE.Group();
  const bell = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.3, transparent: true, opacity: 0.72, emissive: colour, emissiveIntensity: 0.25 });
  jelly.add(mesh(dome(0.26), bell, 0, 0, 0), mesh(cylinder(0.27, 0.22, 0.06, 14), bell, 0, -0.03, 0));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    jelly.add(mesh(cylinder(0.018, 0.008, 0.5 + (i % 3) * 0.12, 5), bell, Math.cos(angle) * 0.15, -0.32 - (i % 3) * 0.06, Math.sin(angle) * 0.15));
  }
  return bake(jelly);
}

// ---------------------------------------------------------------- reef

type CoralKind = "branch" | "tube" | "brain" | "fan";

function createCoral(kind: CoralKind, colour: number, seed: number): THREE.Group {
  const coral = new THREE.Group();
  const main = flat(colour);
  const tip = flat(new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.45).getHex());
  if (kind === "branch") {
    coral.add(mesh(cylinder(0.09, 0.13, 0.5, 6), main, 0, 0.25, 0));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + noise(seed + i);
      const lean = 0.5 + noise(seed + i * 3) * 0.4;
      const arm = new THREE.Group();
      arm.add(mesh(cylinder(0.05, 0.08, 0.6, 6), main, 0, 0.3, 0), mesh(blob(0.085), tip, 0, 0.62, 0));
      const twig = tilt(mesh(cylinder(0.035, 0.05, 0.3, 5), main, 0.07, 0.42, 0), 0, 0, -0.8);
      arm.add(twig, mesh(blob(0.06), tip, 0.2, 0.52, 0));
      arm.position.y = 0.38;
      arm.rotation.set(Math.cos(angle) * lean, 0, Math.sin(angle) * lean);
      coral.add(arm);
    }
  } else if (kind === "tube") {
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4;
      const reach = i === 0 ? 0 : 0.2 + (i % 2) * 0.08;
      const tall = 0.35 + noise(seed + i) * 0.55;
      coral.add(
        mesh(cylinder(0.1, 0.075, tall, 8), main, Math.cos(angle) * reach, tall / 2, Math.sin(angle) * reach),
        mesh(cylinder(0.075, 0.075, 0.02, 8), mat(0x2a2030, 0.9), Math.cos(angle) * reach, tall + 0.002, Math.sin(angle) * reach),
        mesh(new THREE.TorusGeometry(0.09, 0.022, 5, 10), tip, Math.cos(angle) * reach, tall, Math.sin(angle) * reach),
      );
      coral.children[coral.children.length - 1].rotation.x = Math.PI / 2;
    }
  } else if (kind === "brain") {
    const lump = mesh(blob(0.42), main, 0, 0.22, 0);
    lump.scale.y = 0.7;
    coral.add(lump);
    for (let i = 0; i < 6; i++) {
      const ridge = mesh(new THREE.TorusGeometry(0.16 + i * 0.045, 0.022, 4, 14, Math.PI), tip, 0, 0.2, 0);
      ridge.rotation.y = i * 0.5;
      ridge.scale.y = 1.2;
      coral.add(ridge);
    }
  } else {
    coral.add(mesh(cylinder(0.04, 0.07, 0.3, 6), main, 0, 0.15, 0));
    const fan = mesh(new THREE.CircleGeometry(0.5, 9, 0, Math.PI), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), 0, 0.28, 0);
    coral.add(fan);
    for (let i = 1; i < 6; i++) {
      const rib = tilt(mesh(box(0.025, 0.5, 0.03), tip, 0, 0.28, 0), 0, 0, -Math.PI / 2 + (i / 6) * Math.PI);
      rib.position.set(Math.cos((i / 6) * Math.PI) * 0.25, 0.28 + Math.sin((i / 6) * Math.PI) * 0.25, 0);
      coral.add(rib);
    }
  }
  coral.rotation.y = noise(seed + 9) * 6;
  coral.scale.setScalar(0.9 + noise(seed + 4) * 0.5);
  return coral;
}

// A strand of kelp built upright from leaf-shaped segments; the whole strand sways from its root.
function createKelp(seed: number): THREE.Group {
  const kelp = new THREE.Group();
  const greens = [0x3f9d57, 0x57b56a, 0x2f8a4a];
  const tall = 5 + Math.floor(noise(seed) * 4);
  for (let i = 0; i < tall; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.16, 0.62, 5), flat(greens[i % 3]), Math.sin(i * 1.3 + seed) * 0.09, 0.3 + i * 0.42, 0);
    leaf.scale.set(1, 1, 0.35);
    leaf.rotation.set(0, i * 0.9, Math.sin(i * 1.7 + seed) * 0.35);
    kelp.add(leaf);
  }
  kelp.add(mesh(cylinder(0.03, 0.045, tall * 0.42, 5), flat(0x2f7a45), 0, tall * 0.21, 0));
  return bake(kelp);
}

function createRock(seed: number): THREE.Group {
  const rock = new THREE.Group();
  const stone = flat(0x7d8fa0);
  const big = mesh(blob(0.5), stone, 0, 0.25, 0);
  big.scale.set(1.2, 0.75, 1);
  const small = mesh(blob(0.3), flat(0x93a5b4), 0.45, 0.15, 0.2);
  rock.add(big, small, mesh(blob(0.18), flat(0x5fae6e), -0.2, 0.55, 0.1), mesh(blob(0.12), flat(0x7cc28a), 0.2, 0.5, -0.2));
  rock.rotation.y = noise(seed) * 6;
  rock.scale.setScalar(0.8 + noise(seed + 2) * 0.7);
  return rock;
}

// A giant clam, open, with a pearl.
function createClam(): THREE.Group {
  const clam = new THREE.Group();
  const shell = mat(0xc9a9e0, 0.6);
  const lower = mesh(dome(0.5), shell, 0, 0.14, 0);
  lower.rotation.x = Math.PI;
  lower.scale.y = 0.5;
  const upper = mesh(dome(0.5), shell, 0, 0.2, -0.16);
  upper.scale.y = 0.5;
  upper.rotation.x = -0.9;
  clam.add(lower, upper, mesh(cylinder(0.46, 0.46, 0.03, 16), mat(0xf7b6cf, 0.5), 0, 0.14, 0), mesh(ball(0.13, 12), mat(0xffffff, 0.15, 0.3), 0, 0.27, 0.05));
  return clam;
}

function createChest(): THREE.Group {
  const chest = new THREE.Group();
  const wood = mat(0x8a5a3c, 0.85);
  const gold = mat(0xf2c230, 0.3, 0.7);
  chest.add(
    mesh(rounded(0.9, 0.42, 0.56, 0.04), wood, 0, 0.21, 0),
    tilt(mesh(rounded(0.9, 0.2, 0.56, 0.08), wood, 0, 0.56, -0.2), -0.9, 0, 0),
    mesh(box(0.92, 0.06, 0.58), gold, 0, 0.4, 0),
    mesh(box(0.08, 0.44, 0.58), gold, -0.3, 0.21, 0),
    mesh(box(0.08, 0.44, 0.58), gold, 0.3, 0.21, 0),
    mesh(box(0.8, 0.08, 0.46), gold, 0, 0.43, 0),
  );
  for (let i = 0; i < 9; i++) {
    chest.add(mesh(cylinder(0.06, 0.06, 0.02, 10), gold, -0.3 + noise(i) * 0.6, 0.48 + noise(i + 5) * 0.06, -0.15 + noise(i + 9) * 0.3));
  }
  chest.add(mesh(blob(0.07), flat(0xe23b2e), 0.1, 0.52, 0.05), mesh(blob(0.06), flat(0x3d8fe4), -0.15, 0.52, -0.05));
  return chest;
}

// The delivery submarine, parked on skids beside the kitchen and facing +x.
function createSubmarine(): THREE.Group {
  const sub = new THREE.Group();
  const yellow = mat(0xf2c230, 0.4, 0.1);
  const dark = mat(0x39424e, 0.5, 0.4);
  const glass = mat(0xa6dcee, 0.1, 0.3);
  const hull = mesh(ball(0.7, 18), yellow, 0, 0.95, 0);
  hull.scale.set(1.9, 1, 1);
  sub.add(
    hull,
    mesh(cylinder(0.32, 0.38, 0.5, 14), yellow, 0.1, 1.75, 0),
    mesh(cylinder(0.34, 0.34, 0.06, 14), dark, 0.1, 2.02, 0),
    mesh(cylinder(0.035, 0.035, 0.6, 6), dark, 0.2, 2.3, 0),
    mesh(box(0.2, 0.06, 0.06), dark, 0.28, 2.58, 0),
    tilt(mesh(new THREE.ConeGeometry(0.4, 0.5, 12), yellow, -1.45, 0.95, 0), 0, 0, Math.PI / 2),
    mesh(box(0.06, 0.9, 0.06), dark, -1.72, 0.95, 0),
    mesh(box(0.06, 0.06, 0.9), dark, -1.72, 0.95, 0),
    mesh(box(0.5, 0.05, 1.5), yellow, -1.1, 0.95, 0),
    mesh(box(1.9, 0.08, 0.1), dark, 0, 0.12, -0.42),
    mesh(box(1.9, 0.08, 0.1), dark, 0, 0.12, 0.42),
    mesh(box(2.2, 0.06, 0.02), mat(0xe4573d, 0.5), 0, 0.72, 0.655),
  );
  for (const x of [-0.6, 0.6]) for (const z of [-0.42, 0.42]) sub.add(mesh(box(0.08, 0.3, 0.08), dark, x, 0.28, z));
  for (const x of [-0.55, 0.15, 0.85]) {
    sub.add(
      tilt(mesh(cylinder(0.2, 0.2, 0.06, 14), dark, x, 1.05, 0.66 - Math.abs(x - 0.15) * 0.06), Math.PI / 2, 0, 0),
      tilt(mesh(cylinder(0.15, 0.15, 0.08, 14), glass, x, 1.05, 0.67 - Math.abs(x - 0.15) * 0.06), Math.PI / 2, 0, 0),
    );
  }
  sub.add(tilt(mesh(cylinder(0.26, 0.26, 0.06, 14), dark, 1.28, 0.95, 0), 0, 0, Math.PI / 2), tilt(mesh(cylinder(0.2, 0.2, 0.08, 14), glass, 1.3, 0.95, 0), 0, 0, Math.PI / 2));
  return sub;
}

// A brass lantern post that lights the dining spots.
function createLantern(): THREE.Group {
  const lantern = new THREE.Group();
  const brass = mat(0xd9a441, 0.35, 0.7);
  const light = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 0.9, roughness: 0.4 });
  lantern.add(
    mesh(cylinder(0.14, 0.18, 0.12, 10), brass, 0, 0.06, 0),
    mesh(cylinder(0.04, 0.05, 1.5, 8), brass, 0, 0.8, 0),
    mesh(cylinder(0.16, 0.16, 0.05, 10), brass, 0, 1.55, 0),
    mesh(ball(0.17, 12), light, 0, 1.73, 0),
    mesh(new THREE.ConeGeometry(0.2, 0.14, 10), brass, 0, 1.94, 0),
  );
  return lantern;
}

// ---------------------------------------------------------------- sea floor

interface Spot {
  x: number;
  z: number;
  radius: number;
}

// Paints rippled sand, a riveted deck round the kitchen, stone pads for the tables, pebbles, shells and starfish.
function floorTexture(level: Level, pads: Spot[], shadows: Spot[], anisotropy: number): THREE.CanvasTexture {
  const texture = canvasTexture((X1 - X0) * PX, (Z1 - Z0) * PX, (ctx) => {
    const px = (x: number) => (x - X0) * PX;
    const pz = (z: number) => (z - Z0) * PX;
    const disc = (x: number, z: number, rx: number, rz: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(px(x), pz(z), rx * PX, rz * PX, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.fillStyle = "#e6d3a0";
    ctx.fillRect(0, 0, (X1 - X0) * PX, (Z1 - Z0) * PX);
    for (let i = 0; i < 40; i++) disc(X0 + noise(i * 3.3) * (X1 - X0), Z0 + noise(i * 5.1) * (Z1 - Z0), 2 + noise(i) * 2.5, 1 + noise(i + 2) * 1.5, i % 2 ? "rgba(255, 244, 205, 0.35)" : "rgba(190, 160, 105, 0.22)");
    // Ripples left by the current.
    ctx.strokeStyle = "rgba(170, 140, 90, 0.4)";
    ctx.lineWidth = 2;
    for (let z = Z0 + 0.4; z < Z1; z += 0.55) {
      ctx.beginPath();
      for (let x = X0; x <= X1; x += 0.5) {
        const y = pz(z + Math.sin(x * 1.3 + z * 2.1) * 0.12 + Math.sin(x * 0.4 + z) * 0.1);
        if (x === X0) ctx.moveTo(px(x), y);
        else ctx.lineTo(px(x), y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 500; i++) {
      const x = X0 + noise(i * 1.9 + 4) * (X1 - X0);
      const z = Z0 + noise(i * 2.7 + 1) * (Z1 - Z0);
      disc(x, z, 0.05 + noise(i) * 0.06, 0.04 + noise(i + 1) * 0.05, ["#b9a98a", "#f7ecd0", "#9fb0b8", "#d98f7a"][i % 4]);
    }
    // Starfish and scallop shells.
    for (let i = 0; i < 26; i++) {
      const x = px(X0 + noise(i * 7.7) * (X1 - X0));
      const z = pz(Z0 + noise(i * 9.1 + 3) * (Z1 - Z0));
      if (i % 2) {
        ctx.fillStyle = i % 4 === 1 ? "#f0803a" : "#e4573d";
        ctx.beginPath();
        for (let point = 0; point < 10; point++) {
          const reach = (point % 2 ? 0.1 : 0.26) * PX;
          const angle = (point / 10) * Math.PI * 2 + i;
          ctx.lineTo(x + Math.cos(angle) * reach, z + Math.sin(angle) * reach);
        }
        ctx.fill();
      } else {
        ctx.fillStyle = "#f7c9d6";
        ctx.beginPath();
        ctx.arc(x, z, 0.2 * PX, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = "#d98fa8";
        ctx.lineWidth = 1.5;
        for (let rib = 1; rib < 6; rib++) {
          ctx.beginPath();
          ctx.moveTo(x, z);
          ctx.lineTo(x + Math.cos(Math.PI + (rib / 6) * Math.PI) * 0.2 * PX, z + Math.sin(Math.PI + (rib / 6) * Math.PI) * 0.2 * PX);
          ctx.stroke();
        }
      }
    }
    // Round stone pads under the tables, and a walk of stepping stones up to the kitchen.
    for (const pad of pads) {
      disc(pad.x, pad.z, pad.radius + 0.12, pad.radius + 0.12, "#8fa3ad");
      disc(pad.x, pad.z, pad.radius, pad.radius, "#b7c6cd");
      disc(pad.x, pad.z, pad.radius * 0.62, pad.radius * 0.62, "rgba(255, 255, 255, 0.18)");
    }
    for (let i = 0; i < 9; i++) disc(level.width / 2 + Math.sin(i * 1.4) * 0.35, level.height + 1.6 + i * 0.95, 0.42, 0.34, i % 2 ? "#b7c6cd" : "#a3b4bd");
    // The kitchen stands on a riveted teal deck a little wider than its floor.
    const edge = 0.9;
    ctx.fillStyle = "#2f7f86";
    ctx.fillRect(px(-edge), pz(-edge), (level.width + edge * 2) * PX, (level.height + edge * 2) * PX);
    ctx.fillStyle = "#3d9aa2";
    ctx.fillRect(px(-edge + 0.12), pz(-edge + 0.12), (level.width + edge * 2 - 0.24) * PX, (level.height + edge * 2 - 0.24) * PX);
    for (let x = -edge + 0.3; x < level.width + edge; x += 0.6) {
      for (const z of [-edge + 0.3, level.height + edge - 0.3]) disc(x, z, 0.06, 0.06, "#d9a441");
    }
    for (let z = -edge + 0.3; z < level.height + edge; z += 0.6) {
      for (const x of [-edge + 0.3, level.width + edge - 0.3]) disc(x, z, 0.06, 0.06, "#d9a441");
    }
    for (const spot of shadows) {
      const gradient = ctx.createRadialGradient(px(spot.x), pz(spot.z), 0, px(spot.x), pz(spot.z), spot.radius * PX);
      gradient.addColorStop(0, "rgba(20, 50, 70, 0.32)");
      gradient.addColorStop(1, "rgba(20, 50, 70, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(px(spot.x - spot.radius), pz(spot.z - spot.radius), spot.radius * 2 * PX, spot.radius * 2 * PX);
    }
  });
  texture.anisotropy = anisotropy;
  return texture;
}

// ---------------------------------------------------------------- the scene

// Builds a kitchen's surroundings on the sea floor: a glass wall behind it, diners in bubble helmets, a reef and passing sea life.
export function createSea(level: Level, anisotropy: number, guests: THREE.Object3D[]): { group: THREE.Group; view: SeaView } {
  const group = new THREE.Group();
  const solid = new THREE.Group();
  const shadows: Spot[] = [];
  const pads: Spot[] = [];
  const { width } = level;
  const place = (object: THREE.Object3D, x: number, z: number, turn = 0, shadow = 0.7) => {
    solid.add(put(object, x, 0, z, turn));
    if (shadow > 0) shadows.push({ x, z, radius: shadow });
  };

  // A brass-framed glass wall behind the kitchen, with a rail in front that the lamps hang from.
  const brass = mat(0xd9a441, 0.35, 0.7);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe3f2, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false });
  for (let x = -0.5; x <= width + 0.5; x += 2) solid.add(mesh(cylinder(0.07, 0.07, 2.3, 8), brass, x, 1.15, -0.3), mesh(ball(0.1, 10), brass, x, 2.34, -0.3));
  solid.add(
    mesh(box(width + 1.1, 0.1, 0.12), brass, width / 2, 2.25, -0.3),
    mesh(box(width + 1.1, 0.16, 0.16), brass, width / 2, 0.08, -0.3),
    mesh(cylinder(0.04, 0.04, 2.75, 6), brass, -0.55, 1.375, 0.5),
    mesh(cylinder(0.04, 0.04, 2.75, 6), brass, width + 0.55, 1.375, 0.5),
    mesh(box(width + 1.2, 0.06, 0.06), brass, width / 2, 2.75, 0.5),
  );
  group.add(mesh(box(width + 1, 2.1, 0.04), glass, width / 2, 1.2, -0.3));

  // Diners sit at tables on stone pads either side, each inside a bubble helmet.
  const bubble = new THREE.MeshStandardMaterial({ color: 0xcdf3ff, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false });
  const sets: Array<[string, number, number, string[]]> = [
    ["dining_round", -3.6, 1.6, ["guest_coral", "guest_blue"]],
    ["dining_square", -3.8, 4.6, ["guest_mint", ""]],
    ["dining_round", -3.4, 7.6, ["guest_mustard", "guest_coral"]],
    ["dining_square", width + 3.6, 1.6, ["", "guest_mint"]],
    ["dining_round", width + 3.8, 4.6, ["guest_blue", "guest_mustard"]],
    ["dining_square", width + 3.4, 7.6, ["guest_coral", ""]],
  ];
  for (const [model, x, z, seats] of sets) {
    const furniture = decoration(model);
    if (!furniture) continue;
    const set = new THREE.Group();
    set.add(furniture);
    seats.forEach((name, seat) => {
      const guest = name ? decoration(name) : null;
      if (!guest) return;
      const seatX = seat === 0 ? -0.82 : 0.82;
      const bounds = new THREE.Box3().setFromObject(guest);
      const radius = (bounds.max.x - bounds.min.x) * 0.62;
      const diver = new THREE.Group();
      diver.add(guest, mesh(ball(radius, 14), bubble, 0, bounds.max.y - radius * 0.78, 0), mesh(cylinder(radius * 0.62, radius * 0.7, 0.07, 12), brass, 0, bounds.max.y - radius * 1.55, 0));
      diver.position.set(seatX, 0.16, 0);
      diver.rotation.y = Math.atan2(-seatX, 0);
      diver.userData.restY = 0.16;
      guests.push(diver);
      set.add(diver);
    });
    set.position.set(x, 0, z);
    set.scale.setScalar(0.78);
    group.add(set);
    pads.push({ x, z, radius: 1.5 });
    shadows.push({ x, z, radius: 1.2 });
  }
  for (const [x, z] of [[-5.6, 3.1], [-5.6, 6.1], [width + 5.6, 3.1], [width + 5.6, 6.1]]) place(createLantern(), x, z, 0, 0.4);

  // The reef: coral gardens behind the glass and in the corners, rocks, a clam, a chest and the delivery submarine.
  const pinks = [0xf27aa0, 0xff9d5c, 0xb58ae0, 0xffd166, 0x4fd1c5, 0xe4573d];
  const kinds: CoralKind[] = ["branch", "tube", "brain", "fan"];
  const reef: Array<[number, number]> = [
    [-1.2, -1.6], [0.6, -2.4], [2.4, -1.5], [4.6, -2.6], [6.2, -1.6], [8.3, -2.5], [10.4, -1.5], [12.2, -2.6], [14, -1.7],
    [-6.8, -1.2], [-8.4, 1.4], [-7.6, 9.8], [-9.5, 6.2], [width + 6.8, -1.2], [width + 8.6, 2.2], [width + 7.4, 9.6], [width + 9.6, 5.6],
    [-2.8, 11.4], [1.2, 12.2], [4.2, 11.6], [9, 11.8], [12.4, 12.4], [15.6, 11.3],
    [-5, -5.5], [-0.5, -6.5], [5, -5.8], [9.5, -6.8], [14.5, -5.6], [19, -6.4],
  ];
  reef.forEach(([x, z], i) => place(createCoral(kinds[i % 4], pinks[i % pinks.length], i * 3.7), x, z, 0, 0.6));
  const stones: Array<[number, number]> = [[-2.6, -3.4], [7.2, -3.6], [15.4, -3.2], [-9.2, 3.8], [width + 9.4, 8.4], [-4.6, 12.6], [17.6, 12.8], [2.5, -7.6], [12, -8]];
  stones.forEach(([x, z], i) => place(createRock(i * 5.3), x, z, 0, 0.8));
  place(createClam(), 3.4, -3.3, 0.4, 0.7);
  place(createChest(), 10.8, -3.6, -0.3, 0.7);
  place(createSubmarine(), width + 4.6, -3.4, Math.PI * 0.94, 1.8);

  const kelp: THREE.Object3D[] = [];
  const beds: Array<[number, number]> = [[-3.4, -2.2], [1.6, -3.4], [5.4, -3.2], [9.2, -2.2], [13.2, -3.6], [-8.6, -0.6], [-9.8, 8.6], [width + 8.2, -0.4], [width + 9.4, 10.2], [-1, -8], [7.5, -8.6], [16, -8.2]];
  beds.forEach(([x, z], i) => {
    const strand = put(createKelp(i * 2.9), x, 0, z);
    kelp.push(strand);
    group.add(strand);
    shadows.push({ x, z, radius: 0.5 });
  });

  const ground = mesh(
    new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
    new THREE.MeshStandardMaterial({ map: floorTexture(level, pads, shadows, anisotropy), roughness: 0.95 }),
    (X0 + X1) / 2,
    -0.014,
    (Z0 + Z1) / 2,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground, bake(solid));

  // Schools circle behind the glass and over the dining spots; a turtle drifts across the back.
  const swimmers: Swimmer[] = [];
  const school = (count: number, colour: number, stripe: number, cx: number, cz: number, rx: number, rz: number, y: number, speed: number) => {
    for (let i = 0; i < count; i++) {
      const fish = createFish(colour, stripe);
      fish.scale.setScalar(0.8 + noise(i + cx) * 0.5);
      group.add(fish);
      swimmers.push({ group: fish, cx, cz, rx: rx + noise(i * 3 + cz) * 0.8, rz: rz + noise(i * 5 + cx) * 0.5, y: y + noise(i * 7) * 0.7, speed, phase: i * 0.28 + noise(i) * 0.2 });
    }
  };
  school(6, 0xff8a3d, 0xffffff, width / 2, -4.5, 12, 2.6, 1.3, 0.22);
  school(5, 0x3d8fe4, 0xffd166, width / 2, -6, 15, 2, 2.2, -0.17);
  school(4, 0xf27aa0, 0x8b689c, -5.5, 5, 2.2, 5, 2.3, 0.3);
  school(4, 0xffd166, 0x2f7f86, width + 5.5, 5, 2.2, 5, 2.3, -0.28);
  const turtle = createTurtle();
  group.add(turtle);
  swimmers.push({ group: turtle, cx: width / 2, cz: -7.5, rx: 17, rz: 1.6, y: 2.6, speed: 0.07, phase: 2 });

  const jellies = [0xf7a8d8, 0xb58ae0, 0x7fe3ff, 0xf7a8d8, 0xb58ae0].map((colour, i) => {
    const jelly = put(createJelly(colour), [-8, -2.5, 6.5, 15.5, 21][i], 2.2, [-3.5, -5.6, -4.2, -5.2, -2.8][i]);
    group.add(jelly);
    return jelly;
  });

  // Bubbles rise in columns from vents in the sand and loop back to the bottom.
  const vents: Array<[number, number]> = [[-2, -2.9], [6.6, -3], [12.8, -2.2], [-7.2, 5], [width + 7.2, 6.4], [3, 12], [11, 12.4]];
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), bubble, vents.length * 7);
  bubbles.frustumCulled = false;
  group.add(bubbles);

  return { group, view: { swimmers, jellies, kelp, bubbles, vents } };
}

const scratch = new THREE.Matrix4();

export function animateSea(room: THREE.Group, time: number): void {
  const sea = room.userData.sea as SeaView | undefined;
  if (!sea) return;
  for (const fish of sea.swimmers) {
    const angle = time * fish.speed + fish.phase;
    const direction = Math.sign(fish.speed);
    fish.group.position.set(fish.cx + Math.cos(angle) * fish.rx, fish.y + Math.sin(angle * 3 + fish.phase) * 0.18, fish.cz + Math.sin(angle) * fish.rz);
    fish.group.rotation.y = Math.atan2(-Math.sin(angle) * fish.rx * direction, Math.cos(angle) * fish.rz * direction) + Math.sin(time * 7 + fish.phase * 9) * 0.12;
  }
  sea.jellies.forEach((jelly, i) => {
    const pulse = Math.sin(time * 1.6 + i * 1.3);
    jelly.position.y = 2.1 + Math.sin(time * 0.5 + i * 2) * 0.7;
    jelly.scale.set(1 + pulse * 0.08, 1 - pulse * 0.12, 1 + pulse * 0.08);
  });
  sea.kelp.forEach((strand, i) => {
    strand.rotation.z = Math.sin(time * 0.9 + i * 1.7) * 0.12;
    strand.rotation.x = Math.cos(time * 0.7 + i * 1.1) * 0.08;
  });
  sea.vents.forEach(([x, z], vent) => {
    for (let i = 0; i < 7; i++) {
      const rise = (time * 0.35 + i / 7 + vent * 0.13) % 1;
      const size = 0.5 + ((i * 3 + vent) % 4) * 0.35;
      scratch.makeScale(size, size, size);
      scratch.setPosition(x + Math.sin(time * 2 + i * 2.1 + vent) * 0.18 * rise, 0.1 + rise * 4.2, z + Math.cos(time * 1.7 + i) * 0.12 * rise);
      sea.bubbles.setMatrixAt(vent * 7 + i, scratch);
    }
  });
  sea.bubbles.instanceMatrix.needsUpdate = true;
}
