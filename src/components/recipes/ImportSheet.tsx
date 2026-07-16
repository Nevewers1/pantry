"use client";

import { useEffect, useState } from "react";
import type { RecipeDraft } from "@/lib/types";
import { LinkIcon, XIcon } from "@/components/icons";

export function ImportSheet({
  mode,
  onClose,
  onParsed,
}: {
  mode: "link" | "text" | null;
  onClose: () => void;
  onParsed: (draft: RecipeDraft) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode) {
      setValue("");
      setError(null);
    }
  }, [mode]);

  if (!mode) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "link" ? { url: value.trim() } : { text: value.trim() };
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Import failed.");
        return;
      }
      onParsed(data.draft as RecipeDraft);
    } catch {
      setError("Couldn't import that. Try pasting the recipe text.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import recipe"
    >
      <div
        className="w-full max-w-md rounded-t-card bg-bg p-5 shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
            {mode === "link" ? "Paste a recipe link" : "Paste recipe text"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "link" ? (
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
              <input
                type="url"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="https://…"
                className="min-h-tap w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
              />
            </div>
          ) : (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={8}
              placeholder="Paste the ingredients and method here…"
              className="w-full rounded-xl border border-border bg-surface p-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand"
            />
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Reading recipe…" : "Import & review"}
          </button>
          <p className="text-center text-[13px] text-faint">
            You&apos;ll get to review and edit everything before it&apos;s saved.
          </p>
        </form>
      </div>
    </div>
  );
}
