-- SolMar Celeris · criação de grupos restrita a administradores também no banco.
begin;

create or replace function public.set_team_chat_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente Administradores ativos podem criar grupos de conversa.'
      using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.created_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.set_team_chat_group_creator() from public, anon, authenticated;

drop policy if exists team_chat_groups_create on public.team_chat_groups;
create policy team_chat_groups_create on public.team_chat_groups
  for insert to authenticated
  with check (
    public.is_active_member()
    and public.is_team_admin()
    and created_by = (select auth.uid())
  );

commit;
