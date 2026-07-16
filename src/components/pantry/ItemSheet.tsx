"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMON_UNITS,
  LOCATIONS,
  type PantryItem,
  type StorageLocation,
} from "@/lib/types";
import { TrashIcon, XIcon } from "@/components/icons";
import { estimateShelfLifeDays, addDaysISO } from "@/lib/shelfLife";

type FormState = {
  name: string;
  quantity: string;
  unit: string;
  location: StorageLocation;
  category: string;
  expiry_date: string;
  min_threshold: string;
};

function toForm(item: PantryItem | null): FormState {
  return {
    name: item?.name ?? "",
    quantity: item ? String(item.quantity) : "1",
    unit: item?.unit ?? "",
    location: item?.location ?? "pantry",
    category: item?.category ?? "",
    expiry_date: item?.expiry_date ?? "",
    min_threshold: item?.min_threshold != null ? String(item.min_threshold) : "",
  };
}

const fieldClass =
  "min-h-tap w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand";
const labelClass = "text-[13px] font-medium text-ink";

export function ItemSheet({
  open,
  item,
  householdId,
  userId,
  supabase,
  nameSuggestions,
  categorySuggestions,
  onClose,
  onUpsert,
  onRemove,
}: {
  open: boolean;
  item: PantryItem | null;
  householdId: string;
  userId: string;
  supabase: SupabaseClient;
  nameSuggestions: string[];
  categorySuggestions: string[];
  onClose: () => void;
  onUpsert: (item: PantryItem) => void;
  onRemove: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState>(toForm(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the sheet opens or the target item changes.
  useEffect(() => {
    if (open) {
      setForm(toForm(item));
      setError(null);
    }
  }, [open, item]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("Please give the item a name.");
      return;
    }
    const qty = parseFloat(form.quantity);
    if (Number.isNaN(qty) || qty < 0) {
      setError("Quantity must be a number.");
      return;
    }

    // A date in the sheet is one the person owns. If a brand-new item is left
    // blank, fill in an instant shelf-life estimate (marked approximate) so it
    // still shows a "check me" date without any typing.
    let expiry_date = form.expiry_date || null;
    let expiry_estimated = false;
    if (!item && !expiry_date) {
      const days = estimateShelfLifeDays(name, form.location);
      if (days != null) {
        expiry_date = addDaysISO(days);
        expiry_estimated = true;
      }
    }

    const payload = {
      household_id: householdId,
      name,
      quantity: qty,
      unit: form.unit.trim() || null,
      location: form.location,
      category: form.category.trim() || null,
      expiry_date,
      expiry_estimated,
      min_threshold: form.min_threshold ? parseFloat(form.min_threshold) : null,
      updated_by: userId,
    };

    setBusy(true);
    if (item) {
      const { data, error } = await supabase
        .from("pantry_items")
        .update(payload)
        .eq("id", item.id)
        .select()
        .single();
      setBusy(false);
      if (error) return setError(error.message);
      onUpsert(data as PantryItem);
    } else {
      const { data, error } = await supabase
        .from("pantry_items")
        .insert(payload)
        .select()
        .single();
      setBusy(false);
      if (error) return setError(error.message);
      onUpsert(data as PantryItem);
    }
    onClose();
  }

  async function del() {
    if (!item) return;
    if (!confirm(`Remove ${item.name} from the pantry?`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("id", item.id);
    setBusy(false);
    if (error) return setError(error.message);
    onRemove(item.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Edit item" : "Add item"}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-card bg-bg p-5 shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
            {item ? "Edit item" : "Add item"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className={labelClass}>
              Item
            </label>
            <input
              id="name"
              list="name-suggestions"
              autoFocus
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Cheddar cheese"
              className={fieldClass}
            />
            <datalist id="name-suggestions">
              {nameSuggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="quantity" className={labelClass}>
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="unit" className={labelClass}>
                Unit
              </label>
              <input
                id="unit"
                list="unit-suggestions"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="e.g. ea, g, pack"
                className={fieldClass}
              />
              <datalist id="unit-suggestions">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="location" className={labelClass}>
              Location
            </label>
            <select
              id="location"
              value={form.location}
              onChange={(e) =>
                set("location", e.target.value as StorageLocation)
              }
              className={fieldClass}
            >
              {LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="category" className={labelClass}>
                Category <span className="text-faint">(optional)</span>
              </label>
              <input
                id="category"
                list="category-suggestions"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="e.g. Dairy"
                className={fieldClass}
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="expiry" className={labelClass}>
                Expiry <span className="text-faint">(optional)</span>
              </label>
              <input
                id="expiry"
                type="date"
                value={form.expiry_date}
                onChange={(e) => set("expiry_date", e.target.value)}
                className={fieldClass}
              />
              {item?.expiry_estimated && (
                <p className="text-[11px] text-faint">
                  Estimated — adjust if it&apos;ll keep longer.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="threshold" className={labelClass}>
              Warn me when it drops to{" "}
              <span className="text-faint">(optional)</span>
            </label>
            <input
              id="threshold"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.min_threshold}
              onChange={(e) => set("min_threshold", e.target.value)}
              placeholder="e.g. 1 — flags it as running low"
              className={fieldClass}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="mt-1 flex items-center gap-3">
            {item && (
              <button
                type="button"
                onClick={del}
                disabled={busy}
                aria-label="Remove item"
                className="flex min-h-tap w-12 shrink-0 items-center justify-center rounded-xl border border-border text-danger hover:bg-danger-tint disabled:opacity-50"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="min-h-tap flex-1 rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? "Saving…" : item ? "Save changes" : "Add to pantry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
