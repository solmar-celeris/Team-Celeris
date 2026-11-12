# Deep links das notificações

As notificações direcionam a pessoa para o registro que as originou. O app recebe os parâmetros pela URL, escolhe a área quando necessário e destaca o item correspondente.

## Destinos implementados

- **Chat:** abre a conversa privada, de grupo ou geral a partir dos IDs `conversation_id` e `conversation_type`, e rola até `message_id`.
- **Atividade:** abre a guia Atividades no canal da área da atividade, procura a atividade por `item_id`, rola até o cartão e o destaca.
- **Comunicado:** resolve a área de público do comunicado no Supabase, abre o canal correspondente e rola até o comunicado `item_id`.
- **Calendário:** abre o Calendário na data do evento, localiza `item_id`, rola até o evento e o destaca.

A URL Web é enviada pelo campo `web_url`. O cliente web configura o OneSignal para navegar em vez de apenas focar uma aba existente e também trata o evento `click` usando a URL e os Additional Data. Isso cobre configurações de foco que poderiam deixar uma aba aberta no início do app. [3] [4]

Para o Median, o payload usa `data.targetUrl`, campo reservado que abre a URL dentro do app; não use o campo Launch URL para navegação interna. O app também registra `median_onesignal_push_opened(data)` no início da carga. Se o WebView abrir na raiz em vez de aplicar `targetUrl`, o callback reconstrói a rota usando os campos Additional Data. A navegação é idempotente para impedir um ciclo de recargas quando o Median também aplica o destino nativamente. [1] [2]

## Publicação e teste

Publique o front-end para ativar os listeners de clique Web e Median. As funções Edge desta versão já enviam `web_url` e `data.targetUrl`; só é necessário atualizá-las se a implantação atual ainda não enviar esses campos. Esta correção não exige migration. Depois, teste um push novo de cada categoria no navegador e no app Median. O build local não substitui o teste com notificações reais.

As alterações deste pacote não publicam nada no Cloudflare ou no Supabase e não mudam configurações remotas do OneSignal ou do Median.

## Referências

[1]: https://docs.median.co/docs/onesignal-notifications "Median — Sending push notifications"
[2]: https://docs.median.co/docs/handling-notifications-taps.md "Median — Handling notification taps"
[3]: https://documentation.onesignal.com/docs/en/web-sdk-reference "OneSignal — Web SDK reference"
[4]: https://documentation.onesignal.com/docs/en/web-sdk-setup "OneSignal — Web SDK setup and click behavior"
