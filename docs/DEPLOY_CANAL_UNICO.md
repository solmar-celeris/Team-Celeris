# Deploy — canal único e documentação centralizada

## O que mudou

- O workspace exibe somente o canal Geral; o seletor e a interface de criação/remoção de canais foram removidos.
- A API do Supabase bloqueia a criação de canais adicionais para usuários autenticados.
- Arquivos e atalhos associados aos canais antigos são reassociados ao canal Geral sem apagar objetos do Storage.
- Comunicados e pastas anteriormente segmentados por área passam a compor a visão global do workspace.
- Os textos dos manuais antigos são consolidados por tipo no canal Geral; os registros de origem e os caminhos dos arquivos originais ficam preservados em `workspace_manual_archive`.
- A seção Documentação reúne as abas Normas de Conduta e Manuais de Funções.

## Aplicação

1. Faça backup do banco antes de aplicar a migration, especialmente se houver conteúdo institucional personalizado.
2. No Supabase SQL Editor, execute `supabase/migrations/20261113120000_single_general_channel_and_central_documentation.sql`.
3. Publique o frontend atualizado na Cloudflare Pages.
4. Entre com uma conta Administrador e confira Arquivos, Comunicados e Documentação.
5. Confira com uma conta de membro que não aparece seletor de canais e que a documentação está acessível.

Esta alteração não exige Edge Functions novas. A migration é necessária para consolidar os dados e impedir a criação de canais diretamente pela API.

## Observação sobre o histórico

A migration mantém as áreas organizacionais e os vínculos de atividades por área. O que deixa de existir são os canais separados. Pastas e comunicados tornam-se globais, e os arquivos antigos permanecem armazenados. A tabela `workspace_manual_archive` preserva os metadados dos manuais antigos e seus caminhos de Storage.
