# SolMar Celeris — atualizar no GitHub/Netlify e habilitar no Supabase

**Revisado em 04/11/2026.** Este manual acompanha o pacote-fonte atualizado, com respostas e reações nos comunicados, atalhos de IA sem Canva, navegação responsiva, confirmação de leitura, áudios MP3 e anexos privados no Chat, Calendário de eventos, atividade/eventos integrados à Semana, links diretos ao conteúdo a partir dos pushes e suporte a notificações Web Push. O projeto continua usando o mesmo site Netlify e o mesmo Supabase. Este guia não publica por você nem executa SQL no seu banco.

## O que esta versão acrescenta

Após entrar com um perfil `active`, o menu mostra ícones para **Chat**, **Comunicados**, **Semana**, **Atividades**, **Arquivos**, **Calendário de eventos**, **Manual de funções** e **IA**. Em telas móveis a navegação fica na lateral esquerda com o nome das seções abaixo dos ícones; na Semana, um símbolo circular `24h` distingue esse acompanhamento do calendário de eventos. A aba IA abre ChatGPT, Claude AI, Gemini e Manus; também oferece os prompts completos de Registro de Atividades e POP, com botão para copiar e link do template oficial. Login e cabeçalho usam a logo original `public/assets/celeris-logo.png`; a imagem não foi editada nem substituída.

O Chat preserva a sala **Equipe** para todos os perfis ativos e permite criar grupos, selecionar integrantes ativos e adicionar mais pessoas depois. O criador já entra no grupo. Somente participantes ativos e Administradores ativos veem grupos; o Supabase RLS também impõe esse limite. Mensagens chegam em tempo real; o histórico usa balões e tons azuis da identidade SolMar. A lista de conversas fica na lateral no desktop e abre como painel lateral retrátil no celular, deixando a conversa ocupar quase toda a área disponível. Mensagens aceitam texto, uma imagem/documento/áudio anexado por vez, foto feita pela câmera ou áudio gravado/converter para MP3. Os arquivos têm limite de 15 MB, ficam privados e só podem ser abertos por quem pode ler a mensagem correspondente. Mensagens de texto podem ter até 2.000 caracteres e ficam salvas até um Administrador ativo removê-las. Ao remover, o texto é substituído por um aviso. Os push de Chat mostram o texto exato da mensagem no corpo da notificação e o nome do remetente no título; portanto, não envie segredos ou informações que não devam aparecer na tela bloqueada do destinatário. Mensagens de Chat não enviam e-mail.

Novos cadastros são ativados automaticamente como `member` depois da migration indicada abaixo; como a inscrição é pública, qualquer pessoa que conseguir se cadastrar poderá acessar os dados compartilhados permitidos pela RLS. Contas anteriores que já estavam `pending` não são alteradas. A confirmação de e-mail do Supabase, se habilitada, continua ativa e é independente.

Nas abas Arquivos e Comunicados, as permissões previamente escolhidas continuam valendo: todo perfil ativo pode ver e gerenciar qualquer pasta e comunicado, inclusive de outra área. Após aplicar a migration adicional abaixo, todo perfil ativo pode responder e reagir aos comunicados; a remoção de resposta fica limitada ao autor ou a um Administrador ativo. O app não acessa o conteúdo das pastas do Google Drive.

## 1. Atualizar o repositório que já alimenta o Netlify

1. Baixe e extraia o ZIP atualizado que acompanha esta versão.
2. Abra no GitHub Desktop o mesmo repositório local que está ligado ao seu site Netlify. Faça uma cópia de segurança da pasta antes de substituir os arquivos.
3. Copie o conteúdo de dentro do ZIP para a pasta do repositório e aceite substituir os arquivos com o mesmo caminho. **Não apague nem substitua `.git`.**
4. Em **Changes**, confirme que aparecem os arquivos de navegação, grupos e manual de funções, incluindo `ManualFunctions.tsx`, `TeamChat.tsx`, `team-chat.css`, `ChatGroupDialog.tsx`, os componentes de identidade Median/OneSignal, `desktopNotifications.ts`, `public/push/onesignal/OneSignalSDKWorker.js`, as funções `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push`, além das migrations de push, confirmação de leitura/áudio e `20261104183000_chat_attachments.sql`.
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

Depois de aplicar `20261104120000_workspace_project_period.sql` e publicar o novo site, entre com um perfil ativo cujo papel seja **Administrador**. Nas abas **Semana** ou **Atividades**, confira o intervalo exibido e selecione **Editar período**. O padrão é **09/11/2026 a 22/12/2027**. Informe o início em qualquer dia e a data final; o início não precisa ser uma segunda-feira. Os status continuam agrupados por semanas de segunda a domingo; a primeira semana começa visualmente na data inicial escolhida. O fim é inclusivo e a última semana pode ser parcial. As outras áreas do site continuam usando o intervalo salvo sem que o usuário precise ajustar semana por semana.

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

Push de Chat contém a mensagem exata enviada e é direcionado somente aos participantes daquela sala/conversa; pushes de atividade mostram nome, prazo e entrega esperada ao responsável, enquanto os avisos de comunicados seguem genéricos. Não inclua segredos ou dados altamente sensíveis em mensagens, porque o preview pode aparecer na tela bloqueada do dispositivo. Se a migration, secret ou function ainda não estiver pronta, o conteúdo continua sendo salvo, mas os pushes não funcionarão até concluir a configuração. Veja o passo a passo ilustrado em `docs/ETAPA_10_PUSH_CHAT_ONESIGNAL.md`.

## 9. Conversas privadas, fotos no chat e Calendário de eventos
Esta versão acrescenta conversas privadas 1:1, fotos de perfil ao lado das mensagens de grupo e a aba Calendário de eventos. As conversas diretas ficam separadas dos grupos: a consulta RLS permite ler somente às duas contas participantes; Administradores fora da conversa não recebem acesso às mensagens privadas. O calendário é visível para membros ativos; cada pessoa pode editar/remover os próprios eventos, e Administradores podem administrar todos. Eventos aparecem também na Semana, com atalho que abre o Calendário de eventos na data correspondente. Não desligue o RLS.

1. No Supabase correto, abra **SQL Editor** e aplique uma única vez `supabase/migrations/20261104130000_private_chat_calendar.sql`. Não reaplique migrations anteriores nem execute novamente se já concluiu com sucesso.
2. Pelo Supabase Dashboard, publique as funções `notify-chat-push` e `notify-workspace-push` com os arquivos atualizados deste pacote. A atualização do `notify-chat-push` é importante: ela faz alertas privados chegarem apenas à outra pessoa, sem notificar a equipe inteira. Mantenha **Verify JWT** ligado e preserve os secrets OneSignal existentes.
3. Publique o código-fonte atualizado no GitHub, mantendo o repositório e a configuração Netlify atuais. O Netlify deve executar `pnpm build`; não é necessário alterar variáveis de ambiente para estas mudanças.
4. Depois do deploy, teste com duas contas ativas: inicie uma conversa privada e confirme que uma terceira conta não enxerga a conversa; envie mensagens em um grupo e confira foto/nome; crie reuniões, treinamentos, DSB, SEPEX, visitas técnicas e PAC no Calendário.
5. Para validar atividade atribuída, confira o push em português com título **“Atividade atribuída a você”** e nome da atividade, prazo no formato **DD/MM/AAAA** e entrega esperada. Se a data ou o entregável não estiver cadastrado, o texto indica “não definido” ou “não especificada”. Para o Chat, o corpo do push deve mostrar o texto exato da mensagem recebida.

A aplicação da migration e o deploy das Edge Functions precisam ser feitos no Supabase conectado a este site; enviar os arquivos ao GitHub/Netlify, sozinho, não altera o banco nem publica as funções. Esta atualização de código não foi aplicada ao seu Supabase remoto e nenhum deploy foi executado.

## 10. Notificações de novos eventos do Calendário
Ao criar um evento, o sistema envia um push **Novo evento no calendário** aos demais integrantes ativos vinculados ao OneSignal. O criador não recebe o próprio aviso. O conteúdo usa o título do evento e a data em DD/MM/AAAA. Edições e remoções não disparam uma nova notificação.

1. Depois da migration `20261104130000_private_chat_calendar.sql`, aplique uma única vez `supabase/migrations/20261104133000_calendar_event_push.sql`. Ela cria uma fila técnica mínima com status/tentativas; não grava título nem descrição do evento nessa fila.
2. No Supabase, crie/publique a Edge Function `notify-calendar-event-push` usando `supabase/functions/notify-calendar-event-push/index.ts`. Mantenha **Verify JWT** ligado.
3. Confirme que a função usa os secrets já configurados `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY`; não crie nem exponha chaves em GitHub, Netlify, `VITE_*` ou no navegador.
4. Publique o app atualizado no GitHub/Netlify. O novo aviso só ocorre para eventos criados depois da migration e do deploy; editar evento existente não notifica.
5. Teste com duas contas ativas e inscritas no OneSignal: uma cria evento de teste e a outra deve receber “Novo evento no calendário” com o nome e a data. O criador não recebe o próprio aviso. Consulte os logs da função se o evento for salvo, mas o push não for confirmado.

Se já aplicou a migration de Calendário anterior, **não a repita**: aplique somente `20261104133000_calendar_event_push.sql`. Nenhuma migration foi executada nem Edge Function publicada automaticamente por este pacote.


## 11. Confirmação de leitura e áudio no Chat
A aba Chat mostra confirmação de leitura nas mensagens enviadas (tique duplo e “Lida”; em grupos, quantidade de integrantes que leram). Também permite gravar áudio pelo microfone do navegador, converter a gravação para MP3 real antes do envio, reproduzir e baixar os arquivos `.mp3`. O navegador precisa ter permissão de microfone e o app deve estar em HTTPS. Os áudios ficam no bucket privado `team-chat-audio`, têm limite de 15 MB e usam links temporários assinados; somente quem consegue ler a mensagem correspondente pelas políticas RLS pode reproduzir ou baixar o arquivo. Não desligue RLS nem torne esse bucket público.

1. No projeto Supabase correto, aplique uma única vez `supabase/migrations/20261104170000_chat_read_receipts_audio.sql`, depois das migrations de grupos e conversas privadas. A migration cria a tabela de recibos de leitura, acrescenta os metadados do áudio às mensagens, cria/configura o bucket privado e publica a tabela de recibos no Realtime.
2. Publique o app atualizado no repositório ligado ao Netlify. Não é preciso alterar secrets nem variáveis de ambiente.
3. Teste com duas contas ativas em uma conversa: envie uma mensagem e confira a confirmação “Lida” depois que a outra pessoa abrir a conversa; grave um áudio, envie, reproduza e use **Baixar**. Repita em uma conversa privada e em um grupo para confirmar que uma terceira conta não participante não consegue abrir o áudio privado.
4. Se o microfone não iniciar, permita-o para o site nas configurações do navegador. No celular, use o site em HTTPS e confira a permissão do Safari/Chrome para o microfone.

A migration precisa ser aplicada no Supabase conectado ao site; o ZIP ou o deploy do Netlify não alteram o banco. Nenhum SQL foi executado e nenhum deploy remoto foi feito por este pacote.

## 12. Anexar arquivos e usar a câmera no Chat
No composer do Chat, **Anexar** abre o seletor de arquivos para uma imagem, documento ou áudio por mensagem. Formatos previstos: JPEG, PNG, GIF, WebP, HEIC/HEIF; PDF, TXT, CSV, Word, Excel e PowerPoint; e áudio. Áudios gravados ou selecionados são convertidos para MP3 antes do envio. **Câmera** abre a câmera traseira do dispositivo compatível para capturar uma foto e anexá-la. O tamanho máximo de cada arquivo é 15 MB.

1. Aplique uma única vez `supabase/migrations/20261104183000_chat_attachments.sql`, depois de `20261104170000_chat_read_receipts_audio.sql` e das migrations de Chat/grupos/conversas privadas. Ela acrescenta metadados, cria o bucket privado `team-chat-attachments` e permite leitura do objeto somente quando a mensagem correspondente é legível pela RLS.
2. Publique o app atualizado pelo mesmo GitHub/Netlify e aguarde o build. Não é preciso adicionar segredo ou variável `VITE_*`.
3. Teste envio de imagem, PDF/documento e áudio com contas de teste ativas; confirme visualização/download permitido para participantes e negado para pessoa fora da conversa privada/grupo. Faça um teste da câmera no celular e confirme que o navegador/app pede permissão quando necessário.

O seletor de câmera depende do suporte do dispositivo/navegador e da permissão do sistema. No Median, habilite a permissão de câmera no projeto e gere/atualize o APK se o Android não solicitar acesso; no navegador, use o site HTTPS e permita câmera para o domínio. Nunca torne os buckets públicos nem remova as policies RLS.

## 13. Abrir o destino certo ao tocar em um push
Os pushes incluem parâmetros internos de navegação. Ao tocar: Chat abre a conversa e a mensagem específica; Comunicado abre a aba e destaca o comunicado; Atividade abre a aba e destaca a atividade; Calendário abre a data/evento correspondente. Não há uma configuração adicional de redirecionamento no painel OneSignal para cada conteúdo: o app e as Edge Functions atualizados fornecem o destino. O acesso continua sujeito a login, perfil ativo e RLS do Supabase.

1. Publique no GitHub/Netlify a versão atualizada do front-end.
2. No Supabase, publique as versões atuais das Edge Functions `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` a partir de `supabase/functions/<nome>/index.ts`. Mantenha **Verify JWT** ligado e use os secrets OneSignal já configurados. Isso atualiza o link e os dados extras (`type`/IDs) enviados em cada push.
3. Não é necessária uma nova configuração do OneSignal nem uma nova migration só para o deep link. As migrations já existentes para os eventos/filas do push e para as conversas privadas continuam necessárias; não reaplique arquivos que já foram executados com sucesso.
4. Faça testes com duas contas autorizadas e pushes novos. Toque em cada tipo de aviso e confirme a aba, o item e a mensagem/data. Para um push antigo que não carregue os dados de destino, o app não consegue adivinhar o registro; gere um novo teste depois de publicar as Edge Functions.

O front-end consulta o conteúdo pelo Supabase autenticado e não confia em URL/ID como prova de acesso. Se o usuário não puder ler aquela conversa/registro, as políticas RLS devem continuar bloqueando-o. Nenhum SQL remoto, deploy de site ou publicação de Edge Function foi executado por este pacote.

## 14. Manual, tarefas Scrumban, PERT/CPM, anexos, enquetes e disponibilidades
Esta versão inclui o Manual de funções alinhado ao organograma informado; o quadro Scrumban e anexos de tarefas; a subvista PERT/CPM para marcos; anexos locais, links do Google Drive/Docs e enquetes nos Comunicados; links do Drive no Chat; e a nova aba de Disponibilidades e escalas. O app usa os papéis já existentes: não há papel novo de Coordenação; os professores mantêm a configuração atual e não recebem tarefas operacionais automaticamente. A antiga área Projetos fica inativa no catálogo para novas tarefas, mas seus registros e códigos históricos são preservados como “Projetos (histórico)”; Energia passa a “Elétrica”.

### Aplicar as migrations
No projeto Supabase ligado ao site, confira primeiro o histórico de migrations já aplicadas. Aplique **somente as que faltarem**, uma única vez cada, na ordem abaixo (não cole o esquema inicial novamente):

1. `supabase/migrations/20261106193000_availability.sql` — disponibilidade recorrente por pessoa, quadro interno para perfis ativos e escalas, com slots de segunda a sexta, 07:00–21:00.
2. `supabase/migrations/20261106194000_announcement_attachments_drive_polls.sql` — anexos privados e links Drive nos comunicados, mais enquetes com votos e resultados agregados.
3. `supabase/migrations/20261106195000_chat_drive_links.sql` — metadados de links Drive/Docs nas mensagens de Chat; os uploads locais atuais do Chat continuam em bucket privado.
4. `supabase/migrations/20261106195800_activity_flow_attachments.sql` — estágios Scrumban, configuração WIP por etapa/área, movimentação de cartões protegida por autorização e WIP, anexos privados e links Drive em atividades.
5. `supabase/migrations/20261106195900_pert_dependencies.sql` — estimativas PERT e relações predecessor/sucessor entre marcos, cálculo da rede e prevenção de ciclos.
6. `supabase/migrations/20261106201000_org_area_cleanup.sql` — “Projetos” deixa de ser uma área ativa e “Energia” é renomeada para “Elétrica”; vínculos e tarefas antigas permanecem preservados como histórico somente para leitura.
7. `supabase/migrations/20261106202000_chat_group_photos_read_receipts.sql` — avatares privados dos grupos e detalhe dos recibos de leitura; membros autorizados veem quem leu/não leu mensagens coletivas, sem ampliar acesso a conversas diretas.
8. `supabase/migrations/20261106203000_area_sector_abbreviations.sql` — rótulos e prefixos oficiais GP, MKT, AF, MEC, ELE e TEL para novas tarefas, sem reescrever códigos históricos.
9. `supabase/migrations/20261106204000_special_event_shift_exceptions.sql` — permite escalas de ocasiões especiais fora da disponibilidade semanal, mantendo a validação de perfil ativo e os limites de dia útil e horário.
10. `supabase/migrations/20261106205000_availability_half_hour_slots.sql` — permite marcar disponibilidades em blocos de 30 minutos, mantendo válidos os horários antigos.
11. `supabase/migrations/20261106211000_kanban_drag_drop.sql` — libera a movimentação dos cartões entre as colunas do Kanban; mantém autorização, limites WIP e a justificativa obrigatória para atividades Bloqueadas.

As migrations de anexos criam buckets Supabase Storage **privados**, com limite de 15 MiB e formatos permitidos. Não torne `activity-attachments`, `announcement-attachments`, `team-chat-attachments`, `team-chat-audio` ou `team-chat-group-photos` públicos, não desative RLS e não coloque `service_role` em Netlify/Vite ou no navegador. No Scrumban, os limites WIP começam sem número configurado; a Administração pode configurar limite por etapa e área após observar o fluxo, sem limite arbitrário fixo. O estágio do quadro é separado do status semanal. O Chat passa a se chamar SolMarZap e oferece botões de conversa privada e em grupo, foto de grupo JPEG/PNG/WebP de até 3 MiB em bucket privado, e detalhes de leitura em mensagens coletivas: autor/membros autorizados veem nomes de leitores e pendentes. Recibos de DMs seguem restritos aos participantes e não são listados para terceiros.

### Publicar o front-end
Depois de aplicar as migrations no Supabase correto, publique o código atualizado no GitHub ligado ao mesmo site Netlify e aguarde o build `pnpm build`. Não crie outro site nem altere variáveis de ambiente para estes recursos. Esta atualização não requer nova chave OneSignal nem alteração das Edge Functions de push.

### SolMarZap, Drive, enquetes e escalas
O campo Drive aceita apenas links HTTPS com host `drive.google.com` ou `docs.google.com`; o aplicativo não baixa/sincroniza o arquivo nem consegue conceder permissão Google. Configure o compartilhamento no Drive separadamente e siga a política da equipe antes de usar “qualquer pessoa com o link”. Votos da enquete são contabilizados em resultados agregados, sem a identidade de quem votou. Cada pessoa preenche apenas sua própria disponibilidade; todos os perfis ativos e autenticados podem consultar o quadro e as escalas. Escalas podem ser usadas para ocasiões especiais, como SEPEX, e podem atribuir turnos fora dos horários habituais; o aplicativo mostra aviso, mas não bloqueia. Continuam obrigatórios dia útil, horários cheios entre 07:00 e 21:00 e perfil ativo para a pessoa atribuída. Administração e Líderes de área podem montar/editar escalas.

Nenhuma dessas migrations foi executada no seu Supabase remoto e nenhum deploy foi feito por esta atualização. Enviar os arquivos ao GitHub/Netlify sozinho não altera o banco; o novo front-end deve ser publicado em coordenação com as migrations aplicadas.
