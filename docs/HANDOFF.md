# Pantry — Handoff & Context

A shared, phone-installable web app for a two-adult household (with two kids,
Zyana & Micah, present on a fortnightly roster) to track food stock, plan meals
around what's in the house, generate a store-grouped shopping list, and keep the
pantry current as meals are cooked and lunches packed. Goals: **cut food waste,
cut spend, cut effort**, and reduce Uber Eats.

This document is the single source of truth for picking the project back up.

---

## 1. Current status

**The full weekly loop is built and deployed** (Build Brief steps 1–7 plus
several enhancements):

1. Installable PWA shell, magic-code auth, shared household. ✅
2. Pantry ledger — CRUD, realtime sync, expiry-first view, **live search**. ✅
3. Photo → items (Claude vision, reviewable). ✅
4. Recipes — manual + URL/text import, favourites, ingredient normalisation,
   **meal types (Full/Main/Side)**. ✅
5. Consumption tracking — "Cooked this" decrements pantry + logs. ✅
6. Meal planning — **library-first deterministic planner** (AI optional),
   kids roster with per-day swap toggles, away days, eat-out/order-in with a
   monthly Uber Eats counter, composed dinners (primary + sides), and
   **per-kid pantry-linked lunchboxes** (auto-filled). ✅
7. Shopping list + Sunday-shop mode — plan − stock, grouped by store, price
   memory, check-to-add-back-to-pantry, budget cap. ✅

Plus an **app-style layout**: bottom tab nav (Today · Pantry · Recipes · Plan ·
Shop) and a **Today** home screen that shows the day's dinner + lunchboxes and
lets you mark **cooked** / **packed** (updating the pantry) and tap the dinner
to view the full recipe.

**Live at:** `https://pantry-ruddy-omega.vercel.app`

---

## 2. Tech stack & services

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16 LTS** (App Router) + **React 19** + TypeScript | |
| Styling | Tailwind CSS 3 | Design tokens in `tailwind.config.ts` (green/neutral, Inter) |
| DB / Auth / Realtime | **Supabase** (Postgres) | Region **Sydney**; RLS on every table |
| Hosting | **Vercel** | **Function region set to Sydney (syd1)** to sit next to Supabase |
| Email (auth) | **Brevo** SMTP (custom SMTP in Supabase) | IP allow-list disabled; sends 6-digit codes |
| AI | **Anthropic Claude** | Model via `ANTHROPIC_MODEL`, default `claude-sonnet-5`; server-only |

**AI is used in four server routes only:** photo scan, recipe import,
cook-from-pantry suggestions, and the *optional* AI weekly-plan. The default
weekly planner is deterministic (no AI, no tokens).

---

## 3. Environment variables (`.env.local` locally + Vercel project settings)

```
NEXT_PUBLIC_SUPABASE_URL=https://hqhndnpqwwyddmnexacz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase publishable key, sb_publishable_…>
NEXT_PUBLIC_SITE_URL=https://pantry-ruddy-omega.vercel.app   # no trailing slash
ANTHROPIC_API_KEY=<sk-ant-…>                                 # server-only, never NEXT_PUBLIC_
# ANTHROPIC_MODEL=claude-sonnet-5                            # optional override
```

`package.json` pins `next@^16.2.10`, React 19, and includes a
`overrides.postcss ^8.5.10` (keeps `npm audit` clean).

---

## 4. Supabase auth configuration (important, non-code)

- **Provider:** email OTP. App calls `signInWithOtp` then
  `verifyOtp({ type: "email" })`.
- **Email OTP Length = 6** (Auth settings). The app input accepts 6–8 but we set 6.
- **Email templates** "Magic Link" (and "Confirm signup") bodies use
  `{{ .Token }}` so the email contains the **code**, not a link.
- **Custom SMTP** = Brevo (`smtp-relay.brevo.com:587`), sender
  `nevewers@gmail.com` (a verified Brevo sender), username is the Brevo
  `…@smtp-brevo.com` login, password is a Brevo SMTP key.
- Brevo **Security → Authorized IPs → SMTP keys = Deactivated** (Supabase's
  sending IPs rotate and can't be whitelisted).
- **Redirect URLs / Site URL** point at the production `.vercel.app` domain.

---

## 5. Data model & migrations

Run migrations in order in the Supabase SQL Editor. All tables have RLS scoped to
`household_id = public.current_household_id()`.

| File | Adds |
|---|---|
| `0001_init.sql` | Core schema + RLS + `setup_household()` RPC. Tables: households, users, pantry_items, recipes, recipe_ingredients, meal_plans, meal_plan_days, shopping_list_items, price_history, consumption_log. Enums: storage_location, recipe_source, plan_status, store_tag. |
| `0002_realtime.sql` | Realtime on `pantry_items` + `replica identity full` (so DELETEs carry `household_id`). |
| `0003_locations.sql` | `storage_location` adds `fruits_veg`, `snacks` (5 locations total). |
| `0004_planner.sql` | `households.kids_anchor`, `households.kids_pattern boolean[14]` (seeded to Nev's roster); `meal_plan_days.breakfast_note/lunch_note/dinner_note`. |
| `0005_plan_away.sql` | `meal_plan_days.away`. |
| `0006_dinner_status.sql` | `meal_plan_days.dinner_status` (`home`/`eating_out`/`ordered_in`). |
| `0007_lunchboxes.sql` | `households.child1_name/child2_name`; `lunchbox_items` table (date, child_slot, component, name, qty, unit, pantry_item_id) + RLS. |
| `0008_meal_types.sql` | `recipes.meal_type` (`full`/`main`/`side`); `meal_plan_days.dinner_side_ids uuid[]`; seeds 5 common side recipes. |
| `0009_today_actions.sql` | `meal_plan_days.dinner_cooked`; `lunchbox_items.packed`. |

**RLS pattern:** a `SECURITY DEFINER` helper `current_household_id()` reads the
signed-in user's household from `users`; every table policy filters by it. Child
tables (recipe_ingredients, meal_plan_days) gate via their parent's household.

---

## 6. File map (what lives where)

```
supabase/migrations/           # 0001 … 0009 (run in order)
src/app/
  layout.tsx                   # root; Inter font; renders <BottomNav/>
  globals.css                  # Tailwind + tokens
  page.tsx                     # Today (server shell) → TodayClient
  login/page.tsx               # 6-digit code sign-in
  setup/page.tsx + actions.ts  # create/join household (setup_household RPC)
  auth/callback/route.ts       # (legacy PKCE exchange; OTP path doesn't need it)
  actions.ts                   # signOut server action
  proxy.ts                     # Next 16 "proxy" (was middleware) — session guard
  pantry/page.tsx              # → PantryClient
  recipes/page.tsx             # → RecipesClient
  plan/page.tsx                # → PlanClient
  shopping/page.tsx            # → ShoppingClient
  api/pantry/scan/route.ts     # photo → items (Claude vision)
  api/recipes/import/route.ts  # URL/text → recipe (Claude)
  api/plan/suggest/route.ts    # cook-from-pantry ideas (Claude)
  api/plan/week/route.ts       # OPTIONAL AI weekly plan (creates recipes for invented dinners)
  api/shopping/build/route.ts  # assemble list: plan(dinners+sides)+lunchboxes+low-stock − stock
src/components/
  BottomNav.tsx                # app tab bar (usePathname; hidden on auth routes)
  UseSoonStrip.tsx             # expiry-first "use soon" strip
  ServiceWorkerRegister.tsx    # cleanup only — unregisters any old SW, registers none
  icons.tsx                    # inline line icons (single source)
  pantry/PantryClient.tsx      # ledger: realtime, search, filters, steppers, clear-all
  pantry/ItemSheet.tsx         # add/edit item
  pantry/ScanReview.tsx        # confirm detected items → bulk insert
  recipes/RecipesClient.tsx    # list, favourites, cook, "cook from what I have"
  recipes/RecipeSheet.tsx      # add/edit/review recipe (meal_type, ingredients, tags)
  recipes/ImportSheet.tsx      # paste link/text → import
  recipes/SuggestSheet.tsx     # AI pantry suggestions
  recipes/RecipeView.tsx       # read-only recipe (used by Today)
  plan/PlanClient.tsx          # planner: deterministic generate() + planWithAI(); sides; away; eat-out/order-in; Uber counter
  plan/LunchboxSheet.tsx       # per-kid lunchbox editor + mark packed
  today/TodayClient.tsx        # Today: dinner (+view recipe), cooked/packed actions, use-soon
src/lib/
  types.ts                     # ALL shared types & constants (single source)
  normalize.ts                 # ingredient name normalisation + namesMatch()
  format.ts                    # daysUntil / expiryLabel / formatQty
  image.ts                     # client-side photo downscale for scans
  supabase/{client,server,middleware}.ts   # SSR-aware Supabase clients
docs/
  PARKING_LOT.md               # deferred tweaks
  HANDOFF.md                   # this file
SETUP.md, README.md            # setup + overview
```

---

## 7. Development workflow (how we ship every change)

The canonical source lives in the assistant's working folder. To apply changes
to the local Desktop copy and deploy:

```bash
cd ~/Desktop/grocery-meal-manager
# 1) copy updated source over (preserves .env.local + node_modules)
rsync -av --exclude node_modules --exclude .env.local --exclude .next \
  "<assistant outputs>/grocery-meal-manager/" ~/Desktop/grocery-meal-manager/
# 2) run any NEW migration(s) in the Supabase SQL Editor, in order
# 3) confirm it compiles (this runs the same type-check Vercel does)
npm run build
# 4) deploy
git add . && git commit -m "…" && git push        # Vercel auto-deploys on push
```

**Golden rule:** always `npm run build` locally *before* `git push`. `next dev`
does **not** type-check; only `next build` does (and so does Vercel).

---

## 8. Mistakes we made and the rules we now follow

These cost us real time — don't repeat them.

1. **Scaffolded on an end-of-life framework.** Next.js 14 was already EOL. →
   **Use the current LTS** (now Next 16) for anything new; check EOL before pinning.
2. **`npm audit fix --force` suggests destructive downgrades** (e.g. Next 9). →
   **Never run it here.** Fix advisories deliberately; we use a `postcss` override.
3. **TypeScript errors slipped to Vercel** because `next dev` skips type-checking.
   Two recurring shapes:
   - A prop added to the type but **not to the destructured params** ("Cannot find name 'onCook'").
   - A **string literal widened to `string`** (`source_type: "suggested"`) not
     assignable to a union — fix with `as const`.
   → Always `npm run build` locally before pushing; destructure every prop.
4. **Service worker stale cache** served blank/`{}` pages after every deploy. →
   We **removed the SW** (self-destruct + no re-register). Reintroduce offline
   support later only with a **versioned, network-first** worker.
5. **Deploying from a stale copy.** The Desktop copy got out of sync with the
   source. → Always `rsync` the latest source **before** build/commit/push.
6. **Vercel URLs confusion.** Only the stable **production** domain
   (`pantry-ruddy-omega.vercel.app`) matters; `*-git-*` and hashed URLs are
   preview deploys (some gated behind Vercel login). Use only the production URL.
7. **Magic links broke across devices** (PKCE verifier is per-browser; email
   apps open links in a different browser). → Switched to **6-digit email OTP**.
8. **Supabase built-in email is rate-limited** to a few/hour. → **Custom SMTP (Brevo).**
9. **Brevo blocked Supabase** via "Authorized IPs" (SMTP keys). → **Disable IP
   restriction**; Supabase's sending IPs rotate and can't be whitelisted.
10. **OTP length mismatch** — Supabase was set to 8-digit codes, app accepted 6.
    → Set **Email OTP Length = 6** (app now tolerates 6–8 anyway).
11. **Slow app** (4–6s) was **region latency** — Vercel in the US, Supabase in
    Sydney. → **Set Vercel function region to Sydney.**
12. **Price scraping of Coles/Woolworths/Aldi is out of scope** — they prohibit
    it, block it, and it breaks constantly. → Pricing is **assisted/manual**
    (learn-as-you-shop memory; optional paste-specials later). Don't build scraping.
13. **AI over-used for planning** burned tokens and wasn't the point. → Planner
    is now **deterministic/library-first**; AI is an explicit, occasional button.
14. **Naive brace/paren counting flags false positives** on prompt strings and
    `// 1) 2) 3)` comments — not real syntax errors.

---

## 9. Known simplifications / gaps (by design, for now)

- **Shopping "minus stock" is name-based, not unit-aware:** if you have *any* of
  an item (and it's not below its low threshold), it's treated as "have." Fine
  for v1; make quantity-aware later if too coarse.
- **Cook decrement uses simple unit logic:** deducts the recipe quantity only
  when units match, else 1 per ingredient.
- **Manual (typed) dinners have no recipe**, so they can't be "cooked" from Today
  (no ingredients to deduct). Library/AI dinners are full recipes and can.
- **Lunchbox packing** decrements pantry by name match; unmatched items just don't
  deduct.

---

## 10. Parking lot / next steps (see `docs/PARKING_LOT.md`)

- **Planner UX polish** (Nev flagged density/flow) — a dedicated pass.
- **Offline support** (Step 8) — reintroduce a safe, versioned service worker.
- Cook a **composed dinner from the plan** could also live wholly on Today (done);
  consider a per-recipe cook that includes sides everywhere.
- Scan: optionally capture **brand** in item names; smarter default qty/category;
  optional shelf-life estimate to pre-fill expiry.
- Login: friendlier error text instead of raw error strings.
- Dietary/allergy profiles as hard filters (currently just "no chilli" in prompts).
- Optional **paste-specials** price import (AI parses catalogue text you paste).
- Ratings 👍/👎 feedback loop for the AI planner.

---

## 11. Household specifics baked in

- **Dietary:** little to no chilli (hard-instructed in all AI prompts).
- **Kids:** Zyana & Micah; fortnightly roster seeded in `households.kids_pattern`
  (here Mon–Wed, away Thu, here Fri–Sun & Mon–Wed, away Thu–Sun), anchor set in-app;
  per-day swap toggles override it.
- **Breakfast:** weekend cooked breakfast on kids days (note); school days kids
  self-serve cereal.
- **Lunchboxes:** per kid — Crunch & Sip (fruit), Afternoon tea (snack), Recess
  (warm lunch, often leftovers/premade).
- **Meals:** meat + starch + veg most nights (Main + sides); pasta/curry etc. as
  Full meals; curries/stews pair with rice by default.
- **Budget:** weekly cap in-app, adjustable.

<!-- Handover verified 2026-07-21: project migrated to new Claude account; deploy pipeline (deploy key → GitHub → Vercel) tested green. -->
