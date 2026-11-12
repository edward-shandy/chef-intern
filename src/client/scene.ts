import * as THREE from "three";
import { GRID_H, GRID_W } from "../shared/constants";

const COLORS = {
  background: 0x2a2338,
  tileA: "#f1dfc4",
  tileB: "#e2c9a6",
  counter: 0xb9764a,
  worktop: 0xf6efe2,
  apron: 0xfafafa,
  skin: 0xf2c29b,
  shirt: 0xe4573d,
};

function createFloor(): THREE.Mesh {
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
  texture.repeat.set(GRID_W / 2, GRID_H / 2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_W, GRID_H),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

// Counters ring the kitchen edge for now; real layouts arrive with level data.
function createCounters(): THREE.Group {
  const cells: Array<[number, number]> = [];
  for (let x = 0; x < GRID_W; x++) {
    for (let z = 0; z < GRID_H; z++) {
      const edge = x === 0 || z === 0 || x === GRID_W - 1 || z === GRID_H - 1;
      if (edge) cells.push([x, z]);
    }
  }

  const base = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.96, 0.8, 0.96),
    new THREE.MeshStandardMaterial({ color: COLORS.counter, roughness: 0.7 }),
    cells.length,
  );
  const top = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.12, 1),
    new THREE.MeshStandardMaterial({ color: COLORS.worktop, roughness: 0.4 }),
    cells.length,
  );

  const matrix = new THREE.Matrix4();
  cells.forEach(([x, z], i) => {
    const wx = x - GRID_W / 2 + 0.5;
    const wz = z - GRID_H / 2 + 0.5;
    base.setMatrixAt(i, matrix.makeTranslation(wx, 0.4, wz));
    top.setMatrixAt(i, matrix.makeTranslation(wx, 0.86, wz));
  });

  for (const mesh of [base, top]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  const group = new THREE.Group();
  group.add(base, top);
  return group;
}

function createChef(): THREE.Group {
  const chef = new THREE.Group();
  const part = (geometry: THREE.BufferGeometry, color: number, y: number) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    mesh.position.y = y;
    mesh.castShadow = true;
    chef.add(mesh);
  };

  part(new THREE.CapsuleGeometry(0.3, 0.35, 6, 16), COLORS.shirt, 0.5);
  part(new THREE.SphereGeometry(0.26, 24, 16), COLORS.skin, 1.08);
  part(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 20), COLORS.apron, 1.36);
  part(new THREE.SphereGeometry(0.25, 20, 12), COLORS.apron, 1.52);
  return chef;
}

// Builds the starter kitchen and starts rendering into the given canvas.
export function startScene(canvas: HTMLCanvasElement): void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 17, 12);
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

  const chef = createChef();
  scene.add(createFloor(), createCounters(), chef);

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    chef.position.y = Math.abs(Math.sin(t * 3)) * 0.06;
    chef.rotation.y = Math.sin(t * 0.8) * 0.5;
    renderer.render(scene, camera);
  });
}
