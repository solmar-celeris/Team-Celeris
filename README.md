# SolMar Celeris · Gestão da equipe

Aplicação responsiva em português, construída com React, TypeScript e Vite. Supabase fornece autenticação e banco compartilhado; Netlify hospeda o site estático.

## Funcionalidades desta versão

- Login/cadastro por e-mail e senha; após a migration de ativação, novos cadastros ficam ativos automaticamente como Integrante. A confirmação de e-mail continua conforme a configuração já existente no Supabase.
- Navegação com ícones na ordem **Chat**, **Comunicados**, **Semana**, **Atividades** e **Arquivos**.
- Atividades e atualizações semanais ligadas ao Supabase, com filtros, permissões RLS, edição autorizada e justificativa obrigatória quando o status é Pendente.
- Arquivos: links de pastas do Google Drive, mostrados como cartões clicáveis; o app não lê o conteúdo das pastas.
- Comunicados: publicação para a equipe ou uma área, autoria automática, fixação/desafixação e remoção lógica auditada.
- Chat geral e grupos de texto em tempo real; perfis ativos criam grupos e adicionam integrantes ativos, somente participantes/Admins veem cada grupo, e somente Administradores removem mensagens.
- Configurações de perfil: editar o próprio nome e foto privada; sem foto, o cabeçalho mostra a inicial do nome.
- Avisos de atividade/semana por e-mail preparados via Edge Function, restritos ao responsável ativo e Administradores ativos; desligados por padrão até configurar o provedor.
- Push nativo OneSignal/Median preparado para Chat, comunicados e atividades atribuídas; requer migrations, duas Edge Functions e secrets configurados no Supabase, conforme o guia.
- Login e workspace usam a logo original `public/assets/celeris-logo.png`; o arquivo de imagem não foi editado nem substituído.
- Migração SQL inicial, com áreas/núcleos e 58 atividades: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Migração incremental de permissões para conteúdo compartilhado: [`supabase/migrations/20261102133000_shared_content_permissions.sql`](./supabase/migrations/20261102133000_shared_content_permissions.sql).
- Migração incremental para remoção lógica segura de comunicados via RPC, com RLS ligado: [`supabase/migrations/20261103140000_safe_remove_announcement.sql`](./supabase/migrations/20261103140000_safe_remove_announcement.sql).
- Migração incremental do chat geral em tempo real: [`supabase/migrations/20261102135200_team_chat.sql`](./supabase/migrations/20261102135200_team_chat.sql).
- Migração incremental de perfil, bucket privado e registro de avisos: [`supabase/migrations/20261102152500_profile_email_notifications.sql`](./supabase/migrations/20261102152500_profile_email_notifications.sql).
- Migração de ativação automática para novos cadastros: [`supabase/migrations/20261102160000_auto_activate_new_signups.sql`](./supabase/migrations/20261102160000_auto_activate_new_signups.sql); perfis `pending` antigos não são alterados.
- Migração de grupos/RLS/Realtime: [`supabase/migrations/20261102161000_team_chat_groups.sql`](./supabase/migrations/20261102161000_team_chat_groups.sql).
- Migrations para push do Chat e de eventos de comunicados/atribuições: `supabase/migrations/20261102210500_chat_push_notifications.sql`, `supabase/migrations/20261103103000_workspace_push_events.sql` e `supabase/migrations/20261103110000_workspace_push_event_tokens.sql`.
- Função server-side de avisos: [`supabase/functions/notify-activity/index.ts`](./supabase/functions/notify-activity/index.ts); não usa segredo no navegador.

**Permissões:** qualquer perfil ativo pode ver e gerenciar qualquer pasta/comunicado, mesmo de outra área. Todos os ativos veem a sala geral; grupos são visíveis aos participantes e Administradores. Somente Administradores ativos removem mensagens. Novos cadastros públicos passam a ficar ativos após a migration e, se a confirmação de e-mail estiver habilitada, depois de confirmarem o endereço. Por isso, qualquer pessoa que se cadastrar poderá acessar dados compartilhados. Não repita migrations; confira a ordem incremental no [manual Netlify/Supabase](./INSTRUCOES_NETLIFY_SUPABASE.md).

## Atualizar o site Netlify existente

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md) antes de enviar o código pelo GitHub. Mantenha o mesmo repositório, site e Supabase. As variáveis públicas já cadastradas não precisam ser recriadas.

## Guias

- [Usar Semana e Atividades](./docs/ETAPA_3_ATIVIDADES_SEMANA.md)
- [Configurar Arquivos e Comunicados](./docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md)
- [Usar o Chat compartilhado](./docs/ETAPA_6_CHAT.md)
- [Grupos de Chat e cadastro automático](./docs/ETAPA_8_CADASTRO_GRUPOS.md)
- [Configurar Perfil, Foto e avisos de atividade](./docs/ETAPA_7_PERFIL_EMAIL.md)
- [Ativar push OneSignal no Median — Chat, comunicados e atividades](./docs/ETAPA_10_PUSH_CHAT_ONESIGNAL.md)
- [Banco Supabase — migração inicial](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Critérios e progresso do projeto](./TODO.md)

## Desenvolvimento local

Copie `.env.example` para `.env.local` e use somente a URL e a chave publishable do Supabase que você escolheu. Não compartilhe nem envie `.env.local`. Na raiz do projeto, execute `pnpm install` e `pnpm dev`. Para build: `pnpm build`.
