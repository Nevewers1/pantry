-- =============================================================================
-- Household Grocery & Meal Manager — initial schema (Build Brief v2.0, §4)
-- Run this in the Supabase SQL Editor (see SETUP.md, step 4).
--
-- Security model note:
--   The brief describes RLS "scoped to household_id via a JWT claim". Putting a
--   custom claim in the JWT requires a custom access-token hook and is easy to
--   get subtly wrong. We use the standard, safer pattern instead: a
--   SECURITY DEFINER helper, current_household_id(), that looks up the signed-in
--   user's household from the `users` table. Every table is then filtered by
--   `household_id = current_household_id()`. Same guarantee, less footgun.
-- =============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- --- Enums -------------------------------------------------------------------
create type storage_location as enum ('pantry', 'fridge', 'freezer');
create type recipe_source     as enum ('imported', 'manual', 'suggested');
create type plan_status        as enum ('draft', 'active', 'archived');
create type store_tag          as enum ('coles', 'woolies', 'aldi', 'any');

-- --- Tables ------------------------------------------------------------------

create table households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Optional weekly budget cap (AUD). Adjustable week to week; null = no cap.
  weekly_budget_cap numeric(10, 2),
  created_at timestamptz not null default now()
);

-- One row per signed-in person. `id` mirrors auth.users.id.
create table users (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  display_name text not null,
  email        text not null,
  -- Dietary/allergy profile (§6.8). Free-form for now, e.g. {"avoid": ["chilli"]}.
  dietary      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index users_household_idx on users (household_id);

create table pantry_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  name          text not null,
  category      text,
  quantity      numeric(10, 2) not null default 1,
  unit          text,
  location      storage_location not null default 'pantry',
  expiry_date   date,
  min_threshold numeric(10, 2), -- "running low" trigger
  updated_by    uuid references users (id),
  updated_at    timestamptz not null default now()
);
create index pantry_household_idx  on pantry_items (household_id);
create index pantry_expiry_idx     on pantry_items (household_id, expiry_date);

create table recipes (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  title          text not null,
  source_url     text,
  source_type    recipe_source not null default 'manual',
  servings       integer not null default 2,
  prep_min       integer,
  cook_min       integer,
  tags           text[] not null default '{}', -- kid_friendly, lunchbox, snack, quick, freezer_friendly, adults_only
  instructions   text,
  image_path     text,
  is_favourite   boolean not null default false,
  times_cooked   integer not null default 0,
  last_cooked_at timestamptz,
  created_at     timestamptz not null default now()
);
create index recipes_household_idx on recipes (household_id);

create table recipe_ingredients (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  name      text not null, -- normalised (lowercased, singularised, synonym-mapped)
  quantity  numeric(10, 2),
  unit      text,
  is_staple boolean not null default false -- salt/oil/flour etc — kept off shopping list
);
create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

create table meal_plans (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households (id) on delete cascade,
  week_start_date date not null,
  status          plan_status not null default 'draft',
  created_at      timestamptz not null default now()
);
create index meal_plans_household_idx on meal_plans (household_id, week_start_date);

create table meal_plan_days (
  id                 uuid primary key default gen_random_uuid(),
  meal_plan_id       uuid not null references meal_plans (id) on delete cascade,
  date               date not null,
  kids_present       boolean not null default false,
  breakfast_recipe_id uuid references recipes (id) on delete set null,
  lunch_recipe_id     uuid references recipes (id) on delete set null,
  dinner_recipe_id    uuid references recipes (id) on delete set null,
  snack_notes        text,
  lunchbox_notes     text
);
create index meal_plan_days_plan_idx on meal_plan_days (meal_plan_id, date);

create table shopping_list_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  meal_plan_id   uuid references meal_plans (id) on delete cascade,
  name           text not null,
  quantity       numeric(10, 2),
  unit           text,
  category       text,
  store          store_tag not null default 'any',
  est_price      numeric(10, 2),
  is_checked     boolean not null default false,
  added_to_pantry boolean not null default false,
  created_at     timestamptz not null default now()
);
create index shopping_list_household_idx on shopping_list_items (household_id, meal_plan_id);

create table price_history (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  item_name    text not null,
  store        store_tag not null,
  price        numeric(10, 2) not null,
  seen_on      date not null default current_date
);
create index price_history_lookup_idx on price_history (household_id, item_name, store, seen_on desc);

create table consumption_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  recipe_id    uuid references recipes (id) on delete set null,
  note         text,
  logged_by    uuid references users (id),
  logged_at    timestamptz not null default now()
);
create index consumption_log_household_idx on consumption_log (household_id, logged_at desc);

-- --- updated_at trigger for the pantry ledger --------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pantry_items_touch
  before update on pantry_items
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

-- Helper: the household of the currently signed-in user.
-- SECURITY DEFINER so it can read `users` without recursing through its own RLS.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.users where id = auth.uid();
$$;

-- Enable RLS on every table.
alter table households          enable row level security;
alter table users               enable row level security;
alter table pantry_items        enable row level security;
alter table recipes             enable row level security;
alter table recipe_ingredients  enable row level security;
alter table meal_plans          enable row level security;
alter table meal_plan_days      enable row level security;
alter table shopping_list_items enable row level security;
alter table price_history       enable row level security;
alter table consumption_log     enable row level security;

-- households: members can see and update their own household.
create policy households_select on households
  for select using (id = public.current_household_id());
create policy households_update on households
  for update using (id = public.current_household_id());

-- users: members can see everyone in their household; you can insert/update your own row.
create policy users_select on users
  for select using (household_id = public.current_household_id());
create policy users_insert_self on users
  for insert with check (id = auth.uid());
create policy users_update_self on users
  for update using (id = auth.uid());

-- Generic "same household" policy for the household-scoped tables.
create policy pantry_all on pantry_items
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy recipes_all on recipes
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- recipe_ingredients has no household_id; gate via its parent recipe.
create policy recipe_ingredients_all on recipe_ingredients
  for all using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.household_id = public.current_household_id()
    )
  )
  with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.household_id = public.current_household_id()
    )
  );

create policy meal_plans_all on meal_plans
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- meal_plan_days gated via parent meal_plan.
create policy meal_plan_days_all on meal_plan_days
  for all using (
    exists (
      select 1 from meal_plans p
      where p.id = meal_plan_days.meal_plan_id
        and p.household_id = public.current_household_id()
    )
  )
  with check (
    exists (
      select 1 from meal_plans p
      where p.id = meal_plan_days.meal_plan_id
        and p.household_id = public.current_household_id()
    )
  );

create policy shopping_list_all on shopping_list_items
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy price_history_all on price_history
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy consumption_log_all on consumption_log
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- =============================================================================
-- Household setup RPC
-- Creates a household and the caller's user row atomically, OR joins an
-- existing household by invite code (the household's id). Called from /setup.
-- Runs as SECURITY DEFINER so the two inserts happen before the user has a
-- household row (chicken-and-egg with RLS).
-- =============================================================================
create or replace function public.setup_household(
  p_display_name text,
  p_household_name text default null,
  p_join_household_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Prevent creating a second membership for an already-set-up user.
  if exists (select 1 from users where id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if p_join_household_id is not null then
    -- Join an existing household (partner uses the household id as an invite code).
    if not exists (select 1 from households where id = p_join_household_id) then
      raise exception 'Household not found';
    end if;
    v_household_id := p_join_household_id;
  else
    if p_household_name is null or length(trim(p_household_name)) = 0 then
      raise exception 'Household name required';
    end if;
    insert into households (name) values (trim(p_household_name))
    returning id into v_household_id;
  end if;

  insert into users (id, household_id, display_name, email)
  values (auth.uid(), v_household_id, trim(p_display_name), v_email);

  return v_household_id;
end;
$$;

revoke all on function public.setup_household(text, text, uuid) from public;
grant execute on function public.setup_household(text, text, uuid) to authenticated;
