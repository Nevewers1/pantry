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

## Performance
- [x] Co-locate Vercel functions with Supabase (Sydney) — done.
- [ ] If still sluggish, trim redundant per-navigation auth checks.
