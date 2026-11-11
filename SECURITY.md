# Gaden Hub – Security Notes

## What is already strong

- **Row Level Security (RLS)** is the real authority. Client-side role checks are only for UI convenience.
- Rate limiting, size caps, and guarded updates on posts/threads (likes + single reply only).
- Verified badge can only be set by staff.
- Photos bucket: public read, write/delete restricted to the member’s own folder, 1 MB + MIME limits.
- Atomic helpers (`merge_doc`, `append_item`, `add_like`, `bump_view`) reduce race conditions.
- Account self-deletion function exists and blocks staff accounts from self-deleting.

## What this commit fixed

1. Added a Content-Security-Policy and other security headers via `vercel.json`.
2. Bumped the service worker cache version.
3. Documented remaining work below.

## Remaining recommendations (do next)

### High priority
- **CSP is currently relaxed** (`'unsafe-inline'` is required because the whole app is one large inline script). Long-term: extract JS into external modules so the CSP can drop `'unsafe-inline'`.
- **Audit every `innerHTML` path** that renders user content. Prefer `textContent` or a single safe template helper. There are still many `innerHTML` assignments.
- **Move profile photos out of the database**. Base64 data-URIs inside `docs` bloat every load. Use the `photos` storage bucket only.
- **Confirm the publishable key** has the least privilege necessary in the Supabase dashboard.

### Medium priority
- Add Cloudflare Turnstile (or similar) before enabling Supabase CAPTCHA.
- Consider edge rate-limiting on Vercel / Cloudflare in addition to the database guards.
- Keep the private `gadenhub` repo and this deployed source in sync.

### Lower priority / hygiene
- Clean up duplicate numbered image assets.
- Finish modularising the giant `index.html` (biggest long-term maintainability win).
- Remove leftover demo data paths if any remain.

## How to apply the SQL

1. Open Supabase → SQL Editor.
2. Paste the entire contents of `supabase-setup.sql`.
3. Run it (safe to re-run).
4. Make yourself admin once:
   ```sql
   insert into staff values ('<your-auth-user-id>');
   ```

## Reporting issues

Contact the project maintainer or open an issue in the private repository.
