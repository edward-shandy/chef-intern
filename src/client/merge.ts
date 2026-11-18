import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// How big a patch of floor (in tiles) shares one merged mesh per look. One mesh for a whole room is never culled, so
// everything off screen (and outside the sun's shadow box) would still be drawn; patches keep culling working.
const CELL = 12;

// Merges a subtree of things that never move into one mesh per look (same material colour, gloss and glow) per patch
// of floor, so a room full of walls, tables, lamps and props costs a few dozen draw calls instead of thousands, while
// parts off screen are still skipped. Materials are reused from the source meshes, so loaded props keep sharing them.
export function mergeStatic(root: THREE.Object3D, castShadow: boolean): THREE.Group {
  const centre = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  root.traverse((child) => {
    // Sprites, points, instanced and skinned meshes cannot be merged; they are carried over as they are.
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child instanceof THREE.SkinnedMesh) {
      if (child !== root && (child instanceof THREE.Sprite || child instanceof THREE.Points || child instanceof THREE.InstancedMesh)) keep.push(child);
      return;
    }
    if (Array.isArray(child.material)) {
      keep.push(child);
      return;
    }
    const material = child.material as THREE.MeshStandardMaterial;
    if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
    centre.copy(child.geometry.boundingSphere!.center).applyMatrix4(child.matrixWorld);
    const key = [
      Math.floor(centre.x / CELL),
      Math.floor(centre.z / CELL),
      material.name,
      material.type,
      material.color?.getHexString(),
      material.emissive?.getHexString(),
      material.emissiveIntensity,
      material.roughness,
      material.metalness,
      material.map?.uuid,
      material.transparent,
      material.opacity,
      material.side,
      child.geometry.index ? "i" : "n",
      Object.keys(child.geometry.attributes).sort().join(","),
    ].join("|");
    const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
    // A mirrored transform flips the winding; such parts keep their own mesh rather than render inside out.
    if (child.matrixWorld.determinant() < 0) {
      keep.push(child);
      geometry.dispose();
      return;
    }
    const bucket = buckets.get(key) ?? { material, parts: [] };
    bucket.parts.push(geometry);
    buckets.set(key, bucket);
  });
  const merged = new THREE.Group();
  for (const { material, parts } of buckets.values()) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    merged.add(mesh);
  }
  // Anything that could not be merged keeps its place in the world.
  for (const thing of keep) merged.attach(thing);
  return merged;
}
