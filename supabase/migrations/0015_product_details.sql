-- 0015_product_details.sql
-- Remember WHICH product a shopping-list price refers to (name + image), so a
-- "$3.30" line shows the actual bread it priced, and the user can pick another.

-- Rich product detail cached alongside each price memory row.
alter table public.price_history
  add column if not exists title text,
  add column if not exists image_url text;

-- The specific product chosen for a shopping-list line.
alter table public.shopping_list_items
  add column if not exists product_name text,
  add column if not exists product_image text;
