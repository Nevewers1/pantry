"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FEEDBACK_TYPES, type FeedbackType } from "@/lib/types";
import { CheckIcon, XIcon } from "@/components/icons";

/**
 * Lightweight in-app feedback / feature-request logger. Anyone testing can jot
 * an idea or a bug without leaving the app; submissions land in the `feedback`
 * table for review.
 */
export function FeedbackSheet({
  open,
  householdId,
  page,
  onClose,
}: {
  open: boolean;
  householdId: string;
  page?: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<FeedbackType>("feature");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType("feature");
      setMessage("");
      setSent(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) {
      setError("Add a few words first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("feedback").insert({
        household_id: householdId,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        type,
        message: text.slice(0, 2000),
        page: page ?? null,
      });
      if (insErr) throw insErr;
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send that just now."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
    >
      <div
        className="w-full max-w-md rounded-t-card bg-bg p-5 shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
            {sent ? "Thanks!" : "Send feedback"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <CheckIcon className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-medium text-ink">Logged — thank you.</p>
            <p className="mt-1 text-sm text-muted">
              Every note helps shape what gets built next.
            </p>
            <button
              onClick={onClose}
              className="mt-5 min-h-tap w-full rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink">Type</span>
              <div className="flex gap-1 rounded-xl bg-surface p-1">
                {FEEDBACK_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`min-h-[40px] flex-1 rounded-lg text-[13px] font-medium transition-colors ${
                      type === t.value
                        ? "bg-brand-tint text-brand"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="fb" className="text-[13px] font-medium text-ink">
                Your note
              </label>
              <textarea
                id="fb"
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="What would make this better? A bug, an idea, anything…"
                className="w-full rounded-xl border border-border bg-surface p-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send feedback"}
            </button>
            <p className="text-center text-[12px] text-faint">
              Goes straight to the app&apos;s notes for review.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
