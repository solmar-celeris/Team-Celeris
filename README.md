# SolMar Celeris · Gestão da equipe

Aplicação mobile-first em português, construída com React, TypeScript e Vite. O Supabase fornece o banco PostgreSQL e o Auth. O código pode ser publicado como site estático na Vercel ou no Netlify; este pacote acrescenta a configuração Netlify solicitada.

## O que está incluído hoje

- Tela de login, cadastro por e-mail/senha com perfil pendente até aprovação e redefinição de senha por link Supabase.
- Migração inicial com RLS, áreas/núcleos e 58 atividades de exemplo: [`supabase/migrations/20261101184000_initial_schema.sql`](./supabase/migrations/20261101184000_initial_schema.sql).
- Logo armazenada como asset local em `public/assets/`, para funcionar também fora do armazenamento Manus.
- Prévia visual de demonstração do Painel, somente no Vite de desenvolvimento com `?demo=dashboard`; ela não acessa o Supabase nem é incluída no build de produção.

**Importante:** o Painel funcional pós-login, a atualização de status semanal ligada ao banco, os arquivos do Drive, os comunicados, a gestão de usuários e as funções de importação/exportação ainda não estão implementados. O ZIP contém todo o código atualmente existente, não uma versão completa dessas funcionalidades pendentes.

## Publicar no Netlify

Leia [`INSTRUCOES_NETLIFY_SUPABASE.md`](./INSTRUCOES_NETLIFY_SUPABASE.md) antes de criar o site. O `netlify.toml` configura o build Vite e o diretório `dist`. O ZIP de fonte não contém `.env.local`, senhas nem chaves; configure somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de build do Netlify.

## Supabase e desenvolvimento

- [Plano do projeto](./plan.md)
- [Critérios de entrega e estado atual](./TODO.md)
- [Guia inicial do banco](./docs/ETAPA_1_SUPABASE.md)
- [Login, cadastro e recuperação](./docs/ETAPA_2_LOGIN.md)
- [Migração SQL e atividades de exemplo](./supabase/migrations/20261101184000_initial_schema.sql)

No desenvolvimento local, copie `.env.example` para `.env.local`, preencha as variáveis públicas do Supabase e execute `pnpm install` e `pnpm dev`. O arquivo `.env.local` é ignorado pelo Git e não deve ser enviado no ZIP.
