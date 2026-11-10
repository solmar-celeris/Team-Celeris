# Etapa 12 — Canais por área e navegação

Esta etapa evolui o workspace sem recriar nem renumerar os registros existentes.

## O que foi incluído no pacote

- Seletor de canais no cabeçalho, imediatamente antes do perfil; no mobile, a barra fica em uma linha com logo, abas em rolagem horizontal, menu de canais e perfil.
- Canais fixos: Geral, Mecânica Naval, Elétrica, Eletrônica, Gestão de Pessoas, Marketing, Administrativo Financeiro e TI. Geral permanece sempre aberto; Administradores podem alterar a privacidade dos demais canais fixos e dos canais adicionais, preservando nome, slug e área.
- Criação de canais adicionais restrita a Administradores, com opção aberto/privado.
- Gestão administrativa de membros de canais privados (adicionar/remover).
- Geral: Feed, Atividades consolidadas com PERT/CPM, Agenda global, Comunicados, Arquivos e Manual de Conduta.
- Canais de área: Atividades, Comunicados, Arquivos e Manual de Função filtrados pela área.
- Associação por `area_id`: atividades, comunicados e pastas existentes mantêm seus IDs e histórico; registros sem área permanecem no Geral.
- Diretório de membros com e-mail, somente perfis ativos, ações de promoção/rebaixamento e revogação definitiva sem apagar Auth/histórico.
- DM iniciada diretamente pelo diretório e criação de grupos pela própria interface de membros; o Chat não aparece mais como guia principal e só é aberto por Membros.
- Recibos de leitura com nomes/contagem abaixo das mensagens próprias.
- Manuais por canal com upload PDF/DOCX, extração de texto no navegador, edição inline por Administradores, editor de formatação e download do original em Storage privado. O Manual Administrativo-Financeiro utiliza o mesmo cartão de função dos demais canais.
- RLS/RPCs adicionais para impedir que não participantes de canais privados leiam/alterem atividades, atualizações semanais, histórico, anexos, dependências PERT/CPM, WIP, comunicados, respostas, reações, links, enquetes e anexos de Storage.

## Migrations

Depois de `20261110101000_chat_global_delete_member_revocation.sql`, aplicar somente as migrations ainda ausentes, nesta ordem:

1. `supabase/migrations/20261110112000_workspace_channels.sql`
2. `supabase/migrations/20261110113000_workspace_manual_storage.sql`
3. `supabase/migrations/20261110114000_workspace_channels_area_seed_fix.sql`
4. `supabase/migrations/20261110115000_workspace_channel_content_permissions.sql`
5. `supabase/migrations/20261110160000_workspace_it_privacy_and_channel_files.sql`

A primeira migration associa os canais às áreas existentes e cria `workspace_manuals`. A migration 13000 cria o bucket privado dos documentos originais. A migration 14000 corrige o vínculo da área Elétrica ao slug atual `eletrica` e instala a proteção inicial dos canais fixos; a migration 16000 atualiza essa proteção para permitir privacidade editável, mantendo Geral aberto. A migration 15000 reforça as policies e RPCs de conteúdo por canal. A migration `20261110160000` inclui o canal TI, permite alterar privacidade dos canais existentes (Geral permanece aberto) e cria a tabela/bucket privados para arquivos e atalhos de internet por canal.

## Verificação pós-migration

- Entre com uma conta admin e uma conta member e confira os sete canais iniciais.
- Crie um canal privado, adicione um membro e valide com uma terceira conta que o canal só aparece para participantes/admins.
- Confira se atividades, comunicados e pastas de Mecânica Naval e Elétrica aparecem somente nos respectivos canais e se Geral mantém a visão consolidada.
- Em canal privado, tente consultar com conta externa atividades, atualizações, histórico, anexos, PERT/CPM, WIP, comunicados, respostas, reações, enquetes e Storage; as consultas devem ser negadas/sem dados.
- Abra Membros, inicie uma DM pelo ícone de conversa e crie um grupo pelo botão do diretório.
- Envie mensagens em DM/grupo pelo diretório Membros e valide os recibos em desktop e mobile. Confirme que não existe guia Chat junto de Comunicados.
- Envie PDF/DOCX com texto selecionável, confirme extração, escolha adicionar/substituir, edite o texto com tamanho, negrito, itálico e marca-texto, e baixe o original. O Manual Administrativo-Financeiro deve apresentar o mesmo cartão de função usado nos demais canais.
- Altere um canal aberto para privado e de volta para aberto; confirme que Geral não pode ser tornado privado.
- Em Arquivos, alterne blocos/listas, envie Word, Excel, PowerPoint e PDF, e adicione um atalho HTTPS.
- Teste rebaixar um administrador sem permitir rebaixar o último administrador ativo e excluir um membro sem apagar sua conta Auth nem o histórico.

## Limitações conhecidas

- Canais adicionais sem `area_id` podem guardar Manual e arquivos/atalhos próprios. Atividades e Comunicados ainda usam o vínculo `area_id` legado; para canais genéricos sem área, esses dois módulos continuam indisponíveis até uma migração própria com `channel_id` explícito.
- A agenda e as disponibilidades continuam globais/consolidadas, conforme a visão solicitada para o Canal Geral.
- A extração de PDF cobre texto disponível em streams do arquivo; PDFs digitalizados, protegidos ou com codificação proprietária podem exigir OCR e inserção do texto pelo editor. DOCX usa o XML Open Office do próprio arquivo.

## Publicação

Nenhuma migration, alteração de Storage ou deploy foi executado no Supabase/Netlify remoto. Revise o histórico de migrations e faça backup antes de aplicar. O build também precisa ser executado em ambiente com dependências instaladas (`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`).
