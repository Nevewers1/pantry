"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecipeDraft } from "@/lib/types";
import { ChevronRightIcon, ClockIcon, PlateIcon, XIcon } from "@/components/icons";

export function DaySuggestSheet({
  date,
  kidsPresent,
  excludeTitles,
  onPick,
  onSave,
  onClose,
}: {
  date: string | null;
  kidsPresent: boolean;
  excludeTitles: string[];
  onPick: (draft: RecipeDraft) => void | Promise<void>;
  onSave: (draft: RecipeDraft) => void | Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RecipeDraft[]>([]);
  const [craving, setCraving] = useState("");
  const [searched, setSearched] = useState(false);
  const [lastCraving, setLastCraving] = useState("");

  const load = useCallback(
    async (cravingArg?: string) => {
      if (!date) return;
      const want = (cravingArg ?? craving).trim();
      setLoading(true);
      setError(null);
      setSavedIdx(new Set());
      setOpenIdx(null);
      setSearched(true);
      setLastCraving(want);
      try {
        const res = await fetch("/api/plan/day", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            date,
            kids_present: kidsPresent,
            exclude_titles: excludeTitles,
            craving: want,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Couldn't get ideas.");
          setSuggestions([]);
        } else {
          setSuggestions((data.suggestions ?? []) as RecipeDraft[]);
        }
      } catch {
        setError("Something went wrong. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [date, kidsPresent, excludeTitles, craving]
  );

  // Reset when the sheet opens for a new day. We deliberately do NOT auto-search
  // — the user chooses "Find ideas" (with a craving) or "Choose for me" first,
  // so results always reflect their intent (and we don't waste tokens).
  useEffect(() => {
    if (!date) return;
    setCraving("");
    setSuggestions([]);
    setSavedIdx(new Set());
    setOpenIdx(null);
    setError(null);
    setSearched(false);
    setLastCraving("");
  }, [date]);

  if (!date) return null;

  const weekday = new Date(date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  async function act(kind: "pick" | "save", i: number, s: RecipeDraft) {
    if (busyIdx !== null) return;
    setBusyIdx(i);
    try {
      if (kind === "pick") {
        await onPick(s);
      } else {
        await onSave(s);
        setSavedIdx((prev) => new Set(prev).add(i));
      }
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Dinner ideas"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <PlateIcon className="h-5 w-5 text-brand" />
            <div>
              <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
                Dinner ideas
              </h2>
              <p className="text-[12px] text-muted">{weekday}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Craving input */}
        <div className="border-b border-border p-4">
          <label htmlFor="craving" className="mb-1 block text-[12px] font-medium text-muted">
            What are you craving? <span className="text-faint">(optional)</span>
          </label>
          <input
            id="craving"
            value={craving}
            onChange={(e) => setCraving(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && craving.trim() && !loading) load();
            }}
            placeholder="e.g. risotto, something Thai, comfort food"
            className="min-h-[42px] w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-brand"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => load()}
              disabled={loading || !craving.trim()}
              className="min-h-[42px] flex-1 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {loading ? "Finding…" : "Find ideas"}
            </button>
            <button
              onClick={() => load("")}
              disabled={loading}
              className="min-h-[42px] flex-1 rounded-lg border border-border bg-surface px-4 text-[14px] font-medium text-ink hover:bg-bg disabled:opacity-50"
            >
              Choose for me
            </button>
          </div>
          <p className="mt-2 text-[12px] text-faint">
            Ideas are built from what&apos;s already in your pantry.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!searched && !loading && (
            <div className="py-10 text-center">
              <PlateIcon className="mx-auto mb-2 h-6 w-6 text-brand-soft" />
              <p className="text-[14px] text-muted">
                Tell me what you feel like and tap{" "}
                <span className="font-medium text-ink">Find ideas</span> —
              </p>
              <p className="text-[13px] text-faint">
                or tap <span className="font-medium text-muted">Choose for me</span>{" "}
                and I&apos;ll work from what you already have.
              </p>
            </div>
          )}

          {loading && (
            <p className="py-10 text-center text-sm text-muted">
              {lastCraving
                ? `Finding ${lastCraving} dinners from what you already have…`
                : "Finding dinners from what you already have…"}
            </p>
          )}

          {!loading && error && (
            <div className="py-8 text-center">
              <p className="text-sm text-danger">{error}</p>
              <button
                onClick={() => load()}
                className="mt-3 min-h-tap rounded-xl border border-border bg-surface px-4 text-[14px] font-medium text-ink hover:bg-bg"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && suggestions.length > 0 && (
            <p className="text-[12px] text-muted">
              {lastCraving ? (
                <>
                  <span className="font-medium text-ink">{lastCraving}</span> dinners,
                  using what&apos;s already in your pantry:
                </>
              ) : (
                <>Dinners using what&apos;s already in your pantry:</>
              )}
            </p>
          )}

          {!loading &&
            !error &&
            suggestions.map((s, i) => {
              const time = (s.prep_min ?? 0) + (s.cook_min ?? 0);
              const isSaved = savedIdx.has(i);
              const isOpen = openIdx === i;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-ink">{s.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                        <span>
                          {s.servings} {s.servings === 1 ? "serve" : "serves"}
                        </span>
                        {time > 0 && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3.5 w-3.5" />
                            {time} min
                          </span>
                        )}
                        <span>{s.ingredients.length} ingredients</span>
                        {s.tags.includes("kid_friendly") && (
                          <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand">
                            kid-friendly
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRightIcon
                      className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div>
                        <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                          Ingredients
                        </p>
                        <ul className="space-y-0.5 text-[13px] text-ink">
                          {s.ingredients.map((ing, j) => {
                            const qty =
                              ing.quantity != null
                                ? `${ing.quantity}${ing.unit ? " " + ing.unit : ""} `
                                : "";
                            return (
                              <li key={j} className="flex gap-1">
                                <span className="text-faint">•</span>
                                <span>
                                  {qty}
                                  {ing.name}
                                  {ing.is_staple && (
                                    <span className="text-faint"> (staple)</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      {s.instructions && (
                        <div>
                          <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                            Method
                          </p>
                          <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                            {s.instructions}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!isOpen && (
                    <button
                      type="button"
                      onClick={() => setOpenIdx(i)}
                      className="mt-2 text-[12px] font-medium text-brand underline-offset-4 hover:underline"
                    >
                      View recipe
                    </button>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => act("pick", i, s)}
                      disabled={busyIdx !== null}
                      className="min-h-[40px] flex-1 rounded-lg bg-brand text-[14px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                    >
                      {busyIdx === i ? "Adding…" : "Use for this day"}
                    </button>
                    <button
                      onClick={() => act("save", i, s)}
                      disabled={busyIdx !== null || isSaved}
                      className={`min-h-[40px] shrink-0 rounded-lg border px-3.5 text-[14px] font-medium disabled:opacity-60 ${
                        isSaved
                          ? "border-brand-soft bg-brand-tint text-brand"
                          : "border-border bg-surface text-ink hover:bg-bg"
                      }`}
                    >
                      {isSaved ? "Saved ✓" : "Save to recipes"}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        {!loading && !error && suggestions.length > 0 && (
          <div className="border-t border-border p-4">
            <button
              onClick={() => load()}
              disabled={busyIdx !== null}
              className="min-h-tap w-full rounded-xl border border-border bg-surface text-[14px] font-medium text-ink hover:bg-bg disabled:opacity-50"
            >
              Suggest different dinners
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
