/**
 * Normalise an ingredient / item name so recipes reconcile against pantry stock
 * and against each other. Lowercase, strip punctuation, singularise (roughly),
 * and map common AU/US synonyms to one canonical term (AU-leaning).
 */

// Map many spellings/synonyms → one canonical name.
const SYNONYMS: Record<string, string> = {
  capsicum: "capsicum",
  "bell pepper": "capsicum",
  "red pepper": "capsicum",
  coriander: "coriander",
  cilantro: "coriander",
  eggplant: "eggplant",
  aubergine: "eggplant",
  zucchini: "zucchini",
  courgette: "zucchini",
  rocket: "rocket",
  arugula: "rocket",
  prawn: "prawn",
  shrimp: "prawn",
  "spring onion": "spring onion",
  scallion: "spring onion",
  "green onion": "spring onion",
  "minced beef": "beef mince",
  "ground beef": "beef mince",
  "beef mince": "beef mince",
  chickpea: "chickpea",
  "garbanzo bean": "chickpea",
  "tomato paste": "tomato paste",
  "tomato puree": "tomato paste",
  "plain flour": "plain flour",
  "all-purpose flour": "plain flour",
  "all purpose flour": "plain flour",
};

function singularise(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"; // berries -> berry
  if (word.endsWith("oes")) return word.slice(0, -2); // tomatoes -> tomato
  if (word.endsWith("ses")) return word.slice(0, -2); // glasses -> glass
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function normalizeName(raw: string): string {
  let s = (raw || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ") // drop numbers/punctuation
    .replace(/\b(fresh|organic|large|small|medium|ripe|free[-\s]?range)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (SYNONYMS[s]) return SYNONYMS[s];

  // Singularise each word, then re-check synonyms on the result.
  s = s.split(" ").map(singularise).join(" ").trim();
  return SYNONYMS[s] ?? s;
}

/** True if a pantry item name plausibly satisfies a recipe ingredient name. */
export function namesMatch(ingredient: string, pantryItem: string): boolean {
  const a = normalizeName(ingredient);
  const b = normalizeName(pantryItem);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
