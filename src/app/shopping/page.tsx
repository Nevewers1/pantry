import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShoppingClient } from "@/components/shopping/ShoppingClient";
import type { ShoppingItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
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
    .select("weekly_budget_cap")
    .eq("id", profile.household_id)
    .maybeSingle();

  const { data: items } = await supabase
    .from("shopping_list_items")
    .select("*")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <ShoppingClient
      householdId={profile.household_id as string}
      userId={user.id}
      initialItems={(items ?? []) as ShoppingItem[]}
      budgetCap={(household?.weekly_budget_cap as number | null) ?? null}
    />
  );
}
