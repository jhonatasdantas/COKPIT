-- Verificação de RLS ao vivo (rodar quando o Postgres/Supabase local estiver de pé):
--   supabase db reset            # aplica migrações + seed
--   supabase db query --file supabase/tests/rls_isolamento.sql   (ou via psql)
--
-- Espera-se: cada tenant só enxerga a própria linha (count = 1), nunca a do outro.

-- Simula um request autenticado como Agência Um.
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"11111111-1111-1111-1111-111111111111"}',
  false
);

-- Deve retornar apenas a Agência Um (1 linha).
select 'como_agencia_um' as contexto, count(*) as visiveis,
       bool_and(slug = 'agencia-um') as so_o_proprio
from public.tenants;

-- Troca para Agência Dois.
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"22222222-2222-2222-2222-222222222222"}',
  false
);

-- Deve retornar apenas a Agência Dois (1 linha).
select 'como_agencia_dois' as contexto, count(*) as visiveis,
       bool_and(slug = 'agencia-dois') as so_o_proprio
from public.tenants;
