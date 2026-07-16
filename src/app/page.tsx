import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TodayClient } from "@/components/today/TodayClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, household_id, households(name, child1_name, child2_name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/setup");

  const hh = (
    Array.isArray(profile.households) ? profile.households[0] : profile.households
  ) as {
    name?: string;
    child1_name?: string;
    child2_name?: string;
  } | null;

  return (
    <TodayClient
      householdId={profile.household_id as string}
      displayName={(profile.display_name as string) ?? ""}
      householdName={hh?.name ?? "your kitchen"}
      childNames={[hh?.child1_name ?? "Zyana", hh?.child2_name ?? "Micah"]}
    />
  );
}
