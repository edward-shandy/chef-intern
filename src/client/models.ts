import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Level, TileKind } from "../shared/level";
import type { Ingredient } from "../shared/recipes";
import {
  BURN_AT,
  isChopped,
  POT_CAPACITY,
  potIsCooked,
  type Item,
} from "../shared/sim";
import { decoration, model, MODEL_SCALE, modelGeometry, modelMaterial, type ModelName } from "./assets";

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
export const restLift = (kind: TileKind): number => (kind === "board" ? 0.075 : kind === "stove" ? 0.105 : 0);

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

const rounded = (width: number, height: number, depth: number, radius: number) =>
  new RoundedBoxGeometry(width, height, depth, 2, radius);
const box = (width: number, height: number, depth: number) => new THREE.BoxGeometry(width, height, depth);
const cylinder = (top: number, bottom: number, height: number, segments = 24) =>
  new THREE.CylinderGeometry(top, bottom, height, segments);
const ball = (radius: number, detail = 16) => new THREE.SphereGeometry(radius, detail, Math.max(8, detail - 4));

// Stable pseudo-random number in 0..1, so decoration looks the same on every client and reload.
const noise = (seed: number): number => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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
        ctx.fillStyle = "#8fa3a8";
        ctx.fillRect(x, z, size, size);
        ctx.fillStyle = (tx + tz) % 2 === 0 ? "#f4ecdc" : "#bcd0d2";
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

// Floor, a wooden deck around it, and a dressed back wall with lamps.
export function createRoom(level: Level, anisotropy: number): THREE.Group {
  const room = new THREE.Group();
  const { width, height } = level;

  const floor = mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: floorTexture(level, anisotropy), roughness: 0.5 }),
    width / 2,
    0,
    height / 2,
  );
  floor.rotation.x = -Math.PI / 2;
  const deckMap = woodTexture("#6a4a3c", "#2a1a14", 4, 40);
  deckMap.repeat.set(26, 26);
  deckMap.anisotropy = anisotropy;
  const deck = mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.9 }),
    width / 2,
    -0.02,
    height / 2,
  );
  deck.rotation.x = -Math.PI / 2;
  floor.receiveShadow = deck.receiveShadow = true;
  room.add(deck, floor);

  const solid = new THREE.Group();
  // The back wall is a row of 2-tile KayKit panels, two with windows and the rest with a dressed shelf.
  const panels = Math.ceil(width / 2);
  for (let i = 0; i < panels; i++) {
    const x = width / 2 + (i - (panels - 1) / 2) * 2;
    const windowed = i === 1 || i === panels - 2;
    solid.add(prop(windowed ? "wall_window_open" : "wall", x, 0, -0.13));
    if (!windowed && i % 2 === 0) solid.add(prop("shelf_papertowel_decorated", x, 1.5, -0.005));
  }

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

const WHOLE: Record<Ingredient, ModelName> = {
  tomato: "food_ingredient_tomato",
  lettuce: "food_ingredient_lettuce",
  onion: "food_ingredient_onion",
};
const CHOPPED: Record<Ingredient, ModelName> = {
  tomato: "food_ingredient_tomato_slices",
  lettuce: "food_ingredient_lettuce_chopped",
  onion: "food_ingredient_onion_chopped",
};
const CRATES: Record<Ingredient, ModelName> = {
  tomato: "crate_tomatoes",
  lettuce: "crate_lettuce",
  onion: "crate_onions",
};

// Builds an item with its origin at the base so it can sit on any surface.
export function createItem(item: Item): THREE.Group {
  const group = new THREE.Group();
  const parts = new THREE.Group();
  parts.scale.setScalar(MODEL_SCALE);
  group.add(parts);

  if (item.type === "ingredient") {
    if (!isChopped(item)) parts.add(part(WHOLE[item.kind]));
    // The chopped lettuce model is off-centre, so it is nudged back over its tile.
    else if (item.kind === "lettuce") parts.add(part(CHOPPED.lettuce, -0.3, 0, 0, 0, 0.9));
    else parts.add(part(CHOPPED[item.kind]));
  } else if (item.type === "plate") {
    if (item.contents.includes("tomato_soup")) {
      parts.add(part("food_stew"));
    } else {
      parts.add(part("plate"));
      if (item.contents.includes("onion_soup")) parts.add(part("stew_bowl", 0, -0.04, 0));
      const hasLettuce = item.contents.includes("lettuce");
      if (hasLettuce) parts.add(part("food_ingredient_lettuce_slice", 0, 0.1, 0));
      if (item.contents.includes("tomato")) {
        const y = hasLettuce ? 0.15 : 0.08;
        parts.add(
          part("food_ingredient_tomato_slice", -0.12, y, 0.05, 0.4, 0.62),
          part("food_ingredient_tomato_slice", 0.14, y + 0.02, -0.06, 1.7, 0.62),
        );
      }
      if (item.contents.includes("onion")) parts.add(part(CHOPPED.onion, 0, hasLettuce ? 0.15 : 0.08, 0, 0.8, 0.5));
    }
  } else {
    const ruined = item.cook >= BURN_AT;
    const full = item.contents >= POT_CAPACITY;
    parts.add(part(!full ? "pot_A" : item.kind === "onion" ? "pot_B_stew" : "pot_A_stew", 0, 0, 0, 0, 1, ruined));
    if (!full && item.kind) {
      // Until the pot is full the chopped pieces lie inside it, so the count is visible.
      for (let i = 0; i < item.contents; i++) {
        const angle = i * 2.4 + 0.5;
        const x = Math.cos(angle) * 0.18;
        const z = Math.sin(angle) * 0.18;
        if (item.kind === "tomato") parts.add(part("food_ingredient_tomato_slice", x, 0.1 + i * 0.04, z, angle, 0.6));
        else parts.add(part(CHOPPED[item.kind], x, 0.08, z, angle, 0.38));
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
  if (item.type === "ingredient") return `i:${item.kind}:${isChopped(item)}`;
  if (item.type === "plate") return `p:${item.contents.join("+")}`;
  const stage = item.cook >= BURN_AT ? "burnt" : item.cook >= 1 ? "cooked" : "raw";
  return `k:${item.kind}:${item.contents}:${stage}`;
}

// Fraction and colour of the progress bar an item should show, if any.
export function itemProgress(item: Item): { value: number; colour: number } | null {
  if (item.type === "ingredient") {
    return item.chop > 0 && item.chop < 1 ? { value: item.chop, colour: COLORS.barChop } : null;
  }
  if (item.type !== "pot" || item.contents < POT_CAPACITY || item.cook <= 0) return null;
  if (item.cook < 1) return { value: item.cook, colour: COLORS.barCook };
  if (!potIsCooked(item.cook)) return null;
  // Once cooked the bar drains instead, showing how long is left before it burns.
  const safe = 1 - (item.cook - 1) / (BURN_AT - 1);
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
export function potStatus(item: Item): PotStatus | null {
  if (item.type !== "pot" || item.contents === 0) return null;
  const status: PotStatus = { badge: null, badgeColour: LABEL_DARK, steam: "none", ready: false, cooking: false };
  if (item.contents < POT_CAPACITY || item.cook === 0) {
    status.badge = `${item.contents}/${POT_CAPACITY}`;
  } else if (item.cook >= BURN_AT) {
    Object.assign(status, { badge: "BURNT", badgeColour: "#d23c2c", steam: "dark" });
  } else if (item.cook >= 1) {
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
  // Middle of the serving windows, where score pop-ups appear.
  serveCentre: THREE.Vector3;
}

// Draws every solid tile as a KayKit counter or stove, then dresses each station on top.
export function createStations(level: Level): Stations {
  const group = new THREE.Group();
  const labels = new THREE.Group();
  const unshadowed = new THREE.Group();
  const flames = new Map<number, THREE.Group>();
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
    } else {
      counters.push({ x, z, turn });
    }
    if (tile.kind === "plant") {
      const plant = decoration(level.decor.plants[plants++ % level.decor.plants.length]);
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
      label.position.set(x + run + outX * 1.75, top + (outZ > 0 ? -0.2 : 0.45), z + outZ * 0.85);
      labels.add(label);
    }

    if (tile.kind === "crate" && tile.dispenses) {
      group.add(prop(CRATES[tile.dispenses], x, top, z, turn, 0.43));
    } else if (tile.kind === "board") {
      group.add(prop("cuttingboard", x, top, z, turn));
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

  // Every plain counter is one instance of the same model, turned to face its floor side.
  const instanced = new THREE.InstancedMesh(modelGeometry("kitchencounter_straight_A"), modelMaterial(), counters.length);
  const matrix = new THREE.Matrix4();
  const turned = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const size = new THREE.Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  counters.forEach(({ x, z, turn }, i) => {
    instanced.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 0, z), turned.setFromAxisAngle(up, turn), size));
  });
  group.add(instanced);
  shadowed(group);
  group.add(labels, unshadowed);
  return { group, flames, serveCentre };
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
