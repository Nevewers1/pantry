import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UseSoonStrip } from "@/components/UseSoonStrip";
import {
  BoxIcon,
  BookIcon,
  CalendarIcon,
  CartIcon,
  ChevronRightIcon,
  LeafIcon,
  LogoutIcon,
} from "@/components/icons";
import { signOut } from "./actions";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, household_id, households(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/setup");

  const household = Array.isArray(profile.households)
    ? profile.households[0]
    : profile.households;
  const householdName =
    (household as { name?: string } | null)?.name ?? "your kitchen";

  // Expiry-first surfacing (§6.1): items expiring within the next 4 days.
  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  const { data: expiring } = await supabase
    .from("pantry_items")
    .select("id, name, expiry_date, quantity, unit")
    .not("expiry_date", "is", null)
    .lte("expiry_date", soon.toISOString().slice(0, 10))
    .order("expiry_date", { ascending: true })
    .limit(12);

  const initial = profile.display_name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-screen">
      {/* App header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
              <LeafIcon className="h-5 w-5" />
            </div>
            <span className="text-[15px] font-semibold tracking-tightish text-ink">
              Pantry
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand">
              {initial}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
              >
                <LogoutIcon className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-24 pt-6">
        <div className="mb-6">
          <p className="text-sm text-muted">Hi {profile.display_name}</p>
          <h1 className="text-2xl font-semibold tracking-tightish text-ink">
            {householdName}
          </h1>
        </div>

        {/* Signature element: the expiry-first "use soon" strip. */}
        <UseSoonStrip items={expiring ?? []} />

        {/* The weekly loop — "what do I do now?" */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Your week
          </h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <LoopRow
              icon={<BoxIcon className="h-5 w-5" />}
              title="Pantry"
              desc="What's in the house right now"
              href="/pantry"
            />
            <LoopRow
              icon={<BookIcon className="h-5 w-5" />}
              title="Recipes"
              desc="Your regulars, plus links you paste in"
            />
            <LoopRow
              icon={<CalendarIcon className="h-5 w-5" />}
              title="Plan my week"
              desc="A 7-day plan from what you already have"
            />
            <LoopRow
              icon={<CartIcon className="h-5 w-5" />}
              title="Shopping list"
              desc="Only what the plan needs, split by store"
              last
            />
          </div>
        </section>

        <p className="mt-8 text-center text-[13px] leading-relaxed text-faint">
          You&apos;re on the Step&nbsp;1 foundation. Sign-in, your shared
          household and the installable app shell are live — these turn on as
          each stage ships.
        </p>
      </main>
    </div>
  );
}

function LoopRow({
  icon,
  title,
  desc,
  last,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  last?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          href ? "bg-brand-tint text-brand" : "bg-bg text-muted"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">{title}</p>
        <p className="truncate text-sm text-muted">{desc}</p>
      </div>
      {!href && (
        <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          Soon
        </span>
      )}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
    </>
  );

  const cls = `flex items-center gap-3.5 px-4 py-3.5 ${
    last ? "" : "border-b border-border"
  } ${href ? "hover:bg-bg" : ""}`;

  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
