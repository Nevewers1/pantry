import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import type { RecipeDraft, RecipeIngredient, RecipeTag } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const VALID_TAGS: RecipeTag[] = [
  "kid_friendly",
  "lunchbox",
  "snack",
  "quick",
  "freezer_friendly",
  "adults_only",
];

const SYSTEM_PROMPT = `You suggest dinner ideas for ONE day for a household, cooking mostly from what they already have.
You get: the date + weekday, whether kids are here that day, the current pantry/fridge/freezer list
(some items flagged "use soon"), and a list of dinners already planned this week (avoid repeating them).
Propose exactly 3 realistic dinner options. This is generative — do NOT look for a specific named recipe;
a plain "steak with roast veg" or "tuna pasta bake" is perfectly good.
Rules:
- Strongly favour items flagged (use soon) so nothing is wasted.
- Build meals mostly from listed items. You MAY assume basic staples are on hand
  (salt, pepper, cooking oil, butter, common dried herbs/spices, water) even if not listed.
- If kids are here, make options kid-friendly and tag them "kid_friendly".
- If the household names a CRAVING (a dish, cuisine, or ingredient), make that the
  priority: at least 2 of the 3 ideas should clearly satisfy it (e.g. craving
  "risotto" → propose risotto variations). Interpret the craving GENEROUSLY and
  correct obvious misspellings or phonetic spellings before matching (e.g.
  "rissotto"/"risoto" → risotto, "lasagna"/"lasagne", "gnocci" → gnocchi,
  "bolognaise" → bolognese). Still use their stock where you can and never break
  the no-chilli rule.
- AVOID chilli / spicy heat entirely (household preference).
- Do NOT repeat any dinner already planned this week.
- Keep meals quick and weeknight-friendly. Keep the method to 3-5 short steps.
Return ONLY compact JSON (no prose, no markdown fences), and keep it short enough to be complete:
{"suggestions":[{"title":"string","meal_type":"full|main","servings":number,"prep_min":number|null,"cook_min":number|null,"tags":["kid_friendly"|"lunchbox"|"snack"|"quick"|"freezer_friendly"|"adults_only"],"instructions":"string","ingredients":[{"name":"string","quantity":number|null,"unit":"string|null","is_staple":boolean}]}]}
- meal_type "full" = a complete dinner; "main" = needs a side. is_staple true for salt, pepper, water, oil, butter, common dried spices.`;

function extractJson(text: string): { suggestions?: unknown[] } | null {
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
  if (obj == null) {
    const a1 = cleaned.indexOf("[");
    const a2 = cleaned.lastIndexOf("]");
    if (a1 !== -1 && a2 > a1) obj = tryParse(cleaned.slice(a1, a2 + 1));
  }
  if (obj == null) return null;

  if (Array.isArray(obj)) return { suggestions: obj };
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.suggestions)) return { suggestions: rec.suggestions };
  const firstArray = Object.values(rec).find((v) => Array.isArray(v));
  if (Array.isArray(firstArray)) return { suggestions: firstArray };
  return null;
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
      { error: "Suggestions aren't set up yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  let date = "";
  let kidsPresent = false;
  let excludeTitles: string[] = [];
  let craving = "";
  try {
    const body = await request.json();
    date = typeof body.date === "string" ? body.date : "";
    kidsPresent = Boolean(body.kids_present);
    excludeTitles = Array.isArray(body.exclude_titles)
      ? body.exclude_titles.filter((t: unknown) => typeof t === "string").slice(0, 30)
      : [];
    craving = typeof body.craving === "string" ? body.craving.trim().slice(0, 120) : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: items } = await supabase
    .from("pantry_items")
    .select("name, quantity, unit, expiry_date, location")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "Your pantry is empty — add some items first." },
      { status: 422 }
    );
  }

  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  const soonStr = soon.toISOString().slice(0, 10);

  const list = items
    .map((i) => {
      const useSoon =
        i.expiry_date && (i.expiry_date as string) <= soonStr ? " (use soon)" : "";
      const qty = `${i.quantity ?? ""}${i.unit ? " " + i.unit : ""}`.trim();
      return `- ${i.name}${qty ? ` (${qty})` : ""} [${i.location}]${useSoon}`;
    })
    .join("\n");

  const wd = date
    ? new Date(date).toLocaleDateString("en-AU", { weekday: "long" })
    : "";
  const dayLine = date
    ? `${date}${wd ? ` (${wd})` : ""} — kids ${kidsPresent ? "here" : "not here"}`
    : `kids ${kidsPresent ? "here" : "not here"}`;
  const avoidLine = excludeTitles.length
    ? `\n\nAlready planned this week (do NOT repeat):\n${excludeTitles
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "";
  const cravingLine = craving
    ? `\n\nThe household is CRAVING: ${craving}\nCorrect any obvious misspelling of this first, then make at least two of the three ideas clearly match it.`
    : "";

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
            content: `Day to plan a dinner for:\n${dayLine}\n\nCurrent stock:\n${list}${avoidLine}${cravingLine}\n\nSuggest 3 dinners for this day.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Suggestion request failed (${res.status}).`, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const out: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ?? "";
    const parsed = extractJson(out);
    if (!parsed || !Array.isArray(parsed.suggestions)) {
      return NextResponse.json(
        { error: "Couldn't generate ideas. Try again." },
        { status: 422 }
      );
    }

    const suggestions: RecipeDraft[] = (parsed.suggestions as Record<string, unknown>[])
      .slice(0, 4)
      .map((s) => {
        const rawIngs = Array.isArray(s.ingredients)
          ? (s.ingredients as Record<string, unknown>[])
          : [];
        const ingredients: RecipeIngredient[] = rawIngs
          .filter((i) => i && typeof i.name === "string" && String(i.name).trim())
          .map((i) => ({
            name: normalizeName(String(i.name)),
            quantity:
              typeof i.quantity === "number" && Number.isFinite(i.quantity)
                ? (i.quantity as number)
                : null,
            unit: i.unit ? String(i.unit).slice(0, 16) : null,
            is_staple: Boolean(i.is_staple),
          }));
        const tags = (Array.isArray(s.tags) ? s.tags : []).filter(
          (t): t is RecipeTag => VALID_TAGS.includes(t as RecipeTag)
        );
        const mt = s.meal_type === "main" || s.meal_type === "full" ? s.meal_type : "full";
        return {
          title: (s.title ? String(s.title) : "Suggested dinner").slice(0, 120),
          servings:
            typeof s.servings === "number" && s.servings > 0
              ? Math.round(s.servings as number)
              : 4,
          prep_min: typeof s.prep_min === "number" ? (s.prep_min as number) : null,
          cook_min: typeof s.cook_min === "number" ? (s.cook_min as number) : null,
          tags,
          meal_type: mt as RecipeDraft["meal_type"],
          instructions: s.instructions ? String(s.instructions) : "",
          source_url: null,
          source_type: "suggested" as const,
          ingredients,
        };
      })
      .filter((d) => d.ingredients.length > 0);

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "Couldn't generate ideas. Try again." },
        { status: 422 }
      );
    }

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong generating ideas." },
      { status: 500 }
    );
  }
}
