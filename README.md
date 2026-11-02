# SolMar Celeris · Gestão da equipe

Aplicação responsiva em português, construída com React, TypeScript e Vite. Supabase fornece autenticação e banco compartilhado; Netlify hospeda o site estático.

## Funcionalidades desta versão

- Login, cadastro com perfil pendente até aprovação e recuperação de senha.
- Após o login de perfil ativo, abas **Semana**, **Atividades**, **Arquivos**, **Comunicados** e **Chat**.
- Atividades e atualizações semanais ligadas ao Supabase, com filtros, permissões RLS, edição autorizada e justificativa obrigatória quando o status é Pendente.
- Arquivos: links de pastas do Google Drive, mostrados como cartões clicáveis; o app não lê o conteúdo das pastas.
- Comunicados: publicação para a equipe ou uma área, autoria automática, fixação/desafixação e remoção lógica auditada.
- Chat coletivo de texto com entrega em tempo real, autor/horário automáticos e remoção exclusiva por Administrador.
- Configurações de perfil: editar o próprio nome e foto privada; sem foto, o cabeçalho mostra a inicial do nome.
- Avisos de atividade/semana por e-mail preparados via Edge Function, restritos ao responsável ativo e Administradores ativos; desligados por padrão até configurar o provedor.
- Login e workspace usam a logo original `public/assets/celeris-logo.png`; o arquivo de imagem não foi editado nem substituído.
- Migração SQL inicial, com áreas/núcleos e 58 atividades: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Migração incremental de permissões para conteúdo compartilhado: [`supabase/migrations/20261102133000_shared_content_permissions.sql`](./supabase/migrations/20261102133000_shared_content_permissions.sql).
- Migração incremental do chat em tempo real: [`supabase/migrations/20261102135200_team_chat.sql`](./supabase/migrations/20261102135200_team_chat.sql).
- Migração incremental de perfil, bucket privado e registro de avisos: [`supabase/migrations/20261102152500_profile_email_notifications.sql`](./supabase/migrations/20261102152500_profile_email_notifications.sql).
- Função server-side de avisos: [`supabase/functions/notify-activity/index.ts`](./supabase/functions/notify-activity/index.ts); não requer e não usa segredo no navegador.

**Permissões:** qualquer perfil ativo pode ver e gerenciar qualquer pasta/comunicado, mesmo de outra área. No Chat, todos os ativos leem e enviam; somente Administradores ativos removem mensagens. Visitantes e perfis `pending`/`suspended` seguem bloqueados. Não repita a migração inicial; confira a ordem incremental no [manual Netlify/Supabase](./INSTRUCOES_NETLIFY_SUPABASE.md).

## Atualizar o site Netlify existente

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md) antes de enviar o código pelo GitHub. Mantenha o mesmo repositório, site e Supabase. As variáveis públicas já cadastradas não precisam ser recriadas.

## Guias

- [Usar Semana e Atividades](./docs/ETAPA_3_ATIVIDADES_SEMANA.md)
- [Configurar Arquivos e Comunicados](./docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md)
- [Usar o Chat compartilhado](./docs/ETAPA_6_CHAT.md)
- [Configurar Perfil, Foto e avisos de atividade](./docs/ETAPA_7_PERFIL_EMAIL.md)
- [Banco Supabase — migração inicial](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Critérios e progresso do projeto](./TODO.md)

## Desenvolvimento local

Copie `.env.example` para `.env.local` e use somente a URL e a chave publishable do Supabase que você escolheu. Não compartilhe nem envie `.env.local`. Na raiz do projeto, execute `pnpm install` e `pnpm dev`. Para build: `pnpm build`.
