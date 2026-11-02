# Etapa 2 — login e primeiro administrador

O app oferece login e cadastro aberto por e-mail/senha, conforme decisão da equipe. Cada nova conta fica `pending`; confirmar o e-mail não dá acesso aos dados. Só a aprovação administrativa libera o perfil.

## 1. Permitir cadastro aberto sem liberar dados

1. Abra o projeto SolMar Celeris no [Supabase Dashboard](https://supabase.com/dashboard).

1. No menu lateral, entre em **Authentication** e abra as configurações gerais de login (o rótulo pode aparecer como **Settings** ou **Sign In / Providers**).

1. Localize **Allow new users to sign up** e ligue a opção para permitir que a tela crie contas.

1. Salve. Isso permite criar contas no Supabase Auth; não libera dados da equipe. O gatilho cria cada perfil como `pending`, e a RLS bloqueia contas pendentes até a aprovação [1]. Mantenha a confirmação de e-mail ativada se o projeto já a utiliza.

Os links de confirmação e recuperação retornam ao próprio site. Em **Authentication → URL Configuration**, defina a URL do site como `https://SEU-SITE.netlify.app` e permita esse mesmo endereço como URL de redirecionamento. Se publicar também em um domínio Vercel, adicione a origem real separadamente; não use curingas amplos.

Novas contas confirmadas continuam pendentes. Até existir uma tela administrativa segura para aprová-las, o administrador deve conferir cada usuário no Supabase e só então ativar o perfil. Nunca transforme cadastros públicos em administradores automaticamente.

## 2. Criar a primeira conta administradora

Faça a criação pelo painel Supabase, não pela página de login:

1. Em **Authentication → Users**, clique em **Add user**.

1. Crie somente a sua própria conta inicial com e-mail e senha que você controla. Se houver opção de confirmar o e-mail para esse usuário criado pelo proprietário do projeto, confirme-a.

1. Copie o **User UID** mostrado para essa conta. Não copie nem compartilhe a senha.

1. Abra **SQL Editor → New query** e execute a consulta abaixo, trocando apenas o texto `COLE-O-UUID-DO-ADMIN` pelo User UID copiado:

```sql
update public.profiles
set role = 'admin',
    status = 'active',
    approved_at = now(),
    approved_by = null,
    updated_at = now()
where user_id = 'COLE-O-UUID-DO-ADMIN'::uuid
  and status = 'pending';

select user_id, role, status, approved_at
from public.profiles
where user_id = 'COLE-O-UUID-DO-ADMIN'::uuid;
```

O `update` deve afetar uma linha e a conferência deve mostrar `admin` e `active`. Se afetar zero linhas, pare e não execute o `update` retirando a condição; confirme primeiro se o UID é da conta criada e se o perfil existe.

## 3. Aprovar um novo cadastro

Ainda não há uma tela administrativa de aprovação. Confirme a pessoa em **Authentication → Users** e copie o UID dela e o UID do administrador. Para aprovar como integrante comum, execute no SQL Editor — substitua os dois marcadores, mantendo as aspas:

```sql
update public.profiles
set status = 'active',
    approved_by = 'COLE_UID_DO_ADMIN_AQUI'::uuid,
    approved_at = now(),
    updated_at = now()
where user_id = 'COLE_UID_DO_NOVO_MEMBRO_AQUI'::uuid
  and status = 'pending'
  and role = 'member';
```

Essa consulta não muda o papel padrão `member`, não promove a administrador e só altera perfil pendente. Confirme que afetou uma linha; se retornar zero, pare e confira os UIDs/status sem remover as condições.

## 4. Entrar no app

Use o e-mail e a senha definidos no cadastro e clique em **Entrar**. Conta aprovada mostra **Acesso aprovado**; conta nova ainda pendente mostra **Cadastro aguardando aprovação**. O painel de atividades ainda não faz parte desta etapa.

## 5. Redefinir senha

Em **Esqueci minha senha**, informe o e-mail e peça o link. Por privacidade, a tela não revela se o endereço está cadastrado. Abra o link recebido no mesmo site, defina e confirme a nova senha e depois entre normalmente. A lista **Redirect URLs** do Supabase precisa permitir a origem real do site.

O SMTP padrão do Supabase tem limites de envio; a equipe já encontrou `email rate limit exceeded`. Não solicite vários links em sequência: aguarde e tente novamente depois. SMTP próprio pode envolver custo e não será configurado sem uma decisão separada.

Não envie senha, UID, token ou chave no chat. Para depurar, informe somente a mensagem sem dados pessoais e se a consulta afetou 0 ou 1 linha.

## Fontes oficiais

[1]: https://supabase.com/docs/guides/auth/general-configuration "General configuration"

[2]: https://supabase.com/docs/guides/auth/managing-user-data "User Management"

