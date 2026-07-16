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
