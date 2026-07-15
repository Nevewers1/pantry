# Setup guide — Pantry (Step 1 foundation)

This takes you from zero to a live web app you can install on your phone. No
coding needed — you copy, paste, and click. Budget **30–45 minutes** the first
time.

**Stack:** Next.js 16 (LTS) + React 19, Supabase (database/login/sync), Vercel
(hosting), Claude API (added in later steps). Everything is pinned to current,
fully-patched versions — a fresh `npm install` reports **0 vulnerabilities**.

You'll create three free accounts:

| Account | What it's for | Cost |
|---|---|---|
| **Supabase** | Database + login + live sync | Free tier is plenty |
| **Vercel** | Hosting the app on the internet | Free tier is plenty |
| **Anthropic** | The AI for photos/recipes/planning | Pay-as-you-go, *not needed for Step 1* |

You'll also install two free tools: **Node.js** and **Git**.

> **Where you are now:** if you've already run `npm install` and seen
> "found 0 vulnerabilities", sections 0–1 are done — **skip to section 2 (Supabase).**

---

## 0. Install the two tools (one-time)

1. **Node.js** — <https://nodejs.org> → download the **LTS** version (Node 20 or
   newer; Node 22 is fine). Run the installer, accept defaults.
2. **Git** — <https://git-scm.com/downloads> → download for your OS, install with
   defaults.

Check they worked. Open **Terminal** (Mac) or **PowerShell** (Windows):

```bash
node --version
git --version
```

Two version numbers = good. (Node must be **18.18 or newer** for Next.js 16.)

---

## 1. Get the project and install it

Put the `grocery-meal-manager` folder somewhere easy — e.g. your Desktop. Then,
in Terminal, go **into** that folder and install its building blocks:

```bash
cd ~/Desktop/grocery-meal-manager
npm install
```

`npm install` downloads dependencies into a `node_modules` folder (~15 seconds).
When it finishes you should see **"found 0 vulnerabilities"**.

> Seeing an error instead? Jump to **Troubleshooting** at the bottom — the two
> most common first-time ones (`EACCES` cache permissions and `EPERM uv_cwd`)
> are covered there with one-line fixes.

---

## 2. Create the Supabase project (database + login)

1. Go to <https://supabase.com> → **Start your project** → sign in.
2. **New project.** Pick your org, name it (e.g. `pantry`), set a **database
   password** (save it in your password manager), and choose the closest region
   (**Sydney** for Australia). Create it — provisioning takes ~2 minutes.
3. When ready, open **Project Settings** (gear icon) → **API Keys** / **Data
   API**. Copy two values and keep the tab open:
   - **Project URL** — like `https://abcdxyz.supabase.co`
   - **anon public** key — a long string labelled `anon` / `public`

> The **anon public** key is safe in the browser — the database's Row-Level
> Security is what protects your data. Never put the `service_role` key in this app.

---

## 3. Tell the app your Supabase details

In the project folder, find `.env.local.example`. Make a copy named exactly
**`.env.local`** (same folder). Open it and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdxyz.supabase.co      ← your Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...                ← your anon public key
NEXT_PUBLIC_SITE_URL=http://localhost:3000                 ← leave as-is for now
ANTHROPIC_API_KEY=                                         ← leave blank for Step 1
```

Save. (No quotes, no trailing spaces.)

> Mac tip: files starting with a dot are hidden in Finder. In the folder press
> **Cmd + Shift + .** to show them, or just create/edit `.env.local` from your
> code editor.

---

## 4. Create the database tables

1. In Supabase open the **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/migrations/0001_init.sql` from this project, copy
   **everything**, paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned." — that's expected;
   it just built all your tables, security rules, and the household-setup helper.

Confirm: open **Table Editor** — you should see `households`, `pantry_items`,
`recipes`, and the rest.

---

## 5. Point Supabase login back at the app

Magic-link emails need to know where to send people after they click.

1. Supabase → **Authentication** → **URL Configuration**.
2. Set **Site URL** to `http://localhost:3000`.
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/auth/callback`
   - (later, after deploying) `https://your-app.vercel.app/auth/callback`
4. Save.

> Supabase's built-in email sends a limited number of magic links per hour —
> fine for two people testing.

---

## 6. Run it on your computer

In Terminal, inside the project folder:

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the **Pantry** sign-in screen.

End to end:
1. Enter your email → **Email me a sign-in link**.
2. Check your inbox, click the link — it returns you to the app.
3. First time in you'll land on **Set up your household** — enter your name and
   a household name, then **Create household**.
4. You arrive at the home screen with the "Use these soon" strip (empty for now)
   and the greyed-out weekly-loop cards.

**Add your partner:** they sign in with *their own* email and choose **Join
partner** on the setup screen. The invite code is your household's ID — for now,
in Supabase **Table Editor → `households`**, copy the `id` value and share it.
(A one-tap "copy invite" button arrives in Step 3.)

Stop the app anytime with `Ctrl + C` in Terminal.

---

## 7. App icons (optional polish)

The app ships with an SVG icon that works on modern phones. For the crispest
result on older devices, drop PNGs into `public/icons/`: `icon-192.png`,
`icon-512.png`, `maskable-512.png`. Any generator (e.g.
<https://realfavicongenerator.net>) makes these from one image. The app runs
fine without them.

---

## 8. Put it on the internet with Vercel

1. Free account at <https://vercel.com> (sign in with GitHub is easiest).
2. Push this project to a **GitHub** repo. In the project folder:
   ```bash
   git init
   git add .
   git commit -m "Step 1 foundation"
   ```
   Then create a new **empty** repo on <https://github.com> and run the
   "push an existing repository" commands it shows you.
3. Vercel → **Add New… → Project** → import that GitHub repo. Vercel
   auto-detects Next.js — leave the build settings as default.
4. Before deploying, open **Environment Variables** and add the same three from
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` → set to your Vercel URL, e.g.
     `https://pantry-yourname.vercel.app`
5. **Deploy.** After ~1 minute you get a live URL.
6. Return to Supabase step 5 and add `https://<your-vercel-url>/auth/callback`
   to the Redirect URLs (and update Site URL if you want production links there).

---

## 9. Install it on your phone

Open the Vercel URL in your phone browser:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home screen**.

It now behaves like an app — full screen, own icon, and the pantry/list stay
viewable even on weak in-store signal.

---

## What works after Step 1

- A real, installable app on both phones.
- Passwordless email sign-in.
- One shared household you both join.
- Your database with every table and security rule in place.
- The home screen with the signature "Use these soon" strip (fills in once you
  add pantry items in Step 2).

**Next stage (Step 2):** the pantry ledger — add/edit items, three add methods
(manual, photo, quick buttons), live sync between both phones, and the
expiry-first view.

---

## Troubleshooting

**`npm install` → `EACCES ... /Users/you/.npm/_cacache ...`**
Your npm cache has root-owned files from an earlier `sudo` run. Fix once:
```bash
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"
```
(It asks for your Mac password — you won't see it type; that's normal.) Then
re-run `npm install`.

**`Error: EPERM: operation not permitted, uv_cwd`**
Your Terminal is "inside" a folder that was moved or deleted, so every command
fails. Step back out and into the current folder:
```bash
cd ~/Desktop
cd ~/Desktop/grocery-meal-manager
```
Then continue. (`pwd` shows where you actually are; `ls` should list
`package.json`.)

**`npm audit` shows vulnerabilities**
A fresh copy of this project should report **0**. If you see any, do **NOT** run
`npm audit fix --force` — for this project it suggests destructive downgrades
(e.g. Next.js 9). Paste the audit output and check the fix instead. This project
is pinned to Next.js 16 LTS with a postcss override precisely so the audit stays
clean.

**"Invalid API key" / blank screen**
Re-check `.env.local` — no quotes, no trailing spaces — and restart `npm run dev`
after editing it (stop with `Ctrl + C`, run it again). Env changes are only read
at startup.

**Magic link opens but bounces back to /login**
The Redirect URL in Supabase (section 5) must match exactly, including `http`
vs `https` and the `:3000` port.

**Partner can't join**
Confirm they used **Join partner** and pasted the household `id` exactly, with no
extra spaces.

**`command not found: npm` (or `node`)**
Node.js didn't install or the terminal was open before installing. Close and
reopen Terminal, or re-run the Node.js LTS installer (section 0).
