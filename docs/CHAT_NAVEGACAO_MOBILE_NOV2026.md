# Navegação mobile do Chat — novembro de 2026

- Em telas móveis, a lista de integrantes/grupos funciona como tela inicial do Chat.
- Ao selecionar um integrante ou grupo, a lista é substituída por uma tela dedicada à conversa, ocupando a área disponível.
- O cabeçalho da conversa apresenta botão de voltar, avatar e nome; grupos também exibem acesso às opções de adicionar participantes.
- O botão voltar limpa a conversa selecionada e retorna à lista sem alterar a pesquisa ou a aba selecionada.
- Histórico mantém rolagem própria e o compositor permanece na parte inferior, respeitando safe areas do dispositivo.
- Em desktop, a navegação lateral e o painel de mensagens permanecem lado a lado.

A implementação reutiliza os estados, serviços, consultas, RPCs e componentes existentes. Nenhuma tabela ou migration adicional foi criada para esta alteração de interface.
