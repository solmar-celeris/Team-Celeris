# Plano de implementação — SolMar Celeris · Gestão

## Escopo e arquitetura

Converter o protótipo recebido (`SolMar_Celeris_App.html`, com 58 atividades) em um app de equipe em português brasileiro, mantendo as cinco áreas de uso e as regras funcionais descritas no pedido. O visual será mobile-first, com modo claro/escuro e PWA instalável.

- **Front-end:** React + TypeScript + Vite, organizado em módulos; reutilizar a identidade, paleta e comportamento do protótipo em vez de redesenhá-lo do zero.
- **Dados, login e atualização em tempo real:** Supabase (PostgreSQL, Auth e Realtime), escolha explicitamente aprovada pelo usuário. O front-end usará apenas `VITE_SUPABASE_URL` e a chave pública/publishable do projeto. Nenhuma `service_role` ou credencial privilegiada será incluída no bundle.
- **Região e cadastro/aprovação:** o projeto existente usa **South America (São Paulo), `sa-east-1`**, conforme a decisão do usuário. O usuário escolheu ativação automática de novos cadastros: após a migration incremental, cada novo perfil nasce `active`, com papel fixo `member` e sem área. Isso dá acesso ao espaço da equipe a qualquer pessoa que consiga se cadastrar; não há aprovação manual para novas contas. Contas que já estavam `pending` antes da migration permanecem inalteradas. RLS continua bloqueando visitantes sem sessão e perfis suspensos.
- **Hospedagem:** Netlify é a hospedagem que o usuário já usa, com build estático Vite; Vercel fica como alternativa, não será configurada nesta etapa. A atualização é feita no mesmo repositório e site, com variáveis públicas Vite. Nenhum segredo de produção será copiado ao ZIP.
- **Privacidade e PWA:** guardar apenas identificador, nome/e-mail, área, perfil, autorização e dados operacionais necessários. Histórico guarda ator, data/hora, ação e somente os campos alterados relevantes. O service worker poderá armazenar a casca estática da aplicação, mas não cacheará páginas/dados autenticados, respostas do banco nem tokens; sem rede, o app indicará indisponibilidade sem exibir cópia local de dados. A configuração do projeto informa analytics da plataforma ativos por padrão; perguntar ao usuário antes de manter ou desativar analytics e badge antes da publicação.
- **Autenticação:** login e cadastro por e-mail/senha; novos registros são automaticamente `active/member` por trigger no banco. A confirmação de e-mail, se habilitada nas configurações existentes do Supabase, continua obrigatória e é independente da ativação do perfil. A migration não modifica contas já criadas nem desativa a confirmação. Recuperação de senha usa link Supabase de uso único; respostas não revelam se o e-mail existe.

## Modelo de dados

1. `areas`: nome, sigla, núcleo, ativa e informação funcional. Núcleos e áreas iniciais vêm do pedido; TI também presta suporte ao Núcleo de Gestão e Projetos consolida o acompanhamento.
2. `profiles`: referência ao usuário do Supabase Auth, nome, área, papel (`admin`, `area_lead`, `member`, `reader`), situação (`pending`, `active`, `suspended`) e datas/ator de aprovação; a migração incremental acrescentará somente o caminho do avatar privado. O e-mail fica apenas no Auth; somente a Edge Function consulta esses e-mails para notificações.
3. `activities`: código automático, núcleo/área, nome, descrição, tipo, frequência, condição, responsável, início, prazo, entregável, observações e autoria/datas. O status geral é derivado dos registros semanais e regras de prazo.
4. `weekly_updates`: atividade, início da semana, status, justificativa, autor e data/hora; unicidade por atividade/semana. Justificativa obrigatória se `Pendente`. `Não se aplica` é um registro explícito, excluído dos cálculos de conclusão e cobrança.
5. `team_settings`: início do ciclo, padrão `2026-11-09`, duração 60 semanas e opções necessárias.
6. `drive_folders`: nome, URL validada, área opcional (nulo = Geral), indicação da pasta principal, autoria, remoção e confirmação.
7. `announcements`: título, mensagem, audiência (equipe/área), autor, data/hora, fixação e remoção.
8. `audit_log`: tipo e ID do registro, ator, horário, ação e diff mínimo de campos relevantes; sem guardar tokens, senhas ou conteúdo integral de arquivos do Drive.
9. `team_chat_messages`: mensagens de texto com `group_id` nulo para a sala geral compartilhada ou preenchido para um grupo; autor/data derivados da sessão/banco, RLS por associação ao grupo e remoção administrativa que substitui o corpo pelo marcador de remoção; sem anexos ou expiração automática.
10. `team_chat_groups`: grupos com nome, criador e data; criados por perfis ativos.
11. `team_chat_group_members`: associação de cada grupo com contas ativas e autoria/data da inclusão. Membros e Administradores podem ver mensagens do grupo; pessoas de fora e contas não ativas não podem ler.

Todas as tabelas privadas terão RLS `default-deny`. Políticas distinguem pessoa ativa, Administrador, Líder da área e Membro responsável. Qualquer perfil ativo pode ler, cadastrar e remover pastas, definir a principal, e publicar/fixar/desafixar/remover comunicados de todas as áreas; visitantes e contas não ativas continuam bloqueados. Qualquer perfil ativo pode ler/enviar na sala geral e criar grupos; participantes de um grupo podem adicionar outras contas ativas. Mensagens de grupo ficam restritas a participantes e Administradores; apenas Administradores ativos podem remover mensagens. Só a pessoa ativa pode alterar o próprio nome/avatar; papel, área e estado não são editáveis pelo cliente. Aprovação de conta, se mantida, é feita por função segura e interface Administrador; políticas impedem promoção de papel.

## Regras do domínio

Atividade esperada por semana: semanal todas; quinzenal em semanas alternadas desde o início; mensal na primeira semana do mês; marco/pontual enquanto dentro da janela e até a semana de conclusão; condicional todas as semanas. Semana passada, esperada e sem registro gera alerta próprio, sem alterar status geral. Marco/Pontual: concluído se alguma semana concluiu, atrasado se prazo passou sem conclusão, caso contrário último status informado. Rotina/Condicional: atrasado se alguma semana passada ficou pendente, caso contrário último status, ignorando “Não se aplica”. Painel e percentuais seguem exatamente as fórmulas do pedido.

## Estrutura de pastas prevista

- `src/App.tsx` e `src/main.tsx`: montagem da aplicação, sessão, tela de login e entrada no espaço autenticado.
- `src/features/auth/`: login/cadastro, aprovação, recuperação de senha e transição de sessão.
- `src/features/workspace/TeamWorkspace.tsx`: topbar, navegação com ícones na ordem Chat, Comunicados, Semana, Atividades, Arquivos; `domain.ts` contém regras tipadas de semana/atividade.
- `src/features/workspace/SharedContentWorkspace.tsx` e `shared-content.css`: pastas Drive e comunicados com as permissões RLS aprovadas.
- `src/features/workspace/TeamChat.tsx` e `team-chat.css`: sala geral e canais de grupo em tempo real, com seleção de participantes e remoção exclusiva de Administrador.
- `src/features/profile/ProfileMenu.tsx` e `profile-menu.css`: nome, avatar, configurações pessoais e foto privada Supabase Storage.
- `src/features/dashboard/`: prévia demonstrativa; painel operacional com gráficos reais permanece futuro.
- `src/lib/supabase.ts`: cliente do front-end com somente URL/chave publishable.
- `src/styles/global.css`, `src/features/workspace/workspace.css` e estilos por módulo: tema, responsividade e modo claro/escuro.
- `public/assets/`: login e workspace referenciam a logo original compartilhada `celeris-logo.png`; não criar nem substituir assets de marca. Manter o arquivo original intacto, o manifest e `manus-routes.json`.
- `supabase/migrations/`: esquema inicial, permissões de Arquivos/Comunicados, Chat, perfil/Storage/notificações e migration incremental de grupos.
- `supabase/functions/notify-activity/`: envio server-side de e-mail invocado pelo cliente após uma gravação bem-sucedida; a função valida a sessão/perfil ativo e usa a chave de serviço somente no servidor.
- `src/lib/notifications.ts`: chamada autenticada e com flag pública desligada por padrão até a função e o provedor estarem configurados; a verificação JWT padrão permanece habilitada.
- `docs/`, `INSTRUCOES_NETLIFY_SUPABASE.md`: passos separados para atualizar o mesmo deploy Netlify, aplicar somente migrações pendentes e configurar opcionalmente a Edge Function/provedor de e-mail.

## Sequência de entrega

1. Preparar a aplicação e o banco: estrutura, esquema SQL revisável, RLS, dados iniciais e instruções para criação/configuração do projeto Supabase. Não executar migração em projeto externo do usuário sem que ele a aplique conscientemente.
2. Login/cadastro/recuperação/perfis: e-mail/senha, cadastro aberto e novos registros automaticamente `active/member` conforme decisão do usuário; manter a confirmação de e-mail que já estiver configurada e não mudar status de perfis antigos, link de recuperação e controles RLS.
3. Atividades/semana: 58 atividades, validações e regras de acompanhamento; código implementado e conectado ao perfil responsável.
4. Painel: indicadores e gráficos reais; permanece futuro. A tela demo não deve ser apresentada como dado ao vivo.
5. Arquivos/comunicados: links Drive e regras de permissão confirmadas por qualquer perfil ativo; código/migração estão prontos, o usuário aplica o SQL incremental.
6. Chat: preservar a sala geral; criar canais de grupo com nome e pessoas, entrada de integrantes ativos, leitura/escrita em tempo real por membros, RLS para impedir leitura externa e remoção só por Administrador. A interface usa os ícones/ordem pedidos; migration incremental é entregue para aplicação consciente pelo usuário.
7. Perfil e notificações: permitir edição do próprio nome/foto privada; após cada gravação de atividade/semana no site, invocar a Edge Function com a sessão autenticada. A função valida o ator/evento no servidor e envia somente ao responsável atualmente vinculado quando houver e aos Administradores ativos, excluindo o ator; nenhum e-mail de Chat. O usuário ainda não tem provedor, então o envio fica preparado e inativo até configurar Resend ou alternativa, domínio remetente e segredos.
8. Publicação/PWA: atualizar o mesmo site Netlify via GitHub, sem criar outro projeto; PWA continua pendente. Dados permanecem no Supabase remoto e não são armazenados em cache offline.

## Direção visual

- **Movimento:** caderno técnico náutico contemporâneo, inspirado nos painéis de operação de uma equipe universitária de engenharia solar.
- **Princípios:** leitura imediata no celular; dados operacionais acima da decoração; status distinguíveis também por texto/forma; ações sensíveis explícitas e confirmáveis.
- **Filosofia de cor:** azul-céu e azul-oceano representam energia, confiança e contexto marítimo; laranja é destaque de ação e orientação. Usar a paleta fornecida (#38B6FF, #126CAD, #67B6FA, #014B89, #E06916, #E87B27) e tons discretos previstos para os status, garantindo contraste nos dois temas.
- **Paradigma de layout:** cabeçalho compacto de identidade e ciclo, navegação inferior fixa no celular, listas/cards orientados a tarefas e painéis expansíveis; em telas maiores, navegação e métricas aproveitam a largura sem transformar cada fluxo em uma grade rígida.
- **Motivos:** linha fina de “rota” conectando status/prazos; marcadores circulares de progresso com acento laranja; códigos de atividade em pequenos rótulos monoespaçados.
- **Interação:** atualização de status em poucos toques, justificativa junto ao estado Pendente, confirmação de remoção em dois passos, mensagens claras de conexão e salvamento.
- **Animação:** feedback curto (120–180 ms) em filtros, foco e progresso; respeitar `prefers-reduced-motion`; não animar métricas de modo a atrasar leitura.
- **Tipografia:** sistema sem serifa nativo (`system-ui`, leitura rápida e sem dependência externa), com fonte monoespaçada nativa apenas para IDs e datas técnicas; hierarquia compacta, legível em telas estreitas.
- **Essência da marca:** ferramenta de coordenação semanal de uma equipe que transforma energia solar em navegação; personalidade: prática, colaborativa e técnica.
- **Voz:** direta, acolhedora e específica. Exemplos: “Registre o que avançou nesta semana.” / “Sem movimentação financeira? Marque ‘Não se aplica’.”
- **Marca:** wordmark tipográfico “SolMar Celeris” acompanhado por um símbolo simples formado por horizonte, sol e proa/rota; evitar depender do logo genérico do framework.
- **Cor de assinatura:** azul oceânico `#014B89`, com o laranja `#E06916` reservado como acento operacional.

## Incremento aprovado — período, atalhos e prompts de documentação

- **Período do projeto:** substituir o término derivado do contador fixo pelo intervalo inclusivo `cycle_start`–`cycle_end`. Padrão `2026-11-09` a `2027-12-22`; gerar semanas a partir de inícios de segunda-feira e limitar a última semana à data final configurada. O Administrador ativo pode editar início e fim pela interface. A migration incremental adiciona `cycle_end`; não refazer a migration inicial nem abrir permissões RLS.
- **Aba IA:** manter o design clean e a marca original SolMar. Exibir os quatro logotipos nos endereços fornecidos pelo usuário e um atalho Canva separado. Os links abrem serviços externos; o site não armazena credenciais nem promete autenticação Google automática.
- **Biblioteca documental:** manter em arquivos Markdown no código os dois prompts completos e as instruções comuns de identificação/armazenamento. Cada prompt pode ser lido e copiado integralmente; preservar templates oficiais, URLs, campos, regras de conteúdo, identificação, nomenclatura DOCX, destinos previstos e limites de acesso ao Drive.
