-- Run after 004. Human-friendly four-digit Shop ID used by staff sign-in.
alter table public.stores add column if not exists shop_code char(4);
with numbered as (select id, lpad((999 + row_number() over(order by created_at))::text,4,'0') as code from public.stores where shop_code is null)
update public.stores s set shop_code=n.code from numbered n where s.id=n.id;
alter table public.stores alter column shop_code set not null;
create unique index if not exists stores_shop_code_unique on public.stores(shop_code);
