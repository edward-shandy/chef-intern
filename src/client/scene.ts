import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { isFixture, walkable, type Level } from "../shared/level";
import type { GameState, Item } from "../shared/sim";
import {
  animatePads,
  PAD_COLOURS,
  animateBelts,
  animateGuests,
  animateStreet,
  animateSteam,
  BAR_WIDTH,
  COLORS,
  createItem,
  createLabel,
  createPointerMarker,
  createProgressBar,
  createRoom,
  createStations,
  createSteam,
  createTargetMarker,
  heats,
  itemProgress,
  itemSignature,
  labelTexture,
  potStatus,
  restLift,
  WORKTOP_Y,
  type ProgressBar,
} from "./models";
import { animateSea, SEA_WATER } from "./sea";
import { animateSpace } from "./space";
import { createPolish } from "./polish";
import { animateChef, createChef, type ChefRig } from "./chef";
import { animateFire, animateSpray, createFire, createSpray, type FireView } from "./fire";
import { createDashFx } from "./dash";
import { BELT_SECONDS, beltMoves, SPRAY_RANGE } from "../shared/sim";
import { getZoom, onZoom } from "./settings";

const EMPTY_STATE = {
  players: [],
  tileItems: {},
  score: 0,
  delivered: 0,
  plates: null,
  dirty: 0,
  wash: { dirty: 0, clean: 0, progress: 0 },
  fires: {},
} as unknown as GameState;
// Aimed a little behind the kitchen centre, which leaves the top of the screen free for order tickets.
const CAMERA_HOME = new THREE.Vector3(0, 18, 12.2);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -0.7);
const POPUP_SECONDS = 1.3;
// `?zoom=2` moves the camera closer, for inspecting models up close.
const DEBUG_ZOOM = Math.max(1, Number(new URLSearchParams(location.search).get("zoom")) || 1);

interface ItemView {
  signature: string;
  mesh: THREE.Group;
  // Set while a belt carries the item over from a neighbouring tile: where it came from and when it set off.
  glide?: { x: number; z: number; at: number };
}

interface ChefView {
  rig: ChefRig;
  isLocal: boolean;
  // The character the rig was built as, so a change of chef in the lobby rebuilds it.
  character: string;
  // Set once the rig has been drawn somewhere, so its first placement is not mistaken for a teleport.
  placed?: boolean;
  held: ItemView | null;
  spray: THREE.Group;
  // Name floating over the chef, and the text it was drawn for.
  tag: THREE.Sprite | null;
  tagText: string;
}

interface Popup {
  sprite: THREE.Sprite;
  age: number;
  baseY: number;
}

export interface Frame {
  state: GameState | null;
  localId: number | null;
  // Station the local chef will use right now, shown with the orange marker.
  target: number | null;
  // Station under the mouse that is not the target, shown with the cyan brackets.
  pointed: number | null;
}

export interface KitchenView {
  // Station under a screen position, or null when the pointer is over floor or off the kitchen.
  pick(clientX: number, clientY: number): number | null;
  // Rebuilds the kitchen when the round moves to a different layout; a no-op otherwise.
  setLevel(level: Level): void;
  // Runs the render loop; onFrame returns the state to draw this frame.
  start(onFrame: () => Frame): void;
}

export function createKitchenView(canvas: HTMLCanvasElement, initialLevel: Level): KitchenView {
  let level = initialLevel;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  // Phones get a lower resolution and a smaller shadow map, which is where most of their frame time goes.
  const lowPower = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  const fog = new THREE.Fog(COLORS.background, 30, 60);
  scene.fog = fog;

  // A generated studio environment gives worktops and pots soft reflections without any image files.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(CAMERA_TARGET);

  // Warm key light from the front-left, a cool fill from the back-right, and a soft sky bounce.
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x4a3a5c, 0.38);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.9);
  key.position.set(-5, 13, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  key.shadow.camera.left = -level.width / 2 - 7;
  key.shadow.camera.right = level.width / 2 + 7;
  key.shadow.camera.top = level.height / 2 + 4;
  key.shadow.camera.bottom = -level.height / 2 - 5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4);
  fill.position.set(7, 6, -4);
  scene.add(key, fill);

  // Everything under this group uses simulation coordinates directly.
  const world = new THREE.Group();
  world.position.set(-level.width / 2, 0, -level.height / 2);
  scene.add(world);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  let stations = createStations(level);
  let room = createRoom(level, anisotropy);
  world.add(room, stations.group);

  const marker = createTargetMarker();
  const pointerMarker = createPointerMarker();
  world.add(marker.group, pointerMarker);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Tile where the pointer ray crosses a horizontal plane at the given height.
  const tileOnPlane = (height: number): number | null => {
    plane.constant = -height;
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const tx = Math.floor(hit.x - world.position.x);
    const tz = Math.floor(hit.z - world.position.z);
    return tx < 0 || tz < 0 || tx >= level.width || tz >= level.height ? null : tz * level.width + tx;
  };

  const chefs = new Map<number, ChefView>();
  const resting = new Map<number, ItemView>();
  const bars = new Map<number, ProgressBar>();
  const potFx = new Map<number, { badge: THREE.Sprite; steam: THREE.Group }>();
  const popping = new Set<THREE.Object3D>();
  const fires = new Map<number, FireView>();
  // One shared light stands in for every fire, placed at their middle.
  const fireGlow = new THREE.PointLight(0xff7a2a, 0, 6, 2);
  world.add(fireGlow);
  const popups: Popup[] = [];
  let lastScore: number | null = null;
  let lastDelivered = 0;
  // Counts down from 1 after a delivery, while the guests celebrate.
  let cheer = 0;
  // What lay where when the belts last moved, so the next move can be replayed as a glide.
  let beltSteps: number | null = null;
  let beltItems: Record<number, Item> = {};
  const suds = createSuds();
  world.add(suds);
  const dashFx = createDashFx(world);
  // Themes that opt into the polished look get post-processing (bloom, ambient occlusion, outlines, grading)
  // and extra "juice": camera shake and bursts of particles at the moments that matter.
  const polish = createPolish(renderer, scene, camera, lowPower);
  const polished = () => level.theme === "space";
  let shake = 0;
  const kick = (amount: number) => {
    if (polished()) shake = Math.max(shake, amount);
  };
  let lastFires = 0;
  // Adaptive quality: when frames run slow for a while, the most expensive effect left is switched off, then the
  // resolution steps down. A slow frame also delays the game's network messages, so this keeps play responsive too.
  // Frames longer than 50 ms are ignored: those are a hidden tab or a hiccup, not a slow device.
  let frameAverage = 1 / 60;
  let slowFor = 0;
  let pixelRatio = renderer.getPixelRatio();
  const adaptQuality = (dt: number) => {
    if (dt > 0.05 || document.hidden) return;
    frameAverage += (dt - frameAverage) * 0.05;
    slowFor = frameAverage > 1 / 42 ? slowFor + dt : 0;
    if (slowFor < 2) return;
    slowFor = 0;
    frameAverage = 1 / 60;
    if (polish.enabled && polish.degrade()) return;
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
    }
  };
  let chopBits = 0;
  // Night kitchens dim the daylight; these are the daytime values to return to.
  const daylight = { hemi: 0.38, key: 2.9, fill: 0.4, exposure: 0.92, env: 0.22 };

  // Tears down everything tied to the old layout and builds the new kitchen in its place.
  const setLevel = (next: Level) => {
    if (next === level) return;
    for (const view of resting.values()) view.mesh.removeFromParent();
    for (const bar of bars.values()) bar.group.removeFromParent();
    for (const fx of potFx.values()) world.remove(fx.badge, fx.steam);
    for (const fire of fires.values()) fire.group.removeFromParent();
    resting.clear();
    bars.clear();
    potFx.clear();
    fires.clear();
    world.remove(room, stations.group);
    washBar?.group.removeFromParent();
    washBar = null;
    level = next;
    stations = createStations(level);
    room = createRoom(level, anisotropy);
    world.position.set(-level.width / 2, 0, -level.height / 2);
    world.add(room, stations.group);
    beltSteps = null;
    applyMood();
  };

  // Evening kitchens trade the sun for a deep blue sky, so the lanterns and the grill embers carry the light.
  const applyMood = () => {
    const night = Boolean(level.decor.room?.night);
    hemi.intensity = night ? 0.2 : daylight.hemi;
    hemi.color.setHex(night ? 0x9fb4ff : 0xffeedd);
    key.intensity = night ? 1.25 : daylight.key;
    key.color.setHex(night ? 0xb8c8ff : 0xfff0d8);
    fill.intensity = night ? 0.5 : daylight.fill;
    fill.color.setHex(night ? 0x6a7cff : 0xbfd4ff);
    scene.environmentIntensity = night ? 0.12 : daylight.env;
    renderer.toneMappingExposure = night ? 1.05 : daylight.exposure;
    const sky = level.decor.room?.space ? 0x05071a : night ? 0x141a33 : COLORS.background;
    (scene.background as THREE.Color).setHex(sky);
    fog.color.setHex(sky);
    // Under the sea the distance fades into blue water and the light turns cool.
    const sea = level.theme === "sea";
    hemi.groundColor.setHex(sea ? 0x2a7f9a : 0x4a3a5c);
    if (sea) {
      (scene.background as THREE.Color).setHex(SEA_WATER);
      fog.color.setHex(SEA_WATER);
      hemi.color.setHex(0xc4f1ff);
      key.color.setHex(0xe2fbff);
    }
    // In orbit the station has its own lighting rig, tuned so nothing glares: a warm white "sun" key from the front
    // left, a soft violet fill from space behind, and a stronger sky/ground ambient so shadows stay readable rather
    // than inky. Exposure sits a little under 1 so bright worktops never clip to flat white.
    if (level.decor.room?.space) {
      hemi.intensity = 0.42;
      hemi.color.setHex(0xc9d6ff);
      hemi.groundColor.setHex(0x2a2f55);
      key.intensity = 1.7;
      key.color.setHex(0xfff0dc);
      fill.intensity = 0.55;
      fill.color.setHex(0x8d7bff);
      scene.environmentIntensity = 0.16;
      renderer.toneMappingExposure = 0.94;
    }
  };

  const tileCentre = (index: number) => ({ x: (index % level.width) + 0.5, z: Math.floor(index / level.width) + 0.5 });
  const restHeight = (index: number) => WORKTOP_Y + restLift(level.tiles[index].kind);

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

  // Shows as many plates on the stack, the return hatch and the sink as the game says are there.
  let washBar: ProgressBar | null = null;
  const syncDishes = (state: GameState) => {
    const reveal = (pile: THREE.Object3D[], count: number) => pile.forEach((plate, i) => (plate.visible = i < count));
    reveal(stations.plateStack, state.plates ?? 0);
    reveal(stations.dirtyPile, state.dirty);
    reveal(stations.sinkDirty, state.wash.dirty);
    reveal(stations.sinkClean, state.wash.clean);
    if (stations.washTile === null) return;
    if (!washBar) {
      washBar = createProgressBar();
      const { x, z } = tileCentre(stations.washTile);
      washBar.group.position.set(x, WORKTOP_Y + 0.75, z);
      washBar.fill.material.color.setHex(0x5fb8e8);
      world.add(washBar.group);
    }
    // Soap suds froth up over the basin while somebody scrubs.
    const scrubbing = state.players.some((player) => player.washing);
    const { x, z } = tileCentre(stations.washTile);
    suds.position.set(x, WORKTOP_Y + 0.12, z);
    suds.userData.target = scrubbing ? 1 : 0;
    washBar.group.visible = state.wash.progress > 0;
    washBar.fill.scale.x = Math.max(0.001, state.wash.progress);
    washBar.fill.position.x = (-BAR_WIDTH * (1 - state.wash.progress)) / 2;
  };

  // When the belts have moved since the last frame, each carried mesh follows its item to the next tile.
  const followBelts = (state: GameState, time: number) => {
    const steps = state.beltSteps ?? 0;
    if (beltSteps !== null && steps === beltSteps + 1) {
      const carried: Array<[number, ItemView]> = [];
      for (const [from, to] of beltMoves(level, beltItems)) {
        const view = resting.get(from);
        if (!view) continue;
        resting.delete(from);
        view.glide = { ...tileCentre(from), at: time };
        carried.push([to, view]);
      }
      for (const [to, view] of carried) {
        const left = resting.get(to);
        if (left) left.mesh.removeFromParent();
        resting.set(to, view);
      }
    }
    beltSteps = steps;
    beltItems = { ...state.tileItems };
  };

  const syncRestingItems = (state: GameState, time: number) => {
    followBelts(state, time);
    const indices = new Set([...resting.keys(), ...potFx.keys(), ...Object.keys(state.tileItems).map(Number)]);
    for (const index of indices) {
      const item = state.tileItems[index] ?? null;
      const view = syncItem(resting.get(index) ?? null, item, world);
      let { x, z } = tileCentre(index);
      const y = restHeight(index);
      if (view) {
        // A carried item slides across from the tile it left, at the belt's own pace.
        if (view.glide) {
          const t = Math.min(1, (time - view.glide.at) / BELT_SECONDS);
          x = view.glide.x + (x - view.glide.x) * t;
          z = view.glide.z + (z - view.glide.z) * t;
          if (t >= 1) view.glide = undefined;
        }
        view.mesh.position.set(x, y, z);
        resting.set(index, view);
      } else {
        resting.delete(index);
      }

      // Pots and grilling chickens get a badge (fill count, READY!, BURNT) and steam while they are hot.
      const onHob = heats(level.tiles[index].kind);
      const status = item ? potStatus(item, onHob) : null;
      let fx = potFx.get(index);
      if (status && !fx) {
        fx = { badge: createLabel(""), steam: createSteam() };
        fx.badge.scale.set(1.05, 0.33, 1);
        world.add(fx.badge, fx.steam);
        potFx.set(index, fx);
      }
      fx?.steam.position.set(x, y, z);
      if (fx) {
        fx.badge.visible = Boolean(status?.badge);
        fx.steam.visible = Boolean(status && status.steam !== "none");
        if (status?.badge) {
          fx.badge.material.map = labelTexture(status.badge, status.badgeColour);
          fx.badge.position.set(x, y + 1.1 + (status.ready ? Math.abs(Math.sin(time * 6)) * 0.12 : 0), z);
        }
        if (status && fx.steam.visible) animateSteam(fx.steam, time, status.steam === "dark");
      }
      // Flames flicker under a cooking pot or a roasting chicken, and soup bubbles.
      const cooking = Boolean(status?.cooking) && onHob;
      const fire = stations.flames.get(index);
      if (fire) {
        fire.visible = cooking;
        fire.children.forEach((flame, i) => (flame.scale.y = 0.7 + Math.abs(Math.sin(time * 13 + i * 1.7)) * 0.7));
      }
      const bubbles = view?.mesh.userData.bubbles as THREE.Mesh[] | undefined;
      bubbles?.forEach((bubble, i) => {
        const pulse = (time * 1.6 + i * 0.37) % 1;
        bubble.visible = cooking;
        bubble.scale.setScalar(0.3 + pulse * 1.1);
      });

      const progress = item ? itemProgress(item, onHob) : null;
      let bar = bars.get(index);
      if (progress && !bar) {
        bar = createProgressBar();
        world.add(bar.group);
        bars.set(index, bar);
      }
      if (!bar) continue;
      bar.group.position.set(x, y + 0.75, z);
      bar.group.visible = progress !== null;
      if (progress) {
        bar.fill.scale.x = Math.max(0.001, progress.value);
        bar.fill.position.x = (-BAR_WIDTH * (1 - progress.value)) / 2;
        bar.fill.material.color.setHex(progress.colour);
      }
    }
  };

  // Adds, flickers and removes the flames on burning worktops, and moves the shared glow to their middle.
  const syncFires = (state: GameState, time: number) => {
    const burning = state.fires ?? {};
    for (const [index, fire] of fires) {
      if (burning[index] !== undefined) continue;
      fire.group.removeFromParent();
      fires.delete(index);
    }
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const key of Object.keys(burning)) {
      const index = Number(key);
      const { x, z } = tileCentre(index);
      let fire = fires.get(index);
      if (!fire) {
        fire = createFire();
        fire.group.position.set(x, WORKTOP_Y + 0.02, z);
        world.add(fire.group);
        fires.set(index, fire);
      }
      animateFire(fire, time, burning[index], index);
      sumX += x;
      sumZ += z;
      count += 1;
    }
    // A new fire rattles the camera, so nobody misses it.
    if (count > lastFires) kick(0.28);
    lastFires = count;
    fireGlow.intensity = count === 0 ? 0 : Math.min(3, count) * 1.6 * (0.85 + Math.sin(time * 17) * 0.15);
    if (count > 0) fireGlow.position.set(sumX / count, WORKTOP_Y + 1.2, sumZ / count);
  };

  const removeChef = (id: number, view: ChefView) => {
    if (view.held) popping.delete(view.held.mesh);
    view.rig.group.removeFromParent();
    chefs.delete(id);
  };

  const syncChefs = (state: GameState, localId: number | null, dt: number, time: number) => {
    for (const [id, view] of chefs) {
      const player = state.players.find((other) => other.id === id);
      // A rig built before we knew our own seat is rebuilt so the right chef gets the bright ring.
      if (!player || view.isLocal !== (id === localId) || view.character !== player.character) removeChef(id, view);
    }

    for (const player of state.players) {
      let view = chefs.get(player.id);
      if (!view) {
        const isLocal = player.id === localId;
        const character = player.character;
        view = { rig: createChef(player.id, isLocal, character), isLocal, character, held: null, spray: createSpray(), tag: null, tagText: "" };
        view.rig.group.add(view.spray);
        view.rig.group.rotation.y = player.facing;
        world.add(view.rig.group);
        chefs.set(player.id, view);
      }

      // Positions arrive already predicted or interpolated, so they are drawn as given.
      const { position, rotation } = view.rig.group;
      // A jump of more than a couple of tiles is a teleport: sparkles where the chef left and where they arrived.
      if (Math.hypot(player.x - position.x, player.z - position.z) > 2 && view.placed) {
        const pad = level.tiles[Math.floor(player.z) * level.width + Math.floor(player.x)];
        const colour = PAD_COLOURS[((pad?.pair ?? 1) - 1) % PAD_COLOURS.length];
        dashFx.sparkle(position.x, position.z, colour);
        dashFx.sparkle(player.x, player.z, colour);
        if (player.id === localId) kick(0.1);
      }
      view.placed = true;
      // In zero gravity the chefs float a little off the floor and bob as they go.
      const float = level.lowGravity ? 0.14 + Math.sin(time * 2.2 + player.id * 1.7) * 0.06 : 0;
      position.set(player.x, float, player.z);
      // Turn along the shortest arc so the chef never spins the long way round.
      const delta = Math.atan2(Math.sin(player.facing - rotation.y), Math.cos(player.facing - rotation.y));
      rotation.y += delta * (1 - Math.exp(-18 * dt));

      animateChef(view.rig, player, dt);
      view.held = syncItem(view.held, player.held, view.rig.body);
      view.held?.mesh.position.set(0, 0.42, 0.42);
      if ((player.name ?? "") !== view.tagText) {
        view.tag?.removeFromParent();
        view.tagText = player.name ?? "";
        view.tag = view.tagText ? createLabel(view.tagText) : null;
        if (view.tag) {
          view.tag.scale.set(1.28, 0.4, 1);
          view.tag.position.set(0, 1.7, 0);
          view.rig.group.add(view.tag);
        }
      }
      view.spray.visible = Boolean(player.spraying);
      if (view.spray.visible) animateSpray(view.spray, time, SPRAY_RANGE);
    }
  };

  const syncMarkers = (target: number | null, pointed: number | null, time: number) => {
    marker.group.visible = target !== null;
    if (target !== null) {
      const { x, z } = tileCentre(target);
      // Sits just above boards and hobs so thin props never cover the frame.
      marker.group.position.set(x, WORKTOP_Y + 0.13, z);
      marker.frame.scale.setScalar(1 + Math.sin(time * 6) * 0.035);
      marker.arrow.position.y = 1.35 + Math.sin(time * 6) * 0.08;
      marker.arrow.rotation.y = time * 2;
    }
    pointerMarker.visible = pointed !== null;
    if (pointed !== null) {
      const { x, z } = tileCentre(pointed);
      pointerMarker.position.set(x, WORKTOP_Y + 0.14, z);
      pointerMarker.scale.setScalar(1 + Math.sin(time * 5) * 0.03);
    }
  };

  // Floats "+28" over the serving window on a delivery and a red "-10" when an order expires.
  const syncPopups = (state: GameState, dt: number) => {
    if (lastScore !== null && state.score !== lastScore && state.delivered >= lastDelivered) {
      const gained = state.score - lastScore;
      if (gained > 0) {
        cheer = 1;
        // Confetti pops out of the pass and the camera gives a happy little bump.
        kick(0.12);
        if (polished()) {
          const { x, y, z } = stations.serveCentre;
          dashFx.burst(x, y + 0.3, z, [0xffd166, 0x3fd6e8, 0xf27aa0, 0x9b7bff, 0x7ccf4f], 16, 2.2, 0.35);
        }
      }
      const sprite = createLabel(gained > 0 ? `+${gained}` : `${gained}`, gained > 0 ? "#2f9e5b" : "#d23c2c");
      sprite.scale.set(1.7, 0.53, 1);
      const baseY = stations.serveCentre.y + 1.1;
      sprite.position.set(stations.serveCentre.x, baseY, stations.serveCentre.z);
      world.add(sprite);
      popups.push({ sprite, age: 0, baseY });
    }
    lastScore = state.score;
    lastDelivered = state.delivered;

    for (let i = popups.length - 1; i >= 0; i--) {
      const popup = popups[i];
      popup.age += dt;
      const t = popup.age / POPUP_SECONDS;
      popup.sprite.position.y = popup.baseY + (1 - (1 - t) ** 3) * 1.1;
      popup.sprite.material.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      if (t < 1) continue;
      popup.sprite.removeFromParent();
      popup.sprite.material.dispose();
      popups.splice(i, 1);
    }
  };

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    polish.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    // Pull the camera back on narrow screens so the whole kitchen stays in frame.
    // A short screen (a phone held sideways) loses its top to the score and tickets, so the kitchen is drawn a little smaller and lower.
    const squeeze = 1 - Math.min(1, clientHeight / 460);
    // Wide windows keep the dining room in view; an upright phone gives that up so the kitchen itself is larger.
    const fit = 1.6 - 0.3 * Math.min(1, Math.max(0, (1 - camera.aspect) / 0.44));
    framing = (Math.max(1, fit / camera.aspect) * (1 + squeeze * 0.35)) / DEBUG_ZOOM;
    if (squeeze > 0) camera.setViewOffset(clientWidth, clientHeight, 0, -squeeze * 0.36 * clientHeight, clientWidth, clientHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    placeCamera();
  };

  // How far back the camera sits to frame the whole kitchen on this screen, before the player's own zoom.
  let framing = 1;
  // The point the camera centres on: the kitchen's middle, drifting towards the local chef as the player zooms in,
  // so a close-up view keeps them in shot. It eases along rather than snapping to every step.
  const focus = new THREE.Vector3();
  const wantedFocus = new THREE.Vector3();
  const placeCamera = () => {
    camera.position.copy(CAMERA_HOME).multiplyScalar(framing / getZoom()).add(focus);
    camera.lookAt(CAMERA_TARGET.x + focus.x, CAMERA_TARGET.y, CAMERA_TARGET.z + focus.z);
    // Fog starts behind the kitchen wherever the camera ends up, so only the far ground fades out.
    const distance = camera.position.distanceTo(focus);
    const sea = level.theme === "sea";
    fog.near = distance + (sea ? 3 : 8);
    fog.far = distance + (sea ? 24 : 40);
  };
  const followChef = (state: GameState, localId: number | null, dt: number) => {
    const zoom = getZoom();
    const me = state.players.find((player) => player.id === localId);
    // Fully on the chef from about 1.5x; at 1x and below the whole kitchen stays centred.
    const follow = me ? Math.min(1, Math.max(0, (zoom - 1) / 0.5)) : 0;
    const halfW = level.width / 2;
    const halfH = level.height / 2;
    wantedFocus.set(
      Math.max(-halfW, Math.min(halfW, (me?.x ?? halfW) - halfW)) * follow,
      0,
      Math.max(-halfH, Math.min(halfH, (me?.z ?? halfH) - halfH)) * follow,
    );
    focus.lerp(wantedFocus, 1 - Math.exp(-5 * dt));
    placeCamera();
  };
  onZoom(() => placeCamera());
  // The canvas is measured after layout rather than on the window's resize event: iOS fires that event mid-rotation,
  // before the page has its new size, which left the old drawing buffer stretched over the new shape (a squashed kitchen).
  let measured = "";
  const fit = () => {
    const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
    if (size === measured || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    measured = size;
    resize();
  };
  new ResizeObserver(fit).observe(canvas);
  window.addEventListener("resize", fit);
  // Belt and braces for rotations whose last layout change reports no resize at all.
  window.addEventListener("orientationchange", () => [100, 400, 900].forEach((ms) => setTimeout(fit, ms)));
  fit();
  applyMood();

  return {
    setLevel,

    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      // Stations are found at worktop height, which is where they appear under the cursor.
      const tile = tileOnPlane(WORKTOP_Y);
      return tile !== null && !walkable(level.tiles[tile]) && !isFixture(level.tiles[tile]) ? tile : null;
    },

    start(onFrame) {
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1);
        const time = clock.elapsedTime;
        const { state, localId, target, pointed } = onFrame();
        const shown = state ?? EMPTY_STATE;
        syncRestingItems(shown, time);
        syncDishes(shown);
        animateSuds(suds, time, dt);
        animateBelts(stations, dt);
        animatePads(stations, time);
        syncFires(shown, time);
        syncChefs(shown, localId, dt, time);
        followChef(shown, localId, dt);
        dashFx.update(shown.players, dt);
        syncMarkers(target, pointed, time);
        if (state) syncPopups(state, dt);
        cheer = Math.max(0, cheer - dt / 1.2);
        animateGuests(room, time, cheer);
        animateStreet(room, time);
        animateSea(room, time);
        animateSpace(room, time);
        for (const object of popping) {
          const scale = object.scale.x + (1 - object.scale.x) * (1 - Math.exp(-20 * dt));
          object.scale.setScalar(scale);
          if (scale > 0.995) popping.delete(object);
        }
        // Scraps fly off the board while a chef chops in a polished theme.
        chopBits -= dt;
        if (polished() && chopBits <= 0) {
          chopBits = 0.12;
          for (const player of shown.players) {
            if (!player.chopping) continue;
            const x = player.x + Math.sin(player.facing) * 0.7;
            const z = player.z + Math.cos(player.facing) * 0.7;
            dashFx.burst(x, WORKTOP_Y + 0.15, z, [0x7ccf4f, 0xe23b2e, 0xfff3d6], 3, 1.1, 0.18);
          }
        }
        // The shake decays fast and jitters the camera around where it would otherwise be.
        if (shake > 0.001) {
          shake *= Math.exp(-9 * dt);
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake * 0.6;
          camera.position.z += (Math.random() - 0.5) * shake;
        }
        adaptQuality(dt);
        polish.setEnabled(polished());
        if (polish.enabled) polish.render();
        else renderer.render(scene, camera);
      });
    },
  };
}

// A froth of soap bubbles over the wash basin; each bubble swells, rises a little and pops in a loop.
function createSuds(): THREE.Group {
  const suds = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf2fbff,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
    envMapIntensity: 1.5,
  });
  for (let i = 0; i < 14; i++) {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), material);
    bubble.userData.seed = i;
    suds.add(bubble);
  }
  suds.userData.amount = 0;
  suds.userData.target = 0;
  suds.visible = false;
  return suds;
}

function animateSuds(suds: THREE.Group, time: number, dt: number): void {
  const amount = (suds.userData.amount as number) + ((suds.userData.target as number) - (suds.userData.amount as number)) * (1 - Math.exp(-6 * dt));
  suds.userData.amount = amount;
  suds.visible = amount > 0.02;
  if (!suds.visible) return;
  suds.children.forEach((bubble, i) => {
    const phase = (time * 0.9 + i * 0.137) % 1;
    const angle = i * 2.39;
    const reach = 0.08 + (i % 4) * 0.07;
    bubble.position.set(Math.cos(angle) * reach, phase * 0.35, Math.sin(angle) * reach * 0.8);
    bubble.scale.setScalar(amount * (0.5 + Math.sin(phase * Math.PI) * (0.6 + (i % 3) * 0.3)));
  });
}
