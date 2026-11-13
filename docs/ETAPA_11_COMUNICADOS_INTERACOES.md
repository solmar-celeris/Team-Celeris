# Respostas e reações nos comunicados

Esta etapa adiciona respostas e reações (👍, ❤️, 😂, 👏 e 🔥) aos comunicados existentes. Toda pessoa com perfil `active` pode visualizar e participar, independentemente da área indicada no comunicado, seguindo a permissão atual do mural. O autor pode remover a própria resposta e uma pessoa Administradora ativa pode moderar respostas. Cada pessoa pode usar uma vez cada reação em cada comunicado e pode desfazê-la clicando novamente.

## Aplicar no Supabase

1. Abra o mesmo projeto Supabase que o site existente usa.
2. Em **SQL Editor**, crie uma consulta e cole o conteúdo integral de `supabase/migrations/20261104101500_announcement_replies_reactions.sql`.
3. Confira o projeto selecionado e execute uma única vez. A migration cria tabelas próprias, policies RLS e canais de Realtime. Não altera a tabela original de comunicados, não apaga dados e não pede que o RLS seja desligado.
4. Aguarde a mensagem de sucesso. Se o arquivo já foi aplicado com sucesso, não o execute novamente.

## Publicar o site

Depois que a migration for concluída, atualize o repositório que já alimenta o Netlify com os arquivos do pacote desta versão e publique normalmente. Não crie outro projeto Netlify ou Supabase. Se ainda não aplicou a migration, a interface mostra que as interações estão indisponíveis; não tente contornar o aviso desativando políticas.

## Conferir o resultado

Entre com duas contas de perfil `active` e abra Comunicados. Em um comunicado de teste, publique uma resposta na primeira sessão e confirme que ela aparece na segunda. Use uma reação; confirme a contagem e que a outra sessão pode reagir também. Clique de novo na reação da primeira conta para removê-la. Confirme que o autor consegue remover a própria resposta e que uma conta Administradora ativa consegue moderar uma resposta de teste de outra pessoa. Perfis não ativos não devem ter acesso às interações.

## Segurança e dados

O banco deriva autoria e data da sessão autenticada; o navegador não pode declarar outro autor. Apenas perfis ativos leem e criam interações. Cada pessoa só pode desfazer as próprias reações. O texto de resposta pode ter até 2.000 caracteres; ao remover, o texto é substituído por `[Resposta removida]`. Respostas e reações usam tabelas separadas das publicações originais e não alteram a remoção de comunicados.
