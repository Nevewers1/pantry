"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetupState = { error?: string };

/**
 * Creates a new household (or joins an existing one via invite code) and the
 * caller's user row, by calling the setup_household() RPC. See 0001_init.sql.
 */
export async function setupHousehold(
  _prev: SetupState,
  formData: FormData
): Promise<SetupState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "create");
  const householdName = String(formData.get("household_name") ?? "").trim();
  const joinCode = String(formData.get("join_code") ?? "").trim();

  if (!displayName) return { error: "Please enter your name." };

  const supabase = await createClient();

  const { error } = await supabase.rpc("setup_household", {
    p_display_name: displayName,
    p_household_name: mode === "create" ? householdName : null,
    p_join_household_id: mode === "join" ? joinCode : null,
  });

  if (error) return { error: error.message };

  redirect("/");
}
