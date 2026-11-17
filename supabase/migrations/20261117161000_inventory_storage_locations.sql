-- Team Celeris · Atualiza os locais físicos do Inventário.
-- Mantém os registros antigos para preservar o histórico, mas deixa de oferecê-los para novas movimentações.

begin;

update public.inventory_locations
set is_active = false
where is_active
  and (location_type in ('central', 'sector')
       or name = 'Almoxarifado Central'
       or name like 'Setor — %');

insert into public.inventory_locations(name, location_type, description, is_active)
values
  ('Armário 1 - Laboratório de automação', 'other', 'Armário 1 do Laboratório de automação.', true),
  ('Armário 2 - Laboratório de automação', 'other', 'Armário 2 do Laboratório de automação.', true),
  ('Pratileira 1', 'other', 'Pratileira 1 da equipe.', true)
on conflict do nothing;

commit;
