"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  LOCATIONS,
  type DetectedItem,
  type PantryItem,
  type StorageLocation,
} from "@/lib/types";
import { expiryLabel, formatQty } from "@/lib/format";
import { fileToResizedBase64 } from "@/lib/image";
import { estimateDaysFor } from "@/lib/estimateClient";
import { addDaysISO } from "@/lib/shelfLife";
import {
  ArrowLeftIcon,
  BoxIcon,
  CameraIcon,
  ClockIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/icons";
import { ItemSheet } from "@/components/pantry/ItemSheet";
import { ScanReview } from "@/components/pantry/ScanReview";

type SortKey = "expiry" | "name" | "updated";
type LocationFilter = "all" | StorageLocation;

export function PantryClient({
  initialItems,
  householdId,
  userId,
  initialSearch = "",
}: {
  initialItems: PantryItem[];
  householdId: string;
  userId: string;
  initialSearch?: string;
}) {
  const [items, setItems] = useState<PantryItem[]>(initialItems);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [sort, setSort] = useState<SortKey>("expiry");
  const [search, setSearch] = useState(initialSearch);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);

  // Photo scan (Step 3)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedItem[] | null>(null);

  // Shelf-life estimation
  const [estimating, setEstimating] = useState(false);
  const [estMsg, setEstMsg] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const upsert = useCallback((it: PantryItem) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === it.id);
      if (i === -1) return [...prev, it];
      const next = [...prev];
      next[i] = it;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Live sync: reflect the other partner's edits in real time.
  useEffect(() => {
    const channel = supabase
      .channel(`pantry-${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pantry_items",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            remove((payload.old as { id: string }).id);
          } else {
            upsert(payload.new as PantryItem);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, householdId, upsert, remove]);

  const nameSuggestions = useMemo(
    () => Array.from(new Set(items.map((i) => i.name))).sort(),
    [items]
  );
  const categorySuggestions = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.category).filter(Boolean) as string[])
      ).sort(),
    [items]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (locationFilter === "all" || i.location === locationFilter) &&
        (!q || i.name.toLowerCase().includes(q))
    );

    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "updated")
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      // expiry-first (default): soonest date first, undated items last
      if (!a.expiry_date && !b.expiry_date) return a.name.localeCompare(b.name);
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });
  }, [items, locationFilter, sort, search]);

  async function adjustQty(item: PantryItem, delta: number) {
    const q = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
    upsert({ ...item, quantity: q }); // optimistic
    const { error } = await supabase
      .from("pantry_items")
      .update({ quantity: q, updated_by: userId })
      .eq("id", item.id);
    if (error) upsert(item); // revert on failure; realtime will also correct
  }

  async function clearAll() {
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Remove all ${items.length} items from your pantry? This can't be undone.`
      )
    )
      return;
    const prev = items;
    setItems([]); // optimistic
    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("household_id", householdId);
    if (error) {
      setItems(prev); // revert
      window.alert(`Couldn't clear the pantry: ${error.message}`);
    }
  }

  // Fill in approximate use-by dates for items that don't have one.
  async function estimateExpiries() {
    if (estimating) return;
    const undated = items.filter((i) => !i.expiry_date);
    if (undated.length === 0) return;
    setEstimating(true);
    setEstMsg(null);
    try {
      const map = await estimateDaysFor(
        undated.map((i) => ({ key: i.id, name: i.name, location: i.location }))
      );
      const updates = undated
        .filter((i) => map.has(i.id))
        .map((i) => ({
          id: i.id,
          expiry_date: addDaysISO(map.get(i.id) as number, i.created_at),
        }));

      await Promise.all(
        updates.map((u) =>
          supabase
            .from("pantry_items")
            .update({
              expiry_date: u.expiry_date,
              expiry_estimated: true,
              updated_by: userId,
            })
            .eq("id", u.id)
        )
      );

      setItems((prev) =>
        prev.map((p) => {
          const u = updates.find((x) => x.id === p.id);
          return u
            ? { ...p, expiry_date: u.expiry_date, expiry_estimated: true }
            : p;
        })
      );
      setEstMsg(
        `Added ${updates.length} estimated date${
          updates.length === 1 ? "" : "s"
        }. They show with a ~ — tap any item to adjust.`
      );
    } catch {
      setEstMsg("Couldn't estimate dates just now. Try again in a moment.");
    } finally {
      setEstimating(false);
    }
  }

  async function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setScanError(null);
    setScanning(true);
    try {
      const { base64, mediaType } = await fileToResizedBase64(file);
      const res = await fetch("/api/pantry/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data?.error ?? "Scan failed. Try again.");
        return;
      }
      if (!data.items?.length) {
        setScanError("No items spotted in that photo. Try a clearer shot.");
        return;
      }
      setDetected(data.items as DetectedItem[]);
    } catch {
      setScanError("Couldn't process that image.");
    } finally {
      setScanning(false);
    }
  }

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
              Pantry
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="flex min-h-tap items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-[14px] font-medium text-ink hover:bg-bg disabled:opacity-50"
            >
              <CameraIcon className="h-4 w-4" />
              {scanning ? "Scanning…" : "Scan"}
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
              className="flex min-h-tap items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[14px] font-medium text-white hover:bg-brand-hover"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoChosen}
          className="hidden"
        />
      </header>

      <main className="mx-auto max-w-lg px-5 pb-24 pt-4">
        {scanError && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            {scanError}
          </div>
        )}

        {/* Estimate expiry dates for anything undated */}
        {(() => {
          const undatedCount = items.filter((i) => !i.expiry_date).length;
          if (undatedCount === 0 && !estMsg) return null;
          return (
            <div className="mb-4">
              {undatedCount > 0 && (
                <button
                  onClick={estimateExpiries}
                  disabled={estimating}
                  className="flex w-full items-center justify-between gap-3 rounded-card border border-brand-soft bg-brand-tint px-4 py-3 text-left disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">
                      {estimating
                        ? "Estimating shelf life…"
                        : "Estimate expiry dates"}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {undatedCount} item{undatedCount === 1 ? "" : "s"} with no
                      date — add approximate use-by dates to review.
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
                    <ClockIcon className="h-5 w-5" />
                  </span>
                </button>
              )}
              {estMsg && (
                <p className="mt-2 px-1 text-[13px] text-muted">{estMsg}</p>
              )}
            </div>
          );
        })()}

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the pantry…"
          className="mb-3 min-h-tap w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
        />

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-2">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {[{ value: "all" as const, label: "All" }, ...LOCATIONS].map((f) => (
              <button
                key={f.value}
                onClick={() => setLocationFilter(f.value)}
                className={`min-h-[38px] shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                  locationFilter === f.value
                    ? "bg-brand text-white"
                    : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <label className="sr-only" htmlFor="sort">
              Sort
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-[38px] rounded-xl border border-border bg-surface px-2 text-[13px] font-medium text-ink"
            >
              <option value="expiry">Expiry first</option>
              <option value="name">Name</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
        </div>

        {visible.length === 0 && search.trim() ? (
          <div className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-[15px] font-medium text-ink">
              No items match &ldquo;{search.trim()}&rdquo;
            </p>
            <p className="mt-1 text-sm text-muted">
              You&apos;re out of it, or it&apos;s not tracked yet.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            filtered={locationFilter !== "all" || items.length > 0}
            onAdd={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          />
        ) : (
          <ul className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
            {visible.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                last={idx === visible.length - 1}
                onEdit={() => {
                  setEditing(item);
                  setSheetOpen(true);
                }}
                onDec={() => adjustQty(item, -1)}
                onInc={() => adjustQty(item, +1)}
              />
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={clearAll}
              className="text-[13px] text-faint underline-offset-4 hover:text-danger hover:underline"
            >
              Clear all items
            </button>
          </div>
        )}
      </main>

      <ItemSheet
        open={sheetOpen}
        item={editing}
        householdId={householdId}
        userId={userId}
        supabase={supabase}
        nameSuggestions={nameSuggestions}
        categorySuggestions={categorySuggestions}
        onClose={() => setSheetOpen(false)}
        onUpsert={upsert}
        onRemove={remove}
      />

      <ScanReview
        items={detected}
        householdId={householdId}
        userId={userId}
        supabase={supabase}
        onClose={() => setDetected(null)}
        onAdded={(added) => added.forEach(upsert)}
      />
    </div>
  );
}

function ItemRow({
  item,
  last,
  onEdit,
  onDec,
  onInc,
}: {
  item: PantryItem;
  last: boolean;
  onEdit: () => void;
  onDec: () => void;
  onInc: () => void;
}) {
  const exp = expiryLabel(item.expiry_date);
  const low =
    item.min_threshold != null && item.quantity <= item.min_threshold;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <button
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit ${item.name}`}
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-ink">
            {item.name}
          </span>
          {low && (
            <span className="shrink-0 rounded-full bg-warn-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
              Low
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
          <span>
            {LOCATIONS.find((l) => l.value === item.location)?.label ??
              item.location}
          </span>
          {item.category && <span>· {item.category}</span>}
          {exp && (
            <span
              className={`flex items-center gap-1 ${exp.tone}`}
              title={
                item.expiry_estimated ? "Estimated — tap to adjust" : undefined
              }
            >
              · <span className={`h-1.5 w-1.5 rounded-full ${exp.dot}`} />
              {item.expiry_estimated ? "~" : ""}
              {exp.text}
            </span>
          )}
        </div>
      </button>

      {/* Quantity stepper — one-tap use */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onDec}
          disabled={item.quantity <= 0}
          aria-label={`Use one ${item.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink disabled:opacity-30"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <span className="min-w-[2.5rem] text-center text-[15px] font-medium tabular-nums text-ink">
          {formatQty(item.quantity)}
          {item.unit ? (
            <span className="ml-0.5 text-[12px] font-normal text-muted">
              {item.unit}
            </span>
          ) : null}
        </span>
        <button
          onClick={onInc}
          aria-label={`Add one ${item.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function EmptyState({
  filtered,
  onAdd,
}: {
  filtered: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
        <BoxIcon className="h-6 w-6" />
      </div>
      {filtered ? (
        <>
          <p className="text-[15px] font-medium text-ink">Nothing here</p>
          <p className="mt-1 text-sm text-muted">
            No items in this location yet.
          </p>
        </>
      ) : (
        <>
          <p className="text-[15px] font-medium text-ink">
            Your pantry&apos;s empty
          </p>
          <p className="mt-1 text-sm text-muted">
            Add your first item to start tracking what&apos;s in the house.
          </p>
        </>
      )}
      <button
        onClick={onAdd}
        className="mt-4 flex min-h-tap items-center gap-1.5 rounded-xl bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-hover"
      >
        <PlusIcon className="h-4 w-4" />
        Add an item
      </button>
    </div>
  );
}
