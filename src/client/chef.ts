import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { playerSpeedFraction, type PlayerState } from "../shared/sim";
import { model, MODEL_SCALE } from "./assets";
import { COLORS, mat, mesh } from "./models";

// KayKit Adventurers characters (CC0), trimmed by scripts/trim_character.py; one per seat.
const CHARACTERS = ["knight", "barbarian", "mage", "rogue"];

type ClipName = "idle" | "run" | "idleLegs" | "runLegs" | "carry" | "chop";
const CLIP_NAMES: ClipName[] = ["idle", "run", "idleLegs", "runLegs", "carry", "chop"];

// Bones the carry pose takes over from the walk cycle; the loader strips dots from node names.
const ARM_TRACK = /^(upperarm|lowerarm|wrist|hand|handslot)[lr]\./;
const BLEND_RATE = 16;

interface Source {
  scene: THREE.Object3D;
  clips: Record<ClipName, THREE.AnimationClip>;
}
const sources: Source[] = [];

export async function loadChefs(): Promise<void> {
  const loader = new GLTFLoader();
  const loaded = await Promise.all(CHARACTERS.map((name) => loader.loadAsync(`/models/chef_${name}.glb`)));
  for (const gltf of loaded) {
    const find = (name: string) => {
      const clip = gltf.animations.find((candidate) => candidate.name === name);
      if (!clip) throw new Error(`Character is missing the ${name} animation`);
      return clip;
    };
    // Splitting clips by bone lets the legs keep running while the arms hold a carry pose.
    const split = (clip: THREE.AnimationClip, name: string, arms: boolean) =>
      new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((track) => ARM_TRACK.test(track.name) === arms));
    sources.push({
      scene: gltf.scene,
      clips: {
        idle: find("Idle"),
        run: find("Running_A"),
        idleLegs: split(find("Idle"), "idleLegs", false),
        runLegs: split(find("Running_A"), "runLegs", false),
        carry: split(find("2H_Melee_Idle"), "carry", true),
        chop: find("1H_Melee_Attack_Chop"),
      },
    });
  }
}

export interface ChefRig {
  group: THREE.Group;
  // Where a held item is attached.
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<ClipName, THREE.AnimationAction>;
  weights: Record<ClipName, number>;
  knife: THREE.Object3D;
}

// A chef's toque, sized in the character pack's units and worn on the head bone.
function createToque(): THREE.Group {
  const white = mat(COLORS.hat, 0.8);
  const toque = new THREE.Group();
  toque.add(
    mesh(new THREE.CylinderGeometry(0.47, 0.45, 0.24, 24), white, 0, 0, 0),
    mesh(new THREE.CylinderGeometry(0.52, 0.45, 0.4, 14), white, 0, 0.3, 0),
    mesh(new THREE.SphereGeometry(0.42, 18, 12), white, 0, 0.56, 0),
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    toque.add(mesh(new THREE.SphereGeometry(0.28, 14, 10), white, Math.cos(angle) * 0.32, 0.5, Math.sin(angle) * 0.32));
  }
  return toque;
}

let blobMap: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const fade = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  fade.addColorStop(0, "rgba(0, 0, 0, 0.5)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createChef(seat: number, isLocal: boolean): ChefRig {
  const source = sources[seat % sources.length];
  const colour = COLORS.shirts[seat % COLORS.shirts.length];
  const group = new THREE.Group();

  const figure = clone(source.scene);
  figure.scale.setScalar(MODEL_SCALE);
  figure.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
    // Skinned meshes are culled by their rest pose, which is wrong once they animate.
    child.frustumCulled = false;
  });
  const toque = createToque();
  toque.position.y = TOQUE_HEIGHT;
  toque.traverse((child) => (child.castShadow = true));
  figure.getObjectByName("head")?.add(toque);
  const knife = model("knife");
  knife.visible = false;
  figure.getObjectByName("handslotr")?.add(knife);
  group.add(figure);

  // A soft blob grounds the chef, and a coloured ring tells players apart; your own is brighter.
  blobMap ??= blobTexture();
  const blob = mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({ map: blobMap, transparent: true, depthWrite: false }),
    0,
    0.012,
    0,
  );
  const ring = mesh(
    new THREE.RingGeometry(isLocal ? 0.4 : 0.38, isLocal ? 0.52 : 0.45, 40),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: isLocal ? 0.95 : 0.6, depthWrite: false }),
    0,
    0.018,
    0,
  );
  blob.rotation.x = ring.rotation.x = -Math.PI / 2;
  group.add(blob, ring);

  // Every clip plays all the time; the pose comes from how their weights are mixed.
  const mixer = new THREE.AnimationMixer(figure);
  const actions = {} as Record<ClipName, THREE.AnimationAction>;
  const weights = {} as Record<ClipName, number>;
  for (const name of CLIP_NAMES) {
    actions[name] = mixer.clipAction(source.clips[name]);
    weights[name] = name === "idle" ? 1 : 0;
    actions[name].setEffectiveWeight(weights[name]).play();
  }
  return { group, body: group, mixer, actions, weights, knife };
}

// How far above the head bone the toque sits, in the pack's units.
const TOQUE_HEIGHT = 0.95;

// Mixes the clips for this frame: standing, running, carrying or chopping.
export function animateChef(rig: ChefRig, player: PlayerState, dt: number): void {
  const speed = playerSpeedFraction(player);
  const moving = speed > 0.12;
  const wanted: Partial<Record<ClipName, number>> = {};
  if (player.chopping) {
    wanted.chop = 1;
  } else if (player.held) {
    wanted[moving ? "runLegs" : "idleLegs"] = 1;
    wanted.carry = 1;
  } else {
    wanted[moving ? "run" : "idle"] = 1;
  }

  const blend = 1 - Math.exp(-BLEND_RATE * dt);
  for (const name of CLIP_NAMES) {
    rig.weights[name] += ((wanted[name] ?? 0) - rig.weights[name]) * blend;
    rig.actions[name].setEffectiveWeight(rig.weights[name]);
  }
  rig.actions.run.timeScale = rig.actions.runLegs.timeScale = 0.6 + speed * 0.7;
  rig.actions.chop.timeScale = 1.6;
  rig.knife.visible = player.chopping;
  rig.mixer.update(dt);
}
