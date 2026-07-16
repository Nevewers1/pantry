-- =============================================================================
-- Step 2.1 — add two more storage locations: Fruit & veg, and Snacks & sweets.
-- Run in the Supabase SQL Editor after 0002. Safe to run once.
--
-- Note: adding enum values must run OUTSIDE a transaction. The Supabase SQL
-- Editor runs each statement on its own, so this is fine. If you ever see
-- "ALTER TYPE ... cannot run inside a transaction block", just run each line
-- separately.
-- =============================================================================

alter type storage_location add value if not exists 'fruits_veg';
alter type storage_location add value if not exists 'snacks';
