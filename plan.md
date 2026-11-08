# Plano de implementação — SolMar Celeris · Gestão

## Escopo e arquitetura

Converter o protótipo recebido (`SolMar_Celeris_App.html`, com 58 atividades) em um app de equipe em português brasileiro, mantendo os módulos operacionais atuais e as regras funcionais descritas no pedido. O visual será mobile-first, com modo claro/escuro e PWA instalável.

- **Front-end:** React + TypeScript + Vite, organizado em módulos; reutilizar a identidade, paleta e comportamento do protótipo em vez de redesenhá-lo do zero.
- **Dados, login e atualização em tempo real:** Supabase (PostgreSQL, Auth e Realtime), escolha explicitamente aprovada pelo usuário. O front-end usará apenas `VITE_SUPABASE_URL` e a chave pública/publishable do projeto. Nenhuma `service_role` ou credencial privilegiada será incluída no bundle.
- **Região e cadastro/aprovação:** o projeto existente usa **South America (São Paulo), `sa-east-1`**, conforme a decisão do usuário. O usuário escolheu ativação automática de novos cadastros: após a migration incremental, cada novo perfil nasce `active`, com papel fixo `member` e sem área. Isso dá acesso ao espaço da equipe a qualquer pessoa que consiga se cadastrar; não há aprovação manual para novas contas. Contas que já estavam `pending` antes da migration permanecem inalteradas. RLS continua bloqueando visitantes sem sessão e perfis suspensos.
- **Hospedagem:** Netlify é a hospedagem que o usuário já usa, com build estático Vite; Vercel fica como alternativa, não será configurada nesta etapa. A atualização é feita no mesmo repositório e site, com variáveis públicas Vite. Nenhum segredo de produção será copiado ao ZIP.
- **Privacidade e PWA:** guardar apenas identificador, nome/e-mail, área, perfil, autorização e dados operacionais necessários. Histórico guarda ator, data/hora, ação e somente os campos alterados relevantes. O service worker poderá armazenar a casca estática da aplicação, mas não cacheará páginas/dados autenticados, respostas do banco nem tokens; sem rede, o app indicará indisponibilidade sem exibir cópia local de dados. A configuração do projeto informa analytics da plataforma ativos por padrão; perguntar ao usuário antes de manter ou desativar analytics e badge antes da publicação.
- **Autenticação:** login e cadastro por e-mail/senha; novos registros são automaticamente `active/member` por trigger no banco. A confirmação de e-mail, se habilitada nas configurações existentes do Supabase, continua obrigatória e é independente da ativação do perfil. A migration não modifica contas já criadas nem desativa a confirmação. Recuperação de senha usa link Supabase de uso único; respostas não revelam se o e-mail existe.

## Modelo de dados

1. `areas`: nome, sigla, ativa e informação funcional. As seis áreas diretas são GP, AF, Marketing, MEC, Elétrica e TEL; TI é apoio transversal. “Projetos” permanece apenas como área histórica inativa. Núcleos internos antigos não definem mais a navegação do produto.
2. `profiles`: referência ao usuário do Supabase Auth, nome, área, papel (`admin`, `area_lead`, `member`, `reader`), situação (`pending`, `active`, `suspended`) e datas/ator de aprovação; a migração incremental acrescentará somente o caminho do avatar privado. O e-mail fica apenas no Auth; somente a Edge Function consulta esses e-mails para notificações.
3. `activities`: código automático, núcleo/área, nome, descrição, tipo, frequência, condição, responsável, início, prazo, entregável, observações e autoria/datas. O status geral é derivado dos registros semanais e regras de prazo.
4. `weekly_updates`: atividade, início da semana, status, justificativa, autor e data/hora; unicidade por atividade/semana. Justificativa obrigatória se `Pendente`. `Não se aplica` é um registro explícito, excluído dos cálculos de conclusão e cobrança.
5. `team_settings`: início do ciclo, padrão `2026-11-09`, duração 60 semanas e opções necessárias.
6. `drive_folders`: nome, URL validada, área opcional (nulo = Geral), indicação da pasta principal, autoria, remoção e confirmação.
7. `announcements`: título, mensagem, audiência (equipe/área), autor, data/hora, fixação e remoção.
8. `audit_log`: tipo e ID do registro, ator, horário, ação e diff mínimo de campos relevantes; sem guardar tokens, senhas ou conteúdo integral de arquivos do Drive.
9. `team_chat_messages`: mensagens da sala SolMarZap ou de grupo/DM, com anexos locais privados e links Drive nomeados quando aplicáveis; autor/data derivados da sessão/banco, RLS por contexto e remoção administrativa que substitui o corpo pelo marcador de remoção.
10. `team_chat_groups`: grupos com nome, criador, data e caminho opcional de foto privada; criados por perfis ativos.
11. `team_chat_group_members` e `team_chat_message_reads`: participantes autorizados e recibos de leitura coletivos. Integrantes do grupo consultam quem leu/não leu as mensagens do grupo; Admin pode moderar conteúdo sem contar como destinatário quando não pertence; DMs continuam visíveis apenas aos participantes.

Todas as tabelas privadas terão RLS `default-deny`. Políticas distinguem pessoa ativa, Administrador, Líder da área e Membro responsável. Qualquer perfil ativo pode ler, cadastrar e remover pastas, definir a principal, e publicar/fixar/desafixar/remover comunicados de todas as áreas; visitantes e contas não ativas continuam bloqueados. Qualquer perfil ativo pode ler/enviar na sala geral e criar grupos; participantes de um grupo podem adicionar outras contas ativas. Mensagens de grupo ficam restritas a participantes e Administradores; apenas Administradores ativos podem remover mensagens. Só a pessoa ativa pode alterar o próprio nome/avatar; papel, área e estado não são editáveis pelo cliente. Aprovação de conta, se mantida, é feita por função segura e interface Administrador; políticas impedem promoção de papel.

## Regras do domínio

Atividade esperada por semana: semanal todas; quinzenal em semanas alternadas desde o início; mensal na primeira semana do mês; marco/pontual enquanto dentro da janela e até a semana de conclusão; condicional todas as semanas. Semana passada, esperada e sem registro gera alerta próprio, sem alterar status geral. Marco/Pontual: concluído se alguma semana concluiu, atrasado se prazo passou sem conclusão, caso contrário último status informado. Rotina/Condicional: atrasado se alguma semana passada ficou pendente, caso contrário último status, ignorando “Não se aplica”. Painel e percentuais seguem exatamente as fórmulas do pedido.

## Estrutura de pastas prevista

- `src/App.tsx` e `src/main.tsx`: montagem da aplicação, sessão, tela de login e entrada no espaço autenticado.
- `src/features/auth/`: login/cadastro, aprovação, recuperação de senha e transição de sessão.
- `src/features/workspace/TeamWorkspace.tsx`: topbar e sete destinos principais, com Semanas agrupando Acompanhamento semanal, Agenda e Disponibilidades; `domain.ts` contém regras tipadas de semana/atividade.
- `src/features/workspace/SharedContentWorkspace.tsx` e `shared-content.css`: pastas Drive e comunicados com as permissões RLS aprovadas.
- `src/features/workspace/TeamChat.tsx` e `team-chat.css`: Chat azul, lista/painel de conversas, criação de grupos e DMs, foto privada de grupo, mensagens em tempo real e recibos de leitura.
- `src/features/profile/ProfileMenu.tsx` e `profile-menu.css`: nome, avatar, configurações pessoais e foto privada Supabase Storage.
- `src/features/dashboard/`: prévia demonstrativa; painel operacional com gráficos reais permanece futuro.
- `src/lib/supabase.ts`: cliente do front-end com somente URL/chave publishable.
- `src/styles/global.css`, `src/features/workspace/workspace.css` e estilos por módulo: tema, responsividade e modo claro/escuro.
- `public/assets/`: login e workspace referenciam a logo original compartilhada `celeris-logo.png`; não criar nem substituir assets de marca. Manter o arquivo original intacto, o manifest e `manus-routes.json`.
- `supabase/migrations/`: esquema inicial, regras de Arquivos/Comunicados/Chat, disponibilidade, grupos/avatares, anexos, fluxo Scrumban/PERT, siglas oficiais e Storage privado.
- `supabase/functions/notify-activity/`: envio server-side de e-mail invocado pelo cliente após uma gravação bem-sucedida; a função valida a sessão/perfil ativo e usa a chave de serviço somente no servidor.
- `src/lib/notifications.ts`: chamada autenticada e com flag pública desligada por padrão até a função e o provedor estarem configurados; a verificação JWT padrão permanece habilitada.
- `docs/`, `INSTRUCOES_NETLIFY_SUPABASE.md`: passos separados para atualizar o mesmo deploy Netlify, aplicar somente migrações pendentes e configurar opcionalmente a Edge Function/provedor de e-mail.

## Sequência de entrega

1. Preparar a aplicação e o banco: estrutura, esquema SQL revisável, RLS, dados iniciais e instruções para criação/configuração do projeto Supabase. Não executar migração em projeto externo do usuário sem que ele a aplique conscientemente.
2. Login/cadastro/recuperação/perfis: e-mail/senha, cadastro aberto e novos registros automaticamente `active/member` conforme decisão do usuário; manter a confirmação de e-mail que já estiver configurada e não mudar status de perfis antigos, link de recuperação e controles RLS.
3. Atividades/semana: 58 atividades, validações e regras de acompanhamento; código implementado e conectado ao perfil responsável.
4. Painel: indicadores e gráficos reais; permanece futuro. A tela demo não deve ser apresentada como dado ao vivo.
5. Arquivos/comunicados: links Drive e regras de permissão confirmadas por qualquer perfil ativo; código/migração estão prontos, o usuário aplica o SQL incremental.
6. Chat: lista de conversas, sala compartilhada, DMs privadas e grupos; botões explícitos para iniciar privado/grupo; uploads de foto de grupo em bucket privado, leitura coletiva detalhada sob RLS, anexos locais/Drive/áudio e remoção de mensagens só por Administrador. As migrations incrementais são entregues para aplicação consciente pelo usuário.
7. Perfil e notificações: permitir edição do próprio nome/foto privada; após cada gravação de atividade/semana no site, invocar a Edge Function com a sessão autenticada. A função valida o ator/evento no servidor e envia somente ao responsável atualmente vinculado quando houver e aos Administradores ativos, excluindo o ator; nenhum e-mail de Chat. O usuário ainda não tem provedor, então o envio fica preparado e inativo até configurar Resend ou alternativa, domínio remetente e segredos.
8. Publicação/PWA: atualizar o mesmo site Netlify via GitHub, sem criar outro projeto; PWA continua pendente. Dados permanecem no Supabase remoto e não são armazenados em cache offline.

## Direção visual

- **Movimento:** caderno técnico náutico contemporâneo, inspirado nos painéis de operação de uma equipe universitária de engenharia solar.
- **Princípios:** leitura imediata no celular; dados operacionais acima da decoração; status distinguíveis também por texto/forma; ações sensíveis explícitas e confirmáveis.
- **Filosofia de cor:** azul-céu e azul-oceano representam energia, confiança e contexto marítimo; laranja é destaque de ação e orientação. Usar a paleta fornecida (#38B6FF, #126CAD, #67B6FA, #014B89, #E06916, #E87B27) e tons discretos previstos para os status, garantindo contraste nos dois temas.
- **Paradigma de layout:** cabeçalho compacto de identidade e ciclo, navegação vertical na lateral esquerda também em celulares, subguias horizontais no topo de Semanas, listas/cards orientados a tarefas e painéis expansíveis; em telas maiores, navegação e métricas aproveitam a largura sem transformar cada fluxo em uma grade rígida.
- **Motivos:** linha fina de “rota” conectando status/prazos; marcadores circulares de progresso com acento laranja; códigos de atividade em pequenos rótulos monoespaçados.
- **Interação:** atualização de status em poucos toques, justificativa junto ao estado Pendente, confirmação de remoção em dois passos, mensagens claras de conexão e salvamento.
- **Animação:** feedback curto (120–180 ms) em filtros, foco e progresso; respeitar `prefers-reduced-motion`; não animar métricas de modo a atrasar leitura.
- **Tipografia:** sistema sem serifa nativo (`system-ui`, leitura rápida e sem dependência externa), com fonte monoespaçada nativa apenas para IDs e datas técnicas; hierarquia compacta, legível em telas estreitas.
- **Essência da marca:** ferramenta de coordenação semanal de uma equipe que transforma energia solar em navegação; personalidade: prática, colaborativa e técnica.
- **Voz:** direta, acolhedora e específica. Exemplos: “Registre o que avançou nesta semana.” / “Sem movimentação financeira? Marque ‘Não se aplica’.”
- **Marca:** wordmark tipográfico “SolMar Celeris” acompanhado por um símbolo simples formado por horizonte, sol e proa/rota; evitar depender do logo genérico do framework.
- **Cor de assinatura:** azul oceânico `#014B89`, com o laranja `#E06916` reservado como acento operacional.

## Incremento aprovado — período, atalhos e prompts de documentação

- **Período do projeto:** substituir o término derivado do contador fixo pelo intervalo inclusivo `cycle_start`–`cycle_end`. Padrão `2026-11-09` a `2027-12-22`; aceitar qualquer data inicial. Agrupar registros nas semanas civis de segunda a domingo, exibir o primeiro bloco parcial começando na data inicial configurada e limitar a última semana à data final. O Administrador ativo pode editar início e fim pela interface. A migration incremental adiciona `cycle_end`; não refazer a migration inicial nem abrir permissões RLS.
- **Aba IA:** manter o design clean e a marca original SolMar. Exibir os quatro logotipos nos endereços fornecidos pelo usuário e um atalho Canva separado. Os links abrem serviços externos; o site não armazena credenciais nem promete autenticação Google automática.
- **Biblioteca documental:** manter em arquivos Markdown no código os dois prompts completos e as instruções comuns de identificação/armazenamento. Cada prompt pode ser lido e copiado integralmente; preservar templates oficiais, URLs, campos, regras de conteúdo, identificação, nomenclatura DOCX, destinos previstos e limites de acesso ao Drive.

## Incremento aprovado — organograma v2.2, anexos e fluxo Scrumban (06/11/2026)

A implementação reutiliza React/Vite e Supabase do projeto. A aba Manual será alinhada ao DOCX v2.2 e ao organograma recebido: Coordenação Geral é composta somente pelos professores; não recebe atividades pré-atribuídas. Gestão de Pessoas, Administrativo-Financeiro, Marketing, Mecânica Naval, Elétrica e Telemetria são áreas diretas; Produtos e Redes Sociais são frentes internas de Marketing; TI é apoio transversal, sem autoridade hierárquica nem substituição da responsabilidade técnica da área demandante. A Coordenação pode acompanhar o fluxo integrado, sem ser tratada como uma equipe executora. Os agrupamentos visuais legados de núcleos e a área “Projetos” deixam de definir o fluxo de trabalho; mudanças de dados serão incrementais, preservando históricos e códigos existentes.

As atividades passam a oferecer quadro Scrumban além da lista: Backlog → Pronta → Em andamento → Bloqueada/Concluída, prioridade, estimativa simples e motivo de bloqueio. O avanço será pull-based, autorizado por perfil e vínculo à área/tarefa. O quadro visualizará limites WIP por etapa; como o artigo recomenda calibrá-los após observar o fluxo e decidir em equipe, os limites serão configuráveis e não assumirão um número arbitrário definitivo. A movimentação no quadro não substitui o registro semanal existente. Coordenação supervisiona prioridades e dependências integradas; líderes gerem as tarefas de sua área; integrantes atualizam tarefas atribuídas; pedidos de apoio de TI continuam associados à área demandante e não transferem a responsabilidade técnica.

Anexos de comunicados e tarefas usarão buckets privados do Supabase Storage e tabelas de metadados, com limites e tipos permitidos, validação de autorização em RLS e links assinados após autorização. A leitura respeita o acesso ao registro pai; a remoção lógica do pai não deve expor anexos. Nenhuma chave privilegiada será adicionada ao frontend.

Estrutura principal existente: `src/features/workspace/ManualFunctions.tsx` (manual); `TeamWorkspace.tsx` e `domain.ts` (atividades/fluxo); `SharedContentWorkspace.tsx` e `shared-content.css` (comunicados); `supabase/migrations/` (alterações incrementais seguras); `docs/` e `TODO.md` (orientação de aplicação/publicação). O estilo visual atual será mantido.


## Escopo adicional — PERT/CPM, disponibilidade e links externos (06/11/2026)

As atividades do tipo Marco terão planejamento PERT/CPM: estimativas otimista, mais provável e pessimista em dias; dependências antecessora/sucessora; tempo esperado PERT; cálculo de folgas e caminho crítico sobre a rede acíclica. Relações inválidas e ciclos serão rejeitados no banco. Esta modelagem não atribui atividades a professores; responsáveis de execução continuam vinculados às áreas de trabalho.

Anexos locais existentes do Chat devem permanecer compatíveis. Comunicados, atividades e Chat também aceitarão referências do Google Drive como links, sem importar conteúdo, controlar permissões do Drive ou incluir credenciais Google. Os anexos locais permanecerão em buckets privados do Supabase.

Nova aba Disponibilidades: cada pessoa cadastra seus próprios horários semanais recorrentes de segunda a sexta em slots de 30 minutos, com início entre 07:00 e 20:30, no fuso de Brasília. A grade exibe cada bloco como intervalo; faixas contíguas são agrupadas no quadro, por exemplo “07:00 - 08:00”. Totais individuais são calculados em horas reais. O quadro fica visível a qualquer integrante ativo e autenticado. Uma ação separada monta escalas manuais para ocasiões especiais como SEPEX; podem existir horários fora da disponibilidade semanal, que ficam sinalizados como exceção sem bloquear o salvamento. Permanecem os limites técnicos de dias úteis, horas cheias entre 07:00 e 21:00 e atribuição somente a perfil ativo.

Referências para o desenho Scrumban (consultadas em 06/11/2026): a Atlassian descreve o fluxo visual, cartões, pull, fluxo contínuo e WIP como componentes do Scrumban; recomenda que a equipe defina e ajuste os limites conforme observa o fluxo. Fontes: https://www.atlassian.com/br/agile/project-management/scrumban e https://www.atlassian.com/agile/kanban/wip-limits.

## Incremento aprovado — SolMarZap e identificação de setor (06/11/2026)

A aba do Chat adotará a marca SolMarZap e um fluxo de mensageiro familiar — lista de conversas, painel da conversa ativa e compositor na base, responsivo para celular — usando a paleta azul já aprovada e sem assets da marca WhatsApp. Dois controles explícitos iniciarão conversas privadas ou conversas em grupo; a foto de grupo será atualizável por participante/admin e visível apenas em URLs assinadas de um bucket privado. Em mensagens de grupos e na sala da equipe, o autor poderá abrir os detalhes de leitura e identificar quem leu e quem ainda não leu. RLS restringirá a lista de recibos ao contexto da própria conversa; DMs mantêm visibilidade somente aos participantes.

As siglas oficiais serão exibidas junto aos nomes e códigos de novas atividades: Gestão de Pessoas - GP; Marketing - MKT; Administrativo Financeiro - AF; Mecânica Naval - MEC; Elétrica - ELE; Telemetria - TEL. Prefixos antigos em códigos e vínculos históricos não serão reescritos; “Projetos (histórico)” permanece inativo e a nova área Elétrica usa ELE. Alterações usam migrations incrementais após a limpeza de áreas.


## Incremento — Kanban como vista principal e cores por prioridade (06/11/2026)
Na aba Atividades, remover a vista Lista e deixar o quadro Kanban como a vista de fluxo; manter PERT/CPM como ferramenta separada de marcos. Colorir cada cartão Kanban conforme a prioridade cadastrada, usando paleta de post-its suaves, rótulo de prioridade no próprio cartão e contraste adequado nos temas claro e escuro.


## Incremento — quatro colunas e cartões arrastáveis (06/11/2026)
O quadro de Atividades terá somente as colunas Backlog, A fazer, Fazendo e Feito; itens bloqueados continuarão no grupo Fazendo, marcados como bloqueados, para preservar os estados e limites WIP do banco. Integrantes autorizados poderão arrastar cartões entre qualquer uma das quatro colunas ou mudar o fluxo no próprio cartão. A camada Supabase continuará validando permissão, limites WIP e o motivo obrigatório para bloqueios, sem exigir passagem sequencial por todas as etapas. Manter edição e exclusão/arquivamento com confirmação no cartão.

## Incremento — clareza e visualização gráfica PERT/CPM (07/11/2026)
Tornar os cabeçalhos da tabela autoexplicativos em português: O otimista, M mais provável, P pessimista; duração esperada PERT; ES início mais cedo; EF término mais cedo; LS início mais tarde; LF término mais tarde; folga total. Incluir explicação curta dos acrônimos e uma visualização SVG horizontal do cronograma, com barras posicionadas em ES–EF, setas para predecessoras/sucessoras, caminho crítico realçado somente se a rede completa estiver calculável e itens sem estimativa identificados como pendentes; numa rede incompleta, não apresentar duração final/criticidade como definitivas e chamar os valores visíveis de parciais. Preservar edição, tabela, acessibilidade e suporte móvel sem dependências novas.

## Reuniões ao vivo — Jitsi público aprovado e incorporado (07/11/2026)
A usuária aprovou o serviço público meet.jit.si e suas condições. A aba **Reuniões ao vivo** usa a IFrame API do Jitsi, permite gerar uma sala de nome aleatório, entrar por código/link válido do domínio Jitsi, copiar/abrir convite e usar os controles nativos do serviço para áudio, vídeo, compartilhamento de tela, participantes e efeitos disponibilizados pelo próprio Jitsi/dispositivo. Áudio e vídeo começam desligados; o iframe mantém os controles próprios do Jitsi. A chamada não é persistida no Supabase. O nome de perfil é enviado como nome de exibição. A navegação/logout pede confirmação enquanto uma sala está aberta, para não desconectar silenciosamente.

Explicar dentro da aba e nos documentos que o criador precisa de conta Jitsi, convidados podem entrar sem conta, todos têm controles de moderação no serviço público e o limite atual é de 95 minutos. O link é convite de acesso e deve ser compartilhado só com participantes pretendidos. Não prometer cópia integral/paridade com Microsoft Teams; gravação, transcrição, salas simultâneas, telefonia, calendário avançado e demais recursos que não constam na integração não estão implementados.

Referências oficiais verificadas: [Segurança e privacidade Jitsi](https://jitsi.org/security/), [atualizações do serviço público Jitsi](https://jitsi.org/blog/), [Jitsi Meet IFrame API](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/), [apps em reuniões do Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/teams-apps-in-meetings) e [políticas de gravação/transcrição Teams](https://learn.microsoft.com/en-us/microsoftteams/recording-transcription-overview).


## Incremento de navegação e rótulos do workspace (07/11/2026)
- A navegação principal deixa de incluir IA; prompts e links dos templates oficiais permanecem disponíveis ao fim do Manual de funções.
- Em viewports móveis, a navegação principal fica em uma barra horizontal na parte superior, imediatamente abaixo do cabeçalho do app, com rótulos compactos e todas as sete abas visíveis.
- Uma única aba **Semanas** agrupa três subguias no topo do conteúdo: **Acompanhamento semanal** (registro de atividades), **Agenda** (Calendário de eventos) e **Disponibilidades** (quadro/escala existentes). Deep links de calendário e atalhos da semana continuam abrindo a subguia Agenda.
- O nome da aplicação passa a **Team Celeris**, e o chat passa a ser identificado como **Chat**. No cabeçalho azul, nome e foto/iniciais abrem as configurações do perfil, com alternância direta de tema claro/escuro ao lado em web e mobile; nenhuma tabela, migration, política RLS ou dado remoto será alterado.
