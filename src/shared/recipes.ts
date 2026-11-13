export type Ingredient = "tomato" | "lettuce" | "onion";
export type Soup = "tomato_soup" | "onion_soup";
export type DishPart = Ingredient | Soup;

// Ingredients that can be boiled into a soup, three of the same kind per pot.
export const SOUP_OF: Partial<Record<Ingredient, Soup>> = { tomato: "tomato_soup", onion: "onion_soup" };

export const isSoup = (part: DishPart): part is Soup => part.endsWith("_soup");

// `seconds` is how long one chef alone gets to deliver the order; teams get less.
export const RECIPES = {
  lettuce_salad: { label: "Lettuce salad", parts: ["lettuce"], points: 20, seconds: 65 },
  salad: { label: "Garden salad", parts: ["lettuce", "tomato"], points: 30, seconds: 90 },
  soup: { label: "Tomato soup", parts: ["tomato_soup"], points: 40, seconds: 120 },
  onion_soup: { label: "Onion soup", parts: ["onion_soup"], points: 45, seconds: 120 },
} satisfies Record<string, { label: string; parts: DishPart[]; points: number; seconds: number }>;

export type RecipeId = keyof typeof RECIPES;
