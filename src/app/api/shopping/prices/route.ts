import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { namesMatch } from "@/lib/normalize";
import { fetchOffers, topProducts, type Product } from "@/lib/prices";
import type { StoreTag } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const FRESH_DAYS = 7;
const MAX_ITEMS = 40;
const CONCURRENCY = 4;

type ReqItem = { id: string; name: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No household." }, { status: 400 });
  const householdId = profile.household_id as string;

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, results: {} });
  }

  let items: ReqItem[] = [];
  try {
    const body = await request.json();
    items = Array.isArray(body.items)
      ? body.items
          .filter(
            (i: unknown): i is ReqItem =>
              !!i &&
              typeof (i as ReqItem).id === "string" &&
              typeof (i as ReqItem).name === "string"
          )
          .slice(0, MAX_ITEMS)
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!items.length) return NextResponse.json({ configured: true, results: {} });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FRESH_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: history } = await supabase
    .from("price_history")
    .select("item_name, store, price, seen_on, title, image_url, source_name")
    .gte("seen_on", cutoffStr);
  const freshRows = history ?? [];

  const results: Record<string, { products: Product[]; cheapest: Product | null }> = {};

  // Build de-duplicated products (cheapest first) from cached rows for a name.
  // Only reuse rows that carry a real product title — older bare price rows
  // (no title/image) are treated as stale so they get re-fetched with detail.
  const cachedProductsFor = (name: string): Product[] => {
    const rows = freshRows.filter(
      (r) =>
        namesMatch(name, r.item_name as string) &&
        typeof r.title === "string" &&
        (r.title as string).trim().length > 0 &&
        // Require a seller name too — rows cached before the seller column
        // existed are treated as stale so they re-fetch with full detail.
        typeof r.source_name === "string" &&
        (r.source_name as string).trim().length > 0
    );
    const seen = new Set<string>();
    const products: Product[] = [];
    for (const r of [...rows].sort((a, b) => (a.price as number) - (b.price as number))) {
      const title = (r.title as string | null) ?? "";
      const store = r.store as StoreTag;
      const src = ((r.source_name as string | null) ?? "").toLowerCase();
      const key = `${src}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({
        store,
        price: r.price as number,
        title: title || name,
        image: (r.image_url as string | null) ?? null,
        source: (r.source_name as string | null) ?? "",
      });
    }
    return products;
  };

  const toFetch: ReqItem[] = [];
  for (const it of items) {
    const cached = cachedProductsFor(it.name);
    if (cached.length) {
      results[it.id] = { products: cached, cheapest: cached[0] };
    } else {
      toFetch.push(it);
    }
  }

  const priceRowsToInsert: {
    household_id: string;
    item_name: string;
    store: StoreTag;
    price: number;
    seen_on: string;
    title: string | null;
    image_url: string | null;
    source_name: string | null;
  }[] = [];

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (it) => {
        try {
          const offers = await fetchOffers(it.name, apiKey);
          const products = topProducts(offers, 24);
          results[it.id] = { products, cheapest: products[0] ?? null };
          for (const p of products) {
            priceRowsToInsert.push({
              household_id: householdId,
              item_name: it.name,
              store: p.store,
              price: p.price,
              seen_on: today,
              title: p.title || null,
              image_url: p.image,
              source_name: p.source || null,
            });
          }
        } catch {
          results[it.id] = { products: [], cheapest: null };
        }
      })
    );
  }

  if (priceRowsToInsert.length) {
    await supabase.from("price_history").insert(priceRowsToInsert);
  }

  // Persist the cheapest product onto each shopping list item.
  await Promise.all(
    Object.entries(results).map(async ([id, r]) => {
      if (!r.cheapest) return;
      await supabase
        .from("shopping_list_items")
        .update({
          est_price: r.cheapest.price,
          store: r.cheapest.store,
          product_name: r.cheapest.title,
          product_image: r.cheapest.image,
          product_source: r.cheapest.source || null,
        })
        .eq("id", id)
        .eq("household_id", householdId);
    })
  );

  return NextResponse.json({ configured: true, results });
}
