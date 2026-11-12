# Deep links das notificações

As notificações direcionam a pessoa para o registro que as originou. O app recebe os parâmetros pela URL, escolhe a área quando necessário e destaca o item correspondente.

## Destinos implementados

- **Chat:** abre a conversa privada, de grupo ou geral a partir dos IDs `conversation_id` e `conversation_type`, e rola até `message_id`.
- **Atividade:** abre a guia Atividades no canal da área da atividade, procura a atividade por `item_id`, rola até o cartão e o destaca.
- **Comunicado:** resolve a área de público do comunicado no Supabase, abre o canal correspondente e rola até o comunicado `item_id`.
- **Calendário:** abre o Calendário na data do evento, localiza `item_id`, rola até o evento e o destaca.

A URL Web é enviada pelo campo `web_url`. Para o Median, o payload usa `data.targetUrl`, campo reservado que abre a URL dentro do app; não use o campo Launch URL para navegação interna. [1] [2]

## Publicação e teste

O código-fonte altera a navegação do site e o payload das Edge Functions. Publique o site e as funções `notify-chat-push`, `notify-workspace-push` e `notify-calendar-event-push` para que os novos deep links entrem em produção. Depois, teste um push real de cada categoria, tocando nele com o site e com o app Median. O teste local de build não substitui esse teste em dispositivos e contas ativos.

As alterações deste pacote não publicam nada no Cloudflare ou no Supabase e não mudam configurações remotas do OneSignal ou do Median.

## Referências

[1]: https://docs.median.co/docs/onesignal-notifications "Median — Sending push notifications"
[2]: https://docs.median.co/docs/handling-notifications-taps.md "Median — Handling notification taps"
