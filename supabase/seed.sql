-- Seed de desenvolvimento — 2 tenants para a verificação de RLS (isolamento).
insert into public.tenants (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Agência Um', 'agencia-um'),
  ('22222222-2222-2222-2222-222222222222', 'Agência Dois', 'agencia-dois')
on conflict (id) do nothing;
