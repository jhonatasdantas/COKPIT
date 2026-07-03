-- Fase 3 — Schema de domínio (multi-tenant)
-- Todas as tabelas com tenant_id + RLS por tenant.
-- Chaves de unicidade garantem upsert idempotente (on conflict) no motor de sync.
-- oauth_tokens: sem policy de tenant → só acessível via service-role (bypass RLS).

-- Helper: aplica RLS padrão "isolamento por tenant" numa tabela.
create or replace function public._aplica_rls_tenant(tabela regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tabela);
  execute format(
    'create policy tenant_isolamento on %s for all
       using (tenant_id = public.current_tenant_id())
       with check (tenant_id = public.current_tenant_id())',
    tabela
  );
end;
$$;

-- ============================================================
-- clientes — as lojas/marcas que a agência atende (dentro do tenant).
-- ============================================================
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  nome       text not null,
  criado_em  timestamptz not null default now(),
  unique (tenant_id, id)
);
create index if not exists clientes_tenant_idx on public.clientes (tenant_id);
select public._aplica_rls_tenant('public.clientes');

-- ============================================================
-- contas_marketplace — cada loja conectada a um marketplace.
-- ============================================================
create table if not exists public.contas_marketplace (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  cliente_id     uuid references public.clientes (id) on delete set null,
  marketplace    text not null check (marketplace in ('shopee', 'mercadolivre')),
  shop_id        text not null,           -- id da loja no marketplace
  nome           text,
  status         text not null default 'conectando'
                   check (status in ('conectando', 'ativa', 'erro', 'desconectada')),
  criado_em      timestamptz not null default now(),
  -- idempotência: uma loja por marketplace por tenant
  unique (tenant_id, marketplace, shop_id)
);
create index if not exists contas_tenant_idx on public.contas_marketplace (tenant_id);
select public._aplica_rls_tenant('public.contas_marketplace');

-- ============================================================
-- oauth_tokens — credenciais por conta. SEM policy de tenant:
-- acesso só por service-role (a camada de sync usa service-role).
-- ============================================================
create table if not exists public.oauth_tokens (
  conta_id       uuid primary key references public.contas_marketplace (id) on delete cascade,
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  access_token   text not null,
  refresh_token  text,
  expira_em      timestamptz,
  atualizado_em  timestamptz not null default now()
);
alter table public.oauth_tokens enable row level security;
-- Nenhuma policy criada de propósito: com RLS ligada e sem policy, ninguém acessa
-- via JWT de usuário; só o service-role (que ignora RLS).

-- ============================================================
-- produtos
-- ============================================================
create table if not exists public.produtos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  sku               text,
  item_id           text not null,        -- id do produto no marketplace
  titulo            text,
  preco             numeric(14,2),
  estoque           integer,
  atualizado_em     timestamptz not null default now(),
  unique (conta_id, item_id)              -- idempotência do upsert
);
create index if not exists produtos_tenant_idx on public.produtos (tenant_id);
select public._aplica_rls_tenant('public.produtos');

-- ============================================================
-- vendas (pedidos)
-- ============================================================
create table if not exists public.vendas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  order_id          text not null,        -- id do pedido no marketplace
  valor_total       numeric(14,2),
  status            text,
  data_pedido       timestamptz,          -- normalizada p/ fuso BR no bucketing
  atualizado_em     timestamptz not null default now(),
  unique (conta_id, order_id)             -- idempotência do upsert
);
create index if not exists vendas_tenant_idx on public.vendas (tenant_id);
create index if not exists vendas_data_idx on public.vendas (conta_id, data_pedido);
select public._aplica_rls_tenant('public.vendas');

-- ============================================================
-- metricas_diarias — agregados por conta/dia (fuso BR)
-- ============================================================
create table if not exists public.metricas_diarias (
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  dia               date not null,
  pedidos           integer not null default 0,
  faturamento       numeric(14,2) not null default 0,
  atualizado_em     timestamptz not null default now(),
  primary key (conta_id, dia)             -- idempotência do upsert
);
create index if not exists metricas_tenant_idx on public.metricas_diarias (tenant_id);
select public._aplica_rls_tenant('public.metricas_diarias');

-- ============================================================
-- campanhas_ads
-- ============================================================
create table if not exists public.campanhas_ads (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  campanha_id       text not null,
  nome              text,
  status            text,
  atualizado_em     timestamptz not null default now(),
  unique (conta_id, campanha_id)          -- idempotência do upsert
);
create index if not exists campanhas_tenant_idx on public.campanhas_ads (tenant_id);
select public._aplica_rls_tenant('public.campanhas_ads');

-- ============================================================
-- metricas_ads_diarias
-- ============================================================
create table if not exists public.metricas_ads_diarias (
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  campanha_id       text not null,
  dia               date not null,
  investimento      numeric(14,2) not null default 0,
  cliques           integer not null default 0,
  vendas            numeric(14,2) not null default 0,
  atualizado_em     timestamptz not null default now(),
  primary key (conta_id, campanha_id, dia)  -- idempotência do upsert
);
create index if not exists metricas_ads_tenant_idx on public.metricas_ads_diarias (tenant_id);
select public._aplica_rls_tenant('public.metricas_ads_diarias');

-- ============================================================
-- alertas
-- ============================================================
create table if not exists public.alertas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid references public.contas_marketplace (id) on delete cascade,
  tipo              text not null,
  severidade        text not null default 'info'
                      check (severidade in ('info', 'aviso', 'critico')),
  mensagem          text not null,
  resolvido         boolean not null default false,
  criado_em         timestamptz not null default now()
);
create index if not exists alertas_tenant_idx on public.alertas (tenant_id);
select public._aplica_rls_tenant('public.alertas');

-- ============================================================
-- tarefas
-- ============================================================
create table if not exists public.tarefas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  cliente_id        uuid references public.clientes (id) on delete set null,
  titulo            text not null,
  concluida         boolean not null default false,
  criado_em         timestamptz not null default now()
);
create index if not exists tarefas_tenant_idx on public.tarefas (tenant_id);
select public._aplica_rls_tenant('public.tarefas');

-- ============================================================
-- sync_runs — observabilidade de cada execução de sync (Fase 6/7)
-- ============================================================
create table if not exists public.sync_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conta_id          uuid not null references public.contas_marketplace (id) on delete cascade,
  tipo              text not null,        -- 'produtos' | 'vendas' | 'ads' ...
  status            text not null default 'rodando'
                      check (status in ('rodando', 'ok', 'erro')),
  iniciado_em       timestamptz not null default now(),
  finalizado_em     timestamptz,
  itens             integer,
  erro              text
);
create index if not exists sync_runs_tenant_idx on public.sync_runs (tenant_id);
create index if not exists sync_runs_conta_idx on public.sync_runs (conta_id, iniciado_em desc);
select public._aplica_rls_tenant('public.sync_runs');
