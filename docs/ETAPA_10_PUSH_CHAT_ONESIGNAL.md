# Push do SolMar — Chat, comunicados e atividades (OneSignal + Median + Supabase)

## O que vai acontecer

Quando uma mensagem for salva no Chat do SolMar, o site chama a Edge Function `notify-chat-push` no Supabase. A função identifica quem escreveu e consulta no banco quem pode receber: na sala **Equipe**, os perfis ativos, menos o autor; em um grupo, somente integrantes ativos, também menos o autor. O título do push identifica o remetente. O texto da mensagem não é incluído na notificação.

O OneSignal External ID usado é o UUID da conta Supabase (`user.id`), nunca o e-mail. O código do site chama o bridge `median.onesignal.login(...)` após a sessão ativa e `median.onesignal.logout()` quando a pessoa sai. Isso associa cada telefone à conta certa; notificações só chegam em aparelhos com o plugin OneSignal do Median, inscrição/permissão ativa e identidade associada.

Não é necessário criar Database Webhook. A função só é chamada depois que o app confirma que a mensagem foi gravada. Se o push falhar, a mensagem permanece no Chat. Push do Chat é separado dos avisos de e-mail.

## Passo a passo para ativar

1. **Aplique a migration de log** no mesmo Supabase: abra `supabase/migrations/20261102210500_chat_push_notifications.sql`, copie o arquivo inteiro para **SQL Editor → New query** e clique em **Run**. Faça isso uma única vez. Se já foi aplicada, pule.

2. **Cadastre as duas chaves na tela que você mostrou** (Supabase → Edge Functions → Secrets). Clique nos campos e adicione:

   | Name | Value |
   | --- | --- |
   | `ONESIGNAL_APP_ID` | O App ID do app SolMar no OneSignal, em **Settings → Keys & IDs**. |
   | `ONESIGNAL_REST_API_KEY` | A **App API Key** criada dentro do mesmo app OneSignal. É privada: cole o valor somente no campo Value do Supabase. |

   Use **Add another** para criar a segunda linha e depois **Save**. No painel atual, **Add Key** cria uma **App API Key** para o app; se pedir o tipo, escolha a opção de uso por servidor (*Backend service*), não uma chave da organização. Copie o valor quando for exibido: ele começa com `os_v2_app_` e aparece uma única vez. **Não** use o `Key ID` da lista, nem o JSON do Firebase, `google-services.json`, chave de service account Firebase, App ID do Median ou chave publishable do Supabase. O runtime do Supabase fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` à Edge Function; você não precisa cadastrá-las.

3. **Implante a função `notify-chat-push`** no Supabase → **Edge Functions**. Crie uma função com esse nome, abra o arquivo `supabase/functions/notify-chat-push/index.ts` deste pacote, copie o conteúdo integral para o editor do Dashboard e publique. Mantenha **Verify JWT** ligado: o app chama a função com a sessão Supabase da pessoa que enviou a mensagem.

4. **Atualize o código do site pelo GitHub** para o Netlify publicar. A atualização chama o bridge Median para associar/desassociar o usuário e invoca a função depois de cada envio de mensagem. Mantenha a instalação atual do OneSignal no Median apontando para o mesmo app OneSignal. Se esse APK já foi construído com o plugin OneSignal, em princípio basta atualizar o site; se o plugin foi adicionado depois da última compilação, gere um novo APK no Median.

5. **Teste com dois aparelhos/contas**: em ambos, abra o APK, entre com a conta Supabase e permita notificações. Envie uma mensagem com a primeira conta. A outra conta ativa inscrita deve receber; a pessoa que enviou não. Para um grupo, somente os integrantes ativos devem receber. Uma pessoa fora do grupo não deve receber push daquele grupo.

## Se não chegar

- Confirme em OneSignal que o aparelho está inscrito e com permissão de notificação ativa no Android.
- Confirme que o APK instalado inclui o plugin OneSignal configurado com o mesmo OneSignal App ID, e que a atualização do site foi publicada.
- Em Supabase → **Edge Functions**, verifique se `notify-chat-push` foi implantada e mantenha **Verify JWT** ligado. Consulte os logs da função após enviar uma mensagem.
- Confira os nomes dos secrets, caractere por caractere: `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY`. A REST API Key é diferente do JSON do Firebase.
- A conta destinatária precisa ter entrado no SolMar dentro do APK e permitido os pushes; o UUID de Supabase é vinculado ao OneSignal automaticamente no login.

A função não persiste o texto do Chat no log do push e não envia mensagens para a pessoa autora. Nenhuma chave privada deve ser colocada em `.env`, em variável `VITE_*`, no código, no ZIP, no GitHub ou enviada nesta conversa.

## Comunicados e atividades atribuídas

Esses avisos usam o **mesmo aplicativo OneSignal e os mesmos secrets** acima. Não crie outro app nem outra API key. Se você já salvou `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY` na tela do Supabase, deixe-os como estão.

- **Comunicado novo:** contas ativas do público do comunicado recebem um push genérico: se foi direcionado a uma área, somente pessoas ativas daquela área; se foi direcionado à equipe toda, todas as pessoas ativas. Quem publicou não recebe. Fixar, remover ou apenas ler um comunicado não dispara push.
- **Nova atribuição/reatribuição:** a nova pessoa responsável ativa recebe um push genérico. Quem fez a alteração e a pessoa responsável anterior não recebem. Mudar status semanal, notas ou datas sem trocar o responsável não dispara push.
- O push não inclui o texto do comunicado, descrição, observações ou mensagem da atividade. O evento é criado pelo banco após o salvamento e a função verifica o usuário autenticado; a tela do site nunca escolhe os destinatários.

Para ativar esses dois eventos:

1. Aplique uma única vez `supabase/migrations/20261103103000_workspace_push_events.sql` no SQL Editor do mesmo projeto Supabase. Se já aplicou, pule.
2. Em seguida, aplique uma única vez `supabase/migrations/20261103110000_workspace_push_event_tokens.sql`. Essa segunda migration adiciona o token transacional que liga a gravação ao evento sem confiar em um ID enviado livremente pelo navegador.
3. No Dashboard → **Edge Functions**, crie `notify-workspace-push`, copie `supabase/functions/notify-workspace-push/index.ts` e publique com **Verify JWT** ligado. Não substitua nem desative a função `notify-chat-push`; ela atende o Chat.
4. Confirme na tela **Edge Functions → Secrets** que existem `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY`. Não é preciso adicionar outras chaves para os novos eventos. O valor privado é a App API Key do app OneSignal, nunca o Key ID nem o JSON do Firebase.
5. Atualize o código do site pelo GitHub para o Netlify publicar. Não é necessário mudar o APK se ele já estiver com o mesmo plugin/app OneSignal do Median.
6. Teste com uma conta ativa autora e uma conta destinatária: publique um comunicado de teste, depois atribua uma atividade de teste. O autor não recebe o próprio push; a atribuição avisa a nova pessoa responsável, não a antiga. Confira logs de `notify-workspace-push` no Supabase e o histórico do OneSignal.

Se a migration não existir ou a função não estiver publicada, a gravação do site continua funcionando e o push pode falhar; confira o log da Edge Function. **Não** configure Database Webhook, não crie uma segunda app OneSignal e não compartilhe a App API Key.


## Referências oficiais

- [Median — OneSignal plugin](https://docs.median.co/docs/onesignal)
- [Median — identificar e direcionar usuários](https://docs.median.co/docs/identifying-targeting-users)
- [OneSignal — Keys & IDs e App API Keys](https://documentation.onesignal.com/docs/en/keys-and-ids)
- [OneSignal — Create Message API](https://documentation.onesignal.com/reference/create-message)
- [Supabase — Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase — autenticação em Edge Functions](https://supabase.com/docs/guides/functions/auth)


## Notificação no atalho do site (Web Push)

O projeto agora inclui o SDK Web v16 do OneSignal, a associação do navegador ao mesmo UUID Supabase da conta autenticada e o worker isolado em `public/push/onesignal/OneSignalSDKWorker.js`. A permissão só é solicitada depois que a pessoa clica em **Ativar neste navegador** nas configurações do perfil. O app móvel continua usando a ponte nativa do Median.

Para habilitar no site publicado:

1. No Cloudflare Pages, configure o build command `pnpm build`, diretório de saída `dist`, Node.js `22` e as variáveis de build públicas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_ONESIGNAL_APP_ID`. Não use a REST API Key nessas variáveis.
2. No mesmo app OneSignal que atende o APK, confirme que a plataforma **Web Push** tem como Site URL a origem HTTPS exata do Cloudflare que a equipe usa (domínio próprio ou `*.pages.dev`) e que o canal push está habilitado. As inscrições Web Push são vinculadas à origem; cada navegador precisa abrir a origem Cloudflare e ativar o push outra vez. Permissões/inscrições da origem antiga Netlify não migram automaticamente.
3. No Supabase → **Edge Functions → Secrets**, defina `APP_URL` com somente a origem pública Cloudflare (por exemplo `https://seu-projeto.pages.dev`, sem caminho, query ou fragmento). Atualize também `APP_LOGIN_URL` para essa origem se convites ainda a usarem. Publique novamente `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` após definir `APP_URL`; os links das notificações passam a abrir o site Cloudflare.
4. Depois do deploy Cloudflare, confira se `<origem-cloudflare>/push/onesignal/OneSignalSDKWorker.js` mostra `importScripts(...)` em vez da página HTML do app. A resposta de `/` e `/index.html` deve apontar para o bundle mais recente; este pacote publica regras para revalidar HTML, manifest e workers, mantendo os bundles com hash em cache imutável.
5. Cada pessoa deve abrir a origem Cloudflare em um navegador, entrar na conta, abrir o menu do perfil e clicar em **Ativar neste navegador**. A inscrição e a permissão são específicas daquele navegador e domínio. Se a permissão já tiver sido bloqueada, libere-a nas configurações do navegador.

O Web Push precisa de HTTPS e de acesso público ao service worker. A chave do app pode ser usada pelo SDK no navegador; nenhuma chave REST ou service role deve ser colocada em variável `VITE_*`. Como o site e o APK podem compartilhar o mesmo usuário OneSignal, uma pessoa inscrita nos dois canais pode receber nos dois. Teste com uma conta de desktop e confira duplicatas se o mesmo computador também tiver o APK instalado. Se um atalho/PWA mobile continuar exibindo o site antigo, abra o domínio Cloudflare diretamente e remova/reinstale o atalho; se for o APK Median, a URL carregada é configurada no projeto nativo e pode exigir atualização do APK.

Referências Web Push: [OneSignal — configuração Web Push](https://documentation.onesignal.com/docs/en/web-push-setup), [OneSignal — integração Custom Code](https://documentation.onesignal.com/docs/en/web-push-custom-code-setup), [OneSignal — service worker](https://documentation.onesignal.com/docs/en/onesignal-service-worker), [OneSignal — usuários e External IDs](https://documentation.onesignal.com/docs/en/users), [Median — plugin OneSignal nativo](https://docs.median.co/docs/onesignal).
