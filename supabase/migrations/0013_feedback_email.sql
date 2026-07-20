-- 0013: feedback table (idempotent) + submitter email for the email/Sheet log.
-- Safe to run whether or not 0012 was applied — it creates what's missing and
-- adds the user_email column used by the Google Sheet + email notification.
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id      uuid references users (id) on delete set null,
  type         text not null check (type in ('feature', 'bug', 'general')) default 'feature',
  message      text not null,
  page         text,
  status       text not null check (status in ('new', 'planned', 'in_progress', 'done', 'declined')) default 'new',
  created_at   timestamptz not null default now()
);

alter table public.feedback add column if not exists user_email text;

create index if not exists feedback_household_idx
  on public.feedback (household_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_all on public.feedback;
create policy feedback_all on public.feedback
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
