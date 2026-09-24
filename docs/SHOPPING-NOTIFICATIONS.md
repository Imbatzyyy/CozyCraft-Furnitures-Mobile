# Cozy Surprises and shopping reminders

Implementation scope: mobile customer app plus an additive migration and the
existing shared push worker. No website UI changes. Local tests do not create
live pushes, discounts, customers or consent changes.

## Release deployment — 2026-09-24

Version 1.0.76 deploys migration `20260924090000` to the existing CozyCraft shared
backend and `send-mobile-push` version 15. The private scheduler and offer switch
are enabled with the owner-delegated starter limits below. Customer choices
remain default-off; no existing customer was opted in, and no test promotion or
voucher was issued to a real customer. The initial enabled scheduler tick had
no eligible recipients. The 15-minute cron job is active.

Live checks verified row-level security, dispatch/rule privileges, actual
checkout-wrapper compatibility, default policy, migration history and the
authenticated empty-queue HTTP 200 response. Unauthenticated dispatch returned
HTTP 401. The previous worker source and affected schema definitions were backed
up locally before deployment. This was one targeted transactional migration,
not a reset or an unfiltered push of the incomplete mobile migration directory.

Firebase configuration is present, but physical Android delivery has not been
tested. Apple APNs credentials are absent. The owner requested continuing the
iOS release with existing in-app/local behavior; **closed-app remote iPhone
push is not enabled or claimed**. Normal in-app inbox and local order behavior
remain; marketing is not mirrored locally to bypass the server's consent/caps.

## Customer experience

- My Profile has three independent, default-off switches: Offers and surprises,
  Cart reminders, and Wishlist reminders. Existing Home Circle notes consent is
  not reused for these new categories. Phone notification permission remains
  separate. Failed saves do not show a successful opt-in.
- Cart reminder eligibility starts 24–48 hours after a cart change; wishlist
  eligibility starts 5–7 days after a wishlist change. Due times are randomized
  once, not reset by each scheduler tick. Each unchanged revision is notified
  at most once. Real inventory, purchases and pending orders are checked again
  immediately before sending. A changed cart/wishlist cancels an obsolete send.
- The shared queue covers these categories **and** existing store announcements:
  at most two provider-accepted campaigns per account per rolling seven days,
  at least 48 hours apart, during 10:00–19:00 in the stored IANA timezone.
  Essential order/payment alerts do not consume this allowance.
- Native notification taps are retained until React is listening. React reads
  the notification for the signed-in account, waits for setup/tutorial/welcome
  voucher/payment and other overlays, and opens the bag, wishlist or exact offer.
  Push-provided arbitrary URLs are never navigated to.
- The ivory/sage offer sheet uses the existing voucher mascot, actual amount,
  minimum subtotal, expiry and code. Expired/used/missing offers have a safe
  inactive state. All vouchers remain in Home Circle and use the existing atomic
  redemption/checkout path. Viewing a notification does not redeem anything.
- Shopping Realtime inserts update the inbox only; they do not also schedule a
  duplicate local notification. Android has a separate shopping channel.
- New native token registration marks a device as shopping-compatible. New
  campaigns require such a device and dispatch only to compatible native tokens;
  older/unknown-platform registrations do not qualify. Existing announcements
  use the previous Android channel on legacy devices. Essential alerts keep
  their existing path. Invalid-token cleanup uses the actual live table schema.
- No recurring phone timer or polling was added. The sheet animates transform
  and opacity only, supports reduced motion/economy mode, large text, safe areas,
  short landscape screens, focus containment, Escape, and native Back.

## Conservative starter offer policy

The owner delegated the choice of these three business parameters on 2026-09-24.
The migration now seeds this cautious starter policy:

| Parameter | Starter limit |
| --- | --- |
| Discount per automatic offer | PHP 100 fixed |
| Minimum merchandise subtotal | PHP 10,000, excluding delivery charges |
| Automatic-offer issuance budget | PHP 1,000 per Manila calendar month **and** rolling 30 days |
| Maximum vouchers within that budget | 10 at PHP 100 each |
| Validity | 48 hours |
| Per-account issuance | At most one surprise per 30 days |

PHP 100 is at most 1% of an eligible merchandise subtotal. This is a controlled
pilot allocation, **not a profitability guarantee**: the inspected catalog does
not provide product-cost/margin data. Product cost, payment charges, fulfillment,
taxes and other expenses still require business review; the small pilot cap
does not replace that review or certify the profitability of an order.
Do not market the policy as loss-proof or automatically margin-checked.

Both `enabled` and `offers_enabled` start **false** when the migration is first
applied. Production activation is a separate explicit operator action; the
current release state is recorded above. It never opts customers in. The
scheduler never raises the discount or budget by itself.

`private.mobile_shopping_rules` contains an operator-controlled global switch,
offer switch, discount, minimum subtotal, monthly budget and expiry hours.
The initial offer type is a **storewide fixed-amount, account-bound voucher**, not
a product-specific or category-restricted offer. Existing reward types support
PHP 100/300/500/700, but these automatic offers are limited to **PHP 100**.
The database prevents enabling offers with a minimum below 100 times the
discount, or an issuance budget above PHP 1,000. The budget may be lowered to at
least one voucher; use the global or offer switch to stop new issuance entirely.
Increasing these safety ceilings requires an explicit reviewed schema change,
not an automatic scheduler decision or a customer-supplied setting.
Future category/product restrictions require corresponding checkout validation;
they must not be represented only in notification text.

Eligibility after activation: account is over seven days old, has a due cart
or wishlist, has available merchandise, opted in, has no currently available
reward, no recent/pending purchase, and has received no surprise in 30 days.
Expiry is 24–48 hours. No discount stacking with another Home Circle reward.
The budget uses the full face value **issued**, including unused and expired
vouchers. It counts the larger window of the Asia/Manila calendar month or the
last 720 hours. This protects both the month limit and the month-boundary reset;
it intentionally errs on the side of fewer offers. Issuance is serialized so
two jobs cannot overspend. Cancelled vouchers do not recycle this budget.

This allocation covers **new automated surprise vouchers only**, not existing
welcome vouchers, earned Home Circle rewards, manual promotions, delivery
subsidies or messaging/provider costs. It measures commitments at issuance,
not payment/refund accounting by redemption month. An unexpired voucher issued
near month end remains valid for its stated 48 hours in the next month.
Cart and wishlist reminders themselves do not create a discount. When the
offer allocation is exhausted, opted-in, eligible non-discount reminders can
still run under the existing frequency caps.

## Deployment and device acceptance checklist

1. Confirm the target shared Supabase project and back up the schema. Verify
   existing `pg_cron`, `pg_net`, Vault, reward tables, native token table, security
   helper and existing reward checkout migrations. The mobile migration folder
   is not a complete standalone copy of the shared commerce schema: do not
   blindly reset a linked database or push unrelated migrations.
2. Apply `20260924090000_mobile_shopping_notifications.sql`, leaving both flags
   disabled. It installs the private outbox and a named 15-minute cron job.
3. Deploy the updated `send-mobile-push` function. It requires the existing
   `PUSH_WEBHOOK_SECRET`, Supabase service credential, APNs configuration and FCM
   service account. Vault entries are `cozycraft_project_url` and
   `customer_push_webhook_secret`; the latter must match the function secret.
   Keep the function JWT check disabled because it authenticates its private
   webhook bearer token itself. Never expose these credentials to the client.
4. Publish the rebuilt app to test devices. New campaigns are gated by the
   shopping-compatible token registered by this release. Old devices do not
   receive new campaign types before they have destination/channel support.
5. Use controlled, explicitly opted-in test accounts. Verify APNs and FCM from
   app-open, background and terminated states; also test Focus/Do Not Disturb,
   denied permissions, expired/used offers, logout, a second account, no network,
   purchasing during the queue delay, and a killed worker lease recovery.
6. With explicit owner authorization, set `enabled=true` and, for the bounded
   pilot, `offers_enabled=true`. Cart/wishlist reminders require no discounts.
   The owner delegated the above conservative figures and requested publication;
   activation does not certify margins. Review actual business costs before
   expanding the pilot or raising any ceiling. No per-offer admin action is
   needed after this one-time activation. Missing APNs configuration remains
   an explicit platform limitation, not a successful device test.

Marketing sends require the new outbox; the push worker fails closed if the
migration is absent. Stage migration/worker activation together to avoid a long
pause in existing announcement pushes. No source changes are required for
normal automated scheduling once the backend has been activated.

## Delivery limits and operations

- Provider acceptance is not proof of device presentation. Focus, OS settings,
  connectivity, Android force-stop, token validity and provider configuration
  still matter. Promotions never use the iOS Time Sensitive interruption level.
- There are at most five leased send attempts with backoff. Stable collapse IDs
  reduce duplicate alerts after uncertain provider responses; exactly-once
  external delivery is not promised. One successful device send completes the
  campaign rather than resending it to successful devices because another failed.
- Expiry is passed to both APNs and FCM. Checkout enforces expiry again regardless
  of when the push arrives. Messages already delivered cannot always be recalled.
- `private.mobile_shopping_deliveries` is the operational log: queued/sending/
  sent/cancelled/failed, attempts, lease, expiry and timestamps. Inspect failed
  rows and function logs. Invalid tokens are deactivated by the existing worker.
- Global emergency pause: set `private.mobile_shopping_rules.enabled=false`.
  This suppresses marketing only. It does not remove legitimate issued vouchers,
  change orders, or revoke checkout entitlements.
- Notifications are not sent repeatedly about an unchanged bag or wishlist.
  A failed or cancelled revision is not automatically re-created; the queue's
  bounded retry policy or a genuine customer change determines what happens next.

## Verification

`supabase/tests/shopping-notifications.mjs` executes the actual migration and
reward helper in disposable in-memory PostgreSQL via PGlite. Commerce tables
use a minimal fixture; cron/network calls are stubs. It does not prove live
Supabase privileges/extensions/configuration or external delivery.

Run it with an installed PGlite package, for example:

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/shopping-notifications.mjs
node --test supabase/functions/_shared/shopping-push.test.ts
npm --prefix storefront test
npm --prefix storefront run typecheck
npm run lint
npm test -- --watch=false --browsers=ChromeHeadless
```

`storefront/qa/shopping-notifications-audit.mjs` checks the compiled real app on
Chromium and WebKit, 320/390/844/1440px, extra-large text and a throttled small
Chromium device. All backend traffic is intercepted. It checks saved preferences,
bag/wishlist/offer destinations, rapid duplicate native messages, expired offers,
overflow and visible close/actions. Onboarding regression audit remains in
`storefront/qa/full-onboarding-audit.mjs`.

Release verification on 2026-09-24: **304** frontend tests (including 12 focused
notification tests), **19** Angular/native-shell tests, **8** Xcode-toolchain
tests, **24** PostgreSQL fixture scenarios and **3** push-policy tests passed,
along with frontend typecheck, Angular lint and Deno push-worker typecheck.
All **8** compiled shopping browser cases and **14** onboarding journeys passed.
Production web builds, signed Android debug APK and unsigned Xcode 27 simulator
build passed. All **158** web files matched both native source bundles, the
packaged APK and the built simulator app. Android signature and platform build
versions were verified. Physical-device push delivery remains untested.

Database cases include exactly ten offers/refusal of an eleventh, retained
budget after expiry/cancellation/use, month boundaries and 31-day months, unsafe
rule rejection, delivery excluded from minimum spend, exact-threshold redemption,
no reuse/stacking, per-account 30-day issuance and the native compatibility gate.
Live backend verification is described separately above; the local PostgreSQL
fixture is not represented as a physical-device or live-customer purchase test.
