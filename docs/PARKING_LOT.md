# Parking lot — deferred tweaks & polish

Small improvements noted during the build, to fold into later edits. None block progress.

## Photo scan (Step 3)
- [ ] Option to **always capture the brand** in the item name.
- [ ] Smarter default **quantities** and **categories**.
- [ ] Optional **"estimate typical shelf life"** to pre-fill an expiry for common fresh items.

## Login / auth
- [ ] Replace the raw `{}` error surface on the login screen with a friendly message
      (e.g. "Couldn't send the code — try again in a moment").

## PWA / offline
- [ ] Reintroduce offline support at Step 8 with a **versioned, network-first** service
      worker so the earlier stale-cache problem can't recur.

## Step 6 Pass 2 — Plan my week (weekly planner)
Kids roster to encode (fortnightly, with per-day swap toggles):
- Arrive **Mon after school** (dinner only), **Tue** (all meals), **Wed** leave in the
  morning (needs breakfast + school lunchbox, no dinner).
- Away **Thu**.
- **Fri, Sat, Sun** here, then **Mon, Tue** here, **Wed** leave in the morning
  (breakfast + lunchbox).
- Away **Thu–Sun**, back the following **Mon afternoon** → cycle resets (14-day pattern).
- Swaps happen, so every planned day needs a "kids here / not here" toggle that
  overrides the pattern default.
- Weekend breakfasts on kids-here days = cereal, or toast with cheese & salami.
- Dietary hard filter: little to no chilli.
- Also: ratings 👍/👎 feedback loop to feed back into future plans.

## Performance
- [x] Co-locate Vercel functions with Supabase (Sydney) — done.
- [ ] If still sluggish, trim redundant per-navigation auth checks.
