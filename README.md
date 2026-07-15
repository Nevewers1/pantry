# Pantry — Household Grocery & Meal Manager

A shared, phone-installable PWA for a two-adult household to track food stock,
plan meals around what's in stock, generate a cost-optimised weekly shopping
list, and keep the pantry current as meals are eaten — cutting spend and waste.

Built to the v2.0 Build Brief. **This repo is the Step 1 foundation.**

## Stack
- **Next.js 16 LTS** (App Router, React 19) + **TypeScript** + **Tailwind** — installable PWA
- **Supabase** — Postgres, magic-link auth, Realtime, Storage; Row-Level Security
  scoped to `household_id` on every table
- **Vercel** — hosting
- **Claude API** — vision (photo → items), recipe import, meal planning
  *(wired in later stages; server-side only)*

## Getting started
See **[SETUP.md](./SETUP.md)** — a plain-English, zero-to-live walkthrough
(accounts, database, running locally, deploying, installing on your phone).

Short version for developers:
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
# run supabase/migrations/0001_init.sql in the Supabase SQL editor
npm run dev
```

## What's in Step 1
- Installable PWA shell (manifest + service worker, offline-tolerant reads)
- Passwordless magic-link auth
- Shared household setup (create or join)
- Full database schema + RLS + `setup_household()` RPC
- Home screen with the signature expiry-first "Use these soon" strip

## Build order (from the brief)
1. **Foundation — this repo** ✅
2. Pantry ledger CRUD + realtime + expiry-first view
3. Photo → items (Claude vision, with confirm screen)
4. Recipes: manual + URL/text import + normalisation + favourites
5. Consumption tracking ("cooked this", quick-use chips, low-stock)
6. Meal recommendations ("Plan my week") + ratings loop
7. Shopping list + price memory + Sunday-shop mode
8. Extras: budget cap, "cook what I have", dietary profiles, offline writes
9. PWA polish + deploy handover

## Confirmed decisions (open questions from the brief)
- **Breakfast:** planned on weekends when kids are here (cereal / toast with
  cheese & salami); otherwise not planned.
- **Dietary:** hard-filter **little to no chillies**.
- **Budget:** weekly cap lives in-app and is adjustable week to week
  (`households.weekly_budget_cap`).
- **Visual direction:** clean but homey and warm — warm paper background,
  terracotta primary, sage + amber accents.
- **Price scraping is intentionally NOT built** (see brief §2 / §5.6); pricing
  is assisted/manual price memory.

## Project layout
```
supabase/migrations/0001_init.sql   # schema + RLS + setup RPC
src/app/                            # routes (App Router)
  login/          magic-link sign-in
  auth/callback/  session exchange
  setup/          create/join household
  page.tsx        home screen (weekly loop + use-soon strip)
src/lib/supabase/                   # browser + server + middleware clients
src/components/                     # UseSoonStrip, ServiceWorkerRegister
public/                             # manifest.json, sw.js, icons
```
