// Server-only price lookups via SerpApi (Google Shopping).
// Google Shopping coverage is uneven and prices are indicative, not live
// supermarket shelf prices — surface them as such in the UI.
import { normalizeName } from "@/lib/normalize";
import type { StoreTag } from "@/lib/types";

export type Offer = {
  store: StoreTag;
  price: number;
  source: string; // raw seller name from Google (e.g. "Woolworths")
  title: string;
  image: string | null;
};

// A specific product option shown in the picker.
export type Product = {
  store: StoreTag;
  price: number;
  title: string;
  image: string | null;
  source: string; // real seller name, e.g. "Woolworths", "Amazon AU"
};

// Map a Google Shopping seller name to one of our store buckets.
export function parseStore(source: string): StoreTag {
  const s = source.toLowerCase();
  if (s.includes("woolworths") || s.includes("woolies")) return "woolies";
  if (s.includes("coles")) return "coles";
  if (s.includes("aldi")) return "aldi";
  return "any";
}

// Query SerpApi's Google Shopping engine for one item. Returns [] on any error
// so a single failed lookup never breaks the whole pricing pass.
export async function fetchOffers(
  name: string,
  apiKey: string
): Promise<Offer[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", name);
  url.searchParams.set("gl", "au"); // Australia
  url.searchParams.set("hl", "en");
  url.searchParams.set("location", "Australia");
  url.searchParams.set("num", "40");
  url.searchParams.set("api_key", apiKey);

  let data: unknown;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const results = (data as { shopping_results?: unknown[] })?.shopping_results;
  if (!Array.isArray(results)) return [];

  const offers: Offer[] = [];
  for (const raw of results) {
    const r = raw as Record<string, unknown>;
    const price =
      typeof r.extracted_price === "number" && Number.isFinite(r.extracted_price)
        ? (r.extracted_price as number)
        : null;
    const source =
      typeof r.source === "string"
        ? r.source
        : typeof r.store === "string"
        ? (r.store as string)
        : "";
    const title = typeof r.title === "string" ? (r.title as string) : "";
    const image =
      typeof r.thumbnail === "string"
        ? (r.thumbnail as string)
        : typeof r.thumbnails === "object" &&
          Array.isArray((r as { thumbnails?: unknown[] }).thumbnails)
        ? String((r as { thumbnails: unknown[] }).thumbnails[0] ?? "") || null
        : null;
    if (price == null || price <= 0 || !source) continue;
    offers.push({ store: parseStore(source), price, source, title, image });
  }

  // Light relevance filter: keep results whose title mentions the item's first
  // word (drops obviously unrelated matches). Fall back to all if it empties.
  const token = normalizeName(name).split(" ")[0];
  const relevant = token
    ? offers.filter((o) => normalizeName(o.title).includes(token))
    : offers;
  return relevant.length ? relevant : offers;
}

// Reduce a set of offers to the cheapest price per store bucket.
export function cheapestPerStore(
  offers: Offer[]
): { store: StoreTag; price: number }[] {
  const best = new Map<StoreTag, number>();
  for (const o of offers) {
    const cur = best.get(o.store);
    if (cur == null || o.price < cur) best.set(o.store, o.price);
  }
  return [...best.entries()]
    .map(([store, price]) => ({ store, price }))
    .sort((a, b) => a.price - b.price);
}

// Distinct product options, cheapest first, de-duplicated by seller+title.
export function topProducts(offers: Offer[], limit = 24): Product[] {
  const seen = new Set<string>();
  const products: Product[] = [];
  for (const o of [...offers].sort((a, b) => a.price - b.price)) {
    const key = `${o.source.toLowerCase()}|${normalizeName(o.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({
      store: o.store,
      price: o.price,
      title: o.title,
      image: o.image,
      source: o.source,
    });
    if (products.length >= limit) break;
  }
  return products;
}
