# Etapa 5 — Arquivos e Comunicados

Este recurso usa as tabelas `drive_folders` e `announcements` já criadas pela migração inicial. A tela e uma migração complementar estão no pacote atualizado. **A migração inicial não deve ser executada novamente.**

## Aplicar as permissões no Supabase

A migração original criou as tabelas, índices e auditoria, mas permitia apenas leitura de pastas e comunicados. Por isso, os botões de adicionar, fixar e remover ainda podem ser bloqueados até aplicar a migração complementar.

1. No Supabase, confira que abriu o mesmo projeto conectado ao site e que a migração inicial já existe.
2. Abra **SQL Editor → New query**.
3. No pacote atualizado, abra `supabase/migrations/20261102133000_shared_content_permissions.sql`, copie o arquivo inteiro e cole como uma consulta nova.
4. Revise se está no projeto correto e clique em **Run** uma única vez. Não cole de novo a migração inicial `20261101184000_initial_schema.sql`.
5. Aguarde a mensagem de execução concluída. O script é incremental: adiciona políticas RLS e funções seguras, sem apagar nem recriar tabelas, atividades ou perfis.
6. Faça logout/login no site atualizado e teste primeiro a leitura. Depois teste criação/fixação e remoção com um item que possa ser removido.

O script não inclui senha, service role, chave administrativa ou referência a projeto específico. Ele não foi executado pelo agente no Supabase remoto.

## Permissões confirmadas

Por escolha explícita da equipe, todo perfil `active` — Administrador, Líder de área, Membro ou Leitor — pode ver pastas e todos os comunicados, independentemente da área; pode adicionar/remover pastas, escolher a pasta principal, publicar comunicados para qualquer área ou para todos, fixar/desafixar e remover qualquer comunicado. Visitantes, perfis `pending` e `suspended` continuam bloqueados por RLS. O texto já publicado de um comunicado não tem botão nem permissão de edição nesta etapa.

A remoção é lógica e auditada: o item deixa a lista normal, mas o registro permanece no banco com ator e data de remoção. O botão não exclui arquivos do Google Drive. Nenhuma conta pode apagar fisicamente os registros por SQL via app.

## Arquivos

Abra a aba **Arquivos**. **Adicionar pasta** pede nome, link do Google Drive e área; deixe a área vazia para compartilhar em **Geral**. O link precisa começar com `https://drive.google.com/` e não pode conter usuário/senha embutidos nem porta personalizada. A validação ocorre na tela e no banco. Ao adicionar uma primeira pasta sem principal, ela é marcada como pasta principal. Use **Tornar principal** para destacar outra.

A pasta aparece como cartão visível. Clique nela para abrir o Google Drive em uma nova aba. A pessoa precisa ter acesso ao conteúdo na própria conta Google. SolMar somente armazena o atalho; não lê, copia nem sincroniza o conteúdo da pasta. **Remover** pede confirmação antes de tirar o atalho da lista. Se a pasta removida era principal, a mais antiga restante passa a principal.

## Comunicados

Na aba **Comunicados**, clique em **Novo comunicado** e informe título, mensagem e destinatário: toda a equipe ou uma área. O banco identifica o autor pela sessão, sem campo para escolher ou forjar autoria. Todos os perfis ativos veem também comunicados de outras áreas, conforme a permissão aprovada.

Use **Fixar** para colocar no topo; os comunicados fixados aparecem primeiro, com os mais recentes em destaque dentro dos grupos. **Desafixar** devolve o comunicado à ordem normal. **Remover** exige confirmação e conserva o histórico auditável.

## Atualizar pelo GitHub/Netlify

Substitua os arquivos do repositório conectado ao Netlify pelos arquivos do ZIP atualizado, mantendo a pasta `.git` (ou use GitHub Desktop como na atualização anterior). Faça commit e push e aguarde o deploy terminar. As variáveis públicas do Supabase permanecem como já configuradas; não crie novo projeto, site ou banco.

Se surgir erro de RLS ou função ausente ao gravar, confirme que aplicou a migração incremental uma única vez no mesmo projeto Supabase e entrou novamente no site. Não resolva desativando RLS.

Para a aba Chat, que tem permissões de remoção diferentes, consulte o [guia específico da Etapa 6](./ETAPA_6_CHAT.md) e não reaproveite as permissões amplas desta etapa.
