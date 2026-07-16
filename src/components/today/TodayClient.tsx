"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LUNCH_COMPONENTS, type LunchboxItem } from "@/lib/types";
import { UseSoonStrip } from "@/components/UseSoonStrip";
import { LeafIcon, LogoutIcon } from "@/components/icons";
import { signOut } from "@/app/actions";

type ExpiringItem = {
  id: string;
  name: string;
  expiry_date: string | null;
  quantity: number | null;
  unit: string | null;
};

type PlanDay = {
  away: boolean;
  kids_present: boolean;
  dinner_status: string;
  dinner_recipe_id: string | null;
  dinner_side_ids: string[] | null;
  dinner_note: string | null;
  lunch_note: string | null;
  breakfast_note: string | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function mondayOf(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return ymd(x);
}

export function TodayClient({
  householdId,
  displayName,
  householdName,
  childNames,
}: {
  householdId: string;
  displayName: string;
  householdName: string;
  childNames: [string, string];
}) {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => new Date(), []);
  const todayStr = ymd(today);

  const [loading, setLoading] = useState(true);
  const [expiring, setExpiring] = useState<ExpiringItem[]>([]);
  const [day, setDay] = useState<PlanDay | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [lunchboxes, setLunchboxes] = useState<LunchboxItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const soon = new Date();
    soon.setDate(soon.getDate() + 4);
    const { data: exp } = await supabase
      .from("pantry_items")
      .select("id, name, expiry_date, quantity, unit")
      .not("expiry_date", "is", null)
      .lte("expiry_date", ymd(soon))
      .order("expiry_date", { ascending: true })
      .limit(12);
    setExpiring((exp ?? []) as ExpiringItem[]);

    const { data: mp } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("household_id", householdId)
      .eq("week_start_date", mondayOf(today))
      .maybeSingle();

    if (mp) {
      const { data: d } = await supabase
        .from("meal_plan_days")
        .select(
          "away, kids_present, dinner_status, dinner_recipe_id, dinner_side_ids, dinner_note, lunch_note, breakfast_note"
        )
        .eq("meal_plan_id", mp.id)
        .eq("date", todayStr)
        .maybeSingle();
      setDay((d as PlanDay) ?? null);

      if (d) {
        const ids = [
          d.dinner_recipe_id,
          ...((d.dinner_side_ids as string[] | null) ?? []),
        ].filter(Boolean) as string[];
        if (ids.length) {
          const { data: recs } = await supabase
            .from("recipes")
            .select("id, title")
            .in("id", ids);
          const m = new Map<string, string>();
          (recs ?? []).forEach((r) => m.set(r.id as string, r.title as string));
          setTitles(m);
        }
      }
    } else {
      setDay(null);
    }

    const { data: lbs } = await supabase
      .from("lunchbox_items")
      .select("*")
      .eq("date", todayStr);
    setLunchboxes((lbs ?? []) as LunchboxItem[]);

    setLoading(false);
  }, [supabase, householdId, today, todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  const dateLabel = today.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const dinnerText = (() => {
    if (!day) return null;
    if (day.away) return "Away — no meals";
    if (day.dinner_status === "eating_out") return "Eating out";
    if (day.dinner_status === "ordered_in") return "Ordering in (Uber Eats)";
    if (day.dinner_recipe_id) return titles.get(day.dinner_recipe_id) ?? "Dinner";
    return day.dinner_note ?? "—";
  })();

  const sideTitles = (day?.dinner_side_ids ?? [])
    .map((id) => titles.get(id))
    .filter(Boolean) as string[];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
              <LeafIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] leading-tight text-muted">{householdName}</p>
              <p className="text-[15px] font-semibold leading-tight tracking-tightish text-ink">
                Today
              </p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-28 pt-6">
        <div className="mb-5">
          <p className="text-sm text-muted">Hi {displayName}</p>
          <h1 className="text-2xl font-semibold tracking-tightish text-ink">
            {dateLabel}
          </h1>
        </div>

        <UseSoonStrip items={expiring} />

        {/* Today's dinner */}
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              Tonight&apos;s dinner
            </h2>
            <Link
              href="/plan"
              className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
            >
              Open planner
            </Link>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : !day ? (
              <div>
                <p className="text-[15px] text-ink">No plan for today yet.</p>
                <Link
                  href="/plan"
                  className="mt-1 inline-block text-[14px] font-medium text-brand"
                >
                  Plan your week →
                </Link>
              </div>
            ) : (
              <>
                <p className="text-[16px] font-medium text-ink">{dinnerText}</p>
                {sideTitles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sideTitles.map((t) => (
                      <span
                        key={t}
                        className="rounded-lg bg-brand-tint px-2 py-1 text-[12px] font-medium text-brand"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {(day.lunch_note || day.breakfast_note) && (
                  <div className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] text-muted">
                    {day.breakfast_note && <p>Breakfast: {day.breakfast_note}</p>}
                    {day.lunch_note && <p>Adults&apos; lunch: {day.lunch_note}</p>}
                  </div>
                )}
                <p className="mt-3 text-[12px] text-faint">
                  One-tap &quot;cooked&quot; (updates your pantry) arrives next.
                </p>
              </>
            )}
          </div>
        </section>

        {/* Today's lunchboxes */}
        {!loading && day?.kids_present && !day.away && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                Lunchboxes
              </h2>
              <Link
                href="/plan"
                className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                Edit
              </Link>
            </div>
            <div className="space-y-3">
              {([1, 2] as const).map((slot) => {
                const mine = lunchboxes.filter((l) => l.child_slot === slot);
                return (
                  <div
                    key={slot}
                    className="rounded-card border border-border bg-surface p-4"
                  >
                    <p className="mb-1.5 text-[15px] font-semibold text-ink">
                      {childNames[slot - 1]}
                    </p>
                    {mine.length === 0 ? (
                      <p className="text-[13px] text-faint">Nothing planned.</p>
                    ) : (
                      <div className="space-y-1 text-[13px] text-muted">
                        {LUNCH_COMPONENTS.map((c) => {
                          const items = mine.filter((l) => l.component === c.value);
                          if (!items.length) return null;
                          return (
                            <p key={c.value}>
                              <span className="text-ink">{c.label}:</span>{" "}
                              {items.map((it) => it.name).join(", ")}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
