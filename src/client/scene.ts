import * as THREE from "three";
import type { ItemKind, Level } from "../shared/level";
import { playerSpeedFraction, targetTile, type GameState } from "../shared/sim";

const COLORS = {
  background: 0x2a2338,
  tileA: "#f1dfc4",
  tileB: "#e2c9a6",
  counter: 0xb9764a,
  worktop: 0xf6efe2,
  crate: 0x8a5a36,
  trash: 0x3d3d4a,
  highlight: 0xffd166,
  hat: 0xfafafa,
  skin: 0xf2c29b,
  eyes: 0x2b2230,
  shirts: [0xe4573d, 0x3d8fe4, 0x4fb86a, 0xe4b03d],
};

const CAMERA_HOME = new THREE.Vector3(0, 17, 12);
const WORKTOP_Y = 0.92;
const ITEM_REST_Y = WORKTOP_Y + 0.17;

const standard = (color: number, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return object;
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

function createItem(kind: ItemKind): THREE.Group {
  const item = new THREE.Group();
  if (kind === "tomato") {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), standard(0xe23b2e, 0.35));
    body.scale.y = 0.85;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.07, 8), standard(0x3f9b46));
    stem.position.y = 0.17;
    item.add(body, stem);
  } else {
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({ color: 0x7ccf4f, roughness: 0.7, flatShading: true }),
    );
    head.scale.y = 0.8;
    item.add(head);
  }
  return shadowed(item);
}

// Draws every solid tile as a counter, then dresses crates and bins on top.
function createStations(level: Level): THREE.Group {
  const group = new THREE.Group();
  const solid: Array<{ tx: number; tz: number }> = [];
  level.tiles.forEach((tile, index) => {
    if (tile.kind === "floor") return;
    const tx = index % level.width;
    const tz = Math.floor(index / level.width);
    solid.push({ tx, tz });

    if (tile.kind === "crate" && tile.dispenses) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), standard(COLORS.crate, 0.8));
      box.position.set(tx + 0.5, WORKTOP_Y + 0.11, tz + 0.5);
      const sample = createItem(tile.dispenses);
      sample.position.set(tx + 0.5, WORKTOP_Y + 0.3, tz + 0.5);
      group.add(shadowed(box), sample);
    } else if (tile.kind === "trash") {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.3, 20), standard(COLORS.trash, 0.5));
      bin.position.set(tx + 0.5, WORKTOP_Y + 0.15, tz + 0.5);
      group.add(shadowed(bin));
    }
  });

  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.8, 0.96), standard(COLORS.counter, 0.7), solid.length);
  const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1), standard(COLORS.worktop, 0.4), solid.length);
  const matrix = new THREE.Matrix4();
  solid.forEach(({ tx, tz }, i) => {
    base.setMatrixAt(i, matrix.makeTranslation(tx + 0.5, 0.4, tz + 0.5));
    top.setMatrixAt(i, matrix.makeTranslation(tx + 0.5, 0.86, tz + 0.5));
  });
  group.add(shadowed(base), shadowed(top));
  return group;
}

function createChef(shirt: number): THREE.Group {
  const chef = new THREE.Group();
  const part = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, standard(color));
    mesh.position.set(x, y, z);
    chef.add(mesh);
  };

  part(new THREE.CapsuleGeometry(0.3, 0.35, 6, 16), shirt, 0, 0.5, 0);
  part(new THREE.SphereGeometry(0.26, 24, 16), COLORS.skin, 0, 1.08, 0);
  part(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 20), COLORS.hat, 0, 1.36, 0);
  part(new THREE.SphereGeometry(0.25, 20, 12), COLORS.hat, 0, 1.52, 0);
  part(new THREE.SphereGeometry(0.035, 8, 8), COLORS.eyes, -0.09, 1.12, 0.235);
  part(new THREE.SphereGeometry(0.035, 8, 8), COLORS.eyes, 0.09, 1.12, 0.235);
  return shadowed(chef);
}

interface ChefView {
  group: THREE.Group;
  heldKind: ItemKind | null;
  heldMesh: THREE.Group | null;
}

interface RestingItem {
  kind: ItemKind;
  mesh: THREE.Group;
}

export interface KitchenView {
  // Runs the render loop; onFrame advances the game and returns the state to draw.
  start(onFrame: (dt: number) => GameState): void;
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

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(1.03, 0.14, 1.03),
    new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  highlight.visible = false;
  world.add(highlight);

  const chefs = new Map<number, ChefView>();
  const resting = new Map<number, RestingItem>();
  const popping = new Set<THREE.Object3D>();

  const spawnItem = (kind: ItemKind, parent: THREE.Object3D): THREE.Group => {
    const mesh = createItem(kind);
    mesh.scale.setScalar(0.5);
    popping.add(mesh);
    parent.add(mesh);
    return mesh;
  };
  const removeItem = (mesh: THREE.Object3D) => {
    popping.delete(mesh);
    mesh.removeFromParent();
  };

  const syncRestingItems = (state: GameState) => {
    for (const [index, item] of resting) {
      if (state.counterItems[index] === item.kind) continue;
      removeItem(item.mesh);
      resting.delete(index);
    }
    for (const [key, kind] of Object.entries(state.counterItems)) {
      const index = Number(key);
      if (resting.has(index)) continue;
      const mesh = spawnItem(kind, world);
      mesh.position.set((index % level.width) + 0.5, ITEM_REST_Y, Math.floor(index / level.width) + 0.5);
      resting.set(index, { kind, mesh });
    }
  };

  const syncChefs = (state: GameState, dt: number, time: number) => {
    for (const player of state.players) {
      let view = chefs.get(player.id);
      if (!view) {
        view = { group: createChef(COLORS.shirts[player.id % COLORS.shirts.length]), heldKind: null, heldMesh: null };
        view.group.rotation.y = player.facing;
        world.add(view.group);
        chefs.set(player.id, view);
      }

      const bob = Math.abs(Math.sin(time * 11)) * 0.07 * playerSpeedFraction(player);
      view.group.position.set(player.x, bob, player.z);

      // Turn along the shortest arc so the chef never spins the long way round.
      const delta = Math.atan2(
        Math.sin(player.facing - view.group.rotation.y),
        Math.cos(player.facing - view.group.rotation.y),
      );
      view.group.rotation.y += delta * (1 - Math.exp(-18 * dt));

      if (view.heldKind !== player.held) {
        if (view.heldMesh) removeItem(view.heldMesh);
        view.heldMesh = player.held ? spawnItem(player.held, view.group) : null;
        view.heldMesh?.position.set(0, 0.72, 0.42);
        view.heldKind = player.held;
      }
    }
  };

  const syncHighlight = (state: GameState) => {
    const local = state.players[0];
    const index = local ? targetTile(level, local) : null;
    highlight.visible = index !== null;
    if (index !== null) {
      highlight.position.set((index % level.width) + 0.5, 0.87, Math.floor(index / level.width) + 0.5);
    }
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
    start(onFrame) {
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1);
        const state = onFrame(dt);
        syncRestingItems(state);
        syncChefs(state, dt, clock.elapsedTime);
        syncHighlight(state);
        for (const mesh of popping) {
          const scale = mesh.scale.x + (1 - mesh.scale.x) * (1 - Math.exp(-20 * dt));
          mesh.scale.setScalar(scale);
          if (scale > 0.995) popping.delete(mesh);
        }
        renderer.render(scene, camera);
      });
    },
  };
}
