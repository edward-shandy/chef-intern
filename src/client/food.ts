import * as THREE from "three";
import type { DishPart, Ingredient } from "../shared/recipes";
import { ball, box, cylinder, mat, mesh, noise, rounded, shadowed } from "./models";

// Ingredients drawn in code rather than taken from the KayKit pack; all have their origin at the base.
export const CODE_FOOD: Ingredient[] = ["seaweed", "clam", "fish", "bun", "meat"];

export type Stage = "whole" | "chopped" | "cooked" | "burnt";

const dome = (radius: number) => new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const BURNT = 0x2a2226;

function turn(object: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  object.rotation.set(x, y, z);
  return object;
}

// Dark grill stripes across the top of something cooked.
function grillMarks(group: THREE.Group, width: number, y: number): void {
  for (const offset of [-0.3, 0, 0.3]) {
    group.add(turn(mesh(box(width * 0.95, 0.008, 0.022), mat(0x4a2a1a, 0.9), offset * width * 0.6, y, 0), 0, 0.6, 0));
  }
}

function seaweed(stage: Stage): THREE.Group {
  const group = new THREE.Group();
  const greens = [0x2f8a4a, 0x3f9d57, 0x57b56a];
  if (stage === "whole") {
    // A bundle of ribbons tied with a band.
    for (let i = 0; i < 5; i++) {
      const ribbon = mesh(rounded(0.09, 0.025, 0.42, 0.01), mat(greens[i % 3], 0.6), -0.1 + i * 0.05, 0.02 + (i % 2) * 0.02, 0);
      ribbon.rotation.set(0, (i - 2) * 0.18, Math.sin(i) * 0.15);
      group.add(ribbon);
    }
    group.add(mesh(box(0.28, 0.06, 0.05), mat(0xd9a15c, 0.8), 0, 0.05, 0));
  } else {
    // A heap of thin strips.
    for (let i = 0; i < 14; i++) {
      const strip = mesh(box(0.035, 0.018, 0.16), mat(greens[i % 3], 0.6), (noise(i) - 0.5) * 0.2, 0.012 + (i % 4) * 0.014, (noise(i + 4) - 0.5) * 0.2);
      strip.rotation.y = noise(i + 9) * Math.PI;
      group.add(strip);
    }
    group.add(mesh(ball(0.012, 6), mat(0xfff3d6, 0.5), 0.02, 0.07, 0.01), mesh(ball(0.012, 6), mat(0xfff3d6, 0.5), -0.04, 0.065, -0.03));
  }
  return group;
}

function clam(stage: Stage): THREE.Group {
  const group = new THREE.Group();
  const shell = mat(0xb58ae0, 0.55);
  const rim = mat(0x8b689c, 0.6);
  const lower = mesh(dome(0.13), shell, 0, 0.06, 0);
  lower.rotation.x = Math.PI;
  lower.scale.y = 0.45;
  group.add(lower, mesh(cylinder(0.132, 0.132, 0.012, 16), rim, 0, 0.06, 0));
  if (stage === "whole") {
    const upper = mesh(dome(0.13), shell, 0, 0.06, 0);
    upper.scale.y = 0.45;
    group.add(upper);
    for (let i = -2; i <= 2; i++) group.add(turn(mesh(box(0.012, 0.012, 0.2), rim, i * 0.04, 0.1 - Math.abs(i) * 0.008, 0), 0, i * 0.25, 0));
  } else {
    // Shucked: the top shell tipped back, the pink meat showing.
    const upper = mesh(dome(0.13), shell, 0, 0.08, -0.12);
    upper.scale.y = 0.45;
    upper.rotation.x = -1.6;
    group.add(upper, mesh(ball(0.07, 10), mat(0xf7a8b8, 0.4), 0, 0.075, 0.01));
  }
  return group;
}

function fish(stage: Stage): THREE.Group {
  const group = new THREE.Group();
  if (stage === "whole") {
    // A whole fish lying on its side.
    const body = mesh(ball(0.12, 14), mat(0x7fa8c9, 0.35, 0.2), 0, 0.07, 0);
    body.scale.set(2.2, 0.62, 0.9);
    const belly = mesh(ball(0.12, 14), mat(0xdfe9f2, 0.35), 0, 0.055, 0.02);
    belly.scale.set(2, 0.45, 0.85);
    const tail = turn(mesh(new THREE.ConeGeometry(0.09, 0.14, 4), mat(0x5f8aa8, 0.4), -0.31, 0.07, 0), 0, 0, Math.PI / 2);
    tail.scale.set(1, 1, 0.35);
    group.add(body, belly, tail, mesh(ball(0.025, 8), mat(0xffffff, 0.3), 0.19, 0.09, 0.07), mesh(ball(0.013, 6), mat(0x1c1c28, 0.3), 0.198, 0.09, 0.087));
    group.add(turn(mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mat(0x5f8aa8, 0.4), 0, 0.13, 0), 0, 0, -0.3));
  } else {
    // A fillet: raw it is salmon pink, cooked golden with grill marks, burnt black.
    const colour = stage === "chopped" ? 0xf49a7a : stage === "cooked" ? 0xd9935a : BURNT;
    group.add(mesh(rounded(0.3, 0.06, 0.16, 0.03), mat(colour, 0.55), 0, 0.03, 0));
    if (stage === "chopped") {
      for (let i = -2; i <= 2; i++) group.add(turn(mesh(box(0.006, 0.062, 0.14), mat(0xffd3c2, 0.5), i * 0.05, 0.031, 0), 0, 0.4, 0));
    } else if (stage === "cooked") {
      grillMarks(group, 0.28, 0.062);
      group.add(mesh(box(0.04, 0.01, 0.04), mat(0xffe27a, 0.4), 0.08, 0.065, 0.03));
    }
  }
  return group;
}

function meat(stage: Stage): THREE.Group {
  const group = new THREE.Group();
  if (stage === "whole") {
    // A cut of raw beef with a stripe of fat.
    group.add(mesh(rounded(0.26, 0.09, 0.2, 0.04), mat(0xc9433a, 0.6), 0, 0.045, 0), mesh(rounded(0.27, 0.06, 0.04, 0.02), mat(0xfff0e6, 0.6), 0, 0.05, -0.085));
    for (let i = 0; i < 3; i++) group.add(turn(mesh(box(0.18, 0.004, 0.012), mat(0xf2a6a0, 0.6), 0, 0.091, -0.05 + i * 0.05), 0, 0.3, 0));
  } else {
    const colour = stage === "chopped" ? 0xd9574a : stage === "cooked" ? 0x7a4a2e : BURNT;
    group.add(mesh(cylinder(0.12, 0.125, 0.055, 18), mat(colour, 0.7), 0, 0.028, 0));
    if (stage === "cooked") grillMarks(group, 0.2, 0.057);
    if (stage === "chopped") for (let i = 0; i < 6; i++) group.add(mesh(ball(0.012, 5), mat(0xf2a6a0, 0.6), Math.cos(i) * 0.07, 0.056, Math.sin(i * 1.7) * 0.07));
  }
  return group;
}

function bun(): THREE.Group {
  const group = new THREE.Group();
  const crust = mat(0xd9913a, 0.55);
  const top = mesh(dome(0.13), crust, 0, 0.05, 0);
  top.scale.y = 0.75;
  group.add(mesh(cylinder(0.125, 0.12, 0.05, 18), mat(0xe8b066, 0.6), 0, 0.025, 0), top);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.4;
    const reach = 0.03 + (i % 3) * 0.025;
    group.add(turn(mesh(ball(0.012, 5), mat(0xfff3d6, 0.5), Math.cos(angle) * reach, 0.145 - reach * 0.35, Math.sin(angle) * reach), 0, angle, 0));
    group.children[group.children.length - 1].scale.set(1.6, 0.6, 1);
  }
  return group;
}

// One ingredient as it looks at a given stage.
export function createFood(kind: Ingredient, stage: Stage): THREE.Group {
  const group =
    kind === "seaweed" ? seaweed(stage) : kind === "clam" ? clam(stage) : kind === "fish" ? fish(stage) : kind === "meat" ? meat(stage) : bun();
  return shadowed(group);
}

// A burger built up from whatever parts are on the plate, with the bun's lid on top once it is there.
export function createBurger(parts: DishPart[]): THREE.Group {
  const group = new THREE.Group();
  let y = 0.02;
  const has = (part: DishPart) => parts.includes(part);
  if (has("bun")) {
    group.add(mesh(cylinder(0.125, 0.12, 0.05, 18), mat(0xe8b066, 0.6), 0, y + 0.025, 0));
    y += 0.05;
  }
  if (has("lettuce")) {
    for (let i = 0; i < 5; i++) group.add(turn(mesh(rounded(0.13, 0.015, 0.09, 0.006), mat(0x7ccf4f, 0.6), Math.cos(i * 1.25) * 0.05, y + 0.008, Math.sin(i * 1.25) * 0.05), 0.1, i * 1.25, 0.1));
    y += 0.02;
  }
  if (has("meat")) {
    const patty = new THREE.Group();
    patty.add(mesh(cylinder(0.125, 0.13, 0.05, 18), mat(0x7a4a2e, 0.7), 0, 0.025, 0));
    grillMarks(patty, 0.2, 0.051);
    patty.position.y = y;
    group.add(patty);
    y += 0.05;
  }
  if (has("tomato")) {
    for (const [x, z] of [[-0.04, 0.02], [0.05, -0.02]]) group.add(mesh(cylinder(0.06, 0.06, 0.018, 14), mat(0xe23b2e, 0.5), x, y + 0.009, z));
    y += 0.018;
  }
  if (has("bun")) {
    const lid = bun();
    lid.children[0].visible = false;
    lid.position.y = y - 0.045;
    group.add(lid);
  }
  return shadowed(group);
}

// A wooden crate of one code-built ingredient, sized like the KayKit crates.
export function createCrate(kind: Ingredient): THREE.Group {
  const group = new THREE.Group();
  const wood = mat(0xb9783f, 0.8);
  const dark = mat(0x7d4c22, 0.85);
  group.add(mesh(box(0.74, 0.04, 0.6), dark, 0, 0.02, 0));
  for (const z of [-0.29, 0.29]) group.add(mesh(box(0.76, 0.18, 0.04), wood, 0, 0.11, z), mesh(box(0.76, 0.03, 0.045), dark, 0, 0.13, z));
  for (const x of [-0.36, 0.36]) group.add(mesh(box(0.04, 0.18, 0.6), wood, x, 0.11, 0));
  const spots = [[-0.18, -0.12], [0.16, -0.13], [-0.16, 0.13], [0.18, 0.12], [0, 0]];
  spots.forEach(([x, z], i) => {
    const food = createFood(kind, "whole");
    food.position.set(x, 0.05 + (i === 4 ? 0.05 : 0), z);
    food.rotation.y = i * 1.3;
    food.scale.setScalar(kind === "fish" ? 0.75 : 0.9);
    group.add(food);
  });
  return shadowed(group);
}

// A charcoal grill top that sits on a counter: a dark firebox, glowing coals and a steel grate.
export function createGrillTop(): { group: THREE.Group; coals: THREE.Group } {
  const group = new THREE.Group();
  const steel = mat(0x3a3d47, 0.45, 0.6);
  group.add(mesh(rounded(0.86, 0.06, 0.86, 0.02), mat(0x25252c, 0.6), 0, 0.03, 0));
  for (let i = -3; i <= 3; i++) group.add(mesh(box(0.74, 0.014, 0.022), mat(0xb9c0cc, 0.3, 0.8), 0, 0.075, i * 0.1));
  for (const x of [-0.37, 0.37]) group.add(mesh(box(0.03, 0.03, 0.72), steel, x, 0.075, 0));
  group.add(mesh(box(0.2, 0.03, 0.05), steel, 0, 0.05, 0.45));
  const coals = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  for (let i = 0; i < 9; i++) coals.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), glow, -0.25 + (i % 3) * 0.25, 0.06, -0.25 + Math.floor(i / 3) * 0.25));
  coals.visible = false;
  return { group: shadowed(group), coals };
}
