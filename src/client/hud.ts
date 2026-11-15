import { LEVELS, type Level, type Tile } from "../shared/level";
import { RECIPES, ROUND_SECONDS, TARGET_SCALE, type GameState, type RecipeId } from "../shared/sim";

export type IconName = "lettuce" | "tomato" | "onion" | "soup" | "arrow" | "chicken" | "grill" | "roast";

export const ICONS: Record<IconName, string> = {
  lettuce: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#7ccf4f"/><path d="M16 7v18M9.5 12c2.2 2 4.3 3 6.5 3m6.500-3c-2.200 2-4.300 3-6.500 3M9 20c2.600.9 4.800.9 7 0m7 0c-2.600.9-4.800.9-7 0" fill="none" stroke="#4c9a2f" stroke-width="2" stroke-linecap="round"/></svg>`,
  tomato: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#e23b2e"/><path d="M16 9l-5-3 2 5-5 1 5 2 3-3 3 3 5-2-5-1 2-5z" fill="#3f9b46"/></svg>`,
  onion: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 6c2 5 10 8 10 15a10 9 0 0 1-20 0c0-7 8-10 10-15z" fill="#c98bd0"/><path d="M16 9c-1 5-5 8-5 13m5-13c1 5 5 8 5 13m-5-13v15" fill="none" stroke="#8a4f96" stroke-width="1.8" stroke-linecap="round"/><path d="M16 6c-1-2 0-3 1-4" fill="none" stroke="#6f9a3f" stroke-width="2" stroke-linecap="round"/></svg>`,
  soup: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 15h26a13 12 0 0 1-26 0z" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="16" cy="15" rx="11" ry="3" fill="#d2411f"/><path d="M11 9c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5" fill="none" stroke="#b9c3d6" stroke-width="2" stroke-linecap="round"/></svg>`,
  chicken: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="15" cy="18" rx="11" ry="8.500" fill="#f6c2b0"/><path d="M8 13c2-4 12-5 15 0" fill="none" stroke="#e29a86" stroke-width="2" stroke-linecap="round"/><path d="M24 22l4 3m-3-6 5 0" stroke="#f6c2b0" stroke-width="3.500" stroke-linecap="round"/><circle cx="28.500" cy="25.500" r="1.800" fill="#fff8ea"/><circle cx="30" cy="19" r="1.800" fill="#fff8ea"/></svg>`,
  grill: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 14h22l-3 9H8z" fill="#3a3d47"/><path d="M8 14l2-3m4 3l1-3m4 3l1-3m4 3l2-3" stroke="#ff7a2a" stroke-width="2.200" stroke-linecap="round"/><path d="M5 14h22" stroke="#8a93a6" stroke-width="2" stroke-linecap="round"/><path d="M10 23l-2 5m14-5 2 5" stroke="#3a3d47" stroke-width="2" stroke-linecap="round"/></svg>`,
  roast: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="25" rx="13" ry="3.500" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2"/><ellipse cx="15" cy="17" rx="10" ry="7.500" fill="#c8752e"/><path d="M8 14c3-3 10-3 13 0" fill="none" stroke="#e8a35a" stroke-width="2.200" stroke-linecap="round"/><path d="M23 19l4 2" stroke="#c8752e" stroke-width="3.500" stroke-linecap="round"/><circle cx="28" cy="21.500" r="1.800" fill="#fff8ea"/></svg>`,
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
};

// The four seats, in the order players fill them: each has its own character and ring colour.
export const SEATS = [
  { name: "Knight", colour: "#e4573d" },
  { name: "Barbarian", colour: "#3d8fe4" },
  { name: "Mage", colour: "#4fb86a" },
  { name: "Rogue", colour: "#e4b03d" },
];

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
};
const CRATE_COLOURS = { tomato: "#e23b2e", lettuce: "#7ccf4f", onion: "#c98bd0", chicken: "#f6c2b0" };

// Draws a kitchen's tiles as a small top-down plan.
export function floorPlan(level: Level): string {
  const tiles = level.tiles.map((tile, index) => {
    const x = index % level.width;
    const y = Math.floor(index / level.width);
    const fill = tile.dispenses ? CRATE_COLOURS[tile.dispenses] : PLAN_COLOURS[tile.kind];
    const inset = tile.kind === "floor" ? 0 : 0.06;
    return `<rect x="${x + inset}" y="${y + inset}" width="${1 - inset * 2}" height="${1 - inset * 2}" rx="${inset ? 0.18 : 0}" fill="${fill}"/>`;
  });
  return `<svg viewBox="0 0 ${level.width} ${level.height}" aria-hidden="true"><rect width="${level.width}" height="${level.height}" fill="#f4ecdc"/>${tiles.join("")}</svg>`;
}

const TAG_STYLES: Record<string, string> = { Fire: "fire", "Dish washing": "wash", Grill: "grill", Conveyor: "belt" };

// What sets a kitchen apart, as short tags.
function levelTags(level: Level): string[] {
  const tags = [`${level.recipes.length} recipes`];
  if (level.plates) tags.push("Dish washing");
  if (level.fire) tags.push("Fire");
  if (level.tiles.some((tile) => tile.kind === "grill")) tags.push("Grill");
  if (level.tiles.some((tile) => tile.kind === "belt")) tags.push("Conveyor");
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
    button.innerHTML = `<span class="level-plan">${floorPlan(level)}<b class="level-number">${index + 1}</b></span><span class="level-name">${level.name}</span><span class="level-dots" aria-label="Difficulty ${level.difficulty} of 5">${dots}</span><span class="level-tags">${tags.join("")}</span><span class="level-goal"><b data-target></b> pts in ${minutes} min</span>`;
    button.addEventListener("click", () => onLevel(index));
    return button;
  });
  element("#levels").replaceChildren(...levelButtons);
  element("#level-count").textContent = `${LEVELS.length} kitchens`;
  let targetsFor = 0;
  let lobbyKey = "";
  const cards = new Map<number, HTMLElement>();
  let shownScore: number | null = null;

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
      const names = new Map(state.players.map((player) => [player.id, player.name]));
      const key = `${seats.map((id) => `${id}=${names.get(id)}`).join(",")}:${localId}`;
      if (key !== lobbyKey) {
        lobbyKey = key;
        lobbyChefs.replaceChildren(
          ...SEATS.map((seat, id) => {
            const row = document.createElement("li");
            const taken = seats.includes(id);
            row.className = taken ? "" : "empty";
            row.style.setProperty("--seat", taken ? seat.colour : "transparent");
            row.textContent = taken ? names.get(id) || seat.name : "Waiting for a chef…";
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
      levelName.textContent = `Kitchen ${state.level + 1} · ${level.name}`;
      target.textContent = finalTarget.textContent = String(state.target);
      for (const goal of goals) {
        goal.classList.toggle("reached", reached);
        goal.querySelector<HTMLElement>("i")!.style.transform = `scaleX(${Math.min(1, state.score / state.target).toFixed(3)})`;
      }

      if (state.phase === "over") {
        const last = state.level === LEVELS.length - 1;
        gameOver.dataset.result = state.won ? "won" : "lost";
        resultKicker.textContent = state.won ? `Kitchen ${state.level + 1} cleared` : "Service is over";
        resultTitle.textContent = !state.won ? "Not quite!" : last ? "Every kitchen cleared!" : "Target reached!";
        resultNext.textContent = !state.won
          ? "try this kitchen again"
          : last
            ? "start over from the first kitchen"
            : `move on to ${LEVELS[state.level + 1].name}`;
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
