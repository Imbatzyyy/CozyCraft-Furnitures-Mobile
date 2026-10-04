# Shared backend ownership

The website and native app share Supabase project `gwjsivqksyimuabbdyqq`.

- **Website repository** (`CozyCraft-Furnitures`): shared catalog, order/payment APIs, PayMongo checkout/resume/return/webhook/reconciliation, email-payment verification, public review avatar endpoint, customer read models and realtime publication changes.
- **Mobile repository** (`CozyCraft-Furnitures-Mobile`): native iOS/Android shell, embedded storefront, mobile invoice and push implementations present under `supabase/functions`.
- `_shared` utilities in this repository remain for mobile-owned functions/tests; they are not separate deployable endpoints.

Stale deployable copies of `create-paymongo-checkout` and `verify-mobile-payment` were removed from the mobile repository in 1.0.81. Their previous source remains recoverable in Git. Do not copy them back or deploy shared payment APIs from an older app tag.

Do not run an unqualified `supabase functions deploy` or `supabase db push` against the shared project. Inspect live migration history, rehearse additive changes in a rollback transaction, apply only the intended migration, and verify owner/RLS behavior. The two repositories contain different historical migration sets.

The mobile 1.0.81 dependency is website migration `20261004090000_mobile_bounded_reads_and_recovery.sql`. Deploy it before distributing the app. Older mobile versions remain compatible.

Run `npm run verify:release` before packaging. Set `PLAYWRIGHT_MODULE` when Playwright is supplied by the workstation runtime, then run the documented browser journeys against the newly built storefront. Native asset verification must follow both platform builds.

GitHub Actions cannot be added using the currently connected OAuth token (it lacks `workflow` scope). The checked-in release gate is executable locally; do not describe it as an enabled hosted CI pipeline until workflow authorization is configured.
