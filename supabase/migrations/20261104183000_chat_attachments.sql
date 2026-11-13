-- Team Celeris: anexos privados de imagem/documento no Chat.
-- Mensagens de áudio continuam no bucket privado team-chat-audio e são normalizadas para MP3.
begin;

alter table public.team_chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_content_type text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'team_chat_attachment_metadata_consistent'
      and conrelid = 'public.team_chat_messages'::regclass
  ) then
    alter table public.team_chat_messages
      add constraint team_chat_attachment_metadata_consistent check (
        (attachment_path is null and attachment_content_type is null and attachment_name is null and attachment_size is null)
        or (
          attachment_path is not null
          and attachment_content_type in (
            'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
            'application/pdf','text/plain','text/csv',
            'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
          )
          and attachment_name is not null and length(trim(attachment_name)) between 1 and 240
          and attachment_size between 1 and 15728640
          and attachment_path like sender_id::text || '/%'
          and attachment_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
          and audio_path is null
        )
      );
  end if;
end
$constraints$;

-- A concessão é apenas por coluna; mantém as políticas RLS existentes na tabela.
grant insert (body, group_id, dm_conversation_id, attachment_path, attachment_content_type, attachment_name, attachment_size)
  on public.team_chat_messages to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-chat-attachments', 'team-chat-attachments', false, 15728640,
  array[
    'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
    'application/pdf','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_chat_attachments_upload_own on storage.objects;
create policy team_chat_attachments_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-chat-attachments'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
  );

drop policy if exists team_chat_attachments_read_visible_message on storage.objects;
create policy team_chat_attachments_read_visible_message on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-chat-attachments'
    and public.is_active_member()
    and exists (
      select 1 from public.team_chat_messages m
      where m.attachment_path = storage.objects.name
        and m.removed_at is null
    )
  );

commit;
