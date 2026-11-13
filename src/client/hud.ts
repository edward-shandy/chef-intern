import { LEVELS } from "../shared/level";
import { RECIPES, type GameState, type RecipeId } from "../shared/sim";

type IconName = "lettuce" | "tomato" | "onion" | "soup" | "arrow";

const ICONS: Record<IconName, string> = {
  lettuce: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#7ccf4f"/><path d="M16 7v18M9.5 12c2.2 2 4.3 3 6.5 3m6.500-3c-2.200 2-4.300 3-6.500 3M9 20c2.600.9 4.800.9 7 0m7 0c-2.600.9-4.800.9-7 0" fill="none" stroke="#4c9a2f" stroke-width="2" stroke-linecap="round"/></svg>`,
  tomato: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#e23b2e"/><path d="M16 9l-5-3 2 5-5 1 5 2 3-3 3 3 5-2-5-1 2-5z" fill="#3f9b46"/></svg>`,
  onion: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 6c2 5 10 8 10 15a10 9 0 0 1-20 0c0-7 8-10 10-15z" fill="#c98bd0"/><path d="M16 9c-1 5-5 8-5 13m5-13c1 5 5 8 5 13m-5-13v15" fill="none" stroke="#8a4f96" stroke-width="1.8" stroke-linecap="round"/><path d="M16 6c-1-2 0-3 1-4" fill="none" stroke="#6f9a3f" stroke-width="2" stroke-linecap="round"/></svg>`,
  soup: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 15h26a13 12 0 0 1-26 0z" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="16" cy="15" rx="11" ry="3" fill="#d2411f"/><path d="M11 9c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5" fill="none" stroke="#b9c3d6" stroke-width="2" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16h16m-6-6 6 6-6 6" fill="none" stroke="#8a8198" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// What each ticket shows: the ingredients to fetch, and for soup what they turn into.
const RECIPE_ICONS: Record<RecipeId, IconName[]> = {
  lettuce_salad: ["lettuce"],
  salad: ["lettuce", "tomato"],
  soup: ["tomato", "tomato", "tomato", "arrow", "soup"],
  onion_soup: ["onion", "onion", "onion", "arrow", "soup"],
};

// The four seats, in the order players fill them: each has its own character and ring colour.
const SEATS = [
  { name: "Knight", colour: "#e4573d" },
  { name: "Barbarian", colour: "#3d8fe4" },
  { name: "Mage", colour: "#4fb86a" },
  { name: "Rogue", colour: "#e4b03d" },
];

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// Keeps the DOM overlay in step with server snapshots, touching it only when values change.
export function createHud(): { update(state: GameState | null, localId: number | null): void } {
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
      // One row per seat, rebuilt only when someone joins or leaves.
      const seats = state.players.map((player) => player.id).sort();
      const key = `${seats.join(",")}:${localId}`;
      if (key !== lobbyKey) {
        lobbyKey = key;
        lobbyChefs.replaceChildren(
          ...SEATS.map((seat, id) => {
            const row = document.createElement("li");
            const taken = seats.includes(id);
            row.className = taken ? "" : "empty";
            row.style.setProperty("--seat", taken ? seat.colour : "transparent");
            row.textContent = taken ? seat.name : "Waiting for a chef…";
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
