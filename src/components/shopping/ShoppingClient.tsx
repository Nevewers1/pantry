"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  STORES,
  type ProductOption,
  type ShoppingItem,
  type StoreTag,
} from "@/lib/types";
import { namesMatch } from "@/lib/normalize";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/icons";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return ymd(x);
}

// Deep links into each retailer's own product search for an item, so the user
// can open it and tap Add on the store's site (no scraping, breaks no rules).
function searchUrls(term: string): { woolies: string; coles: string } {
  const q = encodeURIComponent(term.trim());
  return {
    woolies: `https://www.woolworths.com.au/shop/search/products?searchTerm=${q}`,
    coles: `https://www.coles.com.au/search?q=${q}`,
  };
}

// This week's Monday plus the next few, for the "shopping for" picker.
function buildWeekOptions(): { ws: string; label: string }[] {
  const base = new Date(`${mondayOf(new Date())}T00:00:00`);
  const opts: { ws: string; label: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + 7 * i);
    const date = d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const name = i === 0 ? "This week" : i === 1 ? "Next week" : "Week of";
    opts.push({ ws: ymd(d), label: `${name} · ${date}` });
  }
  return opts;
}

export function ShoppingClient({
  householdId,
  userId,
  initialItems,
  budgetCap,
}: {
  householdId: string;
  userId: string;
  initialItems: ShoppingItem[];
  budgetCap: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const weekOptions = useMemo(() => buildWeekOptions(), []);
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [weekStart, setWeekStart] = useState<string>(weekOptions[0].ws);
  const [budget, setBudget] = useState<string>(
    budgetCap != null ? String(budgetCap) : ""
  );
  const [building, setBuilding] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [priceMsg, setPriceMsg] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, ProductOption[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");

  // Load the list for whichever week is selected: items from that week's plan,
  // plus any manually-added items (which aren't tied to a week).
  const loadWeek = useCallback(
    async (ws: string) => {
      const { data: mp } = await supabase
        .from("meal_plans")
        .select("id")
        .eq("household_id", householdId)
        .eq("week_start_date", ws)
        .maybeSingle();
      const planId = (mp?.id as string) ?? null;

      let query = supabase
        .from("shopping_list_items")
        .select("*")
        .eq("household_id", householdId);
      query = planId
        ? query.or(`meal_plan_id.eq.${planId},meal_plan_id.is.null`)
        : query.is("meal_plan_id", null);

      const { data } = await query
        .order("category", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      const rows = (data ?? []) as ShoppingItem[];
      setItems(rows);
      return rows;
    },
    [supabase, householdId]
  );

  // Load cached product options for a set of items (for savings + store prices).
  const refreshOffers = useCallback(
    async (rows: ShoppingItem[]) => {
      if (!rows.length) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const { data } = await supabase
        .from("price_history")
        .select("item_name, store, price, title, image_url, source_name, seen_on")
        .gte("seen_on", ymd(cutoff));
      const all = data ?? [];
      const map: Record<string, ProductOption[]> = {};
      for (const it of rows) {
        const seen = new Set<string>();
        const opts: ProductOption[] = [];
        for (const r of all
          .filter(
            (r) =>
              namesMatch(it.name, r.item_name as string) &&
              typeof r.title === "string" &&
              (r.title as string).trim().length > 0 &&
              typeof r.source_name === "string" &&
              (r.source_name as string).trim().length > 0
          )
          .sort((a, b) => (a.price as number) - (b.price as number))) {
          const title = r.title as string;
          const source = r.source_name as string;
          const key = `${source.toLowerCase()}|${title.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          opts.push({
            store: r.store as StoreTag,
            price: r.price as number,
            title,
            image: (r.image_url as string | null) ?? null,
            source,
          });
        }
        if (opts.length) map[it.id] = opts;
      }
      setProducts((prev) => ({ ...prev, ...map }));
    },
    [supabase]
  );

  useEffect(() => {
    loadWeek(weekStart).then((rows) => refreshOffers(rows));
  }, [weekStart, loadWeek, refreshOffers]);

  const patch = (id: string, p: Partial<ShoppingItem>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const total = items.reduce((s, i) => s + (i.est_price ?? 0), 0);
  const cap = parseFloat(budget);
  const remaining = Number.isFinite(cap) ? cap - total : null;

  // Potential savings from splitting vs. buying the whole list at one supermarket.
  const savings = useMemo(() => {
    const active = items.filter((i) => !i.is_checked);
    const supermarkets = ["coles", "woolies", "aldi"] as const;
    let current = 0;
    const baseline: Record<(typeof supermarkets)[number], number> = {
      coles: 0,
      woolies: 0,
      aldi: 0,
    };
    const coverage: Record<(typeof supermarkets)[number], number> = {
      coles: 0,
      woolies: 0,
      aldi: 0,
    };
    for (const it of active) {
      const price = it.est_price ?? 0;
      current += price;
      const opts = products[it.id] ?? [];
      for (const s of supermarkets) {
        const atS = opts.filter((o) => o.store === s).map((o) => o.price);
        if (atS.length) {
          baseline[s] += Math.min(...atS);
          coverage[s] += 1;
        } else {
          baseline[s] += price; // not sold there → you'd buy it elsewhere anyway
        }
      }
    }
    const candidates = supermarkets.filter((s) => coverage[s] >= 2);
    if (!candidates.length) return { amount: 0, store: null as StoreTag | null };
    let best = Infinity;
    let bestStore: StoreTag | null = null;
    for (const s of candidates) {
      if (baseline[s] < best) {
        best = baseline[s];
        bestStore = s;
      }
    }
    return { amount: Math.max(0, best - current), store: bestStore };
  }, [items, products]);

  async function build() {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/shopping/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't build the list.");
      } else {
        const rows = await loadWeek(weekStart);
        // Auto-fetch prices for the freshly built list.
        void priceItems(rows);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setBuilding(false);
    }
  }

  // Fetch indicative prices (SerpApi / Google Shopping) for a set of items,
  // fill in the cheapest, and remember each store's price for switching.
  async function priceItems(list: ShoppingItem[]) {
    const targets = list
      .filter((i) => !i.is_checked)
      .map((i) => ({ id: i.id, name: i.name }));
    if (!targets.length) return;
    setPricing(true);
    setPriceMsg(null);
    try {
      const res = await fetch("/api/shopping/prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: targets }),
      });
      const data = await res.json();
      if (data?.configured === false) {
        setPriceMsg(
          "Add a SERPAPI_API_KEY to enable automatic prices (still editable by hand)."
        );
        return;
      }
      const results = (data?.results ?? {}) as Record<
        string,
        { products: ProductOption[]; cheapest: ProductOption | null }
      >;
      setProducts((prev) => {
        const next = { ...prev };
        for (const [id, r] of Object.entries(results)) next[id] = r.products;
        return next;
      });
      setItems((arr) =>
        arr.map((it) => {
          const r = results[it.id];
          if (r && r.cheapest) {
            return {
              ...it,
              est_price: r.cheapest.price,
              store: r.cheapest.store,
              product_name: r.cheapest.title,
              product_image: r.cheapest.image,
            };
          }
          return it;
        })
      );
      const priced = Object.values(results).filter((r) => r.cheapest).length;
      setPriceMsg(
        priced > 0
          ? `Priced ${priced} item${priced === 1 ? "" : "s"} — indicative, from Google Shopping.`
          : "No prices found for these items."
      );
    } catch {
      setPriceMsg("Couldn't fetch prices just now.");
    } finally {
      setPricing(false);
    }
  }

  // Cheapest price per store, for the store dropdown labels.
  function storePrices(id: string): Partial<Record<StoreTag, number>> {
    const out: Partial<Record<StoreTag, number>> = {};
    for (const p of products[id] ?? []) {
      if (out[p.store] == null || p.price < (out[p.store] as number))
        out[p.store] = p.price;
    }
    return out;
  }

  // Switch an item to a different store, re-pricing to that store's cheapest product.
  async function switchStore(it: ShoppingItem, store: StoreTag) {
    const match = (products[it.id] ?? [])
      .filter((p) => p.store === store)
      .sort((a, b) => a.price - b.price)[0];
    const upd: Partial<ShoppingItem> = match
      ? {
          store,
          est_price: match.price,
          product_name: match.title,
          product_image: match.image,
        }
      : { store };
    patch(it.id, upd);
    await supabase.from("shopping_list_items").update(upd).eq("id", it.id);
  }

  // Pick a specific product for an item.
  async function selectProduct(it: ShoppingItem, p: ProductOption) {
    const upd: Partial<ShoppingItem> = {
      store: p.store,
      est_price: p.price,
      product_name: p.title,
      product_image: p.image,
      product_source: p.source || null,
    };
    patch(it.id, upd);
    setOpenId(null);
    await supabase.from("shopping_list_items").update(upd).eq("id", it.id);
  }

  // Open the product picker; if we have no options cached in memory, load any
  // recent ones from price_history so re-opening after a reload still works.
  async function openPicker(it: ShoppingItem) {
    if (openId === it.id) {
      setOpenId(null);
      return;
    }
    setOpenId(it.id);
    setShowAll(false);
    if ((products[it.id] ?? []).length) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const { data } = await supabase
      .from("price_history")
      .select("item_name, store, price, title, image_url, source_name, seen_on")
      .gte("seen_on", ymd(cutoff));
    const rows = (data ?? []).filter(
      (r) =>
        namesMatch(it.name, r.item_name as string) &&
        typeof r.title === "string" &&
        (r.title as string).trim().length > 0 &&
        typeof r.source_name === "string" &&
        (r.source_name as string).trim().length > 0
    );
    const seen = new Set<string>();
    const opts: ProductOption[] = [];
    for (const r of rows.sort((a, b) => (a.price as number) - (b.price as number))) {
      const title = (r.title as string | null) ?? it.name;
      const source = (r.source_name as string | null) ?? "";
      const key = `${source.toLowerCase()}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        store: r.store as StoreTag,
        price: r.price as number,
        title,
        image: (r.image_url as string | null) ?? null,
        source,
      });
    }
    if (opts.length) setProducts((prev) => ({ ...prev, [it.id]: opts }));
  }

  async function saveBudget(value: string) {
    setBudget(value);
    const num = value ? parseFloat(value) : null;
    await supabase
      .from("households")
      .update({ weekly_budget_cap: Number.isFinite(num as number) ? num : null })
      .eq("id", householdId);
  }

  async function addToPantry(it: ShoppingItem) {
    const { data: existing } = await supabase
      .from("pantry_items")
      .select("id, quantity")
      .ilike("name", it.name)
      .limit(1);
    if (existing && existing.length) {
      await supabase
        .from("pantry_items")
        .update({
          quantity: ((existing[0].quantity as number) ?? 0) + (it.quantity ?? 1),
          updated_by: userId,
        })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("pantry_items").insert({
        household_id: householdId,
        name: it.name,
        quantity: it.quantity ?? 1,
        unit: it.unit,
        category: it.category,
        location: "pantry",
        updated_by: userId,
      });
    }
  }

  async function toggleCheck(it: ShoppingItem) {
    const now = !it.is_checked;
    patch(it.id, { is_checked: now });
    await supabase
      .from("shopping_list_items")
      .update({ is_checked: now })
      .eq("id", it.id);

    // First time it's checked → add to pantry + remember the price.
    if (now && !it.added_to_pantry) {
      await addToPantry(it);
      patch(it.id, { added_to_pantry: true });
      await supabase
        .from("shopping_list_items")
        .update({ added_to_pantry: true })
        .eq("id", it.id);
      if (it.est_price != null && it.store !== "any") {
        await supabase.from("price_history").insert({
          household_id: householdId,
          item_name: it.name,
          store: it.store,
          price: it.est_price,
        });
      }
    }
  }

  async function updateField(id: string, p: Partial<ShoppingItem>) {
    patch(id, p);
    await supabase.from("shopping_list_items").update(p).eq("id", id);
  }

  async function removeItem(id: string) {
    setItems((arr) => arr.filter((i) => i.id !== id));
    await supabase.from("shopping_list_items").delete().eq("id", id);
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setNewItem("");
    const { data } = await supabase
      .from("shopping_list_items")
      .insert({
        household_id: householdId,
        name,
        quantity: 1,
        store: "any",
        is_checked: false,
        added_to_pantry: false,
      })
      .select()
      .single();
    if (data) setItems((arr) => [...arr, data as ShoppingItem]);
  }

  const groups = STORES.map((s) => ({
    store: s,
    items: items
      .filter((i) => i.store === s.value)
      .sort((a, b) => Number(a.is_checked) - Number(b.is_checked)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to home"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <h1 className="text-[17px] font-semibold tracking-tightish text-ink">
              Shopping list
            </h1>
          </div>
          <button
            onClick={build}
            disabled={building}
            className="min-h-tap rounded-xl bg-brand px-3.5 text-[14px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {building ? "Building…" : "Build from plan"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-24 pt-4">
        {/* Which week to shop for */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
          <label htmlFor="week" className="text-[14px] font-medium text-ink">
            Shopping for
          </label>
          <select
            id="week"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="min-h-[40px] rounded-lg border border-border bg-surface px-2 text-[14px] font-medium text-ink focus:border-brand"
          >
            {weekOptions.map((o) => (
              <option key={o.ws} value={o.ws}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Budget */}
        <div className="mb-4 rounded-card border border-border bg-surface shadow-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="budget" className="text-[14px] text-ink">
              Weekly budget
            </label>
            <div className="flex items-center gap-1 text-ink">
              <span className="text-muted">$</span>
              <input
                id="budget"
                type="number"
                inputMode="decimal"
                min="0"
                value={budget}
                onChange={(e) => saveBudget(e.target.value)}
                placeholder="e.g. 250"
                className="min-h-[40px] w-24 rounded-lg border border-border bg-surface px-2 text-right text-[15px] text-ink focus:border-brand"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[14px]">
            <span className="text-muted">Estimated total</span>
            <span className="font-semibold text-ink">${total.toFixed(2)}</span>
          </div>
          {savings.amount >= 0.5 && savings.store && (
            <div className="mt-1 flex items-center justify-between text-[13px]">
              <span className="text-muted">
                Potential savings vs all at{" "}
                {STORES.find((s) => s.value === savings.store)?.label}
              </span>
              <span className="font-semibold text-danger">
                ${savings.amount.toFixed(2)}
              </span>
            </div>
          )}
          {remaining !== null && (
            <div className="mt-1 flex items-center justify-between text-[13px]">
              <span className="text-muted">
                {remaining >= 0 ? "Under budget by" : "Over budget by"}
              </span>
              <span
                className={remaining >= 0 ? "text-brand" : "text-danger"}
              >
                ${Math.abs(remaining).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

        {/* Auto-pricing */}
        {items.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-soft">
            <p className="text-[12px] text-muted">
              {pricing
                ? "Fetching prices…"
                : priceMsg ?? "Indicative prices (Google Shopping). Tap a product to see options & pick the right one."}
            </p>
            <button
              onClick={() => priceItems(items)}
              disabled={pricing}
              className="min-h-[36px] shrink-0 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg disabled:opacity-50"
            >
              {pricing ? "…" : "Update prices"}
            </button>
          </div>
        )}

        {/* Add manual */}
        <form onSubmit={addManual} className="mb-4 flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add an item…"
            className="min-h-tap flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand"
          />
          <button
            type="submit"
            className="flex min-h-tap w-12 items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-bg"
            aria-label="Add item"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </form>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-ink">
              Nothing for this week yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Pick a week above and tap &quot;Build from plan&quot; to turn its
              plan into a shopping list, or add items by hand.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-[12px] text-faint">
              Tap <span className="font-medium text-brand">Woolies ↗</span> or{" "}
              <span className="font-medium text-brand">Coles ↗</span> on an item to
              open its search on that store&apos;s site and add it to your cart there.
            </p>
            {groups.map((g) => (
              <section key={g.store.value}>
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
                  {g.store.label}
                </h2>
                <ul className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
                  {g.items.map((it, idx) => (
                    <li
                      key={it.id}
                      className={
                        idx === g.items.length - 1 ? "" : "border-b border-border"
                      }
                    >
                      <div className="flex items-center gap-3 px-3 py-3">
                        <button
                          onClick={() => toggleCheck(it)}
                          aria-label={it.is_checked ? "Uncheck" : "Check off"}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                            it.is_checked
                              ? "border-brand bg-brand text-white"
                              : "border-border text-transparent"
                          }`}
                        >
                          <CheckIcon className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-[15px] ${
                              it.is_checked
                                ? "text-faint line-through"
                                : "text-ink"
                            }`}
                          >
                            {it.name}
                          </p>
                          {/* Which product this price is for */}
                          <button
                            onClick={() => openPicker(it)}
                            className="mt-0.5 flex w-full items-center gap-1.5 text-left"
                          >
                            {it.product_image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={it.product_image}
                                alt=""
                                className="h-5 w-5 shrink-0 rounded object-cover"
                              />
                            )}
                            <span className="truncate text-[12px] text-muted">
                              {it.product_name ?? "Choose product"}
                            </span>
                            <ChevronRightIcon
                              className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${
                                openId === it.id ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                            {it.quantity != null && (
                              <span>
                                {it.quantity}
                                {it.unit ? ` ${it.unit}` : ""}
                              </span>
                            )}
                            <select
                              value={it.store}
                              onChange={(e) =>
                                switchStore(it, e.target.value as StoreTag)
                              }
                              className="rounded border border-border bg-surface px-1 text-[12px] text-ink"
                            >
                              {STORES.map((s) => {
                                const sp = storePrices(it.id)[s.value];
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                    {sp != null ? ` · $${sp.toFixed(2)}` : ""}
                                  </option>
                                );
                              })}
                            </select>
                            <a
                              href={searchUrls(it.name).woolies}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded px-1.5 py-0.5 font-medium text-brand hover:underline"
                            >
                              Woolies ↗
                            </a>
                            <a
                              href={searchUrls(it.name).coles}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded px-1.5 py-0.5 font-medium text-brand hover:underline"
                            >
                              Coles ↗
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-muted">
                          <span>$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={it.est_price ?? ""}
                            onChange={(e) =>
                              updateField(it.id, {
                                est_price: e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="—"
                            className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-right text-[14px] text-ink focus:border-brand"
                          />
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          aria-label="Remove"
                          className="text-[18px] leading-none text-faint hover:text-danger"
                        >
                          ×
                        </button>
                      </div>

                      {/* Product picker */}
                      {openId === it.id && (
                        <div className="border-t border-border bg-bg px-3 py-2">
                          {(products[it.id] ?? []).length === 0 ? (
                            <p className="py-2 text-[12px] text-faint">
                              No product options yet — tap “Update prices”.
                            </p>
                          ) : (
                            (() => {
                              const list = products[it.id] ?? [];
                              const shown = showAll ? list : list.slice(0, 8);
                              return (
                                <>
                                  <ul className="space-y-1">
                                    {shown.map((p, pi) => {
                                      const chosen =
                                        it.product_name === p.title &&
                                        (it.product_source ?? "") === p.source;
                                      const seller =
                                        p.source ||
                                        STORES.find((s) => s.value === p.store)
                                          ?.label ||
                                        p.store;
                                      return (
                                        <li key={pi}>
                                          <button
                                            onClick={() => selectProduct(it, p)}
                                            className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                                              chosen
                                                ? "border-brand-soft bg-brand-tint"
                                                : "border-border bg-surface hover:bg-bg"
                                            }`}
                                          >
                                            {p.image ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                src={p.image}
                                                alt=""
                                                className="h-8 w-8 shrink-0 rounded object-cover"
                                              />
                                            ) : (
                                              <span className="h-8 w-8 shrink-0 rounded bg-border" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-[13px] text-ink">
                                                {p.title}
                                              </span>
                                              <span className="block truncate text-[11px] text-muted">
                                                {seller}
                                              </span>
                                            </span>
                                            <span className="shrink-0 text-[13px] font-semibold text-ink">
                                              ${p.price.toFixed(2)}
                                            </span>
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {list.length > 8 && !showAll && (
                                    <button
                                      onClick={() => setShowAll(true)}
                                      className="mt-1.5 w-full rounded-lg border border-border bg-surface py-1.5 text-[12px] font-medium text-brand hover:bg-bg"
                                    >
                                      Show more ({list.length - 8} more)
                                    </button>
                                  )}
                                </>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-center text-[12px] text-faint">
              Checking an item adds it to your pantry and remembers its price for
              next time.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
