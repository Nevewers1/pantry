import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanClient } from "@/components/plan/PlanClient";
import type { PantrySlim, RecipeRef } from "@/lib/types";

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
    .select("kids_anchor, kids_pattern, child1_name, child2_name")
    .eq("id", profile.household_id)
    .maybeSingle();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, tags, meal_type, is_favourite")
    .order("title", { ascending: true });

  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, unit, location");

  return (
    <PlanClient
      householdId={profile.household_id as string}
      userId={user.id}
      recipes={(recipes ?? []) as RecipeRef[]}
      pantry={(pantry ?? []) as PantrySlim[]}
      kidsAnchor={(household?.kids_anchor as string | null) ?? null}
      kidsPattern={(household?.kids_pattern as boolean[] | null) ?? []}
      childNames={[
        (household?.child1_name as string) ?? "Zyana",
        (household?.child2_name as string) ?? "Micah",
      ]}
    />
  );
}
