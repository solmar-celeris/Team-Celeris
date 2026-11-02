# SolMar Celeris — atualizar no GitHub/Netlify e habilitar no Supabase

**Revisado em 02/11/2026.** Este guia acompanha o ZIP atualizado. Ele não acessa sua conta, não aplica SQL no Supabase nem publica o site por você.

## O que esta versão inclui

Depois do login com perfil `active`, o menu mostra quatro abas: **Semana**, **Atividades**, **Arquivos** e **Comunicados**. Semana/Atividades usam as tabelas já existentes. Arquivos mostra atalhos clicáveis para pastas do Google Drive, sem ler o conteúdo. Comunicados publica e fixa avisos para a equipe ou uma área.

**Permissões escolhidas por você:** todos os perfis ativos — Administrador, Líder de área, Membro e Leitor — podem ver e gerenciar qualquer pasta e comunicado, inclusive de outras áreas. Todos podem adicionar/remover pastas, escolher a pasta principal, ver todos os avisos, publicar para a equipe/qualquer área, fixar/desafixar e remover comunicados. Visitantes e perfis `pending`/`suspended` continuam sem acesso. Remoções são lógicas/auditadas; não apagam pasta do Drive nem eliminam o registro do banco.

Painel avançado e gráficos, administração interna de usuários, importação/exportação e PWA completo ainda são etapas futuras. A aprovação de novos perfis continua manual.

## Importante: mantenha o mesmo Supabase e site Netlify

Não crie um novo site nem outro banco. Não execute novamente a migração inicial `20261101184000_initial_schema.sql`: ela criou as tabelas, políticas e atividades iniciais e é destinada a banco vazio.

Esta versão acrescenta uma **migração incremental** de permissões para as duas tabelas já existentes. Será necessário aplicá-la uma vez no mesmo projeto Supabase para liberar gravações de pastas e comunicados. Ela não substitui nem repete a migração inicial; o arquivo será enviado junto do código.

## 1. Atualize os arquivos no GitHub Desktop

1. Baixe e extraia `SolMar_Celeris_Netlify_Atualizado.zip`.
2. No GitHub Desktop, abra o mesmo repositório local ligado ao site Netlify. Faça uma cópia de segurança da pasta antes de substituir os arquivos.
3. Copie o conteúdo de dentro do ZIP para a pasta do repositório, aceitando substituir arquivos de mesmo caminho. **Não substitua nem apague `.git`.**
4. Confira a aba **Changes**: deve mostrar alterações e novos arquivos, incluindo `src/features/workspace/SharedContentWorkspace.tsx`, `shared-content.css`, `supabase/migrations/20261102133000_shared_content_permissions.sql` e `docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md`.
5. Não envie `.env.local`, `.env.production.local`, `node_modules/` ou `dist/`. O ZIP já está sem esses itens.
6. No campo **Summary**, escreva `Adicionar abas Arquivos e Comunicados`. Clique em **Commit to main** (ou na branch principal que o Netlify acompanha) e depois em **Push origin**.
7. No Netlify, abra o site existente → **Deploys** e aguarde o deploy mais recente terminar com sucesso/publicado. Se falhar, leia o log; não crie outro site.

As variáveis públicas do Supabase já configuradas no Netlify devem permanecer como estão. O build continua usando `pnpm build` e a saída `dist`. Se elas precisarem ser conferidas, só use `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, marcadas como Plain text/não secreto e com escopo de build. Nunca use senha de banco, `sb_secret_...` ou `service_role` em variável `VITE_*`.

## 2. Aplique a migração incremental no Supabase

A versão inicial já criou as tabelas `drive_folders` e `announcements`, mas só autorizava leitura. Para gravar com segurança:

1. Abra no Supabase o mesmo projeto conectado ao Netlify.
2. Selecione **SQL Editor → New query**.
3. No ZIP extraído, abra `supabase/migrations/20261102133000_shared_content_permissions.sql` e copie o arquivo inteiro para a query.
4. Confira novamente o nome do projeto e clique em **Run** uma vez. Aguarde a confirmação de conclusão.
5. Não execute de novo a migração inicial. A migração incremental dá permissões limitadas às colunas usadas, aplica RLS só a perfis ativos, deriva autoria/remoção da sessão e não oferece `DELETE` físico pelo app.
6. Saia e entre novamente no site publicado para renovar a sessão. Teste a visualização e, depois, adicione um link de teste que possa ser removido.

Se o script der erro, não tente corrigir desativando RLS. Guarde a mensagem de erro e confirme que abriu o projeto certo. O agente preparou o SQL, mas **não o executou** no seu banco.

## 3. Usar a aba Arquivos

Abra **Arquivos → Adicionar pasta**. Informe um nome, um link iniciado por `https://drive.google.com/` sem usuário/senha embutidos ou porta personalizada e, opcionalmente, uma área. Sem área, fica como **Geral**. A primeira pasta pode ser marcada como principal; em outra, use **Tornar principal**. O card abre o Drive em uma nova aba. Cada pessoa ainda precisa ter acesso concedido pelo Google. SolMar não lê, copia nem sincroniza o conteúdo da pasta.

**Remover** pede confirmação em dois passos e retira o atalho da lista; não apaga nada do Google Drive. Se era a pasta principal, o banco promove a mais antiga restante automaticamente.

## 4. Usar a aba Comunicados

Clique em **Novo comunicado** e preencha título, mensagem e destinatário (**Toda a equipe** ou uma área). O autor é registrado pelo banco a partir da conta conectada. Todos os ativos verão também comunicados direcionados a outras áreas, conforme a permissão que você escolheu.

Use **Fixar/Desafixar** para ordenar os avisos; fixados ficam no topo e, depois, aparecem os mais recentes primeiro. **Remover** pede confirmação e oculta o aviso da lista sem apagar o registro auditável.

## 5. Testes rápidos e solução de problemas

- **Só vejo Semana/Atividades:** confira se o deploy novo foi publicado; atualize a página com Ctrl+F5 (Windows) ou Cmd+Shift+R (Mac).
- **Posso ver, mas não consigo adicionar/fixar/remover:** confirme se a migração incremental foi aplicada no projeto Supabase correto e faça logout/login.
- **Erro RLS ou função ausente:** provavelmente falta a migração incremental, ou ela foi executada em outro projeto. Não desative RLS.
- **Pasta não abre ou é recusada:** use link HTTPS do Google Drive e confira se a pessoa recebeu compartilhamento no próprio Drive.
- **Comunicado de outra área não aparece:** confirme que a migração incremental `20261102133000_shared_content_permissions.sql` foi executada.
- **Deploy falhou:** no Netlify → **Deploys**, abra o log e confira `pnpm install --frozen-lockfile`, `pnpm build`, `tsc` e `vite build`. A compilação precisa gerar `dist/index.html`.

Não envie senhas, chaves, tokens ou URLs privadas em capturas/mensagens. Para erros, compartilhe apenas o texto não sensível.

## Segurança e limites

O ZIP contém o código e os guias, sem credenciais de produção, configuração local de ambiente, `dist`, `node_modules` ou `.git`, e sem endpoint Supabase específico. RLS bloqueia visitantes e perfis pendentes/suspensos. A migração incremental concede apenas as colunas necessárias para criar pastas/comunicados, fixar ou remover comunicados; mudanças de pasta principal/remoção de pasta passam por funções seguras. Autoria e remoção são preenchidas no banco e auditadas. O texto de um comunicado não pode ser editado após publicação. O conteúdo das pastas continua sob as permissões do Google Drive.

O build e a checagem de TypeScript podem ser testados localmente, mas a leitura/gravação real precisa ser confirmada na sua publicação e banco. Nenhuma consulta nem gravação de teste foi feita contra seu Supabase remoto.
