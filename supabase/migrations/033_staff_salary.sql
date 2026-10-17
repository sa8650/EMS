-- 033: Staff salary system — payroll invoices per staff member.
create type public.salary_invoice_type as enum ('current','due','advance');

create table public.staff_salary_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  salary_month date not null,
  invoice_type public.salary_invoice_type not null default 'current',
  base_amount numeric(14,2) not null default 0 check(base_amount >= 0),
  attendance_based boolean not null default false,
  present_days integer,
  total_days integer,
  incentive numeric(14,2) not null default 0 check(incentive >= 0),
  bonus numeric(14,2) not null default 0 check(bonus >= 0),
  fine numeric(14,2) not null default 0 check(fine >= 0),
  other_deduction numeric(14,2) not null default 0 check(other_deduction >= 0),
  add_outstanding boolean not null default false,
  cut_advance boolean not null default false,
  total numeric(14,2) not null default 0 check(total >= 0),
  paid numeric(14,2) not null default 0 check(paid >= 0),
  due numeric(14,2) generated always as (total-paid) stored,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.staff_salary_invoices(store_id, created_at desc);
create index on public.staff_salary_invoices(staff_id);

-- Service-role API is the only database client. Revoke public direct data access.
revoke all on public.staff_salary_invoices from anon, authenticated;
alter table public.staff_salary_invoices enable row level security;
