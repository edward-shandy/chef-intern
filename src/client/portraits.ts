import * as THREE from "three";
import { CHARACTERS } from "../shared/characters";
import type { PlayerState } from "../shared/sim";
import { animateChef, createChef } from "./chef";

// Little 3D portraits of every chef for the lobby, rendered once from the real models so they match the game.
const portraits = new Map<string, string>();
const listeners = new Set<() => void>();

export const portraitOf = (id: string): string | null => portraits.get(id) ?? null;

// Calls back once the portraits are ready (straight away if they already are); returns an unsubscribe.
export function onPortraits(callback: () => void): () => void {
  if (portraits.size > 0) callback();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

const SIZE = 256;

// Needs the chef models and their props loaded first.
export function renderPortraits(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5a7c, 1.4));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(-1.5, 3, 3);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.2);
  rim.position.set(2, 2, -2);
  scene.add(key, rim);
  // Head and shoulders, seen a little from the side, with the toque in frame.
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  camera.position.set(0.6, 1.12, 2.6);
  camera.lookAt(0, 0.86, 0);

  for (const { id } of CHARACTERS) {
    const rig = createChef(0, false, id);
    // Only the figure: no floor shadow or seat ring.
    rig.group.children.forEach((child, i) => (child.visible = i === 0));
    rig.group.rotation.y = 0.25;
    animateChef(rig, IDLE_POSE, 0.5);
    scene.add(rig.group);
    renderer.render(scene, camera);
    portraits.set(id, renderer.domElement.toDataURL("image/png"));
    scene.remove(rig.group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  for (const listener of listeners) listener();
}

// A chef standing still with empty hands, for posing the portraits.
const IDLE_POSE: PlayerState = {
  id: 0,
  name: "",
  character: "knight",
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  facing: 0,
  held: null,
  chopping: false,
  washing: false,
  spraying: false,
  dashTime: 0,
  dashCooldown: 0,
};
