# SolMar Celeris — publicar no Netlify e configurar o Supabase

**Atualizado em 02/11/2026.** Este guia acompanha o ZIP de código-fonte. Ele não cria contas, não lê dados privados do seu Supabase e não publica o site por você.

## Antes de começar: o que o pacote contém

O ZIP contém o código atual do SolMar Celeris, os arquivos de configuração do build, a migração SQL inicial e as instruções. O front-end usa React + TypeScript + Vite; o Supabase continua sendo o serviço externo de autenticação e banco.

Já estão implementados o login por e-mail/senha, o formulário de cadastro com perfil pendente, a recuperação e a definição de nova senha. A migração cria áreas/núcleos, perfis, atividades, acompanhamento semanal, pastas, comunicados, auditoria, RLS e as 58 atividades de exemplo. A logo foi incluída como arquivo local para não depender do armazenamento da Manus.

**O site ainda não é o sistema operacional completo.** Depois que alguém entra, o Painel funcional, a edição das atividades e dos status semanais conectada ao banco, Arquivos, Comunicados, gestão de usuários, importação/exportação e PWA ainda estão pendentes. A prévia `?demo=dashboard` contém dados fictícios, só funciona no Vite local e não é compilada para produção. Não use esses números como dados da equipe.

## 1. Supabase: mantenha o banco correto

Se você já criou o projeto Supabase e executou a migração SQL inicial, **não execute a migração novamente**: ela é destinada a um banco novo/vazio. Confirme no SQL Editor que há 58 atividades, 8 áreas, 2 núcleos e um ciclo de 60 semanas iniciando em 09/11/2026. O guia [`docs/ETAPA_1_SUPABASE.md`](./docs/ETAPA_1_SUPABASE.md) contém a consulta de conferência.

Se for necessário criar outro projeto, use **South America (São Paulo), `sa-east-1`**. Essa foi a região escolhida para os dados da equipe; se não estiver disponível na sua conta, pare e confirme antes de escolher outra.

O cadastro por e-mail/senha fica aberto conforme sua decisão, mas isso **não** libera acesso ao banco: cada perfil recém-criado nasce `pending`. Só depois de um administrador verificar a pessoa e aprová-la ela poderá ler os dados. A aprovação atual é manual no Supabase; a tela de administração ainda não foi implementada. Use o passo a passo atualizado [`docs/ETAPA_2_LOGIN.md`](./docs/ETAPA_2_LOGIN.md) e não conceda papel de administrador a um novo cadastro por engano.

A confirmação de e-mail está ativada no projeto observado. Portanto, a pessoa precisa abrir o e-mail do Auth e confirmar o endereço antes de entrar. O projeto já apresentou limite de envio de e-mail; se aparecer `email rate limit exceeded`, pare de solicitar novos links e aguarde o limite expirar. Não configure um serviço SMTP novo sem decidir antes o provedor, custo e tratamento dos endereços da equipe.

## 2. Chaves e variáveis de build

No painel Supabase, abra **Connect** ou **Settings → API Keys** e copie a URL do projeto e a chave **publishable**. No Netlify, cadastre estas duas variáveis em **Project configuration → Environment variables**, incluindo o escopo **Builds**:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use somente os valores do Supabase que deve atender o site publicado. Não copie para o ZIP, Git, HTML ou browser a senha do banco, `sb_secret_...`, `service_role` ou qualquer chave privilegiada. O prefixo `VITE_` faz o Vite embutir o valor no JavaScript entregue ao navegador; por isso essas variáveis só podem conter o endereço e a chave pública/publishable. A segurança dos dados depende das políticas RLS da migração, não do segredo da chave pública. Veja [chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys) e [variáveis Vite](https://vite.dev/guide/env-and-mode).

As variáveis de build não substituem configuração de Auth e não atualizam um `dist` já gerado. Sempre faça um novo build/deploy depois de alterá-las.

## 3. Publicação recomendada: ligar o Git ao Netlify

1. Baixe e extraia `SolMar_Celeris_Netlify.zip` no computador. Não publique o ZIP diretamente.
2. Crie um repositório Git **privado** no GitHub ou GitLab e envie a pasta extraída. Antes de enviar, confirme que `.env.local`, `.env.production.local`, `node_modules/`, `dist/` e `.git/` não foram adicionados. O ZIP já exclui credenciais e pastas geradas.
3. No Netlify, escolha **Add new project → Import an existing project**, conecte o provedor Git e selecione esse repositório.
4. Deixe a base do projeto na raiz. O `netlify.toml` define o comando `pnpm build`, o diretório publicado `dist`, Node 22, instalação congelada pelo lockfile e fallback para rotas do app. O `package.json` fixa `pnpm@11.25.0`; o Netlify reconhece `pnpm-lock.yaml` e usa Corepack para essa versão.
5. Cadastre as duas variáveis da seção 2 no Netlify **antes** do primeiro build e execute o deploy. Abra o log: a instalação, `tsc` e `vite build` devem terminar sem erro; o diretório `dist` precisa conter `index.html`.
6. Abra a URL Netlify gerada e confira a tela de login. O deploy do Netlify não altera nem migra o banco Supabase.

O diretório `dist` contém HTML, CSS e JavaScript estáticos. A documentação do Netlify indica `dist` para Vite e permite configurar build/diretório tanto pelo painel como por `netlify.toml` [1–3].

## 4. Alternativa: compilar no computador e enviar `dist`

Para um deploy manual sem ligar um repositório ao Netlify, é necessário compilar antes. Use Node.js 22.12 ou superior, Corepack e pnpm 11.25.0. Na raiz extraída do projeto:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Antes do build manual, crie localmente um arquivo `.env.production.local` com as duas variáveis públicas da seção 2. Ele é ignorado pelo Git; não o envie. Depois do build, arraste **somente a pasta `dist`** para a área de deploy manual do site Netlify. Se trocar a URL ou a chave pública, ajuste esse arquivo e compile de novo. O Netlify orienta descompactar arquivos `.zip` de projeto e, para upload pré-compilado, enviar a pasta de saída, não o ZIP de fonte [3].

## 5. URL de confirmação e recuperação de senha

Depois de criar o site, copie a URL pública final, por exemplo `https://seu-site.netlify.app`. No projeto Supabase, abra **Authentication → URL Configuration**:

- Configure **Site URL** com a URL pública principal do Netlify.
- Em **Redirect URLs**, permita essa origem exata, por exemplo `https://seu-site.netlify.app/**` (ou o padrão mais restrito que corresponda aos caminhos usados).
- Se for testar **Deploy Previews** do Netlify, acrescente um padrão específico para os previews do seu site/equipe; não use um curinga aberto para qualquer domínio.

O app envia a origem atual como URL de retorno para confirmação e recuperação de senha. O Supabase exige que ela corresponda a um retorno permitido; a documentação recomenda deixar a URL oficial como `Site URL` e limitar a allowlist de produção [4]. Ao trocar de domínio ou usar domínio personalizado, atualize essa configuração.

## 6. Como confirmar cadastro e acesso

1. Na tela pública, faça um cadastro de teste com um e-mail controlado pela equipe.
2. Abra e confirme o e-mail do Supabase, se solicitado. A confirmação de endereço ainda **não** aprova o perfil.
3. Peça a um administrador que localize o perfil `pending`, confira a identidade e o papel/área corretos, e só então aprove. Até existir a tela administrativa, siga o procedimento manual no [`docs/ETAPA_2_LOGIN.md`](./docs/ETAPA_2_LOGIN.md). Depois, teste o login normal.
4. Para a redefinição, peça um único link, abra-o no mesmo domínio Netlify e defina a nova senha. Se a mensagem de rate limit voltar, não repita em sequência. O envio depende da configuração de e-mail do Supabase.

## 7. Limites e segurança deste estágio

- O Supabase existente não deve ser substituído nem sua migração repetida apenas porque o front-end foi para Netlify.
- Esta interface usa apenas a chave pública Supabase; a configuração no Netlify é de **build**, não é um segredo server-side. Nunca cole uma chave secreta ou a senha do banco num campo `VITE_*`.
- O pacote inclui o código existente, não as telas operacionais ainda pendentes. Publicar o ZIP disponibiliza somente o que foi implementado; não habilita atividades, gráficos conectados, comunicados, gestão de membros nem PWA.
- Não inclua dados reais da equipe no modo demo. A demo só existe em desenvolvimento e não é uma via de acesso ao site publicado.
- Netlify e Supabase podem alterar limites/planos. Confira-os nas respectivas contas antes de usar com dados reais.

## Fontes oficiais consultadas em 02/11/2026

1. [Netlify — Vite on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/) — comando de build e saída `dist`.
2. [Netlify — Manage build dependencies](https://docs.netlify.com/build/configure-builds/manage-dependencies/) — uso de `pnpm-lock.yaml` e escolha da versão via `packageManager`/Corepack.
3. [Netlify — Create deploys](https://docs.netlify.com/deploy/create-deploys/) e [Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/) — deploy manual, extração de ZIP e configuração por `netlify.toml`.
4. [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — Site URL e allowlist de retornos, inclusive previews Netlify.
5. [Supabase — API keys](https://supabase.com/docs/guides/getting-started/api-keys) — chave publishable para browser versus chave secret para servidor.
6. [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode) — prefixo `VITE_`, build e exposição de valores no bundle.

7. [Netlify — Build environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/) — cadastrar valores no painel e incluir o escopo Builds.
