import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanClient } from "@/components/plan/PlanClient";
import type { RecipeRef } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
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

  const { data: household } = await supabase
    .from("households")
    .select("kids_anchor, kids_pattern")
    .eq("id", profile.household_id)
    .maybeSingle();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, tags")
    .order("title", { ascending: true });

  return (
    <PlanClient
      householdId={profile.household_id as string}
      recipes={(recipes ?? []) as RecipeRef[]}
      kidsAnchor={(household?.kids_anchor as string | null) ?? null}
      kidsPattern={(household?.kids_pattern as boolean[] | null) ?? []}
    />
  );
}
