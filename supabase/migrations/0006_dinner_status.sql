-- =============================================================================
-- Step 6 — dinner status: eating out / ordering in (Uber Eats), for tracking.
-- Run in the Supabase SQL Editor after 0005. Safe to run once.
-- Values: 'home' (cook at home), 'eating_out', 'ordered_in'.
-- =============================================================================

alter table meal_plan_days
  add column if not exists dinner_status text not null default 'home';
