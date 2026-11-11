# Phase 1 – Extract config & Supabase client

This phase moves configuration and the Supabase client out of the giant `index.html` **without changing behaviour**.

## What was added

| File | Purpose |
|------|--------|
| `js/config.js` | SUPPORT_EMAIL, SUPABASE_URL/KEY, SITE_URL, PROV, SOCIAL, SEC, CROPS |
| `js/supabase.js` | Creates global `sb`, plus `host()`, `netErr()`, `checkConn()` |
| `js/safe.js` | XSS helpers (`esc`, `attr`, `safeUrl`, `html`, …) – already present |

## How to wire it in (do this next)

1. Open `index.html`.
2. Near the top of the `<body>` (or just before the big inline script), add:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4"></script>
<script src="/js/safe.js"></script>
<script src="/js/config.js"></script>
<script src="/js/supabase.js"></script>
```

3. Inside the big inline script, **delete or comment out** the old declarations that are now provided by the modules:

```js
// DELETE these (they are now in js/config.js + js/supabase.js):
// const SUPPORT_EMAIL = "...";
// const SUPABASE_URL = "...";
// const SUPABASE_KEY = "...";
// const SITE_URL = ...;
// let sb = null; try { ... createClient ... }
// const host = () => ...;
// const netErr = e => ...;
// async function checkConn() { ... }
```

4. Keep the rest of the app exactly as it is for now.

5. Deploy to a Vercel preview URL and verify:
   - Home page loads
   - Login / Join still works
   - Marketplace, Community, Farmers pages render
   - No new console errors about `sb`, `SUPABASE_URL`, `esc`, etc.

## Why this order?

- Loading the three small files first means the globals (`esc`, `SUPABASE_URL`, `sb`, …) already exist when the big script runs.
- We are only *moving* code, not rewriting logic, so risk is low.
- Once this is stable we can start Phase 2 (splitting individual pages).

## Rollback

If anything breaks, remove the three new `<script>` tags and restore the deleted lines. The modules themselves do not change the live site until you wire them in.
