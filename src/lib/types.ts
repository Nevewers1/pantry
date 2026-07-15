export type StorageLocation = "pantry" | "fridge" | "freezer";

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
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

// Common units offered as autocomplete suggestions (free text still allowed).
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
