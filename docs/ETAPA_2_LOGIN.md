# Etapa 2 — login e novos cadastros

A equipe escolheu **ativar automaticamente novos cadastros**. Depois que a migration `20261102160000_auto_activate_new_signups.sql` estiver aplicada, cada conta criada pela página recebe um perfil `active` com papel `member` e sem área. O Administrador não precisa abrir o Supabase para aprovar cada novo integrante.

> **Atenção:** o cadastro é aberto. Qualquer pessoa que consiga criar uma conta — e confirmar o e-mail caso essa exigência esteja habilitada — poderá entrar no espaço e acessar os dados compartilhados permitidos pela RLS. Compartilhe o endereço do site somente com pessoas que devam ter acesso.

## 1. Habilitar cadastro e aplicar a ativação automática

1. No Supabase do site, abra **Authentication → Sign In / Providers** (o rótulo pode variar) e mantenha **Allow new users to sign up** ativado.
2. Não altere a configuração de confirmação de e-mail nesta etapa. Se ela já estiver ligada, o usuário precisa confirmar o endereço recebido; se estiver desligada, o acesso pode começar assim que o cadastro for concluído.
3. No **SQL Editor**, execute uma única vez o arquivo `supabase/migrations/20261102160000_auto_activate_new_signups.sql`, depois de aplicar a migration inicial. Esse trigger cria somente perfis novos como `active/member`; papel ou área não são aceitos dos metadados enviados pelo navegador.
4. Confirme a mensagem de sucesso antes de publicar o bundle atualizado pelo fluxo GitHub/Netlify descrito no manual principal.

A migration **não altera** contas que já existiam. Perfis já `pending` continuam bloqueados e não são promovidos em lote. Não execute uma atualização sem filtro para liberar registros antigos; se precisar tratar uma conta anterior, revise a identidade individualmente com a coordenação.

## 2. Criar o primeiro Administrador

A autoativação dá somente o papel `member`. Ela nunca cria Administradores. Para o primeiro Administrador, use uma conta que você controla e siga a instrução de bootstrap abaixo, com o UUID copiado da sua própria conta no Supabase Auth. Não compartilhe o UID, a senha ou tokens.

1. Em **Authentication → Users**, crie/identifique sua própria conta inicial e copie o **User UID**.
2. Abra **SQL Editor → New query** e substitua o único marcador `COLE-O-UUID-DO-ADMIN` pelo UID da sua própria conta:

```sql
update public.profiles
set role = 'admin',
    status = 'active',
    approved_at = now(),
    approved_by = null,
    updated_at = now()
where user_id = 'COLE-O-UUID-DO-ADMIN'::uuid
  and status in ('pending', 'active')
  and role = 'member';

select user_id, role, status, approved_at
from public.profiles
where user_id = 'COLE-O-UUID-DO-ADMIN'::uuid;
```

Confira que apenas a sua linha foi alterada e que a leitura mostra `admin` e `active`. Não retire as condições do `WHERE` se a consulta afetar zero linhas.

## 3. Entrar e recuperar senha

Use o e-mail e a senha no site. Se a confirmação de e-mail estiver ligada, primeiro abra o link recebido; depois, o perfil novo já estará ativo. Conta antiga ainda `pending` continua bloqueada e precisa de uma revisão individual.

Em **Esqueci minha senha**, informe o e-mail e peça o link. Por privacidade, a tela não revela se o endereço está cadastrado. Abra o link no mesmo site, defina e confirme a nova senha e depois entre normalmente. Em **Authentication → URL Configuration**, permita a origem exata do site nos URLs de retorno; evite curingas amplos.

O SMTP padrão do Supabase tem limites de envio; a equipe já encontrou `email rate limit exceeded`. Não solicite vários links em sequência: aguarde e tente mais tarde. Um SMTP próprio pode envolver custo e não faz parte desta atualização.

## Segurança e referências

Novos cadastros recebem o menor papel (`member`), sem área nem permissões de administração. As policies RLS continuam sendo a proteção das tabelas; nunca use `service_role` no navegador. Não envie senha, UID, token ou chave em mensagens.

- [Configuração oficial de Auth](https://supabase.com/docs/guides/auth/general-configuration)
- [Gerenciar dados dos usuários](https://supabase.com/docs/guides/auth/managing-user-data)
