import { LEVELS } from "../shared/level";
import type { Acks } from "../shared/protocol";
import { IDLE_INPUT, predictPlayer, SIM_STEP, type GameState, type PlayerInput, type PlayerState } from "../shared/sim";

const STEP_MS = SIM_STEP * 1000;
// Other chefs are drawn this far in the past so there are always two snapshots to blend.
const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOTS = 12;
const MAX_REPLAY_STEPS = 90;
// Corrections larger than this are a teleport, not drift, and are shown at once.
const SNAP_DISTANCE = 1.5;
const CORRECTION_RATE = 12;

interface SentInput {
  seq: number;
  input: PlayerInput;
  // Local time the input took effect.
  at: number;
}

interface Snapshot {
  at: number;
  state: GameState;
}

export interface ClientWorld {
  readonly latest: GameState | null;
  readonly localId: number | null;
  // Starts a fresh session; the server resets its input counter on every welcome too.
  welcome(id: number, now: number): void;
  disconnect(): void;
  // Records an input change and returns the sequence number to send with it.
  pushInput(input: PlayerInput, now: number): number;
  onSnapshot(state: GameState, acks: Acks, now: number): void;
  // State to draw this frame: own chef predicted ahead, everyone else interpolated.
  frame(now: number): GameState | null;
}

// Hides latency: the local chef moves at once and is quietly corrected against the server.
export function createClientWorld(): ClientWorld {
  let localId: number | null = null;
  let latest: GameState | null = null;
  let snapshots: Snapshot[] = [];
  let sent: SentInput[] = [];
  let nextSeq = 1;
  let predicted: PlayerState | null = null;
  let before = { x: 0, z: 0 };
  let lastFrame = 0;
  let accumulator = 0;
  // Leftover visual error from the last correction, faded out over a few frames.
  const drift = { x: 0, z: 0 };
  // Where the local chef was last drawn.
  let shownAt: { x: number; z: number } | null = null;

  const others = () => latest?.players.filter((player) => player.id !== localId) ?? [];

  // Re-runs every input the server has not seen yet on top of its latest position.
  const reconcile = (server: PlayerState, ack: [number, number], playing: boolean, now: number) => {
    const [ackSeq, ackSteps] = ack;
    sent = sent.filter((entry) => entry.seq >= ackSeq);
    const next = { ...server };
    let budget = playing ? MAX_REPLAY_STEPS : 0;
    before = { x: next.x, z: next.z };
    accumulator = 0;
    sent.forEach((entry, i) => {
      const isCurrent = i === sent.length - 1;
      const unseen = Math.max(0, (sent[i + 1]?.at ?? now) - entry.at - (entry.seq === ackSeq ? ackSteps * STEP_MS : 0));
      const steps = Math.min(budget, isCurrent ? Math.floor(unseen / STEP_MS) : Math.round(unseen / STEP_MS));
      budget -= steps;
      for (let step = 0; step < steps; step++) {
        before = { x: next.x, z: next.z };
        predictPlayer(LEVELS[latest?.level ?? 0], next, entry.input, others(), SIM_STEP);
      }
      // The part-step left over carries on as the blend between the last two positions.
      if (isCurrent && playing) accumulator = Math.min(STEP_MS, unseen - steps * STEP_MS);
    });

    // Whatever the correction moved is kept as drift, so the chef on screen never jumps.
    if (predicted && shownAt) {
      const blend = accumulator / STEP_MS;
      drift.x = shownAt.x - (before.x + (next.x - before.x) * blend);
      drift.z = shownAt.z - (before.z + (next.z - before.z) * blend);
      if (Math.hypot(drift.x, drift.z) > SNAP_DISTANCE) drift.x = drift.z = 0;
    }
    predicted = next;
  };

  const interpolated = (player: PlayerState, renderTime: number): PlayerState => {
    let older: Snapshot | null = null;
    let newer: Snapshot | null = null;
    for (const snapshot of snapshots) {
      if (snapshot.at <= renderTime) older = snapshot;
      else if (!newer) newer = snapshot;
    }
    const a = older?.state.players.find((other) => other.id === player.id);
    const b = newer?.state.players.find((other) => other.id === player.id);
    if (!a || !b) return a ? { ...player, x: a.x, z: a.z } : player;
    const t = (renderTime - older!.at) / (newer!.at - older!.at);
    return { ...player, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, facing: t < 0.5 ? a.facing : b.facing };
  };

  return {
    get latest() {
      return latest;
    },
    get localId() {
      return localId;
    },

    welcome(id, now) {
      localId = id;
      sent = [{ seq: 0, input: IDLE_INPUT, at: now }];
      nextSeq = 1;
      predicted = null;
      shownAt = null;
      drift.x = drift.z = 0;
    },

    disconnect() {
      latest = null;
      snapshots = [];
      predicted = null;
    },

    pushInput(input, now) {
      const seq = nextSeq++;
      sent.push({ seq, input: { ...input, interact: false }, at: now });
      return seq;
    },

    onSnapshot(state, acks, now) {
      latest = state;
      snapshots.push({ at: now, state });
      if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
      const server = state.players.find((player) => player.id === localId);
      const ack = localId === null ? undefined : acks[localId];
      if (server && ack) reconcile(server, ack, state.phase === "playing", now);
      else predicted = null;
    },

    frame(now) {
      if (!latest) return null;
      const dt = Math.min(250, now - (lastFrame || now));
      lastFrame = now;

      const current = sent.at(-1);
      if (predicted && current && latest.phase === "playing") {
        accumulator += dt;
        while (accumulator >= STEP_MS) {
          before = { x: predicted.x, z: predicted.z };
          predictPlayer(LEVELS[latest.level], predicted, current.input, others(), SIM_STEP);
          accumulator -= STEP_MS;
        }
      }
      const fade = Math.exp((-CORRECTION_RATE * dt) / 1000);
      drift.x *= fade;
      drift.z *= fade;

      const blend = accumulator / STEP_MS;
      const local = predicted;
      shownAt = local && {
        x: before.x + (local.x - before.x) * blend + drift.x,
        z: before.z + (local.z - before.z) * blend + drift.z,
      };
      const players = latest.players.map((player) =>
        player.id === localId && local && shownAt
          ? { ...player, ...shownAt, vx: local.vx, vz: local.vz, facing: local.facing }
          : interpolated(player, now - INTERPOLATION_DELAY_MS),
      );
      return { ...latest, players };
    },
  };
}
