# Project PenPal — Public Early Access Launch Checklist

Use this checklist for the transition from closed beta to public early access.

## Database
- [ ] Run `supabase/add_chosen_family_preferences.sql` if it has not already been applied.
- [ ] Run `supabase/convert_to_public_early_access.sql`.
- [ ] In Launch Ops → Readiness, confirm Open signup, Owner staff-only, Owner hidden, Feedback channel, Required policies, and Turnstile frontend all pass.

## Bot and auth abuse protection
- [ ] Create a Cloudflare Turnstile widget for `project-penpal.pages.dev` using Managed mode.
- [ ] Add the public Turnstile site key to Cloudflare Pages as `VITE_TURNSTILE_SITE_KEY` and redeploy.
- [ ] Confirm Turnstile appears on Create account, Sign in, and Forgot password before enabling server-side CAPTCHA enforcement.
- [ ] In Supabase → Authentication → Bot and Abuse Protection, enable CAPTCHA, choose Cloudflare Turnstile, enter the private Turnstile secret, and save.
- [ ] Verify a normal signup succeeds after Turnstile verification.
- [ ] Verify an auth request without a fresh Turnstile token is rejected.
- [ ] Never place the Turnstile secret in GitHub or any `VITE_*` variable.

## Production
- [ ] Latest Cloudflare Pages deployment shows Success.
- [ ] Hard-refresh the production site after the newest PWA cache update.
- [ ] Confirm the landing page shows Public early access and the chosen-family/supportive-friendship message.
- [ ] Confirm `/about.html` loads.
- [ ] Confirm `/robots.txt` allows crawling, `/sitemap.xml` loads, and production responses no longer send `X-Robots-Tag: noindex`.

## Public signup smoke test
- [ ] Open a private/incognito window.
- [ ] Create an account without any invitation code.
- [ ] Confirm signup still requires the legal-consent checkbox.
- [ ] Confirm Turnstile verification is required.
- [ ] Confirm verification email returns to the production Project PenPal URL.
- [ ] Finish onboarding and confirm the new member can reach Discover.
- [ ] Confirm Chosen family and Supportive friendship options appear.
- [ ] Confirm How I show care and What feels meaningful to me preferences save.
- [ ] Confirm Send feedback creates a private support thread.

## Safety / privacy
- [ ] Confirm block and report controls are reachable from Discover/connections.
- [ ] Confirm profile-photo visibility behaves as expected.
- [ ] Confirm mailing addresses are not exposed during signup, Discover, or ordinary connection profiles.
- [ ] Confirm the Owner account does not appear in Discover.

## Mobile
- [ ] Check signup and onboarding at a phone-sized viewport.
- [ ] Confirm the Turnstile challenge fits at a phone-sized viewport.
- [ ] Check Discover, Menu, Help, correspondence, and feedback at a phone-sized viewport.

## Promotion readiness
- [ ] Prepare a short public launch post and a longer community-specific version.
- [ ] Start with communities where friendship/pen-pal discovery is on-topic and follow each community's self-promotion rules.
- [ ] Watch Launch Ops for completed-profile rate, not just raw signups.
- [ ] Review feedback/support frequently during the first public week.

## Ongoing monitoring
- [ ] Review Supabase Auth rate limits and auth logs if signup/login abuse appears.
- [ ] Review Cloudflare Turnstile analytics for unusually high invalid-token traffic.
- [ ] Do not weaken blocking/reporting or email verification to improve signup conversion.
