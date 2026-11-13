import { RECIPES, type GameState, type RecipeId } from "../shared/sim";

type IconName = "lettuce" | "tomato" | "soup" | "arrow";

const ICONS: Record<IconName, string> = {
  lettuce: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#7ccf4f"/><path d="M16 7v18M9.5 12c2.2 2 4.3 3 6.5 3m6.500-3c-2.200 2-4.300 3-6.500 3M9 20c2.600.9 4.800.9 7 0m7 0c-2.600.9-4.800.9-7 0" fill="none" stroke="#4c9a2f" stroke-width="2" stroke-linecap="round"/></svg>`,
  tomato: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#e23b2e"/><path d="M16 9l-5-3 2 5-5 1 5 2 3-3 3 3 5-2-5-1 2-5z" fill="#3f9b46"/></svg>`,
  soup: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 15h26a13 12 0 0 1-26 0z" fill="#fffaf0" stroke="#3d8fe4" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="16" cy="15" rx="11" ry="3" fill="#d2411f"/><path d="M11 9c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5m5 5c-1.500-2 1.500-3 0-5" fill="none" stroke="#b9c3d6" stroke-width="2" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16h16m-6-6 6 6-6 6" fill="none" stroke="#8a8198" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// What each ticket shows: the ingredients to fetch, and for soup what they turn into.
const RECIPE_ICONS: Record<RecipeId, IconName[]> = {
  lettuce_salad: ["lettuce"],
  salad: ["lettuce", "tomato"],
  soup: ["tomato", "tomato", "tomato", "arrow", "soup"],
};

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// Keeps the DOM overlay in step with server snapshots, touching it only when values change.
export function createHud(): { update(state: GameState | null): void } {
  const root = element(".play-hud");
  const orders = element("#orders");
  const score = element("#score");
  const timer = element("#timer");
  const gameOver = element("#gameover");
  const finalScore = element("#final-score");
  const finalOrders = element("#final-orders");
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
    update(state) {
      root.hidden = state === null;
      gameOver.hidden = state?.phase !== "over";
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
      const seconds = Math.ceil(state.timeLeft);
      timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.classList.toggle("urgent", seconds <= 30 && state.phase === "playing");
      finalScore.textContent = String(state.score);
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
