import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Ingredient, Level, TileKind } from "../shared/level";
import {
  BURN_AT,
  isChopped,
  playerSpeedFraction,
  POT_CAPACITY,
  potIsCooked,
  type Item,
  type PlayerState,
} from "../shared/sim";

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

export const WORKTOP_Y = 0.92;
// Thin props such as boards and hobs lift whatever rests on them by this much.
export const STATION_LIFT = 0.05;
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
        ctx.fillStyle = "#a9785a";
        ctx.fillRect(x, z, size, size);
        ctx.fillStyle = (tx + tz) % 2 === 0 ? "#efd9b8" : "#d99a6c";
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

function createBush(x: number, y: number, z: number, seed: number): THREE.Group {
  const bush = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + noise(seed + i);
    const radius = 0.2 + noise(seed + i * 3) * 0.1;
    bush.add(
      mesh(
        new THREE.IcosahedronGeometry(radius, 1),
        mat(i % 2 ? COLORS.leaf : COLORS.leafDark, 0.9, 0, true),
        Math.cos(angle) * 0.17,
        0.16 + noise(seed + i * 5) * 0.2,
        Math.sin(angle) * 0.17,
      ),
    );
  }
  bush.position.set(x, y, z);
  return bush;
}

// Floor, a wooden deck around it, planters down both sides, and a dressed back wall with lamps.
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
  solid.add(
    mesh(box(width + 0.6, 2.5, 0.4), mat(COLORS.wall, 0.9), width / 2, 1.25, -0.2),
    mesh(box(width + 0.7, 0.16, 0.5), mat(COLORS.wallTrim, 0.7), width / 2, 2.58, -0.2),
    mesh(box(width + 0.62, 0.14, 0.44), mat(COLORS.wallTrim, 0.7), width / 2, 0.07, -0.2),
  );

  // Two windows with glazing bars and a sill.
  const glass = new THREE.MeshStandardMaterial({
    color: COLORS.windowGlow,
    emissive: COLORS.windowGlow,
    emissiveIntensity: 0.6,
    roughness: 0.15,
  });
  for (const x of [width * 0.25, width * 0.75]) {
    solid.add(
      mesh(rounded(2.1, 1.0, 0.1, 0.04), mat(COLORS.windowFrame, 0.6), x, 1.82, 0.02),
      mesh(box(1.9, 0.8, 0.04), glass, x, 1.82, 0.07),
      mesh(box(0.06, 0.8, 0.06), mat(COLORS.windowFrame, 0.6), x, 1.82, 0.08),
      mesh(box(1.9, 0.06, 0.06), mat(COLORS.windowFrame, 0.6), x, 1.82, 0.08),
      mesh(rounded(2.3, 0.08, 0.22, 0.03), mat(COLORS.windowFrame, 0.6), x, 1.3, 0.1),
    );
  }

  // A shelf of jars between the windows.
  const shelfX = width / 2;
  solid.add(mesh(rounded(2.6, 0.07, 0.3, 0.02), mat(COLORS.crateDark, 0.8), shelfX, 1.62, 0.13));
  const jarColours = [0xd94f3a, 0xe4b03d, 0x6fa96a, 0x8c6bb1, 0xe07a9a, 0x4fa3c7];
  jarColours.forEach((colour, i) => {
    const x = shelfX - 1.05 + i * 0.42;
    const tall = 0.2 + noise(i + 3) * 0.14;
    solid.add(
      mesh(cylinder(0.09, 0.09, tall, 14), mat(colour, 0.3), x, 1.655 + tall / 2, 0.13),
      mesh(cylinder(0.075, 0.075, 0.04, 14), mat(COLORS.crateDark, 0.6), x, 1.675 + tall, 0.13),
    );
  });

  // Planters with bushes run down both sides, and a pot plant sits on each front corner.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -0.62 : width + 0.62;
    solid.add(
      mesh(rounded(0.62, 0.5, height - 0.4, 0.06), mat(COLORS.crate, 0.85), x, 0.25, height / 2),
      mesh(box(0.5, 0.04, height - 0.52), mat(0x3b2a20, 1), x, 0.5, height / 2),
      mesh(cylinder(0.3, 0.22, 0.44, 18), mat(0xc4683f, 0.8), x, 0.22, height + 0.6),
    );
    for (let i = 0; i < height - 1; i++) solid.add(createBush(x, 0.5, 0.9 + i, i * 9 + side * 50));
    const plant = createBush(x, 0.44, height + 0.6, side * 77);
    plant.scale.setScalar(1.3);
    solid.add(plant);
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
      mesh(cylinder(0.012, 0.012, 0.5, 6), mat(COLORS.darkSteel, 0.5), x, 2.75, 0.55),
      mesh(new THREE.ConeGeometry(0.24, 0.26, 20, 1, true), shade, x, 2.42, 0.55),
      mesh(ball(0.08, 12), new THREE.MeshBasicMaterial({ color: 0xfff1cf }), x, 2.33, 0.55),
    );
    const lamp = new THREE.PointLight(0xffc885, 7, 7.5, 2);
    lamp.position.set(x, 2.2, 0.9);
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

export function createWholeIngredient(kind: Ingredient): THREE.Group {
  const group = new THREE.Group();
  if (kind === "tomato") {
    const body = mesh(ball(0.2, 24), mat(COLORS.tomato, 0.25), 0, 0.17, 0);
    body.scale.y = 0.85;
    group.add(body, mesh(cylinder(0.014, 0.02, 0.08, 6), mat(COLORS.tomatoStem, 0.7), 0, 0.37, 0));
    // Five little sepals fan out around the stem.
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const sepal = mesh(
        new THREE.ConeGeometry(0.03, 0.11, 4),
        mat(COLORS.tomatoStem, 0.7),
        Math.cos(angle) * 0.05,
        0.335,
        Math.sin(angle) * 0.05,
      );
      sepal.rotation.set(Math.sin(angle) * 1.25, 0, -Math.cos(angle) * 1.25);
      group.add(sepal);
    }
  } else {
    // A rough core wrapped in two rings of leaves reads as a head of lettuce.
    const head = mesh(new THREE.IcosahedronGeometry(0.17, 1), mat(COLORS.lettuce, 0.75, 0, true), 0, 0.18, 0);
    head.scale.y = 0.85;
    group.add(head);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const outer = i % 2 === 0;
      const frill = mesh(
        new THREE.IcosahedronGeometry(outer ? 0.12 : 0.1, 0),
        mat(outer ? COLORS.lettuceDark : COLORS.lettuce, 0.8, 0, true),
        Math.cos(angle) * 0.14,
        outer ? 0.13 : 0.22,
        Math.sin(angle) * 0.14,
      );
      frill.scale.y = 0.75;
      group.add(frill);
    }
  }
  return group;
}

// Chopped food reads as a few flat pieces instead of one round shape.
export function createChoppedIngredient(kind: Ingredient): THREE.Group {
  const group = new THREE.Group();
  const spots: Array<[number, number, number]> = [
    [-0.11, -0.05, 0.3],
    [0.1, -0.04, -0.2],
    [0, 0.1, 0.1],
    [-0.02, -0.02, 0.5],
  ];
  spots.forEach(([x, z, tilt], i) => {
    const onTop = i === 3;
    if (kind === "tomato") {
      const slice = new THREE.Group();
      slice.add(
        mesh(cylinder(0.095, 0.095, 0.04, 18), mat(COLORS.tomato, 0.3)),
        mesh(cylinder(0.06, 0.06, 0.045, 14), mat(0xf2705c, 0.35)),
      );
      slice.position.set(x, 0.03 + (onTop ? 0.04 : 0), z);
      slice.rotation.z = onTop ? tilt * 0.4 : 0;
      group.add(slice);
    } else {
      const leaf = mesh(
        new THREE.IcosahedronGeometry(0.11, 0),
        mat(i % 2 ? COLORS.lettuce : COLORS.lettuceDark, 0.8, 0, true),
        x,
        0.05 + (onTop ? 0.05 : 0),
        z,
      );
      leaf.scale.y = 0.42;
      leaf.rotation.y = tilt * 3;
      group.add(leaf);
    }
  });
  return group;
}

// Plates carry a blue rim so they stand out against the worktops.
export function createPlate(): THREE.Group {
  return new THREE.Group().add(
    mesh(cylinder(0.2, 0.17, 0.02, 28), mat(COLORS.plate, 0.3), 0, 0.01, 0),
    mesh(cylinder(0.33, 0.22, 0.04, 32), mat(COLORS.plateRim, 0.3), 0, 0.035, 0),
    mesh(cylinder(0.3, 0.24, 0.03, 32), mat(COLORS.plate, 0.22), 0, 0.045, 0),
    mesh(cylinder(0.24, 0.24, 0.012, 32), mat(0xf1f3f7, 0.3), 0, 0.058, 0),
  );
}

function createPot(item: Extract<Item, { type: "pot" }>): THREE.Group {
  const group = new THREE.Group();
  const steel = mat(COLORS.pot, 0.28, 0.75);
  const rim = mesh(new THREE.TorusGeometry(0.305, 0.03, 10, 32), steel, 0, 0.31, 0);
  const band = mesh(new THREE.TorusGeometry(0.292, 0.012, 6, 32), mat(COLORS.darkSteel, 0.4, 0.6), 0, 0.1, 0);
  rim.rotation.x = band.rotation.x = Math.PI / 2;
  group.add(
    mesh(cylinder(0.3, 0.27, 0.31, 32), steel, 0, 0.155, 0),
    rim,
    band,
    // The dark disc near the top makes an empty pot look hollow.
    mesh(cylinder(0.275, 0.275, 0.01, 32), mat(0x24262d, 0.6, 0.3), 0, 0.27, 0),
  );
  for (const side of [-1, 1]) {
    group.add(
      mesh(rounded(0.18, 0.045, 0.13, 0.02), mat(COLORS.darkSteel, 0.45, 0.4), side * 0.385, 0.25, 0),
      mesh(ball(0.02, 8), steel, side * 0.315, 0.25, 0.045),
      mesh(ball(0.02, 8), steel, side * 0.315, 0.25, -0.045),
    );
  }
  if (item.contents === 0) return group;

  const burnt = item.cook >= BURN_AT;
  const colour = burnt ? COLORS.soupBurnt : item.cook >= 1 ? COLORS.soupCooked : COLORS.soupRaw;
  const surface = 0.14 + 0.05 * item.contents;
  group.add(mesh(cylinder(0.272, 0.272, 0.02, 32), mat(colour, 0.2), 0, surface, 0));
  if (item.contents < POT_CAPACITY) {
    // Until the pot is full the chopped pieces float on top, so the count is visible.
    for (let i = 0; i < item.contents; i++) {
      const angle = i * 2.4 + 0.5;
      group.add(
        mesh(cylinder(0.08, 0.08, 0.03, 14), mat(COLORS.tomato, 0.3), Math.cos(angle) * 0.11, surface + 0.02, Math.sin(angle) * 0.11),
      );
    }
  } else if (!burnt) {
    // Bubbles are animated by the scene while the pot is on a lit hob.
    const bubbles: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = i * 1.9;
      const reach = 0.06 + (i % 3) * 0.06;
      const bubble = mesh(ball(0.035, 10), mat(0xf59a7c, 0.2), Math.cos(angle) * reach, surface + 0.01, Math.sin(angle) * reach);
      bubble.visible = false;
      bubbles.push(bubble);
      group.add(bubble);
    }
    group.userData.bubbles = bubbles;
  }
  return group;
}

// Builds an item with its origin at the base so it can sit on any surface.
export function createItem(item: Item): THREE.Group {
  const group = new THREE.Group();
  if (item.type === "ingredient") {
    group.add(isChopped(item) ? createChoppedIngredient(item.kind) : createWholeIngredient(item.kind));
  } else if (item.type === "plate") {
    group.add(createPlate());
    if (item.contents.includes("soup")) {
      group.add(
        mesh(cylinder(0.235, 0.235, 0.03, 32), mat(COLORS.soupCooked, 0.2), 0, 0.075, 0),
        mesh(ball(0.035, 10), mat(COLORS.lettuce, 0.6), 0.03, 0.09, -0.02),
      );
    }
    if (item.contents.includes("lettuce")) {
      const pile = createChoppedIngredient("lettuce");
      pile.position.y = 0.06;
      group.add(pile);
    }
    if (item.contents.includes("tomato")) {
      const slices = createChoppedIngredient("tomato");
      slices.position.y = item.contents.includes("lettuce") ? 0.12 : 0.06;
      slices.scale.setScalar(0.85);
      group.add(slices);
    }
  } else {
    const pot = createPot(item);
    group.add(pot);
    group.userData.bubbles = pot.userData.bubbles;
  }
  return shadowed(group);
}

// Changes only when the item needs a different mesh, not on every progress tick.
export function itemSignature(item: Item): string {
  if (item.type === "ingredient") return `i:${item.kind}:${isChopped(item)}`;
  if (item.type === "plate") return `p:${item.contents.join("+")}`;
  const stage = item.cook >= BURN_AT ? "burnt" : item.cook >= 1 ? "cooked" : "raw";
  return `k:${item.contents}:${stage}`;
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
  // Burner ring material per stove tile, so cooking pots can make it glow.
  burners: Map<number, THREE.MeshStandardMaterial>;
  // Ring of flames per stove tile, shown while a pot cooks on it.
  flames: Map<number, THREE.Group>;
  // Middle of the serving windows, where score pop-ups appear.
  serveCentre: THREE.Vector3;
}

// Draws every solid tile as a cabinet, then dresses each station on top.
export function createStations(level: Level): Stations {
  const group = new THREE.Group();
  const labels = new THREE.Group();
  const unshadowed = new THREE.Group();
  const burners = new Map<number, THREE.MeshStandardMaterial>();
  const flames = new Map<number, THREE.Group>();
  const serveCentre = new THREE.Vector3();
  let serveTiles = 0;
  const solid: Array<{ x: number; z: number }> = [];
  // Cabinet faces that look onto the floor, which get a door and a knob.
  const fronts: Array<{ x: number; z: number; dx: number; dz: number }> = [];
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
    solid.push({ x, z });
    const sides = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => isFloor(tx + dx, tz + dz));
    for (const [dx, dz] of sides) fronts.push({ x, z, dx, dz });

    // One tag per run of identical stations, pushed outwards so it clears the worktop.
    const text = STATION_LABELS[tile.kind];
    const repeats = level.tiles[index - 1]?.kind === tile.kind || level.tiles[index - level.width]?.kind === tile.kind;
    if (text && !repeats) {
      const label = createLabel(text);
      const outX = tx === 0 ? -1 : tx === level.width - 1 ? 1 : 0;
      const outZ = tz === 0 ? -1 : tz === level.height - 1 ? 1 : 0;
      const run = level.tiles[index + 1]?.kind === tile.kind ? 0.5 : 0;
      label.position.set(x + run + outX * 1.75, top + (outZ > 0 ? -0.35 : 0.3), z + outZ * 0.85);
      labels.add(label);
    }

    if (tile.kind === "crate" && tile.dispenses) {
      // An open slatted crate with a heap of what it gives out.
      group.add(
        mesh(rounded(0.84, 0.3, 0.84, 0.03), mat(COLORS.crate, 0.85), x, top + 0.15, z),
        mesh(box(0.72, 0.02, 0.72), mat(0x3b2a20, 1), x, top + 0.29, z),
      );
      for (const y of [0.07, 0.17, 0.27]) group.add(mesh(box(0.87, 0.035, 0.87), mat(COLORS.crateDark, 0.9), x, top + y, z));
      for (const cx of [-1, 1]) {
        for (const cz of [-1, 1]) {
          group.add(mesh(box(0.08, 0.34, 0.08), mat(COLORS.crateDark, 0.9), x + cx * 0.4, top + 0.17, z + cz * 0.4));
        }
      }
      const heap: Array<[number, number, number, number]> = [
        [-0.18, 0.2, -0.14, 0.3],
        [0.18, 0.2, -0.12, 1.4],
        [0, 0.2, 0.17, 2.6],
        [-0.17, 0.2, 0.2, 4.1],
        [0.02, 0.36, 0, 5.2],
      ];
      for (const [dx, dy, dz, turn] of heap) {
        const sample = createWholeIngredient(tile.dispenses);
        sample.position.set(x + dx, top + dy, z + dz);
        sample.rotation.y = turn;
        sample.scale.setScalar(0.8);
        group.add(sample);
      }
    } else if (tile.kind === "trash") {
      // A chute cut into the worktop, framed with hazard stripes and half covered by a flap.
      const hinge = mesh(cylinder(0.02, 0.02, 0.6, 8), mat(COLORS.steel, 0.3, 0.8), x, top + 0.1, z - 0.28);
      hinge.rotation.z = Math.PI / 2;
      group.add(
        mesh(rounded(0.8, STATION_LIFT, 0.8, 0.02), hazard, x, top + 0.025, z),
        mesh(box(0.58, 0.02, 0.58), mat(0x0f0d14, 1), x, top + 0.052, z),
        mesh(box(0.56, 0.03, 0.26), mat(COLORS.darkSteel, 0.4, 0.6), x, top + 0.085, z - 0.15),
        hinge,
      );
    } else if (tile.kind === "board") {
      // A chopping board with a groove, and a spare knife resting beside it.
      group.add(
        mesh(rounded(0.7, STATION_LIFT, 0.56, 0.02), mat(COLORS.board, 0.75), x - 0.06, top + 0.025, z),
        mesh(box(0.6, 0.005, 0.02), mat(COLORS.crateDark, 0.9), x - 0.06, top + 0.052, z - 0.22),
        mesh(box(0.045, 0.02, 0.24), mat(COLORS.knife, 0.2, 0.85), x + 0.4, top + 0.012, z - 0.08),
        mesh(rounded(0.055, 0.035, 0.16, 0.012), mat(COLORS.knifeHandle, 0.5), x + 0.4, top + 0.018, z + 0.12),
      );
    } else if (tile.kind === "stove") {
      const burner = new THREE.MeshStandardMaterial({ color: COLORS.burner, emissive: COLORS.burner, emissiveIntensity: 0.25 });
      const ring = mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 28), burner, x, top + STATION_LIFT, z);
      ring.rotation.x = Math.PI / 2;
      burners.set(index, burner);
      group.add(mesh(rounded(0.94, STATION_LIFT, 0.94, 0.02), mat(COLORS.stove, 0.2, 0.3), x, top + 0.025, z), ring);
      // A cast-iron trivet holds the pot above the flame.
      for (const turn of [Math.PI / 4, (Math.PI * 3) / 4]) {
        const bar = mesh(box(0.74, 0.03, 0.045), mat(COLORS.darkSteel, 0.5, 0.5), x, top + STATION_LIFT + 0.01, z);
        bar.rotation.y = turn;
        group.add(bar);
      }
      const fire = new THREE.Group();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        fire.add(mesh(new THREE.ConeGeometry(0.04, 0.16, 5), flameMaterial, Math.cos(angle) * 0.32, 0.08, Math.sin(angle) * 0.32));
      }
      fire.position.set(x, top + STATION_LIFT, z);
      fire.visible = false;
      flames.set(index, fire);
      unshadowed.add(fire);
      // Control knobs sit on whichever face looks onto the floor.
      const [dx, dz] = sides[0] ?? [0, 1];
      for (const offset of [-0.26, 0, 0.26]) {
        const knob = mesh(
          cylinder(0.045, 0.045, 0.05, 12),
          mat(COLORS.steel, 0.3, 0.8),
          x + dx * 0.5 + dz * offset,
          0.775,
          z + dz * 0.5 + dx * offset,
        );
        knob.rotation.set(dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0);
        group.add(knob);
      }
    } else if (tile.kind === "plates") {
      group.add(mesh(rounded(0.86, STATION_LIFT, 0.86, 0.02), mat(COLORS.tray, 0.5), x, top + 0.025, z));
      for (let i = 0; i < 4; i++) {
        const plate = createPlate();
        plate.position.set(x + (i % 2) * 0.012, top + STATION_LIFT + i * 0.045, z);
        group.add(plate);
      }
    } else if (tile.kind === "serve") {
      group.add(mesh(box(1, STATION_LIFT, 1), servePad, x, top + 0.025, z));
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

  const kick = new THREE.InstancedMesh(box(0.9, 0.12, 0.9), mat(COLORS.kick, 0.9), solid.length);
  const base = new THREE.InstancedMesh(rounded(0.98, 0.74, 0.98, 0.04), mat(COLORS.cabinet, 0.55), solid.length);
  const top = new THREE.InstancedMesh(
    rounded(1.02, 0.11, 1.02, 0.035),
    new THREE.MeshStandardMaterial({ map: woodTexture("#e7c592", "#7a4f24", 4, 7), roughness: 0.42 }),
    solid.length,
  );
  const matrix = new THREE.Matrix4();
  solid.forEach(({ x, z }, i) => {
    kick.setMatrixAt(i, matrix.makeTranslation(x, 0.06, z));
    base.setMatrixAt(i, matrix.makeTranslation(x, 0.45, z));
    top.setMatrixAt(i, matrix.makeTranslation(x, 0.865, z));
  });

  const doors = new THREE.InstancedMesh(rounded(0.76, 0.5, 0.05, 0.02), mat(COLORS.cabinetDoor, 0.5), fronts.length);
  const knobs = new THREE.InstancedMesh(ball(0.035, 10), mat(COLORS.brass, 0.25, 0.9), fronts.length);
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const unit = new THREE.Vector3(1, 1, 1);
  fronts.forEach(({ x, z, dx, dz }, i) => {
    turn.setFromAxisAngle(up, dx ? Math.PI / 2 : 0);
    doors.setMatrixAt(i, matrix.compose(new THREE.Vector3(x + dx * 0.49, 0.45, z + dz * 0.49), turn, unit));
    knobs.setMatrixAt(i, matrix.makeTranslation(x + dx * 0.53 + dz * 0.26, 0.6, z + dz * 0.53 + dx * 0.26));
  });

  group.add(kick, base, top, doors, knobs);
  shadowed(group);
  group.add(labels, unshadowed);
  return { group, burners, flames, serveCentre };
}

// ---------------------------------------------------------------- chef

export interface ChefRig {
  group: THREE.Group;
  // Everything above the feet; it bobs and leans, and carries the held item.
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  footL: THREE.Mesh;
  footR: THREE.Mesh;
  knife: THREE.Group;
  // Walk cycle position, advanced by distance covered rather than by time.
  stride: number;
}

let blobMap: THREE.CanvasTexture | null = null;
const blobTexture = () =>
  canvasTexture(64, 64, (ctx) => {
    const fade = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    fade.addColorStop(0, "rgba(0, 0, 0, 0.5)");
    fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 64, 64);
  });

export function createChef(seat: number, isLocal: boolean): ChefRig {
  const colour = COLORS.shirts[seat % COLORS.shirts.length];
  const group = new THREE.Group();
  const body = new THREE.Group();
  const skin = mat(COLORS.skin, 0.7);
  const white = mat(COLORS.hat, 0.8);
  const jacket = mat(colour, 0.65);
  const dark = mat(COLORS.eyes, 0.35);
  const hair = mat(COLORS.hair[seat % COLORS.hair.length], 0.85);

  // Torso: coloured jacket with buttons, a white apron and a neckerchief.
  const scarf = mesh(new THREE.TorusGeometry(0.19, 0.05, 8, 20), mat(COLORS.scarf, 0.8), 0, 0.72, 0.01);
  scarf.rotation.x = Math.PI / 2;
  const knot = mesh(new THREE.ConeGeometry(0.07, 0.13, 4), mat(COLORS.scarf, 0.8), 0, 0.66, 0.21);
  knot.rotation.x = Math.PI;
  body.add(
    mesh(new THREE.CapsuleGeometry(0.27, 0.24, 6, 20), jacket, 0, 0.46, 0),
    mesh(rounded(0.38, 0.34, 0.1, 0.04), white, 0, 0.34, 0.225),
    mesh(ball(0.026, 8), white, -0.07, 0.6, 0.245),
    mesh(ball(0.026, 8), white, 0.07, 0.6, 0.245),
    scarf,
    knot,
  );

  // Head: big and round, with eyes, cheeks, a smile, ears and hair.
  const head = new THREE.Group();
  head.position.y = 1.0;
  const smile = mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI), dark, 0, -0.06, 0.27);
  smile.rotation.z = Math.PI;
  head.add(mesh(ball(0.3, 28), skin), smile, mesh(ball(0.2, 14), hair, 0, 0.06, -0.17));
  for (const side of [-1, 1]) {
    head.add(
      mesh(ball(0.042, 12), dark, side * 0.105, 0.04, 0.268),
      mesh(ball(0.014, 8), mat(0xffffff, 0.2), side * 0.105 + 0.012, 0.056, 0.305),
      mesh(ball(0.05, 10), mat(COLORS.blush, 0.9), side * 0.19, -0.05, 0.215),
      mesh(ball(0.06, 10), skin, side * 0.295, 0, 0),
      mesh(ball(0.1, 12), hair, side * 0.2, 0.12, -0.14),
    );
  }

  // Toque: a band, a pleated stack and a puffy crown.
  head.add(
    mesh(cylinder(0.235, 0.225, 0.14, 24), white, 0, 0.3, 0),
    mesh(cylinder(0.25, 0.22, 0.26, 12), white, 0, 0.48, 0),
    mesh(ball(0.2, 18), white, 0, 0.66, 0),
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    head.add(mesh(ball(0.14, 14), white, Math.cos(angle) * 0.16, 0.62, Math.sin(angle) * 0.16));
  }
  body.add(head);

  // Each arm hangs from a shoulder pivot, so rotating the group swings the whole arm.
  const arm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 0.66, 0);
    pivot.add(
      mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 12), jacket, 0, -0.12, 0),
      mesh(cylinder(0.085, 0.085, 0.05, 12), white, 0, -0.23, 0),
      mesh(ball(0.09, 12), skin, 0, -0.3, 0),
    );
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const knife = new THREE.Group().add(
    mesh(rounded(0.045, 0.14, 0.05, 0.012), mat(COLORS.knifeHandle, 0.5), 0, -0.36, 0.02),
    mesh(box(0.02, 0.26, 0.1), mat(COLORS.knife, 0.2, 0.85), 0, -0.55, 0.045),
  );
  knife.visible = false;
  armR.add(knife);

  const foot = (side: number) => {
    const shoe = mesh(ball(0.115, 12), mat(COLORS.shoe, 0.8), side * 0.13, 0.08, 0.03);
    shoe.scale.set(1, 0.7, 1.4);
    return shoe;
  };
  const footL = foot(-1);
  const footR = foot(1);
  group.add(body, footL, footR);
  shadowed(group);

  // A soft blob grounds the chef, and a coloured ring tells players apart; your own is brighter.
  blobMap ??= blobTexture();
  const blob = mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({ map: blobMap, transparent: true, depthWrite: false }),
    0,
    0.012,
    0,
  );
  const ring = mesh(
    new THREE.RingGeometry(isLocal ? 0.4 : 0.38, isLocal ? 0.52 : 0.45, 40),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: isLocal ? 0.95 : 0.6, depthWrite: false }),
    0,
    0.018,
    0,
  );
  blob.rotation.x = ring.rotation.x = -Math.PI / 2;
  group.add(blob, ring);

  return { group, body, armL, armR, footL, footR, knife, stride: 0 };
}

// Poses the rig for this frame: walking, carrying, chopping or standing still.
export function animateChef(rig: ChefRig, player: PlayerState, dt: number, time: number): void {
  const speed = playerSpeedFraction(player);
  rig.stride += dt * speed * 15;
  const swing = Math.sin(rig.stride);
  const ease = 1 - Math.exp(-14 * dt);

  rig.footL.position.z = 0.03 + swing * 0.15 * speed;
  rig.footR.position.z = 0.03 - swing * 0.15 * speed;
  rig.footL.position.y = 0.08 + Math.max(0, Math.cos(rig.stride)) * 0.08 * speed;
  rig.footR.position.y = 0.08 + Math.max(0, -Math.cos(rig.stride)) * 0.08 * speed;
  // A little idle breathing keeps a standing chef from looking frozen.
  rig.body.position.y = Math.abs(swing) * 0.05 * speed + Math.sin(time * 2.4) * 0.008;
  rig.body.rotation.x += (speed * 0.14 + (player.chopping ? 0.22 : 0) - rig.body.rotation.x) * ease;
  rig.body.rotation.z = swing * 0.04 * speed;

  rig.knife.visible = player.chopping;
  if (player.chopping) {
    // The knife arm pumps quickly while the other hand steadies the food.
    rig.armL.rotation.x += (-0.9 - rig.armL.rotation.x) * ease;
    rig.armR.rotation.x = -1.3 + Math.abs(Math.sin(time * 16)) * 0.95;
    return;
  }
  const carrying = player.held !== null;
  rig.armL.rotation.x += ((carrying ? -1.15 : swing * 0.75 * speed) - rig.armL.rotation.x) * ease;
  rig.armR.rotation.x += ((carrying ? -1.15 : -swing * 0.75 * speed) - rig.armR.rotation.x) * ease;
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
