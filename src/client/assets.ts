import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// KayKit Restaurant Bits models (CC0) served from public/models.
const MODEL_NAMES = [
  "kitchencounter_straight_A",
  "stove_single",
  "pot_A",
  "pot_A_stew",
  "pot_B_stew",
  "stew_bowl",
  "plate",
  "plate_dirty",
  "kitchencounter_sink",
  "food_stew",
  "crate_tomatoes",
  "crate_lettuce",
  "crate_onions",
  "cuttingboard",
  "knife",
  "dishrack_plates",
  "food_ingredient_tomato",
  "food_ingredient_tomato_slices",
  "food_ingredient_tomato_slice",
  "food_ingredient_lettuce",
  "food_ingredient_lettuce_chopped",
  "food_ingredient_lettuce_slice",
  "food_ingredient_onion",
  "food_ingredient_onion_chopped",
  "wall",
  "wall_window_open",
  "shelf_papertowel_decorated",
] as const;

export type ModelName = (typeof MODEL_NAMES)[number];

// The pack is authored on a 2-unit grid, while our tiles are 1 unit wide.
export const MODEL_SCALE = 0.5;

const geometries = new Map<ModelName, THREE.BufferGeometry>();
let palette: THREE.MeshStandardMaterial | null = null;
let burnt: THREE.MeshStandardMaterial | null = null;

// Loads every model once; all of them share a single palette texture and material.
export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    MODEL_NAMES.map(async (name) => {
      const gltf = await loader.loadAsync(`/models/${name}.gltf`);
      gltf.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || geometries.has(name)) return;
        geometries.set(name, child.geometry);
        palette ??= child.material as THREE.MeshStandardMaterial;
      });
    }),
  );
  if (!palette || geometries.size !== MODEL_NAMES.length) throw new Error("Some kitchen models failed to load");
  palette.roughness = 0.7;
  burnt = palette.clone();
  burnt.color.setHex(0x3a3232);
}

// Original decoration props generated for this project, repacked into public/props by scripts/repack_glb.py.
const props = new Map<string, THREE.Object3D>();

// Loads the named decoration props; one that fails is simply left out, since nothing depends on it.
export async function loadProps(names: string[]): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`/props/${name}.glb`);
        gltf.scene.traverse((child) => {
          child.castShadow = true;
          child.receiveShadow = true;
        });
        props.set(name, gltf.scene);
      } catch (error) {
        console.warn(`Decoration ${name} failed to load`, error);
      }
    }),
  );
}

// A copy of a decoration prop, or null when it did not load.
export function decoration(name: string): THREE.Object3D | null {
  return props.get(name)?.clone() ?? null;
}

export const modelGeometry = (name: ModelName): THREE.BufferGeometry => geometries.get(name)!;

// The shared material, or its darkened twin for food that has been ruined.
export const modelMaterial = (ruined = false): THREE.MeshStandardMaterial => (ruined ? burnt! : palette!);

// A fresh mesh of a loaded model, in the pack's own units.
export function model(name: ModelName, ruined = false): THREE.Mesh {
  return new THREE.Mesh(modelGeometry(name), modelMaterial(ruined));
}
