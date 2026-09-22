# OutKin Playwright smoke tests

The Playwright suite targets `https://joinoutkin.com` by default and has three
levels. The default public tests never create an account or change application
data. Signed-in tests use local browser state files so passwords and session
tokens are never committed.

## 1. Install and run the public checks

```bash
npm install
npm run test:e2e:install
npm run test:e2e:public
```

The public suite checks the home message, OutKin branding, signup legal consent,
the Legal & safety center, the About page, the web manifest, and the app icon.

You can also run this public subset without local setup: open the repository's
**Actions** tab, choose **Playwright public smoke**, select **Run workflow**, and
leave the target URL as `https://joinoutkin.com`. Failed runs retain screenshots,
traces, videos, and the HTML report for 14 days.

To run against a local or preview deployment instead, set the base URL first:

```bash
OUTKIN_E2E_BASE_URL=http://127.0.0.1:4173 npm run test:e2e:public
```

PowerShell:

```powershell
$env:OUTKIN_E2E_BASE_URL = "http://127.0.0.1:4173"
npm run test:e2e:public
```

## 2. Capture a signed-in test session

OutKin uses Turnstile on sign-in, so the safe setup is to sign in interactively
and let Playwright save the resulting browser state. Use a dedicated non-staff
test account, complete any required policy review, and close the browser after
the dashboard appears.

```bash
npm run test:e2e:auth:a
npm run test:e2e:member
```

The saved state is written to `playwright/.auth/user-a.json`. It contains an
active session and is intentionally ignored by Git. Never send or commit it.

The member smoke test is read-only. It verifies dashboard or onboarding access,
profile editing, connection capacity, Discover visibility, and the profile-photo
privacy controls. It does not save profile changes or upload a photo.

## 3. Run the opt-in two-account journey

Capture two separate completed test accounts:

```bash
npm run test:e2e:auth:a
npm run test:e2e:auth:b
```

Both accounts must be non-staff, 18+, discoverable, accepting new connections,
below capacity, and have no existing or blocked relationship with each other.
Set each account's public username and display name, then explicitly enable the
mutating journey:

```bash
export OUTKIN_E2E_USERNAME_A="outkin_smoke_a"
export OUTKIN_E2E_USERNAME_B="outkin_smoke_b"
export OUTKIN_E2E_NAME_A="Smoke A"
export OUTKIN_E2E_NAME_B="Smoke B"
export OUTKIN_E2E_MUTATING="1"
npm run test:e2e:flow
```

PowerShell:

```powershell
$env:OUTKIN_E2E_USERNAME_A = "outkin_smoke_a"
$env:OUTKIN_E2E_USERNAME_B = "outkin_smoke_b"
$env:OUTKIN_E2E_NAME_A = "Smoke A"
$env:OUTKIN_E2E_NAME_B = "Smoke B"
$env:OUTKIN_E2E_MUTATING = "1"
npm run test:e2e:flow
```

This journey creates a connection request, accepts it, sends a letter, verifies
the unread state, sends a reply, and verifies receipt. It deliberately does not
pause, end, block, report, delete an account, or remove uploaded storage files.
Use fresh accounts for a repeat run, because duplicate relationship protection
is expected to prevent recreating the same fresh-request state.

## Results and troubleshooting

- Run every configured project with `npm run test:e2e`. Authenticated projects
  appear automatically when their saved state files exist.
- Open a visible browser with `npm run test:e2e:headed`.
- The HTML report is written to `playwright-report/`.
- Failure screenshots, traces, and retained videos are written under
  `test-results/`.
- If a session expires, recapture it with the corresponding auth command.
- If a policy-review gate appears, accept the current policies interactively and
  recapture the session.

After the full manual launch test, delete the two test accounts in OutKin
Settings. Then remove any remaining test-account folders in the private Supabase
profile-photo storage buckets, as described in the launch cleanup notes.
