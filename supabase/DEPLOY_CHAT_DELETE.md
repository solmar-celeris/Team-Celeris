# Publicação da exclusão global do Chat

A Edge Function `delete-chat-content` já está implementada em
`supabase/functions/delete-chat-content/index.ts` e é chamada pelo cliente
para excluir mensagens, grupos e conversas privadas para todos os participantes.

## Publicar

Na raiz do projeto, com o Supabase CLI autenticado e vinculado ao projeto correto:

```bash
supabase db push
supabase functions deploy delete-chat-content
```

A migration `20261110101000_chat_global_delete_member_revocation.sql` depende
de `20261110100000_member_removed_enum.sql`. Mantenha ambas no diretório
`supabase/migrations`; `db push` aplica as migrations pendentes em ordem.

## Segurança e comportamento

- A função exige uma sessão Bearer válida e perfil ativo.
- A autorização de participante é revalidada pelas RPCs no banco.
- As RPCs de exclusão são executáveis somente por `service_role`.
- Caminhos de arquivos não são aceitos no corpo da requisição.
- A limpeza de anexos, áudios e fotos é processada por uma fila durável e
  pode ser repetida com `action: cleanup_pending`.
- Mensagens e conversas são removidas globalmente; a exclusão não é apenas
  um ocultamento local.

Não publique a função antes de aplicar as migrations necessárias.
