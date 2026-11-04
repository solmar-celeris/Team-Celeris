# SolMar Celeris — atualizar no GitHub/Netlify e habilitar no Supabase

**Revisado em 04/11/2026.** Este manual acompanha o pacote-fonte atualizado, com respostas e reações nos comunicados, logos dos serviços de IA, biblioteca completa de prompts, atalho Canva, período do projeto editável e suporte a notificações Web Push. O projeto continua usando o mesmo site Netlify e o mesmo Supabase. Este guia não publica por você nem executa SQL no seu banco.

## O que esta versão acrescenta

Após entrar com um perfil `active`, o menu mostra ícones na ordem **Chat**, **Comunicados**, **Semana**, **Atividades**, **Arquivos**, **Manual de funções** e **IA**. A aba IA abre ChatGPT, Claude AI, Gemini, Manus e Canva; também oferece os prompts completos de Registro de Atividades e POP, com botão para copiar e link do template oficial. Login e cabeçalho usam a logo original `public/assets/celeris-logo.png`; a imagem não foi editada nem substituída. O Canva só reaproveita uma sessão Google se a pessoa já estiver conectada no navegador/aparelho e autorizada no Canva; o atalho não contorna login nem armazena credenciais.

O Chat preserva a sala **Equipe** para todos os perfis ativos e permite criar grupos, selecionar integrantes ativos e adicionar mais pessoas depois. O criador já entra no grupo. Somente participantes ativos e Administradores ativos veem grupos; o Supabase RLS também impõe esse limite. Mensagens chegam em tempo real; o histórico usa balões e tons azuis da identidade SolMar. Elas podem ter até 2.000 caracteres, não aceitam anexos e ficam salvas até um Administrador ativo removê-las. Ao remover, o texto é substituído por um aviso. Mensagens de Chat não enviam e-mail.

Novos cadastros são ativados automaticamente como `member` depois da migration indicada abaixo; como a inscrição é pública, qualquer pessoa que conseguir se cadastrar poderá acessar os dados compartilhados permitidos pela RLS. Contas anteriores que já estavam `pending` não são alteradas. A confirmação de e-mail do Supabase, se habilitada, continua ativa e é independente.

Nas abas Arquivos e Comunicados, as permissões previamente escolhidas continuam valendo: todo perfil ativo pode ver e gerenciar qualquer pasta e comunicado, inclusive de outra área. Após aplicar a migration adicional abaixo, todo perfil ativo pode responder e reagir aos comunicados; a remoção de resposta fica limitada ao autor ou a um Administrador ativo. O app não acessa o conteúdo das pastas do Google Drive.

## 1. Atualizar o repositório que já alimenta o Netlify

1. Baixe e extraia o ZIP atualizado que acompanha esta versão.
2. Abra no GitHub Desktop o mesmo repositório local que está ligado ao seu site Netlify. Faça uma cópia de segurança da pasta antes de substituir os arquivos.
3. Copie o conteúdo de dentro do ZIP para a pasta do repositório e aceite substituir os arquivos com o mesmo caminho. **Não apague nem substitua `.git`.**
4. Em **Changes**, confirme que aparecem os arquivos de navegação, grupos e manual de funções, incluindo `ManualFunctions.tsx`, `TeamChat.tsx`, `ChatGroupDialog.tsx`, os componentes de identidade Median/OneSignal, `desktopNotifications.ts`, `public/push/onesignal/OneSignalSDKWorker.js`, as funções `notify-chat-push` e `notify-workspace-push`, e as migrations de push, além de Perfil/notificações.
5. Não envie `.env.local`, `.env.production.local`, `node_modules/` nem `dist/`. O ZIP não contém esses arquivos.
6. No campo **Summary**, escreva `Adicionar perfil e notificações da equipe`. Clique em **Commit to main** (ou na branch principal que o Netlify acompanha) e depois em **Push origin**.
7. O Netlify deve iniciar o deploy ao receber o push. Abra o site existente → **Deploys** e aguarde o deploy mais recente terminar com sucesso. Não crie outro site.

Mantenha as variáveis públicas já cadastradas no Netlify. Para habilitar Web Push, adicione `VITE_ONESIGNAL_APP_ID` como valor público do **mesmo app OneSignal** usado pelo Median, com escopo de build, e publique um novo deploy. O build continua usando `pnpm build` e a pasta de saída `dist`. Use somente App ID público e as chaves publishable públicas em variáveis `VITE_*`. Nunca coloque senha de banco, `sb_secret_...`, `service_role` ou `ONESIGNAL_REST_API_KEY` em uma variável `VITE_*`.

## 2. Aplicar somente as migrações que ainda faltam

**Não execute de novo a migração inicial** `20261101184000_initial_schema.sql`. Ela criou o banco base e as atividades iniciais; não é uma atualização do site.

As migrações incrementais são arquivos separados:

- Se você ainda **não** executou `20261102133000_shared_content_permissions.sql`, aplique-a uma única vez para habilitar a gravação de Arquivos e Comunicados. Se já executou essa migração antes, pule-a — não a repita.
- Se ainda não executou `20261102135200_team_chat.sql`, aplique-a uma única vez para criar a tabela do Chat, as regras de acesso e habilitar as atualizações em tempo real. Se já executou, pule-a.
- Aplique `20261102152500_profile_email_notifications.sql` uma única vez para habilitar a edição do próprio nome/foto, o bucket privado e os metadados mínimos de notificação. Se já a executou, pule-a; não repita.
- Aplique `20261102160000_auto_activate_new_signups.sql` uma única vez para ativar automaticamente **novos** cadastros como `member`. Não promove contas antigas `pending` e não modifica a confirmação de e-mail.
- Se a migration do Chat ainda não foi executada, primeiro aplique `20261102135200_team_chat.sql`; em seguida aplique `20261102161000_team_chat_groups.sql` uma única vez para criar grupos, membros, regras RLS e Realtime. Se já executou a migration de grupos, pule-a.
- Para remover comunicados sem depender de um PATCH direto sujeito à política de linha, aplique `20261103140000_safe_remove_announcement.sql` uma única vez. A função verifica perfil ativo, mantém a remoção lógica e preserva os triggers de auditoria; o RLS permanece ligado.
- Para habilitar a remoção lógica de atividades por Administradores e Líderes da área, aplique `20261103150000_safe_remove_activity.sql` uma única vez. A função valida o perfil e a área, preserva atualizações semanais/auditoria e mantém o RLS ligado.
- Para permitir respostas e reações aos comunicados, aplique `20261104101500_announcement_replies_reactions.sql` uma única vez, depois das migrations base de comunicados. Ela cria tabelas próprias, mantém RLS e habilita Realtime; veja [Respostas e reações nos comunicados](./docs/ETAPA_11_COMUNICADOS_INTERACOES.md).
- Para ajustar o período do projeto no próprio workspace, aplique `20261104120000_workspace_project_period.sql` uma única vez. Ela adiciona `cycle_end` à tabela existente, com padrão inclusivo até 22/12/2027, e mantém a atualização protegida pela política de Administrador ativo já existente. Não reaplique a migration inicial.

Para cada arquivo que ainda precisa ser aplicado: abra o mesmo projeto Supabase usado pelo Netlify, vá a **SQL Editor → New query**, copie o conteúdo integral daquele único arquivo do pacote, confira o projeto selecionado e clique em **Run**. Espere a confirmação de sucesso antes de aplicar o próximo arquivo. O SQL do Chat usa a publicação `supabase_realtime`; ele não pede que você desative RLS nem use uma chave privilegiada.

O Realtime do Supabase envia alterações Postgres para clientes inscritos quando a tabela está na publicação apropriada e há política de leitura autorizando o usuário. O pacote configura isso para mensagens, grupos e membros, com políticas de leitura diferentes para sala geral e grupos. Consulte a [documentação oficial do Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).

Se você não sabe se a migração antiga de Arquivos/Comunicados já foi executada, **não a repita por tentativa**; pergunte antes para conferir o estado do projeto. A migração inicial e os dados existentes não devem ser apagados.

### Ajustar o período do projeto

Depois de aplicar `20261104120000_workspace_project_period.sql` e publicar o novo site, entre com um perfil ativo cujo papel seja **Administrador**. Nas abas **Semana** ou **Atividades**, confira o intervalo exibido e selecione **Editar período**. O padrão é **09/11/2026 a 22/12/2027**. Informe o início e o fim e salve; o início precisa ser uma segunda-feira, pois os status semanais são agrupados por semana. O fim é inclusivo e a última semana pode ser parcial. As outras áreas do site continuam usando o intervalo salvo sem que o usuário precise ajustar semana por semana.

O Supabase também verifica a permissão de Administrador; esconder o botão para os demais perfis não é a única proteção. Se a tela informar que a migration ainda falta, aplique o arquivo acima no projeto Supabase ligado ao Netlify e atualize a página. Não altere a RLS para contornar o aviso.

### Conferir respostas e reações nos comunicados

Depois de aplicar `20261104101500_announcement_replies_reactions.sql` e publicar o site, abra **Comunicados** com duas contas ativas. Uma resposta ou reação feita por uma conta deve aparecer em tempo real na outra. Teste também desfazer uma própria reação e remover uma resposta própria; use uma conta Administradora para testar a moderação de resposta de outra conta, sempre em conteúdo de teste. A migração é necessária; não desative RLS para contornar a mensagem de indisponibilidade.

## 3. Entrar e testar o Chat

Depois do deploy e das migrations, saia do site e entre novamente com duas contas ativas. Abra **Chat → Equipe**, envie uma mensagem curta e confirme que ela aparece na outra sessão sem recarregar. Em seguida, crie um grupo com a primeira conta, inclua a segunda e envie uma mensagem: as duas devem vê-la em tempo real. Uma terceira conta ativa, que não entrou no grupo, não deve ver o grupo nem as mensagens dele. Tente também adicionar uma pessoa ativa depois da criação.

Somente uma conta ativa com papel **Administrador** vê o controle de remoção. Teste-o apenas em mensagem de teste: confirme que ela desaparece nas outras sessões, inclusive no grupo. A pessoa que enviou a mensagem não pode apagá-la se não for Administradora. A sala Equipe é comum a todos os ativos; mensagens de grupo ficam restritas a participantes e Administradores. O Chat não envia e-mail.

## 4. Configurar o Perfil e a foto

Depois de aplicar a migration do Perfil e publicar o site, entre com um perfil `active`. No canto superior direito, abra o menu do seu nome/inicial, informe o nome exibido e, se desejar, escolha uma imagem JPEG, PNG ou WebP de até 2 MiB. **Salvar perfil** atualiza apenas sua própria linha `profiles`; a imagem fica em bucket privado. **Remover foto** apaga a referência e volta a mostrar a inicial do nome. Pessoas ativas podem ler fotos pelo Storage; pendentes, suspensas e visitantes são bloqueados. E-mail, papel, área e status não são editáveis por esse menu.

Se o menu avisar que a migration ainda falta ou mantiver os controles desabilitados, confira se `20261102152500_profile_email_notifications.sql` foi aplicada no mesmo Supabase usado pelo site.

## 5. Avisos por e-mail (opcional; ainda desligados)

O projeto não tem provedor de e-mail configurado. O perfil e as outras telas funcionam sem ele. **Deixe `VITE_ACTIVITY_EMAILS_ENABLED=false` (padrão) e pule esta seção se não quiser configurar agora.** Enquanto a flag estiver desligada, o site não chama a função e nenhum e-mail de atividade é enviado.

Para habilitar mais tarde:

1. Crie uma conta Resend, adicione um domínio que a equipe controla e conclua a verificação DNS. Escolha um remetente desse domínio.
2. No Supabase → **Edge Functions**, crie ou atualize a função `notify-activity` com o código de `supabase/functions/notify-activity/index.ts`. Mantenha a verificação JWT padrão ligada e publique a função.
3. Em **Edge Functions → Secrets**, configure `RESEND_API_KEY` com a chave do Resend e `RESEND_FROM_EMAIL` com o remetente verificado. Não coloque a chave no Netlify, em arquivo `.env`, no GitHub, no código-fonte ou em uma mensagem. A função usa a chave de serviço apenas do lado do servidor.
4. Só depois de confirmar a migration, a função publicada e os secrets, no Netlify adicione `VITE_ACTIVITY_EMAILS_ENABLED=true` como texto simples (não segredo), com contexto **Builds**, e publique um novo deploy. Para desligar, volte para `false` e faça novo deploy.
5. Teste com uma alteração de atividade/status feita pelo site e contas de teste ativas: o aviso vai apenas ao responsável atualmente vinculado, se ativo, e a Administradores ativos, excluindo quem fez a alteração. Sem responsável, só Administradores. Mensagens do Chat, perfil, pastas e comunicados não enviam e-mail; justificativa, observações e descrição não são incluídas.

Uma alteração real salva pode disparar e-mail imediatamente após a ativação. Faça testes apenas quando a equipe aceitar receber essas mensagens e evite usar tarefas reais com conteúdo sensível. Se o Resend não estiver configurado, não ative a flag.

## 6. Usar as abas já existentes

Em **Arquivos**, use **Adicionar pasta** e informe um nome, link HTTPS iniciado por `https://drive.google.com/` sem usuário/senha embutidos ou porta personalizada e, opcionalmente, uma área. Sem área, o card fica como **Geral**. O card abre o Drive em outra aba; cada integrante também precisa ter acesso à pasta no próprio Google Drive. Remover tira o atalho da lista, sem apagar o arquivo ou pasta do Google.

Em **Comunicados**, publique título, mensagem e destinatário (toda equipe ou uma área). O autor é automático. Fixados aparecem primeiro e depois vêm os mais recentes. Remover pede confirmação e mantém o registro auditável.

**Semana** e **Atividades** continuam ligadas às tabelas existentes do Supabase. O botão **Remover** aparece para Administradores e Líderes da área; ele arquiva a atividade para que saia das listas, preservando histórico semanal e auditoria. Não é uma exclusão física. A migration `20261103150000_safe_remove_activity.sql` precisa estar aplicada para o botão funcionar.

## 7. Solução de problemas

- **A aba Chat não aparece:** confirme que o novo deploy foi publicado e entre com uma conta de perfil `active`; atualize com Ctrl+F5 (Windows) ou Cmd+Shift+R (Mac).
- **O Chat avisa que ainda não foi habilitado ou erro de coluna/tabela ausente:** confirme se `20261102135200_team_chat.sql` e `20261102161000_team_chat_groups.sql` foram executadas no mesmo Supabase, na ordem. Não rode novamente a migração inicial.
- **A mensagem envia, mas não chega em tempo real:** use **Atualizar** no Chat e confirme que a migration de grupos concluiu sem erro e habilitou a publicação Realtime para mensagens, grupos e membros. Não desligue RLS.
- **Não aparece o botão de remoção:** isso é esperado para quem não tem papel Administrador. A conta precisa estar ativa e com papel `admin` no perfil.
- **RLS bloqueou uma ação:** confira se a conta está ativa e se as migrações necessárias foram aplicadas ao projeto certo; não contorne o erro removendo políticas.
- **O Netlify falhou:** abra o log do deploy e confira `pnpm install --frozen-lockfile`, `pnpm build` e a saída `dist/index.html`. Não crie outro site.

Nunca envie senhas, chaves, tokens ou URLs privadas em capturas de tela ou mensagens. Se precisar de ajuda com um erro, compartilhe apenas o texto não sensível.

## Segurança e limites

O pacote contém código e guias, mas não a configuração local de ambiente, `dist`, `node_modules`, `.git` ou credenciais de produção. A tabela do Chat revoga `UPDATE` e `DELETE` do navegador; o único caminho de remoção é uma função que verifica Administrador ativo e substitui o texto original. Todos os perfis ativos podem usar a sala geral; somente participantes ativos e Administradores leem grupos, com RLS. Pela decisão da equipe, novos cadastros públicos são ativados automaticamente como `member`; qualquer pessoa que consiga se cadastrar poderá acessar os dados compartilhados permitidos pelas políticas. Visitantes sem sessão, contas ainda pendentes e perfis suspensos continuam bloqueados.

A verificação local não substitui o teste no seu Supabase e Netlify reais. Nenhum SQL, mensagem ou outra escrita foi executada pelo agente no seu banco remoto, e nenhum deploy foi feito por esta atualização.


## 8. Ativar push nativo pelo Median/OneSignal

Este pacote mantém os avisos nativos do Chat, de comunicados e de atribuições no APK Median e acrescenta Web Push para navegadores desktop. Não altera nem regenera seu APK. O site associa o UUID Supabase ao mesmo OneSignal tanto no navegador quanto na ponte nativa; a pessoa ativa a permissão do navegador no menu do perfil. Para Web Push, confira a plataforma Web e o App ID no guia `docs/ETAPA_10_PUSH_CHAT_ONESIGNAL.md`.

1. Aplique `20261102210500_chat_push_notifications.sql` uma vez, depois das migrations de Chat e grupos. Ela cria o registro técnico de entrega do Chat.
2. Para avisos de comunicados e atribuições, aplique `20261103103000_workspace_push_events.sql` e, em seguida, `20261103110000_workspace_push_event_tokens.sql`, cada uma uma única vez. Pule qualquer arquivo que já tenha sido aplicado com sucesso. Não repita migrations.
3. Em **Supabase → Edge Functions → Secrets**, confirme `ONESIGNAL_APP_ID` (App ID do app OneSignal conectado ao Median) e `ONESIGNAL_REST_API_KEY` (App API Key privada criada no app). Se ainda não cadastrou, adicione esses nomes e valores uma vez. Não use o Key ID, JSON do Firebase, identificador `co.median.android...` do Median, nem cole a chave no ZIP/GitHub/Netlify.
4. Publique as Edge Functions `notify-chat-push` e `notify-workspace-push` usando os respectivos `supabase/functions/<nome>/index.ts` deste pacote. Mantenha **Verify JWT** ligado nas duas. Não substitua nem desative `notify-activity`.
5. Publique o site atualizado pelo repositório já vinculado ao Netlify, seguindo a seção 1. Não crie um novo site.
6. Teste com duas contas ativas e inscritas no OneSignal: uma mensagem na sala Equipe, um comunicado de teste e uma atribuição/reatribuição de teste. O autor não deve receber o próprio alerta; comunicado por área deve ficar restrito à área; atividade deve avisar somente o novo responsável. Confira os logs das duas Edge Functions e o histórico do OneSignal.

As mensagens de push são genéricas e não incluem o texto privado da conversa, comunicado, atividade ou observações. Se a migration, secret ou function ainda não estiver pronta, o conteúdo continua sendo salvo, mas os pushes não funcionarão até concluir a configuração. Veja o passo a passo ilustrado em `docs/ETAPA_10_PUSH_CHAT_ONESIGNAL.md`.
