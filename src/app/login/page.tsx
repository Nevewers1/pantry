"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeafIcon, MailIcon } from "@/components/icons";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("code");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Full navigation so the server picks up the new session cookies.
    window.location.href = "/";
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

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
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
            disabled={busy || !email}
            className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="mt-2 text-center text-[13px] leading-relaxed text-faint">
            We&apos;ll email you a 6-digit code. Both partners sign in with their
            own email to share one household.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-sm font-medium text-ink">
            Enter the 6-digit code
          </label>
          <p className="-mt-1 text-[13px] text-muted">
            Sent to <span className="text-ink">{email}</span>
          </p>
          <input
            id="code"
            type="text"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="min-h-tap w-full rounded-xl border border-border bg-surface px-4 text-center text-[22px] font-semibold tracking-[0.4em] text-ink placeholder:tracking-normal placeholder:text-faint focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="mt-1 text-center text-[13px] text-muted underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}
    </main>
  );
}
