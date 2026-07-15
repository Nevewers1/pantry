-- =============================================================================
-- Step 2 — enable live sync on the pantry ledger.
-- Run this in the Supabase SQL Editor after 0001_init.sql (see SETUP §Step 2 notes).
-- Safe to run once. If a line says the table is "already a member", that's fine.
-- =============================================================================

-- 1. Broadcast pantry_items row changes to subscribed clients (Realtime).
alter publication supabase_realtime add table pantry_items;

-- 2. Include the FULL old row in change events. Without this, DELETE events only
--    carry the primary key, so a client filtering by household_id would never
--    receive deletes. REPLICA IDENTITY FULL makes household_id present on delete.
alter table pantry_items replica identity full;
