-- =============================================================================
-- Meal composition — recipe types (full / main / side) + composed dinners.
-- Run in the Supabase SQL Editor after 0007. Safe to run once.
-- =============================================================================

alter table recipes
  add column if not exists meal_type text not null default 'full';

-- Sides that make up a dinner alongside the primary (dinner_recipe_id).
alter table meal_plan_days
  add column if not exists dinner_side_ids uuid[] not null default '{}';

-- Seed a few common side recipes so composing + AI side suggestions work
-- straight away (only if no side recipes exist yet).
do $$
declare
  h uuid;
  r uuid;
begin
  select id into h from households order by created_at limit 1;
  if h is null then return; end if;
  if exists (select 1 from recipes where household_id = h and meal_type = 'side') then
    return;
  end if;

  insert into recipes (household_id, title, source_type, servings, meal_type, instructions)
  values (h, 'Steamed rice', 'manual', 4, 'side', 'Rinse rice; simmer with water until absorbed.')
  returning id into r;
  insert into recipe_ingredients (recipe_id, name, quantity, unit, is_staple)
  values (r, 'rice', 1.5, 'cup', false);

  insert into recipes (household_id, title, source_type, servings, meal_type, instructions)
  values (h, 'Mashed potato', 'manual', 4, 'side', 'Boil potatoes; mash with butter and a splash of milk.')
  returning id into r;
  insert into recipe_ingredients (recipe_id, name, quantity, unit, is_staple)
  values (r, 'potato', 6, 'ea', false), (r, 'butter', 1, 'tbsp', true), (r, 'milk', 0.25, 'cup', true);

  insert into recipes (household_id, title, source_type, servings, meal_type, instructions)
  values (h, 'Air-fryer chips', 'manual', 4, 'side', 'Cut potatoes into chips; air-fry ~20 min, shaking halfway.')
  returning id into r;
  insert into recipe_ingredients (recipe_id, name, quantity, unit, is_staple)
  values (r, 'potato', 4, 'ea', false), (r, 'oil', 1, 'tbsp', true);

  insert into recipes (household_id, title, source_type, servings, meal_type, instructions)
  values (h, 'Steamed broccoli', 'manual', 4, 'side', 'Steam broccoli florets 4-5 min.')
  returning id into r;
  insert into recipe_ingredients (recipe_id, name, quantity, unit, is_staple)
  values (r, 'broccoli', 1, 'head', false);

  insert into recipes (household_id, title, source_type, servings, meal_type, instructions)
  values (h, 'Garden salad', 'manual', 4, 'side', 'Toss leaves, tomato and cucumber; dress lightly.')
  returning id into r;
  insert into recipe_ingredients (recipe_id, name, quantity, unit, is_staple)
  values (r, 'lettuce', 1, 'ea', false), (r, 'tomato', 2, 'ea', false), (r, 'cucumber', 1, 'ea', false);
end $$;
