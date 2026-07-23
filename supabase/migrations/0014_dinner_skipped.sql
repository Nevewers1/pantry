-- 0014_dinner_skipped.sql
-- Lets a planned dinner be marked "didn't cook" so it clears from the Today
-- "catch up" list without deducting anything from the pantry.
alter table public.meal_plan_days
  add column if not exists dinner_skipped boolean not null default false;
