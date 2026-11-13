import type { Ingredient, RecipeId } from "./recipes";

export type TileKind =
  | "floor"
  | "counter"
  | "crate"
  | "trash"
  | "board"
  | "stove"
  | "plates"
  | "serve"
  // Fixtures that fill a cabinet slot but cannot be used: a sink, a fridge, or a counter with a pot plant on it.
  | "sink"
  | "fridge"
  | "plant";

// Which decoration models a kitchen uses for its fixtures.
export interface Decor {
  sink: string;
  fridge: string;
  plants: string[];
}

export interface Tile {
  kind: TileKind;
  dispenses?: Ingredient;
}

export interface Level {
  name: string;
  width: number;
  height: number;
  tiles: Tile[];
  spawns: Array<{ x: number; z: number }>;
  // Score one chef alone must reach to clear this kitchen.
  target: number;
  // Orders that can come up in this kitchen.
  recipes: RecipeId[];
  decor: Decor;
}

// One character per tile; S is a floor tile that also marks a spawn point.
const LEGEND: Record<string, Tile> = {
  ".": { kind: "floor" },
  S: { kind: "floor" },
  "#": { kind: "counter" },
  T: { kind: "crate", dispenses: "tomato" },
  L: { kind: "crate", dispenses: "lettuce" },
  N: { kind: "crate", dispenses: "onion" },
  X: { kind: "trash" },
  B: { kind: "board" },
  O: { kind: "stove" },
  P: { kind: "plates" },
  W: { kind: "serve" },
  K: { kind: "sink" },
  F: { kind: "fridge" },
  V: { kind: "plant" },
};

export function parseLevel(name: string, target: number, recipes: RecipeId[], decor: Decor, rows: string[]): Level {
  const width = rows[0].length;
  const level: Level = { name, width, height: rows.length, tiles: [], spawns: [], target, recipes, decor };
  rows.forEach((row, tz) => {
    if (row.length !== width) throw new Error(`Level row ${tz} has the wrong width`);
    [...row].forEach((char, tx) => {
      const tile = LEGEND[char];
      if (!tile) throw new Error(`Unknown level tile "${char}"`);
      level.tiles.push(tile);
      if (char === "S") level.spawns.push({ x: tx + 0.5, z: tz + 0.5 });
    });
  });
  return level;
}

// Returns null for coordinates outside the map so callers can treat them as walls.
export function tileAt(level: Level, tx: number, tz: number): Tile | null {
  if (tx < 0 || tz < 0 || tx >= level.width || tz >= level.height) return null;
  return level.tiles[tz * level.width + tx];
}

// Fixtures block the way like any counter but are never a target for the chef's hands.
export const isFixture = (tile: Tile): boolean => tile.kind === "sink" || tile.kind === "fridge" || tile.kind === "plant";

// Only these tiles can have an item resting on them.
export const holdsItems = (tile: Tile): boolean =>
  tile.kind === "counter" || tile.kind === "board" || tile.kind === "stove";

// Clearing one kitchen unlocks the next; they must all share one size, which the camera is framed for.
export const LEVELS: Level[] = [
  // A homely kitchen: farmhouse sink, cream fridge and small pot plants on the corner counters.
  parseLevel(
    "Open Kitchen",
    60,
    ["lettuce_salad", "salad", "soup"],
    { sink: "sink_farmhouse", fridge: "fridge_cream", plants: ["plant_lime", "plant_succulent"] },
    [
      "V#T#L#K#P##FV",
      "#S.........S#",
      "B...........O",
      "#...........O",
      "B...#####...#",
      "#...........#",
      "#...........#",
      "#S.........S#",
      "V##X##WW####V",
    ],
  ),
  // A working line: prep on the left, cooking and serving on the right, joined only by the gap in the divider.
  parseLevel(
    "The Pass",
    80,
    ["lettuce_salad", "salad", "soup", "onion_soup"],
    { sink: "sink_industrial", fridge: "fridge_pro", plants: ["plant_bamboo", "plant_tropical"] },
    [
      "F#T#L#N#KP##V",
      "#S....#....S#",
      "B.....#.....O",
      "B.....#.....O",
      "#...........#",
      "#.....#.....#",
      "#.....#.....W",
      "#S....#....SW",
      "V##X#########",
    ],
  ),
];
