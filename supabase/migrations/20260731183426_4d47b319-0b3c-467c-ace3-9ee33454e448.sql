alter table public.user_preferences
  drop constraint if exists user_preferences_subscription_tier_check;

alter table public.user_preferences
  add constraint user_preferences_subscription_tier_check
  check (subscription_tier = any (array['basic'::text, 'premium'::text, 'komplet'::text]));