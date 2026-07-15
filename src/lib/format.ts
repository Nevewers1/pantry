/** Whole days from today until the given date (negative = already past). */
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export type ExpiryTone = {
  text: string;
  dot: string; // tailwind bg class for the status dot
  tone: string; // tailwind text class
};

/** Human label + colour tokens for an expiry date. Null if no date set. */
export function expiryLabel(dateStr: string | null): ExpiryTone | null {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days < 0) return { text: "expired", dot: "bg-danger", tone: "text-danger" };
  if (days === 0) return { text: "today", dot: "bg-danger", tone: "text-danger" };
  if (days === 1)
    return { text: "tomorrow", dot: "bg-warn", tone: "text-warn" };
  if (days <= 4)
    return { text: `${days} days`, dot: "bg-warn", tone: "text-warn" };
  return { text: `${days} days`, dot: "bg-faint", tone: "text-muted" };
}

/** Compact quantity: "2" not "2.00", but "1.5" stays "1.5". */
export function formatQty(qty: number): string {
  return String(Math.round(qty * 100) / 100);
}
