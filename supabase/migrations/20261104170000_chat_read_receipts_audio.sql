-- Team Celeris: confirmação de leitura e mensagens de áudio no Chat.
-- Aplicar após migrations de grupos e conversas privadas; mantém RLS ativo.
begin;

alter table public.team_chat_messages
  add column if not exists audio_path text,
  add column if not exists audio_content_type text;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'team_chat_audio_path_matches_sender'
      and conrelid = 'public.team_chat_messages'::regclass
  ) then
    alter table public.team_chat_messages
      add constraint team_chat_audio_path_matches_sender check (
        (audio_path is null and audio_content_type is null)
        or (
          audio_path is not null
          and audio_content_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/wav', 'audio/mpeg')
          and audio_path like sender_id::text || '/%'
          and audio_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webm|mp4|ogg|m4a|aac|wav|mp3)$'
        )
      );
  end if;
end
$constraints$;

revoke all on public.team_chat_messages from anon, authenticated;
grant select on public.team_chat_messages to authenticated;
grant insert (body, group_id, dm_conversation_id, audio_path, audio_content_type) on public.team_chat_messages to authenticated;

create table if not exists public.team_chat_message_reads (
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default pg_catalog.now(),
  primary key (message_id, user_id)
);
create index if not exists team_chat_message_reads_user_idx
  on public.team_chat_message_reads (user_id, read_at desc);
alter table public.team_chat_message_reads enable row level security;
revoke all on public.team_chat_message_reads from public, anon, authenticated;
grant select on public.team_chat_message_reads to authenticated;
grant insert (message_id, user_id) on public.team_chat_message_reads to authenticated;

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
          and m.sender_id = (select auth.uid())
      )
    )
  );

drop policy if exists team_chat_message_reads_insert_recipient on public.team_chat_message_reads;
create policy team_chat_message_reads_insert_recipient
  on public.team_chat_message_reads for insert to authenticated
  with check (
    public.is_active_member()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.team_chat_messages m
      where m.id = team_chat_message_reads.message_id
        and m.sender_id <> (select auth.uid())
        and m.removed_at is null
    )
  );

-- Keep audio objects private. A read is authorized only when a matching message
-- is visible through the existing message RLS (including DM participant rules).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-chat-audio', 'team-chat-audio', false, 15728640,
  array['audio/webm','audio/mp4','audio/ogg','audio/aac','audio/wav','audio/mpeg']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_chat_audio_upload_own on storage.objects;
create policy team_chat_audio_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-chat-audio'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webm|mp4|ogg|m4a|aac|wav|mp3)$'
  );

drop policy if exists team_chat_audio_read_visible_message on storage.objects;
create policy team_chat_audio_read_visible_message on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-chat-audio'
    and public.is_active_member()
    and exists (
      select 1 from public.team_chat_messages m
      where m.audio_path = storage.objects.name
        and m.removed_at is null
    )
  );

do $realtime$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_chat_message_reads'
  ) then
    execute 'alter publication supabase_realtime add table public.team_chat_message_reads';
  end if;
end
$realtime$;

commit;
