# Correção do layout do Chat — novembro de 2026

## Alterações

- Removida a faixa interna do Chat no desktop, incluindo identificação da conversa, nome/ícone e botão manual **Atualizar**; o nome da conversa continua identificado na lista lateral.
- Ocultados os títulos e o rodapé da página de Chat que consumiam altura sem contribuir para a conversa; a área de integrantes e conversas permanece na lateral.
- Reestruturados os contêineres desktop do Chat com flex, deixando o histórico como área de rolagem independente e mantendo o compositor no rodapé do painel.
- Eliminadas regras mobile duplicadas e o drawer antigo. Na conversa mobile, o cabeçalho da conversa permanece acima do histórico e o compositor é mantido no rodapé.
- Adicionado acompanhamento de `window.visualViewport` para atualizar a altura e o deslocamento da tela quando o teclado virtual abre ou altera a área visível. A rolagem de `html` e `body` é bloqueada durante a conversa mobile e restaurada ao sair dela.
- Mantidos os recuos de área segura (`env(safe-area-inset-*)`). As ações de foto e inclusão de pessoas em grupos foram movidas do cabeçalho desktop para um bloco contextual na lista lateral.
- Preservados os carregamentos silenciosos acionados por Supabase Realtime; não houve alteração em autenticação, tabelas, RLS, Storage, mensagens ou políticas.

## Verificação

- `pnpm install --frozen-lockfile`: concluído.
- `pnpm build`: concluído; `tsc -b` e `vite build` sem erros.
- Chromium headless, desktop: o cabeçalho interno ficou oculto, a lista lateral permaneceu visível, o histórico teve rolagem própria e o compositor permaneceu no rodapé da área disponível, sem rolagem adicional da página.
- Chromium headless, mobile com conversa: cabeçalho da conversa visível no topo, histórico ocupando o espaço restante, compositor no limite inferior da altura visual simulada e página sem rolagem adicional.
- Chromium headless, mobile sem conversa selecionada: lista de conversas ocupou a área disponível e manteve rolagem independente.
- Realtime: inspeção do código confirmou a inscrição `postgres_changes` e os recarregamentos silenciosos acionados por eventos/conexão.

A validação mobile foi feita em viewport simulada no Chromium, não em aparelho Android físico. Também não foi feito teste ponta a ponta com sessão real do Supabase; as alterações ficaram restritas à interface e ao comportamento de viewport.
