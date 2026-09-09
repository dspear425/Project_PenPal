# Project PenPal — Public Early Access Launch Checklist

Use this checklist for the transition from closed beta to public early access.

## Database
- [ ] Run `supabase/add_chosen_family_preferences.sql` if it has not already been applied.
- [ ] Run `supabase/convert_to_public_early_access.sql`.
- [ ] In Launch Ops → Readiness, confirm Open signup, Owner staff-only, Owner hidden, Feedback channel, and Required policies all pass.

## Production
- [ ] Latest Cloudflare Pages deployment shows Success.
- [ ] Hard-refresh the production site after the v15 PWA cache update.
- [ ] Confirm the landing page shows Public early access and the chosen-family/supportive-friendship message.
- [ ] Confirm `/about.html` loads.
- [ ] Confirm `/robots.txt` allows crawling and `/sitemap.xml` loads.

## Public signup smoke test
- [ ] Open a private/incognito window.
- [ ] Create an account without any invitation code.
- [ ] Confirm signup still requires the legal-consent checkbox.
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
- [ ] Check Discover, Menu, Help, correspondence, and feedback at a phone-sized viewport.

## Promotion readiness
- [ ] Prepare a short public launch post and a longer community-specific version.
- [ ] Start with communities where friendship/pen-pal discovery is on-topic and follow each community's self-promotion rules.
- [ ] Watch Launch Ops for completed-profile rate, not just raw signups.
- [ ] Review feedback/support frequently during the first public week.

## Next hardening step
Before broad promotion, add free bot/signup abuse protection (for example a supported CAPTCHA/Turnstile flow) so open registration does not become an unnecessary spam or cost vector.
