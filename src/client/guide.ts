import { LEVELS, type Level } from "../shared/level";
import { READY_SECONDS, RECIPES, type GameState } from "../shared/sim";
import { ICONS, RECIPE_ICONS, SEATS } from "./hud";
import { illustration, type Scene } from "./illustrations";

// A few words and the key to press under each picture, plus one word for the small reminders; the picture does the explaining.
const CAPTIONS: Record<Scene, { text: string; short: string; key?: string }> = {
  grab: { text: "Grab", short: "Grab", key: "<kbd>E</kbd>" },
  chop: { text: "Chop", short: "Chop", key: "hold <kbd>F</kbd>" },
  plate: { text: "Plate it", short: "Plate", key: "<kbd>E</kbd>" },
  serve: { text: "Serve!", short: "Serve", key: "<kbd>E</kbd>" },
  soup: { text: "3 in a pot", short: "Soup" },
  pass: { text: "Pass it over the wall", short: "Pass" },
  wash: { text: "Scrub dirty plates", short: "Wash", key: "hold <kbd>F</kbd>" },
  grill: { text: "Grill it whole, no knife", short: "Grill" },
  fire: { text: "Spray the fire", short: "Fire!", key: "hold <kbd>F</kbd>" },
  combo: { text: "All on one plate", short: "Combo" },
  belt: { text: "Let the belt carry it", short: "Belt" },
};

// The big pictures for each kitchen: how to cook in the first one, then whatever that kitchen adds.
const NEW_HERE: Scene[][] = [["grab", "chop", "plate", "serve"], ["pass"], ["wash"], ["grill", "fire"], ["combo"], ["belt"]];

// Every job a kitchen asks for, as the scenes that show it.
function scenesOf(level: Level): Scene[] {
  const scenes: Scene[] = ["chop", "serve"];
  if (level.recipes.some((recipe) => recipe.endsWith("soup"))) scenes.push("soup");
  if (level.tiles.some((tile) => tile.kind === "grill")) scenes.push("grill");
  if (level.plates) scenes.push("wash");
  if (level.fire) scenes.push("fire");
  if (level.tiles.some((tile) => tile.kind === "belt")) scenes.push("belt");
  return scenes;
}

const panel = (scene: Scene, size: "big" | "small") => {
  const { text, short, key } = CAPTIONS[scene];
  const caption = size === "big" ? `<b>${text}</b>${key ? ` <span>${key}</span>` : ""}` : `<b>${short}</b>`;
  return `<li class="guide-panel guide-panel-${size}"><figure>${illustration(scene)}</figure><p>${caption}</p></li>`;
};

function briefing(index: number): string {
  const level = LEVELS[index];
  const before = index > 0 ? LEVELS[index - 1] : null;
  const hero = NEW_HERE[index] ?? [];
  const also = scenesOf(level).filter((scene) => !hero.includes(scene));
  const dots = Array.from({ length: 5 }, (_, i) => `<i${i < level.difficulty ? ' class="on"' : ""}></i>`).join("");

  const menu = level.recipes
    .map((recipe) => {
      const isNew = before !== null && !before.recipes.includes(recipe);
      const icons = RECIPE_ICONS[recipe].map((name) => `<span class="order-icon order-icon-${name}">${ICONS[name]}</span>`).join("");
      return `<li class="guide-dish${isNew ? " is-new" : ""}">${isNew ? '<span class="guide-new">New</span>' : ""}<div class="order-icons">${icons}</div><b>${RECIPES[recipe].label}</b></li>`;
    })
    .join("");

  return `
    <header class="guide-head">
      <div>
        <p class="lobby-kicker">Kitchen ${index + 1}</p>
        <h2 id="guide-title">${level.name}</h2>
      </div>
      <span class="level-dots" aria-label="Difficulty ${level.difficulty} of 5">${dots}</span>
      <button type="button" class="guide-close" data-close aria-label="Close">×</button>
    </header>
    <div class="guide-body">
      <section class="guide-hero" data-count="${hero.length}">
        <p class="guide-label${index > 0 ? " guide-label-new" : ""}">${index === 0 ? "How to cook" : "New here!"}</p>
        <ol class="guide-panels">${hero.map((scene) => panel(scene, "big")).join("")}</ol>
      </section>
      ${also.length ? `<section><p class="guide-label">Also in this kitchen</p><ul class="guide-panels guide-also">${also.map((scene) => panel(scene, "small")).join("")}</ul></section>` : ""}
      <section><p class="guide-label">Menu</p><ul class="guide-menu">${menu}</ul></section>
    </div>
    <footer class="guide-foot">
      <button type="button" class="button button-primary" data-close>Let's cook! <kbd>Enter</kbd></button>
    </footer>`;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

export interface Guide {
  // Opens the briefing for a kitchen, or for the current one.
  open(level?: number): void;
  close(): void;
  readonly isOpen: boolean;
  // Opens the briefing on its own as a round is about to start, and shows who the clock is still waiting for.
  update(state: GameState | null, localId: number | null): void;
}

// onReady tells the server this chef has read the briefing, which lets the clock start.
export function createGuide(onReady: () => void): Guide {
  const root = document.querySelector<HTMLElement>("#guide")!;
  const card = root.querySelector<HTMLElement>(".guide-card")!;
  const banner = document.querySelector<HTMLElement>("#ready-banner")!;
  const countdown = document.querySelector<HTMLElement>("#countdown")!;
  let shownCount = "";
  let goTimer = 0;
  let current = 0;
  let latest: GameState | null = null;
  let me: number | null = null;
  let lastPhase: GameState["phase"] | null = null;
  let returnFocus: HTMLElement | null = null;

  const waitingOnMe = () => latest?.phase === "ready" && me !== null && !latest.ready.includes(me);
  // While the crew finishes reading: who is ready (a tick) and who is still reading, and when it starts regardless.
  const renderBanner = () => {
    const state = latest;
    banner.hidden = !state || state.phase !== "ready" || state.countdown !== null || !root.hidden || waitingOnMe();
    if (banner.hidden || !state) return;
    const left = Math.max(0, Math.ceil(READY_SECONDS - state.readyFor));
    const chefs = state.players
      .map((player) => {
        const ready = state.ready.includes(player.id);
        const name = player.name || SEATS[player.id % SEATS.length].name;
        return `<span class="${ready ? "is-ready" : ""}" style="--seat:${SEATS[player.id % SEATS.length].colour}">${ready ? "✓" : "…"} ${escape(name)}</span>`;
      })
      .join("");
    banner.innerHTML = `<b>Waiting for the crew</b>${chefs}<small>starts in ${left}s</small>`;
  };

  // Big 3, 2, 1 in the middle of the screen, then "Go!" as the clock starts.
  const renderCountdown = (state: GameState | null, startedNow: boolean) => {
    let text = "";
    if (state?.phase === "ready" && state.countdown !== null) text = String(Math.max(1, Math.ceil(state.countdown)));
    if (startedNow) {
      text = "Go!";
      goTimer = window.setTimeout(() => {
        countdown.hidden = true;
        shownCount = "";
      }, 800);
    } else if (text) {
      window.clearTimeout(goTimer);
    } else {
      return;
    }
    countdown.hidden = false;
    if (text === shownCount) return;
    shownCount = text;
    countdown.textContent = text;
    // Restarting the animation pops each new number.
    countdown.classList.remove("pop");
    void countdown.offsetWidth;
    countdown.classList.add("pop");
  };

  const guide: Guide = {
    get isOpen() {
      return !root.hidden;
    },
    open(level = current) {
      card.innerHTML = briefing(level);
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      card.querySelector(".guide-body")?.scrollTo(0, 0);
      card.querySelector<HTMLElement>(".guide-foot .button")?.focus({ preventScroll: true });
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      returnFocus?.focus({ preventScroll: true });
      if (waitingOnMe()) onReady();
      renderBanner();
    },
    update(state, localId) {
      latest = state;
      me = localId;
      if (state) {
        current = state.level;
        // The briefing comes up once, as the service is started or the next kitchen comes round.
        if (state.phase === "ready" && lastPhase !== "ready") guide.open(state.level);
        // Once the count-down starts (everyone ready, or the wait ran out) the briefing gets out of the way.
        if ((state.phase === "ready" && state.countdown !== null) || state.phase === "playing") {
          if (lastPhase === "ready") guide.close();
        }
        renderCountdown(state, state.phase === "playing" && lastPhase === "ready");
        lastPhase = state.phase;
      }
      renderBanner();
    },
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // A click on the dim backdrop or a close button dismisses it; clicks inside the card do not.
    if (target === root || target.closest("[data-close]")) guide.close();
  });
  // Runs before the game's own key handlers, so Enter closes the briefing instead of starting the service.
  window.addEventListener(
    "keydown",
    (event) => {
      if (root.hidden) return;
      if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        guide.close();
      }
    },
    { capture: true },
  );
  document.querySelector("#guide-button")?.addEventListener("click", () => guide.open());
  return guide;
}
