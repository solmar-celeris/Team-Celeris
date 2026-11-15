-- Permite que qualquer pessoa com o link entre em uma sala ativa como convidada.
-- O token LiveKit continua sendo emitido exclusivamente pela Edge Function.
begin;

drop policy if exists meeting_rooms_public_active_read on public.meeting_rooms;
create policy meeting_rooms_public_active_read
  on public.meeting_rooms
  for select to anon
  using (status = 'active');

grant select on public.meeting_rooms to anon;

commit;
