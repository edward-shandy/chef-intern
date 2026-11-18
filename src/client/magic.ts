import * as THREE from "three";
import type { Level } from "../shared/level";
import { decoration } from "./assets";
import { canvasTexture, cylinder, mat, mesh, noise, shadowed } from "./models";

// The Wizard's Keep: a vaulted castle hall around the kitchen. Stone walls with stained-glass windows, timber
// beams, banners and torches stand behind it; feast tables full of wizards, bookcases, a great fireplace and an
// alchemist's corner fill the halls on either side; candles float overhead. A glowing magic stream pours out of an
// arch in the back wall and runs through the kitchen (the "chasm" tiles), which only thrown food can cross. The props
// are modelled in Blender by scripts/blender/make_magic_props.py; the stream, portals and floor are drawn here.

export const MAGIC_PROPS = [
  "magic_wall_arch",
  "magic_wall_window",
  "magic_wall_shelf",
  "magic_bookcase",
  "magic_cauldron",
  "magic_candelabra",
  "magic_candle_float",
  "magic_torch",
  "magic_banner_violet",
  "magic_banner_teal",
  "magic_banner_crimson",
  "magic_feast_table",
  "magic_wizard_violet",
  "magic_wizard_teal",
  "magic_wizard_crimson",
  "magic_wizard_emerald",
  "magic_herbs",
  "magic_globe",
  "magic_crystal_ball",
  "magic_potion_table",
  "magic_owl_perch",
  "magic_lectern",
  "magic_fireplace",
  "magic_chandelier",
  "magic_pillar",
  "magic_door",
  "magic_counter",
  "magic_wall_upper",
  "magic_wall_tapestry",
  "magic_wall_top",
  "magic_channel_wall",
  "magic_riverbed",
  "magic_culvert",
  "magic_bridge",
  "magic_rail_post",
  "magic_rail_rope",
];

const MARGIN = 6;
// How far the hall runs on in front of the kitchen: far enough that even a tall phone screen ends on floor.
const FRONT = 11;
// The walls rise in three tiers (a 2.7 ground storey, a 4.6 window storey and 5 of rafters), so the top of the
// screen is castle wall all the way up rather than the dark beyond.
const TIERS: Array<[number, (i: number) => string]> = [
  [2.7, (i) => (i % 2 ? "magic_wall_upper" : "magic_wall_tapestry")],
  [7.3, () => "magic_wall_top"],
];
// The stream's water surface and its bed, below the floor.
const WATER_Y = -0.22;
const BED_Y = -0.5;
const WIZARDS = ["magic_wizard_violet", "magic_wizard_teal", "magic_wizard_crimson", "magic_wizard_emerald"];
const BANNERS = ["magic_banner_violet", "magic_banner_teal", "magic_banner_crimson"];

export interface MagicView {
  tick(time: number): void;
}

// Columns of the kitchen that the stream runs down.
export const streamColumns = (level: Level): number[] =>
  [...new Set(level.tiles.flatMap((tile, index) => (tile.kind === "chasm" ? [index % level.width] : [])))].sort((a, b) => a - b);

// ---------------------------------------------------------------- the stream

// Ripples for the water: a tileable height field of overlapping waves, turned into a normal map.
let rippleTexture: THREE.CanvasTexture | null = null;
function ripples(): THREE.CanvasTexture {
  if (rippleTexture) return rippleTexture;
  const size = 128;
  const heights = new Float32Array(size * size);
  const tau = Math.PI * 2;
  const waves = [
    [1, 2, 0.5, 0.0],
    [3, 1, 0.3, 1.3],
    [2, 5, 0.22, 2.1],
    [5, 3, 0.16, 0.4],
    [7, 6, 0.1, 2.8],
    [4, 9, 0.08, 1.7],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      for (const [fx, fy, amp, phase] of waves) h += Math.sin(((x * fx + y * fy) / size) * tau + phase) * amp;
      heights[y * size + x] = h;
    }
  }
  rippleTexture = canvasTexture(size, size, (ctx) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = (dx: number, dy: number) => heights[((y + dy + size) % size) * size + ((x + dx + size) % size)];
        const nx = (at(-1, 0) - at(1, 0)) * 1.6;
        const ny = (at(0, -1) - at(0, 1)) * 1.6;
        const length = Math.hypot(nx, ny, 1);
        const i = (y * size + x) * 4;
        image.data[i] = ((nx / length) * 0.5 + 0.5) * 255;
        image.data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
        image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  rippleTexture.wrapS = rippleTexture.wrapT = THREE.RepeatWrapping;
  rippleTexture.colorSpace = THREE.NoColorSpace;
  return rippleTexture;
}

// The stream is an elixir: a glossy, slightly see-through potion (so the pebbly bed still shows) that glows from
// within in emerald, with violet swirls drifting downstream through it. Two copies of the ripple map slide
// downstream at different speeds and scales and are blended in the shader, so the surface never looks like one
// sliding picture; the glow stays under the bloom threshold, so it shines without glaring.
function waterMaterial(): THREE.MeshStandardMaterial {
  const map = ripples();
  const water = new THREE.MeshStandardMaterial({
    color: 0x1f7a62,
    emissive: 0x1fd69a,
    emissiveIntensity: 1,
    roughness: 0.06,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
    normalMap: map,
    normalScale: new THREE.Vector2(0.85, 0.85),
    // The room's environment reflects off the ripples, which gives the water its sheen.
    envMapIntensity: 2.2,
  });
  const flow = { value: 0 };
  water.userData.flow = flow;
  water.onBeforeCompile = (shader) => {
    shader.uniforms.flow = flow;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float flow;")
      .replace(
        "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
        `vec3 mapA = texture2D( normalMap, vNormalMapUv * vec2(1.0, 6.0) + vec2(0.0, flow * 0.55) ).xyz * 2.0 - 1.0;
         vec3 mapB = texture2D( normalMap, vNormalMapUv * vec2(1.7, 9.0) + vec2(0.37, flow * 0.95) ).xyz * 2.0 - 1.0;
         vec3 mapN = normalize( vec3( mapA.xy + mapB.xy, mapA.z * mapB.z ) );`,
      )
      // The glow: emerald everywhere, brighter mid-stream, with violet and pale-gold swirls flowing down it.
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         vec2 eu = vNormalMapUv;
         float along = eu.y * 120.0 - flow * 1.7;
         float s1 = sin(along + sin(eu.x * 7.0 + eu.y * 31.0 + flow * 0.6) * 2.2) * 0.5 + 0.5;
         float s2 = sin(eu.y * 47.0 - flow * 1.1 + eu.x * 5.0) * 0.5 + 0.5;
         float swirl = smoothstep(0.62, 1.0, s1) * (0.4 + 0.6 * s2) * 0.75;
         float mid = 1.0 - pow(abs(eu.x - 0.5) * 2.0, 2.0);
         vec3 emerald = vec3(0.05, 0.62, 0.42);
         vec3 violet = vec3(0.42, 0.16, 0.85);
         vec3 gold = vec3(0.7, 0.6, 0.25);
         vec3 glow = mix(emerald, violet, swirl * 0.85) + gold * pow(s2, 8.0) * 0.25;
         // Kept soft, so the pebbly bed and the ripples still show through the potion.
         totalEmissiveRadiance = glow * (0.2 + 0.2 * mid);`,
      );
  };
  return water;
}

// Foam along the banks: a broken white strip, densest against the stone, scrolling with the water.
function foamMaterial(): THREE.MeshBasicMaterial {
  const map = canvasTexture(64, 256, (ctx) => {
    for (let i = 0; i < 260; i++) {
      const x = Math.pow(noise(i * 3.1), 2.2) * 64;
      const y = noise(i * 7.7 + 2) * 256;
      const r = 1.5 + noise(i * 1.3) * 5 * (1 - x / 64);
      ctx.fillStyle = `rgba(235, 255, 250, ${0.25 + (1 - x / 64) * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 20);
  return new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.55, depthWrite: false });
}

// A swirl of light filling a portal: spiral arms turning round the middle in the pair's colour, white at the core.
function portalMaterial(colour: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      tint: { value: new THREE.Color(colour) },
      // Middle and half-size of the shape the swirl fills, in its own units.
      centre: { value: new THREE.Vector2(0, 0) },
      size: { value: new THREE.Vector2(0.4, 0.4) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 tint;
      uniform vec2 centre;
      uniform vec2 size;
      varying vec2 vPos;
      void main() {
        vec2 p = (vPos - centre) / size;
        float r = length(p);
        float angle = atan(p.y, p.x);
        float arms = sin(angle * 3.0 + r * 9.0 - time * 3.5) * 0.5 + 0.5;
        float core = smoothstep(0.55, 0.0, r);
        vec3 colour = tint * (0.45 + arms * 0.6) + vec3(0.9) * core * 0.45;
        float alpha = clamp(1.15 - r * 0.5, 0.0, 1.0) * (0.75 + arms * 0.25);
        gl_FragColor = vec4(colour, alpha);
      }
    `,
  });
}

// The pointed opening of a magic door, as a flat shape the swirl fills (matches the Blender door's arch).
function archShape(width: number, spring: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const r = width;
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, spring);
  shape.absarc(-width / 2, spring, r, 0, Math.PI / 3, false);
  shape.absarc(width / 2, spring, r, (Math.PI * 2) / 3, Math.PI, false);
  shape.lineTo(-width / 2, 0);
  return new THREE.ShapeGeometry(shape, 12);
}

// A magic door on a teleport tile. With a counter or wall beside it, a stone archway stands against that side with
// the swirl inside; out in the open it is a free-standing gold ring. Returns the group the scene animates.
export function createPortal(level: Level, index: number, colour: number): THREE.Group {
  const tx = index % level.width;
  const tz = Math.floor(index / level.width);
  const group = new THREE.Group();
  group.position.set(tx + 0.5, 0, tz + 0.5);
  const solid = (dx: number, dz: number) => {
    const tile = level.tiles[(tz + dz) * level.width + tx + dx];
    return tx + dx < 0 || tx + dx >= level.width || !tile || (tile.kind !== "floor" && tile.kind !== "warp" && tile.kind !== "chasm");
  };
  // Only a wall or counter straight behind gets an archway (seen side-on, a door is hard to read from above).
  const behind = solid(0, -1) ? [0, -1] : undefined;
  const swirl = portalMaterial(colour);
  const door = behind ? decoration("magic_door") : null;
  if (door && behind) {
    // The door's back is towards that side, so it faces into the kitchen.
    group.rotation.y = Math.atan2(-behind[0], -behind[1]);
    door.position.z = 0.02;
    group.add(shadowed(door));
    const fill = new THREE.Mesh(archShape(0.64, 0.62), swirl);
    fill.position.set(0, 0.06, -0.36);
    swirl.uniforms.centre.value.set(0, 0.5);
    swirl.uniforms.size.value.set(0.32, 0.62);
    group.add(fill);
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 10, 40), mat(0xf2c45a, 0.3, 0.85));
    ring.position.y = 0.62;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.38, 40), swirl);
    fill.position.y = 0.62;
    swirl.uniforms.size.value.set(0.38, 0.38);
    const base = mesh(cylinder(0.32, 0.36, 0.06, 24), mat(0xb3b5c6, 0.85), 0, 0.03, 0);
    group.add(shadowed(ring), fill, shadowed(base));
  }
  // A ring of runes glowing on the floor in front, in the pair's colour.
  const runes = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(1.3), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.012;
  group.add(runes);
  group.userData = { swirl, runes };
  return group;
}

export function animatePortal(portal: THREE.Group, time: number, i: number): void {
  const { swirl, runes } = portal.userData as { swirl: THREE.ShaderMaterial; runes: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> };
  swirl.uniforms.time.value = time + i * 1.7;
  runes.rotation.z = time * 0.6;
  runes.material.opacity = 0.45 + Math.sin(time * 3 + i) * 0.15;
}

// ---------------------------------------------------------------- floors

// Grey flagstones laid in rows, each with its own shade and wear, and a crimson carpet with a gold border running
// under each feast table. Columns of the stream are cut out (alpha 0), so the water shows through below.
function hallFloorTexture(span: number, depth: number, x0: number, z0: number, holes: number[], carpets: Array<[number, number, number, number]>): THREE.CanvasTexture {
  const px = 40;
  const texture = canvasTexture(span * px, depth * px, (ctx) => {
    ctx.fillStyle = "#3e3f52";
    ctx.fillRect(0, 0, span * px, depth * px);
    for (let row = 0; row < depth * 2; row++) {
      let x = (row % 2) * 0.5;
      while (x < span) {
        const w = 1 + noise(row * 13 + x * 7) * 0.8;
        const seed = row * 31 + Math.floor(x * 10);
        const shade = 118 + noise(seed) * 34;
        ctx.fillStyle = `rgb(${shade - 6}, ${shade - 3}, ${shade + 14})`;
        ctx.fillRect(x * px + 2, row * 0.5 * px + 2, w * px - 4, 0.5 * px - 4);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + noise(seed + 3) * 0.05})`;
        ctx.fillRect(x * px + 3, row * 0.5 * px + 3, w * px - 6, 3);
        x += w;
      }
    }
    for (const [cx, cz, w, d] of carpets) {
      const left = (cx - w / 2 - x0) * px;
      const top = (cz - d / 2 - z0) * px;
      ctx.fillStyle = "#d8a548";
      ctx.fillRect(left, top, w * px, d * px);
      ctx.fillStyle = "#7e2433";
      ctx.fillRect(left + 6, top + 6, w * px - 12, d * px - 12);
      ctx.strokeStyle = "rgba(216, 165, 72, 0.7)";
      ctx.lineWidth = 3;
      ctx.strokeRect(left + 16, top + 16, w * px - 32, d * px - 32);
      // A row of little gold diamonds down the middle.
      ctx.fillStyle = "#d8a548";
      for (let k = top + 36; k < top + d * px - 30; k += 34) {
        const mid = left + (w * px) / 2;
        ctx.beginPath();
        ctx.moveTo(mid, k - 9);
        ctx.lineTo(mid + 7, k);
        ctx.lineTo(mid, k + 9);
        ctx.lineTo(mid - 7, k);
        ctx.fill();
      }
    }
    // The stream's channels are left open.
    for (const column of holes) ctx.clearRect((column - x0) * px, 0, px, depth * px);
  });
  return texture;
}

// ---------------------------------------------------------------- the hall

export function createMagic(level: Level): { group: THREE.Group; view: MagicView } {
  const group = new THREE.Group();
  const solid = new THREE.Group();
  const { width, height } = level;
  const span = width + MARGIN * 2;
  const depth = height + FRONT + 0.5;
  const x0 = -MARGIN;
  const z0 = -0.5;
  const leftHall = -MARGIN / 2;
  const rightHall = width + MARGIN / 2;
  const columns = streamColumns(level);
  const ticks: Array<(time: number) => void> = [];
  const place = (name: string, x: number, y: number, z: number, turn = 0, scale = 1) => {
    const prop = decoration(name);
    if (!prop) return null;
    prop.position.set(x, y, z);
    prop.rotation.y = turn;
    prop.scale.setScalar(scale);
    solid.add(prop);
    return prop;
  };

  // Floor: flagstones everywhere but under the kitchen (which has its own floor), carpets under the tables.
  // Tables run down the side halls ("z") and across the front of the hall ("x").
  const tables: Array<[number, number, "x" | "z"]> = [
    [leftHall, 3.2, "z"],
    [leftHall, 8.4, "z"],
    [leftHall, 13.8, "z"],
    [rightHall, 3.2, "z"],
    [rightHall, 8.4, "z"],
    [rightHall, 13.8, "z"],
    [2.4, height + 6.8, "x"],
    [width - 2.4, height + 6.8, "x"],
  ];
  const floorMap = hallFloorTexture(
    span,
    depth,
    x0,
    z0,
    columns,
    tables.map(([x, z, along]) => (along === "z" ? [x, z, 2.6, 4.2] : [x, z, 4.2, 2.6])),
  );
  floorMap.colorSpace = THREE.SRGBColorSpace;
  const floor = mesh(new THREE.PlaneGeometry(span, depth), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.85, alphaTest: 0.5 }), x0 + span / 2, -0.01, z0 + depth / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Back wall: two-tile stretches of stone, windows and niches alternating, with the fireplace in the left hall and
  // a bookcase wall in the right one. Torches on the posts between, banners down the dining halls.
  const panels = Math.ceil(span / 2);
  for (let i = 0; i < panels; i++) {
    const x = x0 + 1 + i * 2;
    const inLeft = Math.abs(x - leftHall) < 1.01;
    const inRight = Math.abs(x - rightHall) < 1.01;
    const name = inLeft ? "magic_fireplace" : inRight ? "magic_wall_shelf" : i % 2 ? "magic_wall_window" : "magic_wall_arch";
    place(name, x, 0, inLeft ? -0.62 : -0.38);
    if (inLeft) place("magic_wall_arch", x, 0, -0.98);
    for (const [y, tier] of TIERS) place(tier(i), x, y, inLeft ? -0.98 : -0.38);
    if (i > 0) place("magic_torch", x - 1, 1.55, -0.3);
    if (x < -0.5 || x > width + 0.5) {
      if (!inLeft && !inRight) place(BANNERS[i % BANNERS.length], x, 2.3, -0.24);
    }
  }
  // Side walls, running the depth of the hall.
  for (let z = 0.6; z < depth + 1; z += 2) {
    const k = Math.round(z / 2);
    place(k % 2 ? "magic_wall_shelf" : "magic_wall_window", x0 - 0.05, 0, z + 0.4, Math.PI / 2);
    place(k % 2 ? "magic_wall_window" : "magic_wall_shelf", x0 + span + 0.05, 0, z + 0.4, -Math.PI / 2);
    for (const [y, tier] of TIERS) {
      place(tier(k), x0 - 0.05, y, z + 0.4, Math.PI / 2);
      place(tier(k + 1), x0 + span + 0.05, y, z + 0.4, -Math.PI / 2);
    }
  }
  // Pillars mark the kitchen's back corners and the front corners of the hall.
  for (const [x, z] of [
    [-0.75, -0.05],
    [width + 0.75, -0.05],
    [x0 + 0.45, 11.2],
    [x0 + span - 0.45, 11.2],
    [x0 + 0.45, depth + z0 - 0.6],
    [x0 + span - 0.45, depth + z0 - 0.6],
  ]) {
    place("magic_pillar", x, 0, z);
  }

  // Feast tables down each hall, wizards on the benches facing their plates.
  tables.forEach(([x, z, along], t) => {
    const set = new THREE.Group();
    const table = decoration("magic_feast_table");
    if (!table) return;
    set.add(table);
    for (const side of [-1, 1]) {
      const seats = [-1.15, -0.35, 0.45, 1.2];
      seats.forEach((along, s) => {
        if (noise(t * 17 + s * 5 + (side > 0 ? 3 : 0)) < 0.28) return;
        const wizard = decoration(WIZARDS[(t + s * 3 + (side > 0 ? 1 : 0)) % WIZARDS.length]);
        if (!wizard) return;
        wizard.position.set(along, 0.42, side * 0.76);
        wizard.rotation.y = side > 0 ? Math.PI : 0;
        wizard.scale.setScalar(0.66);
        wizard.userData.restY = 0.42;
        set.add(wizard);
        ticks.push((time) => {
          wizard.position.y = 0.42 + Math.abs(Math.sin(time * 1.6 + t * 3 + s)) * 0.012;
          wizard.rotation.z = Math.sin(time * 0.9 + s * 2 + t) * 0.04;
        });
      });
    }
    set.position.set(x, 0, z);
    set.rotation.y = along === "z" ? Math.PI / 2 : 0;
    solid.add(set);
    place("magic_chandelier", x, 3.9, z);
  });

  // The left hall: the fireplace's cauldron, an owl, an alchemist's table and a bookcase; the right hall: a crystal
  // ball, a lectern, a globe, another bookcase and potions. Candelabras light the walk between the tables.
  place("magic_cauldron", leftHall + 1.9, 0, 1.0);
  place("magic_bookcase", x0 + 0.35, 0, 5.8, Math.PI / 2);
  place("magic_potion_table", x0 + 0.5, 0, 10.0, Math.PI / 2);
  place("magic_owl_perch", leftHall - 1.3, 0, 11.6, 0.4);
  place("magic_globe", -0.9, 0, 11.6);
  place("magic_crystal_ball", rightHall - 1.6, 0, 1.0);
  place("magic_lectern", rightHall + 1.5, 0, 1.0, -0.3);
  place("magic_bookcase", x0 + span - 0.35, 0, 5.8, -Math.PI / 2);
  place("magic_potion_table", x0 + span - 0.5, 0, 10.0, -Math.PI / 2);
  place("magic_globe", width + 0.9, 0, 11.6);
  place("magic_cauldron", rightHall + 1.3, 0, 11.6);
  for (const x of [leftHall, rightHall]) {
    place("magic_candelabra", x - 1.25, 0, 5.8);
    place("magic_candelabra", x + 1.25, 0, 5.8);
    place("magic_candelabra", x - 1.25, 0, 11.1);
    place("magic_candelabra", x + 1.25, 0, 11.1);
  }
  // In front of the kitchen: a stone bridge over each stream, candelabras along the walk, an owl and a lectern.
  for (const column of columns) place("magic_bridge", column + 0.5, 0, height + 3.4);
  place("magic_owl_perch", 1.2, 0, height + 3.0, 0.3);
  place("magic_lectern", width - 1.2, 0, height + 3.0, -0.3);
  place("magic_crystal_ball", x0 + 1.4, 0, depth + z0 - 1.6);
  place("magic_potion_table", x0 + span - 1.5, 0, depth + z0 - 1.6, -0.2);

  // Candles float above the halls and along the back of the kitchen, bobbing slowly. They are instanced: one draw
  // call per material for all of them.
  const candle = decoration("magic_candle_float");
  if (candle) {
    const spots: Array<[number, number, number]> = [];
    for (let i = 0; i < 110; i++) {
      const x = x0 + 0.6 + noise(i * 3.1) * (span - 1.2);
      const z = 0.3 + noise(i * 7.7 + 1) * (depth - 2);
      // Keep the air above the kitchen clear, apart from a row along its back wall.
      if (x > -0.2 && x < width + 0.2 && z > 1.2) continue;
      spots.push([x, 2.5 + noise(i * 5.3 + 2) * 1.0, z]);
    }
    const parts: THREE.InstancedMesh[] = [];
    candle.updateMatrixWorld(true);
    candle.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const instanced = new THREE.InstancedMesh(child.geometry, child.material, spots.length);
      instanced.userData.local = child.matrixWorld.clone();
      parts.push(instanced);
      group.add(instanced);
    });
    const matrix = new THREE.Matrix4();
    const placeCandles = (time: number) => {
      spots.forEach(([x, y, z], i) => {
        matrix.makeTranslation(x, y + Math.sin(time * 0.8 + i * 1.3) * 0.08, z);
        for (const part of parts) part.setMatrixAt(i, matrix.clone().multiply(part.userData.local as THREE.Matrix4));
      });
      for (const part of parts) part.instanceMatrix.needsUpdate = true;
    };
    placeCandles(0);
    ticks.push(placeCandles);
  }

  // The stream: clear dark-green water in a stone channel, its pebbly bed showing through. It flows out of a low
  // culvert at the foot of the back wall, runs through the kitchen and on under a bridge to the front of the hall.
  // The surface is a real lit material with two layers of ripples sliding downstream (so lights glint on it), foam
  // runs along the banks, and a few motes drift up off it.
  const water = waterMaterial();
  const foam = foamMaterial();
  const length = depth + 0.2;
  const midZ = z0 + length / 2 - 0.1;
  for (const column of columns) {
    const x = column + 0.5;
    const surface = mesh(new THREE.PlaneGeometry(1, length, 1, 1), water, x, WATER_Y, midZ);
    surface.rotation.x = -Math.PI / 2;
    surface.receiveShadow = true;
    group.add(surface);
    for (const side of [-1, 1]) {
      const edge = mesh(new THREE.PlaneGeometry(0.16, length), foam, x + side * 0.42, WATER_Y + 0.004, midZ);
      edge.rotation.x = -Math.PI / 2;
      edge.rotation.z = side > 0 ? Math.PI : 0;
      group.add(edge);
    }
    for (let z = Math.floor(z0); z < z0 + length; z++) {
      place("magic_riverbed", x, BED_Y, z + 0.5, (z % 4) * (Math.PI / 2));
      // A hair below the floor: level with it, the bank's top flickered against the floor (z-fighting).
      place("magic_channel_wall", column, -0.02, z + 0.5, Math.PI);
      place("magic_channel_wall", column + 1, -0.02, z + 0.5, 0);
    }
    place("magic_culvert", x, 0, 0.22);

    // A rope rail along each bank: oak posts with brass knobs every tile, rope sagging between them. Posts stand only
    // where the bank is open floor (not against a counter), with a gap at the bridge.
    for (const side of [-1, 1]) {
      const postX = side < 0 ? column - 0.1 : column + 1.1;
      const besideX = side < 0 ? column - 1 : column + 1;
      const floorAt = (row: number) => {
        const tile = level.tiles[row * width + besideX];
        return tile?.kind === "floor" || tile?.kind === "warp";
      };
      // A post at z stands between rows z - 1 and z; in the kitchen both must be floor on its side.
      const open = (z: number) => {
        if (Math.abs(z - (height + 3.4)) < 0.9 || z > depth + z0 - 0.4) return false;
        if (z > height) return true;
        return z >= 1 && z < height && floorAt(z - 1) && floorAt(z);
      };
      for (let z = 1; z <= depth + z0; z++) {
        if (!open(z)) continue;
        place("magic_rail_post", postX, 0, z);
        if (open(z + 1)) place("magic_rail_rope", postX, 0, z + 0.5);
      }
    }

    // Bubbles rising to the surface and popping, scattered down the stream.
    const bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfffe6, emissive: 0x6dffc4, emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 }),
      28,
    );
    group.add(bubbles);
    const bubble = new THREE.Matrix4();
    ticks.push((time) => {
      for (let i = 0; i < 28; i++) {
        const life = (time * (0.35 + noise(i + column) * 0.3) + noise(i * 13 + column)) % 1;
        const bx = x + (noise(i * 3 + column * 7) - 0.5) * 0.7;
        const bz = z0 + noise(i * 5 + column * 3) * length - life * 0.6;
        // Grows as it rises, then pops at the top of its life.
        const size = life < 0.85 ? 0.4 + life : 0;
        bubble.makeScale(size, size * 0.8, size).setPosition(bx, WATER_Y + 0.01, bz);
        bubbles.setMatrixAt(i, bubble);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    });
    const glow = new THREE.PointLight(0x3fe0a0, 1.4, 5, 2);
    glow.position.set(x, 0.3, height / 2);
    group.add(glow);
    const count = 18;
    const positions = new Float32Array(count * 3);
    const motes = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
      new THREE.PointsMaterial({ color: 0xa8ffe6, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    group.add(motes);
    ticks.push((time) => {
      for (let i = 0; i < count; i++) {
        const phase = (time * 0.18 + noise(i * 9 + column)) % 1;
        positions[i * 3] = x + (noise(i * 3 + column) - 0.5) * 0.7 + Math.sin(time + i) * 0.04;
        positions[i * 3 + 1] = WATER_Y + phase * 0.9;
        positions[i * 3 + 2] = z0 + noise(i * 5 + column * 2) * length;
      }
      motes.geometry.attributes.position.needsUpdate = true;
    });
  }
  ticks.push((time) => {
    (water.userData.flow as { value: number }).value = time;
    foam.map!.offset.y = (time * 0.32) % 1;
  });

  // Warm light from the fireplace and the chandeliers, a soft one over the kitchen's back counters.
  const lights: Array<[number, number, number, number, number, number]> = [
    [leftHall, 0.9, 0.2, 0xff8a3a, 5, 6],
    [leftHall, 2.6, 6.5, 0xffc27a, 3.5, 10],
    [rightHall, 2.6, 6.5, 0xffc27a, 3.5, 10],
    [width / 2, 2.4, 1.0, 0xffcf8a, 3, 8],
    [width / 2, 2.6, height + 6, 0xffc27a, 3.5, 10],
  ];
  const fireplaceLight = new THREE.PointLight();
  lights.forEach(([x, y, z, colour, power, reach], i) => {
    const light = i === 0 ? fireplaceLight : new THREE.PointLight();
    light.color.setHex(colour);
    light.intensity = power;
    light.distance = reach;
    light.decay = 1.6;
    light.position.set(x, y, z);
    group.add(light);
  });
  ticks.push((time) => {
    fireplaceLight.intensity = 5 + Math.sin(time * 11) * 0.5 + Math.sin(time * 17.3) * 0.35;
  });

  group.add(shadowed(solid));
  return { group, view: { tick: (time) => ticks.forEach((tick) => tick(time)) } };
}

export function animateMagic(room: THREE.Group, time: number): void {
  (room.userData.magic as MagicView | undefined)?.tick(time);
}

// The castle kitchen's cabinet (Blender-built), as geometry and material pairs for instancing.
export function magicCounterParts(): Array<readonly [THREE.BufferGeometry, THREE.Material]> | null {
  const counter = decoration("magic_counter");
  if (!counter) return null;
  const parts: Array<readonly [THREE.BufferGeometry, THREE.Material]> = [];
  counter.traverse((child) => {
    if (child instanceof THREE.Mesh) parts.push([child.geometry, child.material as THREE.Material] as const);
  });
  return parts;
}
