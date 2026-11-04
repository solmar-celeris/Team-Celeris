import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageCircle, RefreshCw, Send, ShieldCheck, Trash2, UserPlus, UsersRound, Plus, Search } from 'lucide-react';
import { notifyChatMessagePush } from '../../lib/notifications';
import type { MemberProfile } from './domain';
import ChatGroupDialog from './ChatGroupDialog';
import './team-chat.css';

type TeamChatMessage = {
  id: string; sender_id: string | null; group_id: string | null; dm_conversation_id: string | null;
  body: string; created_at: string; removed_at: string | null; removed_by: string | null;
};
type TeamChatGroup = { id: string; name: string; created_by: string | null; created_at: string };
type TeamChatGroupMember = { group_id: string; user_id: string };
type DirectConversation = { id: string; user_a_id: string; user_b_id: string; created_at: string };
type GroupDialogMode = 'create' | 'add-members';
type ChatMember = Pick<MemberProfile, 'user_id' | 'full_name' | 'avatar_path'>;
type TeamChatProps = { client: SupabaseClient; userId: string; isAdmin: boolean; members: ChatMember[] };
const PAGE_SIZE = 50;
const MESSAGE_LIMIT = 2000;
const MESSAGE_COLUMNS = 'id,sender_id,group_id,dm_conversation_id,body,created_at,removed_at,removed_by';
function timeLabel(value: string): string { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function dayLabel(value: string): string { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)); }
function mergeMessages(current: TeamChatMessage[], incoming: TeamChatMessage[]): TeamChatMessage[] {
  const unique = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) unique.set(message.id, message);
  return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
function chatError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Não foi possível concluir a operação. Tente novamente.';
  const details = error as { code?: string; message?: string };
  if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(details.code ?? '')) return 'O Chat privado ainda não está configurado no Supabase. Aplique a migration de Chat privado e calendário incluída no ZIP e publique o site.';
  if (details.code === '42501') return 'O Supabase bloqueou a operação pelas regras de acesso. Confirme que sua conta está ativa e pertence à conversa.';
  if (details.code === '23514') return 'Confira os dados informados e tente novamente.';
  if (details.code === '23505') return 'Essa conversa ou participante já existe. Atualize a lista de conversas.';
  return details.message || 'Não foi possível concluir a operação. Confira a conexão e tente novamente.';
}
export default function TeamChat({ client, userId, isAdmin, members }: TeamChatProps) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [groups, setGroups] = useState<TeamChatGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<TeamChatGroupMember[]>([]);
  const [directs, setDirects] = useState<DirectConversation[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeDirectId, setActiveDirectId] = useState<string | null>(null);
  const [groupDialogMode, setGroupDialogMode] = useState<GroupDialogMode | null>(null);
  const [groupDialogError, setGroupDialogError] = useState('');
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
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
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);
  const eventRevisionRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const removedIdsRef = useRef(new Set<string>());
  const activeGroupRef = useRef<string | null>(activeGroupId);
  const activeDirectRef = useRef<string | null>(activeDirectId);
  activeGroupRef.current = activeGroupId;
  activeDirectRef.current = activeDirectId;
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const memberNames = useMemo(() => new Map(members.map((member) => [member.user_id, member.full_name.trim()])), [members]);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const activeDirect = useMemo(() => directs.find((conversation) => conversation.id === activeDirectId) ?? null, [directs, activeDirectId]);
  const activeDirectUserId = activeDirect ? (activeDirect.user_a_id === userId ? activeDirect.user_b_id : activeDirect.user_a_id) : null;
  const activeDirectMember = activeDirectUserId ? memberById.get(activeDirectUserId) : undefined;
  const activeGroupMemberIds = useMemo(() => new Set(groupMembers.filter((member) => member.group_id === activeGroupId).map((member) => member.user_id)), [groupMembers, activeGroupId]);
  const availableGroupMembers = useMemo(() => members.filter((member) => !activeGroupMemberIds.has(member.user_id)), [activeGroupMemberIds, members]);
  const dialogMembers = useMemo(() => groupDialogMode === 'create' ? members.filter((member) => member.user_id !== userId) : groupDialogMode === 'add-members' ? availableGroupMembers : [], [availableGroupMembers, groupDialogMode, members, userId]);
  const canWrite = !activeGroupId || activeGroupMemberIds.has(userId);
  const conversationLabel = activeDirectMember?.full_name || activeGroup?.name || 'Chat da equipe';
  const activeKey = activeDirectId ?? activeGroupId ?? 'team';

  const loadLists = useCallback(async () => {
    try {
      const [groupResult, memberResult, directResult] = await Promise.all([
        client.from('team_chat_groups').select('id,name,created_by,created_at').order('name', { ascending: true }),
        client.from('team_chat_group_members').select('group_id,user_id'),
        client.from('team_chat_direct_conversations').select('id,user_a_id,user_b_id,created_at').order('created_at', { ascending: false }),
      ]);
      const failure = groupResult.error ?? memberResult.error ?? directResult.error;
      if (failure) throw failure;
      setGroups((groupResult.data ?? []) as unknown as TeamChatGroup[]);
      setGroupMembers((memberResult.data ?? []) as unknown as TeamChatGroupMember[]);
      setDirects((directResult.data ?? []) as unknown as DirectConversation[]);
    } catch (loadError) { setError(chatError(loadError)); }
  }, [client]);

  const loadLatest = useCallback(async (quiet = false) => {
    const groupId = activeGroupId; const directId = activeDirectId;
    if (quiet) setRefreshing(true); else setLoading(true);
    setError(''); const revisionAtStart = eventRevisionRef.current;
    try {
      let query = client.from('team_chat_messages').select(MESSAGE_COLUMNS).is('removed_at', null);
      if (directId) query = query.eq('dm_conversation_id', directId);
      else if (groupId) query = query.eq('group_id', groupId).is('dm_conversation_id', null);
      else query = query.is('group_id', null).is('dm_conversation_id', null);
      const { data, error: queryError } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
      if (queryError) throw queryError;
      if (activeGroupRef.current !== groupId || activeDirectRef.current !== directId) return;
      const matches = (message: TeamChatMessage) => message.dm_conversation_id === directId && message.group_id === groupId && !removedIdsRef.current.has(message.id);
      const rows = ((data ?? []) as unknown as TeamChatMessage[]).filter(matches).reverse();
      setHasOlder((data ?? []).length === PAGE_SIZE);
      setMessages((current) => {
        const concurrentEvents = eventRevisionRef.current !== revisionAtStart ? current.filter(matches) : [];
        autoScrollRef.current = true;
        return mergeMessages(rows, concurrentEvents).filter(matches);
      });
    } catch (loadError) {
      if (activeGroupRef.current === groupId && activeDirectRef.current === directId) setError(chatError(loadError));
    } finally {
      if (activeGroupRef.current === groupId && activeDirectRef.current === directId) { setLoading(false); setRefreshing(false); }
    }
  }, [activeDirectId, activeGroupId, client]);

  useEffect(() => {
    let cancelled = false;
    async function loadPhotos() {
      const entries = await Promise.all(members.map(async (member) => {
        if (!member.avatar_path) return [member.user_id, ''] as const;
        const { data, error: photoError } = await client.storage.from('solmar-profile-photos').createSignedUrl(member.avatar_path, 3600);
        return [member.user_id, photoError ? '' : data.signedUrl] as const;
      }));
      if (!cancelled) setAvatarUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    }
    void loadPhotos();
    return () => { cancelled = true; };
  }, [client, members]);

  useEffect(() => {
    setMessages([]); setHasOlder(false); setDraft(''); setConfirmRemoveId(null); setError(''); setFeedback('');
    eventRevisionRef.current = 0; void loadLists(); void loadLatest();
    const channel = client.channel(`team-chat-${userId}-${activeKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_messages' }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id || message.group_id !== activeGroupId || message.dm_conversation_id !== activeDirectId) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) { removedIdsRef.current.add(message.id); setMessages((current) => current.filter((item) => item.id !== message.id)); return; }
        setMessages((current) => mergeMessages(current, [message])); autoScrollRef.current = true;
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_chat_messages' }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id || message.group_id !== activeGroupId || message.dm_conversation_id !== activeDirectId) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) { removedIdsRef.current.add(message.id); setMessages((current) => current.filter((item) => item.id !== message.id)); setConfirmRemoveId((current) => current === message.id ? null : current); return; }
        setMessages((current) => mergeMessages(current, [message]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_groups' }, () => { void loadLists(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_group_members' }, () => { void loadLists(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_direct_conversations' }, () => { void loadLists(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setConnection('connected'); if (hasConnectedRef.current) void loadLatest(true); else hasConnectedRef.current = true; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('disconnected');
        else setConnection('connecting');
      });
    return () => { void client.removeChannel(channel); };
  }, [activeDirectId, activeGroupId, activeKey, client, loadLists, loadLatest, userId]);

  useEffect(() => { if (autoScrollRef.current) { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); autoScrollRef.current = false; } }, [messages]);

  async function loadOlder() {
    const oldest = messages[0]; const groupId = activeGroupId; const directId = activeDirectId;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true); setError('');
    try {
      let query = client.from('team_chat_messages').select(MESSAGE_COLUMNS).is('removed_at', null);
      if (directId) query = query.eq('dm_conversation_id', directId);
      else if (groupId) query = query.eq('group_id', groupId).is('dm_conversation_id', null);
      else query = query.is('group_id', null).is('dm_conversation_id', null);
      const { data, error: queryError } = await query.lt('created_at', oldest.created_at).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
      if (queryError) throw queryError;
      if (activeGroupRef.current !== groupId || activeDirectRef.current !== directId) return;
      const matches = (message: TeamChatMessage) => message.dm_conversation_id === directId && message.group_id === groupId && !removedIdsRef.current.has(message.id);
      const older = ((data ?? []) as unknown as TeamChatMessage[]).filter(matches).reverse();
      setMessages((current) => mergeMessages(older, current).filter(matches)); setHasOlder((data ?? []).length === PAGE_SIZE);
    } catch (loadError) { setError(chatError(loadError)); }
    finally { setLoadingOlder(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const body = draft.trim();
    if (!body) { setError('Escreva uma mensagem antes de enviar.'); return; }
    if (Array.from(body).length > MESSAGE_LIMIT) { setError(`A mensagem pode ter até ${MESSAGE_LIMIT} caracteres.`); return; }
    if (!canWrite) { setError('Você não participa deste grupo. Peça a um integrante para adicionar sua conta.'); return; }
    setSending(true); setError(''); setFeedback('');
    try {
      const { data, error: insertError } = await client.from('team_chat_messages')
        .insert({ body, group_id: activeDirectId ? null : activeGroupId, dm_conversation_id: activeDirectId })
        .select(MESSAGE_COLUMNS).single();
      if (insertError) throw insertError;
      const message = data as unknown as TeamChatMessage;
      setMessages((current) => mergeMessages(current, [message])); autoScrollRef.current = true; setDraft('');
      void notifyChatMessagePush(client, message.id).then((outcome) => { if (outcome === 'failed') setFeedback('Mensagem enviada. O aviso no celular não foi confirmado; confira a configuração do OneSignal.'); });
    } catch (sendError) { setError(chatError(sendError)); }
    finally { setSending(false); }
  }

  async function removeMessage(messageId: string) {
    if (!isAdmin || removingId) return; setRemovingId(messageId); setError(''); setFeedback('');
    try {
      const { error: removeError } = await client.rpc('admin_remove_team_chat_message', { p_message_id: messageId });
      if (removeError) throw removeError;
      removedIdsRef.current.add(messageId); setMessages((current) => current.filter((message) => message.id !== messageId)); setConfirmRemoveId(null); setFeedback('Mensagem removida pelo administrador.');
    } catch (removeError) { setError(chatError(removeError)); }
    finally { setRemovingId(null); }
  }

  async function startDirect(otherUserId: string) {
    setError(''); setFeedback('');
    try {
      const { data, error: directError } = await client.rpc('get_or_create_team_chat_direct_conversation', { p_other_user_id: otherUserId });
      if (directError) throw directError;
      const directId = typeof data === 'string' ? data : String(data ?? '');
      if (!directId) throw new Error('Não foi possível abrir a conversa privada.');
      setActiveGroupId(null); setActiveDirectId(directId); setShowNewDirect(false); setMemberSearch('');
      void loadLists();
    } catch (actionError) { setError(chatError(actionError)); }
  }

  async function handleGroupDialogSubmit(value: { name: string; memberIds: string[] }) {
    if (!groupDialogMode || groupActionBusy) return;
    setGroupActionBusy(true); setGroupDialogError(''); setError(''); setFeedback('');
    try {
      if (groupDialogMode === 'create') {
        const { data, error: createError } = await client.from('team_chat_groups').insert({ name: value.name }).select('id,name,created_by,created_at').single();
        if (createError) throw createError;
        const created = data as unknown as TeamChatGroup; setActiveDirectId(null); setActiveGroupId(created.id); setGroupDialogMode(null);
        if (value.memberIds.length) {
          const { error: addError } = await client.from('team_chat_group_members').insert(value.memberIds.map((memberId) => ({ group_id: created.id, user_id: memberId })));
          if (addError) setFeedback(`Grupo criado, mas não foi possível adicionar todas as pessoas: ${chatError(addError)}`);
        }
        void loadLists(); return;
      }
      if (!activeGroupId) throw new Error('Selecione um grupo antes de adicionar pessoas.');
      if (!value.memberIds.length) throw new Error('Selecione pelo menos uma pessoa ativa.');
      const { error: addError } = await client.from('team_chat_group_members').insert(value.memberIds.map((memberId) => ({ group_id: activeGroupId, user_id: memberId })));
      if (addError) throw addError;
      setGroupDialogMode(null); setFeedback(`${value.memberIds.length} pessoa(s) adicionada(s) ao grupo.`); void loadLists();
    } catch (actionError) { setGroupDialogError(chatError(actionError)); }
    finally { setGroupActionBusy(false); }
  }

  const filteredMembers = members.filter((member) => member.user_id !== userId && member.full_name.toLocaleLowerCase('pt-BR').includes(memberSearch.trim().toLocaleLowerCase('pt-BR')));
  const getMember = (id: string | null) => id ? memberById.get(id) : undefined;
  const avatar = (id: string | null, name: string, size: 'sm' | 'md' = 'sm') => {
    const photo = id ? avatarUrls[id] : undefined;
    return <span className={`team-chat-avatar is-${size}`}>{photo ? <img src={photo} alt={`Foto de ${name}`} /> : <span aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') || '?'}</span>}</span>;
  };

  return (
    <section className="team-chat" aria-labelledby="team-chat-title">
      <div className="team-chat-heading">
        <div><p className="workspace-kicker">{activeDirectId ? 'CONVERSA PRIVADA' : activeGroupId ? 'GRUPO PRIVADO' : 'SALA COMPARTILHADA'}</p>
          <h2 id="team-chat-title"><MessageCircle aria-hidden="true" /> {activeDirectId ? conversationLabel : activeGroup?.name ?? 'Chat da equipe'}</h2>
          <p>{activeDirectId ? 'Conversa visível somente para você e esta pessoa.' : activeGroupId ? 'Mensagens visíveis somente aos integrantes do grupo.' : 'Converse com todos os integrantes ativos. As mensagens chegam em tempo real.'}</p></div>
        <div className="team-chat-heading-actions">
          {isAdmin && <span className="team-chat-admin-badge"><ShieldCheck aria-hidden="true" /> Administrador</span>}
          {activeGroupId && (activeGroupMemberIds.has(userId) || isAdmin) && <button className="workspace-refresh" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('add-members'); }} disabled={availableGroupMembers.length === 0}><UserPlus aria-hidden="true" /> Adicionar pessoas</button>}
          <button className="team-chat-create-group" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('create'); }}><UsersRound aria-hidden="true" /> Criar grupo</button>
          <button className="workspace-refresh" type="button" onClick={() => { void loadLatest(true); void loadLists(); }} disabled={refreshing || loading}><RefreshCw aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>
      <div className="team-chat-shell">
        <nav className="team-chat-channels" aria-label="Conversas do Chat">
          <p className="team-chat-channels-title">CONVERSAS</p>
          <div className="team-chat-channel-list">
            <button type="button" className={`team-chat-channel${!activeGroupId && !activeDirectId ? ' is-active' : ''}`} onClick={() => { setActiveGroupId(null); setActiveDirectId(null); }}><MessageCircle aria-hidden="true" /><span>Equipe</span><small>Todos</small></button>
            <div className="team-chat-channel-heading"><span>PRIVADAS</span><button type="button" title="Nova conversa privada" aria-label="Iniciar conversa privada" onClick={() => setShowNewDirect((value) => !value)}><Plus aria-hidden="true" /></button></div>
            {showNewDirect && <div className="team-chat-member-picker"><label><Search aria-hidden="true" /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar integrante" /></label><div>{filteredMembers.map((member) => <button type="button" key={member.user_id} onClick={() => void startDirect(member.user_id)}>{avatar(member.user_id, member.full_name)}<span>{member.full_name}</span></button>)}</div></div>}
            {directs.map((conversation) => {
              const otherId = conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;
              const name = memberNames.get(otherId) || 'Integrante';
              return <button type="button" className={`team-chat-channel${activeDirectId === conversation.id ? ' is-active' : ''}`} key={conversation.id} onClick={() => { setActiveGroupId(null); setActiveDirectId(conversation.id); }}>
                {avatar(otherId, name)}<span>{name}</span><small>Privado</small></button>;
            })}
            {groups.length > 0 && <div className="team-chat-channel-heading"><span>GRUPOS</span></div>}
            {groups.map((group) => {
              const groupIds = groupMembers.filter((member) => member.group_id === group.id).map((member) => member.user_id);
              const count = groupIds.length;
              return <button type="button" className={`team-chat-channel${activeGroupId === group.id ? ' is-active' : ''}`} key={group.id} onClick={() => { setActiveDirectId(null); setActiveGroupId(group.id); }}>
                <span className="team-chat-group-avatars">{groupIds.slice(0, 2).map((id) => avatar(id, memberNames.get(id) || 'Integrante', 'sm'))}<UsersRound aria-hidden="true" /></span><span>{group.name}</span><small>{count}</small></button>;
            })}
            {directs.length === 0 && groups.length === 0 && <p className="team-chat-no-groups">Inicie uma conversa privada ou crie um grupo.</p>}
          </div>
        </nav>
        <div className="team-chat-main">
          <div className={`team-chat-connection is-${connection}`} role="status"><i aria-hidden="true" />{connection === 'connected' ? 'Conectado em tempo real' : connection === 'connecting' ? 'Conectando ao chat…' : 'Sem atualização em tempo real; tente atualizar.'}</div>
          {error && <p className="team-chat-alert" role="alert">{error}</p>}{feedback && <p className="team-chat-feedback" role="status">{feedback}</p>}
          <div className="team-chat-panel">
            <div className="team-chat-history" role="log" aria-label={`Mensagens de ${conversationLabel}`} aria-live="polite" aria-relevant="additions text">
              {hasOlder && messages.length > 0 && <button className="team-chat-older" type="button" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}</button>}
              {loading && messages.length === 0 ? <div className="team-chat-empty" role="status">Carregando conversa…</div> : messages.length === 0 ? <div className="team-chat-empty"><MessageCircle aria-hidden="true" /><strong>A conversa começa aqui.</strong><span>Envie a primeira mensagem.</span></div> : messages.map((message, index) => {
                const sender = getMember(message.sender_id); const senderName = message.sender_id === userId && !activeGroupId ? 'Você' : sender?.full_name || (message.sender_id === userId ? 'Você' : 'Integrante da equipe');
                const previous = messages[index - 1]; const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return <div className="team-chat-message-row-wrap" key={message.id}>{showDay && <div className="team-chat-day-divider"><span>{dayLabel(message.created_at)}</span></div>}
                  <div className={`team-chat-message-row${message.sender_id === userId ? ' is-own' : ''}`}>{!activeDirectId && avatar(message.sender_id, senderName, 'md')}
                    <article className={`team-chat-message${message.sender_id === userId ? ' is-own' : ''}`}>
                      {!activeDirectId && <div className="team-chat-message-meta"><strong>{senderName}</strong></div>}
                      <p>{message.body}</p><div className="team-chat-message-time"><time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>{message.sender_id === userId && <span aria-label="Enviada">✓</span>}</div>
                      {isAdmin && <div className="team-chat-message-actions">{confirmRemoveId === message.id ? <><span>Remover esta mensagem?</span><button type="button" className="team-chat-confirm-remove" onClick={() => void removeMessage(message.id)} disabled={removingId === message.id}>{removingId === message.id ? 'Removendo…' : 'Confirmar remoção'}</button><button type="button" className="team-chat-cancel-remove" onClick={() => setConfirmRemoveId(null)} disabled={removingId === message.id}>Cancelar</button></> : <button type="button" className="team-chat-remove" onClick={() => setConfirmRemoveId(message.id)} aria-label={`Remover mensagem de ${senderName}`}><Trash2 aria-hidden="true" /> Remover</button>}</div>}
                    </article></div></div>;
              })}
              <div ref={bottomRef} />
            </div>
            <form className="team-chat-composer" onSubmit={(event) => void sendMessage(event)}>
              <textarea aria-label="Sua mensagem" id="team-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canWrite ? 'Escreva uma mensagem…' : 'Você não participa deste grupo.'} rows={1} maxLength={MESSAGE_LIMIT} disabled={sending || !canWrite} />
              <div className="team-chat-compose-footer"><span>{Array.from(draft).length}/{MESSAGE_LIMIT} · {activeDirectId ? 'Conversa privada' : activeGroupId ? 'Somente participantes do grupo' : 'Visível para os integrantes ativos'}</span><button type="submit" disabled={sending || !draft.trim() || !canWrite}><Send aria-hidden="true" /> {sending ? 'Enviando…' : 'Enviar'}</button></div>
            </form>
          </div>
          <p className="team-chat-retention-note">Mensagens ficam salvas até um Administrador removê-las. As conversas privadas só podem ser lidas pelos dois participantes. Mensagens do Chat não enviam e-mail.</p>
        </div>
      </div>
      {groupDialogMode && <ChatGroupDialog mode={groupDialogMode} members={dialogMembers} busy={groupActionBusy} error={groupDialogError} onCancel={() => { if (!groupActionBusy) setGroupDialogMode(null); }} onSubmit={(value) => void handleGroupDialogSubmit(value)} />}
    </section>
  );
}
