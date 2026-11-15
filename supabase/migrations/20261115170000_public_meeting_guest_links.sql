-- A sala não é exposta pela Data API pública.
-- O acesso de convidados é validado pela Edge Function usando a chave secreta no servidor.
begin;
drop policy if exists meeting_rooms_public_active_read on public.meeting_rooms;
revoke select on public.meeting_rooms from anon;
commit;
