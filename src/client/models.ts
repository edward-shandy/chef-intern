import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Level, TileKind } from "../shared/level";
import {
  BELT_SECONDS,
  BURN_AT,
  FIRE_AT,
  isChopped,
  isRoastable,
  POT_CAPACITY,
  potIsCooked,
  type Item,
} from "../shared/sim";
import { decoration, model, MODEL_SCALE, modelGeometry, modelMaterial, type ModelName } from "./assets";
import { createExtinguisher } from "./fire";
import { CODE_FOOD, createBurger, createCrate, createFood, type Stage } from "./food";
import { createCoralPot, createSea, createSeaCounter, SEA_SAND } from "./sea";
import { createStreet, streetGround } from "./street";

export { animateStreet } from "./street";

export const COLORS = {
  background: 0x1b1624,
  wall: 0xe8c9a0,
  wallTrim: 0x2f7f86,
  windowFrame: 0xfffaf0,
  windowGlow: 0xa9dcff,
  cabinet: 0x2b7b83,
  cabinetDoor: 0x379aa2,
  kick: 0x1b464c,
  brass: 0xd9a441,
  steel: 0x8a93a6,
  darkSteel: 0x3a3d47,
  crate: 0xb9783f,
  crateDark: 0x7d4c22,
  board: 0xd7a15c,
  stove: 0x25252c,
  burner: 0xff6a3d,
  flame: 0xffa436,
  serve: 0x45b7a0,
  plate: 0xffffff,
  plateRim: 0x3d8fe4,
  tray: 0x2f5f9e,
  knife: 0xdfe3ea,
  knifeHandle: 0x2a2530,
  tomato: 0xe23b2e,
  tomatoStem: 0x3f9b46,
  lettuce: 0x7ccf4f,
  lettuceDark: 0x4fa83a,
  leaf: 0x3f9d57,
  leafDark: 0x2c7a45,
  pot: 0x8b93a3,
  soupRaw: 0xf07a5a,
  soupCooked: 0xd2411f,
  soupBurnt: 0x1d1a1a,
  highlight: 0xffd166,
  marker: 0xff9d0a,
  markerEdge: 0x33210a,
  pointer: 0x7fe3ff,
  pointerEdge: 0x0c2a38,
  barBack: 0x221c2c,
  barChop: 0x6fd98a,
  barCook: 0xf2b84b,
  barBurn: 0xef4b3a,
  hat: 0xfdfdfd,
  skin: 0xf2c29b,
  blush: 0xf09a8a,
  eyes: 0x2b2230,
  shoe: 0x3a2f3f,
  scarf: 0xfff3d6,
  shirts: [0xe4573d, 0x3d8fe4, 0x4fb86a, 0xe4b03d],
  hair: [0x4a2f1b, 0x1f1a17, 0xb5651d, 0x6b4a8a],
};

export const WORKTOP_Y = 0.5;
// How far above the worktop an item rests on each kind of station.
export const restLift = (kind: TileKind): number =>
  kind === "board" ? 0.075 : kind === "stove" ? 0.105 : kind === "grill" ? 0.12 : kind === "belt" ? 0.05 : 0;
// Stations that heat what rests on them: hobs cook pots and grills roast chickens.
export const heats = (kind: TileKind): boolean => kind === "stove" || kind === "grill";

// Places a KayKit model in the world, scaled from the pack's grid to ours.
function prop(name: ModelName, x: number, y: number, z: number, turn = 0, scale = MODEL_SCALE): THREE.Mesh {
  const result = model(name);
  result.position.set(x, y, z);
  result.rotation.y = turn;
  result.scale.setScalar(scale);
  return result;
}
export const BAR_WIDTH = 0.7;
export const LABEL_DARK = "rgba(34, 28, 44, 0.85)";

// Materials are shared by colour so identical surfaces batch into fewer draw calls.
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, roughness = 0.6, metalness = 0, flatShading = false): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${metalness}:${flatShading}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading });
    materials.set(key, material);
  }
  return material;
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  return result;
}

export function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return object;
}

export const rounded = (width: number, height: number, depth: number, radius: number) =>
  new RoundedBoxGeometry(width, height, depth, 2, radius);
export const box = (width: number, height: number, depth: number) => new THREE.BoxGeometry(width, height, depth);
export const cylinder = (top: number, bottom: number, height: number, segments = 24) =>
  new THREE.CylinderGeometry(top, bottom, height, segments);
export const ball = (radius: number, detail = 16) => new THREE.SphereGeometry(radius, detail, Math.max(8, detail - 4));

// Stable pseudo-random number in 0..1, so decoration looks the same on every client and reload.
export const noise = (seed: number): number => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Planks with slightly different tones and a little grain, used for worktops and the deck.
function woodTexture(light: string, grain: string, planks: number, seed: number): THREE.CanvasTexture {
  const size = 256;
  const texture = canvasTexture(size, size, (ctx) => {
    const plank = size / planks;
    for (let i = 0; i < planks; i++) {
      ctx.fillStyle = light;
      ctx.fillRect(i * plank, 0, plank, size);
      ctx.fillStyle = `rgba(60, 30, 10, ${0.04 + noise(seed + i) * 0.14})`;
      ctx.fillRect(i * plank, 0, plank, size);
      ctx.strokeStyle = grain;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1.5;
      for (let line = 0; line < 4; line++) {
        const x = i * plank + plank * (0.15 + noise(seed + i * 7 + line) * 0.7);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 5, size * 0.3, x - 5, size * 0.7, x + 2, size);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i * plank, 0);
      ctx.lineTo(i * plank, size);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------- room

// One texture for the whole floor, so every tile can carry its own tint and wear.
function floorTexture(level: Level, anisotropy: number): THREE.CanvasTexture {
  const size = 64;
  const texture = canvasTexture(level.width * size, level.height * size, (ctx) => {
    for (let tx = 0; tx < level.width; tx++) {
      for (let tz = 0; tz < level.height; tz++) {
        const x = tx * size;
        const z = tz * size;
        const seed = tx * 31 + tz * 17;
        // The sea kitchens get cooler, glassier tiles.
        const sea = level.theme === "sea";
        ctx.fillStyle = sea ? "#5f9aa6" : "#8fa3a8";
        ctx.fillRect(x, z, size, size);
        ctx.fillStyle = (tx + tz) % 2 === 0 ? (sea ? "#eefcff" : "#f4ecdc") : sea ? "#a5e0dc" : "#bcd0d2";
        ctx.fillRect(x + 2, z + 2, size - 4, size - 4);
        ctx.fillStyle =
          noise(seed) > 0.5 ? `rgba(255, 255, 255, ${noise(seed + 1) * 0.1})` : `rgba(70, 30, 10, ${noise(seed + 1) * 0.09})`;
        ctx.fillRect(x + 2, z + 2, size - 4, size - 4);
        // A faint lighter edge gives each tile a glazed, slightly raised look.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, z + 5, size - 10, size - 10);
        for (let speck = 0; speck < 3; speck++) {
          ctx.fillStyle = "rgba(90, 50, 25, 0.12)";
          ctx.fillRect(x + 8 + noise(seed + speck * 3) * 46, z + 8 + noise(seed + speck * 5) * 46, 2, 2);
        }
      }
    }
  });
  texture.anisotropy = anisotropy;
  return texture;
}

// The generated wall panels are 2.4 tall; squashed a little they match the kitchen's proportions.
const WALL_SQUASH = 0.85;
// Dining sets and guests are authored larger than the KayKit kitchen, so they are scaled to sit beside it.
const DINING_SCALE = 0.78;
// Where the chairs are around each dining set, in the set's own units; two-seaters are the default.
const SEATS: Record<string, Array<[number, number]>> = {
  "dining-set-gingham": [
    [-1.22, 0],
    [1.22, 0],
    [0, -1.22],
    [0, 1.22],
  ],
};
const TWO_SEATS: Array<[number, number]> = [
  [-0.82, 0],
  [0.82, 0],
];
// The four-seat gingham set is much larger than the others, so it is scaled down further.
const SET_SCALE: Record<string, number> = { "dining-set-gingham": 0.56 };
const GUEST_SEAT_HEIGHT = 0.16;

function diningFloorTexture(anisotropy: number): THREE.CanvasTexture {
  const texture = canvasTexture(128, 128, (ctx) => {
    for (let x = 0; x < 2; x++) {
      for (let z = 0; z < 2; z++) {
        ctx.fillStyle = "#8a7f86";
        ctx.fillRect(x * 64, z * 64, 64, 64);
        ctx.fillStyle = (x + z) % 2 === 0 ? "#e9dccb" : "#c9bdb4";
        ctx.fillRect(x * 64 + 2, z * 64 + 2, 60, 60);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

// Guests sway a little in their seats and hop when an order is delivered.
export function animateGuests(room: THREE.Group, time: number, cheer: number): void {
  const guests = (room.userData.guests ?? []) as THREE.Object3D[];
  guests.forEach((guest, i) => {
    const hop = cheer > 0 ? Math.abs(Math.sin(cheer * Math.PI * 3 + i)) * 0.22 * cheer : 0;
    guest.position.y = (guest.userData.restY as number) + Math.sin(time * 1.8 + i * 1.3) * 0.012 + hop;
    guest.rotation.z = Math.sin(time * 1.1 + i * 2.1) * 0.035;
  });
}

// Floor, a wooden deck around it, the restaurant or a plain wall behind, and lamps over the back counters.
export function createRoom(level: Level, anisotropy: number): THREE.Group {
  const room = new THREE.Group();
  const { width, height } = level;
  const plan = level.decor.room;
  const floorMap = plan?.kitchenFloor ? new THREE.TextureLoader().load(plan.kitchenFloor) : floorTexture(level, anisotropy);
  floorMap.colorSpace = THREE.SRGBColorSpace;
  floorMap.anisotropy = anisotropy;
  if (plan?.kitchenFloor) {
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.repeat.set(width / 4, height / 4);
  }

  const floor = mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.64 }),
    width / 2,
    0,
    height / 2,
  );
  floor.rotation.x = -Math.PI / 2;
  const deckMap = woodTexture("#6a4a3c", "#2a1a14", 4, 40);
  deckMap.repeat.set(26, 26);
  deckMap.anisotropy = anisotropy;
  // A kitchen on a street stands on lawn rather than on the wooden deck.
  const deck = mesh(
    new THREE.PlaneGeometry(90, 90),
    level.theme === "sea"
      ? new THREE.MeshStandardMaterial({ color: SEA_SAND, roughness: 0.95 })
      : plan?.street
        ? new THREE.MeshStandardMaterial({ color: streetGround(level), roughness: 0.95 })
        : new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.9 }),
    width / 2,
    -0.02,
    height / 2,
  );
  deck.rotation.x = -Math.PI / 2;
  floor.receiveShadow = deck.receiveShadow = true;
  room.add(deck, floor);

  const solid = new THREE.Group();
  const guests: THREE.Object3D[] = [];
  const street = createStreet(level, anisotropy);
  if (street) room.add(street.group);
  const sea = level.theme === "sea" ? createSea(level, anisotropy, guests) : null;
  if (sea) room.add(sea.group);
  if (plan) {
    // A tiled dining floor surrounds the kitchen and sits just under its own floor.
    const depth = height + 3.6;
    const span = width + plan.margin * 2;
    const tiles = plan.floor ? new THREE.TextureLoader().load(plan.floor) : diningFloorTexture(anisotropy);
    tiles.colorSpace = THREE.SRGBColorSpace;
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.anisotropy = anisotropy;
    // The default checker is two tiles per repeat; a supplied image is stretched over four.
    tiles.repeat.set(span / (plan.floor ? 4 : 2), depth / (plan.floor ? 4 : 2));
    const dining = mesh(
      new THREE.PlaneGeometry(span, depth),
      new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.6 }),
      width / 2,
      -0.008,
      depth / 2 - 0.3,
    );
    dining.rotation.x = -Math.PI / 2;
    dining.receiveShadow = true;
    room.add(dining);

    // Wall panels are two tiles wide; the kitchen's own run is centred and the dining room continues it.
    const panel = (name: string, x: number, z: number, turn: number) => {
      const wall = decoration(name);
      if (!wall) return;
      wall.position.set(x, 0, z);
      wall.rotation.y = turn;
      wall.scale.y = WALL_SQUASH;
      solid.add(wall);
    };
    const first = width / 2 - (plan.backWall.length - 1);
    plan.backWall.forEach((name, i) => panel(name, first + i * 2, -0.22, 0));
    const edge = plan.backWall.length - width / 2;
    for (let x = edge + 1; x < plan.margin + 1; x += 2) {
      panel(plan.outerWall, -x, -0.22, 0);
      panel(plan.outerWall, width + x, -0.22, 0);
    }
    for (let i = 0; i * 2 < depth - 1; i++) {
      const name = plan.sideWalls[i % plan.sideWalls.length];
      panel(name, -plan.margin - 0.2, 0.8 + i * 2, Math.PI / 2);
      panel(name, width + plan.margin + 0.2, 0.8 + i * 2, -Math.PI / 2);
    }

    // Each table is a set with a chair at either end; guests are placed on the chairs, facing the table.
    for (const table of plan.tables) {
      const set = new THREE.Group();
      const furniture = decoration(table.model);
      if (!furniture) continue;
      set.add(furniture);
      const seats = SEATS[table.model] ?? TWO_SEATS;
      table.guests.forEach((name, seat) => {
        const guest = name && seats[seat] ? decoration(name) : null;
        if (!guest) return;
        const [seatX, seatZ] = seats[seat];
        guest.position.set(seatX, GUEST_SEAT_HEIGHT, seatZ);
        // Guests face the middle of their table.
        guest.rotation.y = Math.atan2(-seatX, -seatZ);
        guest.userData.restY = GUEST_SEAT_HEIGHT;
        guests.push(guest);
        set.add(guest);
      });
      set.position.set(table.x, 0, table.z);
      set.scale.setScalar(SET_SCALE[table.model] ?? DINING_SCALE);
      solid.add(set);
    }
    for (const extra of plan.extras ?? []) {
      const item = decoration(extra.model);
      if (!item) continue;
      item.position.set(extra.x, 0, extra.z);
      item.rotation.y = extra.turn ?? 0;
      item.scale.setScalar(extra.scale ?? 1);
      solid.add(item);
    }
    // A low wall down each side frames the kitchen without hiding anything from the camera.
    if (plan.halfWall) {
      for (let z = 1; z < height; z += 2) {
        for (const x of [-0.42, width + 0.42]) {
          const wall = decoration(plan.halfWall);
          if (!wall) continue;
          wall.position.set(x, 0, Math.min(z, height - 1));
          wall.rotation.y = Math.PI / 2;
          wall.scale.set(0.96, 0.7, 1);
          solid.add(wall);
        }
      }
    }
    for (const spot of plan.plants) {
      const plant = decoration(spot.model);
      if (!plant) continue;
      plant.position.set(spot.x, 0, spot.z);
      solid.add(plant);
    }
    // Two warm lights hang over the dining room so the tables are not left in the kitchen's shadow.
    // At night the lantern posts and stall bulbs light the room instead.
    if (!plan.night) {
      for (const x of [-plan.margin / 2, width + plan.margin / 2]) {
        const glow = new THREE.PointLight(0xffc885, 9, 10, 2);
        glow.position.set(x, 2.8, height / 2);
        room.add(glow);
      }
    }
    for (const extra of plan.night ? (plan.extras ?? []) : []) {
      const reach = extra.model === "lantern_post" ? 0.42 * Math.cos(extra.turn ?? 0) : 0;
      if (extra.model === "lantern_post" || extra.model === "market_stall") {
        const glow = new THREE.PointLight(0xffa860, extra.model === "market_stall" ? 7 : 6, 7, 1.6);
        glow.position.set(extra.x + reach, extra.model === "market_stall" ? 1.9 : 2.1, extra.z + (extra.model === "market_stall" ? 0.4 : 0));
        room.add(glow);
      }
    }
  } else if (!sea) {
    // Without a restaurant plan the back wall is a row of 2-tile KayKit panels, two with windows.
    const panels = Math.ceil(width / 2);
    for (let i = 0; i < panels; i++) {
      const x = width / 2 + (i - (panels - 1) / 2) * 2;
      const windowed = i === 1 || i === panels - 2;
      solid.add(prop(windowed ? "wall_window_open" : "wall", x, 0, -0.13));
      if (!windowed && i % 2 === 0) solid.add(prop("shelf_papertowel_decorated", x, 1.5, -0.005));
    }
  }
  room.userData.guests = guests;
  if (street) room.userData.street = street.view;
  if (sea) room.userData.sea = sea.view;

  // Pendant lamps hang in front of the wall and pool warm light on the back counters.
  const shade = new THREE.MeshStandardMaterial({
    color: 0xf2b84b,
    emissive: 0xffc46b,
    emissiveIntensity: 0.9,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  for (const fraction of [0.14, 0.5, 0.86]) {
    const x = width * fraction;
    solid.add(
      mesh(cylinder(0.012, 0.012, 0.7, 6), mat(COLORS.darkSteel, 0.5), x, 2.4, 0.5),
      mesh(new THREE.ConeGeometry(0.22, 0.24, 20, 1, true), shade, x, 1.97, 0.5),
      mesh(ball(0.07, 12), new THREE.MeshBasicMaterial({ color: 0xfff1cf }), x, 1.89, 0.5),
    );
    const lamp = new THREE.PointLight(0xffc885, 6, 7, 2);
    lamp.position.set(x, 1.75, 0.85);
    room.add(lamp);
  }
  room.add(shadowed(solid));
  return room;
}

// ---------------------------------------------------------------- labels

const labelTextures = new Map<string, THREE.CanvasTexture>();

export function labelTexture(text: string, background: string): THREE.CanvasTexture {
  const cached = labelTextures.get(text + background);
  if (cached) return cached;
  const texture = canvasTexture(256, 80, (ctx) => {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 72, 36);
    ctx.fill();
    ctx.fillStyle = "#fff6e6";
    ctx.font = "900 40px Nunito, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 43);
  });
  labelTextures.set(text + background, texture);
  return texture;
}

// A small always-facing name tag, drawn over everything so it never hides behind props.
export function createLabel(text: string, background = LABEL_DARK): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTexture(text, background), depthTest: false, transparent: true, fog: false }),
  );
  sprite.scale.set(1.28, 0.4, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// ---------------------------------------------------------------- food and crockery

// One KayKit part of an item, positioned in the pack's own units.
function part(name: ModelName, x = 0, y = 0, z = 0, turn = 0, scale = 1, ruined = false): THREE.Mesh {
  const result = model(name, ruined);
  result.position.set(x, y, z);
  result.rotation.y = turn;
  result.scale.setScalar(scale);
  return result;
}

// Ingredients drawn with KayKit models; the rest are built in code (the chicken here, the others in food.ts).
type Veg = "tomato" | "lettuce" | "onion";
const WHOLE: Record<Veg, ModelName> = {
  tomato: "food_ingredient_tomato",
  lettuce: "food_ingredient_lettuce",
  onion: "food_ingredient_onion",
};
const CHOPPED: Record<Veg, ModelName> = {
  tomato: "food_ingredient_tomato_slices",
  lettuce: "food_ingredient_lettuce_chopped",
  onion: "food_ingredient_onion_chopped",
};
const CRATES: Record<Veg, ModelName> = {
  tomato: "crate_tomatoes",
  lettuce: "crate_lettuce",
  onion: "crate_onions",
};

type RoastStage = "raw" | "roast" | "burnt";
const roastStage = (cook: number): RoastStage => (cook >= BURN_AT ? "burnt" : cook >= 1 ? "roast" : "raw");
const CHICKEN_SKIN: Record<RoastStage, number> = { raw: 0xf3c0ad, roast: 0xc8752e, burnt: 0x2e2522 };

// Which look a code-built ingredient needs.
const foodStage = (item: Extract<Item, { type: "ingredient" }>): Stage => {
  const cook = item.cook ?? 0;
  return cook >= BURN_AT ? "burnt" : cook >= 1 ? "cooked" : item.chop >= 1 ? "chopped" : "whole";
};

// A whole chicken in game units, resting on its base: plump body, two drumsticks with bone tips.
export function createChicken(stage: RoastStage): THREE.Group {
  const chicken = new THREE.Group();
  const skin = mat(CHICKEN_SKIN[stage], stage === "roast" ? 0.38 : 0.6);
  const bone = mat(0xfff3e0, 0.6);
  const body = mesh(ball(0.15, 18), skin, 0, 0.1, 0);
  body.scale.set(1.15, 0.72, 0.95);
  chicken.add(body);
  for (const side of [-1, 1]) {
    const thigh = mesh(ball(0.075, 12), skin, side * 0.085, 0.09, 0.11);
    thigh.scale.set(0.9, 0.85, 1.45);
    const shank = mesh(cylinder(0.016, 0.016, 0.1, 8), bone, side * 0.095, 0.13, 0.215);
    shank.rotation.x = 1.15;
    const knob = mesh(ball(0.027, 10), bone, side * 0.095, 0.155, 0.26);
    const wing = mesh(ball(0.05, 10), skin, side * 0.16, 0.1, -0.05);
    wing.scale.set(0.7, 0.6, 1.3);
    chicken.add(thigh, shank, knob, wing);
  }
  if (stage === "roast") {
    // Charred grill marks across the golden skin.
    for (const offset of [-0.07, 0, 0.07]) {
      const mark = mesh(box(0.2, 0.012, 0.022), mat(0x6a3416, 0.5), 0, 0.205, offset);
      mark.rotation.y = 0.5;
      chicken.add(mark);
    }
  }
  return chicken;
}

// A cool box of raw chickens on crushed ice, the chicken's version of a veg crate.
function createChickenCrate(): THREE.Group {
  const crate = new THREE.Group();
  crate.add(
    mesh(rounded(0.78, 0.26, 0.66, 0.05), mat(0x3d8fe4, 0.45), 0, 0.13, 0),
    mesh(rounded(0.8, 0.05, 0.68, 0.025), mat(0xfdfdfd, 0.5), 0, 0.26, 0),
    mesh(box(0.66, 0.02, 0.54), mat(0xd9f1ff, 0.2), 0, 0.27, 0),
    mesh(box(0.1, 0.05, 0.05), mat(0xfdfdfd, 0.5), -0.41, 0.18, 0),
    mesh(box(0.1, 0.05, 0.05), mat(0xfdfdfd, 0.5), 0.41, 0.18, 0),
  );
  for (const [x, z, turn] of [[-0.17, -0.08, 0.4], [0.17, -0.06, -0.5], [0, 0.14, 2.8]] as const) {
    const chicken = createChicken("raw");
    chicken.position.set(x, 0.25, z);
    chicken.rotation.y = turn;
    chicken.scale.setScalar(0.85);
    crate.add(chicken);
  }
  return crate;
}

// Builds an item with its origin at the base so it can sit on any surface.
export function createItem(item: Item): THREE.Group {
  const group = new THREE.Group();
  const parts = new THREE.Group();
  parts.scale.setScalar(MODEL_SCALE);
  group.add(parts);

  if (item.type === "ingredient" && item.kind === "chicken") {
    group.add(createChicken(roastStage(item.cook ?? 0)));
  } else if (item.type === "ingredient" && CODE_FOOD.includes(item.kind)) {
    group.add(createFood(item.kind, foodStage(item)));
  } else if (item.type === "ingredient") {
    const kind = item.kind as Veg;
    if (!isChopped(item)) parts.add(part(WHOLE[kind]));
    // The chopped lettuce model is off-centre, so it is nudged back over its tile.
    else if (kind === "lettuce") parts.add(part(CHOPPED.lettuce, -0.3, 0, 0, 0, 0.9));
    else parts.add(part(CHOPPED[kind]));
  } else if (item.type === "plate") {
    if (item.contents.includes("tomato_soup")) {
      parts.add(part("food_stew"));
    } else {
      parts.add(part("plate"));
      if (item.contents.includes("onion_soup") || item.contents.includes("clam_soup")) parts.add(part("stew_bowl", 0, -0.04, 0));
      // A burger is built in code; its lettuce and tomato go inside the bun rather than loose on the plate.
      const burger = item.contents.includes("bun") || item.contents.includes("meat");
      const hasLettuce = !burger && item.contents.includes("lettuce");
      if (hasLettuce) parts.add(part("food_ingredient_lettuce_slice", 0, 0.1, 0));
      if (!burger && item.contents.includes("tomato")) {
        const y = hasLettuce ? 0.15 : 0.08;
        parts.add(
          part("food_ingredient_tomato_slice", -0.12, y, 0.05, 0.4, 0.62),
          part("food_ingredient_tomato_slice", 0.14, y + 0.02, -0.06, 1.7, 0.62),
        );
      }
      if (item.contents.includes("onion")) parts.add(part(CHOPPED.onion, 0, hasLettuce ? 0.15 : 0.08, 0, 0.8, 0.5));
      if (burger) group.add(createBurger(item.contents));
      if (item.contents.includes("seaweed")) group.add(put(createFood("seaweed", "chopped"), -0.05, 0.03, 0));
      if (item.contents.includes("fish")) group.add(put(createFood("fish", "cooked"), 0, 0.03, 0));
      if (item.contents.includes("roast_chicken")) {
        // Served on its own the chicken sits in the middle; in a salad it shares the plate with the leaves.
        const chicken = createChicken("roast");
        const alone = item.contents.length === 1;
        chicken.scale.setScalar(alone ? 0.95 : 0.7);
        chicken.position.set(alone ? 0 : 0.06, alone ? 0.025 : 0.07, alone ? 0 : 0.04);
        chicken.rotation.y = 0.6;
        group.add(chicken);
      }
    }
  } else if (item.type === "dirty") {
    parts.add(part("plate_dirty"));
  } else if (item.type === "extinguisher") {
    group.add(createExtinguisher());
  } else {
    const ruined = item.cook >= BURN_AT;
    const full = item.contents >= POT_CAPACITY;
    parts.add(part(!full ? "pot_A" : item.kind === "tomato" ? "pot_A_stew" : "pot_B_stew", 0, 0, 0, 0, 1, ruined));
    if (!full && item.kind) {
      // Until the pot is full the chopped pieces lie inside it, so the count is visible.
      for (let i = 0; i < item.contents; i++) {
        const angle = i * 2.4 + 0.5;
        const x = Math.cos(angle) * 0.18;
        const z = Math.sin(angle) * 0.18;
        if (item.kind === "tomato") parts.add(part("food_ingredient_tomato_slice", x, 0.1 + i * 0.04, z, angle, 0.6));
        else if (CODE_FOOD.includes(item.kind)) {
          const piece = createFood(item.kind, "chopped");
          piece.position.set(x, 0.1, z);
          piece.scale.setScalar(1.3);
          parts.add(piece);
        } else parts.add(part(CHOPPED[item.kind as Veg], x, 0.08, z, angle, 0.38));
      }
    } else if (full && !ruined) {
      // Bubbles are animated by the scene while the pot is on a lit hob.
      const bubbles: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = i * 1.9;
        const reach = 0.1 + (i % 3) * 0.1;
        const bubble = mesh(ball(0.06, 10), mat(0xe8b08a, 0.3), Math.cos(angle) * reach, 0.5, Math.sin(angle) * reach);
        bubble.visible = false;
        bubbles.push(bubble);
        parts.add(bubble);
      }
      group.userData.bubbles = bubbles;
    }
  }
  return shadowed(group);
}

// Changes only when the item needs a different mesh, not on every progress tick.
export function itemSignature(item: Item): string {
  if (item.type === "ingredient" && isRoastable(item.kind)) return `i:${item.kind}:${roastStage(item.cook ?? 0)}`;
  if (item.type === "ingredient" && CODE_FOOD.includes(item.kind)) return `i:${item.kind}:${foodStage(item)}`;
  if (item.type === "ingredient") return `i:${item.kind}:${isChopped(item)}`;
  if (item.type === "plate") return `p:${item.contents.join("+")}`;
  if (item.type === "dirty") return "d";
  if (item.type === "extinguisher") return "x";
  const stage = item.cook >= BURN_AT ? "burnt" : item.cook >= 1 ? "cooked" : "raw";
  return `k:${item.kind}:${item.contents}:${stage}`;
}

// Fraction and colour of the progress bar an item should show, if any.
export function itemProgress(item: Item, onHob = true): { value: number; colour: number } | null {
  // Anything that has started to heat shows its cooking bar; before that, chopping shows.
  if (item.type === "ingredient" && (item.cook ?? 0) > 0) return cookProgress(item.cook ?? 0, onHob);
  if (item.type === "ingredient") {
    return item.chop > 0 && item.chop < 1 ? { value: item.chop, colour: COLORS.barChop } : null;
  }
  if (item.type !== "pot" || item.contents < POT_CAPACITY) return null;
  return cookProgress(item.cook, onHob);
}

// The bar for anything cooking on a heat: filling while it cooks, draining while it is safe, red towards a fire.
function cookProgress(cook: number, onHeat: boolean): { value: number; colour: number } | null {
  if (cook <= 0) return null;
  if (cook < 1) return { value: cook, colour: COLORS.barCook };
  // Past burnt, the bar fills red towards the moment the hob catches fire.
  if (cook > BURN_AT && onHeat) return { value: (cook - BURN_AT) / (FIRE_AT - BURN_AT), colour: COLORS.barBurn };
  if (!potIsCooked(cook)) return null;
  // Once cooked the bar drains instead, showing how long is left before it burns.
  const safe = 1 - (cook - 1) / (BURN_AT - 1);
  return { value: safe, colour: safe > 0.4 ? COLORS.barChop : COLORS.barBurn };
}

export interface PotStatus {
  badge: string | null;
  badgeColour: string;
  steam: "none" | "light" | "dark";
  ready: boolean;
  cooking: boolean;
}

// What a pot should announce above itself: how full it is, or how its soup is doing.
export function potStatus(item: Item, onHob = true): PotStatus | null {
  const roasting = item.type === "ingredient" && (item.cook ?? 0) > 0;
  if (!roasting && (item.type !== "pot" || item.contents === 0)) return null;
  const cook = item.type === "pot" || item.type === "ingredient" ? (item.cook ?? 0) : 0;
  const status: PotStatus = { badge: null, badgeColour: LABEL_DARK, steam: "none", ready: false, cooking: false };
  if (item.type === "pot" && (item.contents < POT_CAPACITY || item.cook === 0)) {
    status.badge = `${item.contents}/${POT_CAPACITY}`;
  } else if (cook > BURN_AT && onHob) {
    // Only kitchens that can burn let a pot heat past burnt.
    Object.assign(status, { badge: "FIRE RISK!", badgeColour: "#d23c2c", steam: "dark", ready: true });
  } else if (cook >= BURN_AT) {
    Object.assign(status, { badge: "BURNT", badgeColour: "#d23c2c", steam: "dark" });
  } else if (cook >= 1) {
    Object.assign(status, { badge: "READY!", badgeColour: "#2f9e5b", steam: "light", ready: true, cooking: true });
  } else {
    Object.assign(status, { steam: "light", cooking: true });
  }
  return status;
}

// ---------------------------------------------------------------- stations

const STATION_LABELS: Partial<Record<TileKind, string>> = {
  board: "CHOP",
  stove: "COOK",
  plates: "PLATES",
  serve: "SERVE",
  return: "DIRTY",
  wash: "WASH",
  extinguisher: "FIRE EXT.",
  grill: "GRILL",
  trash: "TRASH",
};

const servePadTexture = () =>
  canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#45b7a0";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 3, 128);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 12;
    ctx.lineCap = ctx.lineJoin = "round";
    // Chevrons point out of the kitchen, towards the customers.
    for (const y of [36, 70]) {
      ctx.beginPath();
      ctx.moveTo(36, y);
      ctx.lineTo(64, y + 26);
      ctx.lineTo(92, y);
      ctx.stroke();
    }
  });

const hazardTexture = () =>
  canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#f2c230";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#25212b";
    ctx.lineWidth = 9;
    for (let x = -64; x < 128; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 64, 0);
      ctx.stroke();
    }
  });

export interface Stations {
  group: THREE.Group;
  // Ring of flames per stove tile, shown while a pot cooks on it.
  flames: Map<number, THREE.Group>;
  // Plates drawn one by one so the scene can show exactly as many as the game says are there.
  plateStack: THREE.Object3D[];
  dirtyPile: THREE.Object3D[];
  sinkDirty: THREE.Object3D[];
  sinkClean: THREE.Object3D[];
  washTile: number | null;
  // Middle of the serving windows, where score pop-ups appear.
  serveCentre: THREE.Vector3;
  // Shared belt texture, scrolled each frame.
  beltMap: THREE.CanvasTexture;
}

// Draws every solid tile as a KayKit counter or stove, then dresses each station on top.
export function createStations(level: Level): Stations {
  const group = new THREE.Group();
  const labels = new THREE.Group();
  const unshadowed = new THREE.Group();
  const flames = new Map<number, THREE.Group>();
  const plateStack: THREE.Object3D[] = [];
  const dirtyPile: THREE.Object3D[] = [];
  const sinkDirty: THREE.Object3D[] = [];
  const sinkClean: THREE.Object3D[] = [];
  let washTile: number | null = null;
  // A pile of plates on a station, hidden until the scene reveals as many as are really there.
  const pile = (into: THREE.Object3D[], name: ModelName, count: number, x: number, y: number, z: number, scale: number) => {
    for (let i = 0; i < count; i++) {
      const plate = prop(name, x, y + i * 0.09 * scale, z, i * 0.7, scale);
      plate.visible = false;
      into.push(plate);
      group.add(plate);
    }
  };
  const serveCentre = new THREE.Vector3();
  let serveTiles = 0;
  let plants = 0;
  const counters: Array<{ x: number; z: number; turn: number }> = [];
  const isFloor = (tx: number, tz: number) =>
    tx >= 0 && tz >= 0 && tx < level.width && tz < level.height && level.tiles[tz * level.width + tx].kind === "floor";

  const servePad = new THREE.MeshStandardMaterial({
    map: servePadTexture(),
    emissive: COLORS.serve,
    emissiveIntensity: 0.2,
    roughness: 0.5,
  });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 });
  const beltMap = beltTexture();
  const beltMaterial = new THREE.MeshStandardMaterial({ map: beltMap, roughness: 0.85 });
  const coalMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2224, emissive: 0xff4a12, emissiveIntensity: 0.35, roughness: 1 });
  const emberMaterial = new THREE.MeshStandardMaterial({ color: 0x5a2010, emissive: 0xff6a1a, emissiveIntensity: 1.6, roughness: 1 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: COLORS.flame });

  level.tiles.forEach((tile, index) => {
    if (tile.kind === "floor") return;
    const tx = index % level.width;
    const tz = Math.floor(index / level.width);
    const x = tx + 0.5;
    const z = tz + 0.5;
    const top = WORKTOP_Y;

    // Cabinet fronts face the floor next to them; corner pieces face into the kitchen.
    const side = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ].find(([dx, dz]) => isFloor(tx + dx, tz + dz));
    const inward = tz === 0 ? [0, 1] : tz === level.height - 1 ? [0, -1] : tx === 0 ? [1, 0] : [-1, 0];
    const [faceX, faceZ] = side ?? inward;
    const turn = Math.atan2(faceX, faceZ);
    // A sink or fridge stands in for the whole cabinet; if its model is missing a plain counter fills the slot.
    const fixture =
      tile.kind === "sink" ? decoration(level.decor.sink) : tile.kind === "fridge" ? decoration(level.decor.fridge) : null;
    if (fixture) {
      fixture.position.set(x, 0, z);
      fixture.rotation.y = turn;
      // The props are authored at their own size: the sink is squashed to one tile at counter height.
      if (tile.kind === "sink") fixture.scale.set(0.7, 0.53, 1.18);
      else fixture.scale.setScalar(1.2);
      group.add(fixture);
    } else if (tile.kind === "stove") {
      group.add(prop("stove_single", x, 0, z, turn));
    } else if (tile.kind === "wash") {
      group.add(prop("kitchencounter_sink", x, 0, z, turn));
    } else {
      counters.push({ x, z, turn });
    }
    if (tile.kind === "plant") {
      // Under the sea the plant spots hold potted coral instead of the town's house plants.
      const plant = level.theme === "sea" ? createCoralPot(plants++) : decoration(level.decor.plants[plants++ % level.decor.plants.length]);
      if (plant) {
        plant.position.set(x, top, z);
        plant.rotation.y = plants * 1.7;
        plant.scale.setScalar(0.6);
        group.add(plant);
      }
    }

    // One tag per run of identical stations, pushed outwards so it clears the worktop.
    const text = STATION_LABELS[tile.kind];
    const repeats = level.tiles[index - 1]?.kind === tile.kind || level.tiles[index - level.width]?.kind === tile.kind;
    if (text && !repeats) {
      const label = createLabel(text);
      const outX = tx === 0 ? -1 : tx === level.width - 1 ? 1 : 0;
      const outZ = tz === 0 ? -1 : tz === level.height - 1 ? 1 : 0;
      const run = level.tiles[index + 1]?.kind === tile.kind ? 0.5 : 0;
      label.position.set(x + run + outX * 1.2, top + (outZ > 0 ? -0.2 : 0.45), z + outZ * 0.85);
      labels.add(label);
    }

    if (tile.kind === "crate" && tile.dispenses === "chicken") {
      group.add(put(createChickenCrate(), x, top, z, turn));
    } else if (tile.kind === "crate" && tile.dispenses && CODE_FOOD.includes(tile.dispenses)) {
      group.add(put(createCrate(tile.dispenses), x, top, z, turn));
    } else if (tile.kind === "crate" && tile.dispenses) {
      group.add(prop(CRATES[tile.dispenses as Veg], x, top, z, turn, 0.43));
    } else if (tile.kind === "grill") {
      // A charcoal grill set into the worktop: steel tray, a bed of embers and a grate across it.
      group.add(
        mesh(rounded(0.9, 0.1, 0.9, 0.03), mat(COLORS.darkSteel, 0.45, 0.6), x, top + 0.05, z),
        mesh(box(0.74, 0.02, 0.74), mat(0x17141a, 0.9), x, top + 0.095, z),
      );
      for (let i = 0; i < 14; i++) {
        const coal = mesh(ball(0.06 + noise(index + i) * 0.03, 7), i % 3 ? coalMaterial : emberMaterial, 0, 0, 0);
        coal.position.set(x + (noise(index * 3 + i) - 0.5) * 0.6, top + 0.1, z + (noise(index * 7 + i) - 0.5) * 0.6);
        coal.scale.y = 0.6;
        group.add(coal);
      }
      for (let bar = -3; bar <= 3; bar++) {
        const rod = mesh(cylinder(0.012, 0.012, 0.8, 6), mat(COLORS.steel, 0.3, 0.8), x + bar * 0.11, top + 0.115, z);
        rod.rotation.x = Math.PI / 2;
        group.add(rod);
      }
      // Flickering tongues of flame, shown by the scene while something is on the grill.
      const fire = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        fire.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 5), flameMaterial, Math.cos(angle) * 0.22, 0.06, Math.sin(angle) * 0.22));
      }
      fire.position.set(x, top + 0.08, z);
      fire.visible = false;
      flames.set(index, fire);
      unshadowed.add(fire);
    } else if (tile.kind === "belt" && tile.dir) {
      // Rubber belt with chevrons that scroll the way it runs, framed by steel rails where it has no neighbour.
      const [dx, dz] = tile.dir;
      const surface = new THREE.Group();
      const belt = mesh(new THREE.PlaneGeometry(0.98, 0.98), beltMaterial, 0, 0, 0);
      belt.rotation.x = -Math.PI / 2;
      surface.add(belt);
      surface.position.set(x, top + 0.035, z);
      surface.rotation.y = Math.atan2(-dx, -dz);
      group.add(mesh(box(1, 0.03, 1), mat(0x2a2630, 0.7), x, top + 0.015, z), surface);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (level.tiles[(tz + sz) * level.width + tx + sx]?.kind === "belt" && tx + sx >= 0 && tx + sx < level.width) continue;
        const along = sx === 0;
        group.add(
          mesh(box(along ? 1 : 0.05, 0.07, along ? 0.05 : 1), mat(COLORS.steel, 0.35, 0.7), x + sx * 0.48, top + 0.05, z + sz * 0.48),
        );
      }
    } else if (tile.kind === "board") {
      group.add(prop("cuttingboard", x, top, z, turn));
    } else if (tile.kind === "plates" && level.plates) {
      // A kitchen with a limited number of plates shows the real stack instead of a full rack.
      group.add(mesh(rounded(0.86, 0.04, 0.86, 0.02), mat(COLORS.tray, 0.5), x, top + 0.02, z));
      pile(plateStack, "plate", level.plates, x, top + 0.04, z, MODEL_SCALE);
    } else if (tile.kind === "return") {
      group.add(mesh(rounded(0.86, 0.04, 0.86, 0.02), mat(0x8a5fa8, 0.5), x, top + 0.02, z));
      pile(dirtyPile, "plate_dirty", level.plates ?? 0, x, top + 0.04, z, MODEL_SCALE);
    } else if (tile.kind === "wash") {
      washTile = index;
      // Dirty plates wait on one side of the basin and clean ones stack up on the other.
      const sideX = Math.cos(turn) * 0.3;
      const sideZ = -Math.sin(turn) * 0.3;
      pile(sinkDirty, "plate_dirty", level.plates ?? 0, x - sideX, top + 0.02, z - sideZ, 0.3);
      pile(sinkClean, "plate", level.plates ?? 0, x + sideX, top + 0.02, z + sideZ, 0.3);
    } else if (tile.kind === "extinguisher") {
      // A red mat with white corner marks, so the extinguisher's home is easy to spot even when it is away.
      group.add(mesh(rounded(0.86, 0.04, 0.86, 0.02), mat(0xd23c2c, 0.5), x, top + 0.02, z));
      group.add(mesh(cylinder(0.2, 0.2, 0.045, 20), mat(0xfff3d6, 0.6), x, top + 0.022, z));
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        group.add(mesh(box(0.14, 0.045, 0.05), mat(0xfff3d6, 0.6), x + cx * 0.3, top + 0.022, z + cz * 0.36));
        group.add(mesh(box(0.05, 0.045, 0.14), mat(0xfff3d6, 0.6), x + cx * 0.36, top + 0.022, z + cz * 0.3));
      }
    } else if (tile.kind === "plates") {
      group.add(prop("dishrack_plates", x, top, z, turn + Math.PI / 2));
    } else if (tile.kind === "trash") {
      // A chute cut into the worktop, framed with hazard stripes and half covered by a flap.
      const hinge = mesh(cylinder(0.02, 0.02, 0.6, 8), mat(COLORS.steel, 0.3, 0.8), x, top + 0.1, z - 0.28);
      hinge.rotation.z = Math.PI / 2;
      group.add(
        mesh(rounded(0.8, 0.05, 0.8, 0.02), hazard, x, top + 0.025, z),
        mesh(box(0.58, 0.02, 0.58), mat(0x0f0d14, 1), x, top + 0.052, z),
        mesh(box(0.56, 0.03, 0.26), mat(COLORS.darkSteel, 0.4, 0.6), x, top + 0.085, z - 0.15),
        hinge,
      );
    } else if (tile.kind === "stove") {
      const fire = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        fire.add(mesh(new THREE.ConeGeometry(0.035, 0.14, 5), flameMaterial, Math.cos(angle) * 0.26, 0.07, Math.sin(angle) * 0.26));
      }
      fire.position.set(x, top + 0.03, z);
      fire.visible = false;
      flames.set(index, fire);
      unshadowed.add(fire);
    } else if (tile.kind === "serve") {
      group.add(mesh(box(1, 0.05, 1), servePad, x, top + 0.025, z));
      serveCentre.add(new THREE.Vector3(x, top, z));
      serveTiles += 1;
      // The first window of a run gets a brass service bell on its corner.
      if (level.tiles[index - 1]?.kind !== "serve") {
        group.add(
          mesh(cylinder(0.11, 0.11, 0.02, 18), mat(COLORS.darkSteel, 0.5, 0.5), x - 0.33, top + 0.06, z - 0.33),
          mesh(
            new THREE.SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
            mat(COLORS.brass, 0.25, 0.9),
            x - 0.33,
            top + 0.07,
            z - 0.33,
          ),
          mesh(ball(0.022, 8), mat(COLORS.brass, 0.25, 0.9), x - 0.33, top + 0.165, z - 0.33),
        );
      }
    }
  });
  if (serveTiles > 0) serveCentre.divideScalar(serveTiles);

  // Every plain counter is one instance of the same model, turned to face its floor side; sea kitchens use their
  // own code-built cabinet, which comes as a few meshes that are each instanced the same way.
  const matrix = new THREE.Matrix4();
  const turned = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sea = level.theme === "sea";
  const size = sea ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  const parts = sea
    ? (createSeaCounter().children as THREE.Mesh[]).map((part) => [part.geometry, part.material as THREE.Material] as const)
    : [[modelGeometry("kitchencounter_straight_A"), modelMaterial()] as const];
  for (const [geometry, material] of parts) {
    const instanced = new THREE.InstancedMesh(geometry, material, counters.length);
    counters.forEach(({ x, z, turn }, i) => {
      instanced.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 0, z), turned.setFromAxisAngle(up, turn), size));
    });
    group.add(instanced);
  }
  shadowed(group);
  group.add(labels, unshadowed);
  return { group, flames, serveCentre, plateStack, dirtyPile, sinkDirty, sinkClean, washTile, beltMap };
}

// Every belt shares one texture, so scrolling it once moves them all.
export function animateBelts(stations: Stations, dt: number): void {
  stations.beltMap.offset.y = (stations.beltMap.offset.y - dt / BELT_SECONDS) % 1;
}

// Rubber with yellow chevrons pointing up the texture, which the belts turn to face the way they run.
const beltTexture = () => {
  const texture = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#2f2b38";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 3);
    ctx.strokeStyle = "#f2c230";
    ctx.lineWidth = 7;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(16, 44);
    ctx.lineTo(32, 26);
    ctx.lineTo(48, 44);
    ctx.stroke();
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

// Positions and turns an object, returning it for chaining.
function put<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, turn = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = turn;
  return object;
}

// ---------------------------------------------------------------- effects

export interface ProgressBar {
  group: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

export function createProgressBar(): ProgressBar {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH + 0.08, 0.18),
    new THREE.MeshBasicMaterial({ color: COLORS.barBack, depthTest: false, fog: false }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH, 0.1),
    new THREE.MeshBasicMaterial({ depthTest: false, fog: false }),
  );
  back.renderOrder = 10;
  fill.renderOrder = 11;
  // Tilted back so it faces the fixed camera.
  group.rotation.x = -0.95;
  group.add(back, fill);
  return { group, fill };
}

const STEAM_PUFFS = 5;

export function createSteam(): THREE.Group {
  const steam = new THREE.Group();
  for (let i = 0; i < STEAM_PUFFS; i++) {
    steam.add(new THREE.Mesh(ball(0.11, 12), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
  }
  return steam;
}

// Each puff loops upwards, growing and fading, offset so the column looks continuous.
export function animateSteam(steam: THREE.Group, time: number, dark: boolean): void {
  steam.children.forEach((child, i) => {
    const puff = child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    const phase = (time * 0.6 + i / STEAM_PUFFS) % 1;
    puff.position.set(Math.sin(i * 2.1 + time * 1.3) * 0.12, 0.34 + phase * 1.15, Math.cos(i * 1.7 + time) * 0.08);
    puff.scale.setScalar(0.5 + phase * 1.5);
    puff.material.opacity = Math.sin(phase * Math.PI) * (dark ? 0.85 : 0.8);
    // Light steam is tinted blue-grey so it still shows against pale surfaces.
    puff.material.color.setHex(dark ? 0x26222b : 0xd6e2f2);
  });
}

function squareRing(outer: number, inner: number, colour: number, opacity: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer).lineTo(outer, -outer).lineTo(outer, outer).lineTo(-outer, outer).closePath();
  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner).lineTo(-inner, inner).lineTo(inner, inner).lineTo(inner, -inner).closePath();
  shape.holes.push(hole);
  const ring = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// Marks the station the local chef will use: a dark-edged orange frame plus a bobbing arrow.
export function createTargetMarker(): { group: THREE.Group; frame: THREE.Group; arrow: THREE.Group } {
  const frame = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.84),
    new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  fill.rotation.x = -Math.PI / 2;
  const bright = squareRing(0.53, 0.43, COLORS.marker, 1);
  bright.position.y = 0.004;
  frame.add(fill, squareRing(0.56, 0.4, COLORS.markerEdge, 0.9), bright);

  const arrow = new THREE.Group();
  const edge = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.36, 4),
    new THREE.MeshBasicMaterial({ color: COLORS.markerEdge, side: THREE.BackSide }),
  );
  arrow.add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 4), new THREE.MeshBasicMaterial({ color: COLORS.marker })), edge);
  arrow.rotation.x = Math.PI;

  const group = new THREE.Group();
  group.add(frame, arrow);
  group.visible = false;
  return { group, frame, arrow };
}

// Outlines a station the mouse points at but the chef cannot reach, with dark-edged cyan corner brackets.
export function createPointerMarker(): THREE.Group {
  const group = new THREE.Group();
  const corners = (colour: number, length: number, width: number, lift: number) => {
    const material = new THREE.MeshBasicMaterial({ color: colour, depthWrite: false, fog: false });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        group.add(
          mesh(box(length, 0.012, width), material, sx * (0.52 - length / 2), lift, sz * 0.52),
          mesh(box(width, 0.012, length), material, sx * 0.52, lift, sz * (0.52 - length / 2)),
        );
      }
    }
  };
  corners(COLORS.pointerEdge, 0.4, 0.2, 0);
  corners(COLORS.pointer, 0.36, 0.11, 0.006);
  group.visible = false;
  return group;
}
