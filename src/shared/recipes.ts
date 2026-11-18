export type Ingredient =
  | "tomato"
  | "lettuce"
  | "onion"
  | "chicken"
  | "seaweed"
  | "clam"
  | "fish"
  | "bun"
  | "meat"
  | "pumpkin"
  | "mushroom";
export type Soup = "tomato_soup" | "onion_soup" | "clam_soup" | "pumpkin_soup";
// What a whole chicken becomes after its time on the grill.
export type Roast = "roast_chicken";
export type DishPart = Exclude<Ingredient, "chicken"> | Soup | Roast;

// Ingredients that can be boiled into a soup, three of the same kind per pot.
export const SOUP_OF: Partial<Record<Ingredient, Soup>> = {
  tomato: "tomato_soup",
  onion: "onion_soup",
  clam: "clam_soup",
  pumpkin: "pumpkin_soup",
};
// Ingredients that go on the grill whole instead of being chopped.
export const ROAST_OF: Partial<Record<Ingredient, Roast>> = { chicken: "roast_chicken" };

// How each ingredient is made ready to plate: chopped on a board, grilled, or both (a fish fillet, a patty).
export const PREP: Record<Ingredient, { chop: boolean; grill: boolean }> = {
  tomato: { chop: true, grill: false },
  lettuce: { chop: true, grill: false },
  onion: { chop: true, grill: false },
  seaweed: { chop: true, grill: false },
  clam: { chop: true, grill: false },
  chicken: { chop: false, grill: true },
  fish: { chop: true, grill: true },
  meat: { chop: true, grill: true },
  bun: { chop: false, grill: false },
  pumpkin: { chop: true, grill: false },
  mushroom: { chop: true, grill: true },
};

export const isSoup = (part: DishPart): part is Soup => part.endsWith("_soup");

// `seconds` is how long one chef alone gets to deliver the order; teams get less.
export const RECIPES = {
  lettuce_salad: { label: "Lettuce salad", parts: ["lettuce"], points: 20, seconds: 65 },
  salad: { label: "Garden salad", parts: ["lettuce", "tomato"], points: 30, seconds: 90 },
  soup: { label: "Tomato soup", parts: ["tomato_soup"], points: 40, seconds: 120 },
  onion_soup: { label: "Onion soup", parts: ["onion_soup"], points: 45, seconds: 120 },
  roast_chicken: { label: "Roast chicken", parts: ["roast_chicken"], points: 50, seconds: 120 },
  chicken_salad: { label: "Chicken salad", parts: ["roast_chicken", "lettuce", "tomato"], points: 70, seconds: 150 },
  seaweed_salad: { label: "Seaweed salad", parts: ["seaweed", "tomato"], points: 30, seconds: 90 },
  clam_chowder: { label: "Clam chowder", parts: ["clam_soup"], points: 45, seconds: 120 },
  grilled_fish: { label: "Grilled fish", parts: ["fish"], points: 40, seconds: 110 },
  burger: { label: "Burger", parts: ["bun", "meat", "lettuce", "tomato"], points: 60, seconds: 150 },
  pumpkin_soup: { label: "Pumpkin soup", parts: ["pumpkin_soup"], points: 45, seconds: 120 },
  mushroom_burger: { label: "Mushroom burger", parts: ["bun", "mushroom", "lettuce"], points: 60, seconds: 150 },
} satisfies Record<string, { label: string; parts: DishPart[]; points: number; seconds: number }>;

export type RecipeId = keyof typeof RECIPES;
