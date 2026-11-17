import * as THREE from "three";
import { PLANET_SHADOW, TAU, glowTexture, noise01, rng, toonMaterial } from "./spaceArt";
import { cloudTexture, crateTexture, galaxyTexture, heroTexture, homeTexture, moonTexture, nebulaTexture, ringTexture, tailTexture } from "./spacePaint";

// Everything beyond the station in the Orbit Diner, painted like a travel poster: a warm dessert-striped gas giant with
// a ring of ice, crates and tiny snacks; a small blue home planet; a cratered moon; stacked-paper nebulae, a spiral
// galaxy, a comet and shooting stars on a deep navy-to-violet sky. All of it is parked in a "frame" that sits where the
// game camera sits and looks where it looks, so the composition holds at any window shape (see layout()).
// Procedural only: textures at most 1024x512, merged or instanced shapes, nothing allocated per frame.

export interface SkyView {
  planet: THREE.Object3D;
  tick: (time: number) => void;
}

// Mirrors the camera framing in scene.ts (CAMERA_HOME, CAMERA_TARGET and the fit/framing maths on resize).
const CAMERA_HOME = new THREE.Vector3(0, 18, 12.2);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -0.7);
const VFOV = (35 * Math.PI) / 180;
const TAN_V = Math.tan(VFOV / 2);

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Deep navy low on the screen rising to violet towards the far edge, a faint warm haze up in the corner and a little
// dithering so the gradient never bands.
const DOME_FRAG = /* glsl */ `
  varying vec3 vDir;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float t = smoothstep(-0.3, -0.86, vDir.z);
    vec3 navy = vec3(0.012, 0.02, 0.07);
    vec3 mid = vec3(0.035, 0.03, 0.13);
    vec3 violet = vec3(0.1, 0.055, 0.22);
    vec3 col = mix(navy, mid, smoothstep(0.0, 0.5, t));
    col = mix(col, violet, smoothstep(0.35, 1.0, t));
    col += vec3(0.05, 0.02, 0.05) * smoothstep(0.1, 0.9, 1.0 - vDir.x) * t * 0.5;
    col *= 1.0 - 0.35 * smoothstep(0.2, 0.9, abs(vDir.x));
    col += (h(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixels;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = 0.78 + 0.22 * sin(uTime * aSpeed + aPhase);
    gl_PointSize = aSize * uPixels;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float a = (1.0 - smoothstep(0.35, 1.0, d)) * vTwinkle;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

// A soft four-point glint for the brightest stars; stays well under the bloom threshold.
const GLINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float cross = exp(-abs(p.x) * 38.0) * exp(-abs(p.y) * 2.6) + exp(-abs(p.y) * 38.0) * exp(-abs(p.x) * 2.6);
    float core = exp(-length(p) * 10.0);
    float a = clamp(cross * 0.55 + core * 0.8, 0.0, 1.0) * vTwinkle;
    gl_FragColor = vec4(vColor * a * 0.8, 1.0);
  }
`;

type Layout = [number, number, number];
interface Item {
  obj: THREE.Object3D;
  distance: number;
  land: Layout;
  port: Layout;
  flat: boolean; // sprites are sized by their full width, spheres by radius
}

export function createSky(group: THREE.Group, cx: number, cz: number): SkyView {
  const frame = new THREE.Group();
  group.add(frame);
  const items: Item[] = [];
  let tanH = TAN_V * 1.6;

  const place = (obj: THREE.Object3D, distance: number, land: Layout, port: Layout, flat = false) => {
    items.push({ obj, distance, land, port, flat });
    frame.add(obj);
    return obj;
  };
  const sprite = (map: THREE.Texture, opacity: number, order = 0): THREE.Sprite => {
    const s = new THREE.Sprite(Object.assign(new THREE.SpriteMaterial({ map, transparent: true, opacity, depthWrite: false }), { fog: false }));
    s.renderOrder = order;
    return s;
  };

  // ---- Sky dome and stars (drawn first, never fighting anything for depth) ----
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    Object.assign(new THREE.ShaderMaterial({ vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false }), { fog: false }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  frame.add(dome);

  const starUniforms = { uTime: { value: 0 }, uPixels: { value: 1 } };
  const makeStars = (count: number, sizes: [number, number], seed: number, fragment: string, glints = false): THREE.Points => {
    const r = rng(seed);
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    const tint = new THREE.Color();
    const palette = [0xe8ecf5, 0xcfdcff, 0xffe6c8, 0xe6d8ff, 0xc2ecff];
    for (let i = 0; i < count; i++) {
      // A patch of sky around the view direction, a little wider than any screen needs.
      const ax = (r() * 2 - 1) * 0.7;
      const ay = (r() * 2 - 1) * 0.55;
      const radius = 112 + r() * 12;
      positions.set([Math.sin(ax) * Math.cos(ay) * radius, Math.sin(ay) * radius, -Math.cos(ax) * Math.cos(ay) * radius], i * 3);
      tint.setHex(palette[i % palette.length]).multiplyScalar(glints ? 0.95 : 0.7 + r() * 0.25);
      colours.set([tint.r, tint.g, tint.b], i * 3);
      size[i] = sizes[0] + r() * (sizes[1] - sizes[0]);
      phase[i] = r() * TAU;
      speed[i] = 0.7 + r() * 2.2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colours, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    const points = new THREE.Points(
      geometry,
      Object.assign(new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: fragment, uniforms: starUniforms, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }), { fog: false }),
    );
    points.frustumCulled = false;
    points.renderOrder = -9;
    return points;
  };
  // Three sizes (in CSS pixels) plus a handful of glints.
  frame.add(makeStars(1500, [1.6, 2.4], 1, STAR_FRAG), makeStars(420, [2.8, 3.8], 2, STAR_FRAG), makeStars(70, [4.6, 6.2], 3, STAR_FRAG), makeStars(26, [30, 44], 4, GLINT_FRAG, true));

  // ---- Stacked-paper nebulae and a spiral galaxy, faint and far ----
  const nebula = (palette: string[], seed: number, opacity: number, rotation: number) => {
    const s = sprite(nebulaTexture(palette, seed), opacity, -8);
    s.material.rotation = rotation;
    return s;
  };
  place(nebula(["#3d2a8a", "#6a3cb0", "#a85cc0", "#e88ab8"], 11, 0.3, 0.2), 118, [-0.3, 0.9, 0.62], [0.15, 0.3, 0.5], true);
  place(nebula(["#215c8a", "#2e86a6", "#53b8b8", "#9ee0c8"], 77, 0.28, -0.3), 116, [0.62, 0.74, 0.5], [-0.35, 0.72, 0.38], true);
  place(nebula(["#552a7a", "#92408e", "#d0607c", "#f0a080"], 133, 0.26, 0.6), 118, [-0.98, 0.42, 0.55], [0.4, -0.55, 0.45], true);
  place(sprite(galaxyTexture(), 0.85, -7), 114, [0.02, 0.9, 0.24], [-0.5, 0.8, 0.2], true);

  // ---- The hero planet: a warm gas giant striped like a layered dessert, with a tilted ring ----
  const hero = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.order = "ZXY";
  tilt.rotation.set(0.5, 0, 0.36);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 40),
    toonMaterial({ map: heroTexture(), rim: 0xffa890, rimStrength: 0.5, shadow: [0.4, 0.32, 0.56], mid: [0.72, 0.62, 0.78], litAt: 0.3 }),
  );
  tilt.add(globe);
  const ringGeo = new THREE.RingGeometry(1.36, 2.2, 128, 1);
  const rp = ringGeo.attributes.position;
  const ruv = ringGeo.attributes.uv;
  for (let i = 0; i < rp.count; i++) ruv.setXY(i, (Math.hypot(rp.getX(i), rp.getY(i)) - 1.36) / (2.2 - 1.36), 0.5);
  const ringSpin = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, toonMaterial({ color: 0xe6e2e6, map: ringTexture(), transparent: true, side: THREE.DoubleSide, planetShadow: true, rimStrength: 0, shadow: [0.34, 0.32, 0.55], mid: [0.7, 0.66, 0.84] }));
  ring.rotation.x = -Math.PI / 2;
  ring.material.depthWrite = false;
  ringSpin.add(ring);
  tilt.add(ringSpin);
  hero.add(tilt);
  const halo = sprite(glowTexture([[0, "rgba(255,170,130,0)"], [0.69, "rgba(255,170,130,0)"], [0.76, "rgba(255,176,130,0.5)"], [0.88, "rgba(255,140,120,0.14)"], [1, "rgba(0,0,0,0)"]], 256), 0.8, -2);
  halo.scale.setScalar(2.6);
  halo.position.z = -1.6;
  hero.add(halo);

  // Ring bits: icy rubble, little snacks and cargo crates, all instanced, all on the ring plane.
  const orbiters: Array<{ mesh: THREE.InstancedMesh; data: Float32Array; axes: THREE.Vector3[]; spin: Float32Array; animate: boolean }> = [];
  const ringMat = toonMaterial({ planetShadow: true, rim: 0x9ad0f0, rimStrength: 0.3 });
  const addBits = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, size: [number, number], tints: number[], seed: number, animate: boolean) => {
    const r = rng(seed);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    const data = new Float32Array(count * 5); // x, y, z, scale, phase
    const axes: THREE.Vector3[] = [];
    const spin = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = r() * TAU;
      // Bias towards the denser bands of the ring texture.
      const rad = 1.42 + Math.pow(r(), 0.85) * 0.74;
      data.set([Math.cos(a) * rad, (r() - 0.5) * 0.05, Math.sin(a) * rad, size[0] + r() * (size[1] - size[0]), r() * TAU], i * 5);
      axes.push(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
      spin[i] = (0.2 + r() * 0.5) * (r() > 0.5 ? 1 : -1);
      mesh.setColorAt(i, c.setHex(tints[i % tints.length]));
    }
    orbiters.push({ mesh, data, axes, spin, animate });
    ringSpin.add(mesh);
  };
  const rubble = new THREE.IcosahedronGeometry(1, 0);
  addBits(rubble, ringMat, 170, [0.012, 0.04], [0xc8e4ee, 0xe6d6b8, 0xd0c4e6, 0xb4d4e0, 0xf0d0b8], 5, false);
  const foodMat = toonMaterial({ planetShadow: true, rim: 0xffd0b0, rimStrength: 0.3 });
  const donut = new THREE.TorusGeometry(0.5, 0.2, 8, 16);
  const slice = new THREE.CylinderGeometry(0.62, 0.62, 0.2, 3, 1);
  const macaron = new THREE.SphereGeometry(0.5, 12, 8).scale(1, 0.55, 1);
  const cookie = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 14, 1);
  addBits(donut, foodMat, 6, [0.07, 0.095], [0xf08cb8, 0xf0a0c8, 0xf4d080], 6, true);
  addBits(slice, foodMat, 5, [0.075, 0.1], [0xf0b848, 0xf4c458], 7, true);
  addBits(macaron, foodMat, 5, [0.07, 0.09], [0x9ee0c8, 0xf4a8c0, 0xb8a8f0], 8, true);
  addBits(cookie, foodMat, 5, [0.07, 0.09], [0xc88a58, 0xd89a68], 9, true);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  addBits(crateGeo, toonMaterial({ map: crateTexture("#ece2cc", "#6e5a48"), planetShadow: true, rim: 0xffd0b0, rimStrength: 0.2 }), 8, [0.06, 0.08], [0xe8a43e, 0x3db4b8, 0xe0705c], 10, true);

  place(hero, 96, [-0.64, 0.7, 0.46], [-0.4, -0.9, 0.25]);

  // ---- The small blue home planet, far off in the upper sky ----
  const home = new THREE.Group();
  const homeTilt = new THREE.Group();
  homeTilt.rotation.z = 0.4;
  const homeGlobe = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), toonMaterial({ map: homeTexture(), rim: 0x7fd4ff, rimStrength: 0.5, shadow: [0.34, 0.4, 0.7], mid: [0.66, 0.72, 0.9] }));
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 36, 24),
    Object.assign(toonMaterial({ map: cloudTexture(), transparent: true, rim: 0xb4e0ff, rimStrength: 0.2, shadow: [0.5, 0.52, 0.76], mid: [0.78, 0.8, 0.94] }), {}),
  );
  clouds.material.depthWrite = false;
  homeTilt.add(homeGlobe, clouds);
  home.add(homeTilt);
  const homeHalo = sprite(glowTexture([[0, "rgba(120,200,255,0)"], [0.7, "rgba(120,200,255,0)"], [0.78, "rgba(130,210,255,0.5)"], [0.9, "rgba(90,150,255,0.12)"], [1, "rgba(0,0,0,0)"]], 128), 0.8, -2);
  homeHalo.scale.setScalar(2.6);
  homeHalo.position.z = -1.6;
  home.add(homeHalo);
  place(home, 122, [0.8, 0.82, 0.085], [0.52, 0.9, 0.052]);

  // ---- The moon: a closer, cratered ball with a painted terminator ----
  const moon = new THREE.Group();
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), toonMaterial({ map: moonTexture(), rim: 0xb4b4ff, rimStrength: 0.42, shadow: [0.38, 0.36, 0.62], mid: [0.7, 0.68, 0.86] }));
  moonBall.rotation.y = -0.6;
  moon.add(moonBall);
  place(moon, 68, [0.2, 0.74, 0.1], [0.5, 0.6, 0.1]);

  // ---- Comet and shooting stars live on the screen plane, in normalised screen coordinates ----
  const tail = tailTexture();
  const additive = (map: THREE.Texture, colour: number) =>
    Object.assign(new THREE.MeshBasicMaterial({ map, color: colour, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }), { fog: false });
  const tailGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const comet = new THREE.Group();
  comet.renderOrder = -5;
  const ionTail = new THREE.Mesh(tailGeo, additive(tail, 0xb4e4ff));
  const dustTail = new THREE.Mesh(tailGeo, additive(tail, 0xffc8a0));
  ionTail.scale.set(34, 2.6, 1);
  dustTail.scale.set(20, 4.4, 1);
  dustTail.rotation.z = 0.22;
  const cometHead = sprite(glowTexture([[0, "rgba(255,250,240,1)"], [0.22, "rgba(255,236,210,0.85)"], [0.55, "rgba(200,230,255,0.25)"], [1, "rgba(0,0,0,0)"]], 128), 0.9, -4);
  cometHead.scale.set(3.4, 3.4, 1);
  cometHead.material.depthTest = false;
  comet.add(ionTail, dustTail, cometHead);
  comet.visible = false;
  frame.add(comet);
  for (const m of [ionTail, dustTail, cometHead]) m.renderOrder = -5;
  const streaks = [0, 1].map((i) => {
    const streak = new THREE.Mesh(tailGeo, additive(tail, 0xe6f0ff));
    streak.scale.set(9, 0.22, 1);
    streak.renderOrder = -5;
    streak.visible = false;
    streak.userData = { period: 17 + i * 9, offset: i * 8.3 };
    frame.add(streak);
    return streak;
  });

  // ---- Layout: pin everything to the screen the game camera sees ----
  const m4 = new THREE.Matrix4();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const v = new THREE.Vector3();
  let lastW = 0;
  let lastH = 0;
  let portrait = 0;
  const relayout = () => {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 800;
    lastW = w;
    lastH = h;
    const aspect = w / h;
    // Same fit/framing arithmetic as the game camera, so the frame sits where the camera does.
    const fit = 1.6 - 0.3 * Math.min(1, Math.max(0, (1 - aspect) / 0.44));
    const framing = Math.max(1, fit / aspect);
    camPos.copy(CAMERA_HOME).multiplyScalar(framing).add(v.set(cx, 0, cz));
    camTarget.set(cx + CAMERA_TARGET.x, CAMERA_TARGET.y, cz + CAMERA_TARGET.z);
    m4.lookAt(camPos, camTarget, v.set(0, 1, 0));
    frame.quaternion.setFromRotationMatrix(m4);
    frame.position.copy(camPos);
    tanH = TAN_V * aspect;
    portrait = Math.min(1, Math.max(0, (1.1 - aspect) / 0.5));
    frame.updateMatrixWorld(true);
    for (const item of items) {
      const [lx, ly, ls] = item.land;
      const [px, py, ps] = item.port;
      const nx = lx + (px - lx) * portrait;
      const ny = ly + (py - ly) * portrait;
      const radius = (ls + (ps - ls) * portrait) * TAN_V * item.distance;
      item.obj.position.set(nx * tanH * item.distance, ny * TAN_V * item.distance, -item.distance);
      item.obj.scale.setScalar(item.flat ? radius * 2 : radius);
    }
    frame.updateMatrixWorld(true);
    hero.getWorldPosition(v);
    PLANET_SHADOW.value.set(v.x, v.y, v.z, hero.scale.x);
  };
  relayout();

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tick = (time: number): void => {
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) relayout();
    starUniforms.uTime.value = time;
    starUniforms.uPixels.value = Math.min(window.devicePixelRatio || 1, 2);
    globe.rotation.y = time * 0.02;
    ringSpin.rotation.y = time * 0.012;
    homeGlobe.rotation.y = time * 0.03;
    clouds.rotation.y = time * 0.045;
    for (const o of orbiters) {
      if (!o.animate) {
        if (o.mesh.userData.done) continue;
        o.mesh.userData.done = true;
      }
      for (let i = 0; i < o.mesh.count; i++) {
        tmpQ.setFromAxisAngle(o.axes[i], o.data[i * 5 + 4] + time * o.spin[i]);
        tmpP.set(o.data[i * 5], o.data[i * 5 + 1], o.data[i * 5 + 2]);
        const s = o.data[i * 5 + 3];
        tmpM.compose(tmpP, tmpQ, tmpS.set(s, s, s));
        o.mesh.setMatrixAt(i, tmpM);
      }
      o.mesh.instanceMatrix.needsUpdate = true;
    }

    // A comet drifts across the top of the screen once in a long while.
    const cometLap = (time + 18) % 80;
    if (cometLap > 36) {
      comet.visible = false;
    } else {
      const p = cometLap / 36;
      const x = -1.15 + p * 2.3;
      const y = (portrait > 0.5 ? 0.9 : 0.86) - p * 0.2 + Math.sin(p * 3) * 0.03;
      comet.visible = true;
      comet.position.set(x * tanH * 100, y * TAN_V * 100, -100);
      comet.rotation.z = Math.atan2(-0.2 * TAN_V, 2.3 * tanH) + Math.PI;
      comet.scale.setScalar(0.8 + portrait * 0.2);
    }
    for (const streak of streaks) {
      const { period, offset } = streak.userData as { period: number; offset: number };
      const lap = (time + offset) % period;
      const life = 2.4;
      if (lap > life) {
        streak.visible = false;
        continue;
      }
      const p = lap / life;
      const seed = Math.floor((time + offset) / period);
      const x = (noise01(seed * 3 + period) * 1.6 - 0.8) + p * 0.4;
      const y = 0.62 + noise01(seed * 5 + period) * 0.34 - p * 0.14;
      streak.visible = true;
      streak.position.set(x * tanH * 90, y * TAN_V * 90, -90);
      streak.rotation.z = Math.PI - 0.3;
      streak.scale.x = 8 * Math.sin(p * Math.PI);
      (streak.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(p * Math.PI);
    }
  };
  tick(0);
  return { planet: hero, tick };
}
