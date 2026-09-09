# CozyCraft mobile — cross-app reliability audit

Date: September 10, 2026 (Asia/Manila).

Project: `/Users/imbatzy/Downloads/COZYCRAFT MOBILE`; editable React app: `storefront/`; native shell: `src/app/`.
Baseline: `5ec82e7c899e93bf8e776b326c04b7d88d7f57b2` / published v1.0.73.

## Status and release boundary

The initial audit implemented source fixes and regression tests without releasing them. The user subsequently authorized publication. Release 1.0.74 includes these changes; distribution and build details are recorded in `docs/releases/1.0.74.md`. No app was installed on the user's phone.

**Database prerequisite completed:** `supabase/migrations/20260910110000_atomic_mobile_delivery_addresses.sql` was deployed before distributing the updated storefront. Its address-save client requires the new `save_mobile_delivery_address` RPC. Only this additive change was applied to the shared database; the existing migration history was preserved. The ledger SQL matches the repository bytes (MD5 `908726d0df8495c642434dd1eec299f7`). Tests also passed against the deployed function, with all synthetic fixtures rolled back.

The React frontend and Angular shell both compile. The authorized release refreshes committed/native assets using `scripts/prepare-native-web.sh all` and rebuilds the native apps. Physical-device verification remains a separate check. Installed apps do not automatically receive source changes.

## Confirmed defects and fixes

| Area | Failure | Fix |
| --- | --- | --- |
| Device storage | Quota failures and denied storage getters could interrupt startup, preferences, account flows, payment handoff, or native callback acknowledgement. | Optional browser persistence has a session-memory fallback; failed writes/removals override old cached values. Native shell cache operations no longer interrupt live callbacks. Persistence across restart is not promised when storage is unavailable. |
| Cached data | Valid JSON with the wrong shape (`null`, malformed bag entries, incompatible profile/catalog data) could crash rendering. | Cache validation rejects incompatible snapshots and falls back to safe defaults. |
| Wishlist | A slow Save request could land after a newer Unsave and reverse the customer's choice in the database. | Serialized shopping writes, synchronous optimistic state, and revision-aware rollback preserve tap order. |
| Move to bag | Failure restored the entire old wishlist/bag, undoing changes to unrelated products. Late failures could also restore data after sign-out. | Item-scoped rollback, synchronous duplicate-action guards, and account-generation checks. Checkout waits for pending shopping changes. |
| Background refresh | Old hydration, realtime, reconnect, or post-payment cart responses could overwrite newer edits. | Responses are applied only if the relevant shopping revision is still current and no write is pending. |
| Account boundaries | Account subpage state and a session-storage return hint could survive an identity change. | Account pages are keyed by identity, customer overlays/queues reset, and the return hint is cleared from its actual storage location. |
| Welcome voucher | A reconnect lookup started before dismissal could return later and reopen the voucher. | Reconnect and hydration use the same welcome-request revision boundary as refresh/dismissal. A held-response regression covers this sequence. |
| Checkout loading | A payment-preference lookup failure hid successfully loaded addresses; address failures silently left the delivery step empty. | Independent preference/address loading, explicit address-loading state and retry, and cancellation of obsolete component responses. |
| Checkout choices | A late preference response could replace a payment method already chosen by the customer. | Explicit payment choices take precedence over late defaults. |
| Address submissions | Same-frame submits could write twice; matching a saved address by street/mobile could select an older similar address. | Synchronous submit guards and use of the exact row returned by the save transaction, without a second mandatory list request. The client handles both single-row objects and PostgREST's table-result array, and rejects an unconfirmed response. |
| Default delivery address | The client cleared the existing default before saving its replacement; a failure between requests left no default. | A customer-owned transactional RPC serializes default changes, validates targets, and rolls back the entire operation on failure. It also rejects an old draft if the signed-in account changed. **Migration deployed for 1.0.74.** |
| Native bridge | Several navigation, notification, payment and browser-action handlers did not check the message sender. | Every native shell action is restricted to the storefront iframe; frontend native messages must come from its parent. Unrelated-sender tests cover rejection and legitimate navigation. |
| Feedback and delivery settings | An older toast timer could erase a newer message; an empty successful delivery-area refresh was ignored. | Cancel superseded toast timers and accept empty authoritative delivery-area results. |

## Verification

All backend HTTP/WebSocket traffic in the browser journey tests was intercepted. These runs did not create real orders, send customer emails/SMS, or issue production rewards.

- Frontend TypeScript check: passed.
- Frontend tests: **285 passed / 56 files** (baseline: 260 / 53); includes five address-response checks added during release validation.
- Native shell tests: **18 passed** (baseline: 14).
- Native shell lint: passed.
- React production build and Angular production build: passed.
- Production npm dependency audits: **0 known vulnerabilities** in both package trees at audit time.
- `design-audit.mjs`: **320 responsive layout combinations**, 160 for each platform styling, across 320/390/768 widths and 844×390 landscape, with all four text sizes. These layout sweeps run in Chromium; separate interaction suites also run in WebKit.
- `overall-reliability-audit.mjs`: **18 real-app scenarios** in Chromium/WebKit covering denied storage, malformed caches, delayed save/unsave, failed moves, unrelated bag changes, sign-out during a move, same-frame add taps, and native sender validation.
- Release verification repeated those **18 scenarios against the compiled production frontend**. The sign-out scenario uses actual account controls with a held backend response; it does not depend on development-only source imports. All **153 packaged web files** match in the APK and compiled iOS simulator app.
- `full-onboarding-audit.mjs`: **14 full-tree journeys** across both engines. Google finish/skip and email finish/skip/returning/retry/reconnect all reach the voucher appropriately; dismissal and reload do not repeat it. The reconnect case holds a stale response until after dismissal.
- `manual-onboarding-audit.mjs`: **2 full-tree signup journeys**, including delayed settings, small viewport, Terms/Back, and one complete submission.
- `performance-audit.mjs`: **21 fixture smoke checks**, including 6× CPU slowdown in Chromium and narrow/extra-large-text layouts in WebKit. This is not an FPS, battery, RAM or physical-device benchmark.
- Price-range/review-thumbnail suite: **24 passed**.
- Badge/back-button suite: **24 passed**.
- Floating Back suite: **8 passed**, including nested dialogs and focused inputs.
- Search-discovery shortcuts: **32 passed**.
- Care chat: **32 passed**, covering local account answers, reset, support navigation, offline status and Back.
- Address SQL tests: passed first with all changes rolled back, then again against the deployed function with fixtures rolled back. Checks include one default, exact returned row, rejected save/missing target preserving the default, owner isolation, changed-account rejection, and anonymous denial. No synthetic test users remain.
- Rendered screenshots inspected: extra-large-text Care, email-signup welcome voucher with mascot, and Home Circle floating Back.
- `git diff --check`: passed.

The design audit's focus-restoration assertion now waits for the existing animation-frame reconciliation. Inspection confirmed that focus was restored correctly after that frame; no unnecessary dialog timing changes were made.

## Remaining verification limits

This is a reproducible cross-app audit, not proof that every possible production interaction is bug-free. Real iPhone/Android hardware, OS keyboards, Google account-picker handoff, push delivery, actual card/GCash charges, invoice-email delivery, and slow-network behavior on a released signed native binary still require a controlled release/device test.

The build's large-chunk warning comes from the existing HEIC decoder. Its import remains lazy and is invoked for HEIC/HEIF photo processing; it is not preloaded as a launch dependency. No unsupported universal device-performance claim is made.
