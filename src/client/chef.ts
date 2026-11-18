import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { seatCharacter } from "../shared/characters";
import { playerSpeedFraction, type PlayerState } from "../shared/sim";
import { decoration, model, MODEL_SCALE, markShared, markTreeShared } from "./assets";
import { COLORS, mat, mesh } from "./models";

// KayKit Adventurers characters (CC0), trimmed by scripts/trim_character.py; each seat starts as one of them.
const CHARACTERS = ["knight", "barbarian", "mage", "rogue"];

// The animal chefs borrow an adventurer's rig and animations: its head is swapped for the animal's own, a tail is
// hung on the hips, and the body is repainted as a white chef's jacket with furry arms and dark trousers.
interface AnimalLook {
  base: (typeof CHARACTERS)[number];
  // Colour of the arms: fur for the animals, satin gloves for Icy.
  fur: number;
  jacket?: number;
  trousers?: number;
  // What hangs on the hips, if not the animal's tail.
  hips?: string;
  // False for a chef whose head prop brings its own headwear (Icy's crown), so the toque is left off.
  toque?: boolean;
}
const ANIMALS: Record<string, AnimalLook> = {
  mouse: { base: "rogue", fur: 0xa7abb8 },
  cat: { base: "rogue", fur: 0xf0953a },
  bear: { base: "barbarian", fur: 0x8a5a3c },
  frog: { base: "mage", fur: 0x6cc04a, trousers: 0x2f6d3a },
  penguin: { base: "knight", fur: 0x2a2d38, trousers: 0x2a2d38 },
  fox: { base: "rogue", fur: 0xe8692a },
  pig: { base: "barbarian", fur: 0xf4a7b5 },
  elephant: { base: "barbarian", fur: 0x9aa7c4, trousers: 0x4a4f63 },
  icy: { base: "rogue", fur: 0xfff4fa, jacket: 0xf7a8c8, trousers: 0xf7a8c8, hips: "skirt_icy", toque: false },
};
const TAILLESS = new Set(["frog"]);

// Decoration props the animal chefs need, for loading with the kitchen's own.
const hipsProp = (id: string): string | null => ANIMALS[id]?.hips ?? (TAILLESS.has(id) ? null : `tail_${id}`);
export const CHEF_PROPS = Object.keys(ANIMALS).flatMap((id) => [`head_${id}`, hipsProp(id) ?? []].flat());

type ClipName = "idle" | "run" | "idleLegs" | "runLegs" | "carry" | "chop" | "cheer";
const CLIP_NAMES: ClipName[] = ["idle", "run", "idleLegs", "runLegs", "carry", "chop", "cheer"];

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
    markTreeShared(gltf.scene);
    sources.push({
      scene: gltf.scene,
      clips: {
        idle: find("Idle"),
        run: find("Running_A"),
        idleLegs: split(find("Idle"), "idleLegs", false),
        runLegs: split(find("Running_A"), "runLegs", false),
        carry: split(find("2H_Melee_Idle"), "carry", true),
        chop: find("1H_Melee_Attack_Chop"),
        cheer: find("Cheer"),
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
  // Held while scrubbing plates, in place of the knife.
  sponge: THREE.Object3D;
  // Bones the scrubbing motion is layered onto, and how far into that motion the chef is.
  chest: THREE.Object3D | null;
  arms: Array<THREE.Object3D | null>;
  scrub: number;
  time: number;
  // The character model itself, which leans forward into a dash.
  figure: THREE.Object3D;
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

export function createChef(seat: number, isLocal: boolean, character: string = seatCharacter(seat)): ChefRig {
  const animal = ANIMALS[character];
  const human = CHARACTERS.indexOf(animal?.base ?? character);
  const source = sources[human >= 0 ? human : seat % sources.length];
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
  if (animal) dressAnimal(figure, character, animal);
  const toque = createToque();
  toque.position.y = TOQUE_HEIGHT;
  toque.traverse((child) => (child.castShadow = true));
  if (animal?.toque !== false) figure.getObjectByName("head")?.add(toque);
  const knife = model("knife");
  knife.visible = false;
  figure.getObjectByName("handslotr")?.add(knife);
  const sponge = createSponge();
  sponge.visible = false;
  figure.getObjectByName("handslotr")?.add(sponge);
  group.add(figure);

  // A soft blob grounds the chef, and a coloured ring tells players apart; your own is brighter.
  if (!blobMap) {
    blobMap = blobTexture();
    markShared(blobMap);
  }
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
  return {
    group,
    body: group,
    mixer,
    actions,
    weights,
    knife,
    sponge,
    chest: figure.getObjectByName("chest") ?? null,
    arms: [figure.getObjectByName("upperarml") ?? null, figure.getObjectByName("upperarmr") ?? null],
    scrub: 0,
    time: 0,
    figure,
  };
}

// Swaps the adventurer's head for the animal's, adds its tail and repaints the body as a chef's whites.
function dressAnimal(figure: THREE.Object3D, id: string, look: AnimalLook): void {
  const jacket = new THREE.MeshStandardMaterial({ color: look.jacket ?? 0xfbf7ee, roughness: 0.75 });
  const fur = new THREE.MeshStandardMaterial({ color: look.fur, roughness: 0.8 });
  const trousers = new THREE.MeshStandardMaterial({ color: look.trousers ?? 0x3a3540, roughness: 0.8 });
  figure.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name.endsWith("_Head")) child.visible = false;
    else if (child.name.endsWith("_Body")) child.material = jacket;
    else if (child.name.includes("_Arm")) child.material = fur;
    else if (child.name.includes("_Leg")) child.material = trousers;
  });
  const head = decoration(`head_${id}`);
  if (head) figure.getObjectByName("head")?.add(head);
  const hips = hipsProp(id);
  const tail = hips ? decoration(hips) : null;
  if (tail) figure.getObjectByName("hips")?.add(tail);
  for (const part of [head, tail]) part?.traverse((child) => (child.castShadow = true));
}

// A kitchen sponge in the pack's units: yellow foam with a green scouring side, flecked with suds.
function createSponge(): THREE.Group {
  const sponge = new THREE.Group();
  sponge.add(
    mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), mat(0xffd84a, 0.9), 0, 0, 0),
    mesh(new THREE.BoxGeometry(0.34, 0.07, 0.24), mat(0x3f9d57, 0.9), 0, 0.115, 0),
  );
  for (let i = 0; i < 4; i++) {
    sponge.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffffff, 0.2), -0.12 + i * 0.08, -0.08, (i % 2) * 0.08 - 0.04));
  }
  sponge.traverse((child) => (child.castShadow = true));
  return sponge;
}

// How far above the head bone the toque sits, in the pack's units.
const TOQUE_HEIGHT = 0.95;

// Mixes the clips for this frame: standing, running, carrying, chopping or scrubbing at the sink.
export function animateChef(rig: ChefRig, player: PlayerState, dt: number): void {
  const speed = playerSpeedFraction(player);
  const moving = speed > 0.12;
  const wanted: Partial<Record<ClipName, number>> = {};
  const washing = Boolean(player.washing);
  if (player.chopping) {
    wanted.chop = 1;
  } else if (washing) {
    // Both hands reach forward into the basin, the way they hold a carried dish.
    wanted.idleLegs = 1;
    wanted.carry = 1;
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
  rig.sponge.visible = washing;
  rig.mixer.update(dt);

  // A cartoon dash: the chef pitches forward into it and springs back upright after.
  const lean = player.dashTime > 0 ? 0.42 : 0;
  rig.figure.rotation.x += (lean - rig.figure.rotation.x) * (1 - Math.exp(-(lean > 0 ? 30 : 10) * dt));
  const stretch = 1 + rig.figure.rotation.x * 0.15;
  rig.figure.scale.set(MODEL_SCALE / Math.sqrt(stretch), MODEL_SCALE * stretch, MODEL_SCALE / Math.sqrt(stretch));

  // Scrubbing is layered on top of the clips: lean over the sink and work the sponge round in circles.
  rig.time += dt;
  rig.scrub += ((washing ? 1 : 0) - rig.scrub) * blend;
  if (rig.scrub < 0.01) return;
  const circle = rig.time * 11;
  if (rig.chest) {
    rig.chest.rotation.x += 0.28 * rig.scrub;
    rig.chest.rotation.y += Math.sin(circle) * 0.16 * rig.scrub;
  }
  rig.arms.forEach((arm, side) => {
    if (!arm) return;
    const phase = circle + side * Math.PI;
    arm.rotation.x += Math.sin(phase) * 0.32 * rig.scrub;
    arm.rotation.z += Math.cos(phase) * 0.22 * rig.scrub;
  });
}

// ---------------------------------------------------------------- results poses

export type ResultPose = "cheer" | "sad";

// Big cartoon tears for the losing pose: a drop under each eye and a stream running down the cheek, in the head bone's
// units (the same frame the animal heads and the toque are authored in).
function createTears(): THREE.Group {
  const tears = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({ color: 0x6fc8ff, emissive: 0x2a8fd0, emissiveIntensity: 0.35, roughness: 0.1 });
  for (const side of [-1, 1]) {
    const stream = mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), water, side * 0.2, 0.33, 0.47);
    stream.rotation.z = side * 0.12;
    const drop = mesh(new THREE.SphereGeometry(0.06, 12, 10), water, side * 0.23, 0.17, 0.48);
    drop.scale.y = 1.3;
    tears.add(stream, drop);
  }
  return tears;
}

// Freezes a chef in a results pose at time t (seconds): mid-cheer from the rig's own Cheer animation, or slumped
// and crying, with its head down, its arms hanging and a little sob in the shoulders.
export function poseChef(rig: ChefRig, pose: ResultPose, t: number): void {
  for (const name of CLIP_NAMES) {
    const weight = pose === "cheer" ? (name === "cheer" ? 1 : 0) : name === "idle" ? 1 : 0;
    rig.weights[name] = weight;
    rig.actions[name].setEffectiveWeight(weight);
  }
  rig.knife.visible = rig.sponge.visible = false;
  rig.mixer.setTime(pose === "cheer" ? t % rig.actions.cheer.getClip().duration : 0.4);
  if (pose !== "sad") return;
  // Every tweak is added on top of the idle pose: the bones have rest rotations of their own, so setting them
  // outright would twist the chef round. Not every bone is keyed by the idle clip, so the pose's starting rotations
  // are saved the first time and put back each frame; otherwise each frame would bend the chef a little further.
  const bones = [rig.chest, rig.figure.getObjectByName("head") ?? null, ...rig.arms].filter((bone): bone is THREE.Object3D => bone !== null);
  const saved = (rig.figure.userData.sadBase ??= bones.map((bone) => bone.quaternion.clone())) as THREE.Quaternion[];
  bones.forEach((bone, i) => bone.quaternion.copy(saved[i]));
  const sob = Math.sin(t * 9) * 0.04;
  if (rig.chest) rig.chest.rotation.x += 0.22 + sob;
  const head = rig.figure.getObjectByName("head");
  if (head) head.rotation.x += 0.28 + sob;
  rig.arms.forEach((arm, side) => {
    if (arm) arm.rotation.z += side ? -0.18 : 0.18;
  });
  if (head && !head.getObjectByName("tears")) {
    const tears = createTears();
    tears.name = "tears";
    head.add(tears);
  }
}
