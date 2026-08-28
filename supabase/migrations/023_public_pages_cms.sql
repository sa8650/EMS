-- Public website CMS: About, Blog, Contact, and Terms & Conditions.
create table public.public_pages (
 slug text primary key check(slug in ('about','terms','contact')),
 title text not null,
 body text not null default '',
 hero_image_prompt text,
 updated_by uuid references public.ems_owners(id),
 updated_at timestamptz not null default now()
);
insert into public.public_pages(slug,title,body) values
('about','About EMS V1',''),('terms','Terms & Conditions',''),('contact','Contact Us','') on conflict(slug) do nothing;
create table public.blog_posts (
 id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, body text not null, cover_image_url text, published boolean not null default false, published_at timestamptz, created_by uuid references public.ems_owners(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.contact_messages (
 id uuid primary key default gen_random_uuid(), name text not null, email text not null, phone text, subject text, message text not null, status text not null default 'new' check(status in ('new','read','closed')), created_at timestamptz not null default now()
);
revoke all on public.public_pages,public.blog_posts,public.contact_messages from anon,authenticated;
alter table public.public_pages enable row level security;
alter table public.blog_posts enable row level security;
alter table public.contact_messages enable row level security;
