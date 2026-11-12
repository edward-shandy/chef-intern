import { tileAt, type ItemKind, type Level } from "./level";

export const SIM_STEP = 1 / 60;
export const PLAYER_RADIUS = 0.34;
const PLAYER_SPEED = 4.6;
const PLAYER_ACCEL = 16;
const REACH = 0.75;

export interface PlayerState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Radians around Y; 0 faces +Z (towards the camera).
  facing: number;
  held: ItemKind | null;
}

export interface GameState {
  players: PlayerState[];
  // Items resting on solid tiles, keyed by tile index.
  counterItems: Record<number, ItemKind>;
}

export interface PlayerInput {
  moveX: number;
  moveZ: number;
  // True only on the step where the interact button was pressed.
  interact: boolean;
}

export function createGame(level: Level, playerCount: number): GameState {
  const players: PlayerState[] = [];
  for (let id = 0; id < playerCount; id++) {
    const spawn = level.spawns[id % level.spawns.length];
    players.push({ id, x: spawn.x, z: spawn.z, vx: 0, vz: 0, facing: 0, held: null });
  }
  return { players, counterItems: {} };
}

// Index of the solid tile the player is facing and close enough to use, if any.
export function targetTile(level: Level, player: PlayerState): number | null {
  const tx = Math.floor(player.x + Math.sin(player.facing) * REACH);
  const tz = Math.floor(player.z + Math.cos(player.facing) * REACH);
  const tile = tileAt(level, tx, tz);
  return tile && tile.kind !== "floor" ? tz * level.width + tx : null;
}

function interact(level: Level, state: GameState, player: PlayerState): void {
  const index = targetTile(level, player);
  if (index === null) return;
  const tile = level.tiles[index];
  const resting = state.counterItems[index];

  if (player.held) {
    if (tile.kind === "trash") {
      player.held = null;
    } else if (tile.kind === "counter" && !resting) {
      state.counterItems[index] = player.held;
      player.held = null;
    }
  } else if (resting) {
    player.held = resting;
    delete state.counterItems[index];
  } else if (tile.kind === "crate" && tile.dispenses) {
    player.held = tile.dispenses;
  }
}

// Pushes the player's circle out of every solid tile it overlaps.
function resolveCollisions(level: Level, player: PlayerState): void {
  const baseX = Math.floor(player.x);
  const baseZ = Math.floor(player.z);
  for (let tz = baseZ - 1; tz <= baseZ + 1; tz++) {
    for (let tx = baseX - 1; tx <= baseX + 1; tx++) {
      const tile = tileAt(level, tx, tz);
      if (tile && tile.kind === "floor") continue;
      const dx = player.x - Math.max(tx, Math.min(player.x, tx + 1));
      const dz = player.z - Math.max(tz, Math.min(player.z, tz + 1));
      const distance = Math.hypot(dx, dz);
      if (distance >= PLAYER_RADIUS || distance < 1e-6) continue;
      const push = (PLAYER_RADIUS - distance) / distance;
      player.x += dx * push;
      player.z += dz * push;
    }
  }
}

// Advances the whole game by dt seconds; inputs are indexed like state.players.
export function stepGame(level: Level, state: GameState, inputs: PlayerInput[], dt: number): void {
  state.players.forEach((player, i) => {
    const input = inputs[i];
    if (!input) return;

    let { moveX, moveZ } = input;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }
    if (length > 0.1) player.facing = Math.atan2(moveX, moveZ);

    const blend = Math.min(1, PLAYER_ACCEL * dt);
    player.vx += (moveX * PLAYER_SPEED - player.vx) * blend;
    player.vz += (moveZ * PLAYER_SPEED - player.vz) * blend;
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    resolveCollisions(level, player);

    if (input.interact) interact(level, state, player);
  });
}

export const playerSpeedFraction = (player: PlayerState): number =>
  Math.min(1, Math.hypot(player.vx, player.vz) / PLAYER_SPEED);
