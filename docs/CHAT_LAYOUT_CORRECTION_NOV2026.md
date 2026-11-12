# Ajustes do Chat — novembro de 2026

## Alterações

A interface não mostra mais o atalho **Equipe** na lista de conversas. Isso remove apenas a opção visual; não apaga mensagens, grupos ou dados. Também foram retiradas as etiquetas “Privado” e “Conversa privada”, inclusive o texto descritivo junto ao contador do compositor. O espaço abaixo do nome fica sem subtítulo.

O separador de data agora é uma pílula compacta, com largura ajustada ao texto e centralizada. Na versão mobile, há um botão **X** tanto na tela da lista como no cabeçalho da conversa; ambos fecham o overlay de Chat por meio do callback já usado pelo botão de fechar do overlay.

As correções anteriores de desktop e teclado mobile continuam: histórico com rolagem independente, compositor no rodapé da área visível, acompanhamento de `window.visualViewport`, bloqueio/restauração da rolagem da página e respeito às áreas seguras. Os recarregamentos silenciosos e inscrições `postgres_changes` do Supabase Realtime foram mantidos.

## Verificação

`pnpm build` concluiu sem erros de TypeScript ou Vite. No Chromium headless, verifiquei os estados mobile com e sem conversa selecionada: o X de cada estado aparece dentro do cabeçalho e o compositor permanece no rodapé da altura simulada, sem rolagem adicional da página. O separador de data mediu 123 × 17 px na viewport de teste e ficou centralizado (desvio medido: 0 px) tanto no desktop como no mobile.

A inscrição Supabase Realtime e as chamadas de atualização automática continuam no código. Não foi feito teste em aparelho Android físico nem com uma sessão real do Supabase.
