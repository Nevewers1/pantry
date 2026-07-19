import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PantryClient } from "@/components/pantry/PantryClient";
import type { PantryItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/setup");

  const { data: items } = await supabase
    .from("pantry_items")
    .select(
      "id, household_id, name, category, quantity, unit, location, expiry_date, expiry_estimated, min_threshold, updated_by, updated_at, created_at"
    )
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <PantryClient
      initialItems={(items ?? []) as PantryItem[]}
      householdId={profile.household_id as string}
      userId={user.id}
      initialSearch={q ?? ""}
    />
  );
}
