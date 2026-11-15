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
  // Dish washing: served plates come back dirty at the return hatch and are cleaned at the wash sink.
  | "return"
  | "wash"
  // Charcoal grill: a whole chicken left on it roasts, then burns.
  | "grill"
  // Conveyor belt: whatever rests on it is carried one tile along every BELT_SECONDS.
  | "belt"
  // Wall bracket where the fire extinguisher starts each round, and the only station that can hold it besides a counter.
  | "extinguisher"
  // Fixtures that fill a cabinet slot but cannot be used: a sink, a fridge, or a counter with a pot plant on it.
  | "sink"
  | "fridge"
  | "plant";

// Which decoration models a kitchen uses for its fixtures.
export interface Decor {
  sink: string;
  fridge: string;
  plants: string[];
  // The restaurant around the kitchen; without it the kitchen stands alone against a plain wall.
  room?: RoomDecor;
}

// Positions are in tiles, measured from the kitchen's back-left corner like everything else.
export interface RoomDecor {
  // Panels of the kitchen's back wall from left to right, each two tiles wide.
  backWall: string[];
  // Panel that continues the back wall across the dining room, and the ones lining its sides.
  outerWall: string;
  sideWalls: string[];
  // How many tiles of dining room lie to the left and right of the kitchen.
  margin: number;
  // A table with its chairs; guests sit left then right, and an empty string leaves a chair free.
  tables: Array<{ model: string; x: number; z: number; guests: string[] }>;
  plants: Array<{ model: string; x: number; z: number }>;
  // Image used for the dining floor instead of the default checker.
  floor?: string;
  // Image used for the kitchen floor instead of the procedural tile texture.
  kitchenFloor?: string;
  // Low wall segment run along both sides of the kitchen.
  halfWall?: string;
  // Puts the restaurant on a town block: shops and a road behind it, a park, a parking lot and a front terrace.
  street?: { side: "back"; season?: "spring" | "summer" | "autumn" | "winter" };
  // Evening service: the lights go down and the lanterns among the props glow.
  night?: boolean;
  // Any other props, placed as they are.
  extras?: Array<{ model: string; x: number; z: number; turn?: number; scale?: number }>;
}

export interface Tile {
  kind: TileKind;
  dispenses?: Ingredient;
  // Which way a belt carries its load, in tiles.
  dir?: [dx: number, dz: number];
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
  // How many plates the kitchen owns; when set, plates run out and must be washed after each order.
  plates?: number;
  // When set, a pot left on the hob after burning sets the kitchen on fire.
  fire?: boolean;
  // How hard the kitchen is, from 1 to 5, shown as dots in the kitchen picker.
  difficulty: number;
}

// Rules a kitchen adds on top of plain cooking.
export interface LevelRules {
  plates?: number;
  fire?: boolean;
  difficulty?: number;
}

// One character per tile; S is a floor tile that also marks a spawn point.
const LEGEND: Record<string, Tile> = {
  ".": { kind: "floor" },
  S: { kind: "floor" },
  "#": { kind: "counter" },
  T: { kind: "crate", dispenses: "tomato" },
  L: { kind: "crate", dispenses: "lettuce" },
  N: { kind: "crate", dispenses: "onion" },
  C: { kind: "crate", dispenses: "chicken" },
  G: { kind: "grill" },
  "^": { kind: "belt", dir: [0, -1] },
  v: { kind: "belt", dir: [0, 1] },
  "<": { kind: "belt", dir: [-1, 0] },
  ">": { kind: "belt", dir: [1, 0] },
  X: { kind: "trash" },
  B: { kind: "board" },
  O: { kind: "stove" },
  P: { kind: "plates" },
  W: { kind: "serve" },
  R: { kind: "return" },
  Q: { kind: "wash" },
  E: { kind: "extinguisher" },
  K: { kind: "sink" },
  F: { kind: "fridge" },
  V: { kind: "plant" },
};

export function parseLevel(
  name: string,
  target: number,
  recipes: RecipeId[],
  decor: Decor,
  rows: string[],
  rules: LevelRules = {},
): Level {
  const width = rows[0].length;
  const level: Level = { name, width, height: rows.length, tiles: [], spawns: [], target, recipes, decor, difficulty: 1, ...rules };
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
  tile.kind === "counter" || tile.kind === "board" || tile.kind === "stove" || tile.kind === "grill" || tile.kind === "belt";

// Fire only takes hold of worktops; crates, sinks, belts and the serving window never burn.
export const burns = (tile: Tile): boolean => holdsItems(tile) && tile.kind !== "belt";

// The tile a belt hands its load on to, or null when the belt ends there.
export function beltNext(level: Level, index: number): number | null {
  const tile = level.tiles[index];
  if (tile?.kind !== "belt" || !tile.dir) return null;
  const tx = (index % level.width) + tile.dir[0];
  const tz = Math.floor(index / level.width) + tile.dir[1];
  return tileAt(level, tx, tz)?.kind === "belt" ? tz * level.width + tx : null;
}

// Clearing one kitchen unlocks the next; they must all share one size, which the camera is framed for.
export const LEVELS: Level[] = [
  // A homely kitchen: farmhouse sink, cream fridge and small pot plants on the corner counters.
  parseLevel(
    "Open Kitchen",
    320,
    ["lettuce_salad", "salad", "soup"],
    {
      sink: "sink_farmhouse",
      fridge: "fridge_cream",
      plants: ["plant_lime", "plant_succulent"],
      // A cosy restaurant: tables down both sides of the kitchen, windows along the walls, plants in the corners.
      room: {
        backWall: [
          "wall_teal_backsplash",
          "wall_window",
          "wall_teal_backsplash",
          "wall_teal_backsplash",
          "wall_teal_backsplash",
          "wall_window",
          "wall_teal_backsplash",
        ],
        outerWall: "wall_brick",
        sideWalls: ["wall_window", "wall_brick"],
        margin: 6,
        street: { side: "back", season: "summer" },
        tables: [
          { model: "dining_round", x: -3.6, z: 1.5, guests: ["guest_coral", "guest_blue"] },
          { model: "dining_square", x: -3.6, z: 4.3, guests: ["guest_mint", ""] },
          { model: "dining_booth", x: -3.6, z: 7.1, guests: ["", "guest_mustard"] },
          { model: "dining_square", x: 16.6, z: 1.5, guests: ["guest_mustard", "guest_coral"] },
          { model: "dining_booth", x: 16.6, z: 4.3, guests: ["guest_blue", ""] },
          { model: "dining_round", x: 16.6, z: 7.1, guests: ["", "guest_mint"] },
        ],
        plants: [
          { model: "plant_pink", x: -5.7, z: 0.5 },
          { model: "plant_blossom", x: 18.7, z: 0.5 },
          { model: "plant_tropical", x: 0.4, z: 10.4 },
          { model: "plant_bamboo", x: 12.6, z: 10.4 },
        ],
      },
    },
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
    400,
    ["lettuce_salad", "salad", "soup", "onion_soup"],
    {
      sink: "sink_industrial",
      fridge: "fridge_pro",
      plants: ["plant_bamboo", "plant_tropical"],
      room: {
        backWall: [
          "wall_brick",
          "wall_window",
          "wall_brick",
          "wall-dressing-panel",
          "wall_brick",
          "wall_window",
          "wall_brick",
        ],
        outerWall: "wall_brick",
        sideWalls: ["wall_window", "wall_brick"],
        margin: 6,
        floor: "/textures/customer-floor.svg",
        kitchenFloor: "/textures/kitchen-floor-checker.svg",
        halfWall: "kitchen-halfwall-brick",
        street: { side: "back" },
        tables: [
          { model: "dining-set-gingham", x: -3.6, z: 1.5, guests: ["guest_coral", "guest_blue", "", "guest_mint"] },
          { model: "dining-set-gingham", x: -3.6, z: 4.3, guests: ["guest_mustard", "", "guest_coral", ""] },
          { model: "dining-set-gingham", x: -3.6, z: 7.1, guests: ["", "guest_blue", "guest_mint", ""] },
          { model: "dining-set-gingham", x: 16.6, z: 1.5, guests: ["guest_mustard", "guest_coral", "", "guest_blue"] },
          { model: "dining-set-gingham", x: 16.6, z: 4.3, guests: ["guest_mint", "", "guest_blue", ""] },
          { model: "dining-set-gingham", x: 16.6, z: 7.1, guests: ["", "guest_coral", "guest_mustard", ""] },
        ],
        plants: [
          { model: "plant_pink", x: -5.7, z: 0.5 },
          { model: "plant_blossom", x: 18.7, z: 0.5 },
          { model: "plant_tropical", x: -5.7, z: 8.1 },
          { model: "plant_bamboo", x: 18.7, z: 8.1 },
        ],
        extras: [
          { model: "dining-detail-pack", x: 2.2, z: 10.1, scale: 1.15 },
          { model: "dining-detail-pack", x: 10.8, z: 10.1, scale: 1.15 },
        ],
      },
    },
    [
      "F#T#L##NKP##V",
      "#S....#....S#",
      "B.....#.....O",
      "B.....#.....O",
      "#...........#",
      "#.....#.....#",
      "#.....#.....W",
      "#S....#....SW",
      "V##X#########",
    ],
    { difficulty: 2 },
  ),
  // Three rooms in a zigzag (pantry, stoves, pass) and only four plates, so somebody has to wash up.
  parseLevel(
    "Rush Hour",
    360,
    ["lettuce_salad", "salad", "soup", "onion_soup"],
    {
      sink: "sink_single",
      fridge: "fridge_retro",
      plants: ["plant_blossom", "plant_pink"],
      room: {
        backWall: Array.from({ length: 7 }, () => "wall-dressing-panel"),
        outerWall: "wall_brick",
        sideWalls: ["wall_brick", "wall_window"],
        margin: 6,
        street: { side: "back", season: "autumn" },
        floor: "/textures/customer-floor.svg",
        halfWall: "kitchen-halfwall-brick",
        tables: [
          { model: "dining-set-gingham", x: -3.5, z: 2.3, guests: ["guest_mint", "guest_coral", "", "guest_blue"] },
          { model: "dining-set-gingham", x: -3.5, z: 6.6, guests: ["guest_mustard", "", "guest_coral", ""] },
          { model: "dining-set-gingham", x: 16.5, z: 2.3, guests: ["guest_blue", "guest_mustard", "guest_mint", ""] },
          { model: "dining-set-gingham", x: 16.5, z: 6.6, guests: ["", "guest_coral", "", "guest_mint"] },
        ],
        plants: [
          { model: "plant_tropical", x: -5.7, z: 0.5 },
          { model: "plant_bamboo", x: 18.7, z: 0.5 },
        ],
        extras: [
          { model: "dining-detail-pack", x: 2.4, z: 10.3, scale: 1.3 },
          { model: "dining-detail-pack", x: 10.8, z: 10.3, scale: 1.3 },
        ],
      },
    },
    [
      "VTLN#OO###PFV",
      "#.S.#.......#",
      "#...B...#...#",
      "#...B.S.#.S.W",
      "#...#...#...W",
      "#...#...Q...#",
      "#...#.S.#...#",
      "#.......#...#",
      "V#####X###R#V",
    ],
    { plates: 4, difficulty: 3 },
  ),
  // One long island of hobs between the pantry and the pass: soups everywhere, a chicken grill, and a forgotten pot starts a fire.
  parseLevel(
    "Hot Line",
    380,
    ["soup", "onion_soup", "salad", "roast_chicken"],
    {
      sink: "sink_wood_double",
      fridge: "fridge_cream",
      plants: ["plant_succulent", "plant_lime"],
      room: {
        backWall: [
          "wall_brick",
          "wall_teal_backsplash",
          "wall_window",
          "wall_teal_backsplash",
          "wall_window",
          "wall_teal_backsplash",
          "wall_brick",
        ],
        outerWall: "wall_brick",
        sideWalls: ["wall_brick", "wall_window"],
        margin: 6,
        street: { side: "back", season: "winter" },
        tables: [
          { model: "dining_booth", x: -3.6, z: 1.5, guests: ["guest_mint", "guest_coral"] },
          { model: "dining_booth", x: -3.6, z: 4.3, guests: ["guest_blue", ""] },
          { model: "dining_round", x: -3.6, z: 7.1, guests: ["guest_mustard", "guest_mint"] },
          { model: "dining_booth", x: 16.6, z: 1.5, guests: ["", "guest_blue"] },
          { model: "dining_booth", x: 16.6, z: 4.3, guests: ["guest_coral", "guest_mustard"] },
          { model: "dining_round", x: 16.6, z: 7.1, guests: ["guest_blue", ""] },
        ],
        plants: [
          { model: "plant_bamboo", x: -5.7, z: 0.5 },
          { model: "plant_tropical", x: 18.7, z: 0.5 },
          { model: "plant_pink", x: 0.4, z: 10.4 },
          { model: "plant_blossom", x: 12.6, z: 10.4 },
        ],
      },
    },
    [
      "V#T#L#N#C##EV",
      "#S.........S#",
      "#...........#",
      "#.#OO#OGBB#.#",
      "#...........#",
      "#...........#",
      "#S.........SW",
      "#...........W",
      "V##X##P#####V",
    ],
    { fire: true, difficulty: 4 },
  ),
  // The finale: four rooms round a cross of counters, five plates to keep washing, and three hobs that can catch fire.
  parseLevel(
    "Full House",
    420,
    ["salad", "soup", "onion_soup", "roast_chicken", "chicken_salad"],
    {
      sink: "sink_industrial",
      fridge: "fridge_retro",
      plants: ["plant_tropical", "plant_pink"],
      room: {
        backWall: Array.from({ length: 7 }, (_, i) => (i % 2 ? "wall_window" : "wall-dressing-panel")),
        outerWall: "wall_brick",
        sideWalls: ["wall_window", "wall_brick"],
        margin: 6,
        floor: "/textures/customer-floor.svg",
        kitchenFloor: "/textures/kitchen-floor-checker.svg",
        halfWall: "kitchen-halfwall-brick",
        street: { side: "back", season: "summer" },
        tables: [
          { model: "dining-set-gingham", x: -3.6, z: 1.6, guests: ["guest_blue", "guest_mint", "guest_coral", ""] },
          { model: "dining_round", x: -3.6, z: 4.4, guests: ["guest_mustard", "guest_coral"] },
          { model: "dining-set-gingham", x: -3.6, z: 7.3, guests: ["", "guest_blue", "", "guest_mustard"] },
          { model: "dining-set-gingham", x: 16.6, z: 1.6, guests: ["guest_coral", "", "guest_mint", "guest_blue"] },
          { model: "dining_round", x: 16.6, z: 4.4, guests: ["guest_mint", "guest_blue"] },
          { model: "dining-set-gingham", x: 16.6, z: 7.3, guests: ["guest_mustard", "guest_coral", "", ""] },
        ],
        plants: [
          { model: "plant_blossom", x: -5.7, z: 0.5 },
          { model: "plant_pink", x: 18.7, z: 0.5 },
          { model: "plant_bamboo", x: -5.7, z: 9.6 },
          { model: "plant_tropical", x: 18.7, z: 9.6 },
        ],
        extras: [
          { model: "dining-detail-pack", x: 2.2, z: 10.1, scale: 1.15 },
          { model: "dining-detail-pack", x: 10.8, z: 10.1, scale: 1.15 },
        ],
      },
    },
    [
      "VTLNC##OOO#PV",
      "#S....#....S#",
      "#...........X",
      "#.....#.....#",
      "###.#G###.###",
      "#.....#.....W",
      "E.....Q.....W",
      "#S....#....S#",
      "V#BB#X###R##V",
    ],
    { plates: 5, fire: true, difficulty: 5 },
  ),
  // A night market: two stalls split by a loop of conveyor belt. Veg and the pass sit on the left, hobs, grills and the
  // wash-up on the right; dishes ride the belt across or are walked the long way round by the lane at the back.
  parseLevel(
    "Night Market",
    400,
    ["salad", "soup", "onion_soup", "roast_chicken", "chicken_salad"],
    {
      sink: "sink_wood_double",
      fridge: "fridge_double",
      plants: ["plant_bamboo", "plant_tropical", "plant_lime"],
      room: {
        backWall: Array.from({ length: 7 }, (_, i) => (i % 2 ? "wall_window" : "wall_brick")),
        outerWall: "wall_brick",
        sideWalls: ["wall_brick", "wall_window"],
        margin: 6,
        night: true,
        street: { side: "back", season: "summer" },
        floor: "/textures/market-floor.svg",
        tables: [
          { model: "dining_round", x: -3.2, z: 4.6, guests: ["guest_coral", "guest_mint"] },
          { model: "dining_round", x: -3.2, z: 7.6, guests: ["guest_blue", "guest_mustard"] },
          { model: "dining_square", x: 16.2, z: 4.6, guests: ["guest_mustard", ""] },
          { model: "dining_round", x: 16.2, z: 7.6, guests: ["", "guest_coral"] },
        ],
        plants: [
          { model: "plant_bamboo", x: -5.7, z: 9.6 },
          { model: "plant_tropical", x: 18.7, z: 9.6 },
        ],
        extras: [
          // Food stalls and carts line the dining room, and strings of lanterns run round the kitchen between four posts.
          { model: "market_stall", x: -3.4, z: 1.2 },
          { model: "market_stall", x: 16.4, z: 1.2 },
          { model: "food_cart", x: -5.3, z: 6.1, turn: Math.PI / 2 },
          { model: "food_cart", x: 18.3, z: 6.1, turn: -Math.PI / 2 },
          { model: "lantern_post", x: -0.7, z: 9.9, turn: Math.PI },
          { model: "lantern_post", x: 13.7, z: 9.9 },
          { model: "lantern_post", x: -0.7, z: -0.1, turn: Math.PI },
          { model: "lantern_post", x: 13.7, z: -0.1 },
          { model: "lantern_string_long", x: 6.5, z: -0.1 },
          { model: "lantern_string_long", x: 6.5, z: 9.9 },
          { model: "lantern_string_side", x: -0.7, z: 4.9, turn: Math.PI / 2 },
          { model: "lantern_string_side", x: 13.7, z: 4.9, turn: Math.PI / 2 },
          { model: "dining-detail-pack", x: 2.2, z: 10.1, scale: 1.15 },
          { model: "dining-detail-pack", x: 10.8, z: 10.1, scale: 1.15 },
        ],
      },
    },
    [
      "VX#R##P##X#FV",
      "#S.........S#",
      "T....v<<....O",
      "L....vV^....O",
      "N....vV^....G",
      "B....vV^....G",
      "B....vV^....Q",
      "#S...>>^...S#",
      "V#WW#VVV#C#EV",
    ],
    { plates: 5, fire: true, difficulty: 5 },
  ),
];
