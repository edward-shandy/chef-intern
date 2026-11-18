# Chef Intern — Modular 3D Prop Kit

This kit contains original, self-contained GLB game props generated for the Chef Intern prototype. They are separate assets and are not yet wired into the game client.

## Contents

For a visual contact sheet rendered from the GLB geometry, see `restaurant-assets-preview.png`.

- `fridge_cream.glb`, `fridge_double.glb`, `fridge_retro.glb`, `fridge_pro.glb`
- `sink_single.glb`, `sink_wood_double.glb`, `sink_industrial.glb`, `sink_farmhouse.glb`
- `plant_pink.glb`, `plant_blossom.glb`, `plant_bamboo.glb`, `plant_tropical.glb`, `plant_lime.glb`, `plant_succulent.glb`
- `kitchen-floor-checker.glb` — 4 × 4 patch of cream and sage ceramic tiles.
- `dining-set-gingham.glb` — gingham dining table with four wooden chairs.
- `counter-front-oak.glb` — two-door oak cabinet section with brass pulls.
- `kitchen-halfwall-brick.glb` — brick half-wall segment with end piers and cap.
- `wall-dressing-panel.glb` — framed food art, spice shelf, jars, and a sconce.
- `dining-detail-pack.glb` — A-frame menu sign, condiment tray, and candle.

All meshes use embedded geometry and simple PBR color materials; there are no external texture dependencies. Assets are authored at approximately one game-tile scale (plants and fridges are taller props; sinks are counter-height props). The six restaurant refresh props are sized as modular decor: the floor patch covers 4 × 4 tiles, the cabinet and wall segments are 2 tiles wide, and the dining props are tabletop or wall scale. Models are original procedural assets and do not include third-party content.

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
