# SolMar Celeris · Gestão da equipe

Aplicação responsiva em português, construída com React, TypeScript e Vite. Supabase fornece autenticação e banco compartilhado; Netlify hospeda o site estático.

## Funcionalidades desta versão

- Login, cadastro com perfil pendente até aprovação e recuperação de senha.
- Depois do login com perfil `active`, espaço operacional real com as abas **Semana** e **Atividades**.
- Lista e filtros de atividades vindas do Supabase; cadastro/edição autorizados por perfil e área; código gerado pelo banco.
- Registro semanal de status, justificativa obrigatória quando Pendente e permissões validadas pelo RLS do Supabase.
- Migração SQL inicial com áreas/núcleos e 58 atividades de exemplo: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Logo local em `public/assets/` e configuração de build Netlify em `netlify.toml`.

A tela operacional usa os dados e as políticas já criados no Supabase. Se a migração foi aplicada, **não a execute outra vez**. A aprovação de novos cadastros continua manual.

## Atualizar o site Netlify existente

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md). O guia ensina a atualizar o mesmo repositório GitHub e site Netlify, manter o Supabase existente, definir as variáveis públicas de build e conferir as URLs de Auth. Não publique este ZIP como se fosse uma pasta `dist`.

## Guias

- [Usar Semana e Atividades](./docs/ETAPA_3_ATIVIDADES_SEMANA.md)
- [Banco Supabase — etapa inicial](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Critérios e progresso do projeto](./TODO.md)

## Desenvolvimento local

Copie `.env.example` para `.env.local` e use somente a URL e a chave publishable do Supabase que você escolheu. Não compartilhe nem envie `.env.local`. Na raiz do projeto, execute `pnpm install` e `pnpm dev`. Para build: `pnpm build`.
