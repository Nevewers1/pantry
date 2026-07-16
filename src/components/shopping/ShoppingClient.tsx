"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { STORES, type ShoppingItem, type StoreTag } from "@/lib/types";
import { ArrowLeftIcon, CheckIcon, PlusIcon } from "@/components/icons";

function mondayOf(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [budget, setBudget] = useState<string>(
    budgetCap != null ? String(budgetCap) : ""
  );
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");

  const patch = (id: string, p: Partial<ShoppingItem>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const total = items.reduce((s, i) => s + (i.est_price ?? 0), 0);
  const cap = parseFloat(budget);
  const remaining = Number.isFinite(cap) ? cap - total : null;

  async function build() {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/shopping/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_start: mondayOf(new Date()) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Couldn't build the list.");
      else setItems((data.items ?? []) as ShoppingItem[]);
    } catch {
      setError("Something went wrong.");
    } finally {
      setBuilding(false);
    }
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
        {/* Budget */}
        <div className="mb-4 rounded-card border border-border bg-surface p-4">
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
            <p className="text-[15px] font-medium text-ink">Your list is empty</p>
            <p className="mt-1 text-sm text-muted">
              Tap &quot;Build from plan&quot; to turn this week&apos;s plan into a
              shopping list, or add items by hand.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.store.value}>
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
                  {g.store.label}
                </h2>
                <ul className="overflow-hidden rounded-card border border-border bg-surface">
                  {g.items.map((it, idx) => (
                    <li
                      key={it.id}
                      className={`flex items-center gap-3 px-3 py-3 ${
                        idx === g.items.length - 1 ? "" : "border-b border-border"
                      }`}
                    >
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
                              updateField(it.id, {
                                store: e.target.value as StoreTag,
                              })
                            }
                            className="rounded border border-border bg-surface px-1 text-[12px] text-ink"
                          >
                            {STORES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
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
