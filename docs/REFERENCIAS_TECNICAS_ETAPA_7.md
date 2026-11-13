# Referências técnicas — Etapa 7

Consultadas em 02/11/2026 para orientar perfil/avatar e avisos de atividade. O provedor de e-mail ainda não está configurado; estas fontes informam os passos futuros, não significam que houve envio ou configuração no projeto remoto.

## Supabase Edge Functions e autenticação

- [Criar uma Edge Function pelo Dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard): o editor do Dashboard permite criar, editar, testar e publicar uma função; o guia observa que alterações feitas no editor não têm versionamento/rollback do código.
- [Configuração de Edge Functions](https://supabase.com/docs/guides/functions/function-configuration): a verificação padrão de JWT é configurável por função em `supabase/config.toml`, por exemplo `verify_jwt = false`; desligá-la exige que a função autentique o webhook por outro meio.
- [Proteção de Edge Functions](https://supabase.com/docs/guides/functions/auth): chamadas serviço-a-serviço e webhooks têm modos de autenticação diferentes; quando se usa modo público com validação própria, o segredo deve ser verificado dentro da função. O ambiente de funções pode acessar chaves publicáveis/secretas do Supabase; chaves secretas nunca devem ser incluídas no navegador.
- [Auth Admin — getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid): chamadas `supabase.auth.admin` exigem chave `secret` e devem ocorrer somente em servidor. A função poderá obter endereços de e-mail pelo ID no Auth sem duplicá-los em `profiles` ou expô-los ao front-end.

## Webhooks, pg_net e Vault

- [Database Webhooks](https://supabase.com/docs/guides/database/webhooks): Webhooks executam após o evento no banco e usam `pg_net` de forma assíncrona, evitando bloquear a gravação. A documentação explica que uma chave enviada diretamente em um webhook pode permanecer temporariamente em `net.http_request_queue` e recomenda consultar segredos do Supabase Vault em uma função PostgreSQL `SECURITY DEFINER`.
- [Supabase Vault](https://supabase.com/docs/guides/database/vault): `vault.create_secret` grava segredos cifrados; `vault.decrypted_secrets` permite que função controlada use o valor sem colocá-lo em código-fonte ou grants ao navegador. O acesso à view de segredos deve ser mantido restrito.

## Fotos privadas

- [Controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control): operações no bucket dependem de policies RLS na tabela `storage.objects`; uploads privados não funcionam sem policies explícitas.
- [Fundamentos de buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): buckets privados exigem autorização para download e podem fornecer URLs assinadas temporárias; limite máximo de arquivo e tipos MIME podem ser configurados no bucket.
- [Funções auxiliares do Storage](https://supabase.com/docs/guides/storage/schema/helper-functions): `storage.foldername(name)` pode limitar cada objeto a uma pasta cujo primeiro trecho corresponde ao `auth.uid()`.

## Envio com Resend

- [Domínios verificados no Resend](https://resend.com/docs/dashboard/domains/introduction): antes de enviar e-mail com endereço `from` próprio, é necessário adicionar e verificar um domínio que a equipe controla. O remetente será um endereço fornecido/configurado pelo usuário, não inventado pelo código.

## Caminho selecionado no projeto

O front-end invoca `notify-activity` após uma gravação de atividade/status retornar sucesso. A Edge Function mantém a validação JWT, resolve a identidade com `auth.getUser()`, revalida o perfil ativo, o autor e a permissão de edição, consulta os destinatários por ID e busca e-mails pelo Auth Admin apenas no servidor. A service key e a chave Resend não entram no bundle do navegador. A função registra metadados mínimos e não guarda endereços dos destinatários.

Database Webhooks, `pg_net` e Vault foram consultados como alternativa, mas **não fazem parte** desta implementação: não é criado webhook de banco nem segredo em fila SQL. O cliente só dispara e-mail para alterações feitas pelo site; uma alteração direta no SQL Editor não dispara aviso.
