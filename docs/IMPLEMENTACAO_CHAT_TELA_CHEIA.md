# Implementação do Chat em tela cheia — SolMar Celeris

## O que foi alterado

- O acesso flutuante de desktop agora abre o Chat em uma camada de tela cheia, acima de toda a navegação.
- Na versão mobile, foi incluído um botão de Chat no conjunto de ações do cabeçalho, à direita do perfil.
- O Chat pode ser fechado pelo botão X e retorna à tela que estava aberta.
- A navegação lateral do Chat ganhou abas Conversas/Grupos e pesquisa de membros/grupos.
- O painel de membros e convites foi movido para o cabeçalho do Chat; o acesso agora é identificado como “Convidar mais membros”.
- As ações de administração de membros passaram a ficar em um menu de três pontos, com opções condicionadas ao papel e ao status do membro.
- O layout da conversa foi adaptado para preencher a área disponível, com rolagem independente e tratamento de safe areas em dispositivos móveis.

## Infraestrutura preservada

A implementação reutiliza `TeamChat.tsx`, `TeamMembersMenu.tsx`, as tabelas, políticas RLS, Storage, Realtime e Edge Functions já presentes no projeto. Não foi criada uma segunda infraestrutura de mensagens nem uma migration adicional.

As funcionalidades de conversa privada, grupos, histórico, anexos, áudio, links do Google Drive, confirmações de leitura e exclusão global continuam usando os serviços existentes.

## Configuração de backend

Antes do deploy, confirme no Supabase a aplicação das migrations já documentadas em `ETAPA_6_CHAT.md`, `ETAPA_10_PUSH_CHAT_ONESIGNAL.md` e `DEPLOY_CHAT_DELETE.md`, além da publicação das Edge Functions usadas pelo projeto. Não execute migrations novamente se já tiverem sido aplicadas.

## Verificação

Os três arquivos TSX alterados passaram pela verificação de sintaxe do compilador TypeScript (`transpileModule`). A compilação completa (`npm run build`) não pôde ser concluída neste ambiente porque as dependências npm não estavam instaladas e o acesso ao registry.npmjs.org falhou por indisponibilidade de DNS. Instale as dependências no ambiente de desenvolvimento e execute `npm run build` antes de publicar.
