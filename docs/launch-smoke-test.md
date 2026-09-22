# OutKin public-launch smoke test

Run this checklist against `https://joinoutkin.com` after applying the latest
Supabase migrations and before inviting the Founding Circle. Use two new,
non-staff test accounts in separate browser profiles so session data never
crosses between members.

Record the date, browser/device, account aliases, result, and any screenshot or
error text for every failure. Do not use real mailing addresses during testing.

## 1. Public entry and signup

- [ ] Home page, About page, title, metadata preview, icon, and installed PWA say OutKin.
- [ ] Public copy welcomes LGBTQ+ people and allies and does not present OutKin as dating, therapy, housing, or emergency support.
- [ ] Account A can sign up without a beta invitation.
- [ ] Required legal consent is shown and recorded.
- [ ] Duplicate email, weak password, bot protection, and password recovery fail or succeed with understandable messages.

## 2. Profile creation

- [ ] Account A can complete all required profile fields and select at least three interests.
- [ ] The profile saves without a table-permission error.
- [ ] Writing-connection capacity is aligned and usable on desktop and mobile.
- [ ] Draft answers survive a refresh before the profile is submitted.
- [ ] Account A can upload, crop, replace, hide, and remove a profile photo.
- [ ] Photo visibility works for Discover, established connections, and Hidden.
- [ ] Account A can hide from Discover and restore visibility from both the dashboard and profile editor.

## 3. Discovery and connection

- [ ] Account B completes a compatible profile and both eligible profiles appear in Discover.
- [ ] A hidden or non-accepting profile does not accept a new request.
- [ ] Account A can open Account B's profile and send a request.
- [ ] Account B receives a visible request badge and can accept or decline.
- [ ] Capacity limits and duplicate/open-request protection produce clear messages.

## 4. Correspondence

- [ ] After acceptance, both members can send and read a digital letter.
- [ ] The recipient sees an unread-letter badge and opening the thread updates read state.
- [ ] Pause prevents new letters while preserving history; resume restores writing.
- [ ] End preserves read-only history; reconnect creates a new request without erasing history.

## 5. Privacy and safety

- [ ] Email, private surname, member code, and mailing address are absent from public profiles.
- [ ] Blocking removes normal discovery/contact access; unblocking does not reconnect automatically.
- [ ] Reporting creates a moderation item without exposing the reporter to the other member.
- [ ] Existing connections remain available when a member hides from Discover.
- [ ] Snail-mail address exchange requires mutual consent and never exposes another member's address through export.

## 6. Administration and support

- [ ] A member can open Help, create a support thread, receive a reply, and see the unread badge.
- [ ] A moderator can review a report and issue a warning using OutKin-branded notice text.
- [ ] Profile-photo removal uses OutKin-branded notice text.
- [ ] Suspension and restoration notices use OutKin wording and enforce account access correctly.

## 7. Release decision

Launch the Founding Circle only when every critical member journey above passes.
Cosmetic defects may be logged for later; do not launch with failures in signup,
profile save, authentication, requests, letters, privacy, blocking, reporting,
or moderation access.
