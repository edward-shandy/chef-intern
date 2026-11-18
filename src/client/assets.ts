import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
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

// ---------------------------------------------------------------- freeing GPU memory

// Geometries, materials and textures that many objects share for the whole visit (the KayKit pack, loaded props and
// chefs, cached textures). Releasing a subtree never frees these, only what that subtree owned by itself.
const shared = new WeakSet<object>();

export function markShared(...things: Array<object | null | undefined>): void {
  for (const thing of things) if (thing) shared.add(thing);
}

// Marks everything an object (and its children) is made of as shared: used on loaded models that get cloned.
export function markTreeShared(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    markShared(mesh.geometry);
    for (const material of materialsOf(mesh)) {
      markShared(material);
      for (const key of TEXTURE_KEYS) markShared((material as unknown as Record<string, THREE.Texture | null>)[key]);
    }
  });
}

const TEXTURE_KEYS = ["map", "normalMap", "emissiveMap", "roughnessMap", "metalnessMap", "alphaMap", "aoMap", "bumpMap", "lightMap", "displacementMap"];

const materialsOf = (mesh: THREE.Mesh): THREE.Material[] =>
  mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];

// Frees the GPU memory of everything in a subtree that was removed from the scene for good: its own geometries,
// materials and textures (including shader uniforms holding textures), but nothing marked shared. Without this,
// every change of kitchen left the old one's buffers on the GPU, and memory grew all visit long.
export function releaseTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && !shared.has(mesh.geometry)) mesh.geometry.dispose();
    for (const material of materialsOf(mesh)) {
      if (shared.has(material)) continue;
      const fields = material as unknown as Record<string, unknown> & { uniforms?: Record<string, { value: unknown }> };
      for (const key of TEXTURE_KEYS) {
        const texture = fields[key] as THREE.Texture | null | undefined;
        if (texture?.isTexture && !shared.has(texture)) texture.dispose();
      }
      for (const uniform of Object.values(fields.uniforms ?? {})) {
        const texture = uniform.value as THREE.Texture | null;
        if (texture?.isTexture && !shared.has(texture)) texture.dispose();
      }
      material.dispose();
    }
  });
}

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
  markShared(palette, palette.map, burnt, ...geometries.values());
}

// Original decoration props generated for this project, repacked into public/props by scripts/repack_glb.py.
const props = new Map<string, THREE.Object3D>();

// Loads the named decoration props; one that fails is simply left out, since nothing depends on it.
export async function loadProps(names: string[]): Promise<void> {
  const loader = new GLTFLoader();
  // The Blender-built props (scripts/blender) are Draco-compressed; the decoder lives in public/draco.
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader.setDRACOLoader(draco);
  await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`/props/${name}.glb`);
        gltf.scene.traverse((child) => {
          child.castShadow = true;
          child.receiveShadow = true;
        });
        markTreeShared(gltf.scene);
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
