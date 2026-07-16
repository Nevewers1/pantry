"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LUNCH_COMPONENTS,
  type LunchboxItem,
  type LunchComponent,
  type PantrySlim,
} from "@/lib/types";
import { namesMatch } from "@/lib/normalize";
import { CheckIcon, PlusIcon, XIcon } from "@/components/icons";

const inputCls =
  "min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-brand";

export function LunchboxSheet({
  date,
  householdId,
  userId,
  supabase,
  childNames,
  pantry,
  onClose,
}: {
  date: string | null;
  householdId: string;
  userId: string;
  supabase: SupabaseClient;
  childNames: [string, string];
  pantry: PantrySlim[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<LunchboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packedMsg, setPackedMsg] = useState<string | null>(null);

  const load = useCallback(
    async (d: string) => {
      const { data } = await supabase
        .from("lunchbox_items")
        .select("*")
        .eq("date", d)
        .order("created_at", { ascending: true });
      setItems(
        (data ?? []).map((r) => ({
          id: r.id as string,
          date: r.date as string,
          child_slot: (r.child_slot as 1 | 2) ?? 1,
          component: r.component as LunchComponent,
          name: (r.name as string) ?? "",
          quantity: (r.quantity as number | null) ?? 1,
          unit: (r.unit as string | null) ?? null,
          pantry_item_id: (r.pantry_item_id as string | null) ?? null,
        }))
      );
    },
    [supabase]
  );

  useEffect(() => {
    if (date) {
      setError(null);
      setPackedMsg(null);
      load(date);
    }
  }, [date, load]);

  if (!date) return null;

  const update = (idx: number, patch: Partial<LunchboxItem>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const remove = (idx: number) =>
    setItems((arr) => arr.filter((_, i) => i !== idx));
  const add = (slot: 1 | 2, component: LunchComponent) =>
    setItems((arr) => [
      ...arr,
      { date, child_slot: slot, component, name: "", quantity: 1, unit: null, pantry_item_id: null },
    ]);

  const pantryIdFor = (name: string): string | null =>
    pantry.find((p) => namesMatch(name, p.name))?.id ?? null;

  async function save() {
    setBusy(true);
    setError(null);
    const clean = items.filter((i) => i.name.trim());
    // Replace all items for this date.
    await supabase.from("lunchbox_items").delete().eq("date", date);
    if (clean.length) {
      const rows = clean.map((i) => ({
        household_id: householdId,
        date,
        child_slot: i.child_slot,
        component: i.component,
        name: i.name.trim(),
        quantity: i.quantity ?? 1,
        unit: i.unit?.trim() || null,
        pantry_item_id: pantryIdFor(i.name),
      }));
      const { error: insErr } = await supabase.from("lunchbox_items").insert(rows);
      if (insErr) {
        setBusy(false);
        setError(insErr.message);
        return;
      }
    }
    setBusy(false);
    onClose();
  }

  // Deduct linked pantry items when the lunchboxes are packed.
  async function markPacked() {
    setBusy(true);
    setError(null);
    const sums = new Map<string, number>();
    items
      .filter((i) => i.name.trim())
      .forEach((i) => {
        const pid = pantryIdFor(i.name);
        if (pid) sums.set(pid, (sums.get(pid) ?? 0) + (i.quantity ?? 1));
      });

    if (sums.size > 0) {
      const ids = [...sums.keys()];
      const { data: rows } = await supabase
        .from("pantry_items")
        .select("id, quantity")
        .in("id", ids);
      await Promise.all(
        (rows ?? []).map((r) => {
          const dec = sums.get(r.id as string) ?? 0;
          const next = Math.max(0, Math.round(((r.quantity as number) - dec) * 100) / 100);
          return supabase
            .from("pantry_items")
            .update({ quantity: next, updated_by: userId })
            .eq("id", r.id);
        })
      );
      await supabase.from("consumption_log").insert({
        household_id: householdId,
        note: `Lunchboxes packed (${date})`,
        logged_by: userId,
      });
    }
    setBusy(false);
    setPackedMsg(
      sums.size > 0
        ? `Packed — ${sums.size} pantry item${sums.size === 1 ? "" : "s"} deducted`
        : "Nothing linked to the pantry to deduct"
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lunchboxes"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
            Lunchboxes
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {([1, 2] as const).map((slot) => (
            <section key={slot}>
              <h3 className="mb-2 text-[15px] font-semibold text-ink">
                {childNames[slot - 1]}
              </h3>
              <div className="space-y-3">
                {LUNCH_COMPONENTS.map((c) => {
                  const rows = items
                    .map((it, idx) => ({ it, idx }))
                    .filter(
                      ({ it }) => it.child_slot === slot && it.component === c.value
                    );
                  return (
                    <div
                      key={c.value}
                      className="rounded-xl border border-border bg-surface p-3"
                    >
                      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">
                        {c.label}
                      </p>
                      <div className="space-y-2">
                        {rows.map(({ it, idx }) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={it.name}
                              onChange={(e) => update(idx, { name: e.target.value })}
                              list="lb-pantry"
                              placeholder="Item (e.g. apple)"
                              className={inputCls}
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={it.quantity ?? ""}
                              onChange={(e) =>
                                update(idx, {
                                  quantity: e.target.value
                                    ? parseFloat(e.target.value)
                                    : null,
                                })
                              }
                              aria-label="Quantity"
                              className={`${inputCls} w-16`}
                            />
                            <button
                              type="button"
                              onClick={() => remove(idx)}
                              aria-label="Remove"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-danger"
                            >
                              <XIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => add(slot, c.value)}
                          className="flex min-h-[38px] items-center gap-1.5 text-[13px] font-medium text-brand"
                        >
                          <PlusIcon className="h-4 w-4" />
                          Add item
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <datalist id="lb-pantry">
            {pantry.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          <p className="text-[12px] text-faint">
            Items matching your pantry (e.g. &quot;apple&quot;) will deduct from
            stock when you pack, and anything short will show on your shopping list.
          </p>
        </div>

        <div className="border-t border-border p-5">
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          {packedMsg && (
            <p className="mb-2 flex items-center gap-1.5 text-sm text-brand">
              <CheckIcon className="h-4 w-4" />
              {packedMsg}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={markPacked}
              disabled={busy}
              className="min-h-tap flex-1 rounded-xl border border-border bg-surface text-[14px] font-medium text-ink hover:bg-bg disabled:opacity-50"
            >
              Mark packed
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="min-h-tap flex-1 rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save lunchboxes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
