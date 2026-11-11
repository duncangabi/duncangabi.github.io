# Gaden Hub

Single-page site (`index.html`) on Vercel + Supabase. Admin dashboard is built into `index.html` (script id `admin-embedded`).

Live: https://www.gadenhub.com

## Files
- `index.html` – the whole app (CSS, JS, admin)
- `assets/img/` – site images (referenced by the `IMG` map in index.html)
- `sw.js` + `manifest.webmanifest` – installable app, fast repeat visits, offline shell
- `vercel.json` – clean URLs, known-route rewrites, **security headers** (CSP, X-Frame-Options, Permissions-Policy, etc.)
- `404.html` – real not-found page
- `supabase-setup.sql` – ALL database rules and server functions. Re-run after every change to it.
- `SECURITY.md` – security strengths and remaining hardening recommendations

## Deploy checklist
1. Run `supabase-setup.sql` in the Supabase SQL Editor (do this before or with the deploy).
2. DO NOT turn on Supabase CAPTCHA yet. The site does not send a CAPTCHA token, so enabling it would block every sign-up and login. (Needs a Turnstile widget added to index.html first.) The hidden spam-trap field and per-hour limits protect you meanwhile.
3. Supabase > Authentication > Providers > Email: keep "Confirm email" on.
4. Vercel > Domains: attach www.gadenhub.com (canonical, sitemap and share image use it). Until then the site uses its own address.
5. Vercel > Analytics: enable Web Analytics (the script is already in the page).
6. In index.html set `SOCIAL={facebook:"",...}` to your page links; empty ones stay hidden.
7. Change `SUPPORT_EMAIL` to a domain address when you have one.

## Security
Real authorization is enforced by Supabase Row Level Security. See `SECURITY.md` for details and the remaining recommendations (especially moving away from the large inline script so CSP can be tightened).
