// The chefs a player can be, in the order the picker shows them. Icy, the princess, leads the top row. The four
// KayKit adventurers are who the seats start as; the rest are chefs built on the same rig with their own heads and
// tails (or a gown), from scripts/make_chef_heads.mjs and src/client/chef.ts.
export const CHARACTERS = [
  { id: "icy", name: "Icy" },
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
const SEAT_CHARACTERS: CharacterId[] = ["knight", "barbarian", "mage", "rogue"];
export const seatCharacter = (seat: number): CharacterId => SEAT_CHARACTERS[seat % SEAT_CHARACTERS.length];

export const characterName = (id: string): string => CHARACTERS.find((character) => character.id === id)?.name ?? "Chef";
