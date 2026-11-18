import { beltNext, burns, holdsItems, LEVELS, nextLevel, outOfHand, tileAt, walkable, warpDestination, type Level } from "./level";
import { isCharacter, seatCharacter, type CharacterId } from "./characters";
import { isSoup, PREP, RECIPES, ROAST_OF, SOUP_OF, type DishPart, type Ingredient, type RecipeId } from "./recipes";

export { RECIPES, type DishPart, type Ingredient, type RecipeId };

export const SIM_STEP = 1 / 60;
export const PLAYER_RADIUS = 0.34;
export const POT_CAPACITY = 3;
// Pot cook progress: 1 means cooked, BURN_AT means ruined.
export const BURN_AT = 1.75;
// In kitchens that can burn, a ruined pot left on its hob keeps heating and starts a fire at this point.
export const FIRE_AT = 2.5;
// How far an extinguisher reaches, in tiles.
export const SPRAY_RANGE = 2.4;

const PLAYER_SPEED = 4.6;
const PLAYER_ACCEL = 16;
const LOW_GRAVITY_ACCEL = 3.2;
const DASH_SPEED = 11.5;
const DASH_SECONDS = 0.22;
const DASH_COOLDOWN = 0.8;
const REACH = 0.75;
// How far a counter's nearest edge may be for a chef to use it when aiming at it directly.
const AIM_RANGE = 0.8;
const CHOP_SECONDS = 1.2;
const COOK_SECONDS = 8;
// How long a whole chicken takes on the grill; it then burns on the same clock as a pot.
const ROAST_SECONDS = 10;
// How long a chopped fish fillet or patty takes on the grill.
const GRILL_SECONDS = 6;
// How long a conveyor belt takes to carry its load one tile along.
export const BELT_SECONDS = 0.6;
export const ROUND_SECONDS = 900;
const EXPIRED_PENALTY = 10;
const MAX_TIP = 10;
const RESTART_DELAY = 3;
// Longest the briefing holds the clock before a round starts anyway, so one idle chef cannot stall the crew.
export const READY_SECONDS = 45;
export const COUNTDOWN_SECONDS = 3;
const WASH_SECONDS = 2;
// How long a served plate stays with the customer before it comes back dirty.
const RETURN_SECONDS = 6;
// Seconds of spraying to put out one burning tile, and seconds between a fire spreading, by number of chefs.
const EXTINGUISH_SECONDS = 1.5;
const SPREAD_SECONDS = [12, 10, 8, 7];
// Cosine of half the spray cone's angle.
const SPRAY_ARC = 0.6;
// Thrown food: how fast it flies (tiles a second), how far before it drops, how close a chef with empty hands must be
// to catch it, and how long before the thrower could catch their own throw.
export const THROW_SPEED = 9;
const THROW_RANGE = 6.5;
const CATCH_RADIUS = 0.55;
const OWN_CATCH_DELAY = 0.3;

// Pacing by number of chefs, tuned so one person alone can keep up: each recipe's
// time limit is scaled by ORDER_TIME_SCALE, a new order arrives every ORDER_INTERVAL
// seconds, and at most MAX_ORDERS wait at once. Index 0 is a solo chef.
const ORDER_TIME_SCALE = [1, 0.8, 0.7, 0.62];
const ORDER_INTERVAL = [42, 24, 17, 13];
const MAX_ORDERS = [2, 3, 4, 4];
// A kitchen's target score is written for one chef; bigger crews must earn this many times more.
export const TARGET_SCALE = [1, 1.8, 2.6, 3.3];

export type Item =
  // chop runs 0..1; an ingredient counts as chopped at 1. Grilled ingredients use cook instead, on the pot's scale.
  | { type: "ingredient"; kind: Ingredient; chop: number; cook?: number }
  | { type: "plate"; contents: DishPart[] }
  // A pot holds up to POT_CAPACITY chopped pieces of one kind of ingredient.
  | { type: "pot"; kind: Ingredient | null; contents: number; cook: number }
  // A used plate: it can be carried and put down, but only the wash sink makes it useful again.
  | { type: "dirty" }
  | { type: "extinguisher" };

type Plate = Extract<Item, { type: "plate" }>;

// A piece of food in the air, thrown by a chef. It flies straight at hand height until a chef with empty hands
// catches it, it hits a worktop (landing on it, or in the pot or on the plate there), or it runs out of range and drops.
export interface Flying {
  id: number;
  item: Item;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Who threw it, and how far it has gone.
  by: number;
  travelled: number;
}
type Pot = Extract<Item, { type: "pot" }>;

export interface Order {
  id: number;
  recipe: RecipeId;
  timeLeft: number;
  timeTotal: number;
}

export interface PlayerState {
  id: number;
  // Name the player typed in the lobby, or empty to show the character's own name.
  name: string;
  // Which chef this player picked in the lobby.
  character: CharacterId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Radians around Y; 0 faces +Z (towards the camera).
  facing: number;
  held: Item | null;
  // True while this chef is actively chopping, so clients can animate it.
  chopping: boolean;
  // True while this chef is scrubbing plates at the wash sink.
  washing: boolean;
  // True while this chef is spraying the extinguisher.
  spraying: boolean;
  // Seconds of dash left, and seconds until the next dash is allowed.
  dashTime: number;
  dashCooldown: number;
  // The teleport pad this chef is standing on, or -1; a pad only fires again once they have stepped off it.
  onPad: number;
  // What this chef has done this round, for the results screen and its titles.
  stats: ChefStats;
  // True while this chef is in the crew's voice chat.
  voice: boolean;
  // Whether the use button was already down last step, so holding it throws only once. Server only.
  useHeld?: boolean;
}

export interface GameState {
  // Index into LEVELS of the kitchen this round is played in.
  level: number;
  players: PlayerState[];
  // Items resting on solid tiles, keyed by tile index.
  tileItems: Record<number, Item>;
  // Food in the air, and the id the next throw gets.
  flying: Flying[];
  nextFlyingId: number;
  // Clean plates left on the stack, or null in kitchens where plates never run out.
  plates: number | null;
  // Dirty plates waiting at the return hatch, and the timers of plates still out with customers.
  dirty: number;
  returning: number[];
  // The wash sink: plates waiting in it, plates already cleaned, and progress on the current one.
  wash: { dirty: number; clean: number; progress: number };
  // Burning tiles, keyed by tile index, each with how much fire is left from 1 down to 0.
  fires: Record<number, number>;
  // Seconds until the fire next jumps to a neighbouring worktop.
  spreadIn: number;
  // Seconds until every conveyor belt moves its load one tile, and how many times they have moved so far.
  beltIn: number;
  beltSteps: number;
  orders: Order[];
  score: number;
  // Score needed to clear this kitchen: what has been asked of the crews so far plus what the current crew owes for the time left.
  target: number;
  // The part of the target already fixed by the seconds played, at whatever crew size was in the kitchen then.
  targetSoFar: number;
  // Set when the round ends: whether the target was reached.
  won: boolean;
  delivered: number;
  timeLeft: number;
  // "waiting" is the lobby warm-up: chefs can move and practise, but no orders or clock. "ready" is the kitchen briefing
  // just before a round: the kitchen is on screen but the clock waits until every chef has read it (or READY_SECONDS pass).
  phase: "waiting" | "ready" | "playing" | "over";
  // Chefs who have closed the briefing, how long it has been up, and the 3-2-1 before the clock starts, once it has begun.
  ready: number[];
  readyFor: number;
  countdown: number | null;
  overFor: number;
  nextOrderIn: number;
  nextOrderId: number;
  seed: number;
}

export interface ChefStats {
  served: number;
  chopped: number;
  washed: number;
  doused: number;
  // Food thrown that was caught or landed somewhere useful.
  thrown?: number;
}

export interface PlayerInput {
  moveX: number;
  moveZ: number;
  // Held down to chop.
  use: boolean;
  // Tile the player is pointing at, or null to use whatever the chef is facing.
  aim: number | null;
  // True only on the step where the dash button was pressed.
  dash: boolean;
  // True only on the step where the interact button was pressed.
  interact: boolean;
}

export const IDLE_INPUT: PlayerInput = { moveX: 0, moveZ: 0, use: false, aim: null, dash: false, interact: false };

export const isChopped = (item: Item): boolean => item.type === "ingredient" && item.chop >= 1;
export const potIsCooked = (cook: number): boolean => cook >= 1 && cook < BURN_AT;
// True for ingredients that are grilled whole rather than chopped.
export const isRoastable = (kind: Ingredient): boolean => ROAST_OF[kind] !== undefined;

// What an ingredient adds to a plate once it is ready: chopped veg, or a chicken roasted but not burnt.
export function dishPart(item: Item): DishPart | null {
  if (item.type !== "ingredient") return null;
  const prep = PREP[item.kind];
  if (prep.chop && item.chop < 1) return null;
  if (prep.grill && !potIsCooked(item.cook ?? 0)) return null;
  return ROAST_OF[item.kind] ?? (item.kind as DishPart);
}

// Every stove starts each round with an empty pot on it.
function startingItems(level: Level): Record<number, Item> {
  const items: Record<number, Item> = {};
  level.tiles.forEach((tile, index) => {
    if (tile.kind === "stove") items[index] = { type: "pot", kind: null, contents: 0, cook: 0 };
    if (tile.kind === "extinguisher") items[index] = { type: "extinguisher" };
  });
  return items;
}

export function createGame(level: number, seed: number, waiting = false, phase: GameState["phase"] = waiting ? "waiting" : "playing"): GameState {
  return {
    level,
    players: [],
    tileItems: startingItems(LEVELS[level]),
    flying: [],
    nextFlyingId: 1,
    plates: LEVELS[level].plates ?? null,
    dirty: 0,
    returning: [],
    wash: { dirty: 0, clean: 0, progress: 0 },
    fires: {},
    spreadIn: SPREAD_SECONDS[0],
    beltIn: BELT_SECONDS,
    beltSteps: 0,
    orders: [],
    score: 0,
    target: LEVELS[level].target,
    targetSoFar: 0,
    won: false,
    delivered: 0,
    timeLeft: ROUND_SECONDS,
    phase,
    ready: [],
    readyFor: 0,
    countdown: null,
    overFor: 0,
    nextOrderIn: 2,
    nextOrderId: 1,
    seed: seed >>> 0,
  };
}

// Player ids double as seat numbers, so they pick the spawn point and character.
export function freePlayerSlot(state: GameState, maxPlayers: number): number | null {
  for (let id = 0; id < maxPlayers; id++) {
    if (!state.players.some((player) => player.id === id)) return id;
  }
  return null;
}

export const NAME_LENGTH = 12;

export function addPlayer(state: GameState, id: number, name = "", character: CharacterId = seatCharacter(id)): void {
  const { spawns } = LEVELS[state.level];
  const spawn = spawns[id % spawns.length];
  state.players.push({
    id,
    name,
    character,
    x: spawn.x,
    z: spawn.z,
    vx: 0,
    vz: 0,
    facing: 0,
    held: null,
    chopping: false,
    washing: false,
    spraying: false,
    dashTime: 0,
    dashCooldown: 0,
    onPad: -1,
    stats: { served: 0, chopped: 0, washed: 0, doused: 0 },
    voice: false,
  });
}

export function removePlayer(state: GameState, id: number): void {
  state.players = state.players.filter((player) => player.id !== id);
}

// True when the tile is a station close enough for this chef to use by pointing at it.
export function inReach(level: Level, player: PlayerState, tile: number): boolean {
  const target = level.tiles[tile];
  if (!target || walkable(target) || outOfHand(target)) return false;
  const tx = tile % level.width;
  const tz = Math.floor(tile / level.width);
  const dx = player.x - Math.max(tx, Math.min(player.x, tx + 1));
  const dz = player.z - Math.max(tz, Math.min(player.z, tz + 1));
  return Math.hypot(dx, dz) <= AIM_RANGE;
}

// The station a chef will use: the aimed tile when it is in reach, otherwise the one it faces.
export function targetTile(level: Level, player: PlayerState, aim: number | null = null): number | null {
  if (aim !== null && inReach(level, player, aim)) return aim;
  const tx = Math.floor(player.x + Math.sin(player.facing) * REACH);
  const tz = Math.floor(player.z + Math.cos(player.facing) * REACH);
  const tile = tileAt(level, tx, tz);
  return tile && !walkable(tile) && !outOfHand(tile) ? tz * level.width + tx : null;
}

// Seeded generator so the simulation stays reproducible from its state alone.
function nextRandom(state: GameState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

// A plate holds either one soup or a salad of distinct ingredients, never both.
function addToPlate(plate: Plate, part: DishPart): boolean {
  const { contents } = plate;
  if (contents.some(isSoup) || contents.includes(part)) return false;
  if (isSoup(part) && contents.length > 0) return false;
  contents.push(part);
  contents.sort();
  return true;
}

function addToPot(pot: Pot, item: Item): boolean {
  if (item.type !== "ingredient" || !isChopped(item) || !SOUP_OF[item.kind]) return false;
  if (pot.contents >= POT_CAPACITY || (pot.kind !== null && pot.kind !== item.kind)) return false;
  pot.kind = item.kind;
  pot.contents += 1;
  return true;
}

function emptyPot(pot: Pot): void {
  pot.kind = null;
  pot.contents = 0;
  pot.cook = 0;
}

function pour(pot: Pot, plate: Plate): boolean {
  const soup = pot.kind && SOUP_OF[pot.kind];
  if (!soup || pot.contents < POT_CAPACITY || !potIsCooked(pot.cook)) return false;
  if (!addToPlate(plate, soup)) return false;
  emptyPot(pot);
  return true;
}

// Tries to merge the held item with the resting one and reports which of them was used up.
function combine(held: Item, resting: Item): "held" | "resting" | "both-stay" | null {
  if (held.type === "ingredient") {
    const part = dishPart(held);
    if (resting.type === "plate" && part && addToPlate(resting, part)) return "held";
    if (resting.type === "pot" && addToPot(resting, held)) return "held";
  } else if (held.type === "plate") {
    const part = dishPart(resting);
    if (resting.type === "ingredient" && part && addToPlate(held, part)) return "resting";
    if (resting.type === "pot" && pour(resting, held)) return "both-stay";
  } else if (held.type === "pot") {
    if (resting.type === "ingredient" && addToPot(held, resting)) return "resting";
    if (resting.type === "plate" && pour(held, resting)) return "both-stay";
  }
  return null;
}

function serve(state: GameState, plate: Plate, player: PlayerState): void {
  const dish = plate.contents.join("+");
  const index = state.orders.findIndex((order) => [...RECIPES[order.recipe].parts].sort().join("+") === dish);
  if (index === -1) return;
  const [order] = state.orders.splice(index, 1);
  state.score += RECIPES[order.recipe].points + Math.ceil((order.timeLeft / order.timeTotal) * MAX_TIP);
  state.delivered += 1;
  player.stats.served += 1;
}

// Turns the chef towards a tile it is using, so aimed actions never happen behind its back.
function faceTile(level: Level, player: PlayerState, tile: number): void {
  player.facing = Math.atan2((tile % level.width) + 0.5 - player.x, Math.floor(tile / level.width) + 0.5 - player.z);
}

// Takes a clean plate off the stack, which only fails in kitchens with a limited number of plates.
function takePlate(state: GameState): boolean {
  if (state.plates === null) return true;
  if (state.plates === 0) return false;
  state.plates -= 1;
  return true;
}

function interact(level: Level, state: GameState, player: PlayerState, aim: number | null): void {
  const index = targetTile(level, player, aim);
  if (index === null) return;
  if (index === aim) faceTile(level, player, index);
  // Nothing can be picked up from or put down on a burning worktop.
  if (state.fires[index] !== undefined) return;
  const tile = level.tiles[index];
  const resting = state.tileItems[index];
  const held = player.held;

  if (!held) {
    if (resting) {
      player.held = resting;
      delete state.tileItems[index];
    } else if (tile.kind === "crate" && tile.dispenses) {
      player.held = isRoastable(tile.dispenses)
        ? { type: "ingredient", kind: tile.dispenses, chop: 0, cook: 0 }
        : { type: "ingredient", kind: tile.dispenses, chop: 0 };
    } else if (tile.kind === "plates") {
      if (takePlate(state)) player.held = { type: "plate", contents: [] };
    } else if (tile.kind === "return" && state.dirty > 0) {
      state.dirty -= 1;
      player.held = { type: "dirty" };
    } else if (tile.kind === "wash" && state.wash.clean > 0) {
      state.wash.clean -= 1;
      player.held = { type: "plate", contents: [] };
    }
    return;
  }

  if (tile.kind === "trash") {
    // Pots and plates are kept and only emptied; loose food is thrown away.
    if (held.type === "pot") emptyPot(held);
    else if (held.type === "plate") held.contents = [];
    else if (held.type === "ingredient") player.held = null;
  } else if (tile.kind === "serve") {
    if (held.type === "plate" && held.contents.length > 0) {
      serve(state, held, player);
      player.held = null;
      if (state.plates !== null) state.returning.push(RETURN_SECONDS);
    }
  } else if (tile.kind === "plates") {
    // Chopped or roasted food can go straight onto a fresh plate from the stack.
    const part = dishPart(held);
    if (part) {
      if (takePlate(state)) player.held = { type: "plate", contents: [part] };
    } else if (held.type === "plate" && held.contents.length === 0 && state.plates !== null) {
      // A clean plate nobody needs yet goes back on the stack.
      state.plates += 1;
      player.held = null;
    }
  } else if (tile.kind === "wash") {
    if (held.type === "dirty") {
      state.wash.dirty += 1;
      player.held = null;
    }
  } else if (resting) {
    const used = combine(held, resting);
    if (used === "held") player.held = null;
    if (used === "resting") delete state.tileItems[index];
  } else if (holdsItems(tile) || (tile.kind === "extinguisher" && held.type === "extinguisher")) {
    state.tileItems[index] = held;
    player.held = null;
  }
}

// Sprays everything burning in a cone in front of the chef, turning towards the aimed tile first.
function spray(level: Level, state: GameState, player: PlayerState, aim: number | null, dt: number): void {
  if (aim !== null) faceTile(level, player, aim);
  player.spraying = true;
  for (const key of Object.keys(state.fires)) {
    const index = Number(key);
    const dx = (index % level.width) + 0.5 - player.x;
    const dz = Math.floor(index / level.width) + 0.5 - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > SPRAY_RANGE) continue;
    const ahead = (dx * Math.sin(player.facing) + dz * Math.cos(player.facing)) / Math.max(distance, 1e-6);
    if (ahead < SPRAY_ARC) continue;
    state.fires[index] -= dt / EXTINGUISH_SECONDS;
    if (state.fires[index] <= 0) {
      delete state.fires[index];
      player.stats.doused += 1;
    }
  }
}

// Food leaves the chef's hands at hand height, flying the way they face (or towards the tile they point at).
function throwFood(level: Level, state: GameState, player: PlayerState, aim: number | null): void {
  const item = player.held;
  if (item?.type !== "ingredient") return;
  if (aim !== null) faceTile(level, player, aim);
  const dx = Math.sin(player.facing);
  const dz = Math.cos(player.facing);
  state.flying.push({
    id: state.nextFlyingId++,
    item,
    x: player.x + dx * 0.3,
    z: player.z + dz * 0.3,
    vx: dx * THROW_SPEED,
    vz: dz * THROW_SPEED,
    by: player.id,
    travelled: 0,
  });
  player.held = null;
}

// Puts thrown food down on the worktop it hit: onto a free worktop, or into the pot or onto the plate resting there.
// Anything else (a crate, the window, a burning worktop) knocks it to the floor, where it is lost.
function land(level: Level, state: GameState, flying: Flying, index: number): boolean {
  const tile = level.tiles[index];
  if (state.fires[index] !== undefined) return false;
  const resting = state.tileItems[index];
  if (resting) return combine(flying.item, resting) === "held";
  if (!holdsItems(tile)) return false;
  state.tileItems[index] = flying.item;
  return true;
}

function moveFlying(level: Level, state: GameState, dt: number): void {
  state.flying = state.flying.filter((flying) => {
    const step = THROW_SPEED * dt;
    flying.x += flying.vx * dt;
    flying.z += flying.vz * dt;
    flying.travelled += step;
    const thrower = state.players.find((player) => player.id === flying.by);
    // Any chef with empty hands it passes close to catches it.
    for (const player of state.players) {
      if (player.held || Math.hypot(player.x - flying.x, player.z - flying.z) > CATCH_RADIUS) continue;
      if (player.id === flying.by && flying.travelled < THROW_SPEED * OWN_CATCH_DELAY) continue;
      player.held = flying.item;
      if (thrower && player.id !== flying.by) thrower.stats.thrown = (thrower.stats.thrown ?? 0) + 1;
      return false;
    }
    const tx = Math.floor(flying.x);
    const tz = Math.floor(flying.z);
    const tile = tileAt(level, tx, tz);
    if (!tile) return false;
    if (!walkable(tile) && tile.kind !== "chasm") {
      // It flew into something solid: a worktop catches it, anything else drops it.
      if (tile.kind !== "sink" && tile.kind !== "fridge" && tile.kind !== "plant" && land(level, state, flying, tz * level.width + tx) && thrower) {
        thrower.stats.thrown = (thrower.stats.thrown ?? 0) + 1;
      }
      return false;
    }
    // Out of range it drops: onto the floor, or into the stream, and either way it is gone.
    return flying.travelled < THROW_RANGE;
  });
}

// Sets a worktop alight, ruining whatever food was on it.
function ignite(state: GameState, index: number): void {
  state.fires[index] = 1;
  const item = state.tileItems[index];
  if (item?.type === "ingredient") delete state.tileItems[index];
  else if (item?.type === "plate") item.contents = [];
  else if (item?.type === "pot" && item.contents > 0) item.cook = BURN_AT;
}

// Every so often a fire jumps to one worktop next to it, picked at random.
function spreadFire(level: Level, state: GameState, dt: number): void {
  const burning = Object.keys(state.fires).map(Number);
  const crew = Math.max(0, Math.min(SPREAD_SECONDS.length, state.players.length) - 1);
  if (burning.length === 0) {
    state.spreadIn = SPREAD_SECONDS[crew];
    return;
  }
  state.spreadIn -= dt;
  if (state.spreadIn > 0) return;
  state.spreadIn = SPREAD_SECONDS[crew];
  const next = new Set<number>();
  for (const index of burning) {
    const tx = index % level.width;
    const tz = Math.floor(index / level.width);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tile = tileAt(level, tx + dx, tz + dz);
      const neighbour = (tz + dz) * level.width + tx + dx;
      if (tile && burns(tile) && state.fires[neighbour] === undefined) next.add(neighbour);
    }
  }
  const choices = [...next].sort((a, b) => a - b);
  if (choices.length > 0) ignite(state, choices[Math.floor(nextRandom(state) * choices.length)]);
}

function chop(level: Level, state: GameState, player: PlayerState, aim: number | null, dt: number): void {
  if (player.held) return;
  const index = targetTile(level, player, aim);
  if (index === null) return;
  if (level.tiles[index].kind === "wash") {
    // Holding the same button at the sink scrubs one waiting plate at a time.
    if (state.wash.dirty === 0) return;
    if (index === aim) faceTile(level, player, index);
    player.washing = true;
    state.wash.progress += dt / WASH_SECONDS;
    if (state.wash.progress >= 1) {
      state.wash.progress = 0;
      state.wash.dirty -= 1;
      state.wash.clean += 1;
      player.stats.washed += 1;
    }
    return;
  }
  if (level.tiles[index].kind !== "board") return;
  if (index === aim) faceTile(level, player, index);
  const item = state.tileItems[index];
  // Only ingredients that need chopping take the knife; a whole chicken or a bun does not.
  if (item?.type === "ingredient" && item.chop < 1 && PREP[item.kind].chop) {
    item.chop = Math.min(1, item.chop + dt / CHOP_SECONDS);
    player.chopping = true;
    if (item.chop >= 1) player.stats.chopped += 1;
  }
}

function cookPots(level: Level, state: GameState, dt: number): void {
  for (const [key, item] of Object.entries(state.tileItems)) {
    const index = Number(key);
    if (item.type === "ingredient") {
      // A whole chicken roasts as it is; a fish fillet or patty has to be chopped first.
      const prep = PREP[item.kind];
      if (!prep.grill || (prep.chop && item.chop < 1)) continue;
      if (level.tiles[index].kind !== "grill" || state.fires[index] !== undefined) continue;
      const seconds = isRoastable(item.kind) ? ROAST_SECONDS : GRILL_SECONDS;
      item.cook = Math.min(level.fire ? FIRE_AT : BURN_AT, (item.cook ?? 0) + dt / seconds);
      // A charred chicken left over the coals goes up in flames like a forgotten pot.
      if (level.fire && item.cook >= FIRE_AT) ignite(state, index);
      continue;
    }
    if (item.type !== "pot" || item.contents < POT_CAPACITY) continue;
    if (level.tiles[index].kind !== "stove" || state.fires[index] !== undefined) continue;
    item.cook = Math.min(level.fire ? FIRE_AT : BURN_AT, item.cook + dt / COOK_SECONDS);
    // The pot drops back to merely burnt, so it flares up again unless somebody takes it off the hob.
    if (level.fire && item.cook >= FIRE_AT) ignite(state, index);
  }
}

// Which items the belts carry on at their next step, as [from, to] tile pairs. An item moves when the queue ahead
// of it reaches an empty tile, or when it is part of a loop with no gap, which turns as a whole. Belts never merge.
export function beltMoves(level: Level, items: Record<number, Item>): Array<[number, number]> {
  const moves: Array<[number, number]> = [];
  for (const key of Object.keys(items)) {
    const from = Number(key);
    const to = beltNext(level, from);
    if (to === null) continue;
    let cursor: number | null = to;
    let free = false;
    for (let guard = 0; cursor !== null && guard < level.tiles.length; guard++) {
      if (!items[cursor] || cursor === from) {
        free = true;
        break;
      }
      cursor = beltNext(level, cursor);
    }
    if (free) moves.push([from, to]);
  }
  return moves;
}

// Every belt moves its load one tile along at the same moment.
function runBelts(level: Level, state: GameState, dt: number): void {
  state.beltIn -= dt;
  if (state.beltIn > 0) return;
  state.beltIn += BELT_SECONDS;
  const moves = beltMoves(level, state.tileItems);
  if (moves.length === 0) return;
  const carried = moves.map(([from, to]) => [to, state.tileItems[from]] as const);
  for (const [from] of moves) delete state.tileItems[from];
  for (const [to, item] of carried) state.tileItems[to] = item;
  state.beltSteps += 1;
}

function updateOrders(level: Level, state: GameState, dt: number): void {
  for (const order of state.orders) order.timeLeft -= dt;
  const expired = state.orders.filter((order) => order.timeLeft <= 0).length;
  if (expired > 0) {
    state.orders = state.orders.filter((order) => order.timeLeft > 0);
    state.score = Math.max(0, state.score - expired * EXPIRED_PENALTY);
  }

  // Pacing follows however many chefs are in the kitchen right now.
  const crew = Math.max(0, Math.min(ORDER_INTERVAL.length, state.players.length) - 1);
  // An empty ticket rail is boring, so the next order never waits long.
  if (state.orders.length === 0) state.nextOrderIn = Math.min(state.nextOrderIn, 3);
  state.nextOrderIn -= dt;
  if (state.nextOrderIn > 0 || state.orders.length >= MAX_ORDERS[crew]) return;
  const recipe = level.recipes[Math.floor(nextRandom(state) * level.recipes.length)];
  const seconds = Math.round(RECIPES[recipe].seconds * ORDER_TIME_SCALE[crew]);
  state.orders.push({ id: state.nextOrderId++, recipe, timeLeft: seconds, timeTotal: seconds });
  state.nextOrderIn = ORDER_INTERVAL[crew];
}

// Switches the lobby to another kitchen; ignored once a round is under way.
export function chooseLevel(state: GameState, level: number): void {
  if (state.phase !== "waiting" || !LEVELS[level] || level === state.level) return;
  const players = state.players;
  Object.assign(state, createGame(level, state.seed, true));
  // Chefs keep their name, look and voice chat across kitchens and rounds, so a call never drops between them.
  for (const { id, name, character, voice } of players) {
    addPlayer(state, id, name, character);
    state.players[state.players.length - 1].voice = voice;
  }
}

// Names a chef, keeping only a short run of letters, digits and a few marks.
export function renamePlayer(state: GameState, id: number, name: unknown): void {
  const player = state.players.find((other) => other.id === id);
  if (!player || typeof name !== "string") return;
  player.name = name
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .trim()
    .slice(0, NAME_LENGTH);
}

// Swaps a chef's character; any character can be picked, even one a teammate already plays.
// Joins or leaves the crew's voice chat.
export function setVoice(state: GameState, id: number, on: unknown): void {
  const player = state.players.find((other) => other.id === id);
  if (player) player.voice = on === true;
}

export function setCharacter(state: GameState, id: number, character: unknown): void {
  const player = state.players.find((other) => other.id === id);
  if (player && isCharacter(character)) player.character = character;
}

// Ends the warm-up; anyone in the room may call it once everybody has arrived.
export function startRound(state: GameState): void {
  if (state.phase !== "waiting") return;
  state.phase = "ready";
  state.ready = [];
  state.readyFor = 0;
  state.countdown = null;
}

// A chef has read the briefing; the round begins once the whole crew has.
export function markReady(state: GameState, id: number): void {
  if (state.phase !== "ready" || state.ready.includes(id)) return;
  state.ready.push(id);
  beginWhenReady(state);
}

// Once the whole crew is ready, or the wait has run out, a short count-down starts the clock.
function beginWhenReady(state: GameState): void {
  if (state.countdown !== null) return;
  const everyone = state.players.length > 0 && state.players.every((player) => state.ready.includes(player.id));
  if (everyone || state.readyFor >= READY_SECONDS) state.countdown = COUNTDOWN_SECONDS;
}

// Starts a fresh round: the same kitchen again straight away after a loss, or after a win the next kitchen,
// held on its briefing until the crew has read it.
function restartRound(state: GameState): void {
  const players = state.players;
  const level = state.won ? nextLevel(state.level) : state.level;
  Object.assign(state, createGame(level, state.seed, false, state.won ? "ready" : "playing"));
  // Chefs keep their name, look and voice chat across kitchens and rounds, so a call never drops between them.
  for (const { id, name, character, voice } of players) {
    addPlayer(state, id, name, character);
    state.players[state.players.length - 1].voice = voice;
  }
}

// Pushes the player's circle out of every solid tile it overlaps.
function resolveCollisions(level: Level, player: PlayerState): void {
  const baseX = Math.floor(player.x);
  const baseZ = Math.floor(player.z);
  for (let tz = baseZ - 1; tz <= baseZ + 1; tz++) {
    for (let tx = baseX - 1; tx <= baseX + 1; tx++) {
      const tile = tileAt(level, tx, tz);
      if (tile && walkable(tile)) continue;
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

// Splits overlapping chefs evenly so nobody can walk through a teammate.
function separatePlayers(players: PlayerState[]): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= PLAYER_RADIUS * 2 || distance < 1e-6) continue;
      const push = (PLAYER_RADIUS * 2 - distance) / 2 / distance;
      a.x -= dx * push;
      a.z -= dz * push;
      b.x += dx * push;
      b.z += dz * push;
    }
  }
}

// Turns and accelerates one chef towards its input, without any collision handling.
// How quickly chefs reach their speed and stop again: brisk on the ground, a slow drift in zero gravity.
const accelerationIn = (level: Level): number => (level.lowGravity ? LOW_GRAVITY_ACCEL : PLAYER_ACCEL);

// Stepping onto a teleport pad moves the chef to its partner, keeping their speed so they glide off the far pad.
function warpPlayer(level: Level, player: PlayerState): void {
  const tx = Math.floor(player.x);
  const tz = Math.floor(player.z);
  const index = tz * level.width + tx;
  if (tileAt(level, tx, tz)?.kind !== "warp") {
    player.onPad = -1;
    return;
  }
  if (player.onPad === index) return;
  const destination = warpDestination(level, index);
  if (destination === null) {
    player.onPad = index;
    return;
  }
  player.x = (destination % level.width) + 0.5;
  player.z = Math.floor(destination / level.width) + 0.5;
  player.onPad = destination;
}

function movePlayer(player: PlayerState, input: PlayerInput, dt: number, acceleration = PLAYER_ACCEL): void {
  let { moveX, moveZ } = input;
  const length = Math.hypot(moveX, moveZ);
  if (length > 1) {
    moveX /= length;
    moveZ /= length;
  }
  if (length > 0.1) player.facing = Math.atan2(moveX, moveZ);

  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.dashTime = Math.max(0, player.dashTime - dt);
  if (input.dash && player.dashCooldown <= 0) {
    player.dashTime = DASH_SECONDS;
    player.dashCooldown = DASH_COOLDOWN;
  }
  // A dash is a short burst straight ahead, even from a standstill.
  let speed = PLAYER_SPEED;
  if (player.dashTime > 0) {
    speed = DASH_SPEED;
    moveX = Math.sin(player.facing);
    moveZ = Math.cos(player.facing);
  }

  const blend = Math.min(1, acceleration * dt);
  player.vx += (moveX * speed - player.vx) * blend;
  player.vz += (moveZ * speed - player.vz) * blend;
  player.x += player.vx * dt;
  player.z += player.vz * dt;
}

// Moves a single chef the way the server will, treating the other chefs as fixed obstacles.
export function predictPlayer(
  level: Level,
  player: PlayerState,
  input: PlayerInput,
  others: PlayerState[],
  dt: number,
): void {
  movePlayer(player, input, dt, accelerationIn(level));
  for (const other of others) {
    const dx = player.x - other.x;
    const dz = player.z - other.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= PLAYER_RADIUS * 2 || distance < 1e-6) continue;
    const push = (PLAYER_RADIUS * 2 - distance) / distance;
    player.x += dx * push;
    player.z += dz * push;
  }
  resolveCollisions(level, player);
  warpPlayer(level, player);
}

// Advances the whole game by dt seconds; inputs are keyed by player id.
export function stepGame(state: GameState, inputs: Record<number, PlayerInput>, dt: number): void {
  if (state.phase === "over") {
    state.overFor += dt;
    const wantsRestart = state.players.some((player) => inputs[player.id]?.interact);
    if (state.overFor >= RESTART_DELAY && wantsRestart) restartRound(state);
    return;
  }
  const level = LEVELS[state.level];

  // The target is charged by the second at the rate of whoever is cooking, so it follows chefs joining and leaving.
  const crew = Math.max(1, Math.min(TARGET_SCALE.length, state.players.length));
  const perSecond = (level.target * TARGET_SCALE[crew - 1]) / ROUND_SECONDS;
  const played = state.phase === "playing" ? Math.min(dt, state.timeLeft) : 0;
  state.targetSoFar += perSecond * played;
  state.target = Math.round((state.targetSoFar + perSecond * (state.timeLeft - played)) / 5) * 5;

  for (const player of state.players) movePlayer(player, inputs[player.id] ?? IDLE_INPUT, dt, accelerationIn(level));

  separatePlayers(state.players);
  for (const player of state.players) {
    resolveCollisions(level, player);
    warpPlayer(level, player);
    const input = inputs[player.id] ?? IDLE_INPUT;
    player.chopping = player.washing = player.spraying = false;
    if (input.interact) interact(level, state, player, input.aim);
    // Pressing use with food in hand throws it; holding the button down throws only once.
    const pressed = input.use && !player.useHeld;
    player.useHeld = input.use;
    if (input.use && player.held?.type === "extinguisher") spray(level, state, player, input.aim, dt);
    else if (pressed && player.held?.type === "ingredient") throwFood(level, state, player, input.aim);
    else if (input.use) chop(level, state, player, input.aim, dt);
  }
  moveFlying(level, state, dt);

  cookPots(level, state, dt);
  runBelts(level, state, dt);
  spreadFire(level, state, dt);
  // Plates that were served come back dirty once the customer has finished.
  state.returning = state.returning.map((seconds) => seconds - dt);
  state.dirty += state.returning.filter((seconds) => seconds <= 0).length;
  state.returning = state.returning.filter((seconds) => seconds > 0);
  if (state.phase === "waiting") return;
  if (state.phase === "ready") {
    state.readyFor += dt;
    // Also catches the last unready chef leaving the room.
    beginWhenReady(state);
    if (state.countdown !== null) {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.countdown = null;
        state.phase = "playing";
      }
    }
    return;
  }
  updateOrders(level, state, dt);

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = "over";
    state.overFor = 0;
    state.won = state.score >= state.target;
    for (const player of state.players) {
      player.vx = player.vz = player.dashTime = 0;
      player.chopping = player.washing = player.spraying = false;
    }
  }
}

export const playerSpeedFraction = (player: PlayerState): number =>
  Math.min(1, Math.hypot(player.vx, player.vz) / PLAYER_SPEED);
