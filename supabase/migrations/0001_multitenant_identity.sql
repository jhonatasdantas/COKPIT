-- Fase 2 — Identidade multi-tenant + RLS
-- Núcleo de identidade: tenants e usuarios (ligado ao Supabase Auth).
-- Isolamento: RLS por tenant, dirigido pelo claim `tenant_id` do JWT.

-- ============================================================
-- Helper: lê o tenant_id do JWT (claim custom) do request atual.
-- O Worker injeta o JWT do Supabase; o Postgres expõe os claims em
-- request.jwt.claims (setado pelo PostgREST / pela nossa camada de acesso).
-- ============================================================
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id',
    ''
  )::uuid
$$;

-- ============================================================
-- tenants — a organização (agência/consultor). No demo: 1 tenant (sua agência).
-- ============================================================
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  criado_em   timestamptz not null default now()
);

alter table public.tenants enable row level security;

-- Um usuário só enxerga o próprio tenant.
create policy tenants_isolamento on public.tenants
  for all
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

-- ============================================================
-- usuarios — perfil do app, 1:1 com auth.users do Supabase.
-- ============================================================
create table if not exists public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       text not null,
  papel       text not null default 'membro' check (papel in ('dono', 'admin', 'membro')),
  criado_em   timestamptz not null default now()
);

create index if not exists usuarios_tenant_idx on public.usuarios (tenant_id);

alter table public.usuarios enable row level security;

create policy usuarios_isolamento on public.usuarios
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
