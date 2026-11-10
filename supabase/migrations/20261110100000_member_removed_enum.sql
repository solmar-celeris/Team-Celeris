-- Novo estado terminal de vínculo com a equipe.
-- Não apaga o perfil, usuário Auth, atividades, mensagens nem autoria histórica.
alter type public.member_status add value if not exists 'removed';
