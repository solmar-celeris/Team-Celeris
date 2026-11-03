-- SolMar Celeris · remoção lógica de comunicados por RPC autenticado
-- Mantém o RLS ligado; só perfis ativos podem remover. O trigger existente
-- continua definindo removed_by e o trigger de auditoria registra a alteração.

begin;

create or replace function public.remove_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;

  update public.announcements
    set removed_at = now()
    where id = p_announcement_id
      and removed_at is null;

  if not found then
    raise exception 'O comunicado não existe ou já foi removido.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_announcement(uuid) from public, anon, authenticated;
grant execute on function public.remove_announcement(uuid) to authenticated;

commit;
