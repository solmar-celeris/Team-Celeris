-- SolMarZap: fotos privadas de grupos e detalhes de leitura em mensagens coletivas.
-- Aplicar depois de 20261104170000_chat_read_receipts_audio.sql e
-- 20261102161000_team_chat_groups.sql.
begin;

alter table public.team_chat_groups
  add column if not exists avatar_path text;

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.team_chat_groups'::regclass
      and conname = 'team_chat_groups_avatar_path_shape'
  ) then
    alter table public.team_chat_groups
      add constraint team_chat_groups_avatar_path_shape check (
        avatar_path is null or (
          pg_catalog.array_length(pg_catalog.string_to_array(avatar_path, '/'), 1) = 2
          and pg_catalog.split_part(avatar_path, '/', 1) = id::text
          and pg_catalog.split_part(avatar_path, '/', 2) ~ '^[A-Za-z0-9-]+[.](jpg|png|webp)$'
        )
      );
  end if;
end
$constraint$;

revoke all on public.team_chat_groups from anon, authenticated;
grant select on public.team_chat_groups to authenticated;
grant insert (name) on public.team_chat_groups to authenticated;
grant update (avatar_path) on public.team_chat_groups to authenticated;

drop policy if exists team_chat_groups_update_avatar on public.team_chat_groups;
create policy team_chat_groups_update_avatar on public.team_chat_groups
  for update to authenticated
  using (
    public.is_active_member()
    and (public.is_team_admin() or public.is_team_chat_group_member(id))
  )
  with check (
    public.is_active_member()
    and (public.is_team_admin() or public.is_team_chat_group_member(id))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-chat-group-photos', 'team-chat-group-photos', false, 3145728,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_chat_group_photos_select_members on storage.objects;
create policy team_chat_group_photos_select_members on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-chat-group-photos'
    and pg_catalog.array_length(storage.foldername(name), 1) = 1
    and public.is_active_member()
    and (
      public.is_team_admin()
      or case
        when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_team_chat_group_member((storage.foldername(name))[1]::uuid)
        else false
      end
    )
  );

drop policy if exists team_chat_group_photos_insert_members on storage.objects;
create policy team_chat_group_photos_insert_members on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-chat-group-photos'
    and pg_catalog.array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9-]+[.](jpg|png|webp)$'
    and public.is_active_member()
    and (
      public.is_team_admin()
      or case
        when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_team_chat_group_member((storage.foldername(name))[1]::uuid)
        else false
      end
    )
  );

drop policy if exists team_chat_group_photos_delete_members on storage.objects;
create policy team_chat_group_photos_delete_members on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-chat-group-photos'
    and pg_catalog.array_length(storage.foldername(name), 1) = 1
    and public.is_active_member()
    and (
      public.is_team_admin()
      or case
        when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_team_chat_group_member((storage.foldername(name))[1]::uuid)
        else false
      end
    )
  );

-- Anyone in the collective room can view that room's receipt details. Group
-- participants can view details only for their own group; DM receipts remain
-- limited to the message sender and to the account's own receipt.
drop policy if exists team_chat_message_reads_select_visible on public.team_chat_message_reads;
create policy team_chat_message_reads_select_visible
  on public.team_chat_message_reads for select to authenticated
  using (
    public.is_active_member()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.team_chat_messages m
        where m.id = team_chat_message_reads.message_id
          and (
            m.sender_id = (select auth.uid())
            or (
              m.dm_conversation_id is null
              and m.group_id is null
              and public.is_active_member()
            )
            or (
              m.group_id is not null
              and m.dm_conversation_id is null
              and public.is_team_chat_group_member(m.group_id)
            )
          )
      )
    )
  );

commit;
