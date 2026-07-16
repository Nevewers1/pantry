-- 0011: shelf-life estimates.
-- created_at gives us a base date to estimate an expiry from ("added N days ago").
-- expiry_estimated marks a date the app guessed (vs one a person set), so the UI
-- can flag it as approximate and the estimator only ever fills blanks.
alter table public.pantry_items
  add column if not exists created_at timestamptz not null default now();

alter table public.pantry_items
  add column if not exists expiry_estimated boolean not null default false;
