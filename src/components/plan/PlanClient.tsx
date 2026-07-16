"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  DinnerStatus,
  PantrySlim,
  PlanDayResult,
  RecipeRef,
} from "@/lib/types";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { namesMatch } from "@/lib/normalize";
import { LunchboxSheet } from "@/components/plan/LunchboxSheet";

type Day = PlanDayResult & { away: boolean; dinner_status: DinnerStatus };

const DINNER_STATUSES: { value: DinnerStatus; label: string }[] = [
  { value: "home", label: "Cook" },
  { value: "eating_out", label: "Eat out" },
  { value: "ordered_in", label: "Order in" },
];

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
  return addDays(x, -((x.getDay() + 6) % 7));
}
function weekdayLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const inputCls =
  "min-h-[42px] w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-brand";

export function PlanClient({
  householdId,
  userId,
  recipes,
  pantry,
  kidsAnchor,
  kidsPattern,
  childNames,
}: {
  householdId: string;
  userId: string;
  recipes: RecipeRef[];
  pantry: PantrySlim[];
  kidsAnchor: string | null;
  kidsPattern: boolean[];
  childNames: [string, string];
}) {
  const supabase = useMemo(() => createClient(), []);
  const recipeTitle = useMemo(() => {
    const m = new Map<string, string>();
    recipes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [recipes]);

  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [anchor, setAnchor] = useState<string | null>(kidsAnchor);
  const pattern = useMemo(
    () =>
      kidsPattern.length === 14
        ? kidsPattern
        : [true, true, true, false, true, true, true, true, true, true, false, false, false, false],
    [kidsPattern]
  );

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uberCount, setUberCount] = useState<number | null>(null);
  const [names, setNames] = useState<[string, string]>(childNames);
  const [lunchboxDate, setLunchboxDate] = useState<string | null>(null);

  async function saveName(slot: 1 | 2, value: string) {
    setNames((n) => (slot === 1 ? [value, n[1]] : [n[0], value]));
    await supabase
      .from("households")
      .update(slot === 1 ? { child1_name: value } : { child2_name: value })
      .eq("id", householdId);
  }

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const defaultKids = useCallback(
    (date: Date): boolean => {
      if (!anchor) return false;
      const a = new Date(anchor);
      a.setHours(0, 0, 0, 0);
      const diff = Math.round((date.getTime() - a.getTime()) / 86_400_000);
      return pattern[((diff % 14) + 14) % 14] ?? false;
    },
    [anchor, pattern]
  );

  const kidsFor = (d: Date) => overrides[ymd(d)] ?? defaultKids(d);

  // Load any saved plan for the selected week.
  const loadSaved = useCallback(
    async (weekStr: string) => {
      setLoadingSaved(true);
      setSaved(false);
      const { data: mp } = await supabase
        .from("meal_plans")
        .select("id")
        .eq("household_id", householdId)
        .eq("week_start_date", weekStr)
        .maybeSingle();

      if (!mp) {
        setPlan(null);
        setLoadingSaved(false);
        return;
      }
      const { data: days } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", mp.id)
        .order("date", { ascending: true });

      const mapped: Day[] = (days ?? []).map((d) => ({
        date: d.date as string,
        kids_present: Boolean(d.kids_present),
        away: Boolean(d.away),
        dinner_status: ((d.dinner_status as DinnerStatus) ?? "home"),
        dinner_recipe_id: (d.dinner_recipe_id as string | null) ?? null,
        dinner_note: (d.dinner_note as string | null) ?? null,
        lunch_note: (d.lunch_note as string | null) ?? null,
        breakfast_note: (d.breakfast_note as string | null) ?? null,
        lunchbox_notes: (d.lunchbox_notes as string | null) ?? null,
        snack_notes: (d.snack_notes as string | null) ?? null,
      }));
      setPlan(mapped.length ? mapped : null);
      if (mapped.length) {
        const ov: Record<string, boolean> = {};
        mapped.forEach((m) => (ov[m.date] = m.kids_present));
        setOverrides((prev) => ({ ...ov, ...prev }));
      }
      setLoadingSaved(false);
    },
    [supabase, householdId]
  );

  useEffect(() => {
    loadSaved(ymd(weekStart));
  }, [weekStart, loadSaved]);

  // Count "ordered in" dinners in the current calendar month.
  const loadUber = useCallback(async () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const { count } = await supabase
      .from("meal_plan_days")
      .select("id", { count: "exact", head: true })
      .gte("date", ymd(first))
      .lte("date", ymd(last))
      .eq("dinner_status", "ordered_in");
    setUberCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    loadUber();
  }, [loadUber]);

  async function saveAnchor(value: string) {
    setAnchor(value || null);
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
        body: JSON.stringify({ week_start: ymd(weekStart), days, childNames: names }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't build the plan.");
        return;
      }
      setPlan(
        (data.days as PlanDayResult[]).map((d) => ({
          ...d,
          away: false,
          dinner_status: "home" as DinnerStatus,
        }))
      );

      // Persist the AI's lunchbox suggestions so they're ready to review/tweak.
      const lbs = (data.lunchboxes ?? []) as {
        date: string;
        child_slot: 1 | 2;
        component: string;
        name: string;
        quantity: number | null;
        unit: string | null;
      }[];
      if (lbs.length) {
        const lbDates = Array.from(new Set(lbs.map((l) => l.date)));
        await supabase.from("lunchbox_items").delete().in("date", lbDates);
        await supabase.from("lunchbox_items").insert(
          lbs.map((l) => ({
            household_id: householdId,
            date: l.date,
            child_slot: l.child_slot,
            component: l.component,
            name: l.name,
            quantity: l.quantity ?? 1,
            unit: l.unit,
            pantry_item_id:
              pantry.find((p) => namesMatch(l.name, p.name))?.id ?? null,
          }))
        );
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function setDay(i: number, patch: Partial<Day>) {
    setPlan((p) => (p ? p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) : p));
    setSaved(false);
  }

  async function savePlan() {
    if (!plan) return;
    setError(null);
    const weekStartStr = ymd(weekStart);
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

    const cookingHome = (d: Day) => !d.away && d.dinner_status === "home";
    const rows = plan.map((d) => ({
      meal_plan_id: mp.id,
      date: d.date,
      kids_present: d.kids_present,
      away: d.away,
      dinner_status: d.away ? "home" : d.dinner_status,
      dinner_recipe_id: cookingHome(d) ? d.dinner_recipe_id : null,
      dinner_note: cookingHome(d) ? d.dinner_note : null,
      lunch_note: d.away ? null : d.lunch_note,
      breakfast_note: d.away ? null : d.breakfast_note,
      lunchbox_notes: d.away ? null : d.lunchbox_notes,
      snack_notes: d.away ? null : d.snack_notes,
    }));
    const { error: daysErr } = await supabase.from("meal_plan_days").insert(rows);
    if (daysErr) {
      setError(daysErr.message);
      return;
    }
    setSaved(true);
    loadUber();
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
        {uberCount !== null && (
          <div className="mb-4 flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
            <span className="text-[14px] text-ink">Ordered in this month</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[14px] font-semibold ${
                uberCount === 0
                  ? "bg-brand-tint text-brand"
                  : "bg-amber-tint text-amber"
              }`}
            >
              {uberCount}
            </span>
          </div>
        )}

        {/* Week selector */}
        <div className="mb-4 flex items-center justify-between rounded-card border border-border bg-surface p-3">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink"
            aria-label="Previous week"
          >
            <ChevronRightIcon className="h-5 w-5 rotate-180" />
          </button>
          <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <CalendarIcon className="h-4 w-4 text-muted" />
            Week of{" "}
            {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink"
            aria-label="Next week"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Kids cycle anchor */}
        <div className="mb-4 flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
          <label htmlFor="anchor" className="text-[13px] font-medium text-ink">
            Kids cycle start <span className="text-faint">(a Monday they arrive)</span>
          </label>
          <input
            id="anchor"
            type="date"
            value={anchor ?? ""}
            onChange={(e) => saveAnchor(e.target.value)}
            className="min-h-tap w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink focus:border-brand"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([1, 2] as const).map((slot) => (
              <input
                key={slot}
                value={names[slot - 1]}
                onChange={(e) => saveName(slot, e.target.value)}
                aria-label={`Child ${slot} name`}
                placeholder={`Child ${slot}`}
                className="min-h-[42px] w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink focus:border-brand"
              />
            ))}
          </div>
        </div>

        {/* Day toggles (for generating) */}
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
                  onClick={() => setOverrides((o) => ({ ...o, [ymd(d)]: !here }))}
                  className={`min-h-[36px] rounded-lg px-3 text-[13px] font-medium transition-colors ${
                    here ? "bg-brand-tint text-brand" : "bg-bg text-muted hover:text-ink"
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
        {loadingSaved && (
          <p className="mb-2 text-center text-[13px] text-muted">Loading saved plan…</p>
        )}

        {/* Editable plan */}
        {plan && (
          <div className="mt-4 space-y-3">
            {plan.map((day, i) => {
              const d = new Date(day.date);
              return (
                <div
                  key={day.date}
                  className="rounded-card border border-border bg-surface p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink">
                      {weekdayLabel(d)}
                    </span>
                    <button
                      onClick={() => setDay(i, { away: !day.away })}
                      className={`min-h-[32px] rounded-lg px-2.5 text-[12px] font-medium ${
                        day.away
                          ? "bg-amber-tint text-amber"
                          : "bg-bg text-muted hover:text-ink"
                      }`}
                    >
                      {day.away ? "Away — no meals" : "Mark away"}
                    </button>
                  </div>

                  {day.away ? (
                    <p className="text-[14px] text-muted">
                      No meals planned (you&apos;re away).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                          Dinner
                        </p>
                        <div className="mb-1.5 flex gap-1.5">
                          {DINNER_STATUSES.map((s) => {
                            const on = day.dinner_status === s.value;
                            const tone =
                              s.value === "ordered_in"
                                ? "bg-amber-tint text-amber"
                                : "bg-brand-tint text-brand";
                            return (
                              <button
                                key={s.value}
                                type="button"
                                onClick={() => setDay(i, { dinner_status: s.value })}
                                className={`min-h-[34px] rounded-lg px-2.5 text-[12px] font-medium ${
                                  on ? tone : "bg-bg text-muted hover:text-ink"
                                }`}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>

                        {day.dinner_status === "home" ? (
                          <>
                            {recipes.length > 0 && (
                              <select
                                value={day.dinner_recipe_id ?? ""}
                                onChange={(e) =>
                                  setDay(i, {
                                    dinner_recipe_id: e.target.value || null,
                                    dinner_note: e.target.value ? null : day.dinner_note,
                                  })
                                }
                                className={`${inputCls} mb-1`}
                              >
                                <option value="">Custom / note below</option>
                                {recipes.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!day.dinner_recipe_id && (
                              <input
                                value={day.dinner_note ?? ""}
                                onChange={(e) => setDay(i, { dinner_note: e.target.value })}
                                placeholder="Dinner idea"
                                className={inputCls}
                              />
                            )}
                          </>
                        ) : (
                          <p className="text-[14px] text-muted">
                            {day.dinner_status === "ordered_in"
                              ? "Ordering in (Uber Eats)"
                              : "Eating out"}
                          </p>
                        )}
                      </div>

                      <EditLine
                        label="Adults' lunch"
                        value={day.lunch_note}
                        onChange={(v) => setDay(i, { lunch_note: v })}
                      />
                      <EditLine
                        label="Breakfast"
                        value={day.breakfast_note}
                        onChange={(v) => setDay(i, { breakfast_note: v })}
                      />
                      {day.kids_present && (
                        <button
                          type="button"
                          onClick={() => setLunchboxDate(day.date)}
                          className="mt-1 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-brand-soft bg-brand-tint text-[14px] font-medium text-brand"
                        >
                          Lunchboxes ({names[0]} &amp; {names[1]})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={savePlan}
              className="min-h-tap w-full rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover"
            >
              {saved ? "Saved ✓" : "Save this plan"}
            </button>
          </div>
        )}
      </main>

      <LunchboxSheet
        date={lunchboxDate}
        householdId={householdId}
        userId={userId}
        supabase={supabase}
        childNames={names}
        pantry={pantry}
        onClose={() => setLunchboxDate(null)}
      />
    </div>
  );
}

function EditLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label} note`}
        className={inputCls}
      />
    </div>
  );
}
