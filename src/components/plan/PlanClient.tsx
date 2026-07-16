"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { PlanDayResult, RecipeRef } from "@/lib/types";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronRightIcon,
} from "@/components/icons";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const offset = (x.getDay() + 6) % 7; // days since Monday
  return addDays(x, -offset);
}
function weekdayLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function PlanClient({
  householdId,
  recipes,
  kidsAnchor,
  kidsPattern,
}: {
  householdId: string;
  recipes: RecipeRef[];
  kidsAnchor: string | null;
  kidsPattern: boolean[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const recipeTitle = useMemo(() => {
    const m = new Map<string, string>();
    recipes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [recipes]);

  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [anchor, setAnchor] = useState<string | null>(kidsAnchor);
  const [pattern] = useState<boolean[]>(
    kidsPattern.length === 14
      ? kidsPattern
      : [true, true, true, false, true, true, true, true, true, true, false, false, false, false]
  );

  // Default kids-here for a date from the fortnightly pattern + anchor.
  function defaultKids(date: Date): boolean {
    if (!anchor) return false;
    const a = new Date(anchor);
    a.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - a.getTime()) / 86_400_000);
    const idx = ((diff % 14) + 14) % 14;
    return pattern[idx] ?? false;
  }

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Per-day kids toggle state, keyed by date string. Undefined = use default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const kidsFor = (d: Date) => {
    const key = ymd(d);
    return overrides[key] ?? defaultKids(d);
  };

  const [plan, setPlan] = useState<PlanDayResult[] | null>(null);
  const [original, setOriginal] = useState<PlanDayResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveAnchor(value: string) {
    setAnchor(value || null);
    setOverrides({});
    await supabase
      .from("households")
      .update({ kids_anchor: value || null })
      .eq("id", householdId);
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const days = dates.map((d) => ({ date: ymd(d), kids_present: kidsFor(d) }));
      const res = await fetch("/api/plan/week", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_start: ymd(weekStart), days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't build the plan.");
        return;
      }
      setPlan(data.days as PlanDayResult[]);
      setOriginal(data.days as PlanDayResult[]);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function swapDinner(i: number, value: string) {
    if (!plan) return;
    setPlan(
      plan.map((day, idx) => {
        if (idx !== i) return day;
        if (value === "__suggested__") {
          const orig = original?.[i];
          return orig
            ? { ...day, dinner_recipe_id: orig.dinner_recipe_id, dinner_note: orig.dinner_note }
            : day;
        }
        return { ...day, dinner_recipe_id: value, dinner_note: null };
      })
    );
    setSaved(false);
  }

  async function savePlan() {
    if (!plan) return;
    setError(null);
    const weekStartStr = ymd(weekStart);
    // Replace any existing plan for this week.
    await supabase
      .from("meal_plans")
      .delete()
      .eq("household_id", householdId)
      .eq("week_start_date", weekStartStr);

    const { data: mp, error: mpErr } = await supabase
      .from("meal_plans")
      .insert({
        household_id: householdId,
        week_start_date: weekStartStr,
        status: "active",
      })
      .select()
      .single();
    if (mpErr || !mp) {
      setError(mpErr?.message ?? "Couldn't save the plan.");
      return;
    }

    const rows = plan.map((d) => ({
      meal_plan_id: mp.id,
      date: d.date,
      kids_present: d.kids_present,
      dinner_recipe_id: d.dinner_recipe_id,
      dinner_note: d.dinner_note,
      lunch_note: d.lunch_note,
      breakfast_note: d.breakfast_note,
      lunchbox_notes: d.lunchbox_notes,
      snack_notes: d.snack_notes,
    }));
    const { error: daysErr } = await supabase.from("meal_plan_days").insert(rows);
    if (daysErr) {
      setError(daysErr.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-5 py-3.5">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-[17px] font-semibold tracking-tightish text-ink">
            Plan my week
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-24 pt-4">
        {/* Week selector */}
        <div className="mb-4 flex items-center justify-between rounded-card border border-border bg-surface p-3">
          <button
            onClick={() => {
              setWeekStart(addDays(weekStart, -7));
              setPlan(null);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink"
            aria-label="Previous week"
          >
            <ChevronRightIcon className="h-5 w-5 rotate-180" />
          </button>
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <CalendarIcon className="h-4 w-4 text-muted" />
            Week of {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </div>
          <button
            onClick={() => {
              setWeekStart(addDays(weekStart, 7));
              setPlan(null);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink"
            aria-label="Next week"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Kids cycle anchor */}
        <div className="mb-4 flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
          <label htmlFor="anchor" className="text-[13px] font-medium text-ink">
            Kids cycle start{" "}
            <span className="text-faint">(a Monday they arrive)</span>
          </label>
          <input
            id="anchor"
            type="date"
            value={anchor ?? ""}
            onChange={(e) => saveAnchor(e.target.value)}
            className="min-h-tap w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink focus:border-brand"
          />
          <p className="text-[12px] text-faint">
            Sets the default kids-here days below from your fortnightly roster. You
            can still flick any day for swaps.
          </p>
        </div>

        {/* Day toggles */}
        <div className="mb-4 overflow-hidden rounded-card border border-border bg-surface">
          {dates.map((d, i) => {
            const here = kidsFor(d);
            return (
              <div
                key={ymd(d)}
                className={`flex items-center justify-between px-4 py-3 ${
                  i === dates.length - 1 ? "" : "border-b border-border"
                }`}
              >
                <span className="text-[15px] text-ink">{weekdayLabel(d)}</span>
                <button
                  onClick={() =>
                    setOverrides((o) => ({ ...o, [ymd(d)]: !here }))
                  }
                  className={`min-h-[36px] rounded-lg px-3 text-[13px] font-medium transition-colors ${
                    here
                      ? "bg-brand-tint text-brand"
                      : "bg-bg text-muted hover:text-ink"
                  }`}
                >
                  {here ? "Kids here" : "Adults only"}
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="mb-2 min-h-tap w-full rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "Building your week…" : plan ? "Regenerate plan" : "Plan my week"}
        </button>
        {error && <p className="mb-2 text-center text-sm text-danger">{error}</p>}

        {/* The plan */}
        {plan && (
          <div className="mt-4 space-y-3">
            {plan.map((day, i) => {
              const d = new Date(day.date);
              const dinner = day.dinner_recipe_id
                ? recipeTitle.get(day.dinner_recipe_id) ?? "Recipe"
                : day.dinner_note ?? "—";
              return (
                <div
                  key={day.date}
                  className="rounded-card border border-border bg-surface p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink">
                      {weekdayLabel(d)}
                    </span>
                    {day.kids_present && (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand">
                        Kids here
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] font-medium uppercase tracking-wide text-muted">
                    Dinner
                  </p>
                  <p className="text-[15px] text-ink">{dinner}</p>
                  {recipes.length > 0 && (
                    <select
                      value={day.dinner_recipe_id ?? "__suggested__"}
                      onChange={(e) => swapDinner(i, e.target.value)}
                      className="mt-2 min-h-[38px] w-full rounded-lg border border-border bg-surface px-2 text-[13px] text-ink"
                    >
                      <option value="__suggested__">Suggested (from plan)</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  )}

                  {day.lunch_note && (
                    <Line label="Lunch" value={day.lunch_note} />
                  )}
                  {day.breakfast_note && (
                    <Line label="Breakfast" value={day.breakfast_note} />
                  )}
                  {day.lunchbox_notes && (
                    <Line label="Lunchbox" value={day.lunchbox_notes} />
                  )}
                  {day.snack_notes && (
                    <Line label="Snacks" value={day.snack_notes} />
                  )}
                </div>
              );
            })}

            <button
              onClick={savePlan}
              className="min-h-tap w-full rounded-xl border border-border bg-surface text-[15px] font-medium text-ink hover:bg-bg"
            >
              {saved ? "Saved ✓" : "Save this plan"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2">
      <p className="text-[13px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="text-[14px] text-ink">{value}</p>
    </div>
  );
}
