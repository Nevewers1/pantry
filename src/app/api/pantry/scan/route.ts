import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Configurable so the model can be swapped without a code change.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You identify grocery/food items from a photo of a shelf, fridge, freezer, or pantry.
Return ONLY a JSON object of this exact shape, with no prose and no markdown fences:
{"items":[{"name":"string","quantity":number,"unit":"string","category":"string","location":"pantry|fridge|freezer"}]}
Rules:
- One entry per distinct product you can see. Merge obvious duplicates and set quantity to the count.
- quantity: your best integer estimate of how many are visible (default 1).
- unit: short (e.g. "ea", "g", "ml", "pack", "bottle"); use "ea" if unsure.
- category: a short grocery aisle-style category (e.g. "Dairy", "Produce", "Condiments").
- location: your best guess from context (a fridge photo -> "fridge", freezer -> "freezer", otherwise "pantry").
- Only include real food/drink/household-grocery items. Ignore brand marketing text, hands, and background.
- If you can't read a label, use a sensible generic name (e.g. "Milk", "Tomatoes").`;

type DetectedItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: "pantry" | "fridge" | "freezer";
};

function extractJson(text: string): { items: DetectedItem[] } | null {
  // Strip code fences if present, then grab the outermost JSON object.
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

export async function POST(request: Request) {
  // Auth gate — only signed-in household members can call this.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Photo scanning isn't set up yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  let imageBase64: string | undefined;
  let mediaType: string | undefined;
  try {
    const body = await request.json();
    imageBase64 = body.imageBase64;
    mediaType = body.mediaType;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "List the food/grocery items visible in this photo as JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Vision request failed (${res.status}).`, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ??
      "";

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return NextResponse.json(
        { error: "Couldn't read items from that photo. Try a clearer shot." },
        { status: 422 }
      );
    }

    // Normalise/clamp before returning to the client.
    const items: DetectedItem[] = parsed.items
      .filter((i) => i && typeof i.name === "string" && i.name.trim())
      .slice(0, 40)
      .map((i) => ({
        name: String(i.name).trim().slice(0, 80),
        quantity:
          Number.isFinite(i.quantity) && i.quantity > 0
            ? Math.round(Number(i.quantity) * 100) / 100
            : 1,
        unit: (i.unit ? String(i.unit) : "ea").slice(0, 16),
        category: i.category ? String(i.category).slice(0, 40) : "",
        location: ["pantry", "fridge", "freezer"].includes(i.location)
          ? i.location
          : "pantry",
      }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong scanning the photo." },
      { status: 500 }
    );
  }
}
