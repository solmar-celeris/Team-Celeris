# Etapa 6 — Chat compartilhado

## O que é

A aba **Chat** é uma conversa coletiva única para a equipe. Todas as pessoas autenticadas com perfil `active` podem ler e enviar mensagens; elas chegam em tempo real para as demais pessoas conectadas. Cada mensagem mostra autor e horário definidos pelo banco. Mensagens são somente texto, com limite de 2.000 caracteres. Não há conversa privada, anexos ou edição nesta versão.

Mensagens ficam no banco até serem removidas por um Administrador ativo. Só Administradores veem o controle para remover, e o banco verifica novamente essa permissão. Quando uma mensagem é removida, o texto original é substituído por um aviso fixo; ficam somente o identificador da mensagem e os metadados de autor e remoção. Não há cópia do texto apagado nem expiração automática.

Como todos os perfis ativos veem a mesma sala, não compartilhe senha, informação médica, dados pessoais desnecessários, documentos ou conteúdo reservado no Chat.

## Antes de usar

1. Publique o código atualizado no mesmo repositório/site Netlify.
2. No Supabase que já está conectado, mantenha a migração inicial sem repetir.
3. Se a migração `20261102133000_shared_content_permissions.sql` de Arquivos/Comunicados ainda não tiver sido aplicada, execute-a uma vez antes de continuar. Se já foi, não execute de novo.
4. Execute uma vez a nova migração `20261102135200_team_chat.sql` em **SQL Editor → New query**. O arquivo cria a tabela, as políticas RLS, a função de remoção exclusiva para Administradores e inclui a tabela na publicação Realtime. Leia a ordem detalhada em [`INSTRUCOES_NETLIFY_SUPABASE.md`](../INSTRUCOES_NETLIFY_SUPABASE.md).
5. Faça logout e login com um perfil ativo.

O Supabase requer que tabelas estejam na publicação `supabase_realtime` e que políticas de leitura permitam ao usuário receber eventos Postgres. A migração configura esses elementos para o chat. Veja [Postgres Changes — Supabase Docs](https://supabase.com/docs/guides/realtime/postgres-changes).

## Como conversar

Abra **Chat**, escreva sua mensagem e clique em **Enviar**. Para ver uma conversa mais antiga, use **Carregar mensagens anteriores**. **Atualizar** busca novamente as mensagens mais recentes se o indicador de conexão estiver desconectado.

Para testar a atualização ao vivo, mantenha o Chat aberto em duas sessões com perfis ativos e envie uma mensagem em uma delas. Ela deve aparecer na outra sem recarregar a página.

## Moderação

Somente uma conta ativa com o papel **Administrador** pode remover uma mensagem, inclusive mensagem escrita por outra pessoa. O app pede uma segunda confirmação. Outros perfis não veem esse botão, e o Supabase também rejeita chamadas diretas sem permissão.

Use a remoção para mensagens de teste ou conteúdo enviado por engano. A operação elimina o texto original e deixa apenas o marcador de remoção e a data/conta responsável. Ela não pode ser desfeita pela tela.

## Se algo não funcionar

Se a aba estiver ausente, confirme que o novo deploy terminou e que a conta está com perfil `active`. Se a tela disser que o Chat ainda não foi habilitado, aplique `20261102135200_team_chat.sql` ao Supabase correto. Se as mensagens são enviadas mas não aparecem nas outras sessões, confirme que a migração concluiu e faça logout/login. Não remova políticas RLS para tentar corrigir.

Apenas Administradores ativos conseguem remover. Se o controle não aparece, confira o papel da conta no perfil e entre novamente.
