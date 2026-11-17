import * as THREE from "three";
import { Batch, TAU, colorize, glowMaterial, toonMaterial, xform } from "./spaceArt";
import { hullTexture, radiatorTexture, solarTexture, tankTexture } from "./spacePaint";

// Everything hanging off the Orbit Diner's deck: a cross-braced boom reaching back and down with a solar wing crossbar,
// radiator fins, dish antennas and a docking arm with a little cartoon shuttle parked on it, and a front rack of fuel
// tanks with its own small wings. Static parts are merged into one mesh per material; wings and dishes still move.

const X = new THREE.Vector3(1, 0, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

// A matrix that stretches a unit box into a bar from a to b with the given thickness.
function bar(a: THREE.Vector3, b: THREE.Vector3, thick: number): THREE.Matrix4 {
  tmpA.subVectors(b, a);
  const length = tmpA.length();
  const q = new THREE.Quaternion().setFromUnitVectors(X, tmpA.normalize());
  return new THREE.Matrix4().compose(tmpB.addVectors(a, b).multiplyScalar(0.5).clone(), q, new THREE.Vector3(length, thick, thick));
}

function boxUv(geometry: THREE.BufferGeometry, w: number, h: number, d: number, tile: number): THREE.BufferGeometry {
  const uv = geometry.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) uv.setXY(face * 4 + k, uv.getX(face * 4 + k) * (sizes[face][0] / tile), uv.getY(face * 4 + k) * (sizes[face][1] / tile));
  }
  return geometry;
}

export interface StationOptions {
  cx: number;
  frontZ: number;
  backZ: number;
  slabZ: number;
  span: number;
  depth: number;
}

export interface Station {
  tick: (time: number) => void;
}

export function createStation(parent: THREE.Group, o: StationOptions): Station {
  const { cx } = o;
  const plain = toonMaterial({ vertexColors: true, rim: 0x7ad0ee, rimStrength: 0.36 });
  const hullTex = hullTexture();
  hullTex.wrapS = hullTex.wrapT = THREE.RepeatWrapping;
  const hull = toonMaterial({ vertexColors: true, map: hullTex, rim: 0x7ad0ee, rimStrength: 0.36 });
  const solarTex = solarTexture();
  solarTex.wrapS = solarTex.wrapT = THREE.RepeatWrapping;
  const solar = toonMaterial({ map: solarTex, rim: 0x8ab8ff, rimStrength: 0.3, shadow: [0.5, 0.5, 0.78], mid: [0.76, 0.78, 0.95] });
  const radTex = radiatorTexture();
  const radiator = toonMaterial({ vertexColors: true, map: radTex, rim: 0x7ad0ee, rimStrength: 0.3 });
  const tankMats = [tankTexture("FUEL", "#e0705c"), tankTexture("O2", "#3db4b8"), tankTexture("H2O", "#e8a838")].map((map) => toonMaterial({ vertexColors: true, map, rim: 0x7ad0ee, rimStrength: 0.3 }));
  const sphereMats = [tankTexture("", "#3db4b8", false), tankTexture("", "#e8a838", false)].map((map) => toonMaterial({ vertexColors: true, map, rim: 0x7ad0ee, rimStrength: 0.3 }));
  const glow = glowMaterial(0xffd9a0, 0.85);
  const cyan = glowMaterial(0x3fd6e8, 0.8);
  const engine = glowMaterial(0xffa860, 0.9);
  const dishMat = toonMaterial({ vertexColors: true, side: THREE.DoubleSide, rim: 0x7ad0ee, rimStrength: 0.3 });

  const batch = new Batch();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  const sph = new THREE.SphereGeometry(0.5, 20, 14);
  const tor = new THREE.TorusGeometry(0.5, 0.12, 10, 28);

  // ---- The deck's own hull: a slab with plating, a smaller block beneath, cyan edge lights and warm portholes ----
  const { span, depth, slabZ } = o;
  batch.add(hull, boxUv(new THREE.BoxGeometry(span + 0.4, 0.8, depth + 0.4), span + 0.4, 0.8, depth + 0.4, 2.2), 0xc2cae0, xform(cx, -0.43, slabZ));
  batch.add(hull, boxUv(new THREE.BoxGeometry(span - 3, 1.2, depth - 3), span - 3, 1.2, depth - 3, 2.2), 0x8e98b6, xform(cx, -1.2, slabZ));
  const frontEdge = slabZ + depth / 2 + 0.2;
  batch.add(cyan, unit, 0xffffff, xform(cx, -0.12, frontEdge + 0.02, 0, 0, 0, span + 0.45, 0.06, 0.06));
  batch.add(cyan, unit, 0xffffff, xform(cx - span / 2 - 0.2, -0.12, slabZ, 0, 0, 0, 0.06, 0.06, depth + 0.45));
  batch.add(cyan, unit, 0xffffff, xform(cx + span / 2 + 0.2, -0.12, slabZ, 0, 0, 0, 0.06, 0.06, depth + 0.45));
  for (let i = 0; i < 20; i++) batch.add(glow, cyl, 0xffffff, xform(cx - span / 2 + 1.1 + i * ((span - 2.2) / 19), -0.5, frontEdge + 0.01, Math.PI / 2, 0, 0, 0.2, 0.06, 0.2));
  for (let i = 0; i < 10; i++) batch.add(cyan, cyl, 0xffffff, xform(cx - span / 2 + 1.5 + i * ((span - 3) / 9), -1.45, slabZ + (depth - 3) / 2 + 0.01, Math.PI / 2, 0, 0, 0.16, 0.05, 0.16));

  // ---- Truss: four long members, square rungs and a diagonal brace on every face of every bay ----
  const truss = (a: THREE.Vector3, b: THREE.Vector3, s: number) => {
    const dir = tmpA.subVectors(b, a);
    const length = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(X, dir.normalize());
    const base = new THREE.Matrix4().compose(tmpB.addVectors(a, b).multiplyScalar(0.5).clone(), q, new THREE.Vector3(1, 1, 1));
    const t = s * 0.1;
    const L = new THREE.Vector3();
    const R = new THREE.Vector3();
    const place = (la: THREE.Vector3, lb: THREE.Vector3, thick: number, hex: number) => batch.add(plain, unit, hex, base.clone().multiply(bar(la, lb, thick)));
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) place(L.set(-length / 2, sy * s / 2, sz * s / 2).clone(), R.set(length / 2, sy * s / 2, sz * s / 2).clone(), t * 1.3, 0xd0d6e8);
    const bays = Math.max(2, Math.round(length / (s * 1.3)));
    const bay = length / bays;
    for (let i = 0; i <= bays; i++) {
      const x = -length / 2 + i * bay;
      for (const sign of [-1, 1]) {
        place(L.set(x, -s / 2, sign * s / 2).clone(), R.set(x, s / 2, sign * s / 2).clone(), t, 0xb4bcd4);
        place(L.set(x, sign * s / 2, -s / 2).clone(), R.set(x, sign * s / 2, s / 2).clone(), t, 0xb4bcd4);
      }
    }
    for (let i = 0; i < bays; i++) {
      const x0 = -length / 2 + i * bay;
      const x1 = x0 + bay;
      const flip = i % 2 ? 1 : -1;
      for (const sign of [-1, 1]) {
        place(L.set(x0, sign * s / 2, -flip * s / 2).clone(), R.set(x1, sign * s / 2, flip * s / 2).clone(), t * 0.8, 0x98a2c0);
        place(L.set(x0, -flip * s / 2, sign * s / 2).clone(), R.set(x1, flip * s / 2, sign * s / 2).clone(), t * 0.8, 0x98a2c0);
      }
    }
  };

  // ---- The back assembly: a boom sloping down and away from the deck, ending in a hub and a wing crossbar ----
  const deckBack = new THREE.Vector3(cx, -1.25, o.backZ + 0.3);
  // Low and close enough that the hub sits under the skyline, leaving the planets above it unobstructed.
  const hub = new THREE.Vector3(cx, -6.4, -7.4);
  truss(deckBack, hub, 0.95);
  truss(new THREE.Vector3(cx - 11.2, hub.y, hub.z), new THREE.Vector3(cx + 11.2, hub.y, hub.z), 0.8);
  batch.add(hull, boxUv(new THREE.BoxGeometry(1, 1, 1), 2.2, 1.7, 2.2, 1.6), 0xd8dff0, xform(hub.x, hub.y, hub.z, 0, 0, 0, 2.2, 1.7, 2.2));
  batch.add(hull, cyl, 0xb4bcd4, xform(hub.x, hub.y + 1.05, hub.z, 0, 0, 0, 1.2, 0.5, 1.2));
  // Long capsule tanks capping each end of the crossbar, lying along it (round spheres read as helmets).
  const sphereTank = (x: number, mat: number) => {
    const g = new THREE.CapsuleGeometry(0.72, 1.7, 8, 20);
    const m = new THREE.Mesh(g, sphereMats[mat]);
    colorize(g, 0xffffff);
    m.position.set(x, hub.y, hub.z);
    m.rotation.z = Math.PI / 2;
    parent.add(m);
  };
  sphereTank(cx - 12.4, 0);
  sphereTank(cx + 12.4, 1);
  batch.add(hull, cyl, 0xb4bcd4, xform(cx - 11.2, hub.y, hub.z, 0, 0, Math.PI / 2, 0.9, 0.5, 0.9));
  batch.add(hull, cyl, 0xb4bcd4, xform(cx + 11.2, hub.y, hub.z, 0, 0, Math.PI / 2, 0.9, 0.5, 0.9));

  // Radiator fins: four tall plates in an X round the boom, with warm tips.
  const boomDir = new THREE.Vector3().subVectors(hub, deckBack).normalize();
  const boomQ = new THREE.Quaternion().setFromUnitVectors(X, boomDir);
  for (const t of [0.4, 0.72]) {
    const centre = deckBack.clone().lerp(hub, t);
    for (let k = 0; k < 4; k++) {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion().setFromAxisAngle(X, (k / 4) * TAU + Math.PI / 4), new THREE.Vector3(1, 1, 1));
      const place = new THREE.Matrix4().compose(centre, boomQ, new THREE.Vector3(1, 1, 1)).multiply(local);
      batch.add(radiator, new THREE.BoxGeometry(2.2, 0.05, 1.5), 0xffffff, place.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.25)));
    }
    batch.add(hull, cyl, 0xb4bcd4, new THREE.Matrix4().compose(centre, boomQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))), new THREE.Vector3(1.2, 2.3, 1.2)));
  }

  // ---- A docking tube behind the crossbar, with the shuttle parked alongside ----
  // On the right of the hub, so the shuttle never sits in front of the big planet on the left.
  const tubeX = cx + 3.6;
  batch.add(hull, cyl, 0xd0d6e8, xform(tubeX, hub.y - 0.2, hub.z - 1.05, Math.PI / 2, 0, 0, 0.9, 2.1, 0.9));
  batch.add(plain, tor, 0xe0705c, xform(tubeX, hub.y - 0.4, hub.z - 2.1, 0, 0, 0, 2.2, 2.2, 2.2));
  batch.add(hull, cyl, 0xaab4cc, xform(tubeX, hub.y, hub.z, Math.PI / 2, 0, 0, 1.3, 0.7, 1.3));

  // The shuttle: a plump cream capsule with a coral nose, a visor, teal wings and a tall coral fin.
  const shuttleAt = new THREE.Vector3(tubeX + 0.2, hub.y - 0.75, hub.z - 3.5);
  const S = 1.45;
  const sm = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(shuttleAt.x + x * S, shuttleAt.y + y * S, shuttleAt.z + z * S),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx * S, sy * S, sz * S),
  );
  const shuttleAo = (_p: THREE.Vector3, n: THREE.Vector3) => 0.82 + 0.18 * Math.min(1, Math.max(0, n.y * 0.5 + 0.5));
  batch.add(plain, new THREE.CapsuleGeometry(0.62, 1.7, 6, 20), 0xeee6d2, sm(0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.95), shuttleAo);
  batch.add(plain, sph, 0xe0705c, sm(1.56, 0, 0, 0, 0, 0, 0.9, 1.06, 1.06), shuttleAo);
  batch.add(plain, cyl, 0x2a3358, sm(0.35, 0, 0, 0, 0, Math.PI / 2, 1.28, 0.34, 1.28), shuttleAo);
  batch.add(plain, sph, 0x2c7e96, sm(0.95, 0.46, 0, 0, 0, 0, 0.9, 0.55, 0.85), shuttleAo);
  batch.add(plain, sph, 0x8adcf0, sm(1.05, 0.62, 0.0, 0, 0, 0, 0.44, 0.2, 0.5), shuttleAo);
  for (const side of [-1, 1]) {
    batch.add(plain, unit, 0x2fa3a8, sm(-0.35, -0.12, side * 1.0, 0, side * 0.45, 0, 1.4, 0.13, 1.15), shuttleAo);
    batch.add(plain, unit, 0xe0705c, sm(-0.75, 0.12, side * 1.62, 0, 0, 0, 0.5, 0.55, 0.1), shuttleAo);
    batch.add(plain, cyl, 0x4a4a68, sm(-1.72, -0.12, side * 0.34, 0, 0, Math.PI / 2, 0.5, 0.46, 0.5), shuttleAo);
    batch.add(engine, cyl, 0xffffff, sm(-1.97, -0.12, side * 0.34, 0, 0, Math.PI / 2, 0.36, 0.05, 0.36));
  }
  batch.add(plain, unit, 0xe0705c, sm(-1.3, 0.78, 0, 0, 0, 0, 0.85, 0.95, 0.12), shuttleAo);
  batch.add(plain, unit, 0xd0d6e8, sm(2.2, 0, 0, 0, 0, 0, 0.12, 0.12, 0.12), shuttleAo);

  // ---- Front rack: a short boom with three tanks hanging in a row ----
  const rackStart = new THREE.Vector3(cx, -1.6, o.frontZ - 0.2);
  const rackEnd = new THREE.Vector3(cx, -3.3, o.frontZ + 4.6);
  truss(rackStart, rackEnd, 0.8);
  truss(new THREE.Vector3(cx - 5.4, rackEnd.y, rackEnd.z), new THREE.Vector3(cx + 5.4, rackEnd.y, rackEnd.z), 0.65);
  batch.add(hull, boxUv(new THREE.BoxGeometry(1, 1, 1), 1.6, 1.2, 1.6, 1.6), 0xd8dff0, xform(cx, rackEnd.y, rackEnd.z, 0, 0, 0, 1.6, 1.2, 1.6));
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * 3.4;
    const g = new THREE.CapsuleGeometry(0.85, 2.6, 6, 22);
    const m = new THREE.Mesh(g, tankMats[i]);
    colorize(g, 0xffffff);
    m.position.set(x, rackEnd.y - 0.35, rackEnd.z - 0.0);
    m.rotation.x = Math.PI / 2;
    m.rotation.z = i * 0.7;
    parent.add(m);
    for (const dz of [-1.0, 1.0]) batch.add(plain, unit, 0xe0705c, xform(x, rackEnd.y + 0.1, rackEnd.z + dz, 0, 0, 0, 0.22, 1.5, 0.2));
  }

  // ---- Solar wings: a frame and a cell-grid panel on each side of a mast, tilting slowly towards the sun ----
  const panelGeo = new THREE.BoxGeometry(3.0, 0.07, 3.1);
  const uv = panelGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * 2);
  colorize(panelGeo, 0xffffff);
  const frameBatch = new Batch();
  const fr = 0xc2cae0;
  const frameAo = (_p: THREE.Vector3, n: THREE.Vector3) => 0.85 + 0.15 * Math.min(1, Math.max(0, n.y * 0.5 + 0.5));
  frameBatch.add(plain, unit, fr, xform(0, 0, 1.8, 0, 0, 0, 0.14, 0.14, 3.6), frameAo);
  for (const side of [1]) {
    const zc = side * 1.9;
    frameBatch.add(plain, unit, fr, xform(0, 0.02, zc - 1.62, 0, 0, 0, 3.12, 0.12, 0.12), frameAo);
    frameBatch.add(plain, unit, fr, xform(0, 0.02, zc + 1.62, 0, 0, 0, 3.12, 0.12, 0.12), frameAo);
    frameBatch.add(plain, unit, fr, xform(-1.56, 0.02, zc, 0, 0, 0, 0.12, 0.12, 3.2), frameAo);
    frameBatch.add(plain, unit, fr, xform(1.56, 0.02, zc, 0, 0, 0, 0.12, 0.12, 3.2), frameAo);
  }
  const frameHolder = new THREE.Group();
  const frameMeshes = frameBatch.build(frameHolder);
  const frameGeo = frameMeshes[0].geometry;
  const wings: THREE.Group[] = [];
  const addWing = (x: number, y: number, z: number, scale: number, phase: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.scale.setScalar(scale);
    pivot.userData.phase = phase;
    const frame = new THREE.Mesh(frameGeo, plain);
    pivot.add(frame);
    for (const side of [1]) {
      const panel = new THREE.Mesh(panelGeo, solar);
      panel.position.set(0, 0.04, side * 1.9);
      pivot.add(panel);
    }
    wings.push(pivot);
    parent.add(pivot);
  };
  // Two wings a side, out towards the ends, so the middle of the skyline stays open.
  for (const side of [-1, 1]) for (let i = 0; i < 2; i++) addWing(cx + side * (6.6 + i * 3.2), hub.y, hub.z, 0.9, side * 1 + i * 0.8);
  for (const side of [-1, 1]) addWing(cx + side * 6.6, rackEnd.y, rackEnd.z, 0.7, side * 2.5);

  // ---- Dish antennas: a cap on a pedestal that turns slowly; one on the hub, one on a stalk from the boom ----
  const dishes: THREE.Group[] = [];
  const addDish = (x: number, y: number, z: number, size: number, phase: number, stalk: number) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.userData.phase = phase;
    const cap = new THREE.SphereGeometry(1, 24, 8, 0, TAU, 0, 1.0);
    colorize(cap, 0xe6dfcf, (p) => 0.78 + 0.22 * Math.min(1, Math.hypot(p.x, p.z) * 1.4));
    const dish = new THREE.Mesh(cap, dishMat);
    dish.scale.setScalar(size);
    dish.position.y = stalk;
    dish.rotation.x = -0.7;
    holder.add(dish);
    const mast = new THREE.CylinderGeometry(0.08, 0.14, stalk + 0.2, 8);
    colorize(mast, 0xb4bcd4, hullAo2);
    holder.add(new THREE.Mesh(mast, plain).translateY(stalk / 2));
    const horn = new THREE.CylinderGeometry(0.03, 0.03, size * 1.1, 6);
    colorize(horn, 0xd0d6e8);
    const hornMesh = new THREE.Mesh(horn, plain);
    hornMesh.position.set(0, stalk + size * 0.55, -size * 0.35);
    hornMesh.rotation.x = -0.7;
    holder.add(hornMesh);
    dishes.push(holder);
    parent.add(holder);
  };
  addDish(hub.x, hub.y + 1.2, hub.z, 1.25, 0, 0.5);
  addDish(deckBack.x + 2.3, deckBack.y - 1.3, deckBack.z - 1.6, 0.8, 2, 0.6);

  // ---- Beacons: tiny lights that blink in turn (the only things outside that go past the bloom threshold) ----
  const beaconSpots: Array<[number, number, number, number, number, number]> = [];
  const frontZ = slabZ + depth / 2 + 0.2;
  const backZ = slabZ - depth / 2 - 0.2;
  const edgeX = span / 2 + 0.3;
  const RED = 0xff4a4a;
  const GREEN = 0x4aff8a;
  const WHITE = 0xe8ecf5;
  const add = (x: number, y: number, z: number, colour: number, speed: number, phase: number) => beaconSpots.push([x, y, z, colour, speed, phase]);
  add(cx - edgeX, -0.05, frontZ, RED, 2.2, 0);
  add(cx + edgeX, -0.05, frontZ, GREEN, 2.2, 0);
  add(cx - edgeX, -0.05, backZ, RED, 2.2, 1.1);
  add(cx + edgeX, -0.05, backZ, GREEN, 2.2, 1.1);
  add(cx - 13.6, hub.y + 0.2, hub.z, RED, 1.8, 0.4);
  add(cx + 13.6, hub.y + 0.2, hub.z, GREEN, 1.8, 1.5);
  add(hub.x, hub.y + 1.45, hub.z, WHITE, 1.3, 0.2);
  add(cx - 5.4, rackEnd.y + 0.4, rackEnd.z, RED, 2.0, 0.9);
  add(cx + 5.4, rackEnd.y + 0.4, rackEnd.z, GREEN, 2.0, 0.3);
  add(cx, rackEnd.y + 0.8, rackEnd.z, WHITE, 1.1, 1.0);
  add(shuttleAt.x - 1.9 * S, shuttleAt.y + 1.45 * S, shuttleAt.z, WHITE, 1.5, 0.7);
  add(shuttleAt.x - 0.75 * S, shuttleAt.y + 0.5 * S, shuttleAt.z + 1.75 * S, RED, 2.0, 0.0);
  add(shuttleAt.x - 0.75 * S, shuttleAt.y + 0.5 * S, shuttleAt.z - 1.75 * S, GREEN, 2.0, 0.0);
  const beaconMat = Object.assign(new THREE.MeshBasicMaterial({ color: 0xffffff }), { fog: false });
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), beaconMat, beaconSpots.length);
  beacons.frustumCulled = false;
  const dummy = new THREE.Matrix4();
  const colour = new THREE.Color();
  const bases = beaconSpots.map(([x, y, z, hex], i) => {
    beacons.setMatrixAt(i, dummy.makeTranslation(x, y, z));
    return new THREE.Color(hex);
  });
  beaconSpots.forEach((_s, i) => beacons.setColorAt(i, bases[i]));
  parent.add(beacons);

  batch.build(parent);

  const tick = (time: number): void => {
    for (const wing of wings) wing.rotation.x = Math.sin(time * 0.25 + (wing.userData.phase as number)) * 0.3;
    for (const dish of dishes) dish.rotation.y = time * 0.12 + (dish.userData.phase as number);
    for (let i = 0; i < beaconSpots.length; i++) {
      const [, , , , speed, phase] = beaconSpots[i];
      const on = Math.sin(time * speed * 2.2 + phase * 3) > 0.35;
      // Lit, a touch past 1 so the bloom gives it a small halo; dim otherwise.
      beacons.setColorAt(i, colour.copy(bases[i]).multiplyScalar(on ? 1.5 : 0.1));
    }
    if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
  };
  tick(0);
  return { tick };
}

const hullAo2 = (_p: THREE.Vector3, n: THREE.Vector3) => 0.8 + 0.2 * Math.min(1, Math.max(0, n.y * 0.5 + 0.5));
