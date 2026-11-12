import { RECIPES, type GameState, type RecipeId } from "../shared/sim";

// Placeholder pictures for each recipe until real art lands in the visual pass.
const RECIPE_ICONS: Record<RecipeId, string> = {
  lettuce_salad: "🥬",
  salad: "🥬🍅",
  soup: "🍲",
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
  const cards = new Map<number, HTMLElement>();
  let orderKey = "";

  return {
    update(state) {
      root.hidden = state === null;
      gameOver.hidden = state?.phase !== "over";
      if (!state) return;

      score.textContent = String(state.score);
      const seconds = Math.ceil(state.timeLeft);
      timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.classList.toggle("urgent", seconds <= 30);
      finalScore.textContent = `${state.score} points · ${state.delivered} orders served`;

      const key = state.orders.map((order) => order.id).join(",");
      if (key !== orderKey) {
        orderKey = key;
        cards.clear();
        orders.replaceChildren(
          ...state.orders.map((order) => {
            const card = document.createElement("article");
            card.className = "order";
            card.innerHTML = `<span class="order-icon">${RECIPE_ICONS[order.recipe]}</span><span class="order-name">${RECIPES[order.recipe].label}</span><span class="order-time"><i></i></span>`;
            cards.set(order.id, card);
            return card;
          }),
        );
      }
      for (const order of state.orders) {
        const card = cards.get(order.id);
        if (!card) continue;
        const left = Math.max(0, order.timeLeft / order.timeTotal);
        card.querySelector<HTMLElement>("i")!.style.transform = `scaleX(${left.toFixed(3)})`;
        card.classList.toggle("urgent", left < 0.25);
      }
    },
  };
}
