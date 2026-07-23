-- 0016_price_source.sql
-- Keep the real seller name (e.g. "Woolworths", "Amazon AU", "Chemist Warehouse")
-- so the picker can show who actually sells each option instead of a vague "Any".
alter table public.price_history
  add column if not exists source_name text;

alter table public.shopping_list_items
  add column if not exists product_source text;
