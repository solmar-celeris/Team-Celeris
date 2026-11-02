import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageCircle, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react';
import type { MemberProfile } from './domain';
import './team-chat.css';

type TeamChatMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

type TeamChatProps = {
  client: SupabaseClient;
  userId: string;
  isAdmin: boolean;
  members: Pick<MemberProfile, 'user_id' | 'full_name'>[];
};

const PAGE_SIZE = 50;
const MESSAGE_LIMIT = 2000;
const MESSAGE_COLUMNS = 'id,sender_id,body,created_at,removed_at,removed_by';

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function mergeMessages(current: TeamChatMessage[], incoming: TeamChatMessage[]): TeamChatMessage[] {
  const unique = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) unique.set(message.id, message);
  return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function chatError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Não foi possível concluir a operação. Tente novamente.';
  const details = error as { code?: string; message?: string };
  if (['42P01', 'PGRST205', 'PGRST202'].includes(details.code ?? '')) {
    return 'O chat ainda não foi habilitado neste Supabase. Um administrador precisa aplicar a migração incremental do chat.';
  }
  if (details.code === '42501') {
    return 'O Supabase bloqueou a operação pelas regras de acesso do perfil. Confira se a conta está ativa e se a migração foi aplicada.';
  }
  return details.message || 'Não foi possível concluir a operação. Confira a conexão e tente novamente.';
}

export default function TeamChat({ client, userId, isAdmin, members }: TeamChatProps) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);
  const eventRevisionRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const removedIdsRef = useRef(new Set<string>());

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.full_name.trim()])),
    [members],
  );

  const loadLatest = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    const revisionAtStart = eventRevisionRef.current;

    try {
      const { data, error: queryError } = await client
        .from('team_chat_messages')
        .select(MESSAGE_COLUMNS)
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (queryError) throw queryError;

      const rows = ((data ?? []) as unknown as TeamChatMessage[])
        .filter((message) => !removedIdsRef.current.has(message.id))
        .reverse();
      setHasOlder((data ?? []).length === PAGE_SIZE);
      setMessages((current) => {
        const concurrentEvents = eventRevisionRef.current !== revisionAtStart
          ? current.filter((message) => !removedIdsRef.current.has(message.id))
          : [];
        const next = mergeMessages(rows, concurrentEvents)
          .filter((message) => !removedIdsRef.current.has(message.id));
        autoScrollRef.current = true;
        return next;
      });
    } catch (loadError) {
      setError(chatError(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    void loadLatest();
    const channel = client
      .channel(`team-chat-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_chat_messages',
      }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) {
          removedIdsRef.current.add(message.id);
          setMessages((current) => current.filter((item) => item.id !== message.id));
          return;
        }
        setMessages((current) => mergeMessages(current, [message]));
        autoScrollRef.current = true;
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'team_chat_messages',
      }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) {
          removedIdsRef.current.add(message.id);
          setMessages((current) => current.filter((item) => item.id !== message.id));
          setConfirmRemoveId((current) => current === message.id ? null : current);
          return;
        }
        setMessages((current) => mergeMessages(current, [message]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected');
          if (hasConnectedRef.current) void loadLatest(true);
          else hasConnectedRef.current = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('disconnected');
        } else {
          setConnection('connecting');
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, loadLatest, userId]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    autoScrollRef.current = false;
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setError('');
    try {
      const { data, error: queryError } = await client
        .from('team_chat_messages')
        .select(MESSAGE_COLUMNS)
        .is('removed_at', null)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (queryError) throw queryError;
      const older = ((data ?? []) as unknown as TeamChatMessage[])
        .filter((message) => !removedIdsRef.current.has(message.id))
        .reverse();
      setMessages((current) => mergeMessages(older, current)
        .filter((message) => !removedIdsRef.current.has(message.id)));
      setHasOlder((data ?? []).length === PAGE_SIZE);
    } catch (loadError) {
      setError(chatError(loadError));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      setError('Escreva uma mensagem antes de enviar.');
      return;
    }
    if (Array.from(body).length > MESSAGE_LIMIT) {
      setError(`A mensagem pode ter até ${MESSAGE_LIMIT} caracteres.`);
      return;
    }

    setSending(true);
    setError('');
    setFeedback('');
    try {
      const { data, error: insertError } = await client
        .from('team_chat_messages')
        .insert({ body })
        .select(MESSAGE_COLUMNS)
        .single();
      if (insertError) throw insertError;
      const message = data as unknown as TeamChatMessage;
      setMessages((current) => mergeMessages(current, [message]));
      autoScrollRef.current = true;
      setDraft('');
    } catch (sendError) {
      setError(chatError(sendError));
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!isAdmin || removingId) return;
    setRemovingId(messageId);
    setError('');
    setFeedback('');
    try {
      const { error: removeError } = await client.rpc('admin_remove_team_chat_message', {
        p_message_id: messageId,
      });
      if (removeError) throw removeError;
      removedIdsRef.current.add(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setConfirmRemoveId(null);
      setFeedback('Mensagem removida pelo administrador.');
    } catch (removeError) {
      setError(chatError(removeError));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="team-chat" aria-labelledby="team-chat-title">
      <div className="team-chat-heading">
        <div>
          <p className="workspace-kicker">SALA COMPARTILHADA</p>
          <h2 id="team-chat-title"><MessageCircle aria-hidden="true" /> Chat da equipe</h2>
          <p>Converse com os integrantes ativos. As mensagens novas chegam em tempo real.</p>
        </div>
        <div className="team-chat-heading-actions">
          {isAdmin && <span className="team-chat-admin-badge"><ShieldCheck aria-hidden="true" /> Administrador</span>}
          <button className="workspace-refresh" type="button" onClick={() => void loadLatest(true)} disabled={refreshing || loading}>
            <RefreshCw aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className={`team-chat-connection is-${connection}`} role="status">
        <i aria-hidden="true" />
        {connection === 'connected' ? 'Conectado em tempo real' : connection === 'connecting' ? 'Conectando ao chat…' : 'Sem atualização em tempo real; tente atualizar.'}
      </div>

      {error && <p className="team-chat-alert" role="alert">{error}</p>}
      {feedback && <p className="team-chat-feedback" role="status">{feedback}</p>}

      <div className="team-chat-panel">
        <div className="team-chat-history" role="log" aria-label="Mensagens compartilhadas" aria-live="polite" aria-relevant="additions text">
          {hasOlder && messages.length > 0 && (
            <button className="team-chat-older" type="button" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          )}
          {loading && messages.length === 0 ? (
            <div className="team-chat-empty" role="status">Carregando conversa…</div>
          ) : messages.length === 0 ? (
            <div className="team-chat-empty"><MessageCircle aria-hidden="true" /><strong>A conversa começa aqui.</strong><span>Envie a primeira mensagem para a equipe.</span></div>
          ) : (
            messages.map((message) => {
              const senderName = message.sender_id === userId
                ? 'Você'
                : memberNames.get(message.sender_id ?? '') || 'Integrante da equipe';
              return (
                <article className={`team-chat-message${message.sender_id === userId ? ' is-own' : ''}`} key={message.id}>
                  <div className="team-chat-message-meta">
                    <strong>{senderName}</strong>
                    <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                  </div>
                  <p>{message.body}</p>
                  {isAdmin && (
                    <div className="team-chat-message-actions">
                      {confirmRemoveId === message.id ? (
                        <>
                          <span>Remover esta mensagem?</span>
                          <button type="button" className="team-chat-confirm-remove" onClick={() => void removeMessage(message.id)} disabled={removingId === message.id}>
                            {removingId === message.id ? 'Removendo…' : 'Confirmar remoção'}
                          </button>
                          <button type="button" className="team-chat-cancel-remove" onClick={() => setConfirmRemoveId(null)} disabled={removingId === message.id}>Cancelar</button>
                        </>
                      ) : (
                        <button type="button" className="team-chat-remove" onClick={() => setConfirmRemoveId(message.id)} aria-label={`Remover mensagem de ${senderName}`}>
                          <Trash2 aria-hidden="true" /> Remover
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form className="team-chat-composer" onSubmit={(event) => void sendMessage(event)}>
          <label className="team-chat-compose-label" htmlFor="team-chat-message">Sua mensagem</label>
          <textarea
            id="team-chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva para a equipe…"
            rows={3}
            maxLength={MESSAGE_LIMIT}
            disabled={sending}
          />
          <div className="team-chat-compose-footer">
            <span>{Array.from(draft).length}/{MESSAGE_LIMIT} · Mensagens visíveis para todos os perfis ativos</span>
            <button type="submit" disabled={sending || !draft.trim()}>
              <Send aria-hidden="true" /> {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>

      <p className="team-chat-retention-note">
        Mensagens ficam salvas até um Administrador removê-las. Ao remover, o texto é substituído por um aviso e não permanece armazenado no chat.
      </p>
    </section>
  );
}
