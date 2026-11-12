# Publicar no Cloudflare Pages e corrigir links de notificação

## Cloudflare Pages

Use o mesmo repositório do projeto. Configure a raiz como `.` (ou a pasta do app, se estiver em monorepo), o comando de build como `pnpm build`, o diretório de saída como `dist` e o Node.js como `22`. No ambiente de build, mantenha `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_ONESIGNAL_APP_ID`; essas variáveis são destinadas ao navegador e não devem conter chaves privadas. O pacote inclui `public/_headers`, `public/_redirects` e `.node-version` para o site estático e cache de HTML/workers. [1] [2]

Depois do deploy, teste no domínio HTTPS que a equipe realmente usa:

- `/` deve carregar o app atualizado;
- `/push/onesignal/OneSignalSDKWorker.js` deve responder JavaScript com `importScripts(...)`, não `index.html`;
- `/manifest.json` deve mostrar o manifesto do Team Celeris.

O HTML, manifesto e workers são revalidados; assets versionados de `/assets/` podem ficar em cache porque seus nomes têm hash. As regras `_headers` são publicadas dentro dos arquivos estáticos. [1]

## Destinos dos pushes e convites

As três funções OneSignal que abrem o Chat, atividades/comunicados e calendário não apontam mais ao domínio Netlify. Antes de republicá-las, em Supabase → **Edge Functions → Secrets**, configure `APP_URL` com a origem Cloudflare exata, por exemplo `https://seu-projeto.pages.dev` ou o domínio próprio do projeto. Informe somente esquema e domínio — sem caminho, query ou fragmento. Atualize `APP_LOGIN_URL` para a mesma origem se a função de convites estiver habilitada. Depois publique novamente `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` para que as funções recebam a variável.

O código agora falha de forma segura se `APP_URL` estiver ausente/inválida, em vez de enviar novas notificações com links antigos.

## OneSignal Web Push e origem antiga

No painel OneSignal, a configuração da plataforma **Web Push** precisa usar a mesma origem Cloudflare HTTPS, e o service worker precisa ser servido nessa origem. Browser Web Push associa inscrições à origem; uma inscrição criada para o domínio Netlify não pode ser transferida para um domínio Cloudflare diferente. Abra o endereço Cloudflare no navegador de cada pessoa e ative novamente a notificação. [3]

Se a notificação chega, mas tocar nela ainda abre Netlify, publique novamente as três Edge Functions acima e confirme `APP_URL`. Se o ícone/origem da notificação continua sendo o endereço antigo, atualize o Site URL da plataforma Web Push no OneSignal e faça nova inscrição no Cloudflare. Para iPhone/iPad, o usuário pode precisar remover e adicionar o atalho à Tela de Início da origem nova.

## Se o mobile continuar com o layout anterior

Primeiro abra o domínio Cloudflare diretamente no Chrome/Safari, sem usar favorito ou atalho antigo, e recarregue a página. O pacote revalida o HTML e o CSS/JS têm nomes com hash. Se o atalho instalado ainda abrir o Netlify, remova esse atalho/PWA e crie outro a partir do domínio Cloudflare. Se o mobile estiver dentro do APK Median, confira no projeto nativo do Median qual URL o WebView carrega; atualizar o site Cloudflare sozinho não troca automaticamente um endereço Netlify configurado no app nativo.

Se o site direto no domínio Cloudflare ainda exibir o compositor antigo após este deploy, confira em Network/DevTools se o HTML referencia os novos assets `index-*.css` e `index-*.js`, e se a largura mobile aplica os seletores `.team-chat-composer-bar`. Faça purge do cache do Cloudflare somente depois de verificar que o deploy mais recente está ativo.

## Referências

[1]: https://developers.cloudflare.com/pages/configuration/headers/ "Cloudflare Pages headers"
[2]: https://developers.cloudflare.com/pages/configuration/build-configuration/ "Cloudflare Pages build configuration"
[3]: https://documentation.onesignal.com/docs/en/web-push-setup-faq "OneSignal Web Push FAQ e mudança de domínio"
