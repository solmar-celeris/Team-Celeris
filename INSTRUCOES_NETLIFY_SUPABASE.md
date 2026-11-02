# SolMar Celeris — atualizar o site no Netlify e conectar ao Supabase

**Revisado em 02/11/2026.** Este manual acompanha o ZIP de código-fonte. Ele não acessa sua conta, não muda o banco Supabase e não publica o site por você.

## O que esta versão faz

Depois que uma conta tem perfil **ativo/aprovado**, o site abre as abas **Semana** e **Atividades**. Elas consultam o Supabase configurado no Netlify. A equipe pode listar e filtrar atividades, registrar status por semana e, conforme o papel e a área, cadastrar ou editar atividades. O código da atividade e o ator/data das alterações são gerados/registrados pelo banco.

A versão não inclui ainda painel avançado com gráficos, pastas/links do Drive, comunicados, tela administrativa de usuários, importação/exportação nem PWA completo. A aprovação de novos perfis permanece manual. A prévia `?demo=dashboard` é uma demonstração local com dados fictícios — não é o sistema operacional e não aparece no build de produção.

## Importante: não crie outro site nem outro banco

Se o Supabase que você já configurou contém as tabelas e as 58 atividades iniciais, **mantenha esse projeto**. Não execute a migração inicial novamente: ela cria tipos, tabelas, políticas, gatilhos e dados de exemplo e é destinada a um banco vazio.

Também não precisa recriar o site Netlify. A atualização do código é feita no mesmo repositório GitHub ligado ao site existente; o Netlify detecta o novo commit e publica no mesmo endereço. A atualização do front-end não apaga nem recria o banco.

## 1. Confirme o Supabase que o site deve usar

No Supabase, abra o projeto correto e confira em **Settings → API Keys** (ou **Connect**) o endereço do projeto e uma chave **publishable**. A tela `Atividades` precisa consultar as tabelas `activities`, `areas`, `nuclei`, `profiles`, `team_settings` e `weekly_updates` criadas pela migração inicial.

Se a migração já foi aplicada no seu projeto, não a rode novamente. O guia [`docs/ETAPA_1_SUPABASE.md`](./docs/ETAPA_1_SUPABASE.md) tem instruções de conferência. Se as tabelas não existirem, pare antes de executar SQL: confirme primeiro se abriu o projeto Supabase correto.

## 2. Variáveis no Netlify — atenção aos cadeados

No site Netlify existente, abra **Project configuration → Environment variables**. Configure as duas variáveis abaixo com os valores do Supabase que deve atender esse site:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Esses valores são **públicos por design**: o Vite os coloca no JavaScript que o navegador precisa carregar. Portanto, classifique-os como **Plain text / não secreto**, e garanta que o escopo inclua **Builds**. Não use a senha do banco, `sb_secret_...` nem `service_role` nessas variáveis. Não coloque segredos no ZIP, GitHub, HTML ou browser.

Se o log do Netlify informar que o secrets scanner encontrou `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` no `dist`, confira se elas foram marcadas acidentalmente como Secret. Corrija o tipo para Plain text: não desative a varredura de segredos e não omita a pasta `dist` da verificação. Após alterar variáveis, é necessário executar um novo deploy/build.

Referências oficiais: [chaves do Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [variáveis do Vite](https://vite.dev/guide/env-and-mode) e [secret scanning do Netlify](https://docs.netlify.com/manage/security/secret-scanning/).

## 3. Atualize o repositório GitHub que já está ligado ao Netlify

1. Baixe o ZIP novo `SolMar_Celeris_Netlify_Atualizado.zip` e extraia seu conteúdo no computador.
2. Recomendado para uma substituição segura: instale/abra o **GitHub Desktop** e selecione **File → Clone repository**. Escolha o repositório GitHub que já alimenta o site Netlify e clone-o no computador. Se já tem uma cópia local desse repositório, abra-a em vez de cloná-la novamente.
3. Faça uma cópia de segurança da pasta local do repositório. Depois, copie o conteúdo extraído do ZIP para dentro dessa pasta, permitindo substituir os arquivos de mesmo nome.
4. **Não apague nem substitua a pasta `.git`** do clone. Não copie arquivos `.env.local`, `.env.production.local`, `node_modules` ou `dist` para o GitHub. O ZIP não precisa desses arquivos.
5. No GitHub Desktop, confira a aba **Changes**. Deve aparecer a atualização de `AuthPanel.tsx`, os novos arquivos `src/features/workspace/` e os documentos. Escreva uma mensagem, por exemplo `Adicionar abas Semana e Atividades`, clique em **Commit to main** (ou na branch principal escolhida) e depois em **Push origin**.
6. Abra o Netlify e selecione o mesmo site. Em **Deploys**, acompanhe o novo deploy iniciado pelo commit. Aguarde o estado publicado/success antes de abrir o endereço público.

Você não precisa criar outro repositório, importar outro projeto Netlify nem configurar um novo domínio. A documentação oficial do GitHub explica [clonar repositórios](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) e [adicionar arquivos ao repositório](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

O `netlify.toml` deste pacote define o build Vite, a pasta publicada `dist`, Node e o fallback da aplicação. As dependências estão fixadas pelo `package.json` e pelo `pnpm-lock.yaml`. Em caso de erro no novo deploy, abra o log e confira se `pnpm install --frozen-lockfile`, `pnpm build`, `tsc` e `vite build` terminam sem erro. A saída precisa conter `dist/index.html`.

## 4. Supabase Auth: mantenha o endereço do site na lista de retorno

Depois do deploy, copie a URL pública exata do site (por exemplo, `https://seu-site.netlify.app`). No projeto Supabase correto, abra **Authentication → URL Configuration**:

- **Site URL:** o endereço principal publicado do Netlify.
- **Redirect URLs:** inclua uma origem correspondente ao endereço publicado, por exemplo `https://seu-site.netlify.app/**`.
- Se usar deploy previews, permita um padrão específico dos previews do seu site; não use um curinga aberto para qualquer domínio.

Isso permite que confirmação de e-mail e recuperação de senha retornem ao site publicado. Quando o domínio mudar, revise essas URLs. Consulte a [documentação oficial de Redirect URLs do Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Acesso e uso depois do deploy

1. Entre no site publicado com e-mail e senha. Se ainda não houver perfil ativo, confirme o e-mail (se o Auth pedir) e aguarde a aprovação manual; confirmar o e-mail não aprova o perfil.
2. Quando o acesso for aprovado, o site deve sair da confirmação de login e abrir **Semana**. Use **Atividades** no menu para consultar/cadastrar atividades.
3. Em **Semana**, escolha uma das semanas do ciclo. Atividades sem registro aparecem como **Sem atualização** e **Não iniciado**. O estado só é gravado quando a pessoa escolhe e salva; a tela não cria status silenciosamente.
4. Para registrar **Pendente**, escreva a justificativa antes de salvar. **Não se aplica** deve ser escolhido quando realmente não houver demanda; não é contado como concluído nem pendente.
5. Em **Atividades**, busque por texto e filtre por responsável, núcleo, área, tipo, situação ou período. Administrador e líder de área autorizados podem cadastrar/editar; o banco valida as mesmas permissões.

O painel de permissões é: Administrador edita atividades e status em toda a equipe; Líder de área edita somente a própria área; Membro vê tudo e pode atualizar status de atividades vinculadas à sua conta; Leitor vê sem editar. As políticas RLS do Supabase continuam sendo a barreira final — não as desative para corrigir erros da interface.

A migração inicial atribui `A definir` como responsável e não vincula as 58 atividades a uma conta. Para um membro atualizar status, um administrador/líder autorizado precisa editar a atividade e selecionar a conta da pessoa em **Vincular à conta da equipe**. Sem vínculo, o banco pode bloquear a atualização do membro; isso é intencional.

## 6. Se continuar vendo somente a tela de login

- Confira em **Deploys** se o novo commit realmente foi publicado. Uma mudança no GitHub não altera um deploy que falhou.
- Atualize a página do site com recarregamento forçado (Ctrl+F5 no Windows; Cmd+Shift+R no Mac) ou abra em uma janela privada.
- Confirme que as duas variáveis do Netlify apontam para o mesmo projeto Supabase onde está o seu perfil e a migração. Depois de mudar variável, faça novo deploy.
- Confirme no Supabase que o perfil está `active`, não `pending`/`suspended`, e que as tabelas não foram recriadas ou apagadas.
- Se a tela informar erro de consulta, copie apenas o texto do erro, sem enviar senha, URL privada, chave ou token. Erro de permissão deve ser resolvido no perfil/política correta; não torne o banco público.
- Para confirmação ou redefinição de senha, ajuste as Redirect URLs na seção 4. Se aparecer `email rate limit exceeded`, aguarde antes de pedir outro e-mail.

## 7. Limites e segurança

- O pacote conecta ao projeto indicado pelas variáveis de build. Não inclui URL/chave do projeto específico, `.env.local`, `dist`, dependências instaladas, `.git`, senhas ou chaves administrativas.
- `VITE_*` é sempre visível no navegador; coloque ali somente URL e chave publishable. A chave pública não substitui RLS.
- Os formulários mostram e gravam dados conforme as tabelas da migração original; nenhum teste desta atualização gravou ou apagou dados no Supabase remoto.
- Ainda não há painel avançado, gráficos, arquivos do Drive, comunicados, gestão administrativa interna, importação/exportação ou PWA completo.
- Netlify e Supabase podem alterar seus limites e planos; confira as condições vigentes antes de usar com dados de equipe.

## Fontes oficiais

- [Netlify: Vite](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [Netlify: configuração de builds](https://docs.netlify.com/build/configure-builds/overview/)
- [Netlify: variáveis de ambiente](https://docs.netlify.com/build/configure-builds/environment-variables/)
- [Netlify: secret scanning](https://docs.netlify.com/manage/security/secret-scanning/)
- [GitHub: clonar um repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [GitHub: adicionar arquivos a um repositório](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: chaves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Vite: variáveis de ambiente](https://vite.dev/guide/env-and-mode)
