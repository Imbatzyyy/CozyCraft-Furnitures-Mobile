-- Index mobile-owned foreign-key lookups without changing shared website RLS.
create index if not exists mobile_google_onboarding_voucher_id_idx
  on public.mobile_google_onboarding(voucher_id);
create index if not exists mobile_payment_email_challenges_order_id_idx
  on public.mobile_payment_email_challenges(order_id);
