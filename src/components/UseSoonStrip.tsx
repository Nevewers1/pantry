import { ClockIcon, LeafIcon } from "@/components/icons";

type ExpiringItem = {
  id: string;
  name: string;
  expiry_date: string | null;
  quantity: number | null;
  unit: string | null;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function label(days: number): { text: string; dot: string; tone: string } {
  if (days < 0)
    return { text: "expired", dot: "bg-danger", tone: "text-danger" };
  if (days === 0) return { text: "today", dot: "bg-danger", tone: "text-danger" };
  if (days === 1)
    return { text: "tomorrow", dot: "bg-warn", tone: "text-warn" };
  return { text: `${days} days`, dot: "bg-warn", tone: "text-warn" };
}

/**
 * Signature element: the expiry-first "use soon" strip. Clean white cards with
 * hairline borders and a coloured status dot. Empty state is an instruction.
 */
export function UseSoonStrip({ items }: { items: ExpiringItem[] }) {
  return (
    <section aria-labelledby="use-soon-heading">
      <div className="mb-3 flex items-center gap-2">
        <ClockIcon className="h-4 w-4 text-muted" />
        <h2
          id="use-soon-heading"
          className="text-[13px] font-semibold uppercase tracking-wide text-muted"
        >
          Use these soon
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <LeafIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-medium text-ink">
              Nothing about to expire
            </p>
            <p className="text-sm text-muted">
              Add items with dates and the ones to cook first appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
          {items.map((it) => {
            const days = it.expiry_date ? daysUntil(it.expiry_date) : 99;
            const { text, dot, tone } = label(days);
            return (
              <div
                key={it.id}
                className="min-w-[10rem] snap-start rounded-card border border-border bg-surface p-4"
              >
                <p className="truncate text-[15px] font-medium text-ink">
                  {it.name}
                </p>
                {it.quantity != null && (
                  <p className="mt-0.5 text-sm text-muted">
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className={`text-[13px] font-medium ${tone}`}>
                    {text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
