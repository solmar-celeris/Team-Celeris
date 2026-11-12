import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUp, Camera, Download, MoreVertical, MailPlus, ExternalLink, FileText, Image as ImageIcon, Link2, Mic, MessageCircle, Paperclip, RefreshCw, ShieldCheck, Square, Trash2, UserPlus, UsersRound, Plus, Search, X } from 'lucide-react';
import { Mp3Encoder } from '@breezystack/lamejs';
import { notifyChatMessagePush } from '../../lib/notifications';
import type { MemberProfile } from './domain';
import ChatGroupDialog from './ChatGroupDialog';
import './team-chat.css';

type TeamChatMessage = {
  id: string; sender_id: string | null; group_id: string | null; dm_conversation_id: string | null;
  body: string; audio_path: string | null; audio_content_type: string | null;
  attachment_path: string | null; attachment_content_type: string | null; attachment_name: string | null; attachment_size: number | null;
  drive_url: string | null; drive_name: string | null;
  created_at: string; removed_at: string | null; removed_by: string | null;
};
type TeamChatRead = { message_id: string; user_id: string; read_at: string };
type TeamChatGroup = { id: string; name: string; created_by: string | null; created_at: string; avatar_path: string | null };
type TeamChatGroupMember = { group_id: string; user_id: string };
type DirectConversation = { id: string; user_a_id: string; user_b_id: string; created_at: string };
type GroupDialogMode = 'create' | 'add-members';
type ChatMember = Pick<MemberProfile, 'user_id' | 'full_name' | 'avatar_path' | 'status'>;
type TeamChatProps = {
  client: SupabaseClient; userId: string; isAdmin: boolean; members: ChatMember[];
  initialMessageId?: string; initialConversationId?: string | null; initialConversationType?: 'team' | 'group' | 'direct';
  initialDirectUserId?: string | null; onInitialDirectHandled?: () => void;
  openCreateGroup?: boolean; onCreateGroupHandled?: () => void;
};
const PAGE_SIZE = 50;
const MESSAGE_LIMIT = 2000;
const DRIVE_LINK_ONLY_BODY = '[Link do Drive]';
const MESSAGE_COLUMNS = 'id,sender_id,group_id,dm_conversation_id,body,audio_path,audio_content_type,attachment_path,attachment_content_type,attachment_name,attachment_size,drive_url,drive_name,created_at,removed_at,removed_by';
const CHAT_FILE_LIMIT = 15 * 1024 * 1024;
const CHAT_DRIVE_NAME_LIMIT = 240;
const CHAT_DRIVE_URL_LIMIT = 2048;
const CHAT_FILE_ACCEPT = 'image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.m4a,.wav,.aac,.ogg,.webm';
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  mp4: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', webm: 'audio/webm',
};
const ALLOWED_CHAT_MIME = new Set(Object.values(MIME_BY_EXTENSION));
function validateDriveAttachment(nameValue: string, urlValue: string): { name: string; url: string } | null {
  const name = nameValue.trim();
  const rawUrl = urlValue.trim();
  if (!name && !rawUrl) return null;
  if (!name || !rawUrl) throw new Error('Informe o nome e o link do arquivo do Drive.');
  if (Array.from(name).length > CHAT_DRIVE_NAME_LIMIT) throw new Error(`O nome do arquivo do Drive pode ter até ${CHAT_DRIVE_NAME_LIMIT} caracteres.`);
  if (rawUrl.length > CHAT_DRIVE_URL_LIMIT || /[\u0000-\u0020\u007f]/.test(rawUrl)) throw new Error('Confira o link HTTPS do Google Drive e tente novamente.');
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Informe um link HTTPS válido do Google Drive ou Google Docs.'); }
  const authority = rawUrl.match(/^https:\/\/([^/?#]*)/i)?.[1]?.toLowerCase();
  if (parsed.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port || authority !== parsed.hostname) {
    throw new Error('Use um link HTTPS de drive.google.com ou docs.google.com, sem credenciais.');
  }
  if (parsed.href.length > CHAT_DRIVE_URL_LIMIT) throw new Error(`O link do Drive pode ter até ${CHAT_DRIVE_URL_LIMIT} caracteres.`);
  return { name, url: parsed.href };
}
function attachmentMime(file: File): string | null {
  const declared = file.type.toLowerCase().split(';')[0];
  if (ALLOWED_CHAT_MIME.has(declared)) return declared;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}
function safeFileExtension(file: File, contentType: string): string {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  const known = Object.entries(MIME_BY_EXTENSION).find(([candidate, mime]) => candidate === ext && mime === contentType);
  return known?.[0] ?? Object.entries(MIME_BY_EXTENSION).find(([, mime]) => mime === contentType)?.[0] ?? 'bin';
}
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
  if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(details.code ?? '')) return 'As funções recentes do Chat ainda não estão configuradas no Supabase. Confira as migrations de Chat privado/calendário, áudio/leitura, anexos, links do Drive, fotos de grupo e exclusão global (20261110100000_member_removed_enum.sql e 20261110101000_chat_global_delete_member_revocation.sql); aplique somente as que ainda faltam.';
  if (details.code === '42501') return 'O Supabase bloqueou a operação pelas regras de acesso. Confirme que sua conta está ativa e pertence à conversa.';
  if (details.code === '23514') return 'Confira os dados informados e tente novamente.';
  if (details.code === '23505') return 'Essa conversa ou participante já existe. Atualize a lista de conversas.';
  return details.message || 'Não foi possível concluir a operação. Confira a conexão e tente novamente.';
}
export default function TeamChat({ client, userId, isAdmin, members, initialMessageId, initialConversationId, initialConversationType, initialDirectUserId, onInitialDirectHandled, openCreateGroup, onCreateGroupHandled }: TeamChatProps) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [groups, setGroups] = useState<TeamChatGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<TeamChatGroupMember[]>([]);
  const [directs, setDirects] = useState<DirectConversation[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => initialConversationType === 'group' ? initialConversationId ?? null : null);
  const [activeDirectId, setActiveDirectId] = useState<string | null>(() => initialConversationType === 'direct' ? initialConversationId ?? null : null);
  const [groupDialogMode, setGroupDialogMode] = useState<GroupDialogMode | null>(null);
  const [groupDialogError, setGroupDialogError] = useState('');
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [showMobileConversations, setShowMobileConversations] = useState(false);
  const [conversationDeletionBusy, setConversationDeletionBusy] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'conversations' | 'groups'>('conversations');
  const [draft, setDraft] = useState('');
  const [driveFormOpen, setDriveFormOpen] = useState(false);
  const [driveName, setDriveName] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
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
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentDownloadUrls, setAttachmentDownloadUrls] = useState<Record<string, string>>({});
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const [readByMessage, setReadByMessage] = useState<Record<string, string[]>>({});
  const [readDetailsMessageId, setReadDetailsMessageId] = useState<string | null>(null);
  const [groupAvatarUrls, setGroupAvatarUrls] = useState<Record<string, string>>({});
  const [savingGroupPhoto, setSavingGroupPhoto] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
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
  const targetMessageScrolledRef = useRef(false);
  activeGroupRef.current = activeGroupId;
  activeDirectRef.current = activeDirectId;
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const memberNames = useMemo(() => new Map(members.map((member) => [member.user_id, member.full_name.trim()])), [members]);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const activeDirect = useMemo(() => directs.find((conversation) => conversation.id === activeDirectId) ?? null, [directs, activeDirectId]);
  const visibleGroups = groups.filter((group) => group.name.toLocaleLowerCase('pt-BR').includes(conversationSearch.trim().toLocaleLowerCase('pt-BR')));
  const activeMembers = members.filter((member) => member.user_id !== userId && member.status === 'active');
  const visibleMembers = activeMembers.filter((member) => member.full_name.toLocaleLowerCase('pt-BR').includes(conversationSearch.trim().toLocaleLowerCase('pt-BR')));
  const activeDirectUserId = activeDirect ? (activeDirect.user_a_id === userId ? activeDirect.user_b_id : activeDirect.user_a_id) : null;
  const activeDirectMember = activeDirectUserId ? memberById.get(activeDirectUserId) : undefined;
  const activeGroupMemberIds = useMemo(() => new Set(groupMembers.filter((member) => member.group_id === activeGroupId).map((member) => member.user_id)), [groupMembers, activeGroupId]);
  const availableGroupMembers = useMemo(() => members.filter((member) => !activeGroupMemberIds.has(member.user_id)), [activeGroupMemberIds, members]);
  const dialogMembers = useMemo(() => groupDialogMode === 'create' ? members.filter((member) => member.user_id !== userId) : groupDialogMode === 'add-members' ? availableGroupMembers : [], [availableGroupMembers, groupDialogMode, members, userId]);
  const canWrite = !activeGroupId || activeGroupMemberIds.has(userId);
  const canDeleteCurrentConversation = activeDirectId
    ? Boolean(activeDirect && (activeDirect.user_a_id === userId || activeDirect.user_b_id === userId))
    : activeGroupId ? activeGroupMemberIds.has(userId) : true;
  const conversationLabel = activeDirectMember?.full_name || activeGroup?.name || 'Chat';
  const activeKey = activeDirectId ?? activeGroupId ?? 'team';
  const activeConversationRef = useRef(activeKey);
  activeConversationRef.current = activeKey;

  useEffect(() => {
    void client.functions.invoke('delete-chat-content', { body: { action: 'cleanup_pending' } }).catch(() => undefined);
  }, [client, userId]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current || !cameraVideoRef.current) return;
    const stream = cameraStreamRef.current;
    const video = cameraVideoRef.current;
    const startPreview = () => {
      if (cameraStreamRef.current !== stream) return;
      video.srcObject = stream;
      void video.play().catch(() => setCameraError('A prévia da câmera foi bloqueada. Clique novamente no botão da câmera para autorizar a reprodução.'));
    };
    video.addEventListener('loadedmetadata', startPreview, { once: true });
    startPreview();
    return () => {
      video.removeEventListener('loadedmetadata', startPreview);
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraOpen]);

  const loadLists = useCallback(async () => {
    try {
      const [groupResult, memberResult, directResult] = await Promise.all([
        client.from('team_chat_groups').select('id,name,created_by,created_at,avatar_path').order('name', { ascending: true }),
        client.from('team_chat_group_members').select('group_id,user_id'),
        client.from('team_chat_direct_conversations').select('id,user_a_id,user_b_id,created_at').order('created_at', { ascending: false }),
      ]);
      const failure = groupResult.error ?? memberResult.error ?? directResult.error;
      if (failure) throw failure;
      const nextGroups = (groupResult.data ?? []) as unknown as TeamChatGroup[];
      const groupPhotos = await Promise.all(nextGroups.map(async (group) => {
        if (!group.avatar_path) return [group.id, ''] as const;
        const { data, error: photoError } = await client.storage.from('team-chat-group-photos').createSignedUrl(group.avatar_path, 3600);
        return [group.id, photoError ? '' : data.signedUrl] as const;
      }));
      setGroups(nextGroups);
      setGroupAvatarUrls(Object.fromEntries(groupPhotos.filter(([, url]) => Boolean(url))));
      setGroupMembers((memberResult.data ?? []) as unknown as TeamChatGroupMember[]);
      const nextDirects = (directResult.data ?? []) as unknown as DirectConversation[];
      setDirects(nextDirects);
      if (activeGroupRef.current && !nextGroups.some((group) => group.id === activeGroupRef.current)) {
        setActiveGroupId(null);
        setActiveDirectId(null);
      }
      if (activeDirectRef.current && !nextDirects.some((conversation) => conversation.id === activeDirectRef.current)) {
        setActiveDirectId(null);
        setActiveGroupId(null);
      }
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
      let rows = ((data ?? []) as unknown as TeamChatMessage[]).filter(matches).reverse();
      if (initialMessageId && !rows.some((message) => message.id === initialMessageId)) {
        let targetQuery = client.from('team_chat_messages').select(MESSAGE_COLUMNS).eq('id', initialMessageId).is('removed_at', null);
        if (directId) targetQuery = targetQuery.eq('dm_conversation_id', directId);
        else if (groupId) targetQuery = targetQuery.eq('group_id', groupId).is('dm_conversation_id', null);
        else targetQuery = targetQuery.is('group_id', null).is('dm_conversation_id', null);
        const { data: targetData, error: targetError } = await targetQuery.maybeSingle();
        if (targetError) throw targetError;
        const targetMessage = targetData as unknown as TeamChatMessage | null;
        if (targetMessage && matches(targetMessage)) rows = mergeMessages(rows, [targetMessage]).filter(matches);
      }
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
  }, [activeDirectId, activeGroupId, client, initialMessageId]);

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
    let cancelled = false;
    async function resolveAttachmentUrls() {
      const attachments = messages.filter((message) => message.attachment_path);
      if (!attachments.length) { setAttachmentUrls({}); setAttachmentDownloadUrls({}); return; }
      const resolved = await Promise.all(attachments.map(async (message) => {
        const name = message.attachment_name || `arquivo-${message.id}`;
        const [preview, download] = await Promise.all([
          client.storage.from('team-chat-attachments').createSignedUrl(message.attachment_path!, 3600),
          client.storage.from('team-chat-attachments').createSignedUrl(message.attachment_path!, 3600, { download: name }),
        ]);
        return [message.id, preview.error ? '' : preview.data.signedUrl, download.error ? '' : download.data.signedUrl] as const;
      }));
      if (!cancelled) {
        setAttachmentUrls(Object.fromEntries(resolved.filter(([, url]) => Boolean(url)).map(([id, url]) => [id, url])));
        setAttachmentDownloadUrls(Object.fromEntries(resolved.filter(([, , url]) => Boolean(url)).map(([id, , url]) => [id, url])));
      }
    }
    void resolveAttachmentUrls();
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
      if (activeGroupId && !activeGroupMemberIds.has(userId)) return;
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
  }, [activeGroupId, activeGroupMemberIds, client, messages, userId]);

  useEffect(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setRecordedAudio(null); setPendingAttachment(null); setRecordingSeconds(0); setReadByMessage({}); setReadDetailsMessageId(null); setAudioUrls({}); setAudioDownloadUrls({}); setAttachmentUrls({}); setAttachmentDownloadUrls({});
    setMessages([]); setHasOlder(false); setDraft(''); setDriveFormOpen(false); setDriveName(''); setDriveUrl(''); setConfirmRemoveId(null); setError(''); setFeedback('');
    eventRevisionRef.current = 0; void loadLists(); void loadLatest();
    const channel = client.channel(`team-chat-${userId}-${activeKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_messages' }, (payload) => {
        const message = payload.new as unknown as TeamChatMessage;
        if (!message.id || message.group_id !== activeGroupId || message.dm_conversation_id !== activeDirectId) return;
        eventRevisionRef.current += 1;
        if (message.removed_at) { removedIdsRef.current.add(message.id); setMessages((current) => current.filter((item) => item.id !== message.id)); return; }
        setMessages((current) => mergeMessages(current, [message])); autoScrollRef.current = true;
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'team_chat_messages' }, (payload) => {
        const deleted = payload.old as Partial<TeamChatMessage>;
        if (deleted.id) {
          removedIdsRef.current.add(deleted.id);
          setMessages((current) => current.filter((item) => item.id !== deleted.id));
        } else { void loadLatest(true); }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_chat_groups' }, () => { void loadLists(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_group_members' }, () => { void loadLists(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_chat_direct_conversations' }, () => { void loadLists(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setConnection('connected'); if (hasConnectedRef.current) void loadLatest(true); else hasConnectedRef.current = true; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('disconnected');
        else setConnection('connecting');
      });
    return () => { void client.removeChannel(channel); };
  }, [activeDirectId, activeGroupId, activeKey, client, loadLists, loadLatest, userId]);

  useEffect(() => { if (autoScrollRef.current) { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); autoScrollRef.current = false; } }, [messages]);
  useEffect(() => {
    if (!initialMessageId || targetMessageScrolledRef.current || !messages.some((message) => message.id === initialMessageId)) return;
    const target = document.getElementById(`chat-message-${initialMessageId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetMessageScrolledRef.current = true;
    }
  }, [initialMessageId, messages]);

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

  function handleAttachmentSelection(file: File | undefined) {
    if (!file) return;
    const mime = attachmentMime(file);
    if (!mime) {
      setError('Este formato não é compatível. Anexe uma imagem, documento (PDF, Word, Excel, PowerPoint, TXT/CSV) ou áudio.');
      return;
    }
    if (file.size <= 0 || file.size > CHAT_FILE_LIMIT) {
      setError('Cada arquivo pode ter no máximo 15 MB.');
      return;
    }
    setError('');
    setPendingAttachment(file);
  }

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraError('');
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não oferece acesso direto à câmera. Atualize o navegador ou use o botão de anexar imagem.');
      return;
    }
    setError('');
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraAccessError) {
      const name = cameraAccessError instanceof DOMException ? cameraAccessError.name : '';
      const message = name === 'NotAllowedError' || name === 'SecurityError'
        ? 'A permissão da câmera foi negada. Autorize o acesso à câmera nas configurações do navegador e tente novamente.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'Nenhuma câmera foi encontrada neste computador.'
          : 'Não foi possível abrir a câmera. Verifique se ela está disponível e não está sendo usada por outro aplicativo.';
      setCameraError(message);
      setError(message);
    }
  }

  function captureCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCameraError('A câmera ainda está iniciando. Aguarde um instante e tente novamente.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('Não foi possível capturar a foto. Tente novamente.');
        return;
      }
      handleAttachmentSelection(new File([blob], `foto-chat-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      closeCamera();
    }, 'image/jpeg', 0.92);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = draft.trim();
    if (recordedAudio && pendingAttachment) { setError('Envie a gravação ou o arquivo selecionado em mensagens separadas.'); return; }
    let driveAttachment: { name: string; url: string } | null;
    try { driveAttachment = validateDriveAttachment(driveName, driveUrl); }
    catch (validationError) { setError(validationError instanceof Error ? validationError.message : 'Confira os dados do link do Drive.'); return; }
    if (!text && !recordedAudio && !pendingAttachment && !driveAttachment) { setError('Escreva uma mensagem, grave um áudio, anexe um arquivo ou adicione um link do Drive antes de enviar.'); return; }
    const pendingMime = pendingAttachment ? attachmentMime(pendingAttachment) : null;
    const audioSource = recordedAudio ?? (pendingAttachment && pendingMime?.startsWith('audio/') ? pendingAttachment : null);
    const attachmentFile = pendingAttachment && !audioSource ? pendingAttachment : null;
    const body = text || (audioSource ? 'Mensagem de áudio' : attachmentFile ? `Arquivo anexado: ${attachmentFile.name}` : driveAttachment ? DRIVE_LINK_ONLY_BODY : '');
    if (Array.from(body).length > MESSAGE_LIMIT) { setError(`A mensagem pode ter até ${MESSAGE_LIMIT} caracteres.`); return; }
    if (!canWrite) { setError('Você não participa deste grupo. Peça a um integrante para adicionar sua conta.'); return; }
    setSending(true); setError(''); setFeedback('');
    try {
      let audioPath: string | null = null;
      let audioContentType: string | null = null;
      let attachmentPath: string | null = null;
      let attachmentContentType: string | null = null;
      let attachmentName: string | null = null;
      let attachmentSize: number | null = null;
      if (audioSource) {
        const mp3 = await convertToMp3(audioSource);
        if (mp3.size > CHAT_FILE_LIMIT) throw new Error('O áudio convertido ultrapassou o limite de 15 MB. Grave ou selecione um trecho menor.');
        audioPath = `${userId}/${crypto.randomUUID()}.mp3`;
        audioContentType = 'audio/mpeg';
        const { error: uploadError } = await client.storage.from('team-chat-audio').upload(audioPath, mp3, { contentType: audioContentType, upsert: false });
        if (uploadError) throw uploadError;
      }
      if (attachmentFile && pendingMime) {
        attachmentPath = `${userId}/${crypto.randomUUID()}.${safeFileExtension(attachmentFile, pendingMime)}`;
        attachmentContentType = pendingMime;
        attachmentName = attachmentFile.name.trim().slice(0, 240) || 'arquivo';
        attachmentSize = attachmentFile.size;
        const { error: uploadError } = await client.storage.from('team-chat-attachments').upload(attachmentPath, attachmentFile, { contentType: pendingMime, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data, error: insertError } = await client.from('team_chat_messages')
        .insert({ body, group_id: activeDirectId ? null : activeGroupId, dm_conversation_id: activeDirectId ? activeDirectId : activeGroupId ? null : null, audio_path: audioPath, audio_content_type: audioContentType, attachment_path: attachmentPath, attachment_content_type: attachmentContentType, attachment_name: attachmentName, attachment_size: attachmentSize, drive_url: driveAttachment?.url ?? null, drive_name: driveAttachment?.name ?? null })
        .select(MESSAGE_COLUMNS).single();
      if (insertError) throw insertError;
      const message = data as unknown as TeamChatMessage;
      setMessages((current) => mergeMessages(current, [message])); autoScrollRef.current = true; setDraft(''); setRecordedAudio(null); setPendingAttachment(null); setDriveName(''); setDriveUrl(''); setDriveFormOpen(false); setRecordingSeconds(0);
      void notifyChatMessagePush(client, message.id).then((outcome) => { if (outcome === 'failed') setFeedback('Mensagem enviada. O aviso no celular não foi confirmado; confira a configuração do OneSignal.'); });
    } catch (sendError) { setError(chatError(sendError)); }
    finally { setSending(false); }
  }

  async function removeMessage(messageId: string) {
    if (!canDeleteCurrentConversation || removingId) return;
    setRemovingId(messageId); setError(''); setFeedback('');
    try {
      const { data, error: removeError } = await client.functions.invoke('delete-chat-content', { body: { action: 'delete_message', message_id: messageId } });
      if (removeError) throw removeError;
      if (!data || data.status !== 'deleted') throw new Error('A função de exclusão não confirmou a operação.');
      removedIdsRef.current.add(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setConfirmRemoveId(null);
      setFeedback(data.storage_cleanup_pending
        ? 'Mensagem apagada para todos. A limpeza de arquivos está pendente e será tentada novamente.'
        : 'Mensagem apagada para todos.');
    } catch {
      setError('Não foi possível apagar a mensagem para todos. Confirme que as migrations foram aplicadas e que a Edge Function delete-chat-content foi publicada.');
    } finally { setRemovingId(null); }
  }

  function confirmDeleteConversation(kind: 'group' | 'direct', id: string, name: string) {
    const confirmed = window.confirm(`Apagar “${name}” para todos? Todo o histórico, recibos, fotos e arquivos associados serão apagados permanentemente para todos os participantes. Esta ação não pode ser desfeita.`);
    if (confirmed) void removeConversationForAll({ kind, id, name });
  }

  async function removeConversationForAll(target: { kind: 'group' | 'direct'; id: string; name: string }) {
    if (conversationDeletionBusy) return;
    setConversationDeletionBusy(true); setError(''); setFeedback('');
    try {
      const { data, error: removeError } = await client.functions.invoke('delete-chat-content', {
        body: { action: 'delete_conversation', kind: target.kind, conversation_id: target.id },
      });
      if (removeError) throw removeError;
      if (!data || data.status !== 'deleted') throw new Error('A função de exclusão não confirmou a operação.');
      if (target.kind === 'group') {
        setGroups((current) => current.filter((group) => group.id !== target.id));
        setGroupMembers((current) => current.filter((member) => member.group_id !== target.id));
        setGroupAvatarUrls((current) => { const next = { ...current }; delete next[target.id]; return next; });
        if (activeGroupId === target.id) { setActiveGroupId(null); setActiveDirectId(null); setMessages([]); }
      } else {
        setDirects((current) => current.filter((conversation) => conversation.id !== target.id));
        if (activeDirectId === target.id) { setActiveDirectId(null); setActiveGroupId(null); setMessages([]); }
      }
      setFeedback(data.storage_cleanup_pending
        ? `“${target.name}” foi apagada para todos. A limpeza de arquivos ficou pendente e será tentada novamente.`
        : `“${target.name}” foi apagada para todos.`);
      void loadLists();
    } catch {
      setError('Não foi possível apagar a conversa para todos. Confirme que as migrations foram aplicadas e que a Edge Function delete-chat-content foi publicada.');
    } finally { setConversationDeletionBusy(false); }
  }

  async function uploadGroupPhoto(file: File) {
    if (!activeGroup || !(isAdmin || activeGroupMemberIds.has(userId)) || savingGroupPhoto) return;
    const mime = file.type.toLowerCase();
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!extensions[mime]) { setError('A foto do grupo deve ser JPEG, PNG ou WebP.'); return; }
    if (file.size <= 0 || file.size > 3 * 1024 * 1024) { setError('A foto do grupo deve ter até 3 MB.'); return; }
    setSavingGroupPhoto(true); setError(''); setFeedback('');
    const path = `${activeGroup.id}/${crypto.randomUUID()}.${extensions[mime]}`;
    let uploaded = false;
    let saved = false;
    try {
      const { error: uploadError } = await client.storage.from('team-chat-group-photos').upload(path, file, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { error: updateError } = await client.from('team_chat_groups').update({ avatar_path: path }).eq('id', activeGroup.id);
      if (updateError) throw updateError;
      saved = true;
      if (activeGroup.avatar_path) await client.storage.from('team-chat-group-photos').remove([activeGroup.avatar_path]);
      setFeedback('Foto do grupo atualizada.');
      await loadLists();
    } catch (photoError) {
      setError(chatError(photoError));
    } finally {
      if (uploaded && !saved) await client.storage.from('team-chat-group-photos').remove([path]);
      setSavingGroupPhoto(false);
    }
  }

  async function startDirect(otherUserId: string) {
    setError(''); setFeedback('');
    try {
      const { data, error: directError } = await client.rpc('get_or_create_team_chat_direct_conversation', { p_other_user_id: otherUserId });
      if (directError) throw directError;
      const directId = typeof data === 'string' ? data : String(data ?? '');
      if (!directId) throw new Error('Não foi possível abrir a conversa privada.');
      setActiveGroupId(null); setActiveDirectId(directId); setShowMobileConversations(false);
      void loadLists();
    } catch (actionError) { setError(chatError(actionError)); }
  }

  useEffect(() => {
    if (!initialDirectUserId) return;
    void startDirect(initialDirectUserId).finally(() => onInitialDirectHandled?.());
  }, [initialDirectUserId, onInitialDirectHandled]);

  useEffect(() => {
    if (!openCreateGroup || !isAdmin) return;
    setGroupDialogError(''); setGroupDialogMode('create');
    onCreateGroupHandled?.();
  }, [openCreateGroup, onCreateGroupHandled, isAdmin]);

  async function handleGroupDialogSubmit(value: { name: string; memberIds: string[] }) {
    if (!groupDialogMode || groupActionBusy || (groupDialogMode === 'create' && !isAdmin)) return;
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

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || inviteBusy) return;
    setInviteBusy(true); setInviteError('');
    try {
      const { error: inviteFailure } = await client.functions.invoke('manage-team-members', {
        body: { action: 'invite', email: inviteEmail.trim(), full_name: inviteName.trim() },
      });
      if (inviteFailure) throw inviteFailure;
      setInviteOpen(false); setInviteName(''); setInviteEmail('');
      setFeedback('Convite enviado por e-mail.');
    } catch (inviteFailure) { setInviteError(chatError(inviteFailure)); }
    finally { setInviteBusy(false); }
  }

  const getMember = (id: string | null) => id ? memberById.get(id) : undefined;
  const avatar = (id: string | null, name: string, size: 'sm' | 'md' = 'sm') => {
    const photo = id ? avatarUrls[id] : undefined;
    return <span className={`team-chat-avatar is-${size}`}>{photo ? <img src={photo} alt={`Foto de ${name}`} /> : <span aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') || '?'}</span>}</span>;
  };

  const groupAvatar = (group: TeamChatGroup, size: 'sm' | 'md' = 'sm') => {
    const photo = groupAvatarUrls[group.id];
    return <span className={`team-chat-avatar is-${size} is-group-avatar`}>{photo ? <img src={photo} alt={`Foto do grupo ${group.name}`} /> : <span aria-hidden="true">{Array.from(group.name.trim())[0]?.toLocaleUpperCase('pt-BR') || 'G'}</span>}</span>;
  };

  return (
    <section className="team-chat" aria-labelledby="team-chat-title">
      <div className="team-chat-heading">
        <div><p className="workspace-kicker">{activeDirectId ? 'CONVERSA PRIVADA' : activeGroupId ? 'CHAT · GRUPO' : 'CHAT · EQUIPE'}</p>
          <h2 id="team-chat-title">{activeGroup ? groupAvatar(activeGroup, 'md') : <MessageCircle aria-hidden="true" />} {activeDirectId ? conversationLabel : activeGroup?.name ?? 'Chat'}</h2>
          <p>{activeDirectId ? 'Conversa privada, visível somente para as duas contas participantes.' : activeGroupId ? 'Mensagens e informações de leitura restritas aos integrantes do grupo.' : 'Converse com a equipe em tempo real no Chat.'}</p></div>
        <div className="team-chat-heading-actions">
          <button className="team-chat-mobile-toggle" type="button" onClick={() => setShowMobileConversations(true)} aria-expanded={showMobileConversations}><MessageCircle aria-hidden="true" /> Conversas</button>
          {isAdmin && <span className="team-chat-admin-badge"><ShieldCheck aria-hidden="true" /> Administrador</span>}
          {activeGroupId && (activeGroupMemberIds.has(userId) || isAdmin) && <><input ref={groupPhotoInputRef} className="team-chat-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadGroupPhoto(file); event.currentTarget.value = ''; }} /><button className="team-chat-secondary-action" type="button" onClick={() => groupPhotoInputRef.current?.click()} disabled={savingGroupPhoto} aria-label="Alterar foto do grupo"><Camera aria-hidden="true" /> {savingGroupPhoto ? 'Salvando foto…' : 'Foto do grupo'}</button><button className="workspace-refresh" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('add-members'); }} disabled={availableGroupMembers.length === 0}><UserPlus aria-hidden="true" /> Adicionar pessoas</button></>}
          {isAdmin && <button className="team-chat-create-group" type="button" onClick={() => { setGroupDialogError(''); setGroupDialogMode('create'); }}><UsersRound aria-hidden="true" /> Conversa em grupo</button>}
          <button className="workspace-refresh" type="button" onClick={() => { void loadLatest(true); void loadLists(); }} disabled={refreshing || loading}><RefreshCw aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>
      <div className="team-chat-shell">
        {showMobileConversations && <button className="team-chat-drawer-backdrop" type="button" aria-label="Fechar lista de conversas" onClick={() => setShowMobileConversations(false)} />}
        <nav className={`team-chat-channels${showMobileConversations ? ' is-mobile-open' : ''}`} aria-label="Conversas do Chat">
          <p className="team-chat-channels-title">CHAT · CONVERSAS</p>
          <div className="team-chat-sidebar-tabs" role="tablist" aria-label="Tipo de conversa">
            <button type="button" role="tab" aria-selected={sidebarTab === 'conversations'} className={sidebarTab === 'conversations' ? 'is-active' : ''} onClick={() => setSidebarTab('conversations')}>Conversas</button>
            <button type="button" role="tab" aria-selected={sidebarTab === 'groups'} className={sidebarTab === 'groups' ? 'is-active' : ''} onClick={() => setSidebarTab('groups')}>Grupos</button>
          </div>
          <label className="team-chat-sidebar-search"><Search aria-hidden="true" /><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar membro ou grupo…" /></label>
          <div className="team-chat-channel-list">
            {sidebarTab === 'conversations' && <button type="button" className={`team-chat-channel${!activeGroupId && !activeDirectId ? ' is-active' : ''}`} onClick={() => { setActiveGroupId(null); setActiveDirectId(null); setShowMobileConversations(false); }}><MessageCircle aria-hidden="true" /><span>Equipe</span><small>Todos</small></button>}
            {sidebarTab === 'conversations' && visibleMembers.map((member) => {
              const direct = directs.find((item) => item.user_a_id === member.user_id || item.user_b_id === member.user_id);
              const selected = Boolean(direct && activeDirectId === direct.id);
              return <div className={`team-chat-channel-row team-chat-member-row${selected ? ' is-active' : ''}`} key={member.user_id}>
                <button type="button" className={`team-chat-channel${selected ? ' is-active' : ''}`} onClick={() => void startDirect(member.user_id)}>{avatar(member.user_id, member.full_name)}<span>{member.full_name}</span>{direct && <small>Privado</small>}</button>
                <button className="team-chat-channel-visibility team-chat-member-menu-trigger" type="button" title={`Ações para ${member.full_name}`} aria-label={`Ações para ${member.full_name}`} aria-expanded={memberMenuId === member.user_id} onClick={() => setMemberMenuId((current) => current === member.user_id ? null : member.user_id)}><MoreVertical aria-hidden="true" /></button>
                {memberMenuId === member.user_id && <div className="team-chat-member-menu">
                  <button type="button" onClick={() => { setMemberMenuId(null); void startDirect(member.user_id); }}><MessageCircle aria-hidden="true" /> Abrir conversa</button>
                  {direct && <button type="button" disabled={conversationDeletionBusy} onClick={() => { setMemberMenuId(null); confirmDeleteConversation('direct', direct.id, member.full_name); }}><Trash2 aria-hidden="true" /> Apagar conversa</button>}
                </div>}
              </div>;
            })}
            {sidebarTab === 'conversations' && visibleMembers.length === 0 && <p className="team-chat-no-groups">Nenhum integrante ativo encontrado.</p>}
            {sidebarTab === 'conversations' && isAdmin && <button className="team-chat-invite-member" type="button" onClick={() => { setInviteError(''); setInviteOpen(true); }}><MailPlus aria-hidden="true" /> Convidar mais membros</button>}
            {sidebarTab === 'groups' && isAdmin && <div className="team-chat-channel-heading"><span>GRUPOS</span><button type="button" title="Criar grupo" aria-label="Criar grupo" onClick={() => { setGroupDialogError(''); setGroupDialogMode('create'); }}><Plus aria-hidden="true" /></button></div>}
            {sidebarTab === 'groups' && visibleGroups.map((group) => {
              const groupIds = groupMembers.filter((member) => member.group_id === group.id).map((member) => member.user_id);
              const count = groupIds.length;
              return <div className="team-chat-channel-row" key={group.id}>
                <button type="button" className={`team-chat-channel${activeGroupId === group.id ? ' is-active' : ''}`} onClick={() => { setActiveDirectId(null); setActiveGroupId(group.id); setShowMobileConversations(false); }}>
                  {groupAvatar(group, 'sm')}<span>{group.name}</span><small>{count}</small>
                </button>
                {groupIds.includes(userId) && <button className="team-chat-channel-visibility" type="button" title="Apagar conversa para todos" aria-label={`Apagar grupo ${group.name} para todos`} disabled={conversationDeletionBusy} onClick={() => confirmDeleteConversation('group', group.id, group.name)}><Trash2 aria-hidden="true" /></button>}
              </div>;
            })}
            {sidebarTab === 'groups' && visibleGroups.length === 0 && <p className="team-chat-no-groups">Nenhum grupo encontrado.</p>}
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
                const readers = (readByMessage[message.id] ?? []).filter((readerId) => readerId !== userId && memberById.has(readerId) && (!activeGroupId || activeGroupMemberIds.has(readerId)));
                const readCount = readers.length;
                const readerNames = readers.map((readerId) => memberNames.get(readerId) || 'Integrante');
                const previous = messages[index - 1]; const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return <div className="team-chat-message-row-wrap" key={message.id}>{showDay && <div className="team-chat-day-divider"><span>{dayLabel(message.created_at)}</span></div>}
                  <div className={`team-chat-message-row${message.sender_id === userId ? ' is-own' : ''}`}>{!activeDirectId && avatar(message.sender_id, senderName, 'md')}
                    <article id={`chat-message-${message.id}`} className={`team-chat-message${message.sender_id === userId ? ' is-own' : ''}${initialMessageId === message.id ? ' is-push-target' : ''}`}>
                      {!activeDirectId && <div className="team-chat-message-meta"><strong>{senderName}</strong></div>}
                      {message.body && message.body !== 'Mensagem de áudio' && !(message.drive_url && message.body === DRIVE_LINK_ONLY_BODY) && <p>{message.body}</p>}
                      {message.drive_url && message.drive_name && <a className="team-chat-drive-link" href={message.drive_url} target="_blank" rel="noopener noreferrer"><Link2 aria-hidden="true" /><span>{message.drive_name}</span><ExternalLink aria-hidden="true" /></a>}
                      {message.audio_path && (audioUrls[message.id]
                        ? <div className="team-chat-audio-row"><audio className="team-chat-audio-player" controls preload="none" src={audioUrls[message.id]} aria-label={`Mensagem de áudio de ${senderName}`} />{audioDownloadUrls[message.id] && <a className="team-chat-audio-download" href={audioDownloadUrls[message.id]} aria-label="Baixar áudio" title="Baixar áudio"><Download aria-hidden="true" /><span>Baixar</span></a>}</div>
                        : <span className="team-chat-audio-loading">Carregando áudio…</span>)}
                      {message.attachment_path && (attachmentDownloadUrls[message.id]
                        ? <div className="team-chat-attachment-message">{message.attachment_content_type?.startsWith('image/') && attachmentUrls[message.id] && <a href={attachmentUrls[message.id]} target="_blank" rel="noreferrer" aria-label={`Visualizar imagem ${message.attachment_name ?? ''}`}><img src={attachmentUrls[message.id]} alt={message.attachment_name ?? 'Imagem anexada'} loading="lazy" /></a>}<a className="team-chat-attachment-download" href={attachmentDownloadUrls[message.id]} aria-label={`Baixar ${message.attachment_name ?? 'arquivo'}`}><FileText aria-hidden="true" /><span>{message.attachment_name ?? 'Arquivo anexado'}</span><Download aria-hidden="true" /></a></div>
                        : <span className="team-chat-audio-loading">Carregando anexo…</span>)}
                      {message.body === 'Mensagem de áudio' && !message.audio_path && <p>Mensagem de áudio indisponível.</p>}
                      <div className="team-chat-message-time"><time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>{message.sender_id === userId && <span className={readCount ? 'is-read' : ''} aria-label={readCount ? (activeGroupId ? `Lida por ${readCount} integrante(s)` : 'Lida') : 'Enviada'} title={readCount ? (activeGroupId ? `Lida por ${readCount} integrante(s)` : 'Lida') : 'Enviada'}>{readCount ? '✓✓' : '✓'}{readCount > 0 && <small>{activeGroupId ? `Lida por ${readCount}` : 'Lida'}</small>}</span>}</div>
                      {message.sender_id === userId && <p className="team-chat-read-summary">{readCount ? `Visto por ${readerNames.length > 3 ? `${readerNames.slice(0, 3).join(', ')} e mais ${readerNames.length - 3}` : readerNames.join(', ')}` : 'Ainda não visualizada'}</p>}
                      {message.sender_id === userId && canDeleteCurrentConversation && (() => {
                        const recipientIds = (activeGroupId
                          ? groupMembers.filter((item) => item.group_id === activeGroupId).map((item) => item.user_id)
                          : activeDirectUserId ? [activeDirectUserId] : members.map((item) => item.user_id)).filter((id) => id !== message.sender_id && memberById.has(id));
                        const readIds = new Set(readByMessage[message.id] ?? []);
                        const readMembers = recipientIds.filter((id) => readIds.has(id));
                        const unreadMembers = recipientIds.filter((id) => !readIds.has(id));
                        const detailsId = `read-details-${message.id}`;
                        const expanded = readDetailsMessageId === message.id;
                        return <div className="team-chat-read-details-wrap">
                          <button className="team-chat-read-details-trigger" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setReadDetailsMessageId((current) => current === message.id ? null : message.id)}>
                            <span aria-hidden="true">✓✓</span> {readMembers.length} de {recipientIds.length} leram <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                          </button>
                          {expanded && <section className="team-chat-read-details" id={detailsId} aria-label={`Leitura da mensagem de ${senderName}`}>
                            <div><strong>Leram ({readMembers.length})</strong>{readMembers.length ? <ul>{readMembers.map((id) => <li key={id}>{memberNames.get(id) || 'Integrante'}</li>)}</ul> : <p>Ninguém leu ainda.</p>}</div>
                            <div><strong>Ainda não leram ({unreadMembers.length})</strong>{unreadMembers.length ? <ul>{unreadMembers.map((id) => <li key={id}>{memberNames.get(id) || 'Integrante'}</li>)}</ul> : <p>Todas as pessoas destinatárias já leram.</p>}</div>
                          </section>}
                        </div>;
                      })()}
                      {canDeleteCurrentConversation && <div className="team-chat-message-actions">{confirmRemoveId === message.id ? <><span>Apagar para todos?</span><button type="button" className="team-chat-confirm-remove" onClick={() => void removeMessage(message.id)} disabled={removingId === message.id}>{removingId === message.id ? 'Apagando…' : 'Apagar para todos'}</button><button type="button" className="team-chat-cancel-remove" onClick={() => setConfirmRemoveId(null)} disabled={removingId === message.id}>Cancelar</button></> : <button type="button" className="team-chat-remove" onClick={() => setConfirmRemoveId(message.id)} aria-label={`Apagar mensagem de ${senderName} para todos`}><Trash2 aria-hidden="true" /> Apagar</button>}</div>}
                    </article></div></div>;
              })}
              <div ref={bottomRef} />
            </div>
            <form className="team-chat-composer" onSubmit={(event) => void sendMessage(event)}>
              <input ref={attachmentInputRef} className="team-chat-hidden-input" type="file" accept={CHAT_FILE_ACCEPT} onChange={(event) => { handleAttachmentSelection(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
              {pendingAttachment && <div className="team-chat-attachment-pending" role="status">{attachmentMime(pendingAttachment)?.startsWith('image/') ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />}<span>{pendingAttachment.name}<small>{(pendingAttachment.size / (1024 * 1024)).toFixed(1)} MB</small></span><button type="button" onClick={() => setPendingAttachment(null)} aria-label="Remover arquivo selecionado"><X aria-hidden="true" /></button></div>}
              {driveFormOpen && <div className="team-chat-drive-fields" id="team-chat-drive-fields"><label><span>Nome do arquivo no Drive</span><input type="text" value={driveName} onChange={(event) => setDriveName(event.target.value)} maxLength={CHAT_DRIVE_NAME_LIMIT} placeholder="Ex.: Planejamento da equipe" disabled={sending || !canWrite} /></label><label><span>Link HTTPS do Drive ou Google Docs</span><input type="url" value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} maxLength={CHAT_DRIVE_URL_LIMIT} placeholder="https://drive.google.com/..." disabled={sending || !canWrite} /></label><div><small>Use links de drive.google.com ou docs.google.com. O acesso ao arquivo continua sujeito às permissões definidas no Google.</small><button type="button" onClick={() => { setDriveName(''); setDriveUrl(''); }} disabled={sending || (!driveName && !driveUrl)}>Limpar link</button></div></div>}
              <textarea aria-label="Sua mensagem" id="team-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canWrite ? 'Escreva uma mensagem…' : 'Você não participa deste grupo.'} rows={1} maxLength={MESSAGE_LIMIT} disabled={sending || !canWrite} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              {recording && <div className="team-chat-audio-state is-recording"><span className="team-chat-record-dot" aria-hidden="true" />Gravando áudio · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}<button type="button" onClick={stopAudioRecording} aria-label="Parar gravação"><Square aria-hidden="true" /> Parar</button></div>}
              {recordedAudio && !recording && <div className="team-chat-audio-state"><span>Áudio gravado · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span><button type="button" onClick={discardRecordedAudio} aria-label="Descartar áudio gravado"><X aria-hidden="true" /> Descartar</button></div>}
              <div className="team-chat-compose-footer"><span>{Array.from(draft).length}/{MESSAGE_LIMIT} · {activeDirectId ? 'Conversa privada' : activeGroupId ? 'Somente participantes do grupo' : 'Visível para os integrantes ativos'}</span><div className="team-chat-compose-actions"><button className="team-chat-attach-button" type="button" onClick={() => attachmentInputRef.current?.click()} aria-label="Anexar imagem, documento ou áudio" title="Anexar imagem, documento ou áudio" disabled={sending || !canWrite}><Paperclip aria-hidden="true" /></button><button className="team-chat-drive-button" type="button" onClick={() => setDriveFormOpen((open) => !open)} aria-label="Adicionar link do Google Drive" aria-expanded={driveFormOpen} aria-controls="team-chat-drive-fields" title="Adicionar link do Google Drive" disabled={sending || !canWrite}><Link2 aria-hidden="true" /></button><button className="team-chat-camera-button" type="button" onClick={() => void openCamera()} aria-label="Abrir câmera e tirar foto" title="Abrir câmera e tirar foto" disabled={sending || !canWrite}><Camera aria-hidden="true" /></button><button className="team-chat-record-button" type="button" onClick={() => void startAudioRecording()} aria-label="Gravar áudio" title="Gravar áudio" disabled={sending || recording || !canWrite}><Mic aria-hidden="true" /></button><button type="submit" aria-label={sending ? 'Enviando mensagem' : recordedAudio || (pendingAttachment && attachmentMime(pendingAttachment)?.startsWith('audio/')) ? 'Enviar áudio' : 'Enviar mensagem'} title={sending ? 'Enviando…' : 'Enviar'} disabled={sending || (!draft.trim() && !recordedAudio && !pendingAttachment && !driveUrl.trim() && !driveName.trim()) || !canWrite}><ArrowUp aria-hidden="true" /></button></div></div>
            </form>
          </div>
          {cameraOpen && <div className="team-chat-camera-backdrop" role="presentation"><section className="team-chat-camera-dialog" role="dialog" aria-modal="true" aria-labelledby="team-chat-camera-title"><header><div><p className="workspace-kicker">CÂMERA DO COMPUTADOR</p><h3 id="team-chat-camera-title">Tirar foto</h3></div><button type="button" onClick={closeCamera} aria-label="Fechar câmera"><X aria-hidden="true" /></button></header><video ref={cameraVideoRef} autoPlay muted playsInline aria-label="Pré-visualização da câmera" />{cameraError && <p className="team-chat-camera-error" role="alert">{cameraError}</p>}<footer><button type="button" className="team-chat-camera-cancel" onClick={closeCamera}>Cancelar</button><button type="button" className="team-chat-camera-capture" onClick={captureCameraPhoto} disabled={Boolean(cameraError)}><Camera aria-hidden="true" /> Capturar foto</button></footer></section></div>}
          <p className="team-chat-retention-note">Qualquer participante ativo pode apagar uma mensagem ou conversa para todos; a exclusão de mensagens e conversas privadas é permanente. Conversas privadas só são visíveis aos dois participantes. Mensagens do Chat não enviam e-mail.</p>
        </div>
      </div>
      {inviteOpen && <div className="chat-group-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inviteBusy) setInviteOpen(false); }}>
        <form className="chat-group-dialog team-chat-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="team-chat-invite-title" onSubmit={(event) => void submitInvite(event)}>
          <header className="chat-group-dialog-heading"><div><span className="chat-group-dialog-icon"><MailPlus aria-hidden="true" /></span><h2 id="team-chat-invite-title">Convidar mais membros</h2></div><button type="button" className="chat-group-dialog-close" onClick={() => setInviteOpen(false)} disabled={inviteBusy} aria-label="Fechar"><X aria-hidden="true" /></button></header>
          <label className="chat-group-dialog-name"><span>Nome completo</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} required maxLength={120} /></label>
          <label className="chat-group-dialog-name"><span>E-mail</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required /></label>
          {inviteError && <p className="chat-group-dialog-error" role="alert">{inviteError}</p>}
          <footer className="chat-group-dialog-actions"><button type="button" className="chat-group-dialog-cancel" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>Cancelar</button><button type="submit" className="chat-group-dialog-submit" disabled={inviteBusy}>{inviteBusy ? 'Enviando…' : 'Enviar convite'}</button></footer>
        </form>
      </div>}
      {groupDialogMode && <ChatGroupDialog mode={groupDialogMode} members={dialogMembers} busy={groupActionBusy} error={groupDialogError} onCancel={() => { if (!groupActionBusy) setGroupDialogMode(null); }} onSubmit={(value) => void handleGroupDialogSubmit(value)} />}
    </section>
  );
}
