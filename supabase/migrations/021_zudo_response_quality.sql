-- Use the active Llama 3.2 3B model for clearer business-language Zudo responses.
update public.zudo_settings set model='@cf/meta/llama-3.2-3b-instruct',updated_at=now();
alter table public.zudo_settings alter column model set default '@cf/meta/llama-3.2-3b-instruct';
