import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Shared toolkit for everything outside the Orbit Diner: one sun direction, a small toon shader (a stepped light ramp
// plus a soft rim on the shadow side, nothing brighter than ~0.9 so the bloom pass leaves it alone), seeded noise and
// a few helpers for painting vertex colours and batching static geometry.

export const TAU = Math.PI * 2;
// One sun for every lit thing outside: up, a little to the left and towards the camera, like the diner's key light.
export const SUN = new THREE.Vector3(-0.65, 0.45, 0.2).normalize();
// Planets throw their shadow across their own ring and rubble: xyz centre, w radius (0 switches the shadow off).
export const PLANET_SHADOW = { value: new THREE.Vector4(0, 0, 0, 0) };
const SUN_UNIFORM = { value: SUN };

// ---- Seeded randomness ----------------------------------------------------------------------------------------

export function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const noise01 = (seed: number): number => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const hash3 = (x: number, y: number, z: number, seed: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return v - Math.floor(v);
};

// Smooth value noise in 3D, 0..1.
export function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function fbm3(x: number, y: number, z: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise3(x * freq, y * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

// ---- Canvas textures ------------------------------------------------------------------------------------------

export function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A smooth closed blob, radius wobbling with the seed, drawn as a path (fill or stroke it afterwards).
export function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number, points = 14, wobble = 0.45, squash = 1): void {
  const rand = rng(seed);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const r = radius * (1 - wobble * 0.5 + wobble * rand());
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % points];
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo((pts[points - 1][0] + p0[0]) / 2, (pts[points - 1][1] + p0[1]) / 2);
    ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  ctx.closePath();
}

export function glowTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
  return paint(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---- Toon material --------------------------------------------------------------------------------------------

export interface ToonOptions {
  color?: number;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  // Colour added on the shadow side as a soft rim, and how strongly.
  rim?: number;
  rimStrength?: number;
  // Multipliers for the dark and middle steps of the ramp (the lit step is 1).
  shadow?: [number, number, number];
  mid?: [number, number, number];
  transparent?: boolean;
  side?: THREE.Side;
  planetShadow?: boolean;
  // Where the lit step starts (dot with the sun); lower means more of the surface is lit.
  litAt?: number;
}

const TOON_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  varying vec3 vC;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vW = wp.xyz;
    vUv = uv;
    vC = vec3(1.0);
    #ifdef USE_COLOR
      vC = color.rgb;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vC *= instanceColor.rgb;
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uColor;
  uniform vec3 uShadowTone;
  uniform vec3 uMidTone;
  uniform vec3 uRim;
  uniform float uRimStrength;
  uniform float uLitAt;
  uniform vec4 uPlanet;
  #ifdef USE_MAP
    uniform sampler2D uMap;
  #endif
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  varying vec3 vC;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 V = normalize(cameraPosition - vW);
    float d = dot(n, uSun);
    #ifdef PSHADOW
      vec3 rel = vW - uPlanet.xyz;
      float t = dot(rel, uSun);
      float perp = length(rel - t * uSun);
      float inShadow = (1.0 - smoothstep(uPlanet.w * 0.96, uPlanet.w * 1.04, perp)) * step(t, 0.0) * step(0.5, uPlanet.w);
      d = mix(d, min(d, -0.4), inShadow);
    #endif
    // Four painted steps: deep shade, shade, mid, lit. The thin smoothstep only anti-aliases the edges.
    float w = 0.03;
    float s0 = smoothstep(-0.62 - w, -0.62 + w, d);
    float s1 = smoothstep(-0.08 - w, -0.08 + w, d);
    float s2 = smoothstep(uLitAt - w, uLitAt + w, d);
    vec3 tone = mix(uShadowTone * 0.82, uShadowTone, s0);
    tone = mix(tone, uMidTone, s1);
    tone = mix(tone, vec3(1.0), s2);
    vec3 base = uColor * vC;
    float alpha = 1.0;
    #ifdef USE_MAP
      vec4 tex = texture2D(uMap, vUv);
      base *= tex.rgb;
      #ifdef USE_ALPHA
        alpha = tex.a;
      #endif
    #endif
    vec3 col = base * tone;
    float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.4);
    col += uRim * rim * uRimStrength * (1.0 - 0.8 * s1);
    col = min(col, vec3(0.9));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function toonMaterial(options: ToonOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (options.map) defines.USE_MAP = "";
  if (options.map && options.transparent) defines.USE_ALPHA = "";
  if (options.planetShadow) defines.PSHADOW = "";
  const material = new THREE.ShaderMaterial({
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    defines,
    uniforms: {
      uSun: SUN_UNIFORM,
      uColor: { value: new THREE.Color(options.color ?? 0xffffff) },
      uMap: { value: options.map ?? null },
      uShadowTone: { value: new THREE.Vector3(...(options.shadow ?? [0.42, 0.4, 0.62])) },
      uMidTone: { value: new THREE.Vector3(...(options.mid ?? [0.7, 0.68, 0.84])) },
      uRim: { value: new THREE.Color(options.rim ?? 0x7fb8f0) },
      uRimStrength: { value: options.rimStrength ?? 0.32 },
      uLitAt: { value: options.litAt ?? 0.34 },
      uPlanet: PLANET_SHADOW,
    },
    transparent: options.transparent ?? false,
    side: options.side ?? THREE.FrontSide,
    vertexColors: options.vertexColors ?? false,
  });
  material.fog = false;
  return material;
}

// Flat glowing stuff (windows, engine glow, nav lights); stays at or under ~0.9 unless it is a blinking light.
export const glowMaterial = (hex: number, scale = 0.85): THREE.MeshBasicMaterial =>
  Object.assign(new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(scale) }), { fog: false });

// ---- Geometry helpers -----------------------------------------------------------------------------------------

const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

export type AoFn = (p: THREE.Vector3, n: THREE.Vector3) => number;

// Writes vertex colours: a base colour times a baked ambient occlusion factor.
export function colorize(geometry: THREE.BufferGeometry, hex: number, ao?: AoFn): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const out = new Float32Array(pos.count * 3);
  _c.setHex(hex);
  for (let i = 0; i < pos.count; i++) {
    const f = ao ? ao(_p.fromBufferAttribute(pos, i), _n.fromBufferAttribute(nor, i)) : 1;
    out[i * 3] = _c.r * f;
    out[i * 3 + 1] = _c.g * f;
    out[i * 3 + 2] = _c.b * f;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geometry;
}

// Underside-darkening AO for hull parts: faces looking down sit in the station's own shade.
export const hullAo: AoFn = (_p2, n) => 0.8 + 0.2 * Math.min(1, Math.max(0, n.y * 0.5 + 0.5));

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
export function xform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), _s.set(sx, sy, sz).clone());
}

// Collects static parts by material and merges each pile into one mesh.
export class Batch {
  private piles = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(material: THREE.Material, geometry: THREE.BufferGeometry, hex: number, matrix?: THREE.Matrix4, ao: AoFn = hullAo): this {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    colorize(g, hex, ao);
    if (matrix) g.applyMatrix4(matrix);
    let pile = this.piles.get(material);
    if (!pile) this.piles.set(material, (pile = []));
    pile.push(g);
    return this;
  }
  build(parent: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [material, pile] of this.piles) {
      const merged = mergeGeometries(pile, false);
      pile.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.frustumCulled = false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.piles.clear();
    return meshes;
  }
}
