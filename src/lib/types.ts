export type StorageLocation =
  | "fridge"
  | "pantry"
  | "freezer"
  | "fruits_veg"
  | "snacks";

export type PantryItem = {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  location: StorageLocation;
  expiry_date: string | null; // YYYY-MM-DD
  min_threshold: number | null;
  updated_by: string | null;
  updated_at: string;
};

export const LOCATIONS: { value: StorageLocation; label: string }[] = [
  { value: "fridge", label: "Fridge" },
  { value: "pantry", label: "Pantry" },
  { value: "freezer", label: "Freezer" },
  { value: "fruits_veg", label: "Fruit & veg" },
  { value: "snacks", label: "Snacks & sweets" },
];

// Common units offered as autocomplete suggestions (free text still allowed).
// ---- Recipes (Step 4) ------------------------------------------------------

export type RecipeTag =
  | "kid_friendly"
  | "lunchbox"
  | "snack"
  | "quick"
  | "freezer_friendly"
  | "adults_only";

export const RECIPE_TAGS: { value: RecipeTag; label: string }[] = [
  { value: "kid_friendly", label: "Kid-friendly" },
  { value: "lunchbox", label: "Lunchbox" },
  { value: "snack", label: "Snack" },
  { value: "quick", label: "Quick" },
  { value: "freezer_friendly", label: "Freezer-friendly" },
  { value: "adults_only", label: "Adults only" },
];

export type RecipeIngredient = {
  id?: string;
  recipe_id?: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  is_staple: boolean;
};

export type RecipeSourceType = "imported" | "manual" | "suggested";

export type Recipe = {
  id: string;
  household_id: string;
  title: string;
  source_url: string | null;
  source_type: RecipeSourceType;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  tags: string[];
  instructions: string | null;
  image_path: string | null;
  is_favourite: boolean;
  times_cooked: number;
  last_cooked_at: string | null;
  created_at: string;
};

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: RecipeIngredient[];
};

// A single planned day returned by the weekly-plan generator / stored per day.
export type PlanDayResult = {
  date: string; // YYYY-MM-DD
  kids_present: boolean;
  dinner_recipe_id: string | null;
  dinner_note: string | null;
  lunch_note: string | null;
  breakfast_note: string | null;
  lunchbox_notes: string | null;
  snack_notes: string | null;
};

// Minimal recipe reference for the planner's library dropdown.
export type RecipeRef = { id: string; title: string; tags: string[] };

// Lightweight pantry row for recipe matching + "cooked this" decrements.
export type PantrySlim = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
};

// A parsed-but-unsaved recipe (from import, suggestion, or manual entry) for review.
export type RecipeDraft = {
  title: string;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  tags: RecipeTag[];
  instructions: string;
  source_url: string | null;
  source_type?: RecipeSourceType;
  ingredients: RecipeIngredient[];
};

// A single item detected from a photo, before the user confirms it.
export type DetectedItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: StorageLocation;
};

export const COMMON_UNITS = [
  "ea",
  "pack",
  "g",
  "kg",
  "ml",
  "L",
  "tin",
  "jar",
  "bottle",
  "bunch",
  "loaf",
  "dozen",
];
