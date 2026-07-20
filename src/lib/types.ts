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
  expiry_estimated: boolean; // true = app-guessed shelf life (approximate)
  min_threshold: number | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
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

export type MealType = "full" | "main" | "side";

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "full", label: "Full meal" },
  { value: "main", label: "Main" },
  { value: "side", label: "Side dish" },
];

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
  meal_type: MealType;
  instructions: string | null;
  image_path: string | null;
  image_url: string | null;
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
  away?: boolean;
  dinner_side_ids?: string[];
  dinner_recipe_id: string | null;
  dinner_note: string | null;
  lunch_note: string | null;
  breakfast_note: string | null;
  lunchbox_notes: string | null;
  snack_notes: string | null;
};

export type DinnerStatus = "home" | "eating_out" | "ordered_in";

export type StoreTag = "coles" | "woolies" | "aldi" | "any";

export const STORES: { value: StoreTag; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "coles", label: "Coles" },
  { value: "woolies", label: "Woolies" },
  { value: "aldi", label: "Aldi" },
];

export type ShoppingItem = {
  id: string;
  meal_plan_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  store: StoreTag;
  est_price: number | null;
  is_checked: boolean;
  added_to_pantry: boolean;
};

export type LunchComponent = "crunch_sip" | "afternoon_tea" | "recess";

export const LUNCH_COMPONENTS: { value: LunchComponent; label: string }[] = [
  { value: "crunch_sip", label: "Crunch & Sip" },
  { value: "afternoon_tea", label: "Afternoon tea" },
  { value: "recess", label: "Recess / lunch" },
];

export type LunchboxItem = {
  id?: string;
  date: string;
  child_slot: 1 | 2;
  component: LunchComponent;
  name: string;
  quantity: number | null;
  unit: string | null;
  pantry_item_id: string | null;
};

// Minimal recipe reference for the planner's library dropdown.
export type RecipeRef = {
  id: string;
  title: string;
  tags: string[];
  meal_type: MealType;
  is_favourite: boolean;
};

// Lightweight pantry row for recipe matching + "cooked this" decrements.
export type PantrySlim = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  location?: string;
};

// A parsed-but-unsaved recipe (from import, suggestion, or manual entry) for review.
export type RecipeDraft = {
  title: string;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  tags: RecipeTag[];
  meal_type?: MealType;
  instructions: string;
  source_url: string | null;
  source_type?: RecipeSourceType;
  image_url?: string | null;
  ingredients: RecipeIngredient[];
};

// A single item detected from a photo, before the user confirms it.
export type DetectedItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: StorageLocation;
  expiry_date?: string | null; // estimated on review, editable before saving
  expiry_estimated?: boolean;
};

// ---- In-app feedback / feature requests ------------------------------------
export type FeedbackType = "feature" | "bug" | "general";

export const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: "feature", label: "Feature idea" },
  { value: "bug", label: "Something's off" },
  { value: "general", label: "General" },
];

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
