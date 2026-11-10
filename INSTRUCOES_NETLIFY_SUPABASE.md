# Team Celeris — atualizar no GitHub/Netlify e habilitar no Supabase

**Revisado em 09/11/2026.** Este manual acompanha o pacote-fonte atualizado, com o Manual de funções revisado, edição de pastas, diretório de membros, convites administrativos, presença efêmera, gestão de acesso e a taxonomia Eletrônica - ELT. Também mantém os recursos existentes de Chat, Agenda, Disponibilidades, relato semanal, notificações e Web Push. O projeto continua usando o mesmo site Netlify e o mesmo Supabase. Este guia não publica por você nem executa SQL no seu banco.

## O que esta versão acrescenta

Após entrar com um perfil `active`, o menu principal mostra **Feed**, **Atividades**, **Agenda**, **Comunicados**, **Arquivos** e o Manual correspondente ao canal. O Chat é aberto exclusivamente pelo diretório **Membros**, ao selecionar uma pessoa ou criar um grupo. Agenda contém **Calendário**, **Disponibilidades** e **Reunião**. Início é o feed semanal da equipe e também tem um atalho para a reunião ao vivo. Em mobile, logo e perfil ficam alinhados no topo e as seis áreas aparecem em uma única linha abaixo, sem rolagem horizontal, com ícones ampliados. Os prompts completos de Registro de Atividades e POP, com os templates oficiais, ficam no fim do Manual de funções. O dock **Membros** no canto inferior direito abre o diretório, com pontos azuis (online) e vermelhos (offline); apenas administradores ativos podem promover, revogar vínculo permanentemente ou convidar por e-mail. O nome/foto do perfil e o botão de tema continuam disponíveis no menu do perfil. A marca do aplicativo no rodapé permanece intacta.

Em **Conversas → Chat**, preserva-se a sala **Equipe** para todos os perfis ativos, além de DMs e grupos. Mensagens, áudio em MP3, fotos, documentos e câmera ficam em buckets privados. Qualquer participante ativo pode apagar qualquer mensagem para todos na sala geral, em grupo ou DM; participantes também podem apagar grupos ou DMs para todos. A sala geral não pode ser apagada. A confirmação é explícita; anexos/áudio/foto são removidos por uma fila segura do servidor, com retry se o Storage falhar. Recibos de DMs seguem visíveis somente aos participantes. A antiga tabela de ocultação individual permanece preservada, mas o aplicativo não consulta nem grava nela e não oferece **Apagar só para mim** ou **Ocultas**. Os push de Chat mostram o texto exato da mensagem no corpo da notificação e o nome do remetente no título; não envie segredos ou informações que não devam aparecer na tela bloqueada. Mensagens não enviam e-mail.

Novos cadastros são ativados automaticamente como `member` depois da migration indicada abaixo; como a inscrição é pública, qualquer pessoa que conseguir se cadastrar poderá acessar os dados compartilhados permitidos pela RLS. Contas anteriores que já estavam `pending` não são alteradas. A confirmação de e-mail do Supabase, se habilitada, continua ativa e é independente.

Em **Arquivos** e **Conversas → Comunicados**, as permissões previamente escolhidas continuam valendo: todo perfil ativo pode ver e gerenciar qualquer pasta e comunicado, inclusive de outra área. Após aplicar a migration adicional abaixo, todo perfil ativo pode responder e reagir aos comunicados; a remoção de resposta fica limitada ao autor ou a um Administrador ativo. O app não acessa o conteúdo das pastas do Google Drive.

## 1. Atualizar o repositório que já alimenta o Netlify

1. Baixe e extraia o ZIP atualizado que acompanha esta versão.
2. Abra no GitHub Desktop o mesmo repositório local que está ligado ao seu site Netlify. Faça uma cópia de segurança da pasta antes de substituir os arquivos.
3. Copie o conteúdo de dentro do ZIP para a pasta do repositório e aceite substituir os arquivos com o mesmo caminho. **Não apague nem substitua `.git`.**
4. Em **Changes**, confirme o Manual atualizado, `TeamMembersMenu.tsx`, `SharedContentWorkspace.tsx`, `manage-team-members/index.ts` e as migrations incrementais desta entrega, junto dos componentes existentes. Chaves privilegiadas permanecem no Supabase e não devem aparecer no código cliente.
5. Não envie `.env.local`, `.env.production.local`, `node_modules/` nem `dist/`. O ZIP não contém esses arquivos.
6. No campo **Summary**, escreva `Atualizar manual, equipe e arquivos`. Clique em **Commit to main** (ou na branch principal que o Netlify acompanha) e depois em **Push origin**.
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

Em **Arquivos**, use **Adicionar pasta** e informe um nome, link HTTPS iniciado por `https://drive.google.com/` sem usuário/senha embutidos ou porta personalizada, uma descrição opcional de até 500 caracteres e, opcionalmente, uma área. Sem área, o card fica como **Geral**. Após aplicar a migration `20261109213000_drive_folder_edit_description.sql`, **Editar pasta** altera nome, link, área e descrição por uma RPC segura. O card abre o Drive em outra aba; cada integrante também precisa ter acesso à pasta no próprio Google Drive. Remover tira o atalho da lista, sem apagar o arquivo ou pasta do Google.

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
Esta versão inclui o Manual de funções alinhado ao organograma informado, com prompts completos e links de templates oficiais ao final; o quadro Scrumban e anexos de tarefas; a subvista PERT/CPM para marcos; anexos locais, links do Google Drive/Docs e enquetes em Comunicados; links do Drive no Chat; e o feed **Início** com as atividades da semana. A organização atualizada está resumida na seção 16: **Agenda** reúne Calendário, Disponibilidades e Reunião; **Conversas** reúne Chat e Comunicados. Reunião também tem um atalho no feed; não há aba IA. O app usa os papéis já existentes: não há papel novo de Coordenação; os professores mantêm a configuração atual e não recebem tarefas operacionais automaticamente. A antiga área Projetos fica inativa no catálogo para novas tarefas, mas seus registros e códigos históricos são preservados como “Projetos (histórico)”; Energia passa a “Elétrica”.

### Aplicar as migrations
No projeto Supabase ligado ao site, confira primeiro o histórico de migrations já aplicadas. Aplique **somente as que faltarem**, uma única vez cada, na ordem abaixo (não cole o esquema inicial novamente):

1. `supabase/migrations/20261106193000_availability.sql` — disponibilidade recorrente por pessoa, quadro interno para perfis ativos e escalas, com slots de segunda a sexta, 07:00–21:00.
2. `supabase/migrations/20261106194000_announcement_attachments_drive_polls.sql` — anexos privados e links Drive nos comunicados, mais enquetes com votos e resultados agregados.
3. `supabase/migrations/20261106195000_chat_drive_links.sql` — metadados de links Drive/Docs nas mensagens de Chat; os uploads locais atuais do Chat continuam em bucket privado.
4. `supabase/migrations/20261106195800_activity_flow_attachments.sql` — estágios Scrumban, configuração WIP por etapa/área, movimentação de cartões protegida por autorização e WIP, anexos privados e links Drive em atividades.
5. `supabase/migrations/20261106195900_pert_dependencies.sql` — estimativas PERT e relações predecessor/sucessor entre marcos, cálculo da rede e prevenção de ciclos.
6. `supabase/migrations/20261106201000_org_area_cleanup.sql` — “Projetos” deixa de ser uma área ativa e “Energia” é renomeada para “Elétrica”; vínculos e tarefas antigas permanecem preservados como histórico somente para leitura.
7. `supabase/migrations/20261106202000_chat_group_photos_read_receipts.sql` — avatares privados dos grupos e detalhe dos recibos de leitura; membros autorizados veem quem leu/não leu mensagens coletivas, sem ampliar acesso a conversas diretas.
8. `supabase/migrations/20261106203000_area_sector_abbreviations.sql` — rótulos e prefixos oficiais GP, MKT, AF, MEC, ELE e TEL para novas tarefas nessa etapa; a migration 15 abaixo renomeia o prefixo TEL para ELT sem reescrever códigos históricos.
9. `supabase/migrations/20261106204000_special_event_shift_exceptions.sql` — permite escalas de ocasiões especiais fora da disponibilidade semanal, mantendo a validação de perfil ativo e os limites de dia útil e horário.
10. `supabase/migrations/20261106205000_availability_half_hour_slots.sql` — permite marcar disponibilidades em blocos de 30 minutos, mantendo válidos os horários antigos.
11. `supabase/migrations/20261106211000_kanban_drag_drop.sql` — libera a movimentação dos cartões entre as colunas do Kanban; mantém autorização, limites WIP e a justificativa obrigatória para atividades Bloqueadas.
12. `supabase/migrations/20261108122000_weekly_update_details_history.sql` — acrescenta campos de relato semanal, copia para pendências somente justificativas de registros com status pendente e preserva o texto original, cria snapshots append-only com ator/data/status/relatos e mantém RLS de leitura para integrantes ativos.
13. `supabase/migrations/20261109213000_drive_folder_edit_description.sql` — adiciona descrição a pastas existentes sem apagar dados e habilita edição por RPC; UPDATE direto continua revogado e URLs são redigidas na auditoria.
14. `supabase/migrations/20261109220000_team_member_admin_presence.sql` — cria RPCs auditadas de promoção/suspensão, bloqueia auto-remoção/remoção do último administrador ativo e cria RLS para o canal privado `team-presence`.
15. `supabase/migrations/20261109223000_rename_telemetry_to_electronics.sql` — mantém o mesmo `area_id` e renomeia Telemetria para **Eletrônica - ELT**, preservando atividades, perfis, histórico e códigos antigos.
16. `supabase/migrations/20261109231000_team_chat_user_hidden_conversations.sql` — etapa histórica, agora descontinuada. Se já foi aplicada, mantenha tabela/registros; **se ainda não foi aplicada, pule-a**, pois o front-end atual não depende dela. Não a reaplique.
17. `supabase/migrations/20261110100000_member_removed_enum.sql` — acrescenta o estado terminal `removed` ao vínculo da equipe, sem apagar usuário Auth, perfil ou histórico.
18. `supabase/migrations/20261110101000_chat_global_delete_member_revocation.sql` — autoriza a exclusão global via funções de servidor, cria a fila privada para limpeza de Storage, habilita cascata segura de mensagens ao apagar um grupo e acrescenta a RPC administrativa de revogação definitiva. RLS permanece ativo; as RPCs de exclusão só executam com `service_role` no runtime da Edge Function.
19. `supabase/migrations/20261110112000_workspace_channels.sql` — cria os canais iniciais por área, membros de canais privados, RLS de leitura/gestão e a tabela `workspace_manuals`; associa a estrutura existente por `area_id` sem recriar atividades, comunicados ou pastas.
20. `supabase/migrations/20261110113000_workspace_manual_storage.sql` — cria o bucket privado dos documentos originais PDF/DOCX dos manuais e políticas de Storage por canal.
21. `supabase/migrations/20261110114000_workspace_channels_area_seed_fix.sql` — corrige de forma idempotente o vínculo do canal Elétrica ao slug atual `eletrica`, mantendo o UUID do canal quando já existir.
22. `supabase/migrations/20261110115000_workspace_channel_content_permissions.sql` — aplica o isolamento por canal a atividades, atualizações semanais, histórico, anexos, PERT/CPM, WIP, comunicados, respostas, reações, enquetes, links e Storage; também limita RPCs de edição/remoção ao canal autorizado.

As migrations de anexos criam buckets Supabase Storage **privados**, com limite de 15 MiB e formatos permitidos. Não torne `activity-attachments`, `announcement-attachments`, `team-chat-attachments`, `team-chat-audio` ou `team-chat-group-photos` públicos, não desative RLS e não coloque `service_role` em Netlify/Vite ou no navegador. No Scrumban, os limites WIP começam sem número configurado; a Administração pode configurar limite por etapa e área após observar o fluxo, sem limite arbitrário fixo. O estágio do quadro é separado do status semanal. Em **Conversas → Chat**, integrantes ativos criam DMs e grupos e participantes/Admins veem grupos; foto de grupo JPEG/PNG/WebP de até 3 MiB fica em bucket privado. Qualquer integrante ativo pode apagar uma mensagem para todos na sala geral, em grupo ou DM. Integrantes podem apagar uma conversa direta ou um grupo para todos; a sala geral não pode ser apagada. O conteúdo do banco é removido permanentemente, e a fila de limpeza tenta apagar áudios/anexos/foto do Storage; se houver falha, ela permanece pendente e a próxima abertura do Chat tenta novamente. URLs assinadas previamente emitidas podem funcionar até expirarem. A tabela antiga de ocultação individual e seus dados ficam preservados, mas a interface já não oferece **Apagar só para mim** nem **Ocultas**. Recibos de DMs seguem restritos aos participantes e não são listados para terceiros.

### Chat, Drive, enquetes e escalas
O campo Drive aceita apenas links HTTPS com host `drive.google.com` ou `docs.google.com`; o aplicativo não baixa/sincroniza o arquivo nem consegue conceder permissão Google. Configure o compartilhamento no Drive separadamente e siga a política da equipe antes de usar “qualquer pessoa com o link”. Votos da enquete são contabilizados em resultados agregados, sem a identidade de quem votou. Cada pessoa preenche apenas sua própria disponibilidade; todos os perfis ativos e autenticados podem consultar o quadro e as escalas. Escalas podem ser usadas para ocasiões especiais, como SEPEX, e podem atribuir turnos fora dos horários habituais; o aplicativo mostra aviso, mas não bloqueia. Continuam obrigatórios dia útil, horários cheios entre 07:00 e 21:00 e perfil ativo para a pessoa atribuída. Administração e Líderes de área podem montar/editar escalas.

Nenhuma dessas migrations foi executada no seu Supabase remoto e nenhum deploy foi feito por esta atualização. Enviar os arquivos ao GitHub/Netlify sozinho não altera o banco; o novo front-end deve ser publicado em coordenação com as migrations aplicadas.

## 15. Reunião ao vivo incorporada com Jitsi
A subguia **Agenda → Reunião** e o atalho **Reuniões ao vivo** no feed **Início** carregam a API IFrame pública do Jitsi (`https://meet.jit.si/external_api.js`) no navegador e incorporam a sala ao site. Esta funcionalidade não exige migration adicional no Supabase nem grava reuniões neste banco. A chamada de mídia e o nome de perfil informado são processados pelo Jitsi conforme os termos/política do serviço. O aplicativo inicia áudio e vídeo desligados, oferece um código aleatório para novas salas, permite inserir código/link de uma sala existente e copiar/abrir o convite. Os controles nativos do Jitsi incluem áudio/vídeo, compartilhamento de tela e opções de interface/efeitos quando disponíveis no navegador e no serviço.

No serviço público `meet.jit.si`, o organizador precisa autenticar com uma conta Jitsi para criar salas; os convidados podem ingressar sem conta. Todos os participantes recebem controles de moderação no serviço público, e a duração informada atualmente pelo Jitsi é limitada a 95 minutos. O link da sala funciona como convite e deve ser compartilhado apenas com participantes desejados. Para controlar moderadores, duração, identidade e infraestrutura, seria necessário implantar/hospedar uma instância Jitsi própria ou contratar outra oferta; isso não faz parte desta integração. Fontes oficiais: [Jitsi Meet Security & Privacy](https://jitsi.org/security/), [Jitsi Meet IFrame API](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/) e [Jitsi community updates](https://jitsi.org/blog/).

A publicação do front-end atualizado habilita a subguia e o atalho no feed Início; nenhum deploy, configuração de conta Jitsi, reunião ou ativação de câmera/microfone foi feita por este pacote. O typecheck e o build de produção passaram; a chamada ao vivo não foi testada com uma conta real do Jitsi. O primeiro organizador deve autenticar no serviço quando solicitado. Teste em navegador atualizado e permita câmera/microfone conscientemente; HTTPS e permissões do navegador são necessários para os dispositivos de mídia.


## 16. Atualização da navegação e da identidade do workspace (09/11/2026)
As seis áreas principais, sem aba IA, são **Início**, **Atividades**, **Agenda**, **Conversas**, **Arquivos** e **Manual de funções**. **Agenda** contém as subguias **Calendário**, **Disponibilidades** e **Reunião**. **Conversas** contém **Chat** e **Comunicados**. O feed Início apresenta as atividades e indicadores semanais e mantém atalhos para abrir o Calendário, Atividades e Reunião. Prompts institucionais e links de templates ficam no Manual de funções.

No desktop, o cabeçalho aproxima a logo da equipe das seis áreas de navegação; o texto duplicado ao lado da logo foi removido, sem remover a marca do aplicativo no rodapé. **Membros** permanece no dock inferior direito, reduzido no mobile. Em celulares, a logo fica à esquerda e o perfil à direita na faixa superior; abaixo, as seis abas ocupam colunas iguais, com ícones ampliados e sem rolagem horizontal. O menu do perfil abriga tema claro/escuro e **Sair**; logout não aparece fora dele. Os deep links abrem **Agenda → Calendário**, **Conversas → Chat** ou **Conversas → Comunicados**, preservando o item/data recebidos. A preferência individual de ocultação foi desativada na interface; a tabela e os dados antigos são preservados, sem apagar registros. Conversas que estavam ocultas só para uma pessoa voltam a aparecer na lista dessa pessoa, pois a preferência não é mais aplicada. A exclusão global e a revogação permanente são descritas na seção 19. O nome do produto exibido é **Team Celeris**. Estas mudanças preservam RLS e os dados existentes.

## 17. Relato, histórico e indicadores semanais
O acompanhamento mantém os campos antigos e passa a aceitar realizado, pendências, dificuldades, dependência de pessoa/área e próxima ação. As evidências de atividade reutilizam `activity_attachments` e o bucket privado já existente, com os mesmos tipos, tamanho e regras de acesso. Os indicadores derivam das regras atuais de atividade esperada, status semanal, `getGeneralStatus` e fluxo Scrumban; as cinco contagens podem se sobrepor porque status semanal e Kanban são dimensões diferentes.

A migration `20261108122000_weekly_update_details_history.sql` é aditiva. Ela cria uma entrada baseline do estado semanal atual e grava snapshots futuros por trigger, incluindo responsável, data, status anterior/novo, justificativa e relatos; só copia uma justificativa antiga para “pendências” quando o status corrente é **pendente**, mantendo-a sempre no campo original. A migration não abre o `audit_log` geral para usuários. A base antiga sobrescrevia versões da mesma atividade/semana e não guardava a justificativa em todas as versões, portanto o baseline só preserva o que ainda existia no registro corrente e não recupera conteúdo histórico que já foi substituído. Confira o histórico de migrations do Supabase e aplique essa migration **uma única vez** no projeto correto antes de depender dos novos campos/histórico. O código mantém status/justificativa correntes funcionando enquanto ela não estiver aplicada.


## 18. Manual revisado, Eletrônica - ELT, pastas e membros

O Manual de funções agora segue o DOCX revisado: Coordenação Geral não é exclusiva a professores; há seis áreas diretas; TI é transversal; Produtos e Redes Sociais são frentes de Marketing; e Telemetria foi consolidada dentro de **Eletrônica - ELT**. A migration final mantém os `area_id` existentes para não deslocar atividades, perfis ou históricos. Códigos antigos, inclusive prefixos TEL, são históricos e não serão renumerados; novas atividades dessa área devem usar ELT. A matriz mantém uma linha ambígua identificada no próprio Manual em vez de inferir uma competência técnica adicional.

### Sequência e aplicação

Confira no histórico do projeto Supabase e aplique **somente se ainda faltarem**, sem reaplicar nenhuma migration já concluída, na sequência desta atualização: `20261109213000_drive_folder_edit_description.sql`, depois `20261109220000_team_member_admin_presence.sql` e, por último, `20261109223000_rename_telemetry_to_electronics.sql`. Faça backup e valide primeiro no projeto de teste, especialmente porque a migration da área altera nome, slug e prefixo no registro já referenciado. Nenhuma dessas migrations deve ser enviada a um projeto diferente daquele conectado ao Netlify.

### Configurar convite por e-mail

1. No Supabase **Authentication → URL Configuration**, mantenha o Site URL na URL HTTPS da tela de login do mesmo site. Em **Redirect URLs**, autorize exatamente a URL de login terminada em `/?flow=invite` (por exemplo, `https://SEU-SITE.netlify.app/?flow=invite`, ou seu domínio próprio). Não use uma URL de retorno enviada pelo navegador nem curingas desnecessários.
2. Em **Edge Functions**, publique `supabase/functions/manage-team-members/index.ts` com **Verify JWT ligado**. Configure o secret `APP_LOGIN_URL` com somente a origem HTTPS do site, por exemplo `https://SEU-SITE.netlify.app` (sem caminho, query, usuário ou senha). A função monta internamente `/?flow=invite`, valida o token, consulta o perfil no servidor e só prossegue se o chamador estiver ativo e for Administrador. Ela usa `SUPABASE_SERVICE_ROLE_KEY` somente no runtime servidor do Supabase; não copie esse segredo para o Netlify, Vite, GitHub ou navegador.
3. Configure um **SMTP personalizado** em Supabase Auth para envio confiável a endereços da equipe. O SMTP padrão é limitado e pode não enviar a destinatários arbitrários. Revise o template de convite para manter o link seguro de confirmação do Supabase (`{{ .ConfirmationURL }}`). A Edge Function retorna somente o status, não expõe o token/link.
4. Depois de aplicar as migrations e publicar a função, faça um teste com endereço autorizado que ainda não esteja cadastrado. Um Administrador ativo abre **Membros** no dock fixo do canto inferior direito e escolhe **Convidar pessoa**; a pessoa usa o link recebido, cria a própria senha na tela de login e depois entra. Endereço já cadastrado e limite de envio retornam mensagens sem expor detalhes internos.

A administração usa RPCs seguras no banco, não um botão confiado apenas ao front-end. Um Administrador ativo pode promover outra pessoa ou **Remover o vínculo**. Não há botão de suspender acesso. A revogação define `status=removed` de forma terminal, não apaga a conta Auth nem o perfil/histórico e impede novo acesso; um Administrador não pode remover a si próprio nem o último Administrador ativo. A mudança é auditada. O ponto azul/vermelho de presença é temporário (Realtime) e não é gravado no perfil.

**Importante:** o cadastro público continua habilitado e a migration existente ativa novos cadastros como `member`. Portanto, o convite administrativo não transforma o sistema em “somente convidados”; qualquer restrição total ao cadastro público exige uma decisão e configuração separadas. Não altere o cadastro ou SMTP de produção sem validar o projeto correto.

Em **Arquivos**, integrantes ativos podem editar nome, link, área e descrição da pasta por RPC segura; RLS continua ativo e a URL não é registrada integralmente na auditoria. A descrição é opcional e limitada a 500 caracteres. O aplicativo não altera permissões nem lê o conteúdo do Google Drive.

## 19. Chat: exclusão para todos e revogação de vínculo (10/11/2026)

### Aplicação no Supabase

1. No **Supabase correto**, abra **Database → Migrations** e confira o histórico completo. Aplique **somente se ainda faltarem** e nesta ordem: primeiro `20261110100000_member_removed_enum.sql`, em uma execução própria; depois, em outra execução, `20261110101000_chat_global_delete_member_revocation.sql`. O novo valor do enum precisa estar confirmado/commitado antes de ser usado na migration seguinte. Não reaplique migrations já aplicadas. Faça backup antes de alterações em produção.
2. A segunda migration mantém RLS e evita DELETE direto por `authenticated`: as funções `chat_delete_message_for_all` e `chat_delete_conversation_for_all` só podem ser chamadas com `service_role`. O próprio banco revalida status ativo e participação em cada operação. Não desative RLS nem conceda `DELETE` geral aos usuários.
3. A migration acrescenta uma fila `team_chat_storage_cleanup_queue` com RLS ligado e sem leitura/escrita para `anon`/`authenticated`. Os caminhos vêm das mensagens/grupos no banco, nunca do corpo enviado pelo navegador. A fila é uma outbox durável e segura para retry.

### Edge Function

1. Em **Edge Functions → Deploy a new function**, crie `delete-chat-content` e cole `supabase/functions/delete-chat-content/index.ts` deste pacote.
2. Deixe **Verify JWT ligado**. Não crie segredo `VITE_*` nem copie a chave `service_role` para o código, GitHub ou Netlify. A função usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no servidor Supabase; confirme a disponibilidade dos secrets padrão na função.
3. Publique a função depois de aplicar as migrations. A função valida o token, consulta status ativo, chama as RPCs com o ID do usuário autenticado e remove exclusivamente objetos associados que foram colocados na fila. Se o Storage falhar, informa limpeza pendente e tenta de novo após outra ação ou na próxima abertura do Chat.

### Comportamento e testes

- Integrante ativo pode apagar mensagem de outra autoria na sala geral, em grupo ou DM; a confirmação é explícita e a linha/recibos são apagados para todos. A própria sala geral nunca é alvo de exclusão.
- Participante ativo pode apagar um grupo ou DM para todos. No grupo, mensagens, participantes e recibos relacionados são removidos; em DM, a cascata existente remove mensagens/recibos. Áudios e anexos privados, além da foto do grupo, passam pela fila Storage.
- Administrador ativo vê **Revogar o vínculo permanentemente** em **Membros**. Não há botão de suspensão. A operação não exclui a conta Auth, perfil, autoria ou histórico, bloqueia auto-revogação e protege o último Administrador ativo. `removed` é terminal; suspensão, quando existente em registros antigos, não é o mesmo estado.
- Teste com duas contas de integrantes ativos: mensagens apagadas desaparecem dos dois lados; DM/grupo apagado some das listas de ambos; sala geral permanece disponível. Teste também negar usuário não participante, suspenso ou removido e tentativa de exclusão direta do cliente.
- URLs assinadas que já foram emitidas podem continuar válidas até expirar; o app não promete revogação instantânea de links temporários já distribuídos.

### Publicação do site

Depois da migration e da Edge Function, envie a versão deste pacote ao GitHub conectado ao mesmo Netlify e confira `pnpm build`. O Median apenas carrega o site já publicado; não é necessário alterar a permissão de microfone/câmera nem substituir a chave OneSignal para este recurso. O código foi validado localmente; as migrations e a Edge Function não foram aplicadas/publicadas no projeto remoto por esta entrega.



## 20. Canais, diretório com DM, manuais e arquivos (10/11/2026)

O seletor de canais fica no cabeçalho. Os canais iniciais são Geral, Mecânica Naval, Elétrica, Eletrônica, Gestão de Pessoas, Marketing, Administrativo Financeiro e TI. Geral permanece sempre aberto; Administradores podem alterar a privacidade dos demais canais, inclusive depois de criados, e administrar manualmente os participantes quando privados. A criação continua restrita a Administradores.

A navegação principal apresenta Feed, Atividades, Agenda, Comunicados, Arquivos e o Manual correspondente ao canal. O Chat não aparece como guia: DMs e grupos são abertos pelo diretório **Membros**. Deep links de notificações de Chat continuam podendo abrir a conversa correspondente.

Comunicados e Manuais usam editor rico com tamanhos pequeno/médio/grande, negrito, itálico e marca-texto em cores. O Manual Administrativo-Financeiro utiliza a mesma apresentação em cartões de função dos demais canais.

Em Arquivos, são exibidas somente as pastas compartilhadas do Google Drive, com alternância entre blocos e lista. Não há opção de adicionar arquivos individuais ou atalhos nesta área.

### Migrations adicionais

Depois de conferir o histórico de migrations, aplique somente as ausentes, nesta ordem, após `20261110101000_chat_global_delete_member_revocation.sql`:

1. `20261110112000_workspace_channels.sql` — cria os canais e a estrutura de manuais.
2. `20261110113000_workspace_manual_storage.sql` — cria o bucket privado dos originais PDF/DOCX.
3. `20261110114000_workspace_channels_area_seed_fix.sql` — corrige o vínculo da área Elétrica e instala proteção dos canais fixos.
4. `20261110115000_workspace_channel_content_permissions.sql` — reforça RLS/RPCs para conteúdo por canal.
5. `20261110160000_workspace_it_privacy_and_channel_files.sql` — inclui TI, permite alterar a privacidade dos canais (Geral continua aberto), cria a tabela/bucket privados de arquivos e atalhos e habilita Realtime para esses itens (a interface atual exibe somente pastas compartilhadas do Google Drive).

A migration `20261110160000` pressupõe que a área `tecnologia-da-informacao` já existe, conforme o schema inicial. Ela não altera os dados históricos de atividades, comunicados, arquivos nem mensagens. Não reaplique migrations já executadas; confira o histórico do Supabase antes de cada execução.

### Testes antes de publicar

- Como Administrador, altere um canal aberto para privado e depois para aberto; confirme que Geral não pode ser tornado privado.
- Crie um canal privado, adicione participantes e confirme com outra conta que o canal não aparece nem permite leitura dos dados.
- Abra Membros, inicie uma DM e crie um grupo; confirme que não há guia Chat junto de Comunicados.
- Publique um comunicado usando tamanhos, negrito, itálico e marca-texto; confira a formatação na leitura.
- No Manual Administrativo-Financeiro, teste editar, cancelar e restaurar a versão-base antes de salvar.
- Em Arquivos, alterne blocos/lista, envie DOCX/XLSX/PPTX/PDF e adicione um atalho HTTPS; confira os ícones e o acesso de outra pessoa do canal.

Nenhuma migration foi aplicada remotamente nesta entrega. Faça backup e valide em ambiente de teste antes de aplicar no projeto Supabase de produção.
