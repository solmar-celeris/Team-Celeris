-- Team Celeris: metadados de links compartilhados do Google Drive no Chat.
-- Não cria uploads/buckets nem altera as regras RLS existentes das conversas.
begin;

alter table public.team_chat_messages
  add column if not exists drive_url text,
  add column if not exists drive_name text;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'team_chat_drive_metadata_consistent'
      and conrelid = 'public.team_chat_messages'::regclass
  ) then
    alter table public.team_chat_messages
      add constraint team_chat_drive_metadata_consistent check (
        (drive_url is null and drive_name is null)
        or (
          drive_url is not null
          and length(drive_url) between 1 and 2048
          and drive_url ~ '^https://(drive[.]google[.]com|docs[.]google[.]com)(/[^[:space:]]*)?([?][^[:space:]]*)?(#[^[:space:]]*)?$'
          and drive_url !~ '[[:space:][:cntrl:]]'
          and drive_name is not null
          and length(pg_catalog.btrim(drive_name)) between 1 and 240
          and drive_name !~ '[[:cntrl:]]'
        )
      );
  end if;
end
$constraints$;

-- Permite inserir somente os dois campos Drive; as concessões atuais de Chat são preservadas.
grant insert (drive_url, drive_name)
  on public.team_chat_messages to authenticated;

commit;
