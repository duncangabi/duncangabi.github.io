# Modularisation Roadmap – Gaden Hub

The live app is currently one large `index.html` (~1.7 MB of inline JavaScript).  
This is the biggest long-term risk for maintainability, reviewability and tightening the Content-Security-Policy.

Goal: move from a single file to a small set of clear modules without breaking the live site.

## Target structure (recommended)

```
/
├── index.html              # thin shell: <div id="app"> + script tags
├── css/
│   └── site.css            # extracted styles
├── js/
│   ├── safe.js             # XSS helpers (already added)
│   ├── config.js           # SUPABASE_URL, keys, constants, SOCIAL, etc.
│   ├── supabase.js         # client creation + auth helpers
│   ├── data.js             # all sb.from(...) / RPC calls
│   ├── render.js           # pure functions that return HTML strings
│   ├── pages/              # one file per major route
│   │   ├── home.js
│   │   ├── marketplace.js
│   │   ├── community.js
│   │   ├── farmers.js
│   │   ├── profile.js
│   │   └── ...
│   ├── admin.js            # already separate
│   └── app.js              # router + bootstrap
├── sw.js
├── vercel.json
└── supabase-setup.sql
```

## Phased plan (do in order)

### Phase 0 – Safety net (done / in progress)
- [x] Stronger `esc` / `attr` / `safeUrl` / `html` helpers (`js/safe.js`)
- [x] Security headers + CSP (even if still needs `'unsafe-inline'`)
- [x] Canonical `supabase-setup.sql` v2

### Phase 1 – Extract without changing behaviour (1–2 days)
1. Load `js/safe.js` first.
2. Replace the existing short `esc` function with a call to the new one (or delete the old one).
3. Move all configuration (Supabase URL/key, SUPPORT_EMAIL, SOCIAL links, province lists, etc.) into `js/config.js`.
4. Move the Supabase client creation and auth listeners into `js/supabase.js`.
5. Keep everything still working – only move code, do not refactor logic yet.

### Phase 2 – Split by route (biggest win)
1. Identify the main route handlers (home, marketplace, community, farmers, profile, admin, etc.).
2. Extract each into its own file under `js/pages/`.
3. Make each page export a single `render(state)` or `mount(root, state)` function.
4. The main `app.js` becomes a thin router that calls the right page module.

### Phase 3 – Rendering hygiene
1. Prefer `textContent` / `setText()` for any pure text.
2. When markup is required, use the `html\`...\`` tagged template so every interpolated value is escaped automatically.
3. Never put user-controlled data into `innerHTML` without going through `esc` or `html`.
4. Replace remaining data-URI profile photos with Storage URLs.

### Phase 4 – Tighten CSP
Once almost all JavaScript lives in external files:
```json
"Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; ..."
```
(You can eventually remove `'unsafe-inline'` from style-src too if you move styles fully out.)

## Practical tips

- Work on a branch. Deploy the branch to a Vercel preview URL and click through every major flow before merging.
- Keep the admin panel (`admin.js`) loading the same way it does today until the main app is stable.
- Do **not** try to rewrite the whole file in one sitting. Extract one page at a time.
- After each extraction, search for remaining `innerHTML =` that still concatenate user data and convert them.

## Quick wins you can do today

1. Add `<script src="/js/safe.js"></script>` near the top of the scripts.
2. Change every place that does `innerHTML = \`...${user.something}...\`` to use the `html\`...\`` helper or explicit `esc()`.
3. Replace pure text updates with `el.textContent = ...`.

Once Phase 1–2 are done, the codebase becomes dramatically easier to review, test and secure.
