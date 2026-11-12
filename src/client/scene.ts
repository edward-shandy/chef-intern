import * as THREE from "three";
import type { Ingredient, Level, TileKind } from "../shared/level";
import {
  BURN_AT,
  isChopped,
  playerSpeedFraction,
  POT_CAPACITY,
  potIsCooked,
  targetTile,
  type GameState,
  type Item,
} from "../shared/sim";

const COLORS = {
  background: 0x2a2338,
  tileA: "#f1dfc4",
  tileB: "#e2c9a6",
  counter: 0xb9764a,
  worktop: 0xf6efe2,
  crate: 0x8a5a36,
  trash: 0x3d3d4a,
  board: 0xe6c58f,
  stove: 0x2e2e36,
  burner: 0xff6a3d,
  serve: 0x45b7a0,
  plate: 0xffffff,
  plateRim: 0x3d8fe4,
  tray: 0x2f5f9e,
  knife: 0xd9dde3,
  hover: 0xffffff,
  pot: 0x596070,
  tomato: 0xe23b2e,
  lettuce: 0x7ccf4f,
  soupRaw: 0xf07a5a,
  soupCooked: 0xd2411f,
  soupBurnt: 0x1d1a1a,
  highlight: 0xffd166,
  marker: 0xff9d0a,
  markerEdge: 0x33210a,
  barBack: 0x221c2c,
  barChop: 0x6fd98a,
  barCook: 0xf2b84b,
  barBurn: 0xef4b3a,
  hat: 0xfafafa,
  skin: 0xf2c29b,
  eyes: 0x2b2230,
  shirts: [0xe4573d, 0x3d8fe4, 0x4fb86a, 0xe4b03d],
};

const EMPTY_STATE = { players: [], tileItems: {} } as unknown as GameState;
const CAMERA_HOME = new THREE.Vector3(0, 17, 12);
const SNAPSHOT_EASE = 22;
const WORKTOP_Y = 0.92;
// Thin props such as boards and hobs lift whatever rests on them by this much.
const STATION_LIFT = 0.05;
const BAR_WIDTH = 0.7;
const HAND_Y = 0.62;

const standard = (color: number, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return object;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  return result;
}

function createFloor(level: Level): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLORS.tileA;
  ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = COLORS.tileB;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillRect(1, 1, 1, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(level.width / 2, level.height / 2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(level.width, level.height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(level.width / 2, 0, level.height / 2);
  floor.receiveShadow = true;
  return floor;
}

function createWholeIngredient(kind: Ingredient): THREE.Group {
  const group = new THREE.Group();
  if (kind === "tomato") {
    const body = mesh(new THREE.SphereGeometry(0.2, 20, 14), standard(COLORS.tomato, 0.35), 0, 0.17, 0);
    body.scale.y = 0.85;
    group.add(body, mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.07, 8), standard(0x3f9b46), 0, 0.34, 0));
  } else {
    const head = mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({ color: COLORS.lettuce, roughness: 0.7, flatShading: true }),
      0,
      0.18,
      0,
    );
    head.scale.y = 0.8;
    group.add(head);
  }
  return group;
}

// Chopped food reads as a few flat pieces instead of one round shape.
function createChoppedIngredient(kind: Ingredient): THREE.Group {
  const group = new THREE.Group();
  const spots: Array<[number, number]> = [
    [-0.1, -0.05],
    [0.1, -0.03],
    [0, 0.1],
  ];
  for (const [x, z] of spots) {
    if (kind === "tomato") {
      group.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14), standard(COLORS.tomato, 0.35), x, 0.03, z));
    } else {
      const leaf = mesh(
        new THREE.IcosahedronGeometry(0.11, 0),
        new THREE.MeshStandardMaterial({ color: COLORS.lettuce, roughness: 0.7, flatShading: true }),
        x,
        0.05,
        z,
      );
      leaf.scale.y = 0.45;
      group.add(leaf);
    }
  }
  return group;
}

// Plates carry a blue rim so they stand out against the pale worktops.
function createPlate(): THREE.Group {
  const plate = new THREE.Group();
  plate.add(
    mesh(new THREE.CylinderGeometry(0.33, 0.22, 0.04, 24), standard(COLORS.plateRim, 0.4), 0, 0.02, 0),
    mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 24), standard(COLORS.plate, 0.3), 0, 0.045, 0),
  );
  return plate;
}

// Builds an item with its origin at the base so it can sit on any surface.
function createItem(item: Item): THREE.Group {
  const group = new THREE.Group();
  if (item.type === "ingredient") {
    group.add(isChopped(item) ? createChoppedIngredient(item.kind) : createWholeIngredient(item.kind));
  } else if (item.type === "plate") {
    group.add(createPlate());
    if (item.contents.includes("soup")) {
      group.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 24), standard(COLORS.soupCooked, 0.3), 0, 0.07, 0));
    }
    if (item.contents.includes("lettuce")) {
      const pile = createChoppedIngredient("lettuce");
      pile.position.y = 0.05;
      group.add(pile);
    }
    if (item.contents.includes("tomato")) {
      const slices = createChoppedIngredient("tomato");
      slices.position.y = item.contents.includes("lettuce") ? 0.11 : 0.05;
      slices.scale.setScalar(0.85);
      group.add(slices);
    }
  } else {
    const body = standard(COLORS.pot, 0.45);
    group.add(
      mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.3, 24), body, 0, 0.15, 0),
      mesh(new THREE.BoxGeometry(0.14, 0.05, 0.1), body, -0.36, 0.24, 0),
      mesh(new THREE.BoxGeometry(0.14, 0.05, 0.1), body, 0.36, 0.24, 0),
    );
    if (item.contents > 0) {
      const colour = item.cook >= BURN_AT ? COLORS.soupBurnt : item.cook >= 1 ? COLORS.soupCooked : COLORS.soupRaw;
      const height = 0.12 + 0.06 * item.contents;
      group.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24), standard(colour, 0.3), 0, height, 0));
    }
  }
  return shadowed(group);
}

// Changes only when the item needs a different mesh, not on every progress tick.
function itemSignature(item: Item): string {
  if (item.type === "ingredient") return `i:${item.kind}:${isChopped(item)}`;
  if (item.type === "plate") return `p:${item.contents.join("+")}`;
  const stage = item.cook >= BURN_AT ? "burnt" : item.cook >= 1 ? "cooked" : "raw";
  return `k:${item.contents}:${stage}`;
}

// Fraction and colour of the progress bar an item should show, if any.
function itemProgress(item: Item): { value: number; colour: number } | null {
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

interface ProgressBar {
  group: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

function createProgressBar(): ProgressBar {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH + 0.06, 0.16),
    new THREE.MeshBasicMaterial({ color: COLORS.barBack, depthTest: false }),
  );
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, 0.1), new THREE.MeshBasicMaterial({ depthTest: false }));
  back.renderOrder = 10;
  fill.renderOrder = 11;
  // Tilted back so it faces the fixed camera.
  group.rotation.x = -0.95;
  group.add(back, fill);
  return { group, fill };
}

interface PotStatus {
  badge: string | null;
  badgeColour: string;
  steam: "none" | "light" | "dark";
  ready: boolean;
}

// What a pot should announce above itself: how full it is, or how its soup is doing.
function potStatus(item: Item): PotStatus | null {
  if (item.type !== "pot" || item.contents === 0) return null;
  const status: PotStatus = { badge: null, badgeColour: LABEL_DARK, steam: "none", ready: false };
  if (item.contents < POT_CAPACITY || item.cook === 0) {
    status.badge = `${item.contents}/${POT_CAPACITY}`;
  } else if (item.cook >= BURN_AT) {
    Object.assign(status, { badge: "BURNT", badgeColour: "#d23c2c", steam: "dark" });
  } else if (item.cook >= 1) {
    Object.assign(status, { badge: "READY!", badgeColour: "#2f9e5b", steam: "light", ready: true });
  } else {
    status.steam = "light";
  }
  return status;
}

const STEAM_PUFFS = 4;

function createSteam(): THREE.Group {
  const steam = new THREE.Group();
  for (let i = 0; i < STEAM_PUFFS; i++) {
    steam.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      ),
    );
  }
  return steam;
}

// Each puff loops upwards, growing and fading, offset so the column looks continuous.
function animateSteam(steam: THREE.Group, time: number, dark: boolean): void {
  steam.children.forEach((child, i) => {
    const puff = child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    const phase = (time * 0.7 + i / STEAM_PUFFS) % 1;
    puff.position.set(Math.sin(i * 2.1 + time * 1.3) * 0.09, 0.32 + phase * 0.75, Math.cos(i * 1.7 + time) * 0.06);
    puff.scale.setScalar(0.6 + phase * 1.4);
    puff.material.opacity = (1 - phase) * (dark ? 0.85 : 0.7);
    puff.material.color.setHex(dark ? 0x26222b : 0xffffff);
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
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// Marks the tile the local chef will use: a dark-edged orange frame plus a bobbing arrow.
function createTargetMarker(): { group: THREE.Group; frame: THREE.Group; arrow: THREE.Group } {
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

const STATION_LABELS: Partial<Record<TileKind, string>> = {
  board: "CHOP",
  stove: "COOK",
  plates: "PLATES",
  serve: "SERVE",
  trash: "TRASH",
};

// A small always-facing name tag, drawn over everything so it never hides behind props.
const LABEL_DARK = "rgba(34, 28, 44, 0.85)";
const labelTextures = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string, background: string): THREE.CanvasTexture {
  const cached = labelTextures.get(text + background);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 72, 36);
  ctx.fill();
  ctx.fillStyle = "#fff6e6";
  ctx.font = "900 40px Nunito, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 43);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(text + background, texture);
  return texture;
}

function createLabel(text: string, background = LABEL_DARK): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, background), depthTest: false }));
  sprite.scale.set(1.28, 0.4, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// Draws every solid tile as a counter, then dresses each station on top.
function createStations(level: Level): THREE.Group {
  const group = new THREE.Group();
  const labels = new THREE.Group();
  const solid: Array<{ tx: number; tz: number }> = [];
  level.tiles.forEach((tile, index) => {
    if (tile.kind === "floor") return;
    const tx = index % level.width;
    const tz = Math.floor(index / level.width);
    const x = tx + 0.5;
    const z = tz + 0.5;
    solid.push({ tx, tz });

    // One tag per run of identical stations, pushed outwards so it clears the worktop.
    const text = STATION_LABELS[tile.kind];
    const repeats = level.tiles[index - 1]?.kind === tile.kind || level.tiles[index - level.width]?.kind === tile.kind;
    if (text && !repeats) {
      const label = createLabel(text);
      const outX = tx === 0 ? -1 : tx === level.width - 1 ? 1 : 0;
      const outZ = tz === 0 ? -1 : tz === level.height - 1 ? 1 : 0;
      const run = level.tiles[index + 1]?.kind === tile.kind ? 0.5 : 0;
      label.position.set(x + run + outX * 1.05, WORKTOP_Y + (outZ > 0 ? -0.35 : 0.3), z + outZ * 0.85);
      labels.add(label);
    }

    if (tile.kind === "crate" && tile.dispenses) {
      const sample = createWholeIngredient(tile.dispenses);
      sample.position.set(x, WORKTOP_Y + 0.12, z);
      group.add(mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), standard(COLORS.crate, 0.8), x, WORKTOP_Y + 0.11, z), sample);
    } else if (tile.kind === "trash") {
      group.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.3, 20), standard(COLORS.trash, 0.5), x, WORKTOP_Y + 0.15, z));
    } else if (tile.kind === "board") {
      group.add(mesh(new THREE.BoxGeometry(0.8, STATION_LIFT, 0.6), standard(COLORS.board, 0.8), x, WORKTOP_Y + 0.025, z));
    } else if (tile.kind === "stove") {
      const burner = new THREE.MeshStandardMaterial({ color: COLORS.burner, emissive: COLORS.burner, emissiveIntensity: 0.6 });
      const ring = mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 24), burner, x, WORKTOP_Y + STATION_LIFT, z);
      ring.rotation.x = Math.PI / 2;
      group.add(mesh(new THREE.BoxGeometry(0.9, STATION_LIFT, 0.9), standard(COLORS.stove, 0.4), x, WORKTOP_Y + 0.025, z), ring);
    } else if (tile.kind === "plates") {
      group.add(mesh(new THREE.BoxGeometry(0.86, STATION_LIFT, 0.86), standard(COLORS.tray, 0.5), x, WORKTOP_Y + 0.025, z));
      for (let i = 0; i < 3; i++) {
        const plate = createPlate();
        plate.position.set(x, WORKTOP_Y + STATION_LIFT + i * 0.05, z);
        group.add(plate);
      }
    } else if (tile.kind === "serve") {
      const glow = new THREE.MeshStandardMaterial({ color: COLORS.serve, emissive: COLORS.serve, emissiveIntensity: 0.25 });
      group.add(mesh(new THREE.BoxGeometry(1, STATION_LIFT, 1), glow, x, WORKTOP_Y + 0.025, z));
    }
  });

  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.8, 0.96), standard(COLORS.counter, 0.7), solid.length);
  const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1), standard(COLORS.worktop, 0.4), solid.length);
  const matrix = new THREE.Matrix4();
  solid.forEach(({ tx, tz }, i) => {
    base.setMatrixAt(i, matrix.makeTranslation(tx + 0.5, 0.4, tz + 0.5));
    top.setMatrixAt(i, matrix.makeTranslation(tx + 0.5, 0.86, tz + 0.5));
  });
  group.add(base, top);
  shadowed(group);
  group.add(labels);
  return group;
}

function createChef(shirt: number): { group: THREE.Group; knifeHand: THREE.Group } {
  const chef = new THREE.Group();
  // Lean is applied after the turn, so it always tips towards where the chef faces.
  chef.rotation.order = "YXZ";
  const knifeHand = new THREE.Group();
  const knife = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), standard(COLORS.knife, 0.25), 0, 0, 0.2);
  knife.name = "knife";
  knifeHand.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), standard(COLORS.skin)), knife);
  knifeHand.position.set(0.3, HAND_Y, 0.24);
  chef.add(
    knifeHand,
    mesh(new THREE.SphereGeometry(0.085, 12, 10), standard(COLORS.skin), -0.3, HAND_Y, 0.24),
    mesh(new THREE.CapsuleGeometry(0.3, 0.35, 6, 16), standard(shirt), 0, 0.5, 0),
    mesh(new THREE.SphereGeometry(0.26, 24, 16), standard(COLORS.skin), 0, 1.08, 0),
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 20), standard(COLORS.hat), 0, 1.36, 0),
    mesh(new THREE.SphereGeometry(0.25, 20, 12), standard(COLORS.hat), 0, 1.52, 0),
    mesh(new THREE.SphereGeometry(0.035, 8, 8), standard(COLORS.eyes), -0.09, 1.12, 0.235),
    mesh(new THREE.SphereGeometry(0.035, 8, 8), standard(COLORS.eyes), 0.09, 1.12, 0.235),
  );
  shadowed(chef);
  return { group: chef, knifeHand };
}

interface ItemView {
  signature: string;
  mesh: THREE.Group;
}

interface ChefView {
  group: THREE.Group;
  knifeHand: THREE.Group;
  held: ItemView | null;
}

export interface Frame {
  state: GameState | null;
  localId: number | null;
}

export interface KitchenView {
  // Tile under a screen position, or null when the pointer is off the kitchen.
  pick(clientX: number, clientY: number): number | null;
  // Marks the tile the pointer is over.
  setHover(tile: number | null): void;
  // Runs the render loop; onFrame returns the latest server snapshot to draw.
  start(onFrame: () => Frame): void;
}

export function createKitchenView(canvas: HTMLCanvasElement, level: Level): KitchenView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(0, 0, 0.9);

  scene.add(new THREE.HemisphereLight(0xfff3dd, 0x40304f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(5, 11, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
  sun.shadow.camera.right = sun.shadow.camera.top = 9;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Everything under this group uses simulation coordinates directly.
  const world = new THREE.Group();
  world.position.set(-level.width / 2, 0, -level.height / 2);
  scene.add(world);
  world.add(createFloor(level), createStations(level));

  const marker = createTargetMarker();
  world.add(marker.group);

  const hover = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.04, 0.96),
    new THREE.MeshBasicMaterial({ color: COLORS.hover, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  hover.visible = false;
  world.add(hover);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  // Tile where the pointer ray crosses a horizontal plane at the given height.
  const tileOnPlane = (height: number): number | null => {
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), hit)) return null;
    const tx = Math.floor(hit.x - world.position.x);
    const tz = Math.floor(hit.z - world.position.z);
    return tx < 0 || tz < 0 || tx >= level.width || tz >= level.height ? null : tz * level.width + tx;
  };

  const chefs = new Map<number, ChefView>();
  const resting = new Map<number, ItemView>();
  const bars = new Map<number, ProgressBar>();
  const potFx = new Map<number, { badge: THREE.Sprite; steam: THREE.Group }>();
  const popping = new Set<THREE.Object3D>();

  const tileCentre = (index: number) => ({ x: (index % level.width) + 0.5, z: Math.floor(index / level.width) + 0.5 });
  const restHeight = (index: number) => {
    const kind = level.tiles[index].kind;
    return WORKTOP_Y + (kind === "board" || kind === "stove" ? STATION_LIFT : 0);
  };

  // Swaps in a fresh mesh whenever the item's look changes, with a little pop.
  const syncItem = (view: ItemView | null, item: Item | null, parent: THREE.Object3D): ItemView | null => {
    const signature = item ? itemSignature(item) : "";
    if (view?.signature === signature) return view;
    if (view) {
      popping.delete(view.mesh);
      view.mesh.removeFromParent();
    }
    if (!item) return null;
    const next = createItem(item);
    next.scale.setScalar(0.6);
    popping.add(next);
    parent.add(next);
    return { signature, mesh: next };
  };

  const syncRestingItems = (state: GameState, time: number) => {
    for (const index of new Set([...resting.keys(), ...Object.keys(state.tileItems).map(Number)])) {
      const item = state.tileItems[index] ?? null;
      const view = syncItem(resting.get(index) ?? null, item, world);
      const { x, z } = tileCentre(index);
      const y = restHeight(index);
      if (view) {
        view.mesh.position.set(x, y, z);
        resting.set(index, view);
      } else {
        resting.delete(index);
      }

      // Pots get a badge (fill count, READY!, BURNT) and steam while they are hot.
      const status = item ? potStatus(item) : null;
      let fx = potFx.get(index);
      if (status && !fx) {
        fx = { badge: createLabel(""), steam: createSteam() };
        fx.badge.scale.set(1.05, 0.33, 1);
        fx.steam.position.set(x, y, z);
        world.add(fx.badge, fx.steam);
        potFx.set(index, fx);
      }
      if (fx) {
        fx.badge.visible = Boolean(status?.badge);
        fx.steam.visible = Boolean(status && status.steam !== "none");
        if (status?.badge) {
          fx.badge.material.map = labelTexture(status.badge, status.badgeColour);
          fx.badge.position.set(x, y + 1.25 + (status.ready ? Math.abs(Math.sin(time * 6)) * 0.12 : 0), z);
        }
        if (status && fx.steam.visible) animateSteam(fx.steam, time, status.steam === "dark");
      }

      const progress = item ? itemProgress(item) : null;
      let bar = bars.get(index);
      if (progress && !bar) {
        bar = createProgressBar();
        bar.group.position.set(x, y + 0.85, z);
        world.add(bar.group);
        bars.set(index, bar);
      }
      if (!bar) continue;
      bar.group.visible = progress !== null;
      if (progress) {
        bar.fill.scale.x = Math.max(0.001, progress.value);
        bar.fill.position.x = (-BAR_WIDTH * (1 - progress.value)) / 2;
        bar.fill.material.color.setHex(progress.colour);
      }
    }
  };

  const syncChefs = (state: GameState, dt: number, time: number) => {
    for (const [id, view] of chefs) {
      if (state.players.some((player) => player.id === id)) continue;
      if (view.held) popping.delete(view.held.mesh);
      view.group.removeFromParent();
      chefs.delete(id);
    }

    for (const player of state.players) {
      let view = chefs.get(player.id);
      if (!view) {
        view = { ...createChef(COLORS.shirts[player.id % COLORS.shirts.length]), held: null };
        view.group.position.set(player.x, 0, player.z);
        view.group.rotation.y = player.facing;
        world.add(view.group);
        chefs.set(player.id, view);
      }

      // Snapshots arrive at 20 Hz, so ease towards them instead of snapping.
      const { position, rotation } = view.group;
      const far = Math.hypot(player.x - position.x, player.z - position.z) > 2;
      const ease = far ? 1 : 1 - Math.exp(-SNAPSHOT_EASE * dt);
      position.x += (player.x - position.x) * ease;
      position.z += (player.z - position.z) * ease;
      position.y = Math.abs(Math.sin(time * 11)) * 0.07 * playerSpeedFraction(player);

      // Turn along the shortest arc so the chef never spins the long way round.
      const delta = Math.atan2(Math.sin(player.facing - rotation.y), Math.cos(player.facing - rotation.y));
      rotation.y += delta * (1 - Math.exp(-18 * dt));

      // Chopping swings the knife hand and tips the chef over the board.
      const swing = player.chopping ? Math.abs(Math.sin(time * 16)) : 0;
      view.knifeHand.position.y = HAND_Y + swing * 0.28;
      view.knifeHand.getObjectByName("knife")!.visible = player.chopping;
      rotation.x += ((player.chopping ? 0.16 : 0) - rotation.x) * (1 - Math.exp(-14 * dt));

      view.held = syncItem(view.held, player.held, view.group);
      view.held?.mesh.position.set(0, 0.55, 0.45);
    }
  };

  const syncHighlight = (state: GameState, localId: number | null, time: number) => {
    const local = state.players.find((player) => player.id === localId);
    const index = local ? targetTile(level, local) : null;
    marker.group.visible = index !== null;
    if (index === null) return;
    const { x, z } = tileCentre(index);
    // Sits just above boards and hobs so thin props never cover the frame.
    marker.group.position.set(x, WORKTOP_Y + STATION_LIFT + 0.02, z);
    marker.frame.scale.setScalar(1 + Math.sin(time * 6) * 0.035);
    marker.arrow.position.y = 1.5 + Math.sin(time * 6) * 0.08;
    marker.arrow.rotation.y = time * 2;
  };

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    // Pull the camera back on narrow screens so the whole kitchen stays in frame.
    camera.position.copy(CAMERA_HOME).multiplyScalar(Math.max(1, 1.6 / camera.aspect));
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  return {
    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      // Stations are tested at worktop height first, since they hide the floor behind them.
      const onTop = tileOnPlane(WORKTOP_Y);
      if (onTop !== null && level.tiles[onTop].kind !== "floor") return onTop;
      return tileOnPlane(0);
    },

    setHover(tile) {
      hover.visible = tile !== null;
      if (tile === null) return;
      const { x, z } = tileCentre(tile);
      hover.position.set(x, level.tiles[tile].kind === "floor" ? 0.03 : WORKTOP_Y + 0.03, z);
    },

    start(onFrame) {
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1);
        const { state, localId } = onFrame();
        const shown = state ?? EMPTY_STATE;
        syncRestingItems(shown, clock.elapsedTime);
        syncChefs(shown, dt, clock.elapsedTime);
        syncHighlight(shown, localId, clock.elapsedTime);
        for (const object of popping) {
          const scale = object.scale.x + (1 - object.scale.x) * (1 - Math.exp(-20 * dt));
          object.scale.setScalar(scale);
          if (scale > 0.995) popping.delete(object);
        }
        renderer.render(scene, camera);
      });
    },
  };
}
