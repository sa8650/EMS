-- Run after 012. Public, unguessable verification links for invoices.
alter table public.invoices add column if not exists verification_token uuid not null default gen_random_uuid();
create unique index if not exists invoices_verification_token_uq on public.invoices(verification_token);
update public.platform_settings set setting_value=setting_value || '{"public_base_url":""}'::jsonb where setting_key='branding';
