# Etapa 8 — grupos de Chat e novos cadastros

Esta atualização altera a navegação (ícones e ordem), acrescenta grupos privados ao Chat e faz novos cadastros nascerem ativos como Integrantes. O site continua no mesmo repositório/Supabase/Netlify.

## Aplicar as migrations

No **SQL Editor** do mesmo projeto Supabase do site, abra **New query**, cole o conteúdo integral de **um único arquivo** e clique **Run**. Espere sucesso antes do próximo. Não reaplique arquivo já executado.

| Ordem | Arquivo | Efeito |
|---|---|---|
| 1 | `20261102135200_team_chat.sql` | Sala geral, RLS e Realtime do Chat; pule se já executada. |
| 2 | `20261102160000_auto_activate_new_signups.sql` | Perfis de novos cadastros passam a ser `active/member`; perfis antigos permanecem inalterados. |
| 3 | `20261102161000_team_chat_groups.sql` | Grupos, participantes, isolamento RLS e publicação Realtime; mensagens existentes continuam na sala geral. |

As migrations anteriores do banco, Arquivos/Comunicados e Perfil/Fotos também precisam estar aplicadas conforme [o manual principal](../INSTRUCOES_NETLIFY_SUPABASE.md). Se não souber se uma migration já foi executada, pare e confira em vez de rodá-la de novo.

## Cadastro automático

A inscrição pública passa a dar acesso aos dados compartilhados a qualquer pessoa que consiga criar uma conta. Todos os novos perfis começam como `member` sem área, não como Administrador. Se a confirmação de e-mail já estiver habilitada no Supabase Auth, o usuário ainda precisa abrir o e-mail de confirmação; esta atualização não muda essa configuração.

Contas que já estavam `pending` antes da migration continuam pendentes. A migration não altera perfis antigos nem suas permissões.

## Grupos de Chat

A aba **Chat** preserva a conversa geral para pessoas ativas e permite criar grupos, adicionar contas ativas e enviar mensagens em tempo real. Só integrantes ativos do grupo e Administradores ativos podem ler seu histórico; a RLS do Supabase, não apenas a interface, aplica essa regra. Com as migrations `20261110100000_member_removed_enum.sql` e `20261110101000_chat_global_delete_member_revocation.sql` e a Edge Function `delete-chat-content`, qualquer participante ativo pode apagar para todos qualquer mensagem que consiga ler, inclusive mensagens enviadas por outra pessoa. Participantes podem apagar grupos ou DMs para todos; a sala geral não pode ser apagada. O Storage privado usa fila de limpeza e retry. Mensagens não disparam e-mail.

Depois do deploy, teste com duas contas ativas e uma terceira não participante: crie um grupo, envie mensagens/anexos, apague uma mensagem pela segunda conta e confirme que desapareceu em ambas; apague o grupo e confirme que desaparece para ambas; verifique que a terceira conta não o vê nem consegue apagar. Teste a sala geral: apagar mensagens é permitido, mas a própria sala não pode ser removida.
