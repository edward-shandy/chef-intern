import type { Level } from "../shared/level";
import { IDLE_INPUT, targetTile, type GameState, type PlayerInput } from "../shared/sim";

const ARRIVE_DISTANCE = 0.14;
const GIVE_UP_MS = 10_000;
const NEIGHBOURS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

interface Goal {
  // Tile the chef should use once it arrives, or null for a plain walk.
  station: number | null;
  // Remaining floor tiles to walk through, nearest first.
  path: number[];
  startedAt: number;
  // Set once the chef starts chopping, so finishing does not also pick the food up.
  chopping: boolean;
}

export interface Autopilot {
  goTo(tile: number, state: GameState, localId: number | null): void;
  cancel(): void;
  // Input to send this frame, or null when there is nothing to do.
  step(state: GameState | null, localId: number | null): PlayerInput | null;
}

// Turns a clicked tile into walking and interacting input, as if typed on the keyboard.
export function createAutopilot(level: Level): Autopilot {
  let goal: Goal | null = null;

  const isFloor = (tx: number, tz: number) =>
    tx >= 0 && tz >= 0 && tx < level.width && tz < level.height && level.tiles[tz * level.width + tx].kind === "floor";

  // Breadth-first search over floor tiles; diagonals may not cut a counter corner.
  const walkDistances = (from: number): Map<number, number> => {
    const cameFrom = new Map<number, number>([[from, from]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      const cx = current % level.width;
      const cz = Math.floor(current / level.width);
      for (const [dx, dz] of NEIGHBOURS) {
        const next = (cz + dz) * level.width + cx + dx;
        if (cameFrom.has(next) || !isFloor(cx + dx, cz + dz)) continue;
        if (dx !== 0 && dz !== 0 && !(isFloor(cx + dx, cz) && isFloor(cx, cz + dz))) continue;
        cameFrom.set(next, current);
        queue.push(next);
      }
    }
    return cameFrom;
  };

  const pathTo = (cameFrom: Map<number, number>, to: number): number[] => {
    const path: number[] = [];
    for (let tile = to; cameFrom.get(tile) !== tile; tile = cameFrom.get(tile)!) path.unshift(tile);
    return path;
  };

  const centre = (tile: number) => ({ x: (tile % level.width) + 0.5, z: Math.floor(tile / level.width) + 0.5 });

  // Snaps a direction to the eight keyboard directions so input changes stay rare.
  const steer = (dx: number, dz: number): PlayerInput => ({
    ...IDLE_INPUT,
    moveX: Math.abs(dx) > Math.abs(dz) * 0.4 ? Math.sign(dx) : 0,
    moveZ: Math.abs(dz) > Math.abs(dx) * 0.4 ? Math.sign(dz) : 0,
  });

  return {
    goTo(tile, state, localId) {
      const me = state.players.find((player) => player.id === localId);
      if (!me) return;
      const cameFrom = walkDistances(Math.floor(me.z) * level.width + Math.floor(me.x));
      const startedAt = performance.now();

      if (level.tiles[tile].kind === "floor") {
        if (cameFrom.has(tile)) goal = { station: null, path: pathTo(cameFrom, tile), startedAt, chopping: false };
        return;
      }
      // For a station, stand on whichever free side is the shortest walk away.
      const tx = tile % level.width;
      const sides = [tx > 0 ? tile - 1 : -1, tx < level.width - 1 ? tile + 1 : -1, tile - level.width, tile + level.width]
        .filter((side) => cameFrom.has(side))
        .map((side) => pathTo(cameFrom, side))
        .sort((a, b) => a.length - b.length);
      if (sides.length > 0) goal = { station: tile, path: sides[0], startedAt, chopping: false };
    },

    cancel() {
      goal = null;
    },

    step(state, localId) {
      const me = state?.players.find((player) => player.id === localId);
      if (!goal || !state || !me || performance.now() - goal.startedAt > GIVE_UP_MS) {
        goal = null;
        return null;
      }

      if (goal.path.length > 0) {
        const next = centre(goal.path[0]);
        const dx = next.x - me.x;
        const dz = next.z - me.z;
        if (Math.hypot(dx, dz) > ARRIVE_DISTANCE) return steer(dx, dz);
        goal.path.shift();
        if (goal.path.length > 0) return steer(centre(goal.path[0]).x - me.x, centre(goal.path[0]).z - me.z);
      }
      if (goal.station === null) {
        goal = null;
        return IDLE_INPUT;
      }

      // Walk into the station until the chef is facing it.
      const station = centre(goal.station);
      if (targetTile(level, me) !== goal.station) return steer(station.x - me.x, station.z - me.z);

      // An unchopped ingredient on a board gets chopped; anything else is a normal interact.
      const item = state.tileItems[goal.station];
      const choppable =
        level.tiles[goal.station].kind === "board" && item?.type === "ingredient" && item.chop < 1 && !me.held;
      if (choppable) {
        goal.chopping = true;
        return { ...IDLE_INPUT, use: true };
      }
      const interact = !goal.chopping;
      goal = null;
      return { ...IDLE_INPUT, interact };
    },
  };
}
