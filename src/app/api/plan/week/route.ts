import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { LunchComponent, PlanDayResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const COMPONENTS = ["crunch_sip", "afternoon_tea", "recess"];

const SYSTEM_PROMPT = `You plan a household's meals for 7 days.
You get: the 7 days (weekday, date, kids-here?), the saved recipe library (id | title | tags),
current stock (some flagged "use soon"), and the two children's names.

Recipes are typed: "full" (a complete meal), "main" (needs sides), "side" (a starch or veg).

Rules:
- Plan a DINNER every day (shared). The primary is a library recipe by exact id (a "full" or "main"),
  or invent a simple dinner in dinner_note (leave dinner_recipe_id null).
- SIDES (dinner_side_ids): pick from SIDE recipe ids only.
    • If the primary is a "full" meal (e.g. pasta) → NO sides (empty array).
    • If the primary is a "main" → add a starch side + a veg side when suitable sides exist.
    • Saucy mains (curry, stew, chilli-free braise) → always include a rice-type starch side.
    • It's fine to leave veg off; the family adds veg by hand. Only use ids from the side list.
- Favour stock flagged "use soon"; don't repeat a dinner within the week; avoid chilli/spicy heat.
- breakfast_note: only on kids-here WEEKEND days — a simple cooked breakfast idea; otherwise null.
- lunch_note: an optional adults' work-lunch idea; otherwise null.
- LUNCHBOXES: for each kids-here day, for BOTH children, propose ONE item per component:
    crunch_sip = a piece of fruit; afternoon_tea = a small snack;
    recess = a warm lunch (favour leftovers or a premade meal from stock, else a simple sandwich).
    Kid-friendly, no chilli. The two children may have different items.

Return ONLY compact JSON (no prose, no fences):
{"days":[{"date":"YYYY-MM-DD","dinner_recipe_id":"<id|null>","dinner_side_ids":["<side id>"],"dinner_note":"<string|null>","lunch_note":"<string|null>","breakfast_note":"<string|null>"}],"lunchboxes":[{"date":"YYYY-MM-DD","child_slot":1,"component":"crunch_sip|afternoon_tea|recess","name":"string","quantity":number|null,"unit":"string|null"}]}
child_slot 1 = first child, 2 = second child. Only include lunchboxes for kids-here days. Keep it short.`;

function extractObj(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let obj: unknown = tryParse(cleaned);
  if (obj == null) {
    const o1 = cleaned.indexOf("{");
    const o2 = cleaned.lastIndexOf("}");
    if (o1 !== -1 && o2 > o1) obj = tryParse(cleaned.slice(o1, o2 + 1));
  }
  return obj && typeof obj === "object" && !Array.isArray(obj)
    ? (obj as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Planning isn't set up yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  let days: { date: string; kids_present: boolean }[] = [];
  let childNames: [string, string] = ["Zyana", "Micah"];
  try {
    const body = await request.json();
    days = Array.isArray(body.days) ? body.days : [];
    if (Array.isArray(body.childNames) && body.childNames.length === 2) {
      childNames = [String(body.childNames[0]), String(body.childNames[1])];
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (days.length === 0) {
    return NextResponse.json({ error: "No days to plan." }, { status: 400 });
  }
  const kidsDates = new Set(days.filter((d) => d.kids_present).map((d) => d.date));

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, tags, is_favourite, meal_type");
  const recipeIds = new Set((recipes ?? []).map((r) => r.id as string));
  const sideIds = new Set(
    (recipes ?? [])
      .filter((r) => r.meal_type === "side")
      .map((r) => r.id as string)
  );

  const { data: stock } = await supabase
    .from("pantry_items")
    .select("name, expiry_date")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  const soonStr = soon.toISOString().slice(0, 10);

  const recipeList =
    (recipes ?? [])
      .map(
        (r) =>
          `${r.id} | ${r.title} | ${r.meal_type}${
            (r.tags as string[])?.length ? ` | ${(r.tags as string[]).join(",")}` : ""
          }${r.is_favourite ? " | favourite" : ""}`
      )
      .join("\n") || "(no saved recipes yet)";

  const stockList =
    (stock ?? [])
      .map((i) => {
        const useSoon =
          i.expiry_date && (i.expiry_date as string) <= soonStr ? " (use soon)" : "";
        return `- ${i.name}${useSoon}`;
      })
      .join("\n") || "(pantry empty)";

  const dayLines = days
    .map((d) => {
      const wd = new Date(d.date).toLocaleDateString("en-AU", { weekday: "long" });
      return `${d.date} (${wd}) — kids ${d.kids_present ? "here" : "not here"}`;
    })
    .join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Children: 1=${childNames[0]}, 2=${childNames[1]}\n\nDays to plan:\n${dayLines}\n\nRecipe library:\n${recipeList}\n\nCurrent stock:\n${stockList}\n\nPlan the week.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Plan request failed (${res.status}).`, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const out: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ?? "";
    const parsed = extractObj(out);
    const rawDays = Array.isArray(parsed?.days) ? (parsed!.days as unknown[]) : null;
    if (!rawDays) {
      return NextResponse.json(
        { error: "Couldn't build a plan. Try again." },
        { status: 422 }
      );
    }

    const result: PlanDayResult[] = days.map((d, i) => {
      const raw = (rawDays[i] ?? {}) as Record<string, unknown>;
      const rid =
        typeof raw.dinner_recipe_id === "string" &&
        recipeIds.has(raw.dinner_recipe_id)
          ? raw.dinner_recipe_id
          : null;
      const sides = Array.isArray(raw.dinner_side_ids)
        ? (raw.dinner_side_ids as unknown[]).filter(
            (s): s is string => typeof s === "string" && sideIds.has(s)
          )
        : [];
      return {
        date: d.date,
        kids_present: d.kids_present,
        dinner_recipe_id: rid,
        dinner_side_ids: sides,
        dinner_note: rid ? null : str(raw.dinner_note),
        lunch_note: str(raw.lunch_note),
        breakfast_note: str(raw.breakfast_note),
        lunchbox_notes: null,
        snack_notes: null,
      };
    });

    // Validate lunchbox suggestions (kids-here days only).
    const rawLb = Array.isArray(parsed?.lunchboxes)
      ? (parsed!.lunchboxes as Record<string, unknown>[])
      : [];
    const lunchboxes = rawLb
      .filter(
        (l) =>
          typeof l.date === "string" &&
          kidsDates.has(l.date) &&
          (l.child_slot === 1 || l.child_slot === 2) &&
          typeof l.component === "string" &&
          COMPONENTS.includes(l.component) &&
          typeof l.name === "string" &&
          l.name.trim()
      )
      .slice(0, 60)
      .map((l) => ({
        date: l.date as string,
        child_slot: l.child_slot as 1 | 2,
        component: l.component as LunchComponent,
        name: String(l.name).trim().slice(0, 80),
        quantity:
          typeof l.quantity === "number" && Number.isFinite(l.quantity)
            ? (l.quantity as number)
            : 1,
        unit: l.unit ? String(l.unit).slice(0, 16) : null,
      }));

    return NextResponse.json({ days: result, lunchboxes });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong building the plan." },
      { status: 500 }
    );
  }
}
