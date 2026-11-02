# Etapa 8 — grupos de Chat e novos cadastros

Esta atualização altera a navegação (ícones e ordem), acrescenta grupos privados ao Chat e faz novos cadastros nascerem ativos como Integrantes. O site continua no mesmo repositório/Supabase/Netlify.

## Aplicar as migrations

No **SQL Editor** do mesmo projeto Supabase do site, abra **New query**, cole o conteúdo integral de **um único arquivo** e clique **Run**. Espere sucesso antes do próximo. Não reaplique arquivo já executado.

| Ordem | Arquivo | Efeito |
|---|---|---|
| 1 | `20261102135200_team_chat.sql` | Sala geral, RLS e Realtime do Chat; pule se já executada. |
| 2 | `20261102160000_auto_activate_new_signups.sql` | Perfis de novos cadastros passam a ser `active/member`; perfis antigos permanecem inalterados. |
| 3 | `20261102161000_team_chat_groups.sql` | Grupos, participantes, isolamento RLS e publicação Realtime; mensagens existentes continuam na sala geral. |

As migrations anteriores do banco, Arquivos/Comunicados e Perfil/Fotos também precisam estar aplicadas conforme [o manual principal](../INSTRUCOES_NETLIFY_SUPABASE.md). Se não souber se uma migration já foi executada, pare e confira em vez de rodá-la de novo.

## Cadastro automático

A inscrição pública passa a dar acesso aos dados compartilhados a qualquer pessoa que consiga criar uma conta. Todos os novos perfis começam como `member` sem área, não como Administrador. Se a confirmação de e-mail já estiver habilitada no Supabase Auth, o usuário ainda precisa abrir o e-mail de confirmação; esta atualização não muda essa configuração.

Contas que já estavam `pending` antes da migration continuam pendentes. A migration não altera perfis antigos nem suas permissões.

## Grupos de Chat

A aba **Chat** preserva a conversa geral para pessoas ativas e permite criar um grupo, dar um nome, incluir contas ativas e adicionar outras pessoas mais tarde. O criador entra automaticamente. Só integrantes ativos do grupo e Administradores ativos podem ler seu histórico; a RLS do Supabase, não apenas a interface, aplica essa regra. Mensagens do grupo e da sala geral chegam em tempo real. Somente Administradores ativos podem remover mensagens. Mensagens não disparam e-mail.

Depois do deploy e das migrations, teste com duas contas ativas: crie um grupo com a primeira, adicione a segunda e troque mensagens. A primeira e a segunda devem ver o histórico sem recarregar; uma terceira conta ativa que não foi adicionada não deve ver o grupo nem suas mensagens. Teste remoção somente em mensagem sem conteúdo sensível.
