-- =============================================================================
-- Step 6 Stage B — named kids + pantry-linked lunchboxes.
-- Run in the Supabase SQL Editor after 0006. Safe to run once.
-- =============================================================================

-- Two children's names on the household (edit in-app anytime).
alter table households add column if not exists child1_name text not null default 'Zyana';
alter table households add column if not exists child2_name text not null default 'Micah';

-- Lunchbox items, keyed by date + child + component so they survive plan edits.
create table if not exists lunchbox_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  date           date not null,
  child_slot     int  not null check (child_slot in (1, 2)),
  component      text not null check (component in ('crunch_sip', 'afternoon_tea', 'recess')),
  name           text not null,
  quantity       numeric(10, 2) not null default 1,
  unit           text,
  pantry_item_id uuid references pantry_items (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists lunchbox_items_lookup
  on lunchbox_items (household_id, date);

alter table lunchbox_items enable row level security;

create policy lunchbox_items_all on lunchbox_items
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
