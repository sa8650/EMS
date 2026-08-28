-- Replace deprecated Llama 3.1 Zudo models with an active small Workers AI model.
update public.zudo_settings
set model='@cf/meta/llama-3.2-1b-instruct',updated_at=now()
where model in ('@cf/meta/llama-3.1-8b-instruct','@cf/meta/infire-llama-3.1-8b-instruct','@cf/meta/llama-3.1-8b-instruct-fast','@cf/meta/llama-3.1-8b-instruct-awq','@cf/meta/llama-3.1-8b-instruct-fp8');
alter table public.zudo_settings alter column model set default '@cf/meta/llama-3.2-1b-instruct';
