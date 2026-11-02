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
- [ ] A tela de autenticação reformulada, responsiva e em português, mantendo a identidade visual, com ações distintas para Entrar, Criar cadastro e Esqueci minha senha.
- [ ] Cadastro aberto por e-mail e senha, solicitando nome, e-mail, senha e confirmação; todo perfil novo inicia como `pending`, mesmo após confirmação de e-mail, e não lê dados da equipe até a aprovação do administrador.
- [ ] Cadastro apresenta uma confirmação clara: se o Supabase exigir verificação, orientar a pessoa a conferir o e-mail; deixar explícito que confirmar o endereço não libera acesso aos dados.
- [ ] Recuperação de senha envia link Supabase para o e-mail informado; link de recuperação abre o formulário para definir e confirmar nova senha, atualiza a senha na Auth e retorna à entrada.
- [ ] Mensagem da recuperação não revela se o e-mail está cadastrado; falhas de rede e limites de envio são explicados sem deixar o botão travado.
- [ ] Ninguém sem perfil ativo e aprovado vê dados da equipe; visitantes sem sessão, perfis `pending` ou `suspended` continuam bloqueados por RLS no banco.
- [ ] Administrador (coordenação/Projetos): acesso total, gerencia usuários, áreas e configurações.
- [ ] Líder de área: edita as atividades e os status da própria área; vê o resto.
- [ ] Membro: vê tudo e atualiza o status das atividades em que é responsável.
- [ ] Leitor: só visualiza.
- [ ] Aplicar permissões no banco conforme os perfis, não apenas esconder ações na interface; usuário pendente ou suspenso e visitante sem login não leem dados da equipe.

**Progresso (02/11/2026):** a tela pública usa o projeto Supabase esperado; a consulta pública de configurações confirma cadastro e provedor de e-mail habilitados, com confirmação de e-mail obrigatória. O app agora classifica erros conhecidos de login e mostrará um código seguro de suporte para falhas não classificadas. Não houve tentativa de login, consulta de conta ou envio de e-mail pelo agente. A causa desta conta ainda depende do código/registro de Auth da próxima tentativa; aprovação de perfis segue manual e o painel de atividades ainda não foi implementado.

## 3. Atividades e filtros
- [ ] Campos: ID automático (sigla da área + número), núcleo (automático pela área), área, nome, descrição, tipo, frequência, condição de execução, responsável, data de início, prazo final, entregável esperado, observações.
- [ ] Tipos: Marco (entrega importante, exige início e prazo), Pontual (exige prazo), Rotina (semanal, quinzenal ou mensal), Condicional (exige a condição de execução, ocorre só quando houver necessidade).
- [ ] Editar início, prazo e responsável de qualquer atividade; adicionar novas atividades com validação das regras acima.
- [ ] Filtros por responsável, núcleo, área, tipo, status e período.
- [ ] Carregar inicialmente as 58 atividades que estão no protótipo (45 de rotina e condicionais e 13 marcos e pontuais de exemplo, com datas ilustrativas).

## 4. Acompanhamento semanal e status geral
- [ ] Período de 60 semanas, com início configurável (padrão: segunda-feira, 09/11/2026).
- [ ] Cada atividade esperada na semana recebe um status: Concluído, Em andamento, Pendente, Não se aplica ou Não iniciado. Justificativa obrigatória quando for Pendente.
- [ ] Regras de quando a atividade é esperada: Semanal toda semana; Quinzenal em semanas alternadas a partir do início; Mensal na primeira semana do mês; Marco e Pontual durante sua janela (e encerram na semana da conclusão); Condicional toda semana.
- [ ] Não se aplica nunca conta como conclusão nem como pendência. Atividades financeiras sem movimentação ou demanda ficam como Não se aplica e não são cobradas.
- [ ] Semana sem atualização: semana passada, esperada e em branco. Aparece como alerta, mas não muda o status geral.
- [ ] Marco/Pontual: Concluído se alguma semana foi concluída; Atrasado se o prazo passou sem conclusão; senão vale o último status informado.
- [ ] Rotina/Condicional: Atrasado se alguma semana passada ficou Pendente; senão vale o último status informado, ignorando Não se aplica.

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
- [ ] Passo a passo de publicação e guia curto para a equipe entrar e usar; em cada etapa, indicar o que testar e como saber que deu certo.
- [ ] Executar as etapas na ordem: (1) projeto e banco, (2) login e convites, (3) atividades e semana, (4) painel, (5) arquivos e comunicados, (6) publicação e PWA.
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

**Evidência:** o ZIP extraído em pasta limpa passou em `pnpm install --frozen-lockfile`, `pnpm typecheck` e `pnpm build`; a logo está no `dist`. O pacote exclui `.env.local`, `node_modules`, `dist`, chaves privilegiadas e UUIDs literais.

**Observação:** o guia Netlify/Supabase segue no ZIP e como arquivo separado; somente a cópia do guia administrativo incluída no ZIP substitui identificadores pessoais por placeholders.

**Navegação:** o README aponta para o guia principal na raiz do projeto; o mesmo arquivo acompanha o ZIP.

**Navegação:** o README aponta para o guia principal na raiz do projeto; o mesmo arquivo acompanha o ZIP.
