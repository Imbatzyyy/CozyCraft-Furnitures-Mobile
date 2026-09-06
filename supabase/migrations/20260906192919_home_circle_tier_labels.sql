-- Keep existing tier keys stable for installed app versions and reward rules.
-- Store the customer-facing name on every account, including future accounts.
alter table public.mobile_loyalty_accounts
  add column tier_display_name text generated always as (
    case tier
      when 'member' then 'Cozy Nest'
      when 'plus' then 'Cozy Plus'
      when 'premium' then 'Cozy Premium'
      when 'elite' then 'Cozy Elite'
      else 'Cozy Nest'
    end
  ) stored;

comment on column public.mobile_loyalty_accounts.tier_display_name is
  'Customer-facing Home Circle tier name. The member key remains stable for older apps; its display name is Cozy Nest.';
