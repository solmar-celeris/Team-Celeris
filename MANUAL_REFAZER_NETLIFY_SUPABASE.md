# Manual do zero — publicar o SolMar Celeris no Netlify e configurar o Supabase

**Atualizado em 02/11/2026.** Siga a ordem abaixo. Primeiro publique uma versão inicial no Netlify para obter o endereço definitivo do site. Depois configure o Supabase com esse endereço. Por fim, conecte os dois serviços e faça uma nova publicação.

## Antes de recomeçar: proteja o projeto Supabase que já existe

O arquivo `SolMar_Celeris_Netlify_Generico.zip` é o **código-fonte** do site. Ele não contém seu banco Supabase nem deve conter senha ou chave secreta. Não envie o arquivo ZIP inteiro para a área de deploy manual do Netlify.

Você tem dois caminhos para o banco:

- **Reaproveitar o Supabase atual:** escolha este caminho se já executou a migração SQL e vê as tabelas ou as 58 atividades. **Não apague o projeto e não execute a migração novamente.** A parte a refazer será a configuração de Auth e das URLs.
- **Começar com um banco novo:** crie um **novo projeto Supabase separado** e mantenha o atual intacto até o novo site estar testado. O banco novo não receberá automaticamente dados do antigo. Nunca apague o banco antigo apenas para “começar do zero”.

Para a região, selecione **South America (São Paulo), `sa-east-1`**. Se essa opção não aparecer ao criar o projeto, pare e consulte antes de escolher outra. A região é a localização principal dos dados, mas, sozinha, não comprova conformidade legal ou regulatória. [5]

## 1. Preparar e publicar uma primeira versão no Netlify

A primeira publicação pode aparecer com o aviso **“Conexão ainda não configurada”**. Isso é esperado: o objetivo inicial é criar o site e obter seu endereço `*.netlify.app`, que será cadastrado no Supabase na etapa seguinte.

### Opção A — sem GitHub: compilar e enviar a pasta `dist`

1. Baixe o pacote `SolMar_Celeris_Netlify_Generico.zip` e extraia seu conteúdo em uma pasta do computador. Não altere nem envie `.env.example` com valores reais.
2. Instale Node.js 22 LTS. Abra um terminal dentro da pasta extraída e execute:

   ```bash
   corepack enable
   pnpm --version
   pnpm install --frozen-lockfile
   pnpm build
   ```

   O comando `pnpm build` cria a pasta `dist`. Ela contém o site já compilado. O projeto já define Vite, `pnpm build` e `dist` como saída do build. [1]
3. Entre na sua conta Netlify. Na área de projetos, escolha **Add new project → Deploy manually** (ou o rótulo equivalente) e envie **somente a pasta `dist`**. Não envie o ZIP-fonte como se fosse uma pasta pronta para publicação. O Netlify aceita o envio manual dos arquivos compilados; nas atualizações, recompile e envie a nova pasta `dist` pela página de deploys do mesmo site. [2]
4. Aguarde o deploy terminar e copie o endereço principal gerado, por exemplo `https://nome-do-site.netlify.app`. Esse é o endereço que usará nas etapas 3 e 4.

Se estiver usando Windows PowerShell, os comandos de build são os mesmos, desde que o terminal esteja na pasta que contém `package.json`. Se `corepack` não for reconhecido, feche e reabra o terminal após instalar Node.js 22; não cole senhas nem chaves em comandos compartilhados.

### Opção B — com GitHub: deploy automático a cada atualização

1. Extraia o ZIP. Crie um repositório **privado** no GitHub e envie os arquivos da pasta extraída. Não envie arquivos `.env.local`, `.env.production.local` ou qualquer chave secreta.
2. No Netlify, escolha **Add new project → Import an existing project**, conecte sua conta GitHub e selecione o repositório.
3. Mantenha a pasta-base na raiz do projeto. O arquivo `netlify.toml` já informa o comando `pnpm build`, a pasta publicada `dist`, o Node 22 e o fallback necessário para as rotas do aplicativo. O Netlify oferece build de Vite com saída `dist`. [1]
4. Faça o primeiro deploy mesmo sem as variáveis Supabase. Ele deve compilar, mas o login indicará que a conexão ainda não foi configurada. Copie o domínio principal `https://nome-do-site.netlify.app` para usar depois.

A opção com GitHub facilita futuras atualizações: depois que o repositório estiver conectado, um novo envio de código inicia outro build no Netlify. [2]

## 2. Escolher o Supabase correto

### Se for usar o projeto Supabase atual

Abra o projeto que já contém a migração. Confirme que existem as tabelas `nuclei`, `areas`, `profiles`, `activities`, `weekly_updates`, `team_settings`, `drive_folders`, `announcements` e `audit_log`. **Não execute de novo** o arquivo SQL inicial apenas porque o site foi publicado no Netlify. A publicação do front-end não apaga nem migra o banco.

Se já houver dados próprios, não crie outro projeto e não faça reset sem antes exportar e confirmar que existe um backup utilizável.

### Se for começar com um Supabase novo

1. No Supabase, crie um novo projeto chamado, por exemplo, **SolMar Celeris**.
2. Escolha **South America (São Paulo), `sa-east-1`** se estiver disponível. Se não estiver, pare e consulte antes de prosseguir. [5]
3. Crie uma senha forte para o banco e guarde-a em um gerenciador de senhas. **Essa senha não é a chave que vai no site**, não vai para o Netlify e não deve ser compartilhada.
4. Abra o projeto novo e, no menu lateral, entre em **SQL Editor → New query**. No computador, abra este arquivo do ZIP:

   ```text
   supabase/migrations/20261101184000_initial_schema.sql
   ```

5. Copie o conteúdo completo do arquivo, cole em **uma única query** no SQL Editor e clique em **Run** uma vez. Aguarde a mensagem de sucesso. Não precisa dividir o script em uma query por linha.
6. Confira o resultado com esta consulta:

   ```sql
   select
     (select count(*) from public.nuclei) as nucleos,
     (select count(*) from public.areas) as areas,
     (select count(*) from public.activities) as atividades;
   ```

   O conjunto inicial esperado tem **2 núcleos, 8 áreas e 58 atividades de exemplo**. Confira também se o RLS está ligado nas tabelas públicas:

   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;
   ```

   A migração deste pacote prepara as tabelas e as políticas RLS. Se alguma tabela aparecer com `rowsecurity = false`, ou se a execução do SQL mostrar erro, **pare antes de cadastrar dados reais**. Não tente corrigir desligando políticas ou colando uma chave secreta no site. O Supabase recomenda proteger com RLS as tabelas expostas ao cliente. [10]

## 3. Configurar o login e os endereços de retorno no Supabase

No painel do Supabase, abra **Authentication**. Os nomes dos submenus podem mudar um pouco com a interface, mas procure **Sign In / Providers**, **Email** e **URL Configuration**.

1. Em **Sign In / Providers → Email**, deixe o provedor de e-mail/senha habilitado. Para cadastro pela tela do site, habilite **Allow new users to sign up**. Mantenha **Confirm email** habilitado para que a pessoa confirme que controla o endereço antes do primeiro login. No Supabase hospedado, a confirmação costuma vir habilitada por padrão. [8] [9]
2. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço principal real que copiou do Netlify, sem inventar outro domínio. Exemplo:

   ```text
   https://nome-do-site.netlify.app
   ```

3. Em **Redirect URLs**, adicione o mesmo endereço, de preferência com o padrão restrito ao próprio domínio:

   ```text
   https://nome-do-site.netlify.app/**
   ```

   Substitua `nome-do-site` pelo nome real do seu site. Não copie o exemplo literalmente. O app usa o domínio em que está aberto como retorno para confirmação e recuperação de senha. O Supabase exige que o destino esteja na lista permitida e recomenda usar a URL oficial do site para produção. [4]
4. Não é necessário liberar todos os domínios Netlify nem adicionar URLs de preview para o primeiro teste. Se futuramente usar domínio próprio, cadastre esse domínio nas URLs autorizadas também. Não use um curinga abrangente como `https://**`.
5. O app deste pacote está conectado a **e-mail e senha**. O botão/login com Google não está implementado nesta versão; não é necessário configurar Google OAuth para fazer o primeiro teste.

### Atenção aos e-mails de confirmação e recuperação

O remetente padrão do Supabase serve para testes e pode restringir os destinatários a endereços autorizados do time. A documentação consultada indica limite padrão de **2 e-mails por hora**, sujeito a alteração, e não garante entrega. Isso pode causar a mensagem `email rate limit exceeded` ou impedir que alguém da equipe receba o link. [9] [11]

Se o limite for atingido, não peça vários links de recuperação em sequência: aguarde o bloqueio passar. Para enviar e-mails a toda a equipe em uso real, será necessário escolher e configurar um provedor SMTP próprio no Supabase. Isso envolve credenciais de um serviço de e-mail e pode ter limites ou custos próprios. Não desative a confirmação de e-mail para contornar o limite. [9]

## 4. Conectar Netlify e Supabase com as duas variáveis públicas

No Supabase, abra **Connect** ou **Settings → API Keys**. Copie a URL do projeto e a chave **publishable** atual. A URL tem formato `https://<referencia-do-projeto>.supabase.co`; a chave publishable começa com `sb_publishable_`. O Supabase permite expor a chave publishable em aplicativos de navegador, desde que o acesso aos dados seja restringido por RLS. [6]

### Se publicou pelo GitHub

No Netlify, abra a configuração do site/projeto e entre em **Environment variables**. Crie as duas variáveis abaixo e inclua o escopo **Builds**:

```text
VITE_SUPABASE_URL=https://<referencia-do-projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Substitua os exemplos pelos valores copiados do **mesmo** projeto Supabase. Salve e faça um novo deploy, ou selecione **Retry deploy**. Variáveis de ambiente precisam estar disponíveis para o build. [3]

### Se publicou enviando `dist` manualmente

Na pasta extraída, crie um arquivo chamado `.env.production.local`. Use estas duas linhas com os valores do Supabase:

```text
VITE_SUPABASE_URL=https://<referencia-do-projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Salve o arquivo na mesma pasta de `package.json`. Depois execute:

```bash
pnpm build
```

Envie a nova pasta `dist` para a área de deploy do **mesmo site Netlify**. Guarde `.env.production.local só no seu computador; não o envie ao GitHub nem o inclua em outro ZIP.

O prefixo `VITE_` significa que esses valores entram no JavaScript compilado que chega ao navegador. A URL e a chave publishable são públicas. **Nunca** use `sb_secret_`, `service_role`, senha do banco, token de acesso pessoal ou outra chave administrativa nessas variáveis ou em qualquer arquivo do site. Chaves secretas bypassam as políticas RLS e devem permanecer somente em componentes de servidor protegidos. [6] [7]

O banco é protegido pelas políticas RLS e pelas regras de perfil da migração, não por esconder a chave publishable. Não envie capturas de tela que mostrem senha, token ou chave secreta.

## 5. Criar e aprovar o primeiro administrador

O cadastro pela página do site cria o perfil como `pending`. Confirmar o e-mail **não** aprova a pessoa. A aprovação inicial ainda é manual no Supabase.

1. Abra o site publicado e escolha **Criar cadastro**. Use seu próprio nome e um e-mail que você controla. Crie uma senha e confirme pelo e-mail recebido, se solicitado.
2. No Supabase, abra **Authentication → Users**, localize essa conta e copie o **User UID**. Não copie a senha.
3. Abra **SQL Editor → New query**. Troque `COLE_AQUI_O_UID_DO_SEU_USUARIO` pelo UID copiado, mantendo as aspas simples e `::uuid`, e execute:

   ```sql
   update public.profiles
   set role = 'admin',
       status = 'active',
       approved_at = now(),
       approved_by = null,
       updated_at = now()
   where user_id = 'COLE_AQUI_O_UID_DO_SEU_USUARIO'::uuid
     and status = 'pending';

   select user_id, role, status, approved_at
   from public.profiles
   where user_id = 'COLE_AQUI_O_UID_DO_SEU_USUARIO'::uuid;
   ```

4. Confira que o resultado mostra `role = admin` e `status = active`. A atualização deve afetar exatamente um perfil. Se afetar zero linhas ou aparecer outro resultado, pare: confirme se o UID corresponde à sua conta e se o perfil existe. Não remova a condição `status = 'pending'` para forçar a consulta.
5. Volte ao site e entre com o e-mail e senha dessa conta.

Para aprovar depois outra pessoa como membro comum, confira a identidade dela em **Authentication → Users**, copie o UID dela e o do administrador e use uma consulta restrita como esta, substituindo os dois marcadores:

```sql
update public.profiles
set status = 'active',
    approved_by = 'UID_DO_ADMIN'::uuid,
    approved_at = now(),
    updated_at = now()
where user_id = 'UID_DO_NOVO_MEMBRO'::uuid
  and status = 'pending'
  and role = 'member';
```

Essa consulta não promove a pessoa a administradora. Confira o perfil e o resultado antes de prosseguir. Nunca compartilhe UID, senha, link de recuperação ou token em um canal público.

## 6. Teste final, na ordem

Faça os testes com contas e informações de teste, não com informações pessoais desnecessárias:

1. Abra o domínio principal Netlify em uma janela anônima. A mensagem **“Conexão ainda não configurada”** não deve mais aparecer.
2. Cadastre uma conta de teste. Se a confirmação estiver ativa, confirme o endereço no link recebido.
3. Antes da aprovação, a conta deve continuar aguardando o administrador. Ela não deve conseguir ler os dados da equipe.
4. Aprove essa conta no Supabase. Depois disso, teste o login novamente.
5. Use **Esqueci minha senha** uma única vez para validar o envio e o retorno ao domínio Netlify. O endereço principal e a URL de retorno precisam estar autorizados em **URL Configuration**. [4] [9]
6. Se modificar variáveis no Netlify, gere outro build/deploy. Se mudar somente a allowlist de URLs no Supabase, não precisa recompilar o site.

## Se ainda não funcionar

- **A página diz que a conexão não está configurada:** confirme que as duas variáveis estão escritas exatamente como no manual. No Netlify, confirme o escopo **Builds** e refaça o deploy. No modo manual, confirme que `.env.production.local` está ao lado de `package.json` e reconstrua `dist`.
- **URL ou chave inválida:** confira se os dois valores vieram do mesmo projeto Supabase. Para o navegador, use somente a chave publishable `sb_publishable_...`.
- **Erro de redirect, confirmação que volta para endereço errado ou redefinição sem retorno:** confirme que **Site URL** e **Redirect URLs** incluem o domínio real `https://nome-do-site.netlify.app`. Corrija o domínio e solicite apenas um novo link. [4]
- **`email rate limit exceeded`:** pare de solicitar e-mails e aguarde. O envio padrão tem limite baixo e variável. Se a equipe precisa receber e-mails, avalie um SMTP próprio antes de configurá-lo. [9] [11]
- **E-mail ou senha incorretos:** confirme primeiro se o e-mail foi verificado. Depois confira se existe linha em `public.profiles` para o UID e se o perfil está `active`. Uma conta `pending` não tem acesso aprovado.
- **Erro de banco ou acesso negado:** verifique a mensagem em **Authentication → Logs** e confirme que o RLS permanece ativo. Não contorne o erro com chave secreta no site. [10]

Para pedir ajuda, compartilhe apenas a mensagem de erro sem dados pessoais e diga se a consulta afetou zero ou uma linha. Não envie senha, UID, token, `sb_secret_...` ou credenciais SMTP.

## O que esta publicação inclui — e o que ainda não inclui

Esta etapa conecta a tela de login/cadastro/recuperação ao Supabase e publica o front-end no Netlify. O script SQL cria as tabelas, regras de acesso e 58 atividades iniciais. **Isso não significa que todas as telas operacionais já estejam ligadas ao banco.**

Nesta versão ainda não estão concluídos o painel operacional real, edição e acompanhamento das atividades e semanas, gráficos conectados ao banco, gestão de membros dentro do site, arquivos, comunicados, importação/exportação e Google OAuth. A tela `?demo=dashboard` é apenas uma prévia de desenvolvimento com números fictícios; ela não é o painel real de produção. Portanto, depois de entrar, não use dados demonstrativos como informação oficial da equipe.

## Referências oficiais

[1]: https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/ "Vite on Netlify"
[2]: https://docs.netlify.com/deploy/create-deploys/ "Create deploys"
[3]: https://docs.netlify.com/build/configure-builds/environment-variables/ "Build environment variables"
[4]: https://supabase.com/docs/guides/auth/redirect-urls "Redirect URLs"
[5]: https://supabase.com/docs/guides/platform/regions "Available regions"
[6]: https://supabase.com/docs/guides/getting-started/api-keys "API keys"
[7]: https://vite.dev/guide/env-and-mode "Env Variables and Modes"
[8]: https://supabase.com/docs/guides/auth/general-configuration "General configuration"
[9]: https://supabase.com/docs/guides/auth/passwords "Password-based Auth"
[10]: https://supabase.com/docs/guides/database/postgres/row-level-security "Row Level Security"
[11]: https://supabase.com/docs/guides/auth/auth-smtp "Send emails with custom SMTP"
