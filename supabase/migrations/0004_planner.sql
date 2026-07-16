-- =============================================================================
-- Step 6 Pass 2 — weekly planner support.
-- Run in the Supabase SQL Editor after 0003. Safe to run once.
-- =============================================================================

-- Kids fortnightly roster on the household (shared by both partners).
-- kids_anchor = a Monday when a fresh 14-day cycle begins (kids arrive after school).
-- kids_pattern = 14 booleans (day 0 = that anchor Monday) of "kids here" defaults.
-- Seeded from Nev's roster: here Mon-Wed, away Thu, here Fri-Sun & Mon-Wed, away Thu-Sun.
alter table households add column if not exists kids_anchor date;
alter table households
  add column if not exists kids_pattern boolean[] not null
  default '{t,t,t,f,t,t,t,t,t,t,f,f,f,f}';

-- Free-text meal notes on plan days (for generated meals not tied to a saved recipe).
alter table meal_plan_days add column if not exists breakfast_note text;
alter table meal_plan_days add column if not exists lunch_note text;
alter table meal_plan_days add column if not exists dinner_note text;
