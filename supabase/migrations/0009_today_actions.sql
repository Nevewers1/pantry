-- =============================================================================
-- Today actions — mark a dinner cooked and lunchbox items packed.
-- Run in the Supabase SQL Editor after 0008. Safe to run once.
-- =============================================================================

alter table meal_plan_days
  add column if not exists dinner_cooked boolean not null default false;

alter table lunchbox_items
  add column if not exists packed boolean not null default false;
