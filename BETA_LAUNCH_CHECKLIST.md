# Project PenPal — Closed Beta Launch Checklist

Use this before the first real tester and again before each larger beta batch.

## 1. Production health

- [ ] Latest Cloudflare Pages production deployment shows **Success**.
- [ ] Production URL opens without console-breaking errors.
- [ ] Test on a desktop browser and at least one phone-sized viewport.
- [ ] PWA/offline shell does not expose account data while offline.

## 2. Closed-beta access

- [ ] **Beta Ops → Readiness** shows the database invite gate installed.
- [ ] Owner account is **staff-only** and hidden from Discover/new pen-pal requests.
- [ ] No invitation labelled as a test remains after smoke testing.
- [ ] Create a fresh invite for the intended tester/group; prefer one-use codes for individuals.
- [ ] In a private/incognito window, confirm a fake invite fails.
- [ ] Confirm the real invite creates one account and a one-use code cannot be reused.

## 3. Signup and onboarding

- [ ] Verification email arrives and returns to the production Project PenPal URL.
- [ ] Required Terms, Privacy, and Community policy acceptance is recorded.
- [ ] New member can complete profile onboarding.
- [ ] New member can add/crop a profile photo or continue with initials.
- [ ] Discover loads and the member is not shown their own profile.

## 4. Core correspondence

- [ ] Pen-pal request can be sent, accepted, declined, and cancelled as appropriate.
- [ ] Digital letter can be sent, opened, and marked read.
- [ ] Pause/end/block/report controls remain available.
- [ ] Snail-mail address sharing still requires mutual relationship + explicit per-person sharing.

## 5. Beta support and feedback

- [ ] Beta member sees **Beta feedback** on the member dashboard.
- [ ] A feedback submission appears in staff Support as category **Feedback**.
- [ ] Staff reply appears in the member's Help → My conversations.
- [ ] Help → Report a bug still works separately for technical issues.

## 6. Admin visibility

- [ ] **Beta Ops → Beta members** shows which invite admitted each tester.
- [ ] Invitation usage and expiry are correct.
- [ ] Owner can disable an active invitation.
- [ ] Test-labelled invite cleanup removes its test accounts and the invite without touching staff or real beta members.

## 7. First-batch recommendation

Start small: invite roughly 3–5 people who will actually use the app and give specific feedback. Let them use it for several days before expanding the batch. Review feedback, support tickets, moderation events, invitation redemption, and any onboarding drop-off before issuing more codes.

## What not to share

Never ask testers to send passwords, authentication tokens, private mailing addresses, or another member's private information in beta feedback. Invite codes should be treated as temporary access credentials until redeemed or disabled.
