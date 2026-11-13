import { holdsItems, isFixture, LEVELS, tileAt, type Level } from "./level";
import { isSoup, RECIPES, SOUP_OF, type DishPart, type Ingredient, type RecipeId } from "./recipes";

export { RECIPES, type DishPart, type Ingredient, type RecipeId };

export const SIM_STEP = 1 / 60;
export const PLAYER_RADIUS = 0.34;
export const POT_CAPACITY = 3;
// Pot cook progress: 1 means cooked, BURN_AT means ruined.
export const BURN_AT = 1.75;

const PLAYER_SPEED = 4.6;
const PLAYER_ACCEL = 16;
const DASH_SPEED = 11.5;
const DASH_SECONDS = 0.22;
const DASH_COOLDOWN = 0.8;
const REACH = 0.75;
// How far a counter's nearest edge may be for a chef to use it when aiming at it directly.
const AIM_RANGE = 0.8;
const CHOP_SECONDS = 1.2;
const COOK_SECONDS = 8;
const ROUND_SECONDS = 180;
const EXPIRED_PENALTY = 10;
const MAX_TIP = 10;
const RESTART_DELAY = 3;

// Pacing by number of chefs, tuned so one person alone can keep up: each recipe's
// time limit is scaled by ORDER_TIME_SCALE, a new order arrives every ORDER_INTERVAL
// seconds, and at most MAX_ORDERS wait at once. Index 0 is a solo chef.
const ORDER_TIME_SCALE = [1, 0.8, 0.7, 0.62];
const ORDER_INTERVAL = [42, 24, 17, 13];
const MAX_ORDERS = [2, 3, 4, 4];
// A kitchen's target score is written for one chef; bigger crews must earn this many times more.
const TARGET_SCALE = [1, 1.8, 2.6, 3.3];

export type Item =
  // chop runs 0..1; an ingredient counts as chopped at 1.
  | { type: "ingredient"; kind: Ingredient; chop: number }
  | { type: "plate"; contents: DishPart[] }
  // A pot holds up to POT_CAPACITY chopped pieces of one kind of ingredient.
  | { type: "pot"; kind: Ingredient | null; contents: number; cook: number };

type Plate = Extract<Item, { type: "plate" }>;
type Pot = Extract<Item, { type: "pot" }>;

export interface Order {
  id: number;
  recipe: RecipeId;
  timeLeft: number;
  timeTotal: number;
}

export interface PlayerState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  // Radians around Y; 0 faces +Z (towards the camera).
  facing: number;
  held: Item | null;
  // True while this chef is actively chopping, so clients can animate it.
  chopping: boolean;
  // Seconds of dash left, and seconds until the next dash is allowed.
  dashTime: number;
  dashCooldown: number;
}

export interface GameState {
  // Index into LEVELS of the kitchen this round is played in.
  level: number;
  players: PlayerState[];
  // Items resting on solid tiles, keyed by tile index.
  tileItems: Record<number, Item>;
  orders: Order[];
  score: number;
  // Score needed to clear this kitchen, for the largest crew seen this round.
  target: number;
  crewPeak: number;
  // Set when the round ends: whether the target was reached.
  won: boolean;
  delivered: number;
  timeLeft: number;
  phase: "playing" | "over";
  overFor: number;
  nextOrderIn: number;
  nextOrderId: number;
  seed: number;
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

// Every stove starts each round with an empty pot on it.
function startingItems(level: Level): Record<number, Item> {
  const items: Record<number, Item> = {};
  level.tiles.forEach((tile, index) => {
    if (tile.kind === "stove") items[index] = { type: "pot", kind: null, contents: 0, cook: 0 };
  });
  return items;
}

export function createGame(level: number, seed: number): GameState {
  return {
    level,
    players: [],
    tileItems: startingItems(LEVELS[level]),
    orders: [],
    score: 0,
    target: LEVELS[level].target,
    crewPeak: 1,
    won: false,
    delivered: 0,
    timeLeft: ROUND_SECONDS,
    phase: "playing",
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

export function addPlayer(state: GameState, id: number): void {
  const { spawns } = LEVELS[state.level];
  const spawn = spawns[id % spawns.length];
  state.players.push({
    id,
    x: spawn.x,
    z: spawn.z,
    vx: 0,
    vz: 0,
    facing: 0,
    held: null,
    chopping: false,
    dashTime: 0,
    dashCooldown: 0,
  });
}

export function removePlayer(state: GameState, id: number): void {
  state.players = state.players.filter((player) => player.id !== id);
}

// True when the tile is a station close enough for this chef to use by pointing at it.
export function inReach(level: Level, player: PlayerState, tile: number): boolean {
  const target = level.tiles[tile];
  if (!target || target.kind === "floor" || isFixture(target)) return false;
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
  return tile && tile.kind !== "floor" && !isFixture(tile) ? tz * level.width + tx : null;
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
    if (resting.type === "plate" && isChopped(held) && addToPlate(resting, held.kind)) return "held";
    if (resting.type === "pot" && addToPot(resting, held)) return "held";
  } else if (held.type === "plate") {
    if (resting.type === "ingredient" && isChopped(resting) && addToPlate(held, resting.kind)) return "resting";
    if (resting.type === "pot" && pour(resting, held)) return "both-stay";
  } else {
    if (resting.type === "ingredient" && addToPot(held, resting)) return "resting";
    if (resting.type === "plate" && pour(held, resting)) return "both-stay";
  }
  return null;
}

function serve(state: GameState, plate: Plate): void {
  const dish = plate.contents.join("+");
  const index = state.orders.findIndex((order) => [...RECIPES[order.recipe].parts].sort().join("+") === dish);
  if (index === -1) return;
  const [order] = state.orders.splice(index, 1);
  state.score += RECIPES[order.recipe].points + Math.ceil((order.timeLeft / order.timeTotal) * MAX_TIP);
  state.delivered += 1;
}

// Turns the chef towards a tile it is using, so aimed actions never happen behind its back.
function faceTile(level: Level, player: PlayerState, tile: number): void {
  player.facing = Math.atan2((tile % level.width) + 0.5 - player.x, Math.floor(tile / level.width) + 0.5 - player.z);
}

function interact(level: Level, state: GameState, player: PlayerState, aim: number | null): void {
  const index = targetTile(level, player, aim);
  if (index === null) return;
  if (index === aim) faceTile(level, player, index);
  const tile = level.tiles[index];
  const resting = state.tileItems[index];
  const held = player.held;

  if (!held) {
    if (resting) {
      player.held = resting;
      delete state.tileItems[index];
    } else if (tile.kind === "crate" && tile.dispenses) {
      player.held = { type: "ingredient", kind: tile.dispenses, chop: 0 };
    } else if (tile.kind === "plates") {
      player.held = { type: "plate", contents: [] };
    }
    return;
  }

  if (tile.kind === "trash") {
    // Pots and plates are kept and only emptied; loose food is thrown away.
    if (held.type === "pot") emptyPot(held);
    else if (held.type === "plate") held.contents = [];
    else player.held = null;
  } else if (tile.kind === "serve") {
    if (held.type === "plate" && held.contents.length > 0) {
      serve(state, held);
      player.held = null;
    }
  } else if (tile.kind === "plates") {
    // Chopped food can go straight onto a fresh plate from the stack.
    if (held.type === "ingredient" && isChopped(held)) player.held = { type: "plate", contents: [held.kind] };
  } else if (resting) {
    const used = combine(held, resting);
    if (used === "held") player.held = null;
    if (used === "resting") delete state.tileItems[index];
  } else if (holdsItems(tile)) {
    state.tileItems[index] = held;
    player.held = null;
  }
}

function chop(level: Level, state: GameState, player: PlayerState, aim: number | null, dt: number): void {
  if (player.held) return;
  const index = targetTile(level, player, aim);
  if (index === null || level.tiles[index].kind !== "board") return;
  if (index === aim) faceTile(level, player, index);
  const item = state.tileItems[index];
  if (item?.type === "ingredient" && item.chop < 1) {
    item.chop = Math.min(1, item.chop + dt / CHOP_SECONDS);
    player.chopping = true;
  }
}

function cookPots(level: Level, state: GameState, dt: number): void {
  for (const [key, item] of Object.entries(state.tileItems)) {
    if (item.type !== "pot" || item.contents < POT_CAPACITY) continue;
    if (level.tiles[Number(key)].kind !== "stove") continue;
    item.cook = Math.min(BURN_AT, item.cook + dt / COOK_SECONDS);
  }
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

// Starts a fresh round: the next kitchen after a win, the same one again after a loss.
function restartRound(state: GameState): void {
  const players = state.players;
  const level = state.won ? (state.level + 1) % LEVELS.length : state.level;
  Object.assign(state, createGame(level, state.seed));
  for (const { id } of players) addPlayer(state, id);
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
function movePlayer(player: PlayerState, input: PlayerInput, dt: number): void {
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

  const blend = Math.min(1, PLAYER_ACCEL * dt);
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
  movePlayer(player, input, dt);
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

  // The target only ever rises, so a teammate leaving mid-round does not make it easier.
  const crew = Math.max(1, Math.min(TARGET_SCALE.length, state.players.length));
  if (crew > state.crewPeak) {
    state.crewPeak = crew;
    state.target = Math.round((level.target * TARGET_SCALE[crew - 1]) / 5) * 5;
  }

  for (const player of state.players) movePlayer(player, inputs[player.id] ?? IDLE_INPUT, dt);

  separatePlayers(state.players);
  for (const player of state.players) {
    resolveCollisions(level, player);
    const input = inputs[player.id] ?? IDLE_INPUT;
    player.chopping = false;
    if (input.interact) interact(level, state, player, input.aim);
    if (input.use) chop(level, state, player, input.aim, dt);
  }

  cookPots(level, state, dt);
  updateOrders(level, state, dt);

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = "over";
    state.overFor = 0;
    state.won = state.score >= state.target;
    for (const player of state.players) player.vx = player.vz = player.dashTime = 0;
  }
}

export const playerSpeedFraction = (player: PlayerState): number =>
  Math.min(1, Math.hypot(player.vx, player.vz) / PLAYER_SPEED);
