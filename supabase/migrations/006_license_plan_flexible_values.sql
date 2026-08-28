-- Run after 005. License plans may use free pricing and any positive duration.
alter table public.licenses drop constraint if exists licenses_amount_check;
alter table public.licenses add constraint licenses_amount_nonnegative_check check(amount >= 0);
alter table public.licenses drop constraint if exists licenses_duration_months_check;
alter table public.licenses add constraint licenses_duration_positive_check check(duration_months > 0);
