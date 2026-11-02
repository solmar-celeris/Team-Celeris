# SolMar Celeris · Gestão da equipe

Aplicação responsiva em português, construída com React, TypeScript e Vite. Supabase fornece autenticação e banco compartilhado; Netlify hospeda o site estático.

## Funcionalidades desta versão

- Login, cadastro com perfil pendente até aprovação e recuperação de senha.
- Após o login de perfil ativo, abas **Semana**, **Atividades**, **Arquivos** e **Comunicados**.
- Atividades e atualizações semanais ligadas ao Supabase, com filtros, permissões RLS, edição autorizada e justificativa obrigatória quando o status é Pendente.
- Arquivos: links de pastas do Google Drive, mostrados como cartões clicáveis; o app não lê o conteúdo das pastas.
- Comunicados: publicação para a equipe ou uma área, autoria automática, fixação/desafixação e remoção lógica auditada.
- Migração SQL inicial, com áreas/núcleos e 58 atividades: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Migração incremental de permissões para conteúdo compartilhado: [`supabase/migrations/20261102133000_shared_content_permissions.sql`](./supabase/migrations/20261102133000_shared_content_permissions.sql).

**Permissões de Arquivos/Comunicados escolhidas pelo usuário:** qualquer perfil ativo pode ver e gerenciar qualquer pasta/comunicado, mesmo de outra área. Visitantes e perfis `pending`/`suspended` seguem bloqueados. A migração inicial não deve ser repetida; aplique a migração incremental descrita no [guia da Etapa 5](./docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md) para liberar gravação.

## Atualizar o site Netlify existente

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md) antes de enviar o código pelo GitHub. Mantenha o mesmo repositório, site e Supabase. As variáveis públicas já cadastradas não precisam ser recriadas.

## Guias

- [Usar Semana e Atividades](./docs/ETAPA_3_ATIVIDADES_SEMANA.md)
- [Configurar Arquivos e Comunicados](./docs/ETAPA_5_ARQUIVOS_COMUNICADOS.md)
- [Banco Supabase — migração inicial](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Critérios e progresso do projeto](./TODO.md)

## Desenvolvimento local

Copie `.env.example` para `.env.local` e use somente a URL e a chave publishable do Supabase que você escolheu. Não compartilhe nem envie `.env.local`. Na raiz do projeto, execute `pnpm install` e `pnpm dev`. Para build: `pnpm build`.
