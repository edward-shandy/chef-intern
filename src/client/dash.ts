import * as THREE from "three";
import type { PlayerState } from "../shared/sim";

// Cartoon dash effects: a burst of dust clouds where the chef kicks off, a trail of puffs behind their feet while
// they dash, and a few white speed streaks. Meshes come from a small pool, so dashing never allocates.

const PUFF_LIFE = 0.5;
const STREAK_LIFE = 0.28;
const TRAIL_EVERY = 0.03;
const POOL = 48;

interface Puff {
  mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  age: number;
  life: number;
  // Drift per second, and how big the cloud grows to.
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

interface Streak {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export interface DashFx {
  update(players: PlayerState[], dt: number): void;
  // A puff of glowing sparkles, where a chef vanishes into a teleport pad and where they pop out.
  sparkle(x: number, z: number, colour: number): void;
  // A fountain of little bits at any height: confetti at the pass, scraps flying off a chopping board.
  burst(x: number, y: number, z: number, colours: number[], count: number, speed: number, size: number): void;
}

export function createDashFx(parent: THREE.Object3D): DashFx {
  const group = new THREE.Group();
  parent.add(group);
  const cloud = new THREE.IcosahedronGeometry(0.15, 0);
  const puffs: Puff[] = Array.from({ length: POOL }, () => {
    // Flat-shaded, chunky and warm-white, like a cartoon dust cloud.
    const material = new THREE.MeshStandardMaterial({ color: 0xf4ede2, roughness: 1, flatShading: true, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(cloud, material);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, age: 0, life: 0, vx: 0, vy: 0, vz: 0, size: 1 };
  });
  const streakShape = new THREE.BoxGeometry(0.035, 0.035, 0.7);
  const streaks: Streak[] = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(streakShape, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    mesh.visible = false;
    group.add(mesh);
    return { mesh, age: STREAK_LIFE };
  });

  let next = 0;
  const spawn = (x: number, z: number, vx: number, vz: number, size: number, life = PUFF_LIFE, colour = 0xf4ede2, y = 0.1, vy = 0.5 + Math.random() * 0.3) => {
    const puff = puffs[next++ % POOL];
    puff.mesh.material.color.setHex(colour);
    puff.mesh.material.emissive.setHex(colour === 0xf4ede2 ? 0x000000 : colour);
    puff.mesh.position.set(x, y, z);
    puff.mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    puff.mesh.visible = true;
    Object.assign(puff, { age: 0, life, vx, vy, vz, size });
  };
  let nextStreak = 0;
  const streak = (player: PlayerState, back: number, side: number) => {
    const s = streaks[nextStreak++ % streaks.length];
    const fx = Math.sin(player.facing);
    const fz = Math.cos(player.facing);
    s.mesh.position.set(player.x - fx * back + fz * side, 0.35 + Math.random() * 0.45, player.z - fz * back - fx * side);
    s.mesh.rotation.set(0, player.facing, 0);
    s.mesh.visible = true;
    s.age = 0;
  };

  // Per chef: whether they were dashing last frame, and time until their next trail puff.
  const dashing = new Map<number, { was: boolean; trail: number }>();

  return {
    burst(x, y, z, colours, count, speed, size) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const out = speed * (0.4 + Math.random() * 0.6);
        spawn(x, z, Math.sin(angle) * out, Math.cos(angle) * out, size * (0.6 + Math.random() * 0.6), 0.6, colours[i % colours.length], y, speed * (1 + Math.random()));
      }
    },
    sparkle(x, z, colour) {
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        spawn(x + Math.sin(angle) * 0.2, z + Math.cos(angle) * 0.2, Math.sin(angle) * 0.8, Math.cos(angle) * 0.8, 0.55, 0.55, colour);
      }
    },
    update(players, dt) {
      for (const player of players) {
        let mark = dashing.get(player.id);
        if (!mark) dashing.set(player.id, (mark = { was: false, trail: 0 }));
        const now = player.dashTime > 0;
        const fx = Math.sin(player.facing);
        const fz = Math.cos(player.facing);
        if (now && !mark.was) {
          // Kick-off: a ring of clouds bursting out round the feet, mostly backwards, and three streaks.
          for (let i = 0; i < 7; i++) {
            const angle = player.facing + Math.PI + (i - 3) * 0.45;
            const speed = 1.1 + Math.random() * 0.6;
            spawn(player.x - fx * 0.2, player.z - fz * 0.2, Math.sin(angle) * speed, Math.cos(angle) * speed, 1.3 + Math.random() * 0.5);
          }
          for (const side of [-0.22, 0, 0.22]) streak(player, 0.55 + Math.random() * 0.2, side);
        }
        if (now) {
          // A trail of smaller puffs left behind the feet for the length of the dash.
          mark.trail -= dt;
          while (mark.trail <= 0) {
            mark.trail += TRAIL_EVERY;
            const jitter = (Math.random() - 0.5) * 0.3;
            spawn(player.x - fx * 0.3 + fz * jitter, player.z - fz * 0.3 - fx * jitter, -fx * 0.4, -fz * 0.4, 0.8 + Math.random() * 0.5, 0.4);
          }
        } else {
          mark.trail = 0;
        }
        mark.was = now;
      }
      for (const id of dashing.keys()) if (!players.some((player) => player.id === id)) dashing.delete(id);

      for (const puff of puffs) {
        if (!puff.mesh.visible) continue;
        puff.age += dt;
        const t = puff.age / puff.life;
        if (t >= 1) {
          puff.mesh.visible = false;
          continue;
        }
        // Pops up big fast, then slows, rises and fades: the classic cartoon "poof".
        const grow = 1 - (1 - t) ** 3;
        puff.mesh.scale.setScalar(puff.size * (0.35 + grow * 0.9));
        puff.mesh.position.x += puff.vx * dt * (1 - t);
        puff.mesh.position.z += puff.vz * dt * (1 - t);
        puff.mesh.position.y += puff.vy * dt * (1 - t);
        puff.mesh.rotation.y += dt * 2;
        puff.mesh.material.opacity = t < 0.5 ? 0.95 : 0.95 * (1 - (t - 0.5) / 0.5);
      }
      for (const s of streaks) {
        if (!s.mesh.visible) continue;
        s.age += dt;
        const t = s.age / STREAK_LIFE;
        if (t >= 1) {
          s.mesh.visible = false;
          continue;
        }
        s.mesh.scale.set(1, 1, 1 - t * 0.6);
        s.mesh.material.opacity = 0.85 * (1 - t);
      }
    },
  };
}
