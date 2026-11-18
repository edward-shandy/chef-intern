import { characterName } from "../shared/characters";
import type { ChefStats, GameState, PlayerState } from "../shared/sim";
import { SEATS } from "./hud";
import { portraitOf, posesOf, POSE_FRAMES } from "./portraits";

// The crew on the results screen: every chef in the kitchen, cheering after a win or crying after a loss, each with
// a title for what they did most and a line of their numbers. Confetti rains on a win; a little rain cloud hangs
// over each chef after a loss.

// Titles for whoever did the most of each job this round, in the order they are awarded.
const TITLES: Array<{ stat: keyof ChefStats; title: string; icon: string; noun: [string, string] }> = [
  { stat: "served", title: "Head Chef", icon: "🍽️", noun: ["dish served", "dishes served"] },
  { stat: "chopped", title: "Knife Master", icon: "🔪", noun: ["chopped", "chopped"] },
  { stat: "washed", title: "Dish Hero", icon: "🧽", noun: ["plate washed", "plates washed"] },
  { stat: "doused", title: "Firefighter", icon: "🧯", noun: ["fire out", "fires out"] },
  { stat: "thrown", title: "Spell Slinger", icon: "🪄", noun: ["good throw", "good throws"] },
];

const CONFETTI_COLOURS = ["#ffd166", "#3fd6e8", "#f27aa0", "#9b7bff", "#7ccf4f", "#ff8a3d"];

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

// Each chef's title: the jobs they led (ties share), or a friendly fallback for a chef who led none.
function titlesFor(players: PlayerState[], won: boolean): Map<number, { title: string; icon: string }> {
  const titles = new Map<number, { title: string; icon: string }>();
  for (const { stat, title, icon } of TITLES) {
    const best = Math.max(0, ...players.map((player) => player.stats?.[stat] ?? 0));
    if (best === 0) continue;
    for (const player of players) {
      if ((player.stats?.[stat] ?? 0) === best && !titles.has(player.id)) titles.set(player.id, { title, icon });
    }
  }
  for (const player of players) {
    if (!titles.has(player.id)) titles.set(player.id, won ? { title: "Sous Chef", icon: "⭐" } : { title: "Tried their best", icon: "💪" });
  }
  return titles;
}

function statLine(stats: ChefStats | undefined): string {
  const parts = TITLES.map(({ stat, noun }) => {
    const count = stats?.[stat] ?? 0;
    return count > 0 ? `${count} ${noun[count === 1 ? 0 : 1]}` : "";
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "No jobs this time";
}

export interface Results {
  update(state: GameState | null, localId: number | null): void;
}

export function createResults(): Results {
  const crew = document.querySelector<HTMLElement>("#result-crew")!;
  const fx = document.querySelector<HTMLElement>("#result-fx")!;
  let shownFor = "";
  let flip = 0;
  let timer = 0;

  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };

  const show = (state: GameState, localId: number | null) => {
    const won = state.won;
    const players = [...state.players].sort((a, b) => a.id - b.id);
    const titles = titlesFor(players, won);
    crew.dataset.result = won ? "won" : "lost";
    crew.replaceChildren(
      ...players.map((player, i) => {
        const card = document.createElement("figure");
        card.className = "crew-card";
        card.style.setProperty("--seat", SEATS[player.id % SEATS.length].colour);
        card.style.setProperty("--delay", `${i * 0.12}s`);
        const { title, icon } = titles.get(player.id)!;
        const name = player.name || characterName(player.character);
        // The lobby portrait stands in until the full-body frames are drawn a moment later.
        const still = portraitOf(player.character) ?? "";
        card.innerHTML = `
          <div class="crew-stage">
            ${won ? "" : '<span class="crew-cloud" aria-hidden="true"><i></i><i></i><i></i></span>'}
            <img alt="" src="${still}" data-character="${player.character}" />
            ${won ? "" : '<span class="crew-tears" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'}
          </div>
          <figcaption>
            <b>${escape(name)}${player.id === localId ? " <small>You</small>" : ""}</b>
            <span class="crew-title">${icon} ${title}</span>
            <span class="crew-stats">${statLine(player.stats)}</span>
          </figcaption>`;
        return card;
      }),
    );

    // Confetti for a win, gentle rain for a loss, each piece with its own place, colour and timing.
    fx.dataset.result = won ? "won" : "lost";
    fx.replaceChildren(
      ...Array.from({ length: won ? 70 : 40 }, (_, i) => {
        const piece = document.createElement("i");
        piece.style.left = `${(i * 37) % 100}%`;
        piece.style.animationDelay = `${-((i * 0.173) % (won ? 3 : 1.2)).toFixed(2)}s`;
        piece.style.animationDuration = `${won ? 2.4 + (i % 5) * 0.35 : 0.9 + (i % 4) * 0.15}s`;
        if (won) {
          piece.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
          piece.style.setProperty("--spin", `${(i % 2 ? 1 : -1) * (360 + (i % 4) * 180)}deg`);
        }
        return piece;
      }),
    );

    // Render the full-body frames after the popup has painted, then flip through them like a cartoon.
    stop();
    window.setTimeout(() => {
      const frames = new Map<string, string[]>();
      for (const player of players) {
        if (!frames.has(player.character)) frames.set(player.character, posesOf(player.character, won ? "cheer" : "sad"));
      }
      flip = 0;
      const images = [...crew.querySelectorAll<HTMLImageElement>("img[data-character]")];
      timer = window.setInterval(
        () => {
          flip = (flip + 1) % POSE_FRAMES;
          for (const image of images) {
            const sequence = frames.get(image.dataset.character!);
            if (sequence) image.src = sequence[flip];
          }
        },
        won ? 110 : 160,
      );
    }, 60);
  };

  return {
    update(state, localId) {
      if (!state || state.phase !== "over") {
        if (shownFor) stop();
        shownFor = "";
        return;
      }
      // Built once per game over; a new round (or a different crew) builds it again.
      const key = `${state.level}:${state.won}:${state.players.map((player) => `${player.id}/${player.character}`).join(",")}`;
      if (key === shownFor) return;
      shownFor = key;
      show(state, localId);
    },
  };
}
