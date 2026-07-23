"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { namesMatch } from "@/lib/normalize";
import {
  LUNCH_COMPONENTS,
  type LunchboxItem,
  type RecipeWithIngredients,
} from "@/lib/types";
import { UseSoonStrip } from "@/components/UseSoonStrip";
import { RecipeView } from "@/components/recipes/RecipeView";
import { RecipePhoto } from "@/components/recipes/RecipePhoto";
import { FeedbackSheet } from "@/components/FeedbackSheet";
import {
  CheckIcon,
  LeafIcon,
  LogoutIcon,
  MessageIcon,
  XIcon,
} from "@/components/icons";
import { signOut } from "@/app/actions";

type ExpiringItem = {
  id: string;
  name: string;
  expiry_date: string | null;
  quantity: number | null;
  unit: string | null;
  expiry_estimated?: boolean | null;
};
type PlanDay = {
  id: string;
  away: boolean;
  kids_present: boolean;
  dinner_status: string;
  dinner_cooked: boolean;
  dinner_recipe_id: string | null;
  dinner_side_ids: string[] | null;
  dinner_note: string | null;
  lunch_note: string | null;
  breakfast_note: string | null;
};
type PantryRow = { id: string; name: string; quantity: number; unit: string | null };
type CatchupRow = {
  id: string;
  date: string;
  dinner_recipe_id: string | null;
  dinner_side_ids: string[] | null;
  title: string;
};
type LbItem = LunchboxItem & { id: string; packed: boolean };
type Toast = { msg: string; undo: () => Promise<void> } | null;

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
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [lunchboxes, setLunchboxes] = useState<LbItem[]>([]);
  const [pantry, setPantry] = useState<PantryRow[]>([]);
  const [catchup, setCatchup] = useState<CatchupRow[]>([]);
  const [tomorrow, setTomorrow] = useState<{
    dinner: string | null;
    lunch: string | null;
  } | null>(null);
  const [lunchIdeas, setLunchIdeas] = useState<{ title: string }[] | null>(null);
  const [lunchLoading, setLunchLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [viewRecipe, setViewRecipe] = useState<RecipeWithIngredients | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function openRecipe(id: string | null) {
    if (!id) return;
    const { data } = await supabase
      .from("recipes")
      .select("*, recipe_ingredients(*)")
      .eq("id", id)
      .maybeSingle();
    if (data) setViewRecipe(data as RecipeWithIngredients);
  }

  // Quick lunch ideas from what's in the pantry (reuses the suggest endpoint).
  async function genLunchIdeas() {
    setLunchLoading(true);
    try {
      const res = await fetch("/api/plan/suggest", { method: "POST" });
      const data = await res.json();
      if (res.ok)
        setLunchIdeas(((data.suggestions ?? []) as { title: string }[]).slice(0, 3));
    } catch {
      /* ignore — button can be tapped again */
    } finally {
      setLunchLoading(false);
    }
  }
  async function setLunch(title: string) {
    if (day) {
      await supabase
        .from("meal_plan_days")
        .update({ lunch_note: title })
        .eq("id", day.id);
      setDay({ ...day, lunch_note: title });
    }
    setLunchIdeas(null);
  }

  const load = useCallback(async () => {
    setLoading(true);

    const soon = new Date();
    soon.setDate(soon.getDate() + 4);
    const { data: exp } = await supabase
      .from("pantry_items")
      .select("id, name, expiry_date, quantity, unit, expiry_estimated")
      .not("expiry_date", "is", null)
      .gt("quantity", 0) // used-up items shouldn't nag in the expiry strip
      .lte("expiry_date", ymd(soon))
      .order("expiry_date", { ascending: true })
      .limit(12);
    setExpiring((exp ?? []) as ExpiringItem[]);

    const { data: allPantry } = await supabase
      .from("pantry_items")
      .select("id, name, quantity, unit");
    setPantry((allPantry ?? []) as PantryRow[]);

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
          "id, away, kids_present, dinner_status, dinner_cooked, dinner_recipe_id, dinner_side_ids, dinner_note, lunch_note, breakfast_note"
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
            .select("id, title, image_url")
            .in("id", ids);
          const m = new Map<string, string>();
          const im = new Map<string, string>();
          (recs ?? []).forEach((r) => {
            m.set(r.id as string, r.title as string);
            if (r.image_url) im.set(r.id as string, r.image_url as string);
          });
          setTitles(m);
          setImages(im);
        }
      }
    } else {
      setDay(null);
    }

    const { data: lbs } = await supabase
      .from("lunchbox_items")
      .select("*")
      .eq("date", todayStr);
    setLunchboxes((lbs ?? []) as LbItem[]);

    // Tomorrow's meals (may be in this week's plan or next week's).
    const tmr = new Date(today);
    tmr.setDate(tmr.getDate() + 1);
    const tmrStr = ymd(tmr);
    const { data: tmp } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("household_id", householdId)
      .eq("week_start_date", mondayOf(tmr))
      .maybeSingle();
    if (tmp) {
      const { data: td } = await supabase
        .from("meal_plan_days")
        .select("dinner_status, away, dinner_recipe_id, dinner_note, lunch_note")
        .eq("meal_plan_id", tmp.id)
        .eq("date", tmrStr)
        .maybeSingle();
      if (td) {
        let dinner: string | null;
        if (td.away) dinner = "Away — no meals";
        else if (td.dinner_status === "eating_out") dinner = "Eating out";
        else if (td.dinner_status === "ordered_in") dinner = "Ordering in";
        else if (td.dinner_recipe_id) {
          const { data: r } = await supabase
            .from("recipes")
            .select("title")
            .eq("id", td.dinner_recipe_id)
            .maybeSingle();
          dinner = (r?.title as string) ?? "Dinner";
        } else dinner = (td.dinner_note as string | null) ?? null;
        setTomorrow({ dinner, lunch: (td.lunch_note as string | null) ?? null });
      } else setTomorrow(null);
    } else setTomorrow(null);

    // Catch up: recent planned home dinners (last 7 days) not yet logged.
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const { data: recentPlans } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("household_id", householdId)
      .gte("week_start_date", ymd(twoWeeksAgo))
      .lte("week_start_date", todayStr);
    const planIds = (recentPlans ?? []).map((p) => p.id as string);
    let cu: CatchupRow[] = [];
    if (planIds.length) {
      const { data: pastDays } = await supabase
        .from("meal_plan_days")
        .select("id, date, dinner_recipe_id, dinner_side_ids")
        .in("meal_plan_id", planIds)
        .gte("date", ymd(weekAgo))
        .lt("date", todayStr)
        .eq("dinner_status", "home")
        .eq("dinner_cooked", false)
        .eq("dinner_skipped", false)
        .eq("away", false)
        .not("dinner_recipe_id", "is", null)
        .order("date", { ascending: false });
      const rows = pastDays ?? [];
      const rIds = Array.from(
        new Set(rows.map((r) => r.dinner_recipe_id).filter(Boolean))
      ) as string[];
      const tmap = new Map<string, string>();
      if (rIds.length) {
        const { data: recs } = await supabase
          .from("recipes")
          .select("id, title")
          .in("id", rIds);
        (recs ?? []).forEach((r) => tmap.set(r.id as string, r.title as string));
      }
      cu = rows.map((r) => ({
        id: r.id as string,
        date: r.date as string,
        dinner_recipe_id: r.dinner_recipe_id as string | null,
        dinner_side_ids: (r.dinner_side_ids as string[] | null) ?? null,
        title: tmap.get(r.dinner_recipe_id as string) ?? "Dinner",
      }));
    }
    setCatchup(cu);

    setLoading(false);
  }, [supabase, householdId, today, todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Cook a planned dinner (deduct primary + sides), reusable ------------
  async function performCook(opts: {
    planDayId: string;
    recipeIds: string[];
    logRecipeId: string | null;
    logNote: string;
    toastLabel: string;
    onCooked: () => void;
    onUndo: () => void;
  }) {
    const recipeIds = opts.recipeIds.filter(Boolean) as string[];
    if (!recipeIds.length) return;

    const { data: ings } = await supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit, is_staple")
      .in("recipe_id", recipeIds);

    const sums = new Map<string, number>();
    (ings ?? [])
      .filter((i) => !i.is_staple && i.name)
      .forEach((i) => {
        const p = pantry.find((x) => namesMatch(i.name as string, x.name));
        if (!p) return;
        let amt = 1;
        const iq = i.quantity as number | null;
        if (iq && Number.isFinite(iq)) {
          const iu = ((i.unit as string) ?? "").trim().toLowerCase();
          const pu = (p.unit ?? "").trim().toLowerCase();
          if (iu === pu) amt = iq;
        }
        sums.set(p.id, (sums.get(p.id) ?? 0) + amt);
      });

    const changes = [...sums.entries()].map(([id, dec]) => {
      const p = pantry.find((x) => x.id === id)!;
      return {
        id,
        old: p.quantity,
        next: Math.max(0, Math.round((p.quantity - dec) * 100) / 100),
      };
    });

    await Promise.all(
      changes.map((c) =>
        supabase.from("pantry_items").update({ quantity: c.next }).eq("id", c.id)
      )
    );
    setPantry((prev) =>
      prev.map((p) => {
        const c = changes.find((x) => x.id === p.id);
        return c ? { ...p, quantity: c.next } : p;
      })
    );
    await supabase
      .from("meal_plan_days")
      .update({ dinner_cooked: true })
      .eq("id", opts.planDayId);
    opts.onCooked();

    const { data: log } = await supabase
      .from("consumption_log")
      .insert({
        household_id: householdId,
        recipe_id: opts.logRecipeId,
        note: opts.logNote,
      })
      .select("id")
      .single();
    const logId = log?.id as string | undefined;

    setToast({
      msg: `${opts.toastLabel} — ${changes.length} pantry item${
        changes.length === 1 ? "" : "s"
      } updated`,
      undo: async () => {
        await Promise.all(
          changes.map((c) =>
            supabase.from("pantry_items").update({ quantity: c.old }).eq("id", c.id)
          )
        );
        setPantry((prev) =>
          prev.map((p) => {
            const c = changes.find((x) => x.id === p.id);
            return c ? { ...p, quantity: c.old } : p;
          })
        );
        await supabase
          .from("meal_plan_days")
          .update({ dinner_cooked: false })
          .eq("id", opts.planDayId);
        opts.onUndo();
        if (logId) await supabase.from("consumption_log").delete().eq("id", logId);
        setToast(null);
      },
    });
  }

  async function cookDinner() {
    if (!day || day.dinner_cooked) return;
    await performCook({
      planDayId: day.id,
      recipeIds: [day.dinner_recipe_id, ...(day.dinner_side_ids ?? [])].filter(
        Boolean
      ) as string[],
      logRecipeId: day.dinner_recipe_id,
      logNote: "Cooked tonight's dinner",
      toastLabel: "Dinner cooked",
      onCooked: () => setDay((cur) => (cur ? { ...cur, dinner_cooked: true } : cur)),
      onUndo: () => setDay((cur) => (cur ? { ...cur, dinner_cooked: false } : cur)),
    });
  }

  async function cookCatchup(row: CatchupRow) {
    await performCook({
      planDayId: row.id,
      recipeIds: [row.dinner_recipe_id, ...(row.dinner_side_ids ?? [])].filter(
        Boolean
      ) as string[],
      logRecipeId: row.dinner_recipe_id,
      logNote: `Cooked ${row.title} (${row.date})`,
      toastLabel: `${row.title} logged`,
      onCooked: () => setCatchup((prev) => prev.filter((x) => x.id !== row.id)),
      onUndo: () => setCatchup((prev) => [row, ...prev]),
    });
  }

  // "Didn't cook": clear from the catch-up list without touching the pantry.
  async function skipCatchup(row: CatchupRow) {
    setCatchup((prev) => prev.filter((x) => x.id !== row.id));
    await supabase
      .from("meal_plan_days")
      .update({ dinner_skipped: true })
      .eq("id", row.id);
    setToast({
      msg: `${row.title} marked not cooked — pantry unchanged`,
      undo: async () => {
        await supabase
          .from("meal_plan_days")
          .update({ dinner_skipped: false })
          .eq("id", row.id);
        setCatchup((prev) => [row, ...prev]);
        setToast(null);
      },
    });
  }

  // ---- Lunchbox: edit name, then pack (deduct matched pantry) ---------------
  function editLb(id: string, name: string) {
    setLunchboxes((arr) => arr.map((l) => (l.id === id ? { ...l, name } : l)));
  }
  async function packLb(item: LbItem) {
    if (item.packed) return;
    await supabase
      .from("lunchbox_items")
      .update({ name: item.name.trim(), packed: true })
      .eq("id", item.id);
    setLunchboxes((arr) =>
      arr.map((l) => (l.id === item.id ? { ...l, packed: true } : l))
    );
    const p = pantry.find((x) => namesMatch(item.name, x.name));
    if (p) {
      const next = Math.max(0, Math.round((p.quantity - (item.quantity ?? 1)) * 100) / 100);
      await supabase.from("pantry_items").update({ quantity: next }).eq("id", p.id);
      setPantry((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, quantity: next } : x))
      );
    }
  }

  const dateLabel = today.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hour = today.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const dinnerText = (() => {
    if (!day) return null;
    if (day.away) return "Away — no meals";
    if (day.dinner_status === "eating_out") return "Eating out";
    if (day.dinner_status === "ordered_in") return "Ordering in (Uber Eats)";
    if (day.dinner_recipe_id) return titles.get(day.dinner_recipe_id) ?? "Dinner";
    return day.dinner_note ?? "—";
  })();
  const canCook =
    !!day && !day.away && day.dinner_status === "home" && !!day.dinner_recipe_id;

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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              aria-label="Send feedback"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
            >
              <MessageIcon className="h-5 w-5" />
            </button>
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
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-28 pt-6">
        <div className="mb-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">
            {greeting}
            {displayName ? `, ${displayName}` : ""}
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-[1.1] tracking-tightest text-ink">
            {dateLabel}
          </h1>
        </div>

        <UseSoonStrip items={expiring} />

        {/* Tonight's dinner */}
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
          <div className="rounded-card border border-border bg-surface p-5 shadow-hero">
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : !day ? (
              <div>
                <p className="text-[15px] text-ink">No plan for today yet.</p>
                <Link href="/plan" className="mt-1 inline-block text-[14px] font-medium text-brand">
                  Plan your week →
                </Link>
              </div>
            ) : (
              <>
                {day.dinner_recipe_id &&
                  images.get(day.dinner_recipe_id) && (
                    <button
                      onClick={() => openRecipe(day.dinner_recipe_id)}
                      className="mb-4 block w-full"
                      aria-label={`View ${dinnerText}`}
                    >
                      <RecipePhoto
                        url={images.get(day.dinner_recipe_id)}
                        className="h-40 w-full rounded-xl"
                        iconClassName="h-9 w-9"
                      />
                    </button>
                  )}
                {day.dinner_recipe_id ? (
                  <button
                    onClick={() => openRecipe(day.dinner_recipe_id)}
                    className="text-left text-[16px] font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {dinnerText}
                  </button>
                ) : (
                  <p className="text-[16px] font-medium text-ink">{dinnerText}</p>
                )}
                {(day.dinner_side_ids ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(day.dinner_side_ids ?? []).map((sid) => (
                      <button
                        key={sid}
                        onClick={() => openRecipe(sid)}
                        className="rounded-lg bg-brand-tint px-2 py-1 text-[12px] font-medium text-brand"
                      >
                        {titles.get(sid) ?? "Side"}
                      </button>
                    ))}
                  </div>
                )}
                {day.dinner_recipe_id && (
                  <p className="mt-2 text-[12px] text-faint">
                    Tap the dinner to see the full recipe.
                  </p>
                )}
                {day.breakfast_note && (
                  <div className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] text-muted">
                    <p>Breakfast: {day.breakfast_note}</p>
                  </div>
                )}
                {canCook && (
                  <button
                    onClick={cookDinner}
                    disabled={day.dinner_cooked}
                    className={`mt-3 flex min-h-tap w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium ${
                      day.dinner_cooked
                        ? "bg-brand-tint text-brand"
                        : "bg-brand text-white hover:bg-brand-hover"
                    }`}
                  >
                    <CheckIcon className="h-5 w-5" />
                    {day.dinner_cooked ? "Cooked — pantry updated" : "Cooked this — update pantry"}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Today's lunch */}
        {!loading && day && !day.away && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Lunch
            </h2>
            <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
              {day.lunch_note ? (
                <p className="text-[15px] text-ink">{day.lunch_note}</p>
              ) : lunchIdeas ? (
                <div className="space-y-1.5">
                  <p className="text-[13px] text-muted">
                    Tap one to set as today&apos;s lunch:
                  </p>
                  {lunchIdeas.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setLunch(s.title)}
                      className="block w-full rounded-lg border border-border bg-bg px-3 py-2 text-left text-[14px] text-ink hover:border-brand-soft"
                    >
                      {s.title}
                    </button>
                  ))}
                  <button
                    onClick={genLunchIdeas}
                    disabled={lunchLoading}
                    className="text-[12px] font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    {lunchLoading ? "…" : "More ideas"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={genLunchIdeas}
                  disabled={lunchLoading}
                  className="flex min-h-[40px] w-full items-center justify-center rounded-xl bg-brand-tint text-[14px] font-medium text-brand disabled:opacity-50"
                >
                  {lunchLoading ? "Finding lunches…" : "Generate lunch ideas"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Coming up tomorrow */}
        {!loading && tomorrow && (tomorrow.dinner || tomorrow.lunch) && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Coming up tomorrow
            </h2>
            <div className="rounded-card border border-border bg-surface p-4 text-[14px] shadow-soft">
              {tomorrow.dinner && (
                <p className="text-ink">
                  <span className="text-muted">Dinner: </span>
                  {tomorrow.dinner}
                </p>
              )}
              {tomorrow.lunch && (
                <p className="mt-1 text-ink">
                  <span className="text-muted">Lunch: </span>
                  {tomorrow.lunch}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Catch up: earlier planned dinners not yet logged */}
        {!loading && catchup.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Catch up on earlier dinners
            </h2>
            <div className="space-y-2">
              {catchup.map((row) => {
                const label = new Date(row.date).toLocaleDateString("en-AU", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {row.title}
                      </p>
                      <p className="text-[12px] text-muted">{label}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                      <button
                        onClick={() => cookCatchup(row)}
                        className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-brand px-3.5 text-[14px] font-medium text-white hover:bg-brand-hover"
                      >
                        <CheckIcon className="h-4 w-4" />
                        Cooked this
                      </button>
                      <button
                        onClick={() => skipCatchup(row)}
                        className="min-h-[34px] rounded-xl border border-border bg-surface px-3.5 text-[13px] font-medium text-muted hover:text-ink"
                      >
                        Didn&apos;t cook
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              Missed logging a dinner? Tick it here and we&apos;ll update the pantry.
            </p>
          </section>
        )}

        {/* Today's lunchboxes */}
        {!loading && day?.kids_present && !day.away && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Lunchboxes
            </h2>
            <div className="space-y-3">
              {([1, 2] as const).map((slot) => {
                const mine = lunchboxes.filter((l) => l.child_slot === slot);
                return (
                  <div key={slot} className="rounded-card border border-border bg-surface p-4 shadow-soft">
                    <p className="mb-2 text-[15px] font-semibold text-ink">
                      {childNames[slot - 1]}
                    </p>
                    {mine.length === 0 ? (
                      <p className="text-[13px] text-faint">Nothing planned.</p>
                    ) : (
                      <div className="space-y-3">
                        {LUNCH_COMPONENTS.map((c) => {
                          const items = mine.filter((l) => l.component === c.value);
                          if (!items.length) return null;
                          return (
                            <div key={c.value}>
                              <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                                {c.label}
                              </p>
                              <div className="space-y-1.5">
                                {items.map((it) => (
                                  <div key={it.id} className="flex items-center gap-2">
                                    <input
                                      value={it.name}
                                      onChange={(e) => editLb(it.id, e.target.value)}
                                      disabled={it.packed}
                                      className={`min-h-[38px] flex-1 rounded-lg border border-border bg-surface px-3 text-[14px] focus:border-brand ${
                                        it.packed ? "text-faint line-through" : "text-ink"
                                      }`}
                                    />
                                    <button
                                      onClick={() => packLb(it)}
                                      disabled={it.packed}
                                      aria-label={it.packed ? "Packed" : "Mark packed"}
                                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                        it.packed
                                          ? "border-brand bg-brand text-white"
                                          : "border-border text-transparent hover:text-muted"
                                      }`}
                                    >
                                      <CheckIcon className="h-5 w-5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-center text-[12px] text-faint">
                Edit an item before ticking (e.g. apple → banana); ticking deducts it
                from your pantry.
              </p>
            </div>
          </section>
        )}
      </main>

      <RecipeView recipe={viewRecipe} onClose={() => setViewRecipe(null)} />

      <FeedbackSheet
        open={feedbackOpen}
        householdId={householdId}
        page="today"
        onClose={() => setFeedbackOpen(false)}
      />

      {toast && (
        <div className="safe-bottom fixed inset-x-4 bottom-20 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 shadow-pop">
          <span className="text-[14px] text-surface">{toast.msg}</span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => toast.undo()}
              className="text-[14px] font-semibold text-brand-ring"
            >
              Undo
            </button>
            <button
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="flex h-6 w-6 items-center justify-center text-surface/60 hover:text-surface"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
