import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import type { RecipeDraft, RecipeIngredient, RecipeTag } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const VALID_TAGS: RecipeTag[] = [
  "kid_friendly",
  "lunchbox",
  "snack",
  "quick",
  "freezer_friendly",
  "adults_only",
];

const SYSTEM_PROMPT = `You convert a recipe (given as web-page content or pasted text) into structured JSON.
Return ONLY this JSON shape, no prose, no markdown fences:
{"title":"string","servings":number,"prep_min":number|null,"cook_min":number|null,"tags":["kid_friendly"|"lunchbox"|"snack"|"quick"|"freezer_friendly"|"adults_only"],"instructions":"string","ingredients":[{"name":"string","quantity":number|null,"unit":"string|null","is_staple":boolean}]}
Rules:
- ingredients: split each line into a clean ingredient name (no quantity words in the name), a numeric quantity if stated (else null), and a short unit if stated (else null).
- is_staple = true for pantry staples the household always has: salt, pepper, water, cooking oil, common dried spices. Everything else false.
- tags: include only those that clearly apply; [] if unsure.
- servings: integer; default 2 if not stated.
- instructions: summarise the method concisely in your OWN words as short numbered steps. Do NOT copy long passages verbatim.
- Ignore ads, comments, and site navigation.`;

function extractJson(text: string): Partial<RecipeDraft> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Pull a JSON-LD Recipe object out of page HTML, if present (cleaner than text).
function findJsonLdRecipe(html: string): Record<string, unknown> | null {
  const blocks = html.match(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return null;
  for (const block of blocks) {
    const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      const parsed = JSON.parse(json);
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] ?? [parsed];
      for (const node of nodes) {
        const type = node?.["@type"];
        const isRecipe = Array.isArray(type)
          ? type.includes("Recipe")
          : type === "Recipe";
        if (isRecipe) return node as Record<string, unknown>;
      }
    } catch {
      /* try next block */
    }
  }
  return null;
}

// A recipe's "image" field can be a string, an array, or an ImageObject.
function pickImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const u = pickImageUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return pickImageUrl(o.url ?? o["@id"] ?? null);
  }
  return null;
}

// Fall back to the page's social-share image.
function ogImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Resolve relative image paths against the page URL; drop anything unparseable
// or non-http(s) so we never store junk.
function absolutize(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    const u = new URL(src.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
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
      { error: "Recipe import isn't set up yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  let url: string | undefined;
  let text: string | undefined;
  try {
    const body = await request.json();
    url = body.url?.trim();
    text = body.text?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let content = "";
  let sourceUrl: string | null = null;
  let imageUrl: string | null = null;

  if (url) {
    sourceUrl = url;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; PantryApp/1.0)" },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Couldn't fetch that page (${res.status}).` },
          { status: 422 }
        );
      }
      const html = await res.text();
      const node = findJsonLdRecipe(html);
      content = node ? JSON.stringify(node).slice(0, 12000) : htmlToText(html);
      imageUrl = absolutize(pickImageUrl(node?.image) ?? ogImage(html), url);
    } catch {
      return NextResponse.json(
        { error: "Couldn't reach that URL. Try pasting the recipe text instead." },
        { status: 422 }
      );
    }
  } else if (text) {
    content = text.slice(0, 12000);
  } else {
    return NextResponse.json({ error: "Paste a link or some text." }, { status: 400 });
  }

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
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Recipe content:\n\n${content}` }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Parsing failed (${res.status}).`, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const out: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ?? "";
    const parsed = extractJson(out);
    if (!parsed || !Array.isArray(parsed.ingredients)) {
      return NextResponse.json(
        { error: "Couldn't read a recipe from that. Try pasting the text." },
        { status: 422 }
      );
    }

    const ingredients: RecipeIngredient[] = parsed.ingredients
      .filter((i) => i && typeof i.name === "string" && i.name.trim())
      .slice(0, 60)
      .map((i) => ({
        name: normalizeName(i.name),
        quantity:
          typeof i.quantity === "number" && Number.isFinite(i.quantity)
            ? i.quantity
            : null,
        unit: i.unit ? String(i.unit).slice(0, 16) : null,
        is_staple: Boolean(i.is_staple),
      }));

    const tags = (Array.isArray(parsed.tags) ? parsed.tags : []).filter(
      (t): t is RecipeTag => VALID_TAGS.includes(t as RecipeTag)
    );

    const draft: RecipeDraft = {
      title: (parsed.title ? String(parsed.title) : "Untitled recipe").slice(0, 120),
      servings:
        typeof parsed.servings === "number" && parsed.servings > 0
          ? Math.round(parsed.servings)
          : 2,
      prep_min: typeof parsed.prep_min === "number" ? parsed.prep_min : null,
      cook_min: typeof parsed.cook_min === "number" ? parsed.cook_min : null,
      tags,
      instructions: parsed.instructions ? String(parsed.instructions) : "",
      source_url: sourceUrl,
      image_url: imageUrl,
      ingredients,
    };

    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong importing the recipe." },
      { status: 500 }
    );
  }
}
