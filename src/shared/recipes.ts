export type Ingredient = "tomato" | "lettuce" | "onion" | "seaweed" | "clam" | "fish" | "bun" | "meat";
export type Soup = "tomato_soup" | "onion_soup" | "clam_soup";
export type DishPart = Ingredient | Soup;

// Ingredients that can be boiled into a soup, three of the same kind per pot.
export const SOUP_OF: Partial<Record<Ingredient, Soup>> = { tomato: "tomato_soup", onion: "onion_soup", clam: "clam_soup" };

// How each ingredient is made ready to plate: chopped on a board, then for some also grilled.
export const PREP: Record<Ingredient, { chop: boolean; grill: boolean }> = {
  tomato: { chop: true, grill: false },
  lettuce: { chop: true, grill: false },
  onion: { chop: true, grill: false },
  seaweed: { chop: true, grill: false },
  clam: { chop: true, grill: false },
  fish: { chop: true, grill: true },
  meat: { chop: true, grill: true },
  bun: { chop: false, grill: false },
};

export const isSoup = (part: DishPart): part is Soup => part.endsWith("_soup");

// `seconds` is how long one chef alone gets to deliver the order; teams get less.
export const RECIPES = {
  lettuce_salad: { label: "Lettuce salad", parts: ["lettuce"], points: 20, seconds: 65 },
  salad: { label: "Garden salad", parts: ["lettuce", "tomato"], points: 30, seconds: 90 },
  soup: { label: "Tomato soup", parts: ["tomato_soup"], points: 40, seconds: 120 },
  onion_soup: { label: "Onion soup", parts: ["onion_soup"], points: 45, seconds: 120 },
  seaweed_salad: { label: "Seaweed salad", parts: ["seaweed", "tomato"], points: 30, seconds: 90 },
  clam_chowder: { label: "Clam chowder", parts: ["clam_soup"], points: 45, seconds: 120 },
  grilled_fish: { label: "Grilled fish", parts: ["fish"], points: 40, seconds: 110 },
  burger: { label: "Burger", parts: ["bun", "meat", "lettuce", "tomato"], points: 60, seconds: 150 },
} satisfies Record<string, { label: string; parts: DishPart[]; points: number; seconds: number }>;

export type RecipeId = keyof typeof RECIPES;
