# SolMar Celeris — atualizar no GitHub/Netlify e habilitar no Supabase

**Revisado em 02/11/2026.** Este manual acompanha o pacote-fonte atualizado. O projeto continua usando o mesmo site Netlify e o mesmo Supabase. Este guia não publica por você nem executa SQL no seu banco.

## O que esta versão acrescenta

Após entrar com um perfil `active`, o menu mostra **Semana**, **Atividades**, **Arquivos**, **Comunicados** e **Chat**. Login e cabeçalho usam a logo original `public/assets/celeris-logo.png`; a imagem não foi editada nem substituída.

O Chat é uma sala coletiva de texto, compartilhada por todos os perfis ativos e atualizada em tempo real. Cada mensagem mostra autor e horário atribuídos pela sessão e pelo banco. Mensagens podem ter até 2.000 caracteres. Não há mensagens privadas, anexos nem edição de mensagem. Elas permanecem salvas até um Administrador ativo removê-las. Ao remover, o texto é substituído por um aviso e o banco conserva apenas os metadados da remoção. Perfis visitantes, `pending` e `suspended` não têm acesso ao chat.

Nas abas Arquivos e Comunicados, as permissões previamente escolhidas continuam valendo: todo perfil ativo pode ver e gerenciar qualquer pasta e comunicado, inclusive de outra área. O app não acessa o conteúdo das pastas do Google Drive.

## 1. Atualizar o repositório que já alimenta o Netlify

1. Baixe e extraia `SolMar_Celeris_Netlify_Atualizado.zip`.
2. Abra no GitHub Desktop o mesmo repositório local que está ligado ao seu site Netlify. Faça uma cópia de segurança da pasta antes de substituir os arquivos.
3. Copie o conteúdo de dentro do ZIP para a pasta do repositório e aceite substituir os arquivos com o mesmo caminho. **Não apague nem substitua `.git`.**
4. Em **Changes**, confirme que aparecem os arquivos do Chat e Perfil, incluindo `TeamChat.tsx`, `ProfileMenu.tsx`, `src/lib/notifications.ts`, `supabase/functions/notify-activity/index.ts` e a migration `20261102152500_profile_email_notifications.sql`.
5. Não envie `.env.local`, `.env.production.local`, `node_modules/` nem `dist/`. O ZIP não contém esses arquivos.
6. No campo **Summary**, escreva `Adicionar perfil e notificações da equipe`. Clique em **Commit to main** (ou na branch principal que o Netlify acompanha) e depois em **Push origin**.
7. O Netlify deve iniciar o deploy ao receber o push. Abra o site existente → **Deploys** e aguarde o deploy mais recente terminar com sucesso. Não crie outro site.

Mantenha as variáveis públicas já cadastradas no Netlify. O build continua usando `pnpm build` e a pasta de saída `dist`. Se elas precisarem ser conferidas, use somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, como Plain text/não secretas e com escopo de build. Nunca coloque senha de banco, `sb_secret_...` nem `service_role` em uma variável `VITE_*`.

## 2. Aplicar somente as migrações que ainda faltam

**Não execute de novo a migração inicial** `20261101184000_initial_schema.sql`. Ela criou o banco base e as atividades iniciais; não é uma atualização do site.

As migrações incrementais são arquivos separados:

- Se você ainda **não** executou `20261102133000_shared_content_permissions.sql`, aplique-a uma única vez para habilitar a gravação de Arquivos e Comunicados. Se já executou essa migração antes, pule-a — não a repita.
- Se ainda não executou `20261102135200_team_chat.sql`, aplique-a uma única vez para criar a tabela do Chat, as regras de acesso e habilitar as atualizações em tempo real. Se já executou, pule-a.
- Aplique `20261102152500_profile_email_notifications.sql` uma única vez para habilitar a edição do próprio nome/foto, o bucket privado e os metadados mínimos de notificação. Se já a executou, pule-a; não repita.

Para cada arquivo que ainda precisa ser aplicado: abra o mesmo projeto Supabase usado pelo Netlify, vá a **SQL Editor → New query**, copie o conteúdo integral daquele único arquivo do pacote, confira o projeto selecionado e clique em **Run**. Espere a confirmação de sucesso antes de aplicar o próximo arquivo. O SQL do Chat usa a publicação `supabase_realtime`; ele não pede que você desative RLS nem use uma chave privilegiada.

O Realtime do Supabase envia alterações Postgres para clientes inscritos quando a tabela está na publicação apropriada e há política de leitura autorizando o usuário. O pacote configura isso para `team_chat_messages` e restringe a leitura a perfis ativos. Consulte a [documentação oficial do Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).

Se você não sabe se a migração antiga de Arquivos/Comunicados já foi executada, **não a repita por tentativa**; pergunte antes para conferir o estado do projeto. A migração inicial e os dados existentes não devem ser apagados.

## 3. Entrar e testar o Chat

Depois do deploy e da migração, saia do site e entre novamente com um perfil ativo. Abra a aba **Chat**. Envie uma mensagem curta de teste. Para verificar a atualização ao vivo, abra o mesmo site em outra sessão com outro perfil ativo; a mensagem nova deve aparecer sem recarregar a página.

Somente uma conta ativa com papel **Administrador** vê o controle de remoção. Teste-o apenas em uma mensagem de teste: confirme a remoção e verifique que ela desaparece nas outras sessões. A pessoa que enviou a mensagem não pode apagá-la se não for Administradora. Não use o Chat para conteúdo confidencial, pois todos os perfis ativos têm acesso à sala.

## 4. Configurar o Perfil e a foto

Depois de aplicar a migration do Perfil e publicar o site, entre com um perfil `active`. No canto superior direito, abra o menu do seu nome/inicial, informe o nome exibido e, se desejar, escolha uma imagem JPEG, PNG ou WebP de até 2 MiB. **Salvar perfil** atualiza apenas sua própria linha `profiles`; a imagem fica em bucket privado. **Remover foto** apaga a referência e volta a mostrar a inicial do nome. Pessoas ativas podem ler fotos pelo Storage; pendentes, suspensas e visitantes são bloqueados. E-mail, papel, área e status não são editáveis por esse menu.

Se o menu avisar que a migration ainda falta ou mantiver os controles desabilitados, confira se `20261102152500_profile_email_notifications.sql` foi aplicada no mesmo Supabase usado pelo site.

## 5. Avisos por e-mail (opcional; ainda desligados)

O projeto não tem provedor de e-mail configurado. O perfil e as outras telas funcionam sem ele. **Deixe `VITE_ACTIVITY_EMAILS_ENABLED=false` (padrão) e pule esta seção se não quiser configurar agora.** Enquanto a flag estiver desligada, o site não chama a função e nenhum e-mail de atividade é enviado.

Para habilitar mais tarde:

1. Crie uma conta Resend, adicione um domínio que a equipe controla e conclua a verificação DNS. Escolha um remetente desse domínio.
2. No Supabase → **Edge Functions**, crie ou atualize a função `notify-activity` com o código de `supabase/functions/notify-activity/index.ts`. Mantenha a verificação JWT padrão ligada e publique a função.
3. Em **Edge Functions → Secrets**, configure `RESEND_API_KEY` com a chave do Resend e `RESEND_FROM_EMAIL` com o remetente verificado. Não coloque a chave no Netlify, em arquivo `.env`, no GitHub, no código-fonte ou em uma mensagem. A função usa a chave de serviço apenas do lado do servidor.
4. Só depois de confirmar a migration, a função publicada e os secrets, no Netlify adicione `VITE_ACTIVITY_EMAILS_ENABLED=true` como texto simples (não segredo), com contexto **Builds**, e publique um novo deploy. Para desligar, volte para `false` e faça novo deploy.
5. Teste com uma alteração de atividade/status feita pelo site e contas de teste ativas: o aviso vai apenas ao responsável atualmente vinculado, se ativo, e a Administradores ativos, excluindo quem fez a alteração. Sem responsável, só Administradores. Mensagens do Chat, perfil, pastas e comunicados não enviam e-mail; justificativa, observações e descrição não são incluídas.

Uma alteração real salva pode disparar e-mail imediatamente após a ativação. Faça testes apenas quando a equipe aceitar receber essas mensagens e evite usar tarefas reais com conteúdo sensível. Se o Resend não estiver configurado, não ative a flag.

## 6. Usar as abas já existentes

Em **Arquivos**, use **Adicionar pasta** e informe um nome, link HTTPS iniciado por `https://drive.google.com/` sem usuário/senha embutidos ou porta personalizada e, opcionalmente, uma área. Sem área, o card fica como **Geral**. O card abre o Drive em outra aba; cada integrante também precisa ter acesso à pasta no próprio Google Drive. Remover tira o atalho da lista, sem apagar o arquivo ou pasta do Google.

Em **Comunicados**, publique título, mensagem e destinatário (toda equipe ou uma área). O autor é automático. Fixados aparecem primeiro e depois vêm os mais recentes. Remover pede confirmação e mantém o registro auditável.

**Semana** e **Atividades** continuam ligadas às tabelas existentes do Supabase. Não é preciso recriar o banco ou as variáveis de ambiente para atualizar essas telas.

## 7. Solução de problemas

- **A aba Chat não aparece:** confirme que o novo deploy foi publicado e entre com uma conta de perfil `active`; atualize com Ctrl+F5 (Windows) ou Cmd+Shift+R (Mac).
- **O Chat avisa que ainda não foi habilitado ou erro de tabela/função ausente:** confirme se `20261102135200_team_chat.sql` foi executada no mesmo Supabase. Não rode novamente a migração inicial.
- **A mensagem envia, mas não chega em tempo real:** use **Atualizar** no Chat e confirme que a migração do Chat concluiu sem erro e habilitou a publicação Realtime. Não desligue RLS.
- **Não aparece o botão de remoção:** isso é esperado para quem não tem papel Administrador. A conta precisa estar ativa e com papel `admin` no perfil.
- **RLS bloqueou uma ação:** confira se a conta está ativa e se as migrações necessárias foram aplicadas ao projeto certo; não contorne o erro removendo políticas.
- **O Netlify falhou:** abra o log do deploy e confira `pnpm install --frozen-lockfile`, `pnpm build` e a saída `dist/index.html`. Não crie outro site.

Nunca envie senhas, chaves, tokens ou URLs privadas em capturas de tela ou mensagens. Se precisar de ajuda com um erro, compartilhe apenas o texto não sensível.

## Segurança e limites

O pacote contém código e guias, mas não a configuração local de ambiente, `dist`, `node_modules`, `.git`, credenciais de produção ou endpoints de projeto. A nova tabela do Chat revoga `UPDATE` e `DELETE` do navegador; o único caminho de remoção é uma função do banco que verifica o papel Administrador ativo, substitui o texto original e registra o ator e a data. Os demais perfis ativos podem apenas ler e enviar. Visitantes e perfis pendentes/suspensos ficam bloqueados por RLS.

A verificação local não substitui o teste no seu Supabase e Netlify reais. Nenhum SQL, mensagem ou outra escrita foi executada pelo agente no seu banco remoto, e nenhum deploy foi feito por esta atualização.
