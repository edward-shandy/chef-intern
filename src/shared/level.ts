export type TileKind = "floor" | "counter" | "crate" | "trash";
export type ItemKind = "tomato" | "lettuce";

export interface Tile {
  kind: TileKind;
  dispenses?: ItemKind;
}

export interface Level {
  width: number;
  height: number;
  tiles: Tile[];
  spawns: Array<{ x: number; z: number }>;
}

// One character per tile; S is a floor tile that also marks a spawn point.
const LEGEND: Record<string, Tile> = {
  ".": { kind: "floor" },
  S: { kind: "floor" },
  "#": { kind: "counter" },
  T: { kind: "crate", dispenses: "tomato" },
  L: { kind: "crate", dispenses: "lettuce" },
  X: { kind: "trash" },
};

export function parseLevel(rows: string[]): Level {
  const width = rows[0].length;
  const level: Level = { width, height: rows.length, tiles: [], spawns: [] };
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

export const KITCHEN_01 = parseLevel([
  "####T###L####",
  "#S.........S#",
  "#...........#",
  "#...........#",
  "#...#####...#",
  "#...........#",
  "#...........#",
  "#S.........S#",
  "######X######",
]);
