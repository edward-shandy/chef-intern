import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { isFixture, type Level } from "../shared/level";
import type { GameState, Item } from "../shared/sim";
import {
  animateGuests,
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
  itemProgress,
  itemSignature,
  labelTexture,
  potStatus,
  restLift,
  WORKTOP_Y,
  type ProgressBar,
} from "./models";
import { animateChef, createChef, type ChefRig } from "./chef";

const EMPTY_STATE = { players: [], tileItems: {}, score: 0, delivered: 0 } as unknown as GameState;
// Aimed a little behind the kitchen centre, which leaves the top of the screen free for order tickets.
const CAMERA_HOME = new THREE.Vector3(0, 18, 12.2);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -0.7);
const POPUP_SECONDS = 1.3;
// `?zoom=2` moves the camera closer, for inspecting models up close.
const DEBUG_ZOOM = Math.max(1, Number(new URLSearchParams(location.search).get("zoom")) || 1);

interface ItemView {
  signature: string;
  mesh: THREE.Group;
}

interface ChefView {
  rig: ChefRig;
  isLocal: boolean;
  held: ItemView | null;
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
  scene.add(new THREE.HemisphereLight(0xffeedd, 0x4a3a5c, 0.38));
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
  const popups: Popup[] = [];
  let lastScore: number | null = null;
  let lastDelivered = 0;
  // Counts down from 1 after a delivery, while the guests celebrate.
  let cheer = 0;

  // Tears down everything tied to the old layout and builds the new kitchen in its place.
  const setLevel = (next: Level) => {
    if (next === level) return;
    for (const view of resting.values()) view.mesh.removeFromParent();
    for (const bar of bars.values()) bar.group.removeFromParent();
    for (const fx of potFx.values()) world.remove(fx.badge, fx.steam);
    resting.clear();
    bars.clear();
    potFx.clear();
    world.remove(room, stations.group);
    level = next;
    stations = createStations(level);
    room = createRoom(level, anisotropy);
    world.position.set(-level.width / 2, 0, -level.height / 2);
    world.add(room, stations.group);
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

  const syncRestingItems = (state: GameState, time: number) => {
    const indices = new Set([...resting.keys(), ...potFx.keys(), ...Object.keys(state.tileItems).map(Number)]);
    for (const index of indices) {
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
          fx.badge.position.set(x, y + 1.1 + (status.ready ? Math.abs(Math.sin(time * 6)) * 0.12 : 0), z);
        }
        if (status && fx.steam.visible) animateSteam(fx.steam, time, status.steam === "dark");
      }
      // Flames flicker under a cooking pot and its soup bubbles.
      const cooking = Boolean(status?.cooking) && level.tiles[index].kind === "stove";
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

      const progress = item ? itemProgress(item) : null;
      let bar = bars.get(index);
      if (progress && !bar) {
        bar = createProgressBar();
        bar.group.position.set(x, y + 0.75, z);
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

  const removeChef = (id: number, view: ChefView) => {
    if (view.held) popping.delete(view.held.mesh);
    view.rig.group.removeFromParent();
    chefs.delete(id);
  };

  const syncChefs = (state: GameState, localId: number | null, dt: number) => {
    for (const [id, view] of chefs) {
      const player = state.players.find((other) => other.id === id);
      // A rig built before we knew our own seat is rebuilt so the right chef gets the bright ring.
      if (!player || view.isLocal !== (id === localId)) removeChef(id, view);
    }

    for (const player of state.players) {
      let view = chefs.get(player.id);
      if (!view) {
        const isLocal = player.id === localId;
        view = { rig: createChef(player.id, isLocal), isLocal, held: null };
        view.rig.group.rotation.y = player.facing;
        world.add(view.rig.group);
        chefs.set(player.id, view);
      }

      // Positions arrive already predicted or interpolated, so they are drawn as given.
      const { position, rotation } = view.rig.group;
      position.set(player.x, 0, player.z);
      // Turn along the shortest arc so the chef never spins the long way round.
      const delta = Math.atan2(Math.sin(player.facing - rotation.y), Math.cos(player.facing - rotation.y));
      rotation.y += delta * (1 - Math.exp(-18 * dt));

      animateChef(view.rig, player, dt);
      view.held = syncItem(view.held, player.held, view.rig.body);
      view.held?.mesh.position.set(0, 0.42, 0.42);
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
      if (gained > 0) cheer = 1;
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
    camera.aspect = clientWidth / clientHeight;
    // Pull the camera back on narrow screens so the whole kitchen stays in frame.
    camera.position.copy(CAMERA_HOME).multiplyScalar(Math.max(1, 1.6 / camera.aspect) / DEBUG_ZOOM);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
    // Fog starts behind the kitchen wherever the camera ends up, so only the far ground fades out.
    const distance = camera.position.length();
    fog.near = distance + 8;
    fog.far = distance + 40;
  };
  window.addEventListener("resize", resize);
  resize();

  return {
    setLevel,

    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      // Stations are found at worktop height, which is where they appear under the cursor.
      const tile = tileOnPlane(WORKTOP_Y);
      return tile !== null && level.tiles[tile].kind !== "floor" && !isFixture(level.tiles[tile]) ? tile : null;
    },

    start(onFrame) {
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1);
        const time = clock.elapsedTime;
        const { state, localId, target, pointed } = onFrame();
        const shown = state ?? EMPTY_STATE;
        syncRestingItems(shown, time);
        syncChefs(shown, localId, dt);
        syncMarkers(target, pointed, time);
        if (state) syncPopups(state, dt);
        cheer = Math.max(0, cheer - dt / 1.2);
        animateGuests(room, time, cheer);
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
