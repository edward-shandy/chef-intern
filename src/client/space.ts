import * as THREE from "three";
import type { Level } from "../shared/level";
import { ball, box, mat, mesh, rounded } from "./models";
import { bake } from "./street";
import { createRocks, type RockField } from "./spaceRocks";
import { rng } from "./spaceArt";
import { createSky } from "./spaceSky";
import { createStation, type Station } from "./spaceStation";

// The view from the Orbit Diner: the deck hangs in space with its hull, trusses, solar wings, tanks and a parked shuttle
// (spaceStation.ts), tumbling rocks (spaceRocks.ts) and a painted backdrop of planets, moon, nebulae and stars
// (spaceSky.ts). Every outside surface shares one sun direction and one toon ramp (spaceArt.ts), and nothing out here
// is fogged, so it stays crisp however far back the camera sits.

export interface SpaceView {
  planet: THREE.Object3D;
  tick: (time: number) => void;
}

export function createSpace(level: Level): { group: THREE.Group; view: SpaceView } {
  const plan = level.decor.room!;
  const group = new THREE.Group();
  const cx = level.width / 2;
  const cz = level.height / 2;

  // Sky dome, stars, nebulae, galaxy, planets, moon, comet and shooting stars.
  const sky = createSky(group, cx, cz);

  // The deck the diner sits on, plus everything bolted to it.
  const depth = level.height + 3.6;
  const span = level.width + plan.margin * 2;
  const slabZ = depth / 2 - 0.3;
  const station: Station = createStation(group, { cx, frontZ: slabZ + depth / 2 + 0.2, backZ: slabZ - depth / 2 - 0.2, slabZ, span, depth });

  // An asteroid belt around and below the station: more rocks off to the sides and far back, a few close ones to frame it.
  const r = rng(77);
  const spots: Array<{ x: number; y: number; z: number; size: number }> = [];
  for (let i = 0; i < 84; i++) {
    const near = i < 14;
    const angle = r() * Math.PI * 2;
    const reach = near ? 15 + r() * 8 : 18 + r() * 28;
    spots.push({
      x: cx + Math.cos(angle) * reach * 1.25,
      y: near ? -3 - r() * 9 : -4 - r() * 22,
      z: cz + Math.sin(angle) * reach * (near ? 1.1 : 1.35) - 4,
      size: near ? 0.7 + r() * 0.9 : 0.4 + r() * r() * 2.0,
    });
  }
  const rocks: RockField = createRocks(group, spots);

  // Cool station lights over the dining room, standing in for the town's warm lamps.
  for (const x of [-plan.margin / 2, level.width + plan.margin / 2]) {
    const light = new THREE.PointLight(0x9fd8ff, 7, 10, 1.6);
    light.position.set(x, 2.6, level.height / 2);
    group.add(light);
  }

  const tick = (time: number): void => {
    sky.tick(time);
    station.tick(time);
    rocks.tick(time);
  };
  return { group, view: { planet: sky.planet, tick } };
}

export function animateSpace(room: THREE.Group, time: number): void {
  const view = room.userData.space as SpaceView | undefined;
  view?.tick(time);
}

// The station's galley cabinet, in game units facing +Z: a pale hull body with vents, a dark composite worktop with a
// cyan light along its front edge, and a little status light. Baked into one mesh per material for instancing.
export function createSpaceCounter(): THREE.Group {
  const cabinet = new THREE.Group();
  const hull = mat(0xd9e2ee, 0.45, 0.25);
  const trim = mat(0x2f3a5c, 0.5, 0.35);
  const cyan = new THREE.MeshStandardMaterial({ color: 0x3fd6e8, emissive: 0x3fd6e8, emissiveIntensity: 1.6, roughness: 0.4 });
  cabinet.add(
    mesh(box(0.98, 0.06, 0.92), trim, 0, 0.03, 0),
    mesh(rounded(0.96, 0.4, 0.9, 0.05), hull, 0, 0.25, 0),
    // A mid steel-blue worktop: lighter than the navy deck, darker than the pale galley floor, so it reads against both.
    mesh(rounded(1.0, 0.07, 1.0, 0.02), mat(0x8ea3c7, 0.35, 0.25), 0, 0.465, 0),
    mesh(box(1.0, 0.025, 0.03), cyan, 0, 0.44, 0.5),
    mesh(box(0.7, 0.16, 0.02), trim, 0, 0.24, 0.455),
  );
  for (let i = 0; i < 4; i++) cabinet.add(mesh(box(0.56, 0.018, 0.022), mat(0x8a93a6, 0.4, 0.5), 0, 0.185 + i * 0.035, 0.462));
  cabinet.add(mesh(ball(0.025, 8), new THREE.MeshStandardMaterial({ color: 0x7ccf4f, emissive: 0x7ccf4f, emissiveIntensity: 1.5 }), 0.4, 0.36, 0.46));
  return bake(cabinet);
}
