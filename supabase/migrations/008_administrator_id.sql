-- Run after 007. Human-friendly four-digit Administrator ID for EMS control tables.
alter table public.administrators add column if not exists admin_code char(4);
with numbered as (select id, lpad((999 + row_number() over(order by created_at))::text,4,'0') as code from public.administrators where admin_code is null)
update public.administrators a set admin_code=n.code from numbered n where a.id=n.id;
alter table public.administrators alter column admin_code set not null;
create unique index if not exists administrators_admin_code_unique on public.administrators(admin_code);
