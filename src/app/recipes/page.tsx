import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipesClient } from "@/components/recipes/RecipesClient";
import type { PantrySlim, RecipeWithIngredients } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
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

  const { data: recipes } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("is_favourite", { ascending: false })
    .order("title", { ascending: true });

  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, unit");

  return (
    <RecipesClient
      initialRecipes={(recipes ?? []) as RecipeWithIngredients[]}
      initialPantry={(pantry ?? []) as PantrySlim[]}
      householdId={profile.household_id as string}
      userId={user.id}
    />
  );
}
