"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOCATIONS,
  type DetectedItem,
  type PantryItem,
  type StorageLocation,
} from "@/lib/types";
import { CameraIcon, XIcon } from "@/components/icons";

const inputClass =
  "min-h-[42px] w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-brand";

export function ScanReview({
  items,
  householdId,
  userId,
  supabase,
  onClose,
  onAdded,
}: {
  items: DetectedItem[] | null;
  householdId: string;
  userId: string;
  supabase: SupabaseClient;
  onClose: () => void;
  onAdded: (added: PantryItem[]) => void;
}) {
  const [rows, setRows] = useState<DetectedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items) {
      setRows(items);
      setError(null);
    }
  }, [items]);

  if (!items) return null;

  const update = (i: number, patch: Partial<DetectedItem>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) =>
    setRows((r) => r.filter((_, idx) => idx !== i));

  async function addAll() {
    const valid = rows.filter((r) => r.name.trim());
    if (valid.length === 0) {
      onClose();
      return;
    }
    const payload = valid.map((r) => ({
      household_id: householdId,
      name: r.name.trim(),
      quantity: Number.isFinite(r.quantity) && r.quantity > 0 ? r.quantity : 1,
      unit: r.unit.trim() || null,
      category: r.category.trim() || null,
      location: r.location,
      updated_by: userId,
    }));

    setBusy(true);
    const { data, error } = await supabase
      .from("pantry_items")
      .insert(payload)
      .select();
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    onAdded((data ?? []) as PantryItem[]);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review scanned items"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <CameraIcon className="h-5 w-5 text-brand" />
            <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
              {rows.length} {rows.length === 1 ? "item" : "items"} spotted
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cancel"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="px-5 pt-3 text-[13px] text-muted">
          Fix anything that&apos;s off and remove what you don&apos;t want.
          Nothing is saved until you tap Add.
        </p>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              Nothing left to add.
            </p>
          )}
          {rows.map((row, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Item name"
                  aria-label="Item name"
                  className={`${inputClass} font-medium`}
                />
                <button
                  onClick={() => removeRow(i)}
                  aria-label={`Remove ${row.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-danger"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-[4rem_4rem_1fr] gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={row.quantity}
                  onChange={(e) =>
                    update(i, { quantity: parseFloat(e.target.value) })
                  }
                  aria-label="Quantity"
                  className={inputClass}
                />
                <input
                  value={row.unit}
                  onChange={(e) => update(i, { unit: e.target.value })}
                  placeholder="unit"
                  aria-label="Unit"
                  className={inputClass}
                />
                <select
                  value={row.location}
                  onChange={(e) =>
                    update(i, { location: e.target.value as StorageLocation })
                  }
                  aria-label="Location"
                  className={inputClass}
                >
                  {LOCATIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border p-5">
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <button
            onClick={addAll}
            disabled={busy || rows.length === 0}
            className="min-h-tap w-full rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy
              ? "Adding…"
              : `Add ${rows.length} ${
                  rows.length === 1 ? "item" : "items"
                } to pantry`}
          </button>
        </div>
      </div>
    </div>
  );
}
