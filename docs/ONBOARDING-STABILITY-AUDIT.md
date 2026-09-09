# Onboarding stability audit and fixes

Scope: mobile app only (`storefront/` React application plus the Ionic/Capacitor shell). Covers manual signup, Google callback and profile setup, welcome tutorial, and existing voucher handoff. Included in the v1.0.72 release; see `docs/releases/1.0.72.md` for distribution and verification boundaries.

## Follow-up: manual welcome reward in v1.0.73

Physical-device feedback exposed a coverage gap in this audit: the manual/email path asserted tutorial completion but did not require a welcome voucher afterward. v1.0.72 still excluded manual customers at the status-loading, UI visibility and database issuance layers. v1.0.73 fixes those exclusions and adds full-app Finish/Skip, already-toured recovery, failed-lookup retry, dismissal and reload assertions for email accounts, plus transactional database eligibility/idempotency tests. See `docs/releases/1.0.73.md` and `supabase/tests/mobile-manual-welcome-voucher.sql`.

## Confirmed central cause: sibling component key collision

`Storefront.tsx` gave `CustomerWelcomeFlow` and `MobileCareChat` the same key: the signed-in user ID. They are siblings under the same parent. React explicitly warned that the duplicate key could cause children to be duplicated or omitted. In the actual app tree, the Google name form was duplicated, creating two independently stateful onboarding portals.

The full-app audit reproduced two `First name` inputs/dialogs. Restoring **only those two old keys**, with all other fixes retained, reproduced the failure again. With namespaced `welcome:<id>` and `care:<id>` keys, the same audit passed in Chromium and WebKit. This is why the previous isolated component tests missed the main issue.

## Other defects and performance contributors addressed

| Area | Finding | Change |
| --- | --- | --- |
| Native auth callback | The shell sends at 0/250/750/1500/3000 ms and redelivers a stored URL on resume. The storefront exchanged every message, without deduplication, acknowledgement, or rejection handling. | Validate callback source and URL; acknowledge delivery; cancel native retries and clear the stored URL; exchange each code once; contain failures. A stale old callback cannot redirect an already signed-in shop session. |
| Session initialization | A delayed `getSession` snapshot could apply after a newer auth event, and its promise could apply after route cleanup. | Ordered, cancellable observer; defer app work out of the auth callback; coalesce event bursts; reject stale startup results. |
| Auth refresh workload | Every auth event reloaded profile, catalog, cart, orders and notifications, including tutorial metadata updates. | Hydrate once per active identity. Existing realtime/reconnect paths still refresh data; security/MFA checks remain enabled. Full-app tests verify metadata updates do not refetch the catalog. |
| Manual step sequence | `username_required` changed the step array while the customer was partway through it. The same numeric step could then show a different form. | Stable step sequence, optional username label when allowed, wait for initial settings before advancing, and validate current server requirements before submission. |
| Repeated input | Manual and Google intermediate steps did not synchronously reject queued taps/Enter events. | Shared 240 ms transition gate, disabled controls during transitions, held-Enter protection; existing final-submit guards retained. |
| Manual Terms navigation | Leaving the create-account route discarded all fields and the current step. | Memory-only non-secret draft. Return to the same step with names/email/username retained; passwords and consent deliberately reset. Clear draft after successful signup. |
| Settings feedback | Normal settings loading showed a retry control and briefly displayed the default password minimum after returning from Terms. | Separate loading from failure, show retry only on failure, wait for the real password requirements, and prevent form submission while settings are unavailable. Retry preserves entered names. |
| Google slow submit | Remounting during a pending save created a fresh unlocked form. | Account-scoped pending request; remounted form stays disabled until it settles and does not submit again. |
| Tutorial lifecycle | Unmounting discarded the active step; later eligibility responses could hide an active tour. | Account-scoped in-progress step memory, active-tour eligibility latch, and existing idempotent Finish/Skip behavior. |
| Security race | A pre-sign-out security check could finish after sign-out. | Invalidate its generation immediately on `SIGNED_OUT`; existing MFA and revoked-session checks are retained. |
| Focus/layout work | Global and local handlers both managed tour/setup focus, and every DOM mutation triggered synchronous layout inspection. | Explicit focus ownership for self-managed dialogs; coalesce global inspection per animation frame; avoid input autofocus while opening setup and use prevent-scroll focus restoration. |
| Rendering cost | Large PNG assets, stacked arrival animations, full-screen live blur, and a keyboard-sensitive mascot-height breakpoint. | Responsive 384/768 WebP assets, next-pose warming, one short slide animation, no full-screen live blur, stable width-based signup mascot layout. Original art remains as fallback. |

## Verification

- TypeScript validation passed.
- Storefront suite: 255 tests across 53 files passed.
- Native shell: 14 tests passed, including exact callback acknowledgement and cancellation.
- Full actual app/router plus actual Supabase client, with all remote HTTP/WebSocket traffic intercepted locally:
  - Google setup → tutorial → welcome voucher → interactive storefront in Chrome and WebKit.
  - Verified email account → tutorial → interactive storefront in both engines.
  - Repeated auth metadata changes with no duplicated form, lost username, repeated save or repeated catalog fetch.
  - Manual signup with delayed settings/signup responses, small keyboard-sized viewport, Terms/Back, password clearing, and exact name/username/email payload once.
  - Chromium CPU throttling: 4x for Google and 6x for manual flow.
- Responsive fixture matrix: 320×568, 390×844, 844×390, 768×1024; normal and enlarged text; Chrome and WebKit.
- Tutorial: 25-click bursts, reduced and normal motion, single spotlight, Finish/Skip → voucher, and restored app interactivity.
- Visual inspection: WebKit voucher and manual signup screenshots; mascot loaded and controls present.
- Native web assets synchronized; Android debug APK and iOS simulator build passed.
- Live read-only backend check: account settings returned HTTP 200 (password minimum 10, username required, Google enabled). Anonymous onboarding RPC was rejected with HTTP 401 / Postgres 42501, as expected. No database schema or customer data changes.

### Asset measurements

Original mascot PNG set: 17,971,683 bytes. Equivalent 768px WebP set: 774,296 bytes (96% smaller). These are asset-byte savings, not a claim of a measured 96% frame-rate improvement. Browsers choose 384px or 768px based on rendered size and display density; originals remain fallback sources.

### Reproducible browser audits

Run the production-tree dev server with `npm --prefix storefront run dev -- --port 5197`, then run these scripts with `PLAYWRIGHT_MODULE` pointing to the installed Playwright module:

```sh
node storefront/qa/full-onboarding-audit.mjs
node storefront/qa/manual-onboarding-audit.mjs
```

They intercept backend requests and never create real accounts. Isolated component/browser fixtures remain useful for the wider viewport/rapid-input matrix, but are not a replacement for the full-app audits above.

## Remaining verification boundary

No fresh live Google login, email-link delivery, or physical iPhone/Android interaction was performed during this audit. Desktop WebKit and CPU throttling do not certify every device, keyboard, thermal state, or OS release. Native builds are compile checks, not App Store/TestFlight publication. v1.0.71 does not include these fixes. Install v1.0.72 for device acceptance testing; a Git push alone does not update an installed native app.
