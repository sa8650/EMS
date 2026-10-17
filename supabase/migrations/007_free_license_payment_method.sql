-- Run after 006. Permit the internal 'other' payment method used for automatically approved free plans.
alter table public.licenses drop constraint if exists licenses_payment_method_check;
alter table public.licenses add constraint licenses_payment_method_check check(payment_method in ('bkash','nagad','other'));
