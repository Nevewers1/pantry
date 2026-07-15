"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeafIcon, MailIcon, CheckIcon } from "@/components/icons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(email);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-soft">
          <LeafIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tightish text-ink">
          Pantry
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Cook what you have. Waste less, spend less.
        </p>
      </div>

      {status === "sent" ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint text-brand">
            <CheckIcon className="h-6 w-6" />
          </div>
          <p className="text-[15px] font-medium text-ink">Check your inbox</p>
          <p className="text-sm text-muted">
            We sent a sign-in link to <span className="text-ink">{message}</span>
            . Tap it on this device to continue.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            Email address
          </label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-tap w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending" || !email}
            className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {status === "error" && (
            <p className="text-sm text-danger">{message}</p>
          )}
          <p className="mt-2 text-center text-[13px] leading-relaxed text-faint">
            No password — we email you a one-tap link. Both partners sign in with
            their own email to share one household.
          </p>
        </form>
      )}
    </main>
  );
}
