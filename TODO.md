# Entregas do SolMar Celeris

## 1. Projeto, banco de dados e segurança
- [ ] Estrutura do site responsiva e PWA em português, preservando paleta, modo claro/escuro e navegação do protótipo, com foco no celular e funcionamento em computador.
- [x] Supabase (Postgres, Auth e Realtime) como banco online compartilhado, substituindo armazenamento local; Netlify como hospedagem gratuita já escolhida, sujeita aos limites do serviço.
- [ ] Modelo de tabelas para áreas, perfis, atividades, status semanais, configurações, pastas do Drive, comunicados e histórico de auditoria; banco com RLS e negação padrão para usuários sem acesso.
- [ ] Sem senha ou chave secreta no código do navegador; somente chave pública no cliente, com credencial privilegiada restrita a função segura de servidor.
- [ ] Guardar apenas dados necessários; registrar ator e quando cada alteração foi feita, principalmente status, prazos, comunicados e remoções.
- [ ] Carregar inicialmente as 58 atividades do protótipo (45 de rotina e condicionais e 13 marcos e pontuais de exemplo, com datas ilustrativas).
- [ ] Registrar como criar/configurar projeto Supabase e conectar o app sem inserir dados reais antes da decisão consciente do usuário.

## 2. Login, convites, perfis e permissões
- [ ] Login por e-mail e senha e/ou conta Google, em português.
- [ ] A tela de autenticação reformulada, responsiva e em português, mantendo a identidade visual, com ações distintas para Entrar, Criar cadastro e Esqueci minha senha.
- [ ] Cadastro aberto por e-mail e senha, solicitando nome, e-mail, senha e confirmação; depois da migration incremental `20261102160000_auto_activate_new_signups.sql`, todo perfil novo inicia automaticamente `active` com papel `member` e sem área, podendo acessar os dados permitidos pela RLS.
- [ ] Cadastro apresenta uma confirmação clara: se o Supabase exigir verificação, orientar a pessoa a conferir o e-mail; após confirmar, o acesso ao perfil ativo é liberado sem aprovação no Dashboard.
- [ ] Recuperação de senha envia link Supabase para o e-mail informado; link de recuperação abre o formulário para definir e confirmar nova senha, atualiza a senha na Auth e retorna à entrada.
- [ ] Mensagem da recuperação não revela se o e-mail está cadastrado; falhas de rede e limites de envio são explicados sem deixar o botão travado.
- [ ] Ninguém sem perfil `active` vê dados da equipe; visitantes sem sessão, perfis `pending` e `suspended` continuam bloqueados por RLS no banco. Novos cadastros tornam-se ativos automaticamente após a migration aprovada pelo usuário.
- [ ] Administrador (coordenação/Projetos): acesso total, gerencia usuários, áreas e configurações.
- [ ] Líder de área: edita as atividades e os status da própria área; vê o resto.
- [ ] Membro: vê tudo e atualiza o status das atividades em que é responsável.
- [ ] Leitor: só visualiza.
- [ ] Aplicar permissões no banco conforme os perfis, não apenas esconder ações na interface; usuário pendente ou suspenso e visitante sem login não leem dados da equipe.

**Progresso (02/11/2026):** novos cadastros passarão a ser automaticamente `active/member` conforme escolha explícita do usuário; a confirmação de e-mail, se já ativa no Supabase, permanece independente. Perfis existentes `pending` não serão promovidos por essa migration. Perfil ativo entra no espaço da equipe. Semana/Atividades, Arquivos/Comunicados, Chat e Perfil/notificações estão na fonte; cada incremento depende de aplicar migration correspondente e publicar o bundle. O Painel avançado ainda não foi implementado. Nenhum provedor de e-mail está configurado; envio permanece desligado.

## 3. Atividades e filtros
- [x] Campos: ID automático (sigla da área + número), núcleo (automático pela área), área, nome, descrição, tipo, frequência, condição de execução, responsável, data de início, prazo final, entregável esperado, observações.
- [x] Tipos: Marco (entrega importante, exige início e prazo), Pontual (exige prazo), Rotina (semanal, quinzenal ou mensal), Condicional (exige a condição de execução, ocorre só quando houver necessidade).
- [x] Editar início, prazo e responsável de qualquer atividade; adicionar novas atividades com validação das regras acima.
- [x] Filtros por responsável, núcleo, área, tipo, status e período.
- [x] Carregar inicialmente as 58 atividades que estão no protótipo (45 de rotina e condicionais e 13 marcos e pontuais de exemplo, com datas ilustrativas).

## 4. Acompanhamento semanal e status geral
- [x] Período de 60 semanas, com início configurável (padrão: segunda-feira, 09/11/2026).
- [x] Cada atividade esperada na semana recebe um status: Concluído, Em andamento, Pendente, Não se aplica ou Não iniciado. Justificativa obrigatória quando for Pendente.
- [x] Regras de quando a atividade é esperada: Semanal toda semana; Quinzenal em semanas alternadas a partir do início; Mensal na primeira semana do mês; Marco e Pontual durante sua janela (e encerram na semana da conclusão); Condicional toda semana.
- [x] Não se aplica nunca conta como conclusão nem como pendência. Atividades financeiras sem movimentação ou demanda ficam como Não se aplica e não são cobradas.
- [x] Semana sem atualização: semana passada, esperada e em branco. Aparece como alerta, mas não muda o status geral.
- [x] Marco/Pontual: Concluído se alguma semana foi concluída; Atrasado se o prazo passou sem conclusão; senão vale o último status informado.
- [x] Rotina/Condicional: Atrasado se alguma semana passada ficou Pendente; senão vale o último status informado, ignorando Não se aplica.

## 5. Painel e indicadores
- [ ] % de conclusão = concluídas ÷ (total − não se aplica). % de execução da semana = concluído ÷ (concluído + em andamento + pendente).
- [ ] Painel com: total, concluídas, em andamento, pendentes, atrasadas, não aplicáveis, não iniciadas, semanas sem atualização, marcos concluídos, prazos nos próximos 7 dias.
- [ ] Gráficos por núcleo e por área; execução semanal das últimas 12 semanas.

## 6. Pastas e links do Drive
- [x] Uma pasta principal do Drive em destaque, como ícone de pasta grande clicável que abre o link.
- [x] Botão “Adicionar pasta”: nome da pasta + link HTTPS de `drive.google.com` sem usuário/senha embutidos nem porta personalizada + área (ou “Geral”). Cada pasta é um ícone de pasta clicável.
- [x] Botão “Remover pasta” em cada uma, com confirmação em dois passos.
- [x] Integração por link (abrir no Drive), sem ler o conteúdo das pastas.

## 7. Comunicados
- [x] Publicar com título, mensagem, destinatário (toda a equipe ou uma área) e autor automático (quem está logado).
- [x] Fixar e desafixar no topo, remover com confirmação. Mais recentes primeiro.
- [ ] Permitir que qualquer perfil ativo responda e reaja aos comunicados; mostrar respostas/reactions em tempo real; permitir que autor remova a própria resposta e Administrador ativo modere; requer aplicar `20261104101500_announcement_replies_reactions.sql` e publicar o site.
- [ ] Opcional: aviso de comunicado novo (selo na aba e/ou e-mail).

## 8. Importação, exportação e alertas opcionais
- [ ] Exportar dados para Excel (.xlsx) e fazer backup em .json.
- [ ] Importar as atividades e status que já estão na planilha.
- [ ] Opcional: aviso semanal automático de atividades atrasadas e semanas sem atualização.

## 9. Publicação, PWA e guias de uso
- [ ] Site em português do Brasil, prioridade para celular, fluido em computador, com a paleta #38B6FF, #126CAD, #67B6FA, #014B89 e #E06916, #E87B27; modo claro e escuro.
- [ ] Cores discretas por status: verde (concluído), azul (em andamento), laranja (pendente), vermelho (atrasado), cinza (não se aplica e não iniciado), amarelo (sem atualização).
- [ ] PWA instalável no celular; cache offline limitado à casca estática e sem persistir dados privados autenticados.
- [ ] Passo a passo de publicação e guia curto para a equipe entrar e usar; em cada etapa, indicar o que testar e como saber que deu certo.
- [x] Executar as etapas na ordem: (1) projeto e banco, (2) login, (3) atividades e semana, (4) painel, (5) arquivos e comunicados, (6) Chat, (7) perfil/notificações, (8) publicação e PWA. Etapas 3, 5, 6 e 7 estão no código; Painel avançado e PWA completos continuam pendentes; migrations/deploy dependem do usuário; e-mail depende de provedor.
- [ ] Perguntar antes de decidir algo que mude custo, segurança ou privacidade dos dados (LGPD: guardar só o necessário).

## 10. Identificação no rodapé
- [x] Substituir “PROJETO UNIVERSITÁRIO · ENERGIA SOLAR” por “UFCI/RJ” no rodapé, preservando “SolMar Celeris” e dando destaque visual discreto à identificação institucional.


## 11. Prévia visual pós-login (somente demonstração)
- [x] Mostrar um exemplo visual do Painel interno com dados claramente fictícios; não conectar ao Supabase nem consultar informações reais.
- [x] A prévia só deve abrir no servidor de desenvolvimento por um parâmetro explícito e não pode contornar autenticação nem ficar acessível no site publicado.

**Evidência:** prévia capturada em desktop e celular; o build estático não contém o conteúdo demonstrativo. Nenhuma sessão, leitura nem gravação Supabase foi usada.

**Limite:** esta é apenas uma visualização; o Painel operacional e suas consultas reais continuam pendentes no item 5.


## 12. Pacote fonte para Netlify e guia Supabase
- [x] Criar ZIP com todo o código e instruções necessários ao build, sem `.env.local`, chaves, arquivos gerados, `.git` ou UUID pessoal da seção administrativa.
- [x] Incluir `netlify.toml` para pnpm/Vite, publicação de `dist` e fallback de SPA.
- [x] Tornar a logo um asset local do site, para ela funcionar fora do armazenamento da Manus.
- [x] Incluir passo a passo de Netlify, variáveis de build públicas, URLs de retorno/Auth, migração SQL, acesso e limites funcionais atuais, com fontes oficiais.
- [x] Entregar o ZIP e o guia `.md` também como links separados.

**Evidência:** o pacote anterior extraído em pasta limpa passou em `pnpm install --frozen-lockfile`, `pnpm typecheck` e `pnpm build`; os novos módulos de Chat, perfil e e-mail serão revalidados no pacote desta etapa. ZIPs excluem `.env.local`, `node_modules`, `dist`, `.git`, endpoints pessoais e chaves reais.

**Observação:** os guias Netlify/Supabase seguem no ZIP e como arquivos separados; exemplos administrativos usam placeholders e não incluem identificadores pessoais.

## 13. Etapa 3 — Semana e Atividades
- [x] Implementar o espaço pós-login com abas Semana e Atividades no mesmo site, conectadas ao Supabase, sem criar outro projeto nem trocar o banco.
- [x] Implementar consultas, filtros, formulários, responsável e status semanal conforme os critérios completos das seções 3 e 4; respeitar autorização RLS.
- [x] Atualizar o manual Netlify/Supabase, guia de uso e ZIP do mesmo site, sem incluir credenciais nem build/dependências.

## 14. Atualizações de interface — comunicados, IA e Chat
- [x] Incluir no menu uma aba **IA** com atalhos externos para ChatGPT, Claude AI, Manus IA e Gemini, abrindo cada serviço em nova aba.
- [x] Atualizar a apresentação visual do Chat com balões e organização inspirada em mensageiros, preservando cores e identidade SolMar, recursos atuais, tema escuro, grupos e comportamento responsivo.
- [x] Manter respostas e reações disponíveis para perfis `active` conforme migration incremental; não abrir acesso a visitantes, perfis pendentes ou suspensos.
**Evidência:** TypeScript e build passaram; o ZIP anterior foi validado em extração limpa. A confirmação do Supabase remoto depende do usuário.

## 14. Etapa 5 — Arquivos e Comunicados (permissões confirmadas em 02/11/2026)
- [x] Acrescentar Arquivos e Comunicados ao menu responsivo, mantendo Semana e Atividades.
- [x] Arquivos consulta `drive_folders` e mostra pastas não removidas como cartões/ícones clicáveis. Exibe nome e área ou “Geral”, abre o link em nova aba e não lê/sincroniza conteúdo.
- [x] Adicionar pasta com nome obrigatório, link HTTPS de `drive.google.com` sem usuário/senha embutidos nem porta personalizada, área opcional; a primeira pode ser marcada principal quando ainda não houver principal.
- [x] Remover pasta em dois passos por remoção lógica; manter histórico e ator/data, sem apagar o conteúdo no Drive.
- [x] Qualquer perfil ativo vê todos os comunicados (incluindo os destinados a outra área), fixados primeiro e depois mais recentes; pode publicar com título, mensagem e audiência para toda a equipe ou qualquer área.
- [x] Autor de comunicado é atribuído no banco; qualquer perfil ativo pode fixar/desafixar e remover com confirmação em dois passos; o corpo publicado não pode ser editado nesta etapa.
- [x] Permissão confirmada pelo usuário: qualquer perfil ativo — Administrador, Líder, Membro ou Leitor — pode ver e gerenciar todas as pastas e comunicados, inclusive de outras áreas.
- [x] Preparar migração incremental `20261102133000_shared_content_permissions.sql`, sem repetir a inicial nem executar SQL remoto; atualizar guias e pacote.
- [ ] Depois que o usuário aplicar a migração e publicar, verificar no site real leitura/gravação de perfil ativo e bloqueio de pendentes/suspensos.

## 15. Etapa 6 — Chat geral e grupos
- [x] Preservar a sala geral compartilhada e estendê-la com grupos nomeados, sem anexos ou edição.
- [x] Permitir leitura/envio da sala geral a perfis ativos; grupos ficam limitados aos participantes ativos e Administradores ativos; visitante, pendente e suspenso não acessam.
- [x] Exibir autor/horário derivados da sessão e do banco e limitar a mensagem a 2.000 caracteres após remover espaços externos.
- [x] Usar Supabase Realtime/Postgres Changes com RLS e tabela na publicação `supabase_realtime`.
- [x] Só Administrador ativo remove qualquer mensagem; demais não veem o controle e chamada direta sem autorização é negada.
- [x] Remoção troca o texto por marcador fixo, grava ator/hora, não mantém cópia do texto e não expira mensagens automaticamente.
- [x] Login e workspace referenciam a logo original compartilhada `celeris-logo.png`; manter o arquivo original intacto e não criar nem substituir assets de marca.
- [x] Código e migração incremental `20261102135200_team_chat.sql` estão no pacote; não executar SQL remoto nem publicar pelo agente.
- [ ] Depois que o usuário aplicar as migrations e publicar, verificar sala geral em duas sessões, criação/convite de grupo, bloqueio de não participantes, moderação Admin e bloqueio de perfil pendente/suspenso. SQL, sozinho, não publica a interface.

## 16. Etapa 7 — Perfil, foto e avisos de atividade
- [x] Reutilizar `public.profiles` como cadastro e `activities.responsible_user_id` para vincular tarefas à conta. O seletor atual já oferece os perfis ativos; não criar banco/lista de usuários duplicada.
- [x] Exibir no canto do cabeçalho o nome/foto da sessão. Sem foto, usar a inicial do nome.
- [x] Configurações permite editar apenas o próprio nome de exibição e a própria foto; não permite editar e-mail, papel, área, status nem o perfil de outra pessoa.
- [x] Guardar somente `avatar_path` no perfil e a imagem em bucket privado; somente pessoas ativas visualizam fotos. Aceitar JPEG/PNG/WebP de até 2 MiB; remover foto retorna à inicial.
- [x] Após gravação de atividade ou status semanal pelo site, invocar aviso somente ao responsável atualmente vinculado quando houver e a Administradores ativos, excluindo quem fez a alteração. Sem responsável: apenas Administradores. A entrega real depende de configurar e publicar a função/provedor.
- [x] Não enviar e-mail por mensagem do Chat; conversa continua em tempo real no site. Esta etapa não envia e-mail por foto/perfil, pasta ou comunicado.
- [x] Invocar Edge Function após gravação autenticada, manter validação JWT ligada, revalidar ator/perfil/permissão no servidor e usar service key apenas na função. Registrar metadados mínimos e deduplicar o mesmo evento; não incluir descrição/observações/justificativa nos e-mails.
- [x] Sem provedor ou domínio remetente configurados. Preparar função Resend, mas manter envio desativado até usuário configurar `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, domínio verificado e `VITE_ACTIVITY_EMAILS_ENABLED=true`; nunca gravar chave em código/Netlify/Git.
- [x] Criar migração incremental de `avatar_path`, RLS de autoedição, bucket privado, autoria de alteração e log de notificações; não repetir migrações aplicadas nem executar SQL/deploy remoto pelo agente.
- [x] Atualizar guia de perfil/e-mail, manual Supabase/Netlify e ZIP sanitizado para o mesmo repositório. Incluir referências oficiais Supabase/Resend consultadas.
- [x] Validar TypeScript/build e pacote limpo, sem `.env` local, chaves, `dist`, `node_modules` ou `.git`.
- [ ] Depois que o usuário configurar e publicar, verificar perfil/foto em duas contas e entrega a envolvidos/Admins; não deve sair e-mail de Chat.

**Navegação:** o README aponta para o guia principal na raiz do projeto; o mesmo arquivo acompanha o ZIP.


## 17. Navegação com ícones
- [x] Cada aba tem um ícone acessível e coerente: Chat = balão de conversa; Comunicados = megafone; Semana = calendário; Atividades = lista/checklist; Arquivos = pasta.
- [x] A ordem é exatamente: **Chat, Comunicados, Semana, Atividades, Arquivos**, em computador e celular; manter nomes escritos e indicar visualmente a aba atual.
- [x] Usar a biblioteca de ícones já instalada; não trocar nem editar a logo original.

## 18. Grupos no Chat
- [x] Preservar a sala geral atual e permitir que perfis ativos criem um grupo com nome e selecionem pessoas ativas; o criador entra automaticamente no grupo.
- [x] Permitir que integrantes do grupo adicionem outras contas ativas depois da criação; mostrar apenas grupos dos quais a pessoa participa. Administradores podem moderar mensagens conforme a regra existente.
- [x] Integrantes do grupo enviam e recebem mensagens em tempo real; o canal geral continua visível para todos os perfis ativos.
- [x] RLS no Supabase limita a leitura e envio no grupo a participantes ativos e Administradores; visitantes, pendentes, suspensos e não participantes não leem as mensagens privadas do grupo.
- [x] Somente Administradores ativos podem remover mensagens, inclusive nas conversas de grupo; manter autoria/horário, limite de 2.000 caracteres e sem anexos ou e-mail de Chat.
- [x] Criar migration SQL incremental para grupos/membros e associação das mensagens, sem executar SQL remoto nem repetir migrations aplicadas.
- [ ] Depois do deploy e das migrations, verificar com três contas que pessoa não convidada não vê grupo/histórico e que as mensagens chegam em tempo real.

## 19. Ativação automática de novos cadastros — escolha confirmada
- [x] O usuário escolheu “B — Ativar automaticamente todo cadastro”; novos perfis criados após a migration ficam `active` automaticamente, sem o Administrador precisar abrir o Supabase para aprovar cada um.
- [x] Criar trigger/migration incremental que atribui somente `status='active'` e `role='member'` a novos perfis; nunca aceitar `role`, `status` ou área privilegiada enviados no metadata público.
- [x] Manter a confirmação de e-mail se ela já estiver habilitada no Supabase; ativação do perfil e confirmação de endereço são controles distintos; não desativar o provedor de confirmação sem autorização.
- [x] A migration não promove automaticamente perfis antigos que já estavam `pending` antes da aplicação; manter essa diferença explícita e preservada.
- [x] Deixar claro na tela de cadastro que novas contas serão ativadas automaticamente e terão acesso aos dados compartilhados permitidos pela RLS; qualquer pessoa que consiga se cadastrar poderá acessar o espaço.
- [ ] Depois que a migration e o deploy forem aplicados, confirmar no site se novo cadastro entra imediatamente ou após confirmar o e-mail, conforme a configuração Auth existente.


## 17. Período do projeto, logos, Canva e documentação
- [ ] **Período editável:** exibir as datas de início e fim configuradas; início padrão 09/11/2026 e término padrão 22/12/2027. Permitir a um Administrador ativo ajustar e salvar ambas as datas no Supabase; não permitir que perfis sem papel Administrador salvem. O início precisa ser segunda-feira, porque os registros semanais usam segundas-feiras. A contagem de semanas deve ser calculada pelo intervalo salvo e a última semana deve terminar na data final, mesmo se for parcial. Preservar histórico e atividades; adicionar somente migration incremental, manter RLS e não executar SQL no projeto remoto.
- [ ] **Aba IA:** preservar a logo SolMar e o visual atual. Exibir logos correspondentes a ChatGPT, Claude, Gemini e Manus, usando as URLs fornecidas no pedido, e atalho Canva. Abrir serviços externos em nova aba. Não armazenar senha, token ou credencial do Google/Canva e não prometer login automático: o Canva só poderá reaproveitar a conta Google se a sessão já estiver conectada no dispositivo/navegador e o acesso estiver autorizado.
- [ ] **Registro de Atividades — prompt integral e copiável:** atuar como responsável pela documentação institucional SolMar Celeris e converter informações brutas em Registro de Atividades usando obrigatoriamente o template oficial `https://docs.google.com/document/d/1rBBxJRcyNiBY7Fy9eibpBSZ_ctgmzyfL/edit?usp=drive_link&ouid=115852090288971314938&rtpof=true&sd=true`. Aceitar fotografias de manuscritos/anotações, áudios/relatos verbais, mensagens/conversas, textos livres, fotos de atividades/equipamentos/materiais e documentos complementares. Analisar tudo; transcrever manuscritos e áudios, corrigir escrita e remover repetições desnecessárias; identificar data, Núcleo, Setor, quem registrou, local e participantes; separar atividades realmente executadas em **O QUE FOI REALIZADO** de pendências, decisões, encaminhamentos e ações futuras em **PRÓXIMOS PASSOS**; preservar dados técnicos, decisões, resultados e detalhes; nunca inventar dados, datas, pessoas, responsáveis ou resultados; distinguir fatos confirmados, hipóteses e sugestões; sinalizar dados ilegíveis, incompletos ou contraditórios e pedir esclarecimentos. Usar exatamente o template oficial, inclusive estrutura, tabelas, cabeçalhos, rodapés, fontes, espaçamento, identidade visual e a logo oficial SolMar como imagem em `https://drive.google.com/file/d/1DnU7amLCKepVDixVOAAwOYIzo7K1z5zv/view?usp=drive_link`. Preservar todos os campos: DATA, SETOR, QUEM REGISTROU, LOCAL, QUEM PARTICIPOU, O QUE FOI REALIZADO, PRÓXIMOS PASSOS, Registrado por e Data; não criar modelo, remover campos ou acrescentar seções. Entregar DOCX editável para download com nome exato `REG_ATIVIDADES_AAAA-MM-DD_NUCLEO_SETOR.docx`, preenchendo data da atividade (não data de elaboração), Núcleo e Setor reais em maiúsculas, sem acentos e com sublinhados; nunca entregar nome genérico/provisório.
- [ ] **POP — prompt integral e copiável:** primeiro distinguir elaboração nova de revisão. Usar obrigatoriamente o template oficial `https://docs.google.com/document/d/1MRQZyQyggwlgq2oXCwoQ4JMCVHc4yI23/edit?usp=drive_link&ouid=115852090288971314938&rtpof=true&sd=true`. Para novo POP: identificar procedimento, Núcleo e Setor; definir título e objetivo com base nas fontes; listar ferramentas, materiais, equipamentos e recursos quando informados; organizar etapas numeradas, sequenciais e claras; preservar quantidades, parâmetros, especificações e segurança; distinguir instruções obrigatórias de recomendações; não inventar técnica, quantidade, parâmetro ou etapa; sinalizar lacunas para validação técnica; se número oficial não estiver informado/disponível, pedir confirmação antes de finalizar. Para revisão: comparar documento original e informações novas; identificar etapas alteradas/acrescidas/removidas; preservar o conteúdo ainda válido; atualizar sem descaracterizar; atualizar histórico com dados disponíveis; manter número original; incrementar versão `v02`, `v03`, `v04` etc.; nunca apagar histórico nem substituir documento vigente sem validação responsável. Preservar exatamente título, número, objetivo, histórico de revisões (Rev., Data, Destaques, Motivação, Autor(a), Revisor(a)), documentos relacionados (Documento, Link de acesso) e procedimentos; manter template, estrutura, tabelas, cabeçalhos, rodapés, fontes e espaçamento; inserir a logo oficial como imagem no endereço fornecido; não criar modelo, remover campos ou adicionar seções. Entregar DOCX editável para download com nomenclatura exata `POP_NUMERO_NUCLEO_SETOR_v01.docx`; o número do arquivo deve ser o mesmo do campo NÚMERO, em maiúsculas e sem acentos para Núcleo/Setor, usar `v01` na primeira versão e incrementar somente a versão em revisão, nunca usar data no lugar do número nem nome genérico/provisório.
- [ ] **Identificação e armazenamento comuns aos documentos:** usar somente os Núcleos de Engenharia e Gestão. Engenharia contém Mecânica Naval, Energia e Telemetria; Gestão contém Marketing, Pessoas, Projetos e Administrativo Financeiro; Tecnologia da Informação é Núcleo Transversal. Não confundir Núcleo com Setor; se o setor informado não estiver na lista, pedir confirmação. Se houver vários setores, identificar o principal responsável e mencionar os demais no conteúdo quando aplicável. Armazenar Registros em `Gestão > Projetos > Registro de atividades`, independentemente do responsável. Armazenar POPs em `Núcleo > Setor`; não misturar POPs e Registros, manter templates oficiais separados dos documentos preenchidos e preservar histórico de revisões no POP. Informar a pasta de destino prevista; nunca afirmar que salvou no Google Drive sem acesso e autorização. Antes de concluir, conferir tipo documental, template oficial, logo, identificação Núcleo/Setor, fidelidade às fontes, DOCX editável, nomenclatura exata, número do POP no nome e destino previsto. Ao entregar, informar tipo, Núcleo/Setor, nome exato do arquivo, pasta prevista e pendências de validação. Considerar o documento finalizado somente se template, identidade visual, nome e conteúdo estiverem validados; se não for possível acessar o template ou inserir a logo, informar a limitação sem alegar fidelidade ao modelo.
