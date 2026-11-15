// The chefs a player can be. The first four are the KayKit adventurers each seat starts as; the rest are animal
// chefs built on the same rig, with their own heads and tails (see scripts/make_chef_heads.mjs and src/client/chef.ts).
export const CHARACTERS = [
  { id: "knight", name: "Knight" },
  { id: "barbarian", name: "Barbarian" },
  { id: "mage", name: "Mage" },
  { id: "rogue", name: "Rogue" },
  { id: "mouse", name: "Pip" },
  { id: "cat", name: "Ginger" },
  { id: "bear", name: "Bruno" },
  { id: "frog", name: "Hopper" },
  { id: "penguin", name: "Waddles" },
  { id: "fox", name: "Rusty" },
  { id: "pig", name: "Truffle" },
  { id: "elephant", name: "Peanut" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];

export const isCharacter = (value: unknown): value is CharacterId => CHARACTERS.some((character) => character.id === value);

// Who a seat plays until its player picks someone.
export const seatCharacter = (seat: number): CharacterId => CHARACTERS[seat % 4].id;

export const characterName = (id: string): string => CHARACTERS.find((character) => character.id === id)?.name ?? "Chef";
