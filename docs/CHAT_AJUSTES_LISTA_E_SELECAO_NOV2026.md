# Ajustes do Chat — lista compacta e seleção persistente

- A lista de integrantes agora usa linhas compactas de altura fixa, alinhadas no início e com rolagem vertical própria.
- O menu de três pontos permanece ao lado de cada integrante.
- A seleção da conversa privada ou do grupo é preservada na `sessionStorage` por usuário, inclusive ao fechar e reabrir o painel do Chat no navegador.
- Ao voltar explicitamente para a lista ou selecionar Equipe, a seleção persistida é limpa.
- Nenhuma tabela, migration ou Edge Function foi adicionada.

Validação: alterações revisadas no código e no CSS. Build de produção não executado neste ambiente por ausência das dependências instaladas.
