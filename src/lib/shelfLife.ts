import { normalizeName } from "@/lib/normalize";
import type { StorageLocation } from "@/lib/types";

/**
 * Rough shelf-life estimates for a household pantry. Deterministic and instant:
 * a keyword table keyed off the (normalised) item name, adjusted for where it's
 * stored. Returns the number of days the item typically keeps from when it was
 * bought/added, or null when we can't confidently classify it (the caller then
 * asks the AI, and falls back to a location default if that's unavailable).
 *
 * These are deliberately conservative "check me" estimates, not guarantees —
 * the UI flags them as approximate so a person can bump them out.
 */

type Rule = { kw: string[]; days: number };

// Ordered most-specific first; first keyword hit wins.
const RULES: Rule[] = [
  // --- Long-life pantry staples & preserved goods (~months to a year+) ------
  {
    kw: [
      "canned", "tinned", "can of", "baked bean", "chickpea", "lentil",
      "kidney bean", "black bean", "tinned tomato", "tuna", "spam",
    ],
    days: 540,
  },
  {
    kw: [
      "rice", "pasta", "spaghetti", "noodle", "flour", "sugar", "salt",
      "oil", "vinegar", "honey", "cereal", "oat", "muesli", "couscous",
      "quinoa", "dried", "stock cube", "gravy", "cornflour", "baking",
      "tea", "coffee", "cocoa", "popcorn kernel",
    ],
    days: 365,
  },
  {
    kw: [
      "sauce", "ketchup", "tomato sauce", "bbq sauce", "soy sauce", "mustard",
      "mayonnaise", "mayo", "jam", "peanut butter", "vegemite", "nutella",
      "relish", "chutney", "pickle", "olive", "passata", "paste", "curry paste",
      "syrup", "spread", "marmalade",
    ],
    days: 180,
  },
  {
    kw: ["spice", "herb dried", "pepper", "cumin", "paprika", "cinnamon", "oregano", "chilli powder", "stock", "bouillon"],
    days: 365,
  },

  // --- Snacks & confectionery (~weeks to months) ----------------------------
  {
    kw: [
      "chip", "cracker", "biscuit", "cookie", "chocolate", "lolly", "candy",
      "muesli bar", "snack bar", "nut", "pretzel", "popcorn", "rice cake",
      "fruit bar", "sultana", "raisin", "dried fruit",
    ],
    days: 120,
  },

  // --- Bakery ---------------------------------------------------------------
  { kw: ["bread", "loaf", "roll", "bun", "wrap", "tortilla", "bagel", "pita", "muffin", "crumpet"], days: 5 },
  { kw: ["cake", "pastry", "croissant", "donut", "doughnut", "pie", "tart"], days: 4 },

  // --- Dairy & eggs ---------------------------------------------------------
  { kw: ["milk", "cream", "custard"], days: 7 },
  { kw: ["parmesan", "cheddar", "tasty cheese", "hard cheese"], days: 30 },
  { kw: ["feta", "ricotta", "cream cheese", "cottage cheese", "mozzarella", "cheese"], days: 12 },
  { kw: ["yoghurt", "yogurt"], days: 14 },
  { kw: ["butter", "margarine"], days: 60 },
  { kw: ["egg"], days: 28 },

  // --- Meat, poultry & seafood (fresh) --------------------------------------
  { kw: ["mince", "chicken", "beef", "pork", "lamb", "sausage", "steak", "fish", "salmon", "prawn", "seafood", "meat"], days: 3 },
  { kw: ["bacon", "ham", "salami", "deli", "prosciutto", "chorizo"], days: 10 },
  { kw: ["tofu"], days: 10 },

  // --- Fruit ----------------------------------------------------------------
  { kw: ["banana", "avocado", "peach", "nectarine", "apricot", "fig", "berry", "strawberr", "raspberr", "blueberr", "grape", "cherry"], days: 5 },
  { kw: ["apple", "orange", "lemon", "lime", "pear", "mandarin", "kiwi", "mango", "melon", "pineapple", "citrus"], days: 14 },

  // --- Vegetables -----------------------------------------------------------
  { kw: ["lettuce", "spinach", "rocket", "salad", "herb", "coriander", "basil", "parsley", "mushroom", "cucumber", "broccoli", "cauliflower", "asparagus", "bean", "pea", "corn", "zucchini", "capsicum", "tomato"], days: 6 },
  { kw: ["carrot", "potato", "onion", "garlic", "pumpkin", "sweet potato", "cabbage", "beetroot", "celery", "leek", "ginger"], days: 21 },
];

// Applied to fresh items when stored somewhere that changes their life.
function locationAdjust(days: number, location: StorageLocation): number {
  if (location === "freezer") return Math.max(days, 180);
  // Bread etc. lasts noticeably longer refrigerated than in the cupboard.
  if (location === "fridge" && days <= 7) return Math.round(days * 1.6);
  return days;
}

export function estimateShelfLifeDays(
  rawName: string,
  location: StorageLocation
): number | null {
  // The freezer preserves almost anything — treat it as long-life outright.
  if (location === "freezer") return 180;

  const n = normalizeName(rawName);
  if (!n) return null;

  for (const rule of RULES) {
    if (rule.kw.some((k) => n.includes(k))) {
      return locationAdjust(rule.days, location);
    }
  }
  return null;
}

// Last resort when the table misses and the AI is unavailable — a safe guess by
// where it's kept so every blank still gets a "check me" date.
export function fallbackShelfLifeDays(location: StorageLocation): number {
  switch (location) {
    case "freezer":
      return 180;
    case "pantry":
      return 120;
    case "snacks":
      return 90;
    case "fruits_veg":
      return 7;
    case "fridge":
      return 7;
    default:
      return 14;
  }
}

/** base date + days → YYYY-MM-DD (local). base defaults to today. */
export function addDaysISO(days: number, base?: string | Date | null): string {
  const d = base ? new Date(base) : new Date();
  if (Number.isNaN(d.getTime())) d.setTime(Date.now());
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
