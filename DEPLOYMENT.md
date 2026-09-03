# Project PenPal deployment guide

This guide covers the initial closed-beta deployment of the React/Vite application to Cloudflare Pages with Supabase as the backend.

## 1. Cloudflare Pages project

Create a Pages project from the GitHub repository `dspear425/Project_PenPal` and use:

- Production branch: `main`
- Framework preset: React (Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Node.js: pinned by `.node-version`

The Vite configuration intentionally fails the build if either required Supabase environment variable is missing.

## 2. Production environment variables

Add these variables to the Cloudflare Pages production environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the same public project URL and publishable/anon key used by the local app unless a separate production Supabase project is intentionally created.

Never add a Supabase `service_role` key, database password, JWT signing secret, or other privileged server credential to a `VITE_` variable. Vite variables are bundled into browser JavaScript and are public by design.

## 3. First deployment

Deploy the `main` branch and copy the permanent production URL, for example:

`https://project-penpal.pages.dev`

The exact generated hostname may differ.

## 4. Supabase Auth URL Configuration

After the permanent Pages URL exists, open Supabase Authentication > URL Configuration.

Set **Site URL** to the exact HTTPS production URL, with no preview-deployment hostname.

Add these Redirect URLs as applicable:

- `https://YOUR-PAGES-DOMAIN.pages.dev/**`
- `http://127.0.0.1:4173/**` for local production-preview testing
- `http://localhost:5173/**` for local Vite development

When a custom production domain is added later, change Site URL to that custom HTTPS domain and add the custom domain to Redirect URLs. Keep the `pages.dev` URL only if it should remain a valid auth destination.

## 5. Closed-beta indexing policy

`public/robots.txt` and `public/_headers` currently tell crawlers not to index the app. This is intentional for the closed beta.

Before a public launch, deliberately review and remove:

- `Disallow: /` from `public/robots.txt`
- `X-Robots-Tag: noindex, nofollow, noarchive` from `public/_headers`

Do not remove these accidentally during beta.

## 6. Security headers

Cloudflare Pages receives the `_headers` file from `public/` during the Vite build. It currently applies:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive browser Permissions Policy for camera, microphone, geolocation, payment, and USB
- no-index directives for beta
- no-cache behavior for `sw.js`
- immutable long-term caching for Vite fingerprinted `/assets/*`

A Content Security Policy is intentionally not being enforced yet. Add one only after testing every Supabase, PWA, image, and future email/OAuth integration so the policy does not silently break application features.

## 7. Production smoke test

Use at least two ordinary test accounts plus one staff account and verify:

1. Signed-out welcome, signup, legal links, and sign-in.
2. Email verification redirects back to the production site.
3. Password-reset email redirects back to the production site and completes recovery.
4. Required policy acceptance records correctly for an existing account and a new signup.
5. Profile onboarding/editing, interests, photo upload/crop/privacy, and Settings.
6. Discover matching and full profile review.
7. Incoming/outgoing pen-pal requests, accept/decline/cancel, pause/resume/end/reconnect, block/unblock, and reporting.
8. Digital letter compose, autosave, send, unread/read state, and historical correspondence.
9. Snail-mail preference, request/accept flow, private address vault, independent sharing/revocation, and blocked/ended relationship behavior.
10. Help/support thread creation and staff reply.
11. Member notices and moderation actions.
12. Staff dashboard, member directory/casefile, activity tools, and role protections.
13. Data export and legal-acceptance history.
14. PWA installability and offline shell behavior over HTTPS.
15. Phone, tablet, and desktop menu/layout behavior.

## 8. Beta release discipline

For beta, deploy application changes through GitHub rather than editing generated files in Cloudflare. Cloudflare Pages will rebuild the production branch on each push.

Before inviting real beta users, create a small release checklist for each production update: build succeeds, auth works, Supabase migrations are applied first when required, and one end-to-end smoke test passes on the deployed URL.
