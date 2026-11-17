import { characterName } from "../shared/characters";
import { LEVELS, levelNumber, nextLevel, themeLevels, THEMES, type Level, type Tile } from "../shared/level";
import { onPortraits, portraitOf } from "./portraits";
import { RECIPES, ROUND_SECONDS, TARGET_SCALE, type GameState, type RecipeId } from "../shared/sim";

export type IconName = "lettuce" | "tomato" | "onion" | "soup" | "arrow" | "chicken" | "grill" | "roast" | "seaweed" | "clam" | "fish" | "bun" | "meat";

export const ICONS: Record<IconName, string> = {
  lettuce: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#7ccf4f"/><path d="M16 7v18M9.5 12c2.2 2 4.3 3 6.5 3m6.500-3c-2.200 2-4.300 3-6.500 3M9 20c2.600.9 4.800.9 7 0m7 0c-2.600.9-4.800.9-7 0" fill="none" stroke="#4c9a2f" stroke-width="2" stroke-linecap="round"/></svg>`,
  tomato: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#e23b2e"/><path d="M16 9l-5-3 2 5-5 1 5 2 3-3 3 3 5-2-5-1 2-5z" fill="#3f9b46"/></svg>`,
  onion: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 6c2 5 10 8 10 15a10 9 0 0 1-20 0c0-7 8-10 10-15z" fill="#c98bd0"/><path d="M16 9c-1 5-5 8-5 13m5-13c1 5 5 8 5 13m-5-13v15" fill="none" stroke="#8a4f96" stroke-width="1.8" stroke-linecap="round"/><path d="M16 6c-1-2 0-3 1-4" fill="none" stroke="#6f9a3f" stroke-width="2" stroke-linecap="round"/></svg>`,
  soup: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 15h26a13 12 0 0 1-26 0z" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="16" cy="15" rx="11" ry="3" fill="#d2411f"/><path d="M11 9c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5" fill="none" stroke="#b9c3d6" stroke-width="2" stroke-linecap="round"/></svg>`,
  chicken: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="15" cy="18" rx="11" ry="8.500" fill="#f6c2b0"/><path d="M8 13c2-4 12-5 15 0" fill="none" stroke="#e29a86" stroke-width="2" stroke-linecap="round"/><path d="M24 22l4 3m-3-6 5 0" stroke="#f6c2b0" stroke-width="3.500" stroke-linecap="round"/><circle cx="28.500" cy="25.500" r="1.800" fill="#fff8ea"/><circle cx="30" cy="19" r="1.800" fill="#fff8ea"/></svg>`,
  grill: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 14h22l-3 9H8z" fill="#3a3d47"/><path d="M8 14l2-3m4 3l1-3m4 3l1-3m4 3l2-3" stroke="#ff7a2a" stroke-width="2.200" stroke-linecap="round"/><path d="M5 14h22" stroke="#8a93a6" stroke-width="2" stroke-linecap="round"/><path d="M10 23l-2 5m14-5 2 5" stroke="#3a3d47" stroke-width="2" stroke-linecap="round"/></svg>`,
  roast: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="25" rx="13" ry="3.500" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2"/><ellipse cx="15" cy="17" rx="10" ry="7.500" fill="#c8752e"/><path d="M8 14c3-3 10-3 13 0" fill="none" stroke="#e8a35a" stroke-width="2.200" stroke-linecap="round"/><path d="M23 19l4 2" stroke="#c8752e" stroke-width="3.500" stroke-linecap="round"/><circle cx="28" cy="21.500" r="1.800" fill="#fff8ea"/></svg>`,
  seaweed: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 29c-4-6 4-9 0-15s4-8 1-12" fill="none" stroke="#2f8a4a" stroke-width="4" stroke-linecap="round"/><path d="M21 29c4-6-3-9 1-14s-3-8 0-12" fill="none" stroke="#57b56a" stroke-width="4" stroke-linecap="round"/></svg>`,
  clam: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 19a12 12 0 0 1 24 0z" fill="#b58ae0"/><path d="M4 19h24a12 7 0 0 1-24 0z" fill="#8b689c"/><path d="M16 8v11M10 10l3 9M22 10l-3 9" stroke="#8b689c" stroke-width="1.600" stroke-linecap="round"/></svg>`,
  fish: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="14" cy="16" rx="10" ry="6.500" fill="#7fa8c9"/><path d="M4 17c4 3 13 3 18 0" fill="none" stroke="#dfe9f2" stroke-width="2.500" stroke-linecap="round"/><path d="M23 16l7-6v12z" fill="#5f8aa8"/><circle cx="9" cy="14" r="1.800" fill="#1c1c28"/></svg>`,
  bun: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 19a12 10 0 0 1 24 0z" fill="#d9913a"/><rect x="4" y="20" width="24" height="6" rx="2.500" fill="#e8b066"/><g fill="#fff3d6"><ellipse cx="11" cy="13" rx="1.800" ry="1"/><ellipse cx="17" cy="11" rx="1.800" ry="1"/><ellipse cx="22" cy="15" rx="1.800" ry="1"/></g></svg>`,
  meat: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 13c3-6 16-7 21-1 3 5 0 12-7 13-8 1-17-4-14-12z" fill="#c9433a"/><path d="M8 12c5-5 14-5 18 0" fill="none" stroke="#fff0e6" stroke-width="3" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16h16m-6-6 6 6-6 6" fill="none" stroke="#8a8198" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// What each ticket shows: the ingredients to fetch, and for soup what they turn into.
export const RECIPE_ICONS: Record<RecipeId, IconName[]> = {
  lettuce_salad: ["lettuce"],
  salad: ["lettuce", "tomato"],
  soup: ["tomato", "tomato", "tomato", "arrow", "soup"],
  onion_soup: ["onion", "onion", "onion", "arrow", "soup"],
  roast_chicken: ["chicken", "grill", "arrow", "roast"],
  chicken_salad: ["roast", "lettuce", "tomato"],
  seaweed_salad: ["seaweed", "tomato"],
  clam_chowder: ["clam", "clam", "clam", "arrow", "soup"],
  grilled_fish: ["fish", "arrow", "grill"],
  burger: ["bun", "meat", "lettuce", "tomato"],
};

// The four seats, in the order players fill them: each has its own character and ring colour.
export const SEATS = [
  { name: "Knight", colour: "#e4573d" },
  { name: "Barbarian", colour: "#3d8fe4" },
  { name: "Mage", colour: "#4fb86a" },
  { name: "Rogue", colour: "#e4b03d" },
];

// A small picture for each theme's card in the lobby.
const THEME_ART: Record<string, string> = {
  town: `<svg viewBox="0 0 160 72" aria-hidden="true"><rect width="160" height="72" fill="#bfe6f2"/><circle cx="134" cy="14" r="8" fill="#ffe27a"/><rect x="6" y="18" width="34" height="34" fill="#f2c96b"/><rect x="40" y="10" width="30" height="42" fill="#7fb7c9"/><rect x="70" y="20" width="40" height="32" fill="#f4dcc0"/><rect x="110" y="14" width="30" height="38" fill="#c9b3dc"/><g fill="#fff8ea"><rect x="12" y="24" width="8" height="8"/><rect x="26" y="24" width="8" height="8"/><rect x="46" y="16" width="7" height="8"/><rect x="58" y="16" width="7" height="8"/><rect x="46" y="29" width="7" height="8"/><rect x="58" y="29" width="7" height="8"/><rect x="116" y="20" width="7" height="8"/><rect x="128" y="20" width="7" height="8"/></g><path d="M6 38h34v6H6z" fill="#e4573d"/><path d="M70 36h40v6H70z" fill="#f29bb5"/><path d="M110 38h30v6h-30z" fill="#8b689c"/><path d="M40 40h30v6H40z" fill="#2f7f86"/><rect y="52" width="160" height="6" fill="#d6cdbb"/><rect y="58" width="160" height="14" fill="#4d505c"/><path d="M4 65h14m10 0h14m10 0h14m10 0h14m10 0h14m10 0h14" stroke="#f2cf63" stroke-width="2"/><rect x="146" y="40" width="3" height="12" fill="#8a5a3c"/><circle cx="147" cy="36" r="9" fill="#5fae4e"/><rect x="84" y="59" width="24" height="8" rx="3" fill="#f2c230"/><rect x="89" y="55" width="13" height="6" rx="2" fill="#f2c230"/><circle cx="89" cy="68" r="3" fill="#2a2c33"/><circle cx="103" cy="68" r="3" fill="#2a2c33"/></svg>`,
  sea: `<svg viewBox="0 0 160 72" aria-hidden="true"><defs><linearGradient id="sea-art" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2aa3c4"/><stop offset="1" stop-color="#0e5672"/></linearGradient></defs><rect width="160" height="72" fill="url(#sea-art)"/><path d="M20 0l14 50M70 0l8 46M118 0l-10 52" stroke="#ffffff" stroke-opacity=".12" stroke-width="7"/><path d="M0 58c26-6 52 4 80 0s54-6 80-1v15H0z" fill="#e6d3a0"/><path d="M20 60c-2-10 3-14 0-24m6 24c2-12-4-16 1-28" stroke="#3f9d57" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M132 60V44m0 6l-8-8m8 4l8-9" stroke="#f27aa0" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="110" cy="58" r="8" fill="#b58ae0"/><path d="M52 60l3-7 3 7-7-4h8z" fill="#f0803a"/><g><ellipse cx="62" cy="26" rx="11" ry="7" fill="#ff8a3d"/><path d="M51 26l-9-6v12z" fill="#fff"/><rect x="60" y="19" width="4" height="14" fill="#fff"/><circle cx="68" cy="24" r="1.800" fill="#1c1c28"/></g><g><ellipse cx="104" cy="36" rx="8" ry="5" fill="#ffd166"/><path d="M112 36l7-5v10z" fill="#2f7f86"/><circle cx="100" cy="35" r="1.400" fill="#1c1c28"/></g><g fill="#cdf3ff" fill-opacity=".7"><circle cx="36" cy="30" r="3"/><circle cx="40" cy="18" r="2"/><circle cx="34" cy="10" r="1.500"/><circle cx="142" cy="24" r="2.500"/><circle cx="146" cy="12" r="1.500"/></g><path d="M84 12c0-6 14-6 14 0z" fill="#f7a8d8"/><path d="M87 12v8m4-8v10m4-10v7" stroke="#f7a8d8" stroke-width="1.500"/></svg>`,
  space: `<svg viewBox="0 0 160 72" aria-hidden="true"><rect width="160" height="72" fill="#141a33"/><g fill="#fff"><circle cx="0" cy="0" r="1.4" opacity="0.50"/><circle cx="53" cy="29" r="0.8" opacity="0.75"/><circle cx="106" cy="58" r="0.8" opacity="1.00"/><circle cx="159" cy="15" r="0.8" opacity="0.50"/><circle cx="52" cy="44" r="1.4" opacity="0.75"/><circle cx="105" cy="1" r="0.8" opacity="1.00"/><circle cx="158" cy="30" r="0.8" opacity="0.50"/><circle cx="51" cy="59" r="0.8" opacity="0.75"/><circle cx="104" cy="16" r="1.4" opacity="1.00"/><circle cx="157" cy="45" r="0.8" opacity="0.50"/><circle cx="50" cy="2" r="0.8" opacity="0.75"/><circle cx="103" cy="31" r="0.8" opacity="1.00"/><circle cx="156" cy="60" r="1.4" opacity="0.50"/><circle cx="49" cy="17" r="0.8" opacity="0.75"/><circle cx="102" cy="46" r="0.8" opacity="1.00"/><circle cx="155" cy="3" r="0.8" opacity="0.50"/><circle cx="48" cy="32" r="1.4" opacity="0.75"/><circle cx="101" cy="61" r="0.8" opacity="1.00"/><circle cx="154" cy="18" r="0.8" opacity="0.50"/><circle cx="47" cy="47" r="0.8" opacity="0.75"/><circle cx="100" cy="4" r="1.4" opacity="1.00"/><circle cx="153" cy="33" r="0.8" opacity="0.50"/><circle cx="46" cy="62" r="0.8" opacity="0.75"/><circle cx="99" cy="19" r="0.8" opacity="1.00"/><circle cx="152" cy="48" r="1.4" opacity="0.50"/><circle cx="45" cy="5" r="0.8" opacity="0.75"/></g><circle cx="30" cy="84" r="44" fill="#3d8fe4"/><path d="M-4 62c14-6 26 2 38-2s22-10 34-4" fill="none" stroke="#7ccf4f" stroke-width="7" stroke-linecap="round" opacity=".8"/><circle cx="136" cy="14" r="6" fill="#d9dce4"/><circle cx="134" cy="12" r="1.600" fill="#b9bcc6"/><rect x="66" y="24" width="72" height="26" rx="13" fill="#d9e2ee" stroke="#241d30" stroke-width="2"/><rect x="52" y="32" width="14" height="10" fill="#8a93a6" stroke="#241d30" stroke-width="2"/><path d="M34 28h18v26H34z" fill="#3d8fe4" stroke="#241d30" stroke-width="2"/><path d="M40 28v26M46 28v26" stroke="#a9dcff" stroke-width="1.500"/><g fill="#ffd166" stroke="#241d30" stroke-width="1.600"><circle cx="80" cy="37" r="5"/><circle cx="96" cy="37" r="5"/><circle cx="112" cy="37" r="5"/><circle cx="128" cy="37" r="5"/></g><path d="M78 50h52" stroke="#7a5cff" stroke-width="3" stroke-linecap="round"/><g transform="translate(124 60) rotate(-30)"><path d="M0-12c5 4 6 12 4 18H-4c-2-6-1-14 4-18z" fill="#fff" stroke="#241d30" stroke-width="1.600"/><circle cy="-3" r="2.500" fill="#3d8fe4"/><path d="M-4 3l-4 5 4-1zM4 3l4 5-4-1z" fill="#d2411f"/><path d="M-2 6c0 5 2 7 2 9 0-2 2-4 2-9z" fill="#ffb03a"/></g></svg>`,
};

// Colours of the little floor plan on each kitchen card.
const PLAN_COLOURS: Record<Tile["kind"], string> = {
  floor: "#f4ecdc",
  counter: "#ee9a62",
  crate: "#7ccf4f",
  trash: "#3a3340",
  board: "#c98a4a",
  stove: "#4a4d5a",
  plates: "#3d8fe4",
  serve: "#45b7a0",
  return: "#8a5fa8",
  wash: "#5fb8e8",
  extinguisher: "#d23c2c",
  sink: "#b9c3d6",
  fridge: "#b9c3d6",
  plant: "#4f9d4a",
  grill: "#c9552a",
  belt: "#25212b",
  warp: "#7a5cff",
};
const CRATE_COLOURS = {
  tomato: "#e23b2e",
  lettuce: "#7ccf4f",
  onion: "#c98bd0",
  chicken: "#f6c2b0",
  seaweed: "#2f8a4a",
  clam: "#b58ae0",
  fish: "#7fa8c9",
  bun: "#d9913a",
  meat: "#c9433a",
};

// Draws a kitchen's tiles as a small top-down plan.
export function floorPlan(level: Level): string {
  const tiles = level.tiles.map((tile, index) => {
    const x = index % level.width;
    const y = Math.floor(index / level.width);
    const fill = tile.dispenses ? CRATE_COLOURS[tile.dispenses] : PLAN_COLOURS[tile.kind];
    const inset = tile.kind === "floor" ? 0 : 0.06;
    // Teleport pads are drawn as round glowing dots on the floor.
    if (tile.kind === "warp") return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.38" fill="${fill}"/>`;
    return `<rect x="${x + inset}" y="${y + inset}" width="${1 - inset * 2}" height="${1 - inset * 2}" rx="${inset ? 0.18 : 0}" fill="${fill}"/>`;
  });
  return `<svg viewBox="0 0 ${level.width} ${level.height}" aria-hidden="true"><rect width="${level.width}" height="${level.height}" fill="#f4ecdc"/>${tiles.join("")}</svg>`;
}

const TAG_STYLES: Record<string, string> = {
  Fire: "fire",
  "Dish washing": "wash",
  Grill: "grill",
  Conveyor: "belt",
  Teleport: "warp",
  "Zero gravity": "warp",
};

// What sets a kitchen apart, as short tags.
function levelTags(level: Level): string[] {
  const tags = [`${level.recipes.length} recipes`];
  if (level.plates) tags.push("Dish washing");
  if (level.fire) tags.push("Fire");
  if (level.tiles.some((tile) => tile.kind === "grill")) tags.push("Grill");
  if (level.tiles.some((tile) => tile.kind === "belt")) tags.push("Conveyor");
  if (level.tiles.some((tile) => tile.kind === "warp")) tags.push("Teleport");
  if (level.lowGravity) tags.push("Zero gravity");
  return tags;
}

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// Keeps the DOM overlay in step with server snapshots, touching it only when values change.
export function createHud(onLevel: (level: number) => void): {
  update(state: GameState | null, localId: number | null): void;
} {
  const root = element(".play-hud");
  const orders = element("#orders");
  const score = element("#score");
  const timer = element("#timer");
  const gameOver = element("#gameover");
  const finalScore = element("#final-score");
  const finalOrders = element("#final-orders");
  const finalTarget = element("#final-target");
  const target = element("#target");
  const levelName = element("#level-name");
  const goals = [element("#goal"), element("#final-goal")];
  const resultKicker = element("#result-kicker");
  const resultTitle = element("#result-title");
  const resultNext = element("#result-next");
  const waiting = element("#waiting");
  const lobbyChefs = element("#lobby-chefs");
  const fireAlert = element("#fire-alert");
  // One card per kitchen; anyone in the lobby may pick, and the server tells everyone the result.
  const minutes = Math.round(ROUND_SECONDS / 60);
  const levelButtons = LEVELS.map((level, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-card";
    const dots = Array.from({ length: 5 }, (_, i) => `<i${i < level.difficulty ? ' class="on"' : ""}></i>`).join("");
    const tags = levelTags(level).map((tag) => `<span class="level-tag level-tag-${TAG_STYLES[tag] ?? "plain"}">${tag}</span>`);
    button.innerHTML = `<span class="level-plan">${floorPlan(level)}<b class="level-number">${levelNumber(index)}</b></span><span class="level-name">${level.name}</span><span class="level-dots" aria-label="Difficulty ${level.difficulty} of 5">${dots}</span><span class="level-tags">${tags.join("")}</span><span class="level-goal"><b data-target></b> pts in ${minutes} min</span>`;
    button.addEventListener("click", () => onLevel(index));
    return button;
  });
  element("#levels").replaceChildren(...levelButtons);
  // One card per theme; picking one moves the room to that theme's first kitchen.
  const themeButtons = THEMES.map((theme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-card";
    const count = themeLevels(theme.id).length;
    button.innerHTML = `<span class="theme-art">${THEME_ART[theme.id] ?? ""}</span><span class="theme-name">${theme.name}</span><span class="theme-blurb">${theme.blurb} · ${count} kitchens</span>`;
    button.addEventListener("click", () => onLevel(themeLevels(theme.id)[0]));
    return button;
  });
  element("#themes").replaceChildren(...themeButtons);
  const levelCount = element("#level-count");
  let shownTheme = "";
  let targetsFor = 0;
  let lobbyKey = "";
  const cards = new Map<number, HTMLElement>();
  let shownScore: number | null = null;
  let portraitsReady = false;
  onPortraits(() => {
    portraitsReady = true;
  });

  const createCard = (recipe: RecipeId): HTMLElement => {
    const card = document.createElement("article");
    card.className = "order";
    const icons = RECIPE_ICONS[recipe].map((name) => `<span class="order-icon order-icon-${name}">${ICONS[name]}</span>`);
    card.innerHTML = `<div class="order-paper"><div class="order-icons">${icons.join("")}</div><div class="order-row"><span class="order-name">${RECIPES[recipe].label}</span><span class="order-points">${RECIPES[recipe].points}</span></div><div class="order-time"><i></i></div></div>`;
    return card;
  };

  return {
    update(state, localId) {
      root.hidden = state === null;
      gameOver.hidden = state?.phase !== "over";
      waiting.hidden = state?.phase !== "waiting";
      // The room lobby covers the kitchen until someone starts the service.
      document.body.classList.toggle("in-lobby", state?.phase === "waiting");
      if (!state) return;

      if (state.score !== shownScore) {
        // Restarting the animation makes the number pop on every change, green up and red down.
        if (shownScore !== null) {
          score.dataset.change = state.score > shownScore ? "up" : "down";
          score.classList.remove("bump");
          void score.offsetWidth;
          score.classList.add("bump");
        }
        shownScore = state.score;
        score.textContent = String(state.score);
      }
      levelButtons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === state.level)));
      // Only the kitchens of the theme the room is on are listed.
      const theme = LEVELS[state.level].theme;
      if (theme !== shownTheme) {
        shownTheme = theme;
        themeButtons.forEach((button, index) => button.setAttribute("aria-pressed", String(THEMES[index].id === theme)));
        levelButtons.forEach((button, index) => (button.hidden = LEVELS[index].theme !== theme));
        levelCount.textContent = `${themeLevels(theme).length} kitchens`;
      }
      // Every card shows the score its kitchen asks of the crew that is here now.
      const crew = Math.max(1, Math.min(TARGET_SCALE.length, state.players.length));
      if (crew !== targetsFor) {
        targetsFor = crew;
        levelButtons.forEach((button, index) => {
          const goal = Math.round((LEVELS[index].target * TARGET_SCALE[crew - 1]) / 5) * 5;
          button.querySelector("[data-target]")!.textContent = String(goal);
        });
      }
      fireAlert.hidden = state.phase === "over" || Object.keys(state.fires ?? {}).length === 0;
      // One row per seat, rebuilt only when someone joins or leaves.
      const seats = state.players.map((player) => player.id).sort();
      const names = new Map(state.players.map((player) => [player.id, player.name || characterName(player.character)]));
      const looks = new Map(state.players.map((player) => [player.id, player.character]));
      const key = `${seats.map((id) => `${id}=${names.get(id)}/${looks.get(id)}`).join(",")}:${localId}:${portraitsReady}`;
      if (key !== lobbyKey) {
        lobbyKey = key;
        lobbyChefs.replaceChildren(
          ...SEATS.map((seat, id) => {
            const row = document.createElement("li");
            const taken = seats.includes(id);
            row.className = taken ? "" : "empty";
            row.style.setProperty("--seat", taken ? seat.colour : "transparent");
            row.textContent = taken ? names.get(id) || seat.name : "Waiting for a chef…";
            // Each chef in the room shows as their portrait, framed in their seat's colour.
            const portrait = taken ? portraitOf(looks.get(id)!) : null;
            if (portrait) {
              row.classList.add("has-face");
              row.prepend(Object.assign(document.createElement("img"), { src: portrait, alt: "", className: "lobby-face" }));
            }
            if (id === localId) row.append(Object.assign(document.createElement("small"), { textContent: "You" }));
            return row;
          }),
        );
      }
      const seconds = Math.ceil(state.timeLeft);
      timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.classList.toggle("urgent", seconds <= 30 && state.phase === "playing");
      finalScore.textContent = String(state.score);

      // The bar fills towards the target and turns green once the kitchen is cleared.
      const level = LEVELS[state.level];
      const reached = state.score >= state.target;
      levelName.textContent = `Kitchen ${levelNumber(state.level)} · ${level.name}`;
      target.textContent = finalTarget.textContent = String(state.target);
      for (const goal of goals) {
        goal.classList.toggle("reached", reached);
        goal.querySelector<HTMLElement>("i")!.style.transform = `scaleX(${Math.min(1, state.score / state.target).toFixed(3)})`;
      }

      if (state.phase === "over") {
        const next = nextLevel(state.level);
        const last = next <= state.level;
        gameOver.dataset.result = state.won ? "won" : "lost";
        resultKicker.textContent = state.won ? `Kitchen ${levelNumber(state.level)} cleared` : "Service is over";
        resultTitle.textContent = !state.won ? "Not quite!" : last ? "Every kitchen cleared!" : "Target reached!";
        resultNext.textContent = !state.won
          ? "try this kitchen again"
          : last
            ? "start over from the first kitchen"
            : `move on to ${LEVELS[next].name}`;
      }
      finalOrders.textContent = `${state.delivered} ${state.delivered === 1 ? "order" : "orders"} served`;

      // Tickets are added and removed one by one, so the ones that stay never re-animate.
      const live = new Set(state.orders.map((order) => order.id));
      for (const [id, card] of cards) {
        if (live.has(id)) continue;
        card.remove();
        cards.delete(id);
      }
      for (const order of state.orders) {
        let card = cards.get(order.id);
        if (!card) {
          card = createCard(order.recipe);
          cards.set(order.id, card);
          orders.append(card);
        }
        const left = Math.max(0, order.timeLeft / order.timeTotal);
        card.querySelector<HTMLElement>("i")!.style.transform = `scaleX(${left.toFixed(3)})`;
        card.classList.toggle("warn", left < 0.5);
        card.classList.toggle("urgent", left < 0.25);
      }
    },
  };
}
