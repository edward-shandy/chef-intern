import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Level } from "../shared/level";
import { ball, box, canvasTexture, cylinder, mat, mesh, noise, rounded } from "./models";

// The outdoor block is painted on one canvas covering this rectangle, in tiles.
const X0 = -16;
const X1 = 29;
const Z0 = -13;
const Z1 = 19;
const PX = 40;

// Bands behind the restaurant, from the shops down to its back wall.
const SHOP_FRONT = -8.75;
const FAR_WALK = -8.6;
const ROAD_NORTH = -6.9;
const ROAD_SOUTH = -2.7;
const NEAR_WALK_END = -0.42;
const LANES = [-3.75, -5.85];
const CROSSING = 5.5;
// The parking lot's driveway cuts through the near sidewalk between these two lines.
const DRIVE = [22.4, 25];

// A season recolours the lawn and the trees and reshuffles the shops, so each kitchen's block looks like its own street.
interface Season {
  lawn: string;
  tufts: [string, string];
  // Colours of the specks scattered on the lawn: wild flowers, fallen leaves or nothing under snow.
  specks: string[];
  round: [number, number, number];
  blossom: [number, number, number];
  pine: [number, number, number];
  // How far along the list of shops the row starts.
  shops: number;
}

const SEASONS: Record<string, Season> = {
  spring: {
    lawn: "#86bd5c",
    tufts: ["rgba(52, 110, 50, 0.4)", "rgba(190, 232, 130, 0.5)"],
    specks: ["#fff8ea", "#ffd166", "#f29bb5"],
    round: [0x5fae4e, 0x86cc5e, 0x488f42],
    blossom: [0xf29bb5, 0xfbc4d4, 0xe07a9c],
    pine: [0x3f8f5a, 0x4aa366, 0x5bb673],
    shops: 0,
  },
  summer: {
    lawn: "#74c04a",
    tufts: ["rgba(40, 120, 44, 0.45)", "rgba(214, 240, 120, 0.5)"],
    specks: ["#ffd166", "#ffffff", "#ff9d5c"],
    round: [0x3fa64a, 0x74d05a, 0x2f8a40],
    blossom: [0xb5d94a, 0xd9ee7a, 0x8fc23a],
    pine: [0x2f8f5a, 0x3fa56a, 0x55ba7a],
    shops: 2,
  },
  autumn: {
    lawn: "#a9b65a",
    tufts: ["rgba(120, 110, 40, 0.4)", "rgba(226, 214, 120, 0.5)"],
    specks: ["#e4762a", "#c9432a", "#f2b84b"],
    round: [0xe4862a, 0xf2b84b, 0xc9552a],
    blossom: [0xd9432f, 0xf0803a, 0xa8321f],
    pine: [0x4a8a52, 0x5a9c5c, 0x6cae68],
    shops: 4,
  },
  winter: {
    lawn: "#e9f0f5",
    tufts: ["rgba(150, 175, 200, 0.35)", "rgba(255, 255, 255, 0.7)"],
    specks: ["#ffffff", "#d3e2ee", "#ffffff"],
    round: [0xdfeaf2, 0xffffff, 0xb9cddc],
    blossom: [0xc9dcea, 0xf4f9fc, 0xa3bccf],
    pine: [0x3f7f5a, 0x4f9068, 0xf4f9fc],
    shops: 6,
  },
};
export type SeasonName = "spring" | "summer" | "autumn" | "winter";

const seasonOf = (level: Level): Season => SEASONS[level.decor.room?.street?.season ?? "spring"];
// Colour of the ground beyond the painted block, matching its lawn.
export const streetGround = (level: Level): number => new THREE.Color(seasonOf(level).lawn).getHex();

interface Mover {
  group: THREE.Object3D;
  lane: number;
  phase: number;
  speed: number;
  direction: 1 | -1;
  legs?: THREE.Object3D[];
  arms?: THREE.Object3D[];
}

interface StreetView {
  cars: Mover[];
  walkers: Mover[];
  water: THREE.Object3D[];
}

// ---------------------------------------------------------------- helpers

const blob = (radius: number) => new THREE.IcosahedronGeometry(radius, 1);
const dome = (radius: number) => new THREE.SphereGeometry(radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const shade = (colour: number, by: number) => new THREE.Color(colour).multiplyScalar(by).getHex();

const glows = new Map<number, THREE.MeshStandardMaterial>();
function glow(colour: number): THREE.MeshStandardMaterial {
  let material = glows.get(colour);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.75, roughness: 0.4 });
    glows.set(colour, material);
  }
  return material;
}

function put<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, turn = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = turn;
  return object;
}

function turned(object: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  object.rotation.set(x, y, z);
  return object;
}

// Merges every mesh under an object into one mesh per material, so a detailed prop costs only a few draw calls.
export function bake(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
    geometry.applyMatrix4(child.matrixWorld);
    const list = parts.get(child.material as THREE.Material) ?? [];
    list.push(geometry);
    parts.set(child.material as THREE.Material, list);
  });
  const result = new THREE.Group();
  for (const [material, geometries] of parts) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material);
    merged.castShadow = merged.receiveShadow = true;
    result.add(merged);
  }
  return result;
}

// ---------------------------------------------------------------- vehicles

type CarKind = "sedan" | "hatch" | "van" | "taxi" | "pickup";

// A toy-like car facing +z: two-tone body, proud windows, lights, bumpers, mirrors and hubcaps.
function createCar(kind: CarKind, colour: number): THREE.Group {
  const car = new THREE.Group();
  const paint = mat(colour, 0.35, 0.1);
  const trim = mat(shade(colour, 0.72), 0.45, 0.1);
  const dark = mat(0x2a2c33, 0.85);
  const glass = mat(0xa6dcee, 0.12, 0.25);
  const chrome = mat(0xdfe3e8, 0.3, 0.55);
  const cab =
    kind === "van"
      ? { length: 1.34, height: 0.5, z: -0.14 }
      : kind === "pickup"
        ? { length: 0.6, height: 0.34, z: 0.14 }
        : kind === "hatch"
          ? { length: 0.98, height: 0.34, z: -0.2 }
          : { length: 0.84, height: 0.32, z: -0.06 };
  const cabY = 0.55 + cab.height / 2;
  car.add(
    mesh(box(0.78, 0.12, 1.56), dark, 0, 0.2, 0),
    mesh(rounded(0.86, 0.3, 1.72, 0.1), paint, 0, 0.42, 0),
    mesh(box(0.872, 0.05, 1.5), trim, 0, 0.33, 0),
    mesh(box(0.868, 0.2, 0.014), trim, 0, 0.46, cab.z + 0.02),
    mesh(rounded(0.76, cab.height, cab.length, 0.09), paint, 0, cabY, cab.z),
    mesh(box(0.775, cab.height * 0.56, cab.length - 0.22), glass, 0, cabY + 0.015, cab.z),
    mesh(box(0.6, cab.height * 0.56, cab.length + 0.014), glass, 0, cabY + 0.015, cab.z),
    mesh(rounded(0.68, 0.05, cab.length - 0.1, 0.02), mat(0xfff6e6, 0.4), 0, 0.555 + cab.height, cab.z),
    mesh(rounded(0.84, 0.09, 0.12, 0.04), chrome, 0, 0.29, 0.84),
    mesh(rounded(0.84, 0.09, 0.12, 0.04), chrome, 0, 0.29, -0.84),
    mesh(box(0.3, 0.08, 0.02), dark, 0, 0.43, 0.866),
    mesh(box(0.2, 0.07, 0.02), mat(0xffffff, 0.5), 0, 0.3, 0.905),
    mesh(box(0.2, 0.07, 0.02), mat(0xffffff, 0.5), 0, 0.3, -0.905),
  );
  for (const side of [-1, 1]) {
    car.add(
      turned(mesh(cylinder(0.075, 0.075, 0.04, 12), glow(0xfff0c4), side * 0.28, 0.45, 0.855), Math.PI / 2, 0, 0),
      mesh(box(0.17, 0.07, 0.03), glow(0xe8483c), side * 0.28, 0.46, -0.862),
      mesh(box(0.07, 0.06, 0.06), paint, side * 0.46, 0.63, cab.z + cab.length / 2 - 0.08),
    );
    for (const z of [-0.52, 0.52]) {
      car.add(
        turned(mesh(cylinder(0.165, 0.165, 0.14, 14), dark, side * 0.41, 0.165, z), 0, 0, Math.PI / 2),
        turned(mesh(cylinder(0.085, 0.085, 0.152, 10), chrome, side * 0.41, 0.165, z), 0, 0, Math.PI / 2),
      );
    }
  }
  if (kind === "taxi") {
    car.add(
      mesh(box(0.874, 0.06, 1.1), dark, 0, 0.5, 0),
      mesh(rounded(0.28, 0.1, 0.12, 0.03), glow(0xffe27a), 0, 0.63 + cab.height, cab.z),
    );
  }
  if (kind === "van") {
    car.add(mesh(box(0.78, 0.2, 0.5), mat(0xfff6e6, 0.5), 0, cabY - 0.02, cab.z - 0.34));
  }
  if (kind === "pickup") {
    // The open bed carries produce crates, as if on its way to the kitchen.
    for (const side of [-1, 1]) car.add(mesh(box(0.06, 0.16, 0.66), paint, side * 0.4, 0.63, -0.5));
    car.add(
      mesh(box(0.86, 0.16, 0.06), paint, 0, 0.63, -0.83),
      mesh(box(0.32, 0.2, 0.3), mat(0xc88a4a, 0.8), -0.17, 0.66, -0.55),
      mesh(box(0.32, 0.2, 0.3), mat(0xc88a4a, 0.8), 0.18, 0.66, -0.42),
      mesh(blob(0.1), mat(0xe23b2e, 0.6, 0, true), -0.17, 0.79, -0.55),
      mesh(blob(0.1), mat(0x7ccf4f, 0.7, 0, true), 0.18, 0.79, -0.42),
    );
  }
  return bake(car);
}

interface Look {
  shirt: number;
  trousers: number;
  skin: number;
  hair: number;
  accent: number;
  style: number;
}

// A round-headed passer-by facing +z, with swinging arms and legs and one of four hair-and-kit styles.
function createWalker(look: Look) {
  const person = new THREE.Group();
  const top = mat(look.shirt, 0.78);
  const skin = mat(look.skin, 0.85);
  const hair = mat(look.hair, 0.9);
  const accent = mat(look.accent, 0.7);
  const eye = mat(0x2b2230, 0.5);
  const body = new THREE.Group();
  body.add(
    mesh(cylinder(0.17, 0.22, 0.46, 10), top, 0, 0.72, 0),
    mesh(cylinder(0.228, 0.228, 0.06, 10), mat(shade(look.shirt, 0.8), 0.8), 0, 0.51, 0),
    mesh(cylinder(0.09, 0.13, 0.07, 10), top, 0, 0.975, 0),
    mesh(ball(0.2, 14), skin, 0, 1.15, 0.02),
    mesh(ball(0.028, 8), eye, -0.075, 1.17, 0.2),
    mesh(ball(0.028, 8), eye, 0.075, 1.17, 0.2),
  );
  if (look.style === 0) {
    body.add(mesh(dome(0.215), hair, 0, 1.16, 0.01), mesh(ball(0.085, 10), hair, 0, 1.38, -0.07));
  } else if (look.style === 1) {
    body.add(mesh(dome(0.217), accent, 0, 1.17, 0.01), mesh(rounded(0.24, 0.03, 0.18, 0.012), accent, 0, 1.2, 0.26));
    body.add(mesh(rounded(0.3, 0.14, 0.1, 0.04), hair, 0, 1.1, -0.13));
  } else if (look.style === 2) {
    body.add(mesh(dome(0.215), hair, 0, 1.16, 0.01), mesh(rounded(0.38, 0.34, 0.13, 0.05), hair, 0, 1.03, -0.13));
    body.add(mesh(rounded(0.27, 0.3, 0.13, 0.04), accent, 0, 0.74, -0.22));
  } else {
    body.add(
      mesh(dome(0.22), accent, 0, 1.17, 0.01),
      mesh(cylinder(0.222, 0.222, 0.05, 14), mat(0xfff3d6, 0.8), 0, 1.19, 0.01),
      mesh(ball(0.06, 8), mat(0xfff3d6, 0.8), 0, 1.41, 0.01),
      turned(mesh(new THREE.TorusGeometry(0.13, 0.045, 6, 12), accent, 0, 0.97, 0), Math.PI / 2, 0, 0),
    );
  }
  person.add(bake(body));

  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(
      mesh(box(0.115, 0.38, 0.13), mat(look.trousers, 0.86), 0, -0.18, 0),
      mesh(rounded(0.14, 0.09, 0.24, 0.035), mat(0x473a37, 0.8), 0, -0.4, 0.04),
    );
    const hip = put(new THREE.Group(), side * 0.1, 0.45, 0);
    hip.add(bake(leg));
    person.add(hip);
    legs.push(hip);

    const arm = new THREE.Group();
    arm.add(mesh(cylinder(0.052, 0.046, 0.34, 8), top, 0, -0.16, 0), mesh(ball(0.056, 8), skin, 0, -0.36, 0.01));
    // Style 0 carries a shopping bag in one hand.
    if (look.style === 0 && side === 1) {
      arm.add(mesh(box(0.06, 0.2, 0.2), accent, 0.02, -0.52, 0), mesh(box(0.02, 0.1, 0.1), mat(0xfff3d6), 0.02, -0.39, 0));
    }
    const shoulder = put(new THREE.Group(), side * 0.235, 0.9, 0);
    shoulder.add(bake(arm));
    person.add(shoulder);
    arms.push(shoulder);
  }
  return { group: person, legs, arms };
}

// ---------------------------------------------------------------- street furniture

const IRON = () => mat(0x39424e, 0.55, 0.4);
const WOOD = () => mat(0xb9783f, 0.8);

type TreeKind = "round" | "pine" | "blossom";

function createTree(kind: TreeKind, seed: number, season: Season): THREE.Group {
  const tree = new THREE.Group();
  const bark = mat(0x8a5a3c, 0.95);
  const size = 0.9 + noise(seed) * 0.25;
  if (kind === "pine") {
    const greens = season.pine;
    tree.add(mesh(cylinder(0.09, 0.13, 0.7, 7), bark, 0, 0.35, 0));
    [0.78, 0.6, 0.42].forEach((radius, i) => {
      tree.add(mesh(new THREE.ConeGeometry(radius, 0.95, 8), mat(greens[i], 0.9, 0, true), 0, 0.95 + i * 0.55, 0));
    });
  } else {
    const [main, light, deep] = kind === "blossom" ? season.blossom : season.round;
    tree.add(
      mesh(cylinder(0.1, 0.16, 1.25, 8), bark, 0, 0.62, 0),
      turned(mesh(cylinder(0.05, 0.07, 0.5, 6), bark, 0.2, 1.2, 0), 0, 0, -0.8),
      mesh(blob(0.7), mat(main, 0.9, 0, true), 0, 1.9, 0),
      mesh(blob(0.5), mat(deep, 0.9, 0, true), 0.45, 1.6, 0.08),
      mesh(blob(0.46), mat(deep, 0.9, 0, true), -0.42, 1.68, -0.1),
      mesh(blob(0.42), mat(main, 0.9, 0, true), 0.08, 2.45, -0.05),
      mesh(blob(0.34), mat(light, 0.9, 0, true), -0.2, 2.3, 0.3),
      mesh(blob(0.26), mat(light, 0.9, 0, true), 0.38, 2.05, 0.34),
    );
  }
  tree.scale.setScalar(size);
  tree.rotation.y = noise(seed + 3) * 6;
  return tree;
}

// A curved iron lamp with a glowing lantern on one side and a flower basket on the other; the arm points along +x.
function createLamp(): THREE.Group {
  const lamp = new THREE.Group();
  const iron = IRON();
  lamp.add(
    mesh(cylinder(0.11, 0.15, 0.24, 10), iron, 0, 0.12, 0),
    mesh(cylinder(0.04, 0.056, 2.4, 8), iron, 0, 1.4, 0),
    mesh(cylinder(0.075, 0.075, 0.06, 10), iron, 0, 0.5, 0),
    mesh(cylinder(0.07, 0.07, 0.06, 10), iron, 0, 2.0, 0),
    turned(mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 10, Math.PI / 2), iron, 0.4, 2.6, 0), 0, Math.PI, 0),
    mesh(box(0.24, 0.05, 0.05), iron, 0.5, 3.0, 0),
    mesh(new THREE.ConeGeometry(0.17, 0.13, 10), iron, 0.62, 2.93, 0),
    mesh(cylinder(0.1, 0.13, 0.2, 10), glow(0xffd98a), 0.62, 2.77, 0),
    mesh(cylinder(0.06, 0.03, 0.05, 8), iron, 0.62, 2.65, 0),
    mesh(box(0.34, 0.035, 0.035), iron, -0.17, 2.1, 0),
    mesh(cylinder(0.01, 0.01, 0.16, 4), iron, -0.32, 2.02, 0),
    mesh(blob(0.15), mat(0x5fae4e, 0.9, 0, true), -0.32, 1.86, 0),
    mesh(blob(0.06), mat(0xf27aa0, 0.8, 0, true), -0.24, 1.95, 0.08),
    mesh(blob(0.06), mat(0xffd166, 0.8, 0, true), -0.4, 1.94, -0.06),
    mesh(blob(0.06), mat(0xf27aa0, 0.8, 0, true), -0.33, 1.97, -0.1),
  );
  lamp.scale.setScalar(0.85);
  return lamp;
}

// A signal on a pole facing +z, with a pedestrian box underneath.
function createTrafficLight(): THREE.Group {
  const light = new THREE.Group();
  const iron = IRON();
  light.add(
    mesh(cylinder(0.09, 0.12, 0.2, 10), iron, 0, 0.1, 0),
    mesh(cylinder(0.04, 0.05, 2.3, 8), iron, 0, 1.25, 0),
    mesh(rounded(0.26, 0.66, 0.2, 0.05), mat(0x2a2c33, 0.7), 0, 2.2, 0.05),
    mesh(rounded(0.22, 0.24, 0.16, 0.04), mat(0x2a2c33, 0.7), 0, 1.45, 0.05),
    mesh(box(0.1, 0.12, 0.02), glow(0x59d98a), 0, 1.45, 0.14),
  );
  [0xe8483c, 0x6b5a2a, 0x2f6b47].forEach((colour, i) => {
    const lens = i === 0 ? glow(colour) : mat(colour, 0.5);
    light.add(
      turned(mesh(cylinder(0.07, 0.07, 0.03, 12), lens, 0, 2.4 - i * 0.2, 0.155), Math.PI / 2, 0, 0),
      mesh(box(0.18, 0.02, 0.08), mat(0x2a2c33, 0.7), 0, 2.48 - i * 0.2, 0.18),
    );
  });
  return light;
}

// A slatted park bench whose seat faces +z.
function createBench(): THREE.Group {
  const bench = new THREE.Group();
  const iron = IRON();
  const wood = WOOD();
  for (const x of [-0.5, 0.5]) {
    bench.add(
      mesh(box(0.06, 0.36, 0.42), iron, x, 0.18, 0),
      turned(mesh(box(0.06, 0.5, 0.05), iron, x, 0.55, -0.2), -0.18, 0, 0),
    );
  }
  for (const z of [-0.1, 0.03, 0.16]) bench.add(mesh(rounded(1.2, 0.04, 0.11, 0.015), wood, 0, 0.38, z));
  for (const y of [0.54, 0.7]) bench.add(turned(mesh(rounded(1.2, 0.11, 0.04, 0.015), wood, 0, y, -0.21 - (y - 0.5) * 0.18), -0.18, 0, 0));
  return bench;
}

function createBin(): THREE.Group {
  const bin = new THREE.Group();
  bin.add(
    mesh(cylinder(0.19, 0.16, 0.5, 12), mat(0x3f9d6e, 0.6), 0, 0.27, 0),
    mesh(cylinder(0.205, 0.205, 0.05, 12), mat(0x2c7a55, 0.6), 0, 0.5, 0),
    mesh(dome(0.19), mat(0x2c7a55, 0.6), 0, 0.56, 0),
    mesh(box(0.2, 0.07, 0.02), mat(0x1b2a24, 0.6), 0, 0.6, 0.17),
    mesh(box(0.14, 0.1, 0.01), mat(0xfff3d6, 0.6), 0, 0.3, 0.185),
  );
  return bin;
}

function createHydrant(): THREE.Group {
  const hydrant = new THREE.Group();
  const red = mat(0xe4573d, 0.45);
  hydrant.add(
    mesh(cylinder(0.13, 0.15, 0.06, 10), red, 0, 0.03, 0),
    mesh(cylinder(0.09, 0.1, 0.36, 10), red, 0, 0.24, 0),
    mesh(cylinder(0.12, 0.12, 0.04, 10), red, 0, 0.4, 0),
    mesh(ball(0.1, 10), red, 0, 0.44, 0),
    mesh(cylinder(0.03, 0.03, 0.05, 6), mat(0xdfe3e8, 0.3, 0.5), 0, 0.56, 0),
    turned(mesh(cylinder(0.05, 0.05, 0.3, 8), red, 0, 0.28, 0), 0, 0, Math.PI / 2),
    turned(mesh(cylinder(0.055, 0.055, 0.1, 8), mat(0xdfe3e8, 0.3, 0.5), 0, 0.26, 0.1), Math.PI / 2, 0, 0),
  );
  return hydrant;
}

function createMailbox(): THREE.Group {
  const mailbox = new THREE.Group();
  const blue = mat(0x3d8fe4, 0.45);
  mailbox.add(
    mesh(box(0.06, 0.3, 0.06), IRON(), -0.14, 0.15, 0),
    mesh(box(0.06, 0.3, 0.06), IRON(), 0.14, 0.15, 0),
    mesh(rounded(0.44, 0.5, 0.36, 0.06), blue, 0, 0.55, 0),
    turned(mesh(cylinder(0.18, 0.18, 0.44, 12, ), blue, 0, 0.8, 0), 0, 0, Math.PI / 2),
    mesh(box(0.3, 0.035, 0.02), mat(0x1d3e66, 0.5), 0, 0.72, 0.185),
    mesh(box(0.2, 0.12, 0.012), mat(0xfff3d6, 0.6), 0, 0.5, 0.185),
  );
  return mailbox;
}

// A wooden planter with a clipped hedge and flowers; its length runs along x.
function createPlanter(length: number, flowers: number): THREE.Group {
  const planter = new THREE.Group();
  planter.add(
    mesh(rounded(length, 0.32, 0.46, 0.04), WOOD(), 0, 0.16, 0),
    mesh(box(length + 0.03, 0.05, 0.5), mat(0x8a5a2c, 0.8), 0, 0.31, 0),
    mesh(rounded(length - 0.1, 0.36, 0.38, 0.14), mat(0x4f9d4a, 0.9), 0, 0.5, 0),
  );
  for (let i = 0; i < length * 4; i++) {
    const x = (noise(i * 3.1 + length) - 0.5) * (length - 0.3);
    const z = (noise(i * 5.7 + length) - 0.5) * 0.3;
    planter.add(mesh(blob(0.055), mat(i % 2 ? flowers : 0xfff3d6, 0.7, 0, true), x, 0.7, z));
  }
  return planter;
}

// A bus shelter open towards +z: glass back, teal roof, bench and a stop sign on its own pole.
function createBusStop(): THREE.Group {
  const stop = new THREE.Group();
  const iron = IRON();
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, roughness: 0.1, transparent: true, opacity: 0.45 });
  for (const x of [-1, 1]) stop.add(mesh(box(0.07, 1.7, 0.07), iron, x, 0.85, -0.3), mesh(box(0.07, 1.7, 0.07), iron, x, 0.85, 0.3));
  stop.add(
    mesh(box(2, 1.1, 0.03), glass, 0, 0.95, -0.3),
    mesh(box(0.03, 1.1, 0.6), glass, -1, 0.95, 0),
    mesh(rounded(2.3, 0.09, 0.95, 0.03), mat(0x2f7f86, 0.5), 0, 1.74, 0.05),
    mesh(box(2.3, 0.05, 0.08), mat(0xfff3d6, 0.6), 0, 1.68, 0.5),
    mesh(rounded(1.5, 0.05, 0.3, 0.02), WOOD(), -0.1, 0.4, -0.12),
    mesh(box(0.05, 0.4, 0.26), iron, -0.7, 0.2, -0.12),
    mesh(box(0.05, 0.4, 0.26), iron, 0.5, 0.2, -0.12),
    mesh(box(0.5, 0.7, 0.02), mat(0xfff3d6, 0.6), 0.55, 1.0, -0.27),
    mesh(box(0.4, 0.2, 0.012), mat(0xe4573d, 0.6), 0.55, 1.18, -0.255),
    mesh(cylinder(0.035, 0.035, 2, 8), iron, 1.5, 1, 0.3),
    turned(mesh(cylinder(0.22, 0.22, 0.04, 16), mat(0x3d8fe4, 0.5), 1.5, 2.05, 0.3), Math.PI / 2, 0, 0),
    mesh(box(0.2, 0.12, 0.05), mat(0xffffff, 0.5), 1.5, 2.05, 0.3),
  );
  return stop;
}

function createBikeRack(): THREE.Group {
  const rack = new THREE.Group();
  const steel = mat(0xdfe3e8, 0.3, 0.6);
  for (const x of [-0.45, 0, 0.45]) {
    rack.add(turned(mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 12, Math.PI), steel, x, 0.3, 0), 0, Math.PI / 2, 0));
    for (const z of [-0.2, 0.2]) rack.add(mesh(cylinder(0.022, 0.022, 0.3, 6), steel, x, 0.15, z));
  }
  // One bicycle leans in the middle hoop.
  const bike = new THREE.Group();
  const frame = mat(0xe4573d, 0.4, 0.2);
  const tyre = mat(0x2a2c33, 0.9);
  for (const z of [-0.36, 0.36]) {
    bike.add(turned(mesh(new THREE.TorusGeometry(0.21, 0.025, 6, 16), tyre, 0, 0.235, z), 0, Math.PI / 2, 0));
    bike.add(turned(mesh(cylinder(0.03, 0.03, 0.05, 8), steel, 0, 0.235, z), 0, 0, Math.PI / 2));
  }
  bike.add(
    turned(mesh(box(0.03, 0.03, 0.5), frame, 0, 0.42, 0), 0.5, 0, 0),
    turned(mesh(box(0.03, 0.03, 0.46), frame, 0, 0.36, -0.14), -0.55, 0, 0),
    mesh(box(0.03, 0.03, 0.44), frame, 0, 0.53, 0.02),
    turned(mesh(box(0.03, 0.4, 0.03), frame, 0, 0.42, 0.3), -0.3, 0, 0),
    mesh(box(0.3, 0.03, 0.03), tyre, 0, 0.63, 0.25),
    mesh(rounded(0.09, 0.04, 0.18, 0.015), tyre, 0, 0.6, -0.2),
    mesh(box(0.025, 0.1, 0.025), frame, 0, 0.55, -0.2),
  );
  bike.rotation.z = 0.12;
  bike.position.x = 0.12;
  rack.add(bike);
  return rack;
}

// A café table under a striped umbrella with two chairs.
function createCafeSet(colour: number): THREE.Group {
  const set = new THREE.Group();
  const iron = IRON();
  const cream = mat(0xfff3d6, 0.7);
  set.add(
    mesh(cylinder(0.2, 0.24, 0.04, 12), iron, 0, 0.02, 0),
    mesh(cylinder(0.03, 0.03, 1.9, 8), iron, 0, 0.95, 0),
    mesh(cylinder(0.42, 0.42, 0.04, 20), cream, 0, 0.56, 0),
    mesh(new THREE.ConeGeometry(0.95, 0.42, 8), mat(colour, 0.75, 0, true), 0, 1.86, 0),
    mesh(new THREE.ConeGeometry(0.42, 0.2, 8), mat(0xfff3d6, 0.75, 0, true), 0, 2.0, 0),
    mesh(cylinder(0.95, 0.95, 0.07, 8, ), mat(0xfff3d6, 0.75, 0, true), 0, 1.62, 0),
    mesh(ball(0.05, 8), cream, 0, 2.12, 0),
    mesh(cylinder(0.06, 0.05, 0.1, 8), mat(0xe4573d, 0.5), 0.12, 0.63, 0.06),
    mesh(cylinder(0.11, 0.11, 0.015, 12), mat(0xffffff, 0.4), -0.12, 0.59, -0.05),
  );
  for (const side of [-1, 1]) {
    set.add(
      mesh(rounded(0.3, 0.04, 0.3, 0.015), mat(colour, 0.7), side * 0.68, 0.34, 0),
      mesh(rounded(0.04, 0.34, 0.3, 0.015), mat(colour, 0.7), side * 0.83, 0.53, 0),
    );
    for (const x of [0.56, 0.8]) for (const z of [-0.12, 0.12]) set.add(mesh(box(0.03, 0.34, 0.03), iron, side * x, 0.17, z));
  }
  return set;
}

// A chalkboard sign on an A-frame, read from +z.
function createMenuBoard(): THREE.Group {
  const board = new THREE.Group();
  const face = canvasTexture(128, 192, (ctx) => {
    ctx.fillStyle = "#2c4a3e";
    ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = "#fff3d6";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TODAY", 64, 40);
    ctx.font = "18px sans-serif";
    ["Tomato soup", "Garden salad", "Onion soup"].forEach((line, i) => ctx.fillText(line, 64, 80 + i * 32));
    ctx.strokeStyle = "#f2b84b";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 112, 176);
  });
  const chalk = new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 });
  for (const side of [-1, 1]) {
    board.add(turned(mesh(rounded(0.5, 0.78, 0.04, 0.012), WOOD(), 0, 0.38, side * 0.13), side * -0.3, 0, 0));
  }
  const front = turned(mesh(new THREE.PlaneGeometry(0.42, 0.66), chalk, 0, 0.39, 0.158), -0.3, 0, 0);
  board.add(front);
  return board;
}

// A two-tier stone fountain; the water discs are returned so they can shimmer.
function createFountain(): { group: THREE.Group; water: THREE.Object3D[] } {
  const group = new THREE.Group();
  const stone = new THREE.Group();
  const rock = mat(0xd9d2c4, 0.85);
  stone.add(
    mesh(cylinder(1.15, 1.25, 0.3, 20), rock, 0, 0.15, 0),
    mesh(cylinder(0.16, 0.24, 0.9, 10), rock, 0, 0.6, 0),
    mesh(cylinder(0.5, 0.26, 0.16, 16), rock, 0, 1.0, 0),
    mesh(cylinder(0.08, 0.1, 0.36, 8), rock, 0, 1.24, 0),
    mesh(ball(0.11, 10), rock, 0, 1.46, 0),
  );
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    stone.add(put(mesh(rounded(0.3, 0.1, 0.2, 0.03), mat(0xc4bcab, 0.85)), Math.cos(angle) * 1.14, 0.34, Math.sin(angle) * 1.14, -angle + Math.PI / 2));
  }
  group.add(bake(stone));
  const liquid = new THREE.MeshStandardMaterial({ color: 0x6cc4e0, emissive: 0x2a8fb4, emissiveIntensity: 0.25, roughness: 0.15 });
  const pool = mesh(cylinder(1.03, 1.03, 0.04, 20), liquid, 0, 0.3, 0);
  const bowl = mesh(cylinder(0.44, 0.44, 0.03, 16), liquid, 0, 1.08, 0);
  const jets = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    jets.add(turned(mesh(cylinder(0.025, 0.04, 0.8, 5), liquid, Math.cos(angle) * 0.5, 0.72, Math.sin(angle) * 0.5), Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35));
  }
  group.add(pool, bowl, jets);
  return { group, water: [jets] };
}

function createBush(seed: number, flowers: number): THREE.Group {
  const bush = new THREE.Group();
  bush.add(
    mesh(blob(0.34), mat(0x4f9d4a, 0.9, 0, true), 0, 0.26, 0),
    mesh(blob(0.26), mat(0x67b356, 0.9, 0, true), 0.26, 0.2, 0.08),
    mesh(blob(0.22), mat(0x67b356, 0.9, 0, true), -0.25, 0.18, -0.06),
  );
  for (let i = 0; i < 6; i++) {
    const angle = noise(seed + i) * 6.28;
    bush.add(mesh(blob(0.055), mat(flowers, 0.7, 0, true), Math.cos(angle) * 0.24, 0.42 + noise(seed + i * 2) * 0.12, Math.sin(angle) * 0.24));
  }
  return bush;
}

// ---------------------------------------------------------------- shops

interface Shop {
  name: string;
  width: number;
  height: number;
  wall: string;
  trim: string;
  awning: [string, string];
  display: string[];
}

const SHOPS: Shop[] = [
  { name: "TOYS", width: 5, height: 3.4, wall: "#f2c96b", trim: "#c7603f", awning: ["#e4573d", "#fff3d6"], display: ["#3d8fe4", "#e4573d", "#4fb86a"] },
  { name: "BOOKS", width: 4, height: 4.3, wall: "#7fb7c9", trim: "#2f5f73", awning: ["#2f7f86", "#fff3d6"], display: ["#c7603f", "#e4b03d", "#8b689c"] },
  { name: "BAKERY", width: 6, height: 3.2, wall: "#f4dcc0", trim: "#b9783f", awning: ["#f29bb5", "#fff3d6"], display: ["#d9a15c", "#f2c96b", "#c88a4a"] },
  { name: "FLOWERS", width: 4.5, height: 4.0, wall: "#b9d99a", trim: "#4f8f4a", awning: ["#4fb86a", "#fff3d6"], display: ["#f27aa0", "#ffd166", "#e4573d"] },
  { name: "GROCER", width: 5.5, height: 3.5, wall: "#e9956b", trim: "#8f3f2c", awning: ["#e4b03d", "#fff3d6"], display: ["#e23b2e", "#7ccf4f", "#f2c96b"] },
  { name: "CAFE", width: 4, height: 4.4, wall: "#c9b3dc", trim: "#5e4a8a", awning: ["#8b689c", "#fff3d6"], display: ["#fff3d6", "#c88a4a", "#e4573d"] },
  { name: "PHARMACY", width: 6, height: 3.3, wall: "#f4efe4", trim: "#3f9d6e", awning: ["#3f9d6e", "#fff3d6"], display: ["#3f9d6e", "#ffffff", "#3d8fe4"] },
  { name: "MUSIC", width: 5, height: 4.1, wall: "#f2a65a", trim: "#7a3f2a", awning: ["#3d8fe4", "#fff3d6"], display: ["#2a2c33", "#e4573d", "#e4b03d"] },
  { name: "TAILOR", width: 4, height: 3.6, wall: "#8fc7b3", trim: "#2f6b5a", awning: ["#e4573d", "#fff3d6"], display: ["#8b689c", "#3d8fe4", "#f29bb5"] },
];

// The front of a shop drawn flat: siding, a display window, a door, a name board and rows of flat windows above.
function facadeTexture(shop: Shop, seed: number): THREE.CanvasTexture {
  const scale = 96;
  const { width, height } = shop;
  const texture = canvasTexture(width * scale, height * scale, (ctx) => {
    const rect = (x: number, y: number, w: number, h: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x * scale, (height - y - h) * scale, w * scale, h * scale);
    };
    rect(0, 0, width, height, shop.wall);
    for (let y = 0; y < height; y += 0.16) rect(0, y, width, 0.012, "rgba(60, 30, 10, 0.1)");
    rect(0, 0, width, 0.2, shop.trim);
    rect(0, height - 0.22, width, 0.22, shop.trim);
    rect(0, height - 0.3, width, 0.05, "rgba(255, 255, 255, 0.45)");

    // Display window with goods on a shelf and two streaks of reflection.
    const glassW = width - 1.75;
    rect(0.3, 0.26, glassW, 0.98, shop.trim);
    rect(0.37, 0.33, glassW - 0.14, 0.84, "#9fd8ea");
    rect(0.37, 0.33, glassW - 0.14, 0.3, "#7fc2d8");
    for (let i = 0; i < Math.floor(glassW / 0.42); i++) {
      const colour = shop.display[i % shop.display.length];
      const tall = 0.2 + noise(seed + i) * 0.3;
      rect(0.5 + i * 0.42, 0.4, 0.26, tall, colour);
      rect(0.5 + i * 0.42, 0.4 + tall, 0.26, 0.04, "rgba(255, 255, 255, 0.5)");
    }
    rect(0.37, 0.36, glassW - 0.14, 0.05, "#fff3d6");
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    for (const offset of [0.3, 0.55]) {
      ctx.beginPath();
      const x = (0.4 + glassW * offset) * scale;
      const top = (height - 1.17) * scale;
      const bottom = (height - 0.45) * scale;
      ctx.moveTo(x, bottom);
      ctx.lineTo(x + 26, top);
      ctx.lineTo(x + 40, top);
      ctx.lineTo(x + 14, bottom);
      ctx.fill();
    }

    // Door with a window, a kick plate and a brass handle.
    const doorX = width - 1.2;
    rect(doorX, 0.2, 0.84, 1.1, shop.trim);
    rect(doorX + 0.07, 0.2, 0.7, 1.02, "#fff3d6");
    rect(doorX + 0.15, 0.62, 0.54, 0.52, "#9fd8ea");
    rect(doorX + 0.15, 0.28, 0.54, 0.24, shop.awning[0]);
    rect(doorX + 0.62, 0.56, 0.06, 0.12, "#d9a441");

    // Name board.
    rect(0.3, 1.52, width - 0.6, 0.46, shop.trim);
    rect(0.35, 1.57, width - 0.7, 0.36, "#fff8ea");
    ctx.fillStyle = shop.trim;
    ctx.font = `bold ${0.27 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shop.name, (width / 2) * scale, (height - 1.74) * scale);

    // Upper floors: framed windows, some lit, with shutters and the odd flower box.
    const columns = Math.floor((width - 0.5) / 1.15);
    const gap = (width - columns * 0.62) / (columns + 1);
    let row = 0;
    for (let y = 2.2; y + 0.85 <= height - 0.3; y += 1.02, row++) {
      for (let i = 0; i < columns; i++) {
        const x = gap + i * (0.62 + gap);
        const lit = noise(seed + i * 7 + row * 13) > 0.55;
        rect(x - 0.16, y, 0.14, 0.72, shop.awning[0]);
        rect(x + 0.64, y, 0.14, 0.72, shop.awning[0]);
        rect(x - 0.04, y - 0.04, 0.7, 0.8, "#fff8ea");
        rect(x + 0.03, y + 0.03, 0.56, 0.66, lit ? "#ffd98a" : "#8fc7dd");
        rect(x + 0.03, y + 0.45, 0.56, 0.24, lit ? "#ffe9b8" : "#b3dcec");
        rect(x + 0.29, y + 0.03, 0.04, 0.66, "#fff8ea");
        rect(x + 0.03, y + 0.36, 0.56, 0.04, "#fff8ea");
        if (noise(seed + i * 3 + row * 5) > 0.45) {
          rect(x - 0.06, y - 0.14, 0.74, 0.12, "#8a5a3c");
          for (let f = 0; f < 5; f++) {
            ctx.fillStyle = f % 2 ? "#f27aa0" : "#5fae4e";
            ctx.beginPath();
            ctx.arc((x + 0.02 + f * 0.15) * scale, (height - y + 0.02) * scale, 0.07 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  });
  texture.anisotropy = 4;
  return texture;
}

function stripes(a: string, b: string): THREE.CanvasTexture {
  const texture = canvasTexture(64, 8, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = b;
    ctx.fillRect(32, 0, 32, 8);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// One shop with its back-left corner at the origin and its front facing +z; plain parts go into `solid` for baking.
function addShop(shop: Shop, index: number, x: number, solid: THREE.Group, textured: THREE.Group): void {
  const depth = 2.6;
  const front = SHOP_FRONT;
  const centre = x + shop.width / 2;
  const wall = mat(new THREE.Color(shop.wall).getHex(), 0.85);
  const trim = mat(new THREE.Color(shop.trim).getHex(), 0.7);
  solid.add(
    mesh(box(shop.width - 0.04, shop.height, depth), wall, centre, shop.height / 2, front - depth / 2),
    mesh(box(shop.width + 0.06, 0.16, depth + 0.16), trim, centre, shop.height + 0.03, front - depth / 2),
    mesh(box(shop.width - 0.3, 0.04, depth - 0.2), mat(0x8f8a94, 0.9), centre, shop.height + 0.12, front - depth / 2),
    mesh(box(shop.width - 0.4, 0.07, 0.3), trim, centre, 0.035, front + 0.15),
  );
  const facade = new THREE.MeshStandardMaterial({ map: facadeTexture(shop, index * 17 + 3), roughness: 0.85 });
  textured.add(mesh(new THREE.PlaneGeometry(shop.width - 0.04, shop.height), facade, centre, shop.height / 2, front + 0.006));

  const cloth = stripes(...shop.awning);
  cloth.repeat.set(Math.round(shop.width * 1.6), 1);
  const awning = new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.8 });
  const span = shop.width - 0.5;
  textured.add(
    turned(mesh(box(span, 0.05, 0.8), awning, centre, 1.4, front + 0.36), 0.42, 0, 0),
    mesh(box(span, 0.13, 0.03), awning, centre, 1.19, front + 0.73),
  );
  solid.add(mesh(box(0.04, 0.04, 0.7), IRON(), centre - span / 2 + 0.05, 1.3, front + 0.35), mesh(box(0.04, 0.04, 0.7), IRON(), centre + span / 2 - 0.05, 1.3, front + 0.35));

  // Something different on each roof, so the skyline does not repeat.
  const roofY = shop.height + 0.14;
  const back = front - depth / 2;
  const kind = index % 4;
  if (kind === 0) {
    solid.add(
      mesh(rounded(0.7, 0.36, 0.5, 0.04), mat(0xcfd4dc, 0.6), centre - 0.8, roofY + 0.18, back),
      turned(mesh(cylinder(0.17, 0.17, 0.04, 12), mat(0x4a4f5a, 0.6), centre - 0.8, roofY + 0.37, back), 0, 0, 0),
      mesh(box(0.34, 0.6, 0.34), mat(0xb5553c, 0.9), centre + 1, roofY + 0.3, back - 0.4),
      mesh(box(0.42, 0.07, 0.42), mat(0x6e6a72, 0.9), centre + 1, roofY + 0.62, back - 0.4),
    );
  } else if (kind === 1) {
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      solid.add(mesh(box(0.05, 0.4, 0.05), IRON(), centre + dx, roofY + 0.2, back + dz));
    }
    solid.add(
      mesh(cylinder(0.46, 0.46, 0.6, 14), WOOD(), centre, roofY + 0.7, back),
      mesh(new THREE.ConeGeometry(0.52, 0.3, 14), mat(0x6e6a72, 0.8), centre, roofY + 1.15, back),
    );
  } else if (kind === 2) {
    solid.add(put(createPlanter(1.6, 0xf27aa0), centre - 0.9, roofY, back + 0.5), put(createPlanter(1.2, 0xffd166), centre + 1.2, roofY, back - 0.3));
    solid.add(mesh(box(0.9, 0.12, 0.7), mat(0xa6dcee, 0.15, 0.2), centre + 0.2, roofY + 0.06, back + 0.2));
  } else {
    solid.add(
      mesh(cylinder(0.02, 0.02, 1.1, 5), IRON(), centre + 0.8, roofY + 0.55, back),
      mesh(box(0.5, 0.02, 0.02), IRON(), centre + 0.8, roofY + 0.95, back),
      mesh(box(0.34, 0.02, 0.02), IRON(), centre + 0.8, roofY + 0.78, back),
      mesh(rounded(0.6, 0.3, 0.45, 0.04), mat(0xcfd4dc, 0.6), centre - 0.7, roofY + 0.15, back + 0.3),
      mesh(dome(0.3), mat(0xa6dcee, 0.15, 0.2), centre - 0.7, roofY, back - 0.6),
    );
  }
}

// ---------------------------------------------------------------- ground

interface Spot {
  x: number;
  z: number;
  radius: number;
}

// Paints the whole block: lawn, park path and pond, pavements, road markings, parking bays and the front terrace.
function groundTexture(level: Level, margin: number, shadows: Spot[], pits: Spot[], anisotropy: number): THREE.CanvasTexture {
  const season = seasonOf(level);
  const texture = canvasTexture((X1 - X0) * PX, (Z1 - Z0) * PX, (ctx) => {
    const px = (x: number) => (x - X0) * PX;
    const pz = (z: number) => (z - Z0) * PX;
    const rect = (x: number, z: number, w: number, d: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(px(x), pz(z), w * PX, d * PX);
    };
    const disc = (x: number, z: number, rx: number, rz: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(px(x), pz(z), rx * PX, rz * PX, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const left = -margin - 0.9;
    const right = level.width + margin + 0.9;
    const front = level.height + 3.3;

    // Lawn with mown stripes, tufts and wild flowers.
    rect(X0, Z0, X1 - X0, Z1 - Z0, season.lawn);
    for (let x = X0; x < X1; x += 2.4) rect(x, Z0, 1.2, Z1 - Z0, "rgba(255, 255, 255, 0.055)");
    for (let i = 0; i < 2600; i++) {
      const x = X0 + noise(i * 1.7) * (X1 - X0);
      const z = Z0 + noise(i * 2.3 + 9) * (Z1 - Z0);
      rect(x, z, 0.035, 0.11, season.tufts[i % 2]);
    }
    for (let i = 0; i < 260; i++) {
      const x = X0 + noise(i * 4.1 + 2) * (X1 - X0);
      const z = Z0 + noise(i * 3.3 + 5) * (Z1 - Z0);
      disc(x, z, 0.07, 0.07, season.specks[i % 3]);
    }

    // Park: a sandy path from the street round the fountain and on to the front, and a pond with lily pads.
    const path = (width: number, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width * PX;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(px(-10.5), pz(NEAR_WALK_END - 0.2));
      ctx.lineTo(px(-10.5), pz(4.6));
      ctx.bezierCurveTo(px(-10.5), pz(8.5), px(-8.2), pz(10), px(-9), pz(13));
      ctx.bezierCurveTo(px(-9.6), pz(15.5), px(-11.5), pz(16.5), px(-10.5), pz(Z1));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px(-10.5), pz(4.6), 2.15 * PX, 0, Math.PI * 2);
      ctx.stroke();
    };
    path(1.35, "#c9ad74");
    path(1.1, "#ecd8a6");
    disc(-10.5, 4.6, 2.2, 2.2, "#ecd8a6");
    for (let i = 0; i < 500; i++) {
      const angle = noise(i * 1.3) * 6.28;
      const reach = noise(i * 2.9) * 2.1;
      disc(-10.5 + Math.cos(angle) * reach, 4.6 + Math.sin(angle) * reach, 0.03, 0.03, "rgba(150, 110, 60, 0.3)");
    }
    disc(-13.3, 11.2, 1.85, 1.3, "#d8c48f");
    disc(-13.3, 11.2, 1.65, 1.1, "#5fb9d8");
    disc(-13.5, 11.0, 1.2, 0.72, "#84d0e8");
    for (const [x, z] of [[-14, 11.6], [-12.6, 10.7], [-13, 11.8]]) {
      disc(x, z, 0.2, 0.17, "#4f9d4a");
      disc(x + 0.06, z - 0.04, 0.06, 0.06, "#f29bb5");
    }

    // Pavement: a slab grid with a little tone variation, used for both sidewalks and the apron round the building.
    const pave = (x: number, z: number, w: number, d: number) => {
      rect(x, z, w, d, "#d6cdbb");
      const slab = 0.62;
      for (let tx = 0; tx < w / slab; tx++) {
        for (let tz = 0; tz < d / slab; tz++) {
          const tone = noise(tx * 13 + tz * 7 + x);
          if (tone > 0.6) rect(x + tx * slab, z + tz * slab, Math.min(slab, w - tx * slab), Math.min(slab, d - tz * slab), `rgba(255, 250, 235, ${(tone - 0.6) * 0.5})`);
          else if (tone < 0.25) rect(x + tx * slab, z + tz * slab, Math.min(slab, w - tx * slab), Math.min(slab, d - tz * slab), `rgba(110, 90, 70, ${(0.25 - tone) * 0.45})`);
        }
      }
      ctx.fillStyle = "rgba(120, 105, 85, 0.5)";
      for (let lx = slab; lx < w; lx += slab) ctx.fillRect(px(x + lx) - 1, pz(z), 2, d * PX);
      for (let lz = slab; lz < d; lz += slab) ctx.fillRect(px(x), pz(z + lz) - 1, w * PX, 2);
    };
    pave(X0, Z0, X1 - X0, FAR_WALK - Z0 + (ROAD_NORTH - FAR_WALK));
    pave(X0, ROAD_SOUTH, X1 - X0, NEAR_WALK_END - ROAD_SOUTH);
    pave(left, NEAR_WALK_END, right - left, front - NEAR_WALK_END);

    // Road: speckled asphalt, worn wheel tracks, patches, lane paint, a zebra crossing, arrows and ironwork.
    const asphalt = (x: number, z: number, w: number, d: number, base: string, seed: number) => {
      rect(x, z, w, d, base);
      for (let i = 0; i < w * d * 14; i++) {
        rect(x + noise(seed + i * 1.9) * w, z + noise(seed + i * 2.7) * d, 0.04, 0.04, i % 3 ? "rgba(20, 22, 28, 0.2)" : "rgba(235, 228, 215, 0.14)");
      }
    };
    const roadDepth = ROAD_SOUTH - ROAD_NORTH;
    asphalt(X0, ROAD_NORTH, X1 - X0, roadDepth, "#4d505c", 1);
    for (const lane of LANES) for (const offset of [-0.36, 0.36]) rect(X0, lane + offset - 0.14, X1 - X0, 0.28, "rgba(30, 32, 40, 0.16)");
    rect(-13, -6.4, 2.6, 1.3, "rgba(30, 32, 40, 0.22)");
    rect(15.5, -4.3, 3.2, 1.2, "rgba(30, 32, 40, 0.2)");
    rect(X0, ROAD_NORTH + 0.16, X1 - X0, 0.06, "#f1ede2");
    rect(X0, ROAD_SOUTH - 0.22, X1 - X0, 0.06, "#f1ede2");
    const middle = (ROAD_NORTH + ROAD_SOUTH) / 2;
    for (let x = X0 + 0.3; x < X1; x += 1.5) {
      if (Math.abs(x + 0.4 - CROSSING) > 1.6) rect(x, middle - 0.05, 0.8, 0.1, "#f2cf63");
    }
    for (let z = ROAD_NORTH + 0.32; z < ROAD_SOUTH - 0.4; z += 0.52) rect(CROSSING - 0.75, z, 1.5, 0.3, "#f6f2e7");
    rect(CROSSING - 1.25, middle + 0.1, 0.14, ROAD_SOUTH - middle - 0.35, "#f6f2e7");
    rect(CROSSING + 1.11, ROAD_NORTH + 0.28, 0.14, middle - ROAD_NORTH - 0.38, "#f6f2e7");
    const arrow = (x: number, z: number, direction: 1 | -1) => {
      ctx.fillStyle = "#f1ede2";
      ctx.beginPath();
      const tip = px(x + direction * 0.75);
      ctx.moveTo(tip, pz(z));
      ctx.lineTo(px(x + direction * 0.25), pz(z - 0.3));
      ctx.lineTo(px(x + direction * 0.25), pz(z - 0.1));
      ctx.lineTo(px(x - direction * 0.75), pz(z - 0.1));
      ctx.lineTo(px(x - direction * 0.75), pz(z + 0.1));
      ctx.lineTo(px(x + direction * 0.25), pz(z + 0.1));
      ctx.lineTo(px(x + direction * 0.25), pz(z + 0.3));
      ctx.fill();
    };
    for (const x of [-9, 0.5, 16.5, 26]) arrow(x, LANES[0], 1);
    for (const x of [-12, -2, 11, 21]) arrow(x, LANES[1], -1);
    for (const [x, z] of [[-4.5, -5.6], [13.2, -3.9], [24, -5.9]]) {
      disc(x, z, 0.34, 0.34, "#2f313a");
      disc(x, z, 0.27, 0.27, "#5d606c");
      rect(x - 0.2, z - 0.03, 0.4, 0.06, "#2f313a");
      rect(x - 0.03, z - 0.2, 0.06, 0.4, "#2f313a");
    }
    for (const x of [-11.5, -1.5, 9, 18.5, 27]) {
      rect(x, ROAD_SOUTH - 0.2, 0.5, 0.16, "#2a2c33");
      for (let bar = 0; bar < 4; bar++) rect(x + 0.06 + bar * 0.12, ROAD_SOUTH - 0.18, 0.04, 0.12, "#6a6d78");
    }
    ctx.fillStyle = "#f2cf63";
    ctx.font = `bold ${0.5 * PX}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BUS", px(11), pz(ROAD_SOUTH - 0.62));
    ctx.fillRect(px(9.6), pz(ROAD_SOUTH - 0.98), 2.8 * PX, 2);
    // Tactile paving where the crossing meets each kerb.
    for (const z of [ROAD_SOUTH + 0.14, ROAD_NORTH - 0.44]) {
      rect(CROSSING - 0.75, z, 1.5, 0.3, "#f2c230");
      for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) disc(CROSSING - 0.67 + i * 0.15, z + 0.08 + j * 0.14, 0.035, 0.035, "#c99a1c");
    }

    // Parking lot beside the restaurant, reached over a dropped kerb.
    const lotX = right;
    asphalt(DRIVE[0], ROAD_SOUTH, DRIVE[1] - DRIVE[0], NEAR_WALK_END - ROAD_SOUTH + 0.3, "#5b5e6a", 40);
    asphalt(lotX, NEAR_WALK_END, X1 - lotX, 12.6 - NEAR_WALK_END, "#5b5e6a", 77);
    rect(lotX, 12.6, X1 - lotX, 0.14, "#e9dfc8");
    for (const [x, length] of [[lotX + 0.15, 2.2], [X1 - 2.3, 2.2]] as const) {
      for (let bay = 0; bay <= 8; bay++) rect(x, 0.5 + bay * 1.4 - 0.035, length, 0.07, "#f1ede2");
    }
    rect(lotX + 0.2, 0.5 + 7 * 1.4 + 0.06, 2.1, 1.28, "#3d8fe4");
    disc(lotX + 1.25, 0.5 + 7.5 * 1.4, 0.4, 0.4, "#f1ede2");
    disc(lotX + 1.25, 0.5 + 7.5 * 1.4, 0.28, 0.28, "#3d8fe4");
    ctx.fillStyle = "#f1ede2";
    ctx.font = `bold ${1.3 * PX}px sans-serif`;
    ctx.fillText("P", px((DRIVE[0] + DRIVE[1]) / 2), pz(2.2));

    // Front terrace in warm two-tone pavers, with a walk leading away from the door.
    const pavers = (x: number, z: number, w: number, d: number) => {
      const size = 0.5;
      for (let tx = 0; tx < w / size; tx++) {
        for (let tz = 0; tz < d / size; tz++) {
          rect(x + tx * size, z + tz * size, size, size, "#b98a66");
          rect(x + tx * size + 0.025, z + tz * size + 0.025, size - 0.05, size - 0.05, (tx + tz) % 2 ? "#e7b98f" : "#dba77b");
        }
      }
    };
    pavers(left, front, right - left, 3);
    pavers(level.width / 2 - 1, front + 3, 2, Z1 - front - 3);
    rect(left, front + 3, right - left, 0.12, "#f1e4cc");

    // Soil squares under the street trees, then soft contact shadows under everything that stands on the ground.
    for (const pit of pits) {
      rect(pit.x - pit.radius, pit.z - pit.radius, pit.radius * 2, pit.radius * 2, "#a89a82");
      rect(pit.x - pit.radius + 0.06, pit.z - pit.radius + 0.06, pit.radius * 2 - 0.12, pit.radius * 2 - 0.12, "#7a5a40");
    }
    for (const spot of shadows) {
      const gradient = ctx.createRadialGradient(px(spot.x), pz(spot.z), 0, px(spot.x), pz(spot.z), spot.radius * PX);
      gradient.addColorStop(0, "rgba(30, 25, 40, 0.3)");
      gradient.addColorStop(1, "rgba(30, 25, 40, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(px(spot.x - spot.radius), pz(spot.z - spot.radius), spot.radius * 2 * PX, spot.radius * 2 * PX);
    }
  });
  texture.anisotropy = anisotropy;
  return texture;
}

// ---------------------------------------------------------------- the block

// Builds the neighbourhood round a restaurant: shops and a road behind it, a park, a parking lot and a front terrace.
export function createStreet(level: Level, anisotropy: number): { group: THREE.Group; view: StreetView } | null {
  const plan = level.decor.room;
  if (!plan?.street) return null;
  const season = seasonOf(level);
  const group = new THREE.Group();
  const solid = new THREE.Group();
  const textured = new THREE.Group();
  const shadows: Spot[] = [];
  const pits: Spot[] = [];
  const left = -plan.margin - 0.9;
  const right = level.width + plan.margin + 0.9;
  const front = level.height + 3.3;
  const place = (object: THREE.Object3D, x: number, z: number, turn = 0, shadow = 0.6) => {
    solid.add(put(object, x, 0, z, turn));
    if (shadow > 0) shadows.push({ x, z, radius: shadow });
  };
  const tree = (kind: TreeKind, x: number, z: number, pit = false) => {
    place(createTree(kind, x * 3.1 + z, season), x, z, 0, 1.1);
    if (pit) pits.push({ x, z, radius: 0.42 });
  };

  // Shops across the road.
  let shopX = X0 + 0.5;
  SHOPS.forEach((_, i) => {
    const shop = SHOPS[(i + season.shops) % SHOPS.length];
    addShop(shop, i + season.shops, shopX, solid, textured);
    shopX += shop.width;
  });

  // Kerbs; the near one is broken where the parking lot's driveway crosses it.
  const kerb = mat(0xe9dfc8, 0.8);
  solid.add(
    mesh(box(X1 - X0, 0.1, 0.16), kerb, (X0 + X1) / 2, 0.05, ROAD_NORTH - 0.02),
    mesh(box(DRIVE[0] - X0, 0.1, 0.16), kerb, (X0 + DRIVE[0]) / 2, 0.05, ROAD_SOUTH + 0.02),
    mesh(box(X1 - DRIVE[1], 0.1, 0.16), kerb, (X1 + DRIVE[1]) / 2, 0.05, ROAD_SOUTH + 0.02),
  );

  // Near pavement, between the road and the restaurant's back wall.
  for (const x of [-11, -4, 9.2, 16.5, 26.5]) place(createLamp(), x, ROAD_SOUTH + 0.35, Math.PI / 2, 0.35);
  for (const x of [-7.5, -0.6, 13.6, 20.4]) tree(x === 13.6 ? "blossom" : "round", x, ROAD_SOUTH + 0.62, true);
  place(createTrafficLight(), CROSSING - 1.1, ROAD_SOUTH + 0.3, -Math.PI / 2, 0.3);
  place(createBusStop(), 10.9, NEAR_WALK_END - 0.55, Math.PI, 1.3);
  place(createBench(), 1.6, NEAR_WALK_END - 0.5, Math.PI, 0.7);
  place(createBin(), 2.9, NEAR_WALK_END - 0.48, Math.PI, 0.35);
  place(createHydrant(), 7.4, ROAD_SOUTH + 0.4, 0, 0.3);
  place(createMailbox(), 8.3, NEAR_WALK_END - 0.5, Math.PI, 0.4);
  place(createBikeRack(), -1.6, NEAR_WALK_END - 0.55, 0, 0.7);
  for (const [x, colour] of [[-4.6, 0xf27aa0], [4.5, 0xffd166], [15.2, 0xf27aa0], [17.6, 0xffd166]] as const) {
    place(createPlanter(1.7, colour), x, NEAR_WALK_END - 0.4, 0, 0.9);
  }

  // Far pavement, in front of the shops.
  for (const x of [-7.6, 1, 12.8, 20.2]) place(createLamp(), x, ROAD_NORTH - 0.35, -Math.PI / 2, 0.35);
  for (const [i, x] of [-12.2, -3.6, 9.4, 16.6, 24.8].entries()) tree(i % 2 ? "blossom" : "round", x, ROAD_NORTH - 0.62, true);
  place(createTrafficLight(), CROSSING + 1.1, ROAD_NORTH - 0.3, Math.PI / 2, 0.3);
  place(createBench(), -9.6, FAR_WALK + 0.35, 0, 0.7);
  place(createBench(), 14.6, FAR_WALK + 0.35, 0, 0.7);
  place(createBin(), -6.2, FAR_WALK + 0.3, 0, 0.35);
  place(createBin(), 18.9, FAR_WALK + 0.3, 0, 0.35);
  place(createMailbox(), 3.6, FAR_WALK + 0.3, 0, 0.4);
  place(createCafeSet(0x8b689c), 11.2, FAR_WALK + 0.75, 0.3, 0.9);
  place(createCafeSet(0x8b689c), 13.2, FAR_WALK + 0.75, -0.2, 0.9);
  place(createMenuBoard(), 7.6, FAR_WALK + 0.45, 0, 0.4);
  place(createHydrant(), -0.9, ROAD_NORTH - 0.4, 0, 0.3);

  // Park on the left: fountain, benches facing it, trees, bushes and a few rocks.
  const fountain = createFountain();
  group.add(put(fountain.group, -10.5, 0, 4.6));
  shadows.push({ x: -10.5, z: 4.6, radius: 1.7 });
  place(createBench(), -8.1, 4.6, -Math.PI / 2, 0.7);
  place(createBench(), -12.9, 4.6, Math.PI / 2, 0.7);
  place(createLamp(), -8.8, 2.6, Math.PI * 0.75, 0.35);
  place(createLamp(), -12.2, 6.7, -Math.PI / 4, 0.35);
  tree("round", -7.9, 1.2);
  tree("pine", -13.8, 1.6);
  tree("blossom", -14.6, 4.9);
  tree("round", -7.6, 8.6);
  tree("pine", -15, 8.4);
  tree("round", -11.4, 13.4);
  tree("blossom", -7.5, 12.2);
  tree("pine", -14.2, 15.2);
  tree("round", -7.4, 16.4);
  for (const [i, [x, z]] of [[-9, 0.6], [-12.2, 0.9], [-8, 6.9], [-12.9, 8.3], [-11.5, 10.2], [-8.4, 14.4], [-15.2, 12.6]].entries()) {
    place(createBush(i * 9, [0xf27aa0, 0xffd166, 0xffffff][i % 3]), x, z, i, 0.5);
  }
  for (const [x, z, size] of [[-15, 10.4, 0.3], [-11.6, 12.3, 0.22], [-14.7, 12.1, 0.18]]) {
    solid.add(put(mesh(blob(size), mat(0xb8b2a6, 0.9, 0, true)), x, size * 0.5, z));
  }

  // Parking lot on the right: parked cars, wheel stops, a hedge along the pavement and a lamp.
  const parked: Array<[CarKind, number, number, number, number]> = [
    ["hatch", 0xe4573d, right + 1.25, 1.2, Math.PI / 2],
    ["van", 0xfff3d6, right + 1.3, 4.0, -Math.PI / 2],
    ["sedan", 0x3d8fe4, right + 1.25, 5.4, Math.PI / 2],
    ["pickup", 0x4fb86a, right + 1.3, 8.2, -Math.PI / 2],
    ["sedan", 0xe4b03d, X1 - 1.2, 2.6, Math.PI / 2],
    ["hatch", 0x8b689c, X1 - 1.2, 6.8, -Math.PI / 2],
  ];
  for (const [kind, colour, x, z, turn] of parked) {
    group.add(put(createCar(kind, colour), x, 0, z, turn));
    shadows.push({ x, z, radius: 1.15 });
  }
  for (let bay = 0; bay < 8; bay++) {
    solid.add(mesh(rounded(0.12, 0.08, 0.9, 0.03), mat(0xf2c230, 0.7), right + 0.35, 0.04, 1.2 + bay * 1.4));
  }
  place(createPlanter(2.2, 0xffd166), DRIVE[0] - 1.4, NEAR_WALK_END - 0.3, 0, 1);
  place(createPlanter(3.4, 0xf27aa0), DRIVE[1] + 2, NEAR_WALK_END - 0.3, 0, 1.4);
  place(createLamp(), right + 4.4, 12.2, -Math.PI / 2, 0.35);
  tree("round", right + 2, 14.2);
  tree("pine", right + 6.5, 15);
  tree("blossom", right + 4.4, 17);

  // Front terrace: hedges either side of the way in, café sets, a menu board, bikes and a bench.
  const door = level.width / 2;
  for (const x of [left + 1.6, left + 4.6, door - 3.2, door + 3.2, right - 4.6, right - 1.6]) {
    place(createPlanter(2.4, x < door ? 0xf27aa0 : 0xffd166), x, front + 2.55, 0, 1.1);
  }
  place(createCafeSet(0xe4573d), door - 5.4, front + 1.3, 0.2, 0.9);
  place(createCafeSet(0x2f7f86), door - 8.6, front + 1.3, -0.3, 0.9);
  place(createCafeSet(0xe4b03d), door + 5.4, front + 1.3, -0.2, 0.9);
  place(createMenuBoard(), door - 1.5, front + 1.8, 0.25, 0.4);
  place(createBikeRack(), door + 8.6, front + 1.4, 0, 0.7);
  place(createBench(), door + 11.2, front + 1.3, Math.PI, 0.7);
  place(createLamp(), door - 1.5, front + 3.5, 0, 0.35);
  place(createLamp(), door + 1.5, front + 3.5, Math.PI, 0.35);
  tree("round", door - 6, front + 4.8);
  tree("blossom", door + 6.5, front + 5);
  tree("round", door + 12, front + 5.4);
  tree("pine", door - 11, front + 5.2);

  const ground = mesh(
    new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
    new THREE.MeshStandardMaterial({ map: groundTexture(level, plan.margin, shadows, pits, anisotropy), roughness: 0.92 }),
    (X0 + X1) / 2,
    -0.014,
    (Z0 + Z1) / 2,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground, bake(solid), textured);
  textured.traverse((child) => (child.receiveShadow = true));

  // Traffic: five cars over two lanes, wrapping round beyond the edges of the screen.
  const cars: Mover[] = [];
  const fleet: Array<[CarKind, number]> = [
    ["taxi", 0xf2c230],
    ["sedan", 0x3f91b7],
    ["pickup", 0xd95743],
    ["van", 0x7fc2a8],
    ["hatch", 0xf29bb5],
  ];
  const length = X1 - X0;
  fleet.forEach(([kind, colour], i) => {
    const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const car = createCar(kind, colour);
    car.rotation.y = (direction * Math.PI) / 2;
    group.add(car);
    cars.push({ group: car, lane: LANES[direction > 0 ? 0 : 1], phase: (i * length) / fleet.length + i * 2.3, speed: 1.5 + (i % 3) * 0.3, direction });
  });

  const walkers: Mover[] = [];
  const looks: Look[] = [
    { shirt: 0xd65c45, trousers: 0x343d56, skin: 0xe9b58c, hair: 0x4b3021, accent: 0xffd166, style: 0 },
    { shirt: 0x3f8396, trousers: 0x493b34, skin: 0x8d5e3f, hair: 0x24201d, accent: 0xe4573d, style: 1 },
    { shirt: 0xe4b03d, trousers: 0x465f45, skin: 0xf2c9a2, hair: 0xb5651d, accent: 0x3d8fe4, style: 2 },
    { shirt: 0x8b689c, trousers: 0x393c50, skin: 0xc78362, hair: 0x34241e, accent: 0x4fb86a, style: 3 },
    { shirt: 0x4fb86a, trousers: 0x5a4a66, skin: 0xf0c49a, hair: 0x6b4a2a, accent: 0xf29bb5, style: 2 },
    { shirt: 0xfff3d6, trousers: 0x2f5f73, skin: 0xa86f4a, hair: 0x1f1a17, accent: 0xe4b03d, style: 0 },
  ];
  looks.forEach((look, i) => {
    const person = createWalker(look);
    group.add(person.group);
    const near = i % 2 === 0;
    walkers.push({
      group: person.group,
      legs: person.legs,
      arms: person.arms,
      lane: near ? ROAD_SOUTH + 1.05 + (i % 4) * 0.12 : ROAD_NORTH - 0.95 - (i % 3) * 0.14,
      phase: (i * length) / looks.length + i * 1.7,
      speed: 0.55 + (i % 4) * 0.08,
      direction: i % 3 === 0 ? -1 : 1,
    });
  });

  return { group, view: { cars, walkers, water: fountain.water } };
}

export function animateStreet(room: THREE.Group, time: number): void {
  const street = room.userData.street as StreetView | undefined;
  if (!street) return;
  const length = X1 - X0;
  street.cars.forEach((car, i) => {
    const distance = (time * car.speed + car.phase) % length;
    car.group.position.set(car.direction > 0 ? X0 + distance : X1 - distance, Math.abs(Math.sin(time * 9 + i)) * 0.012, car.lane);
  });
  street.walkers.forEach((person, i) => {
    const distance = (time * person.speed + person.phase) % length;
    const stride = time * 6.5 + i;
    person.group.position.set(person.direction > 0 ? X0 + distance : X1 - distance, Math.abs(Math.sin(stride)) * 0.035, person.lane);
    person.group.rotation.y = (person.direction * Math.PI) / 2;
    person.legs?.forEach((leg, side) => (leg.rotation.x = Math.sin(stride + side * Math.PI) * 0.5));
    person.arms?.forEach((arm, side) => (arm.rotation.x = Math.sin(stride + Math.PI + side * Math.PI) * 0.4));
  });
  for (const jets of street.water) jets.rotation.y = time * 0.8;
}
