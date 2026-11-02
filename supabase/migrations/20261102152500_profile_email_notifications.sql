-- SolMar Celeris · perfil, avatar privado e trilha mínima de avisos de atividade
-- Execute somente depois do esquema inicial no Supabase desta equipe.
-- O e-mail permanece desativado até configurar Resend e habilitar a variável pública no Netlify.

begin;

alter table public.profiles
  add column if not exists avatar_path text;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'profiles_avatar_path_own_folder'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_own_folder check (
        avatar_path is null or (
          pg_catalog.array_length(pg_catalog.string_to_array(avatar_path, '/'), 1) = 2
          and pg_catalog.split_part(avatar_path, '/', 1) = user_id::text
          and pg_catalog.split_part(avatar_path, '/', 2) ~ '^[A-Za-z0-9-]+[.](jpg|jpeg|png|webp)$'
        )
      );
  end if;
end;
$migration$;

alter table public.activities
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.set_activity_actor()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' and new.created_by is null then
      new.created_by := auth.uid();
    end if;
  else
    new.updated_by := null;
  end if;
  return new;
end;
$function$;
revoke all on function public.set_activity_actor() from public, anon, authenticated;

drop trigger if exists activities_set_actor on public.activities;
create trigger activities_set_actor
  before insert or update on public.activities
  for each row execute function public.set_activity_actor();

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_path) on public.profiles to authenticated;

drop policy if exists profiles_update_self_active on public.profiles;
create policy profiles_update_self_active on public.profiles for update to authenticated
  using (user_id = auth.uid() and status = 'active')
  with check (
    user_id = auth.uid() and status = 'active'
    and length(pg_catalog.btrim(full_name)) between 2 and 100
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'solmar-profile-photos',
  'SolMar profile photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists solmar_profile_photos_read_active on storage.objects;
create policy solmar_profile_photos_read_active on storage.objects for select to authenticated
  using (
    bucket_id = 'solmar-profile-photos'
    and public.is_active_member()
  );

drop policy if exists solmar_profile_photos_insert_own on storage.objects;
create policy solmar_profile_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'solmar-profile-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists solmar_profile_photos_update_own on storage.objects;
create policy solmar_profile_photos_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'solmar-profile-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'solmar-profile-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists solmar_profile_photos_delete_own on storage.objects;
create policy solmar_profile_photos_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'solmar-profile-photos'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table if not exists public.activity_email_delivery_log (
  source_table text not null check (source_table in ('activities', 'weekly_updates')),
  source_id uuid not null,
  source_updated_at timestamptz not null,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('processing', 'sent', 'failed', 'no_recipients')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_table, source_id, source_updated_at)
);

alter table public.activity_email_delivery_log enable row level security;
revoke all on public.activity_email_delivery_log from public, anon, authenticated;
grant select, insert, update on public.activity_email_delivery_log to service_role;
grant select on public.profiles, public.activities, public.weekly_updates to service_role;

commit;
