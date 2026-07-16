import { estimateShelfLifeDays, fallbackShelfLifeDays } from "@/lib/shelfLife";
import type { StorageLocation } from "@/lib/types";

export type EstInput = {
  key: string; // caller's id for the row (item id, name key, etc.)
  name: string;
  location: StorageLocation;
};

/**
 * Hybrid shelf-life estimate for a batch of items → Map of key → days.
 * 1. Instant local table for everything it recognises (no API cost).
 * 2. One AI call for the leftovers.
 * 3. A location-based default for anything still missing (offline / no API key),
 *    so every item gets a "check me" date.
 */
export async function estimateDaysFor(
  inputs: EstInput[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unknown: EstInput[] = [];

  for (const it of inputs) {
    const d = estimateShelfLifeDays(it.name, it.location);
    if (d != null) out.set(it.key, d);
    else unknown.push(it);
  }

  if (unknown.length > 0) {
    // Dedupe by name+location for the AI request.
    const seen = new Map<string, { name: string; location: StorageLocation }>();
    for (const u of unknown) {
      const k = `${u.name.toLowerCase()}|${u.location}`;
      if (!seen.has(k)) seen.set(k, { name: u.name, location: u.location });
    }

    const aiByName = new Map<string, number>();
    try {
      const res = await fetch("/api/pantry/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [...seen.values()] }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const e of data.estimates ?? []) {
          if (e && typeof e.name === "string" && typeof e.days === "number") {
            aiByName.set(e.name.toLowerCase(), e.days);
          }
        }
      }
    } catch {
      /* offline or no API key — fall through to the location default */
    }

    for (const u of unknown) {
      out.set(
        u.key,
        aiByName.get(u.name.toLowerCase()) ?? fallbackShelfLifeDays(u.location)
      );
    }
  }

  return out;
}
