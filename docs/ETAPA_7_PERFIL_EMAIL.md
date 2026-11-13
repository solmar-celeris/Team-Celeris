# Etapa 7 — Perfil, foto e avisos de atividade

**Revisado em 02/11/2026.** Este guia acompanha o projeto existente SolMar Celeris. Ele não executa SQL, não publica a Edge Function e não configura um provedor externo.

## Perfil e foto

O menu no cabeçalho usa a conta Supabase já autenticada e permite alterar somente o próprio nome exibido e a própria foto. E-mail, papel, área, status e perfis de outras pessoas não são editáveis por ali. Sem imagem, o cabeçalho mostra a inicial do nome.

A foto aceita JPEG, PNG ou WebP até 2 MiB. O arquivo fica em um bucket privado `solmar-profile-photos`, dentro da pasta do próprio usuário; o perfil guarda apenas `avatar_path`. Downloads são autorizados por RLS para integrantes ativos. A opção **Remover foto** apaga a referência e, quando possível, o objeto antigo.

1. No Supabase conectado ao site Netlify, abra **SQL Editor → New query**.
2. Se ainda não executou o arquivo `supabase/migrations/20261102152500_profile_email_notifications.sql`, copie o conteúdo integral e execute uma vez. Ele acrescenta a coluna e as policies do perfil, configura o bucket privado e cria o log mínimo de notificação. Se já executou, não rode novamente.
3. Publique a versão do site que inclui `ProfileMenu.tsx`, entre com uma conta ativa e use o botão com nome/inicial no canto superior. Edite o nome ou selecione uma foto e salve.
4. Para conferir atribuições, abra uma tarefa ligada a uma conta ativa: o nome exibido do responsável acompanha o nome atual do perfil. A atribuição continua ligada por `responsible_user_id`, não por uma lista duplicada.

Se o menu indicar que a migration está pendente, os campos continuam desabilitados intencionalmente; confirme que está no mesmo projeto Supabase do site e que o SQL terminou sem erro.

## Ordem das migrations

A migration inicial `20261101184000_initial_schema.sql` não deve ser executada novamente. Para mudanças incrementais, aplique cada arquivo ainda pendente uma única vez, nesta ordem:

1. `20261102133000_shared_content_permissions.sql` — se Arquivos/Comunicados ainda não foram habilitados.
2. `20261102135200_team_chat.sql` — se Chat ainda não foi habilitado.
3. `20261102152500_profile_email_notifications.sql` — para perfil/foto/notificações.

As migrations ficam em `supabase/migrations/`. Uma migration já executada deve ser pulada, não repetida por tentativa.

## E-mail: desligado até você configurar um provedor

O envio é opcional e permanece **desligado por padrão**. O `.env.example` define `VITE_ACTIVITY_EMAILS_ENABLED=false`. Enquanto estiver em `false`, o navegador não invoca a função. Perfil, atividades, Chat e demais abas continuam funcionando sem e-mail.

Quando estiver pronto para habilitar:

1. Crie uma conta no Resend, adicione um domínio que a equipe controla, publique os registros DNS pedidos pelo Resend e aguarde a verificação. O endereço `from` deve pertencer a esse domínio.
2. No Dashboard do Supabase, crie (ou atualize) a Edge Function chamada exatamente `notify-activity`, usando `supabase/functions/notify-activity/index.ts`, e faça o deploy. **Mantenha a verificação JWT ligada.** A função valida a sessão e o perfil ativo antes de acessar os registros.
3. Em **Edge Functions → Secrets**, salve `RESEND_API_KEY` e `RESEND_FROM_EMAIL`. A chave do Resend nunca deve ser colocada em `VITE_*`, no Netlify, no GitHub, em `.env` versionado ou em mensagens. A chave de serviço do Supabase também permanece somente no lado servidor; não a copie para a função à mão se o Dashboard já fornece os valores `SUPABASE_*`.
4. Só depois de confirmar a migration, o deploy da função e os secrets, adicione no Netlify `VITE_ACTIVITY_EMAILS_ENABLED=true` como variável de texto simples, com escopo **Builds**, e publique um novo deploy do mesmo site. A flag é pública e controla a compilação; não é uma chave secreta. Para desligar, retorne para `false` e faça novo deploy.

A função envia avisos somente depois de gravações feitas pelo site: para o responsável atualmente vinculado, se a conta estiver ativa, e para Administradores ativos; exclui quem fez a alteração. Sem responsável ativo, ficam somente os Administradores. O e-mail informa a atividade e o novo status, mas não inclui descrição, observações ou justificativa.

Não é enviado e-mail por mensagem do Chat, foto/nome do perfil, pasta do Drive ou comunicado. O Chat permanece em tempo real dentro do site. Alterações diretas feitas no SQL Editor não disparam esta função.

## Teste responsável e limites

Depois de habilitar o Resend, teste com uma atividade de teste e contas ativas que possam receber a mensagem. Uma alteração real pode mandar e-mail imediatamente; o banco Supabase conectado é o mesmo usado pelo site e não há ambiente de teste separado configurado neste pacote. O helper mostra um aviso se a gravação foi concluída mas o envio falhou; a gravação não é desfeita por falha de e-mail.

As fotos e o histórico de notificações seguem RLS. O log guarda tabela/ID do evento, ator, estado, contagem de destinatários e timestamp para deduplicação; não guarda endereços de destinatários nem o corpo completo do e-mail.

## Arquivos relacionados

- Migration: `supabase/migrations/20261102152500_profile_email_notifications.sql`
- Função: `supabase/functions/notify-activity/index.ts`
- Chamada do cliente: `src/lib/notifications.ts`
- Menu: `src/features/profile/ProfileMenu.tsx`
- Instruções completas de atualização: `INSTRUCOES_NETLIFY_SUPABASE.md`
- Fontes oficiais consultadas: `docs/REFERENCIAS_TECNICAS_ETAPA_7.md`
