import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { namesMatch, normalizeName } from "@/lib/normalize";
import type { StoreTag } from "@/lib/types";

export const runtime = "nodejs";

type Need = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
};

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No household." }, { status: 400 });
  const householdId = profile.household_id as string;

  let weekStart = "";
  try {
    weekStart = String((await request.json()).week_start ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!weekStart) {
    return NextResponse.json({ error: "No week given." }, { status: 400 });
  }
  const weekEnd = addDaysStr(weekStart, 6);

  // --- Gather "needs" ------------------------------------------------------
  const needs: Need[] = [];

  // Plan for the week (may be absent).
  const { data: mp } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start_date", weekStart)
    .maybeSingle();
  const mealPlanId = (mp?.id as string) ?? null;

  if (mealPlanId) {
    const { data: mpDays } = await supabase
      .from("meal_plan_days")
      .select("dinner_recipe_id, dinner_side_ids, away, dinner_status")
      .eq("meal_plan_id", mealPlanId);
    const homeDays = (mpDays ?? []).filter(
      (d) => !d.away && d.dinner_status === "home"
    );
    const recipeIds = Array.from(
      new Set([
        ...homeDays
          .filter((d) => d.dinner_recipe_id)
          .map((d) => d.dinner_recipe_id as string),
        ...homeDays.flatMap(
          (d) => (d.dinner_side_ids as string[] | null) ?? []
        ),
      ])
    );

    if (recipeIds.length) {
      // Guard against bad rows where a recipe's own title was stored as an
      // "ingredient" — those are dish names, not things to buy.
      const { data: recTitles } = await supabase
        .from("recipes")
        .select("title")
        .in("id", recipeIds);
      const titleSet = new Set(
        (recTitles ?? [])
          .map((r) => normalizeName(r.title as string))
          .filter(Boolean)
      );

      const { data: ings } = await supabase
        .from("recipe_ingredients")
        .select("name, quantity, unit, is_staple")
        .in("recipe_id", recipeIds);
      (ings ?? [])
        .filter((i) => !i.is_staple)
        .filter((i) => !titleSet.has(normalizeName(i.name as string)))
        .forEach((i) =>
          needs.push({
            name: i.name as string,
            quantity: (i.quantity as number | null) ?? 1,
            unit: (i.unit as string | null) ?? null,
            category: null,
          })
        );
    }
  }

  // Lunchbox items across the week.
  const { data: lbs } = await supabase
    .from("lunchbox_items")
    .select("name, quantity, unit")
    .gte("date", weekStart)
    .lte("date", weekEnd);
  (lbs ?? []).forEach((l) =>
    needs.push({
      name: l.name as string,
      quantity: (l.quantity as number | null) ?? 1,
      unit: (l.unit as string | null) ?? null,
      category: null,
    })
  );

  // Pantry (for stock subtraction + low-stock nominations).
  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("name, quantity, unit, min_threshold, category");
  const pantryRows = pantry ?? [];

  pantryRows
    .filter(
      (p) =>
        p.min_threshold != null &&
        (p.quantity as number) <= (p.min_threshold as number)
    )
    .forEach((p) =>
      needs.push({
        name: p.name as string,
        quantity: 1,
        unit: (p.unit as string | null) ?? null,
        category: (p.category as string | null) ?? null,
      })
    );

  // --- Aggregate by normalised name ---------------------------------------
  const agg = new Map<string, Need>();
  for (const n of needs) {
    const key = normalizeName(n.name);
    if (!key) continue;
    const ex = agg.get(key);
    if (ex) {
      ex.quantity = (ex.quantity ?? 0) + (n.quantity ?? 1);
      if (!ex.category && n.category) ex.category = n.category;
    } else {
      agg.set(key, { ...n });
    }
  }

  // --- Subtract stock (skip anything adequately in the pantry) -------------
  const stocked = pantryRows.filter(
    (p) =>
      (p.quantity as number) > 0 &&
      !(
        p.min_threshold != null &&
        (p.quantity as number) <= (p.min_threshold as number)
      )
  );
  const finalNeeds = [...agg.values()].filter(
    (need) => !stocked.some((p) => namesMatch(need.name, p.name as string))
  );

  // --- Cheapest known store/price per item ---------------------------------
  const { data: prices } = await supabase
    .from("price_history")
    .select("item_name, store, price");
  const priceRows = prices ?? [];

  function cheapest(name: string): { store: StoreTag; price: number | null } {
    const matches = priceRows.filter((p) =>
      namesMatch(name, p.item_name as string)
    );
    if (!matches.length) return { store: "any", price: null };
    const best = matches.reduce((a, b) =>
      (b.price as number) < (a.price as number) ? b : a
    );
    return { store: best.store as StoreTag, price: best.price as number };
  }

  // --- Replace the list for this plan/week ---------------------------------
  const del = supabase
    .from("shopping_list_items")
    .delete()
    .eq("household_id", householdId);
  await (mealPlanId
    ? del.eq("meal_plan_id", mealPlanId)
    : del.is("meal_plan_id", null));

  if (finalNeeds.length) {
    const rows = finalNeeds.map((n) => {
      const { store, price } = cheapest(n.name);
      return {
        household_id: householdId,
        meal_plan_id: mealPlanId,
        name: n.name,
        quantity: n.quantity != null ? Math.round(n.quantity * 100) / 100 : 1,
        unit: n.unit,
        category: n.category,
        store,
        est_price: price,
        is_checked: false,
        added_to_pantry: false,
      };
    });
    const { error } = await supabase.from("shopping_list_items").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: list } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("household_id", householdId)
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return NextResponse.json({ items: list ?? [] });
}
