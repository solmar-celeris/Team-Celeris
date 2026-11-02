import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageCircle, RefreshCw, Send, ShieldCheck, Trash2, UserPlus, UsersRound } from 'lucide-react';
import type { MemberProfile } from './domain';
import ChatGroupDialog from './ChatGroupDialog';
import './team-chat.css';

type TeamChatMessage = {
  id: string;
  sender_id: string | null;
  group_id: string | null;
  body: string;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

type TeamChatGroup = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

type TeamChatGroupMember = { group_id: string; user_id: string };
type GroupDialogMode = 'create' | 'add-members';

type TeamChatProps = {
  client: SupabaseClient;
  userId: string;
  isAdmin: boolean;
  members: Pick<MemberProfile, 'user_id' | 'full_name'>[];
};

const PAGE_SIZE = 50;
const MESSAGE_LIMIT = 2000;
const MESSAGE_COLUMNS = 'id,sender_id,group_id,body,created_at,removed_at,removed_by';

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
  if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(details.code ?? '')) {
    return 'O Chat ainda não foi atualizado neste Supabase. Aplique, uma única vez, a migration incremental de Chat/Grupos e publique o site novamente.';
  }
  if (details.code === '42501') {
    return 'O Supabase bloqueou a operação pelas regras de acesso. Confirme que sua conta está ativa, participa do grupo e que a migration de grupos foi aplicada.';
  }
  if (details.code === '23514') return 'Confira o nome do grupo e tente novamente.';
  if (details.code === '23505') return 'Essa pessoa já está no grupo. Atualize a lista de conversas.';
  return details.message || 'Não foi possível concluir a operação. Confira a conexão e tente novamente.';
}

export default function TeamChat({ client, userId, isAdmin, members }: TeamChatProps) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [groups, setGroups] = useState<TeamChatGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<TeamChatGroupMember[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupDialogMode, setGroupDialogMode] = useState<GroupDialogMode | null>(null);
  const [groupDialogError, setGroupDialogError] = useState('');
  const [groupActionBusy, setGroupActionBusy] = useState(false);
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
  const activeGroupRef = useRef<string | null>(activeGroupId);
  activeGroupRef.current = activeGroupId;

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.full_name.trim()])),
    [members],
  );
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const activeGroupMemberIds = useMemo(
    () => new Set(groupMembers.filter((member) => member.group_id === activeGroupId).map((member) => member.user_id)),
    [groupMembers, activeGroupId],
  );
  const availableGroupMembers = useMemo(
    () => members.filter((member) => !activeGroupMemberIds.has(member.user_id)),
    [activeGroupMemberIds, members],
  );
  const dialogMembers = useMemo(() => {
    if (groupDialogMode === 'create') return members.filter((member) => member.user_id !== userId);
    if (groupDialogMode === 'add-members') return availableGroupMembers;
    return [];
  }, [availableGroupMembers, groupDialogMode, members, userId]);
  const canWriteToActiveGroup = !activeGroupId || activeGroupMemberIds.has(userId);

  const loadGroups = useCallback(async () => {
    try {
      const [groupResult, memberResult] = await Promise.all([
        client.from('team_chat_groups').select('id,name,created_by,created_at').order('name', { ascending: true }),
        client.from('team_chat_group_members').select('group_id,user_id'),
      ]);
      if (groupResult.error) throw groupResult.error;
      if (memberResult.error) throw memberResult.error;
      setGroups((groupResult.data ?? []) as unknown as TeamChatGroup[]);
      setGroupMembers((memberResult.data ?? []) as unknown as TeamChatGroupMember[]);
    } catch (loadError) {
      setError(chatError(loadError));
    }
  }, [client]);

  const loadLatest = useCallback(async (quiet = false) => {
    const groupId = activeGroupId;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    const revisionAtStart = eventRevisionRef.current;

    try {
      let query = client.from('team_chat_messages').select(MESSAGE_COLUMNS).is('removed_at', null);
      query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null);
      const { data, error: queryError } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (queryError) throw queryError;
      if (activeGroupRef.current !== groupId) return;

      const rows = ((data ?? []) as unknown as TeamChatMessage[])
        .filter((message) => message.group_id === groupId && !removedIdsRef.current.has(message.id))
        .reverse();
      setHasOlder((data ?? []).length === PAGE_SIZE);
      setMessages((current) => {
        const concurrentEvents = eventRevisionRef.current !== revisionAtStart
          ? current.filter((message) => message.group_id === groupId && !removedIdsRef.current.has(message.id))
          : [];
        const next = mergeMessages(rows, concurrentEvents)
          .filter((message) => message.group_id === groupId && !removedIdsRef.current.has(message.id));
        autoScrollRef.current = true;
        return next;
      });
    } catch (loadError) {
      if (activeGroupRef.current === groupId) setError(chatError(loadError));
    } finally {
      if (activeGroupRef.current === groupId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeGroupId, client]);

  useEffect(() => {
    setMessages([]);
    setHasOlder(false);
    setDraft('');
    setConfirmRemoveId(null);
    setError('');
    setFeedback('');
    eventRevisionRef.current = 0;
    void loadGroups();
    void loadLatest();

    const channel = client
      .channel(`team-chat-${userId}-${activeGroupId ?? 'team'}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_chat_messages',
      }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id || message.group_id !== activeGroupId) return;
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
        if (!message.id || message.group_id !== activeGroupId) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) {
          removedIdsRef.current.add(message.id);
          setMessages((current) => current.filter((item) => item.id !== message.id));
          setConfirmRemoveId((current) => current === message.id ? null : current);
          return;
        }
        setMessages((current) => mergeMessages(current, [message]));
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_chat_groups',
      }, () => { void loadGroups(); })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_chat_group_members',
      }, () => { void loadGroups(); })
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
  }, [activeGroupId, client, loadGroups, loadLatest, userId]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    autoScrollRef.current = false;
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    const groupId = activeGroupId;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setError('');
    try {
      let query = client.from('team_chat_messages').select(MESSAGE_COLUMNS).is('removed_at', null);
      query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null);
      const { data, error: queryError } = await query
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (queryError) throw queryError;
      if (activeGroupRef.current !== groupId) return;
      const older = ((data ?? []) as unknown as TeamChatMessage[])
        .filter((message) => message.group_id === groupId && !removedIdsRef.current.has(message.id))
        .reverse();
      setMessages((current) => mergeMessages(older, current)
        .filter((message) => message.group_id === groupId && !removedIdsRef.current.has(message.id)));
      setHasOlder((data ?? []).length === PAGE_SIZE);
    } catch (loadError) {
      if (activeGroupRef.current === groupId) setError(chatError(loadError));
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
    if (!canWriteToActiveGroup) {
      setError('Você não participa deste grupo. Peça a um integrante para adicionar sua conta antes de enviar.');
      return;
    }

    setSending(true);
    setError('');
    setFeedback('');
    try {
      const { data, error: insertError } = await client
        .from('team_chat_messages')
        .insert({ body, group_id: activeGroupId })
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

  async function handleGroupDialogSubmit(value: { name: string; memberIds: string[] }) {
    if (!groupDialogMode || groupActionBusy) return;
    setGroupActionBusy(true);
    setGroupDialogError('');
    setError('');
    setFeedback('');
    try {
      if (groupDialogMode === 'create') {
        const { data, error: createError } = await client
          .from('team_chat_groups')
          .insert({ name: value.name })
          .select('id,name,created_by,created_at')
          .single();
        if (createError) throw createError;
        const createdGroup = data as unknown as TeamChatGroup;
        setActiveGroupId(createdGroup.id);
        setGroupDialogMode(null);
        setFeedback(`Grupo “${createdGroup.name}” criado. Você já participa da conversa.`);
        if (value.memberIds.length > 0) {
          const { error: addError } = await client.from('team_chat_group_members').insert(
            value.memberIds.map((memberId) => ({ group_id: createdGroup.id, user_id: memberId })),
          );
          if (addError) setFeedback(`Grupo criado, mas não foi possível adicionar todas as pessoas: ${chatError(addError)}`);
        }
        void loadGroups();
        return;
      }

      if (!activeGroupId) throw new Error('Selecione um grupo antes de adicionar pessoas.');
      if (value.memberIds.length === 0) throw new Error('Selecione pelo menos uma pessoa ativa.');
      const { error: addError } = await client.from('team_chat_group_members').insert(
        value.memberIds.map((memberId) => ({ group_id: activeGroupId, user_id: memberId })),
      );
      if (addError) throw addError;
      setGroupDialogMode(null);
      setFeedback(`${value.memberIds.length} pessoa(s) adicionada(s) ao grupo.`);
      void loadGroups();
    } catch (actionError) {
      setGroupDialogError(chatError(actionError));
    } finally {
      setGroupActionBusy(false);
    }
  }

  return (
    <section className="team-chat" aria-labelledby="team-chat-title">
      <div className="team-chat-heading">
        <div>
          <p className="workspace-kicker">{activeGroupId ? 'GRUPO PRIVADO' : 'SALA COMPARTILHADA'}</p>
          <h2 id="team-chat-title"><MessageCircle aria-hidden="true" /> {activeGroup?.name ?? 'Chat da equipe'}</h2>
          <p>{activeGroupId
            ? 'Mensagens visíveis somente aos integrantes deste grupo e aos Administradores ativos.'
            : 'Converse com todos os integrantes ativos. As mensagens novas chegam em tempo real.'}</p>
        </div>
        <div className="team-chat-heading-actions">
          {isAdmin && <span className="team-chat-admin-badge"><ShieldCheck aria-hidden="true" /> Administrador</span>}
          {activeGroupId && (activeGroupMemberIds.has(userId) || isAdmin) && (
            <button className="workspace-refresh" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('add-members'); }} disabled={availableGroupMembers.length === 0}>
              <UserPlus aria-hidden="true" /> {availableGroupMembers.length === 0 ? 'Todos já estão no grupo' : 'Adicionar pessoas'}
            </button>
          )}
          <button className="team-chat-create-group" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('create'); }}>
            <UsersRound aria-hidden="true" /> Criar grupo
          </button>
          <button className="workspace-refresh" type="button" onClick={() => { void loadLatest(true); void loadGroups(); }} disabled={refreshing || loading}>
            <RefreshCw aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="team-chat-shell">
        <nav className="team-chat-channels" aria-label="Conversas do Chat">
          <p className="team-chat-channels-title">CONVERSAS</p>
          <div className="team-chat-channel-list">
            <button type="button" className={`team-chat-channel${activeGroupId === null ? ' is-active' : ''}`} onClick={() => setActiveGroupId(null)} aria-current={activeGroupId === null ? 'page' : undefined}>
              <MessageCircle aria-hidden="true" /> <span>Equipe</span><small>Todos</small>
            </button>
            {groups.map((group) => {
              const count = groupMembers.filter((member) => member.group_id === group.id).length;
              return (
                <button type="button" className={`team-chat-channel${activeGroupId === group.id ? ' is-active' : ''}`} key={group.id} onClick={() => setActiveGroupId(group.id)} aria-current={activeGroupId === group.id ? 'page' : undefined}>
                  <UsersRound aria-hidden="true" /> <span>{group.name}</span><small>{count}</small>
                </button>
              );
            })}
            {groups.length === 0 && <p className="team-chat-no-groups">Seus grupos aparecerão aqui.</p>}
          </div>
        </nav>

        <div className="team-chat-main">
          <div className={`team-chat-connection is-${connection}`} role="status">
            <i aria-hidden="true" />
            {connection === 'connected' ? 'Conectado em tempo real' : connection === 'connecting' ? 'Conectando ao chat…' : 'Sem atualização em tempo real; tente atualizar.'}
          </div>
          {error && <p className="team-chat-alert" role="alert">{error}</p>}
          {feedback && <p className="team-chat-feedback" role="status">{feedback}</p>}

          <div className="team-chat-panel">
            <div className="team-chat-history" role="log" aria-label={activeGroup ? `Mensagens do grupo ${activeGroup.name}` : 'Mensagens da equipe'} aria-live="polite" aria-relevant="additions text">
              {hasOlder && messages.length > 0 && (
                <button className="team-chat-older" type="button" onClick={() => void loadOlder()} disabled={loadingOlder}>
                  {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
                </button>
              )}
              {loading && messages.length === 0 ? (
                <div className="team-chat-empty" role="status">Carregando conversa…</div>
              ) : messages.length === 0 ? (
                <div className="team-chat-empty"><MessageCircle aria-hidden="true" /><strong>A conversa começa aqui.</strong><span>Envie a primeira mensagem.</span></div>
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
                placeholder={canWriteToActiveGroup ? 'Escreva uma mensagem…' : 'Você não participa deste grupo.'}
                rows={3}
                maxLength={MESSAGE_LIMIT}
                disabled={sending || !canWriteToActiveGroup}
              />
              <div className="team-chat-compose-footer">
                <span>{Array.from(draft).length}/{MESSAGE_LIMIT} · {activeGroupId ? 'Somente integrantes e Administradores ativos veem este grupo' : 'Visível para todos os perfis ativos'}</span>
                <button type="submit" disabled={sending || !draft.trim() || !canWriteToActiveGroup}>
                  <Send aria-hidden="true" /> {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
          <p className="team-chat-retention-note">
            Mensagens ficam salvas até um Administrador removê-las. Ao remover, o texto é substituído por um aviso e não permanece armazenado no chat. Mensagens do Chat não enviam e-mail.
          </p>
        </div>
      </div>

      {groupDialogMode && (
        <ChatGroupDialog
          mode={groupDialogMode}
          members={dialogMembers}
          busy={groupActionBusy}
          error={groupDialogError}
          onCancel={() => { if (!groupActionBusy) setGroupDialogMode(null); }}
          onSubmit={(value) => void handleGroupDialogSubmit(value)}
        />
      )}
    </section>
  );
}
