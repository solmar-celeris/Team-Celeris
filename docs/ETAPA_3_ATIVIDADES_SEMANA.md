# Etapa 3 — usar as abas Semana e Atividades

Este guia descreve as abas operacionais. Para as abas acrescentadas depois, consulte o [guia Arquivos e Comunicados](./ETAPA_5_ARQUIVOS_COMUNICADOS.md). Não use a demonstração visual com dados fictícios como se fosse o banco da equipe.

## Primeiro acesso

Depois que o administrador aprovar o perfil, saia e entre novamente no site atualizado. A conta precisa estar com status `active`. O app deve abrir em **Semana**; o menu permite alternar entre **Semana**, **Atividades**, **Arquivos** e **Comunicados**. Se ainda aparecer a tela de login, confira o guia [atualização Netlify/Supabase](../INSTRUCOES_NETLIFY_SUPABASE.md).

## Registrar a semana

1. Em **Semana**, escolha a semana do ciclo no seletor. A aplicação lê o início e a duração em `team_settings`; o padrão inicial é segunda-feira, 09/11/2026, por 60 semanas.
2. Confira as atividades previstas. A frequência, a janela de datas e o tipo determinam quando cada atividade aparece. Uma atividade sem registro mostra o aviso amarelo **Sem atualização** e o valor inicial **Não iniciado**.
3. Escolha **Concluído**, **Em andamento**, **Pendente**, **Não se aplica** ou **Não iniciado** e clique em **Salvar status**. Para **Pendente**, preencha primeiro a justificativa; o formulário e o banco recusam justificativa vazia.
4. Se não houve movimentação ou necessidade, especialmente numa atividade financeira, escolha **Não se aplica**. Isso não significa conclusão e não é contado como pendência.
5. A tela informa sucesso ou mostra o erro do banco. Se outro integrante atualizou os dados, use **Atualizar** para recarregar.

## Consultar e manter atividades

Abra **Atividades** para ver o código, núcleo/área, tipo, responsável, datas, entregável, observações e situação geral. Use o campo de busca e os filtros de responsável, núcleo, área, tipo, situação e datas. **Limpar filtros** restaura a lista.

O botão **Nova atividade** e o botão **Editar atividade** aparecem apenas para perfis com permissão. O código é gerado pelo banco. Os campos seguem as regras: Marco exige data inicial e prazo; Pontual exige prazo; Rotina exige frequência Semanal, Quinzenal ou Mensal; Condicional exige condição de execução. Uma data inicial não pode ser posterior ao prazo.

Ao atribuir uma pessoa, selecione-a também em **Vincular à conta da equipe**. Digitar apenas o nome do responsável não vincula a atividade à identidade de login e, por isso, não libera a gravação semanal de um perfil Membro.

## O que cada perfil pode fazer nesta etapa

| Perfil | Acesso Semana/Atividades |
| --- | --- |
| Administrador | Visualiza e edita atividades e status de qualquer área. |
| Líder de área | Visualiza a equipe; edita atividades e status somente da área associada ao perfil. |
| Membro | Visualiza a equipe; atualiza o status de atividades atribuídas à sua conta. |
| Leitor | Somente visualiza. |

Essa matriz é específica às atividades. Para **Arquivos e Comunicados**, todos os perfis ativos podem ver e gerenciar todos os itens; consulte o guia da Etapa 5. Visitantes e perfis `pending`/`suspended` não acessam dados. O Supabase RLS valida as gravações; não tente resolver erro desativando RLS ou usando `service_role` no navegador.

## Regras de expectativa e situação

- Semanal: aparece todas as semanas; Quinzenal: semanas alternadas desde o início do ciclo; Mensal: primeira semana do mês.
- Condicional: aparece semanalmente durante a janela de datas.
- Marco e Pontual: aparecem na janela entre início e prazo e deixam de aparecer nas semanas posteriores à conclusão.
- Uma semana passada esperada, sem registro, aparece como **Sem atualização**. A falta de atualização é um alerta separado e não é convertida silenciosamente em Pendente.
- Marco/Pontual fica Concluído se alguma semana foi concluída; sem isso, fica Atrasado quando o prazo passou; caso contrário, mostra o último status registrado.
- Rotina/Condicional fica Atrasado se alguma semana anterior foi registrada como Pendente; caso contrário, mostra o último status, ignorando Não se aplica.

## Se a atualização for bloqueada

1. Confirme que o perfil está ativo e que entrou na conta aprovada.
2. Para Membro, peça ao administrador para vincular sua conta à atividade. Para Líder de área, confirme a área associada ao perfil.
3. Atualize a página ou clique em **Atualizar**. Se o erro persistir, envie ao administrador o texto do erro sem incluir senha, URL/chave do Supabase ou token.
4. Não apague registros nem rode a migração SQL novamente só por causa de uma falha de acesso. As permissões devem ser corrigidas no perfil ou na política correspondente.

Painel avançado/gráficos, administração de usuários, importação/exportação e PWA continuam em etapas futuras. Arquivos e Comunicados estão descritos em seu guia próprio.
