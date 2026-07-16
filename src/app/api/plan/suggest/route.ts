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

const SYSTEM_PROMPT = `You invent simple home meals a household can cook mostly from what they already have.
You get their current pantry/fridge/freezer list; some items are flagged (use soon).
Propose exactly 3 realistic meals. This is generative — do NOT look for a specific named recipe.
A plain "steak with roast veg" or "omelette" is perfectly good.
Rules:
- Strongly favour items flagged (use soon) so nothing is wasted.
- Build meals mostly from listed items. You MAY assume basic staples are on hand
  (salt, pepper, cooking oil, butter, common dried herbs/spices, water) even if not listed.
- Reasonable substitutions are fine (e.g. any pasta shape, any leafy green).
- AVOID chilli / spicy heat entirely (household preference).
- Keep meals quick and weeknight-friendly. Keep the method to 3-5 short steps.
Return ONLY compact JSON (no prose, no markdown fences), and keep it short enough to be complete:
{"suggestions":[{"title":"string","servings":number,"prep_min":number|null,"cook_min":number|null,"tags":["kid_friendly"|"lunchbox"|"snack"|"quick"|"freezer_friendly"|"adults_only"],"instructions":"string","ingredients":[{"name":"string","quantity":number|null,"unit":"string|null","is_staple":boolean}]}]}
- is_staple true for salt, pepper, water, oil, butter, common dried spices.`;

function extractJson(text: string): { suggestions?: unknown[] } | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // 1) whole string  2) outermost {…}  3) outermost […]
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

  // Accept a bare array, {suggestions:[...]}, or any object with an array value.
  if (Array.isArray(obj)) return { suggestions: obj };
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.suggestions)) return { suggestions: rec.suggestions };
  const firstArray = Object.values(rec).find((v) => Array.isArray(v));
  if (Array.isArray(firstArray)) return { suggestions: firstArray };
  return null;
}

export async function POST() {
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
        i.expiry_date && (i.expiry_date as string) <= soonStr
          ? " (use soon)"
          : "";
      const qty = `${i.quantity ?? ""}${i.unit ? " " + i.unit : ""}`.trim();
      return `- ${i.name}${qty ? ` (${qty})` : ""} [${i.location}]${useSoon}`;
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
          { role: "user", content: `Current stock:\n${list}\n\nSuggest meals.` },
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
        { error: "Couldn't generate suggestions. Try again." },
        { status: 422 }
      );
    }

    const suggestions: RecipeDraft[] = (parsed.suggestions as Record<string, unknown>[])
      .slice(0, 5)
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
        return {
          title: (s.title ? String(s.title) : "Suggested meal").slice(0, 120),
          servings:
            typeof s.servings === "number" && s.servings > 0
              ? Math.round(s.servings as number)
              : 2,
          prep_min: typeof s.prep_min === "number" ? (s.prep_min as number) : null,
          cook_min: typeof s.cook_min === "number" ? (s.cook_min as number) : null,
          tags,
          instructions: s.instructions ? String(s.instructions) : "",
          source_url: null,
          source_type: "suggested" as const,
          ingredients,
        };
      })
      .filter((d) => d.ingredients.length > 0);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong generating suggestions." },
      { status: 500 }
    );
  }
}
