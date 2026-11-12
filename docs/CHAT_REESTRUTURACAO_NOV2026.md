# Reestruturação do Chat — SolMar Celeris

## Alterações

- `src/features/workspace/TeamChat.tsx`
  - A aba Conversas passa a listar diretamente todos os integrantes ativos recebidos do workspace, exceto a própria conta.
  - A busca da barra lateral filtra integrantes pelo nome e grupos pelo nome.
  - O clique no integrante chama a RPC existente `get_or_create_team_chat_direct_conversation`, que reutiliza a conversa existente ou cria uma única conversa para o par.
  - Removido o botão independente de conversa privada e o seletor separado de integrantes.
  - Menu de três pontos por integrante com ações contextuais: abrir conversa e, quando existente, apagar a conversa.
  - O convite por e-mail foi colocado ao final da lista e reutiliza a Edge Function `manage-team-members` com `action: invite`.
  - A criação de grupos é exibida somente para administradores e também é bloqueada no fluxo do componente para usuários não administradores.
- `src/features/workspace/team-chat.css`
  - Lista de integrantes com rolagem vertical independente em desktop e mobile.
  - Navegação mobile reorganizada para manter abas, busca e integrantes visíveis sem exigir um botão intermediário.
  - Estilos do menu contextual e do convite, preservando as variáveis e cores institucionais.
- `supabase/migrations/20261112130000_chat_group_creation_admin_only.sql`
  - Restringe a criação de grupos a administradores ativos no trigger e na política RLS de INSERT.

## Supabase / publicação

Aplicar a migration `20261112130000_chat_group_creation_admin_only.sql` no projeto Supabase antes de disponibilizar a nova interface. Ela não cria tabelas nem altera o modelo de mensagens, conversas privadas, participantes, anexos ou Realtime.

Nenhuma Edge Function nova foi criada ou alterada. O convite continua utilizando a Edge Function existente `manage-team-members`; a publicação dela não é necessária se a versão atualmente implantada já suporta `action: invite`.

## Build e validação

- A análise estática do arquivo `TeamChat.tsx` não encontrou erros de parsing TSX.
- O build de produção não pôde ser concluído neste ambiente: as dependências não estavam instaladas e a instalação via npm falhou porque o ambiente não conseguiu resolver `registry.npmjs.org` (falha de DNS). Portanto, não declarar o build como aprovado.
- Executar `pnpm install` e `pnpm build` em ambiente com acesso ao registry antes da publicação.
- Validar no Supabase, com uma conta não administradora, que INSERT em `team_chat_groups` é recusado pela RLS/trigger; validar com administrador a criação e a entrada automática do criador no grupo.
- Testar em navegador desktop e mobile a abertura de conversa existente/nova, busca, convite e envio de mensagens/anexos/áudio.

## Observações

A lista depende dos perfis ativos que o componente `TeamWorkspace` fornece ao Chat. Indicador de presença online não foi inventado: o tipo de perfil atualmente utilizado não expõe uma presença em tempo real.
