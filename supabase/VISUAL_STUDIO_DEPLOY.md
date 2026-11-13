# Team Celeris — Visual Studio / função Desenvolvedor

## O que foi incluído

- Nova função `developer` no enum `public.app_role`.
- Atribuição/revogação da função por Administradores ativos, pelo menu de ações de membro no Chat.
- Área separada `Visual Studio`, aberta automaticamente para perfis `developer`.
- Construtor runtime-driven de páginas: título, texto, botão/link, imagem, anexos, câmera e formulário.
- Componentes reordenáveis, propriedades de cor/tamanho/alinhamento e visualização desktop/tablet/mobile.
- Rascunhos no Supabase, publicação sem rebuild do frontend, histórico e restauração para rascunho.
- Página publicada acessível por `/?page=slug` para qualquer integrante ativo autenticado.
- Upload privado de assets e recebimento básico de formulários.

## Aplicar no Supabase

Execute a migration abaixo no SQL Editor do projeto Supabase, depois de todas as migrations anteriores:

`supabase/migrations/20261113090000_visual_studio_developer_role.sql`

Ela cria as tabelas `developer_pages`, `developer_page_versions`, `developer_audit_logs` e `developer_form_submissions`, o bucket privado `developer-assets`, políticas RLS, RPCs de publicação/restauração e a RPC administrativa `admin_set_developer_role`.

## Publicar Edge Functions

Com o Supabase CLI autenticado e vinculado ao projeto correto:

```bash
supabase functions deploy developer-publish
supabase functions deploy developer-restore-version
```

As duas funções usam o JWT do usuário e chamam RPCs que validam novamente a função `developer` no banco. Não configure nem exponha a `service_role` no frontend.

## Conceder a função Desenvolvedor

1. Entre no Team Celeris com uma conta Administrador.
2. Abra o Chat e a lista de integrantes.
3. No menu de ações de uma pessoa ativa, escolha **Tornar Desenvolvedor**.
4. A pessoa deverá sair e entrar novamente (ou atualizar a sessão) para abrir o Visual Studio.

A função é independente da Administração. Ao revogar Desenvolvedor, o perfil volta à função que tinha antes (Membro, Líder de área ou Leitor), preservada pela migration.

## Usar o Visual Studio

- Crie uma página pelo botão `+` da seção Páginas.
- Adicione elementos pela biblioteca lateral.
- Selecione um elemento para editar conteúdo, tamanho, cor, fundo e alinhamento.
- Arraste os elementos na área central ou use os controles de camadas para reorganizar.
- Salve o rascunho e publique quando estiver pronto.
- Após publicar, copie o link `/?page=slug` pelo ícone de cópia no topo.
- O histórico registra cada publicação. Restaurar uma versão carrega seu conteúdo como rascunho; é preciso publicar novamente para torná-la atual.

## Limites importantes desta primeira versão

- O Visual Studio cria e publica páginas dinâmicas compostas pelos componentes registrados. As telas React antigas (Chat, Canais, Atividades, Calendário e demais módulos) ainda são componentes fixos e não podem ser rearranjadas livremente pelo editor.
- O componente Formulário publicado salva Nome, E-mail e Mensagem em `developer_form_submissions`; somente Desenvolvedores podem ler as respostas.
- O componente Câmera solicita permissão do navegador e permite capturar uma imagem localmente. A captura não é enviada automaticamente em páginas publicadas.
- O componente Anexos permite ao Desenvolvedor enviar arquivos privados para a página; usuários ativos podem abrir os anexos publicados.
- Novos tipos de componentes, novas integrações e alterações na lógica React/Edge Functions ainda exigem deploy de código. Alterações de conteúdo e layout dentro do conjunto de componentes existente não exigem novo deploy.

## Verificação de segurança

- O perfil `developer` não recebe permissões administrativas.
- Administradores não recebem acesso ao editor automaticamente.
- RLS restringe rascunhos, versões, logs e uploads à função Desenvolvedor.
- Formulários aceitam inserção apenas de integrante ativo e para página publicada.
- Não há execução de JavaScript arbitrário inserido pelo editor.
