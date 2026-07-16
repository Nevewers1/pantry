-- 0010: recipe photos via image URL (no file uploads).
-- Stores a plain image URL (og:image scraped on import, or pasted manually).
alter table public.recipes
  add column if not exists image_url text;
