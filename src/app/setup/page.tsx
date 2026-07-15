"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setupHousehold, type SetupState } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-tap rounded-xl bg-brand text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
    >
      {pending ? "Setting up…" : label}
    </button>
  );
}

const fieldClass =
  "min-h-tap w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink placeholder:text-faint focus:border-brand";

export default function SetupPage() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [state, formAction] = useActionState<SetupState, FormData>(
    setupHousehold,
    {}
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-7 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tightish text-ink">
          Set up your household
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          One household is shared by both partners. Create it once, then invite
          your partner with the code.
        </p>
      </div>

      {/* Segmented control */}
      <div
        className="flex gap-1 rounded-xl bg-bg p-1"
        role="tablist"
        aria-label="Setup mode"
      >
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-[44px] flex-1 rounded-lg text-[14px] font-medium transition-colors ${
              mode === m
                ? "bg-surface text-ink shadow-soft"
                : "text-muted hover:text-ink"
            }`}
          >
            {m === "create" ? "Create new" : "Join partner"}
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="mode" value={mode} />

        <div className="flex flex-col gap-2">
          <label htmlFor="display_name" className="text-sm font-medium text-ink">
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            placeholder="e.g. Nev"
            className={fieldClass}
          />
        </div>

        {mode === "create" ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="household_name"
              className="text-sm font-medium text-ink"
            >
              Household name
            </label>
            <input
              id="household_name"
              name="household_name"
              required
              placeholder="e.g. The Ewers kitchen"
              className={fieldClass}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="join_code" className="text-sm font-medium text-ink">
              Invite code
            </label>
            <input
              id="join_code"
              name="join_code"
              required
              placeholder="Paste the code your partner shared"
              className={`${fieldClass} font-mono text-sm`}
            />
            <p className="text-[13px] text-faint">
              The person who created the household can find the code on the home
              screen once Step&nbsp;3 ships.
            </p>
          </div>
        )}

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <SubmitButton
          label={mode === "create" ? "Create household" : "Join household"}
        />
      </form>
    </main>
  );
}
