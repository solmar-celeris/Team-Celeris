# Entregas do SolMar Celeris

## 1. Projeto, banco de dados e segurança
- [ ] Estrutura do site responsiva e PWA em português, preservando paleta, modo claro/escuro e navegação do protótipo, com foco no celular e funcionamento em computador.
- [ ] Supabase (Postgres, Auth e Realtime) como banco online compartilhado, substituindo armazenamento local; Vercel como hospedagem gratuita, sujeita aos limites dos serviços.
- [ ] Modelo de tabelas para áreas, perfis, atividades, status semanais, configurações, pastas do Drive, comunicados e histórico de auditoria; banco com RLS e negação padrão para usuários sem acesso.
- [ ] Sem senha ou chave secreta no código do navegador; somente chave pública no cliente, com credencial privilegiada restrita a função segura de servidor.
- [ ] Guardar apenas dados necessários; registrar ator e quando cada alteração foi feita, principalmente status, prazos, comunicados e remoções.
- [ ] Carregar inicialmente as 58 atividades do protótipo (45 de rotina e condicionais e 13 marcos e pontuais de exemplo, com datas ilustrativas).
- [ ] Registrar como criar/configurar projeto Supabase e conectar o app sem inserir dados reais antes da decisão consciente do usuário.

## 2. Login, convites, perfis e permissões
- [ ] Login por e-mail e senha e/ou conta Google, em português.
- [x] A tela de autenticação reformulada, responsiva e em português, mantendo a identidade visual, com ações distintas para Entrar, Criar cadastro e Esqueci minha senha.
- [x] Cadastro aberto por e-mail e senha, solicitando nome, e-mail, senha e confirmação; todo perfil novo inicia como `pending`, mesmo após confirmação de e-mail, e não lê dados da equipe até a aprovação do administrador.
- [x] Cadastro apresenta uma confirmação clara: se o Supabase exigir verificação, orientar a pessoa a conferir o e-mail; deixar explícito que confirmar o endereço não libera acesso aos dados.
- [x] Recuperação de senha envia link Supabase para o e-mail informado; link de recuperação abre o formulário para definir e confirmar nova senha, atualiza a senha na Auth e retorna à entrada.
- [x] Mensagem da recuperação não revela se o e-mail está cadastrado; falhas de rede e limites de envio são explicados sem deixar o botão travado.
- [x] Ninguém sem perfil ativo e aprovado vê dados da equipe; visitantes sem sessão, perfis `pending` ou `suspended` continuam bloqueados por RLS no banco.
- [ ] Administrador (coordenação/Projetos): acesso total, gerencia usuários, áreas e configurações.
- [x] Líder de área: edita as atividades e os status da própria área; vê o resto.
- [x] Membro: vê tudo e atualiza o status das atividades em que é responsável.
- [x] Leitor: só visualiza.
- [x] Aplicar permissões no banco conforme os perfis, não apenas esconder ações na interface; usuário pendente ou suspenso e visitante sem login não leem dados da equipe.

**Progresso (02/11/2026):** a conta do usuário chegou ao estado de acesso aprovado, mas a versão publicada ainda mostrava apenas uma confirmação e não abria o espaço operacional. Esta atualização conecta o perfil ativo às abas Semana e Atividades; nenhum login, consulta de conta ou envio de e-mail foi executado pelo agente. A aprovação de cadastros permanece manual até a implementação da tela administrativa.

## 3. Atividades e filtros
- [x] Campos: ID automático (sigla da área + número), núcleo (automático pela área), área, nome, descrição, tipo, frequência, condição de execução, responsável, data de início, prazo final, entregável esperado, observações.
- [x] Tipos: Marco (entrega importante, exige início e prazo), Pontual (exige prazo), Rotina (semanal, quinzenal ou mensal), Condicional (exige a condição de execução, ocorre só quando houver necessidade).
- [x] Editar início, prazo e responsável de qualquer atividade; adicionar novas atividades com validação das regras acima.
- [x] Filtros por responsável, núcleo, área, tipo, status e período.
- [x] Carregar inicialmente as 58 atividades que estão no protótipo (45 de rotina e condicionais e 13 marcos e pontuais de exemplo, com datas ilustrativas), quando já presentes no banco Supabase.

**Evidência:** a tela consulta atividades/áreas/núcleos/perfis ativos no Supabase; o código é atribuído pelo gatilho existente. A criação e edição seguem a migração e as políticas RLS. O ZIP atualizado passou em instalação congelada, typecheck e build limpo. A leitura/gravação no banco real deve ser confirmada pelo usuário após substituir o código no GitHub e aguardar o deploy Netlify.

## 4. Acompanhamento semanal e status geral
- [x] Período de 60 semanas, com início configurável (padrão: segunda-feira, 09/11/2026), lido de `team_settings`.
- [x] Cada atividade esperada na semana recebe um status: Concluído, Em andamento, Pendente, Não se aplica ou Não iniciado. Justificativa obrigatória quando for Pendente.
- [x] Regras de quando a atividade é esperada: Semanal toda semana; Quinzenal em semanas alternadas a partir do início; Mensal na primeira semana do mês; Marco e Pontual durante sua janela (e encerram na semana da conclusão); Condicional toda semana.
- [x] Não se aplica não conta como conclusão nem como pendência. Para atividade financeira sem movimentação ou demanda, a pessoa pode registrar Não se aplica.
- [x] Semana esperada sem registro aparece como alerta separado, mas não altera o status geral.
- [x] Marco/Pontual: Concluído se alguma semana foi concluída; Atrasado se o prazo passou sem conclusão; senão vale o último status informado.
- [x] Rotina/Condicional: Atrasado se alguma semana passada ficou Pendente; senão vale o último status informado, ignorando Não se aplica.

**Evidência:** status/justificativa são gravados em `weekly_updates` apenas após ação explícita da pessoa; o banco preenche ator e data e mantém a unicidade por atividade/semana. Nenhuma gravação de teste foi executada contra o banco do usuário.

## 5. Painel e indicadores
- [ ] % de conclusão = concluídas ÷ (total − não se aplica). % de execução da semana = concluído ÷ (concluído + em andamento + pendente).
- [ ] Painel com: total, concluídas, em andamento, pendentes, atrasadas, não aplicáveis, não iniciadas, semanas sem atualização, marcos concluídos, prazos nos próximos 7 dias.
- [ ] Gráficos por núcleo e por área; execução semanal das últimas 12 semanas.

## 6. Pastas e links do Drive
- [ ] Uma pasta principal do Drive em destaque, como ícone de pasta grande clicável que abre o link.
- [ ] Botão “Adicionar pasta”: nome da pasta + link do Drive + área (ou “Geral”). Cada pasta aparece como um ícone de pasta clicável que abre o link.
- [ ] Botão “Remover pasta” em cada uma, com confirmação em dois passos.
- [ ] Integração por link (abrir no Drive), sem ler o conteúdo das pastas.

## 7. Comunicados
- [ ] Publicar com título, mensagem, destinatário (toda a equipe ou uma área) e autor automático (quem está logado).
- [ ] Fixar e desafixar no topo, remover com confirmação. Mais recentes primeiro.
- [ ] Opcional: aviso de comunicado novo (selo na aba e/ou e-mail).

## 8. Importação, exportação e alertas opcionais
- [ ] Exportar dados para Excel (.xlsx) e fazer backup em .json.
- [ ] Importar as atividades e status que já estão na planilha.
- [ ] Opcional: aviso semanal automático de atividades atrasadas e semanas sem atualização.

## 9. Publicação, PWA e guias de uso
- [ ] Site em português do Brasil, prioridade para celular, fluido em computador, com a paleta #38B6FF, #126CAD, #67B6FA, #014B89 e #E06916, #E87B27; modo claro e escuro.
- [ ] Cores discretas por status: verde (concluído), azul (em andamento), laranja (pendente), vermelho (atrasado), cinza (não se aplica e não iniciado), amarelo (sem atualização).
- [ ] PWA instalável no celular; cache offline limitado à casca estática e sem persistir dados privados autenticados.
- [x] Passo a passo de atualização Netlify e guia curto para a equipe entrar e usar; explicar como saber que o build terminou sem erro.
- [x] Executar as etapas na ordem: (1) projeto e banco, (2) login e convites, (3) atividades e semana, (4) painel, (5) arquivos e comunicados, (6) publicação e PWA. Etapa 3 implementada; as etapas seguintes permanecem abertas.
- [x] Perguntar antes de decidir algo que mude custo, segurança ou privacidade dos dados (LGPD: guardar só o necessário).

## 10. Identificação no rodapé
- [x] Substituir “PROJETO UNIVERSITÁRIO · ENERGIA SOLAR” por “UFCI/RJ” no rodapé, preservando “SolMar Celeris” e dando destaque visual discreto à identificação institucional.

## 11. Prévia visual pós-login (somente demonstração)
- [x] Mostrar um exemplo visual do Painel interno com dados claramente fictícios; não conectar ao Supabase nem consultar informações reais.
- [x] A prévia só deve abrir no servidor de desenvolvimento por um parâmetro explícito e não pode contornar autenticação nem ficar acessível no site publicado.

**Evidência:** prévia capturada em desktop e celular; o build estático não contém o conteúdo demonstrativo. Nenhuma sessão, leitura nem gravação Supabase foi usada.

**Limite:** essa prévia continua sendo somente uma demonstração. A nova versão implementa Semana e Atividades operacionais; o Painel com métricas/gráficos segue pendente no item 5.

## 12. Pacote fonte para Netlify e guia Supabase
- [x] Criar ZIP com o código e instruções necessários ao build, sem `.env.local`, chaves, arquivos gerados, `.git` ou UUID pessoal da seção administrativa.
- [x] Incluir `netlify.toml` para pnpm/Vite, publicação de `dist` e fallback de SPA.
- [x] Tornar a logo um asset local do site, para ela funcionar fora do armazenamento da Manus.
- [x] Incluir passo a passo de Netlify, variáveis de build públicas, URLs de retorno/Auth, migração SQL, acesso e limites funcionais atuais, com fontes oficiais.
- [x] Entregar o ZIP e os guias `.md` também como arquivos separados.

**Evidência:** o pacote anterior extraído em pasta limpa passou em `pnpm install --frozen-lockfile`, `pnpm typecheck` e `pnpm build`; o ZIP atualizado foi novamente conferido quanto a arquivos de ambiente, segredos e endpoints específicos.

## 13. Etapa 3 — abas operacionais Atividades e Semana (escopo aprovado em 02/11/2026)
- [x] Após login com perfil `active`, mostrar o espaço da equipe em vez de deixar a pessoa na confirmação de aprovação; incluir navegação funcional entre **Semana** e **Atividades**, e manter os estados pendente/suspenso/sem sessão bloqueados.
- [x] Consultar o Supabase selecionado na publicação usando somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; usar as tabelas existentes `activities`, `areas`, `nuclei`, `profiles`, `team_settings` e `weekly_updates`; não embutir credenciais administrativas, não executar migração/seed de novo e não gravar dados de teste no banco remoto.
- [x] Na aba Atividades, listar as atividades ativas e dados iniciais que existirem no banco (na instalação original são 58), mostrar código, núcleo/área, tipo, frequência/condição, responsável, início, prazo, entregável, observações e situação geral calculada dos registros semanais.
- [x] Disponibilizar filtros por responsável, núcleo, área, tipo, situação geral e período; permitir que as duas áreas sejam buscadas no celular e em computador. O filtro de período considera a sobreposição da janela inteira da atividade.
- [x] Permitir cadastrar novas atividades e editar as existentes para administradores e líderes de área autorizados pelo banco. Campos: área; nome; descrição; tipo; frequência; condição de execução; responsável com nome e, quando selecionado, vínculo à conta; data inicial; prazo; entregável esperado; observações. Código é gerado pelo gatilho existente no banco.
- [x] Validar no formulário: Marco exige data inicial e prazo; Pontual exige prazo; Rotina exige frequência Semanal, Quinzenal ou Mensal; Condicional exige condição; quando ambas existirem, a data inicial não pode ser posterior ao prazo.
- [x] Respeitar os papéis já aplicados por RLS: Administrador edita atividades e status; Líder de área edita somente atividades e status da própria área; Membro vê tudo e atualiza o status somente de atividade atribuída à própria conta; Leitor somente visualiza. Não contornar bloqueios do banco no cliente.
- [x] Na aba Semana, selecionar uma das 60 semanas do ciclo, usando `team_settings.cycle_start` e `cycle_weeks` (padrão segunda-feira, 09/11/2026, por 60 semanas), listar as atividades esperadas para aquela semana e mostrar o estado já salvo; atividade esperada sem registro permanece indicada como Não iniciado/sem atualização sem criar um registro silenciosamente.
- [x] Exibir os estados Concluído, Em andamento, Pendente, Não se aplica e Não iniciado; exigir justificativa não vazia quando Pendente; salvar status/justificativa em `weekly_updates`, com a data da segunda-feira (`week_start`) e o ator preenchido pelo trigger do banco; permitir que pessoas autorizadas atualizem o próprio estado semanal.
- [x] Aplicar regras de expectativa: Semanal em todas as semanas; Quinzenal em semanas alternadas desde o início; Mensal na primeira semana de cada mês; Marco e Pontual durante a janela de datas, deixando de aparecer nas semanas posteriores à semana em que foram concluídas; Condicional em todas as semanas dentro de sua janela.
- [x] Calcular situação geral: Marco/Pontual Concluído se qualquer atualização semanal foi concluída; senão Atrasado quando o prazo passou; senão usar o último estado registrado. Rotina/Condicional Atrasado se alguma semana anterior ficou Pendente; senão usar o último estado registrado ignorando Não se aplica. Não se aplica não conta como conclusão nem pendência.
- [x] Mostrar carregamento, salvamento, confirmação e erros de acesso/conexão de forma clara; permitir recarregar dados do Supabase sem recarregar a aplicação. Não armazenar em cache local dados autenticados.
- [x] Validar código, tipagem, build estático e pacote exportado. Gerar novo ZIP-fonte genérico com a implementação, `.env.example` em placeholders, sem arquivos `.env` locais, chaves, `dist`, `node_modules` ou `.git`; incluir instruções para o usuário atualizar o mesmo repositório GitHub e o mesmo site Netlify.
- [ ] Após o usuário enviar o commit e o Netlify publicar, confirmar no site real que o perfil aprovado abre as abas, que as atividades esperadas aparecem e que um status é salvo com as permissões corretas do Supabase.

**Fora desta entrega:** painel avançado e gráficos, Arquivos/Drive, Comunicados, gestão administrativa dentro do app, importação/exportação e PWA completo. Não apresentar a prévia demo com dados fictícios como painel conectado.
