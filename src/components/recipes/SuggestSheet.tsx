"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecipeDraft } from "@/lib/types";
import { ClockIcon, PlateIcon, XIcon } from "@/components/icons";

export function SuggestSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (draft: RecipeDraft) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RecipeDraft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/suggest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't get suggestions.");
        setSuggestions([]);
      } else {
        setSuggestions((data.suggestions ?? []) as RecipeDraft[]);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Meal suggestions"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <PlateIcon className="h-5 w-5 text-brand" />
            <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
              Cook from what I have
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {loading && (
            <p className="py-10 text-center text-sm text-muted">
              Finding meals from your pantry…
            </p>
          )}

          {!loading && error && (
            <div className="py-8 text-center">
              <p className="text-sm text-danger">{error}</p>
              <button
                onClick={load}
                className="mt-3 min-h-tap rounded-xl border border-border bg-surface px-4 text-[14px] font-medium text-ink hover:bg-bg"
              >
                Try again
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            suggestions.map((s, i) => {
              const time = (s.prep_min ?? 0) + (s.cook_min ?? 0);
              return (
                <button
                  key={i}
                  onClick={() => onPick(s)}
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-brand-soft"
                >
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
                  </div>
                  <p className="mt-2 text-[13px] text-brand">Review &amp; save →</p>
                </button>
              );
            })}
        </div>

        {!loading && !error && suggestions.length > 0 && (
          <div className="border-t border-border p-4">
            <button
              onClick={load}
              className="min-h-tap w-full rounded-xl border border-border bg-surface text-[14px] font-medium text-ink hover:bg-bg"
            >
              Suggest different meals
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
