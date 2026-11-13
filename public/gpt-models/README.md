# Chef Intern — Modular 3D Prop Kit

This kit contains 14 original, self-contained GLB game props generated for the Chef Intern prototype. They are separate assets and are not yet wired into the game client.

## Contents

- `fridge_cream.glb`, `fridge_double.glb`, `fridge_retro.glb`, `fridge_pro.glb`
- `sink_single.glb`, `sink_wood_double.glb`, `sink_industrial.glb`, `sink_farmhouse.glb`
- `plant_pink.glb`, `plant_blossom.glb`, `plant_bamboo.glb`, `plant_tropical.glb`, `plant_lime.glb`, `plant_succulent.glb`

All meshes use embedded geometry and simple PBR color materials; there are no external texture dependencies. Assets are authored at approximately one game-tile scale (plants and fridges are taller props; sinks are counter-height props). Models are original procedural assets and do not include third-party content.

## Three.js import example

```ts
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
loader.load("/assets/chef-intern/fridge_cream.glb", ({ scene: model }) => {
  model.position.set(tileX, 0, tileZ);
  model.scale.setScalar(1); // adjust after checking against the game's one-unit tile
  world.add(model);
});
```

Copy this folder to the game's `public/assets/chef-intern/` directory before using the URL above. In the current project, keep tile positions and gameplay stations authoritative in `src/shared/level.ts`; use these models as visual decoration or visual replacements only. Do not add the refrigerator or sink as gameplay stations unless the game rules are intentionally extended.

## Integration notes for Claude

- Load with Three.js `GLTFLoader`; keep a procedural fallback if asset loading fails.
- Check the model's orientation and scale against the existing camera and worktop height before batch placement.
- Plant props should sit outside walkable tiles or in decoration-only locations.
- Reuse loaded GLTF scenes via clones when placing more than one copy.
- These are first-pass low-poly assets. Review bevel style, normals, and proportions in the running scene and refine as needed.

## License

These are newly generated procedural meshes for this project, with no third-party models or textures included. You may modify and use them in Chef Intern.
