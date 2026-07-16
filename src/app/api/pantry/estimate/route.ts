import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOCATIONS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You estimate how long common household grocery items stay good.
You are given a JSON array of items, each with a "name" and a "location" (where it's stored).
For each item, return a typical shelf life in whole DAYS from when it was bought/added, given that storage location.
Guidance: fresh soft produce and raw meat/fish are short (2–6 days); dairy 1–4 weeks; hard cheese ~1 month; bread ~5 days in a cupboard, longer refrigerated; anything frozen ~180 days; canned/jarred and dry staples (rice, pasta, flour, sauces) are months to a year+; snacks a few months.
Be sensible and slightly conservative — these are "check me" reminders.
Return ONLY a JSON array, no prose, no markdown fences:
[{"name":"<echo the name exactly>","days":<integer>}]`;

const VALID_LOCS = new Set<string>(LOCATIONS.map((l) => l.value));
const locLabel = (v: string) =>
  LOCATIONS.find((l) => l.value === v)?.label ?? v;

function extractArray(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
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
      { error: "Estimation isn't set up (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  let items: { name: string; location: string }[] = [];
  try {
    const body = await request.json();
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const clean = items
    .filter((i) => i && typeof i.name === "string" && i.name.trim())
    .slice(0, 100)
    .map((i) => ({
      name: i.name.trim().slice(0, 80),
      location: VALID_LOCS.has(i.location) ? locLabel(i.location) : "pantry",
    }));

  if (clean.length === 0) {
    return NextResponse.json({ estimates: [] });
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
        messages: [{ role: "user", content: JSON.stringify(clean) }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Estimation failed (${res.status}).`, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const out: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ?? "";
    const parsed = extractArray(out);
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ estimates: [] });
    }

    const estimates = parsed
      .filter(
        (e): e is { name: string; days: number } =>
          !!e &&
          typeof (e as { name?: unknown }).name === "string" &&
          typeof (e as { days?: unknown }).days === "number" &&
          Number.isFinite((e as { days: number }).days)
      )
      .map((e) => ({
        name: e.name,
        days: Math.max(1, Math.min(1095, Math.round(e.days))),
      }));

    return NextResponse.json({ estimates });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong estimating shelf life." },
      { status: 500 }
    );
  }
}
