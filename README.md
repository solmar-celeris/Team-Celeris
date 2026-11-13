# Team Celeris · Gestão da equipe

Aplicação responsiva em português, construída com React, TypeScript e Vite. Supabase fornece autenticação e banco compartilhado; Netlify hospeda o site estático.

## Funcionalidades desta versão

- Login/cadastro por e-mail e senha; após a migration de ativação, novos cadastros ficam ativos automaticamente como Integrante. A confirmação de e-mail continua conforme a configuração já existente no Supabase.
- Navegação principal: **Início**, **Atividades**, **Agenda**, **Conversas**, **Arquivos** e **Documentação**. O Chat é aberto pelo diretório **Membros**, sem guia própria na navegação principal. O feed Início mostra as atividades da semana e indicadores, além de atalhos para Agenda e reunião ao vivo. Em celulares, logo e perfil ficam alinhados na faixa superior, com as seis áreas distribuídas em uma linha abaixo.
- Os deep links abrem a área adequada: calendário → Agenda/Calendário; chat → conversa correspondente; comunicado → Comunicados. Prompts e templates institucionais ficam na Documentação, na seção Manuais de Funções; não há aba IA.
- Atividades e atualizações semanais ligadas ao Supabase, com filtros, permissões RLS, edição autorizada e justificativa obrigatória quando o status é Pendente.
- Arquivos: links de pastas do Google Drive, mostrados como cartões clicáveis; o app não lê o conteúdo das pastas.
- Comunicados: disponíveis na subguia **Conversas → Comunicados**, com publicação global para toda a equipe e autoria automática, fixação/desafixação e remoção lógica auditada.
- Chat geral, conversas privadas e grupos em tempo real; perfis ativos criam grupos e adicionam integrantes. Qualquer participante ativo pode apagar mensagens para todos em sala geral, grupos e DMs; participantes também podem apagar grupos/DMs para todos, com anexos em bucket privado e limpeza pendente/retry. A interface não oferece ocultação individual nem botão de suspensão.
- Diretório da equipe em um dock fixo no canto inferior direito: presença online/offline temporária e, para Administradores, promoção, revogação permanente do vínculo e convites por e-mail. Revogar mantém conta Auth, perfil e histórico, mas bloqueia o acesso; convites dependem da Edge Function, redirect URL e SMTP no Supabase.
- Perfil no cabeçalho: no desktop exibe “Eu” com foto/iniciais; no mobile fica somente o avatar. O menu contém tema claro/escuro e **Sair**; a ação Sair não aparece fora dele. O perfil permite editar nome e foto privada.
- Avisos de atividade/semana por e-mail preparados via Edge Function, restritos ao responsável ativo e Administradores ativos; desligados por padrão até configurar o provedor.
- Push OneSignal/Median para Chat, comunicados e atividades atribuídas, com suporte Web Push para navegador desktop mediante `VITE_ONESIGNAL_APP_ID`, inscrição consentida no menu do perfil e service worker em escopo isolado.
- Login e workspace usam a logo original `public/assets/celeris-logo.png`; o arquivo de imagem não foi editado nem substituído.
- Migração SQL inicial, com áreas/núcleos e 58 atividades: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Migração incremental de permissões para conteúdo compartilhado: [`supabase/migrations/20261102133000_shared_content_permissions.sql`](./supabase/migrations/20261102133000_shared_content_permissions.sql).
- Migração incremental para remoção lógica segura de comunicados via RPC, com RLS ligado: [`supabase/migrations/20261103140000_safe_remove_announcement.sql`](./supabase/migrations/20261103140000_safe_remove_announcement.sql).
- Migração incremental para remoção lógica de atividades por Administradores e Líderes da área, preservando histórico semanal: [`supabase/migrations/20261103150000_safe_remove_activity.sql`](./supabase/migrations/20261103150000_safe_remove_activity.sql).
- Migração incremental do chat geral em tempo real: [`supabase/migrations/20261102135200_team_chat.sql`](./supabase/migrations/20261102135200_team_chat.sql).
- Migração incremental de perfil, bucket privado e registro de avisos: [`supabase/migrations/20261102152500_profile_email_notifications.sql`](./supabase/migrations/20261102152500_profile_email_notifications.sql).
- Migração de ativação automática para novos cadastros: [`supabase/migrations/20261102160000_auto_activate_new_signups.sql`](./supabase/migrations/20261102160000_auto_activate_new_signups.sql); perfis `pending` antigos não são alterados.
- Migração de grupos/RLS/Realtime: [`supabase/migrations/20261102161000_team_chat_groups.sql`](./supabase/migrations/20261102161000_team_chat_groups.sql).
- Migrations para push do Chat e de eventos de comunicados/atribuições: `supabase/migrations/20261102210500_chat_push_notifications.sql`, `supabase/migrations/20261103103000_workspace_push_events.sql` e `supabase/migrations/20261103110000_workspace_push_event_tokens.sql`.
- Migration histórica para preferências de ocultação individual: `20261109231000_team_chat_user_hidden_conversations.sql`. A nova interface não consulta essa tabela; não apague seus registros.
- Migrations incrementais para revogação de vínculo e exclusão global do Chat: `20261110100000_member_removed_enum.sql` e `20261110101000_chat_global_delete_member_revocation.sql`. Aplique somente se ainda faltarem no histórico Supabase.
- Edge Function autenticada para exclusão e retry de arquivos privados: [`supabase/functions/delete-chat-content/index.ts`](./supabase/functions/delete-chat-content/index.ts); publicar com Verify JWT ligado.
- Função server-side de avisos: [`supabase/functions/notify-activity/index.ts`](./supabase/functions/notify-activity/index.ts); não usa segredo no navegador.

**Permissões:** qualquer perfil ativo pode ver e gerenciar qualquer pasta/comunicado, mesmo de outra área. Todos os ativos veem a sala geral; grupos são visíveis aos participantes e Administradores, mas somente participantes ativos podem excluir grupo/DM para todos. Qualquer perfil ativo pode apagar mensagens nas conversas em que participa. Somente Administradores ativos podem revogar vínculo; a conta Auth e o histórico não são excluídos. Novos cadastros públicos passam a ficar ativos após a migration e, se a confirmação de e-mail estiver habilitada, depois de confirmarem o endereço. Por isso, qualquer pessoa que se cadastrar poderá acessar dados compartilhados. Não repita migrations; confira a ordem incremental no [manual Netlify/Supabase](./INSTRUCOES_NETLIFY_SUPABASE.md).

## Atualizar o site Netlify existente

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md) antes de enviar o código pelo GitHub. Mantenha o mesmo repositório, site e Supabase. As variáveis públicas já cadastradas não precisam ser recriadas.

## Guias

- [Usar Semana e Atividades](./docs/ETAPA_3_ATIVIDADES_SEMANA.md)
- [Configurar Arquivos e Comunicados](./docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md)
- [Usar o Chat compartilhado](./docs/ETAPA_6_CHAT.md)
- [Grupos de Chat e cadastro automático](./docs/ETAPA_8_CADASTRO_GRUPOS.md)
- [Configurar Perfil, Foto e avisos de atividade](./docs/ETAPA_7_PERFIL_EMAIL.md)
- [Ativar push OneSignal no Median — Chat, comunicados e atividades](./docs/ETAPA_10_PUSH_CHAT_ONESIGNAL.md)
- [Respostas e reações nos comunicados](./docs/ETAPA_11_COMUNICADOS_INTERACOES.md)
- [Deploy do canal único e documentação centralizada](./docs/DEPLOY_CANAL_UNICO.md)
- [Banco Supabase — migração inicial](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Critérios e progresso do projeto](./TODO.md)

## Desenvolvimento local

Copie `.env.example` para `.env.local` e configure a URL e chave publishable do Supabase. Para Web Push desktop, defina também `VITE_ONESIGNAL_APP_ID` como o App ID público do app OneSignal já usado pelo projeto. Não coloque REST API Key ou service role em variáveis `VITE_*` e não compartilhe nem envie `.env.local`. Na raiz do projeto, execute `pnpm install` e `pnpm dev`. Para build: `pnpm build`.


## Visual Studio e função Desenvolvedor

A implementação do editor visual, função `developer`, migrations e Edge Functions está documentada em [`supabase/VISUAL_STUDIO_DEPLOY.md`](supabase/VISUAL_STUDIO_DEPLOY.md). A migration incremental é `20261113090000_visual_studio_developer_role.sql`.


## Canal único e documentação centralizada

- O workspace utiliza somente o canal Geral. O seletor e a criação de canais foram removidos da interface.
- A migration `20261113120000_single_general_channel_and_central_documentation.sql` consolida arquivos e textos de manuais no canal Geral, arquiva registros antigos e bloqueia a criação de canais adicionais.
- A navegação `Documentação` reúne `Normas de Conduta` e `Manuais de Funções`; todos os manuais de áreas ficam disponíveis em uma única página.


## Canal único e documentação centralizada

- O workspace utiliza somente o canal Geral. O seletor e a criação de canais foram removidos da interface.
- A migration `20261113120000_single_general_channel_and_central_documentation.sql` consolida arquivos e textos de manuais no canal Geral, arquiva registros antigos e bloqueia a criação de canais adicionais.
- A navegação `Documentação` reúne `Normas de Conduta` e `Manuais de Funções`; todos os manuais de áreas ficam disponíveis em uma única página.
