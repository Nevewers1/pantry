-- 0012: in-app feedback & feature requests.
-- Testers submit from inside the app; you review them in the Supabase Table
-- Editor (the service role sees every household's rows; the app, via RLS, only
-- shows a member their own household's).
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id      uuid references users (id) on delete set null,
  type         text not null check (type in ('feature', 'bug', 'general')) default 'feature',
  message      text not null,
  page         text, -- where it was sent from, for context
  status       text not null check (status in ('new', 'planned', 'in_progress', 'done', 'declined')) default 'new',
  created_at   timestamptz not null default now()
);

create index if not exists feedback_household_idx
  on public.feedback (household_id, created_at desc);

alter table public.feedback enable row level security;

create policy feedback_all on public.feedback
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
