# Notificações Android no Median: destino do app e do site

Para o Team Celeris, a origem pública atual é `https://teamceleris.pages.dev`. Use essa origem no secret de servidor já existente `APP_LOGIN_URL`; as três funções de push reutilizam esse secret. Não é necessário criar `APP_URL`. **Não** use uma URL de loja, esquema customizado ou endereço interno do Median nesse secret.

## O que mudou nas funções de push

As funções `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` agora enviam `web_url` com o endereço Cloudflare para notificações de navegador e preservam `data.targetUrl` para o app nativo. Não enviam `url` geral nem `app_url` para o aparelho Android. Isso evita que o launch URL genérico concorra com a navegação que o plugin Median recebe pelos dados da notificação.

No OneSignal, quando a mesma mensagem atende Web e Median, mantenha a URL Web como `https://teamceleris.pages.dev` e não configure um `APP URL` customizado que sobrescreva o destino nativo. A integração Median orienta enviar `targetUrl` em Additional Data para a navegação nativa; a API OneSignal separa `web_url` (Web) de `app_url` (mobile). [1] [2]

## Aplicar e testar

1. Em Supabase → **Edge Functions → Secrets**, defina somente `APP_LOGIN_URL` como `https://teamceleris.pages.dev` (a função de convites e as três funções de push reutilizam o mesmo secret).
2. Publique novamente as três funções listadas acima usando as versões do ZIP atualizado. Não basta salvar o secret: a função também precisa conter o payload atualizado.
3. Confirme no Median que o plugin OneSignal usa o App ID correto e que o APK instalado foi construído com esse plugin.
4. Envie uma notificação de teste para um Android inscrito. O toque deve abrir o app; a navegação deve usar o `targetUrl` HTTPS do Cloudflare, sem um esquema `intent://` ou `...://` não registrado. No Web Push, o toque deve abrir o site Cloudflare.

Se ainda aparecer “app não instalado”, verifique no OneSignal se existe um launch URL customizado em **APP URL** ou em uma campanha/template. Se o destino for `com.algumapp://...` ou `intent://...`, esse esquema precisa estar efetivamente registrado no APK; para o fluxo padrão do Median, remova essa substituição e deixe o `data.targetUrl` cuidar da navegação. A mensagem pode vir da configuração de link do OneSignal/Android, não da tela do app, então registre uma captura da notificação e do aviso para localizar qual etapa o exibe.

## Referências

[1]: https://documentation.onesignal.com/docs/en/median-integration "Integração Median no OneSignal"
[2]: https://documentation.onesignal.com/reference/push-notification "Campos de URL da API Push do OneSignal"
