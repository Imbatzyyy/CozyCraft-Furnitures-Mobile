# Delivered-order invoice email

The mobile order-details screen exposes Request an invoice only for a delivered order with a database ID. The new `request-order-invoice` Edge Function is deployed to the existing mobile backend with JWT verification enabled. Existing functions, tables, and the customer website are unchanged.

The handler revalidates the user via Auth, requires a verified account email and an active customer profile, and fetches the order with both order ID and user ID predicates. The client cannot supply recipient email, prices, or delivery status. Invoice content uses saved order-item snapshots; inconsistent totals fail closed for Care review.

The generated invoice is the email body (HTML plus plain-text alternative), not a PDF attachment or registered tax invoice. It records delivery, payment status, items, subtotal, delivery fee, discount, and total. A successful popup means Resend accepted the send request, not proof of inbox delivery. The provider's stable per-order/per-user/per-UTC-day idempotency key protects repeated identical submissions and retries. Changed content within that window can produce a conflict and asks the customer to retry later. No scheduled sending, polling, or new database storage is used.

Configuration uses existing `RESEND_API_KEY` and optional `RESEND_FROM_EMAIL`; the established transactional sender is the fallback. No email secrets are embedded in the app.

Verification completed: 210 storefront tests; mocked backend authorization, ownership, delivery, recipient, duplicate-key, and provider-error tests; Deno check using `supabase/functions/deno.json`; live schema read; endpoint active with verify_jwt=true; unauthenticated live request rejected with HTTP 401; Chromium/WebKit email and popup layouts at 320/390/768px; Android and iOS simulator builds.

Release: packaged for mobile v1.0.59. Remaining acceptance: signed-in delivered-order request and actual inbox arrival, plus physical iPhone/Android and Gmail/Apple Mail rendering. No production customer email was sent during implementation.
