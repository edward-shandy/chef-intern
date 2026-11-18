import * as THREE from "three";
import { CHARACTERS } from "../shared/characters";
import type { PlayerState } from "../shared/sim";
import { animateChef, createChef, poseChef, type ResultPose } from "./chef";

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
  onPad: -1,
  stats: { served: 0, chopped: 0, washed: 0, doused: 0 },
  voice: false,
};

// ---------------------------------------------------------------- results poses

const POSE_SIZE = 320;
// Frames of each results animation; the screen flips through them, a little like a cartoon flip-book.
export const POSE_FRAMES = 8;
const poseFrames = new Map<string, string[]>();
let poseRenderer: THREE.WebGLRenderer | null = null;
let poseScene: THREE.Scene | null = null;
let poseCamera: THREE.PerspectiveCamera | null = null;

// Whole-body frames of a chef cheering or crying, rendered from the real model the first time they are asked for
// and kept after that. The renderer is made once and reused, so a game over costs a few dozen small renders.
export function posesOf(character: string, pose: ResultPose): string[] {
  const key = `${character}:${pose}`;
  const cached = poseFrames.get(key);
  if (cached) return cached;
  if (!poseRenderer || !poseScene || !poseCamera) {
    poseRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    poseRenderer.setSize(POSE_SIZE, POSE_SIZE, false);
    poseRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    poseRenderer.toneMappingExposure = 1.05;
    poseScene = new THREE.Scene();
    poseScene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5a7c, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(-1.5, 3, 3);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
    rim.position.set(2, 2, -2);
    poseScene.add(key, rim);
    // Head to toe, with room above for arms thrown up in a cheer.
    poseCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    poseCamera.position.set(0.45, 1.0, 3.3);
    poseCamera.lookAt(0, 0.72, 0);
  }
  const rig = createChef(0, false, character);
  rig.group.children.forEach((child, i) => (child.visible = i === 0));
  rig.group.rotation.y = 0.2;
  poseScene.add(rig.group);
  const frames: string[] = [];
  for (let i = 0; i < POSE_FRAMES; i++) {
    // A cheer is spread over its whole clip; a sob loops over a short shake of the shoulders.
    poseChef(rig, pose, pose === "cheer" ? 0.15 + i * 0.16 : i * (0.7 / POSE_FRAMES));
    poseRenderer.render(poseScene, poseCamera);
    frames.push(poseRenderer.domElement.toDataURL("image/png"));
  }
  poseScene.remove(rig.group);
  poseFrames.set(key, frames);
  return frames;
}
