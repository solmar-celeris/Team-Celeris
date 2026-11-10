-- Corrige a associação do canal Elétrica ao slug vigente `eletrica`.
-- A migration de limpeza organizacional renomeou `energia` para `eletrica`.
-- Atualiza o canal já existente pelo vínculo area_id, preservando seu UUID.
begin;

create or replace function public.guard_fixed_workspace_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.slug in ('geral','mecanica-naval','eletrica','eletronica','gestao-de-pessoas','marketing','administrativo-financeiro') then
    new.slug := old.slug;
    new.name := old.name;
    new.area_id := old.area_id;
    new.is_open := true;
  elsif new.slug in ('geral','mecanica-naval','eletrica','eletronica','gestao-de-pessoas','marketing','administrativo-financeiro') then
    new.is_open := true;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fixed_workspace_channels() from public, anon, authenticated;

do $$
declare
  v_area_id uuid;
begin
  select id into v_area_id from public.areas where slug = 'eletrica';
  if v_area_id is null then
    raise exception 'A área eletrica não foi encontrada. Confira 20261106201000_org_area_cleanup.sql.';
  end if;

  update public.workspace_channels
     set slug = 'eletrica', name = 'Elétrica', icon = 'zap', is_open = true
   where area_id = v_area_id and slug <> 'eletrica';

  insert into public.workspace_channels (slug, name, icon, is_open, area_id)
  values ('eletrica', 'Elétrica', 'zap', true, v_area_id)
  on conflict (slug) do update
    set name = excluded.name, icon = excluded.icon, is_open = true, area_id = excluded.area_id;
end;
$$;

drop trigger if exists workspace_channels_fixed_guard on public.workspace_channels;
create trigger workspace_channels_fixed_guard
before insert or update on public.workspace_channels
for each row execute function public.guard_fixed_workspace_channels();

commit;
