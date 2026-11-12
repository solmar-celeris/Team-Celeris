# Reutilização de APP_LOGIN_URL nas notificações

As funções `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` agora obtêm a origem pública do site pelo secret `APP_LOGIN_URL`, já utilizado para links de convite. Isso elimina a necessidade de manter um segundo secret com o mesmo valor (`APP_URL`).

Configure no Supabase → **Edge Functions → Secrets**:

```text
APP_LOGIN_URL=https://teamceleris.pages.dev
```

Use apenas a origem HTTPS do site publicado, sem caminho, query ou fragmento. Após alterar o código, publique novamente as três funções. O payload OneSignal continua separando `web_url` (site Web) de `data.targetUrl` (navegação do app Median).

A alteração é apenas no código-fonte local do projeto; não altera secrets nem publica funções no Supabase.
