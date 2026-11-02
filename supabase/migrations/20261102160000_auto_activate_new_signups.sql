-- SolMar Celeris · ativação automática somente para novos cadastros
-- O usuário escolheu ativação automática. Não promove perfis antigos pending.
-- Não modifica as configurações de confirmação de e-mail do Supabase Auth.

begin;

create or replace function public.create_active_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, role, status)
  values (
    new.id,
    coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'member',
    'active'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_active_member_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_active_member_profile();

commit;
