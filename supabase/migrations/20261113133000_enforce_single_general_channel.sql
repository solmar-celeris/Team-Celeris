-- Garante que o workspace permaneça com um único canal Geral.
-- Também normaliza o título do manual de conduta já existente no Geral.

begin;

update public.workspace_manuals
   set title = 'Normas de Conduta',
       updated_at = now()
 where channel_id in (select id from public.workspace_channels where slug = 'geral')
   and manual_kind = 'conduct'
   and title <> 'Normas de Conduta';

create or replace function public.guard_fixed_workspace_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O canal Geral é permanente e não pode ser removido.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.slug <> 'geral' then
      raise exception 'O Team Celeris utiliza somente o canal Geral.' using errcode = '42501';
    end if;
    new.slug := 'geral';
    new.name := 'Geral';
    new.icon := 'globe';
    new.is_open := true;
    new.area_id := null;
    return new;
  end if;

  if old.slug <> 'geral' then
    raise exception 'Canais adicionais não são permitidos no Team Celeris.' using errcode = '42501';
  end if;

  new.slug := 'geral';
  new.name := 'Geral';
  new.icon := 'globe';
  new.is_open := true;
  new.area_id := null;
  return new;
end;
$$;

revoke all on function public.guard_fixed_workspace_channels() from public, anon, authenticated;

drop trigger if exists workspace_channels_fixed_general on public.workspace_channels;
create trigger workspace_channels_fixed_general
before insert or update or delete on public.workspace_channels
for each row execute function public.guard_fixed_workspace_channels();

commit;
