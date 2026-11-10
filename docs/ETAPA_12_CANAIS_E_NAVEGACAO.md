# Etapa 12 — Canais por área e navegação

Esta etapa evolui o workspace sem recriar nem renumerar os registros existentes.

## O que foi incluído no pacote

- Seletor de canais no cabeçalho, imediatamente antes do perfil; no mobile, a barra fica em uma linha com logo, abas em rolagem horizontal, menu de canais e perfil.
- Canais fixos: Geral, Mecânica Naval, Elétrica, Eletrônica, Gestão de Pessoas, Marketing e Administrativo Financeiro. O banco protege esses sete canais para permanecerem abertos e preservarem nome, slug e área.
- Criação de canais adicionais restrita a Administradores, com opção aberto/privado.
- Gestão administrativa de membros de canais privados (adicionar/remover).
- Geral: Feed, Atividades consolidadas com PERT/CPM, Agenda global, Comunicados, Arquivos e Manual de Conduta.
- Canais de área: Atividades, Comunicados, Arquivos e Manual de Função filtrados pela área.
- Associação por `area_id`: atividades, comunicados e pastas existentes mantêm seus IDs e histórico; registros sem área permanecem no Geral.
- Diretório de membros com e-mail, somente perfis ativos, ações de promoção/rebaixamento e revogação definitiva sem apagar Auth/histórico.
- DM iniciada diretamente pelo diretório e criação de grupos pela própria interface de membros.
- Recibos de leitura com nomes/contagem abaixo das mensagens próprias.
- Manuais por canal com upload PDF/DOCX, extração de texto no navegador, edição inline por Administradores e download do original em Storage privado.
- RLS/RPCs adicionais para impedir que não participantes de canais privados leiam/alterem atividades, atualizações semanais, histórico, anexos, dependências PERT/CPM, WIP, comunicados, respostas, reações, links, enquetes e anexos de Storage.

## Migrations

Depois de `20261110101000_chat_global_delete_member_revocation.sql`, aplicar somente as migrations ainda ausentes, nesta ordem:

1. `supabase/migrations/20261110112000_workspace_channels.sql`
2. `supabase/migrations/20261110113000_workspace_manual_storage.sql`
3. `supabase/migrations/20261110114000_workspace_channels_area_seed_fix.sql`
4. `supabase/migrations/20261110115000_workspace_channel_content_permissions.sql`

A primeira migration associa os canais às áreas existentes e cria `workspace_manuals`. A migration 13000 cria o bucket privado dos documentos originais. A migration 14000 corrige o vínculo da área Elétrica ao slug atual `eletrica` e instala o trigger que mantém os sete canais fixos abertos. A migration 15000 reforça as policies e RPCs de conteúdo por canal.

## Verificação pós-migration

- Entre com uma conta admin e uma conta member e confira os sete canais iniciais.
- Crie um canal privado, adicione um membro e valide com uma terceira conta que o canal só aparece para participantes/admins.
- Confira se atividades, comunicados e pastas de Mecânica Naval e Elétrica aparecem somente nos respectivos canais e se Geral mantém a visão consolidada.
- Em canal privado, tente consultar com conta externa atividades, atualizações, histórico, anexos, PERT/CPM, WIP, comunicados, respostas, reações, enquetes e Storage; as consultas devem ser negadas/sem dados.
- Abra Membros, inicie uma DM pelo ícone de conversa e crie um grupo pelo botão do diretório.
- Envie mensagens em DM/grupo e valide os recibos em desktop e mobile.
- Envie PDF/DOCX com texto selecionável, confirme extração, escolha adicionar/substituir, edite o texto e baixe o original.
- Teste rebaixar um administrador sem permitir rebaixar o último administrador ativo e excluir um membro sem apagar sua conta Auth nem o histórico.

## Limitações conhecidas

- Canais adicionais sem `area_id` podem guardar seu Manual próprio, mas não recebem Atividades, Comunicados ou Arquivos. Para suportar esses módulos em canais arbitrários, será necessária uma etapa futura com `channel_id` explícito nas tabelas correspondentes; isso evita misturar conteúdo de um canal genérico com o Geral.
- A agenda e as disponibilidades continuam globais/consolidadas, conforme a visão solicitada para o Canal Geral.
- A extração de PDF cobre texto disponível em streams do arquivo; PDFs digitalizados, protegidos ou com codificação proprietária podem exigir OCR e inserção do texto pelo editor. DOCX usa o XML Open Office do próprio arquivo.

## Publicação

Nenhuma migration, alteração de Storage ou deploy foi executado no Supabase/Netlify remoto. Revise o histórico de migrations e faça backup antes de aplicar. O build também precisa ser executado em ambiente com dependências instaladas (`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`).
