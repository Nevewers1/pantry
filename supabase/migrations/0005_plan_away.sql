-- =============================================================================
-- Step 6 Stage A — mark plan days as "away" (no meals planned).
-- Run in the Supabase SQL Editor after 0004. Safe to run once.
-- =============================================================================

alter table meal_plan_days add column if not exists away boolean not null default false;
