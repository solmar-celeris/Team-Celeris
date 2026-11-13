# Etapa 6 — Chat geral e grupos

## Conversa geral

A aba **Chat** mantém a sala **Equipe**, visível e disponível a todos os perfis `active`. Mensagens são texto, com autoria/horário atribuídos pelo banco, limite de 2.000 caracteres e entrega em tempo real. Não há anexos nem edição.

## Grupos

Qualquer integrante ativo pode criar um grupo, escolher um nome e incluir contas ativas. O criador entra automaticamente. Integrantes do grupo e Administradores ativos podem adicionar novas contas ativas. A lista mostra apenas grupos acessíveis à conta conectada. Em cada grupo, as mensagens e o histórico só podem ser lidos pelos participantes ativos e pelos Administradores; RLS do Supabase aplica essa regra também às consultas diretas e eventos Realtime.

Mensagens da sala geral continuam no mesmo local (`group_id` nulo), sem mudar o histórico existente. Mensagens de grupo não são enviadas por e-mail.

## Migrations e deploy

1. Atualize os arquivos no mesmo repositório e faça o deploy do site.
2. Se ainda não foi executada, aplique `20261102135200_team_chat.sql` uma vez para criar a sala geral e as políticas de Chat.
3. Aplique `20261102161000_team_chat_groups.sql` uma única vez para adicionar grupos, associações, RLS e Realtime para grupos/membros/mensagens. Execute depois da migration da sala geral.
4. Faça logout/login com perfis ativos e teste com duas contas: crie um grupo, convide a segunda conta e envie mensagem. Uma terceira conta ativa não convidada não deve ver o grupo nem a conversa.

Se não souber se uma migration já foi executada, pare e confira o estado em vez de tentar rodá-la novamente. Não desative RLS.

## Exclusão para todos

Com a migration `20261110101000_chat_global_delete_member_revocation.sql` e a Edge Function `delete-chat-content` publicadas, qualquer integrante ativo pode apagar para todos uma mensagem de que tenha acesso na sala geral, grupo ou DM, mesmo quando outra pessoa a enviou. O participante também pode apagar um grupo ou DM para todos. A sala geral não pode ser apagada. A confirmação é explícita; RLS permanece ativo e o servidor valida status e participação.

Anexos, áudio e foto passam por uma fila privada de limpeza; se o Storage falhar, o retry acontece em outra ação ou na próxima abertura do Chat. Links assinados já emitidos podem continuar válidos até expirarem. Não use o Chat para senhas ou conteúdo confidencial.
