# Etapa 1 — criar o banco Supabase

Esta etapa cria a estrutura do banco e importa as 58 atividades de exemplo. Ainda não cria conta para ninguém, não publica o site e não usa dados reais da equipe.

## Região brasileira confirmada

A documentação atual do Supabase lista a região **South America (São Paulo), `sa-east-1`**. O usuário escolheu Brasil quando disponível; portanto, selecione exatamente essa opção ao criar o projeto. Se ela não aparecer no menu da sua conta, pare antes de criar e consulte a equipe. Não escolha outra região por conta própria. O Supabase informa que uma mudança posterior exige criar outro projeto e migrar os dados [1] [2].

O banco Postgres e Auth ficarão na região escolhida. As Edge Functions executam perto da pessoa que chama por padrão; chamadas administrativas serão fixadas em `sa-east-1` para acompanhar a escolha da equipe. A documentação informa que uma chamada fixada não é redirecionada automaticamente para outra região se São Paulo estiver indisponível [3].

## Criar o projeto

1. Abra [Supabase Dashboard](https://supabase.com/dashboard) e entre ou crie sua conta.
2. Clique em **New project**. Se necessário, crie uma organização da equipe.
3. Use **SolMar Celeris** como nome do projeto.
4. Crie uma senha forte e exclusiva para o banco. Guarde-a num gerenciador de senhas; não a coloque no site e não a envie pelo chat.
5. No campo **Region**, selecione **South America (São Paulo)** ou **sa-east-1**. Se essa opção não estiver disponível, pare e confirme com a equipe. Aguarde o projeto ficar pronto.

## Aplicar esquema e atividades

1. No painel do projeto, abra **SQL Editor** e clique em **New query**.
2. Abra e copie o arquivo [migração SQL inicial](../supabase/migrations/20261101184000_initial_schema.sql). Copie o conteúdo inteiro, cole no editor SQL e clique em **Run**.
3. Aguarde a confirmação de sucesso. Se aparecer erro, pare e compartilhe a mensagem (sem senhas ou tokens); não cole nem execute alterações avulsas para “consertar”. O script usa uma transação para evitar uma instalação parcial.
4. No SQL Editor, abra uma consulta nova, cole e execute:

```sql
select count(*) as atividades from public.activities;
select count(*) as areas from public.areas;
select count(*) as nucleos from public.nuclei;
select cycle_start, cycle_weeks from public.team_settings where id = 1;
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','activities','weekly_updates','drive_folders','announcements','audit_log')
order by tablename;
```

O esperado é **58 atividades**, **8 áreas**, **2 núcleos**, início **2026-11-09**, **60 semanas** e `rowsecurity = true` para todas as tabelas da última consulta.

## Importante

- Não habilite cadastro público durante a configuração inicial. A ativação automática só entra em vigor depois de executar a migration incremental `20261102160000_auto_activate_new_signups.sql`.
- Não envie a senha do banco, a chave `service_role` ou tokens. Nunca coloque a `service_role` no navegador.
- Decisão atual da equipe: novos cadastros públicos por e-mail/senha ficam ativos automaticamente como Integrante depois da migration. Qualquer pessoa que conseguir se cadastrar poderá acessar os dados compartilhados permitidos pela RLS. A confirmação de e-mail do Supabase, se ativada, permanece independente. Veja o [guia de login](./ETAPA_2_LOGIN.md).
- A URL do projeto e a chave **publishable** são valores públicos destinados ao cliente web. No Netlify/Vercel, configure-as como variáveis de build `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; nunca use uma chave secreta no front-end.

## Fontes oficiais consultadas em 01/11/2026

[1]: https://supabase.com/docs/guides/platform/regions "Available regions"
[2]: https://supabase.com/kb/troubleshooting/change-project-region-eWJo5Z "Change Project Region"
[3]: https://supabase.com/docs/guides/functions/regional-invocation "Regional Invocations"
