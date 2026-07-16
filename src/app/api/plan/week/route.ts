import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PlanDayResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You plan a household's dinners (plus light notes) for 7 days.
You get: the 7 days (each with weekday, date, and whether the kids are here), the household's
saved recipe library (id | title | tags), and current food stock (some flagged "use soon").

Household rules:
- Plan a DINNER every day. Prefer a recipe from the library when it fits — reference it by its exact id.
  If nothing fits, invent a simple dinner and put it in dinner_note (leave dinner_recipe_id null).
- Favour dinners that use stock flagged "use soon" so nothing is wasted; minimise new shopping.
- Don't repeat the same dinner within the week.
- Kids-here days: keep dinners kid-friendly; add a school-day LUNCHBOX note (sandwich/fruit/snack ideas).
  On kids-here WEEKEND days add a breakfast_note (cereal, or toast with cheese & salami).
  Add a healthy snack idea in snack_notes on kids-here days.
- Adults-only days: dinners can be more adult; no lunchbox needed.
- AVOID chilli / spicy heat entirely (household preference).

Return ONLY compact JSON (no prose, no fences):
{"days":[{"date":"YYYY-MM-DD","dinner_recipe_id":"<id or null>","dinner_note":"<string or null>","lunch_note":"<string or null>","breakfast_note":"<string or null>","lunchbox_notes":"<string or null>","snack_notes":"<string or null>"}]}
Return exactly one entry per day given, in the same order. Keep notes short.`;

function extractDays(text: string): unknown[] | null {
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
  if (obj == null) return null;
  if (Array.isArray(obj)) return obj;
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.days)) return rec.days;
  const firstArray = Object.values(rec).find((v) => Array.isArray(v));
  return Array.isArray(firstArray) ? firstArray : null;
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
  try {
    const body = await request.json();
    days = Array.isArray(body.days) ? body.days : [];
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (days.length === 0) {
    return NextResponse.json({ error: "No days to plan." }, { status: 400 });
  }

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, tags, is_favourite");
  const recipeIds = new Set((recipes ?? []).map((r) => r.id as string));

  const { data: stock } = await supabase
    .from("pantry_items")
    .select("name, quantity, unit, expiry_date")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  const soonStr = soon.toISOString().slice(0, 10);

  const recipeList =
    (recipes ?? [])
      .map(
        (r) =>
          `${r.id} | ${r.title}${
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
      const wd = new Date(d.date).toLocaleDateString("en-AU", {
        weekday: "long",
      });
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
            content: `Days to plan:\n${dayLines}\n\nRecipe library:\n${recipeList}\n\nCurrent stock:\n${stockList}\n\nPlan the week.`,
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
    const rawDays = extractDays(out);
    if (!rawDays) {
      return NextResponse.json(
        { error: "Couldn't build a plan. Try again." },
        { status: 422 }
      );
    }

    // Map the model output back onto the requested days (by order), keeping kids flags.
    const result: PlanDayResult[] = days.map((d, i) => {
      const raw = (rawDays[i] ?? {}) as Record<string, unknown>;
      const rid =
        typeof raw.dinner_recipe_id === "string" &&
        recipeIds.has(raw.dinner_recipe_id)
          ? raw.dinner_recipe_id
          : null;
      return {
        date: d.date,
        kids_present: d.kids_present,
        dinner_recipe_id: rid,
        dinner_note: rid ? null : str(raw.dinner_note),
        lunch_note: str(raw.lunch_note),
        breakfast_note: str(raw.breakfast_note),
        lunchbox_notes: str(raw.lunchbox_notes),
        snack_notes: str(raw.snack_notes),
      };
    });

    return NextResponse.json({ days: result });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong building the plan." },
      { status: 500 }
    );
  }
}
