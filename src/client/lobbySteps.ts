import { CHARACTERS, characterName } from "../shared/characters";
import type { GameState } from "../shared/sim";
import { onPortraits, portraitOf } from "./portraits";

export interface ChefPicker {
  update(state: GameState | null, localId: number | null): void;
}

// The room lobby's two steps: the shared kitchen picker, then this player's own chef and name.
export function createChefPicker(onPick: (character: string) => void, onStart: () => void): ChefPicker {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(".lobby-steps [data-step]")];
  const panels = [...document.querySelectorAll<HTMLElement>(".lobby-step[data-panel]")];
  const grid = document.querySelector<HTMLElement>("#characters")!;
  const preview = document.querySelector<HTMLImageElement>("#chef-portrait")!;
  const previewName = document.querySelector<HTMLElement>("#chef-pick-name")!;
  const nameInput = document.querySelector<HTMLInputElement>("#chef-name")!;
  let mine: string | null = null;
  // A pick the server has not confirmed yet, so an older snapshot does not flip the choice back.
  let pending: string | null = null;

  const show = (step: string) => {
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.step === step)));
    panels.forEach((panel) => (panel.hidden = panel.dataset.panel !== step));
  };
  tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.step!)));
  document.querySelector("#to-chef")!.addEventListener("click", () => show("chef"));
  document.querySelector("#back-kitchen")!.addEventListener("click", () => show("kitchen"));
  document.querySelector("#start-chef")!.addEventListener("click", onStart);

  const cards = CHARACTERS.map(({ id, name }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "character-card";
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", "false");
    card.dataset.id = id;
    card.innerHTML = `<span class="character-face"><b>${name[0]}</b></span><span class="character-name">${name}</span>`;
    card.addEventListener("click", () => {
      mine = pending = id;
      render();
      onPick(id);
    });
    return card;
  });
  grid.replaceChildren(...cards);

  const render = () => {
    cards.forEach((card) => card.setAttribute("aria-checked", String(card.dataset.id === mine)));
    const portrait = mine ? portraitOf(mine) : null;
    preview.hidden = !portrait;
    if (portrait) preview.src = portrait;
    previewName.textContent = nameInput.value.trim() || (mine ? characterName(mine) : "Chef");
  };
  nameInput.addEventListener("input", render);

  onPortraits(() => {
    for (const card of cards) {
      const portrait = portraitOf(card.dataset.id!);
      if (portrait) card.querySelector(".character-face")!.innerHTML = `<img src="${portrait}" alt="" />`;
    }
    render();
  });

  return {
    update(state, localId) {
      const me = state?.players.find((player) => player.id === localId);
      if (!me) return;
      if (pending !== null) {
        if (me.character !== pending) return;
        pending = null;
      }
      if (me.character !== mine) {
        mine = me.character;
        render();
      }
    },
  };
}
