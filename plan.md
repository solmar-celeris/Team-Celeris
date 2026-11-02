# Plano de implementação — SolMar Celeris · Gestão

## Escopo e arquitetura

Converter o protótipo recebido (`SolMar_Celeris_App.html`, com 58 atividades) em um app de equipe em português brasileiro, mantendo as cinco áreas de uso e as regras funcionais descritas no pedido. O visual será mobile-first, com modo claro/escuro e PWA instalável.

- **Front-end:** React + TypeScript + Vite, organizado em módulos; reutilizar a identidade, paleta e comportamento do protótipo em vez de redesenhá-lo do zero.
- **Dados, login e atualização em tempo real:** Supabase (PostgreSQL, Auth e Realtime), escolha explicitamente aprovada pelo usuário. O front-end usará apenas `VITE_SUPABASE_URL` e a chave pública/publishable do projeto. Nenhuma `service_role` ou credencial privilegiada será incluída no bundle.
- **Região e cadastro/aprovação:** criar o projeto na região oficial **South America (São Paulo), `sa-east-1`**, conforme a decisão do usuário. O banco e Auth ficam nessa região. As chamadas às Edge Functions administrativas serão direcionadas explicitamente a `sa-east-1`; em indisponibilidade regional, elas não terão failover automático. O cadastro por e-mail/senha ficará aberto conforme decisão explícita do usuário; cada perfil nasce `pending`, sem acesso aos dados até aprovação administrativa. RLS continuará negando leitura de dados para contas pendentes/suspensas e visitantes anônimos. A aprovação inicial e qualquer promoção a administrador permanecem ações controladas; não haverá rota pública para alterar papéis.
- **Hospedagem:** Vercel permanece a opção previamente aprovada; a pedido do usuário, também será entregue um pacote de fonte configurado para Netlify. Ambos constroem o front-end estático com Vite e usam o mesmo Supabase externo; cada hospedagem receberá suas próprias variáveis públicas de build. Nenhum segredo de produção será copiado ao ZIP.
- **Privacidade e PWA:** guardar apenas identificador, nome/e-mail, área, perfil, autorização e dados operacionais necessários. Histórico guarda ator, data/hora, ação e somente os campos alterados relevantes. O service worker poderá armazenar a casca estática da aplicação, mas não cacheará páginas/dados autenticados, respostas do banco nem tokens; sem rede, o app indicará indisponibilidade sem exibir cópia local de dados. A configuração do projeto informa analytics da plataforma ativos por padrão; perguntar ao usuário antes de manter ou desativar analytics e badge antes da publicação.
- **Autenticação:** login e cadastro por e-mail/senha; cadastro aberto, mas novos perfis permanecem `pending` até aprovação. A recuperação de senha usa um link Supabase de uso único e uma tela para definir nova senha; respostas não revelarão se o e-mail existe e exibirão limite de envio quando aplicável. URLs de retorno precisam estar autorizadas no Supabase. Login Google continua opcional e dependerá de ativação e credenciais próprias.

## Modelo de dados

1. `areas`: nome, sigla, núcleo, ativa e informação funcional. Núcleos e áreas iniciais vêm do pedido; TI também presta suporte ao Núcleo de Gestão e Projetos consolida o acompanhamento.
2. `profiles`: referência ao usuário do Supabase Auth, nome, área, papel (`admin`, `area_lead`, `member`, `reader`), situação (`pending`, `active`, `suspended`) e datas/ator de aprovação. O e-mail fica apenas no Auth e não é duplicado no perfil; quando necessário, somente uma função segura fornece esse dado a administradores.
3. `activities`: código automático, núcleo/área, nome, descrição, tipo, frequência, condição, responsável, início, prazo, entregável, observações e autoria/datas. O status geral é derivado dos registros semanais e regras de prazo.
4. `weekly_updates`: atividade, início da semana, status, justificativa, autor e data/hora; unicidade por atividade/semana. Justificativa obrigatória se `Pendente`. `Não se aplica` é um registro explícito, excluído dos cálculos de conclusão e cobrança.
5. `team_settings`: início do ciclo, padrão `2026-11-09`, duração 60 semanas e opções necessárias.
6. `drive_folders`: nome, URL validada, área opcional (nulo = Geral), indicação da pasta principal, autoria, remoção e confirmação.
7. `announcements`: título, mensagem, audiência (equipe/área), autor, data/hora, fixação e remoção.
8. `audit_log`: tipo e ID do registro, ator, horário, ação e diff mínimo de campos relevantes; sem guardar tokens, senhas ou conteúdo integral de arquivos do Drive.

Todas as tabelas privadas terão RLS `default-deny`. Políticas distinguem pessoa ativa, administrador, líder da área e membro responsável. A função de convite/aprovação verifica o papel no servidor; políticas impedem promoção de papel pelo cliente. As permissões de comunicados e pastas, não detalhadas no pedido, serão fechadas com o usuário antes da implementação dessas ações. O período de retenção dos diffs de auditoria também será confirmado antes de configurá-lo.

## Regras do domínio

Atividade esperada por semana: semanal todas; quinzenal em semanas alternadas desde o início; mensal na primeira semana do mês; marco/pontual enquanto dentro da janela e até a semana de conclusão; condicional todas as semanas. Semana passada, esperada e sem registro gera alerta próprio, sem alterar status geral. Marco/Pontual: concluído se alguma semana concluiu, atrasado se prazo passou sem conclusão, caso contrário último status informado. Rotina/Condicional: atrasado se alguma semana passada ficou pendente, caso contrário último status, ignorando “Não se aplica”. Painel e percentuais seguem exatamente as fórmulas do pedido.

## Estrutura de pastas prevista

- `src/app/`: layout, rotas, navegação móvel, sessão e limites de acesso.
- `src/components/`: componentes visuais acessíveis e indicadores de status reutilizados.
- `src/features/auth/`: login, cadastro pendente, recuperação e atualização de senha, com mensagens acessíveis.
- `src/features/weekly/`: calendário de 60 semanas, edição de status/justificativa e alertas de atualização.
- `src/features/activities/`: formulários, regras/validações, filtros e detalhes de atividades.
- `src/features/dashboard/`: métricas e gráficos por núcleo, área e semana.
- `src/features/files/` e `src/features/announcements/`: links do Drive, pastas e comunicados.
- `src/features/team/`: usuários, convites e administração, protegidos por papel.
- `src/lib/`: cliente Supabase, autorização de interface, datas, exportação/importação e validação.
- `src/styles/`: tokens de cor, modo claro/escuro, tipografia e responsividade.
- `public/`: logo local (`assets/celeris-logo.png`), ícones, `manifest.webmanifest`, service worker e `manus-routes.json`.
- `supabase/migrations/`: esquema, RLS, gatilhos de auditoria e carga inicial de 58 atividades.
- `supabase/functions/`: operações administrativas privilegiadas, sem segredo no cliente.
- `docs/` e `INSTRUCOES_NETLIFY_SUPABASE.md`: configuração do Supabase e hospedagem Vercel/Netlify, mais guia da equipe.

## Sequência de entrega

1. Preparar a aplicação e o banco: estrutura, esquema SQL revisável, RLS, dados iniciais e instruções para criação/configuração do projeto Supabase. Não executar migração em projeto externo do usuário sem que ele a aplique conscientemente.
2. Login/cadastro/recuperação/perfis: e-mail/senha, cadastro aberto com estado pendente, link de recuperação e atualização de senha, aprovação e controle de acesso; login Google opcional quando credenciais e configuração forem fornecidas.
3. Atividades/semana: 58 atividades, validações e regras de acompanhamento.
4. Painel: indicadores e gráficos.
5. Arquivos/comunicados: somente links Drive e regras de permissão aprovadas.
6. Publicação/PWA: build estático na Vercel ou no Netlify (pacote Netlify separado), Supabase remoto, manifest/service worker sem cache de dados privados, passo a passo da hospedagem selecionada e guia curto de uso.

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
