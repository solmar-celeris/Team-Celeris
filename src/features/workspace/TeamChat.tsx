import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUp, Download, Mic, MessageCircle, RefreshCw, ShieldCheck, Square, Trash2, UserPlus, UsersRound, Plus, Search, X } from 'lucide-react';
import { Mp3Encoder } from '@breezystack/lamejs';
import { notifyChatMessagePush } from '../../lib/notifications';
import type { MemberProfile } from './domain';
import ChatGroupDialog from './ChatGroupDialog';
import './team-chat.css';

type TeamChatMessage = {
  id: string; sender_id: string | null; group_id: string | null; dm_conversation_id: string | null;
  body: string; audio_path: string | null; audio_content_type: string | null; created_at: string; removed_at: string | null; removed_by: string | null;
};
type TeamChatRead = { message_id: string; user_id: string; read_at: string };
type TeamChatGroup = { id: string; name: string; created_by: string | null; created_at: string };
type TeamChatGroupMember = { group_id: string; user_id: string };
type DirectConversation = { id: string; user_a_id: string; user_b_id: string; created_at: string };
type GroupDialogMode = 'create' | 'add-members';
type ChatMember = Pick<MemberProfile, 'user_id' | 'full_name' | 'avatar_path'>;
type TeamChatProps = { client: SupabaseClient; userId: string; isAdmin: boolean; members: ChatMember[] };
const PAGE_SIZE = 50;
const MESSAGE_LIMIT = 2000;
const MESSAGE_COLUMNS = 'id,sender_id,group_id,dm_conversation_id,body,audio_path,audio_content_type,created_at,removed_at,removed_by';
function timeLabel(value: string): string { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function dayLabel(value: string): string { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)); }
function mergeMessages(current: TeamChatMessage[], incoming: TeamChatMessage[]): TeamChatMessage[] {
  const unique = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) unique.set(message.id, message);
  return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
async function convertToMp3(source: Blob): Promise<Blob> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) throw new Error('Este aparelho não oferece conversão de áudio MP3. Atualize o navegador ou o aplicativo.');
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    const channels = Math.min(decoded.numberOfChannels, 2);
    const sampleRate = decoded.sampleRate;
    const encoder = new Mp3Encoder(channels, sampleRate, 128);
    const left = decoded.getChannelData(0);
    const right = channels > 1 ? decoded.getChannelData(1) : undefined;
    const frames: ArrayBuffer[] = [];
    const blockSize = 1152;
    for (let offset = 0; offset < left.length; offset += blockSize) {
      const end = Math.min(offset + blockSize, left.length);
      const leftSamples = new Int16Array(end - offset);
      const rightSamples = right ? new Int16Array(end - offset) : undefined;
      for (let index = offset; index < end; index += 1) {
        const leftValue = Math.max(-1, Math.min(1, left[index]));
        leftSamples[index - offset] = leftValue < 0 ? leftValue * 32768 : leftValue * 32767;
        if (right && rightSamples) {
          const rightValue = Math.max(-1, Math.min(1, right[index]));
          rightSamples[index - offset] = rightValue < 0 ? rightValue * 32768 : rightValue * 32767;
        }
      }
      const frame = encoder.encodeBuffer(leftSamples, rightSamples);
      if (frame.length) { const copy = new Uint8Array(frame.length); copy.set(frame); frames.push(copy.buffer as ArrayBuffer); }
    }
    const finalFrame = encoder.flush();
    if (finalFrame.length) { const copy = new Uint8Array(finalFrame.length); copy.set(finalFrame); frames.push(copy.buffer as ArrayBuffer); }
    if (!frames.length) throw new Error('Não foi possível converter este áudio. Tente gravar novamente.');
    return new Blob(frames, { type: 'audio/mpeg' });
  } finally {
    await context.close();
  }
}
function chatError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Não foi possível concluir a operação. Tente novamente.';
  const details = error as { code?: string; message?: string };
  if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(details.code ?? '')) return 'As funções recentes do Chat ainda não estão configuradas no Supabase. Aplique a migration de áudio e confirmação de leitura incluída no ZIP; se necessário, aplique também a migration de Chat privado e calendário.';
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
  const [showMobileConversations, setShowMobileConversations] = useState(false);
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
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioDownloadUrls, setAudioDownloadUrls] = useState<Record<string, string>>({});
  const [readByMessage, setReadByMessage] = useState<Record<string, string[]>>({});
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingConversationRef = useRef<string | null>(null);
  const readMarkedRef = useRef(new Set<string>());
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
  const activeConversationRef = useRef(activeKey);
  activeConversationRef.current = activeKey;

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

  async function startAudioRecording() {
    if (!canWrite) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não oferece gravação de áudio. Atualize o navegador ou permita o microfone.');
      return;
    }
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recordingConversationRef.current = activeKey;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        recordingChunksRef.current.push(event.data);
        if (recordingChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0) > 15 * 1024 * 1024) {
          setError('O áudio atingiu o limite de 15 MB e a gravação foi parada. Envie este trecho ou grave um áudio menor.');
          if (recorder.state !== 'inactive') recorder.stop();
        }
      };
      recorder.onerror = () => { setError('A gravação foi interrompida. Verifique a permissão do microfone e tente novamente.'); };
      recorder.onstop = () => {
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';
        const normalizedMime = actualMime.split(';')[0].toLowerCase();
        const blob = new Blob(recordingChunksRef.current, { type: normalizedMime });
        recordingChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size > 0 && recordingConversationRef.current === activeConversationRef.current) setRecordedAudio(blob);
      };
      recorderRef.current = recorder;
      recorder.start(300);
      setRecordedAudio(null);
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      setError('Não foi possível acessar o microfone. Permita o uso do microfone no navegador e tente novamente.');
    }
  }

  function stopAudioRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function discardRecordedAudio() {
    setRecordedAudio(null);
    setRecordingSeconds(0);
  }

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

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
    let cancelled = false;
    async function resolveAudioUrls() {
      const audioMessages = messages.filter((message) => message.audio_path);
      if (!audioMessages.length) { setAudioUrls({}); return; }
      const resolved = await Promise.all(audioMessages.map(async (message) => {
        const [playback, download] = await Promise.all([
          client.storage.from('team-chat-audio').createSignedUrl(message.audio_path!, 3600),
          client.storage.from('team-chat-audio').createSignedUrl(message.audio_path!, 3600, { download: `audio-${message.id}.${message.audio_path!.split('.').pop() || 'webm'}` }),
        ]);
        return [message.id, playback.error ? '' : playback.data.signedUrl, download.error ? '' : download.data.signedUrl] as const;
      }));
      if (!cancelled) {
        setAudioUrls(Object.fromEntries(resolved.filter(([, url]) => Boolean(url)).map(([id, url]) => [id, url])));
        setAudioDownloadUrls(Object.fromEntries(resolved.filter(([, , url]) => Boolean(url)).map(([id, , url]) => [id, url])));
      }
    }
    void resolveAudioUrls();
    return () => { cancelled = true; };
  }, [client, messages]);

  useEffect(() => {
    const visibleIds = messages.map((message) => message.id);
    if (!visibleIds.length) return;
    let cancelled = false;
    async function syncReadReceipts() {
      const { data, error: readError } = await client.from('team_chat_message_reads')
        .select('message_id,user_id,read_at').in('message_id', visibleIds);
      if (cancelled) return;
      if (readError) { setError(chatError(readError)); return; }
      const receipts = (data ?? []) as TeamChatRead[];
      setReadByMessage((current) => {
        const next = { ...current };
        for (const receipt of receipts) {
          const readers = new Set(next[receipt.message_id] ?? []);
          readers.add(receipt.user_id);
          next[receipt.message_id] = [...readers];
        }
        return next;
      });
      const existing = new Set(receipts.filter((receipt) => receipt.user_id === userId).map((receipt) => receipt.message_id));
      const unread = messages.filter((message) => message.sender_id !== userId && !existing.has(message.id) && !readMarkedRef.current.has(message.id));
      if (!unread.length) return;
      for (const message of unread) readMarkedRef.current.add(message.id);
      const { error: insertError } = await client.from('team_chat_message_reads').insert(unread.map((message) => ({ message_id: message.id, user_id: userId })));
      if (cancelled) return;
      if (insertError && insertError.code !== '23505') {
        for (const message of unread) readMarkedRef.current.delete(message.id);
        setError(chatError(insertError));
        return;
      }
      setReadByMessage((current) => {
        const next = { ...current };
        for (const message of unread) next[message.id] = [...new Set([...(next[message.id] ?? []), userId])];
        return next;
      });
    }
    void syncReadReceipts();
    return () => { cancelled = true; };
  }, [client, messages, userId]);

  useEffect(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setRecordedAudio(null); setRecordingSeconds(0); setReadByMessage({}); setAudioUrls({}); setAudioDownloadUrls({});
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_message_reads' }, (payload) => {
        const receipt = payload.new as unknown as TeamChatRead;
        if (!receipt.message_id || !receipt.user_id) return;
        setReadByMessage((current) => ({
          ...current,
          [receipt.message_id]: [...new Set([...(current[receipt.message_id] ?? []), receipt.user_id])],
        }));
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
    event.preventDefault(); const text = draft.trim();
    if (!text && !recordedAudio) { setError('Escreva uma mensagem ou grave um áudio antes de enviar.'); return; }
    const body = text || 'Mensagem de áudio';
    if (Array.from(body).length > MESSAGE_LIMIT) { setError(`A mensagem pode ter até ${MESSAGE_LIMIT} caracteres.`); return; }
    if (!canWrite) { setError('Você não participa deste grupo. Peça a um integrante para adicionar sua conta.'); return; }
    setSending(true); setError(''); setFeedback('');
    try {
      let audioPath: string | null = null;
      let audioContentType: string | null = null;
      if (recordedAudio) {
        const mp3 = await convertToMp3(recordedAudio);
        audioPath = `${userId}/${crypto.randomUUID()}.mp3`;
        audioContentType = 'audio/mpeg';
        const { error: uploadError } = await client.storage.from('team-chat-audio').upload(audioPath, mp3, { contentType: audioContentType, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data, error: insertError } = await client.from('team_chat_messages')
        .insert({ body, group_id: activeDirectId ? null : activeGroupId, dm_conversation_id: activeDirectId, audio_path: audioPath, audio_content_type: audioContentType })
        .select(MESSAGE_COLUMNS).single();
      if (insertError) throw insertError;
      const message = data as unknown as TeamChatMessage;
      setMessages((current) => mergeMessages(current, [message])); autoScrollRef.current = true; setDraft(''); setRecordedAudio(null); setRecordingSeconds(0);
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
      setActiveGroupId(null); setActiveDirectId(directId); setShowNewDirect(false); setShowMobileConversations(false); setMemberSearch('');
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
        const created = data as unknown as TeamChatGroup; setActiveDirectId(null); setActiveGroupId(created.id); setShowMobileConversations(false); setGroupDialogMode(null);
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
          <button className="team-chat-mobile-toggle" type="button" onClick={() => setShowMobileConversations(true)} aria-expanded={showMobileConversations}><MessageCircle aria-hidden="true" /> Conversas</button>
          {isAdmin && <span className="team-chat-admin-badge"><ShieldCheck aria-hidden="true" /> Administrador</span>}
          {activeGroupId && (activeGroupMemberIds.has(userId) || isAdmin) && <button className="workspace-refresh" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('add-members'); }} disabled={availableGroupMembers.length === 0}><UserPlus aria-hidden="true" /> Adicionar pessoas</button>}
          <button className="team-chat-create-group" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('create'); }}><UsersRound aria-hidden="true" /> Criar grupo</button>
          <button className="workspace-refresh" type="button" onClick={() => { void loadLatest(true); void loadLists(); }} disabled={refreshing || loading}><RefreshCw aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>
      <div className="team-chat-shell">
        {showMobileConversations && <button className="team-chat-drawer-backdrop" type="button" aria-label="Fechar lista de conversas" onClick={() => setShowMobileConversations(false)} />}
        <nav className={`team-chat-channels${showMobileConversations ? ' is-mobile-open' : ''}`} aria-label="Conversas do Chat">
          <p className="team-chat-channels-title">CONVERSAS</p>
          <div className="team-chat-channel-list">
            <button type="button" className={`team-chat-channel${!activeGroupId && !activeDirectId ? ' is-active' : ''}`} onClick={() => { setActiveGroupId(null); setActiveDirectId(null); setShowMobileConversations(false); }}><MessageCircle aria-hidden="true" /><span>Equipe</span><small>Todos</small></button>
            <div className="team-chat-channel-heading"><span>PRIVADAS</span><button type="button" title="Nova conversa privada" aria-label="Iniciar conversa privada" onClick={() => setShowNewDirect((value) => !value)}><Plus aria-hidden="true" /></button></div>
            {showNewDirect && <div className="team-chat-member-picker"><label><Search aria-hidden="true" /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar integrante" /></label><div>{filteredMembers.map((member) => <button type="button" key={member.user_id} onClick={() => void startDirect(member.user_id)}>{avatar(member.user_id, member.full_name)}<span>{member.full_name}</span></button>)}</div></div>}
            {directs.map((conversation) => {
              const otherId = conversation.user_a_id === userId ? conversation.user_b_id : conversation.user_a_id;
              const name = memberNames.get(otherId) || 'Integrante';
              return <button type="button" className={`team-chat-channel${activeDirectId === conversation.id ? ' is-active' : ''}`} key={conversation.id} onClick={() => { setActiveGroupId(null); setActiveDirectId(conversation.id); setShowMobileConversations(false); }}>
                {avatar(otherId, name)}<span>{name}</span><small>Privado</small></button>;
            })}
            {groups.length > 0 && <div className="team-chat-channel-heading"><span>GRUPOS</span></div>}
            {groups.map((group) => {
              const groupIds = groupMembers.filter((member) => member.group_id === group.id).map((member) => member.user_id);
              const count = groupIds.length;
              return <button type="button" className={`team-chat-channel${activeGroupId === group.id ? ' is-active' : ''}`} key={group.id} onClick={() => { setActiveDirectId(null); setActiveGroupId(group.id); setShowMobileConversations(false); }}>
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
                const readers = (readByMessage[message.id] ?? []).filter((readerId) => readerId !== userId);
                const readCount = readers.length;
                const previous = messages[index - 1]; const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return <div className="team-chat-message-row-wrap" key={message.id}>{showDay && <div className="team-chat-day-divider"><span>{dayLabel(message.created_at)}</span></div>}
                  <div className={`team-chat-message-row${message.sender_id === userId ? ' is-own' : ''}`}>{!activeDirectId && avatar(message.sender_id, senderName, 'md')}
                    <article className={`team-chat-message${message.sender_id === userId ? ' is-own' : ''}`}>
                      {!activeDirectId && <div className="team-chat-message-meta"><strong>{senderName}</strong></div>}
                      {message.body !== 'Mensagem de áudio' && <p>{message.body}</p>}
                      {message.audio_path && (audioUrls[message.id]
                        ? <div className="team-chat-audio-row"><audio className="team-chat-audio-player" controls preload="none" src={audioUrls[message.id]} aria-label={`Mensagem de áudio de ${senderName}`} />{audioDownloadUrls[message.id] && <a className="team-chat-audio-download" href={audioDownloadUrls[message.id]} aria-label="Baixar áudio" title="Baixar áudio"><Download aria-hidden="true" /><span>Baixar</span></a>}</div>
                        : <span className="team-chat-audio-loading">Carregando áudio…</span>)}
                      {message.body === 'Mensagem de áudio' && !message.audio_path && <p>Mensagem de áudio indisponível.</p>}
                      <div className="team-chat-message-time"><time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>{message.sender_id === userId && <span className={readCount ? 'is-read' : ''} aria-label={readCount ? (activeGroupId ? `Lida por ${readCount} integrante(s)` : 'Lida') : 'Enviada'} title={readCount ? (activeGroupId ? `Lida por ${readCount} integrante(s)` : 'Lida') : 'Enviada'}>{readCount ? '✓✓' : '✓'}{readCount > 0 && <small>{activeGroupId ? `Lida por ${readCount}` : 'Lida'}</small>}</span>}</div>
                      {isAdmin && <div className="team-chat-message-actions">{confirmRemoveId === message.id ? <><span>Remover esta mensagem?</span><button type="button" className="team-chat-confirm-remove" onClick={() => void removeMessage(message.id)} disabled={removingId === message.id}>{removingId === message.id ? 'Removendo…' : 'Confirmar remoção'}</button><button type="button" className="team-chat-cancel-remove" onClick={() => setConfirmRemoveId(null)} disabled={removingId === message.id}>Cancelar</button></> : <button type="button" className="team-chat-remove" onClick={() => setConfirmRemoveId(message.id)} aria-label={`Remover mensagem de ${senderName}`}><Trash2 aria-hidden="true" /> Remover</button>}</div>}
                    </article></div></div>;
              })}
              <div ref={bottomRef} />
            </div>
            <form className="team-chat-composer" onSubmit={(event) => void sendMessage(event)}>
              <textarea aria-label="Sua mensagem" id="team-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canWrite ? 'Escreva uma mensagem…' : 'Você não participa deste grupo.'} rows={1} maxLength={MESSAGE_LIMIT} disabled={sending || !canWrite} />
              {recording && <div className="team-chat-audio-state is-recording"><span className="team-chat-record-dot" aria-hidden="true" />Gravando áudio · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}<button type="button" onClick={stopAudioRecording} aria-label="Parar gravação"><Square aria-hidden="true" /> Parar</button></div>}
              {recordedAudio && !recording && <div className="team-chat-audio-state"><span>Áudio gravado · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span><button type="button" onClick={discardRecordedAudio} aria-label="Descartar áudio gravado"><X aria-hidden="true" /> Descartar</button></div>}
              <div className="team-chat-compose-footer"><span>{Array.from(draft).length}/{MESSAGE_LIMIT} · {activeDirectId ? 'Conversa privada' : activeGroupId ? 'Somente participantes do grupo' : 'Visível para os integrantes ativos'}</span><div className="team-chat-compose-actions"><button className="team-chat-record-button" type="button" onClick={() => void startAudioRecording()} aria-label="Gravar áudio" title="Gravar áudio" disabled={sending || recording || !canWrite}><Mic aria-hidden="true" /></button><button type="submit" aria-label={sending ? 'Enviando mensagem' : recordedAudio ? 'Enviar mensagem de áudio' : 'Enviar mensagem'} title={sending ? 'Enviando…' : recordedAudio ? 'Enviar mensagem de áudio' : 'Enviar mensagem'} disabled={sending || (!draft.trim() && !recordedAudio) || !canWrite}><ArrowUp aria-hidden="true" /></button></div></div>
            </form>
          </div>
          <p className="team-chat-retention-note">Mensagens ficam salvas até um Administrador removê-las. As conversas privadas só podem ser lidas pelos dois participantes. Mensagens do Chat não enviam e-mail.</p>
        </div>
      </div>
      {groupDialogMode && <ChatGroupDialog mode={groupDialogMode} members={dialogMembers} busy={groupActionBusy} error={groupDialogError} onCancel={() => { if (!groupActionBusy) setGroupDialogMode(null); }} onSubmit={(value) => void handleGroupDialogSubmit(value)} />}
    </section>
  );
}
